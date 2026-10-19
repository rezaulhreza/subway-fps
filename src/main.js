// Game controller: waves, the train journey between stations, shooting, pickups, HUD and screens.
import * as THREE from 'three';
import { createRenderer, createComposer } from './renderer.js';
import { Station, themeFor, THEMES } from './station.js';
import { Train, TRAIN_HALF } from './train.js';
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Weapons, DEFS } from './weapons.js';
import { Player, Input } from './player.js';
import { L } from './layout.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

// ---------- setup ----------
const renderer = createRenderer($('app'));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060708);
scene.fog = new THREE.Fog(0x07080a, 22, 170);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.04, 700);
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);

const station = new Station(scene);
const train = new Train(scene);
const zombies = new Zombies(scene);
const world = new World(station, train, zombies);
const fx = new FX(scene, world);
const audio = new Audio();
const input = new Input(renderer.domElement);
const player = new Player(camera, audio);
const weapons = new Weapons(vmScene, vmCam);
const { composer, final } = createComposer(renderer, scene, camera, vmScene, vmCam);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

const LINE = [...THEMES.map((t) => t.name), 'Wexmoor', 'Tannery Row'];

function captureEnvironment() {
  const hidden = [train.group, ...zombies.list.map((z) => z.root)];
  const vis = hidden.map((o) => o.visible);
  hidden.forEach((o) => (o.visible = false));
  const fog = scene.fog;
  scene.fog = null;
  scene.environment = null; // otherwise each capture feeds on the last one and the station gets brighter
  const rt = pmrem.fromScene(scene, 0.015, 0.1, 160, { position: new THREE.Vector3(0, 1.8, -3) });
  scene.fog = fog;
  hidden.forEach((o, i) => (o.visible = vis[i]));
  envRT?.dispose();
  envRT = rt;
  scene.environment = rt.texture;
  scene.environmentIntensity = 0.35 + 0.55 * (station.theme?.level ?? 1);
  vmScene.environment = rt.texture;
}

// ---------- game state ----------
const game = {
  time: 0,
  state: 'title', // title | play | paused | dead
  phase: 'idle',
  phaseT: 0,
  stationIndex: 0,
  wave: 0,
  spawned: 0,
  total: 0,
  spawnT: 0,
  cfg: null,
  riding: false,
  swapped: false,
  stats: { kills: 0, headshots: 0, shots: 0, hits: 0, stations: 1 },
  pickups: [],
  headless: [],
  objective: '',
  player, world, zombies, train, audio, fx,
  onZombieKilled,
};

function waveConfig(n) {
  return {
    total: 6 + (n - 1) * 5 + Math.floor((n - 1) ** 1.6),
    maxAlive: Math.min(22, 4 + n * 2),
    interval: Math.max(0.45, 2.4 - n * 0.28),
    runner: n < 2 ? 0 : Math.min(0.45, 0.18 + (n - 2) * 0.07),
    brute: n < 3 ? 0 : Math.min(0.14, 0.05 + (n - 3) * 0.03),
    mult: { speed: 1 + (n - 1) * 0.06, hp: 1 + (n - 1) * 0.12, dmg: 1 + (n - 1) * 0.1 },
    sets: n === 1 ? ['stairs'] : n === 2 ? ['stairs', 'tunnel'] : ['stairs', 'tunnel', 'door'],
  };
}

function spawnPoint(sets) {
  const opts = [];
  for (const s of sets) {
    if (s === 'stairs') for (const sx of L.STAIRS) opts.push(new THREE.Vector3(sx + (Math.random() - 0.5) * 2.2, L.STAIR_TOP, -22.5 + Math.random() * 1.5));
    if (s === 'tunnel') for (const d of [-1, 1]) opts.push(new THREE.Vector3(d * (L.HALF + 22 + Math.random() * 18), L.TRACK_Y, L.TRACK_Z + (Math.random() - 0.5) * 1.6));
    if (s === 'door') for (const p of station.doorPositions) opts.push(p.clone().add(new THREE.Vector3(0, 0, (Math.random() - 0.5) * 0.6)));
  }
  const far = opts.filter((p) => p.distanceTo(player.pos) > 12);
  const list = far.length ? far : opts;
  return list[Math.floor(Math.random() * list.length)];
}

function setPhase(p) {
  game.phase = p;
  game.phaseT = 0;
}

function startWave() {
  game.wave++;
  game.cfg = waveConfig(game.wave);
  game.spawned = 0;
  game.killsAtWaveStart = game.stats.kills;
  game.total = game.cfg.total;
  game.spawnT = 1.5;
  setPhase('wave');
  setObjective('');
  toast(`Wave ${game.wave}`);
  station.setBoard([['Service', 'SUSPENDED'], 'Hold the platform'], '#ff4a2a');
}

function updateWave(dt) {
  const c = game.cfg;
  game.spawnT -= dt;
  if (game.spawned < game.total && zombies.aliveCount() < c.maxAlive && game.spawnT <= 0) {
    game.spawnT = c.interval * (0.6 + Math.random() * 0.8);
    const r = Math.random();
    const type = r < c.brute ? 'brute' : r < c.brute + c.runner ? 'runner' : 'walker';
    const z = zombies.spawn(type, spawnPoint(c.sets), c.mult);
    z.yaw = Math.atan2(player.pos.x - z.pos.x, player.pos.z - z.pos.z);
    if (type === 'runner') audio.zombieScream(z.pos);
    game.spawned++;
  }
  if (game.spawned >= game.total && zombies.aliveCount() === 0) {
    setPhase('cleared');
    toast('Platform clear');
    station.setBoard([['1 ' + LINE[(game.stationIndex + 1) % LINE.length], 'due'], 'Train approaching'], '#ffa21a');
    setTimeout(() => audio.announce('The next train is approaching. Please stand back from the platform edge.'), 900);
  }
}

// ---------- train journey ----------
const ARRIVE_FROM = -170;
const LOOP_AT = 120; // tunnel repeats every 60 m, so a 240 m jump is seamless
const BRAKE = 2.0;

function updateTrain(dt) {
  const prev = train.x;
  let braking = false;
  switch (game.phase) {
    case 'cleared':
      if (game.phaseT > 4) {
        train.setPresent(true);
        train.setX(ARRIVE_FROM);
        train.v = 18;
        train.doorTarget = 0;
        train.doorOpen = 0;
        station.setSignal(true);
        setPhase('arriving');
        setObjective('Stand back. The train is arriving');
      }
      break;
    case 'arriving': {
      const d = -train.x;
      train.v = Math.min(18, Math.sqrt(Math.max(0, 2 * BRAKE * d)));
      braking = train.v < 17.9;
      train.setX(Math.min(0, train.x + Math.max(0.15, train.v) * dt));
      if (train.x >= -0.001) {
        train.v = 0;
        train.setX(0);
        station.setSignal(false);
        train.doorTarget = 1;
        audio.doorSlide(new THREE.Vector3(player.pos.x, 1, L.TRACK_Z - 1.3));
        setPhase('boarding');
        setObjective('Board the train');
        setTimeout(() => audio.announce(`This train is for ${LINE[(game.stationIndex + 1) % LINE.length]}. Please mind the gap.`), 1300);
      }
      break;
    }
    case 'boarding':
      if (train.insideCar(player.pos.x, player.pos.z) >= 0 && player.pos.z > L.TRACK_Z - 1.0) {
        game.insideT = (game.insideT || 0) + dt;
        if (game.insideT > 1.2) {
          setPhase('closing');
          audio.chime();
          setObjective('Doors closing');
        }
      } else game.insideT = 0;
      break;
    case 'closing':
      if (game.phaseT > 1.6 && train.doorTarget !== 0) {
        train.doorTarget = 0;
        audio.doorSlide(new THREE.Vector3(player.pos.x, 1, L.TRACK_Z - 1.3));
      }
      // keep the player clear of the closing doors
      if (train.doorTarget === 0 && player.pos.z < L.TRACK_Z - 1.0 && train.insideCar(player.pos.x, player.pos.z + 0.5) >= 0) player.pos.z += (L.TRACK_Z - 0.95 - player.pos.z) * Math.min(1, dt * 10);
      if (train.doorTarget === 0 && train.doorOpen <= 0) {
        if (train.insideCar(player.pos.x, player.pos.z) < 0) {
          // player stepped off: reopen and wait
          train.doorTarget = 1;
          setPhase('boarding');
          setObjective('Board the train');
          break;
        }
        game.riding = true;
        game.swapped = false;
        weapons.refill();
        player.health = Math.min(100, player.health + 40);
        toast('Ammo resupplied, +40 health');
        audio.pickup();
        setPhase('travel');
        setObjective('Next station: ' + LINE[(game.stationIndex + 1) % LINE.length]);
      }
      break;
    case 'travel': {
      if (!game.swapped) {
        train.v = Math.min(20, train.v + 2.2 * dt);
        train.setX(train.x + train.v * dt);
        if (train.x > LOOP_AT) {
          train.setX(train.x - 2 * LOOP_AT);
          game.swapped = true;
          nextStation();
        }
      } else {
        const d = -train.x;
        const vt = Math.sqrt(Math.max(0, 2 * BRAKE * d));
        braking = vt < train.v;
        train.v = Math.min(20, train.v + 2 * dt, vt);
        train.setX(Math.min(0, train.x + Math.max(0.15, train.v) * dt));
        if (train.x >= -0.001) {
          train.setX(0);
          train.v = 0;
          train.doorTarget = 1;
          game.riding = false;
          audio.doorSlide(new THREE.Vector3(player.pos.x, 1, L.TRACK_Z - 1.3));
          setPhase('arrived');
          setObjective('Step off the train');
          const name = themeFor(game.stationIndex).name;
          setTimeout(() => audio.announce(`This is ${name}. Mind the gap between the train and the platform.`), 600);
        }
      }
      break;
    }
    case 'arrived':
      if (train.insideCar(player.pos.x, player.pos.z) < 0 && player.pos.z < -0.4) {
        game.offT = (game.offT || 0) + dt;
        if (game.offT > 1.5 && train.doorTarget === 1) {
          train.doorTarget = 0;
          audio.chime();
          audio.doorSlide(new THREE.Vector3(player.pos.x, 1, L.TRACK_Z - 1.3));
        }
        if (train.doorTarget === 0 && train.doorOpen <= 0) {
          setPhase('leaving');
          setObjective('');
          game.offT = 0;
          game.trainLeaving = true;
        }
      } else game.offT = 0;
      break;
    case 'leaving':
      if (game.phaseT > 2.5) startWave();
      break;
  }
  if (game.trainLeaving) {
    train.v = Math.min(20, train.v + 2.0 * dt);
    train.setX(train.x + train.v * dt);
    if (train.x > 260) { train.setPresent(false); train.setX(-1000); train.v = 0; game.trainLeaving = false; }
  }
  if (game.riding) player.pos.x += train.x - prev;
  // trains are not kind to people on the track
  if (train.present && Math.abs(train.v) > 1 && !game.riding && train.overlaps(player.pos.x, player.pos.z, 0.35) && player.pos.y < 2) {
    player.hurt(999, null);
    deathCause = 'Hit by a train. Mind the gap.';
  }
  const inside = train.insideCar(player.pos.x, player.pos.z) >= 0;
  audio.train(dt, { present: train.present, speed: train.v, braking, pos: new THREE.Vector3(train.x, 0.5, L.TRACK_Z), inside });
  audio.setInterior(inside && train.doorOpen < 0.1);
}

function nextStation() {
  game.stationIndex++;
  game.stats.stations++;
  const theme = themeFor(game.stationIndex);
  zombies.clear();
  clearPickups();
  fx.clearDecals();
  station.applyTheme(theme);
  station.setBoard([['Welcome to', ''], theme.name.toUpperCase()], '#ffa21a');
  train.setTheme(theme, LINE, game.stationIndex - 1);
  captureEnvironment();
  setStationHud(theme);
}

function setStationHud(theme) {
  $('station-name').textContent = theme.name;
  document.documentElement.style.setProperty('--band', theme.band);
}

// ---------- shooting ----------
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _port = new THREE.Vector3();
let deathCause = '';

weapons.on('fire', (def, spread) => {
  audio.shot(def.sound);
  game.stats.shots++;
  const ads = weapons.ads;
  player.addRecoil(def.recoil * (1 - ads * 0.45) * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * def.recoil * 0.7);
  if (def.id === 'shotgun') player.shake = Math.min(1, player.shake + 0.35);
  camera.updateMatrixWorld();
  vmCam.updateMatrixWorld();
  weapons.muzzleWorld(camera, _muzzle);
  fx.flash(_muzzle, def.id === 'shotgun' ? 1.6 : 1);
  // eject a casing to the right
  camera.getWorldDirection(_dir);
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  if (def.id !== 'shotgun') {
    _port.copy(camera.position).addScaledVector(_dir, 0.35).addScaledVector(_right, 0.12).addScaledVector(_up, -0.12);
    fx.casing(_port, _right.clone().multiplyScalar(2 + Math.random()).addScaledVector(_up, 1.6 + Math.random()).add(player.vel), def.casing);
  } else {
    setTimeout(() => {
      camera.getWorldDirection(_dir);
      _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      _port.copy(camera.position).addScaledVector(_dir, 0.35).addScaledVector(_right, 0.1).addScaledVector(_up, -0.1);
      fx.casing(_port, _right.clone().multiplyScalar(1.6).add(new THREE.Vector3(0, 2, 0)), 'shell');
    }, 450);
  }
  let anyHit = false, killed = false, head = false;
  for (let i = 0; i < def.pellets; i++) {
    camera.getWorldDirection(_dir);
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    const hit = world.raycast(camera.position, _dir, 160, true);
    const end = hit ? hit.point.clone() : camera.position.clone().addScaledVector(_dir, 160);
    if (def.pellets === 1 || i % 3 === 0) fx.tracer(_muzzle, end);
    if (!hit) continue;
    if (hit.zombie) {
      const z = hit.zombie;
      const wasAlive = z.alive;
      let dmg = def.dmg * (hit.part === 'head' ? def.head : hit.part === 'limb' ? 0.7 : 1);
      if (def.falloff) dmg *= THREE.MathUtils.clamp(1 - (hit.distance - 6) / 22, 0.25, 1);
      const k = z.damage(dmg, hit.part, _dir);
      anyHit = true;
      if (hit.part === 'head') head = true;
      fx.gore(hit.point, _dir, hit.part === 'head' ? 1.4 : 0.8);
      audio.impact(hit.point, 'flesh');
      if (k && wasAlive) {
        killed = true;
        onZombieKilled(z, 'gun', hit.part);
      }
    } else {
      const surface = fx.impact(hit, _dir);
      audio.impact(hit.point, surface);
    }
  }
  if (anyHit) {
    game.stats.hits++;
    hitmarker(killed ? 'kill' : head ? 'head' : '');
    audio.hitmark(killed);
  }
});
weapons.on('dry', () => audio.dryFire());
weapons.on('mech', (k) => audio.mech(k));
weapons.on('swap', () => audio.mech('swap'));

function onZombieKilled(z, cause, part) {
  game.stats.kills++;
  if (part === 'head') {
    game.stats.headshots++;
    const hp = z.headMesh.getWorldPosition(new THREE.Vector3());
    fx.gore(hp, new THREE.Vector3(0, 0.5, 0).add(_dir), 2.6);
    audio.headshot(hp);
    game.headless.push({ z, t: 1.2 });
  }
  audio.zombieDeath(z.pos.clone().setY(z.pos.y + 1));
  const r = Math.random();
  if (cause === 'gun') {
    if (r < 0.22) spawnPickup('ammo', z.pos);
    else if (r < 0.3) spawnPickup('health', z.pos);
  }
}

// ---------- pickups ----------
const pickupGeo = { ammo: new THREE.BoxGeometry(0.34, 0.2, 0.22), health: new THREE.BoxGeometry(0.3, 0.2, 0.24) };
const pickupMat = {
  ammo: new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.6, metalness: 0.3, emissive: 0x2a2f1a, emissiveIntensity: 0.6 }),
  health: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.4, emissive: 0x403c38, emissiveIntensity: 0.6 }),
};
const crossMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.15), toneMapped: false });
const stripeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2, 0.3), toneMapped: false });

function spawnPickup(kind, pos) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(pickupGeo[kind], pickupMat[kind]);
  body.castShadow = true;
  g.add(body);
  if (kind === 'health') {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.245), crossMat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.245), crossMat);
    g.add(a, b);
  } else {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.345, 0.03, 0.225), stripeMat));
  }
  g.position.copy(pos);
  g.position.y = world.groundAt(pos.x, pos.z) + 0.3;
  scene.add(g);
  game.pickups.push({ kind, g, t: 0 });
}

function clearPickups() {
  for (const p of game.pickups) scene.remove(p.g);
  game.pickups = [];
}

function updatePickups(dt) {
  for (const p of game.pickups.slice()) {
    p.t += dt;
    p.g.rotation.y += dt * 1.5;
    p.g.position.y += Math.sin(p.t * 3) * 0.002;
    const d = Math.hypot(p.g.position.x - player.pos.x, p.g.position.z - player.pos.z);
    if (d < 1.1 && Math.abs(p.g.position.y - player.pos.y) < 1.5) {
      if (p.kind === 'health' && player.health >= 100) continue;
      if (p.kind === 'ammo') { weapons.addAmmo(1); toast('Ammo'); }
      else { player.health = Math.min(100, player.health + 30); toast('+30 health'); }
      audio.pickup();
      scene.remove(p.g);
      game.pickups.splice(game.pickups.indexOf(p), 1);
    } else if (p.t > 40) {
      scene.remove(p.g);
      game.pickups.splice(game.pickups.indexOf(p), 1);
    }
  }
}

// ---------- HUD ----------
const hud = {};
let toastTimer = 0;
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('on');
  toastTimer = 2.2;
}
function setObjective(text) {
  game.objective = text;
  $('objective').textContent = text;
  $('objective').classList.toggle('on', !!text);
}
let hitTimer = 0;
function hitmarker(kind) {
  const h = $('hitmarker');
  h.className = kind;
  h.style.opacity = 1;
  hitTimer = kind === 'kill' ? 0.3 : 0.15;
}
function setText(id, v) {
  if (hud[id] === v) return;
  hud[id] = v;
  $(id).textContent = v;
}
function updateHud(dt) {
  setText('hp', Math.ceil(player.health));
  $('hp-bar').style.width = player.health + '%';
  $('hp-bar').classList.toggle('low', player.health < 35);
  const st = weapons.ammo;
  setText('mag', st.mag);
  setText('reserve', st.reserve);
  $('mag').classList.toggle('low', st.mag <= Math.ceil(weapons.def.mag * 0.25));
  setText('weapon-name', weapons.reloading ? 'Reloading…' : weapons.def.name);
  document.querySelectorAll('#weapon-slots span').forEach((s) => s.classList.toggle('on', +s.dataset.slot === weapons.current));
  const left = game.phase === 'wave' ? game.total - game.stats.killsThisWave() : 0;
  setText('wave-label', game.wave ? `Wave ${game.wave}` : 'Get ready');
  setText('enemies-left', game.phase === 'wave' ? `${Math.max(0, left)} left` : game.phase === 'travel' ? 'In transit' : game.phase === 'idle' ? '' : 'Platform clear');
  setText('kills', game.stats.kills);
  // crosshair spread
  const spread = weapons.spreadNow(player);
  const px = (spread * (innerHeight / 2)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) + 4;
  const ch = $('crosshair');
  ch.classList.toggle('hide', weapons.ads > 0.5 || player.sprinting);
  ch.querySelector('.t').style.top = `${-px - 9}px`;
  ch.querySelector('.b').style.top = `${px}px`;
  ch.querySelector('.l').style.left = `${-px - 9}px`;
  ch.querySelector('.r').style.left = `${px}px`;
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('on'); }
  if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) $('hitmarker').style.opacity = 0; }
}
game.killsAtWaveStart = 0;
game.stats.killsThisWave = () => game.stats.kills - game.killsAtWaveStart;

// ---------- screens ----------
function showScreen(id) {
  for (const s of ['title', 'pause', 'dead']) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', id === 'title' || id === 'dead');
}

function newGame() {
  zombies.clear();
  clearPickups();
  fx.clearDecals();
  game.stationIndex = 0;
  game.wave = 0;
  game.riding = false;
  game.trainLeaving = false;
  game.stats = { kills: 0, headshots: 0, shots: 0, hits: 0, stations: 1, killsThisWave: () => game.stats.kills - game.killsAtWaveStart };
  game.killsAtWaveStart = 0;
  train.setPresent(false);
  train.setX(-1000);
  train.v = 0;
  player.reset();
  weapons.state = DEFS.map((d) => ({ mag: d.mag, reserve: d.reserve }));
  weapons.reloading = null;
  const theme = themeFor(0);
  station.applyTheme(theme);
  train.setTheme(theme, LINE, 0);
  captureEnvironment();
  setStationHud(theme);
  station.setBoard([['1 ' + LINE[1], 'cancelled'], 'Hold the platform'], '#ffa21a');
  setPhase('intro');
  deathCause = '';
}

function startGame() {
  audio.init();
  newGame();
  game.state = 'play';
  showScreen(null);
  input.lock();
  setTimeout(() => audio.announce(`Welcome to ${themeFor(0).name}. All services are suspended. Please remain on the platform.`), 800);
}

$('start').onclick = startGame;
$('resume').onclick = () => input.lock();
$('restart').onclick = startGame;
input.onLockChange = (locked) => {
  if (game.state === 'play' && !locked && !DEBUG) {
    game.state = 'paused';
    showScreen('pause');
  } else if (game.state === 'paused' && locked) {
    game.state = 'play';
    showScreen(null);
  }
};

player.onDeath = () => {
  game.state = 'dead';
  setTimeout(() => {
    document.exitPointerLock?.();
    const s = game.stats;
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    $('dead-stats').innerHTML = [
      [game.wave, 'Wave reached'], [s.stations, s.stations === 1 ? 'Station' : 'Stations'], [s.kills, 'Kills'],
      [s.headshots, 'Headshots'], [acc + '%', 'Accuracy'], [themeFor(game.stationIndex).name, 'Final stop'],
    ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('') + (deathCause ? `<p class="fine" style="grid-column:1/-1">${deathCause}</p>` : '');
    showScreen('dead');
  }, 1800);
};

// ---------- loop ----------
const _fwd = new THREE.Vector3();
let heartbeatT = 0;
let fogNear = 22, fogFar = 170;
let last = performance.now();
let titleT = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.time += dt;

  if (game.state === 'title') {
    titleT += dt;
    camera.position.set(-30 + Math.sin(titleT * 0.05) * 18, 1.7, -3.2);
    camera.rotation.set(0.02, Math.PI / 2 + 0.55 + Math.sin(titleT * 0.08) * 0.25, 0, 'YXZ');
  }

  if (game.state === 'play' || game.state === 'dead') {
    game.phaseT += dt;
    world.refresh();
    if (player.alive && game.state === 'play') {
      if (input.hit('Digit1')) weapons.switchTo(0);
      if (input.hit('Digit2')) weapons.switchTo(1);
      if (input.hit('Digit3')) weapons.switchTo(2);
      if (input.wheel) weapons.switchTo((weapons.current + input.wheel + 3) % 3);
      if (input.hit('KeyR')) weapons.reload();
    }
    player.update(dt, input, world, weapons, train);
    if (game.phase === 'intro' && game.phaseT > 3) startWave();
    if (game.phase === 'wave') updateWave(dt);
    updateTrain(dt);
    zombies.update(dt, game);
    updatePickups(dt);
    for (const h of game.headless) {
      h.t -= dt;
      if (h.z.root.parent) fx.neckSpurt(h.z.chest.localToWorld(new THREE.Vector3(0, 0.38, 0)));
    }
    game.headless = game.headless.filter((h) => h.t > 0);
    if (player.alive && player.health < 35) {
      heartbeatT -= dt;
      if (heartbeatT <= 0) { audio.heartbeat(); heartbeatT = 0.5 + player.health / 40; }
    }
    updateHud(dt);
  }

  // camera follows the main camera for the viewmodel
  const targetFov = 75 - (75 - weapons.def.adsFov) * weapons.ads;
  if (Math.abs(camera.fov - targetFov) > 0.01) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  vmCam.position.copy(camera.position);
  vmCam.quaternion.copy(camera.quaternion);
  vmCam.updateMatrixWorld();
  if (game.state === 'play' || game.state === 'dead') weapons.update(dt, game.state === 'play' && player.alive ? input : { fire: false, aim: false, dx: 0, dy: 0 }, player, game.time);
  weapons.root.visible = game.state !== 'title' && player.alive;

  // fog closes in inside the tunnels
  const inTunnel = Math.abs(camera.position.x) > L.HALF + 2;
  const tn = inTunnel ? 14 : 22, tf = inTunnel ? 46 : 170;
  fogNear += (tn - fogNear) * Math.min(1, dt * 2);
  fogFar += (tf - fogFar) * Math.min(1, dt * 2);
  scene.fog.near = fogNear;
  scene.fog.far = fogFar;

  station.update(dt);
  train.update(dt, game.time);
  fx.update(dt, audio);
  fx.setScale(renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
  camera.getWorldDirection(_fwd);
  audio.setListener(camera.position, _fwd, new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion));

  final.uniforms.time.value = game.time;
  final.uniforms.damage.value = Math.max(player.hurtFlash, player.alive ? Math.max(0, (35 - player.health) / 35) * (0.35 + 0.15 * Math.sin(game.time * 6)) : 0.9);
  final.uniforms.fade.value = game.state === 'dead' ? Math.min(0.85, (final.uniforms.fade.value || 0) + dt * 0.5) : 0;
  composer.render();
  input.endFrame();
  requestAnimationFrame(frame);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  vmCam.updateProjectionMatrix();
}
addEventListener('resize', resize);

// boot
station.setBoard([['1 ' + LINE[1], 'cancelled'], 'Service suspended'], '#ffa21a');
train.setTheme(themeFor(0), LINE, 0);
captureEnvironment();
showScreen('title');
$('start').disabled = false;
$('start').textContent = 'Enter the station';
requestAnimationFrame(frame);

// test hooks
window.__game = {
  game, player, weapons, zombies, train, station, input, audio,
  start() { audio.init(); newGame(); game.state = 'play'; showScreen(null); input.locked = true; },
  killAll() { for (const z of zombies.list) if (z.alive) { z.damage(1e6, 'body', new THREE.Vector3(0, 0, 1)); onZombieKilled(z, 'debug', 'body'); } game.spawned = game.total; },
  look(yaw, pitch) { player.yaw = yaw; player.pitch = pitch; },
  goto(i) { game.stationIndex = i - 1; nextStation(); },
  aimAt(z, part = 'body') {
    const t = part === 'head' ? z.headMesh.getWorldPosition(new THREE.Vector3()) : z.chest.getWorldPosition(new THREE.Vector3());
    const c = camera.position;
    const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  },
};
