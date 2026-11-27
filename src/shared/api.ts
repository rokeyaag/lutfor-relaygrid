import type { DailyPuzzle, MirrorPlacement } from './relaygrid';

export type UserStats = {
  currentStreak: number;
  bestStreak: number;
  totalWins: number;
  parWins: number;
  lastSolvedDate: string | null;
};

export type SolvedRecord = {
  dateKey: string;
  mirrorsUsed: number;
  stars: 0 | 1 | 2 | 3;
  placements: MirrorPlacement[];
  solvedAt: string;
  commented: boolean;
};

export type CommunityStats = {
  totalSolvers: number;
  parSolvers: number;
  mirrorHistogram: Record<string, number>;
  percentile: number;
};

export type InitGameResponse = {
  type: 'init';
  postId: string;
  username: string;
  isAuthenticated: boolean;
  puzzle: DailyPuzzle;
  userStats: UserStats;
  solvedRecord: SolvedRecord | null;
  community: CommunityStats;
};

export type SubmitSolutionResponse = {
  type: 'submit';
  solved: boolean;
  alreadySolved: boolean;
  solvedRecord: SolvedRecord;
  userStats: UserStats;
  community: CommunityStats;
};

export type ShareCommentResponse = {
  type: 'share_comment';
  posted: boolean;
  alreadyPosted: boolean;
  commentText: string;
  reason?: 'not_authenticated' | 'user_permission_required' | 'rate_limited';
};

export type ApiErrorResponse = {
  status: 'error';
  message: string;
};
