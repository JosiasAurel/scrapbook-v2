import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// load environment variables
config();

export default defineConfig({
    out: "./drizzle",
    schema: "./drizzle.ts",
    dialect: "sqlite",
    dbCredentials: {
        url: process.env.DB_FILE_NAME!
    }
});