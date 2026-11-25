# TikTok LIVE Virtual Pencil Printer

A software-only virtual 2-axis CNC drawing machine and printer for TikTok LIVE streams. Every gift received during a TikTok LIVE stream physically sketches the viewer's profile card (avatar, username, gift, quantity) onto a continuous paper sheet rolling across a wooden table. No physical printer or hardware needed.

```
TikTok LIVE ──(TikTokLive, unofficial)──> server.py ──WebSocket ws://localhost:8765──> web/ (OBS Browser Source)
                                           └─ also serves web/ and an image proxy at http://localhost:8000
```

The Python connector runs **locally** on your streaming computer. The drawing animation, queue, and image cache run client-side in the browser, maintaining a silky 60 FPS in OBS Studio even under weak network conditions. Firebase Hosting (optional) can host the static `web/` folder.

> **Limitation:** TikTokLive is an **unofficial** reverse-engineered connector, not an official TikTok API. It can break if TikTok changes their stream protocols, can be rate-limited, and use is at your own discretion. Gifts are detected from the public LIVE stream; the stream must be live. Sender profile pictures are retrieved from the TikTok CDN; if unavailable, a default pencil sketch avatar is drawn.

---

## Features

- **2-Axis CNC Gantry Plotter**: Dual linear bearing sliders on left and right chrome rails slide up and down the vertical Y-axis, while the pen carriage travels along the horizontal X-axis.
- **Manual 3-Step Drawing Choreography**:
  1. **Picture First**: Pencil moves to the portrait and traces a circular vector path ($360^\circ$) while the avatar sketches in with a graphite drawing effect.
  2. **Name Second**: Pencil slides down and handwrites the username (`♡ Username ♡`) and gift info left-to-right with cursive handwriting micro-vibrations.
  3. **Frame Last**: Pencil moves to the corner and physically traces the perimeter frame (top $\to$ right $\to$ bottom $\to$ left).
- **Independent 2-Column Printing**: Standard gifts fill Left or Right slots independently. If only one gift arrives, it prints into its slot and leaves the adjacent slot open for the next viewer.
- **Full-Page VVIP / Top 1 Cards**: Major gifts (`Lion`, `Galaxy`, `Universe`, or gift streaks $\ge 10$) trigger a full-width page card with a royal golden crown, laurel wings, diamond badge, and crowned username.
- **Continuous Paper Roll over Table Edge**: Paper lies across a warm teak wood desk and rolls over a 3D cylindrical edge near the bottom, with previous cards hanging naturally off the edge of the table.
- **Top Banner & Live Pill**: Features `PRINT BOOTH | PENCIL PRINTS [🔴 LIVE]` at the top, and a floating TikTok status pill at the bottom (`✏️ Drawing {user} - {gift}`).
- **OBS Browser Source Ready**: Clean vertical 9:16 layout (1080×1920) with transparent background support (`?bg=transparent`) and hidden controls (`?controls=0`).

---

## 1. Quick Start

### Installation
Requires Python 3.10+:
```bash
pip install -r requirements.txt
```

### Run Locally
```bash
# 1. Test with fake simulated gifts (no TikTok account needed):
python server.py --simulate

# 2. Connect directly to your LIVE stream at startup:
python server.py --user @your_tiktok_username

# 3. Or start server and connect via the web control panel:
python server.py
```

Open **http://localhost:8000/** in your web browser.

---

## 2. Using in OBS Studio

1. In OBS, click **+** under Sources $\to$ select **Browser**.
2. Set **URL**:
   ```
   http://localhost:8000/?controls=0
   ```
3. Set **Width**: `1080` and **Height**: `1920` (standard 9:16 TikTok LIVE vertical format).
4. Tick **Shutdown source when not visible** and **Refresh browser when scene becomes active**.
5. Click **OK**.

### Extra URL Options:
- `?controls=0`: Hides the streamer control panel for a clean broadcast view.
- `?bg=transparent`: Makes the page background transparent (for custom streaming overlays).
- `?speed=1.5`: Adjusts default drawing speed (0.5 to 3.0).
- `?ws=ws://host:8765&http=http://host:8000`: For remote or LAN connections.

> **Tip:** To test or configure controls directly inside OBS, right-click the Browser source $\to$ click **Interact**.

---

## 3. Controls & Streamer Interface

A discrete panel is available at the bottom-left of the screen (fades out when not hovered):
- **Status Dot**:
  - 🔴 Red: Local server disconnected (auto-reconnecting).
  - 🟡 Yellow: Local server online; TikTok idle or connecting.
  - 🟢 Green: Connected to TikTok LIVE; receiving gifts in real-time.
- **Username Input**: Enter `@your_username` and click **Start** / **Stop**.
- **Test Gift**: Prints a standard 2-column card. *Shift-click* sends a burst of 4 gifts to see sequential slot filling.
- **Test VVIP 👑**: Prints a full-page royal Top 1 card across the entire sheet.
- **Clear**: Smoothly rolls all current paper off the table.
- **Speed Slider**: Real-time animation speed control (saves to local settings).

---

## 4. Gift Behavior & Streak Handling

- **Combo / Streak Gifts (e.g. Roses)**: TikTok sends multiple events as combos build (1, 2, 3... 50). The system buffers streaking gifts and prints **once** with the final total count when the streak finishes (e.g., `Rose ×50`).
- **Queueing**: Gifts are queued locally. When high-volume gift bursts arrive, printing gently speeds up to keep pace without skipping cards or freezing animations.
- **Image Proxying & Caching**: Profile pictures are fetched via the local `/img` proxy on `server.py`, cached in memory, and rendered via downscaled client canvases to eliminate CORS blocks and lag.
- **Memory Safety**: Only the active visible rows are kept in the DOM; older rows that scroll off the bottom are pruned automatically.
