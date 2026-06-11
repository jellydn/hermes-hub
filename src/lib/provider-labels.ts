import { type ApiProviderId, formatAiProviderLabel } from "./ai-providers";
import {
	formatUserSubscriptionLabel,
	isUserSubscriptionId,
	type UserSubscriptionId,
} from "./user-subscriptions";

export function formatModelAccessProviderLabel(
	provider: ApiProviderId | UserSubscriptionId,
) {
	if (isUserSubscriptionId(provider)) {
		return formatUserSubscriptionLabel(provider);
	}

	return formatAiProviderLabel(provider);
}
