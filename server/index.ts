import * as trpcExpress from "@trpc/server/adapters/express";
import { z } from "zod";
import { EventEmitter, on } from "node:events";
import { Update, Reaction } from "./schemas";
import express from "express";
import { initTRPC, TRPCError, tracked } from "@trpc/server";
import { db, updates, reactions, deterministicUUID } from "./drizzle";
import { eq, and, desc, gt } from "drizzle-orm";
import { auth } from "./auth";
import { v4 as uuidv4, v5 as uuidv5 } from "uuid";
import { uploadAttachment } from "./s3";
import { Worker } from "node:worker_threads";

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

// set the max number of listeners - adjustable via env
eventEmitter.setMaxListeners(parseInt(process.env.MAX_PLUGIN_LISTENER!));

const createContext = async ({ req, res}: trpcExpress.CreateExpressContextOptions) => {
  const data = await auth.api.getSession({ headers: req.headers as any });
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

type PluginsRegistry = {
  createPost: string[],
  createReaction: string[]
}

const pluginsRegistry: PluginsRegistry = {
  createPost: ["/pluginsRegistry/scrappy.ts"],
  createReaction: []
}

function listenAndNotifyPlugins(eventType: string, data: any) {
  console.log("notifying plugins for event", eventType);
  for (const plugin of pluginsRegistry[eventType]) {
    const pluginPath = __dirname + "/.." + plugin;

    console.log("pluginPath", pluginPath);
    const worker = new Worker(pluginPath);
    worker.postMessage({ eventType, data });
    worker.on("message", (message) => console.log(message));
    worker.on("error", () => console.log("Error with worker"));
    worker.on("exit", () => console.log("worker suddenly exited"));
    // TODO: find a way to kill the service after a certain amount of time 
    // Something like a setTimeout will probably do the trick
  }
}

// TODO: Will BroadcastChannel work here??

// build an event listener that listens to all events and runs notifies plugins of them
// the keys of the plugins registry correspond to the event names 
Object.keys(pluginsRegistry).map((eventName) => {
  console.log("registered an event listener for ", eventName);
  return eventEmitter.on(eventName as keyof ScrapbookEvents, (_: string, data: any) => {
    listenAndNotifyPlugins(eventName, data);
  });

  // console.log("Registering a global event listener for plugins");
  // for await (const event of on(eventEmitter, eventName)) 
  //   listenAndNotifyPlugins(eventName, event);
})

const router = t.router;
// const protectedProcedure = t.procedure;

// express things
const app = express();
app.use(express.json());

const obtainObjectId = (id: string | undefined, idBase: string | undefined): string => {
  if (id) return id;
  if (!id && idBase) return deterministicUUID(idBase);
  throw new TRPCError({ code: "FORBIDDEN", message: "The id or idBase you provided is incorrect" });
}

const appRouter = router({
  createPost: protectedProcedure
    .input(z.object({ idBase: z.string().optional(), data: Update.omit({ id: true }) }))
    .mutation(async ({ ctx, input }) => {
      const attachments = input.data.attachments;
      const uploadedAttachments = (await Promise.all(attachments.map(async (attachment) => {
        const filename = `${uuidv4()}.${attachment.type.split("/")[1]}`;
        return await uploadAttachment(attachment, filename);
      }))).filter(a => a);

      const payload = {
        ...input.data,
        attachments: uploadedAttachments.join(","),
        userId: ctx.user.id,
        ...(input.idBase ? { id: deterministicUUID(input.idBase) } : {} )
      };

      // create the post in the db here
      const [ newPost ] = await db.insert(updates).values(payload).returning();

      // emit a create post event
      eventEmitter.emit("createPost", newPost.id.toString(), newPost);
      return { success: true, data: newPost };
    }),
  getFeed: protectedProcedure.input(z.number()).query(async (opts) => {
    const latestUpdates = await db.select().from(updates).limit(50).orderBy(desc(updates.postTime))

    return latestUpdates;
  }),
  editPost: protectedProcedure
    .input(z.object({ id: z.string().optional(), idBase: z.string().optional(), body: Update.partial() }))
    .mutation(async (opts) => {
      const { input, ctx } = opts;

      const id = obtainObjectId(input.id, input.idBase);

      // verify and make sure the post belongs to the user
      const posts = await db.select().from(updates).where(and(eq(updates.id, id!), eq(updates.userId, ctx.user.id)));
      if (posts.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not find a post with that id" });
      }

      // TODO: Should delete all attachments that changed
      const payload = {
        ...input.body,
        ...(input.body.attachments ? { 
          attachments: (await Promise.all(
            input.body.attachments.map(async a => await uploadAttachment(a, `${uuidv4()}.${a.type.split("/")[1]}`))
          )).filter(a => a).join(",") 
        } : {})
      } as Omit<z.infer<typeof Update>, 'attachments'> & { attachments: string };

      // update a post with the specified ID
      await db.update(updates).set(payload).where(eq(updates.id, id))
    }),
    deletePost: protectedProcedure.input(z.object({ id: z.string().optional(), idBase: z.string().optional() })).mutation(async (opts) => {
      const { input, ctx } = opts;

      let id = obtainObjectId(input.id, input.idBase);

      // verify and make sure the post belongs to the user
      const post = await db.select().from(updates).where(eq(updates.id, id));
      if (post.length === 0) return { success: false, data: "This post does not exist" }
      if (post[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not allowed to delete this post" });
      }

      // delete the post
      await db.delete(updates).where(eq(updates.id, id));
    }),
  reactToPost: protectedProcedure.input(z.object({ postId: z.string().optional(), idBase: z.string().optional(), reaction: z.string()})).mutation(async (opts) => {
    const { input, ctx } = opts;
    const postId = obtainObjectId(input.postId, input.idBase);

    // check if the user has already reacted to this post with this reaction
    const reaction = await db.select().from(reactions).where(and(eq(reactions.updateId, postId), eq(reactions.userId, ctx.user.id)));
    if (reaction.length == 0) {
      // create the reaction
      const [ newReaction ] = await db.insert(reactions).values({ updateId: postId, userId: ctx.user.id, reaction: input.reaction, reactionTime: new Date().getTime() }).returning();
      eventEmitter.emit("reactToPost", newReaction.id.toString(), newReaction);
    }

  }),
  unreactToPost: protectedProcedure.input(z.object({ postId: z.string().optional(), idBase: z.string().optional() })).mutation(async (opts) => {
    const { input, ctx } = opts;

    const postId = obtainObjectId(input.postId, input.idBase);
    // delete the reaction
    await db.delete(reactions).where(and(eq(reactions.updateId, postId), eq(reactions.userId, ctx.user.id)));
  }),
  onPost: protectedProcedure.input(z.object({ lastPostId: z.string().nullish(), })).subscription(async function* (opts) {
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
  streamPostReactions: protectedProcedure.input(z.object({ reaction: z.string(), lastPostId: z.string().nullish()})).subscription(async function* (opts) {
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

    // emit this event for testing purposes
    eventEmitter.emit("createPost", "sample", { hello: "world" });

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
      headers: req.headers as any
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
        token: req.query.token as string,
      },
      headers: req.headers as any,
    });

    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log("Server running"));
