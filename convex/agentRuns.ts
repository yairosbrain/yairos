import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db
      .query("agentRuns")
      .withIndex("by_ts")
      .order("desc")
      .take(100);
    return recent.reverse();
  }
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    agent: v.string(),
    input: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    ts: v.number()
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentRuns", { ...args, output: "" });
  }
});

export const update = mutation({
  args: {
    id: v.id("agentRuns"),
    output: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("running"), v.literal("done"), v.literal("error"))
    )
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.output !== undefined) patch.output = args.output;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.id, patch);
  }
});
