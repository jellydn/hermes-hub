import {
	type CredentialSubscriptionOption,
	getCredentialSubscriptionOption,
	type UserSubscriptionId,
} from "#/lib/user-subscriptions";
import { getLatestProviderRecord } from "./records";
import { resolveSubscriptionCredentials } from "./subscription-credentials";

type CredentialSubscriptionInput = {
	subscriptionProvider: UserSubscriptionId;
	apiKey: string;
	baseUrl: string;
};

export async function loadCredentialSubscriptionCredentials(
	userId: string,
	parsed: CredentialSubscriptionInput,
): Promise<
	| { error: string }
	| {
			option: CredentialSubscriptionOption;
			credentials: { apiKey: string; baseUrl: string };
	  }
> {
	const option = getCredentialSubscriptionOption(parsed.subscriptionProvider);
	if (!option) {
		return { error: "Choose a valid credential-backed subscription." };
	}

	const existingRecord = await getLatestProviderRecord(userId);
	const resolved = resolveSubscriptionCredentials(
		{ apiKey: parsed.apiKey, baseUrl: parsed.baseUrl },
		existingRecord,
		option,
	);
	if ("error" in resolved) {
		return { error: resolved.error };
	}

	return {
		option,
		credentials: {
			apiKey: resolved.apiKey,
			baseUrl: resolved.baseUrl,
		},
	};
}
