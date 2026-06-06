import crypto from "node:crypto";

import { decryptWebUiPassword, type ServerWebUiRecord } from "./records";

const STORED_PASSWORD_DECRYPT_ERROR =
	"Stored Hermes Web UI password could not be decrypted. Redeploy the Web UI before rewriting compose.";

export function generateWebUiPassword() {
	return crypto.randomBytes(18).toString("base64url");
}

export function resolveWebUiPasswordForCompose(input: {
	explicitPassword?: string;
	record: ServerWebUiRecord | null;
}): string | null {
	if (input.explicitPassword) {
		return input.explicitPassword;
	}

	if (!input.record?.enabled) {
		return null;
	}

	const password = decryptWebUiPassword(input.record.encryptedPassword);
	if (!password) {
		throw new Error(STORED_PASSWORD_DECRYPT_ERROR);
	}

	return password;
}

export function resolveWebUiDeployPassword(
	existingRecord: ServerWebUiRecord | null,
): { password: string } | { error: string } {
	if (existingRecord?.encryptedPassword) {
		const password = decryptWebUiPassword(existingRecord.encryptedPassword);
		if (!password) {
			return {
				error:
					"Stored Hermes Web UI password could not be decrypted. Fix encryption configuration before redeploying.",
			};
		}

		return { password };
	}

	return { password: generateWebUiPassword() };
}
