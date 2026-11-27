# RelayGrid — Daily Signal & Mirror Logic Puzzle

**RelayGrid** is a bite-sized, daily optical logic puzzle built natively for Reddit using **Devvit Web** (Interactive Posts, React 19, Tailwind CSS 4, Hono, and Redis).

Every day at **00:00 UTC**, every player receives the exact same deterministic **6×6 optical grid**. Your goal is to angle mirrors (`/` and `\`) to route the emitter's beam through all glowing relay nodes simultaneously — in as few mirrors as possible.

## Links

- **Live Demo Subreddit:** https://www.reddit.com/r/lutfor_relaygrid_dev
- **Reddit App Listing:** https://developers.reddit.com/apps/lutfor-relaygrid
- **GitHub Repository:** https://github.com/rokeyaag/lutfor-relaygrid

---

## How to Play

1. **Tap any open tile** on the 6×6 grid to cycle through mirror angles: `/` → `\` → Clear.
2. **Route the signal** from the amber emitter through **every glowing relay node**.
   - Nodes are transparent sensors: the beam lights them up and passes through.
   - Cyan **◇** splitter prisms divide incoming beams into two perpendicular rays.
   - Obsidian blocks stop beams.
3. **Beat Par** (`3` or `4` mirrors depending on the day) to earn a **3-Star Par** rating, build your daily streak, and compare your spoiler-free score in the thread comments!

---

## Architecture & Security

- **Devvit Web Interactive Post**: Configured via `devvit.json` with a lightweight inline preview (`splash.html`), an expanded gameplay view (`game.html`), a daily UTC scheduler task (`/internal/cron/daily-post`), an install trigger, and a moderator menu action.
- **Deterministic Daily Puzzle Generator (`src/shared/relaygrid.ts`)**:
  - Generates a unique, reproducible puzzle per UTC date (`YYYY-MM-DD`).
  - Uses a constructive path generator paired with an **exact beam-guided solver** (`hasSolutionWithAtMost`) to guarantee every daily puzzle is 100% solvable and has no trivial shortcut below `Par`.
- **Zero-Trust, Server-Authoritative Verification (`src/server/core/gameService.ts`, `src/server/routes/api.ts`)**:
  - No puzzle answers are ever sent to the client.
  - Submissions send only the player's mirror placements, which are strictly bounds-checked, validated against non-empty cells, and **re-simulated deterministically on the server** (`MAX_SIM_STEPS = 256` cycle guard).
  - Player identity uses authenticated `context.userId`, protected by per-user rate limiting, strict payload size limits, and idempotent once-per-day Redis locks (`rg:solved:{dateKey}:{userId}`) to prevent duplicate score/streak farming.
  - Optional comment sharing generates spoiler-free Markdown strictly on the server from verified solve records.

---

## Commands

- `npm run type-check` (`npm run test:types`) — Run TypeScript strict type-checking across client, server, shared, and tests.
- `npm run lint` — Run ESLint across `src/**/*.{ts,tsx}`.
- `npm run test:unit` — Run deterministic engine, 400-day puzzle solvability, and server security tests.
- `npm run build` — Build client and server bundles into `dist/`.
- `npm run dev` — Run `devvit playtest` in your test subreddit.
- `npm run deploy` — Run type-check, lint, unit tests, and `devvit upload`.
