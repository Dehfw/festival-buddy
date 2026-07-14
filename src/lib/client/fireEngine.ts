'use client';

/**
 * Echtes-Feuer-Look für den Feuerrahmen: klassische Doom-Fire-Simulation
 * (Hitze-Diffusion wie im PSX-DOOM-Intro) auf einem groben Pixelraster.
 * Statt der untersten Bildzeile ist hier die Rahmenlinie der Karte der
 * Brennstoff: Sie wird jeden Frame mit wandernden Hotspots neu gezündet,
 * die Hitze steigt mit seitlichem Jitter auf und kühlt pro Zelle zufällig
 * ab. Eine Palette von Glutrot über Orange bis Weißgelb (mit Alpha) macht
 * daraus züngelnde Flammen; das Karteninnere wird per Maske ausgeblendet,
 * damit der Inhalt lesbar bleibt.
 *
 * Ein einziger requestAnimationFrame-Loop treibt alle sichtbaren Rahmen;
 * das Raster ist grob (CELL px pro Zelle) und wird vom Browser weich
 * hochskaliert – das kostet selbst mit mehreren Instanzen fast nichts.
 */

/** CSS-Pixel pro Sim-Zelle – grob, das Hochskalieren macht die Flammen weich */
const CELL = 3;
/** Überstand des Canvas über die Karte hinaus – MUSS zu .fire-frame canvas in globals.css passen */
export const PAD_TOP = 24;
export const PAD_X = 12;
export const PAD_BOTTOM = 9;
/** Zellen, über die Flammen ins Karteninnere hinein ausblenden (Innenglut) */
const INNER_FADE = 2;
/** Max. Deckkraft der Innenglut (0..255) – Karteninhalt bleibt lesbar */
const INNER_ALPHA = 150;
const FPS = 30;

/* Palette: Hitze 0..255 -> RGBA; Alpha steckt mit drin (0 = unsichtbar) */
const STOPS: [number, number, number, number, number][] = [
  [0, 0, 0, 0, 0],
  [40, 70, 10, 0, 28],
  [90, 175, 30, 0, 170],
  [140, 230, 85, 10, 235],
  [190, 255, 155, 20, 255],
  [230, 255, 215, 70, 255],
  [255, 255, 255, 210, 255],
];
const PALETTE = new Uint8ClampedArray(256 * 4);
for (let i = 0; i < 256; i++) {
  let a = STOPS[0];
  let b = STOPS[STOPS.length - 1];
  for (let s = 0; s < STOPS.length - 1; s++) {
    if (i >= STOPS[s][0] && i <= STOPS[s + 1][0]) {
      a = STOPS[s];
      b = STOPS[s + 1];
      break;
    }
  }
  const t = (i - a[0]) / Math.max(1, b[0] - a[0]);
  for (let c = 0; c < 4; c++) {
    PALETTE[i * 4 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * t;
  }
}

interface FireInstance {
  ctx: CanvasRenderingContext2D;
  gw: number;
  gh: number;
  heat: Uint8ClampedArray;
  /** Indizes der Rahmen-Zellen, die jeden Frame neu gezündet werden */
  fuel: number[];
  /** Alpha-Multiplikator 0..255 je Zelle (Innenraum + Canvas-Ränder ausblenden) */
  mask: Uint8ClampedArray;
  img: ImageData | null;
}

const instances = new Set<FireInstance>();
let rafId = 0;
let lastFrame = 0;

/** Raster, Brennstoff-Ring und Maske für die aktuelle Elementgröße aufbauen */
function setup(inst: FireInstance, cssW: number, cssH: number): void {
  const gw = Math.max(8, Math.round(cssW / CELL));
  const gh = Math.max(8, Math.round(cssH / CELL));
  inst.gw = gw;
  inst.gh = gh;
  inst.ctx.canvas.width = gw;
  inst.ctx.canvas.height = gh;
  inst.heat = new Uint8ClampedArray(gw * gh);
  inst.mask = new Uint8ClampedArray(gw * gh);
  inst.fuel = [];
  inst.img = inst.ctx.createImageData(gw, gh);

  // Rahmenlinie der Karte in Rasterkoordinaten
  const x0 = Math.round(PAD_X / CELL);
  const y0 = Math.round(PAD_TOP / CELL);
  const x1 = gw - 1 - x0;
  const y1 = gh - 1 - Math.round(PAD_BOTTOM / CELL);

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      // > 0 = im Karteninneren, 0 = auf der Rahmenlinie, < 0 = außerhalb
      const inner = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      if (inner === 0) inst.fuel.push(i);
      let m = 255;
      if (inner > 0) {
        m =
          inner >= INNER_FADE
            ? 0
            : Math.round((1 - inner / INNER_FADE) * INNER_ALPHA);
      }
      // Canvas-Ränder weich auslaufen lassen, damit lange Flammen nicht hart abschneiden
      const edge = Math.min(x, y, gw - 1 - x, gh - 1 - y);
      if (edge < 2) m = Math.round((m * (edge + 1)) / 3);
      inst.mask[i] = m;
    }
  }
}

function step(inst: FireInstance, t: number): void {
  const { gw, gh, heat, fuel, mask, img, ctx } = inst;
  if (!img || heat.length === 0) return;

  // Brennstoff zünden: langsam wandernde Hotspots (Sinus-Überlagerung)
  // plus Zufallsflackern – so lecken einzelne Zungen statt gleichmäßig
  // zu glühen.
  for (const i of fuel) {
    const x = i % gw;
    const y = (i / gw) | 0;
    const lick =
      Math.sin(x * 0.55 + t * 0.004) + Math.sin(x * 0.21 - t * 0.0022 + y * 0.8);
    heat[i] = 150 + lick * 26 + Math.random() * 52;
  }

  // Hitze steigt eine Zeile pro Frame mit seitlichem Jitter und kühlt ab
  // (klassische Doom-Fire-Propagation, oberste Zeile ist nur Ziel).
  for (let y = 1; y < gh; y++) {
    const row = y * gw;
    for (let x = 0; x < gw; x++) {
      const src = row + x;
      const h = heat[src];
      const dstRow = src - gw;
      if (h === 0) {
        heat[dstRow] = 0;
        continue;
      }
      let nx = x + ((Math.random() * 3) | 0) - 1;
      if (nx < 0) nx = 0;
      else if (nx >= gw) nx = gw - 1;
      heat[dstRow + (nx - x)] = h - (6 + Math.random() * 42);
    }
  }

  const d = img.data;
  for (let i = 0; i < heat.length; i++) {
    const p = heat[i] << 2;
    const o = i << 2;
    const m = mask[i];
    d[o] = PALETTE[p];
    d[o + 1] = PALETTE[p + 1];
    d[o + 2] = PALETTE[p + 2];
    d[o + 3] = m === 255 ? PALETTE[p + 3] : (PALETTE[p + 3] * m) >> 8;
  }
  ctx.putImageData(img, 0, 0);
}

function loop(t: number): void {
  if (instances.size === 0) {
    rafId = 0;
    return;
  }
  rafId = requestAnimationFrame(loop);
  // Auf Ziel-FPS drosseln – mehr braucht Feuer nicht und spart Akku
  if (t - lastFrame < 1000 / FPS - 4) return;
  lastFrame = t;
  for (const inst of instances) step(inst, t);
}

/**
 * Canvas als Feuerrahmen registrieren. Gibt die Cleanup-Funktion zurück.
 * Bei prefers-reduced-motion passiert nichts – dann bleibt der statische
 * CSS-Glut-Fallback aus globals.css sichtbar.
 */
export function attachFire(canvas: HTMLCanvasElement): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => {};
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const inst: FireInstance = {
    ctx,
    gw: 0,
    gh: 0,
    heat: new Uint8ClampedArray(0),
    fuel: [],
    mask: new Uint8ClampedArray(0),
    img: null,
  };

  const ro = new ResizeObserver((entries) => {
    const r = entries[0]?.contentRect;
    if (r && r.width > 0 && r.height > 0) setup(inst, r.width, r.height);
  });
  ro.observe(canvas);

  instances.add(inst);
  if (!rafId) rafId = requestAnimationFrame(loop);

  return () => {
    ro.disconnect();
    instances.delete(inst);
  };
}
