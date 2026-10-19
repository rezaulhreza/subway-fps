// Three-car train: body, interior, sliding doors, lights and colliders in train space.
import * as THREE from 'three';
import { Batch, vaultGeometry, cyl, matrixOf, AXIS_X } from './build.js';
import * as T from './textures.js';
import { L } from './layout.js';

const HL = 8.5; // car half length
const HW = 1.35; // car half width
const GAP = 0.8;
const DOORS = [-4.6, 4.6];
const DOOR_HW = 0.7;
const DOOR_H = 2.0;
export const CAR_CENTRES = [-(2 * HL + GAP), 0, 2 * HL + GAP];
export const TRAIN_HALF = 3 * HL + GAP;

function lineStripTexture(names, current) {
  const w = 1024, h = 128;
  const c = T.makeCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#c2372f'; x.fillRect(40, 54, w - 80, 10);
  x.textAlign = 'center';
  names.forEach((n, i) => {
    const px = 60 + (i * (w - 120)) / (names.length - 1);
    const here = i === current, next = i === current + 1;
    x.fillStyle = '#fff'; x.strokeStyle = '#16181d'; x.lineWidth = 4;
    x.beginPath(); x.arc(px, 59, here || next ? 13 : 9, 0, Math.PI * 2); x.fill(); x.stroke();
    if (next) { x.fillStyle = '#c2372f'; x.beginPath(); x.arc(px, 59, 6, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = i < current ? '#9a968c' : '#16181d';
    x.font = `${next ? 700 : 500} 19px Barlow, Arial, sans-serif`;
    x.fillText(n, px, i % 2 ? 108 : 34);
  });
  return T.toTexture(c, { repeat: false });
}

export class Train {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'train';
    scene.add(this.group);
    this.x = -1000;
    this.v = 0;
    this.doorOpen = 0; // 0 closed, 1 open
    this.doorTarget = 0;
    this.present = false;
    this.makeMaterials();
    this.build();
    this.colliderTemplates();
    this.setPresent(false);
  }

  makeMaterials() {
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const m = (this.m = {});
    m.body = std({ color: 0xdfe2e4, metalness: 0.55, roughness: 0.32 });
    m.inner = std({ color: 0xc9c5ba, roughness: 0.6 });
    m.stripe = std({ color: 0x9e2b25, roughness: 0.4 });
    m.door = std({ color: 0xb7232a, metalness: 0.35, roughness: 0.38 });
    m.under = std({ color: 0x1c1d1f, metalness: 0.5, roughness: 0.7 });
    m.wheel = std({ color: 0x3a3836, metalness: 0.9, roughness: 0.4 });
    const rub = T.rubberFloorTexture();
    m.floor = std({ ...rub, roughness: 0.85 });
    m.seat = std({ map: T.moquetteTexture(5), roughness: 0.95 });
    m.seatBase = std({ color: 0x3c4148, metalness: 0.4, roughness: 0.5 });
    m.pole = std({ color: 0xe2b21c, metalness: 0.3, roughness: 0.35 });
    m.rubber = std({ color: 0x111111, roughness: 0.9 });
    m.glass = new THREE.MeshPhysicalMaterial({ color: 0x9bb3bd, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5 });
    m.darkGlass = std({ color: 0x0b0f12, metalness: 0.2, roughness: 0.08 });
    m.light = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.47, 1.38), toneMapped: false });
    m.head = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 4.6), toneMapped: false });
    m.tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.2, 0.1), toneMapped: false });
    this.dest = T.ledBoard(512, 64);
    m.dest = new THREE.MeshBasicMaterial({ map: this.dest.texture, toneMapped: false, color: new THREE.Color(1.8, 1.8, 1.8) });
    m.strip = std({ roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.15 });
    m.ads = ['VELLUM  /  wake up. stay up.', 'SUNBAY  7 nights from £199', 'orbit  -  signal, even down here', 'SEE IT. SAY IT. RUN.', 'THE LAST TRAIN - in cinemas'].map((t, i) =>
      std({ map: T.textSignTexture(t, { bg: ['#3b2416', '#2b8fb3', '#101418', '#c2372f', '#0b1020'][i], w: 512, h: 128, size: 54 }), roughness: 0.5 }),
    );
  }

  build() {
    const m = this.m;
    const b = new Batch();
    const glassB = new Batch();
    const TZ = L.TRACK_Z;
    this.doors = [];
    this.lights = [];
    for (let ci = 0; ci < 3; ci++) {
      const cx = CAR_CENTRES[ci];
      const segs = [[-HL, DOORS[0] - DOOR_HW], [DOORS[0] + DOOR_HW, DOORS[1] - DOOR_HW], [DOORS[1] + DOOR_HW, HL]];
      for (const sd of [-1, 1]) {
        const zo = TZ + sd * HW, zi = zo - sd * 0.06;
        for (const [a0, a1] of segs) {
          const a = cx + a0, c = cx + a1;
          b.box(m.body, a, -0.45, zi, c, 0.95, zo, 1);
          b.box(m.stripe, a, 0.8, zo, c, 0.92, zo + sd * 0.006, 1);
          b.box(m.body, a, 1.85, zi, c, 2.3, zo, 1);
          // window piers
          const len = c - a;
          const n = Math.max(1, Math.round(len / 1.7));
          for (let k = 0; k <= n; k++) {
            const px = a + (k * len) / n;
            const pw = k === 0 || k === n ? 0.18 : 0.12;
            const p0 = k === 0 ? px : k === n ? px - pw : px - pw / 2;
            b.box(m.body, p0, 0.95, zi, p0 + pw, 1.85, zo, 1);
            b.box(m.rubber, p0 - 0.01, 0.95, zo - sd * 0.01, p0 + pw + 0.01, 1.85, zo + sd * 0.004, 1);
          }
          glassB.add(m.glass, new THREE.PlaneGeometry(len, 0.9), matrixOf([(a + c) / 2, 1.4, zo - sd * 0.03], [0, sd < 0 ? Math.PI : 0, 0]), 0);
        }
        for (const d of DOORS) {
          const a = cx + d - DOOR_HW, c = cx + d + DOOR_HW;
          b.box(m.body, a, -0.45, zi, c, 0, zo, 1);
          b.box(m.seatBase, a, -0.02, zi - sd * 0.02, c, 0.0, zo, 1);
          b.box(m.body, a, DOOR_H, zi, c, 2.3, zo, 1);
          // door leaves slide outside the body skin
          for (const side of [-1, 1]) {
            const leaf = this.makeLeaf(sd);
            leaf.position.set(cx + d + side * DOOR_HW / 2, 0, zo + sd * 0.03);
            this.group.add(leaf);
            this.doors.push({ mesh: leaf, base: leaf.position.x, dir: side, near: sd < 0 });
          }
        }
      }
      // roof and ceiling
      b.add(m.body, vaultGeometry(cx - HL, cx + HL, TZ, HW, 0.48, 2.3, 20, true, 1), null, 0);
      b.add(m.inner, vaultGeometry(cx - HL + 0.06, cx + HL - 0.06, TZ, HW - 0.06, 0.24, 2.24, 20, false, 1), null, 0);
      b.box(m.inner, cx - HL, 2.15, TZ - HW + 0.06, cx + HL, 2.3, TZ - HW + 0.12, 1);
      b.box(m.inner, cx - HL, 2.15, TZ + HW - 0.12, cx + HL, 2.3, TZ + HW - 0.06, 1);
      for (const sz of [-1, 1]) {
        b.box(m.inner, cx - HL + 0.1, 2.38, TZ + sz * 0.55 - 0.1, cx + HL - 0.1, 2.42, TZ + sz * 0.55 + 0.1, 1);
      }
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2 * HL - 0.4, 0.02, 0.14), m.light);
      for (const sz of [-1, 1]) {
        const s = strip.clone();
        s.position.set(cx, 2.37, TZ + sz * 0.55);
        this.group.add(s);
      }
      // ends
      for (const e of [-1, 1]) {
        const ex = cx + e * HL;
        b.box(m.body, ex - e * 0.08, -0.45, TZ - HW, ex, 2.3, TZ + HW, 1);
        b.box(m.inner, ex - e * 0.1, 0, TZ - HW + 0.06, ex - e * 0.08, 2.25, TZ + HW - 0.06, 1);
        const isCab = (ci === 0 && e < 0) || (ci === 2 && e > 0);
        if (isCab) {
          b.box(m.darkGlass, ex, 1.0, TZ - 1.0, ex + e * 0.04, 1.95, TZ + 1.0, 1);
          b.box(m.door, ex, -0.45, TZ - HW, ex + e * 0.06, 0.6, TZ + HW, 1);
          b.box(m.under, ex, -0.65, TZ - 1.0, ex + e * 0.35, -0.3, TZ + 1.0, 1);
          b.box(m.rubber, ex + e * 0.04, 1.2, TZ - 0.02, ex + e * 0.06, 1.9, TZ + 0.02, 1);
          for (const sz of [-1, 1]) {
            const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.11, 18), e > 0 ? m.head : m.tail);
            lamp.position.set(ex + e * 0.065, 0.3, TZ + sz * 0.95);
            lamp.rotation.y = e * Math.PI / 2;
            this.group.add(lamp);
          }
          const dest = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.19), m.dest);
          dest.position.set(ex + e * 0.045, 2.08, TZ);
          dest.rotation.y = e * Math.PI / 2;
          this.group.add(dest);
        } else {
          // gangway door window and bellows to the next car
          b.box(m.darkGlass, ex - e * 0.105, 0.95, TZ - 0.3, ex - e * 0.1, 1.85, TZ + 0.3, 1);
          b.box(m.darkGlass, ex, 0.95, TZ - 0.3, ex + e * 0.005, 1.85, TZ + 0.3, 1);
          if (e > 0) b.box(m.rubber, ex, -0.1, TZ - 0.75, ex + GAP, 2.15, TZ + 0.75, 0.5);
        }
      }
      // floor and underframe
      b.box(m.floor, cx - HL + 0.06, -0.08, TZ - HW + 0.04, cx + HL - 0.06, 0, TZ + HW - 0.04, 1);
      b.box(m.under, cx - 4.2, -0.8, TZ - 1.1, cx + 4.2, -0.45, TZ + 1.1, 1);
      for (const k of [-3, -1, 1.5, 3]) b.box(m.under, cx + k - 0.5, -0.95, TZ - 0.9, cx + k + 0.5, -0.8, TZ + 0.9, 1);
      for (const bx of [-6.2, 6.2]) {
        b.box(m.under, cx + bx - 1.3, -0.62, TZ - 0.95, cx + bx + 1.3, -0.4, TZ + 0.95, 1);
        for (const ax of [-0.95, 0.95]) {
          for (const sz of [-1, 1]) {
            b.add(m.wheel, cyl(0.42, 0.42, 0.12, 20), matrixOf([cx + bx + ax, L.RAIL_Y + 0.42, TZ + sz * 0.7175], [Math.PI / 2, 0, 0]), 1);
          }
          b.add(m.under, cyl(0.06, 0.06, 1.6, 8), matrixOf([cx + bx + ax, L.RAIL_Y + 0.42, TZ], [Math.PI / 2, 0, 0]), 1);
        }
      }
      // seats
      for (const sd of [-1, 1]) {
        const zw = TZ + sd * (HW - 0.06);
        for (const [a0, a1] of segs) {
          const a = cx + a0 + (a0 === -HL ? 0.15 : 0.25), c = cx + a1 - (a1 === HL ? 0.15 : 0.25);
          b.box(m.seatBase, a, 0, zw, c, 0.38, zw - sd * 0.42, 1);
          b.box(m.seat, a, 0.38, zw, c, 0.47, zw - sd * 0.5, 0.5);
          b.add(m.seat, new THREE.BoxGeometry(c - a, 0.5, 0.08), matrixOf([(a + c) / 2, 0.74, zw - sd * 0.06], [-sd * 0.12, 0, 0]), 0.5);
          // armrests
          const n = Math.round((c - a) / 0.5);
          for (let k = 1; k < n; k += 3) {
            const px = a + (k * (c - a)) / n;
            b.box(m.seatBase, px - 0.012, 0.47, zw - sd * 0.08, px + 0.012, 0.6, zw - sd * 0.42, 1);
          }
          // ad strip above windows
          const ad = this.m.ads[(ci * 3 + Math.round(a0) + (sd > 0 ? 2 : 0) + 20) % this.m.ads.length];
          const p = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(1.2, c - a), 0.3), ad);
          p.position.set((a + c) / 2, 2.0, zw - sd * 0.08);
          p.rotation.y = sd > 0 ? Math.PI : 0;
          p.rotation.x = 0.25;
          this.group.add(p);
        }
        // grab rail along the seats
        b.add(m.pole, cyl(0.018, 0.018, 2 * HL - 0.6, 8), matrixOf([cx, 1.95, TZ + sd * 0.78], AXIS_X), 1);
        for (let hx = -HL + 0.8; hx < HL - 0.5; hx += 0.55) {
          if (DOORS.some((d) => Math.abs(hx - d) < DOOR_HW + 0.1)) continue;
          b.box(m.rubber, cx + hx - 0.012, 1.72, TZ + sd * 0.78 - 0.008, cx + hx + 0.012, 1.94, TZ + sd * 0.78 + 0.008, 1);
          b.add(m.rubber, new THREE.TorusGeometry(0.055, 0.012, 6, 14), matrixOf([cx + hx, 1.66, TZ + sd * 0.78], [0, Math.PI / 2, 0]), 1);
        }
      }
      // vertical poles at the door bays
      for (const d of DOORS) {
        for (const dx of [-DOOR_HW - 0.15, DOOR_HW + 0.15]) {
          for (const sd of [-1, 1]) b.add(m.pole, cyl(0.02, 0.02, 2.3, 8), matrixOf([cx + d + dx, 1.15, TZ + sd * (HW - 0.55)]), 1);
        }
        b.add(m.pole, cyl(0.022, 0.022, 2.35, 8), matrixOf([cx + d, 1.17, TZ]), 1);
      }
      // line map strip above the near doors
      for (const d of DOORS) {
        for (const sd of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.19), m.strip);
          p.position.set(cx + d, 2.12, TZ + sd * (HW - 0.07));
          p.rotation.y = sd > 0 ? Math.PI : 0;
          this.group.add(p);
        }
      }
      const pl = new THREE.PointLight(0xf4f1ea, 2.2, 11, 1.6);
      pl.position.set(cx, 2.1, TZ);
      this.group.add(pl);
      this.lights.push(pl);
    }
    this.meshes = b.build(this.group, { cast: true, receive: true, name: 'train' });
    glassB.build(this.group, { cast: false, receive: false, name: 'train-glass' }).forEach((g) => (g.renderOrder = 2));
    this.headlight = new THREE.SpotLight(0xfff2dc, 0, 90, 0.42, 0.5, 1.2);
    this.headlight.position.set(TRAIN_HALF + 0.2, 0.4, TZ);
    this.headlight.target.position.set(TRAIN_HALF + 20, 0, TZ);
    this.group.add(this.headlight, this.headlight.target);
  }

  makeLeaf(sd) {
    const m = this.m;
    const g = new THREE.Group();
    const w = DOOR_HW, t = 0.04;
    const box = (x0, y0, x1, y1, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, t), mat);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      mesh.castShadow = true;
      g.add(mesh);
    };
    box(-w / 2, 0, w / 2, 1.0, m.door);
    box(-w / 2, 1.75, w / 2, DOOR_H, m.door);
    box(-w / 2, 1.0, -w / 2 + 0.1, 1.75, m.door);
    box(w / 2 - 0.1, 1.0, w / 2, 1.75, m.door);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, 0.75), m.glass);
    glass.position.set(0, 1.375, 0);
    g.add(glass);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, DOOR_H, t + 0.01), m.rubber);
    g.add(edge);
    g.userData.edge = edge;
    return g;
  }

  colliderTemplates() {
    const TZ = L.TRACK_Z;
    const c = (this.staticCol = []);
    this.doorCol = [];
    const add = (arr, x0, z0, x1, z1) => arr.push({ min: new THREE.Vector3(x0, -2, z0), max: new THREE.Vector3(x1, 3.2, z1) });
    for (const cx of CAR_CENTRES) {
      const segs = [[-HL, DOORS[0] - DOOR_HW], [DOORS[0] + DOOR_HW, DOORS[1] - DOOR_HW], [DOORS[1] + DOOR_HW, HL]];
      for (const [a, b] of segs) {
        add(c, cx + a, TZ - HW - 0.06, cx + b, TZ - HW + 0.06);
        add(c, cx + a, TZ - HW, cx + b, TZ - HW + 0.5);
        add(c, cx + a, TZ + HW - 0.5, cx + b, TZ + HW);
      }
      add(c, cx - HL, TZ + HW - 0.06, cx + HL, TZ + HW + 0.06);
      add(c, cx - HL - 0.1, TZ - HW - 0.06, cx - HL + 0.1, TZ + HW + 0.06);
      add(c, cx + HL - 0.1, TZ - HW - 0.06, cx + HL + 0.1, TZ + HW + 0.06);
      for (const d of DOORS) add(this.doorCol, cx + d - DOOR_HW, TZ - HW - 0.06, cx + d + DOOR_HW, TZ - HW + 0.06);
    }
    // world-space copies refreshed as the train moves
    this.colliders = [...c, ...this.doorCol].map((b) => ({ min: b.min.clone(), max: b.max.clone(), src: b, door: this.doorCol.includes(b) }));
  }

  setPresent(on) {
    this.present = on;
    this.group.visible = on;
  }

  setX(x) {
    this.x = x;
    this.group.position.x = x;
    for (const c of this.colliders) {
      c.min.x = c.src.min.x + x;
      c.max.x = c.src.max.x + x;
    }
  }

  activeColliders() {
    if (!this.present) return [];
    return this.colliders.filter((c) => !c.door || this.doorOpen < 0.6);
  }

  // Car floor height, or null when (x, z) is not over a car.
  floorAt(x, z) {
    if (!this.present) return null;
    const lx = x - this.x;
    if (z < -0.05 || z > L.TRACK_Z + HW) return null;
    for (const cx of CAR_CENTRES) if (Math.abs(lx - cx) <= HL) return 0;
    return null;
  }

  insideCar(x, z) {
    if (!this.present) return -1;
    const lx = x - this.x;
    if (z < L.TRACK_Z - HW + 0.12 || z > L.TRACK_Z + HW) return -1;
    for (let i = 0; i < 3; i++) if (Math.abs(lx - CAR_CENTRES[i]) < HL - 0.1) return i;
    return -1;
  }

  // Any point within the train's swept volume (for hits on things on the track).
  overlaps(x, z, r = 0.4) {
    if (!this.present) return false;
    return Math.abs(x - this.x) < TRAIN_HALF + r && z > L.TRACK_Z - HW - r && z < L.TRACK_Z + HW + r;
  }

  nearestDoor(x) {
    let best = null, bd = 1e9;
    for (const cx of CAR_CENTRES) for (const d of DOORS) {
      const dx = this.x + cx + d;
      if (Math.abs(dx - x) < bd) { bd = Math.abs(dx - x); best = dx; }
    }
    return best;
  }

  setTheme(theme, names, index) {
    this.m.stripe.color.set(theme.band);
    this.dest.update([theme.name.toUpperCase()], '#ffb02e');
    this.m.strip.map?.dispose();
    this.m.strip.map = this.m.strip.emissiveMap = lineStripTexture(names, index);
    this.m.strip.needsUpdate = true;
  }

  update(dt, time) {
    const speed = this.doorTarget > this.doorOpen ? 1.1 : 0.9;
    this.doorOpen += Math.sign(this.doorTarget - this.doorOpen) * Math.min(Math.abs(this.doorTarget - this.doorOpen), dt * speed);
    const e = this.doorOpen < 0.5 ? 2 * this.doorOpen * this.doorOpen : 1 - (-2 * this.doorOpen + 2) ** 2 / 2;
    for (const d of this.doors) {
      if (!d.near) continue;
      d.mesh.position.x = d.base + d.dir * e * (DOOR_HW - 0.02);
    }
    this.headlight.intensity = this.present ? 160 : 0;
    // slight body roll at speed
    const sway = Math.min(1, Math.abs(this.v) / 18);
    this.group.rotation.x = Math.sin(time * 1.7) * 0.004 * sway;
    this.group.position.y = Math.sin(time * 9.0) * 0.004 * sway;
  }
}
