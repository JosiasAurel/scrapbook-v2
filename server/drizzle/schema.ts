import { sqliteTable, AnySQLiteColumn, foreignKey, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const accounts = sqliteTable("accounts", {
	id: text().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: integer("access_token_expires_at"),
	refreshTokenExpiresAt: integer("refresh_token_expires_at"),
	scope: text(),
	password: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const reactions = sqliteTable("reactions", {
	id: text().primaryKey().notNull(),
	updateId: text().notNull().references(() => updates.id, { onDelete: "cascade" } ),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	reaction: text().notNull(),
	reactionTime: integer().notNull(),
});

export const sessions = sqliteTable("sessions", {
	id: text().primaryKey().notNull(),
	expiresAt: integer("expires_at").notNull(),
	token: text().notNull(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
},
(table) => [
	uniqueIndex("sessions_token_unique").on(table.token),
]);

export const updates = sqliteTable("updates", {
	id: text().primaryKey().notNull(),
	postTime: integer().notNull(),
	text: text().notNull(),
	attachments: text(),
	source: text().notNull(),
	userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
});

export const users = sqliteTable("users", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: integer("email_verified").notNull(),
	image: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
},
(table) => [
	uniqueIndex("users_email_unique").on(table.email),
]);

export const verifications = sqliteTable("verifications", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text({ mode: 'json' }).notNull(),
	expiresAt: integer("expires_at").notNull(),
	createdAt: integer("created_at"),
	updatedAt: integer("updated_at"),
});

