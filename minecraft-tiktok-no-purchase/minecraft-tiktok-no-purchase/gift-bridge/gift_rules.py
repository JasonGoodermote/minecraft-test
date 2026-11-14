"""Configurable gift-to-TNT rules. No TikTok or Minecraft import required."""
import json
import os
import re


def normalize(name):
    return re.sub(r"\s+", " ", str(name or "").casefold().strip())


def _number(name, default, max_allowed):
    try:
        return max(1, min(max_allowed, int(os.environ.get(name, str(default)))))
    except ValueError:
        return default


def classify_gift(name, count=1, diamonds=0):
    """Return (tnt_to_spawn, is_big_gift); use gift unit value, not repeat_count, to choose scratch."""
    defaults = {'cowboy hat': 12}
    try:
        custom = json.loads(os.environ.get('BIG_GIFTS_JSON', '{}'))
        if isinstance(custom, dict):
            for key, value in custom.items():
                defaults[normalize(key)] = max(1, min(64, int(value)))
    except (ValueError, TypeError):
        pass
    name_key = normalize(name)
    big_threshold = _number('BIG_GIFT_DIAMONDS', 100, 1000000)
    big_tnt = _number('BIG_GIFT_TNT', 12, 64)
    small_tnt = _number('SMALL_GIFT_TNT', 1, 64)
    per_gift = defaults.get(name_key, big_tnt if diamonds >= big_threshold else small_tnt)
    cap = _number('MAX_TNT_PER_EVENT', 24, 64)
    total = min(cap, max(1, int(count)) * per_gift)
    is_big = name_key in defaults or diamonds >= big_threshold
    return total, is_big
