import { reddit } from '@devvit/web/server';
import {
  getPuzzleNumber,
  getUtcDateKey,
  isValidDateKey,
} from '../../shared/relaygrid';

export const createDailyPost = async (dateKey?: string) => {
  const safeDateKey = isValidDateKey(dateKey) ? dateKey : getUtcDateKey();
  const puzzleNumber = getPuzzleNumber(safeDateKey);

  return await reddit.submitCustomPost({
    title: `RelayGrid #${puzzleNumber} — Daily Signal Puzzle (${safeDateKey})`,
    entry: 'default',
    postData: {
      dateKey: safeDateKey,
      puzzleNumber,
    },
    textFallback: {
      text: `Play RelayGrid #${puzzleNumber} (${safeDateKey}) — Route the beam to every relay node in as few mirrors as possible!`,
    },
  });
};
