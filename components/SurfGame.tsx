"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import styles from "./SurfGame.module.css";

// ---------- types ----------

type Kind =
  | "fish"
  | "fish2"
  | "shell"
  | "star"
  | "rock"
  | "wood"
  | "crate"
  | "buoy"
  | "fin"
  | "jelly"
  | "turbo"
  | "magnet"
  | "shield"
  | "slow"
  | "palm"
  | "island";

interface Obj {
  id: number;
  kind: Kind;
  lane: number; // -1|0|1 for gameplay, wider floats for scenery
  z: number; // meters ahead of the player
  bob: number;
  seed: number;
}

interface Ring {
  x: number;
  z: number;
  t: number; // 0..1 progress
  color: string;
}

interface GS {
  started: boolean;
  over: boolean;
  time: number;
  dist: number;
  rowDist: number;
  decoDist: number;
  score: number;
  level: number;
  playerLane: number;
  playerPos: number;
  turboT: number;
  magnetT: number;
  slowT: number;
  shield: boolean;
  invulnT: number;
  objs: Obj[];
  rings: Ring[];
  nextId: number;
  rev: number; // bumped whenever objs are added/removed
}

interface Hud {
  score: number;
  best: number;
  level: number;
  turbo: number;
  magnet: number;
  slow: number;
  shield: boolean;
  over: boolean;
  newBest: boolean;
  progress: number;
}

// ---------- constants ----------

const LANE_X = 2.3;
const SPAWN_Z = 78;
const ROW_GAP = 12;
const DECO_GAP = 7;
const OBSTACLES: Kind[] = ["rock", "wood", "crate", "buoy", "fin", "jelly"];
const COLLECTIBLES: Kind[] = ["fish", "fish2", "shell", "star"];
const POWERUPS: Kind[] = ["turbo", "magnet", "shield", "slow"];
const VALUE: Partial<Record<Kind, number>> = { fish: 1, fish2: 1, shell: 2, star: 3 };
const BEST_KEY = "surf-drive-best";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function makeScenery(st: GS, z: number): Obj {
  return {
    id: st.nextId++,
    kind: Math.random() < 0.2 ? "island" : "palm",
    lane: (Math.random() < 0.5 ? -1 : 1) * rnd(2.4, 3.8),
    z,
    bob: rnd(0, Math.PI * 2),
    seed: Math.random(),
  };
}

function initState(): GS {
  const st: GS = {
    started: false,
    over: false,
    time: 0,
    dist: 0,
    rowDist: 0,
    decoDist: 0,
    score: 0,
    level: 1,
    playerLane: 0,
    playerPos: 0,
    turboT: 0,
    magnetT: 0,
    slowT: 0,
    shield: false,
    invulnT: 0,
    objs: [],
    rings: [],
    nextId: 1,
    rev: 0,
  };
  // pre-populate side scenery so the water isn't empty on load
  for (let z = 8; z < SPAWN_Z; z += DECO_GAP) {
    st.objs.push(makeScenery(st, z + rnd(-2, 2)));
  }
  ([
    ["shell", -1, 18],
    ["fish2", 1, 22],
    ["turbo", 0, 27],
    ["crate", 1, 34],
    ["buoy", -1, 38],
    ["rock", 1, 46],
    ["fish", -1, 52],
    ["shield", 0, 58],
  ] as [Kind, number, number][]).forEach(([kind, lane, z]) => {
    st.objs.push({
      id: st.nextId++,
      kind,
      lane,
      z,
      bob: rnd(0, Math.PI * 2),
      seed: Math.random(),
    });
  });
  return st;
}

function spawnRow(st: GS) {
  const r = Math.random();
  if (r < 0.55) {
    const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
    const count = st.level >= 3 && Math.random() < 0.55 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      st.objs.push({
        id: st.nextId++, kind: pick(OBSTACLES), lane: lanes[i],
        z: SPAWN_Z, bob: rnd(0, Math.PI * 2), seed: Math.random(),
      });
    }
    if (Math.random() < 0.5) {
      st.objs.push({
        id: st.nextId++, kind: pick(COLLECTIBLES), lane: lanes[2],
        z: SPAWN_Z + rnd(0, 4), bob: rnd(0, Math.PI * 2), seed: Math.random(),
      });
    }
  } else if (r < 0.88) {
    const lane = pick([-1, 0, 1]);
    const kind = pick(COLLECTIBLES);
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      st.objs.push({
        id: st.nextId++, kind: Math.random() < 0.75 ? kind : pick(COLLECTIBLES),
        lane, z: SPAWN_Z + i * 3.1, bob: rnd(0, Math.PI * 2), seed: Math.random(),
      });
    }
  } else {
    st.objs.push({
      id: st.nextId++, kind: pick(POWERUPS), lane: pick([-1, 0, 1]),
      z: SPAWN_Z, bob: rnd(0, Math.PI * 2), seed: Math.random(),
    });
  }
  st.rev++;
}

function update(st: GS, dt: number, best: { v: number }) {
  st.rings.forEach((p) => (p.t += dt * 2.2));
  st.rings = st.rings.filter((p) => p.t < 1);
  st.time += dt;
  if (st.over || !st.started) return;

  st.level = Math.min(15, 1 + Math.floor(st.time / 18));

  let speed = 9 + st.level * 0.7;
  if (st.turboT > 0) speed *= 1.5;
  if (st.slowT > 0) speed *= 0.55;

  st.turboT = Math.max(0, st.turboT - dt);
  st.magnetT = Math.max(0, st.magnetT - dt);
  st.slowT = Math.max(0, st.slowT - dt);
  st.invulnT = Math.max(0, st.invulnT - dt);

  const dz = speed * dt;
  st.dist += dz;
  st.rowDist += dz;
  st.decoDist += dz;

  if (st.rowDist >= ROW_GAP) {
    st.rowDist = 0;
    spawnRow(st);
  }
  if (st.decoDist >= DECO_GAP) {
    st.decoDist = 0;
    st.objs.push(makeScenery(st, SPAWN_Z));
    st.rev++;
  }

  st.playerPos += (st.playerLane - st.playerPos) * Math.min(1, dt * 9);

  const mult = st.turboT > 0 ? 2 : 1;
  for (const o of st.objs) {
    o.z -= dz;
    if (st.magnetT > 0 && COLLECTIBLES.includes(o.kind) && o.z < 16 && o.z > 0) {
      o.lane += (st.playerPos - o.lane) * Math.min(1, dt * 6);
      o.z -= dz * 0.7;
    }
  }

  const keep: Obj[] = [];
  let removed = false;
  for (const o of st.objs) {
    let alive = o.z > -8;
    const gameplay = o.kind !== "palm" && o.kind !== "island";
    if (
      alive && gameplay &&
      o.z < 1.1 && o.z > -0.9 &&
      Math.abs(o.lane - st.playerPos) < 0.45
    ) {
      const x = st.playerPos * LANE_X;
      if (COLLECTIBLES.includes(o.kind)) {
        st.score += (VALUE[o.kind] || 1) * mult;
        st.rings.push({ x, z: 0, t: 0, color: "#ffe066" });
        alive = false;
      } else if (POWERUPS.includes(o.kind)) {
        if (o.kind === "turbo") st.turboT = 6;
        else if (o.kind === "magnet") st.magnetT = 7;
        else if (o.kind === "shield") st.shield = true;
        else if (o.kind === "slow") st.slowT = 5;
        st.rings.push({ x, z: 0, t: 0, color: "#7ce0ff" });
        alive = false;
      } else if (st.invulnT <= 0) {
        if (st.shield) {
          st.shield = false;
          st.invulnT = 1.5;
          st.rings.push({ x, z: 0, t: 0, color: "#21c8ff" });
          alive = false;
        } else {
          st.over = true;
          st.rings.push({ x, z: 0, t: 0, color: "#ffffff" });
          if (st.score > best.v) {
            best.v = st.score;
            localStorage.setItem(BEST_KEY, String(st.score));
          }
        }
      }
    }
    if (alive) keep.push(o);
    else removed = true;
  }
  st.objs = keep;
  if (removed) st.rev++;
}

// ---------- canvas textures (client only, cached) ----------

const texCache = new Map<string, THREE.Texture>();

function itemTexture(key: string, emoji: string, badge = false): THREE.Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  if (badge) {
    const rg = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    rg.addColorStop(0, "rgba(140,225,255,0.95)");
    rg.addColorStop(0.6, "rgba(140,225,255,0.35)");
    rg.addColorStop(1, "rgba(140,225,255,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#1a9be0";
    g.beginPath();
    g.arc(128, 128, 86, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = "#ffffff";
    g.stroke();
    g.font = "100px sans-serif";
  } else {
    const rg = g.createRadialGradient(128, 128, 10, 128, 128, 120);
    rg.addColorStop(0, "rgba(255,255,255,0.55)");
    rg.addColorStop(0.5, "rgba(255,255,255,0.12)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
    g.font = "150px sans-serif";
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, 128, badge ? 132 : 130);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

function woodTexture(): THREE.Texture {
  const hit = texCache.get("wood");
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b07f4a";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? "#a5713c" : "#b8874f";
    g.fillRect(0, i * 64, 256, 60);
    g.fillStyle = "rgba(90,55,20,0.5)";
    g.fillRect(0, i * 64 + 60, 256, 4);
  }
  g.strokeStyle = "#7c5426";
  g.lineWidth = 14;
  g.strokeRect(7, 7, 242, 242);
  g.fillStyle = "rgba(60,35,10,0.25)";
  for (let i = 0; i < 30; i++) g.fillRect(rnd(20, 230), rnd(10, 245), rnd(4, 20), 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set("wood", t);
  return t;
}

function softCircleTexture(): THREE.Texture {
  const hit = texCache.get("soft");
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.6, "rgba(255,255,255,0.7)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  texCache.set("soft", t);
  return t;
}

function ringTexture(): THREE.Texture {
  const hit = texCache.get("ring");
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,1)";
  g.lineWidth = 10;
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  texCache.set("ring", t);
  return t;
}

const EMOJI_SPRITE: Partial<Record<Kind, string>> = {
  fish: "🐟", fish2: "🐠", shell: "🐚", star: "⭐",
  turbo: "⚡", magnet: "🧲", shield: "🛡️", slow: "🌊",
};

// ---------- water shader ----------

const WATER_VS = /* glsl */ `
uniform float uTime;
uniform float uScroll;
varying vec2 vXZ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float ahead = -w.z;
  w.y += sin(w.x * 0.7 + uTime * 1.8) * 0.05
       + sin((ahead + uScroll) * 0.55 + uTime * 0.6) * 0.07;
  vXZ = vec2(w.x, ahead);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const WATER_FS = /* glsl */ `
precision highp float;
varying vec2 vXZ;
uniform float uTime;
uniform float uScroll;
uniform float uPlayerX;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  float x = vXZ.x;
  float z = vXZ.y;
  float s = z + uScroll;
  vec3 deep = vec3(0.04, 0.36, 0.70);
  vec3 mid  = vec3(0.12, 0.58, 0.88);
  vec3 farc = vec3(0.68, 0.90, 0.97);
  float df = clamp(z / 85.0, 0.0, 1.0);
  float body = fbm(vec2(x * 0.22, s * 0.10) + uTime * 0.03) * 0.5 + 0.25;
  vec3 col = mix(deep, mid, body);
  col = mix(col, farc, df * df);
  col += (fbm(vec2(x * 0.9, s * 0.5)) - 0.5) * 0.06;
  float sp = pow(noise(vec2(x * 4.0 + uTime * 0.7, s * 2.2)), 14.0);
  col += sp * 1.2 * (0.2 + 0.8 * df);
  float foam = 0.0;
  for (int i = -1; i <= 1; i++) {
    float lx = float(i) * 2.3;
    float band = smoothstep(0.95, 0.2, abs(x - lx));
    float tex = fbm(vec2(x * 1.6 + float(i) * 13.1, s * 0.85));
    foam += band * (0.22 + 0.78 * smoothstep(0.35, 0.75, tex));
  }
  float wz = -z;
  if (wz > -0.2 && wz < 7.0) {
    float half_ = 0.28 + wz * 0.24;
    float wband = smoothstep(half_, half_ * 0.3, abs(x - uPlayerX));
    float wtex = fbm(vec2(x * 2.2, s * 1.4));
    foam += wband * (0.4 + 0.6 * smoothstep(0.3, 0.72, wtex)) * smoothstep(7.0, 0.5, wz);
  }
  foam = clamp(foam, 0.0, 1.0);
  col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.85);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- sky shader ----------

const SKY_VS = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FS = /* glsl */ `
varying vec3 vPos;
void main() {
  float h = normalize(vPos).y;
  vec3 top = vec3(0.15, 0.55, 0.92);
  vec3 hor = vec3(0.80, 0.94, 1.0);
  vec3 col = mix(hor, top, smoothstep(-0.02, 0.4, h));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- scenery / obstacle meshes ----------

function Palm({ seed }: { seed: number }) {
  const lean = (seed - 0.5) * 0.5;
  const h = 2.2 + seed * 1.2;
  const leaves = useMemo(() => {
    const arr: { rot: number; tilt: number }[] = [];
    for (let i = 0; i < 6; i++)
      arr.push({ rot: (i / 6) * Math.PI * 2 + seed * 7, tilt: 0.9 + (i % 3) * 0.12 });
    return arr;
  }, [seed]);
  return (
    <group rotation={[0, 0, lean]}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.09, 0.16, h, 6]} />
        <meshStandardMaterial color="#8a5a33" roughness={0.9} />
      </mesh>
      {leaves.map((l, i) => (
        <group key={i} position={[0, h, 0]} rotation={[0, l.rot, 0]}>
          <mesh position={[0.62, 0.08, 0]} rotation={[0, 0, -l.tilt]} scale={[1, 0.22, 0.5]}>
            <coneGeometry args={[0.5, 1.5, 5]} />
            <meshStandardMaterial color="#2f9e44" roughness={0.8} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, h + 0.05, 0]}>
        <sphereGeometry args={[0.14, 8, 6]} />
        <meshStandardMaterial color="#5c8a1e" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Island({ seed }: { seed: number }) {
  return (
    <group>
      <mesh position={[0, -0.55, 0]} scale={[2.6 + seed * 2, 0.9, 2.2]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#e9d8a6" roughness={1} />
      </mesh>
      <mesh position={[0.4, -0.15, -0.3]} scale={[1.5, 0.8, 1.3]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#2d9d4f" roughness={0.9} />
      </mesh>
      <group position={[-0.6, 0.1, 0.3]} scale={0.8}>
        <Palm seed={seed} />
      </group>
      <group position={[0.9, 0.2, 0.5]} scale={0.65}>
        <Palm seed={1 - seed} />
      </group>
    </group>
  );
}

function FoamRing({ r }: { r: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
      <ringGeometry args={[r * 0.82, r, 24]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
}

function Rock({ seed }: { seed: number }) {
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(0.85, 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = 1 + Math.sin(seed * 1000 + i * 37.7) * 0.18;
      pos.setXYZ(
        i,
        pos.getX(i) * k,
        pos.getY(i) * (0.75 + 0.2 * Math.sin(i * 3 + seed * 20)),
        pos.getZ(i) * k
      );
    }
    g.computeVertexNormals();
    return g;
  }, [seed]);
  return (
    <group>
      <mesh geometry={geo} position={[0, 0.05, 0]} rotation={[0, seed * 6, 0]}>
        <meshStandardMaterial color="#48535e" roughness={0.95} flatShading />
      </mesh>
      <mesh geometry={geo} position={[0.55, -0.15, 0.3]} scale={0.5} rotation={[0, seed * 9, 0]}>
        <meshStandardMaterial color="#3d4750" roughness={0.95} flatShading />
      </mesh>
      <FoamRing r={1.15} />
    </group>
  );
}

function Crate() {
  const tex = useMemo(() => woodTexture(), []);
  return (
    <group>
      <mesh position={[0, 0.42, 0]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[1.15, 1.15, 1.15]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
      <FoamRing r={1.05} />
    </group>
  );
}

function Log() {
  return (
    <group>
      <mesh position={[0, 0.14, 0]} rotation={[0, 0.15, Math.PI / 2]}>
        <cylinderGeometry args={[0.26, 0.3, 2.3, 10]} />
        <meshStandardMaterial color="#7d4f2a" roughness={0.95} />
      </mesh>
      <FoamRing r={1.0} />
    </group>
  );
}

function Buoy() {
  return (
    <group>
      <mesh position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.5, 20, 16]} />
        <meshStandardMaterial color="#e63946" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.49, 0.09, 10, 24]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 0.35, 8]} />
        <meshStandardMaterial color="#c1121f" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color="#ffd60a" emissive="#ffb703" emissiveIntensity={0.6} />
      </mesh>
      <FoamRing r={0.75} />
    </group>
  );
}

function SharkFin() {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.45, 0);
    s.quadraticCurveTo(-0.2, 0.55, 0.02, 0.95);
    s.quadraticCurveTo(0.28, 0.55, 0.5, 0.05);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2,
    });
  }, []);
  return (
    <group>
      <mesh geometry={geo} position={[0, 0, -0.07]}>
        <meshStandardMaterial color="#4f6272" roughness={0.5} />
      </mesh>
      <FoamRing r={0.7} />
    </group>
  );
}

function Jelly() {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#ff9fce" transparent opacity={0.8}
          emissive="#ff6bb3" emissiveIntensity={0.45} roughness={0.3}
        />
      </mesh>
      {[-0.2, -0.05, 0.1, 0.25].map((x, i) => (
        <mesh key={i} position={[x, 0.28, 0.05 * (i % 2 ? 1 : -1)]}>
          <cylinderGeometry args={[0.02, 0.015, 0.5, 5]} />
          <meshStandardMaterial color="#ffb3da" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function BlobShadow({ r }: { r: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <circleGeometry args={[r, 20]} />
      <meshBasicMaterial color="#03304f" transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

function ItemSprite({ kind }: { kind: Kind }) {
  const isPower = POWERUPS.includes(kind);
  const tex = useMemo(
    () => itemTexture(kind, EMOJI_SPRITE[kind] || "❓", isPower),
    [kind, isPower]
  );
  return (
    <>
      <sprite position={[0, isPower ? 1.0 : 0.7, 0]} scale={isPower ? [1.7, 1.7, 1] : [1.15, 1.15, 1]}>
        <spriteMaterial map={tex} transparent depthWrite={false} />
      </sprite>
      <BlobShadow r={isPower ? 0.5 : 0.35} />
    </>
  );
}

function ObjView({ o, reg }: { o: Obj; reg: (id: number, g: THREE.Group | null) => void }) {
  let body: React.ReactNode;
  switch (o.kind) {
    case "rock": body = <Rock seed={o.seed} />; break;
    case "crate": body = <Crate />; break;
    case "wood": body = <Log />; break;
    case "buoy": body = <Buoy />; break;
    case "fin": body = <SharkFin />; break;
    case "jelly": body = <Jelly />; break;
    case "palm": body = <Palm seed={o.seed} />; break;
    case "island": body = <Island seed={o.seed} />; break;
    default: body = <ItemSprite kind={o.kind} />;
  }
  return <group ref={(g) => reg(o.id, g)}>{body}</group>;
}

// ---------- surfer ----------

const SKIN = "#d99a62";
const SKIN_DARK = "#c4854a";

function Surfer({ groupRef, boardRef, bodyRef }: {
  groupRef: React.RefObject<THREE.Group | null>;
  boardRef: React.RefObject<THREE.Group | null>;
  bodyRef: React.RefObject<THREE.Group | null>;
}) {
  const boardGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.85);
    s.bezierCurveTo(0.14, -0.7, 0.21, -0.2, 0.2, 0.15);
    s.bezierCurveTo(0.19, 0.5, 0.12, 0.72, 0, 0.72);
    s.bezierCurveTo(-0.12, 0.72, -0.19, 0.5, -0.2, 0.15);
    s.bezierCurveTo(-0.21, -0.2, -0.14, -0.7, 0, -0.85);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.07, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 2,
    });
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const stripeGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.78);
    s.bezierCurveTo(0.05, -0.6, 0.065, -0.2, 0.06, 0.15);
    s.bezierCurveTo(0.055, 0.45, 0.03, 0.62, 0, 0.62);
    s.bezierCurveTo(-0.03, 0.62, -0.055, 0.45, -0.06, 0.15);
    s.bezierCurveTo(-0.065, -0.2, -0.05, -0.6, 0, -0.78);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    return g;
  }, []);

  return (
    <group ref={groupRef}>
      <BlobShadow r={0.55} />
      <group ref={boardRef}>
        <mesh geometry={boardGeo} position={[0, 0.12, 0]}>
          <meshStandardMaterial color="#f7efdc" roughness={0.35} />
        </mesh>
        <mesh geometry={stripeGeo} position={[0, 0.155, 0]}>
          <meshStandardMaterial color="#f28a1e" roughness={0.4} />
        </mesh>
        <group ref={bodyRef} position={[0, 0.16, 0.1]}>
          {/* legs */}
          <mesh position={[-0.1, 0.18, 0.02]} rotation={[0.18, 0, 0.08]}>
            <capsuleGeometry args={[0.05, 0.26, 4, 8]} />
            <meshStandardMaterial color={SKIN_DARK} roughness={0.7} />
          </mesh>
          <mesh position={[0.1, 0.18, -0.05]} rotation={[-0.15, 0, -0.08]}>
            <capsuleGeometry args={[0.05, 0.26, 4, 8]} />
            <meshStandardMaterial color={SKIN_DARK} roughness={0.7} />
          </mesh>
          {/* feet */}
          <mesh position={[-0.11, 0.02, 0.06]} scale={[1, 0.5, 1.7]}>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshStandardMaterial color={SKIN_DARK} roughness={0.7} />
          </mesh>
          <mesh position={[0.11, 0.02, -0.08]} scale={[1, 0.5, 1.7]}>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshStandardMaterial color={SKIN_DARK} roughness={0.7} />
          </mesh>
          {/* board shorts */}
          <mesh position={[0, 0.38, -0.01]}>
            <boxGeometry args={[0.26, 0.16, 0.17]} />
            <meshStandardMaterial color="#f2762e" roughness={0.7} />
          </mesh>
          <mesh position={[-0.075, 0.3, -0.01]}>
            <cylinderGeometry args={[0.062, 0.068, 0.1, 8]} />
            <meshStandardMaterial color="#e05f1f" roughness={0.7} />
          </mesh>
          <mesh position={[0.075, 0.3, -0.01]}>
            <cylinderGeometry args={[0.062, 0.068, 0.1, 8]} />
            <meshStandardMaterial color="#e05f1f" roughness={0.7} />
          </mesh>
          {/* torso */}
          <mesh position={[0, 0.6, 0]}>
            <capsuleGeometry args={[0.115, 0.24, 4, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </mesh>
          {/* arms: spread nearly horizontal for balance */}
          <mesh position={[-0.23, 0.7, 0]} rotation={[0, 0, 1.35]}>
            <capsuleGeometry args={[0.04, 0.2, 4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </mesh>
          <mesh position={[0.23, 0.7, 0]} rotation={[0, 0, -1.35]}>
            <capsuleGeometry args={[0.04, 0.2, 4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </mesh>
          <mesh position={[-0.41, 0.73, 0]} rotation={[0, 0, 1.1]}>
            <capsuleGeometry args={[0.035, 0.16, 4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </mesh>
          <mesh position={[0.41, 0.73, 0]} rotation={[0, 0, -1.1]}>
            <capsuleGeometry args={[0.035, 0.16, 4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </mesh>
          <mesh position={[-0.5, 0.76, 0]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </mesh>
          <mesh position={[0.5, 0.76, 0]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </mesh>
          {/* head + hair */}
          <mesh position={[0, 0.86, 0]}>
            <sphereGeometry args={[0.105, 16, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.895, -0.01]} scale={[1.06, 0.82, 1.06]}>
            <sphereGeometry args={[0.105, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial color="#5f3d1f" roughness={0.8} />
          </mesh>
          {([[-0.03, 0.985, 0.02, 0.3], [0.02, 1.0, -0.01, -0.2], [0.06, 0.975, 0.01, 0.5]] as const).map(
            ([x, y, z, r], i) => (
              <mesh key={i} position={[x, y, z]} rotation={[0, 0, r]}>
                <coneGeometry args={[0.028, 0.07, 5]} />
                <meshStandardMaterial color="#6b4423" roughness={0.8} />
              </mesh>
            )
          )}
        </group>
      </group>
    </group>
  );
}

// ---------- spray particles ----------

const SPRAY_N = 90;

function Spray({ dataRef }: { dataRef: React.RefObject<Float32Array> }) {
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const tex = useMemo(() => softCircleTexture(), []);
  const positions = useMemo(() => new Float32Array(SPRAY_N * 3).fill(-100), []);
  useFrame(() => {
    if (!geoRef.current || !dataRef.current) return;
    const d = dataRef.current;
    for (let i = 0; i < SPRAY_N; i++) {
      positions[i * 3] = d[i * 6];
      positions[i * 3 + 1] = d[i * 6 + 1];
      positions[i * 3 + 2] = d[i * 6 + 2];
    }
    const attr = geoRef.current.attributes.position as THREE.BufferAttribute;
    if (attr) attr.needsUpdate = true;
  });
  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={tex} size={0.22} transparent opacity={0.85}
        depthWrite={false} sizeAttenuation color="#ffffff"
      />
    </points>
  );
}

// ---------- clouds ----------

function Clouds() {
  const tex = useMemo(() => softCircleTexture(), []);
  const clouds: [number, number, number, number][] = [
    [-14, 9, -70, 9], [10, 12, -80, 12], [3, 8, -60, 6], [-6, 11, -85, 8],
  ];
  return (
    <>
      {clouds.map(([x, y, z, s], i) => (
        <sprite key={i} position={[x, y, z]} scale={[s, s * 0.38, 1]}>
          <spriteMaterial map={tex} transparent opacity={0.9} color="#ffffff" depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}

// ---------- scene ----------

function Scene({ stRef, bestRef, onHud }: {
  stRef: React.RefObject<GS>;
  bestRef: React.RefObject<{ v: number }>;
  onHud: (h: Hud) => void;
}) {
  const { camera } = useThree();
  const [, setV] = useState(0);
  const lastRev = useRef(-1);
  const refs = useRef(new Map<number, THREE.Group>());
  const playerRef = useRef<THREE.Group>(null);
  const boardRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const shieldRef = useRef<THREE.Mesh>(null);
  const waterMat = useRef<THREE.ShaderMaterial>(null);
  const hudJson = useRef("");
  const spray = useRef(new Float32Array(SPRAY_N * 6).fill(-100));
  const sprayIdx = useRef(0);
  const ringRefs = useRef<(THREE.Sprite | null)[]>([]);
  const ringTex = useMemo(() => ringTexture(), []);

  const waterUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uScroll: { value: 0 }, uPlayerX: { value: 0 } }),
    []
  );

  const reg = (id: number, g: THREE.Group | null) => {
    if (g) refs.current.set(id, g);
    else refs.current.delete(id);
  };

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    const st = stRef.current;
    const best = bestRef.current;
    update(st, dt, best);

    if (st.rev !== lastRev.current) {
      lastRev.current = st.rev;
      setV((v) => v + 1);
    }

    // objects
    for (const o of st.objs) {
      const g = refs.current.get(o.id);
      if (!g) continue;
      const x = o.lane * LANE_X;
      let y = 0;
      if (o.kind === "crate" || o.kind === "buoy")
        y = Math.sin(st.time * 2.2 + o.bob) * 0.08;
      if (o.kind === "jelly")
        y = 0.15 + Math.sin(st.time * 3 + o.bob) * 0.14;
      if (COLLECTIBLES.includes(o.kind) || POWERUPS.includes(o.kind))
        y = Math.sin(st.time * 2.6 + o.bob) * 0.1;
      g.position.set(x, y, -o.z);
      if (o.kind === "fin") g.rotation.y = Math.sin(st.time * 1.5 + o.bob) * 0.3;
    }

    // player
    const px = st.playerPos * LANE_X;
    const tilt = st.playerLane - st.playerPos;
    if (playerRef.current) {
      playerRef.current.position.set(px, Math.sin(st.time * 3.1) * 0.05, 0);
      playerRef.current.visible = !(st.invulnT > 0 && Math.floor(st.time * 10) % 2 === 0);
    }
    if (boardRef.current) {
      boardRef.current.rotation.z = -tilt * 0.55;
      boardRef.current.rotation.y = -tilt * 0.35;
      boardRef.current.rotation.x = Math.sin(st.time * 2.2) * 0.045 - 0.02;
    }
    if (bodyRef.current) bodyRef.current.rotation.z = -tilt * 0.35;
    if (shieldRef.current) {
      shieldRef.current.visible = st.shield;
      shieldRef.current.position.set(px, 0.55, 0);
      shieldRef.current.scale.setScalar(1 + Math.sin(st.time * 5) * 0.04);
    }

    // spray
    const alive = st.started && !st.over ? 1 : 0.25;
    const d = spray.current;
    for (let s = 0; s < 3; s++) {
      const i = sprayIdx.current;
      sprayIdx.current = (sprayIdx.current + 1) % SPRAY_N;
      d[i * 6] = px + rnd(-0.25, 0.25);
      d[i * 6 + 1] = 0.08;
      d[i * 6 + 2] = rnd(0.5, 0.9);
      d[i * 6 + 3] = rnd(-0.8, 0.8);
      d[i * 6 + 4] = rnd(0.8, 2.6) * alive;
      d[i * 6 + 5] = rnd(1.5, 4.5) * alive;
    }
    for (let i = 0; i < SPRAY_N; i++) {
      d[i * 6] += d[i * 6 + 3] * dt;
      d[i * 6 + 1] += d[i * 6 + 4] * dt;
      d[i * 6 + 2] += d[i * 6 + 5] * dt;
      d[i * 6 + 4] -= 6 * dt;
      if (d[i * 6 + 1] < -0.3) d[i * 6 + 1] = -100;
    }

    // collect rings
    for (let i = 0; i < 6; i++) {
      const spr = ringRefs.current[i];
      if (!spr) continue;
      const r = st.rings[i];
      if (r) {
        spr.visible = true;
        spr.position.set(r.x, 0.6 + r.t * 0.8, -r.z);
        const sc = 0.5 + r.t * 2.2;
        spr.scale.set(sc, sc, 1);
        (spr.material as THREE.SpriteMaterial).opacity = 1 - r.t;
        (spr.material as THREE.SpriteMaterial).color.set(r.color);
      } else {
        spr.visible = false;
      }
    }

    // water + camera
    if (waterMat.current) {
      waterMat.current.uniforms.uTime.value = st.time;
      waterMat.current.uniforms.uScroll.value = st.dist;
      waterMat.current.uniforms.uPlayerX.value = px;
    }
    camera.position.set(px * 0.45, 3.4, 6.2);
    camera.lookAt(px * 0.6, 0.25, -14);

    // HUD
    const next: Hud = {
      score: st.score,
      best: best.v,
      level: st.level,
      turbo: Math.ceil(st.turboT),
      magnet: Math.ceil(st.magnetT),
      slow: Math.ceil(st.slowT),
      shield: st.shield,
      over: st.over,
      newBest: st.over && st.score > 0 && st.score >= best.v,
      progress: (st.dist % 160) / 160,
    };
    const json = JSON.stringify(next);
    if (json !== hudJson.current) {
      hudJson.current = json;
      onHud(next);
    }
  });

  const st = stRef.current;

  return (
    <>
      <fog attach="fog" args={["#c9ecfa", 40, 95]} />
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#bfe9ff", "#1f97e0", 0.5]} />
      <directionalLight position={[6, 12, 5]} intensity={1.6} color="#fff6e0" />

      {/* sky dome */}
      <mesh>
        <sphereGeometry args={[180, 24, 16]} />
        <shaderMaterial vertexShader={SKY_VS} fragmentShader={SKY_FS} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      <Clouds />

      {/* water */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -49]}>
        <planeGeometry args={[36, 130, 48, 160]} />
        <shaderMaterial
          ref={waterMat}
          vertexShader={WATER_VS}
          fragmentShader={WATER_FS}
          uniforms={waterUniforms}
        />
      </mesh>

      {/* far islands */}
      <group position={[-13, 0, -72]} scale={2.2}><Island seed={0.3} /></group>
      <group position={[14, 0, -78]} scale={2.6}><Island seed={0.7} /></group>

      {/* world objects */}
      {st.objs.map((o) => (
        <ObjView key={o.id} o={o} reg={reg} />
      ))}

      {/* player */}
      <Surfer groupRef={playerRef} boardRef={boardRef} bodyRef={bodyRef} />
      <mesh ref={shieldRef} visible={false}>
        <sphereGeometry args={[0.95, 20, 14]} />
        <meshStandardMaterial
          color="#21c8ff" transparent opacity={0.18}
          emissive="#21c8ff" emissiveIntensity={0.5} depthWrite={false}
        />
      </mesh>

      <Spray dataRef={spray} />

      {/* collect ring pool */}
      {Array.from({ length: 6 }).map((_, i) => (
        <sprite key={i} ref={(s) => { ringRefs.current[i] = s; }} visible={false}>
          <spriteMaterial map={ringTex} transparent depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}

// ---------- main component ----------

export default function SurfGame() {
  const stRef = useRef<GS>(initState());
  const bestRef = useRef({ v: 0 });
  const [hud, setHud] = useState<Hud>({
    score: 0, best: 0, level: 1, turbo: 0, magnet: 0, slow: 0,
    shield: false, over: false, newBest: false, progress: 0,
  });
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    bestRef.current.v = Number(localStorage.getItem(BEST_KEY) || 0);
  }, []);

  const restart = () => {
    stRef.current = initState();
    setShowHint(true);
  };

  const move = (dir: -1 | 1) => {
    const st = stRef.current;
    if (st.over) return;
    if (!st.started) {
      st.started = true;
      setShowHint(false);
      return;
    }
    st.playerLane = Math.max(-1, Math.min(1, st.playerLane + dir));
    setShowHint(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") move(-1);
      else if (e.key === "ArrowRight" || e.key === "d") move(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const px0 = useRef(0);
  const pDown = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    px0.current = e.clientX;
    pDown.current = true;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!pDown.current) return;
    pDown.current = false;
    const dx = e.clientX - px0.current;
    if (Math.abs(dx) > 24) move(dx > 0 ? 1 : -1);
    else {
      const bounds = e.currentTarget.getBoundingClientRect();
      move(e.clientX > bounds.left + bounds.width / 2 ? 1 : -1);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.stage} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <Canvas
          className={styles.canvas}
          dpr={[1, 2]}
          camera={{ fov: 60, near: 0.1, far: 400, position: [0, 3.1, 5.4] }}
          gl={{ antialias: true }}
        >
          <Scene stRef={stRef} bestRef={bestRef} onHud={setHud} />
        </Canvas>

        <div className={styles.hud}>
          <div className={styles.topRow}>
            <div className={styles.score}>
              <div className={styles.scoreMain}>${hud.score}</div>
              <div className={styles.scoreBest}>BEST ${Math.max(570, hud.best)}</div>
            </div>
            <div className={styles.centerTop}>
              <div className={styles.waveMeter}>
                <span className={styles.waveIcon}>🌊</span>
                <span className={styles.waveTrack}>
                  <span
                    className={styles.waveFill}
                    style={{ width: `${18 + hud.progress * 68}%` }}
                  />
                </span>
              </div>
            </div>
            <div className={styles.rightCol}>
              <div className={`${styles.pill} ${styles.pillTurbo}`}>⚡ TURBO x2</div>
              <div className={`${styles.pill} ${styles.pillLevel}`}>
                🔥 <span>LEVEL {hud.level}</span>
              </div>
            </div>
          </div>

          <div className={styles.banner}>🏁 SURF DRIVE — survive as long as you can</div>

          {(hud.turbo > 0 || hud.magnet > 0 || hud.shield || hud.slow > 0) && (
            <div className={styles.powerRow}>
              {hud.turbo > 0 && <div className={`${styles.powerChip} ${styles.pillTurbo}`}>⚡ {hud.turbo}s</div>}
              {hud.magnet > 0 && <div className={`${styles.powerChip} ${styles.pillMagnet}`}>🧲 MAGNET {hud.magnet}s</div>}
              {hud.shield && <div className={`${styles.powerChip} ${styles.pillShield}`}>🛡️ SHIELD</div>}
              {hud.slow > 0 && <div className={`${styles.powerChip} ${styles.pillSlow}`}>🌊 SLOW {hud.slow}s</div>}
            </div>
          )}

          {showHint && !hud.over && (
            <div className={styles.hint}>
              <div className={styles.hintHand}>☝</div>
              <div className={styles.hintCopy}>
                <div className={styles.hintArrows}>← →</div>
                <div>SWIPE LEFT / RIGHT</div>
                <div className={styles.hintSub}>to change lanes</div>
              </div>
            </div>
          )}

          {hud.over && (
            <div className={styles.overlay}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>WIPEOUT!</div>
                <div className={styles.cardEmoji}>🏄🌊</div>
                <div className={styles.cardScoreLabel}>SHELLS COLLECTED</div>
                <div className={styles.cardScore}>${hud.score}</div>
                <div className={styles.cardBest}>BEST ${Math.max(570, hud.best)}</div>
                {hud.newBest && <div className={styles.newBest}>🎉 NEW BEST!</div>}
                <button className={styles.restart} onClick={restart}>🔄 RESTART</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
