const { test, expect } = require('@playwright/test');
const { startServer, launch, setSettings } = require('../helpers/extension');

const COUNTER = { x: 700, y: 62, width: 300, height: 80 };
const BAND = { x: 0, y: 0, width: 1000, height: 60 };
const BELOW_BAND = { x: 0, y: 62, width: 650, height: 40 };

let ctx;
let server;
let url;
let extensionId;

test.beforeAll(async () => {
  ({ server, url } = await startServer());
  ({ context: ctx, extensionId } = await launch());
});

test.afterAll(async () => {
  await ctx.close();
  server.close();
});

async function open(settings, { reducedMotion } = {}) {
  await setSettings(ctx, extensionId, settings);
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: reducedMotion || 'no-preference' });
  await page.goto(url);
  await page.waitForTimeout(500);
  return page;
}

const shot = (page, clip) => page.screenshot({ clip });
const differs = (a, b) => Buffer.compare(a, b) !== 0;

test('typing builds a visible combo counter; it resets after inactivity', async () => {
  const page = await open({ enabled: true, mode: 'off' });
  const base = await shot(page, COUNTER);
  await page.click('#single');
  await page.keyboard.type('hello', { delay: 40 });
  await page.waitForTimeout(100);
  expect(differs(base, await shot(page, COUNTER))).toBe(true);
  await page.waitForTimeout(2300);
  expect(differs(base, await shot(page, COUNTER))).toBe(false);
  await page.close();
});

test('switching editors resets the combo', async () => {
  const page = await open({ enabled: true, mode: 'off' });
  const base = await shot(page, COUNTER);
  await page.click('#single');
  await page.keyboard.type('abcd', { delay: 40 });
  await page.click('#multi');
  await page.keyboard.type('x', { delay: 40 });
  await page.waitForTimeout(600);
  expect(differs(base, await shot(page, COUNTER))).toBe(false);
  await page.close();
});

test('contenteditable and textarea are tracked', async () => {
  const page = await open({ enabled: true, mode: 'off' });
  const base = await shot(page, COUNTER);
  for (const sel of ['#rich', '#multi']) {
    await page.click(sel);
    await page.keyboard.type('abc', { delay: 40 });
    await page.waitForTimeout(100);
    expect(differs(base, await shot(page, COUNTER))).toBe(true);
    await page.waitForTimeout(2200);
  }
  await page.close();
});

test('password fields, shortcuts, programmatic and untrusted edits are ignored', async () => {
  const page = await open({ enabled: true, mode: 'off' });
  const base = await shot(page, COUNTER);

  await page.click('#secret');
  await page.keyboard.type('hunter2', { delay: 30 });

  await page.click('#single');
  await page.keyboard.insertText('pasted text');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Control+Backspace');

  await page.evaluate(() => {
    const el = document.getElementById('single');
    for (let i = 0; i < 6; i++) {
      el.value += 'z';
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'z', bubbles: true }));
    }
  });
  await page.waitForTimeout(300);
  expect(differs(base, await shot(page, COUNTER))).toBe(false);
  await page.close();
});

test('overlay is click-through and does not disturb the page', async () => {
  const page = await open({ enabled: true, mode: 'all' });
  await page.click('#banner-btn');
  await expect(page.locator('#clicks')).toHaveText('clicks: 1');
  const top = await page.evaluate(() => document.elementFromPoint(500, 30).tagName);
  expect(top).not.toBe('DIV');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.close();
});

test('pets animate while idle and stay inside the top band', async () => {
  const page = await open({ enabled: true, mode: 'all' });
  const a = await shot(page, BAND);
  await page.waitForTimeout(700);
  const b = await shot(page, BAND);
  expect(differs(a, b)).toBe(true);

  const below = await shot(page, BELOW_BAND);
  await page.waitForTimeout(700);
  expect(differs(below, await shot(page, BELOW_BAND))).toBe(false);
  await page.close();
});

test('pets mode off leaves the band untouched', async () => {
  const page = await open({ enabled: false, mode: 'off' });
  const a = await shot(page, BAND);
  await page.waitForTimeout(700);
  expect(differs(a, await shot(page, BAND))).toBe(false);
  await page.close();
});

test('Power Mode off shows pets but no counter', async () => {
  const page = await open({ enabled: false, mode: 'corgi' });
  const base = await shot(page, COUNTER);
  await page.click('#single');
  await page.keyboard.type('hello', { delay: 40 });
  await page.waitForTimeout(200);
  expect(differs(base, await shot(page, COUNTER))).toBe(false);
  await page.close();
});

test('reduced motion shows a static counter and no animation', async () => {
  const page = await open({ enabled: true, mode: 'all' }, { reducedMotion: 'reduce' });
  const a = await shot(page, BAND);
  await page.waitForTimeout(600);
  expect(differs(a, await shot(page, BAND))).toBe(false);

  const base = await shot(page, COUNTER);
  await page.click('#single');
  await page.keyboard.type('abc', { delay: 40 });
  await page.waitForTimeout(100);
  const shown = await shot(page, COUNTER);
  expect(differs(base, shown)).toBe(true);
  await page.waitForTimeout(300);
  expect(differs(shown, await shot(page, COUNTER))).toBe(false);
  await page.close();
});

test('popup persists choices to chrome.storage.local', async () => {
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.locator('label.card', { hasText: 'Octopus' }).click();
  await popup.locator('label.switch').click();
  const saved = await popup.evaluate(() => chrome.storage.local.get('dpmcSettings'));
  expect(saved.dpmcSettings.mode).toBe('octopus');
  expect(typeof saved.dpmcSettings.enabled).toBe('boolean');
  await popup.reload();
  await expect(popup.locator('input[value="octopus"]')).toBeChecked();
  await popup.close();
});
