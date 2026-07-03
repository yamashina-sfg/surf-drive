# 🏄 Surf Drive — Endless Surfing Runner

A mobile-first, pseudo-3D endless surfing runner built with Next.js + TypeScript.
Ride the waves, collect fish / shells / stars, and dodge rocks, driftwood, crates, buoys, shark fins and jellyfish!

## Play

- **Mobile**: swipe left / right to change lanes (tap left/right side also works)
- **PC**: `←` / `→` (or `A` / `D`) keys

## Features

- 3-lane pseudo-3D perspective rendering on HTML5 Canvas (60fps)
- Collectibles: 🐟 🐠 🐚 ⭐ — obstacles: 🪨 🪵 📦 🛟 🦈 🪼
- Power-ups: ⚡ TURBO (speed + 2x score) · 🧲 MAGNET · 🛡️ SHIELD · 🌊 SLOW WAVE
- Speed and difficulty scale with level over time
- Best score saved in localStorage
- Portrait / mobile optimized (safe-area aware, no scroll bounce)

## Development

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
```

## Stack

- Next.js (App Router) + TypeScript
- CSS Modules
- HTML5 Canvas (no game engine, zero extra dependencies)
