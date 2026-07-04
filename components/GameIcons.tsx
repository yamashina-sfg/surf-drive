"use client";

import type { SVGProps } from "react";

export type GameIconName =
  | "level"
  | "turbo"
  | "shield"
  | "magnet"
  | "wave"
  | "score"
  | "best"
  | "pause"
  | "home"
  | "restart"
  | "settings"
  | "tap"
  | "arrowLeft"
  | "arrowRight"
  | "board"
  | "play";

type Props = SVGProps<SVGSVGElement> & {
  name: GameIconName;
  title?: string;
};

export default function GameIcon({ name, title, ...props }: Props) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} {...props}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`gi-gold-${name}`} x1="16" y1="8" x2="48" y2="58">
          <stop stopColor="#FFF47A" />
          <stop offset="0.55" stopColor="#FFB41F" />
          <stop offset="1" stopColor="#F07816" />
        </linearGradient>
        <linearGradient id={`gi-blue-${name}`} x1="12" y1="6" x2="54" y2="58">
          <stop stopColor="#7DF2FF" />
          <stop offset="0.55" stopColor="#1DBDEB" />
          <stop offset="1" stopColor="#1175D6" />
        </linearGradient>
        <linearGradient id={`gi-red-${name}`} x1="14" y1="10" x2="52" y2="56">
          <stop stopColor="#FF8A76" />
          <stop offset="1" stopColor="#D52044" />
        </linearGradient>
        <linearGradient id={`gi-ink-${name}`} x1="8" y1="8" x2="56" y2="56">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#C7F4FF" />
        </linearGradient>
      </defs>
      {drawIcon(name)}
    </svg>
  );
}

function drawIcon(name: GameIconName) {
  switch (name) {
    case "turbo":
      return (
        <>
          <path d="M35 4 12 36h15l-5 24 30-37H36l8-19z" fill="url(#gi-gold-turbo)" stroke="#7B3C00" strokeWidth="3" strokeLinejoin="round" />
          <path d="M35 4 12 36h15l-5 24 30-37H36l8-19z" fill="none" stroke="#FFF7B0" strokeWidth="1.5" strokeLinejoin="round" />
        </>
      );
    case "level":
      return (
        <>
          <path d="M32 6c9 9 15 17 15 28 0 12-8 22-21 22-9 0-17-7-17-17 0-8 5-15 13-20-1 6 2 10 7 12 5-7 5-15 3-25z" fill="url(#gi-gold-level)" stroke="#642A00" strokeWidth="3" strokeLinejoin="round" />
          <path d="M31 33c5 4 8 8 8 13 0 6-4 10-10 10s-10-4-10-10c0-5 4-9 12-13z" fill="#FFF7B0" opacity="0.85" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M32 5 53 13v15c0 15-8 25-21 31C19 53 11 43 11 28V13L32 5z" fill="url(#gi-blue-shield)" stroke="#063766" strokeWidth="3" strokeLinejoin="round" />
          <path d="M32 12v37c9-5 14-12 14-22V18l-14-6z" fill="#FFFFFF" opacity="0.26" />
        </>
      );
    case "magnet":
      return (
        <>
          <path d="M17 8h12v26c0 6 3 10 8 10s8-4 8-10V8h12v27c0 14-8 23-20 23S17 49 17 35V8z" fill="url(#gi-red-magnet)" stroke="#5D1221" strokeWidth="3" strokeLinejoin="round" />
          <path d="M17 8h12v10H17zM45 8h12v10H45z" fill="#F8FDFF" />
        </>
      );
    case "wave":
      return (
        <>
          <path d="M8 43c8-20 22-30 36-26 9 3 13 11 11 19-2-7-8-9-14-6 7 1 12 6 12 13 0 8-7 14-18 14-11 0-18-6-27-14z" fill="url(#gi-blue-wave)" stroke="#064269" strokeWidth="3" strokeLinejoin="round" />
          <path d="M18 39c10-3 20-3 28 2-8 2-16 7-28-2z" fill="#FFFFFF" opacity="0.82" />
        </>
      );
    case "score":
      return (
        <>
          <path d="M32 8c13 0 23 9 23 22 0 16-14 25-23 27C23 55 9 46 9 30 9 17 19 8 32 8z" fill="url(#gi-blue-score)" stroke="#053E6D" strokeWidth="3" />
          <path d="M18 34c5-12 15-18 28-16-4 7-4 14 1 21-10 2-20 0-29-5z" fill="#F6D6FF" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M25 35c2-7 5-12 10-16M32 38c1-7 3-13 6-18" stroke="#9A66DB" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    case "best":
      return (
        <>
          <path d="M32 7 39 23l17 2-13 11 4 17-15-9-15 9 4-17L8 25l17-2 7-16z" fill="url(#gi-gold-best)" stroke="#6E3A00" strokeWidth="3" strokeLinejoin="round" />
          <path d="M32 15 36 26l11 1-8 8 2 11-9-6-9 6 2-11-8-8 11-1 4-11z" fill="#FFF6A0" opacity="0.72" />
        </>
      );
    case "pause":
      return (
        <>
          <rect x="15" y="10" width="13" height="44" rx="5" fill="url(#gi-ink-pause)" stroke="#0A3558" strokeWidth="3" />
          <rect x="36" y="10" width="13" height="44" rx="5" fill="url(#gi-ink-pause)" stroke="#0A3558" strokeWidth="3" />
        </>
      );
    case "home":
      return (
        <>
          <path d="M8 31 32 10l24 21-6 7-4-4v20H18V34l-4 4-6-7z" fill="url(#gi-blue-home)" stroke="#07395F" strokeWidth="3" strokeLinejoin="round" />
          <path d="M27 54V39h10v15" fill="#FFFFFF" opacity="0.86" />
        </>
      );
    case "restart":
      return (
        <>
          <path d="M50 23A21 21 0 1 0 53 39" fill="none" stroke="url(#gi-blue-restart)" strokeWidth="8" strokeLinecap="round" />
          <path d="M48 9v18H30z" fill="url(#gi-gold-restart)" stroke="#6A3500" strokeWidth="3" strokeLinejoin="round" />
        </>
      );
    case "settings":
      return (
        <>
          <path d="M36 6 39 15l9 2 4 8-6 7 2 9-7 6-9-3-9 3-7-6 2-9-6-7 4-8 9-2 3-9h8z" fill="url(#gi-blue-settings)" stroke="#07395F" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="32" cy="32" r="9" fill="#FFFFFF" opacity="0.9" stroke="#07395F" strokeWidth="3" />
        </>
      );
    case "tap":
      return (
        <>
          <path d="M28 8c5 0 8 3 8 8v16l4-3c3-2 7-1 8 2l5 12c2 5-1 11-7 11H29c-4 0-8-2-10-6L9 31c-2-4 2-8 6-6l6 4V16c0-5 3-8 7-8z" fill="url(#gi-ink-tap)" stroke="#093A5D" strokeWidth="3" strokeLinejoin="round" />
          <path d="M42 8c6 3 10 8 11 15M14 8C8 12 5 17 4 24" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
        </>
      );
    case "arrowLeft":
      return <path d="M36 12 16 32l20 20M18 32h32" fill="none" stroke="url(#gi-ink-arrowLeft)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />;
    case "arrowRight":
      return <path d="M28 12 48 32 28 52M46 32H14" fill="none" stroke="url(#gi-ink-arrowRight)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />;
    case "board":
      return (
        <>
          <path d="M32 5c9 9 13 21 13 31S40 59 32 59 19 46 19 36 23 14 32 5z" fill="#FFF1D2" stroke="#07395F" strokeWidth="3" />
          <path d="M32 12c4 8 6 17 6 25s-2 13-6 17c-4-4-6-9-6-17s2-17 6-25z" fill="url(#gi-gold-board)" />
        </>
      );
    case "play":
      return <path d="M20 10v44l34-22L20 10z" fill="url(#gi-gold-play)" stroke="#673600" strokeWidth="3" strokeLinejoin="round" />;
  }
}
