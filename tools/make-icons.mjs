// Generates icons/*.png from the corgi sprite using a headless browser canvas.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spritesSrc = fs.readFileSync(path.join(root, 'src', 'sprites.js'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');
await page.addScriptTag({ content: spritesSrc });
fs.mkdirSync(path.join(root, 'icons'), { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const b64 = await page.evaluate((s) => {
    const c = document.getElementById('c');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#140c2b';
    g.fillRect(0, 0, s, s);
    const scale = s / 20;
    const sprite = { species: 'corgi', x: (s - 16 * scale) / 2, y: (s - 10 * scale) / 2, dir: 1, phase: 0 };
    globalThis.DPMC.drawPet(g, sprite, scale);
    return c.toDataURL('image/png').split(',')[1];
  }, size);
  fs.writeFileSync(path.join(root, 'icons', `icon${size}.png`), Buffer.from(b64, 'base64'));
}
await browser.close();
