# Minecraft Build-Up v6.1 — movement audit and mob cleanup

This is a **diagnostic reliability patch**, not a verified natural-animation solution. No live Railway connection or gameplay test has been performed. It keeps the v6 route and game world but makes its failures observable.

## Findings from v6 source

- `ARENA_SETUP=false` and `ARENA_RESET=false` can leave the old tower geometry in place; v6's new route then conflicts with solid blocks or water.
- Native block placement needs a supporting block and a safe spot from which the bot can reach it. The route's adjacency tests don't guarantee actual Pathfinder traversability or line-of-sight placement.
- The previous controller could repeatedly attempt bad navigation and fall back to emergency teleportation. This creates poor movement and obscures the underlying issue.
- Random look-around events interrupted pathfinding. Removed during building.
- Mob spawning wasn't disabled by the v6 arena setup. Peaceful + doMobSpawning=false is now set through RCON at startup. Existing passive mobs are removed by individual entity type, retaining primed TNT.

## Install

Replace `index.js`, `navigation.js`, `package.json` in the existing `tower-bot` GitHub folder with these versions. Keep `route.js`, `grounded.js`, `brain.js`, `Dockerfile`, viewer and other services unchanged. Deploy the updated commit in Railway.

Set / update these bot variables:

```env
DISABLE_MOBS=true
HUMAN_MOVEMENT=false
ALLOW_EMERGENCY_TP=false
MAX_MOVE_FAILURES=3
GLANCE_EVERY=0
ARENA_SETUP=false
ARENA_RESET=false
TOWER_TELEMETRY=true
```

Do **not** turn on ARENA_RESET on an existing world. It destroys blocks. If your original v5 and v6 routes overlap, create a backed-up new test world before resetting.

Keep existing connection variables and RCON_PASSWORD intact. In Railway Minecraft service, set `SPAWN_MONSTERS=false`, `SPAWN_ANIMALS=false`, `DIFFICULTY=peaceful` when supported by its Docker image. `gamerule doMobSpawning false` is set in the bot at startup regardless. TNT is still allowed.

## Diagnostics

Look in `tower-bot` Deploy Logs for `move_begin`, `move_end`, `move_failed`, `step_failed`. If route geometry is impossible, this version stops after failed attempts rather than hiding the issue in endless resets. A moving camera does not prove block placement is working.

`HUMAN_MOVEMENT=false` intentionally uses the stable Pathfinder controller for auditing. Once movement works, enable human steering for a separate controlled comparison. It is not guaranteed to improve the underlying route.

## Validation

`npm run check` for JS syntax; `npm run test` for route and state-machine unit checks. These do NOT validate actual Minecraft physics, navigation or vision quality.
