import subprocess
import cv2

html = """<!doctype html>
<html>
<head>
<style>
body { margin: 0; background: #0c0a08; overflow: hidden; font-family: sans-serif; }
#scene {
  width: 1080px; height: 1920px;
  perspective: 1100px;
  perspective-origin: 50% 28%;
}
#desk {
  position: absolute;
  left: 0; right: 0; width: 1080px; height: 860px;
  transform-origin: 50% 0%;
  transform: rotateX(24deg);
  transform-style: preserve-3d;
  background:
    radial-gradient(ellipse at 50% 30%, rgba(255,235,190,0.2) 0%, transparent 70%),
    repeating-linear-gradient(180deg, #9a5824 0px, #824619 140px, #50270a 142px);
  box-shadow: 0 20px 40px rgba(0,0,0,0.8);
}

/* Paper on table: starts at 10px, ends at 850px */
#paperFlat {
  position: absolute;
  left: 150px; right: 150px; top: 10px; height: 840px;
  background: #ded5b0;
  box-shadow: -4px 0 10px rgba(0,0,0,0.25), 4px 0 10px rgba(0,0,0,0.25);
  overflow: hidden;
}

/* Hanging paper: starts at 850px, hangs down with gentle forward drape */
#paperHang {
  position: absolute;
  left: 150px; right: 150px; top: 850px; height: 800px;
  transform-origin: 50% 0%;
  transform: rotateX(-28deg);
  background: #ded5b0;
  box-shadow: -5px 0 14px rgba(0,0,0,0.35), 5px 0 14px rgba(0,0,0,0.35);
  overflow: hidden;
}

/* Seamless curved cylinder rollover connecting the two */
#paperRollover {
  position: absolute;
  left: 150px; right: 150px; top: 835px; height: 30px;
  background: linear-gradient(180deg,
    rgba(255,255,255,0) 0%,
    rgba(255,255,255,0.65) 45%,
    rgba(255,255,255,0) 100%
  );
  pointer-events: none;
  z-index: 10;
}

.paperTrack {
  position: absolute;
  left: 0; right: 0; top: 0;
}

/* Standard paired card row */
.rowStandard2 {
  height: 250px;
  display: flex;
  padding: 10px 20px;
  gap: 20px;
}
.card {
  flex: 1;
  border: 3px solid #1c1917;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.25);
  font-weight: bold;
}
.card .av {
  width: 120px; height: 120px; border-radius: 50%; border: 3px solid #1c1917;
  display: flex; align-items: center; justify-content: center; font-size: 40px; color: #fff;
  background: #2563eb;
}
.card .uname { margin-top: 10px; font-size: 22px; }

</style>
</head>
<body>
<div id="scene">
  <div id="desk">
    <div id="paperFlat">
      <div id="trackFlat" class="paperTrack" style="transform: translateY(680px);">
        <!-- Row 1: rolling over the edge! -->
        <div class="rowStandard2">
          <div class="card"><div class="av">D</div><div class="uname">♡ Dzul Realty ♡</div></div>
          <div class="card"><div class="av" style="background:#e11d48;">T</div><div class="uname">♡ tiara abrhy ♡</div></div>
        </div>
      </div>
    </div>
    <div id="paperHang">
      <div id="trackHang" class="paperTrack" style="transform: translateY(-160px);">
        <!-- Same Row 1 continuing down! -->
        <div class="rowStandard2">
          <div class="card"><div class="av">D</div><div class="uname">♡ Dzul Realty ♡</div></div>
          <div class="card"><div class="av" style="background:#e11d48;">T</div><div class="uname">♡ tiara abrhy ♡</div></div>
        </div>
      </div>
    </div>
    <div id="paperRollover"></div>
  </div>
</div>
</body>
</html>
"""

with open('c:/Users/HP/tiktok/web/ref/test_fold.html', 'w', encoding='utf-8') as f:
    f.write(html)

cmd = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '--headless',
    '--disable-gpu',
    r'--screenshot=c:\Users\HP\tiktok\web\ref\test_fold.png',
    '--window-size=1080,1920',
    'http://localhost:8000/ref/test_fold.html'
]
subprocess.run(cmd)

img = cv2.imread(r'c:\Users\HP\tiktok\web\ref\test_fold.png')
if img is not None:
    thumb = cv2.resize(img, (540, 960))
    cv2.imwrite(r'C:\Users\HP\.gemini\antigravity\brain\80131d65-b87a-4035-a728-785c9c174d83\test_fold_cards_thumb.jpg', thumb, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print('Saved test_fold_cards_thumb.jpg')
