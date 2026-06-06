import { describe, expect, it } from "vitest";

import type { PersonaSettingsSummary } from "./persona-settings";
import {
	createInitialPersonaSettingsUiState,
	personaSettingsUiReducer,
	type PersonaSettingsUiState,
} from "./persona-settings-state";

const baseSettings: PersonaSettingsSummary = {
	agentPersona: "You are Hermes.",
	deployedServerHost: "1.2.3.4",
	deployedAt: "2026-06-06T12:00:00.000Z",
	updatedAt: "2026-06-06T12:00:00.000Z",
};

const baseState: PersonaSettingsUiState = {
	savedSettings: baseSettings,
	isSaving: false,
	saveError: null,
	saveSuccess: null,
	isDeploying: false,
	deployError: null,
	deployResult: null,
};

describe("createInitialPersonaSettingsUiState", () => {
	it("creates empty state when no initial settings are provided", () => {
		const state = createInitialPersonaSettingsUiState(null);

		expect(state).toEqual({
			savedSettings: null,
			isSaving: false,
			saveError: null,
			saveSuccess: null,
			isDeploying: false,
			deployError: null,
			deployResult: null,
		});
	});

	it("populates savedSettings from provided initial settings", () => {
		const state = createInitialPersonaSettingsUiState(baseSettings);

		expect(state.savedSettings).toEqual(baseSettings);
	});

	it("always starts with all loading and error flags false/null", () => {
		const state = createInitialPersonaSettingsUiState(baseSettings);

		expect(state.isSaving).toBe(false);
		expect(state.saveError).toBeNull();
		expect(state.saveSuccess).toBeNull();
		expect(state.isDeploying).toBe(false);
		expect(state.deployError).toBeNull();
		expect(state.deployResult).toBeNull();
	});
});

describe("personaSettingsUiReducer", () => {
	describe("persona_changed", () => {
		it("clears saveError and saveSuccess", () => {
			const state: PersonaSettingsUiState = {
				...baseState,
				saveError: "Something went wrong",
				saveSuccess: "Persona saved.",
			};

			const next = personaSettingsUiReducer(state, { type: "persona_changed" });

			expect(next.saveError).toBeNull();
			expect(next.saveSuccess).toBeNull();
		});

		it("does not affect other fields", () => {
			const state: PersonaSettingsUiState = {
				...baseState,
				isSaving: true,
				isDeploying: true,
				deployError: "Deploy failed",
			};

			const next = personaSettingsUiReducer(state, { type: "persona_changed" });

			expect(next.isSaving).toBe(true);
			expect(next.isDeploying).toBe(true);
			expect(next.deployError).toBe("Deploy failed");
		});
	});

	describe("save_started", () => {
		it("sets isSaving to true and clears save feedback", () => {
			const state: PersonaSettingsUiState = {
				...baseState,
				saveError: "Previous error",
				saveSuccess: "Previous success",
			};

			const next = personaSettingsUiReducer(state, { type: "save_started" });

			expect(next.isSaving).toBe(true);
			expect(next.saveError).toBeNull();
			expect(next.saveSuccess).toBeNull();
		});
	});

	describe("save_failed", () => {
		it("sets saveError to the provided message", () => {
			const next = personaSettingsUiReducer(baseState, {
				type: "save_failed",
				error: "Persona content cannot be empty.",
			});

			expect(next.saveError).toBe("Persona content cannot be empty.");
		});

		it("does not change isSaving (that is handled by save_finished)", () => {
			const state: PersonaSettingsUiState = { ...baseState, isSaving: true };

			const next = personaSettingsUiReducer(state, {
				type: "save_failed",
				error: "Some error",
			});

			expect(next.isSaving).toBe(true);
		});
	});

	describe("save_succeeded", () => {
		it("updates savedSettings and sets saveSuccess message", () => {
			const newSettings: PersonaSettingsSummary = {
				agentPersona: "Updated persona",
				deployedServerHost: null,
				deployedAt: null,
				updatedAt: "2026-06-06T13:00:00.000Z",
			};

			const next = personaSettingsUiReducer(baseState, {
				type: "save_succeeded",
				settings: newSettings,
			});

			expect(next.savedSettings).toEqual(newSettings);
			expect(next.saveSuccess).toBe("Persona saved.");
		});

		it("does not change isSaving (that is handled by save_finished)", () => {
			const state: PersonaSettingsUiState = { ...baseState, isSaving: true };

			const next = personaSettingsUiReducer(state, {
				type: "save_succeeded",
				settings: baseSettings,
			});

			expect(next.isSaving).toBe(true);
		});
	});

	describe("save_finished", () => {
		it("sets isSaving to false", () => {
			const state: PersonaSettingsUiState = { ...baseState, isSaving: true };

			const next = personaSettingsUiReducer(state, { type: "save_finished" });

			expect(next.isSaving).toBe(false);
		});

		it("preserves other state fields", () => {
			const state: PersonaSettingsUiState = {
				...baseState,
				isSaving: true,
				saveError: "Error from before",
			};

			const next = personaSettingsUiReducer(state, { type: "save_finished" });

			expect(next.saveError).toBe("Error from before");
			expect(next.savedSettings).toEqual(baseSettings);
		});
	});

	describe("deploy_started", () => {
		it("sets isDeploying to true and clears deploy feedback", () => {
			const state: PersonaSettingsUiState = {
				...baseState,
				deployError: "Previous deploy error",
				deployResult: "Previous deploy result",
			};

			const next = personaSettingsUiReducer(state, { type: "deploy_started" });

			expect(next.isDeploying).toBe(true);
			expect(next.deployError).toBeNull();
			expect(next.deployResult).toBeNull();
		});
	});

	describe("deploy_failed", () => {
		it("sets deployError to the provided message", () => {
			const next = personaSettingsUiReducer(baseState, {
				type: "deploy_failed",
				error: "SSH connection refused",
			});

			expect(next.deployError).toBe("SSH connection refused");
		});

		it("does not change isDeploying (that is handled by deploy_finished)", () => {
			const state: PersonaSettingsUiState = {
				...baseState,
				isDeploying: true,
			};

			const next = personaSettingsUiReducer(state, {
				type: "deploy_failed",
				error: "Some deploy error",
			});

			expect(next.isDeploying).toBe(true);
		});
	});

	describe("deploy_succeeded", () => {
		it("updates savedSettings and sets deployResult message", () => {
			const newSettings: PersonaSettingsSummary = {
				agentPersona: "You are Hermes.",
				deployedServerHost: "1.2.3.4",
				deployedAt: "2026-06-06T14:00:00.000Z",
				updatedAt: "2026-06-06T14:00:00.000Z",
			};

			const next = personaSettingsUiReducer(baseState, {
				type: "deploy_succeeded",
				settings: newSettings,
				message: "Persona deployed to 1.2.3.4. Hermes is restarting...",
			});

			expect(next.savedSettings).toEqual(newSettings);
			expect(next.deployResult).toBe(
				"Persona deployed to 1.2.3.4. Hermes is restarting...",
			);
		});

		it("does not change isDeploying (that is handled by deploy_finished)", () => {
			const state: PersonaSettingsUiState = {
				...baseState,
				isDeploying: true,
			};

			const next = personaSettingsUiReducer(state, {
				type: "deploy_succeeded",
				settings: baseSettings,
				message: "Deployed.",
			});

			expect(next.isDeploying).toBe(true);
		});
	});

	describe("deploy_finished", () => {
		it("sets isDeploying to false", () => {
			const state: PersonaSettingsUiState = {
				...baseState,
				isDeploying: true,
			};

			const next = personaSettingsUiReducer(state, { type: "deploy_finished" });

			expect(next.isDeploying).toBe(false);
		});

		it("preserves other state fields", () => {
			const state: PersonaSettingsUiState = {
				...baseState,
				isDeploying: true,
				deployError: "Error from before",
			};

			const next = personaSettingsUiReducer(state, { type: "deploy_finished" });

			expect(next.deployError).toBe("Error from before");
			expect(next.savedSettings).toEqual(baseSettings);
		});
	});

	describe("full save flow", () => {
		it("handles save_started → save_succeeded → save_finished lifecycle", () => {
			const newSettings: PersonaSettingsSummary = {
				agentPersona: "Updated",
				deployedServerHost: null,
				deployedAt: null,
				updatedAt: "2026-06-06T15:00:00.000Z",
			};
			let state = baseState;

			state = personaSettingsUiReducer(state, { type: "save_started" });
			expect(state.isSaving).toBe(true);
			expect(state.saveError).toBeNull();

			state = personaSettingsUiReducer(state, {
				type: "save_succeeded",
				settings: newSettings,
			});
			expect(state.savedSettings).toEqual(newSettings);
			expect(state.saveSuccess).toBe("Persona saved.");

			state = personaSettingsUiReducer(state, { type: "save_finished" });
			expect(state.isSaving).toBe(false);
			expect(state.saveSuccess).toBe("Persona saved.");
		});

		it("handles save_started → save_failed → save_finished lifecycle", () => {
			let state = baseState;

			state = personaSettingsUiReducer(state, { type: "save_started" });
			state = personaSettingsUiReducer(state, {
				type: "save_failed",
				error: "Network error",
			});
			expect(state.saveError).toBe("Network error");

			state = personaSettingsUiReducer(state, { type: "save_finished" });
			expect(state.isSaving).toBe(false);
			expect(state.saveError).toBe("Network error");
		});
	});

	describe("full deploy flow", () => {
		it("handles deploy_started → deploy_succeeded → deploy_finished lifecycle", () => {
			const newSettings: PersonaSettingsSummary = {
				agentPersona: "You are Hermes.",
				deployedServerHost: "1.2.3.4",
				deployedAt: "2026-06-06T16:00:00.000Z",
				updatedAt: "2026-06-06T16:00:00.000Z",
			};
			let state = baseState;

			state = personaSettingsUiReducer(state, { type: "deploy_started" });
			expect(state.isDeploying).toBe(true);

			state = personaSettingsUiReducer(state, {
				type: "deploy_succeeded",
				settings: newSettings,
				message: "Persona deployed to 1.2.3.4. Hermes is restarting...",
			});
			expect(state.savedSettings).toEqual(newSettings);
			expect(state.deployResult).toContain("1.2.3.4");

			state = personaSettingsUiReducer(state, { type: "deploy_finished" });
			expect(state.isDeploying).toBe(false);
		});

		it("handles deploy_started → deploy_failed → deploy_finished lifecycle", () => {
			let state = baseState;

			state = personaSettingsUiReducer(state, { type: "deploy_started" });
			state = personaSettingsUiReducer(state, {
				type: "deploy_failed",
				error: "SSH timeout",
			});
			expect(state.deployError).toBe("SSH timeout");

			state = personaSettingsUiReducer(state, { type: "deploy_finished" });
			expect(state.isDeploying).toBe(false);
			expect(state.deployError).toBe("SSH timeout");
		});
	});

	it("persona_changed clears stale save feedback before a new save attempt", () => {
		const state: PersonaSettingsUiState = {
			...baseState,
			saveSuccess: "Persona saved.",
		};

		let next = personaSettingsUiReducer(state, { type: "persona_changed" });
		expect(next.saveSuccess).toBeNull();

		next = personaSettingsUiReducer(next, { type: "save_started" });
		expect(next.isSaving).toBe(true);
		expect(next.saveSuccess).toBeNull();
	});
});
