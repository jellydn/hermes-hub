// ── Diagnostic formatting ──────────────────────────────────────────
//
// Pure string formatters for Web UI container failure and
// hermes_cli import errors.  These live here (not in runtime.ts)
// so "runtime" only owns SSH/Docker choreography.

const WEB_UI_DIAGNOSTICS_MAX_LENGTH = 2000;

export function formatWebUiContainerFailureDetails(
	state: string | undefined,
	logs: string | undefined,
	maxLength = WEB_UI_DIAGNOSTICS_MAX_LENGTH,
): string {
	const statePart = state?.trim();
	const logsPart = logs?.trim();
	const prefix = statePart
		? `${statePart}. Recent logs: `
		: logsPart
			? "Recent logs: "
			: "";

	if (!prefix && !logsPart) {
		return "";
	}

	const remaining = maxLength - prefix.length;
	if (remaining <= 0) {
		return prefix.slice(0, maxLength);
	}

	if (!logsPart) {
		return prefix.slice(0, maxLength);
	}

	if (logsPart.length <= remaining) {
		return `${prefix}${logsPart}`;
	}

	return `${prefix}...${logsPart.slice(-(remaining - 3))}`;
}

export function formatHermesCliImportFailure(
	importError: string | undefined,
	state: string | undefined,
	logs: string | undefined,
	maxLength = WEB_UI_DIAGNOSTICS_MAX_LENGTH,
): string {
	const importPart = importError?.trim() || "unknown import error";
	const details = formatWebUiContainerFailureDetails(state, logs, maxLength);
	const prefix = `Hermes Web UI cannot import hermes_cli (${importPart}).`;

	if (!details) {
		return prefix;
	}

	const remaining = maxLength - prefix.length - 1;
	if (remaining <= 0) {
		return prefix.slice(0, maxLength);
	}

	if (details.length <= remaining) {
		return `${prefix} ${details}`;
	}

	return `${prefix} ${details.slice(0, remaining)}`;
}
