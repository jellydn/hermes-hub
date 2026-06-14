export type ModelAccessOptionKind =
	| "api-provider"
	| "credential-subscription"
	| "oauth-subscription";

export type ModelAccessOption = {
	optionId: string;
	kind: ModelAccessOptionKind;
	label: string;
	model: string;
	fixedModels?: string[];
	allowsCustomModel?: boolean;
	isActive: boolean;
	keyLast4?: string | null;
	baseUrl?: string | null;
};

export type ModelAccessOptionsResponse = {
	options: ModelAccessOption[];
	activeOptionId: string | null;
};
