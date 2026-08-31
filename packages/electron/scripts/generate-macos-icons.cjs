#!/usr/bin/env node
// Regenerates the macOS application icons (icon.icns, dev-icon.icns) from the
// shared master mark (resources/icons/app-icon.svg).
//
// Design contract: the Dock/Home-Kit squircle is applied by macOS itself, so
// the art is FULL-BLEED brand background (#111) with the mark centered at a
// mask-safe ~62% — never the rounded web tile (its transparent corners plus
// the system mask crop a visible ring off the artwork).
//
//   node packages/electron/scripts/generate-macos-icons.cjs
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const ICONS_DIR = path.join(__dirname, '..', 'resources', 'icons');
const MASTER = fs.readFileSync(path.join(ICONS_DIR, 'app-icon.svg'), 'utf8').trim();

// Full-bleed variant of the master: same geometry, background fills the whole
// canvas so the system mask has material to cut into.
const BG = '#111111';
const MASTER_INNER = MASTER.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
// The mark's rendered ink spans 502 units of the 512 box (tick stroke caps
// included). Size it to ~75% of the canvas: comfortably inside the Dock
// squircle mask, visibly larger than a web favicon.
const MARK_TARGET = 0.75;
const SCALE = (512 * MARK_TARGET) / 502;
const OFFSET = (512 - 512 * SCALE) / 2;
const fullBleedSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${BG}"/><g transform="translate(${OFFSET.toFixed(2)} ${OFFSET.toFixed(2)}) scale(${SCALE.toFixed(5)})">${MASTER_INNER}</g></svg>`;

const SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function buildIcns(outFile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taskhunter-icns-'));
  const setDir = path.join(tmp, 'AppIcon.iconset');
  fs.mkdirSync(setDir);
  try {
    const pngs = {};
    for (const px of SIZES) {
      pngs[px] = await sharp(Buffer.from(fullBleedSvg())).resize(px, px).png().toBuffer();
    }
    const write = (name, px) => fs.writeFileSync(path.join(setDir, name), pngs[px]);
    write('icon_16x16.png', 16);
    write('icon_16x16@2x.png', 32);
    write('icon_32x32.png', 32);
    write('icon_32x32@2x.png', 64);
    write('icon_128x128.png', 128);
    write('icon_128x128@2x.png', 256);
    write('icon_256x256.png', 256);
    write('icon_256x256@2x.png', 512);
    write('icon_512x512.png', 512);
    write('icon_512x512@2x.png', 1024);
    execFileSync('iconutil', ['-c', 'icns', setDir, '-o', outFile], { stdio: 'inherit' });
    console.log('wrote', path.relative(path.join(__dirname, '..', '..'), outFile));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

buildIcns(path.join(ICONS_DIR, 'icon.icns'))
  .then(() => buildIcns(path.join(ICONS_DIR, 'dev-icon.icns')))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
