# TikTok Minecraft Glass Tower — Platform-Fill v7

This is a **new platform-filling bot**, not another revision of the former 16,525-block narrow staircase. It uses Mineflayer and Pathfinder to control a spectator-visible Minecraft player, and intentionally uses **RCON `/fill` bursts** for rapid construction. Each burst places up to `BURST_BLOCKS` blocks at a time; it does **not** animate individual right-click hand placements. No AI model is required to place blocks. The player moves and aims toward active construction; the gameplay is server-assisted.

## What it builds

- A 25x20 internal footprint with glass walls and an obsidian base.
- One 25-wide staging row at each elevation, then **19 additional rows** spanning the full 25 width. Result: 500 blocks per level, 300 levels.
- Materials rotate every 15 vertical levels (20 material bands).
- Physical navigation across completed rows when possible. A one-block stair attempt connects consecutive elevations. If it fails, the default stops and reports why; the optional `ALLOW_EMERGENCY_TP=true` transparently uses an assisted lift instead. Do not call it natural if using the assisted-lift setting.
- Detects nearby primed TNT entities and repairs sampled recent chunks after explosions. Does not yet compute the exact blast crater or guarantee sophisticated recovery.
- Browser viewer on Railway's `PORT` (usually 8080).

### IMPORTANT: use a NEW WORLD to look like a sky tower

The old world has terrain at ordinary elevations; `TOWER_Y=0` put the structure underground. **Make a fresh, low-ground superflat world** before deploying. Do NOT delete your prior `/data` volume. On the `Minecraft` service add the following values (or use a new instance if the world is important):

```
LEVEL=tiktok_sky_v7
LEVEL_TYPE=FLAT
GENERATOR_SETTINGS={"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":2},{"block":"minecraft:grass_block","height":1}],"biome":"minecraft:plains","features":false,"lakes":false}
MODE=survival
ONLINE_MODE=FALSE
SPAWN_MONSTERS=FALSE
SPAWN_ANIMALS=FALSE
DIFFICULTY=peaceful
ENABLE_RCON=TRUE
```

Minecraft superflat layers start at Y=-64, so ground is near Y=-61 while the tower base at Y=12 is floating far above it. A fresh `LEVEL` name makes a fresh world folder in `/data`; it does not erase the previous world. Railway env values are parsed as text; `GENERATOR_SETTINGS` must be valid single-line JSON. Keep the Minecraft server and RCON TCP ports PRIVATE.

**Use the exact same Minecraft server version already working with your Mineflayer bot**. This bot was not runtime-tested against Railway.

## Deploy to existing Railway bot

1. Back up your Minecraft `/data` volume and GitHub `tower-bot` directory.
2. Extract this package and upload its contents **directly into your existing `tower-bot` folder** on GitHub (not another nested folder).
3. Replace `index.js`, `package.json`; add `plan.js`, `test-plan.js`, and optionally replace `Dockerfile` with this version. Old `navigation.js`, `route.js`, `grounded.js`, and `brain.js` can remain but are unused.
4. Deploy the Minecraft server first, with the NEW world name, then deploy the bot. Only run one `TowerBot` connection.
5. Leave your existing `RCON_PASSWORD` secret in the bot's Railway Variables; copy/reference it from the Minecraft service (never commit a secret).
6. Open existing Railway viewer domain.

**Bot Raw Editor (except the secret):**

```env
MC_HOST="minecraft.railway.internal"
MC_PORT="25565"
BOT_USERNAME="TowerBot"
BOT_AUTH="offline"
RCON_HOST="minecraft.railway.internal"
RCON_PORT="25575"
ENABLE_VIEWER="true"
VIEWER_FIRST_PERSON="true"
VIEW_DISTANCE="10"
TOWER_X="0"
TOWER_Y="12"
TOWER_Z="0"
TOWER_WIDTH="25"
TOWER_DEPTH="20"
TOWER_HEIGHT="300"
MATERIAL_BAND_HEIGHT="15"
BURST_BLOCKS="8"
BURST_DELAY_MS="65"
MOVE_EVERY_BURSTS="6"
ARENA_SETUP="true"
ARENA_RESET="false"
REPAIR_AFTER_TNT="true"
REPAIR_LAST_BURSTS="40"
ALLOW_EMERGENCY_TP="true"
RESET_AFTER_WIN="false"
TOWER_TELEMETRY="true"
```

`ALLOW_EMERGENCY_TP=true` is suggested for the **fast demonstration mode** so a difficult stair ascent does not halt the entire stream; each use is logged as `assisted_lift`. Set it to `false` to enforce real movement, knowing the bot will halt if a staircase fails. RCON remains necessary for fast bursts, so this does not work without the existing password.

**Do not set `ARENA_RESET=true` on your existing world.** On a deliberately disposable, backed-up world only, set both `ARENA_RESET=true` and `ARENA_CLEAR_CONFIRM=I_BACKED_UP_THIS_WORLD`. This clears an approximately 25×20×300 interior; it is destructive. After successful first setup turn reset off.

## Performance options

- `BURST_BLOCKS=8`: groups up to 8 blocks with one `/fill` command (1–12 supported).
- `BURST_DELAY_MS=65`: pause after each burst; lower bound 20 ms. Server time and networking dominate actual speed.
- `MOVE_EVERY_BURSTS=6`: ask Pathfinder to walk toward the current construction every six bursts, but skip movement if no safe footing or movement times out.
- `ALLOW_EMERGENCY_TP=true`: optional assisted elevation lift; logged and visible.

This is a deliberate speed-versus-realism tradeoff: native single-placement can look realistic but is slower and fragile. Server burst placement is fast but cannot honestly be described as all performed by the player's hand.

## Troubleshooting

- `Missing RCON_PASSWORD`: add the Railway variable reference; do not paste the actual value into GitHub.
- `Login duplicate`: only one bot instance should connect as `TowerBot`.
- `Terrain around tower`: `LEVEL` may be pointing to existing generated world; use a *new* world name and check flat settings.
- `ascent_failed`: use `ALLOW_EMERGENCY_TP=true` for fast demo, or inspect the stair path to fix walking.
- `movement_skip`: logs why Pathfinder could not move. Fill continues from the current safe position.
- `WIN`: logs completion at 300 levels and stops. `RESET_AFTER_WIN` is intentionally not destructive or automatic in this build.

## Validation

`npm test` verifies route coverage across all 300 elevations (142,500 non-staging placement cells), with one material switch each 15 levels. Syntax checks passed. Full Railway/Minecraft gameplay, gift-triggered explosions, and visual authenticity still require live tests.
