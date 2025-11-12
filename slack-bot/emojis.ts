import { App } from "@slack/bolt";
import { reactions, db } from "../server/drizzle";
import { } from "drizzle-kit"

const scrappy = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

async function main() {
    const emojis = await scrappy.client.emoji.list()

    Object.entries(emojis.emoji!).map(([key, value]) => {
        db.insert(reactions).values({
            reaction: key,
            source: value
        })
    });

    let emoji = emojis.emoji["ultrafastparrot"]
    console.log(emoji);
    // console.log(emojis);
}

// For each emoji in this list
main();