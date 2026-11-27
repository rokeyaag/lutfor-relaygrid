import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type { ApiErrorResponse } from '../../shared/api';
import { getUtcDateKey, isValidDateKey } from '../../shared/relaygrid';
import {
  initGameState,
  shareSolvedResultComment,
  submitSolution,
} from '../core/gameService';

export const api = new Hono();

const MAX_BODY_BYTES = 8192;

async function resolvePostDateKey(postId: `t3_${string}`): Promise<string> {
  try {
    const postData = await reddit.getPostData(postId);
    const candidate = postData?.dateKey;
    if (isValidDateKey(candidate)) {
      return candidate;
    }
  } catch (err) {
    console.warn(`Could not load postData for ${postId}:`, err);
  }
  return getUtcDateKey();
}

api.get('/init', async (c) => {
  const { postId, userId } = context;

  if (!postId) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Post context is missing.' },
      400
    );
  }

  try {
    const [dateKey, username] = await Promise.all([
      resolvePostDateKey(postId),
      userId
        ? reddit.getCurrentUsername().catch(() => undefined)
        : Promise.resolve(undefined),
    ]);

    const payload = await initGameState({
      store: redis,
      postId,
      dateKey,
      userId,
      username,
    });

    return c.json(payload, 200);
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Failed to initialize today’s grid.' },
      500
    );
  }
});

api.post('/submit', async (c) => {
  const { postId, userId } = context;
  if (!postId) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Post context is missing.' },
      400
    );
  }

  const contentLengthHeader = c.req.header('content-length');
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_BODY_BYTES) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Request payload is too large.' },
      413
    );
  }

  let body: unknown;
  try {
    const rawText = await c.req.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: 'Request payload is too large.' },
        413
      );
    }
    body = JSON.parse(rawText);
  } catch {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Malformed JSON payload.' },
      400
    );
  }

  if (typeof body !== 'object' || body === null || !('placements' in body)) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Missing placements array.' },
      400
    );
  }

  try {
    const postDateKey = await resolvePostDateKey(postId);
    const requestedDateKey =
      'dateKey' in body && isValidDateKey(body.dateKey)
        ? body.dateKey
        : postDateKey;

    // Bind submission strictly to this post's puzzle date
    if (requestedDateKey !== postDateKey) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: 'Puzzle date does not match this post.' },
        400
      );
    }

    const outcome = await submitSolution({
      store: redis,
      dateKey: postDateKey,
      userId,
      rawPlacements: body.placements,
    });

    if (outcome.status !== 200) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: outcome.message },
        outcome.status
      );
    }

    return c.json(outcome.body, 200);
  } catch (error) {
    console.error(`API Submit Error for post ${postId}:`, error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Unable to verify solution right now.' },
      500
    );
  }
});

api.post('/share-comment', async (c) => {
  const { postId, userId } = context;
  if (!postId) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Post context is missing.' },
      400
    );
  }

  try {
    const dateKey = await resolvePostDateKey(postId);
    const outcome = await shareSolvedResultComment({
      store: redis,
      postId,
      dateKey,
      userId,
      postComment: async ({ text }) => {
        try {
          await reddit.submitComment({
            id: postId,
            text,
            runAs: 'USER',
          });
          return 'posted';
        } catch (err) {
          console.warn('Comment runAs USER failed, falling back to copy:', err);
          return 'permission_required';
        }
      },
    });

    if (outcome.status !== 200) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: outcome.message },
        outcome.status
      );
    }

    return c.json(outcome.body, 200);
  } catch (error) {
    console.error(`API Share Error for post ${postId}:`, error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Could not share result right now.' },
      500
    );
  }
});
