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
  const greeting = await client.greet.query();
  console.log(greeting);
}

main();