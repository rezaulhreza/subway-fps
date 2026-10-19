// Procedural canvas textures. Nothing is loaded from disk: every surface is painted here.
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// Draw at the wrapped offsets so blotches tile seamlessly.
function wrap(w, h, x, y, r, fn) {
  for (const ox of [0, -w, w]) {
    for (const oy of [0, -h, h]) {
      const px = x + ox, py = y + oy;
      if (px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
      fn(px, py);
    }
  }
}

function heightFromCanvas(c) {
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const h = new Float32Array(c.width * c.height);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  return h;
}

function normalFromHeight(h, w, hh, strength) {
  const c = makeCanvas(w, hh);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, hh);
  const d = img.data;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const l = h[y * w + ((x - 1 + w) % w)];
      const r = h[y * w + ((x + 1) % w)];
      const u = h[((y - 1 + hh) % hh) * w + x];
      const dn = h[((y + 1) % hh) * w + x];
      let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

function blurCanvas(src, px) {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  // Draw tiled 3x3 so the blur wraps at the edges.
  ctx.filter = `blur(${px}px)`;
  for (const ox of [-src.width, 0, src.width]) {
    for (const oy of [-src.height, 0, src.height]) ctx.drawImage(src, ox, oy);
  }
  ctx.filter = 'none';
  return c;
}

function hsl(h, s, l, a = 1) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

function noiseOverlay(ctx, w, h, r, amount, count, dark = true) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, s = 1 + r() * 2;
    const v = dark ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * amount})`;
    ctx.fillRect(x, y, s, s);
  }
}

function grimeBlotches(ctx, w, h, r, count, color, maxR, maxA) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, rad = maxR * (0.2 + r() * 0.8);
    wrap(w, h, x, y, rad, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, color.replace('A', (maxA * r()).toFixed(3)));
      g.addColorStop(1, color.replace('A', '0'));
      ctx.fillStyle = g;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
}

// Glazed wall tiles with grout, bevel normal map and glaze roughness.
export function tileTextures({
  size = 1024, cols = 8, rows = 16, hue = 45, sat = 25, light = 86, vary = 4,
  grout = '#7c776d', grime = 0.4, bond = true, seed = 1, bevel = 3, glossy = 0.22,
}) {
  const r = rng(seed);
  const w = size, h = size;
  const col = makeCanvas(w, h), cx = col.getContext('2d');
  const hgt = makeCanvas(w, h), hx = hgt.getContext('2d');
  const rough = makeCanvas(w, h), rx = rough.getContext('2d');
  cx.fillStyle = grout; cx.fillRect(0, 0, w, h);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, w, h);
  rx.fillStyle = '#e0e0e0'; rx.fillRect(0, 0, w, h);
  const tw = w / cols, th = h / rows, gap = Math.max(2, size / 300);
  for (let j = 0; j < rows; j++) {
    const off = bond && j % 2 ? tw / 2 : 0;
    for (let i = 0; i < cols; i++) {
      const x = i * tw + off, y = j * th;
      const l = light + (r() - 0.5) * vary * 2;
      const hh = hue + (r() - 0.5) * 6;
      const draw = (px) => {
        const g = cx.createLinearGradient(px, y, px + tw, y + th);
        g.addColorStop(0, hsl(hh, sat, Math.min(98, l + 3)));
        g.addColorStop(1, hsl(hh, sat, l - 3));
        cx.fillStyle = g;
        cx.fillRect(px + gap / 2, y + gap / 2, tw - gap, th - gap);
        hx.fillStyle = '#fff';
        hx.fillRect(px + gap, y + gap, tw - gap * 2, th - gap * 2);
        const gv = Math.floor(255 * (glossy + r() * 0.08));
        rx.fillStyle = `rgb(${gv},${gv},${gv})`;
        rx.fillRect(px + gap / 2, y + gap / 2, tw - gap, th - gap);
        if (r() < 0.08) {
          // chipped corner
          cx.fillStyle = grout;
          const cxp = px + (r() < 0.5 ? gap : tw - gap - 10), cyp = y + (r() < 0.5 ? gap : th - gap - 8);
          cx.beginPath(); cx.moveTo(cxp, cyp); cx.lineTo(cxp + 10 * r() + 4, cyp); cx.lineTo(cxp, cyp + 8 * r() + 3); cx.fill();
        }
        if (r() < 0.04) {
          // hairline crack
          cx.strokeStyle = 'rgba(40,35,30,0.5)'; cx.lineWidth = 1;
          cx.beginPath();
          let qx = px + r() * tw, qy = y + gap;
          cx.moveTo(qx, qy);
          for (let k = 0; k < 6; k++) { qx += (r() - 0.5) * tw * 0.4; qy += th / 6; cx.lineTo(qx, qy); }
          cx.stroke();
        }
      };
      draw(x);
      if (x + tw > w) draw(x - w);
    }
  }
  const blurred = blurCanvas(hgt, bevel);
  // glaze speckle
  noiseOverlay(cx, w, h, r, 0.08, size * 30);
  // grime: blotches and vertical drips
  grimeBlotches(cx, w, h, r, Math.floor(40 * grime), 'rgba(60,48,30,A)', size * 0.18, 0.35 * grime);
  grimeBlotches(rx, w, h, r, Math.floor(30 * grime), 'rgba(200,200,200,A)', size * 0.15, 0.5 * grime);
  cx.lineCap = 'round';
  for (let i = 0; i < 60 * grime; i++) {
    const x = r() * w, y = r() * h, len = 30 + r() * size * 0.3;
    cx.strokeStyle = `rgba(70,55,35,${0.05 + r() * 0.15 * grime})`;
    cx.lineWidth = 1 + r() * 3;
    cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + (r() - 0.5) * 4, y + len); cx.stroke();
  }
  return {
    map: toTexture(col),
    normalMap: normalFromHeight(heightFromCanvas(blurred), w, h, 6),
    roughnessMap: toTexture(rough, { srgb: false }),
  };
}

// Terrazzo platform slabs with chewing gum, stains and wet patches.
export function floorTextures(seed = 3, wet = 0.5) {
  const r = rng(seed);
  const w = 1024, h = 1024;
  const col = makeCanvas(w, h), cx = col.getContext('2d');
  const rough = makeCanvas(w, h), rx = rough.getContext('2d');
  const hgt = makeCanvas(w, h), hx = hgt.getContext('2d');
  cx.fillStyle = '#8d877d'; cx.fillRect(0, 0, w, h);
  rx.fillStyle = '#b0b0b0'; rx.fillRect(0, 0, w, h);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, w, h);
  grimeBlotches(cx, w, h, r, 30, 'rgba(120,115,105,A)', 200, 0.6);
  grimeBlotches(cx, w, h, r, 30, 'rgba(60,55,50,A)', 160, 0.35);
  // terrazzo chips
  const chips = ['#b9b3a6', '#5d5a55', '#a39a8a', '#d6d0c4', '#6f6250', '#3b3936'];
  for (let i = 0; i < 26000; i++) {
    cx.fillStyle = chips[Math.floor(r() * chips.length)];
    const s = 1 + r() * 3.5;
    cx.globalAlpha = 0.5 + r() * 0.5;
    cx.beginPath();
    cx.ellipse(r() * w, r() * h, s, s * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2);
    cx.fill();
  }
  cx.globalAlpha = 1;
  // slab joints, 4 x 4 per texture
  cx.strokeStyle = 'rgba(30,28,25,0.85)'; cx.lineWidth = 3;
  hx.strokeStyle = '#000'; hx.lineWidth = 5;
  for (let i = 0; i <= 4; i++) {
    const p = (i * w) / 4;
    for (const c of [cx, hx]) {
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, h); c.moveTo(0, p); c.lineTo(w, p); c.stroke();
    }
  }
  // gum spots
  for (let i = 0; i < 220; i++) {
    const x = r() * w, y = r() * h, s = 2 + r() * 5;
    cx.fillStyle = `rgba(${30 + r() * 30},${28 + r() * 25},${26 + r() * 20},0.9)`;
    cx.beginPath(); cx.ellipse(x, y, s, s * 0.8, r() * 3, 0, Math.PI * 2); cx.fill();
  }
  // stains
  grimeBlotches(cx, w, h, r, 14, 'rgba(45,35,20,A)', 90, 0.5);
  // wet patches: darker and glossy
  for (let i = 0; i < 9 * wet; i++) {
    const x = r() * w, y = r() * h, rad = 60 + r() * 160;
    wrap(w, h, x, y, rad, (px, py) => {
      const g = rx.createRadialGradient(px, py, rad * 0.2, px, py, rad);
      g.addColorStop(0, 'rgba(15,15,15,1)'); g.addColorStop(0.7, 'rgba(15,15,15,0.9)'); g.addColorStop(1, 'rgba(15,15,15,0)');
      rx.fillStyle = g;
      rx.beginPath(); rx.ellipse(px, py, rad, rad * (0.4 + r() * 0.5), r() * 3, 0, Math.PI * 2); rx.fill();
      const g2 = cx.createRadialGradient(px, py, 0, px, py, rad);
      g2.addColorStop(0, 'rgba(25,22,18,0.35)'); g2.addColorStop(1, 'rgba(25,22,18,0)');
      cx.fillStyle = g2;
      cx.beginPath(); cx.ellipse(px, py, rad, rad * 0.7, r() * 3, 0, Math.PI * 2); cx.fill();
    });
  }
  noiseOverlay(hx, w, h, r, 0.5, 40000);
  noiseOverlay(hx, w, h, r, 0.5, 40000, false);
  return {
    map: toTexture(col),
    roughnessMap: toTexture(rough, { srgb: false }),
    normalMap: normalFromHeight(heightFromCanvas(blurCanvas(hgt, 1)), w, h, 3),
  };
}

export function tactileTextures() {
  const w = 256, h = 256;
  const col = makeCanvas(w, h), cx = col.getContext('2d');
  const hgt = makeCanvas(w, h), hx = hgt.getContext('2d');
  const r = rng(9);
  cx.fillStyle = '#c9a114'; cx.fillRect(0, 0, w, h);
  grimeBlotches(cx, w, h, r, 20, 'rgba(70,60,30,A)', 60, 0.5);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, w, h);
  const n = 6, s = w / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * s, y = (j + 0.5) * s;
      const g = hx.createRadialGradient(x, y, 0, x, y, s * 0.34);
      g.addColorStop(0, '#fff'); g.addColorStop(0.7, '#ccc'); g.addColorStop(1, '#000');
      hx.fillStyle = g; hx.beginPath(); hx.arc(x, y, s * 0.34, 0, Math.PI * 2); hx.fill();
      cx.fillStyle = 'rgba(255,230,120,0.25)'; cx.beginPath(); cx.arc(x - 3, y - 3, s * 0.2, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = 'rgba(60,50,10,0.35)'; cx.beginPath(); cx.arc(x + 4, y + 5, s * 0.3, 0, Math.PI * 2); cx.fill();
    }
  }
  noiseOverlay(cx, w, h, r, 0.2, 4000);
  return { map: toTexture(col), normalMap: normalFromHeight(heightFromCanvas(hgt), w, h, 5) };
}

export function concreteTextures(seed = 4, base = '#7a7670', size = 512, stain = 0.5) {
  const r = rng(seed);
  const w = size, h = size;
  const col = makeCanvas(w, h), cx = col.getContext('2d');
  const hgt = makeCanvas(w, h), hx = hgt.getContext('2d');
  cx.fillStyle = base; cx.fillRect(0, 0, w, h);
  grimeBlotches(cx, w, h, r, 30, 'rgba(255,250,240,A)', size * 0.2, 0.08);
  grimeBlotches(cx, w, h, r, 30, 'rgba(30,25,20,A)', size * 0.25, 0.25 * stain + 0.05);
  noiseOverlay(cx, w, h, r, 0.25, size * 60);
  noiseOverlay(cx, w, h, r, 0.15, size * 30, false);
  // air holes
  for (let i = 0; i < size * 1.2; i++) {
    cx.fillStyle = 'rgba(20,20,20,0.6)';
    cx.beginPath(); cx.arc(r() * w, r() * h, 0.5 + r() * 1.5, 0, Math.PI * 2); cx.fill();
  }
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, w, h);
  noiseOverlay(hx, w, h, r, 0.6, size * 80);
  noiseOverlay(hx, w, h, r, 0.6, size * 80, false);
  return { map: toTexture(col), normalMap: normalFromHeight(heightFromCanvas(blurCanvas(hgt, 1)), w, h, 2) };
}

export function ballastTextures() {
  const r = rng(12);
  const w = 512, h = 512;
  const col = makeCanvas(w, h), cx = col.getContext('2d');
  const hgt = makeCanvas(w, h), hx = hgt.getContext('2d');
  cx.fillStyle = '#1e1b18'; cx.fillRect(0, 0, w, h);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const x = r() * w, y = r() * h, s = 4 + r() * 9;
    const l = 22 + r() * 30, hue = 20 + r() * 20;
    const pts = [];
    const k = 5 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2, rr = s * (0.6 + r() * 0.5);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    wrap(w, h, x, y, s * 1.2, (px, py) => {
      const g = cx.createLinearGradient(px - s, py - s, px + s, py + s);
      g.addColorStop(0, hsl(hue, 8 + r() * 15, l + 12)); g.addColorStop(1, hsl(hue, 10, l - 10));
      cx.fillStyle = g;
      cx.beginPath(); pts.forEach(([a, b], j) => (j ? cx.lineTo(px + a, py + b) : cx.moveTo(px + a, py + b))); cx.fill();
      const hg = hx.createRadialGradient(px, py, 0, px, py, s);
      hg.addColorStop(0, '#fff'); hg.addColorStop(1, '#333');
      hx.fillStyle = hg;
      hx.beginPath(); pts.forEach(([a, b], j) => (j ? hx.lineTo(px + a, py + b) : hx.moveTo(px + a, py + b))); hx.fill();
    });
  }
  grimeBlotches(cx, w, h, r, 20, 'rgba(90,45,15,A)', 80, 0.35);
  grimeBlotches(cx, w, h, r, 10, 'rgba(0,0,0,A)', 100, 0.5);
  return { map: toTexture(col), normalMap: normalFromHeight(heightFromCanvas(hgt), w, h, 4) };
}

// Cast iron tunnel lining: flanged rings with bolts.
export function tunnelTextures() {
  const r = rng(21);
  const w = 512, h = 512;
  const col = makeCanvas(w, h), cx = col.getContext('2d');
  const hgt = makeCanvas(w, h), hx = hgt.getContext('2d');
  cx.fillStyle = '#26231f'; cx.fillRect(0, 0, w, h);
  hx.fillStyle = '#555'; hx.fillRect(0, 0, w, h);
  grimeBlotches(cx, w, h, r, 30, 'rgba(70,40,20,A)', 120, 0.45);
  grimeBlotches(cx, w, h, r, 30, 'rgba(5,5,5,A)', 140, 0.6);
  // 2 rings per texture (u axis = along tunnel), 4 segments around (v axis)
  for (let i = 0; i < 2; i++) {
    const x = (i * w) / 2;
    cx.fillStyle = '#3a352f'; cx.fillRect(x, 0, 16, h);
    hx.fillStyle = '#fff'; hx.fillRect(x, 0, 16, h);
    for (let j = 0; j < 4; j++) {
      const y = (j * h) / 4;
      cx.fillStyle = '#332f2a'; cx.fillRect(0, y, w, 10);
      hx.fillStyle = '#ddd'; hx.fillRect(0, y, w, 10);
      for (let b = 0; b < 8; b++) {
        const by = y + (b + 0.5) * (h / 32);
        cx.fillStyle = '#4a443c'; cx.beginPath(); cx.arc(x + 8, by, 4, 0, Math.PI * 2); cx.fill();
        hx.fillStyle = '#fff'; hx.beginPath(); hx.arc(x + 8, by, 4, 0, Math.PI * 2); hx.fill();
      }
    }
  }
  noiseOverlay(cx, w, h, r, 0.3, 20000);
  // water seep streaks
  for (let i = 0; i < 25; i++) {
    const x = r() * w;
    cx.strokeStyle = `rgba(120,110,90,${r() * 0.12})`; cx.lineWidth = 2 + r() * 10;
    cx.beginPath(); cx.moveTo(x, r() * h); cx.lineTo(x + (r() - 0.5) * 6, r() * h); cx.stroke();
  }
  return { map: toTexture(col), normalMap: normalFromHeight(heightFromCanvas(blurCanvas(hgt, 2)), w, h, 5) };
}

export function rubberFloorTexture() {
  const w = 256, h = 256, r = rng(31);
  const col = makeCanvas(w, h), cx = col.getContext('2d');
  const hgt = makeCanvas(w, h), hx = hgt.getContext('2d');
  cx.fillStyle = '#34363a'; cx.fillRect(0, 0, w, h);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, w, h);
  noiseOverlay(cx, w, h, r, 0.4, 6000, false);
  noiseOverlay(cx, w, h, r, 0.4, 6000);
  const n = 8, s = w / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5 + (j % 2) * 0.5) * s, y = (j + 0.5) * s;
    wrap(w, h, x, y, 8, (px, py) => {
      hx.fillStyle = '#fff'; hx.beginPath(); hx.arc(px, py, 7, 0, Math.PI * 2); hx.fill();
      cx.fillStyle = 'rgba(80,82,88,0.6)'; cx.beginPath(); cx.arc(px, py, 7, 0, Math.PI * 2); cx.fill();
    });
  }
  return { map: toTexture(col), normalMap: normalFromHeight(heightFromCanvas(blurCanvas(hgt, 1.5)), w, h, 4) };
}

// Seat fabric: dense geometric pattern in the spirit of transit moquette.
export function moquetteTexture(seed = 5) {
  const w = 256, h = 256, r = rng(seed);
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#1b2440'; x.fillRect(0, 0, w, h);
  const cols = ['#c2372f', '#e6a821', '#2aa39a', '#e9e2cf'];
  const n = 4, s = w / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const px = i * s, py = j * s;
    x.fillStyle = cols[(i + j) % 4];
    x.save(); x.translate(px + s / 2, py + s / 2);
    if ((i + j) % 2) {
      x.fillRect(-s * 0.35, -s * 0.06, s * 0.7, s * 0.12);
      x.fillRect(-s * 0.06, -s * 0.35, s * 0.12, s * 0.7);
    } else {
      x.rotate(Math.PI / 4);
      x.strokeStyle = cols[(i + j + 1) % 4]; x.lineWidth = s * 0.07;
      x.strokeRect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.4);
    }
    x.restore();
    x.fillStyle = cols[(i * 3 + j) % 4];
    x.beginPath(); x.arc(px, py, s * 0.08, 0, Math.PI * 2); x.fill();
  }
  // fuzz
  for (let i = 0; i < 20000; i++) {
    x.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},0.06)`;
    x.fillRect(r() * w, r() * h, 1, 1);
  }
  grimeBlotches(x, w, h, r, 6, 'rgba(10,8,5,A)', 50, 0.35);
  return toTexture(c);
}

export function skinTexture(seed, hue = 95) {
  const w = 256, h = 256, r = rng(seed);
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = hsl(hue, 12, 52); x.fillRect(0, 0, w, h);
  grimeBlotches(x, w, h, r, 30, `hsla(${hue - 60},30%,30%,A)`, 50, 0.4);
  grimeBlotches(x, w, h, r, 20, 'hsla(280,20%,25%,A)', 40, 0.35);
  grimeBlotches(x, w, h, r, 12, 'hsla(0,60%,22%,A)', 30, 0.5);
  // veins
  x.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `hsla(${200 + r() * 60},30%,22%,${0.15 + r() * 0.25})`;
    x.lineWidth = 0.6 + r() * 1.4;
    x.beginPath();
    let px = r() * w, py = r() * h;
    x.moveTo(px, py);
    for (let k = 0; k < 7; k++) { px += (r() - 0.5) * 30; py += (r() - 0.5) * 30; x.lineTo(px, py); }
    x.stroke();
  }
  noiseOverlay(x, w, h, r, 0.2, 8000);
  return toTexture(c);
}

export function clothTexture(seed, color) {
  const w = 256, h = 256, r = rng(seed);
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, w, h);
  // weave
  for (let i = 0; i < h; i += 2) {
    x.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`; x.fillRect(0, i, w, 1);
  }
  grimeBlotches(x, w, h, r, 25, 'rgba(30,25,15,A)', 50, 0.55);
  // blood
  for (let i = 0; i < 6; i++) {
    const px = r() * w, py = r() * h, rad = 10 + r() * 40;
    wrap(w, h, px, py, rad * 2, (qx, qy) => {
      x.fillStyle = `rgba(${60 + r() * 40},5,5,${0.5 + r() * 0.4})`;
      x.beginPath(); x.ellipse(qx, qy, rad, rad * (0.5 + r()), r() * 3, 0, Math.PI * 2); x.fill();
      for (let k = 0; k < 6; k++) {
        x.beginPath(); x.arc(qx + (r() - 0.5) * rad * 3, qy + (r() - 0.5) * rad * 3, 1 + r() * 4, 0, Math.PI * 2); x.fill();
      }
    });
  }
  // tears: dark slits
  for (let i = 0; i < 8; i++) {
    x.fillStyle = 'rgba(10,8,8,0.85)';
    const px = r() * w, py = r() * h;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + 6 + r() * 8, py + 20 + r() * 20); x.lineTo(px - 4, py + 10 + r() * 30); x.fill();
  }
  return toTexture(c);
}

function fitText(ctx, text, maxW, size, font) {
  let s = size;
  do { ctx.font = `${font.replace('SIZE', s)}`; s -= 2; } while (ctx.measureText(text).width > maxW && s > 8);
}

const CONDENSED = '"Barlow Condensed","Arial Narrow",Arial,sans-serif';
const SANS = 'Barlow,"Helvetica Neue",Arial,sans-serif';

export function nameSignTexture(name, color) {
  const w = 1024, h = 192;
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#f2efe6'; x.fillRect(0, 0, w, h);
  x.fillStyle = color; x.fillRect(0, 0, w, 26); x.fillRect(0, h - 26, w, 26);
  x.fillStyle = '#16181d';
  fitText(x, name.toUpperCase(), w - 80, 120, `700 SIZEpx ${CONDENSED}`);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(name.toUpperCase(), w / 2, h / 2 + 4);
  const r = rng(name.length * 77);
  grimeBlotches(x, w, h, r, 10, 'rgba(60,50,30,A)', 120, 0.25);
  // enamel chips
  for (let i = 0; i < 14; i++) {
    x.fillStyle = 'rgba(25,25,25,0.8)';
    x.beginPath(); x.arc(r() * w, r() < 0.5 ? r() * 30 : h - r() * 30, 1 + r() * 4, 0, Math.PI * 2); x.fill();
  }
  return toTexture(c, { repeat: false });
}

export function textSignTexture(text, { bg = '#0d6b3a', fg = '#ffffff', w = 512, h = 128, arrow = '', size = 72 } = {}) {
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = fg; x.lineWidth = 4; x.strokeRect(8, 8, w - 16, h - 16);
  x.fillStyle = fg;
  x.textBaseline = 'middle';
  fitText(x, text, w - (arrow ? 170 : 60), size, `700 SIZEpx ${CONDENSED}`);
  x.textAlign = arrow ? 'left' : 'center';
  x.fillText(text, arrow ? 40 : w / 2, h / 2 + 3);
  if (arrow) {
    x.save(); x.translate(w - 70, h / 2); if (arrow === 'left') x.rotate(Math.PI);
    x.beginPath(); x.moveTo(-34, -8); x.lineTo(6, -8); x.lineTo(6, -26); x.lineTo(36, 0); x.lineTo(6, 26); x.lineTo(6, 8); x.lineTo(-34, 8); x.fill();
    x.restore();
  }
  return toTexture(c, { repeat: false });
}

export function decalTextTexture(text) {
  const w = 1024, h = 128;
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  x.fillStyle = 'rgba(240,238,228,0.92)';
  x.font = `700 104px ${CONDENSED}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 4);
  // worn paint
  x.globalCompositeOperation = 'destination-out';
  const r = rng(3);
  for (let i = 0; i < 1800; i++) {
    x.fillStyle = `rgba(0,0,0,${r() * 0.9})`;
    x.beginPath(); x.arc(r() * w, r() * h, 1 + r() * 4, 0, Math.PI * 2); x.fill();
  }
  return toTexture(c, { repeat: false });
}

const STATION_POOL = [
  'Halden Cross', 'Marlow Yard', 'Kestrel Lane', 'Ostwick', 'Saltmarsh', 'Greyfriars Gate', 'Pell Street',
  'Ashby Green', 'Corvin Park', 'Wexmoor', 'Tannery Row', 'Lantern Hill', 'Brindle', 'St. Odo', 'Fenwick Docks',
  'Harrow Vale', 'Quarry Bank', 'Mortlake Rise', 'Eldergate', 'Copper Lane',
];

export function networkMapTexture(seed = 8, highlight = '') {
  const w = 1024, h = 720, r = rng(seed);
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#f6f4ee'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#16181d'; x.font = `700 40px ${CONDENSED}`; x.textBaseline = 'top';
  x.fillText('UNDERGROUND NETWORK', 36, 26);
  x.font = `400 18px ${SANS}`; x.fillStyle = '#555';
  x.fillText('Service status: SUSPENDED until further notice', 36, 72);
  const colors = ['#c2372f', '#1f5fae', '#2b8a3e', '#e6a821', '#7a3e9d', '#6b6b6b', '#d9578f'];
  const names = [...STATION_POOL];
  for (let li = 0; li < colors.length; li++) {
    x.strokeStyle = colors[li]; x.lineWidth = 9; x.lineJoin = 'round';
    let px = 60 + r() * 120, py = 140 + r() * 520;
    const pts = [[px, py]];
    for (let k = 0; k < 6; k++) {
      const dir = Math.floor(r() * 3) - 1;
      const len = 80 + r() * 90;
      px += len; py += dir * len * 0.7;
      py = Math.min(h - 50, Math.max(130, py));
      pts.push([px, py]);
      if (px > w - 80) break;
    }
    x.beginPath(); pts.forEach(([a, b], j) => (j ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
    for (let k = 0; k < pts.length; k++) {
      const [a, b] = pts[k];
      x.fillStyle = '#fff'; x.strokeStyle = '#16181d'; x.lineWidth = 3;
      x.beginPath(); x.arc(a, b, 8, 0, Math.PI * 2); x.fill(); x.stroke();
      const nm = names[(li * 3 + k) % names.length];
      x.fillStyle = nm === highlight ? '#c2372f' : '#16181d';
      x.font = `${nm === highlight ? 700 : 500} 17px ${SANS}`;
      x.fillText(nm, a + 12, b + 6);
    }
  }
  return toTexture(c, { repeat: false });
}

// Fictional adverts and notices. Each returns a canvas texture.
export function posterTexture(kind, seed = 1, wide = false) {
  const w = wide ? 1024 : 512, h = wide ? 512 : 768, r = rng(seed * 13 + kind * 101);
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.textBaseline = 'alphabetic';
  const K = kind % 9;
  if (K === 0) {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3b2416'); g.addColorStop(1, '#0f0906');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8d3b0'; x.beginPath(); x.arc(w * 0.5, h * 0.42, Math.min(w, h) * 0.22, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#4a2a14'; x.beginPath(); x.arc(w * 0.5, h * 0.42, Math.min(w, h) * 0.18, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#e8d3b0'; x.font = `700 ${w * 0.15}px ${CONDENSED}`; x.textAlign = 'center';
    x.fillText('VELLUM', w / 2, h * 0.16);
    x.font = `400 ${w * 0.055}px ${SANS}`; x.fillText('Wake up. Stay up.', w / 2, h * 0.82);
    x.font = `400 ${w * 0.035}px ${SANS}`; x.fillStyle = '#a58c6a'; x.fillText('Roasted for the night shift', w / 2, h * 0.9);
  } else if (K === 1) {
    x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#b3201d'; x.fillRect(0, 0, w, h * 0.16);
    x.fillStyle = '#fff'; x.font = `700 ${w * 0.11}px ${CONDENSED}`; x.textAlign = 'center';
    x.fillText('PUBLIC NOTICE', w / 2, h * 0.11);
    x.fillStyle = '#16181d'; x.textAlign = 'left';
    x.font = `700 ${w * 0.055}px ${SANS}`;
    const lines = ['Services are suspended', 'due to an ongoing incident.', '', 'Report anyone showing:', ' - fever or grey skin', ' - confusion', ' - unprovoked aggression', '', 'Do NOT approach them.', 'Remain on the platform.'];
    lines.forEach((l, i) => { x.font = `${i < 2 || i === 8 ? 700 : 400} ${w * 0.05}px ${SANS}`; x.fillText(l, w * 0.08, h * 0.25 + i * h * 0.062); });
  } else if (K === 2) {
    x.fillStyle = '#e8c11a'; x.fillRect(0, 0, w, h);
    x.save(); x.fillStyle = '#121212';
    for (let i = -h; i < w + h; i += 60) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 30, 0); x.lineTo(i + 30 - h * 0.12, h * 0.12); x.lineTo(i - h * 0.12, h * 0.12); x.fill();
      x.beginPath(); x.moveTo(i, h * 0.88); x.lineTo(i + 30, h * 0.88); x.lineTo(i + 30 - h * 0.12, h); x.lineTo(i - h * 0.12, h); x.fill();
    }
    x.restore();
    x.fillStyle = '#121212'; x.textAlign = 'center';
    x.font = `800 ${w * 0.16}px ${CONDENSED}`; x.fillText('QUARANTINE', w / 2, h * 0.38);
    x.font = `700 ${w * 0.08}px ${CONDENSED}`; x.fillText('ZONE 4 - SEALED', w / 2, h * 0.5);
    x.font = `400 ${w * 0.045}px ${SANS}`; x.fillText('Exits are closed by order.', w / 2, h * 0.63);
    x.fillText('Trains run for evacuation only.', w / 2, h * 0.7);
  } else if (K === 3) {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1020'); g.addColorStop(0.6, '#3b1d2a'); g.addColorStop(1, '#05050a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f3e3c3'; x.beginPath(); x.arc(w * 0.68, h * 0.25, w * 0.12, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#000';
    x.fillRect(0, h * 0.62, w, h * 0.38);
    for (let i = 0; i < 9; i++) {
      const px = w * (0.1 + i * 0.1), ph = h * (0.1 + r() * 0.06);
      x.beginPath(); x.ellipse(px, h * 0.62 - ph * 0.85, w * 0.025, w * 0.03, 0, 0, Math.PI * 2); x.fill();
      x.fillRect(px - w * 0.03, h * 0.62 - ph * 0.75, w * 0.06, ph * 0.75);
    }
    x.fillStyle = '#e9dcc8'; x.textAlign = 'center';
    x.font = `700 ${w * 0.13}px ${CONDENSED}`; x.fillText('THE LAST TRAIN', w / 2, h * 0.78);
    x.font = `400 ${w * 0.04}px ${SANS}`; x.fillText('They never stopped running.', w / 2, h * 0.85);
    x.font = `400 ${w * 0.03}px ${SANS}`; x.fillStyle = '#9b8f7c'; x.fillText('IN CINEMAS SOON', w / 2, h * 0.93);
  } else if (K === 4) {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5ac8e8'); g.addColorStop(0.55, '#fbe6b0'); g.addColorStop(0.56, '#2b8fb3'); g.addColorStop(1, '#e8d39a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff6d0'; x.beginPath(); x.arc(w * 0.3, h * 0.3, w * 0.1, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#0d3b52'; x.textAlign = 'left';
    x.font = `800 ${w * 0.14}px ${CONDENSED}`; x.fillText('SUNBAY', w * 0.08, h * 0.16);
    x.font = `600 ${w * 0.06}px ${SANS}`; x.fillText('7 nights from £199', w * 0.08, h * 0.24);
    x.fillStyle = '#7a1d10'; x.font = `700 ${w * 0.045}px ${SANS}`; x.fillText('Somewhere far from here.', w * 0.08, h * 0.92);
  } else if (K === 5) {
    x.fillStyle = '#f5f5f2'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#16181d'; x.textAlign = 'center';
    x.font = `800 ${w * 0.18}px ${CONDENSED}`; x.fillText('MISSING', w / 2, h * 0.15);
    x.fillStyle = '#9a9a96'; x.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.42);
    x.fillStyle = '#6b6b67'; x.beginPath(); x.arc(w / 2, h * 0.36, w * 0.13, 0, Math.PI * 2); x.fill();
    x.fillRect(w * 0.3, h * 0.47, w * 0.4, h * 0.15);
    x.fillStyle = '#16181d';
    x.font = `700 ${w * 0.07}px ${SANS}`; x.fillText('HAVE YOU SEEN TOM?', w / 2, h * 0.71);
    x.font = `400 ${w * 0.042}px ${SANS}`;
    x.fillText('Last seen on the platform,', w / 2, h * 0.78); x.fillText('9 days ago. Grey coat.', w / 2, h * 0.84);
    x.font = `700 ${w * 0.05}px ${SANS}`; x.fillText('Call 0800 000 0410', w / 2, h * 0.93);
  } else if (K === 6) {
    x.fillStyle = '#101418'; x.fillRect(0, 0, w, h);
    const g = x.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.45, w * 0.5);
    g.addColorStop(0, '#3fd0c9'); g.addColorStop(1, 'rgba(63,208,201,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8eef0'; x.fillRect(w * 0.38, h * 0.22, w * 0.24, h * 0.42);
    x.fillStyle = '#101418'; x.fillRect(w * 0.395, h * 0.24, w * 0.21, h * 0.38);
    x.fillStyle = '#e8eef0'; x.textAlign = 'center';
    x.font = `300 ${w * 0.13}px ${SANS}`; x.fillText('orbit', w / 2, h * 0.8);
    x.font = `400 ${w * 0.04}px ${SANS}`; x.fillText('Signal, even down here.', w / 2, h * 0.88);
  } else if (K === 7) {
    x.fillStyle = '#d8d2c2'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#244a3b'; x.fillRect(w * 0.06, h * 0.06, w * 0.88, h * 0.88);
    x.strokeStyle = '#d6b65c'; x.lineWidth = 6; x.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
    x.fillStyle = '#d6b65c'; x.textAlign = 'center';
    x.font = `700 ${w * 0.075}px ${CONDENSED}`; x.fillText('MUSEUM OF THE', w / 2, h * 0.3);
    x.font = `800 ${w * 0.15}px ${CONDENSED}`; x.fillText('DEEP LINES', w / 2, h * 0.45);
    x.font = `400 ${w * 0.045}px ${SANS}`; x.fillText('150 years beneath the city', w / 2, h * 0.58);
    x.fillText('Closed until further notice', w / 2, h * 0.8);
  } else {
    x.fillStyle = '#c23b22'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f7efe0'; x.textAlign = 'center';
    x.font = `800 ${w * 0.2}px ${CONDENSED}`; x.fillText('STAY', w / 2, h * 0.32); x.fillText('CLEAR', w / 2, h * 0.5);
    x.font = `700 ${w * 0.06}px ${SANS}`; x.fillText('OF THE PLATFORM EDGE', w / 2, h * 0.62);
    x.font = `400 ${w * 0.045}px ${SANS}`; x.fillText('Something is in the tunnels.', w / 2, h * 0.75);
  }
  // wear: tears, graffiti, dirt
  x.textAlign = 'left';
  grimeBlotches(x, w, h, r, 8, 'rgba(40,30,15,A)', w * 0.3, 0.3);
  if (r() < 0.5) {
    x.strokeStyle = ['#1c1c1c', '#c0262d', '#2d55c0'][Math.floor(r() * 3)];
    x.lineWidth = 6 + r() * 6; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    let px = w * (0.2 + r() * 0.4), py = h * (0.3 + r() * 0.4);
    x.moveTo(px, py);
    for (let i = 0; i < 9; i++) { px += (r() - 0.3) * w * 0.12; py += (r() - 0.5) * h * 0.12; x.lineTo(px, py); }
    x.stroke();
  }
  if (r() < 0.6) {
    // torn corner revealing old poster paper
    x.fillStyle = '#cfc6ad';
    const cx0 = r() < 0.5 ? 0 : w, cy0 = r() < 0.5 ? 0 : h;
    x.beginPath(); x.moveTo(cx0, cy0);
    x.lineTo(cx0 + (cx0 ? -1 : 1) * w * (0.15 + r() * 0.25), cy0);
    x.lineTo(cx0 + (cx0 ? -1 : 1) * w * 0.05, cy0 + (cy0 ? -1 : 1) * h * 0.06);
    x.lineTo(cx0, cy0 + (cy0 ? -1 : 1) * h * (0.1 + r() * 0.2));
    x.fill();
  }
  return toTexture(c, { repeat: false });
}

export function vendingTexture() {
  const w = 512, h = 1024;
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#0c1a2a'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#e8f4ff'; x.font = `800 90px ${CONDENSED}`; x.textAlign = 'center';
  x.fillText('CHILL', w / 2, 100);
  const cols = ['#d6332b', '#2a9dd6', '#f0c419', '#43b05c', '#f07c19', '#9a4bd6'];
  for (let j = 0; j < 6; j++) {
    x.fillStyle = 'rgba(200,230,255,0.08)'; x.fillRect(30, 150 + j * 120, w - 60, 110);
    for (let i = 0; i < 6; i++) {
      const px = 50 + i * 72, py = 165 + j * 120;
      if ((i * 7 + j * 3) % 11 === 0) continue; // sold out
      const g = x.createLinearGradient(px, 0, px + 50, 0);
      const cc = cols[(i + j * 2) % cols.length];
      g.addColorStop(0, cc); g.addColorStop(0.4, '#ffffff'); g.addColorStop(0.6, cc); g.addColorStop(1, '#222');
      x.fillStyle = g; x.fillRect(px, py, 48, 80);
      x.fillStyle = '#ccc'; x.fillRect(px, py, 48, 6);
    }
    x.fillStyle = '#9fb3c4'; x.font = `500 18px ${SANS}`;
    for (let i = 0; i < 6; i++) x.fillText(`${j + 1}${i}`, 74 + i * 72, 260 + j * 120);
  }
  x.fillStyle = 'rgba(255,255,255,0.08)';
  x.beginPath(); x.moveTo(30, 150); x.lineTo(200, 150); x.lineTo(60, 860); x.lineTo(30, 860); x.fill();
  x.fillStyle = '#081018'; x.fillRect(30, 880, w - 60, 120);
  x.fillStyle = '#ff5b4f'; x.font = `700 34px ${SANS}`; x.fillText('OUT OF ORDER', w / 2, 950);
  return toTexture(c, { repeat: false });
}

export function ledBoard(width = 512, height = 128) {
  const c = makeCanvas(width, height), x = c.getContext('2d');
  const low = makeCanvas(width / 4, height / 4), lx = low.getContext('2d', { willReadFrequently: true });
  const tex = toTexture(c, { repeat: false });
  function update(lines, colour = '#ffa21a') {
    lx.fillStyle = '#000'; lx.fillRect(0, 0, low.width, low.height);
    lx.fillStyle = '#fff'; lx.font = '10px monospace'; lx.textBaseline = 'top';
    lines.forEach((l, i) => {
      if (typeof l === 'string') lx.fillText(l, 2, 2 + i * 11);
      else { lx.fillText(l[0], 2, 2 + i * 11); lx.textAlign = 'right'; lx.fillText(l[1], low.width - 2, 2 + i * 11); lx.textAlign = 'left'; }
    });
    const d = lx.getImageData(0, 0, low.width, low.height).data;
    x.fillStyle = '#060402'; x.fillRect(0, 0, width, height);
    for (let j = 0; j < low.height; j++) for (let i = 0; i < low.width; i++) {
      const on = d[(j * low.width + i) * 4] > 100;
      x.fillStyle = on ? colour : '#1e1206';
      x.beginPath(); x.arc(i * 4 + 2, j * 4 + 2, 1.5, 0, Math.PI * 2); x.fill();
    }
    tex.needsUpdate = true;
  }
  return { texture: tex, update };
}

export function clockFace() {
  const s = 256, c = makeCanvas(s, s), x = c.getContext('2d');
  const tex = toTexture(c, { repeat: false });
  function update(date) {
    x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, s, s);
    x.save(); x.translate(s / 2, s / 2);
    x.strokeStyle = '#111'; x.lineWidth = 10; x.beginPath(); x.arc(0, 0, s / 2 - 6, 0, Math.PI * 2); x.stroke();
    for (let i = 0; i < 60; i++) {
      x.save(); x.rotate((i / 60) * Math.PI * 2);
      x.fillStyle = '#111';
      if (i % 5 === 0) x.fillRect(-4, -s / 2 + 18, 8, 24); else x.fillRect(-1.5, -s / 2 + 18, 3, 9);
      x.restore();
    }
    const hrs = date.getHours() % 12, min = date.getMinutes(), sec = date.getSeconds();
    const hand = (a, len, wd, col) => { x.save(); x.rotate(a); x.fillStyle = col; x.fillRect(-wd / 2, -len, wd, len + 14); x.restore(); };
    hand(((hrs + min / 60) / 12) * Math.PI * 2, 62, 10, '#111');
    hand(((min + sec / 60) / 60) * Math.PI * 2, 92, 7, '#111');
    hand((sec / 60) * Math.PI * 2, 100, 3, '#c2372f');
    x.fillStyle = '#c2372f'; x.beginPath(); x.arc(0, 0, 7, 0, Math.PI * 2); x.fill();
    x.restore();
    tex.needsUpdate = true;
  }
  update(new Date());
  return { texture: tex, update };
}

// Small FX textures
export function softDot() {
  const s = 64, c = makeCanvas(s, s), x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return toTexture(c, { repeat: false, srgb: false });
}

export function smokeTex() {
  const s = 128, c = makeCanvas(s, s), x = c.getContext('2d'), r = rng(4);
  for (let i = 0; i < 40; i++) {
    const px = s / 2 + (r() - 0.5) * s * 0.4, py = s / 2 + (r() - 0.5) * s * 0.4, rad = s * (0.1 + r() * 0.25);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  }
  return toTexture(c, { repeat: false, srgb: false });
}

export function flashTexture(seed = 1) {
  const s = 256, c = makeCanvas(s, s), x = c.getContext('2d'), r = rng(seed);
  x.translate(s / 2, s / 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.15, 'rgba(255,220,140,0.9)'); g.addColorStop(0.5, 'rgba(255,130,30,0.25)'); g.addColorStop(1, 'rgba(255,90,0,0)');
  for (let i = 0; i < 7; i++) {
    x.save(); x.rotate((i / 7) * Math.PI * 2 + r() * 0.4);
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, -s * 0.06); x.quadraticCurveTo(s * 0.3, -s * 0.02, s * (0.35 + r() * 0.15), 0); x.quadraticCurveTo(s * 0.3, s * 0.02, 0, s * 0.06); x.fill();
    x.restore();
  }
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, s * 0.2, 0, Math.PI * 2); x.fill();
  return toTexture(c, { repeat: false });
}

export function flashSideTexture() {
  const w = 256, h = 64, c = makeCanvas(w, h), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.3, 'rgba(255,190,90,0.8)'); g.addColorStop(1, 'rgba(255,100,0,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(0, h * 0.2); x.quadraticCurveTo(w * 0.5, 0, w, h / 2); x.quadraticCurveTo(w * 0.5, h, 0, h * 0.8); x.fill();
  return toTexture(c, { repeat: false });
}

export function bulletHoleTexture() {
  const s = 64, c = makeCanvas(s, s), x = c.getContext('2d'), r = rng(2);
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.18, 'rgba(10,8,6,1)'); g.addColorStop(0.3, 'rgba(60,55,50,0.8)'); g.addColorStop(0.6, 'rgba(30,25,20,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(15,12,10,0.7)'; x.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2;
    x.beginPath(); x.moveTo(s / 2, s / 2); x.lineTo(s / 2 + Math.cos(a) * s * (0.25 + r() * 0.2), s / 2 + Math.sin(a) * s * (0.25 + r() * 0.2)); x.stroke();
  }
  return toTexture(c, { repeat: false });
}

export function bloodSplatTexture(seed = 1) {
  const s = 256, c = makeCanvas(s, s), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = 'rgba(90,4,4,0.95)';
  x.beginPath(); x.arc(s / 2, s / 2, s * 0.16, 0, Math.PI * 2); x.fill();
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, d = s * (0.1 + r() * 0.3), rad = s * (0.02 + r() * 0.06);
    x.beginPath(); x.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, rad, 0, Math.PI * 2); x.fill();
    x.lineWidth = rad * 0.8; x.strokeStyle = x.fillStyle;
    x.beginPath(); x.moveTo(s / 2, s / 2); x.lineTo(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d); x.stroke();
  }
  for (let i = 0; i < 50; i++) {
    const a = r() * Math.PI * 2, d = s * (0.2 + r() * 0.28);
    x.beginPath(); x.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 1 + r() * 3, 0, Math.PI * 2); x.fill();
  }
  return toTexture(c, { repeat: false });
}
