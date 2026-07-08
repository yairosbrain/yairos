import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Global preferences (no keys here! keys live in each device's localStorage)
  settings: defineTable({
    language: v.union(v.literal("he"), v.literal("en")),
    brainProvider: v.union(
      v.literal("puter"),
      v.literal("gemini"),
      v.literal("claude")
    ),
    voiceOutput: v.boolean()
  }),

  // Every site/app Yairos builds
  projects: defineTable({
    name: v.string(),
    request: v.string(),
    status: v.string(),
    questions: v.array(v.string()),
    answers: v.array(v.string()),
    spec: v.string(),
    deployMode: v.union(v.literal("auto"), v.literal("manual"), v.null()),
    repoUrl: v.optional(v.string()),
    liveUrl: v.optional(v.string()),
    packageText: v.optional(v.string()),
    createdAt: v.number()
  }),

  // The full transcript
  messages: defineTable({
    projectId: v.optional(v.id("projects")),
    role: v.union(v.literal("user"), v.literal("yairos"), v.literal("agent")),
    agentId: v.optional(v.string()),
    text: v.string(),
    lang: v.union(v.literal("he"), v.literal("en")),
    kind: v.optional(v.string()),
    ts: v.number()
  }).index("by_ts", ["ts"]),

  // Every agent run (this is what lights up the galaxy)
  agentRuns: defineTable({
    projectId: v.id("projects"),
    agent: v.string(),
    input: v.string(),
    output: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    ts: v.number()
  }).index("by_ts", ["ts"])
});
