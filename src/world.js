// Collision (circle vs AABB plus a height field) and ray queries against station, train and enemies.
import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class World {
  constructor(station, train, zombies) {
    this.station = station;
    this.train = train;
    this.zombies = zombies;
    this.cols = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    for (const m of [...station.rayMeshes, ...train.meshes]) m.geometry.computeBoundsTree();
  }

  refresh() {
    this.cols = this.station.colliders.concat(this.train.activeColliders());
  }

  groundAt(x, z) {
    const g = this.station.groundAt(x, z);
    const tf = this.train.floorAt(x, z);
    return tf !== null ? Math.max(g, tf) : g;
  }

  // Move a vertical cylinder; returns true when a ledge too high to step blocked it.
  move(pos, dx, dz, r, h, stepMax = 0.45) {
    let blocked = false;
    if (dx) {
      const g = this.groundAt(pos.x + dx + Math.sign(dx) * r * 0.8, pos.z);
      if (g > pos.y + stepMax) blocked = true;
      else pos.x += dx;
    }
    if (dz) {
      const g = this.groundAt(pos.x, pos.z + dz + Math.sign(dz) * r * 0.8);
      if (g > pos.y + stepMax) blocked = true;
      else pos.z += dz;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.cols) {
        if (pos.y + h < c.min.y || pos.y > c.max.y) continue;
        const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
        const ddx = pos.x - cx, ddz = pos.z - cz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          pos.x += (ddx / d) * (r - d);
          pos.z += (ddz / d) * (r - d);
        } else {
          const pens = [pos.x - c.min.x + r, c.max.x - pos.x + r, pos.z - c.min.z + r, c.max.z - pos.z + r];
          let i = 0;
          for (let k = 1; k < 4; k++) if (pens[k] < pens[i]) i = k;
          if (i === 0) pos.x = c.min.x - r;
          else if (i === 1) pos.x = c.max.x + r;
          else if (i === 2) pos.z = c.min.z - r;
          else pos.z = c.max.z + r;
        }
      }
    }
    return blocked;
  }

  // First hit along a ray. Returns { point, normal, object, zombie, part, distance } or null.
  raycast(origin, dir, far = 200, withEnemies = true) {
    const rc = this.raycaster;
    rc.set(origin, dir);
    rc.near = 0;
    rc.far = far;
    const targets = this.station.rayMeshes.slice();
    if (this.train.present) targets.push(...this.train.meshes);
    if (withEnemies) targets.push(...this.zombies.hitMeshes());
    const hits = rc.intersectObjects(targets, false);
    if (!hits.length) return null;
    const h = hits[0];
    let normal = new THREE.Vector3(0, 1, 0);
    if (h.face) normal = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (normal.dot(dir) > 0) normal.negate();
    return {
      point: h.point,
      normal,
      object: h.object,
      distance: h.distance,
      zombie: h.object.userData.zombie || null,
      part: h.object.userData.part || null,
    };
  }
}
