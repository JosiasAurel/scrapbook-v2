// import { publicProcedure, router } from "./trpc";
import * as trpcExpress from "@trpc/server/adapters/express";
import { z } from "zod";
import { EventEmitter } from "node:events";
import { observable } from "@trpc/server/observable";
import { Z_Update, Update, Z_Account, Account } from "./schemas";
import express from "express";
import { initTRPC, TRPCError } from "@trpc/server";
import { db, updates } from "./drizzle";
import { eq } from "drizzle-orm";
import { auth } from "./auth";

// create a global event emitter
const eventEmitter = new EventEmitter();

const createContext = async ({ req, res}: trpcExpress.CreateExpressContextOptions) => {
  const data = await auth.api.getSession({ headers: req.headers });
  if (data == null) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No token provided" });
  }
  return { user: data.user }
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use(async (opts) => {
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
  onPost: protectedProcedure.subscription(() => {
    return observable<Update>((emit) => {
      const onPost = (data: Update) => {
        emit.next(data);
      };

      eventEmitter.on("update", onPost);

      return () => {
        eventEmitter.off("update", onPost);
      };
    });
  }),
  createPost: protectedProcedure
    .input(z.object({ update: Z_Update }))
    .mutation(async ({ input }) => {
      // create the post in the db here
      await db.insert(updates).values(input.update)
      // const newPost = await prisma.update.create({ data: input.update });
    }),
  getFeed: protectedProcedure.input(z.number()).query(async (opts) => {
    const latestUpdates = await db.select().from(updates)

    return latestUpdates;
  }),
  editPost: protectedProcedure
    .input(z.object({ id: z.number(), body: Z_Update }))
    .mutation(async (opts) => {
      const { input } = opts;
      // update a post with the specified ID
      await db.update(updates).set(input.body).where(eq(updates.id, input.id))
    }),
  greet: protectedProcedure.query(async (opts) => {
    console.log("greeting", opts.ctx.user);
    return { success: true, message: "Hello World" };
  })
});

export type AppRouter = typeof appRouter;

// export { appRouter };
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

// app.use("/auth/*", ExpressAuth({
//   providers: [

//   ],
//   adapter: PrismaAdapter(prisma)
// }))

app.listen(3000, () => console.log("Server running"));

