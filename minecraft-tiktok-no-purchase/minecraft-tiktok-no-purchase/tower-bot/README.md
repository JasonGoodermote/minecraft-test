# Glass Tower Builder v3 — Railway drop-in upgrade

Replaces the scripted flat 13x13 stage with a 25x20-block **usable interior**, enclosed by glass walls rising 300 blocks, a winding route that gains one vertical block for each 25 placed route blocks, and a material change every 15 blocks in vertical height. The builder should reach the goal at the top, and TNT can break the route so the bot rewinds to the earliest observed damaged section within its recent path.

**This is a prototype:** its geometry was tested locally and its JavaScript passed syntax checks; no live Railway/Paper/Mineflayer integration test was possible here. Prismarine Viewer will never look identical to the official Minecraft Java client, especially hand animations and TNT particles. Blocks may be placed by server commands when native Mineflayer placement fails. The bot combines walking on level spans with short creative flights for raised steps and recovery rather than a fully humanlike controller.

## How to update your existing Railway service

You already have the working `minecraft-test` bot service and Minecraft server. **Do not create another service.**

1. Extract `tower-bot-glass300-upgrade.zip`.
2. In GitHub navigate to your existing `tower-bot` folder, located at `/minecraft-tiktok-no-purchase/minecraft-tiktok-no-purchase/tower-bot` in the repo you showed.
3. Replace `index.js`, replace `package.json`, and **add `route.js`** from this ZIP. Optionally add `test-route.js`. Keep your existing Canvas-enabled `Dockerfile` unchanged.
4. Commit all changes to **main** and let Railway redeploy the existing bot. **Do not change your Railway root directory or viewer URL.**
5. Set the bot service environment variables below. Keep its existing RCON_PASSWORD secret/value or cross-service Railway reference unchanged.

```env
MC_HOST=minecraft.railway.internal
MC_PORT=25565
BOT_USERNAME=TowerBot
BOT_AUTH=offline
ENABLE_VIEWER=true
VIEWER_FIRST_PERSON=true
VIEW_DISTANCE=10
VIEWER_PORT=3000
RCON_HOST=minecraft.railway.internal
RCON_PORT=25575
# Preserve your existing RCON_PASSWORD separately; do not paste or commit it here.
TOWER_X=0
TOWER_Z=0
TOWER_Y=0
TOWER_WIDTH=25
TOWER_DEPTH=20
TOWER_HEIGHT=300
MATERIAL_BAND_HEIGHT=15
STEP_MS=350
NATURAL_PLACEMENT=true
USE_WALKING=true
GLANCE_EVERY=13
REPAIR_LOOKBACK=80
REPAIR_GLASS=true
ARENA_SETUP=true
ARENA_RESET=true
ARENA_CLEAR_CONFIRM=YES_CLEAR_25X20X300
RESET_AFTER_WIN=true
```

**DESTRUCTIVE RESET WARNING:** `ARENA_RESET=true` clears ALL existing blocks inside the rectangle X=0..24, Z=0..19, Y=0..299 (for the example coordinates above). It is **150,000 blocks** of world space, including naturally generated terrain, any buildings, and any items there. The floor becomes obsidian and outer walls become glass and invisible barriers. Only run this on a **dedicated, disposable server world** or after a world backup. The reset confirmation must be set to `YES_CLEAR_25X20X300` exactly. On every bot restart while `ARENA_RESET=true`, it will clear that region again. You can set `ARENA_RESET=false` later, but currently the bot does not persist its build index across deployments.

**Minecraft height constraint:** The default Java Overworld's legal block Y coordinates are -64 through 319. A 300-high arena starting at the previous `TOWER_Y=100` would exceed the build limit. `TOWER_Y=0` puts the build route at Y=0..299 and a transparent roof at Y=302. The lower portion may be below your naturally generated world surface. For a tall shaft entirely above ground, a specially created world/dimension with increased build height is required; this prototype uses the default dimension.

**Never expose the private Minecraft TCP port or RCON port publicly:** Offline-mode username authentication is insecure if you publish the game server. Only expose the Prismarine Viewer HTTP domain of the `minecraft-test` service.

## Logs that mean it started correctly

```text
Glass Tower v3: inside 25x20, height 300, Y=0
Minecraft bot spawned (Glass Tower v3)
Browser Minecraft viewer listening on port 8080
Arena setup: interior=25x20, height=300, base Y=0, clear=true
Glass tower walls, barrier reinforcement, floor and roof ready
Elevation 0/300 blocks — stage 1, material minecraft:oak_planks
...
Elevation 15/300 blocks — stage 2, material minecraft:stone_bricks
```

Your actual browser viewer port is usually the `PORT` environment variable Railway chooses (your earlier logs showed 8080). Continue to use the same generated Railway HTTPS domain.

## How to test TNT

Existing `gift-bridge` still works: it runs commands to summon primed TNT at `MINECRAFT_TARGET=TowerBot`. If you have not deployed the gift bridge, the bot can build while testing its camera and height progression.

A separate test from an authorized Minecraft console or RCON client:

```text
execute at TowerBot run summon minecraft:tnt ~ ~ ~ {fuse:60}
```

About three seconds after spawning, TNT should explode near the player and break susceptible route blocks. The bot pauses when it sees primed TNT, scans recently built blocks, and rewinds its route if it detects a hole. Glass may also break, and the bot re-glazes the nearby walls. The outer invisible barrier shell helps keep the arena enclosed.

If the bot does not detect TNT, check its event logs and ensure the explosions are allowed by your Paper configuration. If a TNT blast did not damage any route block, the bot does not invent a setback.

## Important design choice

Instead of filling **every tile of every 25x20 floor** (150,000 placements), the builder creates a **winding staircase/ramp** through the 25x20 space: a 25-block run for each one-block rise, for **7,500 construction steps** across 300 levels. This is intentional so progress is visible within a reasonable livestream. The glass walls themselves fully enclose the whole 25x20x300 air space.

## Local validation

```sh
node --check index.js
node --check route.js
node test-route.js
```

## Compatibility

- Keep your existing 1.21.4 Paper server, Canvas-enabled Dockerfile and Prismarine Viewer deployment setup.
- Viewer does not reproduce the real game's held-hand animations perfectly.
- Requires RCON working with the identical password and private hostname.
- The synthetic human host overlay and TikTok gift-bridge are separate services; this ZIP modifies only `tower-bot`.
