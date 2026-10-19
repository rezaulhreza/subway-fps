// The station: platform, track, barrel vault, stairwells, tunnels, props, lights and signage.
import * as THREE from 'three';
import { Batch, vaultGeometry, tubeAlong, cyl, AXIS_X, matrixOf, worldUV } from './build.js';
import * as T from './textures.js';
import { L, vaultY } from './layout.js';

export const THEMES = [
  { name: 'Halden Cross', band: '#9e2b25', hue: 4, sat: 62, light: 38, wall: '#fffaf0', lamp: 0xfff0d8, level: 1.0, broken: 0.02, grime: 0.35, emergency: false },
  { name: 'Marlow Yard', band: '#1f7a6d', hue: 172, sat: 55, light: 32, wall: '#f4fbf6', lamp: 0xe8fff4, level: 0.95, broken: 0.06, grime: 0.5, emergency: false },
  { name: 'Kestrel Lane', band: '#c99a1c', hue: 44, sat: 70, light: 45, wall: '#fff6e2', lamp: 0xffe6bf, level: 0.85, broken: 0.12, grime: 0.65, emergency: false },
  { name: 'Ostwick', band: '#2a4fa3', hue: 222, sat: 58, light: 38, wall: '#eef2ff', lamp: 0xdfe8ff, level: 0.75, broken: 0.2, grime: 0.8, emergency: false },
  { name: 'Saltmarsh', band: '#6b3a8f', hue: 280, sat: 40, light: 34, wall: '#f6eef8', lamp: 0xffd7c2, level: 0.6, broken: 0.3, grime: 0.95, emergency: true },
  { name: 'Greyfriars Gate', band: '#3d3d3d', hue: 0, sat: 0, light: 26, wall: '#e9e6e0', lamp: 0xffc9a8, level: 0.5, broken: 0.4, grime: 1.0, emergency: true },
];

export function themeFor(i) {
  const base = THEMES[i % THEMES.length];
  if (i < THEMES.length) return { ...base, index: i };
  const extra = ['Wexmoor', 'Tannery Row', 'Lantern Hill', 'Brindle', 'St. Odo', 'Fenwick Docks', 'Eldergate', 'Copper Lane'];
  return { ...THEMES[THEMES.length - 1], name: extra[(i - THEMES.length) % extra.length], index: i };
}

const POSTER_KINDS = 9;

export class Station {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'station';
    scene.add(this.group);
    this.colliders = [];
    this.rayMeshes = [];
    this.flickers = [];
    this.lights = [];
    this.time = 0;
    this.makeMaterials();
    const b = new Batch();
    const nb = new Batch(); // no shadow casting (thin or distant)
    this.buildShell(b);
    this.buildTrack(b, nb);
    this.buildTunnels(b, nb);
    for (const x0 of L.STAIRS) this.buildStairs(b, x0);
    this.buildProps(b, nb);
    this.buildLitter(nb);
    this.rayMeshes.push(...b.build(this.group, { cast: true, receive: true, name: 'station' }));
    this.rayMeshes.push(...nb.build(this.group, { cast: false, receive: true, name: 'station-thin' }));
    this.buildFixtures();
    this.buildSignage();
    this.buildDust();
    this.buildLights();
    this.applyTheme(themeFor(0));
  }

  makeMaterials() {
    const m = (this.m = {});
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const wall = T.tileTextures({ seed: 1, hue: 45, sat: 18, light: 88, grime: 0.45 });
    m.wall = std({ ...wall, roughness: 1, normalScale: new THREE.Vector2(0.7, 0.7) });
    const vault = T.tileTextures({ seed: 2, cols: 4, rows: 6, hue: 40, sat: 14, light: 76, grime: 0.45, bevel: 4 });
    m.vault = std({ ...vault, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
    m.band = std({ roughness: 1, normalScale: new THREE.Vector2(0.7, 0.7) });
    const dark = T.tileTextures({ seed: 3, cols: 8, rows: 4, hue: 30, sat: 8, light: 16, grime: 0.3, grout: '#0e0d0c' });
    m.skirting = std({ ...dark, roughness: 1 });
    const floor = T.floorTextures(3, 0.8);
    m.floor = std({ ...floor, roughness: 1, normalScale: new THREE.Vector2(0.5, 0.5) });
    const tac = T.tactileTextures();
    m.tactile = std({ ...tac, roughness: 0.7, normalScale: new THREE.Vector2(1.5, 1.5) });
    const cop = T.concreteTextures(5, '#a7a297', 512, 0.6);
    m.coping = std({ ...cop, roughness: 0.75 });
    m.whiteLine = std({ color: 0xe8e4d6, roughness: 0.6 });
    const conc = T.concreteTextures(6, '#4d4944', 512, 1);
    m.concrete = std({ ...conc, roughness: 0.9 });
    const sl = T.concreteTextures(7, '#77736b', 256, 0.8);
    m.sleeper = std({ ...sl, roughness: 0.9 });
    const bal = T.ballastTextures();
    m.ballast = std({ ...bal, roughness: 0.95, normalScale: new THREE.Vector2(1.2, 1.2) });
    m.railHead = std({ color: 0xb8b4ae, metalness: 1, roughness: 0.22 });
    m.rust = std({ color: 0x4a2f20, metalness: 0.5, roughness: 0.85 });
    m.ceramic = std({ color: 0xd9d4c6, roughness: 0.25 });
    m.cover = std({ color: 0xc4b27a, roughness: 0.6 });
    m.darkMetal = std({ color: 0x2a2d31, metalness: 0.7, roughness: 0.5 });
    m.steel = std({ color: 0xa4a9ae, metalness: 0.9, roughness: 0.28 });
    m.paint = std({ color: 0x2f4656, metalness: 0.3, roughness: 0.55 });
    m.wood = std({ color: 0x6e4b2e, roughness: 0.65 });
    m.red = std({ color: 0xb3191c, roughness: 0.4, metalness: 0.2 });
    m.yellow = std({ color: 0xe0b31a, roughness: 0.6 });
    m.black = std({ color: 0x0b0b0c, roughness: 0.7 });
    m.cable = std({ color: 0x151515, roughness: 0.6 });
    m.paper = std({ color: 0xd8d4c8, roughness: 0.9 });
    m.paper2 = std({ color: 0x9b9890, roughness: 0.9 });
    m.can = std({ color: 0xb7342b, metalness: 0.8, roughness: 0.35 });
    m.doorSteel = std({ color: 0x5c6166, metalness: 0.6, roughness: 0.45 });
    const tun = T.tunnelTextures();
    m.tunnel = std({ ...tun, roughness: 0.85, side: THREE.BackSide, normalScale: new THREE.Vector2(1.5, 1.5) });
    m.tube = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    m.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.8, 0.7), toneMapped: false });
    m.redLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.1), toneMapped: false });
    m.greenLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.4, 0.1), toneMapped: false });
    m.glow = (tex, k = 1.6) => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(k, k, k), toneMapped: false });
    m.nameSign = std({ roughness: 0.35 });
    m.map = std({ roughness: 0.4 });
    m.blood = std({ map: T.bloodSplatTexture(9), transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
    m.gap = new THREE.MeshStandardMaterial({ map: T.decalTextTexture('MIND THE GAP'), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    this.posterPool = { tall: [], wide: [] };
    for (let k = 0; k < POSTER_KINDS; k++) {
      this.posterPool.tall.push(T.posterTexture(k, 1, false));
      this.posterPool.wide.push(T.posterTexture(k, 2, true));
    }
    this.posterMats = [];
  }

  addCollider(x0, y0, z0, x1, y1, z1) {
    this.colliders.push({ min: new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), max: new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)) });
  }

  buildShell(b) {
    const { HALF: H, BACK_Z: BZ, FAR_Z: FZ, TRACK_Y: TY, WALL_TOP: WT } = L;
    const m = this.m;
    // Platform body with an undercut pit beneath the coping.
    b.box(m.concrete, -H, TY - 0.3, BZ, H, -0.25, -0.35, 2);
    b.box(m.coping, -H, -0.25, -0.6, H, 0, 0.02, 1.5);
    b.box(m.floor, -H, -0.25, BZ, H, 0, -1.0, 4);
    b.box(m.tactile, -H, -0.25, -1.0, H, 0.004, -0.6, 0.4);
    b.box(m.whiteLine, -H, 0, -0.66, H, 0.003, -0.6, 1);
    // pit cables
    for (const [y, r] of [[-0.55, 0.035], [-0.65, 0.025], [-0.72, 0.03]]) {
      b.add(m.cable, cyl(r, r, H * 2, 6), matrixOf([0, y, -0.32], AXIS_X), 1);
    }
    for (let x = -H + 1; x < H; x += 3) b.box(m.darkMetal, x - 0.03, -0.8, -0.35, x + 0.03, -0.45, -0.28, 1);

    // Back wall with stair openings
    const openings = L.STAIRS.map((s) => [s - L.STAIR_HW, s + L.STAIR_HW]);
    let x = -H;
    const segs = [];
    for (const [a, c] of openings) { segs.push([x, a]); x = c; }
    segs.push([x, H]);
    for (const [a, c] of segs) {
      b.box(m.wall, a, -0.3, BZ - 0.3, c, WT, BZ, 1.2);
      b.box(m.skirting, a, 0, BZ, c, 0.22, BZ + 0.02, 0.6);
      b.box(m.band, a, 2.3, BZ, c, 2.6, BZ + 0.02, 0.6);
      this.addCollider(a - (a === -H ? 1 : 0), -3, BZ - 0.35, c + (c === H ? 1 : 0), 10, BZ);
    }
    for (const [a, c] of openings) {
      b.box(m.wall, a, 2.8, BZ - 0.3, c, WT, BZ, 1.2);
      // coloured tile surround
      b.box(m.band, a - 0.25, 0, BZ, a, 3.05, BZ + 0.03, 0.6);
      b.box(m.band, c, 0, BZ, c + 0.25, 3.05, BZ + 0.03, 0.6);
      b.box(m.band, a, 2.8, BZ, c, 3.05, BZ + 0.03, 0.6);
    }
    // far wall
    b.box(m.wall, -H, TY - 0.3, FZ, H, WT, FZ + 0.3, 1.2);
    b.box(m.concrete, -H, TY, FZ - 0.02, H, -0.2, FZ, 2);
    b.box(m.band, -H, 2.3, FZ - 0.02, H, 2.6, FZ, 0.6);
    this.addCollider(-H - 1, -3, FZ, H + 1, 10, FZ + 0.5);

    // barrel vault with steel ribs
    b.add(m.vault, vaultGeometry(-H, H, L.VAULT_ZC, L.VAULT_A, L.VAULT_B, WT, 48, false, 1.6), null, 0);
    for (let rx = -H + 3; rx < H; rx += 6) {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = Math.PI - (i / 24) * Math.PI;
        pts.push([rx, WT + (L.VAULT_B - 0.05) * Math.sin(t), L.VAULT_ZC + (L.VAULT_A - 0.05) * Math.cos(t)]);
      }
      b.add(m.darkMetal, tubeAlong(pts, 0.06, 6), null, 1);
    }
    // conduits along wall tops
    for (const [z, y, r] of [[BZ + 0.08, 3.05, 0.05], [BZ + 0.18, 3.08, 0.035], [FZ - 0.1, 3.05, 0.06], [FZ - 0.2, 3.1, 0.04], [FZ - 0.08, 2.9, 0.03]]) {
      b.add(m.darkMetal, cyl(r, r, H * 2, 8), matrixOf([0, y, z], AXIS_X), 1);
    }

    // end walls with tunnel mouth
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape();
      const outline = [[BZ - 0.3, TY - 0.35], [FZ + 0.3, TY - 0.35], [FZ + 0.3, WT]];
      for (let i = 0; i <= 32; i++) {
        const t = (i / 32) * Math.PI;
        outline.push([L.VAULT_ZC + L.VAULT_A * Math.cos(t), WT + L.VAULT_B * Math.sin(t)]);
      }
      outline.push([BZ - 0.3, WT]);
      outline.forEach(([z, y], i) => (i ? shape.lineTo(s * z, y) : shape.moveTo(s * z, y)));
      const hole = new THREE.Path();
      const p0 = Math.asin((TY - L.TUN_CY) / L.TUN_R);
      for (let i = 0; i <= 40; i++) {
        const p = p0 + (i / 40) * (Math.PI - 2 * p0);
        const z = L.TRACK_Z + L.TUN_R * Math.cos(p), y = L.TUN_CY + L.TUN_R * Math.sin(p);
        i ? hole.lineTo(s * z, y) : hole.moveTo(s * z, y);
      }
      shape.holes.push(hole);
      const g = new THREE.ShapeGeometry(shape, 8);
      b.add(m.wall, g, matrixOf([s * H, 0, 0], [0, -s * Math.PI / 2, 0]), 1.2);
      // portal ring
      const ring = [];
      for (let i = 0; i <= 30; i++) {
        const p = p0 + (i / 30) * (Math.PI - 2 * p0);
        ring.push([s * (H - 0.05), L.TUN_CY + (L.TUN_R + 0.08) * Math.sin(p), L.TRACK_Z + (L.TUN_R + 0.08) * Math.cos(p)]);
      }
      b.add(m.band, tubeAlong(ring, 0.12, 8), null, 0.6);
      // staff door
      b.box(m.doorSteel, s * (H - 0.06), 0, -4.6, s * H, 2.2, -3.4, 1);
      b.box(m.darkMetal, s * (H - 0.1), 1.0, -3.55, s * (H - 0.06), 1.06, -3.45, 1);
      b.box(m.darkMetal, s * (H - 0.08), 2.2, -4.7, s * H, 2.28, -3.3, 1);
      this.addCollider(s * H, -3, BZ - 1, s * (H + 1), 10, -0.38);
    }
    this.doorPositions = [new THREE.Vector3(-H + 0.6, 0, -4), new THREE.Vector3(H - 0.6, 0, -4)];
  }

  buildTrack(b, nb) {
    const m = this.m;
    const LEN = L.HALF + L.TUN_LEN;
    const TZ = L.TRACK_Z, TY = L.TRACK_Y;
    b.box(m.ballast, -L.HALF, TY - 0.4, -0.35, L.HALF, TY, L.FAR_Z, 1.2);
    for (const side of [-1, 1]) {
      const z = TZ + side * 0.7175;
      b.box(m.rust, -LEN, TY + 0.08, z - 0.07, LEN, TY + 0.1, z + 0.07, 1);
      b.box(m.rust, -LEN, TY + 0.1, z - 0.012, LEN, TY + 0.2, z + 0.012, 1);
      b.box(m.railHead, -LEN, TY + 0.2, z - 0.035, LEN, TY + 0.24, z + 0.035, 1);
    }
    // conductor rails: outside positive and centre negative
    b.box(m.steel, -LEN, TY + 0.26, TZ + 1.21, LEN, TY + 0.3, TZ + 1.29, 1);
    b.box(m.cover, -LEN, TY + 0.36, TZ + 1.15, LEN, TY + 0.38, TZ + 1.36, 1);
    b.box(m.steel, -LEN, TY + 0.12, TZ - 0.04, LEN, TY + 0.17, TZ + 0.04, 1);
    // insulators (instanced for the full length)
    const insGeo = cyl(0.05, 0.06, 0.16, 8);
    const count = Math.floor((LEN * 2) / 3);
    const ins = new THREE.InstancedMesh(insGeo, m.ceramic, count * 2);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.18, 2.6), m.sleeper, Math.floor((LEN * 2) / 0.625));
    const mat = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const x = -LEN + i * 3 + 1.5;
      ins.setMatrixAt(i * 2, mat.makeTranslation(x, TY + 0.18, TZ + 1.25));
      ins.setMatrixAt(i * 2 + 1, mat.makeTranslation(x + 1.5, TY + 0.04, TZ));
    }
    for (let i = 0; i < sleepers.count; i++) sleepers.setMatrixAt(i, mat.makeTranslation(-LEN + i * 0.625 + 0.3, TY - 0.0, TZ));
    for (const im of [ins, sleepers]) {
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
    }
  }

  buildTunnels(b, nb) {
    const m = this.m;
    const { HALF: H, TUN_LEN: TL, TUN_R: R, TUN_CY: CY, TRACK_Z: TZ, TRACK_Y: TY } = L;
    const lamps = [];
    for (const s of [-1, 1]) {
      const cx = s * (H + TL / 2);
      const g = new THREE.CylinderGeometry(R, R, TL, 36, 1, true).toNonIndexed();
      g.applyMatrix4(matrixOf([cx, CY, TZ], [0, 0, Math.PI / 2]));
      const uv = g.attributes.uv, p = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 2.4, uv.getX(i) * 8);
      nb.add(m.tunnel, g, null, 0);
      nb.box(m.ballast, s * H, TY - 0.4, TZ - 2.1, s * (H + TL), TY, TZ + 2.1, 1.2);
      // cables and brackets on the platform-side wall
      for (const [y, r] of [[0.35, 0.03], [0.48, 0.04], [0.6, 0.03], [0.74, 0.045], [2.6, 0.12]]) {
        const z = y > 2 ? TZ + Math.sqrt(R * R - (y - CY) ** 2) - 0.18 : TZ - Math.sqrt(R * R - (y - CY) ** 2) + 0.14;
        nb.add(y > 2 ? m.rust : m.cable, cyl(r, r, TL, 6), matrixOf([cx, y, z], AXIS_X), 1);
      }
      // fittings sit on a global grid so the tunnel repeats exactly every 60 m (the travel loop relies on it)
      const grid = (step, off) => {
        const out = [];
        for (let x = Math.ceil((H + 2 - off) / step) * step + off; x < H + TL - 1; x += step) out.push(x);
        return out;
      };
      const zb = TZ - Math.sqrt(R * R - (0.55 - CY) ** 2) + 0.06;
      for (const x of grid(3, 0)) nb.box(m.darkMetal, s * x - 0.03, 0.25, zb, s * x + 0.03, 0.85, zb + 0.16, 1);
      for (const x of s > 0 ? grid(12, 1) : grid(12, 11)) {
        const y = 1.7, z = TZ - Math.sqrt(R * R - (y - CY) ** 2) + 0.1;
        nb.box(m.darkMetal, s * x - 0.12, y - 0.14, z - 0.02, s * x + 0.12, y + 0.14, z + 0.08, 1);
        lamps.push([s * x, y, z + 0.09]);
      }
      // walls stop entities wandering off into the dark
      this.addCollider(s * H, -3, -3, s * (H + TL), 10, -0.3);
      this.addCollider(s * H, -3, 3.5, s * (H + TL), 10, 6);
      this.addCollider(s * 140, -3, -3, s * 141, 10, 6);
      // signal at the mouth
      const sx = s * (H + 4), sz = TZ + 1.85;
      b.box(m.darkMetal, sx - 0.05, TY, sz - 0.05, sx + 0.05, 0.9, sz + 0.05, 1);
      b.box(m.black, sx - 0.14, 0.9, sz - 0.14, sx + 0.14, 1.6, sz + 0.14, 1);
    }
    const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.2, 0.03), m.lamp, lamps.length);
    lamps.forEach(([x, y, z], i) => lampMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)));
    lampMesh.frustumCulled = false;
    this.group.add(lampMesh);
    // signal lenses: [red, green] per side, facing the platform
    this.signals = [];
    for (const s of [-1, 1]) {
      const sx = s * (H + 4) - s * 0.15, sz = L.TRACK_Z + 1.85;
      const red = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), this.m.redLamp);
      const green = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), this.m.greenLamp);
      for (const [mesh, y] of [[red, 1.42], [green, 1.18]]) {
        mesh.position.set(sx, y, sz);
        mesh.rotation.y = -s * Math.PI / 2;
        this.group.add(mesh);
      }
    }
  }

  setSignal(go) {
    this.m.redLamp.color.setRGB(go ? 0.25 : 4, go ? 0.02 : 0.2, go ? 0.01 : 0.1);
    this.m.greenLamp.color.setRGB(go ? 0.2 : 0.05, go ? 4 : 0.4, go ? 1 : 0.1);
  }

  buildStairs(b, x0) {
    const m = this.m;
    const hw = L.STAIR_HW, n = 16, rise = L.STAIR_TOP / n, run = (L.STAIR_Z0 - L.STAIR_Z1) / n;
    const Z0 = L.STAIR_Z0, Z1 = L.STAIR_Z1, ZE = L.STAIR_END, TOP = L.STAIR_TOP;
    b.box(m.floor, x0 - hw, -0.25, Z0, x0 + hw, 0, L.BACK_Z, 4);
    for (let i = 0; i < n; i++) {
      const za = Z0 - i * run, zb = Z0 - (i + 1) * run, y = (i + 1) * rise;
      b.box(m.concrete, x0 - hw, y - rise - 0.1, zb, x0 + hw, y, za, 1);
      b.box(m.yellow, x0 - hw + 0.05, y, za - 0.06, x0 + hw - 0.05, y + 0.004, za, 1);
    }
    b.box(m.floor, x0 - hw, TOP - 0.3, ZE, x0 + hw, TOP, Z1, 4);
    for (const s of [-1, 1]) {
      b.box(m.wall, x0 + s * hw, -0.3, ZE, x0 + s * (hw + 0.3), TOP + 3.2, L.BACK_Z - 0.3, 1.2);
      b.box(m.skirting, x0 + s * (hw - 0.02), 0, Z0, x0 + s * hw, 0.2, L.BACK_Z - 0.3, 0.6);
      this.addCollider(x0 + s * hw, -3, ZE - 1, x0 + s * (hw + 1), 12, L.BACK_Z - 0.3);
      // handrail following the stair pitch
      const hx = x0 + s * (hw - 0.12);
      b.add(m.steel, tubeAlong([[hx, 0.95, L.BACK_Z - 0.4], [hx, 0.95, Z0], [hx, 0.95 + TOP, Z1], [hx, 0.95 + TOP, Z1 - 1.2]], 0.03, 8), null, 1);
      for (let i = 0; i <= 4; i++) {
        const z = Z0 - i * (Z0 - Z1) / 4, y = (i / 4) * TOP;
        b.box(m.steel, hx - 0.01 + s * 0.02, y + 0.85, z - 0.02, hx + s * 0.1, y + 0.9, z + 0.02, 1);
      }
    }
    // sloped ceiling then flat landing ceiling
    const dz = (L.BACK_Z - 0.3) - Z1, dy = TOP;
    const len = Math.hypot(dz, dy);
    b.add(m.wall, new THREE.BoxGeometry(hw * 2 + 0.6, 0.3, len), matrixOf([x0, 2.8 + dy / 2 + 0.15, (L.BACK_Z - 0.3 + Z1) / 2], [Math.atan2(dy, dz), 0, 0]), 1.2);
    b.box(m.wall, x0 - hw - 0.3, TOP + 2.8, ZE, x0 + hw + 0.3, TOP + 3.2, Z1 + 0.1, 1.2);
    b.box(m.skirting, x0 - hw - 0.3, TOP - 0.3, ZE - 0.3, x0 + hw + 0.3, TOP + 3.2, ZE, 1);
    this.addCollider(x0 - hw - 1, -3, ZE - 2, x0 + hw + 1, 12, ZE);
    // stair ceiling fixture
    b.box(m.darkMetal, x0 - 0.5, 5.1, -12.1, x0 + 0.5, 5.18, -11.9, 1);
    if (!this.stairLamps) this.stairLamps = [];
    this.stairLamps.push(new THREE.Vector3(x0, 5.05, -12));
  }

  buildProps(b, nb) {
    const m = this.m;
    const BZ = L.BACK_Z;
    const bench = (x) => {
      const z0 = BZ + 0.05;
      for (const lx of [-0.9, 0, 0.9]) {
        b.box(m.paint, x + lx - 0.03, 0, z0 + 0.05, x + lx + 0.03, 0.42, z0 + 0.45, 1);
        b.box(m.paint, x + lx - 0.03, 0.42, z0, x + lx + 0.03, 0.95, z0 + 0.06, 1);
      }
      for (let i = 0; i < 4; i++) b.box(m.wood, x - 1, 0.42, z0 + 0.06 + i * 0.1, x + 1, 0.46, z0 + 0.14 + i * 0.1, 0.5);
      for (let i = 0; i < 3; i++) b.box(m.wood, x - 1, 0.55 + i * 0.13, z0 + 0.06, x + 1, 0.65 + i * 0.13, z0 + 0.09, 0.5);
      for (const ax of [-0.33, 0.33]) b.box(m.paint, x + ax - 0.02, 0.46, z0 + 0.06, x + ax + 0.02, 0.62, z0 + 0.45, 1);
      this.addCollider(x - 1.02, 0, BZ, x + 1.02, 1, BZ + 0.55);
    };
    [-44, -30, -9.5, 9.5, 30, 44].forEach(bench);
    const bin = (x) => {
      b.add(m.paint, cyl(0.28, 0.26, 0.85, 16), matrixOf([x, 0.425, BZ + 0.38]), 0.5);
      b.add(m.darkMetal, cyl(0.3, 0.3, 0.06, 16), matrixOf([x, 0.88, BZ + 0.38]), 0.5);
      b.add(m.black, cyl(0.12, 0.12, 0.02, 12), matrixOf([x, 0.915, BZ + 0.38]), 0.5);
      this.addCollider(x - 0.3, 0, BZ, x + 0.3, 1, BZ + 0.7);
    };
    [-53, -17.5, 17.5, 53].forEach(bin);
    // vending machine
    const vx = -26;
    b.box(m.darkMetal, vx - 0.55, 0, BZ + 0.02, vx + 0.55, 1.95, BZ + 0.82, 1);
    const vend = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.75), m.glow(T.vendingTexture(), 1.3));
    vend.position.set(vx, 1.0, BZ + 0.825);
    this.group.add(vend);
    this.addCollider(vx - 0.55, 0, BZ, vx + 0.55, 2, BZ + 0.85);
    // help point
    const hx = 26;
    b.box(m.paint, hx - 0.18, 0, BZ + 0.05, hx + 0.18, 1.6, BZ + 0.3, 1);
    b.box(m.steel, hx - 0.15, 1.0, BZ + 0.3, hx + 0.15, 1.45, BZ + 0.31, 1);
    const btn = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), m.redLamp);
    btn.position.set(hx, 1.12, BZ + 0.312);
    this.group.add(btn);
    const hs = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), m.glow(T.textSignTexture('HELP POINT', { bg: '#1f4f9e', w: 256, h: 72, size: 48 }), 1.1));
    hs.position.set(hx, 1.52, BZ + 0.302);
    this.group.add(hs);
    this.addCollider(hx - 0.2, 0, BZ, hx + 0.2, 1.7, BZ + 0.35);
    // fire extinguisher cabinet
    b.box(m.red, 2.0, 0.6, BZ, 2.5, 1.5, BZ + 0.2, 1);
    b.add(m.red, cyl(0.08, 0.08, 0.5, 12), matrixOf([2.25, 0.95, BZ + 0.25]), 1);
    b.box(m.black, 2.2, 1.2, BZ + 0.2, 2.3, 1.28, BZ + 0.3, 1);
    // network map
    b.box(m.steel, -1.3, 0.7, BZ, 1.3, 2.3, BZ + 0.04, 1);
    const map = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), m.map);
    map.position.set(0, 1.5, BZ + 0.045);
    this.group.add(map);
    // posters on the back wall
    const tall = (x) => {
      b.box(m.steel, x - 0.66, 0.42, BZ, x + 0.66, 2.28, BZ + 0.05, 1);
      const pm = new THREE.MeshStandardMaterial({ roughness: 0.45, emissive: 0xffffff, emissiveIntensity: 0.08 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.76), pm);
      p.position.set(x, 1.35, BZ + 0.055);
      this.group.add(p);
      this.posterMats.push({ mat: pm, wide: false });
    };
    [-50, -38, -14, -5, 5, 14, 38, 50].forEach(tall);
    // lightbox posters and name signs on the far wall
    for (let i = 0; i < 17; i++) {
      const x = -48 + i * 6;
      if (i % 2 === 0) {
        b.box(m.steel, x - 1.65, 0.12, L.FAR_Z - 0.06, x + 1.65, 1.88, L.FAR_Z, 1);
        const pm = new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.35 });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.55), pm);
        p.position.set(x, 1.0, L.FAR_Z - 0.065);
        p.rotation.y = Math.PI;
        this.group.add(p);
        this.posterMats.push({ mat: pm, wide: true });
      } else {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.49), m.nameSign);
        p.position.set(x, 1.0, L.FAR_Z - 0.02);
        p.rotation.y = Math.PI;
        this.group.add(p);
      }
    }
    for (const x of [-30, 30]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.41), m.nameSign);
      p.position.set(x, 1.55, BZ + 0.03);
      this.group.add(p);
    }
    // MIND THE GAP
    for (const x of [-42, -21, 0, 21, 42]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.4), m.gap);
      p.position.set(x, 0.006, -0.3);
      p.rotation.set(-Math.PI / 2, 0, Math.PI);
      this.group.add(p);
    }
  }

  buildLitter(nb) {
    const m = this.m;
    const r = T.rng(77);
    for (let i = 0; i < 70; i++) {
      const onTrack = r() < 0.5;
      const x = (r() - 0.5) * L.HALF * 1.9;
      const z = onTrack ? 0.1 + r() * 4 : L.BACK_Z + 0.2 + r() * 6.5;
      const y = onTrack ? L.TRACK_Y : 0;
      const k = r();
      if (k < 0.35) {
        nb.add(r() < 0.5 ? m.paper : m.paper2, new THREE.BoxGeometry(0.42, 0.003, 0.3), matrixOf([x, y + 0.004, z], [0, r() * 6, 0]), 0.5);
      } else if (k < 0.65) {
        nb.add(m.can, cyl(0.033, 0.033, 0.12, 10), matrixOf([x, y + 0.033, z], [Math.PI / 2, r() * 6, 0]), 0.3);
      } else {
        nb.add(m.paper, new THREE.IcosahedronGeometry(0.05 + r() * 0.04, 0), matrixOf([x, y + 0.04, z], [r(), r(), r()], [1, 0.7, 1.2]), 0.3);
      }
    }
    this.bloodDecals = [];
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.blood);
      p.rotation.set(-Math.PI / 2, 0, r() * 6);
      const s = 0.6 + r() * 1.4;
      p.scale.set(s, s, 1);
      p.position.set((r() - 0.5) * 100, 0.007, L.BACK_Z + 0.6 + r() * 5.5);
      this.group.add(p);
      this.bloodDecals.push(p);
    }
  }

  buildFixtures() {
    const m = this.m;
    const H = L.HALF, TZ = L.TRUNK_Z;
    const b = new Batch();
    b.box(m.darkMetal, -H + 1, 3.92, TZ - 0.2, H - 1, 4.1, TZ + 0.2, 1);
    b.box(m.darkMetal, -H + 1, 3.86, TZ - 0.22, H - 1, 3.92, TZ - 0.18, 1);
    b.box(m.darkMetal, -H + 1, 3.86, TZ + 0.18, H - 1, 3.92, TZ + 0.22, 1);
    const top = vaultY(TZ);
    for (let x = -H + 2; x < H - 1; x += 4) b.add(m.steel, cyl(0.012, 0.012, top - 4.1, 6), matrixOf([x, (top + 4.1) / 2, TZ]), 1);
    // far wall poster lights
    b.box(m.darkMetal, -H + 1, 2.95, L.FAR_Z - 0.35, H - 1, 3.02, L.FAR_Z, 1);
    // cctv cameras
    for (const x of [-34, 12, 34]) {
      b.box(m.ceramic, x - 0.08, 3.62, TZ + 0.1, x + 0.08, 3.78, TZ + 0.42, 1);
      b.add(m.black, cyl(0.05, 0.05, 0.04, 12), matrixOf([x, 3.7, TZ + 0.44], [Math.PI / 2, 0, 0]), 1);
      b.box(m.darkMetal, x - 0.02, 3.78, TZ + 0.2, x + 0.02, 3.92, TZ + 0.24, 1);
    }
    // speakers
    for (let x = -48; x <= 48; x += 16) {
      b.add(m.ceramic, cyl(0.12, 0.05, 0.25, 12), matrixOf([x, 3.72, TZ - 0.3], [Math.PI / 2.6, 0, 0]), 1);
    }
    b.build(this.group, { cast: false, receive: true, name: 'fixtures' });
    // fluorescent tubes as instances so individual tubes can fail and flicker
    const count = Math.floor((2 * H - 4) / 1.5);
    this.tubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.36, 0.04, 0.3), m.tube, count);
    this.tubesFar = new THREE.InstancedMesh(new THREE.BoxGeometry(1.36, 0.05, 0.08), m.tube, count);
    const mat = new THREE.Matrix4();
    this.tubeX = [];
    for (let i = 0; i < count; i++) {
      const x = -H + 2.75 + i * 1.5;
      this.tubeX.push(x);
      this.tubes.setMatrixAt(i, mat.makeTranslation(x, 3.89, TZ));
      this.tubesFar.setMatrixAt(i, mat.makeTranslation(x, 2.93, L.FAR_Z - 0.2));
      this.tubes.setColorAt(i, new THREE.Color(1, 1, 1));
      this.tubesFar.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    for (const t of [this.tubes, this.tubesFar]) { t.frustumCulled = false; this.group.add(t); }
    // stair lamps
    this.stairTubes = [];
    for (const p of this.stairLamps) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      t.position.set(p.x, 5.09, p.z);
      this.group.add(t);
      this.stairTubes.push(t);
    }
  }

  buildSignage() {
    const m = this.m;
    const TZ = L.TRUNK_Z;
    // hanging double-sided name signs
    for (const x of [-38, -6, 24, 46]) {
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.36), m.nameSign);
        p.position.set(x, 3.55, TZ + side * 0.03);
        p.rotation.y = side < 0 ? Math.PI : 0;
        this.group.add(p);
      }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.42, 0.05), m.darkMetal);
      frame.position.set(x, 3.55, TZ);
      this.group.add(frame);
      for (const dx of [-0.8, 0.8]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.15, 6), m.steel);
        rod.position.set(x + dx, 3.83, TZ);
        this.group.add(rod);
      }
    }
    // way out signs, perpendicular to the platform
    for (const s of L.STAIRS) {
      for (const dir of [-1, 1]) {
        const x = s + dir * 5;
        const tex = T.textSignTexture('WAY OUT', { arrow: dir > 0 ? 'left' : 'right' });
        const mat = m.glow(tex, 1.5);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), mat);
        p.position.set(x, 3.6, TZ);
        p.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.group.add(p);
        const backing = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 1.24), m.darkMetal);
        backing.position.set(x - dir * 0.025, 3.6, TZ);
        this.group.add(backing);
      }
      const over = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.3), m.glow(T.textSignTexture('WAY OUT  /  EXIT'), 1.5));
      over.position.set(s, 2.93, L.BACK_Z + 0.04);
      this.group.add(over);
    }
    // LED departure board
    this.board = T.ledBoard(512, 128);
    const boardBox = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 0.14), m.black);
    boardBox.position.set(0, 3.45, TZ);
    this.group.add(boardBox);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 0.46), new THREE.MeshBasicMaterial({ map: this.board.texture, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
      p.position.set(0, 3.45, TZ + side * 0.075);
      p.rotation.y = side < 0 ? Math.PI : 0;
      this.group.add(p);
    }
    for (const dx of [-0.85, 0.85]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), m.steel);
      rod.position.set(dx, 3.78, TZ);
      this.group.add(rod);
    }
    // clock
    this.clock = T.clockFace();
    const cm = new THREE.MeshStandardMaterial({ map: this.clock.texture, roughness: 0.3, emissive: 0xffffff, emissiveMap: this.clock.texture, emissiveIntensity: 0.25 });
    const clk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 32), [m.darkMetal, cm, cm]);
    clk.position.set(4.5, 3.5, TZ);
    clk.rotation.set(Math.PI / 2, 0, 0); // caps face both ways along z
    this.group.add(clk);
    const crod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.15, 6), m.steel);
    crod.position.set(4.5, 3.84, TZ);
    this.group.add(crod);
    this.clockTimer = 0;
  }

  buildDust() {
    const n = 900;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    const r = T.rng(5);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 2 * L.HALF;
      pos[i * 3 + 1] = L.TRACK_Y + r() * 6;
      pos[i * 3 + 2] = L.BACK_Z + r() * (L.FAR_Z - L.BACK_Z);
      seed[i] = r() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, map: { value: T.softDot() }, level: { value: 1 } },
      vertexShader: `
        attribute float seed; uniform float time; varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(time * 0.07 + seed) * 1.5;
          p.y += sin(time * 0.11 + seed * 1.7) * 0.4;
          p.z += cos(time * 0.09 + seed * 2.3) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(10.0, 22.0 / -mv.z);
          vA = smoothstep(14.0, 3.0, -mv.z) * smoothstep(1.0, 3.0, -mv.z) * (0.5 + 0.5 * sin(seed * 3.0));
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform float level; varying float vA;
        void main() { float a = texture2D(map, gl_PointCoord).r; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a * vA * 0.5 * level, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, this.dustMat);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xfff2dd, 0x1a1410, 0.35);
    this.scene.add(this.hemi);
    this.points = [];
    for (const x of [-44, -22, 0, 22, 44]) {
      const l = new THREE.PointLight(0xfff0d8, 30, 32, 1.6);
      l.position.set(x, 3.6, L.TRUNK_Z + 0.6);
      this.group.add(l);
      this.points.push(l);
    }
    this.spots = [];
    for (const x of [-11, 11]) {
      const s = new THREE.SpotLight(0xfff0d8, 70, 22, 1.15, 0.7, 1.6);
      s.position.set(x, 3.8, L.TRUNK_Z + 0.4);
      s.target.position.set(x, 0, L.TRUNK_Z + 1.5);
      s.castShadow = true;
      s.shadow.mapSize.set(1024, 1024);
      s.shadow.bias = -0.0004;
      s.shadow.normalBias = 0.02;
      s.shadow.camera.near = 0.5;
      s.shadow.camera.far = 22;
      this.group.add(s, s.target);
      this.spots.push(s);
    }
    this.stairLights = this.stairLamps.map((p) => {
      const l = new THREE.PointLight(0xffe2b8, 6, 12, 1.8);
      l.position.set(p.x, 4.8, p.z);
      this.group.add(l);
      return l;
    });
  }

  applyTheme(t) {
    this.theme = t;
    const m = this.m;
    const bt = T.tileTextures({ size: 512, cols: 4, rows: 2, bond: false, hue: t.hue, sat: t.sat, light: t.light, grime: t.grime, seed: 10 + t.index, glossy: 0.18, grout: '#2a2622' });
    for (const k of ['map', 'normalMap', 'roughnessMap']) { m.band[k]?.dispose(); m.band[k] = bt[k]; }
    m.band.needsUpdate = true;
    m.wall.color.set(t.wall);
    m.nameSign.map?.dispose();
    m.nameSign.map = T.nameSignTexture(t.name, t.band);
    m.nameSign.needsUpdate = true;
    m.map.map?.dispose();
    m.map.map = T.networkMapTexture(8, t.name);
    m.map.needsUpdate = true;
    const r = T.rng(100 + t.index * 7);
    this.posterMats.forEach(({ mat, wide }) => {
      const pool = wide ? this.posterPool.wide : this.posterPool.tall;
      mat.map = mat.emissiveMap = pool[Math.floor(r() * pool.length)];
      mat.needsUpdate = true;
    });
    // lighting mood
    const lamp = new THREE.Color(t.lamp);
    const level = t.level;
    this.points.forEach((l) => { l.color.copy(lamp); l.intensity = 16 * level; l.userData.base = 16 * level; });
    this.spots.forEach((s) => { s.color.copy(lamp); s.intensity = 40 * level; s.userData.base = 40 * level; });
    this.stairLights.forEach((l) => { l.intensity = 6 * level; l.userData.base = 6 * level; });
    this.hemi.intensity = 0.12 * level + 0.03;
    this.dustMat.uniforms.level.value = level;
    this.flickers = [];
    const c = new THREE.Color();
    for (let i = 0; i < this.tubeX.length; i++) {
      const roll = r();
      const broken = roll < t.broken;
      c.copy(lamp).multiplyScalar(broken ? 0.02 : 1.7 * (0.85 + 0.15 * level));
      this.tubes.setColorAt(i, c);
      this.tubesFar.setColorAt(i, c.copy(lamp).multiplyScalar(r() < t.broken ? 0.02 : 1.6));
      if (!broken && roll < t.broken + 0.04) this.flickers.push({ i, phase: r() * 10, light: this.nearestLight(this.tubeX[i]) });
    }
    this.tubes.instanceColor.needsUpdate = true;
    this.tubesFar.instanceColor.needsUpdate = true;
    this.lampColor = lamp;
    this.emergency = t.emergency;
    this.bloodDecals.forEach((d, i) => (d.visible = i < 3 + t.grime * 11));
    this.stairTubes.forEach((s) => s.material.color.copy(lamp).multiplyScalar(2 * level));
    this.setSignal(false);
  }

  nearestLight(x) {
    let best = null, bd = 1e9;
    for (const l of this.points) {
      const d = Math.abs(l.position.x - x);
      if (d < bd) { bd = d; best = l; }
    }
    return bd < 8 ? best : null;
  }

  setBoard(lines, colour) {
    this.board.update(lines, colour);
  }

  groundAt(x, z) {
    for (const s of L.STAIRS) {
      if (Math.abs(x - s) < L.STAIR_HW && z < L.BACK_Z) {
        if (z > L.STAIR_Z0) return 0;
        if (z < L.STAIR_Z1) return L.STAIR_TOP;
        return Math.min(L.STAIR_TOP, ((L.STAIR_Z0 - z) / (L.STAIR_Z0 - L.STAIR_Z1)) * L.STAIR_TOP + 0.12);
      }
    }
    if (z < L.EDGE_Z && Math.abs(x) <= L.HALF && z > L.BACK_Z - 0.3) return 0;
    return L.TRACK_Y;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.dustMat.uniforms.time.value = t;
    this.clockTimer -= dt;
    if (this.clockTimer <= 0) { this.clock.update(new Date()); this.clockTimer = 1; }
    const c = new THREE.Color();
    for (const f of this.flickers) {
      const n = Math.sin(t * 23 + f.phase) * Math.sin(t * 7.3 + f.phase * 2) + Math.sin(t * 0.7 + f.phase);
      const on = n > -0.2 ? 1 : n > -0.5 ? 0.3 : 0.02;
      this.tubes.setColorAt(f.i, c.copy(this.lampColor).multiplyScalar(1.7 * on));
      if (f.light) f.light.intensity = f.light.userData.base * (0.55 + 0.45 * on);
    }
    if (this.flickers.length) this.tubes.instanceColor.needsUpdate = true;
    if (this.emergency) {
      // emergency lighting: slow red pulse through the platform lights
      const k = 0.5 + 0.5 * Math.sin(t * 2.2);
      this.stairLights.forEach((l) => { l.color.setRGB(1, 0.15, 0.08); l.intensity = l.userData.base * (0.6 + k * 1.6); });
      for (const l of this.points) {
        if (this.flickers.some((f) => f.light === l)) continue;
        l.color.setRGB(1, 0.35 + 0.4 * (1 - k), 0.25 + 0.35 * (1 - k));
        l.intensity = l.userData.base * (0.75 + 0.5 * k);
      }
    } else {
      this.stairLights.forEach((l) => { l.color.setRGB(1, 0.88, 0.72); l.intensity = l.userData.base; });
    }
    // stair lights stutter a little
    const s = Math.sin(t * 13) * Math.sin(t * 3.1) > 0.92 ? 0.2 : 1;
    this.stairLights[0].intensity *= s;
  }
}
