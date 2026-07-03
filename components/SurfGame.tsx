"use client";

import { useEffect, useRef, useState } from "react";
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
  | "slow";

interface Obj {
  kind: Kind;
  lane: number; // -1 | 0 | 1 (float while magnet pulls)
  z: number; // world depth, 1 = player plane
  bob: number; // phase for bobbing animation
}

interface Deco {
  side: -1 | 1;
  z: number;
  emoji: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  text?: string;
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
  playerLane: number; // target lane (int)
  playerPos: number; // rendered lane (float, lerps to playerLane)
  turboT: number;
  magnetT: number;
  slowT: number;
  shield: boolean;
  invulnT: number;
  objs: Obj[];
  decos: Deco[];
  parts: Particle[];
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
}

// ---------- constants ----------

const SPAWN_Z = 24;
const ROW_GAP = 4.4;
const DECO_GAP = 2.6;
const OBSTACLES: Kind[] = ["rock", "wood", "crate", "buoy", "fin", "jelly"];
const COLLECTIBLES: Kind[] = ["fish", "fish2", "shell", "star"];
const POWERUPS: Kind[] = ["turbo", "magnet", "shield", "slow"];

const EMOJI: Record<Kind, string> = {
  fish: "🐟",
  fish2: "🐠",
  shell: "🐚",
  star: "⭐",
  rock: "🪨",
  wood: "🪵",
  crate: "📦",
  buoy: "🛟",
  fin: "🦈",
  jelly: "🪼",
  turbo: "⚡",
  magnet: "🧲",
  shield: "🛡️",
  slow: "🌊",
};

const VALUE: Partial<Record<Kind, number>> = {
  fish: 1,
  fish2: 1,
  shell: 2,
  star: 3,
};

const BEST_KEY = "surf-drive-best";

function initState(): GS {
  return {
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
    objs: [
      { kind: "shell", lane: -1, z: 8.8, bob: 0.2 },
      { kind: "fish2", lane: 0, z: 10.4, bob: 1.5 },
      { kind: "crate", lane: 1, z: 12.8, bob: 2.4 },
      { kind: "rock", lane: -1, z: 15.2, bob: 0.8 },
      { kind: "turbo", lane: 0, z: 17.6, bob: 2.9 },
      { kind: "buoy", lane: 1, z: 20.2, bob: 1.1 },
    ],
    decos: [
      { side: -1, z: 6, emoji: "🌴" },
      { side: 1, z: 10, emoji: "🌴" },
      { side: -1, z: 15, emoji: "🏝️" },
      { side: 1, z: 20, emoji: "🌴" },
    ],
    parts: [],
  };
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export default function SurfGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<GS>(initState());
  const bestRef = useRef(0);
  const hudJsonRef = useRef("");
  const [hud, setHud] = useState<Hud>({
    score: 0,
    best: 0,
    level: 1,
    turbo: 0,
    magnet: 0,
    slow: 0,
    shield: false,
    over: false,
    newBest: false,
  });
  const [showHint, setShowHint] = useState(true);

  const restart = () => {
    stRef.current = initState();
    setShowHint(true);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    bestRef.current = Number(localStorage.getItem(BEST_KEY) || 0);

    let W = 0;
    let H = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // ---------- input ----------
    const move = (dir: -1 | 1) => {
      const st = stRef.current;
      if (st.over) return;
      if (!st.started) {
        st.started = true; // first input starts the run
        setShowHint(false);
        return;
      }
      st.playerLane = Math.max(-1, Math.min(1, st.playerLane + dir));
      setShowHint(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") move(-1);
      else if (e.key === "ArrowRight" || e.key === "d") move(1);
    };
    let px0 = 0;
    let pDown = false;
    const onPD = (e: PointerEvent) => {
      px0 = e.clientX;
      pDown = true;
    };
    const onPU = (e: PointerEvent) => {
      if (!pDown) return;
      pDown = false;
      const dx = e.clientX - px0;
      if (Math.abs(dx) > 24) move(dx > 0 ? 1 : -1);
      else move(e.clientX > W / 2 ? 1 : -1); // tap side fallback
    };
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", onPD);
    canvas.addEventListener("pointerup", onPU);

    // ---------- projection helpers ----------
    const horizonY = () => H * 0.27;
    const playerY = () => H * 0.76;
    const laneHalf = () => Math.min(W * 0.38, 210);
    const projY = (z: number) => horizonY() + (playerY() - horizonY()) / z;
    const projX = (lane: number, z: number) =>
      W / 2 + (lane * laneHalf()) / z;
    const objSize = () => Math.min(W * 0.24, 104);

    // ---------- spawning ----------
    const spawnRow = (st: GS) => {
      const r = Math.random();
      if (r < 0.55) {
        // obstacle row: block 1-2 lanes, always leave one free
        const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
        const count = st.level >= 3 && Math.random() < 0.55 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          st.objs.push({
            kind: pick(OBSTACLES),
            lane: lanes[i],
            z: SPAWN_Z,
            bob: rnd(0, Math.PI * 2),
          });
        }
        // sometimes a collectible on a free lane
        if (Math.random() < 0.45) {
          st.objs.push({
            kind: pick(COLLECTIBLES),
            lane: lanes[2],
            z: SPAWN_Z + rnd(0, 1.5),
            bob: rnd(0, Math.PI * 2),
          });
        }
      } else if (r < 0.88) {
        // collectible run along one lane
        const lane = pick([-1, 0, 1]);
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          st.objs.push({
            kind: pick(COLLECTIBLES),
            lane,
            z: SPAWN_Z + i * 1.3,
            bob: rnd(0, Math.PI * 2),
          });
        }
      } else {
        st.objs.push({
          kind: pick(POWERUPS),
          lane: pick([-1, 0, 1]),
          z: SPAWN_Z,
          bob: rnd(0, Math.PI * 2),
        });
      }
    };

    const burst = (st: GS, x: number, y: number, color: string, text?: string) => {
      for (let i = 0; i < 8; i++) {
        st.parts.push({
          x,
          y,
          vx: rnd(-90, 90),
          vy: rnd(-160, -30),
          life: 0.6,
          max: 0.6,
          color,
          size: rnd(3, 6),
        });
      }
      if (text) {
        st.parts.push({
          x,
          y: y - 20,
          vx: 0,
          vy: -70,
          life: 0.8,
          max: 0.8,
          color: "#ffffff",
          size: 22,
          text,
        });
      }
    };

    // ---------- update ----------
    const update = (st: GS, dt: number) => {
      if (st.over) {
        st.parts.forEach((p) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        });
        st.parts = st.parts.filter((p) => p.life > 0);
        return;
      }
      if (!st.started) {
        // idle on the start screen: water animates, nothing spawns or moves
        st.time += dt;
        return;
      }
      st.time += dt;
      st.level = Math.min(15, 1 + Math.floor(st.time / 18));

      let speed = 5.5 + st.level * 0.45;
      if (st.turboT > 0) speed *= 1.55;
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
        st.decos.push({
          side: Math.random() < 0.5 ? -1 : 1,
          z: SPAWN_Z,
          emoji: Math.random() < 0.85 ? "🌴" : "🏝️",
        });
      }

      // player lane lerp
      const k = Math.min(1, dt * 9);
      st.playerPos += (st.playerLane - st.playerPos) * k;

      // decos
      st.decos.forEach((d) => (d.z -= dz));
      st.decos = st.decos.filter((d) => d.z > 0.35);

      // objects
      const mult = st.turboT > 0 ? 2 : 1;
      for (const o of st.objs) {
        o.z -= dz;
        // magnet pull on collectibles
        if (
          st.magnetT > 0 &&
          COLLECTIBLES.includes(o.kind) &&
          o.z < 7 &&
          o.z > 0.8
        ) {
          o.lane += (st.playerPos - o.lane) * Math.min(1, dt * 6);
          o.z -= dz * 0.6;
        }
      }

      const keep: Obj[] = [];
      for (const o of st.objs) {
        let alive = o.z > 0.5;
        if (alive && o.z < 1.28 && o.z > 0.78 && Math.abs(o.lane - st.playerPos) < 0.45) {
          const x = projX(st.playerPos, 1);
          const y = playerY();
          if (COLLECTIBLES.includes(o.kind)) {
            const v = (VALUE[o.kind] || 1) * mult;
            st.score += v;
            burst(st, x, y - 40, "#ffe066", `+${v}`);
            alive = false;
          } else if (POWERUPS.includes(o.kind)) {
            if (o.kind === "turbo") st.turboT = 6;
            else if (o.kind === "magnet") st.magnetT = 7;
            else if (o.kind === "shield") st.shield = true;
            else if (o.kind === "slow") st.slowT = 5;
            burst(st, x, y - 40, "#7ce0ff", EMOJI[o.kind]);
            alive = false;
          } else if (st.invulnT <= 0) {
            // obstacle
            if (st.shield) {
              st.shield = false;
              st.invulnT = 1.5;
              burst(st, x, y - 40, "#21c8ff", "🛡️");
              alive = false;
            } else {
              st.over = true;
              burst(st, x, y - 40, "#ffffff");
              if (st.score > bestRef.current) {
                bestRef.current = st.score;
                localStorage.setItem(BEST_KEY, String(st.score));
              }
            }
          }
        }
        if (alive) keep.push(o);
      }
      st.objs = keep;

      // particles
      st.parts.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 220 * dt;
        p.life -= dt;
      });
      st.parts = st.parts.filter((p) => p.life > 0);
    };

    // ---------- drawing ----------
    const drawPalm = (x: number, y: number, s: number, flip = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flip, 1);
      ctx.rotate(-0.18);
      ctx.strokeStyle = "#806337";
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * 0.12, -s * 0.45, s * 0.02, -s * 0.9);
      ctx.stroke();
      ctx.translate(s * 0.02, -s * 0.92);
      ctx.fillStyle = "#3eaa51";
      for (let i = 0; i < 7; i++) {
        const a = -2.55 + i * 0.82;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(s * 0.23, 0, s * 0.26, s * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#2f8c42";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawIsland = (x: number, baseY: number, w: number, side: -1 | 1) => {
      const sand = ctx.createLinearGradient(0, baseY - 14, 0, baseY + 12);
      sand.addColorStop(0, "#ffe8b0");
      sand.addColorStop(1, "#e7bd72");
      ctx.fillStyle = sand;
      ctx.beginPath();
      ctx.ellipse(x, baseY, w * 0.55, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#65bd69";
      ctx.beginPath();
      ctx.ellipse(x + side * w * 0.03, baseY - 13, w * 0.35, 20, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#707b87";
      ctx.beginPath();
      ctx.ellipse(x - side * w * 0.22, baseY - 3, w * 0.14, 12, -0.3, 0, Math.PI * 2);
      ctx.ellipse(x + side * w * 0.22, baseY - 1, w * 0.11, 9, 0.2, 0, Math.PI * 2);
      ctx.fill();
      drawPalm(x + side * w * 0.16, baseY - 12, Math.min(68, w * 0.22), side);
      drawPalm(x - side * w * 0.05, baseY - 9, Math.min(48, w * 0.16), -side);
    };

    const drawPowerBadge = (x: number, y: number, s: number, kind: Kind) => {
      const colors: Record<string, [string, string]> = {
        turbo: ["#fff35f", "#ff9f1c"],
        magnet: ["#ff6a83", "#e71d36"],
        shield: ["#7de7ff", "#1aa7ff"],
        slow: ["#9bf6ff", "#00b4d8"],
      };
      const [a, b] = colors[kind] || colors.turbo;
      const halo = ctx.createRadialGradient(x, y, 1, x, y, s * 0.72);
      halo.addColorStop(0, `${a}ee`);
      halo.addColorStop(1, `${b}00`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.76, 0, Math.PI * 2);
      ctx.fill();
      const fill = ctx.createLinearGradient(x, y - s * 0.45, x, y + s * 0.45);
      fill.addColorStop(0, a);
      fill.addColorStop(1, b);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.strokeStyle = "rgba(255,255,255,0.94)";
      ctx.stroke();
      ctx.font = `900 ${s * 0.52}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#18344b";
      ctx.fillText(EMOJI[kind], x, y + s * 0.02);
    };

    const drawCollectible = (x: number, y: number, s: number, kind: Kind, t: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(t * 3) * 0.1);
      ctx.shadowColor = "rgba(118,240,255,0.7)";
      ctx.shadowBlur = s * 0.22;
      if (kind === "shell") {
        const g = ctx.createLinearGradient(0, -s * 0.36, 0, s * 0.26);
        g.addColorStop(0, "#ffd6ff");
        g.addColorStop(0.6, "#b87aff");
        g.addColorStop(1, "#7b4dff");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.38);
        for (let i = 0; i <= 6; i++) {
          const a = Math.PI + (i / 6) * Math.PI;
          ctx.lineTo(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.35 + s * 0.09);
        }
        ctx.quadraticCurveTo(0, s * 0.42, -s * 0.42, s * 0.09);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.78)";
        ctx.lineWidth = s * 0.035;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(0, s * 0.3);
          ctx.lineTo(i * s * 0.12, -s * 0.22);
          ctx.stroke();
        }
      } else if (kind === "star") {
        ctx.fillStyle = "#ffe66d";
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? s * 0.2 : s * 0.48;
          const a = -Math.PI / 2 + i * (Math.PI / 5);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#fff6b3";
        ctx.lineWidth = s * 0.04;
        ctx.stroke();
      } else {
        const orange = kind === "fish2";
        ctx.fillStyle = orange ? "#ff8f1f" : "#23b7df";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.42, s * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 0.38, 0);
        ctx.lineTo(-s * 0.62, -s * 0.2);
        ctx.lineTo(-s * 0.58, s * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s * 0.22, -s * 0.05, s * 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawObstacle = (x: number, y: number, s: number, kind: Kind) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = "rgba(0,40,70,0.38)";
      ctx.shadowBlur = s * 0.12;
      ctx.shadowOffsetY = s * 0.08;
      if (kind === "crate" || kind === "wood") {
        if (kind === "crate") {
          const g = ctx.createLinearGradient(0, -s * 0.45, 0, s * 0.35);
          g.addColorStop(0, "#b8793c");
          g.addColorStop(1, "#6b3e1d");
          ctx.fillStyle = g;
          ctx.fillRect(-s * 0.38, -s * 0.45, s * 0.76, s * 0.72);
          ctx.strokeStyle = "#3d2412";
          ctx.lineWidth = s * 0.055;
          ctx.strokeRect(-s * 0.38, -s * 0.45, s * 0.76, s * 0.72);
          ctx.beginPath();
          ctx.moveTo(-s * 0.34, -s * 0.4);
          ctx.lineTo(s * 0.34, s * 0.24);
          ctx.moveTo(s * 0.34, -s * 0.4);
          ctx.lineTo(-s * 0.34, s * 0.24);
          ctx.stroke();
        } else {
          ctx.rotate(-0.18);
          ctx.fillStyle = "#8b5a2b";
          ctx.beginPath();
          ctx.roundRect(-s * 0.48, -s * 0.14, s * 0.96, s * 0.28, s * 0.14);
          ctx.fill();
          ctx.strokeStyle = "#583612";
          ctx.lineWidth = s * 0.04;
          ctx.stroke();
        }
      } else if (kind === "buoy") {
        ctx.fillStyle = "#ff6b35";
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.52);
        ctx.lineTo(s * 0.32, s * 0.24);
        ctx.lineTo(-s * 0.32, s * 0.24);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-s * 0.24, -s * 0.08, s * 0.48, s * 0.13);
      } else if (kind === "fin") {
        ctx.fillStyle = "#2f4454";
        ctx.beginPath();
        ctx.moveTo(-s * 0.24, s * 0.16);
        ctx.quadraticCurveTo(s * 0.08, -s * 0.56, s * 0.34, s * 0.16);
        ctx.closePath();
        ctx.fill();
      } else if (kind === "jelly") {
        ctx.fillStyle = "rgba(182,118,255,0.82)";
        ctx.beginPath();
        ctx.arc(0, -s * 0.12, s * 0.34, Math.PI, 0);
        ctx.lineTo(s * 0.34, s * 0.1);
        ctx.quadraticCurveTo(0, s * 0.28, -s * 0.34, s * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.72)";
        ctx.lineWidth = s * 0.035;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(i * s * 0.14, s * 0.08);
          ctx.quadraticCurveTo(i * s * 0.18, s * 0.35, i * s * 0.04, s * 0.5);
          ctx.stroke();
        }
      } else {
        const g = ctx.createLinearGradient(0, -s * 0.45, 0, s * 0.36);
        g.addColorStop(0, "#6f8191");
        g.addColorStop(1, "#293b48");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-s * 0.42, s * 0.2);
        ctx.lineTo(-s * 0.22, -s * 0.35);
        ctx.lineTo(s * 0.18, -s * 0.48);
        ctx.lineTo(s * 0.46, s * 0.08);
        ctx.quadraticCurveTo(s * 0.14, s * 0.36, -s * 0.42, s * 0.2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawScene = (st: GS) => {
      const hz = horizonY();
      const py = playerY();

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, "#1297e5");
      sky.addColorStop(0.55, "#54c4f4");
      sky.addColorStop(1, "#c9f3ff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, hz + 2);

      const sun = ctx.createRadialGradient(W * 0.62, hz * 0.12, 4, W * 0.62, hz * 0.12, W * 0.5);
      sun.addColorStop(0, "rgba(255,255,255,0.7)");
      sun.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, hz);

      // clouds
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (const [cx, cy, s] of [
        [W * 0.2, hz * 0.35, 26],
        [W * 0.75, hz * 0.5, 32],
        [W * 0.5, hz * 0.22, 20],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * 1.6, s * 0.6, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + s, cy - s * 0.3, s, s * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // sea
      const sea = ctx.createLinearGradient(0, hz, 0, H);
      sea.addColorStop(0, "#74ddf1");
      sea.addColorStop(0.38, "#10aee4");
      sea.addColorStop(0.72, "#0787cf");
      sea.addColorStop(1, "#0069a7");
      ctx.fillStyle = sea;
      ctx.fillRect(0, hz, W, H - hz);

      // tropical shores and distant islands
      drawIsland(W * 0.08, hz + 16, W * 0.46, -1);
      drawIsland(W * 0.95, hz + 15, W * 0.5, 1);
      drawIsland(W * 0.5, hz + 5, W * 0.18, 1);

      // glossy water ribbons
      ctx.lineCap = "round";
      for (let i = 0; i < 30; i++) {
        const z = 1 + ((i * 0.88 + st.dist * 0.28) % 18);
        const lane = ((i % 7) - 3) * 0.62;
        const x = projX(lane, z);
        const y = projY(z);
        const len = Math.max(8, 78 / z);
        ctx.strokeStyle = i % 3 === 0 ? "rgba(172,250,255,0.42)" : "rgba(255,255,255,0.24)";
        ctx.lineWidth = Math.max(1, 4 / z);
        ctx.beginPath();
        ctx.moveTo(x - len * 0.45, y);
        ctx.quadraticCurveTo(x, y - 4 / z, x + len * 0.55, y + 2 / z);
        ctx.stroke();
      }

      // lane wake bands (foam trails)
      for (const lane of [-1, 0, 1]) {
        const half = 0.38;
        const band = ctx.createLinearGradient(0, projY(SPAWN_Z), 0, projY(0.8));
        band.addColorStop(0, "rgba(255,255,255,0.03)");
        band.addColorStop(0.55, "rgba(255,255,255,0.12)");
        band.addColorStop(1, "rgba(255,255,255,0.23)");
        ctx.fillStyle = band;
        ctx.beginPath();
        ctx.moveTo(projX(lane - half, SPAWN_Z), projY(SPAWN_Z));
        ctx.lineTo(projX(lane + half, SPAWN_Z), projY(SPAWN_Z));
        ctx.lineTo(projX(lane + half, 0.8), projY(0.8));
        ctx.lineTo(projX(lane - half, 0.8), projY(0.8));
        ctx.closePath();
        ctx.fill();
      }

      // bright perspective lane rails
      for (const edge of [-1.5, -0.5, 0.5, 1.5]) {
        const rail = ctx.createLinearGradient(0, projY(SPAWN_Z), 0, H);
        rail.addColorStop(0, "rgba(255,255,255,0.02)");
        rail.addColorStop(0.55, "rgba(255,255,255,0.22)");
        rail.addColorStop(1, "rgba(255,255,255,0.62)");
        ctx.strokeStyle = rail;
        ctx.lineWidth = Math.max(1.5, W * 0.008);
        ctx.beginPath();
        ctx.moveTo(projX(edge, SPAWN_Z), projY(SPAWN_Z));
        ctx.lineTo(projX(edge, 0.75), projY(0.75));
        ctx.stroke();
      }

      // animated foam streaks racing toward viewer
      ctx.strokeStyle = "rgba(255,255,255,0.56)";
      ctx.lineCap = "round";
      const phase = st.dist % 1.8;
      for (const lane of [-1, 0, 1]) {
        for (let i = 0; i < 18; i++) {
          const z = 1 + i * 1.65 - phase * 1.65 + 1.4;
          if (z < 0.9 || z > SPAWN_Z) continue;
          const off = (i % 2 === 0 ? -0.28 : 0.28) * (lane === 0 ? 1 : lane);
          const x = projX(lane + off, z);
          const y1 = projY(z);
          const y2 = projY(Math.max(0.82, z - 0.72));
          ctx.lineWidth = Math.max(1.2, 8 / z);
          ctx.globalAlpha = Math.min(0.7, 2.1 / z);
          ctx.beginPath();
          ctx.moveTo(x, y1);
          ctx.lineTo(projX(lane + off, Math.max(0.82, z - 0.72)), y2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // world objects (decos + game objects), far to near
      const size = objSize();
      const drawables: { z: number; draw: () => void }[] = [];

      for (const d of st.decos) {
        drawables.push({
          z: d.z,
          draw: () => {
            const s = Math.min(170, (size * 3.0) / d.z);
            const x = projX(d.side * 2.55, d.z);
            const y = projY(d.z);
            ctx.globalAlpha = Math.min(1, 3 / d.z);
            if (d.emoji === "🌴") drawPalm(x, y + s * 0.24, s, d.side);
            else drawIsland(x, y + s * 0.08, s * 1.55, d.side);
            ctx.globalAlpha = 1;
          },
        });
      }

      for (const o of st.objs) {
        drawables.push({
          z: o.z,
          draw: () => {
            const s = Math.min(size, Math.max(12, (size * 1.45) / o.z));
            const x = projX(o.lane, o.z);
            const bobY = Math.sin(st.time * 3 + o.bob) * s * 0.08;
            const y = projY(o.z) + bobY;
            ctx.fillStyle = "rgba(3,48,85,0.22)";
            ctx.beginPath();
            ctx.ellipse(x, y + s * 0.28, s * 0.42, s * 0.12, 0, 0, Math.PI * 2);
            ctx.fill();
            if (POWERUPS.includes(o.kind)) {
              drawPowerBadge(x, y - s * 0.3, s, o.kind);
            } else if (COLLECTIBLES.includes(o.kind)) {
              drawCollectible(x, y - s * 0.24, s, o.kind, st.time + o.bob);
            } else {
              drawObstacle(x, y - s * 0.2, s, o.kind);
            }
          },
        });
      }

      drawables.sort((a, b) => b.z - a.z);
      drawables.forEach((d) => d.draw());

      // ---------- player ----------
      const px = projX(st.playerPos, 1);
      const pyy = py + Math.sin(st.time * 4) * 3;
      const tilt = (st.playerLane - st.playerPos) * 0.45;
      const ps = Math.min(W * 0.3, 130); // board length

      // long wake carving behind the rider
      for (const side of [-1, 1]) {
        const wake = ctx.createLinearGradient(px, pyy + ps * 0.12, px + side * ps * 1.2, H);
        wake.addColorStop(0, "rgba(255,255,255,0.8)");
        wake.addColorStop(0.55, "rgba(255,255,255,0.28)");
        wake.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = wake;
        ctx.lineWidth = ps * (st.turboT > 0 ? 0.08 : 0.055);
        ctx.beginPath();
        ctx.moveTo(px + side * ps * 0.12, pyy + ps * 0.2);
        ctx.bezierCurveTo(
          px + side * ps * 0.26,
          pyy + ps * 0.65,
          px + side * ps * 0.6,
          pyy + ps * 1.25,
          px + side * ps * 1.05,
          H + ps * 0.25
        );
        ctx.stroke();
      }

      // spray + foam at the board tail
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      for (let i = 0; i < (st.turboT > 0 ? 30 : 18); i++) {
        const a = rnd(-1.1, 1.1);
        const r = rnd(2, ps * (st.turboT > 0 ? 0.55 : 0.38));
        ctx.globalAlpha = rnd(0.25, 0.8);
        ctx.beginPath();
        ctx.arc(
          px + Math.sin(a) * r * 1.9,
          pyy + ps * 0.58 + Math.abs(Math.cos(a)) * r * 0.5,
          rnd(2, 7),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      // drifting side bubbles
      for (let i = 0; i < 4; i++) {
        const t = (st.time * 0.7 + i * 0.73) % 1;
        ctx.globalAlpha = 0.35 * (1 - t);
        ctx.beginPath();
        ctx.arc(
          px + (i % 2 === 0 ? -1 : 1) * ps * (0.55 + i * 0.09),
          pyy + ps * (0.5 - t * 0.5),
          ps * 0.035 * (1 + t),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (st.magnetT > 0) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,80,110,0.68)";
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 8]);
        for (let i = 0; i < 3; i++) {
          const r = ps * (0.55 + i * 0.18 + Math.sin(st.time * 5 + i) * 0.03);
          ctx.beginPath();
          ctx.ellipse(px, pyy - ps * 0.12, r, r * 0.42, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      const blink = st.invulnT > 0 && Math.floor(st.time * 10) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(px, pyy);
        ctx.rotate(tilt);

        const by = ps * 0.16; // board center offset below player origin

        // water shadow under board
        ctx.fillStyle = "rgba(6,60,110,0.18)";
        ctx.beginPath();
        ctx.ellipse(0, by + ps * 0.06, ps * 0.21, ps * 0.46, 0, 0, Math.PI * 2);
        ctx.fill();

        // surfboard: narrow nose pointing away, rounded wide tail
        const bg = ctx.createLinearGradient(-ps * 0.2, 0, ps * 0.2, 0);
        bg.addColorStop(0, "#fbf6e8");
        bg.addColorStop(0.5, "#fdf9ee");
        bg.addColorStop(1, "#e7d9b8");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(0, by - ps * 0.47);
        ctx.bezierCurveTo(ps * 0.10, by - ps * 0.40, ps * 0.17, by - ps * 0.12, ps * 0.165, by + ps * 0.10);
        ctx.bezierCurveTo(ps * 0.16, by + ps * 0.32, ps * 0.10, by + ps * 0.44, 0, by + ps * 0.44);
        ctx.bezierCurveTo(-ps * 0.10, by + ps * 0.44, -ps * 0.16, by + ps * 0.32, -ps * 0.165, by + ps * 0.10);
        ctx.bezierCurveTo(-ps * 0.17, by - ps * 0.12, -ps * 0.10, by - ps * 0.40, 0, by - ps * 0.47);
        ctx.fill();

        // orange center stripe, tapering with the board
        const sg = ctx.createLinearGradient(0, by - ps * 0.4, 0, by + ps * 0.4);
        sg.addColorStop(0, "#ffc14f");
        sg.addColorStop(1, "#ef8f21");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(0, by - ps * 0.43);
        ctx.bezierCurveTo(ps * 0.05, by - ps * 0.3, ps * 0.06, by, ps * 0.05, by + ps * 0.2);
        ctx.bezierCurveTo(ps * 0.045, by + ps * 0.34, ps * 0.02, by + ps * 0.385, 0, by + ps * 0.385);
        ctx.bezierCurveTo(-ps * 0.02, by + ps * 0.385, -ps * 0.045, by + ps * 0.34, -ps * 0.05, by + ps * 0.2);
        ctx.bezierCurveTo(-ps * 0.06, by, -ps * 0.05, by - ps * 0.3, 0, by - ps * 0.43);
        ctx.fill();
        // gloss highlight along the rail
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = ps * 0.014;
        ctx.beginPath();
        ctx.moveTo(-ps * 0.105, by - ps * 0.28);
        ctx.quadraticCurveTo(-ps * 0.135, by + ps * 0.02, -ps * 0.11, by + ps * 0.3);
        ctx.stroke();

        // soft shadow where the surfer stands
        ctx.fillStyle = "rgba(90,60,20,0.14)";
        ctx.beginPath();
        ctx.ellipse(0, by - ps * 0.02, ps * 0.14, ps * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();

        // ----- surfer (back view) -----
        const fy = by - ps * 0.03; // foot line on the deck
        const skin = ctx.createLinearGradient(-ps * 0.18, 0, ps * 0.18, 0);
        skin.addColorStop(0, "#e8ab70");
        skin.addColorStop(0.55, "#d3935a");
        skin.addColorStop(1, "#b97a45");

        // legs: knees slightly bent, feet apart (surf stance)
        ctx.strokeStyle = skin;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = ps * 0.088;
        ctx.beginPath();
        ctx.moveTo(-ps * 0.065, fy - ps * 0.30);
        ctx.lineTo(-ps * 0.098, fy - ps * 0.15);
        ctx.lineTo(-ps * 0.085, fy - ps * 0.01);
        ctx.moveTo(ps * 0.065, fy - ps * 0.30);
        ctx.lineTo(ps * 0.102, fy - ps * 0.14);
        ctx.lineTo(ps * 0.09, fy + ps * 0.02);
        ctx.stroke();

        // feet
        ctx.fillStyle = "#c4854a";
        ctx.beginPath();
        ctx.ellipse(-ps * 0.085, fy + ps * 0.005, ps * 0.048, ps * 0.028, -0.2, 0, Math.PI * 2);
        ctx.ellipse(ps * 0.09, fy + ps * 0.035, ps * 0.05, ps * 0.03, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // board shorts with hem
        const short = ctx.createLinearGradient(-ps * 0.15, 0, ps * 0.15, 0);
        short.addColorStop(0, "#ff9350");
        short.addColorStop(0.5, "#f2762e");
        short.addColorStop(1, "#d55a1a");
        ctx.fillStyle = short;
        ctx.beginPath();
        ctx.moveTo(-ps * 0.112, fy - ps * 0.42);
        ctx.lineTo(ps * 0.112, fy - ps * 0.42);
        ctx.bezierCurveTo(ps * 0.135, fy - ps * 0.34, ps * 0.142, fy - ps * 0.28, ps * 0.128, fy - ps * 0.235);
        ctx.lineTo(ps * 0.038, fy - ps * 0.255);
        ctx.lineTo(0, fy - ps * 0.30);
        ctx.lineTo(-ps * 0.038, fy - ps * 0.255);
        ctx.lineTo(-ps * 0.128, fy - ps * 0.235);
        ctx.bezierCurveTo(-ps * 0.142, fy - ps * 0.28, -ps * 0.135, fy - ps * 0.34, -ps * 0.112, fy - ps * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(130,45,0,0.35)";
        ctx.fillRect(-ps * 0.112, fy - ps * 0.43, ps * 0.224, ps * 0.025);

        // torso: shoulders wider than waist, subtle spine shading
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.moveTo(-ps * 0.10, fy - ps * 0.42);
        ctx.bezierCurveTo(-ps * 0.115, fy - ps * 0.52, -ps * 0.135, fy - ps * 0.60, -ps * 0.13, fy - ps * 0.66);
        ctx.quadraticCurveTo(0, fy - ps * 0.73, ps * 0.13, fy - ps * 0.66);
        ctx.bezierCurveTo(ps * 0.135, fy - ps * 0.60, ps * 0.115, fy - ps * 0.52, ps * 0.10, fy - ps * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(120,70,30,0.22)";
        ctx.lineWidth = ps * 0.012;
        ctx.beginPath();
        ctx.moveTo(0, fy - ps * 0.47);
        ctx.lineTo(0, fy - ps * 0.62);
        ctx.stroke();

        // arms: spread wide, raised at the wrists for balance
        ctx.strokeStyle = skin;
        ctx.lineWidth = ps * 0.062;
        ctx.beginPath();
        ctx.moveTo(-ps * 0.115, fy - ps * 0.64);
        ctx.lineTo(-ps * 0.24, fy - ps * 0.68);
        ctx.lineTo(-ps * 0.335, fy - ps * 0.76);
        ctx.moveTo(ps * 0.115, fy - ps * 0.64);
        ctx.lineTo(ps * 0.24, fy - ps * 0.68);
        ctx.lineTo(ps * 0.335, fy - ps * 0.76);
        ctx.stroke();
        ctx.fillStyle = "#d3935a";
        ctx.beginPath();
        ctx.arc(-ps * 0.348, fy - ps * 0.77, ps * 0.034, 0, Math.PI * 2);
        ctx.arc(ps * 0.348, fy - ps * 0.77, ps * 0.034, 0, Math.PI * 2);
        ctx.fill();

        // neck + head
        ctx.fillStyle = "#cf8f55";
        ctx.fillRect(-ps * 0.03, fy - ps * 0.77, ps * 0.06, ps * 0.07);
        const headY = fy - ps * 0.845;
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.arc(0, headY, ps * 0.096, 0, Math.PI * 2);
        ctx.fill();
        // ears
        ctx.fillStyle = "#d3935a";
        ctx.beginPath();
        ctx.arc(-ps * 0.096, headY + ps * 0.012, ps * 0.023, 0, Math.PI * 2);
        ctx.arc(ps * 0.096, headY + ps * 0.012, ps * 0.023, 0, Math.PI * 2);
        ctx.fill();
        // hair: brown back-of-head cap with a spiky crown
        const hg = ctx.createLinearGradient(0, headY - ps * 0.13, 0, headY + ps * 0.05);
        hg.addColorStop(0, "#7d5431");
        hg.addColorStop(1, "#52321a");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(0, headY - ps * 0.005, ps * 0.099, Math.PI * 0.86, Math.PI * 2.14);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-ps * 0.072, headY - ps * 0.062);
        ctx.quadraticCurveTo(-ps * 0.052, headY - ps * 0.135, -ps * 0.02, headY - ps * 0.092);
        ctx.quadraticCurveTo(0, headY - ps * 0.15, ps * 0.03, headY - ps * 0.098);
        ctx.quadraticCurveTo(ps * 0.062, headY - ps * 0.128, ps * 0.077, headY - ps * 0.058);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      // shield bubble
      if (st.shield) {
        const shieldG = ctx.createRadialGradient(px, pyy - ps * 0.2, ps * 0.1, px, pyy - ps * 0.2, ps * 0.78);
        shieldG.addColorStop(0, "rgba(139,234,255,0.08)");
        shieldG.addColorStop(0.72, "rgba(60,220,255,0.18)");
        shieldG.addColorStop(1, "rgba(60,220,255,0.02)");
        ctx.fillStyle = shieldG;
        ctx.strokeStyle = "rgba(180,245,255,0.95)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(px, pyy - ps * 0.2, ps * 0.68 + Math.sin(st.time * 6) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // turbo speed lines
      if (st.turboT > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.48)";
        for (let i = 0; i < 20; i++) {
          const y = rnd(hz, H);
          const x = Math.random() < 0.5 ? rnd(0, W * 0.26) : rnd(W * 0.74, W);
          ctx.lineWidth = rnd(2, 5);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (x < W / 2 ? -1 : 1) * rnd(8, 22), y + rnd(60, 150));
          ctx.stroke();
        }
      }

      // particles
      for (const p of st.parts) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        if (p.text) {
          ctx.font = `900 ${p.size}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = p.color;
          ctx.strokeStyle = "rgba(0,50,90,0.6)";
          ctx.lineWidth = 4;
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillText(p.text, p.x, p.y);
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    // ---------- loop ----------
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stRef.current;
      update(st, dt);
      drawScene(st);

      const next: Hud = {
        score: st.score,
        best: bestRef.current,
        level: st.level,
        turbo: Math.ceil(st.turboT),
        magnet: Math.ceil(st.magnetT),
        slow: Math.ceil(st.slowT),
        shield: st.shield,
        over: st.over,
        newBest: st.over && st.score > 0 && st.score >= bestRef.current,
      };
      const json = JSON.stringify(next);
      if (json !== hudJsonRef.current) {
        hudJsonRef.current = json;
        setHud(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPD);
      canvas.removeEventListener("pointerup", onPU);
    };
  }, []);

  return (
    <div className={styles.wrap}>
      <canvas ref={canvasRef} className={styles.canvas} />

      <div className={styles.hud}>
        <div className={styles.topRow}>
          <div className={styles.score}>
            <div className={styles.scoreMain}>SHELLS {hud.score}</div>
            <div className={styles.scoreBest}>BEST {hud.best}</div>
          </div>
          <div className={styles.rightCol}>
            <div className={`${styles.pill} ${styles.pillTurbo}`}>
              ⚡ TURBO x2
            </div>
            <div className={`${styles.pill} ${styles.pillLevel}`}>
              🔥 <span>LEVEL {hud.level}</span>
            </div>
          </div>
        </div>

        <div className={styles.banner}>
          🏁 FREE SURF — survive as long as you can
        </div>

        {(hud.turbo > 0 || hud.magnet > 0 || hud.shield || hud.slow > 0) && (
          <div className={styles.powerRow}>
            {hud.turbo > 0 && (
              <div className={`${styles.powerChip} ${styles.pillTurbo}`}>
                ⚡ {hud.turbo}s
              </div>
            )}
            {hud.magnet > 0 && (
              <div className={`${styles.powerChip} ${styles.pillMagnet}`}>
                🧲 MAGNET {hud.magnet}s
              </div>
            )}
            {hud.shield && (
              <div className={`${styles.powerChip} ${styles.pillShield}`}>
                🛡️ SHIELD
              </div>
            )}
            {hud.slow > 0 && (
              <div className={`${styles.powerChip} ${styles.pillSlow}`}>
                🌊 SLOW {hud.slow}s
              </div>
            )}
          </div>
        )}

        {showHint && !hud.over && (
          <div className={styles.hint}>
            <div className={styles.hintIcons}>☝︎ ← →</div>
            <div>SWIPE LEFT / RIGHT</div>
            <div className={styles.hintSub}>to change lanes</div>
          </div>
        )}

        {hud.over && (
          <div className={styles.overlay}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>WIPEOUT!</div>
              <div className={styles.cardEmoji}>🏄🌊</div>
              <div className={styles.cardScoreLabel}>SHELLS COLLECTED</div>
              <div className={styles.cardScore}>{hud.score}</div>
              <div className={styles.cardBest}>BEST {hud.best}</div>
              {hud.newBest && <div className={styles.newBest}>🎉 NEW BEST!</div>}
              <button className={styles.restart} onClick={restart}>
                🔄 RESTART
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
