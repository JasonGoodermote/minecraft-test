# TowerBot v6.2 — first-step movement patch

This patch targets the confirmed Railway log failure at route step 0:
`(0.50,0.00,1.50) -> (0.5,1,0.5): Navigation timed out`.

## What changed

- `navigation.js`: walk/jump on adjacent squares using Mineflayer's own `forward`/`jump`/`lookAt` controls rather than Pathfinder. Pathfinder remains available for distant targets. No normal-play teleports or command block placements were added. Controls are cleared on success or failure.
- `index.js`: checks first target support, feet space, and headroom before attempting the jump; prints `First-step physics preflight` with the relevant block names.
- `package.json`: version bump to 6.2.0-first-step. No additional runtime dependencies.

## Install

In GitHub, navigate to the existing `tower-bot` directory and **replace only** `index.js`, `navigation.js`, and `package.json` with the three files from this archive. Do not upload the `README` or tests unless desired. Keep `route.js`, `grounded.js`, `brain.js`, and your existing Canvas-enabled `Dockerfile` unchanged.

On Railway, keep existing environment variables, **including the secret RCON_PASSWORD**. Set:

```
ARENA_SETUP=false
ARENA_RESET=false
ALLOW_EMERGENCY_TP=false
TOWER_TELEMETRY=true
MAX_MOVE_FAILURES=3
```

Arena setup was already confirmed completed in the user's logs. Do not reset or clear the arena again, unless a separate inspection shows the space is obstructed. Existing construction might block later steps; this patch only addresses the first transition.

## Read the logs

Expected beginning:

```
Version 6.2 first-step jump fix
[Navigator] v6.2: direct adjacent walk/jump, Pathfinder for distant destinations
First-step physics preflight: {...}
[Navigator] adjacent_step {...}
Elevation 1/300, band 1, minecraft:oak_planks
```

If it fails, send the `First-step physics preflight`, `[Navigator] adjacent_step`, and `move_failed` lines. These now identify feet position, support block, target head/feet, and whether the bot is on the ground. Avoid repeatedly restarting if the preflight detects an obstruction.

## Test limits

Validated JS syntax, tower route generation and decision tests, and inspected the step-zero control flow. NOT tested against an actual Minecraft server or Prismarine Viewer. Real walking and jump physics still require a Railway test. This does not claim to fully fix all future tower route transitions or recreate a human player's movement.
