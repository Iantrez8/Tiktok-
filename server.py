"""TikTok LIVE Virtual Gift Printer - local backend.

* WebSocket server (default ws://localhost:8765) pushes gift events to the printer page.
* Tiny HTTP server (default http://localhost:8000) serves ./web and an /img proxy that
  fetches + caches TikTok avatars/gift icons (avoids hotlink/CORS problems).
* TikTokLive (unofficial) listens to the LIVE stream and reconnects automatically.

Run:  python server.py [--user @name] [--ws-port 8765] [--http-port 8000]
      python server.py --simulate      (fake gifts, no TikTok needed)
"""
import argparse
import asyncio
import json
import os
import random
import threading
import urllib.parse
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import websockets

WEB_DIR = Path(__file__).parent / "web"
ALLOWED_IMG_HOSTS = ("tiktokcdn", "byteimg", "muscdn", "tiktok.com", "ibytedtos", "bytedance", "tiktok")
IMG_CACHE: dict[str, tuple[bytes, str]] = {}
IMG_CACHE_MAX = 500
BLANK_1PX_PNG = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'


# --------------------------------------------------------------------------- HTTP
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):  # keep console quiet
        pass

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/img":
            return self.proxy_image(urllib.parse.parse_qs(parsed.query).get("u", [""])[0])
        super().do_GET()

    def proxy_image(self, url: str):
        data, ctype = fetch_and_cache_image(url)
        if not data:
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(data)


def fetch_and_cache_image(url: str) -> tuple[bytes | None, str]:
    """Download and cache a TikTok CDN image. Never caches transient failures."""
    if not url:
        return None, "image/jpeg"
    host = urllib.parse.urlparse(url).hostname or ""
    if not url.startswith("https://") or not any(h in host for h in ALLOWED_IMG_HOSTS):
        return None, "image/jpeg"

    cached = IMG_CACHE.get(url)
    if cached and len(cached[0]) > 100:
        return cached

    for attempt in range(2):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "image/avif,image/webp,image/apng,image/jpeg,image/*,*/*;q=0.8",
                    "Referer": "https://www.tiktok.com/"
                }
            )
            with urllib.request.urlopen(req, timeout=2.5) as r:
                data = r.read(3_000_000)
                ctype = r.headers.get("Content-Type", "image/jpeg")
                if data and len(data) > 100:
                    if len(IMG_CACHE) >= IMG_CACHE_MAX:
                        IMG_CACHE.pop(next(iter(IMG_CACHE)))
                    IMG_CACHE[url] = (data, ctype)
                    return data, ctype
        except Exception:
            continue
    return None, "image/jpeg"


def start_http(port: int):
    handler = partial(Handler, directory=str(WEB_DIR))
    srv = ThreadingHTTPServer(("0.0.0.0", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()


# --------------------------------------------------------------------------- WebSocket hub
class Hub:
    def __init__(self):
        self.clients: set = set()
        self.status = {"type": "status", "tiktok": "offline", "user": "", "msg": ""}
        self.task: asyncio.Task | None = None
        self.stop_flag = False
        self.pending_streaks: dict[tuple, dict] = {}
        self.emitted_streaks: dict[tuple, dict] = {}
        self.seen_msg_ids: dict[str, float] = {}
        self.user_coins: dict[str, int] = {}
        self.user_taps: dict[str, int] = {}
        self.last_tap_emitted: dict[str, float] = {}
        self.tap_timers: dict[str, asyncio.Task] = {}
        self.last_gift_time: float = 0.0

    async def broadcast(self, msg: dict):
        data = json.dumps(msg)
        for ws in list(self.clients):
            try:
                await ws.send(data)
            except Exception:
                self.clients.discard(ws)

    async def set_status(self, tiktok: str, user: str = None, msg: str = ""):
        self.status.update(tiktok=tiktok, msg=msg)
        if user is not None:
            self.status["user"] = user
        await self.broadcast(self.status)

    async def handler(self, ws, path=None):
        self.clients.add(ws)
        try:
            await ws.send(json.dumps(self.status))
            async for raw in ws:
                try:
                    m = json.loads(raw)
                except ValueError:
                    continue
                if m.get("type") == "connect" and m.get("username"):
                    await self.connect(m["username"])
                elif m.get("type") == "disconnect":
                    await self.disconnect()
        except websockets.ConnectionClosed:
            pass
        finally:
            self.clients.discard(ws)

    async def connect(self, username: str):
        await self.disconnect()
        self.stop_flag = False
        self.task = asyncio.create_task(self.run_tiktok(username.strip().lstrip("@")))

    async def disconnect(self):
        self.stop_flag = True
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except BaseException:
                pass
            self.task = None
        await self.set_status("offline")

    # ----------------------------------------------------------------- TikTok
    async def run_tiktok(self, username: str):
        try:
            from TikTokLive import TikTokLiveClient
            from TikTokLive.events import GiftEvent, ConnectEvent, DisconnectEvent, LikeEvent
            from TikTokLive.client.errors import (
                UserOfflineError, UserNotFoundError, SignatureRateLimitError,
                SignAPIError, WebcastBlocked200Error, AgeRestrictedError,
            )
            from TikTokLive.client.web.web_settings import WebDefaults
        except ImportError:
            return await self.set_status("offline", username, "TikTokLive not installed. Run: pip install -r requirements.txt")

        # Optional free Euler Stream sign key (https://www.eulerstream.com) removes the anonymous rate limit,
        # which is the #1 cause of "keeps failing to connect". Set env var EULER_API_KEY before starting.
        api_key = os.environ.get("EULER_API_KEY") or os.environ.get("SIGN_API_KEY")
        if api_key:
            WebDefaults.tiktok_sign_api_key = api_key

        clean_user = username.strip().lstrip("@")
        delay = 3.0
        cached_room_id = None

        while not self.stop_flag:
            client = TikTokLiveClient(unique_id="@" + clean_user)

            @client.on(ConnectEvent)
            async def on_connect(event):
                nonlocal cached_room_id
                cached_room_id = client.room_id
                print(f"[TikTok] Connected to @{clean_user} LIVE! (Room ID: {client.room_id})", flush=True)
                await self.set_status("connected", clean_user, "Streaming LIVE")

            @client.on(DisconnectEvent)
            async def on_disconnect(event):
                print("[TikTok] Stream disconnected.", flush=True)

            @client.on(GiftEvent)
            async def on_gift(event):
                try:
                    await self.handle_gift(event)
                except Exception as ge:  # never let one bad gift kill the connection
                    print(f"[TikTok] Gift parse error: {ge}", flush=True)

            @client.on(LikeEvent)
            async def on_like(event):
                try:
                    await self.handle_like(event)
                except Exception as le:
                    pass

            status_msg = f"Connecting to @{clean_user}..."
            print(f"[TikTok] {status_msg}", flush=True)
            await self.set_status("connecting", clean_user, status_msg)

            wait = delay
            try:
                task = await asyncio.wait_for(client.start(
                    room_id=cached_room_id,
                    fetch_live_check=cached_room_id is None,
                    fetch_room_info=False,
                    fetch_gift_info=False,
                ), timeout=30)
                delay = 3.0
                await task
                msg = "Stream connection dropped"
                wait = 2.0  # quick resume using the cached room id
                print(f"[TikTok] Connection cycle finished for @{clean_user}.", flush=True)
            except asyncio.CancelledError:
                try:
                    await client.disconnect()
                except Exception:
                    pass
                raise
            except UserOfflineError:
                cached_room_id = None
                msg = f"@{clean_user} is OFFLINE. Go LIVE on TikTok first!"
                wait = 15.0
            except UserNotFoundError:
                cached_room_id = None
                msg = f"@{clean_user} not found / cannot go LIVE. Check spelling!"
                wait = 30.0
            except SignatureRateLimitError as e:
                try:
                    wait = float(e.calculate_retry_after(response=e.response)) + 2
                except Exception:
                    wait = 60.0
                msg = "TikTok sign server rate limit hit" + ("" if api_key else " (add a free EULER_API_KEY to avoid this)")
            except AgeRestrictedError:
                msg = "This LIVE is age-restricted; TikTok blocks anonymous viewers"
                wait = 60.0
            except (WebcastBlocked200Error, SignAPIError) as e:
                cached_room_id = None
                msg = f"TikTok blocked the request: {str(e)[:120]}"
                wait = max(delay, 10.0)
            except asyncio.TimeoutError:
                cached_room_id = None
                msg = "Timed out reaching TikTok (check internet / VPN)"
            except Exception as e:
                cached_room_id = None
                msg = f"{type(e).__name__}: {str(e)[:160]}"
            finally:
                try:
                    await client.disconnect()
                except Exception:
                    pass

            print(f"[TikTok] {msg}", flush=True)
            if not self.stop_flag:
                await self.set_status("connecting", clean_user, f"{msg} - retrying in {wait:.0f}s")
                await asyncio.sleep(wait)
                delay = min(delay * 1.5, 30)

    async def handle_gift(self, event):
        now = asyncio.get_event_loop().time()
        self.last_gift_time = now
        gift = getattr(event, "gift", None)
        user = getattr(event, "user", None)
        if not user and not gift:
            return

        # Deduplicate exact TikTok message replays on stream reconnect
        common = getattr(event, "common", None)
        msg_id = str(getattr(common, "msg_id", "") or getattr(event, "order_id", "") or "")
        if msg_id and msg_id != "0":
            if msg_id in self.seen_msg_ids:
                return
            self.seen_msg_ids[msg_id] = now
            if len(self.seen_msg_ids) > 2000:
                self.seen_msg_ids.pop(next(iter(self.seen_msg_ids)))

        uid = str(getattr(user, "id", "") or getattr(user, "unique_id", "") or getattr(user, "nickname", "") or "anon")
        gid = int(getattr(event, "gift_id", 0) or getattr(gift, "id", 0) or 0)
        raw_group = getattr(event, "group_id", "") or ""
        group_id = str(raw_group) if raw_group else ""

        count = max(1, int(getattr(event, "repeat_count", 1) or getattr(event, "combo_count", 1) or 1))
        is_streakable = bool(
            getattr(gift, "streakable", False)
            or getattr(gift, "combo", False)
            or getattr(gift, "type", 0) == 1
        )
        effective_group = group_id or (f"win_{int(now // 5)}" if is_streakable else "")
        streak_key = (uid, gid, effective_group)

        # INSTANT streak handling: print the gifter on the very FIRST packet (zero waiting).
        # Later packets of the same streak are ignored, unless the combo grows into a higher
        # tier (e.g. 1 Rose -> 100 Roses), in which case one upgrade card (Big / VIP) is sent.
        if not (is_streakable and effective_group):
            await self._emit_gift(event, count)
            return

        gname = (getattr(gift, "name", "") or "").lower()
        unit = self._unit_coins(gift)
        tier = self._tier(gname, unit, unit * count)
        prev = self.emitted_streaks.get(streak_key)
        if prev is None:
            counted = await self._emit_gift(event, count)
            self.emitted_streaks[streak_key] = {"count": count, "tier": tier, "coins": counted}
            if len(self.emitted_streaks) > 1000:
                self.emitted_streaks.pop(next(iter(self.emitted_streaks)))
            return
        if count <= prev["count"]:
            return
        prev["count"] = count
        if tier > prev["tier"]:
            prev["tier"] = tier
            prev["coins"] = await self._emit_gift(event, count, already_counted=prev["coins"])
        else:
            # keep leaderboard coins accurate without printing a duplicate card
            user_key = self._user_key(getattr(event, "user", None))
            extra = unit * count - prev["coins"]
            if extra > 0:
                self.user_coins[user_key] = self.user_coins.get(user_key, 0) + extra
                prev["coins"] += extra

    @staticmethod
    def _unit_coins(gift) -> int:
        gname = (getattr(gift, "name", "") or "").lower()
        raw = int(getattr(gift, "diamond_count", 0) or 0)
        return max(1, raw if raw > 0 else KNOWN_GIFT_COINS.get(gname, 1))

    @staticmethod
    def _tier(gname: str, unit: int, total: int) -> int:
        if total >= 99 or unit >= 99 or gname in VIP_GIFT_NAMES:
            return 2
        return 1 if (total >= 20 or unit >= 20) else 0

    @staticmethod
    def _user_key(user) -> str:
        handle = getattr(user, "unique_id", "") or getattr(user, "display_id", "") or ""
        return (handle or getattr(user, "nickname", "") or "viewer").lower()

    async def _emit_gift(self, event, count: int, already_counted: int = 0) -> int:
        gift = getattr(event, "gift", None)
        user = getattr(event, "user", None)
        gname = getattr(gift, "name", "") or "Gift"

        # Calculate true TikTok diamond/coin value of the gift
        unit_coins = self._unit_coins(gift)
        total_coins = count * unit_coins

        handle = getattr(user, "unique_id", "") or getattr(user, "display_id", "") or ""
        nickname = getattr(user, "nickname", "") or handle or "Viewer"
        user_key = (handle or nickname).lower()

        self.user_coins[user_key] = self.user_coins.get(user_key, 0) + max(0, total_coins - already_counted)
        sorted_users = sorted(self.user_coins.keys(), key=lambda k: self.user_coins[k], reverse=True)
        rank = sorted_users.index(user_key) + 1 if user_key in sorted_users else 1

        tier = self._tier(gname.lower(), unit_coins, total_coins)
        is_vvip = tier == 2
        gift_type = ("normal", "big", "vvip")[tier]

        # No pre-fetch wait here: the browser loads the avatar through /img immediately (zero added delay)
        raw_avatar = extract_best_avatar(user)
        avatar_url = f"/img?u={urllib.parse.quote(raw_avatar)}" if raw_avatar.startswith("http") else raw_avatar

        raw_icon = first_url(getattr(gift, "image", None)) or first_url(getattr(gift, "icon", None))
        icon_url = f"/img?u={urllib.parse.quote(raw_icon)}" if raw_icon.startswith("http") else raw_icon

        print(f"[Gift] @{handle or nickname} sent {gname} x{count} ({total_coins} coins, tier={gift_type}, rank=#{rank}, dp={'OK' if raw_avatar else 'NONE'})", flush=True)

        await self.broadcast({
            "type": "gift",
            "name": nickname,
            "handle": handle or nickname,
            "avatar": avatar_url,
            "gift": gname,
            "icon": icon_url,
            "count": count,
            "coins": total_coins,
            "unitCoins": unit_coins,
            "totalUserCoins": self.user_coins[user_key],
            "rank": rank,
            "giftType": gift_type,
            "vvip": is_vvip,
        })
        return total_coins

    async def handle_like(self, event):
        user = getattr(event, "user", None)
        if not user:
            return
        handle = getattr(user, "unique_id", "") or getattr(user, "display_id", "") or ""
        nickname = getattr(user, "nickname", "") or handle or "Viewer"
        user_key = (handle or nickname).lower()
        if not user_key:
            return

        now = asyncio.get_event_loop().time()
        # Gifts always come first: ignore tappers while gifts are flowing (last 10 seconds)
        if now - self.last_gift_time < 10.0:
            return

        count = max(1, int(getattr(event, "count", 1) or 1))
        self.user_taps[user_key] = self.user_taps.get(user_key, 0) + count
        total_taps = self.user_taps[user_key]

        # Instant: as soon as a viewer reaches 10 taps they are sent (once per 90s per viewer)
        if total_taps < 10 or now - self.last_tap_emitted.get(user_key, -1e9) < 90.0:
            return
        self.last_tap_emitted[user_key] = now

        raw_avatar = extract_best_avatar(user)
        avatar_url = f"/img?u={urllib.parse.quote(raw_avatar)}" if raw_avatar.startswith("http") else raw_avatar
        print(f"[Tapper] @{handle or nickname} tapped {total_taps} likes!", flush=True)
        await self.broadcast({
            "type": "tap",
            "name": nickname,
            "handle": handle or nickname,
            "avatar": avatar_url,
            "taps": total_taps,
            "gift": f"❤️ {total_taps} Taps",
            "isTap": True,
        })

    # ----------------------------------------------------------------- Simulation
    async def simulate(self):
        names = ["trongdo", "Ronaldo", "TIW_TF", "t là phúc", "cte><", "Yorki Gonell", "Sarai", "Adilson", "Laisa Maria"]
        gifts = ["Rose"] * 6 + ["TikTok", "Heart Me", "GG", "Finger Heart", "Lion", "Galaxy"]
        await self.set_status("connected", "simulation")
        while True:
            await asyncio.sleep(random.uniform(1.2, 3.5))
            n = random.choice(names)
            g = random.choice(gifts)
            is_vvip = g in ["Lion", "Galaxy"] or n == "Yorki Gonell"
            cnt = 1 if is_vvip else random.choice([1, 1, 1, 2, 5])
            await self.broadcast({
                "type": "gift",
                "name": n,
                "handle": n.lower().replace(" ", "_"),
                "avatar": "",
                "gift": g,
                "icon": "",
                "count": cnt,
                "vvip": is_vvip
            })


VIP_GIFT_NAMES = {
    "galaxy", "lion", "universe", "tiktok universe", "fireworks", "dragon", "rocket",
    "castle", "whale", "top 1", "phoenix", "legendary", "money gun", "corgi",
    "sports car", "interstellar", "falcon", "planet", "yacht", "private jet",
    "pegasus", "rosa nebula", "sunset speedway", "train", "motorcycle", "helicopter",
    "confetti", "hand hearts", "hand heart", "super", "Leon the Kitten".lower(),
}

KNOWN_GIFT_COINS = {
    "rose": 1, "tiktok": 1, "heart me": 1, "gg": 1, "finger heart": 5, "ice cream cone": 1,
    "mic": 5, "rosa": 10, "perfume": 20, "doughnut": 30, "donut": 30, "butterfly": 88,
    "cap": 99, "hat and mustache": 99, "hand hearts": 100, "hand heart": 100, "confetti": 100,
    "heart": 100, "sunglasses": 199, "love you": 199, "corgi": 299, "boxing gloves": 299,
    "money gun": 500, "swan": 699, "train": 899, "galaxy": 1000, "fireworks": 1088,
    "diamond tree": 1088, "whale diving": 2150, "whale": 2150, "motorcycle": 2988,
    "private jet": 4888, "unicorn fantasy": 5000, "flying jets": 5000, "sports car": 7000,
    "interstellar": 10000, "falcon": 10999, "sunset speedway": 10000, "planet": 15000,
    "rosa nebula": 15000, "castle": 20000, "phoenix": 25999, "dragon": 26999,
    "lion": 29999, "Leon and Lion".lower(): 34000, "universe": 44999, "tiktok universe": 44999,
}


def extract_best_avatar(user) -> str:
    """Pick the sharpest browser-compatible (non-HEIC) avatar: large/medium (720px+) before 100px thumbs."""
    if not user:
        return ""
    fallback = ""
    for field in ("avatar_large", "avatar_medium", "avatar_jpg", "avatar_thumb"):
        obj = getattr(user, field, None)
        if not obj:
            continue
        for attr in ("url_list", "m_urls", "urls"):
            for u in (getattr(obj, attr, None) or []):
                u = str(u or "")
                if not u.startswith("http"):
                    continue
                if ".heic" not in u.lower().split("?")[0]:
                    return u
                fallback = fallback or u
    return fallback


def first_url(obj) -> str:
    """Different TikTokLive versions expose image URLs as m_urls or url_list."""
    if not obj:
        return ""
    for attr in ("url_list", "m_urls", "urls"):
        urls = getattr(obj, attr, None)
        if urls:
            for u in urls:
                if u and ".heic" not in str(u).lower():
                    return str(u)
            return str(urls[0])
    return ""


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", help="TikTok @username to connect to at startup")
    ap.add_argument("--ws-port", type=int, default=8765)
    ap.add_argument("--http-port", type=int, default=8000)
    ap.add_argument("--simulate", action="store_true", help="send fake gifts, no TikTok")
    args = ap.parse_args()

    hub = Hub()
    start_http(args.http_port)
    async with websockets.serve(hub.handler, "0.0.0.0", args.ws_port):
        print(f"Printer page : http://localhost:{args.http_port}/")
        print(f"WebSocket    : ws://localhost:{args.ws_port}")
        if args.simulate:
            asyncio.create_task(hub.simulate())
        elif args.user:
            await hub.connect(args.user)
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

