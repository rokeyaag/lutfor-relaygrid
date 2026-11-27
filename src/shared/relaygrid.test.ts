import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatShareCommentText,
  generateDailyPuzzle,
  getPreviousDateKey,
  getPuzzleNumber,
  getUtcDateKey,
  GRID_SIZE,
  hasSolutionWithAtMost,
  isValidDateKey,
  simulatePuzzle,
  validatePlacements,
  type DailyPuzzle,
  type MirrorPlacement,
} from './relaygrid.ts';

function findSolution(puzzle: DailyPuzzle, maxMirrors: number): MirrorPlacement[] | null {
  const solve = (placements: MirrorPlacement[]): MirrorPlacement[] | null => {
    const sim = simulatePuzzle(puzzle, placements);
    if (sim.solved) {
      return placements;
    }
    if (placements.length >= maxMirrors) {
      return null;
    }
    const occupied = new Set(placements.map((p) => `${p.row},${p.col}`));
    for (const key of sim.litCells) {
      if (occupied.has(key)) {
        continue;
      }
      const [rStr, cStr] = key.split(',');
      const row = Number(rStr);
      const col = Number(cStr);
      if (puzzle.cells[row]?.[col] !== 'empty') {
        continue;
      }
      for (const kind of ['/', '\\'] as const) {
        const res = solve([...placements, { row, col, kind }]);
        if (res) {
          return res;
        }
      }
    }
    return null;
  };
  return solve([]);
}

void test('date key helpers validate strictly and compute puzzle numbers', () => {
  assert.equal(isValidDateKey('2026-11-27'), true);
  assert.equal(isValidDateKey('2026-02-29'), false);
  assert.equal(isValidDateKey('2024-02-29'), true);
  assert.equal(isValidDateKey('2026-13-01'), false);
  assert.equal(isValidDateKey('../etc/passwd'), false);
  assert.equal(isValidDateKey(null), false);

  assert.equal(getPreviousDateKey('2026-03-01'), '2026-02-28');
  assert.equal(getPuzzleNumber('2026-11-11'), 1);
  assert.equal(getPuzzleNumber('2026-11-27'), 17);
});

void test('validatePlacements rejects tampered, duplicate, out-of-bounds, and non-empty coordinates', () => {
  const puzzle = generateDailyPuzzle('2026-11-27');

  assert.equal(validatePlacements(puzzle, null).ok, false);
  assert.equal(validatePlacements(puzzle, 'hack').ok, false);

  // Too many mirrors
  const tooMany = Array.from({ length: puzzle.maxMirrors + 1 }, (_, i) => ({
    row: 0,
    col: i % GRID_SIZE,
    kind: '/',
  }));
  assert.equal(validatePlacements(puzzle, tooMany).ok, false);

  // Out of bounds
  assert.equal(
    validatePlacements(puzzle, [{ row: -1, col: 0, kind: '/' }]).ok,
    false
  );
  assert.equal(
    validatePlacements(puzzle, [{ row: 0, col: GRID_SIZE, kind: '/' }]).ok,
    false
  );
  assert.equal(
    validatePlacements(puzzle, [{ row: 1.5, col: 0, kind: '/' }]).ok,
    false
  );

  // Invalid mirror kind (XSS / injection payload)
  assert.equal(
    validatePlacements(puzzle, [{ row: 0, col: 0, kind: '<script>' }]).ok,
    false
  );

  // Placing on emitter or target
  assert.equal(
    validatePlacements(puzzle, [
      { row: puzzle.emitter.row, col: puzzle.emitter.col, kind: '/' },
    ]).ok,
    false
  );
  const target = puzzle.targets[0];
  assert.ok(target !== undefined);
  if (!target) return;
  assert.equal(
    validatePlacements(puzzle, [{ row: target.row, col: target.col, kind: '/' }]).ok,
    false
  );

  // Duplicate coordinate
  let emptyCell: { row: number; col: number } | null = null;
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (puzzle.cells[r]?.[c] === 'empty') {
        emptyCell = { row: r, col: c };
        break;
      }
    }
    if (emptyCell) break;
  }
  assert.ok(emptyCell !== null);
  if (!emptyCell) return;
  assert.equal(
    validatePlacements(puzzle, [
      { row: emptyCell.row, col: emptyCell.col, kind: '/' },
      { row: emptyCell.row, col: emptyCell.col, kind: '\\' },
    ]).ok,
    false
  );
});

void test('simulatePuzzle terminates safely on infinite mirror loops', () => {
  // Create a 4-mirror rectangle loop in empty cells to verify cycle guard & step cap
  const loopPuzzle: DailyPuzzle = {
    dateKey: '2026-11-27',
    puzzleNumber: 17,
    gridSize: GRID_SIZE,
    cells: Array.from({ length: GRID_SIZE }, (_, r) =>
      Array.from({ length: GRID_SIZE }, (_, c) =>
        r === 0 && c === 0 ? 'emitter' : r === 5 && c === 5 ? 'target' : 'empty'
      )
    ),
    emitter: { row: 0, col: 0, dir: 'E' },
    targets: [{ row: 5, col: 5 }],
    parMirrors: 3,
    maxMirrors: 5,
    difficulty: 'Standard',
  };

  const loopMirrors: MirrorPlacement[] = [
    { row: 0, col: 4, kind: '\\' },
    { row: 4, col: 4, kind: '/' },
    { row: 4, col: 1, kind: '\\' },
    { row: 0, col: 1, kind: '/' },
  ];

  const result = simulatePuzzle(loopPuzzle, loopMirrors);
  assert.equal(result.solved, false);
  assert.ok(result.segments.length > 0 && result.segments.length <= 256);
});

void test('400 consecutive daily puzzles are deterministic, solvable at Par, and have no trivial shortcuts', () => {
  const startMs = Date.UTC(2026, 10, 11); // 2026-11-11
  for (let i = 0; i < 400; i += 1) {
    const dateKey = getUtcDateKey(new Date(startMs + i * 86_400_000));
    const p1 = generateDailyPuzzle(dateKey);
    const p2 = generateDailyPuzzle(dateKey);
    assert.deepEqual(p1, p2, `Puzzle for ${dateKey} must be deterministic`);
    assert.ok(p1.parMirrors >= 3, `${dateKey} parMirrors should be >= 3`);
    assert.ok(
      !hasSolutionWithAtMost(p1, p1.parMirrors - 1),
      `${dateKey} should not have shortcut under par=${p1.parMirrors}`
    );
    const sol = findSolution(p1, p1.parMirrors);
    assert.ok(sol !== null, `${dateKey} must be solvable within par=${p1.parMirrors}`);
  }
});

void test('formatShareCommentText generates spoiler-free markdown without coordinates', () => {
  const text = formatShareCommentText({
    puzzleNumber: 17,
    dateKey: '2026-11-27',
    mirrorsUsed: 3,
    parMirrors: 3,
    stars: 3,
    streak: 4,
    percentile: 85,
  });
  assert.match(text, /RelayGrid #17/);
  assert.match(text, /3\/3 mirrors/);
  assert.match(text, /4-day streak/);
});
