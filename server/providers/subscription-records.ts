import { desc, eq } from "drizzle-orm";

import {
	isUserSubscriptionId,
	type UserSubscriptionId,
} from "#/lib/user-subscriptions";
import { getDb } from "../db";
import { aiUserSubscriptions } from "../db/schema";

export type UserSubscriptionRecord = {
	subscriptionProvider: UserSubscriptionId;
	model: string;
	authMode: string;
	isActive: boolean;
};

export async function getLatestUserSubscriptionRecord(userId: string) {
	const [record] = await getDb()
		.select({
			subscriptionProvider: aiUserSubscriptions.subscriptionProvider,
			model: aiUserSubscriptions.model,
			authMode: aiUserSubscriptions.authMode,
			isActive: aiUserSubscriptions.isActive,
		})
		.from(aiUserSubscriptions)
		.where(eq(aiUserSubscriptions.userId, userId))
		.orderBy(desc(aiUserSubscriptions.createdAt))
		.limit(1);

	if (!record?.isActive) {
		return null;
	}

	const { subscriptionProvider, model, authMode, isActive } = record;
	if (!isUserSubscriptionId(subscriptionProvider)) {
		return null;
	}

	return {
		subscriptionProvider,
		model,
		authMode,
		isActive,
	};
}

type SubscriptionPersistenceWriter = Pick<
	ReturnType<typeof getDb>,
	"update" | "insert"
>;

export async function deactivateUserSubscriptions(
	writer: SubscriptionPersistenceWriter,
	userId: string,
) {
	await writer
		.update(aiUserSubscriptions)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(aiUserSubscriptions.userId, userId));
}

export async function insertUserSubscriptionRecord(
	writer: SubscriptionPersistenceWriter,
	input: {
		userId: string;
		subscriptionProvider: UserSubscriptionId;
		model: string;
		authMode: string;
	},
) {
	await writer.insert(aiUserSubscriptions).values({
		userId: input.userId,
		subscriptionProvider: input.subscriptionProvider,
		model: input.model,
		authMode: input.authMode,
		isActive: true,
	});
}
