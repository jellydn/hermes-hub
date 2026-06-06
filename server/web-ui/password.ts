import crypto from "node:crypto";

import { decryptWebUiPassword, type ServerWebUiRecord } from "./records";

export function generateWebUiPassword() {
	return crypto.randomBytes(18).toString("base64url");
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
