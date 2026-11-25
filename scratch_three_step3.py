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
<script src="/lib/gsap.min.js"></script>
</head>
<body>
<canvas id="canvas3d"></canvas>
<script>
window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('canvas3d');
  const width = 1080;
  const height = 1920;

  // 1. Scene, Camera, Renderer
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
  const ambientLight = new THREE.AmbientLight(0xffedd5, 0.75);
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

  // Wood Table
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

  // 2. Curved Paper Mesh (Step 1)
  const paperW = 8.2;
  const paperFlatL = 8.6;
  const rollR = 0.65;
  const rollArc = (Math.PI / 2) * rollR;
  const paperHangL = 7.0;
  const totalL = paperFlatL + rollArc + paperHangL;

  const segW = 48, segL = 192;
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

  // 3. Canvas Buffer & Material (Step 2)
  const BUFFER_W = 1024, BUFFER_H = 2048;
  const printCanvas = document.createElement('canvas');
  printCanvas.width = BUFFER_W; printCanvas.height = BUFFER_H;
  const pCtx = printCanvas.getContext('2d');

  const swapCanvas = document.createElement('canvas');
  swapCanvas.width = BUFFER_W; swapCanvas.height = BUFFER_H;
  const sCtx = swapCanvas.getContext('2d');

  function fillPaperBase(ctx, y = 0, h = BUFFER_H) {
    ctx.fillStyle = '#ded5b0';
    ctx.fillRect(0, y, BUFFER_W, h);
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

  // =========================================================================
  // STEP 3: THE 3D PRINTER ARM (Rails, Gantry, Carriage, Kinematics & GSAP)
  // =========================================================================

  // Chrome Steel Material for Linear Rails and Crossbar
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.92,
    roughness: 0.16
  });

  // Dark Aluminum Anodized Material for Sliders & Carriage
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.75,
    roughness: 0.35
  });

  // Silver Aluminum Material for Pillow Blocks & Mounts
  const silverAlumMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.85,
    roughness: 0.25
  });

  // A. Linear Guide Rails (Y-axis along desk sides)
  const railRadius = 0.11;
  const railLength = 9.4;
  const railGeom = new THREE.CylinderGeometry(railRadius, railRadius, railLength, 32);

  const railLeft = new THREE.Mesh(railGeom, chromeMat);
  railLeft.rotation.x = Math.PI / 2;
  railLeft.position.set(-4.95, 0.45, -1.8);
  railLeft.castShadow = true;
  railLeft.receiveShadow = true;
  scene.add(railLeft);

  const railRight = new THREE.Mesh(railGeom, chromeMat);
  railRight.rotation.x = Math.PI / 2;
  railRight.position.set(4.95, 0.45, -1.8);
  railRight.castShadow = true;
  railRight.receiveShadow = true;
  scene.add(railRight);

  // Top & Bottom Aluminum Pillow Block Clamps
  function createPillowBlock(x, z) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.65), silverAlumMat);
    block.position.set(x, 0.3, z);
    block.castShadow = true;
    block.receiveShadow = true;
    scene.add(block);
  }
  createPillowBlock(-4.95, -6.2); // Top left
  createPillowBlock(4.95, -6.2);  // Top right
  createPillowBlock(-4.95, 2.6);  // Bottom left
  createPillowBlock(4.95, 2.6);   // Bottom right

  // B. The Gantry Assembly (moves in Z along the desk)
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(0, 0, -4.5); // Initial resting Z position
  scene.add(gantryGroup);

  // Left & Right Bearing Sliders
  const sliderGeom = new THREE.BoxGeometry(0.55, 0.5, 0.8);
  const sliderL = new THREE.Mesh(sliderGeom, darkMetalMat);
  sliderL.position.set(-4.95, 0.45, 0);
  sliderL.castShadow = true;
  gantryGroup.add(sliderL);

  const sliderR = new THREE.Mesh(sliderGeom, darkMetalMat);
  sliderR.position.set(4.95, 0.45, 0);
  sliderR.castShadow = true;
  gantryGroup.add(sliderR);

  // Horizontal Crossbar (X-axis rail)
  const barGeom = new THREE.CylinderGeometry(0.09, 0.09, 10.2, 32);
  const crossbar = new THREE.Mesh(barGeom, chromeMat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, 0.45, 0);
  crossbar.castShadow = true;
  gantryGroup.add(crossbar);

  // C. The Print Carriage (moves in X along the crossbar)
  const carriageGroup = new THREE.Group();
  carriageGroup.position.set(0, 0.45, 0);
  gantryGroup.add(carriageGroup);

  // Carriage Main Block
  const carriageBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.75), darkMetalMat);
  carriageBody.position.set(0, 0.08, 0);
  carriageBody.castShadow = true;
  carriageGroup.add(carriageBody);

  // Carriage Aluminum Top Plate
  const carriagePlate = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, 0.65), silverAlumMat);
  carriagePlate.position.set(0, 0.36, 0);
  carriagePlate.castShadow = true;
  carriageGroup.add(carriagePlate);

  // LED Indicator (Blue idle / Red drawing)
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), ledMat);
  led.position.set(0.3, 0.42, 0.2);
  carriageGroup.add(led);

  // Pen Holder & Pencil Stylus Tip
  const penHolderMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.4 });
  const penHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.45, 16), penHolderMat);
  penHolder.position.set(0, -0.2, 0.25);
  penHolder.castShadow = true;
  carriageGroup.add(penHolder);

  const penTipMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
  const penTip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 16), penTipMat);
  penTip.rotation.x = Math.PI;
  penTip.position.set(0, -0.42, 0.25); // Tip touches paper at Y=0.03
  penTip.castShadow = true;
  carriageGroup.add(penTip);

  // D. Physical VIP Stamp Mechanism
  const stampGroup = new THREE.Group();
  stampGroup.position.set(2.0, 12.0, -1.0); // starts high above camera
  scene.add(stampGroup);

  const stampRod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.0, 32), chromeMat);
  stampRod.position.set(0, 2.0, 0);
  stampRod.castShadow = true;
  stampGroup.add(stampRod);

  const stampHead = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.9), darkMetalMat);
  stampHead.position.set(0, 0, 0);
  stampHead.castShadow = true;
  stampGroup.add(stampHead);

  const stampFace = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.75), new THREE.MeshBasicMaterial({ color: 0x991b1b }));
  stampFace.position.set(0, -0.32, 0);
  stampGroup.add(stampFace);

  // =========================================================================
  // KINEMATIC COORDINATE MAPPING (2D Canvas Pixels <-> 3D Space)
  // =========================================================================
  // Canvas: X in [0, 1024] -> 3D: X in [-4.1, 4.1]
  function canvasXto3D(cx) {
    return ((cx / BUFFER_W) - 0.5) * paperW;
  }

  // Canvas: Y in [0, 2048] -> 3D: Z in [-5.8, +2.8] (flat desk portion)
  function canvasYto3D(cy) {
    // Top print zone: Y from 0 to 650 maps to Z from -5.6 to -1.5
    return -5.6 + (cy / 650) * 4.1;
  }

  // Set Pen Position in 3D Space
  function setPenPosition(canvasX, canvasY) {
    const x3d = canvasXto3D(canvasX);
    const z3d = canvasYto3D(canvasY);
    carriageGroup.position.x = x3d;
    gantryGroup.position.z = z3d;
  }

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

  const [dzulImg, tiaraImg, dekImg, simbaImg] = await Promise.all([
    loadImg('/avatars/dzul_realty.jpg'),
    loadImg('/avatars/tiara_abrhy.jpg'),
    loadImg('/avatars/dek_slm.jpg'),
    loadImg('/avatars/simba_fx.jpg')
  ]);

  // Pre-fill bottom cards (from Step 2)
  // VIP hanging
  function drawStaticVvip(ctx, y, name, avatarImg) {
    const w = 924, h = 560, x = (BUFFER_W - w) / 2;
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    bgGrad.addColorStop(0, 'rgba(254, 243, 199, 0.55)');
    bgGrad.addColorStop(1, 'rgba(254, 243, 199, 0.6)');
    ctx.fillStyle = bgGrad; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 6; ctx.strokeRect(x, y, w, h);
    const cx = BUFFER_W / 2, cy = y + 190, r = 125;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (avatarImg) ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.lineWidth = 7; ctx.strokeStyle = '#d97706'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '900 42px sans-serif'; ctx.fillStyle = '#1c1917'; ctx.textAlign = 'center';
    ctx.fillText('♡ ' + name + ' ♡', cx, y + 490);
  }
  drawStaticVvip(pCtx, 1400, 'Simba Fx', simbaImg);

  // Big Card rolling over edge
  function drawStaticBig(ctx, y, name, avatarImg) {
    const w = 680, h = 420, x = (BUFFER_W - w) / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 6; ctx.strokeRect(x, y, w, h);
    const cx = BUFFER_W / 2, cy = y + 175, r = 120;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (avatarImg) ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.lineWidth = 6; ctx.strokeStyle = '#d97706'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.font = 'bold 34px sans-serif'; ctx.fillStyle = '#1c1917'; ctx.textAlign = 'center';
    ctx.fillText('♡ 🌹 ' + name + ' 🌹 ♡', cx, y + 365);
  }
  drawStaticBig(pCtx, 860, 'Dek_$LM@', dekImg);

  // -------------------------------------------------------------------------
  // NOW: Animate Drawing Card 1 (Dzul Realty) and Card 2 (tiara abrhy)
  // Position print head actively mid-draw on Card 2 to demonstrate kinematics & shadows!
  
  // Left Card (Dzul Realty) completed
  pCtx.fillStyle = 'rgba(255, 255, 255, 0.25)'; pCtx.fillRect(50, 160, 435, 340);
  pCtx.strokeStyle = '#1c1917'; pCtx.lineWidth = 5; pCtx.strokeRect(50, 160, 435, 340);
  pCtx.save(); pCtx.beginPath(); pCtx.arc(267, 300, 95, 0, Math.PI * 2); pCtx.clip();
  pCtx.drawImage(dzulImg, 267 - 95, 300 - 95, 190, 190); pCtx.restore();
  pCtx.beginPath(); pCtx.arc(267, 300, 95, 0, Math.PI * 2); pCtx.stroke();
  pCtx.font = 'bold 28px sans-serif'; pCtx.fillStyle = '#1c1917'; pCtx.textAlign = 'center';
  pCtx.fillText('♡ Dzul Realty ♡', 267, 465);

  // Right Card (tiara abrhy) - currently being sketched by pen!
  pCtx.fillStyle = 'rgba(255, 255, 255, 0.25)'; pCtx.fillRect(539, 160, 435, 340);
  pCtx.strokeStyle = '#1c1917'; pCtx.lineWidth = 5; pCtx.strokeRect(539, 160, 435, 340);
  pCtx.save(); pCtx.beginPath(); pCtx.arc(756, 300, 95, 0, Math.PI * 2); pCtx.clip();
  pCtx.drawImage(tiaraImg, 756 - 95, 300 - 95, 190, 190); pCtx.restore();
  pCtx.beginPath(); pCtx.arc(756, 300, 95, 0, Math.PI * 2); pCtx.stroke();
  pCtx.font = 'bold 28px sans-serif'; pCtx.fillStyle = '#1c1917'; pCtx.textAlign = 'center';
  pCtx.fillText('♡ tiara abrhy ♡', 756, 465);

  paperTexture.needsUpdate = true;

  // Position carriage right over the pencil stroke on tiara abrhy!
  // Active drawing state: LED turns red
  ledMat.color.setHex(0xef4444);
  setPenPosition(756, 465);

  // Render Frame
  renderer.render(scene, camera);
  console.log("STEP3_KINEMATICS_RENDERED");
});
</script>
</body>
</html>
"""

os.makedirs('c:/Users/HP/tiktok/web/ref', exist_ok=True)
with open('c:/Users/HP/tiktok/web/ref/test_three_step3.html', 'w', encoding='utf-8') as f:
    f.write(html)

cmd = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '--headless',
    '--disable-gpu',
    r'--screenshot=c:\Users\HP\tiktok\web\ref\test_three_step3.png',
    '--window-size=1080,1920',
    'http://localhost:8000/ref/test_three_step3.html'
]
subprocess.run(cmd)

img = cv2.imread(r'c:\Users\HP\tiktok\web\ref\test_three_step3.png')
if img is not None:
    thumb = cv2.resize(img, (540, 960))
    cv2.imwrite(r'C:\Users\HP\.gemini\antigravity\brain\80131d65-b87a-4035-a728-785c9c174d83\test_three_step3_thumb.jpg', thumb, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print('Saved test_three_step3_thumb.jpg')

