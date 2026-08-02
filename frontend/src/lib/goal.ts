// Weekly goal range shown on the slider scale (0 / 30 / 60 km).
export const GOAL_MIN_KM = 0;
export const GOAL_MAX_KM = 60;
export const GOAL_DEFAULT_KM = 20;

export function clampGoal(value: number): number {
  return Math.min(GOAL_MAX_KM, Math.max(GOAL_MIN_KM, value));
}
