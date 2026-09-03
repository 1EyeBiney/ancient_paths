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

  // Phase 7 (§7.6, §10-12, §36; PHASE7_SPEC.md).
  catchUp: {
    enabled: true, // setup's "Community catch-up" toggle overrides this per session
    stagesBehind: 2, // eligible when strictly MORE than this many entries behind the leader
    bonus: { resource: "choice" as const, amount: 1 },
  },
  community: {
    exceptionalShare: 0.5, // a single team's pledge share of the threshold …
    exceptionalMinimum: 2, // … and at least this many units, counts as "exceptional"
    maxPledgePerTeam: 3, // the UI offers 1..min(owned, this) per accepted resource
  },
} as const;

export type GameDefaults = typeof DEFAULTS;
