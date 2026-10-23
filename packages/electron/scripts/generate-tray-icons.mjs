#!/usr/bin/env node
// Regenerates the macOS tray template family and the cross-platform per-row
// status icons from the TaskHunter tray glyph geometry (crosshair + task
// check; same mark as tray-glyph.svg / app-icon.svg). Black on transparent —
// macOS template rendering reads alpha only; menu rows tint the black.
//
//   node packages/electron/scripts/generate-tray-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRAY_DIR = path.join(ROOT, 'resources/icons/tray');
const STATUS_DIR = path.join(TRAY_DIR, 'status');

const BLACK = '#000000';
const RING_Ticks = '<circle cx="16" cy="16" r="10"/><path d="M16 1.5 V5.5 M16 26.5 V30.5 M1.5 16 H5.5 M26.5 16 H30.5"/>';
const CHECK = '<path d="M11.4 16.4 L14.6 19.6 L21 12.2" stroke-width="2.4" stroke-linecap="butt" stroke-linejoin="miter"/>';

const svg = (body, size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><g stroke="${BLACK}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.3">${body}</g></svg>`;

const glyph = (inner = CHECK) => `<g fill="none">${RING_Ticks}${inner}</g>`;
const dot = '<circle cx="27.4" cy="27.4" r="2.7" fill="#000" stroke="none"/>';
const bang = '<path d="M16 11.8 V18.2"/><circle cx="16" cy="21.6" r="1.3" fill="#000" stroke="none"/>';
// Circular-arrow refresh glyph replacing the check in the retry variant.
const refresh = '<path d="M12.2 19.5 A4.8 4.8 0 1 1 13.6 23.1"/><path d="M12.2 15.8 L12.05 19.75 L15.9 19.3" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';

// Breath frames: ring interior fill-opacity eased 0 -> 1 (tray.mjs ping-pongs
// the frame list, so a linear index maps to a 0->1->0 breath).
const easeInOutSine = (t) => (1 - Math.cos(Math.PI * t)) / 2;
const breathSvg = (index, total) => {
  const t = easeInOutSine(total > 1 ? index / (total - 1) : 0);
  return svg(
    `<circle cx="16" cy="16" r="10" fill="rgba(0,0,0,${t.toFixed(4)})"/><g fill="none">${RING_Ticks}${CHECK}</g>`,
  );
};

const TRAY_SIZES = { '': 18, '@2x': 36 };
const STATUS_SIZES = { '': 16, '@2x': 32 };
const BREATH_FRAMES = 16;

async function writeSvgPng(file, svgBody, size) {
  await sharp(Buffer.from(svg(svgBody, size)), { density: 300 })
    .resize(size, size)
    .png()
    .toFile(file);
}

async function writeFamily(dir, baseName, sizes, svgFor) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [suffix, size] of Object.entries(sizes)) {
    await writeSvgPng(path.join(dir, `${baseName}${suffix}.png`), svgFor, size);
  }
  console.log('wrote', path.relative(ROOT, path.join(dir, `${baseName}.png`)), '(+@2x)');
}

async function main() {
  await writeFamily(TRAY_DIR, 'trayTemplate-idle', TRAY_SIZES, glyph());
  await writeFamily(TRAY_DIR, 'trayTemplate-unseen', TRAY_SIZES, glyph(`${CHECK}${dot}`));

  for (let i = 0; i < BREATH_FRAMES; i += 1) {
    const padded = String(i).padStart(2, '0');
    for (const [suffix, size] of Object.entries(TRAY_SIZES)) {
      await writeSvgPng(
        path.join(TRAY_DIR, `trayTemplate-breath-${padded}${suffix}.png`),
        breathSvg(i, BREATH_FRAMES),
        size,
      );
    }
  }
  console.log(`wrote trayTemplate-breath-00..${BREATH_FRAMES - 1} (+@2x)`);

  await writeFamily(STATUS_DIR, 'busy', STATUS_SIZES, glyph());
  await writeFamily(STATUS_DIR, 'unseen', STATUS_SIZES, glyph(`${CHECK}${dot}`));
  await writeFamily(STATUS_DIR, 'error', STATUS_SIZES, glyph(bang));
  await writeFamily(STATUS_DIR, 'retry', STATUS_SIZES, glyph(refresh));

  for (const [suffix, size] of Object.entries(STATUS_SIZES)) {
    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toFile(path.join(STATUS_DIR, `blank${suffix}.png`));
  }
  console.log('wrote status/blank (transparent gutter)');
  console.log('tray icon regeneration complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
