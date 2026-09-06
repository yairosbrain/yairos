import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("conversationMemory").take(200);
  }
});

/** Upsert the rolling summary of one thread ("global" or a project id). */
export const set = mutation({
  args: {
    threadId: v.string(),
    summary: v.string(),
    coveredUpToTs: v.number(),
    foldedCount: v.number()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversationMemory")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .first();
    const doc = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return await ctx.db.insert("conversationMemory", doc);
  }
});
