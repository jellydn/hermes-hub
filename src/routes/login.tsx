import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { getCurrentSession } from "@/lib/session";

type LoginSearch = {
	redirect?: string;
};

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown>): LoginSearch => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	beforeLoad: async () => {
		const session = await getCurrentSession();

		if (session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const search = Route.useSearch();
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSubmitting(true);

		const callbackURL = search.redirect ?? "/dashboard";

		const result = await authClient.signIn.magicLink({
			email,
			callbackURL,
		});

		setIsSubmitting(false);

		if (result.error) {
			setError(result.error.message ?? "Unable to send magic link.");
			return;
		}

		setSubmitted(true);
	}

	return (
		<main className="page-wrap px-4 pb-10 pt-14">
			<section className="mx-auto max-w-xl island-shell rounded-[2rem] px-6 py-10 sm:px-8">
				<p className="island-kicker mb-3">Passwordless Login</p>
				<h1 className="display-title mb-4 text-4xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-5xl">
					Sign in to HermesHub
				</h1>
				<p className="mb-8 text-base text-[var(--sea-ink-soft)]">
					Enter your email and we&apos;ll send you a magic link for secure
					access.
				</p>

				{submitted ? (
					<div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
						Check your email for the magic link
					</div>
				) : null}

				{error ? (
					<div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--sea-ink)]">
						{error}
					</div>
				) : null}

				<form
					className="mt-6 space-y-4"
					onSubmit={(event) => void handleSubmit(event)}
				>
					<label className="block space-y-2 text-sm font-medium text-[var(--sea-ink)]">
						<span>Email</span>
						<input
							required
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="you@example.com"
							className="w-full rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-base text-[var(--sea-ink)] outline-none transition focus:border-[var(--sea-ink)] dark:bg-white/5"
						/>
					</label>

					<div className="flex flex-wrap items-center gap-3">
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Sending magic link..." : "Send magic link"}
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								void navigate({ to: "/" });
							}}
						>
							Back
						</Button>
					</div>
				</form>
			</section>
		</main>
	);
}
