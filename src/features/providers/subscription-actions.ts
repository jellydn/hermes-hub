import type { UserSubscriptionId } from "#/lib/user-subscriptions";
import type { UserSubscriptionConfigSummary } from "#shared/contracts/model-access";

export type SubscriptionFormPayload = {
	subscriptionProvider: UserSubscriptionId;
	model: string;
	apiKey: string;
	baseUrl: string;
};

type SubscriptionSaveResponse = {
	error?: string;
	subscription?: UserSubscriptionConfigSummary;
};

type SubscriptionTestResponse = {
	error?: string;
	status?: string;
};

export async function saveSubscriptionAccess(
	payload: SubscriptionFormPayload,
): Promise<SubscriptionSaveResponse> {
	const response = await fetch("/api/providers/subscriptions", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});

	return (await response.json().catch(() => null)) as SubscriptionSaveResponse;
}

export async function testSubscriptionAccess(
	payload: SubscriptionFormPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const response = await fetch("/api/providers/subscriptions/test", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});

	const body = (await response
		.json()
		.catch(() => null)) as SubscriptionTestResponse | null;

	if (!response.ok || body?.status !== "connected") {
		return {
			ok: false,
			error: body?.error ?? "Connection failed",
		};
	}

	return { ok: true };
}
