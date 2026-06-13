import type { ApiProviderId } from "#/lib/ai-providers";
import type { UserSubscriptionId } from "#/lib/user-subscriptions";

type CredentialFingerprintInput = {
	apiKey: string;
	baseUrl: string;
	model: string;
	storedKeyLast4?: string | null;
};

function credentialKeyPart(
	apiKey: string,
	storedKeyLast4?: string | null,
): string {
	if (apiKey) {
		return apiKey;
	}

	return storedKeyLast4 ? `stored:${storedKeyLast4}` : "";
}

export function providerConnectionFingerprint(
	provider: ApiProviderId,
	form: CredentialFingerprintInput,
): string {
	return [
		"api",
		provider,
		form.model,
		form.baseUrl,
		credentialKeyPart(form.apiKey, form.storedKeyLast4),
	].join("|");
}

export function subscriptionConnectionFingerprint(
	subscriptionProvider: UserSubscriptionId,
	form: CredentialFingerprintInput,
): string {
	return [
		"sub",
		subscriptionProvider,
		form.model,
		form.baseUrl,
		credentialKeyPart(form.apiKey, form.storedKeyLast4),
	].join("|");
}
