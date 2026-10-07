// Original pixel-art sprites (string grids) and canvas drawing helpers.
(function (root) {
  'use strict';
  const NS = (root.DPMC = root.DPMC || {});

  const PALETTE = {
    o: '#e8923a', d: '#b8651f', w: '#fff4e0', k: '#2b1d1a',
    g: '#9aa3b8', y: '#c7ff3d', p: '#ff8fab', l: '#e3e7f2',
    m: '#b43fc9', M: '#e58bf0', W: '#ffffff',
  };

  const CORGI_BODY = [
    '..........d..d..',
    '..........oooooo',
    '..........ookooo',
    '.ooooooooowwwwwk',
    'oooooooooooowwww',
    '.owwwwwwwwwoo...',
    '..oooooooooo....',
  ];
  const CORGI_LEGS = [
    ['..oo......oo....', '..ww......ww....', '..ww......ww....'],
    ['....oo..oo......', '....ww..ww......', '....ww..ww......'],
  ];

  const KITTY_BODY = [
    'g.........g....g',
    'g.........gggggg',
    'gg........gyggyg',
    '.g.gggggggggpggg',
    '.gggggggggggggg.',
    '..gggggggggggg..',
    '..gllllllllllg..',
  ];
  const KITTY_LEGS = [
    ['..gg......gg....', '..ll......ll....', '................'],
    ['....gg..gg......', '....ll..ll......', '................'],
  ];

  const OCTOPUS_HEAD = [
    '...mmmmmm...',
    '..mMMMMMMm..',
    '.mMMMMMMMMm.',
    '.mMWkMMWkMm.',
    '.mMMMMMMMMm.',
    '.mmmmmmmmmm.',
  ];
  const TENTACLE_COLS = [1, 3, 5, 7, 9];
  const TENTACLE_LEN = 6;

  const SPRITES = {
    corgi: [CORGI_BODY.concat(CORGI_LEGS[0]), CORGI_BODY.concat(CORGI_LEGS[1])],
    kitty: [KITTY_BODY.concat(KITTY_LEGS[0]), KITTY_BODY.concat(KITTY_LEGS[1])],
  };

  const SCALE = 3;
  const PET_SIZE = {
    corgi: { w: 16 * SCALE, h: 10 * SCALE },
    kitty: { w: 16 * SCALE, h: 10 * SCALE },
    octopus: { w: 12 * SCALE, h: (OCTOPUS_HEAD.length + TENTACLE_LEN) * SCALE },
  };

  const cache = new Map();

  function bake(rows) {
    const key = rows.join('|');
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = rows[0].length;
    c.height = rows.length;
    const g = c.getContext('2d');
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const color = PALETTE[rows[y][x]];
        if (!color) continue;
        g.fillStyle = color;
        g.fillRect(x, y, 1, 1);
      }
    }
    cache.set(key, c);
    return c;
  }

  function drawOctopus(ctx, x, y, phase, scale) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.drawImage(bake(OCTOPUS_HEAD), x, y, 12 * scale, OCTOPUS_HEAD.length * scale);
    ctx.fillStyle = PALETTE.m;
    TENTACLE_COLS.forEach((col, i) => {
      for (let j = 0; j < TENTACLE_LEN; j++) {
        const dx = Math.round(Math.sin(phase * 5 + i * 0.9 - j * 0.8) * (0.4 + j * 0.25));
        ctx.fillStyle = j % 2 ? PALETTE.m : PALETTE.M;
        ctx.fillRect(x + (col + dx) * scale, y + (OCTOPUS_HEAD.length + j) * scale, scale, scale);
      }
    });
  }

  function drawPet(ctx, pet, scale = SCALE) {
    if (pet.species === 'octopus') return drawOctopus(ctx, pet.x, pet.y, pet.phase, scale);
    const frames = SPRITES[pet.species];
    const sprite = bake(frames[Math.floor(pet.phase * 6) % frames.length]);
    const w = sprite.width * scale;
    const h = sprite.height * scale;
    const x = Math.round(pet.x);
    const y = Math.round(pet.y);
    if (pet.dir < 0) {
      ctx.save();
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, x, y, w, h);
    }
  }

  Object.assign(NS, {
    PALETTE, SPRITES, OCTOPUS_HEAD, TENTACLE_COLS, TENTACLE_LEN,
    PET_SIZE, PET_SCALE: SCALE, drawPet, drawOctopus,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
