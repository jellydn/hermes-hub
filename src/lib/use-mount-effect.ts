import type { EffectCallback } from "react";
import { useEffect } from "react";

export function useMountEffect(effect: EffectCallback) {
	/* eslint-disable no-restricted-syntax */
	// biome-ignore lint/correctness/useExhaustiveDependencies: this helper is the explicit mount-only escape hatch for stable external subscriptions.
	useEffect(effect, []);
}
