import type { BrainMessage } from "./index";
import type { ChatMessage, ConversationMemory } from "../types";

// Rolling conversation memory.
//
// Naive chat apps resend the whole transcript on every call, so the token
// bill grows with the square of the conversation length. Instead we keep:
//   - a `summary` of everything older (one compact block, refreshed rarely)
//   - the last few messages VERBATIM (so nuance and phrasing survive)
// Older messages are "folded" into the summary once the verbatim window
// overflows — roughly one extra cheap call per FOLD_EVERY messages, not per turn.

/** Fold once the un-summarised tail grows past this many messages */
const WINDOW_MAX = 14;
/** ...and keep this many verbatim afterwards */
const WINDOW_KEEP = 8;
/** Messages folded per summariser call (WINDOW_MAX - WINDOW_KEEP) */
export const FOLD_EVERY = WINDOW_MAX - WINDOW_KEEP;
/** Per-message cap inside the verbatim window */
const MSG_CHARS = 1200;
/** Hard cap on the stored summary */
export const SUMMARY_MAX = 2000;

export const GLOBAL_THREAD = "global";

export function threadIdOf(projectId?: string): string {
  return projectId ?? GLOBAL_THREAD;
}

export function memoryOf(
  memories: ConversationMemory[],
  threadId: string
): ConversationMemory | null {
  return memories.find((m) => m.threadId === threadId) ?? null;
}

/**
 * Messages belonging to a thread, cleaned for the brain:
 *  - agent progress lines are UI chrome, not conversation → dropped
 *  - spec/package documents are thousands of tokens → replaced by a marker,
 *    the model still knows they exist and can refer to them
 */
function threadMessages(messages: ChatMessage[], projectId?: string): ChatMessage[] {
  return messages
    .filter((m) => (projectId ? m.projectId === projectId : true))
    .filter((m) => m.role !== "agent")
    .map((m) => {
      if (m.kind === "spec") return { ...m, text: "[מסמך אפיון נוצר והוצג למשתמש]" };
      if (m.kind === "package") return { ...m, text: "[חבילת מסלול ב נוצרה והוצגה למשתמש]" };
      if (m.kind === "link") return { ...m, text: `[האתר עלה לאוויר: ${m.text.split("\n")[0]}]` };
      return m;
    })
    .filter((m) => m.text.trim().length > 0);
}

export interface ContextPlan {
  /** Summary of everything before the verbatim window ("" when none yet) */
  summary: string;
  /** Recent messages to send verbatim */
  verbatim: ChatMessage[];
  /** Messages that should now be folded into the summary ([] when not due) */
  toFold: ChatMessage[];
  /** ts of the newest message in `toFold` — the new coveredUpToTs */
  foldUpToTs: number;
  foldedCount: number;
}

export function planContext(
  messages: ChatMessage[],
  memory: ConversationMemory | null,
  projectId?: string
): ContextPlan {
  const all = threadMessages(messages, projectId);
  const covered = memory?.coveredUpToTs ?? 0;
  const tail = all.filter((m) => m.ts > covered);

  if (tail.length <= WINDOW_MAX) {
    return {
      summary: memory?.summary ?? "",
      verbatim: tail,
      toFold: [],
      foldUpToTs: covered,
      foldedCount: memory?.foldedCount ?? 0
    };
  }

  const toFold = tail.slice(0, tail.length - WINDOW_KEEP);
  return {
    summary: memory?.summary ?? "",
    verbatim: tail.slice(tail.length - WINDOW_KEEP),
    toFold,
    foldUpToTs: toFold[toFold.length - 1].ts,
    foldedCount: (memory?.foldedCount ?? 0) + toFold.length
  };
}

export function toBrainMessages(msgs: ChatMessage[]): BrainMessage[] {
  return msgs.map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    content: m.text.length > MSG_CHARS ? `${m.text.slice(0, MSG_CHARS)}…` : m.text
  }));
}

/** The summary block appended to CORE's system prompt */
export function summaryBlock(summary: string): string {
  if (!summary.trim()) return "";
  return (
    `\n\n===== זיכרון השיחה עד כה =====\n` +
    `זהו סיכום מתגלגל של החלקים המוקדמים של השיחה איתך והמשתמש. ` +
    `התייחס אליו כאל דברים שאתה זוכר מהשיחה עצמה — לא כאל מידע חיצוני. ` +
    `ההודעות האחרונות מגיעות אחריו במלואן.\n${summary.trim()}\n===== סוף הזיכרון =====`
  );
}

/** Plain-text rendering of the messages being folded, for the summariser */
export function foldTranscript(msgs: ChatMessage[]): string {
  return msgs
    .map((m) => `${m.role === "user" ? "משתמש" : "יאירוס"}: ${m.text.slice(0, MSG_CHARS)}`)
    .join("\n");
}
