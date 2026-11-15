# Minecraft TikTok Build-Up v6 — video-inspired ascent

This is a **test candidate**, built from the existing v5 Railway `tower-bot` rather than a new server. The uploaded reference video shows a human host above a first-person Minecraft view, broad purple/green construction surfaces, movement near platform edges, and intermittent death/reset screens. It **does not establish** the game's underlying code, that it uses AI, or the exact 300-block height. The requested glass dimensions and 15-block material bands are retained from your specifications.

## Changes from v5

- 25×20 interior glass arena; 300 vertical block levels, from Y=0 through Y=299.
- 20 material bands, changing each 15 levels.
- Winding one-block-per-height ascent with **broad 25×19 or 25×20 construction landings** every 15 levels. This produces extensive colored surfaces, not just a thin staircase. Native `bot.placeBlock` for every route block. No setblock for routine progress.
- Existing Mineflayer Pathfinder movement, look tracking, damage detection, and browser Prismarine Viewer retained. RCON controls arena setup and exceptional rescue only.
- Route geometry validated: 16,525 unique placements and all successive points share a horizontal face; elevation rises by at most one block per move.
- `TOWER_TELEMETRY=true` logs route progress and setbacks.

**Not included:** A 1:1 recreation of the stream's proprietary map, TikTok overlay, player skin, video graphics, or the broadcaster's automation. Prismarine Viewer cannot reproduce native Minecraft's full hand/placement animations. The reference clip does not clearly establish its exact construction algorithm. This is an informed adaptation, not a verified replica.

## GitHub / Railway installation

1. Back up or commit your existing v5 bot so you can roll back. Keep your Minecraft server and its `/data` volume unchanged.
2. Navigate to the **same** `tower-bot` folder in GitHub. Replace `index.js`, `route.js`, `grounded.js`, `navigation.js`, `brain.js`, `package.json` with the files from this ZIP. Add `test-route.js` and `test-brain.js` if desired. **Don't upload a new outer folder.**
3. Keep your working Canvas-enabled `Dockerfile`; Railway's Root Directory stays unchanged.
4. Keep your private RCON password and hostname settings. Use the configuration below.
5. **First deployment:** `ARENA_RESET=false`, `ARENA_SETUP=false` to validate startup without modifying the world. Existing v5 geometry may not match the new plan; the bot can stop on an `Unexpected ... in route` error. If so, use a **separate new world/backup**, then deliberately enable the one-time reset with the confirmation below. No reset should occur without your explicit variable changes.
6. After a deliberate clean arena reset and successful first build, return `ARENA_RESET=false` so redeploys won't wipe your work. Arena setup may be `false` after the walls exist.
7. View your existing public bot URL. Do **not** expose Minecraft/RCON ports publicly. Test first 3 levels with gifts disabled, then test TNT in a controlled session.

### Bot variables (retain existing RCON_PASSWORD separately)

```env
MC_HOST=minecraft.railway.internal
MC_PORT=25565
BOT_USERNAME=TowerBot
BOT_AUTH=offline
RCON_HOST=minecraft.railway.internal
RCON_PORT=25575
ENABLE_VIEWER=true
VIEWER_FIRST_PERSON=true
VIEW_DISTANCE=10
TOWER_X=0
TOWER_Y=0
TOWER_Z=0
TOWER_WIDTH=25
TOWER_DEPTH=20
TOWER_HEIGHT=300
MATERIAL_BAND_HEIGHT=15
STEP_MS=420
HUMAN_MOVEMENT=true
HUMAN_SEED=2026
GLANCE_EVERY=48
REPAIR_LOOKBACK=100
TOWER_TELEMETRY=true
ARENA_SETUP=false
ARENA_RESET=false
RESET_AFTER_WIN=false
ALLOW_EMERGENCY_TP=true
```

If you intentionally want a **new clean arena** after backing up the world, temporarily use:

```env
ARENA_SETUP=true
ARENA_RESET=true
ARENA_CLEAR_CONFIRM=YES_CLEAR_25X20X300
```

That reset **destroys every block in the 25×20×300 interior** and is not suitable for an existing world you want to preserve. Revert these to `ARENA_SETUP=false` and `ARENA_RESET=false` after the initial reset.

`RCON_PASSWORD` MUST be the same private secret as Minecraft's RCON password (prefer Railway cross-service variable reference).

## Sanity check (Node 22)

```
npm run check
npm run test
```

These tests validate JS syntax, path geometry, bounds and deterministic brain state. They **do not** test physics, inventory or a real Minecraft server. Actual Minecraft placement could fail in the first few levels; in that case collect deployment logs and a short screen capture before revising movement code again. Minecraft server version, bot version and mineflayer-pathfinder version must be compatible.

## Why this isn't an LLM

Movement and construction should not depend on costly or slow LLM calls. The bot navigates deterministically, with telemetry for a future learned decision policy. AI model training, if wanted, comes **after** logging successful/failed game runs and measuring recoveries on held-out blast scenarios.
