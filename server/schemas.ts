import { db } from "./drizzle";
import { z } from "zod";

export const Account = z.object({
  id: z.number(),
  email: z.string(),
  emailVerified: z.date().default(() => new Date()),
  username: z.string(),
  streakCount: z.number().default(0),
  timezone: z.string(),
})

export const Update = z.object({
  id: z.number(),
  postTime: z.number(), // timestamp
  text: z.string(),
  attachments: z.array(z.instanceof(Blob)), // json stringified array of attachments
  source: z.string(),
  accountId: z.string(),
})

export const Reaction = z.object({
  id: z.number(),
  reactionTime: z.number(), // timestamp
  reaction: z.string(),
  userId: z.number()
})