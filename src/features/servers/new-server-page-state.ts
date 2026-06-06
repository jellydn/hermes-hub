export type ConnectedServer = {
	id: string;
	label: string;
	host: string;
	port: number;
	username: string;
	status: string;
	osInfo?: {
		name?: string;
		version?: string;
		architecture?: string;
	};
};

export type NewServerPageState = {
	submittedLabel: string | null;
	connectedServer: ConnectedServer | null;
	connectionError: string | null;
	installError: string | null;
	isConnecting: boolean;
	isStartingInstall: boolean;
};

export type NewServerPageAction =
	| { type: "connect_started" }
	| {
			type: "connect_failed";
			error: string;
	  }
	| {
			type: "connect_succeeded";
			server: ConnectedServer;
	  }
	| { type: "connect_finished" }
	| { type: "install_started" }
	| {
			type: "install_failed";
			error: string;
	  }
	| { type: "install_finished" };

export const initialNewServerPageState: NewServerPageState = {
	submittedLabel: null,
	connectedServer: null,
	connectionError: null,
	installError: null,
	isConnecting: false,
	isStartingInstall: false,
};

export function newServerPageReducer(
	state: NewServerPageState,
	action: NewServerPageAction,
): NewServerPageState {
	switch (action.type) {
		case "connect_started":
			return {
				...state,
				isConnecting: true,
				connectionError: null,
				installError: null,
			};
		case "connect_failed":
			return {
				...state,
				connectedServer: null,
				connectionError: action.error,
			};
		case "connect_succeeded":
			return {
				...state,
				connectedServer: action.server,
				submittedLabel: action.server.label,
			};
		case "connect_finished":
			return {
				...state,
				isConnecting: false,
			};
		case "install_started":
			return {
				...state,
				isStartingInstall: true,
				installError: null,
			};
		case "install_failed":
			return {
				...state,
				installError: action.error,
			};
		case "install_finished":
			return {
				...state,
				isStartingInstall: false,
			};
		default:
			return state;
	}
}
