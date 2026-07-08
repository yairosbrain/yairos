import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  useQuery
} from "convex/react";
import { anyApi } from "convex/server";
import type { AgentRun, ChatMessage, Project } from "../types";

// Shared memory. Two modes with the same interface:
//  - "convex": real-time sync across all devices (when VITE_CONVEX_URL is set)
//  - "local":  localStorage on this device (works out of the box, no account)

export interface DataApi {
  mode: "convex" | "local";
  projects: Project[];
  messages: ChatMessage[];
  agentRuns: AgentRun[];
  createProject(name: string, request: string): Promise<string>;
  updateProject(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): Promise<void>;
  addMessage(msg: Omit<ChatMessage, "id" | "ts">): Promise<void>;
  addAgentRun(projectId: string, agent: AgentRun["agent"], input: string): Promise<string>;
  finishAgentRun(id: string, output: string, status: "done" | "error"): Promise<void>;
}

const Ctx = createContext<DataApi>(null!);
export function useData() {
  return useContext(Ctx);
}

const convexUrl: string | undefined = import.meta.env.VITE_CONVEX_URL as
  | string
  | undefined;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function DataProvider({ children }: { children: ReactNode }) {
  if (convexClient) {
    return (
      <ConvexProvider client={convexClient}>
        <ConvexData>{children}</ConvexData>
      </ConvexProvider>
    );
  }
  return <LocalData>{children}</LocalData>;
}

/* ---------------- Convex mode ---------------- */

interface ConvexDoc {
  _id: string;
  [k: string]: unknown;
}

function ConvexData({ children }: { children: ReactNode }) {
  const projectsRaw = useQuery(anyApi.projects.list) as ConvexDoc[] | undefined;
  const messagesRaw = useQuery(anyApi.messages.list) as ConvexDoc[] | undefined;
  const runsRaw = useQuery(anyApi.agentRuns.list) as ConvexDoc[] | undefined;

  const createProjectMut = useMutation(anyApi.projects.create);
  const updateProjectMut = useMutation(anyApi.projects.update);
  const addMessageMut = useMutation(anyApi.messages.add);
  const addRunMut = useMutation(anyApi.agentRuns.add);
  const updateRunMut = useMutation(anyApi.agentRuns.update);

  const projects = useMemo(
    () =>
      (projectsRaw ?? []).map(
        (d) => ({ ...(d as unknown as Project), id: d._id }) as Project
      ),
    [projectsRaw]
  );
  const messages = useMemo(
    () =>
      (messagesRaw ?? []).map(
        (d) => ({ ...(d as unknown as ChatMessage), id: d._id }) as ChatMessage
      ),
    [messagesRaw]
  );
  const agentRuns = useMemo(
    () =>
      (runsRaw ?? []).map(
        (d) => ({ ...(d as unknown as AgentRun), id: d._id }) as AgentRun
      ),
    [runsRaw]
  );

  const createProject = useCallback(
    async (name: string, request: string) =>
      (await createProjectMut({ name, request })) as string,
    [createProjectMut]
  );
  const updateProject = useCallback(
    async (id: string, patch: Partial<Omit<Project, "id" | "createdAt">>) => {
      await updateProjectMut({ id, patch });
    },
    [updateProjectMut]
  );
  const addMessage = useCallback(
    async (msg: Omit<ChatMessage, "id" | "ts">) => {
      await addMessageMut({ ...msg, ts: Date.now() });
    },
    [addMessageMut]
  );
  const addAgentRun = useCallback(
    async (projectId: string, agent: AgentRun["agent"], input: string) =>
      (await addRunMut({
        projectId,
        agent,
        input: input.slice(0, 4000),
        status: "running",
        ts: Date.now()
      })) as string,
    [addRunMut]
  );
  const finishAgentRun = useCallback(
    async (id: string, output: string, status: "done" | "error") => {
      await updateRunMut({ id, output: output.slice(0, 20000), status });
    },
    [updateRunMut]
  );

  const value = useMemo<DataApi>(
    () => ({
      mode: "convex",
      projects,
      messages,
      agentRuns,
      createProject,
      updateProject,
      addMessage,
      addAgentRun,
      finishAgentRun
    }),
    [
      projects,
      messages,
      agentRuns,
      createProject,
      updateProject,
      addMessage,
      addAgentRun,
      finishAgentRun
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ---------------- Local mode ---------------- */

function load<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}
function save<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* storage full — keep in memory */
  }
}
const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)) as string;

function LocalData({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() =>
    load<Project>("yairos.projects")
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    load<ChatMessage>("yairos.messages")
  );
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>(() =>
    load<AgentRun>("yairos.agentRuns")
  );

  const createProject = useCallback(async (name: string, request: string) => {
    const p: Project = {
      id: uid(),
      name,
      request,
      status: "interrogating",
      questions: [],
      answers: [],
      spec: "",
      deployMode: null,
      createdAt: Date.now()
    };
    setProjects((prev) => {
      const next = [p, ...prev];
      save("yairos.projects", next);
      return next;
    });
    return p.id;
  }, []);

  const updateProject = useCallback(
    async (id: string, patch: Partial<Omit<Project, "id" | "createdAt">>) => {
      setProjects((prev) => {
        const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
        save("yairos.projects", next);
        return next;
      });
    },
    []
  );

  const addMessage = useCallback(async (msg: Omit<ChatMessage, "id" | "ts">) => {
    const m: ChatMessage = { ...msg, id: uid(), ts: Date.now() };
    setMessages((prev) => {
      const next = [...prev.slice(-299), m];
      save("yairos.messages", next);
      return next;
    });
  }, []);

  const addAgentRun = useCallback(
    async (projectId: string, agent: AgentRun["agent"], input: string) => {
      const r: AgentRun = {
        id: uid(),
        projectId,
        agent,
        input: input.slice(0, 4000),
        output: "",
        status: "running",
        ts: Date.now()
      };
      setAgentRuns((prev) => {
        const next = [...prev.slice(-99), r];
        save("yairos.agentRuns", next);
        return next;
      });
      return r.id;
    },
    []
  );

  const finishAgentRun = useCallback(
    async (id: string, output: string, status: "done" | "error") => {
      setAgentRuns((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, output: output.slice(0, 20000), status } : r
        );
        save("yairos.agentRuns", next);
        return next;
      });
    },
    []
  );

  const value = useMemo<DataApi>(
    () => ({
      mode: "local",
      projects,
      messages,
      agentRuns,
      createProject,
      updateProject,
      addMessage,
      addAgentRun,
      finishAgentRun
    }),
    [
      projects,
      messages,
      agentRuns,
      createProject,
      updateProject,
      addMessage,
      addAgentRun,
      finishAgentRun
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
