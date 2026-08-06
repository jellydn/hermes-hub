// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { useReducer } from "react";
import { describe, expect, it } from "vitest";

import { useStaleRef } from "./use-stale-ref";

describe("useStaleRef", () => {
	it("always points at the latest committed state", () => {
		const { result } = renderHook(() => {
			const [state, dispatch] = useReducer(
				(state: number, amount: number) => state + amount,
				0,
			);
			const ref = useStaleRef(state);
			return { state, ref, dispatch };
		});

		expect(result.current.ref.current).toBe(0);

		act(() => {
			result.current.dispatch(5);
		});

		// After the next committed render the ref reflects the new state, so an
		// async handler started earlier never reads a captured stale value.
		expect(result.current.ref.current).toBe(5);
	});
});
