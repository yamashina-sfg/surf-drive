"use client";

import { useEffect, useState } from "react";
import { getBoardById, loadSavedBoard, type BoardConfig } from "@/lib/boards";
import StartScreen from "./screens/StartScreen";
import BoardSelectScreen from "./screens/BoardSelectScreen";
import HowToPlayScreen from "./screens/HowToPlayScreen";
import SurfGame from "./SurfGame";

type Screen = "start" | "board" | "how" | "game";

export default function GameApp() {
  const [screen, setScreen] = useState<Screen>("start");
  const [board, setBoard] = useState<BoardConfig | null>(null);

  useEffect(() => {
    setBoard(loadSavedBoard());
  }, []);

  if (!board) return null; // localStorage 読み込み待ち（一瞬）

  switch (screen) {
    case "board":
      return (
        <BoardSelectScreen
          currentBoardId={board.id}
          onBack={() => setScreen("start")}
          onSelect={(id) => setBoard(getBoardById(id))}
        />
      );
    case "how":
      return <HowToPlayScreen boardId={board.id} onBack={() => setScreen("start")} />;
    case "game":
      return (
        <SurfGame
          key={board.id}
          board={board}
          onHome={() => setScreen("start")}
          onChangeBoard={() => setScreen("board")}
        />
      );
    default:
      return (
        <StartScreen
          boardId={board.id}
          onStart={() => setScreen("game")}
          onCustomize={() => setScreen("board")}
          onHowToPlay={() => setScreen("how")}
        />
      );
  }
}
