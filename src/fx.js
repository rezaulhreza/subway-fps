// Particles, tracers, bullet-hole and blood decals, ejected casings and the muzzle light.
import * as THREE from 'three';
import * as T from './textures.js';

class Particles {
  constructor(scene, cap, texture, additive) {
    this.cap = cap;
    this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 600 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float scale; varying vec3 vC; varying float vA;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * scale / -mv.z; }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.r * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, ${additive ? '1.0' : 'a'}); }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  emit(p, v, { color, size = 0.05, life = 0.5, grav = 0, drag = 0, grow = 0, alpha = 1 }) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size;
    this.life[i] = this.max[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.grow[i] = grow;
    this.a0[i] = alpha;
    this.alpha[i] = alpha;
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        if (i !== j) {
          for (const arr of [this.pos, this.vel, this.col]) arr.copyWithin(i * 3, j * 3, j * 3 + 3);
          for (const arr of [this.size, this.life, this.max, this.grav, this.drag, this.grow, this.a0, this.alpha]) arr[i] = arr[j];
        }
        continue;
      }
      const k = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const f = this.life[i] / this.max[i];
      this.alpha[i] = this.a0[i] * Math.min(1, f * 2.5);
      i++;
    }
    for (const n of ['position', 'color', 'size', 'alpha']) this.geo.attributes[n].needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
}

const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

export class FX {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.glow = new Particles(scene, 1500, T.softDot(), true);
    this.smoke = new Particles(scene, 1500, T.smokeTex(), false);
    this.blood = new Particles(scene, 1500, T.softDot(), false);

    // tracers
    const tg = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2);
    const tm = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 6.5, 3), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, tm);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, head: 0, active: false });
    }
    // decals
    const holeTex = T.bulletHoleTexture();
    this.holeMat = new THREE.MeshStandardMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.9 });
    this.bloodMats = [1, 2, 3].map((s) => new THREE.MeshStandardMaterial({ map: T.bloodSplatTexture(s), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, roughness: 0.25 }));
    const pg = new THREE.PlaneGeometry(1, 1);
    this.decals = [];
    this.decalIdx = 0;
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(pg, this.holeMat);
      m.visible = false;
      m.renderOrder = 1;
      m.receiveShadow = true;
      scene.add(m);
      this.decals.push(m);
    }
    // casings
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 });
    const shell = new THREE.MeshStandardMaterial({ color: 0xa3201c, roughness: 0.5 });
    this.casingGeo = { small: new THREE.CylinderGeometry(0.0045, 0.0045, 0.019, 8), rifle: new THREE.CylinderGeometry(0.005, 0.0055, 0.045, 8), shell: new THREE.CylinderGeometry(0.0095, 0.0095, 0.065, 10) };
    this.casingMat = { small: brass, rifle: brass, shell };
    this.casings = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(this.casingGeo.small, brass);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.casings.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, bounced: 0 });
    }
    this.casingIdx = 0;
    // muzzle light lives in the world so the flash lights the station
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 14, 1.8);
    scene.add(this.muzzleLight);
  }

  setScale(px) {
    for (const p of [this.glow, this.smoke, this.blood]) p.mat.uniforms.scale.value = px;
  }

  tracer(from, to) {
    const t = this.tracers.find((x) => !x.active);
    if (!t) return;
    t.active = true;
    t.from.copy(from);
    t.dir.subVectors(to, from);
    t.dist = t.dir.length();
    t.dir.normalize();
    t.head = Math.min(2, t.dist);
    t.mesh.visible = true;
    t.mesh.quaternion.setFromUnitVectors(_z, t.dir);
  }

  flash(pos, strength = 1) {
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = 22 * strength;
    for (let i = 0; i < 2; i++) {
      this.smoke.emit(pos, _d.set((Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3), { color: _c.setRGB(0.32, 0.31, 0.3), size: 0.07, life: 0.7 + Math.random() * 0.4, grow: 0.35, drag: 1.5, alpha: 0.07 });
    }
  }

  decal(point, normal, size, mat, parent = null) {
    const m = this.decals[this.decalIdx];
    this.decalIdx = (this.decalIdx + 1) % this.decals.length;
    m.material = mat;
    m.visible = true;
    m.scale.set(size, size, 1);
    _q.setFromUnitVectors(_z, normal);
    m.quaternion.copy(_q);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.position.copy(point).addScaledVector(normal, 0.004);
    if (parent) parent.attach(m);
    else if (m.parent !== this.scene) this.scene.attach(m);
  }

  // Bullet hitting a hard surface.
  impact(hit, dir) {
    const surface = hit.object.material?.metalness > 0.5 ? 'metal' : 'hard';
    this.decal(hit.point, hit.normal, 0.06 + Math.random() * 0.03, this.holeMat, hit.object.parent?.name === 'train' ? hit.object.parent : null);
    const n = surface === 'metal' ? 12 : 6;
    for (let i = 0; i < n; i++) {
      _d.copy(hit.normal).multiplyScalar(2 + Math.random() * 3).add(_p.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4));
      this.glow.emit(hit.point, _d, { color: _c.setRGB(4, 2.2, 0.8), size: 0.025, life: 0.15 + Math.random() * 0.25, grav: 9, drag: 1 });
    }
    for (let i = 0; i < 4; i++) {
      _d.copy(hit.normal).multiplyScalar(0.4 + Math.random() * 0.8).add(_p.set((Math.random() - 0.5) * 0.6, Math.random() * 0.5, (Math.random() - 0.5) * 0.6));
      this.smoke.emit(hit.point, _d, { color: _c.setRGB(0.5, 0.48, 0.44), size: 0.1, life: 0.8 + Math.random() * 0.6, grow: 0.6, drag: 2.5, alpha: 0.35 });
    }
    for (let i = 0; i < 5; i++) {
      _d.copy(hit.normal).multiplyScalar(1.5 + Math.random() * 2).add(_p.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
      this.blood.emit(hit.point, _d, { color: _c.setRGB(0.25, 0.23, 0.2), size: 0.018, life: 0.6, grav: 9.8, drag: 0.5 });
    }
    return surface;
  }

  // Bullet hitting flesh.
  gore(point, dir, amount = 1) {
    for (let i = 0; i < 14 * amount; i++) {
      _d.copy(dir).multiplyScalar(1 + Math.random() * 3).add(_p.set((Math.random() - 0.5) * 2.5, Math.random() * 2, (Math.random() - 0.5) * 2.5));
      this.blood.emit(point, _d, { color: _c.setRGB(0.32 + Math.random() * 0.15, 0.01, 0.01), size: 0.025 + Math.random() * 0.03, life: 0.5 + Math.random() * 0.5, grav: 9.8, drag: 0.6 });
    }
    for (let i = 0; i < 3 * amount; i++) {
      _d.copy(dir).multiplyScalar(0.5 + Math.random()).add(_p.set((Math.random() - 0.5), Math.random() * 0.5, (Math.random() - 0.5)));
      this.smoke.emit(point, _d, { color: _c.setRGB(0.35, 0.02, 0.02), size: 0.15, life: 0.5 + Math.random() * 0.4, grow: 0.8, drag: 3, alpha: 0.45 });
    }
    // splatter on whatever is behind the target
    const hit = this.world.raycast(point.clone().addScaledVector(dir, 0.3), dir, 3.5, false);
    if (hit) this.decal(hit.point, hit.normal, 0.35 + Math.random() * 0.5 * amount, this.bloodMats[Math.floor(Math.random() * 3)], hit.object.parent?.name === 'train' ? hit.object.parent : null);
    // and a pool below
    if (amount > 1.2) {
      const down = this.world.raycast(point, _p.set(0, -1, 0), 3, false);
      if (down) this.decal(down.point, down.normal, 0.6 + Math.random() * 0.6, this.bloodMats[Math.floor(Math.random() * 3)]);
    }
  }

  neckSpurt(point) {
    for (let i = 0; i < 4; i++) {
      _d.set((Math.random() - 0.5) * 0.8, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8);
      this.blood.emit(point, _d, { color: _c.setRGB(0.35, 0.01, 0.01), size: 0.03 + Math.random() * 0.02, life: 0.8, grav: 9.8, drag: 0.3 });
    }
  }

  casing(pos, vel, kind) {
    const c = this.casings[this.casingIdx];
    this.casingIdx = (this.casingIdx + 1) % this.casings.length;
    c.mesh.geometry = this.casingGeo[kind];
    c.mesh.material = this.casingMat[kind];
    c.mesh.position.copy(pos);
    c.mesh.visible = true;
    c.vel.copy(vel);
    c.spin.set(Math.random() * 30, Math.random() * 30, Math.random() * 30);
    c.life = 6;
    c.bounced = 0;
    c.kind = kind;
  }

  update(dt, audio) {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.blood.update(dt);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 400);
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.head += dt * 340;
      const head = Math.min(t.head, t.dist);
      const tail = Math.max(0, t.head - 6);
      if (tail >= t.dist) { t.active = false; t.mesh.visible = false; continue; }
      const len = head - tail;
      t.mesh.position.copy(t.from).addScaledVector(t.dir, (head + tail) / 2);
      t.mesh.scale.set(0.012, 0.012, len);
    }
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { c.mesh.visible = false; continue; }
      if (c.bounced > 3) continue;
      c.vel.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      const g = this.world.groundAt(c.mesh.position.x, c.mesh.position.z) + 0.005;
      if (c.mesh.position.y < g) {
        c.mesh.position.y = g;
        c.vel.y = Math.abs(c.vel.y) * 0.35;
        c.vel.x *= 0.5; c.vel.z *= 0.5;
        c.spin.multiplyScalar(0.5);
        c.bounced++;
        if (c.bounced === 1 && audio) audio.casing(c.mesh.position);
        if (c.bounced > 3) { c.mesh.rotation.set(Math.PI / 2, Math.random() * 6, 0); }
      }
    }
  }

  clearDecals() {
    for (const d of this.decals) {
      d.visible = false;
      if (d.parent !== this.scene) this.scene.attach(d);
    }
    for (const c of this.casings) { c.life = 0; c.mesh.visible = false; }
  }
}
