import type { EffectCallback } from "react";
import { useEffect } from "react";

export function useMountEffect(effect: EffectCallback) {
	/* eslint-disable no-restricted-syntax */
	// react-doctor-disable-next-line react-doctor/exhaustive-deps
	useEffect(effect, []);
}
