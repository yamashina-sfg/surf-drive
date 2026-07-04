"use client";

import IdleBackdrop from "./IdleBackdrop";
import shell from "./Shell.module.css";
import styles from "./HowToPlayScreen.module.css";

const STEPS: { icon: string; title: string; body: string }[] = [
  {
    icon: "↔",
    title: "Swipe or press ← →",
    body: "Switch lanes to steer your board left and right across the surf.",
  },
  {
    icon: "🐚",
    title: "Collect shells & fish",
    body: "Every pickup adds to your score. Chain lanes full of collectibles for big totals.",
  },
  {
    icon: "🪨",
    title: "Dodge obstacles",
    body: "Rocks, crates, buoys and fins end your run on contact — there's always a clear lane.",
  },
  {
    icon: "⚡",
    title: "Grab power-ups",
    body: "TURBO doubles your score and speed, MAGNET pulls in nearby items, SHIELD blocks one hit, and SLOW WAVE calms the pace.",
  },
];

export default function HowToPlayScreen({ boardId, onBack }: { boardId: string; onBack: () => void }) {
  return (
    <div className={shell.wrap}>
      <div className={shell.stage}>
        <IdleBackdrop boardId={boardId} />
        <div className={styles.scrim} />

        <div className={styles.content}>
          <header className={styles.header}>
            <button className={styles.backBtn} onClick={onBack} aria-label="Back">
              ←
            </button>
            <h1 className={styles.title}>HOW TO PLAY</h1>
            <span className={styles.headerSpacer} />
          </header>

          <div className={styles.list}>
            {STEPS.map((s) => (
              <div className={styles.step} key={s.title}>
                <div className={styles.stepIcon}>{s.icon}</div>
                <div>
                  <div className={styles.stepTitle}>{s.title}</div>
                  <div className={styles.stepBody}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>

          <button className={styles.gotIt} onClick={onBack}>
            GOT IT
          </button>
        </div>
      </div>
    </div>
  );
}
