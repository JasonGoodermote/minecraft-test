# Build-Up Bot v2 — natural movement and camera

This is an upgrade for your existing Railway `minecraft-test` service. You do **not** need a new Minecraft server, TikTok account, or Railway project.

## Deploy using your existing GitHub repository

1. Download `tower-bot-natural-upgrade.zip` and extract it on Windows.
2. In GitHub, navigate all the way to your existing **`tower-bot`** directory (inside your current two nested `minecraft-tiktok-no-purchase` folders).
3. Click **Add file → Upload files** and drag in the extracted **`index.js`** and **`package.json`** files. Commit to `main` and approve replacement of the same-named files if prompted.
4. Keep your existing `Dockerfile` unchanged (the Canvas-enabled version you installed earlier).
5. Railway will normally deploy the new commit. If not, use `minecraft-test → Deployments → Redeploy` with the latest commit.
6. In **minecraft-test → Variables**, keep all existing Minecraft and RCON variables. Set or update the following values:

```env
TOWER_WIDTH=13
TOWER_HEIGHT=15
STEP_MS=850
USE_WALKING=true
NATURAL_PLACEMENT=true
SURVEY_EVERY=21
REPAIR_EVERY=12
CLEAR_ON_START=true
VIEWER_FIRST_PERSON=true
VIEW_DISTANCE=8
```

`CLEAR_ON_START=true` will **delete the previous tower only inside the bot's configured build area** when the bot starts. Set to false to preserve your current tower, but then it may build through existing blocks. Keep your original TOWER_X/TOWER_Y/TOWER_Z. Avoid overlap with anything else you built in the world.

7. Redeploy. Open your existing Railway viewer URL in Chrome and refresh.
8. In the logs look for `Starting natural builder v2` and `Minecraft bot spawned (natural builder v2)`. After creative inventory setup look for `Natural placement item loaded`. If placement fails, the bot falls back to RCON without stopping.

## What changed

- A wider default stage, so it does not feel like a small enclosed 7x7 cage.
- Mineflayer-driven **real incremental movement** instead of `/tp` after every block. It walks via game controls on adjacent same-height blocks, and flies when changing floor or returning from an excursion.
- It aims its head toward new placements and looks around naturally.
- Periodic brief fly-arounds show the surrounding tower before returning to work.
- It tries to **actually place the block** (`bot.placeBlock`) against a neighboring block. If that fails, it falls back to your existing reliable RCON `setblock` method.
- Detects nearby spawned TNT entities and pauses, flinches and checks recently built areas for damage.

## Limits

This is a best-effort upgrade, not a claimed tested Railway integration. We syntax-checked the JavaScript and checked the route math, but did not run a Minecraft/Paper world locally. Minecraft Java's authentic rendered hand/held-tool animations are **not** supplied by Prismarine Viewer; a real Java client would be needed for a perfect recreation. The AI host face is a separate `face-overlay` service and hasn't changed here. In 3rd-person mode (`VIEWER_FIRST_PERSON=false`) Prismarine Viewer can show the character, but that's a different camera style.

The Minecraft game TCP port (25565) and RCON port (25575) must stay private because the current setup uses offline-mode player authentication. Only publish the bot viewer HTTP port (typically 3000). Never expose RCON credentials in GitHub or the livestream.

If new logs contain `Natural placement unavailable`, `Movement fallback`, or `Step failed`, copy the relevant lines without secrets for debugging.
