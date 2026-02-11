import { App } from "@slack/bolt";
import type { AppRouter } from "../server/index.ts";
import { createTRPCClient, httpBatchLink, httpLink } from "@trpc/client";
import { config } from "dotenv";
import { v4 as uuidv4 } from "uuid";
import Mux from "@mux/mux-node";
import stream from "node:stream";
import convert from "heic-convert";
import { z } from "zod";

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

// load environment variables
config();

const serverUrl = process.env.SERVER_URL ?? "http://localhost:3000";

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
    // httpLink({
      url: `${serverUrl}/trpc`,
      async headers() {
        const headers = new Headers();
        headers.set("Authorization", "Bearer BqfbcYRBBEO1UTS8E1YFuJvSwu1NHdPw"); // TODO: Replace token with variable - This is an app token
        return headers;
      },
    }),
  ],
});

// slack tokens
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

if (!SLACK_SIGNING_SECRET || !SLACK_BOT_TOKEN) {
  throw new Error("Missing SLACK_SIGNING_SECRET or SLACK_BOT_TOKEN in env");
}

// Initialize slack bot
const scrappy = new App({
  signingSecret: SLACK_SIGNING_SECRET,
  token: SLACK_BOT_TOKEN,
});

// Initialize Mux client
const mux = new Mux({
	tokenId: process.env.MUX_TOKEN_ID,
	tokenSecret: process.env.MUX_TOKEN_SECRET,
});

const SCRAPBOOK_V2_CHANNEL = "C096Y7U3L4T";
const makeIdBase = (channel: string, ts: string) => `${channel}-${ts}`;

scrappy.event("message", async (thing) => {
  // console.log("handling message");
  // console.log(Object.keys(thing));
  const { context, message, say } = thing;
  console.log(message);

  if ((message as any).thread_ts) return;
  if (!message.subtype || message.subtype == "file_share") {
    // create the post
    // console.log("creating post", message);
    try {
      if (message.files?.length === 0) {
        // should check if it has a link with an OG image though. We will use the OG image for
        // media attachment if it has one
        await say({
          text: "We will not save this post in scrapbook. Post most contain an image or a video",
          thread_ts: message.ts,
        });
        return;
      }

      // TODO: In the future it should check for og image and other metadata for rendering.
      if (!message.files) {
        return await say({
          text: "Please retry with an image or video",
          thread_ts: message.ts,
        }) 
      }

      let blobs = await Promise.all(
        message.files?.map(async (file) => {
          const data = await getPublicFileUrl(
            file.mimetype,
            file.url_private!,
            message.channel,
            message.user
          )!;
          console.log("data i got", data);
          return data;
        })!
      );
      blobs = blobs ? blobs : [];

      if (blobs.length > 0) {
      } else {
        console.log("Not enough attachments");
      }

      console.log("sending in for blobs", 
        blobs.map(blob => ({ type: blob.type, url: blob.url }))
      );

      const result = await trpcClient.createPost.mutate({
        idBase: makeIdBase(message.channel, message.ts),
        data: {
          postTime: Number(message.ts) * 1000, // timestamp in milliseconds
          source: `SLACK`,
          // accountId: message.user, // this should be the actual user ID of the person
          accountId: "98BgQZ6ghF1aDHyykAXpFmZfkXWk1Cfw",
          text: message.text!,
          attachments: blobs.map(blob => ({ type: blob.type, url: blob.url })),
        },
      });

      console.log("we got results from the server", result);

      // upload the attachments
      result.data.attachments.forEach(async (attachmentPresigned, index) => {
        const object = blobs[index];
        // const blob = new Blob([ object.data ], { type: object.type });
        // skip videos because they should already be uploaded
        if (object?.type.includes("mp4")) return;

        const response = await fetch(attachmentPresigned, {
          method: "PUT",
          body: object.blob,
        });
        if (response.ok) {
          console.log("[slack-bolt] Uploaded to", attachmentPresigned);
        }
      });

      // motivating you
      await say({
        text: "Well done there! Keep cooking",
        thread_ts: message.ts,
      });

    } catch (err) {
      console.log("couldn't create post");
      console.log(err);
    }

    return;
  }

  if (message.subtype === "message_changed") {
    console.log("updating post");
    await trpcClient.editPost.mutate({
      idBase: makeIdBase(message.channel, message.message.ts),
      body: { text: (message.message as any).text },
    });

    // updated the message
    await say({
      text: "Updated your message",
      thread_ts: message.message.ts
    });

    return;
  }

  if (message.subtype === "message_replied") return;
  if (message.subtype === "message_deleted") {
    // TODO: this should be the id of the message in the scrapbookv2 db
    const response = await trpcClient.deletePost.mutate({
      idBase: makeIdBase(message.channel, message.previous_message.ts),
    });
    console.log(response);
    return;
  }
  console.log("nothing");
});

scrappy.event("reaction_added", async ({ event }) => {
  const { reaction, user, item_user, item } = event;
  if (item.channel !== SCRAPBOOK_V2_CHANNEL) return;

  console.log("reacted with ", reaction);
});

async function runApp() {
	const port = process.env.PORT || 3001;
  await scrappy.start(port);
	console.log("Running on port", port);
  // scrappy.client.chat.postMessage({
  //   channel: "C096Y7U3L4T",
  //   text: "Scrapbookv2 Bot Running",
  // });
}

scrappy.error((err) => {
  console.error("[slack-bolt] error", err);
});

export function getUrls(text) {
  /**
   * source: https://github.com/huckbit/extract-urls/blob/dc958a658ebf9d86f4546092d5a3183e9a99eb95/index.js#L5
   *
   * matches http,https,www and urls like raylib.com including scrapbook.hackclub.com
   */
  const matcher = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()'@:%_\+.~#?!&//=]*)/gi;
  return text.match(matcher);
}

export function extractOgUrl(htmlDoc) {
  const result = RegExp("\"og:image\"").exec(htmlDoc);

  if (!result) return;

  let index = result.index;
  for(;;) {
    if (htmlDoc[index] === "/" && htmlDoc[index+1] === ">") break;
    if (htmlDoc[index] === ">") break;
    index++;
  }

  const ogExtract = htmlDoc.slice(result.index, index);
  const ogUrlString = ogExtract.split("content=")[1].trim();
  return ogUrlString.slice(1, -1);
}

export async function getPageContent(page) {
  const response = await fetch(page);
  const content = await response.text();
  return content;
}

export const isFileType = (types: Array<string>, filename: string) =>
    types.some(type => filename.toLowerCase().endsWith(type));

export const getPublicFileUrl = async (filetype: string, urlPrivate: string, channel: string, user: string) => {
  let fileName = urlPrivate.split("/").pop();
  const fileId = urlPrivate.split("-")[2].split("/")[0];
  const isImage = isFileType(["jpg", "jpeg", "png", "gif", "webp", "heic"], fileName!);
  const isAudio = isFileType(["mp3", "wav", "aiff", "m4a"], fileName!);
  const isVideo = isFileType(["mp4", "mov", "webm"], fileName!);
  
  if (!(isImage || isAudio || isVideo)) return null;
  const file = await fetch(urlPrivate, {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
  });

  let blob = await file.blob();

//   let mediaStream = blob.stream();
    // let outBuffer = await blob.arrayBuffer();
  if (blob.type === "image/heic") {
    const blobArrayBuffer = Buffer.from(await blob.arrayBuffer());
    // convert the image buffer into a jpeg image
    // const outBuffer = await convert({
    const outBuffer = await convert({
      buffer: blobArrayBuffer,
      format: "JPEG" 
    });

     // create a readable stream for upload
    // mediaStream = stream.Readable.from(outBuffer) as any;

    // fileName = `./${uuidv4()}.jpeg`;
    filetype = "image/jpeg";
    blob = new Blob([ outBuffer ], { type: filetype });
    // return { type: "image/jpeg", buffer: outBuffer };
  } 
  
  if (blob.size == 19) throw new Error("Media file not found");

  if (isVideo) {
    console.log("blob", blob);

    const form = new FormData();
    // const mediaStream = blob.stream();

    form.append("file", blob, fileName);

    const uploadedUrl = await fetch("https://bucky.hackclub.com", {
      method: "POST",
      body: form
    }).then(r => r.text());

    // console.log("uploaded video to bucky", uploadedUrl);

    return { type: filetype, url: uploadedUrl, blob: null };
  }

  // return { type: filetype, buffer: outBuffer } as const;
  // return { type: filetype, blob } as const;
  return { type: filetype, url: null, blob };
};

runApp();
