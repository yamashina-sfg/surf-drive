"use client";

import IdleBackdrop from "./IdleBackdrop";
import GameIcon from "../GameIcons";
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
              <GameIcon name="play" className={styles.btnIcon} />
              START
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onCustomize}>
              <GameIcon name="board" className={styles.btnIcon} />
              BOARD CUSTOMIZE
            </button>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={onHowToPlay}>
              <GameIcon name="settings" className={styles.btnIcon} />
              HOW TO PLAY
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
