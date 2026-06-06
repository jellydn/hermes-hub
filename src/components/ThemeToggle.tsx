import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type ThemeMode = "light" | "dark" | "auto";

const themeListeners = new Set<() => void>();

function getInitialMode(): ThemeMode {
	if (typeof window === "undefined") {
		return "auto";
	}

	const stored = window.localStorage.getItem("theme");
	if (stored === "light" || stored === "dark" || stored === "auto") {
		return stored;
	}

	return "auto";
}

function applyThemeMode(mode: ThemeMode) {
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;

	document.documentElement.classList.remove("light", "dark");
	document.documentElement.classList.add(resolved);

	if (mode === "auto") {
		document.documentElement.removeAttribute("data-theme");
	} else {
		document.documentElement.setAttribute("data-theme", mode);
	}

	document.documentElement.style.colorScheme = resolved;
}

function emitThemeChange() {
	for (const listener of themeListeners) {
		listener();
	}
}

function subscribeTheme(listener: () => void) {
	const isFirstListener = themeListeners.size === 0;
	themeListeners.add(listener);

	if (isFirstListener) {
		applyThemeMode(getInitialMode());
	}

	const media = window.matchMedia("(prefers-color-scheme: dark)");
	const onMediaChange = () => {
		const mode = getInitialMode();
		if (mode === "auto") {
			applyThemeMode("auto");
		}
		listener();
	};

	media.addEventListener("change", onMediaChange);

	return () => {
		themeListeners.delete(listener);
		media.removeEventListener("change", onMediaChange);
	};
}

function getThemeSnapshot(): ThemeMode {
	return getInitialMode();
}

export default function ThemeToggle() {
	const mode = useSyncExternalStore(
		subscribeTheme,
		getThemeSnapshot,
		() => "auto" as ThemeMode,
	);

	function toggleMode() {
		const nextMode: ThemeMode =
			mode === "light" ? "dark" : mode === "dark" ? "auto" : "light";
		window.localStorage.setItem("theme", nextMode);
		applyThemeMode(nextMode);
		emitThemeChange();
	}

	const label =
		mode === "auto"
			? "Theme mode: auto (system). Click to switch to light mode."
			: `Theme mode: ${mode}. Click to switch mode.`;

	const Icon = mode === "auto" ? Monitor : mode === "dark" ? Moon : Sun;

	return (
		<button
			type="button"
			onClick={toggleMode}
			aria-label={label}
			title={label}
			suppressHydrationWarning
			className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[var(--chip-line)] hover:text-[var(--sea-ink)]"
		>
			<Icon className="h-4 w-4" aria-hidden="true" />
			{mode === "auto" ? "Auto" : mode === "dark" ? "Dark" : "Light"}
		</button>
	);
}
