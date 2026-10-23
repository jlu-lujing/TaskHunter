import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildAppImageDesktopEntry, reconcileAppImageDesktopEntry } from './linux-desktop-entry.mjs';

const ICON = Buffer.from('png-bytes');

const makeLab = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-desktop-entry-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const appDir = path.join(root, 'mount');
  const iconSource = path.join(appDir, 'usr/share/icons/hicolor/512x512/apps/openchamber.png');
  await fs.mkdir(path.dirname(iconSource), { recursive: true });
  await fs.writeFile(iconSource, ICON);
  const dataHome = path.join(root, 'data');
  const env = {
    APPIMAGE: path.join(root, 'Downloads', 'OpenChamber-2.3.0-linux-x86_64.AppImage'),
    APPDIR: appDir,
    XDG_DATA_HOME: dataHome,
  };
  return {
    env,
    homeDir: root,
    desktopPath: path.join(dataHome, 'applications', 'openchamber.desktop'),
    iconPath: path.join(dataHome, 'icons/hicolor/512x512/apps/openchamber.png'),
  };
};

const writeEntry = async (filePath, contents) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
};

test('a first AppImage launch writes a visible launcher entry and its icon', async (t) => {
  const lab = await makeLab(t);
  const result = await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });

  assert.deepEqual(result, { status: 'integrated', changed: true, desktopPath: lab.desktopPath });
  assert.deepEqual(await fs.readFile(lab.iconPath), ICON);
  const entry = await fs.readFile(lab.desktopPath, 'utf8');
  assert.match(entry, /^StartupWMClass=openchamber$/m);
  assert.match(entry, new RegExp(`^TryExec=${lab.env.APPIMAGE}$`, 'm'));
  assert.match(entry, new RegExp(`^Icon=${lab.iconPath}$`, 'm'));
  assert.doesNotMatch(entry, /NoDisplay/);
});

test('a second launch from the same place changes nothing', async (t) => {
  const lab = await makeLab(t);
  await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });
  const result = await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });
  assert.equal(result.changed, false);
});

test('an entry the user hid with a menu editor stays hidden', async (t) => {
  const lab = await makeLab(t);
  await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });
  const hidden = `${await fs.readFile(lab.desktopPath, 'utf8')}NoDisplay=true\n`;
  await fs.writeFile(lab.desktopPath, hidden);

  const result = await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });
  assert.deepEqual(result, { status: 'hidden-by-user' });
  assert.equal(await fs.readFile(lab.desktopPath, 'utf8'), hidden);
});

test('a moved AppImage rewrites Exec and TryExec', async (t) => {
  const lab = await makeLab(t);
  await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });
  const moved = { ...lab.env, APPIMAGE: path.join(lab.homeDir, 'Apps', 'OpenChamber.AppImage') };
  const result = await reconcileAppImageDesktopEntry({ env: moved, homeDir: lab.homeDir });

  assert.equal(result.changed, true);
  assert.match(await fs.readFile(lab.desktopPath, 'utf8'), new RegExp(`^TryExec=${moved.APPIMAGE}$`, 'm'));
});

test('an entry written by Gear Lever under the same name is left alone', async (t) => {
  const lab = await makeLab(t);
  const gearLever = '[Desktop Entry]\nName=OpenChamber (2.3.0)\nExec=env DESKTOPINTEGRATION=1 /home/u/AppImages/openchamber.appimage --no-sandbox %U\nStartupWMClass=openchamber\n';
  await writeEntry(lab.desktopPath, gearLever);

  const result = await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });
  assert.deepEqual(result, { status: 'external', removed: false });
  assert.equal(await fs.readFile(lab.desktopPath, 'utf8'), gearLever);
});

test('a launch from Gear Lever withdraws our earlier entry', async (t) => {
  const lab = await makeLab(t);
  await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });
  const result = await reconcileAppImageDesktopEntry({ env: { ...lab.env, DESKTOPINTEGRATION: '1' }, homeDir: lab.homeDir });

  assert.deepEqual(result, { status: 'external', removed: true });
  await assert.rejects(fs.access(lab.desktopPath));
  await assert.rejects(fs.access(lab.iconPath));
});

test('another entry claiming the window class withdraws ours', async (t) => {
  const lab = await makeLab(t);
  await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });
  await writeEntry(path.join(path.dirname(lab.desktopPath), 'appimagekit_abc-OpenChamber.desktop'),
    '[Desktop Entry]\nName=OpenChamber\nExec=/opt/x.AppImage\nStartupWMClass=openchamber\n');

  const result = await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });
  assert.deepEqual(result, { status: 'external', removed: true });
  await assert.rejects(fs.access(lab.desktopPath));
});

test('another entry that starts this AppImage counts as an integration', async (t) => {
  const lab = await makeLab(t);
  await writeEntry(path.join(lab.homeDir, 'data', 'applications', 'my-chamber.desktop'),
    `[Desktop Entry]\nName=Mine\nExec=${lab.env.APPIMAGE}\n`);

  const result = await reconcileAppImageDesktopEntry({ env: lab.env, homeDir: lab.homeDir });
  assert.equal(result.status, 'external');
  await assert.rejects(fs.access(lab.desktopPath));
});

test('nothing is written outside an AppImage or without its icon', async (t) => {
  const lab = await makeLab(t);
  assert.deepEqual(
    await reconcileAppImageDesktopEntry({ env: { ...lab.env, APPIMAGE: '' }, homeDir: lab.homeDir }),
    { status: 'not-appimage' },
  );
  assert.deepEqual(
    await reconcileAppImageDesktopEntry({ env: { ...lab.env, APPDIR: path.join(lab.homeDir, 'missing') }, homeDir: lab.homeDir }),
    { status: 'no-icon' },
  );
  await assert.rejects(fs.access(lab.desktopPath));
});

test('Exec quotes the path the way the Desktop Entry spec asks', () => {
  const entry = buildAppImageDesktopEntry({ appImagePath: '/home/u/My "Apps"/100% $x.AppImage', iconPath: '/i.png' });
  assert.match(entry, /^Exec="\/home\/u\/My \\\\"Apps\\\\"\/100%% \\\\\$x\.AppImage" %U$/m);
  assert.match(entry, /^TryExec=\/home\/u\/My "Apps"\/100% \$x\.AppImage$/m);
});
