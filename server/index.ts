// import { publicProcedure, router } from "./trpc";
import * as trpcExpress from "@trpc/server/adapters/express";
import { z } from "zod";
import { EventEmitter } from "node:events";
import { observable } from "@trpc/server/observable";
import { Z_Update, Update, Z_Account, Account } from "./schemas";
import express from "express";
import { initTRPC } from "@trpc/server";
import { db, updates } from "./drizzle";
import { eq } from "drizzle-orm";
import { auth } from "./auth";

// create a global event emitter
const eventEmitter = new EventEmitter();

const createContext = ({ req, res}: trpcExpress.CreateExpressContextOptions) => ({})
type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const router = t.router;
const publicProcedure = t.procedure;

// express things
const app = express();
app.use(express.json());

const appRouter = router({
  onPost: publicProcedure.subscription(() => {
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
  createPost: publicProcedure
    .input(z.object({ update: Z_Update }))
    .mutation(async ({ input }) => {
      // create the post in the db here
      await db.insert(updates).values(input.update)
      // const newPost = await prisma.update.create({ data: input.update });
    }),
  getFeed: publicProcedure.input(z.number()).query(async (opts) => {
    const { input } = opts;
    // fetch the N most recent posts from the database and return them to the user
    const latestUpdates = await db.select().from(updates)
    // const latestUpdates = await prisma.update.findMany();
    // const latestUpdates = await prisma.update.findMany({
      // take: input,
      // orderBy: { postTime: "desc" },
    // });

    return latestUpdates;
  }),
  editPost: publicProcedure
    .input(z.object({ id: z.number(), body: Z_Update }))
    .mutation(async (opts) => {
      const { input } = opts;
      // update a post with the specified ID
      await db.update(updates).set(input.body).where(eq(updates.id, input.id))
    }),
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
  } catch {
    res.json({ success: false });
  }
});

// app.use("/auth/*", ExpressAuth({
//   providers: [

//   ],
//   adapter: PrismaAdapter(prisma)
// }))

app.listen(3000, () => console.log("Server running"));

