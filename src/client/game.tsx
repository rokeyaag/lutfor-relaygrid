import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OpticalBoard } from './components/OpticalBoard';
import { useRelayGrid } from './hooks/useRelayGrid';

function getUtcCountdown(): string {
  const now = new Date();
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0
  );
  const diffSec = Math.max(0, Math.floor((nextMidnight - now.getTime()) / 1000));
  const hrs = String(Math.floor(diffSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
  const secs = String(diffSec % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

export const App = () => {
  const {
    loading,
    error,
    isAuthenticated,
    puzzle,
    userStats,
    solvedRecord,
    community,
    placements,
    history,
    submitting,
    sharing,
    simulation,
    cycleCell,
    undo,
    reset,
    submit,
    copyResultText,
    shareToComments,
  } = useRelayGrid();

  const [showHelp, setShowHelp] = useState(false);
  const [inspectBoard, setInspectBoard] = useState(false);
  const [countdown, setCountdown] = useState(getUtcCountdown);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown(getUtcCountdown());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        <p className="text-sm font-medium">Calibrating today’s RelayGrid...</p>
      </div>
    );
  }

  if (error || !puzzle || !simulation) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 gap-2">
        <p className="text-base font-semibold">Unable to Load Puzzle</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error ?? 'Unexpected state.'}
        </p>
      </div>
    );
  }

  const showResultCard = Boolean(solvedRecord) && !inspectBoard;
  const poweredCount = simulation.poweredTargets.length;
  const totalTargets = puzzle.targets.length;
  const currentMirrors = placements.length;
  const isAtPar = currentMirrors <= puzzle.parMirrors;

  return (
    <div className="flex flex-col items-center justify-between h-full min-h-screen px-3 py-3 sm:py-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Header */}
      <header className="w-full max-w-[400px] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-800 border border-amber-400/50 flex items-center justify-center">
            <span className="text-amber-400 font-black text-sm">⚡</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-extrabold tracking-tight leading-none">
                RelayGrid #{puzzle.puzzleNumber}
              </h1>
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {puzzle.difficulty}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {puzzle.dateKey}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/15 text-orange-700 dark:text-orange-300"
            title="Current daily streak"
          >
            🔥 {userStats.currentStreak}
          </div>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            aria-label="How to play"
            className="w-8 h-8 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            ?
          </button>
        </div>
      </header>

      {/* Compact Help Drawer */}
      {showHelp && (
        <div className="w-full max-w-[400px] rounded-xl p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-sm text-xs space-y-1.5">
          <div className="flex items-center justify-between font-bold">
            <span>How to Play</span>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
          <p className="text-slate-600 dark:text-slate-300">
            • Tap any empty tile to cycle: <strong>/</strong> → <strong>\</strong> → Clear.
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            • Route the amber beam through <strong>all glowing nodes</strong> simultaneously.
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            • Use <strong>{puzzle.parMirrors} mirrors or fewer</strong> for 3-Star Par! Cyan{' '}
            <strong>◇</strong> prisms split beams both ways.
          </p>
        </div>
      )}

      {/* Status Bar */}
      <div className="w-full max-w-[400px] grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl py-1.5 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Mirrors
          </div>
          <div
            className={`text-sm font-bold ${
              isAtPar
                ? 'text-slate-900 dark:text-white'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {currentMirrors} / {puzzle.maxMirrors}
          </div>
        </div>

        <div className="rounded-xl py-1.5 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Par Target
          </div>
          <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
            {puzzle.parMirrors} Mirrors
          </div>
        </div>

        <div className="rounded-xl py-1.5 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Nodes Lit
          </div>
          <div
            className={`text-sm font-bold ${
              simulation.solved
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-cyan-600 dark:text-cyan-400'
            }`}
          >
            {poweredCount} / {totalTargets}
          </div>
        </div>
      </div>

      {/* Main Play Area or End-State Result Card */}
      <main className="w-full flex flex-col items-center justify-center gap-2.5 my-1">
        {showResultCard && solvedRecord ? (
          <div className="w-full max-w-[400px] rounded-2xl p-5 bg-white dark:bg-slate-900 border border-emerald-500/40 shadow-lg flex flex-col items-center text-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <div className="text-2xl tracking-widest" aria-label={`${solvedRecord.stars} of 3 stars`}>
                {'⚡'.repeat(solvedRecord.stars)}
                {'▫️'.repeat(3 - solvedRecord.stars)}
              </div>
              <h2 className="text-xl font-extrabold">
                {solvedRecord.stars === 3 ? 'Optimal Par Achieved!' : 'Grid Powered!'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Solved in{' '}
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {solvedRecord.mirrorsUsed} mirrors
                </span>{' '}
                (Par {puzzle.parMirrors})
              </p>
            </div>

            <div className="w-full grid grid-cols-3 gap-2">
              <div className="rounded-xl p-2.5 bg-slate-100 dark:bg-slate-800/80">
                <div className="text-lg font-extrabold">{userStats.currentStreak}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Streak
                </div>
              </div>
              <div className="rounded-xl p-2.5 bg-slate-100 dark:bg-slate-800/80">
                <div className="text-lg font-extrabold">{userStats.bestStreak}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Best
                </div>
              </div>
              <div className="rounded-xl p-2.5 bg-slate-100 dark:bg-slate-800/80">
                <div className="text-lg font-extrabold">
                  {community.totalSolvers > 0 ? `${community.percentile}%` : '—'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Score Rank
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {community.totalSolvers} solver{community.totalSolvers === 1 ? '' : 's'} today ·{' '}
              {community.parSolvers} hit Par · Next grid in{' '}
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                {countdown}
              </span>
            </p>

            <div className="w-full flex flex-col gap-2">
              <button
                type="button"
                disabled={sharing || solvedRecord.commented}
                onClick={() => void shareToComments()}
                className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 font-bold text-sm transition-all cursor-pointer"
              >
                {solvedRecord.commented
                  ? 'Shared in Thread ✓'
                  : sharing
                    ? 'Posting Result...'
                    : 'Post Result to Comments'}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void copyResultText()}
                  className="h-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Copy Result
                </button>
                <button
                  type="button"
                  onClick={() => setInspectBoard(true)}
                  className="h-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Inspect Grid
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <OpticalBoard
              puzzle={puzzle}
              placements={placements}
              simulation={simulation}
              locked={Boolean(solvedRecord)}
              onCellTap={cycleCell}
            />

            <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 min-h-[16px]">
              {solvedRecord
                ? 'Viewing your verified solution.'
                : simulation.solved
                  ? isAtPar
                    ? 'Optimal Par reached! Lock in your score below.'
                    : `Solved! Optimize to ${puzzle.parMirrors} mirrors for 3 stars, or submit now.`
                  : placements.length === 0
                    ? 'Tap any open tile to cycle / or \\ mirrors.'
                    : !isAuthenticated
                      ? 'Playing as guest — sign in to save your streak.'
                      : `Route the beam to all ${totalTargets} glowing nodes.`}
            </p>
          </>
        )}
      </main>

      {/* Bottom Action Controls */}
      <footer className="w-full max-w-[400px]">
        {solvedRecord ? (
          inspectBoard ? (
            <button
              type="button"
              onClick={() => setInspectBoard(false)}
              className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm cursor-pointer"
            >
              Back to Result Card
            </button>
          ) : null
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={history.length === 0 || submitting}
              className="flex-1 h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-xs font-bold cursor-pointer"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={placements.length === 0 || submitting}
              className="flex-1 h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-xs font-bold cursor-pointer"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!simulation.solved || submitting}
              className={`flex-[2] h-11 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                simulation.solved
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-md'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
              }`}
            >
              {submitting
                ? 'Verifying...'
                : simulation.solved
                  ? isAtPar
                    ? 'Submit Par ⚡'
                    : `Submit (${currentMirrors})`
                  : `${poweredCount}/${totalTargets} Lit`}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
