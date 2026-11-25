import subprocess
import cv2

html = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; background: #0c0a08; overflow: hidden; }
  #canvas3d { width: 1080px; height: 1920px; display: block; }
</style>
<script src="/lib/three.min.js"></script>
</head>
<body>
<canvas id="canvas3d"></canvas>
<script>
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas3d');
  const width = 1080;
  const height = 1920;

  // 1. Scene & Renderer
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0705);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;

  // 2. Camera: Angled isometric / webcam perspective matching real stream
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 13.0, 14.0);
  camera.lookAt(0, -1.0, 0.2);

  // 3. Lighting Setup
  // Soft warm ambient light
  const ambientLight = new THREE.AmbientLight(0xffedd5, 0.8);
  scene.add(ambientLight);

  // Key directional light casting soft shadows onto paper & table
  const dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
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

  // Rim / specular light from top-left for soft metallic sheen
  const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.35);
  rimLight.position.set(-6, 12, -4);
  scene.add(rimLight);

  // 4. Procedural Warm Teak Wood Texture for Table
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 1024;
  woodCanvas.height = 1024;
  const wCtx = woodCanvas.getContext('2d');
  
  // Rich teak gradient
  const wGrad = wCtx.createLinearGradient(0, 0, 0, 1024);
  wGrad.addColorStop(0, '#693816');
  wGrad.addColorStop(0.3, '#8e4e20');
  wGrad.addColorStop(0.7, '#783e16');
  wGrad.addColorStop(1, '#53280c');
  wCtx.fillStyle = wGrad;
  wCtx.fillRect(0, 0, 1024, 1024);

  // Horizontal wood plank seams (matching Image 4 & 5)
  for (let y = 140; y < 1024; y += 170) {
    wCtx.fillStyle = 'rgba(25, 10, 3, 0.55)';
    wCtx.fillRect(0, y, 1024, 4);
    wCtx.fillStyle = 'rgba(255, 210, 150, 0.22)';
    wCtx.fillRect(0, y - 2, 1024, 2);
  }

  // Soft wood grain noise
  for (let i = 0; i < 5000; i++) {
    wCtx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 230, 180, 0.04)' : 'rgba(20, 8, 2, 0.05)';
    const rx = Math.random() * 1024;
    const ry = Math.random() * 1024;
    const rw = 25 + Math.random() * 90;
    wCtx.fillRect(rx, ry, rw, 1.8);
  }

  const woodTexture = new THREE.CanvasTexture(woodCanvas);
  woodTexture.needsUpdate = true;
  woodTexture.anisotropy = 8;

  const tableMat = new THREE.MeshStandardMaterial({
    map: woodTexture,
    roughness: 0.38,
    metalness: 0.05
  });

  // Table Top: extends from Z=-6.5 to Z=+2.8
  const tableW = 12.5;
  const tableL = 9.3;
  const tableH = 1.2;
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(tableW, tableH, tableL), tableMat);
  tableTop.position.set(0, -tableH / 2, -1.85); // center at Z=-1.85 -> Z spans from -6.5 to +2.8
  tableTop.receiveShadow = true;
  scene.add(tableTop);

  // Table Front Face (vertical apron under the table edge)
  const apronH = 8.0;
  const apronTop = new THREE.Mesh(new THREE.BoxGeometry(tableW, apronH, 0.5), tableMat);
  apronTop.position.set(0, -tableH - apronH / 2 + 0.1, 2.55);
  apronTop.receiveShadow = true;
  scene.add(apronTop);

  // 5. Curved Paper Geometry (Custom Plane with Roll over Front Edge)
  const paperW = 8.2;
  const paperFlatL = 8.6;  // Flat on desk from startZ to edgeZ
  const rollR = 0.65;      // Cylindrical roll radius
  const rollArc = (Math.PI / 2) * rollR;
  const paperHangL = 7.0;  // Length hanging down in front
  const totalL = paperFlatL + rollArc + paperHangL;

  const segW = 48;
  const segL = 192;
  const paperGeom = new THREE.PlaneGeometry(paperW, totalL, segW, segL);

  const pos = paperGeom.attributes.position;
  const v = new THREE.Vector3();

  const startZ = -5.8;
  const edgeZ = startZ + paperFlatL; // Table front edge Z = 2.8

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const s = (totalL / 2) - v.y; // distance from top edge
    const x = v.x;
    let y = 0.02; // sits right on top of table (Y=0)
    let z = 0;

    if (s <= paperFlatL) {
      // 1. Flat on desk surface
      y = 0.02;
      z = startZ + s;
    } else if (s <= paperFlatL + rollArc) {
      // 2. Rolling over cylindrical edge
      const arcS = s - paperFlatL;
      const angle = arcS / rollR; // 0 to PI/2
      y = 0.02 - rollR * (1 - Math.cos(angle));
      z = edgeZ + rollR * Math.sin(angle);
    } else {
      // 3. Hanging down in front of table (draping vertically)
      const hangS = s - (paperFlatL + rollArc);
      y = 0.02 - rollR - hangS * 0.98;
      z = edgeZ + rollR - hangS * 0.05;
    }

    pos.setXYZ(i, x, y, z);
  }

  paperGeom.computeVertexNormals();

  // Draw Sample Paper Texture (Cream paper with fiber & sample print cards)
  const canvasTex = document.createElement('canvas');
  canvasTex.width = 1024;
  canvasTex.height = 2048;
  const ctx = canvasTex.getContext('2d');

  // Warm cream paper base
  ctx.fillStyle = '#ded5b0';
  ctx.fillRect(0, 0, 1024, 2048);

  // Subtle paper texture grain
  for (let i = 0; i < 10000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(70,50,30,0.04)';
    ctx.fillRect(Math.random() * 1024, Math.random() * 2048, 2, 2);
  }

  // Draw Standard 2-Card Paired Row (Matching Image 4)
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = 5;
  ctx.strokeRect(50, 100, 435, 340);
  ctx.strokeRect(539, 100, 435, 340);

  // Circular avatar rings
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(267, 230, 95, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(756, 230, 95, 0, Math.PI * 2); ctx.stroke();

  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#1c1917';
  ctx.textAlign = 'center';
  ctx.fillText('♡ Dzul Realty ♡', 267, 395);
  ctx.fillText('♡ tiara abrhy ♡', 756, 395);

  // Card rolling right over the edge!
  ctx.strokeRect(50, 800, 435, 340);
  ctx.strokeRect(539, 800, 435, 340);
  ctx.beginPath(); ctx.arc(267, 930, 95, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(756, 930, 95, 0, Math.PI * 2); ctx.stroke();
  ctx.fillText('♡ deltafatiaa ♡', 756, 1095);
  ctx.fillText('♡ vann ♡', 267, 1095);

  // Card on hanging apron
  ctx.strokeRect(162, 1400, 700, 400);
  ctx.beginPath(); ctx.arc(512, 1550, 110, 0, Math.PI * 2); ctx.stroke();
  ctx.fillText('♡ Dek_$LM@ (Big 🍩) ♡', 512, 1740);

  const texture = new THREE.CanvasTexture(canvasTex);
  texture.needsUpdate = true;
  texture.anisotropy = 8;

  const paperMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.65,
    metalness: 0.0,
    side: THREE.DoubleSide
  });

  const paperMesh = new THREE.Mesh(paperGeom, paperMat);
  paperMesh.receiveShadow = true;
  paperMesh.castShadow = true;
  scene.add(paperMesh);

  // Render frame
  renderer.render(scene, camera);
  console.log("RENDERED_STEP1_SCENE");
});
</script>
</body>
</html>
"""

with open('c:/Users/HP/tiktok/web/ref/test_three_step1.html', 'w', encoding='utf-8') as f:
    f.write(html)

cmd = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '--headless',
    '--disable-gpu',
    r'--screenshot=c:\Users\HP\tiktok\web\ref\test_three_step1.png',
    '--window-size=1080,1920',
    'http://localhost:8000/ref/test_three_step1.html'
]
subprocess.run(cmd)

img = cv2.imread(r'c:\Users\HP\tiktok\web\ref\test_three_step1.png')
if img is not None:
    thumb = cv2.resize(img, (540, 960))
    cv2.imwrite(r'C:\Users\HP\.gemini\antigravity\brain\80131d65-b87a-4035-a728-785c9c174d83\test_three_step1_thumb.jpg', thumb, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print('Updated test_three_step1_thumb.jpg with wood texture')
