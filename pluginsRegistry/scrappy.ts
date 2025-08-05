import { parentPort } from "node:worker_threads";
import { AsyncResource } from "node:async_hooks";
import { App } from "@slack/bolt";


// const scrappy = new App({
//    signingSecret:  process.env.SLACK_SIGNING_SECRET,
//    token: process.env.SLACK_BOT_TOKEN
// });

// const scrappy = new App({
//     signingSecret: "",
//     token: ""
// });


// scrappy.command("/scpv2", async ({ command, ack, respond }) => {
//     await ack();
//     await respond("Got you!");
// });

type ScrapbookMessageEvent = {
    eventType: "newUpdate" | "newReaction" | "createPost" | "reactToPost",
    data: any // the data passed could be of arbitrary size/shape
}

// new Promise((resolve, reject) => {
  parentPort?.on("message", (msgEvent: ScrapbookMessageEvent) => {
    switch (msgEvent.eventType) {
      case "createPost": {
        console.log("Got new post with shape", msgEvent.data);
        parentPort?.postMessage("Got new post with shape");
      }
      default:
        (() => void 0)(); // noop
    }
  });
// });

// const PORT = process.env.PORT || 4000;
// (async () => {
//     // this is an arbitrarily picked port
//     await scrappy.start(PORT);
//     console.log("New Scrappy bot running on port", PORT);
// })();