import { useRef } from "react";

/**
 * Returns a ref that always points at the latest committed value of `state`.
 * Useful when an async handler captures `state` in a closure but must read
 * the *latest* state at the moment it executes, not the state at dispatch
 * time. Common case: useReducer handlers started by user action.
 */
export function useStaleRef<T>(state: T) {
	const ref = useRef(state);
	ref.current = state;
	return ref;
}
