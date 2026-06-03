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

export const SERVER_ACTION_NAME_SET = new Set<string>(
	FINISHED_SERVER_ACTION_NAMES,
);

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
