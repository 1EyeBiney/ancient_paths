# PHASE5B_SPEC — The Map

Binding contract for the map phase Brian chose (CLAUDE.md decision 9,
OPEN_QUESTIONS item 17). Numbered 5B because it sits between design doc
§34's Phase 5 (done) and Phase 6 (audio). Read CLAUDE.md's agent rules
first. This spec outranks improvisation; where it is silent,
ACCESSIBILITY_PATTERNS.md governs, then design doc §24. Do not modify:
the design doc, `src/engine/`, `src/session/`, `src/content/schemas.ts`
(the map fields are ALREADY there — Fable added them with this spec),
`dev-sample.json`, `jerusalem-rome.json` (its coordinates and viewport
are already authored), or any PHASE*_SPEC.md. If blocked, write the
problem to OPEN_QUESTIONS.md and continue with another group.

Prerequisites (all true today): Phases 2-5 green, 266 tests passing, the
site deploys to GitHub Pages on every push to `main` (decision 10) —
so every green group Sonnet pushes is live for Brian within minutes.

## Objective

A real map on the audience view: public-domain imagery of the eastern
Mediterranean, the journey's route drawn across it through its
landmarks, and each team's badge moving along that route as the team
progresses — the "video game, not decorated text" feel — with a host-
selectable background (satellite or parchment), running comfortably on
a six-year-old laptop, and adding nothing a screen-reader user lacks
(the Phase 5 landmark strip and spoken positions remain the text layer;
the map is `aria-hidden` and purely the sighted twin).

## What the schema already provides (do not change it)

- `journey.map.viewport` = `{ north, south, east, west }` in degrees
  (validated: north > south, east > west).
- `milestone.coordinates` = `{ lat, lon }`. Optional in general, but a
  journey that declares `map` must give every milestone coordinates
  inside its viewport (validated; see `tests/content.test.ts`).
- `jerusalem-rome.json` declares viewport N44/S30/E38/W11 and real
  coordinates for Jerusalem, Caesarea, Antioch, Rome.
- Journeys without `map` simply get no map (the strip alone) — never an
  error at render time.

## Architecture (new files)

- `src/ui/mapProjection.ts` — pure math. `MapManifest` type;
  `project({lat,lon}, bounds, width, height)` → `{x,y}` (equirectangular:
  x = (lon-west)/(east-west)·W, y = (north-lat)/(north-south)·H);
  `viewportToViewBox(viewport, manifest)` → the SVG `viewBox` string /
  CSS `object-position` numbers that show only the journey's window of
  the shared image; `legStageCounts(journey)`; `teamMapPosition(team,
  journey)` (below). No DOM.
- `src/ui/mapView.ts` — `MapView`: renders the map panel into a container
  given `{ journey, manifest, style }`; `update(engine)` moves markers.
- `src/ui/audience.ts` — mounts `MapView` in the Journey panel ABOVE the
  landmark strip when the journey has `map` and a manifest loaded.
- `src/ui/setup.ts` / `app.ts` — a "Map style" choice (satellite /
  parchment / none), default satellite; stored on the wizard and passed
  through; the App loads `public/map/mediterranean.json` at boot (via
  `fetchJson`, alongside content) and hands the manifest to the audience
  view; absence of the manifest = no map, no error.
- `scripts/make-map.mjs` — the one-time asset pipeline (below).
- `public/map/mediterranean.json` (manifest), `mediterranean-satellite.jpg`,
  `mediterranean-parchment.svg`, `CREDITS.md` — all committed.
- Tests under `tests/ui/` (`group-m*.test.ts`).

## The shared imagery set (Decision A)

ONE set covers every journey (present and future): bounds **west 9°E,
east 42°E, south 29°N, north 46.5°N** — Rome to the Levant, Malta to the
Black Sea coast, the Egyptian shore. Equirectangular (plate carrée), so
the projection is two linear maps and both backgrounds share one
coordinate space. Manifest:

```json
{ "id": "mediterranean", "bounds": { "north": 46.5, "south": 29, "east": 42, "west": 9 },
  "width": 2048, "height": 1086,
  "styles": { "satellite": "mediterranean-satellite.jpg", "parchment": "mediterranean-parchment.svg" },
  "credits": "CREDITS.md" }
```

Budget (hardware baseline): the JPEG ≤ 700 KB at 2048×1086, quality
~80; the SVG ≤ 400 KB after simplification. Nothing streams at play
time; both files ship with the site.

## Asset pipeline: `scripts/make-map.mjs` (Node, no dependencies)

Fetch-and-write only — no local image processing library:

1. **Satellite**: one NASA GIBS WMS request returns the crop at the
   exact size, already projected in EPSG:4326 — no download-and-crop:
   `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_ShadedRelief_Bathymetry&CRS=EPSG:4326&BBOX=29,9,46.5,42&WIDTH=2048&HEIGHT=1086&FORMAT=image/jpeg`
   (WMS 1.3.0 + EPSG:4326 means BBOX is lat-first: south,west,north,east).
   Blue Marble is NASA public-domain imagery. If the service refuses the
   size, halve it and note the change in the manifest.
2. **Parchment**: download Natural Earth (public domain) land polygons as
   GeoJSON — `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson`
   — clip to the bounds, project with the same formula, simplify
   (Douglas-Peucker, tolerance ≈ 1.5 px), and write an SVG of
   `width×height` with a parchment-toned background (#e9dcc0 family),
   land in a warmer tone, and a thin darker coastline stroke. Pure JS.
3. Write the manifest and `CREDITS.md` ("Imagery: NASA Blue Marble via
   GIBS (public domain). Coastlines: Natural Earth (public domain).").
4. **Offline fallback (binding):** if either fetch fails, write a
   placeholder for that style — a gradient SVG for satellite, a plain
   parchment-toned SVG with no land for parchment — still at the right
   size, set `"placeholder": true` on that style in the manifest, print a
   loud warning, and record it in OPEN_QUESTIONS.md. The overlay, tests,
   and game must work identically over placeholders; only the picture is
   worse.

Run it once, commit its outputs, keep it re-runnable (`node
scripts/make-map.mjs`). Deterministic apart from the upstream bytes.

## The map panel (`MapView`)

DOM, inside the Journey panel, before the strip:

```
<div class="map" aria-hidden="true" data-map-style="satellite" style="aspect-ratio: W/H">
  <img class="map-bg" src=... alt="">       (or an <img> of the SVG)
  <svg class="map-overlay" viewBox="...">   route + landmarks
    <path class="route" d="M x1 y1 L x2 y2 …"/>
    <g class="landmark" data-milestone-id> <circle/> <text>Name</text> </g>…
  </svg>
  <div class="map-markers">                  team badges, absolutely positioned
    <div class="map-marker" data-team-id style="--x: 41.2%; --y: 63.0%"> <badge/> </div>…
  </div>
</div>
```

- The whole map is `aria-hidden="true"`: its accessible twin is the
  landmark strip directly beneath it (same facts) plus `allPositionsText`.
- **Viewport**: the background is shown through the journey's viewport
  only — `viewportToViewBox` yields the overlay `viewBox` and the
  background's crop (`object-fit: none` + `object-position`, or an SVG
  `<image>` with the same viewBox — implementer's choice, tested by the
  projected numbers, not the CSS).
- **Route**: milestones in `journey.milestones` order (binding authoring
  rule, already true of the sample: the array IS travel order) joined by
  a polyline; labels in a TV-legible size; landmark circles.
- **Team marker position** (`teamMapPosition`): at the team's
  `currentMilestoneId`; if `stagesBeyondMilestone > 0`, interpolated
  toward the NEXT milestone by `min(0.9, stagesBeyond / legStageCount)`,
  where `legStageCount` = number of top-level entries between the stage
  arriving at this milestone and the one arriving at the next (a fork
  counts as one). Several teams on the same point are fanned by a small
  fixed offset (index × 6% of badge size) so badges never fully overlap.
  Positions are percentages of the viewport box, so the map scales with
  the page.
- **Animation**: markers move by CSS `transition: transform var(--motion)`
  (translate to `--x/--y`), so a stage completion visibly glides the
  badge along the route; under `[data-reduced-motion="true"]` there is no
  transition — the badge jumps. No JS animation loop, nothing that
  delays input (§24).
- **Style switch**: `data-map-style` selects which background is shown;
  "none" hides the map entirely (strip only). Changing it never touches
  markers or the route.

## Setup

A "Map style" cursor list (satellite / parchment / none) after
"Difficulty"; `SetupWizard.mapStyle` (default "satellite"); reaches the
App and the audience view. Also shown on the setup review line list.

## Styles

`styles.css` gains the map block: `.map` positioned container with
`aspect-ratio`, background image sizing, route stroke (accent color,
2-3 px at 2048 scale, with a lighter halo for legibility on satellite),
landmark labels with a text halo, marker transition, and the parchment
variant's warmer route color. No new tokens beyond `--map-route` and
`--map-halo`.

## Test list (implement in order; files under tests/ui/)

Group M1 — projection math (no DOM): `project()` maps the bounds' corners
to (0,0)/(W,H) and Jerusalem to the expected pixel within ±1; `viewportTo
ViewBox()` for the sample viewport yields the sub-rectangle of the 2048×
1086 image (numbers pinned); `legStageCounts(testJourney)` matches its
structure (s1 → 1 leg of… document the expected numbers); `teamMapPosition`
puts a team at its milestone, interpolates with stagesBeyond, caps at 0.9,
and fans co-located teams.

Group M2 — manifest and assets: `public/map/mediterranean.json` validates
against a zod manifest schema defined in `mapProjection.ts`; both style
files exist and are under budget (read sizes); `CREDITS.md` names NASA
and Natural Earth; the parchment SVG's `viewBox` equals the manifest
size; the script is importable and exposes its bounds constant equal to
the manifest's.

Group M3 — MapView rendering: with the sample journey + manifest, the map
is `aria-hidden`, has one landmark group per milestone in journey order,
a route path with one point per milestone, and one marker per team; the
markers' `--x/--y` equal `teamMapPosition` percentages; a journey WITHOUT
`map` renders no `.map` at all and the strip is unchanged; style "none"
renders no `.map`.

Group M4 — synchronization: drive the U10/V2 keyboard script against the
REAL `jerusalem-rome.json` + dev-playtest (as V8 does) and after every
step assert each marker's position equals `teamMapPosition(team)` for the
engine's current team state, and that the `.map` and the strip agree on
which milestone each team is at.

Group M5 — motion and style: markers carry the transition class only
when `data-reduced-motion="false"` (CSS read from disk, as V7 does);
switching Map style in setup changes `data-map-style` and "none" removes
the map; the setup review lines include the map style.

Group M6 — browser check (manual, by Sonnet, recorded): play several
stages on `npm run dev`; confirm the badge glides along the route on
stage completion, the parchment style switches, reduced motion jumps,
and nothing regresses in the strip/speech. Record results and any
placeholder fallback in OPEN_QUESTIONS.md.

## Definition of done

All M-groups green alongside the existing tests; `npx tsc --noEmit`
and `npm run build` clean; assets committed with the script that made
them and `CREDITS.md`; OPEN_QUESTIONS.md updated with the browser-check
results, any placeholder fallback, and any discrepancy found (never
silently fixed); IMPLEMENTATION_STATUS.md moves Phase 5B to Completed,
styled like Phases 2-5; KEYBOARD_COMMANDS.md unchanged (no new keys);
no forbidden files modified; committed per green group and pushed (each
push deploys — Brian will look at the live site).
