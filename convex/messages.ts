import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_ts")
      .order("desc")
      .take(300);
    return recent.reverse();
  }
});

export const add = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    role: v.union(v.literal("user"), v.literal("yairos"), v.literal("agent")),
    agentId: v.optional(v.string()),
    text: v.string(),
    lang: v.union(v.literal("he"), v.literal("en")),
    kind: v.optional(v.string()),
    ts: v.number()
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", args);
  }
});
