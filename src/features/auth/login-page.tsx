import { zodResolver } from "@hookform/resolvers/zod";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { AlertPanel } from "#/components/ui/alert-panel";
import { Button } from "#/components/ui/button";
import { FormFeedback } from "#/components/ui/form-feedback";
import { authClient } from "#/lib/auth-client";

const loginSchema = z.object({
	email: z.string().min(1, "Email is required").email("Invalid email address"),
});

type LoginFields = z.infer<typeof loginSchema>;

const loginRouteApi = getRouteApi("/login");

export function LoginPage() {
	const navigate = useNavigate();
	const search = loginRouteApi.useSearch();
	const [error, setError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<LoginFields>({
		resolver: zodResolver(loginSchema),
		defaultValues: {
			email: "",
		},
	});

	async function onSubmit(data: LoginFields) {
		setError(null);

		const callbackURL = search.redirect ?? "/dashboard";

		const result = await authClient.signIn.magicLink({
			email: data.email,
			callbackURL,
		});

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
					<AlertPanel tone="success" className="rounded-2xl">
						Check your email for the magic link
					</AlertPanel>
				) : null}

				{error ? (
					<AlertPanel tone="error" className="mt-4 rounded-2xl">
						{error}
					</AlertPanel>
				) : null}

				<form
					className="mt-6 space-y-4"
					onSubmit={(event) => void handleSubmit(onSubmit)(event)}
				>
					<div className="space-y-2">
						<label
							htmlFor="email"
							className="block text-sm font-medium text-[var(--sea-ink)]"
						>
							Email
						</label>
						<input
							id="email"
							type="email"
							placeholder="you@example.com"
							className="w-full rounded-2xl border border-[var(--line)] bg-[var(--input-bg)] px-4 py-3 text-base text-[var(--sea-ink)] outline-none transition focus:border-[color:var(--focus-ring)] focus:ring-2 focus:ring-[color:var(--focus-ring)]"
							{...register("email")}
						/>
						{errors.email ? (
							<FormFeedback className="text-xs" tone="error">
								{errors.email.message}
							</FormFeedback>
						) : null}
					</div>

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
