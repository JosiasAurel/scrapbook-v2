import type { AppRouter } from "../server/index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "http://localhost:3000",
      // async headers() {
      //     return
      // }
    }),
  ],
});

async function main() {
  const newPost = await client.createPost.mutate({
    id: "5",
    update: {
      postTime: new Date(),
      text: "Hello From TRPC",
    //   attachments: [],
      attachments: "",
      source: "RAW",
      id: "6",
      accountId: "6"
    },
  });
  console.log(newPost);

  const feed = await client.getFeed.query(3)
  console.log(feed);

}

main();