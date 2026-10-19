// Geometry helpers: batched merging per material and world-space UVs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function matrixOf(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  return new THREE.Matrix4().compose(_p.set(...pos), _q, _s.set(...scale));
}

// Planar UVs chosen by the dominant normal axis, in metres / scale.
export function worldUV(g, scale = 1) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i) * Math.sign(n.getX(i) || 1) * -1; v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i) * Math.sign(n.getZ(i) || 1); v = p.getY(i); }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function normalise(g) {
  let out = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  out.morphAttributes = {};
  out.clearGroups();
  return out;
}

export class Batch {
  constructor() {
    this.groups = new Map();
  }

  add(material, geometry, matrix = null, uvScale = 1) {
    const g = normalise(geometry);
    if (matrix) g.applyMatrix4(matrix);
    if (uvScale) worldUV(g, uvScale);
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(g);
    return g;
  }

  // Axis-aligned box from min / max corners.
  box(material, x0, y0, z0, x1, y1, z1, uvScale = 1) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    return this.add(material, g, new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), uvScale);
  }

  build(parent, { cast = true, receive = true, name = 'batch' } = {}) {
    const meshes = [];
    for (const [mat, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = name;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}

// Elliptic barrel vault along x, normals facing inward. u = x, v = arc length.
export function vaultGeometry(x0, x1, zc, a, b, yBase, segs = 48, outward = false, uvScale = 1) {
  const pos = [], nor = [], uv = [];
  const pts = [];
  let len = 0;
  for (let i = 0; i <= segs; i++) {
    const t = Math.PI - (i / segs) * Math.PI;
    const z = zc + a * Math.cos(t), y = yBase + b * Math.sin(t);
    if (i) len += Math.hypot(z - pts[i - 1].z, y - pts[i - 1].y);
    let nz = Math.cos(t) / a, ny = Math.sin(t) / b;
    const l = Math.hypot(nz, ny);
    nz /= l; ny /= l;
    if (!outward) { nz = -nz; ny = -ny; }
    pts.push({ z, y, nz, ny, s: len });
  }
  for (let i = 0; i < segs; i++) {
    const A = pts[i], B = pts[i + 1];
    const quad = [
      [x0, A], [x1, A], [x1, B],
      [x0, A], [x1, B], [x0, B],
    ];
    if (outward) quad.reverse();
    for (const [x, P] of quad) {
      pos.push(x, P.y, P.z);
      nor.push(0, P.ny, P.nz);
      uv.push(x / uvScale, P.s / uvScale);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function tubeAlong(points, radius, radial = 6, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed);
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), radius, radial, closed);
}

export function cyl(rTop, rBot, h, seg = 12) {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg);
}

export const AXIS_X = [0, 0, Math.PI / 2];
export const AXIS_Z = [Math.PI / 2, 0, 0];

// Plane with its texture kept (no world UVs).
export function texturedPlane(material, w, h) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
}
