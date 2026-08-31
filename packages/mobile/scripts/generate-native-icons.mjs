#!/usr/bin/env node
// Regenerates every native mobile icon/splash/vector asset from the shared
// TaskHunter master SVG (crosshair target + task checkmark, see
// packages/electron/resources/icons/app-icon.svg). Run after restyling the
// master:  node packages/mobile/scripts/generate-native-icons.mjs
//
// Outputs:
//   - packages/mobile/assets/icon-{only,foreground,background}.png
//   - iOS AppIcon + Splash.imageset (mark geometry copied from the replaced
//     files so launch layout is unchanged; only art/brand colors swap)
//   - Android mipmap launcher icons (all densities), splash drawables (all
//     orientations/densities), adaptive background color, foreground and
//     notification vector drawables
//   - iOS widget symbol set paths (oclogo-symbol.svg)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '../..');

const BG = '#111111';
const FG = '#f5f5f5';
const ANDROID = path.join(MOBILE, 'android/app/src/main/res');
const IOS_APP = path.join(MOBILE, 'ios/App/App/Assets.xcassets');
const IOS_WIDGET = path.join(MOBILE, 'ios/App/OpenChamberWidget/Assets.xcassets');

// --- SVG builders (512 viewBox matches the master icon) --------------------

const MASTER_SVG = fs.readFileSync(
  path.join(REPO, 'packages/electron/resources/icons/app-icon.svg'),
  'utf8',
).trim();

// Master geometry inside the 512 viewBox (ring, ticks, check) — reused for
// transparent-mark renderings and hand-translated into the small formats.
const MARK_GROUP = `<g fill="none" stroke="${FG}" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="256" cy="256" r="150" fill="rgba(245,245,245,0.12)" stroke-width="34"/>
  <path d="M256 22 V96 M256 416 V490 M22 256 H96 M416 256 H490" stroke-width="34"/>
  <path d="M186 262 L236 312 L332 200" stroke-width="36" stroke-linecap="butt" stroke-linejoin="miter"/>
</g>`;

const svg = (body, vb = '0 0 512 512') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

const TILE_SVG = MASTER_SVG;
const TILE_INNER = MASTER_SVG.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const MARK_SVG = svg(MARK_GROUP);

// Place the 468-unit master mark centered at a target pixel size on a
// `canvas`-sized transparent square.
const markAt = (canvas, size) => {
  const scale = size / 468;
  const off = (canvas - 512 * scale) / 2;
  return svg(
    `<g transform="translate(${off.toFixed(2)} ${off.toFixed(2)}) scale(${scale.toFixed(5)})">${MARK_GROUP}</g>`,
    `0 0 ${canvas} ${canvas}`,
  );
};

async function render(svgSource, width, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svgSource)).resize(width, width).png().toFile(outPath);
  console.log('wrote', path.relative(REPO, outPath));
}

// Measure an existing PNG: canvas size + bbox of pixels differing from the
// corner color (the baked mark), so replacements reuse exact legacy geometry.
async function measure(file) {
  const meta = await sharp(file).metadata();
  const { data } = await sharp(file).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const bg = [data[0], data[1], data[2]];
  let minX = meta.width, minY = meta.height, maxX = -1, maxY = -1;
  for (let y = 0; y < meta.height; y += 1) {
    for (let x = 0; x < meta.width; x += 1) {
      const i = (y * meta.width + x) * 4;
      const diff = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      if (diff > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    width: meta.width,
    height: meta.height,
    mark: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}

// Splash drawables reuse the legacy geometry of the original (pre-brand-swap)
// artwork, read from git so re-runs measure history, not our own output.
function originalOf(absolutePath) {
  const rel = path.relative(REPO, absolutePath);
  return execFileSync('git', ['show', `HEAD:${rel}`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
}

async function renderSplash(sourcePath, outPath) {
  const originalPath = fs.existsSync(outPath)
    ? path.join(os.tmpdir(), `th-splash-${path.basename(outPath)}`)
    : outPath;
  let originalSource = sourcePath;
  if (originalPath !== outPath) {
    let original;
    try {
      original = originalOf(outPath);
    } catch {
      original = null;
    }
    if (original) {
      fs.writeFileSync(originalPath, original);
      originalSource = originalPath;
    }
  }
  const m = await measure(originalSource);
  const cx = Math.round(m.mark.x + m.mark.w / 2);
  const cy = Math.round(m.mark.y + m.mark.h / 2);
  // Rendered mark bbox = markSize * 468/512; size it to the legacy glyph.
  const markSize = Math.round(Math.min(m.mark.w, m.mark.h) * 512 / 468);
  const fsSource = svg(
    `<rect width="${m.width}" height="${m.height}" fill="${BG}"/>`
    + `<g transform="translate(${cx - markSize / 2} ${cy - markSize / 2}) scale(${markSize / 512})">${MARK_GROUP}</g>`,
    `0 0 ${m.width} ${m.height}`,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(fsSource)).resize(m.width, m.height, { fit: 'fill' }).png().toFile(outPath);
  if (originalPath !== outPath) fs.rmSync(originalPath, { force: true });
  console.log('wrote', path.relative(REPO, outPath));
}

// Fill an SVG mark into an exact canvas size for adaptive foregrounds.
async function renderMarkOnCanvas(svgSource, size, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svgSource)).resize(size, size).png().toFile(outPath);
  console.log('wrote', path.relative(REPO, outPath));
}

// --- Android ---------------------------------------------------------------

const MIPMAP_SIZES = { ldpi: 36, hdpi: 72, mdpi: 48, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// Adaptive foreground content stays inside the 66/108 safe zone.
const FOREGROUND_SVG = markAt(1024, Math.round(1024 * 62 / 108));

const roundTileMask = svg(`<path d="M256 8 A248 248 0 1 1 255.9 8 Z" fill="#fff"/>`, '0 0 512 512');
async function renderRoundLauncher(size, outPath) {
  const tile = await sharp(Buffer.from(TILE_SVG)).resize(size, size).png().toBuffer();
  const mask = await sharp(Buffer.from(roundTileMask)).resize(size, size).png().toBuffer();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(tile)
    .composite([{ input: mask, blend: 'in' }])
    .png()
    .toFile(outPath);
  console.log('wrote', path.relative(REPO, outPath));
}

for (const [density, size] of Object.entries(MIPMAP_SIZES)) {
  const dir = path.join(ANDROID, `mipmap-${density}`);
  await render(TILE_SVG, size, path.join(dir, 'ic_launcher.png'));
  await renderRoundLauncher(size, path.join(dir, 'ic_launcher_round.png'));
  await renderMarkOnCanvas(FOREGROUND_SVG, size, path.join(dir, 'ic_launcher_foreground.png'));
  await render(svg(`<rect width="512" height="512" fill="${BG}"/>`), size, path.join(dir, 'ic_launcher_background.png'));
}

// Splash drawables: keep every legacy canvas + mark geometry.
for (const dir of fs.readdirSync(ANDROID).filter((name) => /^drawable(-port|-land)?(-\w+)?$/.test(name))) {
  const source = path.join(ANDROID, dir, 'splash.png');
  if (!fs.existsSync(source)) continue;
  await renderSplash(source, source);
}

fs.writeFileSync(path.join(ANDROID, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#111111</color>
</resources>
`);
console.log('wrote values/ic_launcher_background.xml');

// Android vectors: stroke-based rings/ticks/check in a 512 viewport.
const VECTOR_MARK = (scale, translate, color) =>
  `    <path android:fillColor="#00000000" android:strokeColor="${color}" android:strokeWidth="${34 * scale}" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M256,106 A150,150 0 1,1 255.9,106 Z" android:translateX="${translate}" android:translateY="${translate}" />`;

fs.writeFileSync(path.join(ANDROID, 'drawable-v24/ic_launcher_foreground.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
    <group android:scaleX="0.49" android:scaleY="0.49" android:pivotX="256" android:pivotY="256">
        <path
            android:fillColor="#00000000"
            android:strokeColor="#FFFFFFFF"
            android:strokeWidth="34"
            android:strokeLineCap="round"
            android:strokeLineJoin="round"
            android:pathData="M256,106 A150,150 0 1,1 255.9,106 Z" />
        <path
            android:fillColor="#00000000"
            android:strokeColor="#FFFFFFFF"
            android:strokeWidth="34"
            android:strokeLineCap="round"
            android:pathData="M256,22 L256,96 M256,416 L256,490 M22,256 L96,256 M416,256 L490,256" />
        <path
            android:fillColor="#00000000"
            android:strokeColor="#FFFFFFFF"
            android:strokeWidth="36"
            android:pathData="M186,262 L236,312 L332,200" />
    </group>
</vector>
`);
console.log('wrote drawable-v24/ic_launcher_foreground.xml');

fs.writeFileSync(path.join(ANDROID, 'drawable/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#111111" android:pathData="M0,0h108v108h-108z" />
</vector>
`);
console.log('wrote drawable/ic_launcher_background.xml');

fs.writeFileSync(path.join(ANDROID, 'drawable/ic_stat_notify.xml'), `<!-- Notification small icon: monochrome (alpha-only) silhouette of the
     TaskHunter mark (target ring + task check). Android tints it, so only
     the shape matters. Ticks are dropped — they would disappear at 24dp. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#00000000"
        android:strokeColor="#FFFFFFFF"
        android:strokeWidth="2.4"
        android:pathData="M12,3.5 A8.5,8.5 0 1,1 11.9,3.5 Z" />
    <path
        android:fillColor="#00000000"
        android:strokeColor="#FFFFFFFF"
        android:strokeWidth="2.6"
        android:pathData="M8.5,12.2 L11,14.7 L15.8,9.6" />
</vector>
`);
console.log('wrote drawable/ic_stat_notify.xml');

// --- Capacitor asset sources ----------------------------------------------

await render(TILE_SVG, 1024, path.join(MOBILE, 'assets/icon-only.png'));
await render(markAt(1024, 600), 1024, path.join(MOBILE, 'assets/icon-foreground.png'));
await render(svg(`<rect width="512" height="512" fill="${BG}"/>`), 1024, path.join(MOBILE, 'assets/icon-background.png'));

// --- iOS -------------------------------------------------------------------

// App icon: full-bleed brand background (iOS applies its own mask) with the
// mark at the adaptive-icon proportion. The master tile must NOT be used
// directly here: its ticks touch the tile edge, so any overscan crops them.
const IOS_ICON_SIZE = 640;
const IOS_ICON_SCALE = IOS_ICON_SIZE / 468;
const iosOffset = (1024 - 512 * IOS_ICON_SCALE) / 2;
const IOS_ICON_SVG = svg(
  `<rect width="1024" height="1024" fill="${BG}"/>`
  + `<g transform="translate(${iosOffset.toFixed(2)} ${iosOffset.toFixed(2)}) scale(${IOS_ICON_SCALE.toFixed(5)})">${MARK_GROUP}</g>`,
  '0 0 1024 1024',
);
await render(IOS_ICON_SVG, 1024, path.join(IOS_APP, 'AppIcon.appiconset/AppIcon-512@2x.png'));

for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  const file = path.join(IOS_APP, 'Splash.imageset', name);
  if (fs.existsSync(file)) await renderSplash(file, file);
}

// Widget symbol set: keep the SwiftDraw template, swap each variant group's
// cube paths for the TaskHunter mark. The mark is built once in 512 master
// space as filled subpaths (SF Symbol layers must be fill-only): annulus,
// four ticks, and the check as a mitered stroke-outline polygon.
const circle = (cx, cy, r, sweep) =>
  `M${cx},${cy - r} A${r},${r} 0 1,${sweep} ${cx - 0.01},${cy - r} Z`;
const rect = (x, y, w, h) => `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;

// Filled outline of a 3-point stroke (butt caps, miter join).
const strokeOutline = (points, width) => {
  const [p1, p2, p3] = points;
  const h = width / 2;
  const normal = (a, b, side) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [(-dy / len) * h * side, (dx / len) * h * side];
  };
  const sideA = 1;
  const sideB = -1;
  const o1 = normal(p1, p2, sideA);
  const o2 = normal(p1, p2, sideB);
  const i1 = normal(p2, p3, sideA);
  const i2 = normal(p2, p3, sideB);
  const sum = [o1[0] + i1[0], o1[1] + i1[1]];
  const norm = Math.hypot(sum[0], sum[1]) || 1;
  // Miter length = h / cos(half-angle); cap at the stroke width itself.
  const miterLen = Math.min(width, (h * 2 * h) / norm);
  const miter = [sum[0] / norm * miterLen, sum[1] / norm * miterLen];
  return `M${p1[0] + o1[0]},${p1[1] + o1[1]} L${p2[0] + miter[0]},${p2[1] + miter[1]} L${p3[0] + i1[0]},${p3[1] + i1[1]}`
    + ` L${p3[0] + i2[0]},${p3[1] + i2[1]} L${p2[0] - miter[0]},${p2[1] - miter[1]} L${p1[0] + o2[0]},${p1[1] + o2[1]} Z`;
};

// Same geometry as MARK_GROUP (ring r150 sw34, ticks 22..96/416..490 sw34,
// check through 186,262 / 236,312 / 332,200 at sw36).
const TICK = 34;
const SYMBOL_MARK_PATH = [
  circle(256, 256, 167, 1),
  circle(256, 256, 133, 0),
  rect(256 - TICK / 2, 22, TICK, 74),
  rect(256 - TICK / 2, 416, TICK, 74),
  rect(22, 256 - TICK / 2, 74, TICK),
  rect(416, 256 - TICK / 2, 74, TICK),
  strokeOutline([[186, 262], [236, 312], [332, 200]], 36),
].join(' ');

const symbolFile = path.join(IOS_WIDGET, 'OCLogoSymbol.symbolset/oclogo-symbol.svg');
if (fs.existsSync(symbolFile)) {
  const symbolSvg = fs.readFileSync(symbolFile, 'utf8');
  // 70-unit box around the 468-unit master mark.
  const SCALE = 70 / 468;
  const groupRe = /(<g id="[^"]+" transform="[^"]*">)([\s\S]*?)(\n\s*<\/g>)/g;
  let swapped = 0;
  const nextSymbol = symbolSvg.replace(groupRe, (whole, head, body, tail) => {
    if (!/<path/.test(body)) return whole;
    const xs = [...body.matchAll(/(-?\d+(?:\.\d+)?),(?:-?\d+(?:\.\d+)?)/g)]
      .map((m) => Number(m[1]));
    const ys = [...body.matchAll(/(?:-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
      .map((m) => Number(m[1]));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    swapped += 1;
    const xform = `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${SCALE.toFixed(5)}) translate(-256 -256)`;
    return `${head}\n            <g transform="${xform}"><path d="${SYMBOL_MARK_PATH}"/></g>${tail}`;
  });
  if (swapped === 0) throw new Error('symbol set: no variant groups matched');
  fs.writeFileSync(symbolFile, nextSymbol);
  console.log(`wrote ${path.relative(REPO, symbolFile)} (${swapped} variants)`);
}

console.log('native icon regeneration complete');
