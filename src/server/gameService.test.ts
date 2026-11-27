import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateDailyPuzzle,
  simulatePuzzle,
  type DailyPuzzle,
  type MirrorPlacement,
} from '../shared/relaygrid.ts';
import {
  initGameState,
  shareSolvedResultComment,
  submitSolution,
  type RedisLike,
} from './core/gameService.ts';

function createMemoryRedis(): RedisLike {
  const data = new Map<string, string>();
  return {
    async get(key) {
      return data.get(key);
    },
    async set(key, value) {
      data.set(key, value);
      return 'OK';
    },
    async incrBy(key, value) {
      const prev = Number(data.get(key) ?? '0');
      const next = prev + value;
      data.set(key, String(next));
      return next;
    },
    async expire() {
      // No-op in unit tests
    },
  };
}

function findParSolution(puzzle: DailyPuzzle): MirrorPlacement[] {
  const solve = (placements: MirrorPlacement[]): MirrorPlacement[] | null => {
    const sim = simulatePuzzle(puzzle, placements);
    if (sim.solved) return placements;
    if (placements.length >= puzzle.parMirrors) return null;

    const occupied = new Set(placements.map((p) => `${p.row},${p.col}`));
    for (const key of sim.litCells) {
      if (occupied.has(key)) continue;
      const [rStr, cStr] = key.split(',');
      const row = Number(rStr);
      const col = Number(cStr);
      if (puzzle.cells[row]?.[col] !== 'empty') continue;
      for (const kind of ['/', '\\'] as const) {
        const res = solve([...placements, { row, col, kind }]);
        if (res) return res;
      }
    }
    return null;
  };
  const found = solve([]);
  if (!found) {
    throw new Error(`No solution found for ${puzzle.dateKey}`);
  }
  return found;
}

void test('submitSolution rejects unauthenticated users and tampered payloads', async () => {
  const store = createMemoryRedis();
  const dateKey = '2026-11-27';
  const puzzle = generateDailyPuzzle(dateKey);
  const validSolution = findParSolution(puzzle);

  const unauth = await submitSolution({
    store,
    dateKey,
    userId: undefined,
    rawPlacements: validSolution,
  });
  assert.equal(unauth.status, 401);

  const tampered = await submitSolution({
    store,
    dateKey,
    userId: 't2_alice',
    rawPlacements: [{ row: 99, col: 0, kind: '/' }],
  });
  assert.equal(tampered.status, 400);

  const incomplete = await submitSolution({
    store,
    dateKey,
    userId: 't2_alice',
    rawPlacements: [],
  });
  assert.equal(incomplete.status, 400);
});

void test('submitSolution enforces idempotency, streaks, and rate limiting', async () => {
  const store = createMemoryRedis();
  const day1 = '2026-11-26';
  const day2 = '2026-11-27';
  const day4 = '2026-11-29';

  const sol1 = findParSolution(generateDailyPuzzle(day1));
  const res1 = await submitSolution({
    store,
    dateKey: day1,
    userId: 't2_player1',
    rawPlacements: sol1,
  });
  assert.equal(res1.status, 200);
  if (res1.status !== 200) return;
  assert.equal(res1.body.alreadySolved, false);
  assert.equal(res1.body.userStats.currentStreak, 1);
  assert.equal(res1.body.community.totalSolvers, 1);

  // Duplicate submission on same day must NOT increment streak or totalSolvers
  const dup = await submitSolution({
    store,
    dateKey: day1,
    userId: 't2_player1',
    rawPlacements: sol1,
  });
  assert.equal(dup.status, 200);
  if (dup.status !== 200) return;
  assert.equal(dup.body.alreadySolved, true);
  assert.equal(dup.body.userStats.currentStreak, 1);
  assert.equal(dup.body.community.totalSolvers, 1);

  // Consecutive day increments streak to 2
  const sol2 = findParSolution(generateDailyPuzzle(day2));
  const res2 = await submitSolution({
    store,
    dateKey: day2,
    userId: 't2_player1',
    rawPlacements: sol2,
  });
  assert.equal(res2.status, 200);
  if (res2.status !== 200) return;
  assert.equal(res2.body.userStats.currentStreak, 2);
  assert.equal(res2.body.userStats.bestStreak, 2);

  // Missing a day resets currentStreak to 1 while preserving bestStreak
  const sol4 = findParSolution(generateDailyPuzzle(day4));
  const res4 = await submitSolution({
    store,
    dateKey: day4,
    userId: 't2_player1',
    rawPlacements: sol4,
  });
  assert.equal(res4.status, 200);
  if (res4.status !== 200) return;
  assert.equal(res4.body.userStats.currentStreak, 1);
  assert.equal(res4.body.userStats.bestStreak, 2);

  // Rate limit triggers after > 15 attempts in the window
  let hitRateLimit = false;
  for (let i = 0; i < 20; i += 1) {
    const attempt = await submitSolution({
      store,
      dateKey: day4,
      userId: 't2_spammer',
      rawPlacements: [],
    });
    if (attempt.status === 429) {
      hitRateLimit = true;
      break;
    }
  }
  assert.equal(hitRateLimit, true);
});

void test('shareSolvedResultComment blocks unsolved users and prevents duplicate comment spam', async () => {
  const store = createMemoryRedis();
  const dateKey = '2026-11-27';

  const blocked = await shareSolvedResultComment({
    store,
    postId: 't3_abc',
    dateKey,
    userId: 't2_bob',
    postComment: async () => 'posted',
  });
  assert.equal(blocked.status, 403);

  const sol = findParSolution(generateDailyPuzzle(dateKey));
  await submitSolution({
    store,
    dateKey,
    userId: 't2_bob',
    rawPlacements: sol,
  });

  let commentCalls = 0;
  const firstShare = await shareSolvedResultComment({
    store,
    postId: 't3_abc',
    dateKey,
    userId: 't2_bob',
    postComment: async () => {
      commentCalls += 1;
      return 'posted';
    },
  });
  assert.equal(firstShare.status, 200);
  if (firstShare.status !== 200) return;
  assert.equal(firstShare.body.posted, true);
  assert.equal(commentCalls, 1);

  const secondShare = await shareSolvedResultComment({
    store,
    postId: 't3_abc',
    dateKey,
    userId: 't2_bob',
    postComment: async () => {
      commentCalls += 1;
      return 'posted';
    },
  });
  assert.equal(secondShare.status, 200);
  if (secondShare.status !== 200) return;
  assert.equal(secondShare.body.alreadyPosted, true);
  assert.equal(commentCalls, 1);

  const state = await initGameState({
    store,
    postId: 't3_abc',
    dateKey,
    userId: 't2_bob',
    username: 'bob',
  });
  assert.equal(state.solvedRecord?.commented, true);
  assert.equal(state.userStats.totalWins, 1);
});
