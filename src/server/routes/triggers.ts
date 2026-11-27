import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import { getUtcDateKey } from '../../shared/relaygrid';
import { createDailyPost } from '../core/post';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const dateKey = getUtcDateKey();
    const post = await createDailyPost(dateKey);
    await redis.set(`rg:daily-post:${dateKey}`, post.id);
    const input = await c.req.json<OnAppInstallRequest>();

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `RelayGrid post created in r/${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error('Error creating initial post:', error);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to create initial post',
      },
      400
    );
  }
});
