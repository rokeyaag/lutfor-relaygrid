import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import { getUtcDateKey } from '../../shared/relaygrid';
import { createDailyPost } from '../core/post';

export const cron = new Hono();

cron.post('/daily-post', async (c) => {
  const dateKey = getUtcDateKey();
  const lockKey = `rg:daily-post:${dateKey}`;

  try {
    const existing = await redis.get(lockKey);
    if (existing) {
      return c.json<TriggerResponse>(
        {
          status: 'success',
          message: `Daily post already exists for ${dateKey}`,
        },
        200
      );
    }

    const post = await createDailyPost(dateKey);
    await redis.set(lockKey, post.id);

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Posted RelayGrid for ${dateKey} in r/${context.subredditName}: ${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error('Daily cron post error:', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to create daily RelayGrid post' },
      500
    );
  }
});
