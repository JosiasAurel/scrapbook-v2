import { config } from "dotenv";
import { drizzle } from "drizzle-orm/libsql";
import { int, text, sqliteTable } from "drizzle-orm/sqlite-core";

// load environment variables
config();

export const accountsTable = sqliteTable("accounts_table", {
    id: int().primaryKey({ autoIncrement: true }),
    email: text().notNull(),
    username: text().notNull(),
    streakCount: int().notNull(),
    timezone: int().notNull(),
});

export const updatesTable = sqliteTable("updates_table", {
    id: int().primaryKey({ autoIncrement: true }),
    postTime: int().notNull(), // timestamp
    text: text().notNull(),
    attachments: text(),
    source: text().notNull() // string representing the client which sent the update
});

export const db = drizzle(process.env.DB_FILE_NAME!);

