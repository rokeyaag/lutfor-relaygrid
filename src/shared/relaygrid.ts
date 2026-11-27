export const GRID_SIZE = 6;
export const MAX_SIM_STEPS = 256;
export const LAUNCH_DATE_KEY = '2026-11-11';

export type Direction = 'N' | 'E' | 'S' | 'W';
export type MirrorKind = '/' | '\\';
export type FixedCellKind =
  | 'empty'
  | 'wall'
  | 'emitter'
  | 'target'
  | 'splitter'
  | 'fixed_slash'
  | 'fixed_backslash';

export type Coord = {
  row: number;
  col: number;
};

export type MirrorPlacement = {
  row: number;
  col: number;
  kind: MirrorKind;
};

export type Emitter = {
  row: number;
  col: number;
  dir: Direction;
};

export type DailyPuzzle = {
  dateKey: string;
  puzzleNumber: number;
  gridSize: number;
  cells: FixedCellKind[][];
  emitter: Emitter;
  targets: Coord[];
  parMirrors: number;
  maxMirrors: number;
  difficulty: 'Standard' | 'Tactical' | 'Prism';
};

export type BeamSegment = {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  dir: Direction;
};

export type SimulationResult = {
  solved: boolean;
  poweredTargets: Coord[];
  segments: BeamSegment[];
  litCells: string[];
  mirrorsUsed: number;
  stars: 0 | 1 | 2 | 3;
};

export type ValidationResult =
  | { ok: true; placements: MirrorPlacement[] }
  | { ok: false; error: string };

const DIRECTION_INDEX: Record<Direction, number> = {
  N: 0,
  E: 1,
  S: 2,
  W: 3,
};

const DIRECTION_DELTA: Record<Direction, Coord> = {
  N: { row: -1, col: 0 },
  E: { row: 0, col: 1 },
  S: { row: 1, col: 0 },
  W: { row: 0, col: -1 },
};

const SLASH_REFLECT: Record<Direction, Direction> = {
  N: 'E',
  E: 'N',
  S: 'W',
  W: 'S',
};

const BACKSLASH_REFLECT: Record<Direction, Direction> = {
  N: 'W',
  W: 'N',
  S: 'E',
  E: 'S',
};

const SPLIT_DIRS: Record<Direction, [Direction, Direction]> = {
  N: ['E', 'W'],
  S: ['E', 'W'],
  E: ['N', 'S'],
  W: ['N', 'S'],
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function coordKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) {
    return false;
  }
  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getUtcDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPreviousDateKey(dateKey: string): string {
  if (!isValidDateKey(dateKey)) {
    return dateKey;
  }
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcMs = Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1) - 86_400_000;
  return getUtcDateKey(new Date(utcMs));
}

export function getPuzzleNumber(dateKey: string): number {
  if (!isValidDateKey(dateKey)) {
    return 1;
  }
  const [y, m, d] = dateKey.split('-').map(Number);
  const [ly, lm, ld] = LAUNCH_DATE_KEY.split('-').map(Number);
  const targetMs = Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  const launchMs = Date.UTC(ly ?? 2026, (lm ?? 1) - 1, ld ?? 1);
  const diffDays = Math.floor((targetMs - launchMs) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

export function isInBounds(row: number, col: number, size: number = GRID_SIZE): boolean {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < size && col >= 0 && col < size;
}

export function validatePlacements(
  puzzle: DailyPuzzle,
  rawPlacements: unknown
): ValidationResult {
  if (!Array.isArray(rawPlacements)) {
    return { ok: false, error: 'Placements must be an array.' };
  }
  if (rawPlacements.length > puzzle.maxMirrors) {
    return {
      ok: false,
      error: `Too many mirrors: maximum allowed is ${puzzle.maxMirrors}.`,
    };
  }

  const seen = new Set<string>();
  const validated: MirrorPlacement[] = [];

  for (const item of rawPlacements) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: 'Each mirror placement must be an object.' };
    }
    const record = item;
    if (!('row' in record) || !('col' in record) || !('kind' in record)) {
      return { ok: false, error: 'Mirror placement is missing row, col, or kind.' };
    }

    const row = record.row;
    const col = record.col;
    const kind = record.kind;

    if (typeof row !== 'number' || typeof col !== 'number' || !isInBounds(row, col, puzzle.gridSize)) {
      return { ok: false, error: 'Mirror coordinates are out of bounds.' };
    }
    if (kind !== '/' && kind !== '\\') {
      return { ok: false, error: 'Invalid mirror orientation.' };
    }

    const key = coordKey(row, col);
    if (seen.has(key)) {
      return { ok: false, error: 'Duplicate mirror coordinate detected.' };
    }
    seen.add(key);

    const cell = puzzle.cells[row]?.[col];
    if (cell !== 'empty') {
      return { ok: false, error: 'Mirrors can only be placed on empty cells.' };
    }

    validated.push({ row, col, kind });
  }

  return { ok: true, placements: validated };
}

export function computeStars(
  solved: boolean,
  mirrorsUsed: number,
  parMirrors: number,
  maxMirrors: number
): 0 | 1 | 2 | 3 {
  if (!solved || mirrorsUsed > maxMirrors) {
    return 0;
  }
  if (mirrorsUsed <= parMirrors) {
    return 3;
  }
  if (mirrorsUsed === parMirrors + 1) {
    return 2;
  }
  return 1;
}

export function simulatePuzzle(
  puzzle: DailyPuzzle,
  placements: readonly MirrorPlacement[]
): SimulationResult {
  const mirrorMap = new Map<string, MirrorKind>();
  for (const placement of placements) {
    if (isInBounds(placement.row, placement.col, puzzle.gridSize)) {
      mirrorMap.set(coordKey(placement.row, placement.col), placement.kind);
    }
  }

  const targetKeys = new Set(puzzle.targets.map((t) => coordKey(t.row, t.col)));
  const hitTargetKeys = new Set<string>();
  const litSet = new Set<string>([coordKey(puzzle.emitter.row, puzzle.emitter.col)]);
  const segments: BeamSegment[] = [];
  const visitedStates = new Set<number>();

  type Ray = {
    row: number;
    col: number;
    dir: Direction;
  };

  const queue: Ray[] = [
    {
      row: puzzle.emitter.row,
      col: puzzle.emitter.col,
      dir: puzzle.emitter.dir,
    },
  ];

  let steps = 0;
  while (queue.length > 0 && steps < MAX_SIM_STEPS) {
    const ray = queue.shift();
    if (!ray) {
      break;
    }
    steps += 1;

    const delta = DIRECTION_DELTA[ray.dir];
    const nextRow = ray.row + delta.row;
    const nextCol = ray.col + delta.col;

    if (!isInBounds(nextRow, nextCol, puzzle.gridSize)) {
      continue;
    }

    const stateId = (nextRow * puzzle.gridSize + nextCol) * 4 + DIRECTION_INDEX[ray.dir];
    if (visitedStates.has(stateId)) {
      continue;
    }
    visitedStates.add(stateId);

    const cell = puzzle.cells[nextRow]?.[nextCol] ?? 'wall';
    if (cell === 'wall') {
      continue;
    }

    segments.push({
      fromRow: ray.row,
      fromCol: ray.col,
      toRow: nextRow,
      toCol: nextCol,
      dir: ray.dir,
    });

    const nextKey = coordKey(nextRow, nextCol);
    litSet.add(nextKey);

    if (cell === 'target' && targetKeys.has(nextKey)) {
      hitTargetKeys.add(nextKey);
      queue.push({ row: nextRow, col: nextCol, dir: ray.dir });
      continue;
    }

    if (cell === 'emitter') {
      queue.push({ row: nextRow, col: nextCol, dir: ray.dir });
      continue;
    }

    if (cell === 'splitter') {
      const [dirA, dirB] = SPLIT_DIRS[ray.dir];
      queue.push({ row: nextRow, col: nextCol, dir: dirA });
      queue.push({ row: nextRow, col: nextCol, dir: dirB });
      continue;
    }

    const playerMirror = mirrorMap.get(nextKey);
    const activeMirror: MirrorKind | undefined =
      playerMirror ??
      (cell === 'fixed_slash' ? '/' : cell === 'fixed_backslash' ? '\\' : undefined);

    if (activeMirror === '/') {
      queue.push({ row: nextRow, col: nextCol, dir: SLASH_REFLECT[ray.dir] });
    } else if (activeMirror === '\\') {
      queue.push({ row: nextRow, col: nextCol, dir: BACKSLASH_REFLECT[ray.dir] });
    } else {
      queue.push({ row: nextRow, col: nextCol, dir: ray.dir });
    }
  }

  const poweredTargets = puzzle.targets.filter((t) =>
    hitTargetKeys.has(coordKey(t.row, t.col))
  );
  const solved =
    puzzle.targets.length > 0 && poweredTargets.length === puzzle.targets.length;

  return {
    solved,
    poweredTargets,
    segments,
    litCells: Array.from(litSet),
    mirrorsUsed: placements.length,
    stars: computeStars(solved, placements.length, puzzle.parMirrors, puzzle.maxMirrors),
  };
}

function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, maxInclusive: number): number {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}

function pickOne<T>(rng: () => number, items: readonly T[]): T {
  const index = Math.floor(rng() * items.length);
  const item = items[index];
  if (item === undefined) {
    throw new Error('Cannot pick from an empty array.');
  }
  return item;
}

function createEmptyCells(): FixedCellKind[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => 'empty')
  );
}

function setCell(
  cells: FixedCellKind[][],
  row: number,
  col: number,
  kind: FixedCellKind
): void {
  const rowArr = cells[row];
  if (rowArr && col >= 0 && col < rowArr.length) {
    rowArr[col] = kind;
  }
}

/**
 * Exact beam-guided solver used to verify that no trivial shortcut
 * solves the puzzle in strictly fewer than `parMirrors` mirrors.
 */
export function hasSolutionWithAtMost(
  puzzle: DailyPuzzle,
  maxAllowed: number
): boolean {
  const memo = new Set<string>();

  const search = (placements: MirrorPlacement[]): boolean => {
    const sim = simulatePuzzle(puzzle, placements);
    if (sim.solved) {
      return true;
    }
    if (placements.length >= maxAllowed) {
      return false;
    }

    const signature = placements
      .map((p) => `${p.row},${p.col}${p.kind}`)
      .sort()
      .join('|');
    const memoKey = `${placements.length}:${signature}`;
    if (memo.has(memoKey)) {
      return false;
    }
    memo.add(memoKey);

    const occupied = new Set(placements.map((p) => coordKey(p.row, p.col)));
    const candidateCells: Coord[] = [];

    for (const key of sim.litCells) {
      if (occupied.has(key)) {
        continue;
      }
      const [rStr, cStr] = key.split(',');
      const row = Number(rStr);
      const col = Number(cStr);
      if (puzzle.cells[row]?.[col] === 'empty') {
        candidateCells.push({ row, col });
      }
    }

    for (const cell of candidateCells) {
      for (const kind of ['/', '\\'] as const) {
        const next: MirrorPlacement[] = [
          ...placements,
          { row: cell.row, col: cell.col, kind },
        ];
        if (search(next)) {
          return true;
        }
      }
    }

    return false;
  };

  return search([]);
}

type PuzzleProfile = {
  parMirrors: number;
  maxMirrors: number;
  targetCount: number;
  useSplitter: boolean;
  wallCount: number;
  difficulty: DailyPuzzle['difficulty'];
};

function getProfileForDate(dateKey: string): PuzzleProfile {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1));
  const dow = utcDate.getUTCDay();

  if (dow === 0 || dow === 6) {
    return {
      parMirrors: 4,
      maxMirrors: 6,
      targetCount: 3,
      useSplitter: true,
      wallCount: 6,
      difficulty: 'Prism',
    };
  }
  if (dow === 4 || dow === 5) {
    return {
      parMirrors: 4,
      maxMirrors: 6,
      targetCount: 2,
      useSplitter: false,
      wallCount: 6,
      difficulty: 'Tactical',
    };
  }
  return {
    parMirrors: 3,
    maxMirrors: 5,
    targetCount: 2,
    useSplitter: false,
    wallCount: 5,
    difficulty: 'Standard',
  };
}

function mirrorForTurn(inDir: Direction, outDir: Direction): MirrorKind | null {
  if (SLASH_REFLECT[inDir] === outDir) {
    return '/';
  }
  if (BACKSLASH_REFLECT[inDir] === outDir) {
    return '\\';
  }
  return null;
}

function buildVerifiedFallbackPuzzle(dateKey: string, profile: PuzzleProfile): DailyPuzzle {
  if (profile.useSplitter) {
    const clean = createEmptyCells();
    const em: Emitter = { row: 0, col: 2, dir: 'S' };
    setCell(clean, 0, 2, 'emitter');
    setCell(clean, 2, 2, 'splitter');
    setCell(clean, 0, 1, 'target');
    setCell(clean, 4, 5, 'target');
    setCell(clean, 5, 2, 'target');
    setCell(clean, 1, 1, 'wall');
    setCell(clean, 1, 3, 'wall');
    setCell(clean, 3, 1, 'wall');
    setCell(clean, 3, 4, 'wall');
    setCell(clean, 4, 2, 'wall');

    return {
      dateKey,
      puzzleNumber: getPuzzleNumber(dateKey),
      gridSize: GRID_SIZE,
      cells: clean,
      emitter: em,
      targets: [
        { row: 0, col: 1 },
        { row: 4, col: 5 },
        { row: 5, col: 2 },
      ],
      parMirrors: 4,
      maxMirrors: 6,
      difficulty: profile.difficulty,
    };
  }

  if (profile.parMirrors === 4) {
    const clean = createEmptyCells();
    const em: Emitter = { row: 0, col: 0, dir: 'E' };
    setCell(clean, 0, 0, 'emitter');
    setCell(clean, 4, 1, 'target');
    setCell(clean, 5, 4, 'target');
    setCell(clean, 1, 0, 'wall');
    setCell(clean, 1, 1, 'wall');
    setCell(clean, 2, 1, 'wall');
    setCell(clean, 0, 5, 'wall');
    setCell(clean, 4, 4, 'wall');

    return {
      dateKey,
      puzzleNumber: getPuzzleNumber(dateKey),
      gridSize: GRID_SIZE,
      cells: clean,
      emitter: em,
      targets: [
        { row: 4, col: 1 },
        { row: 5, col: 4 },
      ],
      parMirrors: 4,
      maxMirrors: 6,
      difficulty: profile.difficulty,
    };
  }

  const std = createEmptyCells();
  const stdEm: Emitter = { row: 0, col: 0, dir: 'E' };
  setCell(std, 0, 0, 'emitter');
  setCell(std, 4, 3, 'target');
  setCell(std, 5, 1, 'target');
  setCell(std, 1, 1, 'wall');
  setCell(std, 2, 1, 'wall');
  setCell(std, 3, 3, 'wall');
  setCell(std, 1, 4, 'wall');

  return {
    dateKey,
    puzzleNumber: getPuzzleNumber(dateKey),
    gridSize: GRID_SIZE,
    cells: std,
    emitter: stdEm,
    targets: [
      { row: 4, col: 3 },
      { row: 5, col: 1 },
    ],
    parMirrors: 3,
    maxMirrors: 5,
    difficulty: profile.difficulty,
  };
}

function tryConstructPuzzle(
  rng: () => number,
  dateKey: string,
  profile: PuzzleProfile
): DailyPuzzle | null {
  const cells = createEmptyCells();

  // Place emitter on an outer edge facing inward
  const edge = randInt(rng, 0, 3);
  let emitter: Emitter;
  if (edge === 0) {
    emitter = { row: 0, col: randInt(rng, 1, GRID_SIZE - 2), dir: 'S' };
  } else if (edge === 1) {
    emitter = { row: randInt(rng, 1, GRID_SIZE - 2), col: GRID_SIZE - 1, dir: 'W' };
  } else if (edge === 2) {
    emitter = { row: GRID_SIZE - 1, col: randInt(rng, 1, GRID_SIZE - 2), dir: 'N' };
  } else {
    emitter = { row: randInt(rng, 1, GRID_SIZE - 2), col: 0, dir: 'E' };
  }
  setCell(cells, emitter.row, emitter.col, 'emitter');

  // Walk a non-intersecting path of `parMirrors` turns
  const pathCells = new Set<string>([coordKey(emitter.row, emitter.col)]);
  const placements: MirrorPlacement[] = [];
  const segmentWalked: Coord[][] = [];

  let curRow = emitter.row;
  let curCol = emitter.col;
  let curDir = emitter.dir;

  const targetBounces = profile.useSplitter ? profile.parMirrors - 1 : profile.parMirrors;

  for (let bounce = 0; bounce <= targetBounces; bounce += 1) {
    const delta = DIRECTION_DELTA[curDir];
    const rayLine: Coord[] = [];
    let r = curRow + delta.row;
    let c = curCol + delta.col;
    while (isInBounds(r, c)) {
      const k = coordKey(r, c);
      if (pathCells.has(k)) {
        break;
      }
      rayLine.push({ row: r, col: c });
      r += delta.row;
      c += delta.col;
    }

    if (rayLine.length < 2) {
      return null;
    }

    if (bounce === targetBounces) {
      for (const pt of rayLine) {
        pathCells.add(coordKey(pt.row, pt.col));
      }
      segmentWalked.push(rayLine);
      break;
    }

    const pivotIndex = randInt(rng, 1, rayLine.length - 1);
    const pivot = rayLine[pivotIndex];
    if (!pivot) {
      return null;
    }

    const perpDirs = SPLIT_DIRS[curDir];
    const nextDir = pickOne(rng, perpDirs);
    const mirror = mirrorForTurn(curDir, nextDir);
    if (!mirror) {
      return null;
    }

    for (let i = 0; i <= pivotIndex; i += 1) {
      const pt = rayLine[i];
      if (pt) {
        pathCells.add(coordKey(pt.row, pt.col));
      }
    }
    segmentWalked.push(rayLine.slice(0, pivotIndex + 1));
    placements.push({ row: pivot.row, col: pivot.col, kind: mirror });

    curRow = pivot.row;
    curCol = pivot.col;
    curDir = nextDir;
  }

  const targets: Coord[] = [];

  if (profile.useSplitter) {
    // Convert one mid-segment cell on segment 1 or 2 into a splitter and build a side branch
    const branchSourceSeg = segmentWalked[1] ?? segmentWalked[0];
    if (!branchSourceSeg || branchSourceSeg.length < 2) {
      return null;
    }
    const splitPt = branchSourceSeg[0];
    if (!splitPt) {
      return null;
    }
    // Find which direction the splitter was entered from
    const mainMirrorOnFirst = placements[0];
    if (!mainMirrorOnFirst) {
      return null;
    }
    setCell(cells, splitPt.row, splitPt.col, 'splitter');

    // Determine main segment direction at splitPt
    const segDir =
      splitPt.row === mainMirrorOnFirst.row
        ? splitPt.col > mainMirrorOnFirst.col
          ? 'E'
          : 'W'
        : splitPt.row > mainMirrorOnFirst.row
          ? 'S'
          : 'N';
    const [bDir1, bDir2] = SPLIT_DIRS[segDir];
    const chosenBranchDir = pickOne(rng, [bDir1, bDir2]);
    const bDelta = DIRECTION_DELTA[chosenBranchDir];

    const branchCells: Coord[] = [];
    let br = splitPt.row + bDelta.row;
    let bc = splitPt.col + bDelta.col;
    while (isInBounds(br, bc) && !pathCells.has(coordKey(br, bc))) {
      branchCells.push({ row: br, col: bc });
      br += bDelta.row;
      bc += bDelta.col;
    }
    if (branchCells.length < 2) {
      return null;
    }

    const branchPivot = branchCells[randInt(rng, 0, branchCells.length - 2)];
    if (!branchPivot) {
      return null;
    }
    const afterBranchDir = pickOne(rng, SPLIT_DIRS[chosenBranchDir]);
    const branchMirror = mirrorForTurn(chosenBranchDir, afterBranchDir);
    if (!branchMirror) {
      return null;
    }

    const abDelta = DIRECTION_DELTA[afterBranchDir];
    const finalBranch: Coord[] = [];
    let fr = branchPivot.row + abDelta.row;
    let fc = branchPivot.col + abDelta.col;
    while (isInBounds(fr, fc) && !pathCells.has(coordKey(fr, fc))) {
      finalBranch.push({ row: fr, col: fc });
      fr += abDelta.row;
      fc += abDelta.col;
    }
    if (finalBranch.length === 0) {
      return null;
    }

    placements.push({ row: branchPivot.row, col: branchPivot.col, kind: branchMirror });
    const branchTarget = finalBranch[finalBranch.length - 1];
    if (!branchTarget) {
      return null;
    }
    setCell(cells, branchTarget.row, branchTarget.col, 'target');
    targets.push(branchTarget);
  }

  // Place targets on late segments (not on mirror pivot cells!)
  const mirrorSet = new Set(placements.map((p) => coordKey(p.row, p.col)));
  const lastSeg = segmentWalked[segmentWalked.length - 1] ?? [];
  const prevSeg = segmentWalked[segmentWalked.length - 2] ?? [];

  const candidatePools = [lastSeg, prevSeg];
  for (const pool of candidatePools) {
    if (targets.length >= profile.targetCount) {
      break;
    }
    const cleanCandidates = pool.filter((pt) => {
      const k = coordKey(pt.row, pt.col);
      return cells[pt.row]?.[pt.col] === 'empty' && !mirrorSet.has(k);
    });
    if (cleanCandidates.length === 0) {
      return null;
    }
    const chosen = cleanCandidates[cleanCandidates.length - 1] ?? cleanCandidates[0];
    if (!chosen) {
      return null;
    }
    setCell(cells, chosen.row, chosen.col, 'target');
    targets.push(chosen);
  }

  if (targets.length < profile.targetCount) {
    return null;
  }

  // Place decorative/tactical walls strictly off the constructed beam path
  const protectedCells = new Set<string>([...pathCells, ...mirrorSet]);
  for (const t of targets) {
    protectedCells.add(coordKey(t.row, t.col));
  }

  const wallCandidates: Coord[] = [];
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (cells[r]?.[c] === 'empty' && !protectedCells.has(coordKey(r, c))) {
        wallCandidates.push({ row: r, col: c });
      }
    }
  }

  let wallsPlaced = 0;
  while (wallsPlaced < profile.wallCount && wallCandidates.length > 0) {
    const idx = randInt(rng, 0, wallCandidates.length - 1);
    const chosen = wallCandidates.splice(idx, 1)[0];
    if (chosen) {
      setCell(cells, chosen.row, chosen.col, 'wall');
      wallsPlaced += 1;
    }
  }

  const candidate: DailyPuzzle = {
    dateKey,
    puzzleNumber: getPuzzleNumber(dateKey),
    gridSize: GRID_SIZE,
    cells,
    emitter,
    targets,
    parMirrors: placements.length,
    maxMirrors: placements.length + 2,
    difficulty: profile.difficulty,
  };

  // Verify constructed solution actually solves the puzzle
  const verify = simulatePuzzle(candidate, placements);
  if (!verify.solved) {
    return null;
  }

  // Ensure no trivial shortcut exists with fewer than parMirrors
  if (hasSolutionWithAtMost(candidate, candidate.parMirrors - 1)) {
    return null;
  }

  return candidate;
}

export function generateDailyPuzzle(dateKey: string): DailyPuzzle {
  const safeDateKey = isValidDateKey(dateKey) ? dateKey : LAUNCH_DATE_KEY;
  const profile = getProfileForDate(safeDateKey);
  const seed = fnv1aHash(`relaygrid-v1:${safeDateKey}`);
  const rng = createRng(seed);

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const puzzle = tryConstructPuzzle(rng, safeDateKey, profile);
    if (puzzle) {
      return puzzle;
    }
  }

  return buildVerifiedFallbackPuzzle(safeDateKey, profile);
}

export function formatShareCommentText(params: {
  puzzleNumber: number;
  dateKey: string;
  mirrorsUsed: number;
  parMirrors: number;
  stars: 0 | 1 | 2 | 3;
  streak: number;
  percentile: number;
}): string {
  const starBar = '⚡'.repeat(params.stars) + '▫️'.repeat(3 - params.stars);
  const parTag = params.mirrorsUsed <= params.parMirrors ? ' (Par!)' : '';
  const streakLine = params.streak > 1 ? ` · 🔥 ${params.streak}-day streak` : '';
  const pctLine =
    params.percentile > 0 ? ` · Top ${Math.max(1, 100 - params.percentile + 1)}% today` : '';

  return [
    `**RelayGrid #${params.puzzleNumber}** (${params.dateKey})`,
    `${starBar} Solved in **${params.mirrorsUsed}/${params.parMirrors} mirrors**${parTag}${streakLine}${pctLine}`,
    '',
    '*Can you route the beam in fewer mirrors?*',
  ].join('\n');
}
