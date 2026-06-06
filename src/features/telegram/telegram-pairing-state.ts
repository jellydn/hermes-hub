export type TelegramPairingSummary = {
	pending: Array<{
		code: string;
		userId: string;
		userName: string;
		ageMinutes: number;
	}>;
	approved: Array<{
		userId: string;
		userName: string;
		approvedAt: number | null;
	}>;
};

export type TelegramPairingState = {
	pairingCode: string;
	pairings: TelegramPairingSummary | null;
	isLoadingPairings: boolean;
	isApprovingPairing: boolean;
	error: string | null;
	successMessage: string | null;
	lastLoadedAt: Date | null;
};

export type TelegramPairingAction =
	| { type: "set_pairing_code"; code: string }
	| { type: "load_started" }
	| { type: "load_failed"; error: string }
	| { type: "load_succeeded"; pairings: TelegramPairingSummary }
	| { type: "load_finished" }
	| { type: "approve_started" }
	| { type: "approve_failed"; error: string }
	| {
			type: "approve_succeeded";
			displayName: string;
	  }
	| { type: "approve_finished" };

export const initialTelegramPairingState: TelegramPairingState = {
	pairingCode: "",
	pairings: null,
	isLoadingPairings: false,
	isApprovingPairing: false,
	error: null,
	successMessage: null,
	lastLoadedAt: null,
};

export function telegramPairingReducer(
	state: TelegramPairingState,
	action: TelegramPairingAction,
): TelegramPairingState {
	switch (action.type) {
		case "set_pairing_code":
			return {
				...state,
				pairingCode: action.code,
			};
		case "load_started":
			return {
				...state,
				isLoadingPairings: true,
				error: null,
			};
		case "load_failed":
			return {
				...state,
				error: action.error,
			};
		case "load_succeeded":
			return {
				...state,
				pairings: action.pairings,
				error: null,
				lastLoadedAt: new Date(),
			};
		case "load_finished":
			return {
				...state,
				isLoadingPairings: false,
			};
		case "approve_started":
			return {
				...state,
				isApprovingPairing: true,
				error: null,
				successMessage: null,
			};
		case "approve_failed":
			return {
				...state,
				error: action.error,
			};
		case "approve_succeeded":
			return {
				...state,
				pairingCode: "",
				successMessage: `Approved ${action.displayName || "Telegram user"}.`,
			};
		case "approve_finished":
			return {
				...state,
				isApprovingPairing: false,
			};
		default:
			return state;
	}
}
