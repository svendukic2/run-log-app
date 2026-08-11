// The weekly-goal slider bounds and fallback, shared by the profile and
// goal modules. Mirrors GOAL_MIN_KM / GOAL_MAX_KM / GOAL_DEFAULT_KM in
// frontend/src/lib/goal.ts; the API and the sliders must agree on the 0-60
// range (GOAL-2, A17) and on the 20 km fallback a brand-new account gets
// before it has set anything.
export const GOAL_MIN_KM = 0;
export const GOAL_MAX_KM = 60;
export const GOAL_FALLBACK_KM = 20;

// The ceiling for an applied week target, which deliberately exceeds
// GOAL_MAX_KM: the coach can suggest more than the sliders offer and the
// target must honour the number the runner accepted (frontend
// applyGoalTarget has the same asymmetry). It still needs SOME ceiling -
// without one, a large integer sails through validation and dies as a
// Postgres int4 overflow, a 500 on malformed input. 1000 km is far beyond
// any human week while leaving the coach unlimited headroom.
export const WEEK_TARGET_MAX_KM = 1000;
