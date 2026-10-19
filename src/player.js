// Input, first-person movement, camera feel (bob, recoil, shake) and player health.
import * as THREE from 'three';
import { L } from './layout.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.fire = false;
    this.aim = false;
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.pressed = new Set();
    this.locked = false;
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.aim = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.aim = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.fire = false; this.aim = false; this.keys.clear(); }
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p?.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch { this.canvas.requestPointerLock(); }
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() { this.dx = 0; this.dy = 0; this.wheel = 0; this.pressed.clear(); }
}

export class Player {
  constructor(camera, audio) {
    this.camera = camera;
    this.audio = audio;
    this.pos = new THREE.Vector3(0, 0, -3.5);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI / 2;
    this.pitch = 0;
    this.recoil = 0;
    this.recoilYaw = 0;
    this.health = 100;
    this.alive = true;
    this.grounded = true;
    this.eye = 1.62;
    this.eyeSmooth = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.stepDist = 0;
    this.landKick = 0;
    this.landV = 0;
    this.sprinting = false;
    this.sprintBlend = 0;
    this.moveFactor = 0;
    this.shake = 0;
    this.hurtFlash = 0;
    this.mantle = null;
    this.fov = 75;
    this.lastHurt = 0;
    this.sensitivity = 0.0021;
    this.frozen = false;
  }

  reset() {
    this.pos.set(0, 0, -3.5);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI / 2;
    this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.mantle = null;
  }

  hurt(dmg, from) {
    if (!this.alive) return;
    this.health -= dmg;
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.5 + dmg / 40);
    this.shake = Math.min(1, this.shake + 0.4);
    this.lastHurt = performance.now();
    if (from) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / l) * 2.2;
      this.vel.z += (dz / l) * 2.2;
      this.hurtDir = Math.atan2(-dx, -dz);
    }
    this.audio.playerHurt();
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.onDeath?.();
    }
  }

  addRecoil(pitch, yaw) {
    this.recoil += pitch;
    this.recoilYaw += yaw;
    this.pitch += pitch * 0.35;
    this.yaw += yaw * 0.35;
  }

  update(dt, input, world, weapons, train) {
    const adsK = weapons.ads;
    const sens = this.sensitivity * (1 - adsK * 0.4);
    if (!this.frozen) {
      this.yaw -= input.dx * sens;
      this.pitch -= input.dy * sens;
    }
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    // recoil recovers towards zero
    const rec = Math.min(1, dt * 7);
    this.recoil -= this.recoil * rec;
    this.recoilYaw -= this.recoilYaw * rec;

    if (this.mantle) {
      const m = this.mantle;
      m.t += dt / 0.5;
      const k = Math.min(1, m.t);
      this.pos.y = THREE.MathUtils.lerp(m.from.y, 0, Math.min(1, k * 1.6));
      this.pos.z = THREE.MathUtils.lerp(m.from.z, -0.45, Math.max(0, (k - 0.35) / 0.65));
      this.vel.set(0, 0, 0);
      if (k >= 1) this.mantle = null;
      this.updateCamera(dt);
      return;
    }

    // movement
    let fx = 0, fz = 0;
    if (!this.frozen && this.alive) {
      if (input.down('KeyW')) fz += 1;
      if (input.down('KeyS')) fz -= 1;
      if (input.down('KeyA')) fx -= 1;
      if (input.down('KeyD')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const wantSprint = input.down('ShiftLeft') || input.down('ShiftRight');
    this.sprinting = wantSprint && fz > 0.3 && this.grounded && !input.fire && !input.aim;
    this.sprintBlend += ((this.sprinting ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 8);
    const speed = this.sprinting ? 6.6 : adsK > 0.5 ? 2.6 : 4.3;
    // forward is -z in camera space; yaw rotates around y
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = -sy * fz + cy * fx;
    const wz = -cy * fz - sy * fx;
    const accel = this.grounded ? 55 : 12;
    const tvx = wx * speed, tvz = wz * speed;
    const ax = THREE.MathUtils.clamp(tvx - this.vel.x, -accel * dt, accel * dt);
    const az = THREE.MathUtils.clamp(tvz - this.vel.z, -accel * dt, accel * dt);
    this.vel.x += ax;
    this.vel.z += az;
    if (this.grounded && len === 0) {
      const f = Math.max(0, 1 - dt * 12);
      this.vel.x *= f; this.vel.z *= f;
    }
    // jump / mantle onto the platform from the track
    if (!this.frozen && input.hit('Space')) {
      if (this.pos.y < -0.6 && this.pos.z < 0.9 && Math.abs(this.pos.x) < L.HALF - 0.4 && !train.overlaps(this.pos.x, this.pos.z, 0)) {
        this.mantle = { t: 0, from: this.pos.clone() };
        this.audio.footstep('ballast', 1.5);
        return;
      }
      if (this.grounded) { this.vel.y = 4.6; this.grounded = false; }
    }
    world.move(this.pos, this.vel.x * dt, this.vel.z * dt, 0.3, 1.75);
    for (const z of world.zombies.list) {
      if (!z.alive || Math.abs(z.pos.y - this.pos.y) > 1.2) continue;
      const ox = this.pos.x - z.pos.x, oz = this.pos.z - z.pos.z;
      const d = Math.hypot(ox, oz), rr = 0.3 + 0.3 * z.scale;
      if (d < rr && d > 1e-4) { this.pos.x += (ox / d) * (rr - d); this.pos.z += (oz / d) * (rr - d); }
    }
    // vertical
    const ground = world.groundAt(this.pos.x, this.pos.z);
    this.vel.y -= 18 * dt;
    this.pos.y += this.vel.y * dt;
    const wasGrounded = this.grounded;
    if (this.pos.y <= ground) {
      if (!wasGrounded && this.vel.y < -3) {
        this.landV = Math.min(1, -this.vel.y / 9);
        this.audio.footstep(this.surface(world, train), 1.4);
      }
      // step up smoothly (stairs)
      if (wasGrounded) this.eyeSmooth -= ground - this.pos.y;
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else if (wasGrounded && this.pos.y - ground < 0.35 && this.vel.y <= 0) {
      // stick to stairs going down
      this.eyeSmooth += this.pos.y - ground;
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    this.eyeSmooth = THREE.MathUtils.clamp(this.eyeSmooth, -0.5, 0.5);
    this.eyeSmooth -= this.eyeSmooth * Math.min(1, dt * 12);

    // bob and footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.moveFactor = Math.min(1.5, hs / 4.3) * (this.grounded ? 1 : 1.5);
    this.bobAmount += ((this.grounded ? Math.min(1.4, hs / 4.3) : 0) - this.bobAmount) * Math.min(1, dt * 10);
    this.bobPhase += dt * hs * (this.sprinting ? 2.0 : 2.4);
    if (this.grounded) {
      this.stepDist += hs * dt;
      if (this.stepDist > (this.sprinting ? 2.0 : 1.55)) {
        this.stepDist = 0;
        this.audio.footstep(this.surface(world, train), this.sprinting ? 1.2 : 0.8);
      }
    }
    this.landKick += (this.landV - this.landKick) * Math.min(1, dt * 30);
    this.landV -= this.landV * Math.min(1, dt * 8);
    this.updateCamera(dt);
  }

  surface(world, train) {
    if (train.insideCar(this.pos.x, this.pos.z) >= 0) return 'metal';
    return this.pos.y < -0.6 ? 'ballast' : 'stone';
  }

  updateCamera(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.4);
    const t = performance.now() / 1000;
    const sh = this.shake * this.shake;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.045 * this.bobAmount;
    const bobX = Math.sin(this.bobPhase) * 0.025 * this.bobAmount;
    const cam = this.camera;
    cam.position.set(
      this.pos.x + Math.cos(this.yaw) * bobX,
      this.pos.y + this.eye + this.eyeSmooth - bobY - this.landKick * 0.12 - (this.alive ? 0 : 1.2),
      this.pos.z - Math.sin(this.yaw) * bobX,
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.set(
      this.pitch + this.recoil + Math.sin(t * 37) * sh * 0.03,
      this.yaw + this.recoilYaw + Math.sin(t * 29) * sh * 0.03,
      Math.sin(this.bobPhase) * 0.004 * this.bobAmount + Math.sin(t * 41) * sh * 0.02 + (this.alive ? 0 : 0.5),
    );
  }
}
