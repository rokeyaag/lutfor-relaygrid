import type {
  CommunityStats,
  InitGameResponse,
  ShareCommentResponse,
  SolvedRecord,
  SubmitSolutionResponse,
  UserStats,
} from '../../shared/api.ts';
import {
  formatShareCommentText,
  generateDailyPuzzle,
  getPreviousDateKey,
  getUtcDateKey,
  isValidDateKey,
  simulatePuzzle,
  validatePlacements,
  type DailyPuzzle,
} from '../../shared/relaygrid.ts';

export type RedisLike = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<string>;
  incrBy(key: string, value: number): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
};

export type CommentPoster = (params: {
  postId: string;
  text: string;
}) => Promise<'posted' | 'permission_required'>;

const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX_ATTEMPTS = 15;

const DEFAULT_USER_STATS: UserStats = {
  currentStreak: 0,
  bestStreak: 0,
  totalWins: 0,
  parWins: 0,
  lastSolvedDate: null,
};

function userStatsKey(userId: string): string {
  return `rg:user:${userId}:stats`;
}

function userSolvedKey(dateKey: string, userId: string): string {
  return `rg:solved:${dateKey}:${userId}`;
}

function rateLimitKey(dateKey: string, userId: string): string {
  return `rg:rl:${dateKey}:${userId}`;
}

function daySolversKey(dateKey: string): string {
  return `rg:day:${dateKey}:solvers`;
}

function dayParKey(dateKey: string): string {
  return `rg:day:${dateKey}:par`;
}

function dayMirrorBucketKey(dateKey: string, mirrorsUsed: number): string {
  return `rg:day:${dateKey}:m:${mirrorsUsed}`;
}

function parseJsonSafe<T>(raw: string | undefined): T | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseCount(raw: string | undefined): number {
  if (!raw) {
    return 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export async function getCommunityStats(
  store: RedisLike,
  puzzle: DailyPuzzle,
  userMirrorsUsed?: number
): Promise<CommunityStats> {
  const bucketKeys: number[] = [];
  for (let m = 1; m <= puzzle.maxMirrors; m += 1) {
    bucketKeys.push(m);
  }

  const [totalRaw, parRaw, ...bucketRaws] = await Promise.all([
    store.get(daySolversKey(puzzle.dateKey)),
    store.get(dayParKey(puzzle.dateKey)),
    ...bucketKeys.map((m) => store.get(dayMirrorBucketKey(puzzle.dateKey, m))),
  ]);

  const totalSolvers = parseCount(totalRaw);
  const parSolvers = parseCount(parRaw);
  const mirrorHistogram: Record<string, number> = {};

  bucketKeys.forEach((m, idx) => {
    mirrorHistogram[String(m)] = parseCount(bucketRaws[idx]);
  });

  let percentile = 0;
  if (totalSolvers > 0 && userMirrorsUsed !== undefined) {
    let strictlyWorse = 0;
    for (const m of bucketKeys) {
      if (m > userMirrorsUsed) {
        strictlyWorse += mirrorHistogram[String(m)] ?? 0;
      }
    }
    const equalCount = mirrorHistogram[String(userMirrorsUsed)] ?? 1;
    percentile = Math.round(((strictlyWorse + equalCount) / totalSolvers) * 100);
    percentile = Math.max(1, Math.min(100, percentile));
  }

  return {
    totalSolvers,
    parSolvers,
    mirrorHistogram,
    percentile,
  };
}

export async function getUserStats(
  store: RedisLike,
  userId: string | undefined
): Promise<UserStats> {
  if (!userId) {
    return { ...DEFAULT_USER_STATS };
  }
  const parsed = parseJsonSafe<Partial<UserStats>>(
    await store.get(userStatsKey(userId))
  );
  if (!parsed) {
    return { ...DEFAULT_USER_STATS };
  }
  return {
    currentStreak:
      typeof parsed.currentStreak === 'number' ? parsed.currentStreak : 0,
    bestStreak: typeof parsed.bestStreak === 'number' ? parsed.bestStreak : 0,
    totalWins: typeof parsed.totalWins === 'number' ? parsed.totalWins : 0,
    parWins: typeof parsed.parWins === 'number' ? parsed.parWins : 0,
    lastSolvedDate:
      typeof parsed.lastSolvedDate === 'string' &&
      isValidDateKey(parsed.lastSolvedDate)
        ? parsed.lastSolvedDate
        : null,
  };
}

export async function getSolvedRecord(
  store: RedisLike,
  dateKey: string,
  userId: string | undefined
): Promise<SolvedRecord | null> {
  if (!userId) {
    return null;
  }
  const parsed = parseJsonSafe<SolvedRecord>(
    await store.get(userSolvedKey(dateKey, userId))
  );
  if (!parsed || parsed.dateKey !== dateKey) {
    return null;
  }
  return parsed;
}

export function resolveEffectiveStreak(
  stats: UserStats,
  referenceDateKey: string
): UserStats {
  if (!stats.lastSolvedDate) {
    return stats;
  }
  const yesterday = getPreviousDateKey(referenceDateKey);
  if (
    stats.lastSolvedDate !== referenceDateKey &&
    stats.lastSolvedDate !== yesterday
  ) {
    return {
      ...stats,
      currentStreak: 0,
    };
  }
  return stats;
}

export async function initGameState(params: {
  store: RedisLike;
  postId: string;
  dateKey: string;
  userId: string | undefined;
  username: string | undefined;
}): Promise<InitGameResponse> {
  const safeDateKey = isValidDateKey(params.dateKey)
    ? params.dateKey
    : getUtcDateKey();
  const puzzle = generateDailyPuzzle(safeDateKey);

  const [rawStats, solvedRecord] = await Promise.all([
    getUserStats(params.store, params.userId),
    getSolvedRecord(params.store, safeDateKey, params.userId),
  ]);

  const userStats = resolveEffectiveStreak(rawStats, safeDateKey);
  const community = await getCommunityStats(
    params.store,
    puzzle,
    solvedRecord?.mirrorsUsed
  );

  return {
    type: 'init',
    postId: params.postId,
    username: params.username ?? 'Explorer',
    isAuthenticated: Boolean(params.userId),
    puzzle,
    userStats,
    solvedRecord,
    community,
  };
}

export type SubmitOutcome =
  | { status: 200; body: SubmitSolutionResponse }
  | { status: 400 | 401 | 429; message: string };

export async function submitSolution(params: {
  store: RedisLike;
  dateKey: string;
  userId: string | undefined;
  rawPlacements: unknown;
  nowIso?: string;
}): Promise<SubmitOutcome> {
  if (!params.userId) {
    return {
      status: 401,
      message: 'Please sign in to Reddit to submit and save your daily score.',
    };
  }

  if (!isValidDateKey(params.dateKey)) {
    return { status: 400, message: 'Invalid puzzle date key.' };
  }

  const rlKey = rateLimitKey(params.dateKey, params.userId);
  const attempts = await params.store.incrBy(rlKey, 1);
  if (attempts === 1) {
    await params.store.expire(rlKey, RATE_LIMIT_WINDOW_SEC);
  }
  if (attempts > RATE_LIMIT_MAX_ATTEMPTS) {
    return {
      status: 429,
      message: 'Too many submission attempts. Please wait a minute and try again.',
    };
  }

  const puzzle = generateDailyPuzzle(params.dateKey);
  const validation = validatePlacements(puzzle, params.rawPlacements);
  if (!validation.ok) {
    return { status: 400, message: validation.error };
  }

  // Server-authoritative deterministic simulation
  const sim = simulatePuzzle(puzzle, validation.placements);
  if (!sim.solved) {
    return {
      status: 400,
      message: 'Beam does not power all relay targets yet.',
    };
  }

  // Idempotency lock: one official scored solve per user per puzzle day
  const existing = await getSolvedRecord(
    params.store,
    params.dateKey,
    params.userId
  );
  if (existing) {
    const [stats, community] = await Promise.all([
      getUserStats(params.store, params.userId),
      getCommunityStats(params.store, puzzle, existing.mirrorsUsed),
    ]);
    return {
      status: 200,
      body: {
        type: 'submit',
        solved: true,
        alreadySolved: true,
        solvedRecord: existing,
        userStats: resolveEffectiveStreak(stats, params.dateKey),
        community,
      },
    };
  }

  const prevStats = await getUserStats(params.store, params.userId);
  const yesterday = getPreviousDateKey(params.dateKey);
  const nextStreak =
    prevStats.lastSolvedDate === params.dateKey
      ? prevStats.currentStreak
      : prevStats.lastSolvedDate === yesterday
        ? prevStats.currentStreak + 1
        : 1;

  const updatedStats: UserStats = {
    currentStreak: nextStreak,
    bestStreak: Math.max(prevStats.bestStreak, nextStreak),
    totalWins: prevStats.totalWins + 1,
    parWins: prevStats.parWins + (sim.stars === 3 ? 1 : 0),
    lastSolvedDate: params.dateKey,
  };

  const solvedRecord: SolvedRecord = {
    dateKey: params.dateKey,
    mirrorsUsed: sim.mirrorsUsed,
    stars: sim.stars,
    placements: validation.placements,
    solvedAt: params.nowIso ?? new Date().toISOString(),
    commented: false,
  };

  const writes: Promise<unknown>[] = [
    params.store.set(
      userSolvedKey(params.dateKey, params.userId),
      JSON.stringify(solvedRecord)
    ),
    params.store.set(
      userStatsKey(params.userId),
      JSON.stringify(updatedStats)
    ),
    params.store.incrBy(daySolversKey(params.dateKey), 1),
    params.store.incrBy(
      dayMirrorBucketKey(params.dateKey, sim.mirrorsUsed),
      1
    ),
  ];

  if (sim.stars === 3) {
    writes.push(params.store.incrBy(dayParKey(params.dateKey), 1));
  }

  await Promise.all(writes);
  const community = await getCommunityStats(
    params.store,
    puzzle,
    solvedRecord.mirrorsUsed
  );

  return {
    status: 200,
    body: {
      type: 'submit',
      solved: true,
      alreadySolved: false,
      solvedRecord,
      userStats: updatedStats,
      community,
    },
  };
}

export type ShareCommentOutcome =
  | { status: 200; body: ShareCommentResponse }
  | { status: 400 | 401 | 403; message: string };

export async function shareSolvedResultComment(params: {
  store: RedisLike;
  postId: string;
  dateKey: string;
  userId: string | undefined;
  postComment: CommentPoster;
}): Promise<ShareCommentOutcome> {
  if (!params.userId) {
    return {
      status: 401,
      message: 'Please sign in to post a comment.',
    };
  }
  if (!isValidDateKey(params.dateKey)) {
    return { status: 400, message: 'Invalid puzzle date key.' };
  }

  const solved = await getSolvedRecord(
    params.store,
    params.dateKey,
    params.userId
  );
  if (!solved) {
    return {
      status: 403,
      message: 'Solve today’s RelayGrid before sharing your verified result.',
    };
  }

  const puzzle = generateDailyPuzzle(params.dateKey);
  const [stats, community] = await Promise.all([
    getUserStats(params.store, params.userId),
    getCommunityStats(params.store, puzzle, solved.mirrorsUsed),
  ]);

  const commentText = formatShareCommentText({
    puzzleNumber: puzzle.puzzleNumber,
    dateKey: params.dateKey,
    mirrorsUsed: solved.mirrorsUsed,
    parMirrors: puzzle.parMirrors,
    stars: solved.stars,
    streak: stats.currentStreak,
    percentile: community.percentile,
  });

  if (solved.commented) {
    return {
      status: 200,
      body: {
        type: 'share_comment',
        posted: false,
        alreadyPosted: true,
        commentText,
      },
    };
  }

  const result = await params.postComment({
    postId: params.postId,
    text: commentText,
  });

  if (result === 'permission_required') {
    return {
      status: 200,
      body: {
        type: 'share_comment',
        posted: false,
        alreadyPosted: false,
        commentText,
        reason: 'user_permission_required',
      },
    };
  }

  const updatedRecord: SolvedRecord = {
    ...solved,
    commented: true,
  };
  await params.store.set(
    userSolvedKey(params.dateKey, params.userId),
    JSON.stringify(updatedRecord)
  );

  return {
    status: 200,
    body: {
      type: 'share_comment',
      posted: true,
      alreadyPosted: false,
      commentText,
    },
  };
}
