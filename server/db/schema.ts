import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const healthChecks = pgTable("health_checks", {
	id: text("id").primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const users = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const sessions = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			withTimezone: true,
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("account_user_id_idx").on(table.userId)],
);

export const verifications = pgTable(
	"verification",
	{
		id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const servers = pgTable(
	"servers",
	{
		id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		host: text("host").notNull(),
		port: integer("port").notNull(),
		username: text("username").notNull(),
		authMethod: text("auth_method").notNull(),
		encryptedCredential: text("encrypted_credential"),
		storeCredential: boolean("store_credential").default(true).notNull(),
		status: text("status").notNull(),
		osInfo: jsonb("os_info").notNull(),
		hostKeyFingerprint: text("host_key_fingerprint"),
		hostKeyAlgorithm: text("host_key_algorithm"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("servers_user_id_idx").on(table.userId)],
);

export const installs = pgTable(
	"installs",
	{
		id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
		serverId: text("server_id")
			.notNull()
			.references(() => servers.id, { onDelete: "cascade" }),
		status: text("status").notNull(),
		step: text("step").notNull(),
		log: text("log"),
		version: text("version"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("installs_server_id_idx").on(table.serverId)],
);

export const installEvents = pgTable(
	"install_events",
	{
		id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
		installId: text("install_id")
			.notNull()
			.references(() => installs.id, { onDelete: "cascade" }),
		step: text("step").notNull(),
		progress: integer("progress").notNull(),
		message: text("message").notNull(),
		status: text("status").notNull(),
		error: text("error"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("install_events_install_id_created_at_idx").on(
			table.installId,
			table.createdAt,
		),
	],
);

export const aiProviders = pgTable(
	"ai_providers",
	{
		id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		encryptedApiKey: text("encrypted_api_key").notNull(),
		baseUrl: text("base_url"),
		model: text("model").notNull(),
		label: text("label"),
		isActive: boolean("is_active").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("ai_providers_user_id_idx").on(table.userId)],
);

export const telegramConfigs = pgTable(
	"telegram_configs",
	{
		id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		botToken: text("bot_token").notNull(),
		botUsername: text("bot_username"),
		isActive: boolean("is_active").default(false).notNull(),
		deployedServerId: text("deployed_server_id"),
		deployedServerHost: text("deployed_server_host"),
		apiServerKey: text("api_server_key"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("telegram_configs_user_id_idx").on(table.userId)],
);

export const auditLogs = pgTable(
	"audit_logs",
	{
		id: text("id").primaryKey().default(sql`gen_random_uuid()::text`),
		userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
		action: text("action").notNull(),
		details: jsonb("details"),
		ipAddress: text("ip_address"),
		serverId: text("server_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("audit_logs_user_id_idx").on(table.userId),
		index("audit_logs_user_created_idx").on(table.userId, table.createdAt),
		index("audit_logs_server_id_idx").on(
			table.userId,
			table.serverId,
			table.createdAt,
		),
	],
);

// Better Auth looks up schema models by singular names (user, session, account, verification).
// These re-exports provide the expected keys without renaming the primary exports.
export {
	accounts as account,
	sessions as session,
	users as user,
	verifications as verification,
};
