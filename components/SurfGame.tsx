"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Scene, initState, BEST_KEY, JUMP_DURATION, type GS, type Hud, type Kind } from "@/lib/engine";
import { hasSeenSwipeHint, markSwipeHintSeen, type BoardConfig } from "@/lib/boards";
import AnimatedNumber from "./AnimatedNumber";
import GameIcon, { type GameIconName } from "./GameIcons";
import styles from "./SurfGame.module.css";

const POWER_LABEL: Partial<Record<Kind, string>> = {
  turbo: "TURBO ACTIVATED!",
  magnet: "MAGNET ON!",
  shield: "SHIELD UP!",
  slow: "SLOW WAVE!",
};
const POWER_ICON: Partial<Record<Kind, GameIconName>> = {
  turbo: "turbo",
  magnet: "magnet",
  shield: "shield",
  slow: "wave",
};

export default function SurfGame({
  board,
  onHome,
  onChangeBoard,
}: {
  board: BoardConfig;
  onHome: () => void;
  onChangeBoard: () => void;
}) {
  const stRef = useRef<GS>(initState());
  const bestRef = useRef({ v: 0 });
  const [hud, setHud] = useState<Hud>({
    score: 0, best: 0, level: 1, turbo: 0, magnet: 0, slow: 0,
    shield: false, over: false, newBest: false, progress: 0, levelUp: false, pickup: null,
    countdown: null, speedFactor: 1, scoreMultiplier: 1,
  });
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    bestRef.current.v = Number(localStorage.getItem(BEST_KEY) || 0);
    setShowHint(!hasSeenSwipeHint());
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const debugWindow = window as Window & { __surfDriveState?: React.RefObject<GS> };
    debugWindow.__surfDriveState = stRef;
    return () => {
      delete debugWindow.__surfDriveState;
    };
  }, []);

  const restart = () => {
    stRef.current = initState();
  };

  const move = (dir: -1 | 1) => {
    const st = stRef.current;
    if (st.over) return;
    if (!st.started) {
      st.started = true;
      st.countdownT = 3.65;
      setShowHint(false);
      markSwipeHintSeen();
      return;
    }
    if (st.countdownT > 0) return;
    const nextLane = Math.max(-1, Math.min(1, st.playerLane + dir));
    if (nextLane !== st.playerLane) {
      st.laneCarve = { dir, from: st.playerLane, to: nextLane, at: st.time };
      st.playerLane = nextLane;
    }
    if (showHint) {
      setShowHint(false);
      markSwipeHintSeen();
    }
  };

  const jump = () => {
    const st = stRef.current;
    if (st.over) return;
    if (!st.started) {
      st.started = true;
      st.countdownT = 3.65;
      setShowHint(false);
      markSwipeHintSeen();
      return;
    }
    if (st.countdownT > 0 || st.jumpT > 0) return;
    st.jumpT = JUMP_DURATION;
    if (showHint) {
      setShowHint(false);
      markSwipeHintSeen();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") move(-1);
      else if (e.key === "ArrowRight" || e.key === "d") move(1);
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") jump();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const px0 = useRef(0);
  const py0 = useRef(0);
  const pDown = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    px0.current = e.clientX;
    py0.current = e.clientY;
    pDown.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic/test pointer events may not have an active native pointer.
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!pDown.current) return;
    pDown.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Pointer may already have been released by the browser.
    }
    const dx = e.clientX - px0.current;
    const dy = e.clientY - py0.current;
    if (dy < -28 && Math.abs(dy) > Math.abs(dx) * 0.75) jump();
    else if (Math.abs(dx) > 24) move(dx > 0 ? 1 : -1);
    else {
      const bounds = e.currentTarget.getBoundingClientRect();
      move(e.clientX > bounds.left + bounds.width / 2 ? 1 : -1);
    }
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    pDown.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Pointer may already have been released by the browser.
    }
  };

  const bestShown = Math.max(0, hud.best);
  const pickupLabel = hud.pickup ? POWER_LABEL[hud.pickup] : null;
  const pickupIcon = hud.pickup ? POWER_ICON[hud.pickup] : null;

  // ゲームオーバー背景の水しぶき（衝突演出）。over遷移時に一度だけ位置を決める。
  const splashDrops = useMemo(() => {
    if (!hud.over) return [];
    return Array.from({ length: 14 }, (_, i) => ({
      left: 6 + ((i * 37) % 90),
      delay: (i % 7) * 0.05,
      duration: 0.7 + (i % 4) * 0.15,
    }));
  }, [hud.over]);

  return (
    <div className={styles.wrap}>
      <div
        className={styles.stage}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <Canvas
          className={styles.canvas}
          dpr={[1, 1.5]}
          camera={{ fov: 60, near: 0.1, far: 400, position: [0, 3.1, 5.4] }}
          gl={{ antialias: true }}
        >
          <Scene stRef={stRef} bestRef={bestRef} board={board} onHud={setHud} />
        </Canvas>

        <div className={`${styles.speedLines} ${hud.turbo > 0 ? styles.speedLinesTurbo : ""}`} />
        {hud.turbo > 0 && <div className={styles.turboWash} />}

        <div className={styles.hud}>
          <div className={styles.topRow}>
            <div className={styles.score}>
              <div className={styles.scorePanel}>
                <span className={`${styles.iconBadge} ${styles.iconBadgeScore}`}>
                  <GameIcon name="score" />
                </span>
                <span>
                  <span className={styles.scoreLabel}>SHELLS</span>
                  <span className={styles.scoreMain}><AnimatedNumber value={hud.score} /></span>
                </span>
              </div>
              <div className={styles.bestPanel}>
                <GameIcon name="best" />
                <span>BEST {bestShown}</span>
              </div>
            </div>
            <div className={styles.rightCol}>
              <div className={`${styles.pill} ${styles.pillLevel}`}>
                <GameIcon name="level" />
                <span>LEVEL {hud.level}</span>
              </div>
              <div className={styles.multiplier}>SPEED ×{hud.speedFactor.toFixed(2)} · SCORE ×{hud.scoreMultiplier.toFixed(1)}</div>
              {hud.turbo > 0 && <div className={`${styles.pill} ${styles.pillTurbo}`}><GameIcon name="turbo" /> TURBO {hud.turbo}s</div>}
              {hud.magnet > 0 && <div className={`${styles.pill} ${styles.pillMagnet}`}><GameIcon name="magnet" /> MAGNET {hud.magnet}s</div>}
              {hud.shield && <div className={`${styles.pill} ${styles.pillShield}`}><GameIcon name="shield" /> SHIELD</div>}
              {hud.slow > 0 && <div className={`${styles.pill} ${styles.pillSlow}`}><GameIcon name="wave" /> SLOW {hud.slow}s</div>}
            </div>
          </div>

          <div className={styles.centerTop}>
            <div className={styles.waveMeter}>
              <span className={styles.waveIcon}><GameIcon name="wave" /></span>
              <span className={styles.waveTrack}>
                <span
                  className={styles.waveFill}
                  style={{ width: `${18 + hud.progress * 68}%` }}
                />
              </span>
            </div>
          </div>

          <div className={styles.banner}>
            <div>FREE SURF</div>
            <div className={styles.bannerSub}>survive as long as you can</div>
          </div>

          {hud.levelUp && (
            <div className={styles.levelUpToast}>
              <span className={styles.levelUpBig}>LEVEL {hud.level}</span>
              <span className={styles.levelUpSub}>SPEED UP</span>
            </div>
          )}

          {hud.countdown && (
            <div className={`${styles.countdown} ${hud.countdown === "SURF!" ? styles.countdownSurf : ""}`}>
              {hud.countdown}
            </div>
          )}

          {pickupLabel && (
            <div className={styles.pickupBanner}>
              {pickupIcon && <GameIcon name={pickupIcon} className={styles.pickupIcon} />}
              {pickupLabel}
            </div>
          )}

          {showHint && !hud.over && (
            <div className={styles.hint}>
              <GameIcon name="tap" className={styles.hintHand} />
              <div className={styles.hintCopy}>
                <div className={styles.hintArrows}>
                  <GameIcon name="arrowLeft" />
                  <GameIcon name="arrowRight" />
                </div>
                <div>SWIPE LEFT / RIGHT</div>
                <div className={styles.hintSub}>change lanes · swipe up to jump logs</div>
              </div>
            </div>
          )}

          {hud.over && (
            <div className={styles.overlay}>
              {splashDrops.map((d, i) => (
                <span
                  key={i}
                  className={styles.splashDrop}
                  style={{ left: `${d.left}%`, animationDelay: `${d.delay}s`, animationDuration: `${d.duration}s` }}
                />
              ))}
              <div className={styles.card}>
                <div className={styles.cardTitle}>WIPEOUT!</div>
                <div className={styles.cardIcon}><GameIcon name="wave" /></div>
                <div className={styles.cardScoreLabel}>FINAL SCORE</div>
                <div className={styles.cardScore}><AnimatedNumber value={hud.score} /></div>
                <div className={styles.cardBest}>BEST {bestShown}</div>
                {hud.newBest && <div className={styles.newBest}><GameIcon name="best" /> NEW BEST!</div>}
                <button className={styles.restart} onClick={restart}><GameIcon name="restart" /> RESTART</button>
                <div className={styles.cardRow}>
                  <button className={styles.cardSecondary} onClick={onChangeBoard}><GameIcon name="board" /> CHANGE BOARD</button>
                  <button className={styles.cardSecondary} onClick={onHome}><GameIcon name="home" /> HOME</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
