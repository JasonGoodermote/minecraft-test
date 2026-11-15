# Glass Tower v5 — Pathfinder integration pilot

**Purpose:** Integrate an existing navigation engine into the user's already deployed Glass Tower v4. This is a **field-test candidate**, NOT a trained neural agent or fully validated Minecraft bot. Syntax and route/brain tests pass locally; an actual Railway + Minecraft run has not been performed here.

## What is retained

- Separate Railway `minecraft` server, RCON, private service networking.
- `tower-bot` service and browser Prismarine Viewer; `PORT` supplied by Railway takes priority over `VIEWER_PORT`.
- 25 by 20 inner glass enclosure, Y=0..299 playable height, 20 materials switching every 15 vertical blocks.
- 7,500-block rising route, real `bot.placeBlock()` (no `/setblock` for route), creative inventory provisioning.
- TNT recognition and repair logic, existing `gift-bridge` and `face-overlay` unchanged.

## New components

- `navigation.js`: `mineflayer-pathfinder` plugin and `createHuman` movement controller (when available in installed release); fallback to ordinary Pathfinder when unavailable. No autonomous digging or scaffold-creating movement; the separate placement routine handles building. This navigator replaces the hand-coded step-by-step walking routine.
- `brain.js`: deterministic, domain-specific action priorities for interruption, fall recovery, replanning, building, and winning. Not a trained LLM. It has unit tests.
- `TOWER_TELEMETRY`: emits JSON events in Railway logs, such as building progress, navigation failure, TNT setback, rescue and win. These are the initial dataset for selecting/tuning behavior. Logs aren't stored permanently unless the user exports them or adds a log collector.

## Deploy on Railway

1. Back up the current working GitHub `tower-bot` directory or create a branch/tag. Do not replace the Minecraft service or its volumes.
2. Replace `tower-bot/index.js`, `tower-bot/route.js`, `tower-bot/grounded.js`, and `tower-bot/package.json`. **Add** `navigation.js`, `brain.js`, `test-brain.js` (other tests optional). Do not upload an extra nested folder.
3. Keep your existing Canvas-enabled `Dockerfile` for Prismarine Viewer; `npm install` installs `mineflayer-pathfinder` from the new package.json. Do not overwrite or expose secret variables.
4. Retain the existing connection variables and RCON password. Add `HUMAN_MOVEMENT=true`, `HUMAN_SEED=2026`, and `TOWER_TELEMETRY=true`.
5. **Set `ARENA_RESET=false` and `RESET_AFTER_WIN=false`** for the first navigation test, unless you intentionally need a clean test world; don't accidentally wipe the existing build. The prior v4 arena should already be sealed and drained.
6. Redeploy, view deployment logs. Watch for `[Navigator] Human-style walk and camera enabled` or standard Pathfinder fallback, then `build_progress` events; open your existing gameplay viewer URL.
7. Test first 3 vertical levels with **no TNT**, then low-rate TNT, then larger bursts. Check that there are no repeated emergency rescues or stuck loops before an unattended LIVE.

### Variables to add on top of existing v4 variables

```env
HUMAN_MOVEMENT="true"
HUMAN_SEED="2026"
TOWER_TELEMETRY="true"
ARENA_RESET="false"
RESET_AFTER_WIN="false"
```

**Important**: If `ARENA_SETUP=true` and there is no existing arena, the old setup code still needs to build it. For no-risk testing, use a dedicated copied world. `TOWER_Y=0` is correct for a 300-high glass arena in the vanilla Overworld.

## Known limitations and next work

- `createHuman` is provided in recent Pathfinder source; if absent from the exact npm build, v5 uses standard Pathfinder and logs that fallback. Neither movement mode guarantees success on the specialized rising-block route without live tests.
- Prismarine Viewer does not replicate every held-hand/first-person Minecraft animation from a native game client.
- The current TNT recovery still includes emergency teleporting as a failure recovery. It is NOT a fully natural repair planner.
- `brain.js` is a typed action selector, not AI model fine-tuning. To train a custom policy, record many full runs with randomized TNT events, label progress/fall/recovery, evaluate held-out game seeds, then replace only this decision layer; never let an LLM run arbitrary system commands.
- Pathfinding through thin walkways inside a 300-block shaft may require route redesign (continuous 2-wide stair path, landing platforms). This cannot be solved solely by adding an LLM.

## Local validation

```sh
npm run check
npm run test
```

`npm run test` does not start a real Minecraft server. Verify game physics and navigator behavior on your Railway instance before streaming.
