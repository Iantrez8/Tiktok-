import subprocess
import cv2
import os

html = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; background: #0c0a08; overflow: hidden; font-family: sans-serif; }
  #canvas3d { width: 1080px; height: 1920px; display: block; }
</style>
<script src="/lib/three.min.js"></script>
</head>
<body>
<canvas id="canvas3d"></canvas>
<script>
window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('canvas3d');
  const width = 1080;
  const height = 1920;

  // 1. Scene, Camera, Renderer (From Step 1)
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0705);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 13.0, 14.0);
  camera.lookAt(0, -1.0, 0.2);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffedd5, 0.8);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xfffaed, 1.25);
  dirLight.position.set(5, 18, 8);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 35;
  dirLight.shadow.camera.left = -9;
  dirLight.shadow.camera.right = 9;
  dirLight.shadow.camera.top = 11;
  dirLight.shadow.camera.bottom = -11;
  dirLight.shadow.bias = -0.0003;
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.35);
  rimLight.position.set(-6, 12, -4);
  scene.add(rimLight);

  // Procedural Wood Table
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 1024; woodCanvas.height = 1024;
  const wCtx = woodCanvas.getContext('2d');
  const wGrad = wCtx.createLinearGradient(0, 0, 0, 1024);
  wGrad.addColorStop(0, '#693816');
  wGrad.addColorStop(0.3, '#8e4e20');
  wGrad.addColorStop(0.7, '#783e16');
  wGrad.addColorStop(1, '#53280c');
  wCtx.fillStyle = wGrad;
  wCtx.fillRect(0, 0, 1024, 1024);
  for (let y = 140; y < 1024; y += 170) {
    wCtx.fillStyle = 'rgba(25, 10, 3, 0.55)';
    wCtx.fillRect(0, y, 1024, 4);
    wCtx.fillStyle = 'rgba(255, 210, 150, 0.22)';
    wCtx.fillRect(0, y - 2, 1024, 2);
  }
  for (let i = 0; i < 5000; i++) {
    wCtx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 230, 180, 0.04)' : 'rgba(20, 8, 2, 0.05)';
    wCtx.fillRect(Math.random() * 1024, Math.random() * 1024, 25 + Math.random() * 90, 1.8);
  }
  const woodTexture = new THREE.CanvasTexture(woodCanvas);
  woodTexture.needsUpdate = true;
  woodTexture.anisotropy = 8;
  const tableMat = new THREE.MeshStandardMaterial({ map: woodTexture, roughness: 0.38, metalness: 0.05 });

  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(12.5, 1.2, 9.3), tableMat);
  tableTop.position.set(0, -0.6, -1.85);
  tableTop.receiveShadow = true;
  scene.add(tableTop);

  const tableApron = new THREE.Mesh(new THREE.BoxGeometry(12.5, 8.0, 0.5), tableMat);
  tableApron.position.set(0, -5.1, 2.55);
  tableApron.receiveShadow = true;
  scene.add(tableApron);

  // 2. Curved Paper Geometry (From Step 1)
  const paperW = 8.2;
  const paperFlatL = 8.6;
  const rollR = 0.65;
  const rollArc = (Math.PI / 2) * rollR;
  const paperHangL = 7.0;
  const totalL = paperFlatL + rollArc + paperHangL;

  const segW = 48;
  const segL = 192;
  const paperGeom = new THREE.PlaneGeometry(paperW, totalL, segW, segL);
  const pos = paperGeom.attributes.position;
  const v = new THREE.Vector3();
  const startZ = -5.8;
  const edgeZ = startZ + paperFlatL;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const s = (totalL / 2) - v.y;
    const x = v.x;
    let y = 0.02, z = 0;
    if (s <= paperFlatL) {
      y = 0.02; z = startZ + s;
    } else if (s <= paperFlatL + rollArc) {
      const arcS = s - paperFlatL;
      const angle = arcS / rollR;
      y = 0.02 - rollR * (1 - Math.cos(angle));
      z = edgeZ + rollR * Math.sin(angle);
    } else {
      const hangS = s - (paperFlatL + rollArc);
      y = 0.02 - rollR - hangS * 0.98;
      z = edgeZ + rollR - hangS * 0.05;
    }
    pos.setXYZ(i, x, y, z);
  }
  paperGeom.computeVertexNormals();

  // =========================================================================
  // STEP 2: THE DYNAMIC PRINT BUFFER (Off-Screen Canvas + CanvasTexture)
  // =========================================================================
  const BUFFER_W = 1024;
  const BUFFER_H = 2048;

  const printCanvas = document.createElement('canvas');
  printCanvas.width = BUFFER_W;
  printCanvas.height = BUFFER_H;
  const pCtx = printCanvas.getContext('2d');

  // Secondary swap canvas for smooth double-buffered scrolling
  const swapCanvas = document.createElement('canvas');
  swapCanvas.width = BUFFER_W;
  swapCanvas.height = BUFFER_H;
  const sCtx = swapCanvas.getContext('2d');

  // Paper Texture Base Generator
  function fillPaperBase(ctx, y = 0, h = BUFFER_H) {
    ctx.fillStyle = '#ded5b0';
    ctx.fillRect(0, y, BUFFER_W, h);
    // Microscopic grain
    for (let i = 0; i < Math.floor(h * 5); i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.2)' : 'rgba(70,50,30,0.04)';
      ctx.fillRect(Math.random() * BUFFER_W, y + Math.random() * h, 2, 2);
    }
  }
  fillPaperBase(pCtx, 0, BUFFER_H);

  const paperTexture = new THREE.CanvasTexture(printCanvas);
  paperTexture.needsUpdate = true;
  paperTexture.anisotropy = 8;

  const paperMat = new THREE.MeshStandardMaterial({
    map: paperTexture,
    roughness: 0.68,
    metalness: 0.0,
    side: THREE.DoubleSide
  });

  const paperMesh = new THREE.Mesh(paperGeom, paperMat);
  paperMesh.receiveShadow = true;
  paperMesh.castShadow = true;
  scene.add(paperMesh);

  // -------------------------------------------------------------------------
  // Helper: Load Image as Promise
  function loadImg(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Pre-load reference avatars
  const [dzulImg, tiaraImg, deltaImg, dekImg, simbaImg] = await Promise.all([
    loadImg('/avatars/dzul_realty.jpg'),
    loadImg('/avatars/tiara_abrhy.jpg'),
    loadImg('/avatars/deltafatiaa.jpg'),
    loadImg('/avatars/dek_slm.jpg'),
    loadImg('/avatars/simba_fx.jpg')
  ]);

  // -------------------------------------------------------------------------
  // Buffer Drawing Routines for Dynamic Gifts
  
  // 1. Draw Standard Card into buffer
  function drawStandardCard(ctx, x, y, w, h, name, avatarImg) {
    // Card Background Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 5;
    ctx.strokeRect(x, y, w, h);

    // Circular Avatar Ring & Clipped Photo
    const cx = x + w / 2;
    const cy = y + h * 0.42;
    const r = Math.min(w, h) * 0.27;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (avatarImg) {
      ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();

    // Outer avatar ring border
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // User name
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#1c1917';
    ctx.textAlign = 'center';
    ctx.fillText('♡ ' + name + ' ♡', cx, y + h * 0.88);
  }

  // 2. Draw Big Card into buffer (Matching Image 5: Dek_$LM@)
  function drawBigCard(ctx, y, name, avatarImg) {
    const w = 680;
    const h = 420;
    const x = (BUFFER_W - w) / 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 6;
    ctx.strokeRect(x, y, w, h);

    const cx = BUFFER_W / 2;
    const cy = y + 175;
    const r = 120;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (avatarImg) {
      ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = '#1c1917';
    ctx.textAlign = 'center';
    ctx.fillText('♡ 🌹 ' + name + ' 🌹 ♡', cx, y + 365);
  }

  // 3. Draw VIP Full-Width Banner Card (Matching Image 3: Simba Fx [VIP])
  function drawVvipCard(ctx, y, name, avatarImg) {
    const w = 924;
    const h = 560;
    const x = (BUFFER_W - w) / 2;

    // Golden warm gradient background
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, 'rgba(254, 243, 199, 0.55)');
    bgGrad.addColorStop(0.5, 'rgba(253, 230, 138, 0.25)');
    bgGrad.addColorStop(1, 'rgba(254, 243, 199, 0.6)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(x, y, w, h);

    // Double frame
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 6;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);

    const cx = BUFFER_W / 2;
    const cy = y + 190;
    const r = 125;

    // Golden decorative wreath petals on sides
    ctx.fillStyle = '#d97706';
    for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.35) {
      // Left wreath
      const lx = cx - r - 22 + Math.cos(a) * 18;
      const ly = cy + Math.sin(a) * (r * 0.9);
      ctx.beginPath(); ctx.arc(lx, ly, 12, 0, Math.PI * 2); ctx.fill();

      // Right wreath
      const rx = cx + r + 22 - Math.cos(a) * 18;
      const ry = cy + Math.sin(a) * (r * 0.9);
      ctx.beginPath(); ctx.arc(rx, ry, 12, 0, Math.PI * 2); ctx.fill();
    }

    // Avatar clipped
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (avatarImg) {
      ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();

    ctx.lineWidth = 7;
    ctx.strokeStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Left "thank you! 💖" script
    ctx.save();
    ctx.translate(x + 160, y + 360);
    ctx.rotate(-0.1);
    ctx.font = 'italic bold 36px cursive, sans-serif';
    ctx.fillStyle = '#dc2626';
    ctx.fillText('thank you! 💖', 0, 0);
    ctx.restore();

    // Right "[ VIP ]" stamped box
    ctx.save();
    ctx.translate(x + w - 170, y + 360);
    ctx.rotate(0.12);
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 5;
    ctx.strokeRect(-75, -35, 150, 60);
    ctx.font = '900 36px Impact, sans-serif';
    ctx.fillStyle = '#b91c1c';
    ctx.fillText('VIP', -32, 10);
    ctx.restore();

    // Viewer Name
    ctx.font = '900 42px sans-serif';
    ctx.fillStyle = '#1c1917';
    ctx.textAlign = 'center';
    ctx.fillText('♡ ' + name + ' ♡', cx, y + 490);
  }

  // -------------------------------------------------------------------------
  // Buffer Scroll Conveyor Engine
  // Shifts existing printed cards downward by scrollPixels, clears top, and renders
  function scrollBuffer(pixels) {
    // 1. Copy current canvas to swap canvas
    sCtx.clearRect(0, 0, BUFFER_W, BUFFER_H);
    sCtx.drawImage(printCanvas, 0, 0);

    // 2. Draw swap canvas back shifted down by pixels
    pCtx.clearRect(0, 0, BUFFER_W, BUFFER_H);
    pCtx.drawImage(swapCanvas, 0, pixels);

    // 3. Fill the newly exposed top region with fresh cream paper texture
    fillPaperBase(pCtx, 0, pixels + 5);

    // 4. Update Three.js texture
    paperTexture.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Populate Demo Sequence to Verify All 3 Layouts & Curvature
  // 1. Hanging at the bottom: VIP Simba Fx
  drawVvipCard(pCtx, 1400, 'Simba Fx', simbaImg);

  // 2. Rolling over the cylindrical edge: Big Doughnut Dek_$LM@
  drawBigCard(pCtx, 860, 'Dek_$LM@', dekImg);

  // 3. Flat on the desk under the gantry: Paired Standard Cards (Dzul Realty & tiara abrhy)
  drawStandardCard(pCtx, 50, 260, 435, 340, 'Dzul Realty', dzulImg);
  drawStandardCard(pCtx, 539, 260, 435, 340, 'tiara abrhy', tiaraImg);

  paperTexture.needsUpdate = true;

  // Render Scene
  renderer.render(scene, camera);
  console.log("STEP2_TEST_RENDER_DONE");
});
</script>
</body>
</html>
"""

os.makedirs('c:/Users/HP/tiktok/web/ref', exist_ok=True)
with open('c:/Users/HP/tiktok/web/ref/test_three_step2.html', 'w', encoding='utf-8') as f:
    f.write(html)

cmd = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '--headless',
    '--disable-gpu',
    r'--screenshot=c:\Users\HP\tiktok\web\ref\test_three_step2.png',
    '--window-size=1080,1920',
    'http://localhost:8000/ref/test_three_step2.html'
]
subprocess.run(cmd)

img = cv2.imread(r'c:\Users\HP\tiktok\web\ref\test_three_step2.png')
if img is not None:
    thumb = cv2.resize(img, (540, 960))
    cv2.imwrite(r'C:\Users\HP\.gemini\antigravity\brain\80131d65-b87a-4035-a728-785c9c174d83\test_three_step2_thumb.jpg', thumb, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print('Saved test_three_step2_thumb.jpg')

