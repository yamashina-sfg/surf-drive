"use client";

// ---------- shared 3D game engine ----------
//
// ゲーム状態・スポーン・水/空シェーダー・3Dメッシュ・Sceneコンポーネントをここに集約する。
// SurfGame（実プレイ画面）と IdleBackdrop（メニュー背景）の両方から利用する。

import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { BoardConfig } from "./boards";

// ---------- types ----------

export type Kind =
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

export interface Obj {
  id: number;
  kind: Kind;
  lane: number; // -1|0|1 for gameplay, wider floats for scenery
  z: number; // meters ahead of the player
  bob: number;
  seed: number;
}

export interface Ring {
  x: number;
  z: number;
  t: number; // 0..1 progress
  color: string;
}

export interface LaneCarve {
  dir: -1 | 1;
  from: number;
  to: number;
  at: number;
}

export interface GS {
  started: boolean;
  countdownT: number;
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
  levelUpFlashAt: number; // st.time のタイムスタンプ。0以下なら非表示
  pickupBanner: { kind: Kind; at: number } | null;
  hitBurst: { x: number; at: number } | null;
  laneCarve: LaneCarve | null;
  patternQueue: PatternRow[];
  lastSafeLane: number;
}

export interface Hud {
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
  levelUp: boolean;
  pickup: Kind | null;
  countdown: "3" | "2" | "1" | "SURF!" | null;
  speedFactor: number;
  scoreMultiplier: number;
}

// ---------- constants ----------

export const LANE_X = 2.3;
export const SPAWN_Z = 62;
export const DECO_GAP = 7;
export const OBSTACLES: Kind[] = ["rock", "wood", "crate", "buoy", "fin", "jelly"];
export const COLLECTIBLES: Kind[] = ["fish", "fish2", "shell", "star"];
export const POWERUPS: Kind[] = ["turbo", "magnet", "shield", "slow"];
export const VALUE: Partial<Record<Kind, number>> = { fish: 1, fish2: 1, shell: 2, star: 3 };
export const BEST_KEY = "surf-drive-best";

export type DifficultyTier = "easy" | "medium" | "hard" | "extreme";
type PatternRow = {
  safeLane: number;
  obstacles: number[];
  collectibleLane?: number;
  powerup?: Kind;
};

type ObstaclePattern = {
  name: string;
  tier: DifficultyTier;
  rows: PatternRow[];
};

const LEVEL_STARTS = [0, 15, 30, 48, 68, 90, 114, 140, 168, 198, 230, 264, 300, 338, 378];
const SPEED_FACTORS = [1, 1.18, 1.38, 1.62, 1.9, 2.2, 2.5, 2.82, 3.12, 3.4, 3.66, 3.9, 4.12, 4.32, 4.5];
const SCORE_FACTORS = [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5];

const PATTERNS: ObstaclePattern[] = [
  { name: "A-center-gate", tier: "easy", rows: [{ safeLane: 0, obstacles: [-1, 1], collectibleLane: 0 }] },
  { name: "B-left-gate", tier: "easy", rows: [{ safeLane: -1, obstacles: [0, 1], collectibleLane: -1 }] },
  { name: "C-right-gate", tier: "easy", rows: [{ safeLane: 1, obstacles: [-1, 0], collectibleLane: 1 }] },
  { name: "D-center-to-right", tier: "medium", rows: [
    { safeLane: 0, obstacles: [-1, 1], collectibleLane: 0 },
    { safeLane: 1, obstacles: [-1, 0], collectibleLane: 1 },
  ] },
  { name: "E-baited-item-line", tier: "medium", rows: [
    { safeLane: -1, obstacles: [1], collectibleLane: 0 },
    { safeLane: 1, obstacles: [-1, 0], collectibleLane: 1 },
  ] },
  { name: "F-switchback", tier: "hard", rows: [
    { safeLane: -1, obstacles: [0, 1], collectibleLane: -1 },
    { safeLane: 1, obstacles: [-1, 0], collectibleLane: 1 },
    { safeLane: -1, obstacles: [0, 1], collectibleLane: -1 },
  ] },
  { name: "G-feint", tier: "hard", rows: [
    { safeLane: 0, obstacles: [-1], collectibleLane: 1 },
    { safeLane: 0, obstacles: [-1, 1], collectibleLane: 0 },
    { safeLane: 1, obstacles: [-1, 0], collectibleLane: 1 },
  ] },
  { name: "Extreme-slalom", tier: "extreme", rows: [
    { safeLane: -1, obstacles: [0, 1], collectibleLane: -1 },
    { safeLane: 0, obstacles: [-1, 1], collectibleLane: 0 },
    { safeLane: 1, obstacles: [-1, 0], collectibleLane: 1 },
    { safeLane: 0, obstacles: [-1, 1], collectibleLane: 0 },
  ] },
  { name: "Extreme-power-risk", tier: "extreme", rows: [
    { safeLane: 1, obstacles: [-1, 0], powerup: "turbo" },
    { safeLane: -1, obstacles: [0, 1], collectibleLane: -1 },
    { safeLane: 1, obstacles: [-1, 0], collectibleLane: 1 },
  ] },
];

export function levelAt(time: number): number {
  let level = 1;
  while (level < LEVEL_STARTS.length && time >= LEVEL_STARTS[level]) level++;
  return level;
}

export function speedFactorForLevel(level: number): number {
  return SPEED_FACTORS[Math.min(SPEED_FACTORS.length, Math.max(1, level)) - 1];
}

export function scoreFactorForLevel(level: number): number {
  return SCORE_FACTORS[Math.min(SCORE_FACTORS.length, Math.max(1, level)) - 1];
}

function tierForLevel(level: number): DifficultyTier {
  if (level <= 2) return "easy";
  if (level <= 4) return "medium";
  if (level <= 6) return "hard";
  return "extreme";
}

function rowGapForLevel(level: number): number {
  return Math.max(7.8, 11.8 - (level - 1) * 0.48);
}

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

export function initState(): GS {
  const st: GS = {
    started: false,
    countdownT: 0,
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
    levelUpFlashAt: -1,
    pickupBanner: null,
    hitBurst: null,
    laneCarve: null,
    patternQueue: [],
    lastSafeLane: 0,
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
  if (st.patternQueue.length === 0) {
    const tier = tierForLevel(st.level);
    const allowed: DifficultyTier[] = tier === "easy" ? ["easy"]
      : tier === "medium" ? ["easy", "medium"]
        : tier === "hard" ? ["medium", "hard"] : ["hard", "extreme"];
    const pattern = pick(PATTERNS.filter((candidate) => allowed.includes(candidate.tier)));
    st.patternQueue = pattern.rows.map((row) => ({ ...row, obstacles: [...row.obstacles] }));
  }

  const row = st.patternQueue.shift()!;
  st.lastSafeLane = row.safeLane;
  row.obstacles.slice(0, 2).forEach((lane) => {
    st.objs.push({
      id: st.nextId++, kind: pick(OBSTACLES), lane,
      z: SPAWN_Z, bob: rnd(0, Math.PI * 2), seed: Math.random(),
    });
  });
  if (row.powerup) {
    st.objs.push({
      id: st.nextId++, kind: row.powerup, lane: row.safeLane,
      z: SPAWN_Z + 1.2, bob: rnd(0, Math.PI * 2), seed: Math.random(),
    });
  } else if (row.collectibleLane !== undefined) {
    st.objs.push({
      id: st.nextId++, kind: pick(COLLECTIBLES), lane: row.collectibleLane,
      z: SPAWN_Z + 1.2, bob: rnd(0, Math.PI * 2), seed: Math.random(),
    });
  } else if (Math.random() < 0.12) {
    st.objs.push({
      id: st.nextId++, kind: pick(POWERUPS), lane: row.safeLane,
      z: SPAWN_Z + 1.2, bob: rnd(0, Math.PI * 2), seed: Math.random(),
    });
  }
  st.rev++;
}

export function update(st: GS, dt: number, best: { v: number }, board: BoardConfig) {
  st.rings.forEach((p) => (p.t += dt * 2.2));
  st.rings = st.rings.filter((p) => p.t < 1);
  if (st.laneCarve && st.time - st.laneCarve.at > 0.7) st.laneCarve = null;
  if (st.over || !st.started) return;

  if (st.countdownT > 0) {
    st.countdownT = Math.max(0, st.countdownT - dt);
    return;
  }
  st.time += dt;

  const prevLevel = st.level;
  st.level = levelAt(st.time);
  if (st.level > prevLevel) st.levelUpFlashAt = st.time;

  // ボードのSpeedステータス（1-5）で基礎速度をわずかに増減させる（最大±5%）
  let speed = 12.4 * speedFactorForLevel(st.level) * (1 + (board.speed - 3) * 0.025);
  if (st.turboT > 0) speed *= 1.82;
  if (st.slowT > 0) speed *= 0.55;

  st.turboT = Math.max(0, st.turboT - dt);
  st.magnetT = Math.max(0, st.magnetT - dt);
  st.slowT = Math.max(0, st.slowT - dt);
  st.invulnT = Math.max(0, st.invulnT - dt);

  const dz = speed * dt;
  st.dist += dz;
  st.rowDist += dz;
  st.decoDist += dz;

  const rowGap = rowGapForLevel(st.level);
  if (st.rowDist >= rowGap) {
    st.rowDist -= rowGap;
    spawnRow(st);
  }
  if (st.decoDist >= DECO_GAP) {
    st.decoDist = 0;
    st.objs.push(makeScenery(st, SPAWN_Z));
    st.rev++;
  }

  // ボードのHandlingステータス（1-5）でレーン移動の追従の速さが変わる
  const handlingRate = 10.2 + board.handling * 1.05;
  st.playerPos += (st.playerLane - st.playerPos) * Math.min(1, dt * handlingRate);

  const mult = scoreFactorForLevel(st.level) * (st.turboT > 0 ? 2 : 1);
  // ボードのMagnet Rangeステータス（1-5）で吸引範囲と吸引の速さが変わる
  const magnetRangeZ = 10 + board.magnetRange * 2.4;
  const magnetPull = 4 + board.magnetRange * 1.2;
  for (const o of st.objs) {
    o.z -= dz;
    if (st.magnetT > 0 && COLLECTIBLES.includes(o.kind) && o.z < magnetRangeZ && o.z > 0) {
      o.lane += (st.playerPos - o.lane) * Math.min(1, dt * magnetPull);
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
      // 当たり判定は少し優しめに（レーン切り替え中の掠りを許容する）
      Math.abs(o.lane - st.playerPos) < 0.38
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
        st.pickupBanner = { kind: o.kind, at: st.time };
        st.rings.push({ x, z: 0, t: 0, color: "#7ce0ff" });
        alive = false;
      } else if (st.invulnT <= 0) {
        if (st.shield) {
          st.shield = false;
          // ボードのShield Bonusステータス（1-5）で被弾後の無敵時間が伸びる
          st.invulnT = 1.2 + board.shieldBonus * 0.18;
          st.rings.push({ x, z: 0, t: 0, color: "#21c8ff" });
          st.hitBurst = { x, at: st.time };
          alive = false;
        } else {
          st.over = true;
          st.rings.push({ x, z: 0, t: 0, color: "#ffffff" });
          st.hitBurst = { x, at: st.time };
          const finalScore = Math.floor(st.score);
          if (finalScore > best.v) {
            best.v = finalScore;
            localStorage.setItem(BEST_KEY, String(finalScore));
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

function drawCanvasGameIcon(g: CanvasRenderingContext2D, kind: Kind, badge: boolean) {
  const cx = 128;
  const cy = badge ? 132 : 128;
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";

  if (kind === "turbo") {
    const grad = g.createLinearGradient(88, 42, 168, 214);
    grad.addColorStop(0, "#fff36a");
    grad.addColorStop(0.55, "#ffba1f");
    grad.addColorStop(1, "#f26c18");
    g.fillStyle = grad;
    g.strokeStyle = "#7a3600";
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(144, 22);
    g.lineTo(78, 132);
    g.lineTo(122, 132);
    g.lineTo(100, 232);
    g.lineTo(184, 104);
    g.lineTo(138, 104);
    g.closePath();
    g.stroke();
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.75)";
    g.lineWidth = 5;
    g.stroke();
  } else if (kind === "magnet") {
    const grad = g.createLinearGradient(64, 35, 192, 224);
    grad.addColorStop(0, "#ff806c");
    grad.addColorStop(1, "#d91e42");
    g.fillStyle = grad;
    g.strokeStyle = "#651426";
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(64, 34);
    g.lineTo(98, 34);
    g.lineTo(98, 142);
    g.quadraticCurveTo(98, 184, 128, 184);
    g.quadraticCurveTo(158, 184, 158, 142);
    g.lineTo(158, 34);
    g.lineTo(192, 34);
    g.lineTo(192, 146);
    g.quadraticCurveTo(192, 226, 128, 226);
    g.quadraticCurveTo(64, 226, 64, 146);
    g.closePath();
    g.stroke();
    g.fill();
    g.fillStyle = "#f8fdff";
    g.fillRect(64, 34, 34, 32);
    g.fillRect(158, 34, 34, 32);
  } else if (kind === "shield") {
    const grad = g.createLinearGradient(56, 20, 200, 224);
    grad.addColorStop(0, "#7df2ff");
    grad.addColorStop(0.6, "#1cbceb");
    grad.addColorStop(1, "#1175d6");
    g.fillStyle = grad;
    g.strokeStyle = "#063766";
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(cx, 22);
    g.lineTo(202, 52);
    g.lineTo(202, 112);
    g.quadraticCurveTo(202, 184, cx, 226);
    g.quadraticCurveTo(54, 184, 54, 112);
    g.lineTo(54, 52);
    g.closePath();
    g.stroke();
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.28)";
    g.beginPath();
    g.moveTo(cx, 42);
    g.lineTo(184, 64);
    g.lineTo(184, 112);
    g.quadraticCurveTo(184, 166, cx, 204);
    g.closePath();
    g.fill();
  } else if (kind === "slow") {
    const grad = g.createLinearGradient(42, 54, 210, 212);
    grad.addColorStop(0, "#8ff8ff");
    grad.addColorStop(0.55, "#1dbdea");
    grad.addColorStop(1, "#076db8");
    g.fillStyle = grad;
    g.strokeStyle = "#064269";
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(36, 164);
    g.quadraticCurveTo(68, 78, 138, 78);
    g.quadraticCurveTo(216, 78, 218, 152);
    g.quadraticCurveTo(196, 126, 164, 146);
    g.quadraticCurveTo(208, 154, 208, 190);
    g.quadraticCurveTo(208, 228, 152, 228);
    g.quadraticCurveTo(92, 228, 36, 164);
    g.closePath();
    g.stroke();
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.78)";
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(74, 162);
    g.quadraticCurveTo(120, 132, 176, 158);
    g.stroke();
  } else if (kind === "shell") {
    const grad = g.createLinearGradient(60, 44, 190, 210);
    grad.addColorStop(0, "#ffd6ff");
    grad.addColorStop(0.55, "#b879ff");
    grad.addColorStop(1, "#7047d8");
    g.fillStyle = grad;
    g.strokeStyle = "#ffffff";
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(cx, 48);
    g.bezierCurveTo(68, 70, 46, 142, 70, 196);
    g.quadraticCurveTo(cx, 228, 186, 196);
    g.bezierCurveTo(210, 142, 188, 70, cx, 48);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.72)";
    g.lineWidth = 7;
    [-42, -20, 0, 20, 42].forEach((x) => {
      g.beginPath();
      g.moveTo(cx, 206);
      g.lineTo(cx + x, 78);
      g.stroke();
    });
  } else if (kind === "star") {
    const grad = g.createLinearGradient(58, 40, 196, 218);
    grad.addColorStop(0, "#fff68a");
    grad.addColorStop(1, "#ff9d1c");
    g.fillStyle = grad;
    g.strokeStyle = "#784300";
    g.lineWidth = 10;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 42 : 92;
      const a = -Math.PI / 2 + i * (Math.PI / 5);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
    g.stroke();
    g.fill();
  } else {
    const orange = kind === "fish2";
    const grad = g.createLinearGradient(48, 82, 214, 176);
    grad.addColorStop(0, orange ? "#ffb033" : "#49d4ff");
    grad.addColorStop(1, orange ? "#f06a17" : "#087bc1");
    g.fillStyle = grad;
    g.strokeStyle = orange ? "#8b3300" : "#064269";
    g.lineWidth = 10;
    g.beginPath();
    g.ellipse(cx, cy, 76, 38, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(60, cy);
    g.lineTo(24, cy - 34);
    g.lineTo(28, cy + 34);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(166, cy - 10, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#07395f";
    g.beginPath();
    g.arc(169, cy - 10, 4, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function itemTexture(key: string, kind: Kind, badge = false): THREE.Texture {
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
  } else {
    const rg = g.createRadialGradient(128, 128, 10, 128, 128, 120);
    rg.addColorStop(0, "rgba(255,255,255,0.55)");
    rg.addColorStop(0.5, "rgba(255,255,255,0.12)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
  }
  drawCanvasGameIcon(g, kind, badge);
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

function carveFoamTexture(): THREE.Texture {
  const hit = texCache.get("carve-foam");
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 128);

  const glow = g.createRadialGradient(130, 72, 8, 130, 72, 112);
  glow.addColorStop(0, "rgba(156,240,255,0.52)");
  glow.addColorStop(0.48, "rgba(98,220,255,0.22)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 256, 128);

  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(22, 94);
  g.bezierCurveTo(78, 34, 150, 26, 234, 50);
  g.stroke();

  g.strokeStyle = "rgba(211,251,255,0.72)";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(36, 105);
  g.bezierCurveTo(86, 70, 144, 62, 218, 78);
  g.stroke();

  g.fillStyle = "rgba(255,255,255,0.9)";
  for (let i = 0; i < 18; i++) {
    const x = 34 + i * 12 + rnd(-4, 4);
    const y = 82 + Math.sin(i * 0.7) * 18 + rnd(-3, 3);
    g.beginPath();
    g.arc(x, y, rnd(1.5, 4.2), 0, Math.PI * 2);
    g.fill();
  }

  const t = new THREE.CanvasTexture(c);
  texCache.set("carve-foam", t);
  return t;
}

function sunTexture(): THREE.Texture {
  const hit = texCache.get("sun");
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, "rgba(255,255,250,1)");
  rg.addColorStop(0.28, "rgba(255,247,214,0.95)");
  rg.addColorStop(0.55, "rgba(255,236,170,0.4)");
  rg.addColorStop(1, "rgba(255,236,170,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  texCache.set("sun", t);
  return t;
}

/** ボードの模様（stripe/wave/bolt/sunset）をキャンバスに描いてテクスチャ化する */
function boardPatternTexture(pattern: BoardConfig["pattern"], stripeColor: string): THREE.Texture {
  const key = `board-${pattern}-${stripeColor}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  if (pattern === "wave") {
    g.strokeStyle = stripeColor;
    g.lineWidth = 16;
    g.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      const yBase = 60 + i * 70;
      g.moveTo(20, yBase);
      g.quadraticCurveTo(70, yBase - 34, 128, yBase);
      g.quadraticCurveTo(186, yBase + 34, 236, yBase);
      g.stroke();
    }
  } else if (pattern === "sunset") {
    const rg = g.createLinearGradient(0, 0, 0, 256);
    rg.addColorStop(0, stripeColor);
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
  } else if (pattern === "bolt") {
    g.fillStyle = stripeColor;
    g.beginPath();
    g.moveTo(150, 10);
    g.lineTo(90, 130);
    g.lineTo(128, 130);
    g.lineTo(106, 246);
    g.lineTo(180, 108);
    g.lineTo(140, 108);
    g.closePath();
    g.fill();
  } else {
    // stripe（デフォルト）は単色塗り。ジオメトリ側の細い形状で帯として見せる。
    g.fillStyle = stripeColor;
    g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

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
uniform float uTurbo;
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
  // 太陽の反射光路（画面右奥から手前に伸びるきらめき帯）
  float glintPath = exp(-pow((x - (z * 0.11 + 2.4)) * 0.55, 2.0));
  float glintSparkle = pow(noise(vec2(x * 6.0 + uTime * 1.1, s * 3.0)), 6.0);
  col += glintPath * glintSparkle * 0.85 * (0.35 + 0.65 * df);
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
  col = mix(col, vec3(0.97, 0.99, 1.0), foam * (0.85 + uTurbo * 0.15));
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
  // detail=2（旧: 1）で角を減らし、低ポリ丸出し感を抑える
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(0.85, 2);
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
      {/* 接地影（半透明バグの実体＝影が無く水に浮いて見えていたための対策） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[1.05, 20]} />
        <meshBasicMaterial color="#02182c" transparent opacity={0.32} depthWrite={false} />
      </mesh>
      {/* side=DoubleSide: 変形後のジオメトリで法線が反転した面があっても
          背面カリングで穴が空いて透けて見えないようにする */}
      <mesh geometry={geo} position={[0, 0.05, 0]} rotation={[0, seed * 6, 0]} castShadow>
        <meshStandardMaterial
          color="#3c4650" roughness={0.88} metalness={0.04}
          flatShading side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={geo} position={[0.55, -0.15, 0.3]} scale={0.5} rotation={[0, seed * 9, 0]}>
        <meshStandardMaterial
          color="#333c45" roughness={0.88} metalness={0.04}
          flatShading side={THREE.DoubleSide}
        />
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
    () => itemTexture(kind, kind, isPower),
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

function Surfer({ groupRef, boardRef, bodyRef, board }: {
  groupRef: React.RefObject<THREE.Group | null>;
  boardRef: React.RefObject<THREE.Group | null>;
  bodyRef: React.RefObject<THREE.Group | null>;
  board: BoardConfig;
}) {
  const boardGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.85);
    s.bezierCurveTo(0.14, -0.7, 0.21, -0.2, 0.2, 0.15);
    s.bezierCurveTo(0.19, 0.5, 0.12, 0.72, 0, 0.72);
    s.bezierCurveTo(-0.12, 0.72, -0.19, 0.5, -0.2, 0.15);
    s.bezierCurveTo(-0.21, -0.2, -0.14, -0.7, 0, -0.85);
    // 厚みを増して立体感を強調
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.11, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.025, bevelSegments: 3,
    });
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const railGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.85);
    s.bezierCurveTo(0.14, -0.7, 0.21, -0.2, 0.2, 0.15);
    s.bezierCurveTo(0.19, 0.5, 0.12, 0.72, 0, 0.72);
    s.bezierCurveTo(-0.12, 0.72, -0.19, 0.5, -0.2, 0.15);
    s.bezierCurveTo(-0.21, -0.2, -0.14, -0.7, 0, -0.85);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
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
  const patternTex = useMemo(
    () => (board.pattern === "solid" ? null : boardPatternTexture(board.pattern, board.stripeColor)),
    [board.pattern, board.stripeColor]
  );
  const boltTex = useMemo(
    () => (board.pattern === "bolt" ? itemTexture("board-bolt-decal", "turbo") : null),
    [board.pattern]
  );

  return (
    <group ref={groupRef}>
      <BlobShadow r={0.6} />
      <group ref={boardRef}>
        {/* レール（縁）: 本体よりわずかに大きく下にずらし、厚み・エッジを強調 */}
        <mesh geometry={railGeo} position={[0, 0.08, 0]} scale={[1.05, 1, 1.04]}>
          <meshStandardMaterial color="#e7dfc8" roughness={0.55} />
        </mesh>
        <mesh geometry={boardGeo} position={[0, 0.13, 0]} castShadow>
          <meshPhysicalMaterial
            color={board.color} roughness={0.22} clearcoat={0.55} clearcoatRoughness={0.25}
          />
        </mesh>
        {patternTex && (
          <mesh geometry={stripeGeo} position={[0, 0.185, 0]}>
            <meshPhysicalMaterial
              color="#ffffff" map={patternTex} roughness={0.28} clearcoat={0.5} clearcoatRoughness={0.3}
            />
          </mesh>
        )}
        {boltTex && (
          <sprite position={[0, 0.23, 0.1]} scale={[0.4, 0.4, 1]}>
            <spriteMaterial map={boltTex} transparent depthWrite={false} />
          </sprite>
        )}
        <group ref={bodyRef} position={[0, 0.19, 0.1]}>
          {/* legs */}
          <mesh position={[-0.1, 0.18, 0.02]} rotation={[0.18, 0, 0.08]}>
            <capsuleGeometry args={[0.05, 0.26, 4, 8]} />
            <meshStandardMaterial color={SKIN_DARK} roughness={0.6} />
          </mesh>
          <mesh position={[0.1, 0.18, -0.05]} rotation={[-0.15, 0, -0.08]}>
            <capsuleGeometry args={[0.05, 0.26, 4, 8]} />
            <meshStandardMaterial color={SKIN_DARK} roughness={0.6} />
          </mesh>
          {/* feet */}
          <mesh position={[-0.11, 0.02, 0.06]} scale={[1, 0.5, 1.7]}>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshStandardMaterial color={SKIN_DARK} roughness={0.6} />
          </mesh>
          <mesh position={[0.11, 0.02, -0.08]} scale={[1, 0.5, 1.7]}>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshStandardMaterial color={SKIN_DARK} roughness={0.6} />
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
          {/* torso: 少し細めのウエスト〜広めの肩でアスリート体型に */}
          <mesh position={[0, 0.6, 0]} scale={[1, 1, 0.95]}>
            <capsuleGeometry args={[0.115, 0.25, 4, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>
          {/* arms: バランスを取る自然な広げ角度（旧より少し前・少し下げる） */}
          <mesh position={[-0.25, 0.68, 0.02]} rotation={[0.15, 0, 1.22]}>
            <capsuleGeometry args={[0.042, 0.21, 4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>
          <mesh position={[0.25, 0.68, 0.02]} rotation={[0.15, 0, -1.22]}>
            <capsuleGeometry args={[0.042, 0.21, 4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>
          <mesh position={[-0.43, 0.71, 0.05]} rotation={[0.1, 0, 1.0]}>
            <capsuleGeometry args={[0.036, 0.17, 4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>
          <mesh position={[0.43, 0.71, 0.05]} rotation={[0.1, 0, -1.0]}>
            <capsuleGeometry args={[0.036, 0.17, 4, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>
          <mesh position={[-0.52, 0.75, 0.08]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>
          <mesh position={[0.52, 0.75, 0.08]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>
          {/* head + hair：頭をわずかに大きく、髪を増量してブロック感を減らす */}
          <mesh position={[0, 0.865, 0]}>
            <sphereGeometry args={[0.112, 20, 16]} />
            <meshStandardMaterial color={SKIN} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.9, -0.01]} scale={[1.08, 0.85, 1.1]}>
            <sphereGeometry args={[0.112, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.64]} />
            <meshStandardMaterial color="#4a2f18" roughness={0.7} />
          </mesh>
          {([
            [-0.04, 0.995, 0.03, 0.35], [0.03, 1.01, 0.0, -0.25], [0.07, 0.985, 0.02, 0.55],
            [-0.08, 0.975, -0.02, 0.15], [0.0, 1.015, -0.03, -0.05],
          ] as const).map(
            ([x, y, z, r], i) => (
              <mesh key={i} position={[x, y, z]} rotation={[0, 0, r]}>
                <coneGeometry args={[0.026, 0.075, 5]} />
                <meshStandardMaterial color="#5c3a1e" roughness={0.75} />
              </mesh>
            )
          )}
        </group>
      </group>
    </group>
  );
}

// ---------- spray particles ----------

const SPRAY_N = 140;

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

// ---------- sun ----------

function Sun() {
  const tex = useMemo(() => sunTexture(), []);
  return (
    <sprite position={[9, 16, -60]} scale={[26, 26, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
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

export function Scene({ stRef, bestRef, board, onHud, idle }: {
  stRef: React.RefObject<GS>;
  bestRef: React.RefObject<{ v: number }>;
  board: BoardConfig;
  onHud?: (h: Hud) => void;
  /** true の場合はメニュー背景用。カメラをゆっくり漂わせ、HUD計算は行わない。 */
  idle?: boolean;
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
  const carveRefs = useRef<(THREE.Sprite | null)[]>([]);
  const carveTex = useMemo(() => carveFoamTexture(), []);

  const waterUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uScroll: { value: 0 }, uPlayerX: { value: 0 }, uTurbo: { value: 0 } }),
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
    if (idle) st.time += dt;
    update(st, dt, best, board);

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
    const px = idle ? Math.sin(st.time * 0.4) * 0.5 : st.playerPos * LANE_X;
    const tilt = idle ? 0 : st.playerLane - st.playerPos;
    const carveAge = st.laneCarve ? st.time - st.laneCarve.at : 99;
    const carveLife = Math.max(0, 1 - carveAge / 0.44);
    const carveKick = !idle && st.laneCarve && carveLife > 0
      ? st.laneCarve.dir * Math.sin(carveLife * Math.PI) * 0.34
      : 0;
    if (playerRef.current) {
      playerRef.current.position.set(px, Math.sin(st.time * 3.1) * 0.05, 0);
      playerRef.current.visible = !(st.invulnT > 0 && Math.floor(st.time * 10) % 2 === 0);
    }
    if (boardRef.current) {
      boardRef.current.rotation.z = -tilt * 0.55 - carveKick;
      boardRef.current.rotation.y = -tilt * 0.35 - carveKick * 0.55;
      boardRef.current.rotation.x = Math.sin(st.time * 2.2) * 0.045 - 0.02 - Math.abs(carveKick) * 0.22;
    }
    if (bodyRef.current) bodyRef.current.rotation.z = -tilt * 0.35 - carveKick * 0.52;
    if (shieldRef.current) {
      shieldRef.current.visible = st.shield;
      shieldRef.current.position.set(px, 0.55, 0);
      shieldRef.current.scale.setScalar(1 + Math.sin(st.time * 5) * 0.04);
    }

    // spray
    const alive = st.started && !st.over ? 1 : 0.25;
    const d = spray.current;
    const baseSpray = !idle && st.turboT > 0 ? 8 : 3;
    for (let s = 0; s < baseSpray; s++) {
      const i = sprayIdx.current;
      sprayIdx.current = (sprayIdx.current + 1) % SPRAY_N;
      d[i * 6] = px + rnd(-0.25, 0.25);
      d[i * 6 + 1] = 0.08;
      d[i * 6 + 2] = rnd(0.5, 0.9);
      d[i * 6 + 3] = rnd(-0.8, 0.8);
      d[i * 6 + 4] = rnd(0.8, 2.6) * alive;
      d[i * 6 + 5] = rnd(1.5, 4.5) * alive;
    }
    if (!idle && st.laneCarve && carveLife > 0) {
      const intensity = st.turboT > 0 ? 22 : 11;
      for (let s = 0; s < intensity; s++) {
        const i = sprayIdx.current;
        sprayIdx.current = (sprayIdx.current + 1) % SPRAY_N;
        const side = -st.laneCarve.dir;
        d[i * 6] = px + side * rnd(0.16, 0.62);
        d[i * 6 + 1] = rnd(0.06, 0.2);
        d[i * 6 + 2] = rnd(0.2, 1.05);
        d[i * 6 + 3] = side * rnd(1.4, 4.1) * carveLife;
        d[i * 6 + 4] = rnd(1.2, 3.7) * carveLife;
        d[i * 6 + 5] = rnd(2.4, 6.0);
      }
    }
    // ヒット時（シールド破壊・ワイプアウト）の派手な水しぶきバースト
    if (st.hitBurst && st.time - st.hitBurst.at < 0.12) {
      for (let s = 0; s < 10; s++) {
        const i = sprayIdx.current;
        sprayIdx.current = (sprayIdx.current + 1) % SPRAY_N;
        const angle = rnd(0, Math.PI * 2);
        const speed = rnd(2.2, 4.5);
        d[i * 6] = st.hitBurst.x + Math.cos(angle) * 0.1;
        d[i * 6 + 1] = rnd(0.1, 0.4);
        d[i * 6 + 2] = rnd(-0.3, 0.3);
        d[i * 6 + 3] = Math.cos(angle) * speed;
        d[i * 6 + 4] = rnd(2.5, 4.5);
        d[i * 6 + 5] = Math.sin(angle) * speed;
      }
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

    for (let i = 0; i < 4; i++) {
      const spr = carveRefs.current[i];
      if (!spr) continue;
      if (!idle && st.laneCarve && carveLife > 0) {
        const p = Math.min(1, carveAge / 0.44);
        const laneBlend = st.laneCarve.from + (st.laneCarve.to - st.laneCarve.from) * Math.min(1, p * 1.45);
        const side = -st.laneCarve.dir;
        spr.visible = true;
        spr.position.set(laneBlend * LANE_X + side * (0.34 + i * 0.18), 0.055 + i * 0.012, 0.42 + i * 0.22);
        spr.rotation.set(-Math.PI / 2, 0, side * (0.46 + i * 0.08));
        spr.scale.set(1.3 + i * 0.36 + p * 0.8, 0.38 + i * 0.06, 1);
        (spr.material as THREE.SpriteMaterial).opacity = carveLife * (0.74 - i * 0.11);
      } else {
        spr.visible = false;
      }
    }

    // water + camera
    if (waterMat.current) {
      waterMat.current.uniforms.uTime.value = st.time;
      waterMat.current.uniforms.uScroll.value = st.dist;
      waterMat.current.uniforms.uPlayerX.value = px;
      waterMat.current.uniforms.uTurbo.value = !idle && st.turboT > 0 ? 1 : 0;
    }
    if (idle) {
      camera.position.set(Math.sin(st.time * 0.15) * 1.4, 3.2, 6.0);
      camera.lookAt(0, 0.3, -16);
    } else {
      const turbo = st.turboT > 0;
      const shake = turbo ? 0.035 : 0;
      camera.position.set(
        px * 0.4 + Math.sin(st.time * 43) * shake,
        2.7 + Math.cos(st.time * 37) * shake,
        5.0 + Math.sin(st.time * 31) * shake,
      );
      camera.lookAt(px * 0.55, 0.15, -15);
      if (camera instanceof THREE.PerspectiveCamera) {
        const targetFov = turbo ? 72 : 60;
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 7);
        camera.updateProjectionMatrix();
      }
    }

    // HUD
    if (onHud) {
      const next: Hud = {
        score: Math.floor(st.score),
        best: best.v,
        level: st.level,
        turbo: Math.ceil(st.turboT),
        magnet: Math.ceil(st.magnetT),
        slow: Math.ceil(st.slowT),
        shield: st.shield,
        over: st.over,
        newBest: st.over && st.score > 0 && st.score >= best.v,
        progress: (st.dist % 160) / 160,
        levelUp: st.levelUpFlashAt >= 0 && st.time - st.levelUpFlashAt < 1.8,
        pickup: st.pickupBanner && st.time - st.pickupBanner.at < 1.6 ? st.pickupBanner.kind : null,
        countdown: st.countdownT > 3 ? "3" : st.countdownT > 2 ? "2" : st.countdownT > 1 ? "1" : st.countdownT > 0 ? "SURF!" : null,
        speedFactor: speedFactorForLevel(st.level),
        scoreMultiplier: scoreFactorForLevel(st.level) * (st.turboT > 0 ? 2 : 1),
      };
      const json = JSON.stringify(next);
      if (json !== hudJson.current) {
        hudJson.current = json;
        onHud(next);
      }
    }
  });

  const st = stRef.current;

  return (
    <>
      <fog attach="fog" args={["#c9ecfa", 46, 110]} />
      <ambientLight intensity={0.78} />
      <hemisphereLight args={["#bfe9ff", "#1f97e0", 0.5]} />
      <directionalLight position={[6, 12, 5]} intensity={1.7} color="#fff6e0" />
      <Sun />

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
      <Surfer groupRef={playerRef} boardRef={boardRef} bodyRef={bodyRef} board={board} />
      <mesh ref={shieldRef} visible={false}>
        <sphereGeometry args={[0.95, 20, 14]} />
        <meshStandardMaterial
          color="#21c8ff" transparent opacity={0.18}
          emissive="#21c8ff" emissiveIntensity={0.5} depthWrite={false}
        />
      </mesh>

      <Spray dataRef={spray} />

      {/* carve foam shown for a short moment after each lane-change swipe */}
      {Array.from({ length: 4 }).map((_, i) => (
        <sprite key={i} ref={(s) => { carveRefs.current[i] = s; }} visible={false}>
          <spriteMaterial
            map={carveTex}
            transparent
            depthWrite={false}
            depthTest={false}
            color={i === 0 ? "#ffffff" : "#c9fbff"}
          />
        </sprite>
      ))}

      {/* collect ring pool */}
      {Array.from({ length: 6 }).map((_, i) => (
        <sprite key={i} ref={(s) => { ringRefs.current[i] = s; }} visible={false}>
          <spriteMaterial map={ringTex} transparent depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}
