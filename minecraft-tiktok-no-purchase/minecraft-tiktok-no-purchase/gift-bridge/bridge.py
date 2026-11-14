"""TikTok LIVE -> Railway Minecraft Paper/RCON + no-mouth blinking/scratch overlay.

This uses the unofficial TikTokLive library. TikTok gift events only; Minecraft
client/stream encoder must run separately. RCON port must remain private.
"""
import asyncio
import json
import os
import urllib.request
from mcrcon import MCRcon
from TikTokLive import TikTokLiveClient
from TikTokLive.events import GiftEvent, ConnectEvent
from gift_rules import classify_gift

USERNAME = os.environ.get('TIKTOK_USERNAME', '').strip().lstrip('@')
HOST = os.environ.get('RCON_HOST', 'minecraft.railway.internal')
PORT = int(os.environ.get('RCON_PORT', '25575'))
PASSWORD = os.environ.get('RCON_PASSWORD', '')
TARGET = os.environ.get('MINECRAFT_TARGET', 'Streamer')
OVERLAY_URL = os.environ.get('OVERLAY_URL', '').rstrip('/')
OVERLAY_TOKEN = os.environ.get('ADMIN_TOKEN', '')
QUEUE = asyncio.Queue(maxsize=200)

if not TARGET or len(TARGET) > 16 or not all(c.isascii() and (c.isalnum() or c == '_') for c in TARGET):
    raise ValueError('MINECRAFT_TARGET must be a valid Java username (1–16 ASCII letters, numbers, underscores)')


def minecraft(command):
    with MCRcon(HOST, PASSWORD, port=PORT) as conn:
        return conn.command(command)


def overlay(viewer, gift, count, tnt, is_big):
    if not OVERLAY_URL or not OVERLAY_TOKEN:
        return
    data = json.dumps({'action': 'gift', 'viewer': viewer, 'gift': gift,
                       'count': count, 'tnt': tnt, 'big': is_big}).encode()
    req = urllib.request.Request(OVERLAY_URL + '/api/control', data=data, method='POST',
        headers={'Authorization': 'Bearer ' + OVERLAY_TOKEN, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=8) as result:
        result.read()


async def worker():
    while True:
        viewer, gift, count, diamonds = await QUEUE.get()
        try:
            tnt, is_big = classify_gift(gift, count, diamonds)
            print(f'@{viewer} sent {count}x {gift} ({diamonds} diamonds each) => {tnt} TNT / scratch={is_big}', flush=True)
            # Face reaction starts at the same time as the TNT burst, not afterwards.
            try:
                await asyncio.to_thread(overlay, viewer, gift, count, tnt, is_big)
            except Exception as exc:
                print('Overlay unavailable:', repr(exc), flush=True)
            if PASSWORD:
                for i in range(tnt):
                    # Summon at the target player. Keep world/plugin protections in mind.
                    # Each TNT consumes a command; rate limiting protects the server.
                    command = f'execute at {TARGET} run summon minecraft:tnt ~ ~ ~'
                    try:
                        await asyncio.to_thread(minecraft, command)
                    except Exception as exc:
                        print('RCON command failed:', repr(exc), flush=True)
                        break
                    await asyncio.sleep(0.12)
            else:
                print('Demo mode — RCON_PASSWORD not set, no TNT spawned', flush=True)
        finally:
            QUEUE.task_done()


async def monitor():
    asyncio.create_task(worker())
    if not USERNAME:
        raise ValueError('Set TIKTOK_USERNAME in Railway')
    while True:
        client = TikTokLiveClient(unique_id='@' + USERNAME)

        @client.on(ConnectEvent)
        async def on_connect(event):
            print(f'Connected to TikTok LIVE @{USERNAME}', flush=True)

        @client.on(GiftEvent)
        async def on_gift(event):
            if event.gift is None or event.user is None or event.streaking:
                return
            # Only the final message of a streak counts: repeat_count is cumulative.
            count = max(1, int(event.repeat_count or 1))
            name = str(event.gift.name or 'Gift')[:60]
            diamonds = max(0, int(getattr(event.gift, 'diamond_count', 0) or 0))
            user = str(event.user.unique_id or 'viewer')[:60]
            try:
                QUEUE.put_nowait((user, name, count, diamonds))
            except asyncio.QueueFull:
                print('Queue full; skipping gift event to protect Minecraft', flush=True)

        try:
            print(f'Connecting to @{USERNAME} ...', flush=True)
            await client.connect()
        except Exception as exc:
            print('TikTok connection ended:', repr(exc), flush=True)
        await asyncio.sleep(15)


if __name__ == '__main__':
    asyncio.run(monitor())
