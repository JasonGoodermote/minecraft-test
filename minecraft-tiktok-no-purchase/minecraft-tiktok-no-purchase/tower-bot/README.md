# Minecraft Tower Bot v6.3 — survival-physics jump fix

## Root cause
v6.2 commanded Creative gamemode, then held the jump key while walking to the first block. Its logged Y ascent from 0 to 20.85 is not a normal one-block jump. This strongly implicates flight or an external levitation force. The patch changes the bot to Survival mode and uses 145ms jump pulses, with a maximum height guard.

## Update Railway
Replace `index.js`, `navigation.js`, and `package.json` in your existing `tower-bot` GitHub directory. Keep `route.js`, `grounded.js`, `brain.js`, `Dockerfile`, Railway service hostname, and existing passwords. Do not reset your arena.

Keep:
```
ARENA_SETUP=false
ARENA_RESET=false
ALLOW_EMERGENCY_TP=false
```

The bot's RCON setup now runs `gamemode survival TowerBot` and supplies each material with `/give`, equipping it through Mineflayer. Placing a block still uses native `bot.placeBlock`. This means no Minecraft purchase is needed, and player motion obeys survival physics. `gamerule fallDamage false` is also applied to facilitate testing.

## What is tested
JavaScript syntax, existing route geometry, and a static check that the bot no longer sends creative inventory injections or continuous jump. No live Minecraft/Paper server was available in this environment. **A successful first jump is not yet verified.**

## Logs to check
Expect `Version 6.3 survival-physics jump fix`, `Movement physics mode: survival`, then `adjacent_step` telemetry. If the game mode stays Creative, the bot refuses to jump.

If the bot still fails at step 0, copy the first `adjacent_step` and `Route step 0 FAILED` entries. Do not keep changing the whole configuration.

## Known remaining limits
The 16,525-block route and first-person Prismarine Viewer remain unchanged. TNT-aware rebuilding and seamless natural movement still require live integration testing.
