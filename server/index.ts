// import { publicProcedure, router } from "./trpc";
import * as trpcExpress from "@trpc/server/adapters/express";
import { z } from "zod";
import { EventEmitter, on } from "node:events";
import { Update, Account } from "./schemas";
import express from "express";
import { initTRPC, TRPCError } from "@trpc/server";
import { db, updates, reactions } from "./drizzle";
import { eq, and, desc, gt } from "drizzle-orm";
import { auth } from "./auth";

// create a global event emitter
const ee = new EventEmitter();
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
  createPost: [postId: string, data: any]
}

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
      // create the post in the db here
      const [ newPost ] = await db.insert(updates).values({ ...input.update, userId: ctx.user.id }).returning();

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
      const post = await db.select().from(updates).where(eq(updates.id, input.id));
      if (post[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not allowed to edit this post" });
      }

      // update a post with the specified ID
      await db.update(updates).set(input.body).where(eq(updates.id, input.id))
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
      await db.insert(reactions).values({ updateId: input.postId, userId: ctx.user.id, reaction: input.reaction });
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
    
    eventEmitter.toIterable("createPost", {

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
        yield post;
      }
    }

    for (const post of latestPosts) {
      yield maybeYield(post as any); // TODO: @Josias should do a proper type casting here
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

