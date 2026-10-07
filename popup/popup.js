(function () {
  'use strict';
  const D = globalThis.DPMC;
  const power = document.getElementById('power');
  const radios = document.querySelectorAll('input[name="mode"]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let settings = D.normalizeSettings(null);

  function render() {
    power.checked = settings.enabled;
    radios.forEach((r) => { r.checked = r.value === settings.mode; });
  }

  function save() {
    chrome.storage.local.set({ [D.STORAGE_KEY]: settings });
  }

  power.addEventListener('change', () => {
    settings = { ...settings, enabled: power.checked };
    save();
  });
  radios.forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    settings = { ...settings, mode: r.value };
    save();
  }));

  chrome.storage.local.get(D.STORAGE_KEY, (res) => {
    settings = D.normalizeSettings(res && res[D.STORAGE_KEY]);
    render();
  });

  // Preview animation (static when reduced motion is requested).
  const previews = [...document.querySelectorAll('canvas[data-preview]')].map((canvas) => {
    const species = D.petPool(canvas.dataset.preview);
    return { canvas, ctx: canvas.getContext('2d'), species, mode: canvas.dataset.preview };
  });

  function draw(tick) {
    for (const p of previews) {
      const { ctx, canvas } = p;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      if (p.mode === 'off') {
        ctx.fillStyle = '#6b5fa8';
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('OFF', canvas.width / 2, 25);
        continue;
      }
      if (D.hasWater(p.mode)) {
        ctx.fillStyle = 'rgba(60,150,230,0.25)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const kinds = p.mode === 'all' || p.mode === 'corgi-kitty' ? p.species : [p.species[0]];
      const scale = kinds.length > 2 ? 1 : 2;
      const widths = kinds.map((s) => D.PET_SIZE[s].w * scale / 3);
      const gap = (canvas.width - widths.reduce((a, b) => a + b, 0)) / (kinds.length + 1);
      let x = gap;
      kinds.forEach((species, i) => {
        const size = D.PET_SIZE[species];
        const y = species === 'octopus' ? 2 : canvas.height - 4 - size.h * scale / 3;
        D.drawPet(ctx, { species, x, y, dir: 1, phase: tick * 0.25 + i }, scale);
        x += widths[i] + gap;
      });
    }
  }

  draw(0);
  if (!reduced) {
    let tick = 0;
    setInterval(() => draw(++tick), 150);
  }
})();
