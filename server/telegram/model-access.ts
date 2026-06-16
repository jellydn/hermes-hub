// Barrel: re-exports from the model-access/ modules.
// Split from a 448-line file into focused modules by concern (June 2026).

export { getModelAccessOptions } from "./model-access/queries";
export {
	findActiveOptionIds,
	parseOptionId,
	resolveSwitchOption,
} from "./model-access/resolvers";
export type { ActiveOptionIds, ResolvedOption } from "./model-access/types";
