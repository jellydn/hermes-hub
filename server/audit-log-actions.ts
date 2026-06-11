export const FINISHED_SERVER_ACTION_NAMES = [
	"server.connect.succeeded",
	"server.connect.failed",
	"server.update.succeeded",
	"server.update.failed",
	"server.action.restart.succeeded",
	"server.action.restart.failed",
	"server.action.update.succeeded",
	"server.action.update.failed",
	"server.action.rollback.succeeded",
	"server.action.rollback.failed",
] as const;

export const USER_INITIATED_ACTION_NAMES = [
	"server.action.restart.succeeded",
	"server.action.restart.failed",
	"server.action.update.succeeded",
	"server.action.update.failed",
	"server.action.rollback.succeeded",
	"server.action.rollback.failed",
] as const;

export const USER_INITIATED_ACTION_NAME_SET = new Set<string>(
	USER_INITIATED_ACTION_NAMES,
);

export const SETTINGS_DEPLOY_ACTION_NAMES = [
	"mcp.deployed",
	"mcp.deploy.failed",
	"agent_skills.deployed",
	"agent_skills.deploy.failed",
	"persona.deployed",
	"persona.deploy.failed",
] as const;

export const LOG_ACTION_NAMES = [
	...USER_INITIATED_ACTION_NAMES,
	...SETTINGS_DEPLOY_ACTION_NAMES,
] as const;
