/**
 * Deterministic, zero-API editorial 16:9 SVG hero cover generator.
 *
 * Pure geometric vector art in the site's dark-navy (#070b12) + teal (#5eead4) palette with
 * ZERO text (avoiding font/glyph issues across 7 scripts). Each (locale, slug, kind) produces
 * a unique, repeatable geometric composition (~1.5 KB) so no article is ever blocked waiting
 * for an external image worker.
 */

function fnv1a(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const PALETTES = {
  hardware: ["#5eead4", "#0ea5e9", "#1e3a5f"],
  compare: ["#38bdf8", "#5eead4", "#1d4ed8"],
  troubleshoot: ["#f59e0b", "#5eead4", "#334155"],
  task: ["#2dd4bf", "#818cf8", "#1e293b"],
  concept: ["#5eead4", "#a78bfa", "#1e293b"],
  local: ["#34d399", "#38bdf8", "#1e3a5f"],
  radar: ["#22d3ee", "#f472b6", "#1e293b"],
  release: ["#5eead4", "#60a5fa", "#172554"],
};

export function renderCoverSvg({ slug, locale = "en", kind = "concept" }) {
  const seed = fnv1a(`${locale}:${kind}:${slug}`);
  const rand = makeRng(seed);
  const [c1, c2, c3] = PALETTES[kind] ?? PALETTES.concept;

  const gx = Math.round(200 + rand() * 620);
  const gy = Math.round(120 + rand() * 340);
  const gx2 = Math.round(160 + rand() * 700);
  const gy2 = Math.round(100 + rand() * 380);

  const shapes = [];

  // Subtle architectural grid
  for (let x = 64; x < 1024; x += 64) {
    shapes.push(`<line x1="${x}" y1="0" x2="${x}" y2="576" stroke="#1e2a3d" stroke-opacity="0.45" stroke-width="1"/>`);
  }
  for (let y = 64; y < 576; y += 64) {
    shapes.push(`<line x1="0" y1="${y}" x2="1024" y2="${y}" stroke="#1e2a3d" stroke-opacity="0.45" stroke-width="1"/>`);
  }

  if (kind === "compare") {
    // Twin balanced geometric columns + bridge arcs
    const split = Math.round(480 + rand() * 64);
    shapes.push(`<rect x="120" y="108" width="${split - 150}" height="360" rx="22" fill="${c3}" fill-opacity="0.35" stroke="${c1}" stroke-opacity="0.45" stroke-width="2"/>`);
    shapes.push(`<rect x="${split + 30}" y="108" width="${904 - split - 30}" height="360" rx="22" fill="${c3}" fill-opacity="0.35" stroke="${c2}" stroke-opacity="0.45" stroke-width="2"/>`);
    for (let i = 0; i < 4; i++) {
      const y = 165 + i * 70;
      const w1 = Math.round(90 + rand() * 180);
      const w2 = Math.round(90 + rand() * 180);
      shapes.push(`<rect x="160" y="${y}" width="${w1}" height="24" rx="12" fill="${c1}" fill-opacity="${(0.28 + rand() * 0.4).toFixed(2)}"/>`);
      shapes.push(`<rect x="${split + 70}" y="${y}" width="${w2}" height="24" rx="12" fill="${c2}" fill-opacity="${(0.28 + rand() * 0.4).toFixed(2)}"/>`);
    }
  } else if (kind === "radar" || kind === "release") {
    // Concentric signal rings + directional pulse nodes
    const cx = Math.round(380 + rand() * 260);
    const cy = Math.round(240 + rand() * 100);
    for (let r = 56; r <= 240; r += 46) {
      shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${r % 92 === 56 ? c1 : c2}" stroke-opacity="${(0.5 - r / 650).toFixed(2)}" stroke-width="2"/>`);
    }
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2;
      const dist = 60 + rand() * 200;
      const px = Math.round(cx + Math.cos(a) * dist);
      const py = Math.round(cy + Math.sin(a) * dist);
      shapes.push(`<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="${c1}" stroke-opacity="0.28" stroke-width="1.5"/>`);
      shapes.push(`<circle cx="${px}" cy="${py}" r="${Math.round(5 + rand() * 7)}" fill="${i % 2 ? c1 : c2}" fill-opacity="0.85"/>`);
    }
  } else if (kind === "troubleshoot") {
    // Diagnostic waveforms + stepped nodes
    for (let row = 0; row < 3; row++) {
      const baseY = 165 + row * 120;
      const pts = [];
      for (let x = 96; x <= 928; x += 64) {
        const dy = Math.round((rand() - 0.5) * (row === 1 ? 84 : 44));
        pts.push(`${x},${baseY + dy}`);
      }
      shapes.push(`<polyline fill="none" stroke="${row === 1 ? c1 : c2}" stroke-opacity="${row === 1 ? "0.8" : "0.45"}" stroke-width="${row === 1 ? 3 : 2}" points="${pts.join(" ")}"/>`);
    }
  } else {
    // Modular compute tiles (hardware / task / concept / local)
    for (let i = 0; i < 12; i++) {
      const x = Math.round(80 + rand() * 760);
      const y = Math.round(64 + rand() * 360);
      const w = Math.round(70 + rand() * 150);
      const h = Math.round(48 + rand() * 110);
      const col = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      const fillOp = (0.12 + rand() * 0.24).toFixed(2);
      const strokeOp = (0.28 + rand() * 0.45).toFixed(2);
      shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${col}" fill-opacity="${fillOp}" stroke="${col}" stroke-opacity="${strokeOp}" stroke-width="1.5"/>`);
    }
    // Focal geometric emblem
    const rx = Math.round(300 + rand() * 420);
    const ry = Math.round(180 + rand() * 210);
    shapes.push(`<circle cx="${rx}" cy="${ry}" r="76" fill="none" stroke="${c1}" stroke-opacity="0.6" stroke-width="2.5"/>`);
    shapes.push(`<circle cx="${rx}" cy="${ry}" r="36" fill="${c2}" fill-opacity="0.35" stroke="${c2}" stroke-width="2"/>`);
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 576" width="1024" height="576" role="img" aria-hidden="true">`,
    `<defs>`,
    `<radialGradient id="g1" cx="${(gx / 1024).toFixed(2)}" cy="${(gy / 576).toFixed(2)}" r="0.65">`,
    `<stop offset="0%" stop-color="${c1}" stop-opacity="0.24"/>`,
    `<stop offset="100%" stop-color="#070b12" stop-opacity="0"/>`,
    `</radialGradient>`,
    `<radialGradient id="g2" cx="${(gx2 / 1024).toFixed(2)}" cy="${(gy2 / 576).toFixed(2)}" r="0.58">`,
    `<stop offset="0%" stop-color="${c2}" stop-opacity="0.18"/>`,
    `<stop offset="100%" stop-color="#070b12" stop-opacity="0"/>`,
    `</radialGradient>`,
    `</defs>`,
    `<rect width="1024" height="576" fill="#070b12"/>`,
    `<rect width="1024" height="576" fill="url(#g1)"/>`,
    `<rect width="1024" height="576" fill="url(#g2)"/>`,
    ...shapes,
    `</svg>\n`,
  ].join("");
}
