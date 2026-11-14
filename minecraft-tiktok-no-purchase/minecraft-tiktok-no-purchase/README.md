# TikTok Minecraft build-up LIVE — no Minecraft purchase needed (prototype)

This variant is configured for **a private Paper server, an offline-auth Mineflayer builder, and a browser-based Prismarine Viewer**. You do **not** have to purchase/download the Minecraft Java game client or create a licensed Java username to test it. You do still need Railway hosting, access to TikTok LIVE Studio on your PC, and a connection to your TikTok livestream. The server software is subject to Minecraft's EULA.

**What this actually does:** the bot joins Minecraft under the fictional name `TowerBot`, RCON repeatedly places blocks and teleports the bot to each newly placed block, and Prismarine Viewer exposes the bot's perspective as a browser page you can capture in TikTok LIVE Studio. The gift-bridge triggers TNT through RCON, and the photographic (synthetic, not a webcam feed) avatar blinks and scratches her head for big gifts.

**Honest limitations:** the builder still uses `/setblock` and `/tp` commands rather than real mouse clicks, so placement and camera motion may look abrupt. Prismarine Viewer is a simpler WebGL Minecraft renderer, **not** Minecraft Java's full client; it may render effects/particles differently. A fully smooth first-person placing-hands animation and robust TNT damage recovery are separate improvements. This variant has been syntax-checked, **not** end-to-end tested on Railway.

## Deployment order (no game purchase)

### 1. Existing Railway Minecraft service

In its Variables tab, set the following and redeploy:

```env
EULA=TRUE
TYPE=PAPER
VERSION=1.21.4
ONLINE_MODE=FALSE
MODE=creative
ENABLE_RCON=TRUE
RCON_PORT=25575
RCON_PASSWORD=generate_a_long_unique_secret
```

Do **not** enable a Minecraft TCP Proxy or expose port 25565 publicly. Do **not** expose port 25575/RCON publicly. The Minecraft world should only be accessible to the other Railway services on the project's **private** network. An offline server does not authenticate player names, so these security precautions matter. If you later want the public to join, use an authenticated server and legitimate Java accounts instead.

The original template's `OPS` and `WHITELIST` can stay blank as the bot is controlled via private RCON. Keep the existing persistent `/data` volume. Confirm the service status is running and server logs say `Done`.

### 2. tower-bot service **(also hosts the browser camera)**

Deploy the `tower-bot/` subdirectory of this package to Railway as another service in the same project (its Dockerfile installs Mineflayer, RCON client, and Prismarine Viewer). Set:

```env
MC_HOST=minecraft.railway.internal
MC_PORT=25565
BOT_USERNAME=TowerBot
BOT_AUTH=offline
ENABLE_VIEWER=true
RCON_HOST=minecraft.railway.internal
RCON_PORT=25575
RCON_PASSWORD=the_same_secret_as_minecraft
TOWER_X=0
TOWER_Y=100
TOWER_Z=0
TOWER_WIDTH=7
TOWER_HEIGHT=15
STEP_MS=850
BUILD_BLOCK=minecraft:diamond_block
```

**Important:** `minecraft.railway.internal` assumes the Minecraft service is actually named `minecraft` (case-insensitive DNS depends on Railway's displayed private domain). If you renamed it, use the exact private hostname Railway shows under service Settings > Networking; Railway's private domain is not necessarily the public domain. Avoid hardcoding a fake private address.

For viewer hosting, generate a **public HTTP domain** on the **tower-bot** service (not the Minecraft service). Railway sets the `PORT` variable for the web service, which the viewer reads automatically. The viewer opens at `https://YOUR-TOWER-BOT-DOMAIN/`. It is a public, read-only view of the bot. Do not put secrets on that page. An HTTP 502 or blank screen can mean the bot hasn't joined and the viewer hasn't started yet.

In logs look for `Minecraft bot spawned` and `Browser Minecraft viewer listening on port ...`. If the program fails to connect, confirm the Minecraft server is fully running and `ONLINE_MODE=FALSE`, the bot's `BOT_AUTH=offline`, and the RCON password/hostname match.

### 3. Face overlay

Deploy `face-overlay/` as a separate Railway Node service, with a public domain and a long random `ADMIN_TOKEN`. Open its `https://YOUR-FACE-DOMAIN/studio`, enter the token and test `Scratch head`. For the clean stream use `https://YOUR-FACE-DOMAIN/overlay` in a browser window or LIVE Studio's Link source. The included host is a **synthetic photo-frame animation**, not real video footage.

Optional on `tower-bot`: set `OVERLAY_URL=https://YOUR-FACE-DOMAIN` and `ADMIN_TOKEN` to the same face-overlay secret to synchronize level progress.

### 4. Gift bridge

Deploy `gift-bridge/` as a background worker and set:

```env
TIKTOK_USERNAME=your_tiktok_username_without_at
RCON_HOST=minecraft.railway.internal
RCON_PORT=25575
RCON_PASSWORD=the_same_secret_as_minecraft
MINECRAFT_TARGET=TowerBot
OVERLAY_URL=https://YOUR-FACE-DOMAIN
ADMIN_TOKEN=the_same_secret_as_face_overlay
BIG_GIFTS_JSON={"Cowboy Hat":12}
BIG_GIFT_DIAMONDS=100
BIG_GIFT_TNT=12
SMALL_GIFT_TNT=1
MAX_TNT_PER_EVENT=24
```

The bridge uses unofficial TikTokLive and is not guaranteed to work indefinitely. Its gift names and counts require verification against actual events. `Cowboy Hat` should both trigger the TNT burst and head-scratch; Rose triggers smaller TNT. The bridge requires your account to be live for real incoming events. Never publish passwords or keys.

### 5. Broadcast through TikTok LIVE Studio on your PC

1. Open the public Railway **tower-bot viewer URL** in Chrome or Edge. The page should show Minecraft blocks/changes (no purchased Minecraft client needed).
2. Open the **face-overlay/overlay** URL in another browser window, or add it as LIVE Studio's Link/Browser source if available.
3. In LIVE Studio choose a portrait 1080×1920 scene. Add a window capture of the viewer; crop away tabs/address bar. Add the face overlay above it. If LIVE Studio captures a black screen, try a window capture with hardware acceleration changes or an OBS virtual camera pipeline.
4. Simulate a TNT event on the private server (e.g. via Railway RCON console) **before** using real TikTok gifts. Confirm the video actually displays TNT; WebGL viewer particle/explosion support can differ from the game client.
5. Go live and verify the gift bridge creates TNT and a large gift causes the face to scratch her head. Test with a small audience and stop if the renderer cannot display the explosions.

**Cost:** no Minecraft game purchase required, but Railway services can incur usage charges. This isn't guaranteed zero-cost hosting.

## Project components

- `tower-bot/`: headless bot and first-person Prismarine Viewer (no game purchase)
- `face-overlay/`: photographic synthetic host + browser-based control room
- `gift-bridge/`: TikTok gift events -> Minecraft TNT + facial reactions

## Useful verification

```sh
node --check tower-bot/index.js
node --check face-overlay/server.js
python -m unittest discover -s gift-bridge -p 'test_*.py'
```

Reference libraries:
- https://github.com/PrismarineJS/mineflayer
- https://github.com/PrismarineJS/prismarine-viewer
- https://github.com/itzg/docker-minecraft-server

---


## Original project notes (some describe the older purchased-client option)

# TikTok LIVE Minecraft + Animated Face — Railway Starter

This package contains **working starter software for the animated face** and a **separate gift-to-Minecraft bridge**. It does **not** include a Minecraft world/tower, an automatic parkour player, a Minecraft video renderer, a TikTok broadcast encoder, or a photorealistic face-generation model. Those are separate components. No deployment or live TikTok connection was performed in this package.

## Architecture

- **Service 1: `face-overlay`** — Node.js animated 2D AI persona, 1080×1920 transparent browser source, natural blinking, animated head scratch for large gifts, and 3-frame custom artwork support. No moving mouth or voice.
- **Service 2: `minecraft`** — Paper Minecraft server on Railway, private RCON port and public Minecraft TCP proxy. Deploy from https://railway.com/deploy/minecraft-server-p-1 or another Railway Paper template. Keep its data volume.
- **Service 3: `gift-bridge`** — Python gift listener using the third-party unofficial TikTokLive library; a normal gift triggers a small TNT effect; big gifts (e.g. Cowboy Hat) trigger many TNT and the avatar scratches its head.
- **Video & broadcast:** Minecraft **client/viewer** plus the browser overlay inside **OBS or TikTok LIVE Studio**. The Minecraft server alone never draws a picture. Capture the Minecraft client, put the face overlay above it, and broadcast. See the cloud section below for 24/7 remote operation.

## Deploy on Railway

### Step 1 — Face
1. Upload the project to your own GitHub repository (or use Railway's CLI).
2. In Railway create a new service from that repository and select **Root Directory: `/face-overlay`**. Deploy using its Dockerfile. Use a single replica (the SSE events are held in memory).
3. Add **`ADMIN_TOKEN`** with a long, unique secret (e.g. generate 32 random bytes). This secret protects gift triggers and settings. DO NOT publish it as a client-side query string.
4. Optionally mount a volume at **`/data`** to preserve custom character settings after redeploys.
5. Settings → Networking → Generate Domain; visit `https://YOUR-DOMAIN/studio`.
6. Paste ADMIN_TOKEN into the studio control panel and click **Rose · 1 TNT**, **Cowboy Hat · 12 TNT**, **Scratch head**, or **Level up**. The embedded live preview updates via Server-Sent Events.
7. Set custom avatar artwork to **3 consistent PNG/WebP HTTPS URLs**: idle, eyes closed, and head scratching. The default SVG avatar already blinks and moves its arm to scratch its head.
8. The clean video layer is **`https://YOUR-DOMAIN/overlay`**, made for a 1080×1920 portrait OBS Browser Source. The lower area is transparent.

### Step 2 — Minecraft
1. Deploy a Paper Minecraft Railway template, such as https://railway.com/deploy/minecraft-server-p-1 .
2. Read and accept the Minecraft EULA. Choose and **pin a stable Minecraft version that your client and plugins support**. In the server set `EULA=TRUE`, `TYPE=PAPER`, `ENABLE_RCON=TRUE`, and a strong `RCON_PASSWORD`. Keep these variables in Railway secrets. Recommended `MAX_MEMORY=2G` or higher depending on the game.
3. Attach a volume at `/data` to preserve the world. In networking create a TCP Proxy for internal Minecraft port `25565`. Railway generates `host:port` for your Minecraft **client**, not your video stream.
4. Put your parkour or tower map in the Paper world (use a compatible map or build your own). A tower map and autonomous player logic are **not** included in this starter.
5. Join the server using your Minecraft Java Edition client with that external proxy address; the name of the player receiving TNT must equal `MINECRAFT_TARGET` below.
6. Keep **RCON port 25575 private** (internal `minecraft.railway.internal:25575`). Never expose it via Railway TCP proxy.

### Step 3 — Connect gifts
1. In Railway create a new service from this repo with **Root Directory: `/gift-bridge`**. It is a background worker and needs no public domain.
2. Set variables:

```env
TIKTOK_USERNAME=your_tiktok_username_without_at
RCON_HOST=minecraft.railway.internal
RCON_PORT=25575
RCON_PASSWORD=exact_same_secret_as_minecraft
MINECRAFT_TARGET=YourMinecraftUsername
OVERLAY_URL=https://your-face-domain.up.railway.app
ADMIN_TOKEN=exact_same_secret_as_face_overlay
MAX_TNT_PER_EVENT=24
BIG_GIFTS_JSON={"Cowboy Hat":12,"Galaxy":20}
BIG_GIFT_DIAMONDS=100
BIG_GIFT_TNT=12
SMALL_GIFT_TNT=1
```

3. Start the TikTok LIVE session. When gifts arrive, **Rose defaults to one TNT**, **Cowboy Hat defaults to 12 TNT plus a head scratch**, and other gifts with at least `BIG_GIFT_DIAMONDS` use `BIG_GIFT_TNT` plus a scratch. Name matching is case-insensitive; add your own gift names to `BIG_GIFTS_JSON`. Each *event* is bounded by `MAX_TNT_PER_EVENT` (default 24) to protect the server. These are gameplay settings, not claims about TikTok gift pricing.
4. This gift listener uses the **unofficial** TikTokLive library and may require maintenance when TikTok changes its services. Before relying on it commercially, verify policies and rights for your account/region. It filters interim streak events to avoid repeated counting.
5. TNT and other effects are triggered **on real gifts**, not fabricated gift events. The local studio test buttons are only a simulator for preflight testing.

### Step 4 — Broadcasting

**Fastest path (recommended for first test)**:
1. Launch Minecraft Java Edition on your PC and connect to Railway Minecraft.
2. In OBS, create a **1080×1920**, 30-fps portrait scene and add a Game Capture of Minecraft.
3. Resize/crop Minecraft to fill the lower section of the portrait output. Add a **Browser Source above it** pointing to `https://YOUR-FACE-DOMAIN/overlay` at **1080×1920**. The transparent part lets Minecraft show through.
4. The avatar is silent, with no mouth movement, voice generation, or TTS requirement.
5. Use TikTok LIVE Studio, OBS Virtual Camera via the eligible TikTok desktop LIVE flow, or an RTMP streaming endpoint **only if your account offers it**. TikTok may not provide RTMP/server keys to every creator.

**If everything must be cloud-hosted**: You still need a **renderer and encoder** such as a Minecraft client/viewer in headless Chromium under Xvfb, combined with browser avatar and FFmpeg into an authorized TikTok ingest endpoint. This is a substantially different, more CPU-demanding service, and depends on streaming access. Railway Paper Minecraft plus the face service **is not a self-broadcasting TikTok LIVE**. A GPU-equipped streaming VM may be more economical/reliable for a long-running graphical encoder.

## API

Get `GET /health` for health status, `GET /api/state` for settings, and `GET /api/events` for the public read-only EventSource stream. POST with `Authorization: Bearer <ADMIN_TOKEN>`:

```bash
curl -X POST https://YOUR-FACE-DOMAIN/api/control \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"gift","gift":"Rose","viewer":"DemoUser","count":1,"tnt":1,"big":false}'
```

Use `action` values `gift`, `boom`, `scratch`, `win`, `level`, `reset`, or `idle`. `gift` optionally accepts `tnt` and `big` (boolean). A true `big` triggers the 3.1-second head scratch. `win` automatically increases the display level, but **does not know when the Minecraft player really wins** until your game logic posts that event.

## Limitations

- The included illustrated host uses timed eye blinks and a CSS/SVG arm for scratching. In custom photo mode use 3 matching images (idle, blink, hand touching head). Without a scratch image, a photograph will only show a small tilt, not a real hand movement.
- Photorealistic image-to-video animation is not included; the illustrated SVG arm animation works immediately and needs no GPU.
- This package has not connected to a real Minecraft/TikTok server for integration testing; you must validate your Paper version, RCON permissions, Minecraft targeting, and gift library in staging.
- At very high gift rates the bridge caps TNT per event and has a bounded queue; some overflow may be discarded to keep the server responsive. Tune this if necessary.
- Strongly label a synthetic AI host as synthetic. Do not impersonate an actual person or misrepresent live gameplay.

## How the big gift animation works

- Idle: character breathes gently and blinks at randomized intervals; mouth stays closed.
- Small gift: TNT spawns at the target player and the avatar flinches.
- Cowboy Hat or a large-value gift: a bigger TNT burst spawns, the avatar raises an arm, scratches the temple, then lowers it after ~3.1 seconds. Consecutive big gifts restart the scratch.
- No camera, tracking service, microphone, or AI inference server is needed.
- Run `python -m unittest discover -s gift-bridge -p 'test_*.py'` to verify gift mapping. Use the control room on `/studio` to simulate gifts without TikTok.
- The Minecraft parkour autoplayer/tower and actual TikTok broadcast encoding are **not supplied** by this package.

## UPDATED: Build-up tower bot (not parkour)

The sample screenshots show a *block placement ascent*: a first-person Minecraft player lays blocks in a growing level, gifts spawn TNT and demolish progress, and the character keeps building. `tower-bot/` now provides a simple deterministic version of that loop; it is **not** a spiral-climbing/pathfinder bot.

Deploy `tower-bot/` as another Railway service in the same project with these variables:

```env
MC_HOST=minecraft.railway.internal
MC_PORT=25565
BOT_USERNAME=TowerBot
BOT_AUTH=offline
RCON_HOST=minecraft.railway.internal
RCON_PORT=25575
RCON_PASSWORD=match_your_paper_server_secret
TOWER_X=0
TOWER_Y=100
TOWER_Z=0
TOWER_WIDTH=7
TOWER_HEIGHT=15
STEP_MS=850
BUILD_BLOCK=minecraft:diamond_block
OVERLAY_URL=https://YOUR-FACE-DOMAIN
ADMIN_TOKEN=match_face_token
```

Set `MINECRAFT_TARGET=TowerBot` in `gift-bridge/` so gifts explode near the builder. Bot uses the `mineflayer` Java protocol client and RCON commands to place each block and reposition the builder; its motion is **server-controlled**, not physics-based mouse clicking. The course is a 7x7 serpentine build per floor, ascending 15 floors before clearing for the next round. Explosions destroy blocks unless you disable TNT block damage. The controller keeps moving/rebuilding; rebuilding previously destroyed squares is not yet tracked, and heavy TNT can expose gaps. For best real-looking footage capture the view from a **separate Minecraft Java client/spectator** because a headless mineflayer bot does not render video. OBS or an independent cloud renderer is still required.

**Security/auth:** The example's `BOT_AUTH=offline` requires `ONLINE_MODE=FALSE` on the Paper server, which is unsafe for a public Minecraft server (username spoofing). Use a private, access-restricted test server only. For production keep `ONLINE_MODE=TRUE`, use a legitimate Microsoft-authenticated Java account with `BOT_AUTH=microsoft`, a persisted auth cache at `/data/minecraft-auth`, and complete account authorization before unattended deployment. Do not expose RCON publicly.

To prevent TNT instantly killing the builder, the setup gives creative mode plus resistance. Server TNT is triggered by `gift-bridge` (as before). This is intended as a customizable proof of concept. Minecraft Java version compatibility, Railway networking and the exact gift names must be tested with the target server. The supplied photorealistic AI-avatar sprite source is an **AI-generated image**, not a genuine webcam recording of a real person.
