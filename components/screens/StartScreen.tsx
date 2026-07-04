"use client";

import IdleBackdrop from "./IdleBackdrop";
import shell from "./Shell.module.css";
import styles from "./StartScreen.module.css";

export default function StartScreen({
  boardId,
  onStart,
  onCustomize,
  onHowToPlay,
}: {
  boardId: string;
  onStart: () => void;
  onCustomize: () => void;
  onHowToPlay: () => void;
}) {
  return (
    <div className={shell.wrap}>
      <div className={shell.stage}>
        <IdleBackdrop boardId={boardId} />
        <div className={styles.scrim} />

        <div className={styles.content}>
          <div className={styles.titleBlock}>
            <div className={styles.eyebrow}>ENDLESS SURFING RUNNER</div>
            <h1 className={styles.title}>SURF DRIVE</h1>
            <p className={styles.subtitle}>Ride the wave. Dodge the danger.</p>
          </div>

          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onStart}>
              <span className={styles.btnIcon}>▶</span>
              START
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onCustomize}>
              <span className={styles.btnIcon}>🏄</span>
              BOARD CUSTOMIZE
            </button>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={onHowToPlay}>
              <span className={styles.btnIcon}>?</span>
              HOW TO PLAY
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
