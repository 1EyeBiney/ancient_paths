// Weighted offering draw (§10, §36 offeringWeights). Pure function, isolated
// from the engine so it can be statistically tested cheaply (many draws)
// without constructing full game sessions.

import type { Rng } from "./rng";
import { pickOne } from "./rng";
import type { GameDefaults } from "../config/defaults";

export interface OfferingOutcomeLike {
  id: string;
  category: "beneficial" | "community" | "humorous" | "neutral";
}

const CATEGORY_ORDER = ["beneficial", "community", "humorous", "neutral"] as const;

/**
 * Draws one outcome from the pool: first picks a category by weight, then
 * an outcome uniformly within that category. Every outcome in `pool` must
 * belong to one of the four weighted categories (validated by the journey
 * schema, which requires every category to have at least one outcome).
 */
export function drawOfferingOutcome<T extends OfferingOutcomeLike>(
  rng: Rng,
  weights: GameDefaults["offeringWeights"],
  pool: readonly T[],
): T {
  const total = CATEGORY_ORDER.reduce((sum, c) => sum + weights[c], 0);
  let roll = rng.next() * total;
  let chosenCategory: (typeof CATEGORY_ORDER)[number] = "neutral";
  for (const category of CATEGORY_ORDER) {
    roll -= weights[category];
    if (roll < 0) {
      chosenCategory = category;
      break;
    }
  }
  const inCategory = pool.filter((o) => o.category === chosenCategory);
  if (inCategory.length === 0) {
    // Should not happen given schema validation, but never crash the game
    // over a content gap — fall back to the whole pool.
    return pickOne(rng, pool);
  }
  return pickOne(rng, inCategory);
}
