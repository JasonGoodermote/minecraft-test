# Glass Tower v4: grounded Minecraft builder + dry arena

**Replaces the original Glass Tower v3 `tower-bot` files.** Keep your existing Railway project, Minecraft service, GitHub repository, service root directory, browser URL, gift-bridge and face overlay. Do not redeploy the whole ZIP as a new service.

This fixes two v3 architectural issues:

- v3 placed blocks with `/setblock` then flew or teleported onto them, sometimes clipping into the build. v4 makes each route placement with `mineflayer.bot.placeBlock`, uses creative inventory to supply blocks, walks using `setControlState('forward')`, and jumps using `setControlState('jump')`. Height transitions gain a temporary support block so the next step is physically reachable. No creative flight and no command-based route placement. Server commands are retained only for **arena construction**, one initial safe spawn and **emergency recovery** after a fall/TNT (can be disabled).
- v3 cleared the arena **before** sealing it; v4 builds barrier, glass, obsidian floor and roof **first**, then empties the interior from top to bottom and drains residual water. If your existing world was generated with oceans and caves, you can still see water and terrain **outside** the glass; see “new dry world” below.

**Caveat:** Tested JavaScript syntax and route invariants locally. No live Minecraft server or Railway deployment was available to test native block placement, movement physics, water removal, gift handling or camera rendering. Treat this as an integration prototype; look at Railway logs before broadcasting.

## 1. Replace files in GitHub

1. Extract `tower-bot-grounded-v4.zip` on your computer.
2. In your GitHub repository, open the actual `tower-bot` directory. In your prior screenshot it was nested under `minecraft-tiktok-no-purchase/minecraft-tiktok-no-purchase/tower-bot`.
3. Replace `index.js`, `route.js`, and `package.json`, and **add `grounded.js`**. `test-route.js` and `test-grounded.js` are optional local tests. Commit to `main`.
4. **Keep your existing Canvas-enabled `Dockerfile`** as is. The current `package.json` retains its `canvas` dependency.
5. Railway should deploy the latest commit to your existing bot service. The logs should begin with `Version 4 grounded...`.

## 2. Eliminate water in the scene (recommended)

The old overworld has water and natural terrain around your shaft. Since a 300-block-tall arena must begin near Y=0 in the standard build-height limit, simply changing Y doesn't make the exterior dry. **The cleanest option is a NEW, superflat world** on your existing Minecraft server, using its itzg Java server image:

- Minecraft service → Variables: set `LEVEL_TYPE=FLAT` and `LEVEL=tiktok_glass_flat_v4`. Both are Java server properties supported by itzg's Minecraft Java container.
- Restart/redeploy the **Minecraft** service first. `LEVEL` selects a new world-save directory. Do this only after confirming the existing `/data` volume is persistent; your older world remains separate under its previous name. `LEVEL_TYPE` does not retroactively alter an existing world. The new world begins without ocean water around the tower.
- Keep `ONLINE_MODE=FALSE` only while the Minecraft service remains **private**, with no public TCP proxy or exposed RCON port.
- Once the Minecraft service has started and its new world has loaded, redeploy the **bot service**.

If you **want to keep the old world** instead, don't change `LEVEL`; enable a one-time arena reset (below) to seal and drain the tower interior. This will not remove an ocean **outside** the tower walls.

## 3. Railway bot-service variables

Edit **minecraft-test → Variables**. Preserve your *existing secret* `RCON_PASSWORD` (prefer Railway's reference to the Minecraft service) instead of putting a password in GitHub or this file.

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
VIEWER_PORT=3000
TOWER_X=0
TOWER_Y=0
TOWER_Z=0
TOWER_WIDTH=25
TOWER_DEPTH=20
TOWER_HEIGHT=300
MATERIAL_BAND_HEIGHT=15
STEP_MS=420
GLANCE_EVERY=24
REPAIR_LOOKBACK=100
ALLOW_EMERGENCY_TP=true
ARENA_SETUP=true
ARENA_RESET=true
ARENA_CLEAR_CONFIRM=YES_CLEAR_25X20X300
RESET_AFTER_WIN=false
```

### Important destructive-reset warning

`ARENA_RESET=true` is for **one initial cleanup on a dedicated Minecraft world**. It deletes existing blocks/terrain/water inside X=0..24, Z=0..19, Y=0..299 (adjusted for coordinates), replacing the floor and re-sealing walls. Back up the world first. It repeats every time you redeploy or reconnect if left enabled. **After confirming the new arena is dry and the route is building, set `ARENA_RESET=false`** to avoid repeated deletion of the entire tower. This version restarts its route from the beginning if its process restarts; if `ARENA_RESET=false`, it may walk over existing completed steps until it reaches new ones.

`ALLOW_EMERGENCY_TP=true` means the bot may use one RCON teleport when trapped after TNT or after repeated unsuccessful physical movement. Ordinary movement uses walking/jumping, never teleportation. Set it `false` to make it strictly no-teleport—even when stuck—and manually reset it if needed.

`RESET_AFTER_WIN=false` avoids automatic full resets at height 300 until you've verified everything. Change to `true` only when you want the 300-block challenge to restart automatically. This clears the configured arena interior on every completed attempt.

Minecraft 1.21.4 / Paper remains the initial target version; use the same version for Mineflayer compatibility. The height limit is Y=-64..319; Y=0..299 permits a roof at Y=302. The 25×20 number is *usable floor area*, not radius.

### Deprecated v3 variables

Remove/ignore `USE_WALKING`, `NATURAL_PLACEMENT`, `REPAIR_GLASS`, `SURVEY_EVERY`, `CLEAR_ON_START`, `TOWER_HEIGHT=15` if leftover. In v4, native placement and walking are always enabled.

## 4. What to look for in the logs

```text
[Grounded v4] Version 4 grounded: glass interior 25x20x300 Y=0...
[Grounded v4] Bot spawned
[Grounded v4] Browser viewer listening on port 8080
[Grounded v4] Building SEALED arena walls and floor FIRST...
[Grounded v4] Arena sealed; interior cleared/drained if reset was enabled
[Grounded v4] Spawn on the foundation ... native placement only
[Grounded v4] Elevation 1/300, band 1, minecraft:oak_planks
```

**The viewer's actual port is Railway's `PORT` override** (previously `8080`), not necessarily `VIEWER_PORT`. Continue to use the *same* public viewer URL, not the Minecraft TCP port.

If the bot stops, the error should be explicit. Examples:

- `Water or lava occupies...` → reset/drain or start a new flat world; do not start building into water.
- `No adjacent supporting block` or `Native placement failed` → the client didn't reach/support the placement position; inspect the last blocks, logs and Minecraft version. There is deliberately **no `/setblock` fallback**.
- `Walking timeout` or `Player inside a block` → bot will attempt an emergency recovery if allowed, not continue placing through solid blocks.
- `RCON authentication failed` → `RCON_PASSWORD` doesn't match the Minecraft server. Check private service addresses and Railway secret reference.
- Water **outside** the glass but not inside → the old world is still ocean/terrain; use the new flat world if you want a clear-looking scene.

## 5. Limitations and next improvements

- This version constructs the original winding 7,500-step route: 25 placements per vertical block of elevation, 300 elevations; material changes every 15 blocks of **height**. TNT can destroy the route and cause setbacks. The route is intentionally not a fully filled 25×20 floor at each elevation.
- It is not human-level path planning. It uses simple per-step walking and jumping; heavy TNT destruction, lag, or slow chunks can still require recovery.
- Prismarine Viewer is a browser-based view of a Minecraft bot, not the full Minecraft Java client; it may not reproduce authentic first-person hand-placement animations or every visual effect.
- Offline-mode Minecraft and RCON must stay PRIVATE to Railway. Publicly expose **only** the viewer HTTP service.

For tests, on a machine with Node dependencies installed, run `npm test` and `npm run check`. No Minecraft integration test was performed here.
