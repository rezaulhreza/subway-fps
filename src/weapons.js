// Weapon models, viewmodel animation (bob, sway, recoil, reload, swap) and fire logic.
import * as THREE from 'three';
import * as T from './textures.js';

export const DEFS = [
  { id: 'pistol', name: 'P9 Pistol', mag: 12, reserve: 72, maxReserve: 120, dmg: 34, head: 2.5, rate: 0.14, auto: false, pellets: 1, spread: 0.009, adsSpread: 0.0025, recoil: 0.032, reload: 1.3, sound: 'pistol', casing: 'small', sight: 0.0535, hip: [0.16, -0.18, -0.46], adsZ: -0.4, adsFov: 62, falloff: 0 },
  { id: 'rifle', name: 'K-17 Rifle', mag: 30, reserve: 180, maxReserve: 300, dmg: 25, head: 2.2, rate: 0.09, auto: true, pellets: 1, spread: 0.017, adsSpread: 0.0035, recoil: 0.017, reload: 2.0, sound: 'rifle', casing: 'rifle', sight: 0.0815, hip: [0.2, -0.215, -0.55], adsZ: -0.36, adsFov: 50, falloff: 0 },
  { id: 'shotgun', name: 'Breacher 12', mag: 7, reserve: 28, maxReserve: 49, dmg: 16, head: 1.6, rate: 0.85, auto: false, pellets: 9, spread: 0.07, adsSpread: 0.05, recoil: 0.085, reloadShell: 0.48, sound: 'shotgun', casing: 'shell', sight: 0.043, hip: [0.2, -0.205, -0.55], adsZ: -0.52, adsFov: 60, falloff: 1 },
];

class Spring {
  constructor(k = 160, c = 18) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  update(dt) { this.v += (-this.k * this.x - this.c * this.v) * dt; this.x += this.v * dt; return this.x; }
}

function mats() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    metal: std({ color: 0x2b2d30, metalness: 0.85, roughness: 0.32 }),
    darkMetal: std({ color: 0x18191b, metalness: 0.8, roughness: 0.42 }),
    polymer: std({ color: 0x1f2022, metalness: 0.05, roughness: 0.62 }),
    tan: std({ color: 0x8c7a5b, metalness: 0.05, roughness: 0.7 }),
    wood: std({ map: woodTexture(), roughness: 0.55 }),
    glove: std({ color: 0x24221f, roughness: 0.85 }),
    sleeve: std({ color: 0x39402f, roughness: 0.9 }),
    brass: std({ color: 0xc9a24a, metalness: 1, roughness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x88aacc, roughness: 0, metalness: 0, transparent: true, opacity: 0.18 }),
    dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.2, 0.15), toneMapped: false }),
    tritium: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 3, 0.8), toneMapped: false }),
    red: std({ color: 0xa3201c, roughness: 0.5 }),
  };
}

function woodTexture() {
  const c = T.makeCanvas(256, 256), x = c.getContext('2d'), r = T.rng(17);
  x.fillStyle = '#5a3820'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    x.strokeStyle = `rgba(${30 + r() * 30},${15 + r() * 15},5,${0.2 + r() * 0.3})`;
    x.lineWidth = 1 + r() * 2;
    x.beginPath();
    let y = r() * 256;
    x.moveTo(0, y);
    for (let k = 0; k <= 8; k++) x.lineTo(k * 32, y + Math.sin(k * 0.8 + i) * 4);
    x.stroke();
  }
  return T.toTexture(c);
}

function box(group, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  group.add(m);
  return m;
}

function cylZ(group, mat, r0, r1, len, x, y, z, seg = 14, open = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg, 1, open).rotateX(Math.PI / 2), mat);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

function limb(group, mat, a, b, r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, len, 12), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  group.add(m);
  return m;
}

function hand(group, M, pos, rot = [0, 0, 0], elbow) {
  const h = new THREE.Group();
  h.position.set(...pos);
  h.rotation.set(...rot);
  box(h, M.glove, 0.055, 0.085, 0.1, 0, 0, 0);
  for (let i = 0; i < 4; i++) box(h, M.glove, 0.014, 0.022, 0.06, -0.02 + i * 0.013, -0.045, 0.02, 0.3);
  box(h, M.glove, 0.018, 0.05, 0.02, 0.03, 0.02, -0.03, 0, 0, -0.5);
  group.add(h);
  if (elbow) {
    limb(group, M.glove, pos, [pos[0] + (elbow[0] - pos[0]) * 0.18, pos[1] + (elbow[1] - pos[1]) * 0.18, pos[2] + (elbow[2] - pos[2]) * 0.18], 0.03);
    limb(group, M.sleeve, [pos[0] + (elbow[0] - pos[0]) * 0.15, pos[1] + (elbow[1] - pos[1]) * 0.15, pos[2] + (elbow[2] - pos[2]) * 0.15], elbow, 0.04);
  }
  return h;
}

function muzzleFlash(flashTex, sideTex) {
  const g = new THREE.Group();
  const mk = (tex) => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(4, 3.3, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), mk(flashTex));
  g.add(front);
  const sm = mk(sideTex);
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.09), sm);
    s.rotation.set(0, Math.PI / 2, i * Math.PI / 2);
    s.position.z = -0.15;
    g.add(s);
  }
  g.visible = false;
  return g;
}

function buildPistol(M) {
  const g = new THREE.Group();
  box(g, M.polymer, 0.03, 0.03, 0.17, 0, 0.0, -0.06);
  const slide = new THREE.Group();
  box(slide, M.metal, 0.03, 0.03, 0.19, 0, 0.031, -0.07);
  for (let i = 0; i < 6; i++) box(slide, M.darkMetal, 0.031, 0.024, 0.003, 0, 0.031, 0.01 - i * 0.007);
  box(slide, M.darkMetal, 0.031, 0.01, 0.04, 0.001, 0.038, -0.07); // ejection port
  box(slide, M.darkMetal, 0.008, 0.008, 0.008, -0.009, 0.05, 0.016);
  box(slide, M.darkMetal, 0.008, 0.008, 0.008, 0.009, 0.05, 0.016);
  box(slide, M.darkMetal, 0.004, 0.009, 0.006, 0, 0.0495, -0.155);
  const trit = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 6, 4), M.tritium);
  trit.position.set(0, 0.0525, -0.152);
  slide.add(trit);
  g.add(slide);
  cylZ(g, M.darkMetal, 0.0065, 0.0065, 0.02, 0, 0.032, -0.165);
  const grip = new THREE.Group();
  grip.position.set(0, -0.05, 0.012);
  grip.rotation.x = 0.22;
  box(grip, M.polymer, 0.032, 0.105, 0.048, 0, 0, 0);
  for (let i = 0; i < 5; i++) box(grip, M.darkMetal, 0.033, 0.004, 0.044, 0, 0.035 - i * 0.017, 0);
  const mag = box(grip, M.darkMetal, 0.026, 0.11, 0.036, 0, -0.012, 0);
  g.add(grip);
  box(g, M.polymer, 0.006, 0.006, 0.05, 0, -0.025, -0.045); // guard
  box(g, M.polymer, 0.006, 0.025, 0.006, 0, -0.014, -0.069);
  box(g, M.darkMetal, 0.004, 0.018, 0.006, 0, -0.012, -0.035, 0.3); // trigger
  hand(g, M, [0.0, -0.06, 0.03], [0.22, 0, 0], [0.09, -0.2, 0.32]);
  hand(g, M, [-0.03, -0.065, 0.015], [0.2, 0.3, 0.35], [-0.16, -0.22, 0.28]);
  return { group: g, slide, mag, magHome: mag.position.clone(), muzzle: new THREE.Vector3(0, 0.032, -0.18), port: new THREE.Vector3(0.02, 0.04, -0.07) };
}

function buildRifle(M) {
  const g = new THREE.Group();
  box(g, M.metal, 0.048, 0.06, 0.3, 0, 0.0, -0.06);
  box(g, M.darkMetal, 0.032, 0.012, 0.36, 0, 0.036, -0.1);
  for (let i = 0; i < 18; i++) box(g, M.metal, 0.034, 0.005, 0.008, 0, 0.044, 0.07 - i * 0.02);
  box(g, M.darkMetal, 0.049, 0.018, 0.05, 0.001, 0.012, -0.03); // port
  box(g, M.metal, 0.012, 0.01, 0.03, 0.02, 0.02, 0.05); // charging handle
  // handguard with vents
  box(g, M.polymer, 0.052, 0.056, 0.26, 0, 0.004, -0.34);
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) box(g, M.darkMetal, 0.002, 0.016, 0.022, s * 0.026, 0.004, -0.25 - i * 0.035);
  }
  cylZ(g, M.darkMetal, 0.0085, 0.0085, 0.2, 0, 0.008, -0.55);
  const brake = cylZ(g, M.metal, 0.014, 0.014, 0.055, 0, 0.008, -0.66);
  for (let i = 0; i < 3; i++) box(g, M.darkMetal, 0.03, 0.004, 0.008, 0, 0.018, -0.645 - i * 0.014);
  // magazine (slight curve)
  const mag = new THREE.Group();
  box(mag, M.darkMetal, 0.03, 0.09, 0.06, 0, -0.04, 0, 0.12);
  box(mag, M.darkMetal, 0.03, 0.07, 0.058, 0, -0.11, 0.013, 0.32);
  box(mag, M.metal, 0.032, 0.008, 0.062, 0, -0.145, 0.026, 0.32);
  mag.position.set(0, -0.03, -0.1);
  g.add(mag);
  const grip = new THREE.Group();
  grip.position.set(0, -0.06, 0.05);
  grip.rotation.x = 0.35;
  box(grip, M.polymer, 0.032, 0.1, 0.045, 0, -0.01, 0);
  g.add(grip);
  box(g, M.polymer, 0.006, 0.006, 0.06, 0, -0.04, 0.01);
  // stock
  box(g, M.metal, 0.02, 0.02, 0.1, 0, 0.0, 0.14);
  box(g, M.polymer, 0.04, 0.07, 0.17, 0, -0.012, 0.25);
  box(g, M.darkMetal, 0.042, 0.075, 0.02, 0, -0.012, 0.34);
  // red dot sight
  const sight = new THREE.Group();
  sight.position.set(0, 0.0815, -0.05);
  box(sight, M.darkMetal, 0.024, 0.025, 0.05, 0, -0.03, 0);
  cylZ(sight, M.metal, 0.019, 0.019, 0.055, 0, 0, 0, 20, true);
  const inner = cylZ(sight, M.darkMetal, 0.017, 0.017, 0.055, 0, 0, 0, 20, true);
  inner.material = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8, side: THREE.BackSide });
  for (const z of [-0.0275, 0.0275]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.0165, 0.0195, 24), M.darkMetal);
    ring.position.z = z;
    sight.add(ring);
  }
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.016, 20), M.glass);
  lens.position.z = -0.026;
  sight.add(lens);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0007, 8, 6), M.dot);
  dot.position.z = -0.02;
  sight.add(dot);
  box(sight, M.metal, 0.008, 0.012, 0.012, 0.022, 0, 0); // turret
  g.add(sight);
  hand(g, M, [0.0, -0.075, 0.05], [0.35, 0, 0], [0.1, -0.2, 0.36]);
  const support = hand(g, M, [-0.01, -0.035, -0.34], [0, 0, -0.3], [-0.2, -0.22, -0.02]);
  return { group: g, mag, magHome: mag.position.clone(), muzzle: new THREE.Vector3(0, 0.008, -0.7), port: new THREE.Vector3(0.03, 0.015, -0.03), support };
}

function buildShotgun(M) {
  const g = new THREE.Group();
  box(g, M.metal, 0.044, 0.062, 0.22, 0, 0.0, -0.02);
  box(g, M.darkMetal, 0.045, 0.02, 0.06, 0.001, 0.01, -0.02); // port
  cylZ(g, M.darkMetal, 0.011, 0.011, 0.52, 0, 0.022, -0.39);
  cylZ(g, M.metal, 0.0095, 0.0095, 0.42, 0, -0.008, -0.34);
  box(g, M.metal, 0.012, 0.01, 0.48, 0, 0.034, -0.37); // vent rib
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), M.brass);
  bead.position.set(0, 0.0415, -0.6);
  g.add(bead);
  const pump = new THREE.Group();
  pump.position.set(0, -0.006, -0.3);
  box(pump, M.wood, 0.05, 0.042, 0.16, 0, 0, 0);
  for (let i = 0; i < 7; i++) box(pump, M.darkMetal, 0.051, 0.043, 0.004, 0, 0, -0.06 + i * 0.02);
  g.add(pump);
  // stock and grip in wood
  const stock = new THREE.Group();
  stock.position.set(0, -0.02, 0.1);
  box(stock, M.wood, 0.04, 0.05, 0.1, 0, 0, 0, 0.25);
  box(stock, M.wood, 0.042, 0.075, 0.24, 0, -0.03, 0.15, 0.12);
  box(stock, M.polymer, 0.044, 0.085, 0.02, 0, -0.045, 0.27, 0.12);
  g.add(stock);
  box(g, M.metal, 0.006, 0.006, 0.05, 0, -0.04, 0.02);
  const shell = new THREE.Group();
  cylZ(shell, M.red, 0.0095, 0.0095, 0.055, 0, 0, 0);
  cylZ(shell, M.brass, 0.0098, 0.0098, 0.014, 0, 0, 0.032);
  shell.position.set(0, -0.04, -0.03);
  shell.visible = false;
  g.add(shell);
  hand(g, M, [0.0, -0.06, 0.08], [0.35, 0, 0], [0.1, -0.2, 0.38]);
  const support = hand(pump, M, [-0.005, -0.03, 0], [0, 0, -0.25], [-0.2, -0.2, 0.28]);
  return { group: g, pump, pumpHome: pump.position.clone(), shell, muzzle: new THREE.Vector3(0, 0.022, -0.66), port: new THREE.Vector3(0.03, 0.01, -0.02), support };
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Weapons {
  constructor(vmScene, vmCam) {
    this.scene = vmScene;
    this.cam = vmCam;
    const M = (this.M = mats());
    this.root = new THREE.Group();
    vmCam.add(this.root);
    vmScene.add(vmCam);
    this.models = [buildPistol(M), buildRifle(M), buildShotgun(M)];
    const flashTex = [1, 2, 3].map((s) => T.flashTexture(s));
    const sideTex = T.flashSideTexture();
    for (const m of this.models) {
      m.group.visible = false;
      m.group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      m.flash = muzzleFlash(flashTex[0], sideTex);
      m.flash.position.copy(m.muzzle);
      m.flashTex = flashTex;
      m.group.add(m.flash);
      this.root.add(m.group);
    }
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2.5, 1.5);
    this.root.add(this.flashLight);
    vmScene.add(new THREE.HemisphereLight(0xfff0dd, 0x201812, 0.6));
    const key = new THREE.DirectionalLight(0xfff0e0, 0.9);
    key.position.set(0.3, 1, 0.2);
    vmCam.add(key);
    this.key = key;
    this.state = DEFS.map((d) => ({ mag: d.mag, reserve: d.reserve }));
    this.current = 1;
    this.pending = -1;
    this.swapT = 0;
    this.models[1].group.visible = true;
    this.cool = 0;
    this.reloading = null;
    this.ads = 0;
    this.kickZ = new Spring(220, 22);
    this.kickPitch = new Spring(200, 18);
    this.kickRoll = new Spring(160, 14);
    this.slideKick = new Spring(900, 50);
    this.pumpT = -1;
    this.pumpDelay = 0;
    this.sway = new THREE.Vector2();
    this.bloom = 0;
    this.flashT = 0;
    this.triggerHeld = false;
    this.triggerConsumed = false;
    this.listeners = {};
  }

  on(evt, fn) { this.listeners[evt] = fn; }
  emit(evt, ...a) { this.listeners[evt]?.(...a); }

  get def() { return DEFS[this.current]; }
  get ammo() { return this.state[this.current]; }
  get busy() { return this.swapT > 0 || this.pending >= 0; }

  refill() {
    DEFS.forEach((d, i) => { this.state[i].reserve = Math.max(this.state[i].reserve, d.reserve); });
  }

  addAmmo(fraction) {
    DEFS.forEach((d, i) => { this.state[i].reserve = Math.min(d.maxReserve, this.state[i].reserve + Math.ceil(d.mag * fraction)); });
  }

  switchTo(i) {
    if (i === this.current && this.pending < 0) return;
    if (i < 0 || i >= DEFS.length) return;
    this.pending = i;
    this.swapT = 0.22;
    this.reloading = null;
    this.models[2].shell.visible = false;
    this.emit('swap');
  }

  reload() {
    const d = this.def, s = this.ammo;
    if (this.reloading || this.busy || s.mag >= d.mag || s.reserve <= 0) return;
    if (d.id === 'shotgun') {
      this.reloading = { t: 0, dur: d.reloadShell, shell: true, interrupt: false };
    } else {
      this.reloading = { t: 0, dur: d.reload, empty: s.mag === 0, events: new Set() };
    }
  }

  // Muzzle point in world space as seen through the main camera.
  muzzleWorld(camera, out) {
    const m = this.models[this.current];
    m.group.updateWorldMatrix(true, false);
    _v.copy(m.muzzle).applyMatrix4(m.group.matrixWorld);
    const viewZ = _v2.copy(_v).applyMatrix4(this.cam.matrixWorldInverse).z;
    _v.project(this.cam);
    out.set(_v.x, _v.y, 0.5).unproject(camera).sub(camera.position).normalize();
    return out.multiplyScalar(Math.abs(viewZ) * 1.05).add(camera.position);
  }

  portWorld(out) {
    const m = this.models[this.current];
    return out.copy(m.port).applyMatrix4(m.group.matrixWorld);
  }

  update(dt, input, player, time) {
    const d = this.def;
    const st = this.ammo;
    const m = this.models[this.current];
    this.cool -= dt;

    // weapon swap
    if (this.pending >= 0) {
      this.swapT -= dt;
      if (this.swapT <= 0) {
        this.models[this.current].group.visible = false;
        this.current = this.pending;
        this.pending = -1;
        this.models[this.current].group.visible = true;
        this.swapT = -0.25; // raising
        this.emit('changed');
      }
    } else if (this.swapT < 0) {
      this.swapT = Math.min(0, this.swapT + dt);
    }

    const sprinting = player.sprinting;
    const wantAds = input.aim && !sprinting && this.pending < 0 && !(this.reloading && d.id !== 'shotgun');
    this.ads += ((wantAds ? 1 : 0) - this.ads) * Math.min(1, dt * 14);

    // reload progress
    if (this.reloading) {
      const r = this.reloading;
      r.t += dt;
      if (r.shell) {
        const shellVis = r.t / r.dur;
        this.models[2].shell.visible = shellVis > 0.15 && shellVis < 0.75;
        this.models[2].shell.position.set(0, -0.045 + shellVis * 0.02, -0.03 - shellVis * 0.04);
        if (r.t >= r.dur) {
          st.mag++; st.reserve--;
          this.emit('mech', 'shell');
          this.models[2].shell.visible = false;
          if (st.mag < d.mag && st.reserve > 0 && !r.interrupt) { r.t = 0; }
          else { this.reloading = null; this.pumpT = 0; this.cool = 0.5; this.emit('mech', 'pump'); }
        }
      } else {
        const k = r.t / r.dur;
        if (k > 0.18 && !r.events.has('out')) { r.events.add('out'); this.emit('mech', 'magOut'); }
        if (k > 0.58 && !r.events.has('in')) { r.events.add('in'); this.emit('mech', 'magIn'); }
        if (r.empty && k > 0.82 && !r.events.has('slide')) { r.events.add('slide'); this.emit('mech', 'slide'); }
        if (k >= 1) {
          const need = d.mag - st.mag;
          const take = Math.min(need, st.reserve);
          st.mag += take; st.reserve -= take;
          this.reloading = null;
        }
      }
    }

    // firing
    const pressed = input.fire && !this.triggerHeld;
    this.triggerHeld = input.fire;
    if (input.fire && this.reloading?.shell && st.mag > 0) this.reloading.interrupt = true;
    const canFire = this.pending < 0 && this.swapT >= 0 && !sprinting && this.cool <= 0 && (!this.reloading) && this.pumpT < 0 && this.pumpDelay <= 0;
    if (canFire && (d.auto ? input.fire : pressed)) {
      if (st.mag > 0) {
        st.mag--;
        this.cool = d.rate;
        this.fire(d, m, player);
      } else if (pressed) {
        this.emit('dry');
        this.cool = 0.25;
        this.reload();
      }
    }
    if (st.mag === 0 && !this.reloading && this.cool <= 0 && !this.busy && st.reserve > 0 && !input.fire) this.reload();

    this.bloom = Math.max(0, this.bloom - dt * (d.auto ? 2.2 : 3));

    // shotgun pump cycle
    if (this.pumpDelay > 0) {
      this.pumpDelay -= dt;
      if (this.pumpDelay <= 0) this.pumpT = 0;
    }
    if (this.pumpT >= 0) {
      this.pumpT += dt / 0.55;
      const k = this.pumpT;
      const back = k < 0.25 ? 0 : k < 0.55 ? (k - 0.25) / 0.3 : k < 0.85 ? 1 - (k - 0.55) / 0.3 : 0;
      this.models[2].pump.position.z = this.models[2].pumpHome.z + back * 0.085;
      if (k >= 1) this.pumpT = -1;
    }

    this.pose(dt, input, player, time, d, m);
  }

  fire(d, m, player) {
    this.kickZ.v += 1.6 + d.recoil * 20;
    this.kickPitch.v += 6 + d.recoil * 90;
    this.kickRoll.v += (Math.random() - 0.5) * 6;
    if (d.id === 'pistol') this.slideKick.v += 2.2;
    if (d.id === 'shotgun') this.pumpDelay = 0.2; // pump once the recoil settles
    this.bloom = Math.min(1, this.bloom + (d.auto ? 0.16 : 0.4));
    this.flashT = 0.05;
    m.flash.visible = true;
    m.flash.rotation.z = Math.random() * Math.PI * 2;
    m.flash.scale.setScalar(0.8 + Math.random() * 0.5 * (d.id === 'shotgun' ? 1.6 : 1));
    m.flash.children[0].material.map = m.flashTex[Math.floor(Math.random() * 3)];
    this.flashLight.position.copy(m.muzzle).applyMatrix4(m.group.matrix);
    this.flashLight.intensity = 3;
    const spread = THREE.MathUtils.lerp(d.spread, d.adsSpread, this.ads) * (1 + this.bloom * 1.6) * (1 + player.moveFactor * 0.8);
    this.emit('fire', d, spread);
    if (d.id === 'shotgun') setTimeout(() => this.emit('mech', 'pump'), 420);
  }

  spreadNow(player) {
    const d = this.def;
    return THREE.MathUtils.lerp(d.spread, d.adsSpread, this.ads) * (1 + this.bloom * 1.6) * (1 + player.moveFactor * 0.8);
  }

  pose(dt, input, player, time, d, m) {
    const g = m.group;
    const ads = this.ads;
    const kz = this.kickZ.update(dt), kp = this.kickPitch.update(dt), kr = this.kickRoll.update(dt);
    const sk = this.slideKick.update(dt);
    if (m.slide) {
      const locked = this.ammo.mag === 0 && !(this.reloading && this.reloading.t / this.reloading.dur > 0.82);
      m.slide.position.z = locked ? 0.04 : Math.max(0, sk * 0.02);
    }
    // sway follows the mouse with lag
    this.sway.x += (THREE.MathUtils.clamp(-input.dx * 0.0009, -0.05, 0.05) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (THREE.MathUtils.clamp(input.dy * 0.0009, -0.05, 0.05) - this.sway.y) * Math.min(1, dt * 10);
    const swayK = 1 - ads * 0.8;
    // bob
    const bobAmt = player.bobAmount * (1 - ads * 0.85);
    const bp = player.bobPhase;
    const bx = Math.sin(bp) * 0.011 * bobAmt;
    const by = -Math.abs(Math.cos(bp)) * 0.009 * bobAmt;
    const breath = Math.sin(time * 1.4) * 0.0015 * (1 - ads * 0.7);
    const hip = d.hip;
    const tx = THREE.MathUtils.lerp(hip[0], 0, ads);
    const ty = THREE.MathUtils.lerp(hip[1], -d.sight, ads);
    const tz = THREE.MathUtils.lerp(hip[2], d.adsZ, ads);
    let px = tx + bx + this.sway.x * swayK;
    let py = ty + by + breath + this.sway.y * swayK - player.landKick * 0.04;
    let pz = tz + kz * 0.06 * (1 - ads * 0.4);
    let rx = kp * 0.06 + this.sway.y * 2 * swayK;
    let ry = this.sway.x * 2 * swayK + 0.045 * (1 - ads);
    let rz = kr * 0.05 + bx * 2;
    // sprint pose
    const sp = player.sprintBlend;
    px += sp * -0.04; py += sp * -0.03;
    rx += sp * -0.25; ry += sp * 0.55; rz += sp * 0.25;
    // reload pose
    if (this.reloading) {
      const r = this.reloading;
      const k = r.shell ? 0.6 : Math.sin(Math.min(1, r.t / r.dur) * Math.PI);
      rx += k * (r.shell ? 0.15 : 0.35); rz += k * (r.shell ? -0.35 : 0.55); py -= k * 0.035;
      if (m.mag && !r.shell) {
        const t = r.t / r.dur;
        const drop = t < 0.2 ? 0 : t < 0.35 ? (t - 0.2) / 0.15 : t < 0.5 ? 1 : t < 0.62 ? 1 - (t - 0.5) / 0.12 : 0;
        m.mag.position.copy(m.magHome);
        m.mag.position.y -= drop * 0.25;
        m.mag.visible = drop < 0.95;
      }
    } else if (m.mag) {
      m.mag.position.copy(m.magHome);
      m.mag.visible = true;
    }
    // swap: lower then raise
    if (this.pending >= 0) { const k = 1 - this.swapT / 0.22; py -= k * 0.25; rx -= k * 0.6; }
    else if (this.swapT < 0) { const k = -this.swapT / 0.25; py -= k * 0.25; rx -= k * 0.6; }
    g.position.set(px, py, pz);
    g.rotation.set(rx, ry, rz);
    // flash timing
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) m.flash.visible = false;
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 60);
  }
}
