// @vitest-environment jsdom
// PHASE5_SPEC Group V3 — team identity: name + glyph + color, never color alone.

import { describe, expect, it } from "vitest";
import {
  SYMBOL_GLYPHS,
  renderTeamBadge,
  contrastRatio,
  contrastForeground,
  badgeAccessibleName,
  symbolInfo,
} from "../../src/ui/teamBadge";
import { TEAM_PRESETS } from "../../src/ui/setup";

describe("V3 — the 8 presets have 8 distinct glyphs", () => {
  it("every preset symbol maps to a unique glyph and word", () => {
    const glyphs = TEAM_PRESETS.map((p) => symbolInfo(p.symbol).glyph);
    const words = TEAM_PRESETS.map((p) => symbolInfo(p.symbol).word);
    expect(new Set(glyphs).size).toBe(8);
    expect(new Set(words).size).toBe(8);
    for (const p of TEAM_PRESETS) expect(SYMBOL_GLYPHS[p.symbol]).toBeDefined();
  });
});

describe("V3 — the accessible name carries name and symbol word, never a color", () => {
  it("aria-label is 'Team X, <symbol word>'", () => {
    const badge = renderTeamBadge({ name: "Lydia", color: "#c0392b", symbol: "lion" });
    expect(badge.getAttribute("aria-label")).toBe("Team Lydia, lion");
    expect(badge.getAttribute("aria-label")).not.toMatch(/#|c0392b|red/i);
    expect(badgeAccessibleName({ name: "Lydia", color: "#000", symbol: "olive-branch" })).toBe(
      "Team Lydia, olive branch",
    );
  });

  it("the glyph is decorative and the name is visible text", () => {
    const badge = renderTeamBadge({ name: "Lydia", color: "#2980b9", symbol: "dove" });
    expect(badge.querySelector(".team-badge-glyph")!.getAttribute("aria-hidden")).toBe("true");
    expect(badge.querySelector(".team-badge-name")!.textContent).toBe("Lydia");
    expect(badge.style.getPropertyValue("--team-color")).toBe("#2980b9");
  });
});

describe("V3 — badge text contrasts with every preset color", () => {
  it("chosen foreground vs preset background is at least 4.5:1", () => {
    for (const p of TEAM_PRESETS) {
      const fg = contrastForeground(p.color);
      expect(contrastRatio(p.color, fg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("contrastRatio is symmetric and black/white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });
});

describe("V3 — an unknown symbol id renders the fallback glyph", () => {
  it("never an empty badge", () => {
    const badge = renderTeamBadge({ name: "Alpha", color: "#333", symbol: "no-such-symbol" });
    expect(badge.querySelector(".team-badge-glyph")!.textContent).toBe("●");
    expect(badge.getAttribute("aria-label")).toBe("Team Alpha, marker");
  });
});
