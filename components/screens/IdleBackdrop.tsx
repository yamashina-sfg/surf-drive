"use client";

import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Scene, initState, type GS } from "@/lib/engine";
import { getBoardById } from "@/lib/boards";
import styles from "./IdleBackdrop.module.css";

/**
 * メニュー画面（スタート／ボード選択／遊び方）の背景として使う、
 * 実際のゲームと同じ3Dシーンの「静止デモ」版。
 * st.started は常に false のままなので、update() 内のスポーン処理などは走らない＝軽量。
 */
export default function IdleBackdrop({ boardId }: { boardId?: string }) {
  const stRef = useRef<GS>(initState());
  const bestRef = useRef({ v: 0 });
  const board = getBoardById(boardId);

  return (
    <div className={styles.wrap} aria-hidden="true">
      <Canvas
        className={styles.canvas}
        dpr={[1, 1.5]}
        camera={{ fov: 60, near: 0.1, far: 400, position: [0, 3.1, 5.4] }}
        gl={{ antialias: true }}
      >
        <Scene stRef={stRef} bestRef={bestRef} board={board} idle />
      </Canvas>
    </div>
  );
}
