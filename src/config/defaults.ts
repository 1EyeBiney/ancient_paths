// Configurable defaults from design doc §36. These are defaults, not
// hard-coded limits: the engine reads this object (later merged with
// per-session setup choices), never scatters magic numbers through code.

export const DEFAULTS = {
  resourceCap: 5,
  journeyTokenCap: 1,
  standardDurationMinutes: 55,
  tasksPerTurn: {
    "2Teams": 4,
    "3To5Teams": 3,
    "6To8Teams": 2,
  },
  teachingRevealTargetSeconds: 15,
  locationIntroductionTargetSeconds: 25,
  offeringWeights: {
    beneficial: 60,
    community: 20,
    humorous: 15,
    neutral: 5,
  },
  serviceAwards: {
    offerSurplus: 1,
    donateResource: 1,
    chooseCommunityBenefit: 1,
    exceptionalCommunityContribution: 2,
  },
  // Public name of the Service recognition (design doc §6.3): configurable.
  serviceAwardPublicName: "Barnabas Award",

  // Phase 2 engine costs the design doc leaves unspecified as flat numbers.
  // Centralized here rather than hard-coded in the engine (§27.6 spirit).
  insightEffectCost: 1, // extra-clue / eliminate-option / replay, per use
  recoverCostProvision: 1, // Provision "recover" after an incorrect ruling
} as const;

export type GameDefaults = typeof DEFAULTS;
