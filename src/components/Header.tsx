import { Link } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";
import { BrandMark } from "./brand-mark";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
	const { data: session } = authClient.useSession();

	return (
		<header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
			<nav
				className={`${
					session ? "w-full max-w-none sm:px-2 lg:px-4" : "page-wrap"
				} flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4`}
				aria-label="Main navigation"
			>
				<h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
					<Link
						to="/"
						className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
						aria-label="HermesHub home"
					>
						<BrandMark size="sm" />
						HermesHub
					</Link>
				</h2>

				<div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:order-none sm:w-auto sm:flex-nowrap sm:pb-0">
					<Link
						to={session ? "/dashboard" : "/"}
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						{session ? "Dashboard" : "Home"}
					</Link>
					{!session ? (
						<Link
							to="/about"
							className="nav-link"
							activeProps={{ className: "nav-link is-active" }}
						>
							About
						</Link>
					) : null}
				</div>

				<div className="ml-auto flex items-center gap-1.5 sm:gap-2">
					{!session ? (
						<Link
							to="/login"
							className="inline-flex items-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)]"
						>
							Log in
						</Link>
					) : null}

					<ThemeToggle />
				</div>
			</nav>
		</header>
	);
}
