import { validateAgentPersona } from "../hermes/persona";

export type PersonaSettingsSummary = {
	agentPersona: string;
	updatedAt: string;
};

export function parsePersonaSaveBody(
	payload: unknown,
): { ok: true; content: string } | { ok: false; error: string } {
	if (!payload || typeof payload !== "object") {
		return { ok: false, error: "Persona content is required." };
	}

	const agentPersona = (payload as { agentPersona?: unknown }).agentPersona;
	if (typeof agentPersona !== "string") {
		return { ok: false, error: "Persona content is required." };
	}

	return validateAgentPersona(agentPersona);
}

export function toPersonaSettingsSummary(input: {
	agentPersona: string;
	updatedAt: Date;
}): PersonaSettingsSummary {
	return {
		agentPersona: input.agentPersona,
		updatedAt: input.updatedAt.toISOString(),
	};
}
