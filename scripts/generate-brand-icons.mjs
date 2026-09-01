#!/usr/bin/env node
// Single source of truth for every TaskHunter raster/vector brand asset.
//
//   node scripts/generate-brand-icons.mjs
//
// Two families, one constant each:
//   PLATE   (app icons with the #111 background: OS launchers, favicons,
//            PWA, icns/ico): full-bleed #111, mark bbox = 56% of the canvas —
//            inside every platform mask (Android adaptive visible circle,
//            macOS/iOS squircles).
//   STANDALONE (no plate: logo-light/dark): mark bbox = 92%, transparent.
//
// Splash drawables reuse the legacy artwork geometry (measured from git) so
// launch screens keep their historical mark size; the artwork itself is the
// new mark. macOS icns needs iconutil; the Windows .ico is packed multi-size
// via python3 + Pillow. The tray template set lives separately in
// packages/electron/scripts/generate-tray-icons.mjs (alpha-only semantics).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BG = '#111111';
const FG = '#f5f5f5';
const PLATE_MARK = 0.56;
const STANDALONE_MARK = 0.92;
const UNIT_BBOX = 468; // master mark bbox in the 512 unit space
const UNIT_INK = 502;  // ink extent including tick stroke caps

const mark = (fg, film) => `<g fill="none" stroke="${fg}" stroke-linecap="round" stroke-linejoin="round">
<circle cx="256" cy="256" r="150" fill="${film}" stroke-width="34"/>
<path d="M256 22 V96 M256 416 V490 M22 256 H96 M416 256 H490" stroke-width="34"/>
<path d="M186 262 L236 312 L332 200" stroke-width="36"/>
</g>`;
const fgMark = mark(FG, 'rgba(245,245,245,0.12)');
const inkMark = mark(BG, 'rgba(17,17,17,0.12)');

const scaleFor = (fraction) => (512 * fraction) / UNIT_BBOX;
const placed = (body, fraction) => {
  const s = scaleFor(fraction);
  const t = (512 - 512 * s) / 2;
  return `<g transform="translate(${t.toFixed(2)} ${t.toFixed(2)}) scale(${s.toFixed(5)})">${body}</g>`;
};

const svg = (body, px) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${px}" height="${px}">${body}</svg>`;
const plateSvg = (px) => svg(`<rect width="512" height="512" fill="${BG}"/>${placed(fgMark, PLATE_MARK)}`, px);
const standaloneSvg = (px, body) => svg(placed(body, STANDALONE_MARK), px);
const markOnlySvg = (px) => svg(placed(fgMark, PLATE_MARK), px);

async function png(svgSource, file, px) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svgSource)).resize(px, px).png().toFile(file);
  console.log('png ', path.relative(REPO, file));
}
async function svgFile(source, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source + '\n');
  console.log('svg ', path.relative(REPO, file));
}

// --- Electron ---------------------------------------------------------------
const E_ICONS = path.join(REPO, 'packages/electron/resources/icons');
await svgFile(plateSvg(512), path.join(E_ICONS, 'app-icon.svg'));
await svgFile(plateSvg(512), path.join(E_ICONS, 'icon-win.svg'));
await png(plateSvg(1024), path.join(E_ICONS, 'app-icon.png'), 1024);
await png(plateSvg(1024), path.join(E_ICONS, 'icon.png'), 1024);
await png(plateSvg(1024), path.join(E_ICONS, 'dev-icon.png'), 1024);

// --- VS Code ----------------------------------------------------------------
const V_ASSETS = path.join(REPO, 'packages/vscode/assets');
await svgFile(plateSvg(512), path.join(V_ASSETS, 'icon.svg'));
await png(plateSvg(512), path.join(V_ASSETS, 'app-icon.png'), 512);

// --- Web --------------------------------------------------------------------
const PUB = path.join(REPO, 'packages/web/public');
const plateTargets = [
  ['favicon.png', 64], ['favicon-16.png', 32], ['favicon-32.png', 64],
  ['apple-touch-icon.png', 180], ['apple-touch-icon-120x120.png', 120],
  ['apple-touch-icon-152x152.png', 152], ['apple-touch-icon-167x167.png', 167],
  ['apple-touch-icon-180x180.png', 180],
  ['pwa-192.png', 192], ['pwa-512.png', 512],
  ['pwa-maskable-192.png', 192], ['pwa-maskable-512.png', 512],
];
for (const [name, px] of plateTargets) {
  await png(plateSvg(px), path.join(PUB, name), px);
}
await svgFile(plateSvg(512), path.join(PUB, 'favicon.svg'));
await svgFile(plateSvg(512), path.join(PUB, 'apple-touch-icon.svg'));
await png(standaloneSvg(192, inkMark), path.join(PUB, 'logo-light-192x192.png'), 192);
await png(standaloneSvg(192, fgMark), path.join(PUB, 'logo-dark-192x192.png'), 192);
await svgFile(standaloneSvg(512, inkMark), path.join(PUB, 'logo-light-512x512.svg'));
await svgFile(standaloneSvg(512, fgMark), path.join(PUB, 'logo-dark-512x512.svg'));

// README badges: the raw mark at native 512 scale (no plate, no downscale).
const BADGES = path.join(REPO, 'docs/references/badges');
const rawBadge = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`;
await svgFile(rawBadge(fgMark), path.join(BADGES, 'taskhunter-logo-dark.svg'));
await svgFile(rawBadge(inkMark), path.join(BADGES, 'taskhunter-logo-light.svg'));
await png(rawBadge(fgMark), path.join(BADGES, 'taskhunter-logo-dark.png'), 512);

// --- Android ----------------------------------------------------------------
const ANDROID = path.join(REPO, 'packages/mobile/android/app/src/main/res');
const MIPMAP_SIZES = { ldpi: 36, hdpi: 72, mdpi: 48, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const circleMask = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><path d="M256 8 A248 248 0 1 1 255.9 8 Z" fill="#fff"/></svg>`;

for (const [density, size] of Object.entries(MIPMAP_SIZES)) {
  const dir = path.join(ANDROID, `mipmap-${density}`);
  const tile = await sharp(Buffer.from(plateSvg(size))).resize(size, size).png().toBuffer();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), tile);
  const mask = await sharp(Buffer.from(circleMask(size))).resize(size, size).png().toBuffer();
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'),
    await sharp(mask).composite([{ input: tile, blend: 'in' }]).png().toBuffer());
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'),
    await sharp(Buffer.from(markOnlySvg(size))).resize(size, size).png().toBuffer());
  fs.writeFileSync(path.join(dir, 'ic_launcher_background.png'),
    await sharp(Buffer.from(svg(`<rect width="512" height="512" fill="${BG}"/>`, size))).resize(size, size).png().toBuffer());
}
console.log('android mipmaps written');

fs.writeFileSync(path.join(ANDROID, 'drawable-v24/ic_launcher_foreground.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
    <group android:scaleX="0.49" android:scaleY="0.49" android:pivotX="256" android:pivotY="256">
        <path android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="34" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M256,106 A150,150 0 1,1 255.9,106 Z" />
        <path android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="34" android:strokeLineCap="round" android:pathData="M256,22 L256,96 M256,416 L256,490 M22,256 L96,256 M416,256 L490,256" />
        <path android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="36" android:pathData="M186,262 L236,312 L332,200" />
    </group>
</vector>
`);
fs.writeFileSync(path.join(ANDROID, 'drawable/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#111111" android:pathData="M0,0h108v108h-108z" />
</vector>
`);
fs.writeFileSync(path.join(ANDROID, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#111111</color>
</resources>
`);
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
console.log('android vectors written');

// --- Splash (legacy geometry, new artwork) ------------------------------------
async function measure(file) {
  const meta = await sharp(file).metadata();
  const { data } = await sharp(file).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const bg = [data[0], data[1], data[2]];
  let minX = meta.width; let minY = meta.height; let maxX = -1; let maxY = -1;
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
  return { width: meta.width, height: meta.height, mark: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

// Measure the pre-regeneration artwork from git so re-runs never drift.
function originalOf(absolutePath) {
  const rel = path.relative(REPO, absolutePath);
  try {
    return execFileSync('git', ['show', `HEAD:${rel}`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

async function renderSplash(file) {
  const original = originalOf(file);
  const measuredSource = original ?? file;
  const tmpPath = original ? path.join(os.tmpdir(), `th-splash-${path.basename(file)}`) : null;
  if (original) fs.writeFileSync(tmpPath, original);
  const m = await measure(measuredSource);
  if (tmpPath) fs.rmSync(tmpPath, { force: true });
  const cx = Math.round(m.mark.x + m.mark.w / 2);
  const cy = Math.round(m.mark.y + m.mark.h / 2);
  const markSize = Math.round(Math.min(m.mark.w, m.mark.h) * 512 / UNIT_INK);
  const body = `<rect width="${m.width}" height="${m.height}" fill="${BG}"/><g transform="translate(${cx - markSize / 2} ${cy - markSize / 2}) scale(${markSize / 512})">${fgMark}</g>`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.width} ${m.height}">${body}</svg>`,
  )).resize(m.width, m.height, { fit: 'fill' }).png().toFile(file);
  console.log('png ', path.relative(REPO, file));
}

for (const dir of fs.readdirSync(ANDROID).filter((name) => /^drawable(-port|-land)?(-\w+)?$/.test(name))) {
  const file = path.join(ANDROID, dir, 'splash.png');
  if (fs.existsSync(file)) await renderSplash(file);
}
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  const file = path.join(REPO, 'packages/mobile/ios/App/App/Assets.xcassets/Splash.imageset', name);
  if (fs.existsSync(file)) await renderSplash(file);
}

// --- iOS ---------------------------------------------------------------------
await png(plateSvg(1024), path.join(REPO, 'packages/mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), 1024);

// Widget symbol set: swap the SwiftDraw template's variant paths for the
// filled TaskHunter mark (annulus, ticks, mitered check) in 512 master space.
const circlePath = (cx, cy, r, sweep) =>
  `M${cx},${cy - r} A${r},${r} 0 1,${sweep} ${cx - 0.01},${cy - r} Z`;
const rectPath = (x, y, w, h) => `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
// Filled approximation of a stroked polyline with round caps and a round
// outer join (matches the stroke-based master mark): semicircle caps at both
// ends, radius-h arc around the corner on the convex side, concave side meets
// at the inner offset-line intersection.
const strokeOutline = (points, width) => {
  const [p1, p2, p3] = points;
  const h = width / 2;
  const unit = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  const u1 = unit(p1, p2);
  const u2 = unit(p2, p3);
  const n1 = [-u1[1], u1[0]];
  const n2 = [-u2[1], u2[0]];
  const nout = [n1[0] + n2[0], n1[1] + n2[1]];
  const noutLen = Math.hypot(nout[0], nout[1]) || 1;
  const s = nout[0] * n1[0] + nout[1] * n1[1] >= 0 ? 1 : -1;
  const at = (p, n) => [p[0] + s * h * n[0], p[1] + s * h * n[1]];
  const away = (p, n) => [p[0] - s * h * n[0], p[1] - s * h * n[1]];
  const f = (v) => v.map((n) => Number(n.toFixed(3)));
  // Inner (concave) corner: intersection of both offset lines moved by -s*h.
  const a11 = n1[0], a12 = n1[1], b1 = (p1[0] * n1[0] + p1[1] * n1[1]) - s * h;
  const a21 = n2[0], a22 = n2[1], b2 = (p3[0] * n2[0] + p3[1] * n2[1]) - s * h;
  const det = a11 * a22 - a12 * a21 || 1;
  const inner = [(b1 * a22 - b2 * a12) / det, (a11 * b2 - a21 * b1) / det];
  const A0 = at(p1, n1);
  const B = at(p2, n1);
  const C = at(p2, n2);
  const D = at(p3, n2);
  const E = away(p3, n2);
  const G = away(p1, n1);
  return `M${f(A0)} L${f(B)} A${h},${h} 0 0,1 ${f(C)} L${f(D)}`
    + ` A${h},${h} 0 0,1 ${f(E)} L${f(inner)} L${f(G)}`
    + ` A${h},${h} 0 0,1 ${f(A0)} Z`;
};
const SYMBOL_MARK_PATH = [
  circlePath(256, 256, 167, 1),
  circlePath(256, 256, 133, 0),
  rectPath(256 - 17, 22, 34, 74),
  rectPath(256 - 17, 416, 34, 74),
  rectPath(22, 256 - 17, 74, 34),
  rectPath(416, 256 - 17, 74, 34),
  strokeOutline([[186, 262], [236, 312], [332, 200]], 36),
].join(' ');
{
  const symbolFile = path.join(REPO, 'packages/mobile/ios/App/OpenChamberWidget/Assets.xcassets/OCLogoSymbol.symbolset/oclogo-symbol.svg');
  if (fs.existsSync(symbolFile)) {
    const symbolSvg = fs.readFileSync(symbolFile, 'utf8');
    const SCALE = 70 / UNIT_BBOX;
    let swapped = 0;
    const next = symbolSvg.replace(
      /(<g id="[^"]+" transform="[^"]*">)([\s\S]*?)(\n\s*<\/g>)/g,
      (whole, head, body, tail) => {
        if (!/<path/.test(body)) return whole;
        const xs = [...body.matchAll(/(-?\d+(?:\.\d+)?),(?:-?\d+(?:\.\d+)?)/g)].map((mm) => Number(mm[1]));
        const ys = [...body.matchAll(/(?:-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((mm) => Number(mm[1]));
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        swapped += 1;
        const xform = `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${SCALE.toFixed(5)}) translate(-256 -256)`;
        return `${head}\n            <g transform="${xform}"><path d="${SYMBOL_MARK_PATH}"/></g>${tail}`;
      },
    );
    if (swapped === 0) throw new Error('symbol set: no variant groups matched');
    fs.writeFileSync(symbolFile, next);
    console.log(`svg  ${path.relative(REPO, symbolFile)} (${swapped} variants)`);
  }
}

// --- Capacitor sources ---------------------------------------------------------
const M_ASSETS = path.join(REPO, 'packages/mobile/assets');
await png(plateSvg(1024), path.join(M_ASSETS, 'icon-only.png'), 1024);
await png(markOnlySvg(1024), path.join(M_ASSETS, 'icon-foreground.png'), 1024);
await png(svg(`<rect width="512" height="512" fill="${BG}"/>`, 1024), path.join(M_ASSETS, 'icon-background.png'), 1024);

// --- macOS icns ----------------------------------------------------------------
if (process.platform === 'darwin') {
  const icns = async (outFile) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'th-iconset-'));
    const set = path.join(tmp, 'AppIcon.iconset');
    fs.mkdirSync(set);
    const w = async (name, px) => fs.writeFileSync(
      path.join(set, name),
      await sharp(Buffer.from(plateSvg(px))).resize(px, px).png().toBuffer(),
    );
    await w('icon_16x16.png', 16); await w('icon_16x16@2x.png', 32);
    await w('icon_32x32.png', 32); await w('icon_32x32@2x.png', 64);
    await w('icon_128x128.png', 128); await w('icon_128x128@2x.png', 256);
    await w('icon_256x256.png', 256); await w('icon_256x256@2x.png', 512);
    await w('icon_512x512.png', 512); await w('icon_512x512@2x.png', 1024);
    execFileSync('iconutil', ['-c', 'icns', set, '-o', outFile]);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('icns', path.relative(REPO, outFile));
  };
  await icns(path.join(E_ICONS, 'icon.icns'));
  await icns(path.join(E_ICONS, 'dev-icon.icns'));
}

// --- Windows .ico (multi-size via Pillow) ----------------------------------------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ico-'));
  const base = path.join(tmp, '256.png');
  await png(plateSvg(256), base, 256);
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
Image.open(sys.argv[2]).convert('RGBA').save(sys.argv[3], format='ICO', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
`, '', base, path.join(E_ICONS, 'icon.ico')]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('ico  ', path.relative(REPO, path.join(E_ICONS, 'icon.ico')));
}

console.log('brand icon generation complete');
