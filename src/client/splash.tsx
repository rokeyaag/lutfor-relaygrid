import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitGameResponse } from '../shared/api';
import { getPuzzleNumber, getUtcDateKey } from '../shared/relaygrid';

type SplashStats = {
  puzzleNumber: number;
  dateKey: string;
  parMirrors: number;
  difficulty: string;
  totalSolvers: number;
  streak: number;
  alreadySolved: boolean;
};

export const Splash = () => {
  const todayKey = getUtcDateKey();
  const [info, setInfo] = useState<SplashStats>({
    puzzleNumber: getPuzzleNumber(todayKey),
    dateKey: todayKey,
    parMirrors: 3,
    difficulty: 'Daily',
    totalSolvers: 0,
    streak: 0,
    alreadySolved: false,
  });

  useEffect(() => {
    let active = true;
    const loadSummary = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) return;
        const data: InitGameResponse = await res.json();
        if (!active) return;
        setInfo({
          puzzleNumber: data.puzzle.puzzleNumber,
          dateKey: data.puzzle.dateKey,
          parMirrors: data.puzzle.parMirrors,
          difficulty: data.puzzle.difficulty,
          totalSolvers: data.community.totalSolvers,
          streak: data.userStats.currentStreak,
          alreadySolved: Boolean(data.solvedRecord),
        });
      } catch {
        // Non-blocking preview fetch
      }
    };
    void loadSummary();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col justify-between items-center h-full min-h-[280px] px-5 py-5 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between w-full max-w-md text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold">
          #{info.puzzleNumber} · {info.dateKey}
        </span>
        <div className="flex items-center gap-2">
          {info.streak > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-300 font-semibold">
              🔥 {info.streak}d
            </span>
          )}
          <span className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Par {info.parMirrors}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center text-center gap-3 my-2">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 dark:bg-slate-800 border border-amber-400/50 shadow-md flex items-center justify-center">
          <svg viewBox="0 0 64 64" className="w-11 h-11" aria-hidden="true">
            <line
              x1="10"
              y1="20"
              x2="44"
              y2="20"
              stroke="#f59e0b"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <line
              x1="44"
              y1="20"
              x2="44"
              y2="50"
              stroke="#10b981"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <line
              x1="36"
              y1="28"
              x2="52"
              y2="12"
              stroke="#fbbf24"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <circle cx="10" cy="20" r="5" fill="#f59e0b" />
            <circle cx="44" cy="50" r="6" fill="#10b981" />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">RelayGrid</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 max-w-xs">
            Angle optical mirrors to power every node in{' '}
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {info.parMirrors} mirrors
            </span>{' '}
            or fewer.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 w-full max-w-xs">
        <button
          type="button"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
          className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-slate-950 font-bold text-sm tracking-wide shadow-md transition-all cursor-pointer"
        >
          {info.alreadySolved
            ? 'View Today’s Result'
            : `Play Today’s Grid${context.username ? ` · u/${context.username}` : ''}`}
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {info.totalSolvers > 0
            ? `${info.totalSolvers} player${info.totalSolvers === 1 ? '' : 's'} solved today · ${info.difficulty}`
            : `Fresh daily puzzle · ${info.difficulty} Mode`}
        </p>
      </div>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <Splash />
    </StrictMode>
  );
}
