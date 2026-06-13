import type { ApiProviderId } from "#/lib/ai-providers";
import type { UserSubscriptionId } from "#/lib/user-subscriptions";
import type {
	ApiProviderConfigSummary,
	UserSubscriptionConfigSummary,
} from "#shared/contracts/model-access";

export type ProviderFormPayload = {
	provider: ApiProviderId;
	model: string;
	apiKey: string;
	baseUrl: string;
};

export type SubscriptionFormPayload = {
	subscriptionProvider: UserSubscriptionId;
	model: string;
	apiKey: string;
	baseUrl: string;
};

type ProviderSaveResponse = {
	error?: string;
	provider?: ApiProviderConfigSummary;
};

type SubscriptionSaveResponse = {
	error?: string;
	subscription?: UserSubscriptionConfigSummary;
};

type ConnectionTestResponse = {
	error?: string;
	status?: string;
};

type DeployResponse = {
	error?: string;
	model?: string;
	status?: string;
};

async function readJsonBody<T>(response: Response): Promise<T | null> {
	return (await response.json().catch(() => null)) as T | null;
}

export async function saveProviderAccess(
	payload: ProviderFormPayload,
): Promise<
	| { ok: true; provider: ApiProviderConfigSummary }
	| { ok: false; error: string }
> {
	const response = await fetch("/api/providers", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	const body = await readJsonBody<ProviderSaveResponse>(response);

	if (!response.ok || !body?.provider) {
		return {
			ok: false,
			error: body?.error ?? "Unable to save provider settings.",
		};
	}

	return { ok: true, provider: body.provider };
}

export async function testProviderAccess(
	payload: ProviderFormPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const response = await fetch("/api/providers/test", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	const body = await readJsonBody<ConnectionTestResponse>(response);

	if (!response.ok || body?.status !== "connected") {
		return {
			ok: false,
			error: body?.error ?? "Connection failed",
		};
	}

	return { ok: true };
}

export async function saveSubscriptionAccess(
	payload: SubscriptionFormPayload,
): Promise<
	| { ok: true; subscription: UserSubscriptionConfigSummary }
	| { ok: false; error: string }
> {
	const response = await fetch("/api/providers/subscriptions", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	const body = await readJsonBody<SubscriptionSaveResponse>(response);

	if (!response.ok || !body?.subscription) {
		return {
			ok: false,
			error: body?.error ?? "Unable to save subscription settings.",
		};
	}

	return { ok: true, subscription: body.subscription };
}

export async function testSubscriptionAccess(
	payload: SubscriptionFormPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const response = await fetch("/api/providers/subscriptions/test", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	const body = await readJsonBody<ConnectionTestResponse>(response);

	if (!response.ok || body?.status !== "connected") {
		return {
			ok: false,
			error: body?.error ?? "Connection failed",
		};
	}

	return { ok: true };
}

export async function deployModelAccess(): Promise<
	{ ok: true; message: string } | { ok: false; error: string }
> {
	const response = await fetch("/api/providers/deploy", {
		method: "POST",
	});
	const body = await readJsonBody<DeployResponse>(response);

	if (!response.ok) {
		return {
			ok: false,
			error: body?.error ?? "Deploy failed",
		};
	}

	return {
		ok: true,
		message: body?.model
			? `Model "${body.model}" deployed successfully.`
			: "Deployed successfully.",
	};
}
