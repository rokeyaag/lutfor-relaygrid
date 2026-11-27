import type { KeyboardEvent } from 'react';
import {
  coordKey,
  type DailyPuzzle,
  type Direction,
  type MirrorKind,
  type MirrorPlacement,
  type SimulationResult,
} from '../../shared/relaygrid';

type OpticalBoardProps = {
  puzzle: DailyPuzzle;
  placements: readonly MirrorPlacement[];
  simulation: SimulationResult;
  locked: boolean;
  onCellTap: (row: number, col: number) => void;
};

const EMITTER_ROTATION: Record<Direction, number> = {
  N: 0,
  E: 90,
  S: 180,
  W: 270,
};

function cellDescription(
  kind: string,
  playerMirror: MirrorKind | undefined,
  isLit: boolean
): string {
  if (playerMirror === '/') return 'Slash mirror forward';
  if (playerMirror === '\\') return 'Backslash mirror';
  if (kind === 'emitter') return 'Signal emitter';
  if (kind === 'target') return isLit ? 'Powered relay node' : 'Unlit relay node';
  if (kind === 'wall') return 'Obsidian wall';
  if (kind === 'splitter') return 'Optical splitter prism';
  if (kind === 'fixed_slash') return 'Fixed slash mirror';
  if (kind === 'fixed_backslash') return 'Fixed backslash mirror';
  return 'Empty cell';
}

export function OpticalBoard({
  puzzle,
  placements,
  simulation,
  locked,
  onCellTap,
}: OpticalBoardProps) {
  const mirrorMap = new Map<string, MirrorKind>();
  for (const p of placements) {
    mirrorMap.set(coordKey(p.row, p.col), p.kind);
  }

  const poweredSet = new Set(
    simulation.poweredTargets.map((t) => coordKey(t.row, t.col))
  );
  const litSet = new Set(simulation.litCells);
  const viewSize = puzzle.gridSize * 100;

  const handleKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    row: number,
    col: number
  ) => {
    let nextRow = row;
    let nextCol = col;
    if (e.key === 'ArrowUp') nextRow = Math.max(0, row - 1);
    else if (e.key === 'ArrowDown') nextRow = Math.min(puzzle.gridSize - 1, row + 1);
    else if (e.key === 'ArrowLeft') nextCol = Math.max(0, col - 1);
    else if (e.key === 'ArrowRight') nextCol = Math.min(puzzle.gridSize - 1, col + 1);
    else return;

    e.preventDefault();
    const el = document.getElementById(`rg-cell-${nextRow}-${nextCol}`);
    el?.focus();
  };

  return (
    <div className="relative w-full max-w-[360px] sm:max-w-[400px] aspect-square rounded-2xl p-2 bg-slate-200/90 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 shadow-lg select-none">
      {/* Tactile 6x6 cell grid */}
      <div
        className="grid grid-cols-6 grid-rows-6 gap-1.5 w-full h-full"
        role="grid"
        aria-label={`RelayGrid ${puzzle.gridSize} by ${puzzle.gridSize} optical board`}
      >
        {puzzle.cells.map((rowArr, r) =>
          rowArr.map((fixedKind, c) => {
            const key = coordKey(r, c);
            const playerMirror = mirrorMap.get(key);
            const isLit = litSet.has(key);
            const isPoweredTarget = poweredSet.has(key);
            const isEditable = fixedKind === 'empty' && !locked;

            const baseClasses =
              'relative rounded-lg flex items-center justify-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

            let surfaceClasses =
              'bg-white/95 dark:bg-slate-900/95 border border-slate-300/80 dark:border-slate-700/80';
            if (fixedKind === 'wall') {
              surfaceClasses =
                'bg-slate-700 dark:bg-slate-950 border border-slate-600 dark:border-slate-800 cursor-default';
            } else if (fixedKind === 'emitter') {
              surfaceClasses =
                'bg-amber-50 dark:bg-amber-950/50 border border-amber-400/80 dark:border-amber-600/70 cursor-default';
            } else if (fixedKind === 'target') {
              surfaceClasses = isPoweredTarget
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)] cursor-default'
                : 'bg-slate-100 dark:bg-slate-900 border border-cyan-500/50 dark:border-cyan-400/40 cursor-default';
            } else if (fixedKind === 'splitter') {
              surfaceClasses =
                'bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-400 dark:border-cyan-600 cursor-default';
            } else if (playerMirror) {
              surfaceClasses = isLit
                ? 'bg-amber-50/90 dark:bg-slate-800 border-2 border-amber-500 dark:border-amber-400 shadow-sm cursor-pointer active:scale-95'
                : 'bg-slate-50 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-500 cursor-pointer active:scale-95';
            } else if (isEditable) {
              surfaceClasses = isLit
                ? 'bg-amber-50/40 dark:bg-slate-900/90 border border-amber-300/70 dark:border-amber-500/30 hover:border-amber-500 cursor-pointer active:scale-95'
                : 'bg-white/95 dark:bg-slate-900/95 border border-slate-300/80 dark:border-slate-700/80 hover:border-slate-400 dark:hover:border-slate-500 cursor-pointer active:scale-95';
            }

            return (
              <button
                key={key}
                id={`rg-cell-${r}-${c}`}
                type="button"
                role="gridcell"
                aria-label={`Row ${r + 1} Column ${c + 1}, ${cellDescription(
                  fixedKind,
                  playerMirror,
                  isPoweredTarget
                )}`}
                onClick={() => {
                  if (isEditable) {
                    onCellTap(r, c);
                  }
                }}
                onKeyDown={(e) => handleKeyDown(e, r, c)}
                className={`${baseClasses} ${surfaceClasses}`}
              >
                {fixedKind === 'wall' && (
                  <svg
                    viewBox="0 0 40 40"
                    className="w-6 h-6 text-slate-500 dark:text-slate-700"
                    aria-hidden="true"
                  >
                    <rect
                      x="6"
                      y="6"
                      width="28"
                      height="28"
                      rx="5"
                      fill="currentColor"
                    />
                    <path
                      d="M12 28L28 12M12 18L18 12M22 28L28 22"
                      stroke="rgba(255,255,255,0.16)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                )}

                {fixedKind === 'emitter' && (
                  <svg
                    viewBox="0 0 40 40"
                    className="w-7 h-7 text-amber-500 dark:text-amber-400"
                    style={{
                      transform: `rotate(${EMITTER_ROTATION[puzzle.emitter.dir]}deg)`,
                    }}
                    aria-hidden="true"
                  >
                    <circle
                      cx="20"
                      cy="22"
                      r="9"
                      fill="currentColor"
                      fillOpacity="0.22"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M20 5L27 16H13L20 5Z"
                      fill="currentColor"
                    />
                  </svg>
                )}

                {fixedKind === 'target' && (
                  <svg
                    viewBox="0 0 40 40"
                    className={`w-7 h-7 ${
                      isPoweredTarget
                        ? 'text-emerald-500 dark:text-emerald-400'
                        : 'text-cyan-600 dark:text-cyan-400'
                    }`}
                    aria-hidden="true"
                  >
                    {isPoweredTarget && (
                      <circle
                        cx="20"
                        cy="20"
                        r="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="node-pulse"
                      />
                    )}
                    <circle
                      cx="20"
                      cy="20"
                      r="10"
                      fill={isPoweredTarget ? 'currentColor' : 'none'}
                      fillOpacity={isPoweredTarget ? '0.25' : '0'}
                      stroke="currentColor"
                      strokeWidth="2.5"
                    />
                    <circle cx="20" cy="20" r="4" fill="currentColor" />
                  </svg>
                )}

                {fixedKind === 'splitter' && (
                  <svg
                    viewBox="0 0 40 40"
                    className="w-7 h-7 text-cyan-600 dark:text-cyan-400"
                    aria-hidden="true"
                  >
                    <polygon
                      points="20,5 35,20 20,35 5,20"
                      fill="currentColor"
                      fillOpacity="0.18"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M20 11V29M11 20H29"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                )}

                {(playerMirror === '/' || fixedKind === 'fixed_slash') && (
                  <svg
                    viewBox="0 0 40 40"
                    className="w-8 h-8 text-amber-600 dark:text-amber-300"
                    aria-hidden="true"
                  >
                    <line
                      x1="9"
                      y1="31"
                      x2="31"
                      y2="9"
                      stroke="currentColor"
                      strokeWidth="4.5"
                      strokeLinecap="round"
                    />
                    <circle cx="9" cy="31" r="2.2" fill="currentColor" />
                    <circle cx="31" cy="9" r="2.2" fill="currentColor" />
                  </svg>
                )}

                {(playerMirror === '\\' || fixedKind === 'fixed_backslash') && (
                  <svg
                    viewBox="0 0 40 40"
                    className="w-8 h-8 text-amber-600 dark:text-amber-300"
                    aria-hidden="true"
                  >
                    <line
                      x1="9"
                      y1="9"
                      x2="31"
                      y2="31"
                      stroke="currentColor"
                      strokeWidth="4.5"
                      strokeLinecap="round"
                    />
                    <circle cx="9" cy="9" r="2.2" fill="currentColor" />
                    <circle cx="31" cy="31" r="2.2" fill="currentColor" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* SVG Laser Beam Overlay */}
      <svg
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        className="pointer-events-none absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)]"
        aria-hidden="true"
      >
        <g className="beam-pulse">
          {simulation.segments.map((seg, idx) => {
            const x1 = seg.fromCol * 100 + 50;
            const y1 = seg.fromRow * 100 + 50;
            const x2 = seg.toCol * 100 + 50;
            const y2 = seg.toRow * 100 + 50;
            const strokeColor = simulation.solved ? '#10b981' : '#f59e0b';
            return (
              <g key={`${idx}-${x1}-${y1}-${x2}-${y2}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={strokeColor}
                  strokeOpacity="0.28"
                  strokeWidth="16"
                  strokeLinecap="round"
                />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={strokeColor}
                  strokeOpacity="0.92"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
