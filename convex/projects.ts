import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("desc").take(100);
  }
});

export const create = mutation({
  args: {
    name: v.string(),
    request: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("projects", {
      name: args.name,
      request: args.request,
      status: "interrogating",
      questions: [],
      answers: [],
      spec: "",
      deployMode: null,
      createdAt: Date.now()
    });
  }
});

/**
 * Delete a project and everything attached to it: its transcript, its agent
 * runs, and its rolling conversation memory. Irreversible — the caller is
 * responsible for confirming with the user first.
 */
export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("projectId"), args.id))
      .collect();
    for (const m of messages) await ctx.db.delete(m._id);

    const runs = await ctx.db
      .query("agentRuns")
      .filter((q) => q.eq(q.field("projectId"), args.id))
      .collect();
    for (const r of runs) await ctx.db.delete(r._id);

    const memory = await ctx.db
      .query("conversationMemory")
      .withIndex("by_thread", (q) => q.eq("threadId", args.id))
      .first();
    if (memory) await ctx.db.delete(memory._id);

    await ctx.db.delete(args.id);
    return { messages: messages.length, runs: runs.length };
  }
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    patch: v.object({
      name: v.optional(v.string()),
      status: v.optional(v.string()),
      questions: v.optional(v.array(v.string())),
      answers: v.optional(v.array(v.string())),
      spec: v.optional(v.string()),
      deployMode: v.optional(
        v.union(v.literal("auto"), v.literal("manual"), v.null())
      ),
      repoUrl: v.optional(v.string()),
      liveUrl: v.optional(v.string()),
      packageText: v.optional(v.string())
    })
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, args.patch);
  }
});
