// Procedurally animated zombie humanoids, their AI and the wave spawner.
import * as THREE from 'three';
import * as T from './textures.js';
import { L } from './layout.js';

let SHARED = null;

function shared() {
  if (SHARED) return SHARED;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
  const g = {
    head: new THREE.SphereGeometry(0.104, 18, 14).scale(0.86, 1.1, 0.98),
    brow: new THREE.BoxGeometry(0.15, 0.025, 0.04),
    socket: new THREE.SphereGeometry(0.026, 10, 8).scale(1.2, 0.85, 0.6),
    ear: new THREE.SphereGeometry(0.025, 8, 6).scale(0.4, 1, 0.7),
    teeth: new THREE.BoxGeometry(0.07, 0.014, 0.012),
    jaw: new THREE.BoxGeometry(0.13, 0.05, 0.1),
    hair: new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45).scale(0.9, 1.08, 1.02),
    eye: new THREE.SphereGeometry(0.011, 8, 6),
    nose: new THREE.BoxGeometry(0.03, 0.045, 0.04),
    neck: new THREE.CylinderGeometry(0.05, 0.055, 0.12, 10),
    chest: cap(0.16, 0.22).scale(1.08, 1, 0.62),
    belly: cap(0.14, 0.08).scale(1.05, 1, 0.7),
    pelvis: cap(0.14, 0.04).scale(1.1, 1, 0.75),
    upperArm: cap(0.055, 0.19),
    foreArm: cap(0.046, 0.2),
    hand: new THREE.CapsuleGeometry(0.03, 0.06, 3, 8).scale(1.1, 1, 0.6),
    thigh: cap(0.074, 0.28),
    shin: cap(0.058, 0.31),
    foot: new THREE.BoxGeometry(0.1, 0.07, 0.25),
    wound: new THREE.SphereGeometry(0.05, 8, 6).scale(1, 1, 0.4),
  };
  const skins = [95, 70, 40, 180].map((h, i) => std({ map: T.skinTexture(11 + i, h), roughness: 0.7 }));
  const shirts = ['#5b6a7a', '#7d2a26', '#c9c3b5', '#2f3d2c', '#6b5a3e', '#1f2733', '#8a6f1e'].map((c, i) => std({ map: T.clothTexture(30 + i, c) }));
  const pants = ['#23272e', '#3a3226', '#2c3b52', '#4a4a47'].map((c, i) => std({ map: T.clothTexture(50 + i, c) }));
  const m = {
    skins, shirts, pants,
    shoe: std({ color: 0x141210, roughness: 0.6 }),
    hair: [std({ color: 0x1a1512 }), std({ color: 0x4a3420 }), std({ color: 0x7a7468 })],
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.5, 0.8), toneMapped: false }),
    eyeRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.2, 0.08), toneMapped: false }),
    socket: std({ color: 0x120a08, roughness: 0.9 }),
    teeth: std({ color: 0x9c8f6e, roughness: 0.5 }),
    wound: std({ color: 0x4a0606, roughness: 0.3 }),
    mouth: std({ color: 0x1a0505 }),
  };
  SHARED = { g, m };
  return SHARED;
}

export const TYPES = {
  walker: { hp: 100, speed: [0.85, 1.35], dmg: 12, scale: [0.94, 1.06], attack: 1.1, reach: 1.35, mass: 1 },
  runner: { hp: 70, speed: [3.7, 4.6], dmg: 9, scale: [0.9, 1.0], attack: 0.75, reach: 1.3, mass: 0.8 },
  brute: { hp: 480, speed: [1.5, 1.8], dmg: 26, scale: [1.28, 1.36], attack: 1.4, reach: 1.7, mass: 3 },
};

const _v = new THREE.Vector3();

export class Zombie {
  constructor(type, pos, mult, rand) {
    const { g, m } = shared();
    const def = TYPES[type];
    this.type = type;
    this.def = def;
    this.rand = rand;
    this.scale = def.scale[0] + rand() * (def.scale[1] - def.scale[0]);
    this.speed = (def.speed[0] + rand() * (def.speed[1] - def.speed[0])) * mult.speed;
    this.maxHp = this.hp = def.hp * mult.hp;
    this.dmg = def.dmg * mult.dmg;
    this.pos = pos.clone();
    this.vy = 0;
    this.yaw = rand() * Math.PI * 2;
    this.phase = rand() * 10;
    this.seed = rand() * 100;
    this.state = 'chase';
    this.attackT = -1;
    this.attackCd = 0;
    this.flinch = 0;
    this.flinchSide = 0;
    this.deadT = 0;
    this.groanT = 1 + rand() * 4;
    this.limp = type === 'walker' && rand() < 0.35;
    this.armStyle = type === 'walker' ? (rand() < 0.6 ? 'reach' : 'dangle') : type;
    this.alive = true;
    this.hitMeshes = [];

    const skin = m.skins[Math.floor(rand() * m.skins.length)];
    const shirt = m.shirts[Math.floor(rand() * m.shirts.length)];
    const pant = m.pants[Math.floor(rand() * m.pants.length)];
    const root = (this.root = new THREE.Group());
    root.scale.setScalar(this.scale * (type === 'brute' ? 1 : 1));
    const part = (geo, mat, parent, x, y, z, name) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      if (name) {
        mesh.userData.zombie = this;
        mesh.userData.part = name;
        this.hitMeshes.push(mesh);
      }
      parent.add(mesh);
      return mesh;
    };
    const grp = (parent, x, y, z) => {
      const o = new THREE.Group();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    const wide = type === 'brute' ? 1.25 : 1;
    this.hips = grp(root, 0, 0.95, 0);
    part(g.pelvis, pant, this.hips, 0, 0.0, 0, 'body').scale.set(wide, 1, wide);
    this.spine = grp(this.hips, 0, 0.08, 0);
    part(g.belly, shirt, this.spine, 0, 0.1, 0, 'body').scale.set(wide, 1, wide * (type === 'brute' ? 1.2 : 1));
    this.chest = grp(this.spine, 0, 0.2, 0);
    part(g.chest, shirt, this.chest, 0, 0.12, 0, 'body').scale.set(wide, 1, wide);
    if (rand() < 0.6) part(g.wound, m.wound, this.chest, (rand() - 0.5) * 0.18, 0.08 + rand() * 0.15, 0.1 * wide);
    this.neck = grp(this.chest, 0, 0.33, 0.01);
    part(g.neck, skin, this.neck, 0, 0.04, 0);
    this.head = grp(this.neck, 0, 0.1, 0.01);
    this.headMesh = part(g.head, skin, this.head, 0, 0.09, 0, 'head');
    this.jaw = part(g.jaw, skin, this.head, 0, 0.0, 0.03);
    this.jaw.scale.set(0.8, 1, 0.9);
    part(g.jaw, m.mouth, this.head, 0, 0.032, 0.05).scale.set(0.6, 0.5, 0.9);
    part(g.teeth, m.teeth, this.head, 0, 0.045, 0.092);
    part(g.nose, skin, this.head, 0, 0.085, 0.1).scale.set(0.8, 1, 0.8);
    part(g.brow, skin, this.head, 0, 0.128, 0.084).rotation.x = 0.3;
    for (const sx of [-1, 1]) {
      part(g.socket, m.socket, this.head, sx * 0.036, 0.108, 0.084);
      part(g.ear, skin, this.head, sx * 0.09, 0.09, 0.0);
    }
    if (rand() < 0.8) part(g.hair, m.hair[Math.floor(rand() * m.hair.length)], this.head, 0, 0.1, -0.008);
    const eyeMat = type === 'runner' ? m.eyeRed : m.eye;
    this.eyes = [part(g.eye, eyeMat, this.head, -0.036, 0.107, 0.091), part(g.eye, eyeMat, this.head, 0.036, 0.107, 0.091)];
    this.eyes.forEach((e) => (e.castShadow = false));
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = grp(this.chest, s * 0.2 * wide, 0.26, 0);
      part(g.upperArm, rand() < 0.3 ? skin : shirt, sh, 0, -0.15, 0, 'limb');
      const el = grp(sh, 0, -0.3, 0);
      part(g.foreArm, skin, el, 0, -0.14, 0, 'limb');
      const hand = part(g.hand, skin, el, 0, -0.3, 0.0, 'limb');
      if (type === 'brute') { sh.scale.setScalar(1.25); }
      this.arms.push({ sh, el, hand, s });
    }
    this.legs = [];
    for (const s of [-1, 1]) {
      const hp = grp(this.hips, s * 0.1 * wide, -0.04, 0);
      part(g.thigh, pant, hp, 0, -0.215, 0, 'limb');
      const kn = grp(hp, 0, -0.43, 0);
      part(g.shin, pant, kn, 0, -0.2, 0, 'limb');
      part(g.foot, m.shoe, kn, 0, -0.44, 0.05);
      this.legs.push({ hp, kn, s });
    }
    root.position.copy(this.pos);
  }

  get headPos() {
    return this.headMesh.getWorldPosition(_v);
  }

  // Returns true when the hit kills.
  damage(amount, part, dir) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flinch = Math.min(1, this.flinch + (this.type === 'brute' ? 0.25 : 0.7) * Math.min(1.5, amount / 30));
    this.flinchSide = (Math.random() - 0.5) * 2;
    if (this.hp <= 0) {
      this.die(part, dir);
      return true;
    }
    return false;
  }

  die(part, dir) {
    this.alive = false;
    this.state = 'dead';
    this.deadT = 0;
    // fall away from the shot
    const local = Math.atan2(dir.x, dir.z) - this.yaw;
    this.fallDir = Math.cos(local) > 0 ? 1 : -1;
    this.fallTwist = Math.sin(local) * 0.6 + (Math.random() - 0.5) * 0.4;
    this.headless = part === 'head';
    if (this.headless) this.head.visible = false;
    this.hitMeshes.forEach((m) => (m.castShadow = false));
  }

  update(dt, game) {
    const t = game.time;
    if (!this.alive) {
      this.updateDead(dt);
      return;
    }
    const player = game.player;
    const world = game.world;
    this.attackCd -= dt;
    this.flinch = Math.max(0, this.flinch - dt * 2.5);

    if (this.state === 'climb') {
      this.climbT += dt / 1.2;
      const k = Math.min(1, this.climbT);
      const e = k * k * (3 - 2 * k);
      this.pos.y = THREE.MathUtils.lerp(this.climbFrom.y, 0, Math.min(1, e * 1.4));
      this.pos.z = THREE.MathUtils.lerp(this.climbFrom.z, -0.5, Math.max(0, e - 0.3) / 0.7);
      this.yaw = Math.PI; // face -z (towards platform)
      this.animate(dt, t, 0, true);
      if (k >= 1) { this.state = 'chase'; this.vy = 0; }
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;
      return;
    }

    // pick an intermediate target to get between zones
    const target = this.routeTarget(player.pos, world);
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const pd = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const dy = Math.abs(player.pos.y - this.pos.y);
    const desiredYaw = Math.atan2(dx, dz);
    let dyaw = desiredYaw - this.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.yaw += dyaw * Math.min(1, dt * (this.type === 'runner' ? 8 : 4));

    let moveSpeed = this.speed * (1 - this.flinch * 0.85);
    if (this.attackT >= 0) moveSpeed *= 0.15;
    if (pd < this.def.reach * 0.8 && dy < 1) moveSpeed = 0;

    // attack
    if (this.attackT < 0 && pd < this.def.reach && dy < 1.1 && this.attackCd <= 0 && player.alive) {
      this.attackT = 0;
      game.audio.zombieAttack(this.pos, this.type);
    }
    if (this.attackT >= 0) {
      const prev = this.attackT;
      this.attackT += dt / this.def.attack;
      if (prev < 0.5 && this.attackT >= 0.5 && pd < this.def.reach + 0.35 && dy < 1.2) {
        game.player.hurt(this.dmg, this.pos);
      }
      if (this.attackT >= 1) { this.attackT = -1; this.attackCd = 0.4 + Math.random() * 0.5; }
    }

    // separation from other zombies
    let sx = 0, sz = 0;
    for (const o of game.zombies.list) {
      if (o === this || !o.alive) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      const rr = 0.75 * (this.scale + o.scale) / 2;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / rr;
        sx += (ox / d) * push * (o.def.mass / this.def.mass);
        sz += (oz / d) * push * (o.def.mass / this.def.mass);
      }
    }
    // never walk through the player
    {
      const ox = this.pos.x - player.pos.x, oz = this.pos.z - player.pos.z;
      const d = Math.hypot(ox, oz), rr = 0.75 * this.scale;
      if (d < rr && d > 1e-4 && dy < 1.2) { sx += (ox / d) * (rr - d) * 4; sz += (oz / d) * (rr - d) * 4; }
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const step = moveSpeed * dt;
    const blocked = world.move(this.pos, fx * step + sx * dt * 2.5, fz * step + sz * dt * 2.5, 0.32 * this.scale, 1.7);

    // climb onto the platform from the track
    if (this.pos.y < -0.6 && this.pos.z < 0.7 && Math.abs(this.pos.x) < L.HALF - 0.5 && target.z < 0 && (blocked || this.pos.z < 0.5)) {
      this.state = 'climb';
      this.climbT = 0;
      this.climbFrom = this.pos.clone();
    }

    // gravity
    const ground = world.groundAt(this.pos.x, this.pos.z);
    this.vy -= 18 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; }
    else if (this.pos.y - ground < 0.3 && this.vy <= 0) { this.pos.y = Math.max(ground, this.pos.y - dt * 3); }

    // hit by the train
    if (game.train.present && Math.abs(game.train.v) > 2 && game.train.overlaps(this.pos.x, this.pos.z, 0.3) && this.pos.y < 2.5) {
      this.hp = 0;
      this.die('body', new THREE.Vector3(Math.sign(game.train.v), 0, 0));
      game.onZombieKilled(this, 'train', null);
    }

    this.animate(dt, t, moveSpeed, false);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;

    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = (this.type === 'runner' ? 2 : 3.5) + Math.random() * 5;
      if (pd < 30) game.audio.zombieGroan(this.pos, this.type);
    }
  }

  routeTarget(p, world) {
    const zone = (x, z, y) => {
      for (let i = 0; i < L.STAIRS.length; i++) if (z < L.BACK_Z - 0.1 && Math.abs(x - L.STAIRS[i]) < L.STAIR_HW + 0.3) return 'stair' + i;
      if (Math.abs(x) > L.HALF) return 'tunnel';
      if (z < 0 && y > -0.6) return 'platform';
      return 'track';
    };
    const mine = zone(this.pos.x, this.pos.z, this.pos.y);
    const theirs = zone(p.x, p.z, p.y);
    if (mine === theirs) return p;
    if (mine.startsWith('stair')) {
      const sx = L.STAIRS[+mine[5]];
      return _v.set(sx, 0, L.BACK_Z + 1.0);
    }
    if (mine === 'tunnel') return _v.set(Math.sign(this.pos.x) * (L.HALF - 4), 0, L.TRACK_Z);
    if (theirs.startsWith('stair')) {
      const sx = L.STAIRS[+theirs[5]];
      if (mine === 'platform') return Math.abs(this.pos.x - sx) < L.STAIR_HW && this.pos.z < L.BACK_Z + 1.2 ? _v.set(sx, 0, L.BACK_Z - 3) : _v.set(sx, 0, L.BACK_Z + 0.8);
      return _v.set(sx, 0, -1.5); // on track: climb first
    }
    if (mine === 'track' && theirs === 'platform') return _v.set(this.pos.x + (p.x - this.pos.x) * 0.3, 0, -1.5);
    if (mine === 'platform' && theirs === 'tunnel') return _v.set(Math.sign(p.x) * (L.HALF - 3), 0, 1.0);
    return p;
  }

  animate(dt, t, speed, climbing) {
    const type = this.type;
    const cyc = speed / (type === 'runner' ? 1.9 : 1.15);
    this.phase += dt * Math.PI * 2 * Math.max(0.15, cyc);
    const ph = this.phase;
    const walkAmt = Math.min(1, speed / 0.6);
    const swing = (type === 'runner' ? 0.95 : type === 'brute' ? 0.42 : 0.5) * walkAmt;
    const flex = (type === 'runner' ? 1.4 : 0.75) * walkAmt;
    const [L0, R0] = this.legs;
    const limpK = this.limp ? 0.45 : 1;
    L0.hp.rotation.x = -Math.sin(ph) * swing;
    R0.hp.rotation.x = Math.sin(ph) * swing * limpK;
    L0.kn.rotation.x = 0.08 + flex * Math.max(0, Math.sin(ph));
    R0.kn.rotation.x = 0.08 + flex * Math.max(0, -Math.sin(ph)) * limpK;
    R0.hp.rotation.z = this.limp ? -0.08 : 0;
    const lean = type === 'runner' ? 0.42 : type === 'brute' ? 0.22 : 0.16 + Math.sin(this.seed) * 0.08;
    this.hips.position.y = 0.95 - Math.abs(Math.cos(ph)) * 0.035 * walkAmt - (type === 'runner' ? 0.05 : 0);
    this.hips.rotation.y = Math.sin(ph) * 0.12 * walkAmt;
    this.hips.rotation.z = Math.sin(ph) * (this.limp ? 0.1 : 0.04) * walkAmt;
    this.spine.rotation.x = lean - this.flinch * 0.55;
    this.spine.rotation.z = this.flinchSide * this.flinch * 0.4 + Math.sin(ph) * 0.05;
    this.chest.rotation.y = -Math.sin(ph) * 0.15 * walkAmt;
    this.neck.rotation.z = Math.sin(t * 0.8 + this.seed) * 0.22;
    this.neck.rotation.x = (type === 'runner' ? -0.25 : 0.1) + Math.sin(t * 0.5 + this.seed) * 0.1;
    this.jaw.rotation.x = 0.15 + Math.max(0, Math.sin(t * 2.3 + this.seed)) * 0.35;

    for (const a of this.arms) {
      let sx, sz = -a.s * 0.12, el;
      if (climbing) {
        sx = -2.3 + Math.sin(t * 6 + a.s) * 0.4; el = -0.5;
      } else if (this.armStyle === 'reach') {
        sx = -1.35 + Math.sin(t * 1.3 + this.seed + a.s) * 0.12 + Math.sin(ph) * 0.08 * a.s;
        el = -0.25 - Math.sin(t * 1.1 + a.s) * 0.1;
        sz = -a.s * 0.05;
      } else if (this.armStyle === 'dangle') {
        sx = Math.sin(ph) * 0.35 * a.s * walkAmt + 0.05;
        el = -0.15;
        sz = -a.s * 0.18;
      } else if (this.armStyle === 'runner') {
        sx = -0.5 + Math.sin(ph) * 1.1 * a.s;
        el = -1.1 - Math.sin(ph + a.s) * 0.4;
        sz = -a.s * 0.25;
      } else {
        sx = Math.sin(ph) * 0.3 * a.s - 0.2;
        el = -0.4;
        sz = -a.s * 0.35;
      }
      if (this.attackT >= 0) {
        const k = this.attackT;
        const raise = k < 0.4 ? k / 0.4 : Math.max(0, 1 - (k - 0.4) / 0.2);
        const strike = k >= 0.4 ? Math.min(1, (k - 0.4) / 0.15) * (1 - Math.max(0, (k - 0.7) / 0.3)) : 0;
        sx = THREE.MathUtils.lerp(sx, -2.6, raise);
        sx = THREE.MathUtils.lerp(sx, -0.7, strike);
        el = THREE.MathUtils.lerp(el, -0.9, raise);
        this.spine.rotation.x = lean + strike * 0.35 - raise * 0.15;
      }
      a.sh.rotation.x = sx;
      a.sh.rotation.z = sz;
      a.el.rotation.x = el;
    }
  }

  updateDead(dt) {
    this.deadT += dt;
    const k = Math.min(1, this.deadT / 0.75);
    const e = k * k;
    this.root.rotation.order = 'YXZ';
    this.root.rotation.y = this.yaw;
    this.root.rotation.x = this.fallDir * (Math.PI / 2) * e * 0.97;
    this.root.rotation.z = this.fallTwist * e;
    this.root.position.set(this.pos.x, this.pos.y + 0.13 * e * this.scale - Math.max(0, this.deadT - 14) * 0.2, this.pos.z);
    // limbs go slack
    for (const a of this.arms) {
      a.sh.rotation.x = THREE.MathUtils.lerp(a.sh.rotation.x, this.fallDir > 0 ? -2.6 : 0.3, dt * 4);
      a.sh.rotation.z = THREE.MathUtils.lerp(a.sh.rotation.z, -a.s * 0.9, dt * 4);
      a.el.rotation.x = THREE.MathUtils.lerp(a.el.rotation.x, -0.3, dt * 4);
    }
    for (const l of this.legs) {
      l.hp.rotation.x = THREE.MathUtils.lerp(l.hp.rotation.x, l.s * 0.15, dt * 4);
      l.kn.rotation.x = THREE.MathUtils.lerp(l.kn.rotation.x, 0.3 + l.s * 0.2, dt * 4);
    }
    this.spine.rotation.x = THREE.MathUtils.lerp(this.spine.rotation.x, 0, dt * 4);
    this.neck.rotation.x = THREE.MathUtils.lerp(this.neck.rotation.x, -this.fallDir * 0.5, dt * 3);
  }

  get expired() {
    return !this.alive && this.deadT > 16;
  }
}

export class Zombies {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.rand = T.rng(1234);
    this.wave = null;
  }

  spawn(type, pos, mult) {
    const z = new Zombie(type, pos, mult, this.rand);
    this.scene.add(z.root);
    this.list.push(z);
    return z;
  }

  aliveCount() {
    let n = 0;
    for (const z of this.list) if (z.alive) n++;
    return n;
  }

  hitMeshes() {
    const out = [];
    for (const z of this.list) if (z.alive) out.push(...z.hitMeshes);
    return out;
  }

  update(dt, game) {
    for (const z of this.list) z.update(dt, game);
    // remove expired corpses and cap the number lying around
    let corpses = this.list.filter((z) => !z.alive);
    while (corpses.length > 14) {
      const z = corpses.shift();
      this.remove(z);
    }
    for (const z of this.list.slice()) if (z.expired) this.remove(z);
  }

  remove(z) {
    this.scene.remove(z.root);
    this.list.splice(this.list.indexOf(z), 1);
  }

  clear() {
    for (const z of this.list) this.scene.remove(z.root);
    this.list = [];
  }
}
