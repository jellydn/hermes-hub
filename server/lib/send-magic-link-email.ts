import { logger } from "./logger";

/**
 * Send a magic-link email to the given address.
 *
 * Uses the Resend HTTP API when `RESEND_API_KEY` is set. When unset, falls
 * back to logging in non-production environments so developers can
 * click the link from terminal output. In production we refuse to log the
 * token-bearing URL and instead throw, so a misconfiguration causes a loud
 * 500 rather than silently leaking single-use login links into application
 * logs.
 */
export async function sendMagicLinkEmail(input: {
	email: string;
	url: string;
}): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;

	if (!apiKey) {
		const nodeEnv =
			typeof globalThis !== "undefined" && globalThis.process?.env?.NODE_ENV;
		if (nodeEnv === "production") {
			throw new Error(
				"RESEND_API_KEY is required to send magic-link emails in production.",
			);
		}

		logger.info(
			{ email: input.email, url: input.url },
			"Dev magic link URL logged for terminal use",
		);
		return;
	}

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: process.env.RESEND_FROM ?? "HermesHub <onboarding@resend.dev>",
			to: input.email,
			subject: "Sign in to HermesHub",
			text: `Sign in to HermesHub by clicking this link: ${input.url}\n\nThis link expires shortly.\n`,
			html: `<p>Sign in to HermesHub by clicking the link below:</p><p><a href="${input.url}">${input.url}</a></p><p>This link expires shortly.</p>`,
		}),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		logger.error(
			{ status: response.status, body },
			"Failed to send magic link email via Resend",
		);
		// Bubble up so Better Auth treats the send as failed and the auth
		// endpoint returns an error instead of telling the user to check
		// their inbox for a message that never arrived.
		throw new Error(
			`Failed to send magic-link email via Resend (${response.status}).`,
		);
	}
}
