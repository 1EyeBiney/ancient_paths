// PHASE10_SPEC Group X1 — team policies and the success model. Pure data
// and pure functions; no engine/DOM dependency. The simulator (simulate.ts)
// consumes these to decide what a simulated team does at each decision
// point, and how likely a ruling is to come back "correct".

import type { Task } from "../content/schemas";

export type RoutePolicy = "first" | "cheapest" | "random";
export type WindowPolicy = "passive" | "cautious" | "bold" | "mixed";
export type RecoverPolicy = "always" | "never";
export type SurplusPolicy = "keepLeast" | "offer" | "alternate";
export type ContributionPolicy = "generous" | "hoarder";
export type GrantedChoicePolicy = "least" | "sharer";
export type JourneyTokenPolicy = "useOnHard" | "hold";

export interface TeamPolicy {
  /** Report-facing name — the report and tests always refer to a preset by
   * name, never by dumping the raw object (PHASE10_SPEC X1). */
  name: string;
  route: RoutePolicy;
  window: WindowPolicy;
  recover: RecoverPolicy;
  surplus: SurplusPolicy;
  contribution: ContributionPolicy;
  grantedChoice: GrantedChoicePolicy;
  journeyToken: JourneyTokenPolicy;
}

export const PASSIVE: TeamPolicy = {
  name: "PASSIVE",
  route: "first",
  window: "passive",
  recover: "never",
  surplus: "keepLeast",
  contribution: "hoarder",
  grantedChoice: "least",
  journeyToken: "hold",
};

export const CAUTIOUS: TeamPolicy = {
  name: "CAUTIOUS",
  route: "first",
  window: "cautious",
  recover: "always",
  surplus: "keepLeast",
  contribution: "hoarder",
  grantedChoice: "least",
  journeyToken: "hold",
};

export const BOLD: TeamPolicy = {
  name: "BOLD",
  route: "first",
  window: "bold",
  recover: "always",
  surplus: "keepLeast",
  contribution: "hoarder",
  grantedChoice: "least",
  journeyToken: "useOnHard",
};

// GENEROUS = cautious + offer + generous + sharer (PHASE10_SPEC X1).
export const GENEROUS: TeamPolicy = {
  ...CAUTIOUS,
  name: "GENEROUS",
  surplus: "offer",
  contribution: "generous",
  grantedChoice: "sharer",
};

// HOARDER = bold + keepLeast + hoarder + least (PHASE10_SPEC X1).
export const HOARDER: TeamPolicy = {
  ...BOLD,
  name: "HOARDER",
  surplus: "keepLeast",
  contribution: "hoarder",
  grantedChoice: "least",
};

export const PRESETS = { PASSIVE, CAUTIOUS, BOLD, GENEROUS, HOARDER } as const;
export type PresetName = keyof typeof PRESETS;

// ---------------------------------------------------------------------------
// Success model (PHASE10_SPEC X1). A documented parameter set, not a claim
// about real players — Brian's playtest timings calibrate estimator.ts
// separately (item 11's ruling: constants wait for real data).
// ---------------------------------------------------------------------------

export type Difficulty = Task["difficulty"];
export type VariantKind = "normal" | "assisted" | "amplified";

export interface SuccessModel {
  base: Record<Difficulty, number>;
  assistedMultiplier: number;
  assistedCap: number;
  amplifiedMultiplier: number;
  clueBonus: number;
  eliminateBonus: number;
  skipChance: number;
}

export const DEFAULT_SUCCESS_MODEL: SuccessModel = {
  base: { easy: 0.85, moderate: 0.65, hard: 0.45 },
  assistedMultiplier: 1.25,
  assistedCap: 0.95,
  amplifiedMultiplier: 0.8,
  clueBonus: 0.1,
  eliminateBonus: 0.1,
  skipChance: 0.02,
};

/** The standard-mix (30/50/20) weighted average of the base rates —
 * PHASE10_SPEC X1 asks the report to state this beside the estimator's
 * 0.65 successRate constant. */
export function weightedStandardMixRate(model: SuccessModel): number {
  return 0.3 * model.base.easy + 0.5 * model.base.moderate + 0.2 * model.base.hard;
}

export function computeSuccessProbability(
  model: SuccessModel,
  difficulty: Difficulty,
  variantKind: VariantKind,
  clueUsed: boolean,
  eliminateUsed: boolean,
): number {
  let p = model.base[difficulty];
  if (variantKind === "assisted") p = Math.min(model.assistedCap, p * model.assistedMultiplier);
  else if (variantKind === "amplified") p = p * model.amplifiedMultiplier;
  if (clueUsed) p += model.clueBonus;
  if (eliminateUsed) p += model.eliminateBonus;
  return Math.min(1, Math.max(0, p));
}
