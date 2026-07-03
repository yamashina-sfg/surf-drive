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
  running: boolean;
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
    running: true,
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
    const horizonY = () => H * 0.3;
    const playerY = () => H * 0.74;
    const laneHalf = () => Math.min(W * 0.3, 150);
    const projY = (z: number) => horizonY() + (playerY() - horizonY()) / z;
    const projX = (lane: number, z: number) =>
      W / 2 + (lane * laneHalf()) / z;
    const objSize = () => Math.min(W * 0.17, 74);

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
    const drawScene = (st: GS) => {
      const hz = horizonY();
      const py = playerY();

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, "#3fb2f0");
      sky.addColorStop(1, "#bfeaff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, hz + 2);

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
      sea.addColorStop(0, "#5ecdf2");
      sea.addColorStop(0.5, "#1f97e0");
      sea.addColorStop(1, "#0f79c9");
      ctx.fillStyle = sea;
      ctx.fillRect(0, hz, W, H - hz);

      // distant islands
      for (const [ix, iw, ih] of [
        [W * 0.1, W * 0.34, 26],
        [W * 0.92, W * 0.4, 30],
      ] as const) {
        ctx.fillStyle = "#e9d8a6";
        ctx.beginPath();
        ctx.ellipse(ix, hz + 3, iw / 2, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2d9d4f";
        ctx.beginPath();
        ctx.ellipse(ix, hz - 4, iw / 2.4, ih / 2, 0, 0, Math.PI, true);
        ctx.fill();
        ctx.font = "22px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText("🌴", ix - iw * 0.12, hz - 6);
        ctx.fillText("🌴", ix + iw * 0.15, hz - 2);
      }

      // lane wake bands (foam trails)
      for (const lane of [-1, 0, 1]) {
        const half = 0.34;
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.beginPath();
        ctx.moveTo(projX(lane - half, SPAWN_Z), projY(SPAWN_Z));
        ctx.lineTo(projX(lane + half, SPAWN_Z), projY(SPAWN_Z));
        ctx.lineTo(projX(lane + half, 0.8), projY(0.8));
        ctx.lineTo(projX(lane - half, 0.8), projY(0.8));
        ctx.closePath();
        ctx.fill();
      }

      // animated foam streaks racing toward viewer
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineCap = "round";
      const phase = st.dist % 2;
      for (const lane of [-1, 0, 1]) {
        for (let i = 0; i < 12; i++) {
          const z = 1 + i * 2 - phase * 2 + 2;
          if (z < 0.9 || z > SPAWN_Z) continue;
          const off = (i % 2 === 0 ? -0.22 : 0.22) * (lane === 0 ? 1 : lane);
          const x = projX(lane + off, z);
          const y1 = projY(z);
          const y2 = projY(Math.max(0.9, z - 0.5));
          ctx.lineWidth = Math.max(1, 5 / z);
          ctx.globalAlpha = Math.min(0.55, 1.6 / z);
          ctx.beginPath();
          ctx.moveTo(x, y1);
          ctx.lineTo(projX(lane + off, Math.max(0.9, z - 0.5)), y2);
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
            const s = Math.min(140, (size * 2.1) / d.z);
            const x = projX(d.side * 2.35, d.z);
            const y = projY(d.z);
            ctx.font = `${s}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(d.emoji, x, y + s * 0.15);
          },
        });
      }

      for (const o of st.objs) {
        drawables.push({
          z: o.z,
          draw: () => {
            const s = Math.min(size, (size * 1.05) / o.z);
            const x = projX(o.lane, o.z);
            const bobY = Math.sin(st.time * 3 + o.bob) * s * 0.08;
            const y = projY(o.z) + bobY;
            if (POWERUPS.includes(o.kind)) {
              // glowing badge behind power-ups
              const g = ctx.createRadialGradient(x, y - s * 0.4, 2, x, y - s * 0.4, s * 0.9);
              g.addColorStop(0, "rgba(120,220,255,0.95)");
              g.addColorStop(1, "rgba(120,220,255,0)");
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(x, y - s * 0.4, s * 0.9, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "#1a9be0";
              ctx.beginPath();
              ctx.arc(x, y - s * 0.4, s * 0.62, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = Math.max(1.5, s * 0.07);
              ctx.stroke();
            }
            ctx.save();
            ctx.shadowColor = "rgba(0,40,80,0.35)";
            ctx.shadowBlur = s * 0.12;
            ctx.shadowOffsetY = s * 0.08;
            ctx.font = `${s}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(EMOJI[o.kind], x, y - s * 0.42);
            ctx.restore();
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

      // spray behind the board
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < 10; i++) {
        const a = rnd(-0.5, 0.5);
        const r = rnd(4, ps * 0.45);
        ctx.globalAlpha = rnd(0.2, 0.7);
        ctx.beginPath();
        ctx.arc(px + Math.sin(a) * r * 1.6, pyy + ps * 0.28 + Math.cos(a) * r * 0.4, rnd(2, 6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const blink = st.invulnT > 0 && Math.floor(st.time * 10) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(px, pyy);
        ctx.rotate(tilt);

        // board
        ctx.fillStyle = "#fdf6e3";
        ctx.beginPath();
        ctx.ellipse(0, ps * 0.16, ps * 0.16, ps * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff9f1c";
        ctx.beginPath();
        ctx.ellipse(0, ps * 0.16, ps * 0.055, ps * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();

        // legs
        ctx.strokeStyle = "#c68642";
        ctx.lineWidth = ps * 0.075;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-ps * 0.07, ps * 0.13);
        ctx.lineTo(-ps * 0.06, -ps * 0.05);
        ctx.moveTo(ps * 0.08, ps * 0.1);
        ctx.lineTo(ps * 0.06, -ps * 0.05);
        ctx.stroke();

        // shorts
        ctx.fillStyle = "#ff6b35";
        ctx.beginPath();
        ctx.roundRect(-ps * 0.11, -ps * 0.16, ps * 0.22, ps * 0.14, ps * 0.04);
        ctx.fill();

        // torso
        ctx.fillStyle = "#d99058";
        ctx.beginPath();
        ctx.roundRect(-ps * 0.1, -ps * 0.38, ps * 0.2, ps * 0.24, ps * 0.07);
        ctx.fill();

        // arms out
        ctx.strokeStyle = "#d99058";
        ctx.lineWidth = ps * 0.06;
        ctx.beginPath();
        ctx.moveTo(-ps * 0.09, -ps * 0.3);
        ctx.lineTo(-ps * 0.3, -ps * 0.36);
        ctx.moveTo(ps * 0.09, -ps * 0.3);
        ctx.lineTo(ps * 0.3, -ps * 0.36);
        ctx.stroke();

        // head + hair
        ctx.fillStyle = "#e8a86c";
        ctx.beginPath();
        ctx.arc(0, -ps * 0.47, ps * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6b3f23";
        ctx.beginPath();
        ctx.arc(0, -ps * 0.5, ps * 0.085, Math.PI * 0.95, Math.PI * 2.05);
        ctx.fill();

        ctx.restore();
      }

      // shield bubble
      if (st.shield) {
        ctx.strokeStyle = "rgba(60,220,255,0.9)";
        ctx.fillStyle = "rgba(60,220,255,0.14)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, pyy - ps * 0.15, ps * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // turbo speed lines
      if (st.turboT > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const y = rnd(hz, H);
          const x = Math.random() < 0.5 ? rnd(0, W * 0.18) : rnd(W * 0.82, W);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + rnd(30, 80));
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
            <div className={styles.scoreMain}>🐚 {hud.score}</div>
            <div className={styles.scoreBest}>BEST {hud.best}</div>
          </div>
          <div className={styles.rightCol}>
            <div className={`${styles.pill} ${styles.pillLevel}`}>
              🔥 <span>LEVEL {hud.level}</span>
            </div>
            {hud.turbo > 0 && (
              <div className={`${styles.pill} ${styles.pillTurbo}`}>
                ⚡ TURBO x2 · {hud.turbo}s
              </div>
            )}
            {hud.magnet > 0 && (
              <div className={`${styles.pill} ${styles.pillMagnet}`}>
                🧲 MAGNET · {hud.magnet}s
              </div>
            )}
            {hud.shield && (
              <div className={`${styles.pill} ${styles.pillShield}`}>
                🛡️ SHIELD
              </div>
            )}
            {hud.slow > 0 && (
              <div className={`${styles.pill} ${styles.pillSlow}`}>
                🌊 SLOW WAVE · {hud.slow}s
              </div>
            )}
          </div>
        </div>

        <div className={styles.banner}>
          🏁 FREE SURF — survive as long as you can
        </div>

        {showHint && !hud.over && (
          <div className={styles.hint}>
            👆 ← → SWIPE LEFT / RIGHT
            <div className={styles.hintSub}>to change lanes</div>
          </div>
        )}

        {hud.over && (
          <div className={styles.overlay}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>WIPEOUT!</div>
              <div className={styles.cardEmoji}>🏄🌊</div>
              <div className={styles.cardScoreLabel}>SHELLS COLLECTED</div>
              <div className={styles.cardScore}>🐚 {hud.score}</div>
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
