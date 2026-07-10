import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { askBrain, askBrainJson, BrainError, type BrainMessage } from "../brain";
import {
  architectPrompt,
  coderPrompt,
  connectorPrompt,
  corePrompt,
  deployerPromptPrompt,
  designerPrompt,
  filesToPromptBlock,
  interrogatorPrompt,
  qaPrompt,
  updateCoderPrompt
} from "../agents/prompts";
import { useData, type DataApi } from "../data/store";
import { useI18n } from "../i18n";
import { speak } from "../voice/tts";
import { getSettings } from "../data/localSettings";
import {
  createRepoAndDeploy,
  getRepoTextFiles,
  parseRepoUrl,
  updateRepoFiles
} from "../deploy/github";
import { ensureNotifyPermission, notifyDone, notifyStage } from "../notify/notifications";
import { startBuildWakeLock, stopBuildWakeLock } from "../notify/wakeLock";
import type { AgentId, AgentRun, ChatMessage, Lang, Project, SiteFile } from "../types";

interface OrchestratorApi {
  busy: boolean;
  activeAgent: AgentId | null;
  /** Project currently waiting for user input (question flow / track choice) */
  activeProject: Project | null;
  ask(text: string, opts?: { projectId?: string }): Promise<void>;
  chooseTrack(mode: "auto" | "manual"): Promise<void>;
}

const Ctx = createContext<OrchestratorApi>(null!);
export function useOrchestrator() {
  return useContext(Ctx);
}

const CANCEL_WORDS = ["בטל", "ביטול", "עצור", "cancel", "stop", "abort"];

function detectTrack(text: string): "auto" | "manual" | null {
  const s = text.trim().toLowerCase();
  if (/מסלול\s*א|track\s*a|אוטומט|תפרוס|תבנה\s*לבד|deploy/.test(s)) return "auto";
  if (/מסלול\s*ב|track\s*b|פרומפט|prompt|אפיון\s*ו/.test(s)) return "manual";
  if (s === "א" || s === "a" || s === "1") return "auto";
  if (s === "ב" || s === "b" || s === "2") return "manual";
  return null;
}

export function OrchestratorProvider({ children }: { children: ReactNode }) {
  const data = useData();
  const { lang, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentId | null>(null);

  // Async pipeline steps always read the freshest data through refs
  const dataRef = useRef<DataApi>(data);
  dataRef.current = data;
  const langRef = useRef<Lang>(lang);
  langRef.current = lang;
  const tRef = useRef(t);
  tRef.current = t;

  const activeProject = useMemo(
    () =>
      [...data.projects]
        .filter((p) => p.status === "interrogating" || p.status === "awaiting_choice")
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
    [data.projects]
  );
  const activeProjectRef = useRef<Project | null>(activeProject);
  activeProjectRef.current = activeProject;

  const say = useCallback(
    async (
      text: string,
      opts?: { projectId?: string; kind?: ChatMessage["kind"]; silent?: boolean }
    ) => {
      await dataRef.current.addMessage({
        role: "yairos",
        text,
        lang: langRef.current,
        projectId: opts?.projectId,
        kind: opts?.kind ?? "text"
      });
      if (!opts?.silent && (opts?.kind ?? "text") === "text") speak(text, langRef.current);
    },
    []
  );

  const agentNote = useCallback(async (agentId: AgentId, text: string, projectId?: string) => {
    await dataRef.current.addMessage({
      role: "agent",
      agentId,
      text,
      lang: langRef.current,
      projectId
    });
    // Mirror the stage to the lock-screen / shade notification (no-op without permission)
    notifyStage(tRef.current("notify.working"), text);
  }, []);

  /** Run one department: records the agentRun (lights the star) and returns the result */
  const runStep = useCallback(
    async <T,>(
      projectId: string,
      agent: AgentRun["agent"],
      input: string,
      fn: () => Promise<T>,
      describeOutput: (r: T) => string
    ): Promise<T> => {
      setActiveAgent(agent);
      const runId = await dataRef.current.addAgentRun(projectId, agent, input);
      try {
        const result = await fn();
        await dataRef.current.finishAgentRun(runId, describeOutput(result), "done");
        return result;
      } catch (e) {
        await dataRef.current.finishAgentRun(
          runId,
          e instanceof Error ? e.message : String(e),
          "error"
        );
        throw e;
      }
    },
    []
  );

  const reportError = useCallback(
    async (e: unknown, projectId?: string) => {
      const msg =
        e instanceof BrainError
          ? tRef.current("err.brainFailed", { provider: e.provider, error: e.message })
          : e instanceof Error
            ? e.message
            : String(e);
      notifyDone(tRef.current("notify.error"), msg);
      await say(msg, { projectId, kind: "error" });
    },
    [say]
  );

  const askQuestion = useCallback(
    async (project: Project, questions: string[], index: number) => {
      const q = questions[index];
      await say(tRef.current("run.question", { n: String(index + 1), q }), {
        projectId: project.id,
        silent: true
      });
      speak(q, langRef.current);
    },
    [say]
  );

  const runInterrogator = useCallback(
    async (projectId: string, request: string, name: string) => {
      await agentNote("interrogator", tRef.current("run.interrogator"), projectId);
      const { questions } = await runStep(
        projectId,
        "interrogator",
        request,
        () =>
          askBrainJson<{ questions: string[] }>([
            { role: "system", content: interrogatorPrompt(langRef.current) },
            { role: "user", content: `Project "${name}". The idea: ${request}` }
          ]),
        (r) => r.questions.join("\n")
      );
      const five = questions.slice(0, 5);
      await dataRef.current.updateProject(projectId, { questions: five });
      setActiveAgent(null);
      const proj = { ...(dataRef.current.projects.find((p) => p.id === projectId)!) };
      await askQuestion({ ...proj, questions: five }, five, 0);
    },
    [agentNote, runStep, askQuestion]
  );

  const runSpecPhase = useCallback(
    async (project: Project, answers: string[]) => {
      const qa = project.questions
        .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] ?? ""}`)
        .join("\n");
      const baseInput = `The idea: ${project.request}\n\nInterrogation:\n${qa}`;

      await agentNote("architect", tRef.current("run.architect"), project.id);
      const spec = await runStep(
        project.id,
        "architect",
        baseInput,
        () =>
          askBrain([
            { role: "system", content: architectPrompt(langRef.current) },
            { role: "user", content: baseInput }
          ]),
        (r) => r
      );

      await agentNote("designer", tRef.current("run.designer"), project.id);
      const design = await runStep(
        project.id,
        "designer",
        spec,
        () =>
          askBrain([
            { role: "system", content: designerPrompt(langRef.current) },
            { role: "user", content: spec }
          ]),
        (r) => r
      );

      const fullSpec = `${spec}\n\n${design}`;
      await dataRef.current.updateProject(project.id, {
        spec: fullSpec,
        status: "awaiting_choice"
      });
      setActiveAgent(null);
      await dataRef.current.addMessage({
        role: "yairos",
        text: fullSpec,
        lang: langRef.current,
        projectId: project.id,
        kind: "spec"
      });
      await say(tRef.current("run.specReady"), { projectId: project.id });
    },
    [agentNote, runStep, say]
  );

  const handleAnswer = useCallback(
    async (project: Project, text: string) => {
      const answers = [...project.answers, text];
      await dataRef.current.updateProject(project.id, { answers });
      if (answers.length < project.questions.length) {
        await askQuestion(project, project.questions, answers.length);
        return;
      }
      void ensureNotifyPermission();
      startBuildWakeLock();
      setBusy(true);
      try {
        await dataRef.current.updateProject(project.id, { status: "spec" });
        await runSpecPhase(project, answers);
        notifyDone(tRef.current("notify.done"), tRef.current("run.specReady"));
      } catch (e) {
        await dataRef.current.updateProject(project.id, { status: "interrogating" });
        await reportError(e, project.id);
      } finally {
        stopBuildWakeLock();
        setActiveAgent(null);
        setBusy(false);
      }
    },
    [askQuestion, runSpecPhase, reportError]
  );

  const generateSite = useCallback(
    async (project: Project): Promise<SiteFile[]> => {
      // CONNECTOR — find real, free, CORS-open APIs that can power the site
      let apiPlan = "";
      await agentNote("connector", tRef.current("run.connector"), project.id);
      try {
        const plan = await runStep(
          project.id,
          "connector",
          project.spec.slice(0, 3000),
          () =>
            askBrain([
              { role: "system", content: connectorPrompt() },
              {
                role: "user",
                content: `Project name: ${project.name}\nOriginal request: ${project.request}\n\nSpecification:\n${project.spec}`
              }
            ]),
          (r) => r
        );
        if (!plan.trim().startsWith("NO_INTEGRATIONS")) apiPlan = plan;
      } catch {
        // Connector failed — build without live integrations rather than blocking
      }

      await agentNote("coder", tRef.current("run.coder"), project.id);
      const coded = await runStep(
        project.id,
        "coder",
        project.spec,
        () =>
          askBrainJson<{ files: SiteFile[] }>([
            { role: "system", content: coderPrompt() },
            {
              role: "user",
              content:
                `Project name: ${project.name}\nOriginal request: ${project.request}\n\nSpecification:\n${project.spec}` +
                (apiPlan
                  ? `\n\nREAL API INTEGRATIONS — the CONNECTOR department verified these real data sources. Implement them exactly as instructed (fetch from the browser, handle loading/empty/error states). Never present fabricated data as real:\n${apiPlan}`
                  : "")
            }
          ]),
        (r) => r.files.map((f) => f.path).join(", ")
      );
      let files = (coded.files ?? []).filter((f) => f.path && typeof f.content === "string");
      if (!files.length || !files.some((f) => f.path === "index.html")) {
        throw new Error("Coder did not produce an index.html");
      }

      await dataRef.current.updateProject(project.id, { status: "qa" });
      await agentNote("qa", tRef.current("run.qa"), project.id);
      try {
        const checked = await runStep(
          project.id,
          "qa",
          files.map((f) => f.path).join(", "),
          () =>
            askBrainJson<{ files: SiteFile[] }>([
              { role: "system", content: qaPrompt() },
              { role: "user", content: filesToPromptBlock(files) }
            ]),
          (r) => r.files.map((f) => f.path).join(", ")
        );
        const fixed = (checked.files ?? []).filter(
          (f) => f.path && typeof f.content === "string"
        );
        if (fixed.length && fixed.some((f) => f.path === "index.html")) {
          files = fixed;
        }
      } catch {
        // QA failed — ship the coder's files rather than blocking the pipeline
      }
      return files;
    },
    [agentNote, runStep]
  );

  const chooseTrack = useCallback(
    async (mode: "auto" | "manual") => {
      const project = activeProjectRef.current;
      if (!project || project.status !== "awaiting_choice" || busy) return;

      if (mode === "auto" && !getSettings().githubToken.trim()) {
        await say(tRef.current("err.noGithubToken"), {
          projectId: project.id,
          kind: "error"
        });
        return;
      }

      // Ask while we're still inside the user's click/message gesture,
      // so the build keeps reporting to the lock screen when he leaves
      void ensureNotifyPermission();
      startBuildWakeLock();
      setBusy(true);
      try {
        await dataRef.current.updateProject(project.id, {
          deployMode: mode,
          status: "building"
        });

        if (mode === "manual") {
          await agentNote("deployer", tRef.current("run.packaging"), project.id);
          const prompt = await runStep(
            project.id,
            "deployer",
            project.spec,
            () =>
              askBrain([
                { role: "system", content: deployerPromptPrompt(langRef.current) },
                { role: "user", content: project.spec }
              ]),
            (r) => r
          );
          const packageText = `# ${project.name}\n\n${project.spec}\n\n---\n\n# BUILD PROMPT\n\n${prompt}`;
          await dataRef.current.updateProject(project.id, {
            packageText,
            status: "delivered"
          });
          await dataRef.current.addMessage({
            role: "yairos",
            text: packageText,
            lang: langRef.current,
            projectId: project.id,
            kind: "package"
          });
          notifyDone(tRef.current("notify.done"), tRef.current("run.packageReady"));
          await say(tRef.current("run.packageReady"), { projectId: project.id });
          return;
        }

        // Track A — build, QA, deploy
        const files = await generateSite(project);

        await dataRef.current.updateProject(project.id, { status: "deploying" });
        await agentNote("deployer", tRef.current("run.deploying"), project.id);
        const s = getSettings();
        const result = await runStep(
          project.id,
          "deployer",
          files.map((f) => f.path).join(", "),
          () =>
            createRepoAndDeploy(
              s.githubToken.trim(),
              s.githubOwner.trim() || "yairosbrain",
              project.name,
              project.request,
              files,
              () => {}
            ),
          (r) => r.liveUrl
        );

        await dataRef.current.updateProject(project.id, {
          status: "live",
          repoUrl: result.repoUrl,
          liveUrl: result.liveUrl
        });
        await dataRef.current.addMessage({
          role: "yairos",
          text: `${result.liveUrl}\n${result.repoUrl}`,
          lang: langRef.current,
          projectId: project.id,
          kind: "link"
        });
        notifyDone(tRef.current("notify.done"), tRef.current("run.live"), result.liveUrl);
        await say(tRef.current("run.live"), { projectId: project.id });
      } catch (e) {
        await dataRef.current.updateProject(project.id, { status: "awaiting_choice" });
        await reportError(e, project.id);
      } finally {
        stopBuildWakeLock();
        setActiveAgent(null);
        setBusy(false);
      }
    },
    [busy, say, agentNote, runStep, generateSite, reportError]
  );

  const runUpdate = useCallback(
    async (project: Project, changeRequest: string) => {
      const s = getSettings();
      if (!s.githubToken.trim()) {
        await say(tRef.current("err.noGithubToken"), { kind: "error" });
        return;
      }
      const repo = project.repoUrl ? parseRepoUrl(project.repoUrl) : null;
      if (!repo) {
        await say(tRef.current("run.whichProject"));
        return;
      }
      void ensureNotifyPermission();
      startBuildWakeLock();
      setBusy(true);
      try {
        await say(tRef.current("run.updating", { name: project.name }), {
          projectId: project.id,
          silent: true
        });
        await dataRef.current.updateProject(project.id, { status: "building" });

        const current = await getRepoTextFiles(s.githubToken.trim(), repo.owner, repo.repo);
        await agentNote("coder", tRef.current("run.coder"), project.id);
        const updated = await runStep(
          project.id,
          "coder",
          changeRequest,
          () =>
            askBrainJson<{ files: SiteFile[] }>([
              { role: "system", content: updateCoderPrompt() },
              {
                role: "user",
                content: `Change request: ${changeRequest}\n\nCurrent files:\n${filesToPromptBlock(current)}`
              }
            ]),
          (r) => r.files.map((f) => f.path).join(", ")
        );
        const files = (updated.files ?? []).filter(
          (f) => f.path && typeof f.content === "string"
        );
        if (!files.length) throw new Error("Coder returned no files");

        await dataRef.current.updateProject(project.id, { status: "deploying" });
        await agentNote("deployer", tRef.current("run.deploying"), project.id);
        await runStep(
          project.id,
          "deployer",
          files.map((f) => f.path).join(", "),
          () => updateRepoFiles(s.githubToken.trim(), repo.owner, repo.repo, files),
          () => "updated"
        );
        await dataRef.current.updateProject(project.id, { status: "live" });
        notifyDone(tRef.current("notify.done"), tRef.current("run.updated"), project.liveUrl);
        await say(tRef.current("run.updated"), { projectId: project.id });
      } catch (e) {
        await dataRef.current.updateProject(project.id, { status: "live" });
        await reportError(e, project.id);
      } finally {
        stopBuildWakeLock();
        setActiveAgent(null);
        setBusy(false);
      }
    },
    [say, agentNote, runStep, reportError]
  );

  const classify = useCallback(
    async (text: string, scoped?: Project) => {
      setBusy(true);
      setActiveAgent("core");
      try {
        const recent: BrainMessage[] = dataRef.current.messages
          .filter((m) => (scoped ? m.projectId === scoped.id : true))
          .slice(-8)
          .map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            content: m.text.slice(0, 600)
          }));

        // CORE's long-term memory: every project Yairos has built for the user
        const projectsList = [...dataRef.current.projects]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 25)
          .map(
            (p) =>
              `- "${p.name}" [${p.status}]${p.liveUrl ? ` live: ${p.liveUrl}` : ""}${p.repoUrl ? ` repo: ${p.repoUrl}` : ""}`
          )
          .join("\n");
        let system = corePrompt(langRef.current);
        if (projectsList) {
          system += `\n\nYour shared memory — projects you already built for the user (you may reference them, their status and their live URLs when answering):\n${projectsList}`;
        }
        if (scoped) {
          system +=
            `\n\nThis conversation happens INSIDE the dedicated chat of project "${scoped.name}".` +
            `\nOriginal request: ${scoped.request}` +
            (scoped.liveUrl ? `\nLive site: ${scoped.liveUrl}` : "") +
            (scoped.spec ? `\nSpec excerpt:\n${scoped.spec.slice(0, 1200)}` : "") +
            `\nWhen the user asks to change/fix/add something, the intent is "update_site" for THIS project (projectName: "${scoped.name}"), unless they clearly ask for a brand-new separate site.`;
        }

        const decision = await askBrainJson<{
          intent: "new_project" | "update_site" | "chat";
          projectName: string;
          reply: string;
        }>([
          { role: "system", content: system },
          ...recent,
          { role: "user", content: text }
        ]);

        if (decision.intent === "new_project") {
          const name = decision.projectName?.trim() || text.slice(0, 40);
          const projectId = await dataRef.current.createProject(name, text);
          if (decision.reply) await say(decision.reply, { projectId });
          await runInterrogator(projectId, text, name);
          return;
        }

        if (decision.intent === "update_site") {
          const wanted = (decision.projectName ?? "").toLowerCase();
          const liveProjects = dataRef.current.projects.filter(
            (p) => p.status === "live" && p.repoUrl
          );
          const target =
            (scoped?.status === "live" && scoped.repoUrl ? scoped : null) ??
            liveProjects.find(
              (p) =>
                wanted &&
                (p.name.toLowerCase().includes(wanted) ||
                  wanted.includes(p.name.toLowerCase()))
            ) ??
            (liveProjects.length === 1 ? liveProjects[0] : null);
          if (!target) {
            await say(tRef.current("run.whichProject"), {
              projectId: scoped?.id
            });
            return;
          }
          if (decision.reply) await say(decision.reply, { projectId: target.id });
          setBusy(false);
          await runUpdate(target, text);
          return;
        }

        await say(decision.reply || "…", scoped ? { projectId: scoped.id } : undefined);
      } catch (e) {
        await reportError(e, scoped?.id);
      } finally {
        setActiveAgent(null);
        setBusy(false);
      }
    },
    [say, runInterrogator, runUpdate, reportError]
  );

  const ask = useCallback(
    async (text: string, opts?: { projectId?: string }) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const active = activeProjectRef.current;
      // A project-chat message is scoped to that project's own thread
      const scoped = opts?.projectId
        ? (dataRef.current.projects.find((p) => p.id === opts.projectId) ?? null)
        : null;
      const thread = scoped ?? active;

      await dataRef.current.addMessage({
        role: "user",
        text: trimmed,
        lang: langRef.current,
        projectId: thread?.id
      });

      // The interrogation / track-choice flow only applies when we're talking
      // to the active project (globally, or inside its own chat)
      const flowProject = active && (!scoped || scoped.id === active.id) ? active : null;

      if (flowProject && CANCEL_WORDS.includes(trimmed.toLowerCase())) {
        await dataRef.current.updateProject(flowProject.id, { status: "error" });
        await say(tRef.current("run.canceled"), { projectId: flowProject.id });
        return;
      }

      if (flowProject?.status === "interrogating" && flowProject.questions.length) {
        await handleAnswer(flowProject, trimmed);
        return;
      }

      if (flowProject?.status === "awaiting_choice") {
        const track = detectTrack(trimmed);
        if (track) {
          await chooseTrack(track);
        } else {
          await say(tRef.current("run.specReady"), { projectId: flowProject.id });
        }
        return;
      }

      await classify(trimmed, scoped ?? undefined);
    },
    [busy, say, handleAnswer, chooseTrack, classify]
  );

  const value = useMemo<OrchestratorApi>(
    () => ({ busy, activeAgent, activeProject, ask, chooseTrack }),
    [busy, activeAgent, activeProject, ask, chooseTrack]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
