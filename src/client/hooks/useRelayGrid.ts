import { showToast } from '@devvit/web/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ApiErrorResponse,
  CommunityStats,
  InitGameResponse,
  ShareCommentResponse,
  SolvedRecord,
  SubmitSolutionResponse,
  UserStats,
} from '../../shared/api';
import {
  formatShareCommentText,
  simulatePuzzle,
  type DailyPuzzle,
  type MirrorKind,
  type MirrorPlacement,
} from '../../shared/relaygrid';

type RelayGridState = {
  loading: boolean;
  error: string | null;
  postId: string | null;
  username: string;
  isAuthenticated: boolean;
  puzzle: DailyPuzzle | null;
  userStats: UserStats;
  solvedRecord: SolvedRecord | null;
  community: CommunityStats;
  placements: MirrorPlacement[];
  history: MirrorPlacement[][];
  submitting: boolean;
  sharing: boolean;
};

const EMPTY_STATS: UserStats = {
  currentStreak: 0,
  bestStreak: 0,
  totalWins: 0,
  parWins: 0,
  lastSolvedDate: null,
};

const EMPTY_COMMUNITY: CommunityStats = {
  totalSolvers: 0,
  parSolvers: 0,
  mirrorHistogram: {},
  percentile: 0,
};

function nextMirrorKind(current: MirrorKind | undefined): MirrorKind | null {
  if (current === undefined) {
    return '/';
  }
  if (current === '/') {
    return '\\';
  }
  return null;
}

export function useRelayGrid() {
  const [state, setState] = useState<RelayGridState>({
    loading: true,
    error: null,
    postId: null,
    username: 'Explorer',
    isAuthenticated: false,
    puzzle: null,
    userStats: EMPTY_STATS,
    solvedRecord: null,
    community: EMPTY_COMMUNITY,
    placements: [],
    history: [],
    submitting: false,
    sharing: false,
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: InitGameResponse = await res.json();
        if (!active) {
          return;
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
          postId: data.postId,
          username: data.username,
          isAuthenticated: data.isAuthenticated,
          puzzle: data.puzzle,
          userStats: data.userStats,
          solvedRecord: data.solvedRecord,
          community: data.community,
          placements: data.solvedRecord ? data.solvedRecord.placements : [],
          history: [],
        }));
      } catch (err) {
        if (!active) {
          return;
        }
        console.error('Failed to load RelayGrid:', err);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: 'Could not load today’s puzzle. Please refresh.',
        }));
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const simulation = useMemo(() => {
    if (!state.puzzle) {
      return null;
    }
    return simulatePuzzle(state.puzzle, state.placements);
  }, [state.puzzle, state.placements]);

  const cycleCell = useCallback((row: number, col: number) => {
    setState((prev) => {
      if (!prev.puzzle || prev.solvedRecord || prev.submitting) {
        return prev;
      }
      if (prev.puzzle.cells[row]?.[col] !== 'empty') {
        return prev;
      }

      const existingIdx = prev.placements.findIndex(
        (p) => p.row === row && p.col === col
      );
      const existing = existingIdx >= 0 ? prev.placements[existingIdx] : undefined;
      const nextKind = nextMirrorKind(existing?.kind);

      if (nextKind === null) {
        const updated = prev.placements.filter(
          (p) => !(p.row === row && p.col === col)
        );
        return {
          ...prev,
          history: [...prev.history, prev.placements],
          placements: updated,
        };
      }

      if (!existing && prev.placements.length >= prev.puzzle.maxMirrors) {
        showToast(
          `Max ${prev.puzzle.maxMirrors} mirrors allowed. Tap a mirror to rotate or remove.`
        );
        return prev;
      }

      const updated =
        existingIdx >= 0
          ? prev.placements.map((p, idx) =>
              idx === existingIdx ? { row, col, kind: nextKind } : p
            )
          : [...prev.placements, { row, col, kind: nextKind }];

      return {
        ...prev,
        history: [...prev.history, prev.placements],
        placements: updated,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.solvedRecord || prev.history.length === 0) {
        return prev;
      }
      const previous = prev.history[prev.history.length - 1];
      if (!previous) {
        return prev;
      }
      return {
        ...prev,
        placements: previous,
        history: prev.history.slice(0, -1),
      };
    });
  }, []);

  const reset = useCallback(() => {
    setState((prev) => {
      if (prev.solvedRecord || prev.placements.length === 0) {
        return prev;
      }
      return {
        ...prev,
        history: [...prev.history, prev.placements],
        placements: [],
      };
    });
  }, []);

  const submit = useCallback(async () => {
    if (!state.puzzle || !simulation?.solved || state.submitting) {
      return;
    }
    if (!state.isAuthenticated) {
      showToast('Sign in to Reddit to save your daily streak & score!');
      return;
    }

    setState((prev) => ({ ...prev, submitting: true }));
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey: state.puzzle.dateKey,
          placements: state.placements,
        }),
      });

      if (!res.ok) {
        const errBody: ApiErrorResponse = await res.json();
        showToast(errBody.message || 'Could not verify solution.');
        setState((prev) => ({ ...prev, submitting: false }));
        return;
      }

      const data: SubmitSolutionResponse = await res.json();
      setState((prev) => ({
        ...prev,
        submitting: false,
        solvedRecord: data.solvedRecord,
        userStats: data.userStats,
        community: data.community,
        placements: data.solvedRecord.placements,
      }));
      showToast(
        data.solvedRecord.stars === 3
          ? 'Optimal Par! Score locked in.'
          : 'Grid powered! Score saved.'
      );
    } catch (err) {
      console.error('Submit failed:', err);
      showToast('Network error while verifying solution.');
      setState((prev) => ({ ...prev, submitting: false }));
    }
  }, [
    state.isAuthenticated,
    state.placements,
    state.puzzle,
    state.submitting,
    simulation?.solved,
  ]);

  const copyResultText = useCallback(async () => {
    if (!state.puzzle || !state.solvedRecord) {
      return;
    }
    const text = formatShareCommentText({
      puzzleNumber: state.puzzle.puzzleNumber,
      dateKey: state.puzzle.dateKey,
      mirrorsUsed: state.solvedRecord.mirrorsUsed,
      parMirrors: state.puzzle.parMirrors,
      stars: state.solvedRecord.stars,
      streak: state.userStats.currentStreak,
      percentile: state.community.percentile,
    });
    try {
      await navigator.clipboard.writeText(text);
      showToast('Result copied to clipboard!');
    } catch {
      showToast('Unable to access clipboard.');
    }
  }, [state.community.percentile, state.puzzle, state.solvedRecord, state.userStats.currentStreak]);

  const shareToComments = useCallback(async () => {
    if (!state.puzzle || !state.solvedRecord || state.sharing) {
      return;
    }
    setState((prev) => ({ ...prev, sharing: true }));
    try {
      const res = await fetch('/api/share-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const errBody: ApiErrorResponse = await res.json();
        showToast(errBody.message || 'Could not post comment.');
        setState((prev) => ({ ...prev, sharing: false }));
        return;
      }
      const data: ShareCommentResponse = await res.json();
      if (data.posted) {
        setState((prev) => ({
          ...prev,
          sharing: false,
          solvedRecord: prev.solvedRecord
            ? { ...prev.solvedRecord, commented: true }
            : null,
        }));
        showToast('Posted your result to the thread!');
        return;
      }

      if (data.alreadyPosted) {
        setState((prev) => ({ ...prev, sharing: false }));
        showToast('Already shared in comments!');
        return;
      }

      try {
        await navigator.clipboard.writeText(data.commentText);
        showToast('Result copied — paste into comments to share!');
      } catch {
        showToast('Use Copy Result to share in comments.');
      }
      setState((prev) => ({ ...prev, sharing: false }));
    } catch (err) {
      console.error('Share failed:', err);
      showToast('Failed to share result.');
      setState((prev) => ({ ...prev, sharing: false }));
    }
  }, [state.puzzle, state.sharing, state.solvedRecord]);

  return {
    ...state,
    simulation,
    cycleCell,
    undo,
    reset,
    submit,
    copyResultText,
    shareToComments,
  };
}
