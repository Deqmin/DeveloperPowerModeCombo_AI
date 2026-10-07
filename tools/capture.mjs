// Captures the README screenshots and animated GIF from the real extension running in Chromium.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import gifenc from 'gifenc';
import pngjs from 'pngjs';
import helpers from '../tests/helpers/extension.js';

const { startServer, launch, setSettings } = helpers;
const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
fs.mkdirSync(docs, { recursive: true });

const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpmc-video-'));
const { server, url } = await startServer();
const { context, extensionId } = await launch({
  viewport: { width: 900, height: 420 },
  recordVideo: { dir: videoDir, size: { width: 900, height: 420 } },
});

async function openDemo(settings) {
  await setSettings(context, extensionId, settings);
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForTimeout(600);
  return page;
}

// Popup
{
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 340, height: 330 });
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.waitForTimeout(400);
  await popup.screenshot({ path: path.join(docs, 'popup.png'), fullPage: true });
  await popup.close();
}

// Combo + sparks + pets, also recorded as video for the GIF
let gifVideo;
{
  const page = await openDemo({ enabled: true, mode: 'all' });
  gifVideo = page.video();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(docs, 'pets-all.png'), clip: { x: 0, y: 0, width: 900, height: 140 } });
  await page.click('#multi');
  const text = 'function powerMode() { return 42; }';
  let shot = false;
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 0 });
    await page.waitForTimeout(95);
    if (!shot && ch === '{') {
      await page.screenshot({ path: path.join(docs, 'combo-sparks.png') });
      shot = true;
    }
  }
  await page.waitForTimeout(4000);
  await page.close();
}

// Octopus mode: pick the band frame with the most visible detail (ink clouds)
{
  const page = await openDemo({ enabled: true, mode: 'octopus' });
  let best = null;
  for (let i = 0; i < 28; i++) {
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 900, height: 120 } });
    if (!best || buf.length > best.length) best = buf;
    await page.waitForTimeout(300);
  }
  fs.writeFileSync(path.join(docs, 'octopus-ink.png'), best);
  await page.close();
}

const videoPath = await gifVideo.path();
await context.close();
server.close();

const ffmpeg = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', fs.readdirSync(path.join(process.env.LOCALAPPDATA, 'ms-playwright')).filter((d) => d.startsWith('ffmpeg')).sort().pop(), 'ffmpeg-win64.exe');
// Playwright's bundled ffmpeg can only emit PNG frames, so the GIF is encoded in JS.
const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpmc-frames-'));
const r = spawnSync(ffmpeg, ['-y', '-ss', '0.6', '-i', videoPath, '-r', '15', '-vf', 'scale=720:-1', path.join(framesDir, 'f%03d.png')], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr);
  process.exit(1);
}
const gif = GIFEncoder();
for (const f of fs.readdirSync(framesDir).sort()) {
  const { data, width, height } = PNG.sync.read(fs.readFileSync(path.join(framesDir, f)));
  const palette = quantize(data, 128);
  gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: 67 });
}
gif.finish();
fs.writeFileSync(path.join(docs, 'power-mode.gif'), gif.bytes());
console.log('Saved docs/popup.png, pets-all.png, combo-sparks.png, octopus-ink.png, power-mode.gif');
