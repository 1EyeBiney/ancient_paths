#!/usr/bin/env node
// Generates the shared map imagery (PHASE5B_SPEC "Asset pipeline"):
// public/map/mediterranean.json (manifest), mediterranean-satellite.jpg
// (NASA Blue Marble via one GIBS WMS request), mediterranean-parchment.svg
// (Natural Earth coastlines, clipped/simplified/projected in pure JS), and
// CREDITS.md. Node, no dependencies. Deterministic apart from the
// upstream bytes. Re-runnable: node scripts/make-map.mjs
//
// The projection here is intentionally a small, self-contained copy of
// src/ui/mapProjection.ts's project() (this is a plain .mjs script with
// no build step, so it cannot import the TypeScript source) — same
// formula, kept in sync by hand; a Group M2 test checks this script's
// exported BOUNDS against the committed manifest.

import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const BOUNDS = { north: 46.5, south: 29, east: 42, west: 9 };
export const WIDTH = 2048;
export const HEIGHT = 1086;
const OUT_DIR = resolve("public/map");
const SATELLITE_BUDGET_BYTES = 700 * 1024;
const PARCHMENT_BUDGET_BYTES = 400 * 1024;

function project(lat, lon) {
  const x = ((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * WIDTH;
  const y = ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * HEIGHT;
  return [x, y];
}

// -- satellite: one GIBS WMS request, already cropped and projected -----

async function fetchSatellite() {
  const bbox = `${BOUNDS.south},${BOUNDS.west},${BOUNDS.north},${BOUNDS.east}`; // WMS 1.3.0 EPSG:4326 is lat-first
  const url =
    `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=BlueMarble_ShadedRelief_Bathymetry&CRS=EPSG:4326&BBOX=${bbox}&WIDTH=${WIDTH}&HEIGHT=${HEIGHT}&FORMAT=image/jpeg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIBS HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("image/jpeg")) throw new Error(`GIBS returned "${contentType}", not a JPEG`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10_000) throw new Error(`GIBS response suspiciously small (${buf.length} bytes)`);
  if (buf.length > SATELLITE_BUDGET_BYTES) {
    console.warn(`WARNING: satellite JPEG is ${buf.length} bytes, over the ${SATELLITE_BUDGET_BYTES}-byte budget.`);
  }
  writeFileSync(resolve(OUT_DIR, "mediterranean-satellite.jpg"), buf);
  return { file: "mediterranean-satellite.jpg" };
}

function placeholderSatellite() {
  // A gradient SVG standing in for the real photo (PHASE5B_SPEC "Asset
  // pipeline" step 4). Named .svg — never mislabel a placeholder as a
  // real .jpg.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#2a4a6b"/><stop offset="1" stop-color="#7ea6b8"/>` +
    `</linearGradient></defs>` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/></svg>`;
  writeFileSync(resolve(OUT_DIR, "mediterranean-satellite-placeholder.svg"), svg);
  console.warn("WARNING: wrote a placeholder for the satellite style (network fetch failed).");
  return { file: "mediterranean-satellite-placeholder.svg", placeholder: true };
}

// -- parchment: Natural Earth land, clipped + simplified + projected ----

function clipRing(points, bounds) {
  const inside = {
    west: (p) => p[0] >= bounds.west,
    east: (p) => p[0] <= bounds.east,
    north: (p) => p[1] <= bounds.north,
    south: (p) => p[1] >= bounds.south,
  };
  const intersect = {
    west: (a, b) => lerpX(a, b, bounds.west),
    east: (a, b) => lerpX(a, b, bounds.east),
    north: (a, b) => lerpY(a, b, bounds.north),
    south: (a, b) => lerpY(a, b, bounds.south),
  };
  function lerpX(a, b, x) {
    const t = (x - a[0]) / (b[0] - a[0]);
    return [x, a[1] + t * (b[1] - a[1])];
  }
  function lerpY(a, b, y) {
    const t = (y - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), y];
  }
  function clipEdge(pts, edge) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i];
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const currIn = inside[edge](curr);
      const prevIn = inside[edge](prev);
      if (currIn) {
        if (!prevIn) out.push(intersect[edge](prev, curr));
        out.push(curr);
      } else if (prevIn) {
        out.push(intersect[edge](prev, curr));
      }
    }
    return out;
  }
  let pts = points;
  for (const edge of ["west", "east", "north", "south"]) pts = clipEdge(pts, edge);
  return pts;
}

function perpendicularDistance(pt, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
  const t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq;
  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  return Math.hypot(pt[0] - px, pt[1] - py);
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > tolerance) {
    const left = simplify(points.slice(0, index + 1), tolerance);
    const right = simplify(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

function ringsFromGeometry(geometry) {
    // Exterior rings only (first ring of each polygon) — a reasonable
    // simplification for a decorative background map, not a navigational
    // chart; interior rings (lake holes etc.) are dropped.
  if (geometry.type === "Polygon") return [geometry.coordinates[0]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map((poly) => poly[0]);
  return [];
}

async function fetchParchment() {
  const url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Natural Earth HTTP ${res.status}`);
  const geojson = await res.json();
  if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error("Natural Earth response is not a FeatureCollection");
  }

  let tolerance = 1.5;
  let svg = buildParchmentSvg(geojson, tolerance);
  // If still over budget after simplifying harder a few times, accept the
  // last result and let the budget check below just warn.
  for (let i = 0; i < 4 && Buffer.byteLength(svg, "utf8") > PARCHMENT_BUDGET_BYTES; i++) {
    tolerance *= 2;
    svg = buildParchmentSvg(geojson, tolerance);
  }
  if (Buffer.byteLength(svg, "utf8") > PARCHMENT_BUDGET_BYTES) {
    console.warn(`WARNING: parchment SVG is ${Buffer.byteLength(svg, "utf8")} bytes, over the ${PARCHMENT_BUDGET_BYTES}-byte budget even after simplification.`);
  }
  writeFileSync(resolve(OUT_DIR, "mediterranean-parchment.svg"), svg);
  return { file: "mediterranean-parchment.svg" };
}

function buildParchmentSvg(geojson, tolerance) {
  const paths = [];
  for (const feature of geojson.features) {
    for (const ring of ringsFromGeometry(feature.geometry)) {
      const clipped = clipRing(ring, BOUNDS);
      if (clipped.length < 3) continue;
      const projected = clipped.map(([lon, lat]) => project(lat, lon));
      const simplified = simplify(projected, tolerance);
      if (simplified.length < 3) continue;
      const d = simplified.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";
      paths.push(d);
    }
  }
  const landPath = `<path d="${paths.join(" ")}" fill="#c9a97a" stroke="#8a6f4c" stroke-width="1.5"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#e9dcc0"/>` +
    landPath +
    `</svg>`
  );
}

function placeholderParchment() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#e9dcc0"/></svg>`;
  writeFileSync(resolve(OUT_DIR, "mediterranean-parchment.svg"), svg);
  console.warn("WARNING: wrote a placeholder for the parchment style (network fetch failed).");
  return { file: "mediterranean-parchment.svg", placeholder: true };
}

// -- main ------------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  let satellite;
  try {
    satellite = await fetchSatellite();
  } catch (err) {
    console.warn(`WARNING: satellite fetch failed: ${err.message}`);
    satellite = placeholderSatellite();
  }

  let parchment;
  try {
    parchment = await fetchParchment();
  } catch (err) {
    console.warn(`WARNING: parchment fetch failed: ${err.message}`);
    parchment = placeholderParchment();
  }

  const manifest = {
    id: "mediterranean",
    bounds: BOUNDS,
    width: WIDTH,
    height: HEIGHT,
    styles: { satellite, parchment },
    credits: "CREDITS.md",
  };
  writeFileSync(resolve(OUT_DIR, "mediterranean.json"), JSON.stringify(manifest, null, 2) + "\n");

  const credits =
    "# Map imagery credits\n\n" +
    "- Satellite: NASA Blue Marble (Shaded Relief + Bathymetry), served via " +
    "NASA GIBS (https://earthdata.nasa.gov/gibs). Public domain.\n" +
    "- Coastlines (parchment style): Natural Earth " +
    "(https://www.naturalearthdata.com), 1:50m Land. Public domain — " +
    '"No permission is needed to use Natural Earth."\n' +
    "- Generated by scripts/make-map.mjs. Re-run it to refresh either file.\n";
  writeFileSync(resolve(OUT_DIR, "CREDITS.md"), credits);

  for (const [name, info] of Object.entries(manifest.styles)) {
    const size = statSync(resolve(OUT_DIR, info.file)).size;
    console.log(`${name}: ${info.file} (${size} bytes)${info.placeholder ? " [PLACEHOLDER]" : ""}`);
  }
  console.log(`wrote ${resolve(OUT_DIR, "mediterranean.json")}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith("make-map.mjs");
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
