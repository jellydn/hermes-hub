export type CodexAuthStatus = {
	authenticated: boolean;
	authMode: string | null;
	lastRefresh: string | null;
	serverHost: string | null;
};

export type CodexAuthPanelState = {
	status: CodexAuthStatus | null;
	statusError: string | null;
	isLoadingStatus: boolean;
	isStarting: boolean;
	isCompleting: boolean;
	startError: string | null;
	completeError: string | null;
	userCode: string | null;
	verificationUrl: string | null;
};

export type CodexAuthPanelAction =
	| { type: "status_reset" }
	| { type: "status_load_started" }
	| { type: "status_load_failed"; error: string }
	| { type: "status_load_succeeded"; status: CodexAuthStatus }
	| { type: "status_load_finished" }
	| { type: "start_auth_started" }
	| { type: "start_auth_failed"; error: string }
	| {
			type: "start_auth_succeeded";
			userCode: string;
			verificationUrl: string;
	  }
	| { type: "start_auth_finished" }
	| { type: "complete_auth_started" }
	| { type: "complete_auth_failed"; error: string }
	| { type: "complete_auth_succeeded" }
	| { type: "complete_auth_finished" };

export function createInitialCodexAuthPanelState(): CodexAuthPanelState {
	return {
		status: null,
		statusError: null,
		isLoadingStatus: false,
		isStarting: false,
		isCompleting: false,
		startError: null,
		completeError: null,
		userCode: null,
		verificationUrl: null,
	};
}

export function codexAuthPanelReducer(
	state: CodexAuthPanelState,
	action: CodexAuthPanelAction,
): CodexAuthPanelState {
	switch (action.type) {
		case "status_reset":
			return {
				...state,
				status: null,
				statusError: null,
			};
		case "status_load_started":
			return {
				...state,
				isLoadingStatus: true,
				statusError: null,
			};
		case "status_load_failed":
			return {
				...state,
				status: null,
				statusError: action.error,
			};
		case "status_load_succeeded":
			return {
				...state,
				status: action.status,
				statusError: null,
			};
		case "status_load_finished":
			return {
				...state,
				isLoadingStatus: false,
			};
		case "start_auth_started":
			return {
				...state,
				isStarting: true,
				startError: null,
				completeError: null,
				userCode: null,
				verificationUrl: null,
			};
		case "start_auth_failed":
			return {
				...state,
				startError: action.error,
			};
		case "start_auth_succeeded":
			return {
				...state,
				userCode: action.userCode,
				verificationUrl: action.verificationUrl,
			};
		case "start_auth_finished":
			return {
				...state,
				isStarting: false,
			};
		case "complete_auth_started":
			return {
				...state,
				isCompleting: true,
				completeError: null,
			};
		case "complete_auth_failed":
			return {
				...state,
				completeError: action.error,
			};
		case "complete_auth_succeeded":
			return {
				...state,
				userCode: null,
				verificationUrl: null,
			};
		case "complete_auth_finished":
			return {
				...state,
				isCompleting: false,
			};
	}
}
