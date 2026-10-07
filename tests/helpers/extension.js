const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');

function startServer() {
  const server = http.createServer((req, res) => {
    const file = path.join(FIXTURE_DIR, req.url === '/' ? 'page.html' : path.basename(req.url));
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' }).end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

async function launch(options = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpmc-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1000, height: 600 },
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    ...options,
  });
  const page = await context.newPage();
  await page.goto('chrome://extensions');
  const extensionId = await page.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    const list = mgr.shadowRoot.querySelector('extensions-item-list');
    return [...list.shadowRoot.querySelectorAll('extensions-item')].map((i) => i.id)[0];
  });
  await page.close();
  return { context, extensionId, userDataDir };
}

// Writes settings through the real popup page so storage behaves exactly as in use.
async function setSettings(context, extensionId, settings) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.evaluate((s) => chrome.storage.local.set({ dpmcSettings: s }), settings);
  await popup.close();
}

module.exports = { EXTENSION_PATH, startServer, launch, setSettings };
