import { db } from "./drizzle";
import { z } from "zod";

export type Update = {
  id: string,
  postTime: number,
  text: string,
  // attachments: string[],
  attachments: string,
  source: string,
}

export type Account = {
  id: string,
  email: string,
  emailVerified: boolean,
  username: string,
  streakCount: number,
  timezone: string,
  updates: Update[]
}

export const Z_Account = z.object({
  id: z.number(),
  email: z.string(),
  emailVerified: z.date().default(() => new Date()),
  username: z.string(),
  streakCount: z.number().default(0),
  timezone: z.string(),
})

export const Z_Update = z.object({
  id: z.number(),
  postTime: z.number(),
  // postTime: z.preprocess(arg => {
  //   if (typeof arg === 'string' || arg instanceof Date) return new Date(arg)
  // }, z.date()),

  text: z.string(),
  attachments: z.string(),
  source: z.string(),
  accountId: z.string(),
})