import * as THREE from "./vendor/three.module.js";

const canvas = document.getElementById("game");

const ui = {
  score: document.getElementById("score"),
  combo: document.getElementById("combo"),
  distance: document.getElementById("distance"),
  integrityFill: document.getElementById("integrityFill"),
  rageFill: document.getElementById("rageFill"),
  missionName: document.getElementById("missionName"),
  missionProgress: document.getElementById("missionProgress"),
  mobileScore: document.getElementById("mobileScore"),
  riskText: document.getElementById("riskText"),
  skillCooldown: document.getElementById("skillCooldown"),
  overlay: document.getElementById("overlay"),
  title: document.getElementById("title"),
  kicker: document.getElementById("kicker"),
  recordLabel: document.getElementById("recordLabel"),
  bestScore: document.getElementById("bestScore"),
  startButton: document.getElementById("startButton"),
  skillButton: document.getElementById("skillButton"),
  pauseButton: document.getElementById("pauseButton"),
  soundButton: document.getElementById("soundButton"),
};

const SAVE_KEY = "takeout-thief-3d-best";
const lanes = [-3.1, 0, 3.1];
const laneIds = [-1, 0, 1];
const clock = new THREE.Clock();
const tmpVec = new THREE.Vector3();
const tmpColor = new THREE.Color();

const palette = {
  asphalt: 0x1b2029,
  asphaltDeep: 0x111720,
  lane: 0xffd13d,
  cyan: 0x27d9ff,
  red: 0xff4268,
  yellow: 0xffd13d,
  green: 0x54eba2,
  purple: 0x8b5cf6,
  white: 0xf8fbff,
  black: 0x090d14,
  skin: 0xf0b36e,
  courier: 0x0fb8d0,
};

const materials = {};
const state = {
  mode: "ready",
  width: 1,
  height: 1,
  dpr: 1,
  score: 0,
  distance: 0,
  combo: 1,
  comboTimer: 0,
  integrity: 100,
  rage: 38,
  skill: 0,
  speed: 24,
  baseSpeed: 24,
  spawnTimer: 0,
  pickupTimer: 0,
  patternIndex: 0,
  hotLane: 1,
  hotLaneTimer: 0,
  shake: 0,
  hitStop: 0,
  slowMo: 0,
  sound: true,
  best: Number(localStorage.getItem(SAVE_KEY) || 0),
  mission: null,
  missionProgress: 0,
  pointerStart: null,
  objects: [],
  pickups: [],
  particles: [],
  floaters: [],
};

const player = {
  lane: 1,
  laneFloat: 1,
  baseScale: .54,
  x: 0,
  y: 0,
  vy: 0,
  slide: 0,
  lean: 0,
  run: 0,
  shield: 0,
  magnet: 0,
  invincible: 0,
  perfectStreak: 0,
};

const thief = {
  laneFloat: 1,
  x: 0,
  z: -26,
  sway: 0,
  gap: 30,
};

const missions = [
  { id: "food", name: "夜宵单", target: 10, reward: 1400, kind: "pickup" },
  { id: "near", name: "贴脸追回", target: 5, reward: 1800, kind: "near" },
  { id: "perfect", name: "完美闪避", target: 7, reward: 1600, kind: "perfect" },
  { id: "air", name: "空中取餐", target: 5, reward: 1500, kind: "air" },
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b16);
scene.fog = new THREE.FogExp2(0x081326, 0.014);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 260);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const world = new THREE.Group();
const roadGroup = new THREE.Group();
const buildingGroup = new THREE.Group();
const actorGroup = new THREE.Group();
const fxGroup = new THREE.Group();
scene.add(world, roadGroup, buildingGroup, actorGroup, fxGroup);

let courier;
let thiefModel;
let audioCtx = null;
let dangerStrips = [];
const themeMusic = new Audio("./assets/theme.mp3");
themeMusic.loop = true;
themeMusic.volume = .42;

init();

function init() {
  createMaterials();
  setupLights();
  buildRoad();
  buildDangerStrips();
  buildCity();
  courier = createCourier();
  thiefModel = createThief();
  courier.root.scale.setScalar(player.baseScale);
  thiefModel.root.scale.setScalar(.7);
  actorGroup.add(courier.root, thiefModel.root);
  bindControls();
  resize();
  setReady();
  if (new URLSearchParams(window.location.search).get("autostart") === "1") {
    resetGame();
  }
  renderer.setAnimationLoop(loop);
}

function buildDangerStrips() {
  const geo = new THREE.BoxGeometry(2.35, .04, 8.5);
  for (let i = 0; i < 3; i += 1) {
    const strip = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: i === 1 ? palette.yellow : palette.cyan,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }));
    strip.position.set(lanes[i], .16, -12);
    scene.add(strip);
    dangerStrips.push(strip);
  }
}

function createMaterials() {
  const make = (name, color, options = {}) => {
    materials[name] = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? .58,
      metalness: options.metalness ?? .04,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
    });
  };

  make("road", 0x252d3a, { roughness: .78 });
  make("roadDeep", 0x151d29, { roughness: .86 });
  make("lane", palette.lane, { emissive: palette.lane, emissiveIntensity: .25 });
  make("cyan", palette.cyan, { emissive: palette.cyan, emissiveIntensity: .6 });
  make("red", palette.red, { emissive: palette.red, emissiveIntensity: .55 });
  make("yellow", palette.yellow, { emissive: palette.yellow, emissiveIntensity: .45 });
  make("green", palette.green, { emissive: palette.green, emissiveIntensity: .5 });
  make("purple", palette.purple, { emissive: palette.purple, emissiveIntensity: .45 });
  make("white", palette.white, { roughness: .36 });
  make("black", palette.black, { roughness: .6 });
  make("skin", palette.skin, { roughness: .5 });
  make("courier", palette.courier, { emissive: 0x064f60, emissiveIntensity: .25 });
  make("hoodie", 0x111827, { roughness: .66 });
  make("window", 0x2d405b, { emissive: 0x172b42, emissiveIntensity: .22 });
  make("glass", 0x1b7595, { metalness: .2, roughness: .22, emissive: 0x0a4558, emissiveIntensity: .35 });
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xb8e6ff, 0x201825, 2.1));

  const moon = new THREE.DirectionalLight(0xe8f4ff, 3.1);
  moon.position.set(-8, 18, 10);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 80;
  moon.shadow.camera.left = -28;
  moon.shadow.camera.right = 28;
  moon.shadow.camera.top = 28;
  moon.shadow.camera.bottom = -18;
  scene.add(moon);

  const chaseLight = new THREE.PointLight(0xffd13d, 6, 28, 2);
  chaseLight.position.set(0, 3.6, 5);
  scene.add(chaseLight);
}

function buildRoad() {
  const roadGeo = new THREE.BoxGeometry(11.8, .12, 24);
  const curbGeo = new THREE.BoxGeometry(.32, .3, 24);
  const dashGeo = new THREE.BoxGeometry(.08, .035, 1.9);
  const sideLineGeo = new THREE.BoxGeometry(.08, .035, 3.2);

  for (let i = 0; i < 12; i += 1) {
    const z = -i * 23;
    const segment = new THREE.Group();
    segment.userData.baseZ = z;
    segment.position.z = z;

    const road = new THREE.Mesh(roadGeo, materials.road);
    road.receiveShadow = true;
    segment.add(road);

    for (const x of [-5.9, 5.9]) {
      const curb = new THREE.Mesh(curbGeo, materials.roadDeep);
      curb.position.set(x, .09, 0);
      curb.receiveShadow = true;
      segment.add(curb);
    }

    for (const x of [-1.55, 1.55]) {
      for (let j = -5; j <= 5; j += 1) {
        const dash = new THREE.Mesh(dashGeo, materials.lane);
        dash.position.set(x, .11, j * 2.2);
        segment.add(dash);
      }
    }

    for (const x of [-4.65, 4.65]) {
      for (let j = -3; j <= 3; j += 1) {
        const line = new THREE.Mesh(sideLineGeo, materials.cyan);
        line.position.set(x, .12, j * 3.8);
        line.scale.y = .6;
        segment.add(line);
      }
    }
    roadGroup.add(segment);
  }
}

function buildCity() {
  const shopNames = ["炒粉", "奶茶", "烤串", "夜宵", "卤味", "冰粉"];
  for (let i = 0; i < 42; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -10 - Math.floor(i / 2) * 11.5 - (i % 3) * 1.6;
    const building = new THREE.Group();
    building.userData.baseZ = z;
    building.position.set(side * rand(9.3, 13.6), 0, z);
    building.rotation.y = side * rand(.02, .12);

    const w = rand(2.6, 4.9);
    const h = rand(5.2, 13.6);
    const d = rand(2.8, 5.4);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.roadDeep);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    building.add(body);

    const signColor = [materials.red, materials.cyan, materials.yellow, materials.green][i % 4];
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w * .82, .55, .08), signColor);
    sign.position.set(-side * (w * .15), rand(1.8, Math.min(h - .9, 4.8)), side * (d / 2 + .05));
    building.add(sign);

    const signText = makeTextSprite(shopNames[i % shopNames.length], i % 4 === 1 ? "#27d9ff" : i % 4 === 2 ? "#ffd13d" : "#ff4268");
    signText.position.copy(sign.position);
    signText.position.z += side * .08;
    signText.scale.set(1.8, .46, 1);
    building.add(signText);

    const windowRows = Math.max(1, Math.floor(h / 2.2));
    for (let r = 0; r < windowRows; r += 1) {
      for (let c = -1; c <= 1; c += 1) {
        if ((i + r + c) % 3 === 0) continue;
        const win = new THREE.Mesh(new THREE.BoxGeometry(.45, .42, .06), i % 5 === 0 ? materials.yellow : materials.window);
        win.position.set(c * w * .23, 2 + r * 1.55, side * (d / 2 + .06));
        building.add(win);
      }
    }

    if (i % 5 === 0) {
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), materials.red);
      lantern.position.set(side * -.6, 1.35, side * (d / 2 + .45));
      building.add(lantern);
      const light = new THREE.PointLight(0xff4268, 1.2, 7, 2);
      light.position.copy(lantern.position);
      building.add(light);
    }

    buildingGroup.add(building);
  }
}

function createCourier() {
  const root = new THREE.Group();
  root.position.set(0, 0, 0);

  const body = capsule(.56, 1.16, materials.courier);
  body.position.y = 1.55;
  body.castShadow = true;
  root.add(body);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(.78, .72, .15), materials.yellow);
  vest.position.set(0, 1.58, .49);
  vest.castShadow = true;
  root.add(vest);

  const vestText = makeTextSprite("餐", "#1a0b09");
  vestText.position.set(0, 1.58, .585);
  vestText.scale.set(.36, .36, 1);
  root.add(vestText);

  const head = new THREE.Mesh(new THREE.SphereGeometry(.38, 24, 16), materials.skin);
  head.position.y = 2.42;
  head.castShadow = true;
  root.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(.86, .2, .72), materials.red);
  cap.position.set(0, 2.78, .03);
  cap.castShadow = true;
  root.add(cap);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(.48, .09, .38), materials.red);
  visor.position.set(0, 2.66, .42);
  root.add(visor);

  const face = new THREE.Mesh(new THREE.BoxGeometry(.36, .05, .035), materials.black);
  face.position.set(0, 2.39, .37);
  root.add(face);

  const bag = new THREE.Mesh(new THREE.BoxGeometry(.92, .78, .44), materials.yellow);
  bag.position.set(0, 1.52, -.52);
  bag.castShadow = true;
  root.add(bag);

  const limbs = {
    leftArm: limb(.15, .82, materials.skin),
    rightArm: limb(.15, .82, materials.skin),
    leftLeg: limb(.17, .9, materials.black),
    rightLeg: limb(.17, .9, materials.black),
    leftShoe: new THREE.Mesh(new THREE.BoxGeometry(.42, .18, .65), materials.white),
    rightShoe: new THREE.Mesh(new THREE.BoxGeometry(.42, .18, .65), materials.white),
  };

  limbs.leftArm.position.set(-.58, 1.68, .08);
  limbs.rightArm.position.set(.58, 1.68, .08);
  limbs.leftLeg.position.set(-.24, .75, 0);
  limbs.rightLeg.position.set(.24, .75, 0);
  limbs.leftShoe.position.set(-.25, .18, .15);
  limbs.rightShoe.position.set(.25, .18, .15);

  Object.values(limbs).forEach(part => {
    part.castShadow = true;
    root.add(part);
  });

  const shield = new THREE.Mesh(new THREE.TorusGeometry(1.05, .035, 10, 60), materials.cyan);
  shield.position.y = 1.55;
  shield.rotation.x = Math.PI / 2;
  shield.visible = false;
  root.add(shield);

  return { root, body, head, cap, vest, bag, shield, ...limbs };
}

function createThief() {
  const root = new THREE.Group();
  const body = capsule(.48, 1.08, materials.hoodie);
  body.position.y = 1.45;
  body.castShadow = true;
  root.add(body);

  const hood = new THREE.Mesh(new THREE.SphereGeometry(.4, 24, 14), materials.hoodie);
  hood.position.y = 2.3;
  hood.castShadow = true;
  root.add(hood);

  const face = new THREE.Mesh(new THREE.BoxGeometry(.42, .12, .05), materials.skin);
  face.position.set(0, 2.27, .34);
  root.add(face);

  const bag = new THREE.Mesh(new THREE.BoxGeometry(.62, .72, .38), materials.yellow);
  bag.position.set(.54, 1.55, .12);
  bag.castShadow = true;
  root.add(bag);

  const label = makeTextSprite("偷", "#1a0b09");
  label.position.set(.54, 1.55, .33);
  label.scale.set(.28, .28, 1);
  root.add(label);

  const leftLeg = limb(.13, .82, materials.black);
  const rightLeg = limb(.13, .82, materials.black);
  leftLeg.position.set(-.18, .7, 0);
  rightLeg.position.set(.2, .7, 0);
  root.add(leftLeg, rightLeg);

  const tag = makeTextSprite("还我", "#f8fbff");
  tag.position.set(0, 2.88, .02);
  tag.scale.set(.62, .22, 1);
  root.add(tag);

  return { root, body, hood, bag, leftLeg, rightLeg };
}

function capsule(radius, length, material) {
  if (THREE.CapsuleGeometry) {
    return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 18), material);
  }
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length + radius * 2, 18), material);
}

function limb(radius, length, material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), material);
  mesh.rotation.z = .08;
  return mesh;
}

function makeTextSprite(text, color) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  g.font = "900 48px Microsoft YaHei, PingFang SC, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = "rgba(5,8,14,.82)";
  g.fillStyle = color;
  g.strokeText(text, 128, 48);
  g.fillText(text, 128, 48);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.userData.texture = texture;
  return sprite;
}

function resetGame() {
  state.mode = "running";
  state.score = 0;
  state.distance = 0;
  state.combo = 1;
  state.comboTimer = 0;
  state.integrity = 100;
  state.rage = 38;
  state.skill = 0;
  state.speed = 24;
  state.baseSpeed = 24;
  state.spawnTimer = .12;
  state.pickupTimer = .2;
  state.patternIndex = 0;
  state.hotLane = 1;
  state.hotLaneTimer = 1.6;
  state.shake = 0;
  state.hitStop = 0;
  state.slowMo = 0;
  player.lane = 1;
  player.laneFloat = 1;
  player.x = 0;
  player.y = 0;
  player.vy = 0;
  player.slide = 0;
  player.lean = 0;
  player.shield = 0;
  player.magnet = 0;
  player.invincible = 0;
  player.perfectStreak = 0;
  thief.gap = 34;
  thief.laneFloat = 1;
  clearDynamic();
  chooseMission();
  ui.overlay.classList.remove("is-visible");
  ui.pauseButton.textContent = "Ⅱ";
  playTheme();
  beep(520, .05, "triangle", .04);
}

function clearDynamic() {
  for (const obj of [...state.objects, ...state.pickups, ...state.particles, ...state.floaters]) {
    if (obj.mesh) disposeObject(obj.mesh);
    if (obj.root) disposeObject(obj.root);
    if (obj.sprite) disposeObject(obj.sprite);
  }
  state.objects = [];
  state.pickups = [];
  state.particles = [];
  state.floaters = [];
}

function disposeObject(object) {
  if (!object) return;
  object.traverse?.(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material && !Object.values(materials).includes(child.material)) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
  });
  object.parent?.remove(object);
}

function chooseMission() {
  const mission = missions[Math.floor(Math.random() * missions.length)];
  state.mission = mission;
  state.missionProgress = 0;
  ui.missionName.textContent = mission.name;
  ui.missionProgress.textContent = `0/${mission.target}`;
}

function setReady() {
  state.mode = "ready";
  ui.title.textContent = "小偷还我外卖";
  ui.kicker.textContent = "外卖被抢，追回热乎的那一口";
  ui.recordLabel.textContent = "最佳";
  ui.bestScore.textContent = String(state.best);
  ui.startButton.textContent = "开追";
  ui.overlay.classList.add("is-visible");
}

function setGameOver() {
  state.mode = "gameover";
  state.best = Math.max(state.best, Math.floor(state.score));
  localStorage.setItem(SAVE_KEY, String(state.best));
  ui.title.textContent = "餐盒翻了";
  ui.kicker.textContent = `本局 ${Math.floor(state.score)} 分，追回 ${Math.floor(state.distance)} 米`;
  ui.recordLabel.textContent = "最佳";
  ui.bestScore.textContent = String(state.best);
  ui.startButton.textContent = "再追";
  ui.overlay.classList.add("is-visible");
  pauseTheme();
  state.shake = 1.2;
  spawnBurst(courier.root.position, palette.red, 34, 1.4);
  beep(110, .18, "sawtooth", .08);
}

function togglePause() {
  if (state.mode === "running") {
    state.mode = "paused";
    ui.title.textContent = "暂停";
    ui.kicker.textContent = "小偷还在前面，外卖还没凉";
    ui.recordLabel.textContent = "当前";
    ui.bestScore.textContent = String(Math.floor(state.score));
    ui.startButton.textContent = "继续";
    ui.pauseButton.textContent = "▶";
    ui.overlay.classList.add("is-visible");
    pauseTheme();
  } else if (state.mode === "paused") {
    state.mode = "running";
    ui.pauseButton.textContent = "Ⅱ";
    ui.overlay.classList.remove("is-visible");
    playTheme();
  }
}

function loop() {
  const rawDt = Math.min(clock.getDelta(), .033);
  const dt = state.slowMo > 0 ? rawDt * .42 : rawDt;
  if (state.mode === "running") update(dt, rawDt);
  else updateIdle(rawDt);
  render(rawDt);
}

function update(dt, rawDt) {
  if (state.hitStop > 0) {
    state.hitStop -= rawDt;
    updateCamera(rawDt);
    return;
  }

  state.distance += state.speed * dt * .72;
  state.baseSpeed = Math.min(38, 24 + state.distance * .008);
  state.speed = lerp(state.speed, state.baseSpeed + (state.skill > 0 ? 10 : 0), .035);
  state.score += dt * state.speed * (2.8 + Math.floor(state.combo) * .48);
  state.hotLaneTimer -= dt;
  if (state.hotLaneTimer <= 0) {
    state.hotLane = Math.floor(rand(0, 3));
    state.hotLaneTimer = rand(3.2, 5.8);
    floatText(lanes[state.hotLane], 2.55, -8.5, "高分线", "#ffd13d", .92);
  }
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer <= 0) state.combo = Math.max(1, state.combo - dt * .72);
  state.rage = clamp(state.rage + dt * (state.skill > 0 ? -32 : 4.5), 0, 100);
  state.skill = Math.max(0, state.skill - dt);
  state.slowMo = Math.max(0, state.slowMo - rawDt);
  state.shake = Math.max(0, state.shake - rawDt * 2.8);

  player.run += dt * state.speed * .62;
  player.slide = Math.max(0, player.slide - dt);
  player.shield = Math.max(0, player.shield - dt);
  player.magnet = Math.max(0, player.magnet - dt);
  player.invincible = Math.max(0, player.invincible - dt);
  player.laneFloat = lerp(player.laneFloat, player.lane, 1 - Math.pow(.0008, dt));
  player.x = lanes[Math.round(player.laneFloat)] ?? lanes[player.lane];
  player.x = lerp(lanes[0], lanes[2], player.laneFloat / 2);
  player.lean = lerp(player.lean, 0, 1 - Math.pow(.02, dt));
  player.vy -= 34 * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) {
    player.y = 0;
    player.vy = 0;
  }

  thief.sway += dt * 1.9;
  thief.gap = clamp(34 - state.combo * .36 - state.skill * 1.5 + (100 - state.integrity) * .08, 21, 48);
  thief.laneFloat = 1 + Math.sin(thief.sway) * .68;
  thief.x = lerp(lanes[0], lanes[2], thief.laneFloat / 2);
  thief.z = -thief.gap;

  updateRoad(dt);
  updateCity(dt);
  updateSpawning(dt);
  updateObjects(dt);
  updatePickups(dt);
  updateParticles(dt);
  updateFloaters(dt);
  updateActors(dt);
  updateDangerStrips(dt);
  updateCamera(rawDt);
  updateHud();
}

function updateIdle(dt) {
  thief.sway += dt;
  updateRoad(dt * .28);
  updateCity(dt * .28);
  updateParticles(dt);
  updateFloaters(dt);
  courier.root.position.set(player.x, player.y, 0);
  thiefModel.root.position.set(Math.sin(thief.sway) * 1.2, 0, -28);
  animateCourier(dt);
  animateThief(dt);
  updateCamera(dt);
}

function updateRoad(dt) {
  const travel = state.speed * dt;
  for (const segment of roadGroup.children) {
    segment.position.z += travel;
    if (segment.position.z > 18) segment.position.z -= 12 * 23;
  }
}

function updateCity(dt) {
  const travel = state.speed * dt * .88;
  for (const building of buildingGroup.children) {
    building.position.z += travel;
    if (building.position.z > 16) {
      building.position.z -= 42 * 5.75;
      building.position.x = Math.sign(building.position.x) * rand(9.3, 13.8);
    }
  }
}

function updateSpawning(dt) {
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnPattern();
    state.spawnTimer = clamp(1.2 - state.distance * .0009, .48, 1.2);
  }

  state.pickupTimer -= dt;
  if (state.pickupTimer <= 0) {
    spawnPickupLine();
    state.pickupTimer = rand(.75, 1.35);
  }
}

function spawnPattern() {
  const patterns = [
    [{ lane: 0, type: "jump" }, { lane: 2, type: "slide", dz: -7 }],
    [{ lane: 1, type: "jump" }, { lane: 0, type: "swerve", dz: -6 }],
    [{ lane: 2, type: "slide" }, { lane: 1, type: "jump", dz: -6 }],
    [{ lane: 0, type: "swerve" }, { lane: 2, type: "jump", dz: -5.5 }],
    [{ lane: 0, type: "jump" }, { lane: 1, type: "slide", dz: -7 }, { lane: 2, type: "jump", dz: -14 }],
    [{ lane: 1, type: "slide" }, { lane: 0, type: "jump", dz: -5.5 }, { lane: 2, type: "swerve", dz: -11 }],
    [{ lane: 0, type: "slide" }, { lane: 1, type: "swerve", dz: -6 }, { lane: 2, type: "slide", dz: -12 }],
  ];
  const pattern = patterns[state.patternIndex % patterns.length];
  state.patternIndex += 1;
  for (const item of pattern) {
    spawnObstacle(item.lane, item.type, -64 + (item.dz || 0));
  }
}

function updateDangerStrips(dt) {
  const danger = [0, 0, 0];
  for (const item of state.objects) {
    if (item.z < -30 || item.z > -2) continue;
    const weight = 1 - Math.abs(item.z + 15) / 15;
    danger[item.lane] = Math.max(danger[item.lane], clamp(weight, 0, 1));
  }
  for (let i = 0; i < dangerStrips.length; i += 1) {
    const strip = dangerStrips[i];
    strip.position.z = lerp(strip.position.z, -15, .1);
    const hot = i === state.hotLane ? .1 + Math.sin(state.distance * .08) * .04 : 0;
    strip.material.color.lerp(tmpColor.setHex(i === state.hotLane ? palette.yellow : palette.cyan), 1 - Math.pow(.02, dt));
    strip.material.opacity = lerp(strip.material.opacity, danger[i] * .22 + hot, 1 - Math.pow(.01, dt));
    strip.scale.z = 1 + danger[i] * .35;
  }
}

function spawnObstacle(lane, type, z) {
  const root = new THREE.Group();
  root.position.set(lanes[lane], 0, z);
  root.userData.type = type;
  root.userData.lane = lane;
  root.userData.scored = false;
  root.userData.checked = false;

  if (type === "jump") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, .68, 1.15), materials.red);
    base.position.y = .34;
    base.castShadow = true;
    root.add(base);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.9, .08, 1.2), materials.yellow);
    stripe.position.y = .72;
    root.add(stripe);
    const light = new THREE.PointLight(palette.red, 1.2, 7, 2);
    light.position.set(0, 1.1, .2);
    root.add(light);
    const hint = makeTextSprite("跳", "#ffd13d");
    hint.position.set(0, 1.35, .04);
    hint.scale.set(.52, .24, 1);
    root.add(hint);
  } else if (type === "slide") {
    const left = new THREE.Mesh(new THREE.BoxGeometry(.18, 1.9, .22), materials.cyan);
    const right = left.clone();
    left.position.set(-.92, .95, 0);
    right.position.set(.92, .95, 0);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.15, .22, .32), materials.cyan);
    bar.position.set(0, 1.72, 0);
    left.castShadow = right.castShadow = bar.castShadow = true;
    root.add(left, right, bar);
    const light = new THREE.PointLight(palette.cyan, 1.4, 8, 2);
    light.position.set(0, 1.7, .1);
    root.add(light);
    const hint = makeTextSprite("滑", "#27d9ff");
    hint.position.set(0, 2.25, .04);
    hint.scale.set(.52, .24, 1);
    root.add(hint);
  } else {
    const scooter = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.65, .58, 1.05), materials.purple);
    body.position.y = .72;
    body.castShadow = true;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(.86, .18, .5), materials.black);
    seat.position.set(.08, 1.08, -.08);
    const w1 = new THREE.Mesh(new THREE.TorusGeometry(.28, .08, 8, 20), materials.black);
    const w2 = w1.clone();
    w1.position.set(-.62, .36, .46);
    w2.position.set(.62, .36, .46);
    w1.rotation.y = w2.rotation.y = Math.PI / 2;
    scooter.add(body, seat, w1, w2);
    root.add(scooter);
    const light = new THREE.PointLight(palette.purple, 1.2, 7, 2);
    light.position.set(0, 1.2, .2);
    root.add(light);
    const hint = makeTextSprite("闪", "#ff4268");
    hint.position.set(0, 1.55, .05);
    hint.scale.set(.52, .24, 1);
    root.add(hint);
  }

  scene.add(root);
  state.objects.push({ root, lane, type, z, passed: false });
}

function spawnPickupLine() {
  const lane = Math.floor(rand(0, 3));
  const roll = Math.random();
  const type = roll > .88 ? "shield" : roll > .76 ? "magnet" : roll > .64 ? "rage" : roll > .38 ? "tea" : "food";
  const count = type === "food" || type === "tea" ? 5 : 1;
  for (let i = 0; i < count; i += 1) {
    spawnPickup(lane, type, -62 - i * 4.8);
  }
}

function spawnPickup(lane, type, z) {
  const root = new THREE.Group();
  root.position.set(lanes[lane], .95, z);
  root.userData.lane = lane;
  root.userData.type = type;
  const mat = type === "tea" ? materials.cyan : type === "rage" ? materials.red : type === "shield" ? materials.green : materials.yellow;

  if (type === "tea") {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(.28, .22, .72, 18), mat);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .08, 18), materials.white);
    cup.castShadow = true;
    lid.position.y = .4;
    root.add(cup, lid);
  } else if (type === "magnet") {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(.38, .08, 12, 28, Math.PI * 1.25), materials.red);
    torus.rotation.z = Math.PI;
    root.add(torus);
  } else if (type === "shield") {
    const shield = new THREE.Mesh(new THREE.OctahedronGeometry(.45, 0), materials.green);
    root.add(shield);
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(.62, .48, .48), mat);
    box.castShadow = true;
    root.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(.68, .12, .52), materials.red);
    band.position.y = .12;
    root.add(band);
  }

  const glow = new THREE.PointLight(type === "tea" ? palette.cyan : type === "shield" ? palette.green : palette.yellow, 1.4, 5, 2);
  glow.position.y = .5;
  root.add(glow);
  scene.add(root);
  state.pickups.push({ root, lane, type, z, taken: false, spin: rand(0, Math.PI * 2) });
}

function updateObjects(dt) {
  const travel = state.speed * dt;
  for (const item of state.objects) {
    item.z += travel;
    item.root.position.z = item.z;
    item.root.rotation.y = Math.sin((state.distance + item.z) * .08) * .035;
    const sameLane = Math.abs(player.laneFloat - item.lane) < .42;
    const active = item.z > -.85 && item.z < .95;
    if (active && sameLane && !item.root.userData.checked) {
      item.root.userData.checked = true;
      if (canClear(item.type)) {
        rewardDodge(item, true);
      } else {
        crash(item);
      }
    }
    if (!item.passed && item.z > 1.55) {
      item.passed = true;
      const close = Math.abs(player.laneFloat - item.lane);
      if (close < .62 && canClear(item.type)) rewardDodge(item, true);
      else if (close < 1.12) rewardDodge(item, false);
      else addCombo(.12);
    }
  }

  state.objects = state.objects.filter(item => {
    if (item.z > 16) {
      disposeObject(item.root);
      return false;
    }
    return true;
  });
}

function canClear(type) {
  if (state.skill > 0 || player.invincible > 0 || player.shield > 0) return true;
  if (type === "jump") return player.y > .88;
  if (type === "slide") return player.slide > 0;
  return false;
}

function rewardDodge(item, perfect) {
  if (item.root.userData.scored) return;
  item.root.userData.scored = true;
  const near = Math.abs(player.laneFloat - item.lane) < .34;
  const gain = perfect ? (near ? 620 : 420) : 170;
  state.score += gain * Math.max(1, Math.floor(state.combo));
  state.rage = clamp(state.rage + (perfect ? 12 : 5), 0, 100);
  addCombo(perfect ? (near ? .62 : .42) : .18);
  if (perfect) {
    player.perfectStreak += 1;
    missionTick("perfect");
    if (near) missionTick("near");
    floatText(lanes[item.lane], 2.7, -2.4, near ? "贴脸闪" : "完美", near ? "#ff4268" : "#ffd13d", near ? 1.25 : 1);
    spawnBurst(new THREE.Vector3(lanes[item.lane], 1.1, .3), near ? palette.red : palette.yellow, near ? 20 : 12, near ? 1 : .7);
    if (near) state.slowMo = Math.max(state.slowMo, .08);
    beep(near ? 980 : 760, .055, "triangle", .035);
  }
}

function crash(item) {
  if (player.invincible > 0 || state.skill > 0) {
    item.root.visible = false;
    spawnBurst(item.root.position, palette.yellow, 26, 1);
    rewardDodge(item, true);
    return;
  }
  state.integrity -= player.shield > 0 ? 8 : 22;
  state.combo = 1;
  state.comboTimer = 0;
  player.perfectStreak = 0;
  state.shake = 1.1;
  state.hitStop = .1;
  player.invincible = .9;
  item.root.visible = false;
  floatText(player.x, 2.4, .2, "洒了", "#ff4268", 1.15);
  spawnBurst(courier.root.position, palette.red, 28, 1.15);
  beep(130, .12, "sawtooth", .08);
  if (state.integrity <= 0) setGameOver();
}

function updatePickups(dt) {
  const travel = state.speed * dt;
  for (const item of state.pickups) {
    item.z += travel;
    item.spin += dt * 4.5;
    item.root.position.z = item.z;
    item.root.position.y = .95 + Math.sin(item.spin * 2) * .12;
    item.root.rotation.y = item.spin;
    const laneDistance = Math.abs(player.laneFloat - item.lane);
    const grabDistance = player.magnet > 0 ? 1.35 : .45;
    if (!item.taken && laneDistance < grabDistance && item.z > -1.1 && item.z < 1.45) {
      collectPickup(item);
    }
  }

  state.pickups = state.pickups.filter(item => {
    if (item.taken || item.z > 15) {
      disposeObject(item.root);
      return false;
    }
    return true;
  });
}

function collectPickup(item) {
  item.taken = true;
  const base = item.root.position.clone();
  const risk = getRiskMultiplier();
  if (item.type === "shield") {
    player.shield = 5;
    player.invincible = Math.max(player.invincible, 1);
    floatText(base.x, 2.2, base.z, "护盾", "#54eba2", 1);
  } else if (item.type === "magnet") {
    player.magnet = 7;
    floatText(base.x, 2.2, base.z, "磁吸", "#27d9ff", 1);
  } else if (item.type === "rage") {
    state.rage = clamp(state.rage + 24, 0, 100);
    floatText(base.x, 2.2, base.z, "怒气+", "#ff4268", 1);
  } else {
    const aerial = player.y > .55;
    const points = item.type === "tea" ? 150 : 110;
    state.score += points * Math.max(1, Math.floor(state.combo)) * risk;
    state.rage = clamp(state.rage + (risk > 1 ? 7 : 2), 0, 100);
    state.integrity = clamp(state.integrity + .8, 0, 100);
    missionTick("pickup");
    if (aerial) missionTick("air");
    floatText(base.x, 2.1, base.z, risk > 1 ? `+${Math.floor(points * risk)} 高分` : `+${points}`, item.type === "tea" ? "#27d9ff" : "#ffd13d", risk > 1 ? .98 : .85);
  }
  addCombo(.22);
  spawnBurst(base, item.type === "tea" ? palette.cyan : palette.yellow, 10, .65);
  beep(item.type === "tea" ? 880 : 720, .04, "triangle", .024);
}

function getRiskMultiplier() {
  const hot = Math.round(player.laneFloat) === state.hotLane ? .55 : 0;
  const nearby = state.objects.some(item => item.z > -13 && item.z < 5 && Math.abs(item.lane - player.laneFloat) < .7) ? .55 : 0;
  const airborne = player.y > .55 ? .25 : 0;
  return 1 + hot + nearby + airborne;
}

function missionTick(kind) {
  if (!state.mission || state.mission.kind !== kind) return;
  state.missionProgress += 1;
  if (state.missionProgress >= state.mission.target) {
    state.score += state.mission.reward * Math.max(1, Math.floor(state.combo));
    state.rage = clamp(state.rage + 35, 0, 100);
    floatText(0, 3.3, -5, `${state.mission.name} 完成`, "#54eba2", 1.15);
    chooseMission();
    beep(1040, .08, "triangle", .04);
  }
}

function addCombo(amount) {
  const before = Math.floor(state.combo);
  state.combo = clamp(state.combo + amount, 1, 12);
  state.comboTimer = 2.8;
  const after = Math.floor(state.combo);
  if (after > before && after >= 3) {
    floatText(0, 3.5, -6, `x${after}`, after >= 8 ? "#ff4268" : "#ffd13d", after >= 8 ? 1.25 : 1);
  }
}

function triggerSkill() {
  if (state.mode !== "running" || state.rage < 100) return;
  state.rage = 0;
  state.skill = 4.2;
  player.invincible = 4.2;
  state.slowMo = .16;
  state.shake = .42;
  floatText(player.x, 3.2, -2, "怒气爆发", "#ffd13d", 1.25);
  spawnBurst(courier.root.position, palette.yellow, 44, 1.3);
  beep(620, .09, "triangle", .05);
  setTimeout(() => beep(920, .07, "triangle", .04), 80);
}

function updateActors(dt) {
  courier.root.position.set(player.x, player.y, -.25);
  courier.root.rotation.z = player.lean * -.22;
  const targetScaleY = player.slide > 0 ? player.baseScale * .64 : player.baseScale;
  courier.root.scale.set(player.baseScale, lerp(courier.root.scale.y, targetScaleY, .18), player.baseScale);
  courier.root.position.y += player.slide > 0 ? -.08 : 0;
  courier.shield.visible = player.shield > 0 || player.invincible > 0 || state.skill > 0;
  courier.shield.material = state.skill > 0 ? materials.yellow : player.shield > 0 ? materials.green : materials.cyan;
  courier.shield.rotation.z += dt * 2.2;
  animateCourier(dt);

  thiefModel.root.position.set(thief.x, 0, thief.z);
  thiefModel.root.rotation.y = Math.sin(thief.sway) * .18;
  animateThief(dt);
}

function animateCourier() {
  const r = player.run;
  const leg = Math.sin(r) * .45;
  const arm = Math.sin(r + Math.PI) * .62;
  courier.leftLeg.rotation.x = leg;
  courier.rightLeg.rotation.x = -leg;
  courier.leftShoe.position.z = .15 + Math.sin(r) * .22;
  courier.rightShoe.position.z = .15 - Math.sin(r) * .22;
  courier.leftArm.rotation.x = arm;
  courier.rightArm.rotation.x = -arm;
  courier.bag.rotation.x = Math.sin(r * 1.8) * .035;
  courier.cap.position.y = 2.78 + Math.sin(r * 2) * .02;
}

function animateThief() {
  const r = state.distance * .22;
  thiefModel.leftLeg.rotation.x = Math.sin(r) * .5;
  thiefModel.rightLeg.rotation.x = -Math.sin(r) * .5;
  thiefModel.bag.rotation.z = Math.sin(r * 1.7) * .08;
}

function updateCamera(dt) {
  const shakeX = state.shake > 0 ? rand(-state.shake, state.shake) : 0;
  const shakeY = state.shake > 0 ? rand(-state.shake, state.shake) : 0;
  const targetPos = tmpVec.set(player.x * .14 + shakeX, 6.9 + shakeY, 17.5);
  camera.position.lerp(targetPos, 1 - Math.pow(.02, dt));
  const look = new THREE.Vector3(player.x * .12, 1.2, -34);
  camera.lookAt(look);
  camera.fov = lerp(camera.fov, state.skill > 0 ? 78 : 71, .05);
  camera.updateProjectionMatrix();
}

function updateParticles(dt) {
  for (const item of state.particles) {
    item.life -= dt;
    item.velocity.y -= 8 * dt;
    item.mesh.position.addScaledVector(item.velocity, dt);
    item.mesh.scale.multiplyScalar(1 - dt * .55);
    item.mesh.material.opacity = clamp(item.life / item.max, 0, 1);
  }
  state.particles = state.particles.filter(item => {
    if (item.life <= 0) {
      disposeObject(item.mesh);
      return false;
    }
    return true;
  });
}

function spawnBurst(origin, color, count, power) {
  for (let i = 0; i < count; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: .9,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(rand(.035, .09) * power, 8, 6), mat);
    mesh.position.copy(origin);
    mesh.position.y += rand(.4, 1.4);
    scene.add(mesh);
    const angle = rand(0, Math.PI * 2);
    const velocity = new THREE.Vector3(Math.cos(angle) * rand(1.5, 5) * power, rand(2, 7) * power, Math.sin(angle) * rand(1.5, 5) * power);
    state.particles.push({ mesh, velocity, life: rand(.45, .9), max: .9 });
  }
}

function floatText(x, y, z, text, color, scale = 1) {
  const sprite = makeTextSprite(text, color);
  sprite.position.set(x, y, z);
  sprite.scale.set(1.4 * scale, .48 * scale, 1);
  scene.add(sprite);
  state.floaters.push({ sprite, life: .78, max: .78, velocity: new THREE.Vector3(0, 1.5, -.25) });
}

function updateFloaters(dt) {
  for (const item of state.floaters) {
    item.life -= dt;
    item.sprite.position.addScaledVector(item.velocity, dt);
    item.sprite.material.opacity = clamp(item.life / item.max, 0, 1);
  }
  state.floaters = state.floaters.filter(item => {
    if (item.life <= 0) {
      disposeObject(item.sprite);
      return false;
    }
    return true;
  });
}

function render() {
  renderer.render(scene, camera);
}

function updateHud() {
  ui.score.textContent = String(Math.floor(state.score));
  ui.mobileScore.textContent = String(Math.floor(state.score));
  ui.combo.textContent = `x${Math.max(1, Math.floor(state.combo))}`;
  ui.distance.textContent = `${Math.floor(state.distance)}m`;
  ui.integrityFill.style.width = `${clamp(state.integrity, 0, 100)}%`;
  ui.rageFill.style.width = `${clamp(state.rage, 0, 100)}%`;
  ui.missionProgress.textContent = `${Math.min(state.missionProgress, state.mission.target)}/${state.mission.target}`;
  ui.riskText.textContent = `${getRiskMultiplier().toFixed(1)}x`;
  ui.skillCooldown.style.height = `${100 - clamp(state.rage, 0, 100)}%`;
}

function bindControls() {
  ui.startButton.addEventListener("click", () => {
    if (state.mode === "paused") togglePause();
    else resetGame();
  });
  ui.pauseButton.addEventListener("click", togglePause);
  ui.skillButton.addEventListener("click", triggerSkill);
  ui.soundButton.addEventListener("click", () => {
    state.sound = !state.sound;
    ui.soundButton.textContent = state.sound ? "♪" : "×";
    if (state.sound) {
      if (state.mode === "running") playTheme();
      beep(540, .05, "triangle", .03);
    } else {
      pauseTheme();
    }
  });

  const bindTouch = (id, action) => {
    document.getElementById(id).addEventListener("pointerdown", event => {
      event.preventDefault();
      action();
    });
  };
  bindTouch("touchLeft", moveLeft);
  bindTouch("touchRight", moveRight);
  bindTouch("touchJump", jump);
  bindTouch("touchSlide", slide);

  window.addEventListener("keydown", event => {
    if (event.repeat && event.code !== "Space") return;
    if (event.code === "ArrowLeft" || event.code === "KeyA") moveLeft();
    if (event.code === "ArrowRight" || event.code === "KeyD") moveRight();
    if (event.code === "ArrowUp" || event.code === "KeyW") jump();
    if (event.code === "ArrowDown" || event.code === "KeyS") slide();
    if (event.code === "Space") triggerSkill();
    if (event.code === "Enter") {
      if (state.mode === "paused") togglePause();
      else if (state.mode !== "running") resetGame();
    }
    if (event.code === "Escape" || event.code === "KeyP") togglePause();
  });

  canvas.addEventListener("pointerdown", event => {
    state.pointerStart = { x: event.clientX, y: event.clientY, t: performance.now() };
  });
  canvas.addEventListener("pointerup", event => {
    if (!state.pointerStart) return;
    const dx = event.clientX - state.pointerStart.x;
    const dy = event.clientY - state.pointerStart.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < 18 && performance.now() - state.pointerStart.t < 230) {
      if (state.mode !== "running") resetGame();
      else triggerSkill();
    } else if (ax > ay) {
      dx < 0 ? moveLeft() : moveRight();
    } else {
      dy < 0 ? jump() : slide();
    }
    state.pointerStart = null;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "running") togglePause();
  });
  window.addEventListener("resize", resize);
}

function moveLeft() {
  if (state.mode !== "running") return;
  if (player.lane > 0) {
    player.lane -= 1;
    player.lean = -1;
    spawnBurst(new THREE.Vector3(player.x, .25, .3), palette.cyan, 5, .45);
    beep(330, .035, "square", .02);
  }
}

function moveRight() {
  if (state.mode !== "running") return;
  if (player.lane < 2) {
    player.lane += 1;
    player.lean = 1;
    spawnBurst(new THREE.Vector3(player.x, .25, .3), palette.cyan, 5, .45);
    beep(365, .035, "square", .02);
  }
}

function jump() {
  if (state.mode !== "running") return;
  if (player.y <= .02 && player.slide <= 0) {
    player.vy = 13.6;
    player.y = .03;
    beep(620, .055, "triangle", .032);
  }
}

function slide() {
  if (state.mode !== "running") return;
  if (player.y <= .08) {
    player.slide = .62;
    state.slowMo = Math.max(state.slowMo, .035);
    beep(260, .05, "sawtooth", .028);
  }
}

function resize() {
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(state.dpr);
  renderer.setSize(state.width, state.height, false);
  camera.aspect = state.width / state.height;
  camera.updateProjectionMatrix();
}

function beep(freq, duration, type = "sine", gain = .035) {
  if (!state.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(.0001, audioCtx.currentTime);
    amp.gain.linearRampToValueAtTime(gain, audioCtx.currentTime + .01);
    amp.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + duration);
    osc.connect(amp);
    amp.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration + .04);
  } catch {
    state.sound = false;
  }
}

function playTheme() {
  if (!state.sound || state.mode !== "running") return;
  themeMusic.play().catch(() => {
    // Browsers require a user gesture before audio can start.
  });
}

function pauseTheme() {
  themeMusic.pause();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}
