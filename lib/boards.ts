// ---------- surfboard data + persistence ----------
//
// ボードは見た目（色・柄）とゲームプレイに小さく効くステータスを持つ。
// 最初から全ボード解放済み。選択状態は localStorage に保存する。

export type BoardPattern = "solid" | "stripe" | "wave" | "bolt" | "sunset";
export type BoardRarity = "Common" | "Rare" | "Epic" | "Legendary";

export interface BoardConfig {
  id: string;
  name: string;
  rarity: BoardRarity;
  color: string;
  stripeColor: string;
  pattern: BoardPattern;
  /** 1-5 のフレーバーステータス。効果は小さめに抑え、バランスを壊さない。 */
  speed: number;
  handling: number;
  magnetRange: number;
  shieldBonus: number;
}

export const BOARDS: BoardConfig[] = [
  {
    id: "classic-orange",
    name: "Classic Orange",
    rarity: "Common",
    color: "#f7efdc",
    stripeColor: "#f28a1e",
    pattern: "stripe",
    speed: 3,
    handling: 3,
    magnetRange: 3,
    shieldBonus: 3,
  },
  {
    id: "ocean-blue",
    name: "Ocean Blue",
    rarity: "Common",
    color: "#eaf7ff",
    stripeColor: "#1a9be0",
    pattern: "wave",
    speed: 3,
    handling: 4,
    magnetRange: 3,
    shieldBonus: 2,
  },
  {
    id: "tropical-green",
    name: "Tropical Green",
    rarity: "Rare",
    color: "#f2fbe9",
    stripeColor: "#2f9e44",
    pattern: "wave",
    speed: 2,
    handling: 3,
    magnetRange: 5,
    shieldBonus: 3,
  },
  {
    id: "sunset-red",
    name: "Sunset Red",
    rarity: "Rare",
    color: "#fff1e6",
    stripeColor: "#e6483a",
    pattern: "sunset",
    speed: 4,
    handling: 2,
    magnetRange: 2,
    shieldBonus: 4,
  },
  {
    id: "lightning-yellow",
    name: "Lightning Yellow",
    rarity: "Legendary",
    color: "#fffbe8",
    stripeColor: "#ffc400",
    pattern: "bolt",
    speed: 5,
    handling: 4,
    magnetRange: 2,
    shieldBonus: 2,
  },
];

export const DEFAULT_BOARD_ID = BOARDS[0].id;

const BOARD_STORAGE_KEY = "surf-drive-board";
const SEEN_HINT_KEY = "surf-drive-seen-hint";

export function getBoardById(id: string | null | undefined): BoardConfig {
  return BOARDS.find((b) => b.id === id) ?? BOARDS[0];
}

export function loadSavedBoard(): BoardConfig {
  if (typeof window === "undefined") return getBoardById(DEFAULT_BOARD_ID);
  try {
    return getBoardById(window.localStorage.getItem(BOARD_STORAGE_KEY));
  } catch {
    return getBoardById(DEFAULT_BOARD_ID);
  }
}

export function saveBoardChoice(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BOARD_STORAGE_KEY, id);
  } catch {
    // localStorage が使えない環境（プライベートモード等）では無視する
  }
}

export function hasSeenSwipeHint(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SEEN_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

export function markSwipeHintSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_HINT_KEY, "1");
  } catch {
    // ignore
  }
}
