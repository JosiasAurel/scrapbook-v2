import { relations } from "drizzle-orm/relations";
import { users, accounts, reactions, updates, sessions } from "./schema";

export const accountsRelations = relations(accounts, ({one}) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	accounts: many(accounts),
	reactions: many(reactions),
	sessions: many(sessions),
	updates: many(updates),
}));

export const reactionsRelations = relations(reactions, ({one}) => ({
	user: one(users, {
		fields: [reactions.userId],
		references: [users.id]
	}),
	update: one(updates, {
		fields: [reactions.updateId],
		references: [updates.id]
	}),
}));

export const updatesRelations = relations(updates, ({one, many}) => ({
	reactions: many(reactions),
	user: one(users, {
		fields: [updates.userId],
		references: [users.id]
	}),
}));

export const sessionsRelations = relations(sessions, ({one}) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	}),
}));