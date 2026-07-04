"use client";

import { useState } from "react";
import { BOARDS, saveBoardChoice, type BoardConfig } from "@/lib/boards";
import IdleBackdrop from "./IdleBackdrop";
import GameIcon from "../GameIcons";
import shell from "./Shell.module.css";
import styles from "./BoardSelectScreen.module.css";

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statDots}>
        {Array.from({ length: 5 }).map((_, i) => (
          <i key={i} className={i < value ? styles.dotFilled : styles.dotEmpty} />
        ))}
      </span>
    </div>
  );
}

function BoardPreview({ board }: { board: BoardConfig }) {
  return (
    <div
      className={`${styles.preview} ${styles["pattern_" + board.pattern]}`}
      style={
        {
          "--board-color": board.color,
          "--stripe-color": board.stripeColor,
        } as React.CSSProperties
      }
    >
      <span className={styles.previewStripe} />
    </div>
  );
}

export default function BoardSelectScreen({
  currentBoardId,
  onBack,
  onSelect,
}: {
  currentBoardId: string;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  const [selected, setSelected] = useState(currentBoardId);

  const choose = (id: string) => {
    setSelected(id);
    saveBoardChoice(id);
    onSelect(id);
  };

  return (
    <div className={shell.wrap}>
      <div className={shell.stage}>
        <IdleBackdrop boardId={selected} />
        <div className={styles.scrim} />

        <div className={styles.content}>
          <header className={styles.header}>
            <button className={styles.backBtn} onClick={onBack} aria-label="Back">
              <GameIcon name="arrowLeft" />
            </button>
            <h1 className={styles.title}>BOARD CUSTOMIZE</h1>
            <span className={styles.headerSpacer} />
          </header>

          <div className={styles.grid}>
            {BOARDS.map((board) => {
              const isSelected = board.id === selected;
              return (
                <button
                  key={board.id}
                  className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
                  onClick={() => choose(board.id)}
                >
                  <div className={styles.cardTop}>
                    <BoardPreview board={board} />
                    <span className={`${styles.rarity} ${styles["rarity_" + board.rarity]}`}>
                      {board.rarity}
                    </span>
                  </div>
                  <div className={styles.cardName}>{board.name}</div>
                  <div className={styles.stats}>
                    <StatBar label="Speed" value={board.speed} />
                    <StatBar label="Handling" value={board.handling} />
                    <StatBar label="Magnet" value={board.magnetRange} />
                    <StatBar label="Shield" value={board.shieldBonus} />
                  </div>
                  <div className={styles.selectTag}>{isSelected ? "✓ SELECTED" : "SELECT"}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
