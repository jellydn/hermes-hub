/**
 * Send a magic-link email to the given address.
 *
 * Uses the Resend SDK when `RESEND_API_KEY` is set.  Falls back to
 * `console.log` otherwise (development-friendly default consistent with the
 * project's lazy-resolution pattern).
 */
export async function sendMagicLinkEmail(input: {
	email: string;
	url: string;
}): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;

	if (!apiKey) {
		console.log(`Magic link for ${input.email}: ${input.url}`);
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
		console.error(
			`Failed to send magic link email via Resend: ${response.status} ${body}`,
		);
	}
}
