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
