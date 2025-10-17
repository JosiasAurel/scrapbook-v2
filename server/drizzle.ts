import { config } from "dotenv";
import { drizzle } from "drizzle-orm/libsql";
import { int, integer, text, sqliteTable } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4, v5 as uuidv5 } from "uuid";

// load environment variables
config();

const UUID_NAMESPACE = '964fe082-b01d-44fe-b0a0-e3d6e7a495e9';
export const deterministicUUID = (input: string) => uuidv5(input, UUID_NAMESPACE);

export const updates = sqliteTable("updates", {
    id: text("id").primaryKey().$defaultFn(() => uuidv4()),
    // id: int().primaryKey({ autoIncrement: true }),
    postTime: int().notNull(), // timestamp
    text: text().notNull(),
    attachments: text(),
    source: text().notNull(), // string representing the client which sent the update
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" })
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => uuidv4()),
  // id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().$defaultFn(() => uuidv4()),
  // id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey().$defaultFn(() => uuidv4()),
  // id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey().$defaultFn(() => uuidv4()),
  // id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});

export const reactions = sqliteTable("reactions", {
  id: text("id").primaryKey().$defaultFn(() => uuidv4()),
  // id: int().primaryKey({ autoIncrement: true }),
  // updateId: int().notNull().references(() => updates.id, { onDelete: "cascade" }),
  updateId: text().notNull().references(() => updates.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reactionType: text("reaction_type").notNull(),
  reaction: text("reaction").notNull(),
  reactionTime: int().notNull(),
});

export const db = drizzle(process.env.DB_FILE_NAME!);
