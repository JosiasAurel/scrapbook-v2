import * as trpcExpress from "@trpc/server/adapters/express";
import { z } from "zod";
import { EventEmitter, on } from "node:events";
import { Update, Reaction } from "./schemas";
import express from "express";
import { initTRPC, TRPCError, tracked } from "@trpc/server";
import { db, updates, reactions } from "./drizzle";
import { eq, and, desc, gt } from "drizzle-orm";
import { auth } from "./auth";
import { v4 as uuidv4 } from "uuid";
import { uploadAttachment } from "./s3";

type EventMap<T> = Record<keyof T, any[]>;
class IterableEventEmitter<T extends EventMap<T>> extends EventEmitter<T> {
  toIterable<TEventName extends keyof T & string>(
    eventName: TEventName,
    opts?: NonNullable<Parameters<typeof on>[2]>,
  ): AsyncIterable<T[TEventName]> {
    return on(this as any, eventName, opts) as any;
  }
}

export interface ScrapbookEvents {
  createPost: [postId: string, data: any],
  reactToPost: [reactionId: string, data: any]
}

// create a global event emitter
const eventEmitter = new IterableEventEmitter<ScrapbookEvents>();

const createContext = async ({ req, res}: trpcExpress.CreateExpressContextOptions) => {
  const data = await auth.api.getSession({ headers: req.headers });
  if (data == null) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No token provided" });
  }
  return { user: data.user }
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const publicProcedure = t.procedure;
const protectedProcedure = publicProcedure.use(async (opts) => {
    const { ctx } = opts;
    return opts.next({
      ctx: {
        user: ctx.user,
      },
    });
})


const router = t.router;
// const protectedProcedure = t.procedure;

// express things
const app = express();
app.use(express.json());

const appRouter = router({
  createPost: protectedProcedure
    .input(z.object({ update: Update }))
    .mutation(async ({ ctx, input }) => {
      const attachments = input.update.attachments;
      const uploadedAttachments = (await Promise.all(attachments.map(async (attachment) => {
        const filename = `${uuidv4()}.${attachment.type.split("/")[1]}`;
        return await uploadAttachment(attachment, filename);
      }))).filter(a => a);

      const payload = {
        ...input.update,
        attachments: uploadedAttachments.join(","),
        userId: ctx.user.id
      };

      // create the post in the db here
      const [ newPost ] = await db.insert(updates).values(payload).returning();

      // emit a create post event
      eventEmitter.emit("createPost", newPost.id.toString(), newPost);
    }),
  getFeed: protectedProcedure.input(z.number()).query(async (opts) => {
    const latestUpdates = await db.select().from(updates).limit(50).orderBy(desc(updates.postTime))

    return latestUpdates;
  }),
  editPost: protectedProcedure
    .input(z.object({ id: z.number(), body: Update }))
    .mutation(async (opts) => {
      const { input, ctx } = opts;

      // verify and make sure the post belongs to the user
      const posts = await db.select().from(updates).where(and(eq(updates.id, input.id), eq(updates.userId, ctx.user.id)));
      if (posts.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Either the post is not found or you do not have the permission to edit this post." });
      }

      const payload = {
        ...input.body,
        ...(input.body.attachments ? { 
          attachments: (await Promise.all(
            input.body.attachments.map(async a => await uploadAttachment(a, `${uuidv4()}.${a.type.split("/")[1]}`))
          )).filter(a => a).join(",") 
        } : {})
      } as Omit<z.infer<typeof Update>, 'attachments'> & { attachments: string };

      // update a post with the specified ID
      await db.update(updates).set(payload).where(eq(updates.id, input.id))
    }),
    deletePost: protectedProcedure.input(z.object({ id: z.number()})).mutation(async (opts) => {
      const { input, ctx } = opts;

      // verify and make sure the post belongs to the user
      const post = await db.select().from(updates).where(eq(updates.id, input.id));
      if (post[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not allowed to delete this post" });
      }

      // delete the post
      await db.delete(updates).where(eq(updates.id, input.id));
    }),
  reactToPost: protectedProcedure.input(z.object({ postId: z.number(), reaction: z.string()})).mutation(async (opts) => {
    const { input, ctx } = opts;

    // check if the user has already reacted to this post with this reaction
    const reaction = await db.select().from(reactions).where(and(eq(reactions.updateId, input.postId), eq(reactions.userId, ctx.user.id)));
    if (reaction.length == 0) {
      // create the reaction
      const [ newReaction ] = await db.insert(reactions).values({ updateId: input.postId, userId: ctx.user.id, reaction: input.reaction, reactionTime: new Date().getTime() }).returning();
      eventEmitter.emit("reactToPost", newReaction.id.toString(), newReaction);
    }

  }),
  unreactToPost: protectedProcedure.input(z.object({ postId: z.number()})).mutation(async (opts) => {
    const { input, ctx } = opts;

    // delete the reaction
    await db.delete(reactions).where(and(eq(reactions.updateId, input.postId), eq(reactions.userId, ctx.user.id)));
  }),
  onPost: protectedProcedure.input(z.object({ lastPostId: z.number().nullish(), })).subscription(async function* (opts) {
    const { ctx, input } = opts;
    const { lastPostId } = input;
    
    const eePostIterable = eventEmitter.toIterable("createPost", {
      signal: opts.signal
    });

    let lastPostCreatedTime;

    if (lastPostId) {
      // get the post time of the post with the last id
      const [ postWithId ] = await db.select().from(updates).where(eq(updates.id, lastPostId));
      lastPostCreatedTime = postWithId.postTime; 
    } else {
      const [ lastPost ] = await db.select().from(updates).orderBy(desc(updates.postTime)).limit(1);
      lastPostCreatedTime = lastPost.postTime;
    }

   const latestPosts = await db.select().from(updates).where(gt(updates.postTime, lastPostCreatedTime));

    function* maybeYield(post: z.infer<typeof Update>) {
      if (post.postTime > lastPostCreatedTime) {
        yield tracked(post.id.toString(), post);
      }
    }

    for (const post of latestPosts) {
      yield* maybeYield(post as any); // TODO: @Josias should do a proper type casting here
    }

    // also return new messages from event emitter
    for await (const [ _, postData ] of eePostIterable) {
      yield* maybeYield(postData);
    }
  }),
  streamPostReactions: protectedProcedure.input(z.object({ reaction: z.string(), lastPostId: z.number().nullish()})).subscription(async function* (opts) {
    const { input } = opts;
    let lastReactionTime;
    if (input.lastPostId) {
      const [ reaction ] = await db.select().from(reactions).where(eq(updates.id, input.lastPostId));
      lastReactionTime = reaction.reactionTime; 
    } else {
      const [ reaction ] = await db.select().from(reactions).orderBy(desc(reactions.reactionTime));
      lastReactionTime = reaction.reactionTime;
    }

    function* maybeYield(reaction: z.infer<typeof Reaction>) {
      if (reaction.reactionTime > lastReactionTime) {
        tracked(reaction.id.toString(), reaction);
      }
    }

    const latestReactions = await db.select().from(reactions).where(gt(reactions.reactionTime, lastReactionTime));
    for (const reaction of latestReactions) {
      yield* maybeYield(reaction as any);
    }
  }),
  greet: protectedProcedure.query(async (opts) => {
    console.log("greeting", opts.ctx.user);
    return { success: true, message: "Hello World" };
  })
});

export type AppRouter = typeof appRouter;

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext
  }),
)

app.get("/", (req, res) => {
  res.json({ success: true, message: "Hello World" });
});

app.post("/auth/signup", async (req, res) => {
  const body = req.body;
  try {
    const data = await auth.api.signInMagicLink({
      body: {
        email: body.email,
      },
      headers: req.headers
    });

    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/auth/magic-link/verify", async (req, res) => {
  try {
    const data = await auth.api.magicLinkVerify({
      query: {
        token: req.query.token,
      },
      headers: req.headers,
    });

    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log("Server running"));
