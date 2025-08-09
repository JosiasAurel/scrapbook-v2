import { App } from "@slack/bolt";
import type { AppRouter } from "../server/index.ts";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { config } from "dotenv";

// load environment variables
config();

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "http://localhost:3000/trpc",
      async headers() {
        const headers = new Headers();
        headers.set("Authorization", "Bearer IbXWu0oafAcAdyF9LgWrEJON69t312ED"); // TODO: Replace token with variable - This is an app token
        return headers;
      },
    }),
  ],
});

const scrappy = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

const makeIdBase = (channel: string, ts: string) => `${channel}-${ts}`;

scrappy.event("message", async (thing) => {
  // console.log("handling message");
  // console.log(Object.keys(thing));
  const { context, message, say } = thing;
  console.log(message);

  if ((message as any).thread_ts) return;
  if (!message.subtype) {
    // create the post
    console.log("creating post");
    try {
      const result = await trpcClient.createPost.mutate({
        idBase: makeIdBase(message.channel, message.ts),
        data: {
          postTime: Number(message.ts) * 1000, // timestamp in milliseconds
          source: `SLACK`,
          // accountId: message.user, // this should be the actual user ID of the person
          accountId: "03UNU8wTeqbdVKCXXck9EvlMddypcNqf",
          text: message.text!,
          attachments: [],
        },
      });

      // motivating you
      await say({
        text: "Well done there! Keep cooking",
        thread_ts: message.ts
      });

      console.log(result);
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

async function runApp() {
  await scrappy.start(process.env.PORT || 3001);

  // scrappy.client.chat.postMessage({
  //   channel: "C096Y7U3L4T",
  //   text: "Scrapbookv2 Bot Running",
  // });
}

runApp();
