// The map panel (PHASE5B_SPEC "The map panel"). aria-hidden — its
// accessible twin is the landmark strip rendered directly beneath it
// (same facts) plus allPositionsText. No engine mutation, no keyboard
// handling, no announcements. Mounted by audience.ts inside the Journey
// panel, above the strip, only when the journey declares `map` and a
// manifest was loaded; "none" style or a missing manifest renders nothing.
//
// Background sizing uses container-relative PERCENTAGES (not pixel
// values needing a resize listener), so the crop stays correct as the
// page scales: an oversized <img> of the full shared image is shifted
// and scaled by percentages of the journey's own viewport box, exactly
// the "sprite crop" technique. The overlay SVG's viewBox is that same
// box in the shared image's own pixel space, so route/landmark
// coordinates (computed once via project()) need no separate scaling.

import type { Journey } from "../content/schemas";
import type { TeamState } from "../engine/types";
import { project, viewportToViewBox, teamMapPosition, type MapManifest, type MapStyleId } from "./mapProjection";
import { renderTeamBadge } from "./teamBadge";

export interface MapViewOptions {
  journey: Journey;
  manifest: MapManifest | null;
}

export class MapView {
  constructor(private readonly options: MapViewOptions) {}

  /** Renders (or, if there's nothing to show, clears) the map panel. */
  render(container: HTMLElement, teams: readonly TeamState[], style: MapStyleId): void {
    container.innerHTML = "";
    const { journey, manifest } = this.options;
    if (!journey.map || !manifest || style === "none") return;

    const box = viewportToViewBox(journey.map.viewport, manifest);
    const mapEl = document.createElement("div");
    mapEl.className = "map";
    mapEl.setAttribute("aria-hidden", "true");
    mapEl.dataset.mapStyle = style;
    mapEl.style.aspectRatio = `${box.width} / ${box.height}`;

    const asset = manifest.styles[style === "satellite" ? "satellite" : "parchment"];
    const bg = document.createElement("img");
    bg.className = "map-bg";
    bg.alt = "";
    bg.src = `map/${asset.file}`;
    // Percentages of the container (= the viewport box), so the crop is
    // correct at any rendered size without recomputing on resize.
    bg.style.width = `${(manifest.width / box.width) * 100}%`;
    bg.style.height = `${(manifest.height / box.height) * 100}%`;
    bg.style.left = `${(-box.x / box.width) * 100}%`;
    bg.style.top = `${(-box.y / box.height) * 100}%`;
    mapEl.appendChild(bg);

    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("class", "map-overlay");
    svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
    svg.setAttribute("preserveAspectRatio", "none");

    const placed = journey.milestones.filter((m) => m.coordinates);
    if (placed.length > 0) {
      const points = placed.map((m) => project(m.coordinates!, manifest.bounds, manifest.width, manifest.height));
      const path = document.createElementNS(svgNs, "path");
      path.setAttribute("class", "route");
      path.setAttribute(
        "d",
        points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" "),
      );
      svg.appendChild(path);

      placed.forEach((m, i) => {
        const p = points[i]!;
        const g = document.createElementNS(svgNs, "g");
        g.setAttribute("class", "landmark");
        g.dataset.milestoneId = m.id;
        const circle = document.createElementNS(svgNs, "circle");
        circle.setAttribute("cx", String(p.x));
        circle.setAttribute("cy", String(p.y));
        circle.setAttribute("r", "10");
        const text = document.createElementNS(svgNs, "text");
        text.setAttribute("x", String(p.x));
        text.setAttribute("y", String(p.y - 16));
        text.textContent = m.name;
        g.append(circle, text);
        svg.appendChild(g);
      });
    }
    mapEl.appendChild(svg);

    const markers = document.createElement("div");
    markers.className = "map-markers";
    for (const team of teams) {
      const pos = teamMapPosition(team, journey, teams);
      if (!pos) continue;
      const marker = document.createElement("div");
      marker.className = "map-marker";
      marker.dataset.teamId = team.id;
      marker.style.setProperty("--x", `${pos.xPercent}%`);
      marker.style.setProperty("--y", `${pos.yPercent}%`);
      marker.appendChild(renderTeamBadge(team, "team-badge-small"));
      markers.appendChild(marker);
    }
    mapEl.appendChild(markers);

    container.appendChild(mapEl);
  }
}
