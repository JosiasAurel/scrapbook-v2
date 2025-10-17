import { db } from "./drizzle";
import { z } from "zod";

export const Account = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.date().default(() => new Date()),
  username: z.string(),
  streakCount: z.number().default(0),
  timezone: z.string(),
})

export const Update = z.object({
  id: z.string(),
  postTime: z.number(), // timestamp
  text: z.string(),
  // attachments: z.array(z.any()), // json stringified array of attachments
  attachments: z.array(z.string()), // each string represents the type 
  source: z.string(),
  accountId: z.string(),
})

export const Reaction = z.object({
  id: z.string(),
  reactionTime: z.number(), // timestamp
  reactionType: z.union([z.literal("URL"), z.literal("UNICODE")]),
  reaction: z.union([z.url(), z.string()]), // reaction is either url to image/gif or emoji unicode representation
  userId: z.string()
})

export const arrayBufferToString = z.codec(
    z.instanceof(ArrayBuffer),
    z.string(),
    {
        decode: (arrayBuffer) => {
            return Buffer.from(arrayBuffer).toString("base64");
        },
        encode: (b64: string) => {
            return Buffer.from(b64, "base64").buffer;
        }
    }
)
