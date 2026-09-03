// Team identity badges (PHASE5_SPEC "Team identity"; design doc §24: a
// name, a color, AND a distinct symbol — never color alone). The glyph is
// decorative for assistive tech; the accessible name carries the team
// name and the symbol's WORD, never a color value.

export interface TeamIdentity {
  name: string;
  color: string;
  symbol: string;
}

interface SymbolInfo {
  glyph: string;
  word: string;
}

export const SYMBOL_GLYPHS: Record<string, SymbolInfo> = {
  cross: { glyph: "✝", word: "cross" },
  lion: { glyph: "🦁", word: "lion" },
  dove: { glyph: "🕊", word: "dove" },
  anchor: { glyph: "⚓", word: "anchor" },
  star: { glyph: "★", word: "star" },
  shield: { glyph: "🛡", word: "shield" },
  "olive-branch": { glyph: "🌿", word: "olive branch" },
  crown: { glyph: "👑", word: "crown" },
};

const FALLBACK_SYMBOL: SymbolInfo = { glyph: "●", word: "marker" };

export function symbolInfo(symbolId: string): SymbolInfo {
  return SYMBOL_GLYPHS[symbolId] ?? FALLBACK_SYMBOL;
}

// -- color math (WCAG relative luminance / contrast ratio) --------------

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

export const BADGE_LIGHT_TEXT = "#ffffff";
export const BADGE_DARK_TEXT = "#111111";

/** Whichever of black/white text contrasts more with the team color. */
export function contrastForeground(color: string): string {
  return contrastRatio(color, BADGE_DARK_TEXT) >= contrastRatio(color, BADGE_LIGHT_TEXT)
    ? BADGE_DARK_TEXT
    : BADGE_LIGHT_TEXT;
}

export function badgeAccessibleName(team: TeamIdentity): string {
  return `Team ${team.name}, ${symbolInfo(team.symbol).word}`;
}

export function renderTeamBadge(team: TeamIdentity, extraClass = ""): HTMLElement {
  const info = symbolInfo(team.symbol);
  const badge = document.createElement("span");
  badge.className = `team-badge${extraClass ? " " + extraClass : ""}`;
  badge.style.setProperty("--team-color", team.color);
  badge.style.setProperty("--team-foreground", contrastForeground(team.color));
  badge.setAttribute("aria-label", badgeAccessibleName(team));
  badge.dataset.symbol = team.symbol;

  const glyph = document.createElement("span");
  glyph.className = "team-badge-glyph";
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = info.glyph;

  const name = document.createElement("span");
  name.className = "team-badge-name";
  name.textContent = team.name;

  badge.append(glyph, name);
  return badge;
}
