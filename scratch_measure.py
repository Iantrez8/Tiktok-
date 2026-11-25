import subprocess
import os

html = """<!doctype html>
<html>
<head>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<div id="stage">
  <main id="scene">
    <div id="desk">
      <div id="paperFlat"></div>
    </div>
  </main>
</div>
<div id="result">WAITING</div>
<script>
window.addEventListener('DOMContentLoaded', () => {
  const f = document.getElementById('paperFlat');
  const d = document.getElementById('desk');
  const rF = f.getBoundingClientRect();
  const rD = d.getBoundingClientRect();
  document.getElementById('result').innerText = JSON.stringify({
    paperFlat: {
      left: Math.round(rF.left),
      right: Math.round(rF.right),
      width: Math.round(rF.width),
      top: Math.round(rF.top),
      bottom: Math.round(rF.bottom)
    },
    desk: {
      left: Math.round(rD.left),
      right: Math.round(rD.right),
      width: Math.round(rD.width),
      top: Math.round(rD.top),
      bottom: Math.round(rD.bottom)
    }
  });
});
</script>
</body>
</html>
"""

with open('c:/Users/HP/tiktok/web/measure.html', 'w', encoding='utf-8') as f:
    f.write(html)

cmd = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '--headless',
    '--disable-gpu',
    '--window-size=1080,1920',
    '--dump-dom',
    'http://localhost:8000/measure.html'
]
res = subprocess.run(cmd, capture_output=True, text=True)
for line in res.stdout.splitlines():
    if 'paperFlat' in line:
        print('RESULT:', line)
