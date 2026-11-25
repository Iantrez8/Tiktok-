/**
 * TikTok LIVE Virtual Pencil Printer
 * Three.js (WebGL) Photorealistic Engine with GSAP Kinematics
 */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);

  // URL flags
  if (q.get("controls") === "0") document.body.classList.add("nocontrols");
  if (q.get("transparent") === "1") document.body.classList.add("transparent");

  // DOM Elements
  const canvasEl = $("canvas3d");
  const sceneEl = $("scene");
  const livePill = $("livePill");
  const pillText = $("pillText");
  const chkSplit = $("chkSplit");
  const robloxVideo = $("robloxVideo");
  const robloxPlaceholder = $("robloxPlaceholder");
  const videoInput = $("videoInput");
  const btnPickVideo = $("btnPickVideo");
  const btnBrowseVideo = $("btnBrowseVideo");
  const btnMuteVideo = $("btnMuteVideo");
  const speedSlider = $("speed");

  let speed = speedSlider ? parseFloat(speedSlider.value) || 1 : 1;
  if (speedSlider) {
    speedSlider.oninput = () => {
      speed = Math.max(0.2, parseFloat(speedSlider.value) || 1);
    };
  }

  // =========================================================================
  // 1. THREE.JS SCENE, CAMERA, LIGHTING & RENDERER (STEP 1)
  // =========================================================================
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0705);

  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    alpha: false,
    powerPreference: "default"
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputEncoding = THREE.sRGBEncoding;

  let sceneDirty = true;
  function markSceneDirty(updateShadow = false) {
    sceneDirty = true;
    if (updateShadow) renderer.shadowMap.needsUpdate = true;
  }

  // High-Fidelity Photorealistic Studio Lighting Environment
  function createStudioEnvironment(r) {
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x1a1d24);

    // 1. Overhead High-Intensity Key Softbox (creates the razor-sharp chrome cylinder highlights)
    const topLight = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    topLight.position.set(2, 14, 2);
    topLight.rotation.x = Math.PI / 2;
    envScene.add(topLight);

    // 2. Front Soft Fill Light
    const frontLight = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 16),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
    );
    frontLight.position.set(0, 5, 14);
    frontLight.lookAt(0, 0, 0);
    envScene.add(frontLight);

    // 3. Cool Subtle Rim Accent Light from left
    const rimMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 24),
      new THREE.MeshBasicMaterial({ color: 0x93c5fd })
    );
    rimMesh.position.set(-16, 8, -2);
    rimMesh.rotation.y = Math.PI / 3;
    envScene.add(rimMesh);

    // 4. Warm Teak Bounce from below (photorealistic reflection of the wood desk)
    const floorBounce = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshBasicMaterial({ color: 0x9a5824 })
    );
    floorBounce.position.set(0, -8, 0);
    floorBounce.rotation.x = -Math.PI / 2;
    envScene.add(floorBounce);

    const pmrem = new THREE.PMREMGenerator(r);
    pmrem.compileEquirectangularShader();
    const envRt = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    return envRt.texture;
  }
  scene.environment = createStudioEnvironment(renderer);

  // Camera tuned closer & tighter to match real TikTok LIVE stream references (close-up framing)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 7.3, 8.8);
  camera.lookAt(0, -0.8, -0.2);

  // Responsive Horizontal Framing: close-up framing (~83% paper width) + mouse-wheel zoom support
  const TARGET_VISIBLE_WIDTH = 7.1;
  const CAM_DIST = 11.5;
  let zoomScale = 1.0;

  let isSplit = q.has("split") ? (q.get("split") === "1") : false;

  function resizeRenderer() {
    if (!sceneEl) return;
    const w = sceneEl.clientWidth || 1080;
    const h = sceneEl.clientHeight || 1920;
    camera.aspect = w / h;

    // In Split Mode (top 53% printer, bottom 47% video), tilt camera slightly up so the flat print bed fills the top half
    if (isSplit) {
      camera.position.set(0, 7.1, 8.2);
      camera.lookAt(0, -0.35, -0.95);
    } else {
      camera.position.set(0, 7.3, 8.8);
      camera.lookAt(0, -0.8, -0.2);
    }

    // Adapt vertical FOV so horizontal visible span is constant (TARGET_VISIBLE_WIDTH * zoomScale)
    const tanHalfV = ((TARGET_VISIBLE_WIDTH * zoomScale) / 2) / (CAM_DIST * camera.aspect);
    camera.fov = 2 * Math.atan(tanHalfV) * (180 / Math.PI);
    camera.updateProjectionMatrix();

    renderer.setSize(w, h, false);
    // Cap pixelRatio at 1.5 for crisp text & lines without 2x-4x HiDPI GPU overload
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    markSceneDirty(true);
  }
  window.addEventListener("resize", resizeRenderer);
  if (sceneEl) {
    sceneEl.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomScale = Math.max(0.6, Math.min(1.4, zoomScale + (e.deltaY > 0 ? 0.04 : -0.04)));
      resizeRenderer();
    }, { passive: false });
  }

  // Soft diffused lighting - natural warm parchment tone, ZERO white blowout
  const ambientLight = new THREE.AmbientLight(0xfff8ee, 0.45);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xfff5e6, 0.38);
  dirLight.position.set(3.8, 16, 6.0);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 35;
  dirLight.shadow.camera.left = -9.0;
  dirLight.shadow.camera.right = 9.0;
  dirLight.shadow.camera.top = 12;
  dirLight.shadow.camera.bottom = -12;
  dirLight.shadow.bias = -0.0002;
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.16);
  rimLight.position.set(-6, 10, -4);
  scene.add(rimLight);

  // Natural Warm Honey-Oak Teak Wood Table with horizontal grain planks
  const woodCanvas = document.createElement("canvas");
  woodCanvas.width = 1024; woodCanvas.height = 1024;
  const wCtx = woodCanvas.getContext("2d");
  const wGrad = wCtx.createLinearGradient(0, 0, 0, 1024);
  wGrad.addColorStop(0, "#b57c4a");
  wGrad.addColorStop(0.3, "#c9935e");
  wGrad.addColorStop(0.65, "#a8703e");
  wGrad.addColorStop(1, "#875327");
  wCtx.fillStyle = wGrad;
  wCtx.fillRect(0, 0, 1024, 1024);
  // Crisp horizontal plank seams with realistic highlights & shadows
  for (let y = 80; y < 1024; y += 135) {
    wCtx.fillStyle = "rgba(15, 6, 2, 0.62)";
    wCtx.fillRect(0, y, 1024, 3.5);
    wCtx.fillStyle = "rgba(255, 235, 195, 0.35)";
    wCtx.fillRect(0, y - 2, 1024, 2);
  }
  for (let i = 0; i < 900; i++) {
    const gy = Math.random() * 1024;
    const gh = Math.random() > 0.8 ? 2.5 : 1.2;
    wCtx.fillStyle = Math.random() > 0.45 ? "rgba(255, 235, 195, 0.06)" : "rgba(35, 12, 3, 0.07)";
    wCtx.fillRect(Math.random() * 1024, gy, 40 + Math.random() * 180, gh);
  }
  const woodTexture = new THREE.CanvasTexture(woodCanvas);
  woodTexture.needsUpdate = true;
  woodTexture.generateMipmaps = false;
  woodTexture.minFilter = THREE.LinearFilter;
  woodTexture.anisotropy = 2;
  woodTexture.encoding = THREE.sRGBEncoding;
  const tableMat = new THREE.MeshStandardMaterial({
    map: woodTexture,
    roughness: 0.48,
    metalness: 0.02
  });

  // Table top ends neatly at z = 2.68 right before the paper roll begins (zero intersection)
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(14.5, 1.2, 8.48), tableMat);
  tableTop.position.set(0, -0.6, -1.56);
  tableTop.receiveShadow = true;
  scene.add(tableTop);

  // Table front apron drops down vertically behind the hanging paper roll
  const tableApron = new THREE.Mesh(new THREE.BoxGeometry(14.5, 11.5, 0.5), tableMat);
  tableApron.position.set(0, -6.85, 2.43);
  tableApron.receiveShadow = true;
  scene.add(tableApron);

  // Curved Paper Geometry (Custom Plane with Roll over Front Edge - Proportioned matching "v")
  const paperW = 5.9;
  const paperFlatL = 8.5;
  const rollR = 0.65;
  const rollArc = (Math.PI / 2) * rollR;
  const paperHangL = 6.5;
  const totalL = paperFlatL + rollArc + paperHangL;

  // Smooth curvature along roll arc (segL = 48 cuts vertex count in half)
  const segW = 2, segL = 48;
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
  // 2. THE DYNAMIC PRINT BUFFER & THROTTLED CANVASTEXTURE (STEP 2)
  // =========================================================================
  const BUFFER_W = 1024, BUFFER_H = 2048;
  const printCanvas = document.createElement("canvas");
  printCanvas.width = BUFFER_W; printCanvas.height = BUFFER_H;
  const pCtx = printCanvas.getContext("2d");

  const swapCanvas = document.createElement("canvas");
  swapCanvas.width = BUFFER_W; swapCanvas.height = BUFFER_H;
  const sCtx = swapCanvas.getContext("2d");

  // Dirty flag & throttled upload scheduler to eliminate GPU bus saturation
  let paperDirty = false;
  let lastTexUpload = 0;
  function markPaperDirty(immediate = false) {
    paperDirty = true;
    sceneDirty = true;
    if (immediate) {
      paperTexture.needsUpdate = true;
      paperDirty = false;
      lastTexUpload = performance.now();
    }
  }

  // Pre-baked Parchment Grain Pattern (generates once on load, 0ms CPU time during printing)
  const grainCanvas = document.createElement("canvas");
  grainCanvas.width = 128; grainCanvas.height = 128;
  const gCtx = grainCanvas.getContext("2d");
  gCtx.fillStyle = "#ebdcb8";
  gCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 280; i++) {
    gCtx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.22)" : "rgba(110,75,35,0.04)";
    gCtx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const paperGrainPattern = pCtx.createPattern(grainCanvas, "repeat");

  // Warm vintage Manila/ivory parchment (#ebdcb8) matching reference "v" pixel-for-pixel
  function fillPaperBase(ctx, y = 0, h = BUFFER_H) {
    ctx.fillStyle = paperGrainPattern;
    ctx.fillRect(0, y, BUFFER_W, h);
    markPaperDirty();
  }
  fillPaperBase(pCtx, 0, BUFFER_H);

  const paperTexture = new THREE.CanvasTexture(printCanvas);
  paperTexture.needsUpdate = true;
  // Disable mipmap regeneration on every canvas upload (avoids 11-level glGenerateMipmap GPU stall)
  paperTexture.generateMipmaps = false;
  paperTexture.anisotropy = 1;
  paperTexture.minFilter = THREE.LinearFilter;
  paperTexture.magFilter = THREE.LinearFilter;
  // Canvas pixels are sRGB: flag them so ink/photos are not double-gamma-brightened (washed-out prints)
  paperTexture.encoding = THREE.sRGBEncoding;

  const paperMat = new THREE.MeshStandardMaterial({
    map: paperTexture,
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.35, // keep the white studio softboxes from bleaching the paper
    side: THREE.DoubleSide
  });
  const paperMesh = new THREE.Mesh(paperGeom, paperMat);
  paperMesh.receiveShadow = true;
  paperMesh.castShadow = false;
  scene.add(paperMesh);

  // Scroll Buffer Downwards
  function scrollBuffer(pixels) {
    sCtx.clearRect(0, 0, BUFFER_W, BUFFER_H);
    sCtx.drawImage(printCanvas, 0, 0);

    pCtx.clearRect(0, 0, BUFFER_W, BUFFER_H);
    pCtx.drawImage(swapCanvas, 0, pixels);

    fillPaperBase(pCtx, 0, pixels + 5);
    markPaperDirty(true);
  }

  // =========================================================================
  // 3. THE 3D PRINTER ARM & KINEMATICS (STEP 3)
  // =========================================================================
  // Photorealistic Precision CNC Chrome Steel & Anodized Aluminum with Studio Specular Response
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0x8a949e,
    metalness: 0.94,
    roughness: 0.12,
    envMapIntensity: 1.35
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x22262d,
    metalness: 0.75,
    roughness: 0.38,
    envMapIntensity: 0.85
  });
  const silverAlumMat = new THREE.MeshStandardMaterial({
    color: 0xb8c0c9,
    metalness: 0.85,
    roughness: 0.22,
    envMapIntensity: 1.15
  });

  // Top Physical CNC Extrusion Beam (matching reference "v")
  const beamCanvas = document.createElement("canvas");
  beamCanvas.width = 2048; beamCanvas.height = 128;
  const bCtx = beamCanvas.getContext("2d");
  bCtx.fillStyle = "#16191f";
  bCtx.fillRect(0, 0, 2048, 128);
  for (let i = 0; i < 600; i++) {
    bCtx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.18)";
    bCtx.fillRect(Math.random() * 2048, 0, Math.random() * 80 + 20, 128);
  }

  // Crisp metallic silver stencil heading (positioned clearly between left clamp and center!)
  bCtx.textAlign = "left";
  bCtx.font = "900 42px 'Arial Black', Impact, sans-serif";
  bCtx.fillStyle = "#e2e8f0";
  bCtx.shadowColor = "rgba(0,0,0,0.85)";
  bCtx.shadowBlur = 4;
  bCtx.shadowOffsetY = 2;
  bCtx.fillText("PRINT BOOTH", 420, 80);

  // Vibrant coral-pink secondary title
  bCtx.font = "bold 32px sans-serif";
  bCtx.fillStyle = "#f43f5e";
  bCtx.fillText("PENCIL PRINTS", 920, 78);

  // Red LIVE pill badge embossed directly on front face
  bCtx.shadowColor = "transparent";
  bCtx.fillStyle = "#e11d48";
  bCtx.beginPath();
  bCtx.roundRect(1420, 44, 150, 48, 24);
  bCtx.fill();
  bCtx.fillStyle = "#ffffff";
  bCtx.font = "900 26px sans-serif";
  bCtx.fillText("● LIVE", 1450, 78);

  // Subtle camera guide on the right
  bCtx.font = "500 22px monospace";
  bCtx.fillStyle = "#94a3b8";
  bCtx.fillText("camera - scroll zoom", 1680, 78);

  const beamTex = new THREE.CanvasTexture(beamCanvas);
  beamTex.generateMipmaps = false;
  beamTex.minFilter = THREE.LinearFilter;
  beamTex.anisotropy = 2;
  beamTex.encoding = THREE.sRGBEncoding;
  const beamFaceMat = new THREE.MeshStandardMaterial({ map: beamTex, roughness: 0.45, metalness: 0.75 });
  // Box material array: [+X, -X, +Y, -Y, +Z (front face with text), -Z]
  const topBeamMaterials = [
    darkMetalMat,
    darkMetalMat,
    darkMetalMat,
    darkMetalMat,
    beamFaceMat,
    darkMetalMat
  ];
  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.75, 1.2), topBeamMaterials);
  topBeam.position.set(0, 0.45, -5.8);
  topBeam.castShadow = false;
  topBeam.receiveShadow = true;
  scene.add(topBeam);

  // Side Rails - slender precision ground steel rods matching Image 2
  const railRadius = 0.082, railLength = 9.4;
  const railGeom = new THREE.CylinderGeometry(railRadius, railRadius, railLength, 16);

  const railLeft = new THREE.Mesh(railGeom, chromeMat);
  railLeft.rotation.x = Math.PI / 2;
  railLeft.position.set(-3.85, 0.42, -1.35);
  railLeft.castShadow = true;
  scene.add(railLeft);

  const railRight = new THREE.Mesh(railGeom, chromeMat);
  railRight.rotation.x = Math.PI / 2;
  railRight.position.set(3.85, 0.42, -1.35);
  railRight.castShadow = true;
  scene.add(railRight);

  // Sturdy corner pillow blocks clamped to top beam and desk near edge (matching Image 2)
  function createPillowBlock(x, z, mat = silverAlumMat) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.68), mat);
    block.position.set(x, 0.34, z);
    block.castShadow = true;
    block.receiveShadow = true;
    scene.add(block);
  }
  createPillowBlock(-3.85, -5.8, silverAlumMat); // Top left clamp on beam
  createPillowBlock(3.85, -5.8, silverAlumMat);  // Top right clamp on beam
  createPillowBlock(-3.85, 2.5, darkMetalMat);   // Lower left desk clamp near front edge
  createPillowBlock(3.85, 2.5, darkMetalMat);    // Lower right desk clamp near front edge

  // Moving Gantry Assembly
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(0, 0, -4.5);
  scene.add(gantryGroup);

  const sliderGeom = new THREE.BoxGeometry(0.5, 0.46, 0.72);
  const sliderL = new THREE.Mesh(sliderGeom, silverAlumMat);
  sliderL.position.set(-3.85, 0.42, 0);
  sliderL.castShadow = true;
  gantryGroup.add(sliderL);

  const sliderR = new THREE.Mesh(sliderGeom, silverAlumMat);
  sliderR.position.set(3.85, 0.42, 0);
  sliderR.castShadow = true;
  gantryGroup.add(sliderR);

  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 8.1, 16), chromeMat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, 0.42, 0);
  crossbar.castShadow = true;
  gantryGroup.add(crossbar);

  // Moving Carriage Assembly (Precision CNC Brushed Aluminum matching Reference)
  const carriageGroup = new THREE.Group();
  carriageGroup.position.set(0, 0.42, 0);
  gantryGroup.add(carriageGroup);

  const carriageBody = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.7), silverAlumMat);
  carriageBody.position.set(0, 0.08, 0);
  carriageBody.castShadow = true;
  carriageGroup.add(carriageBody);

  const carriagePlate = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.06, 0.58), chromeMat);
  carriagePlate.position.set(0, 0.34, 0);
  carriagePlate.castShadow = false;
  carriageGroup.add(carriagePlate);

  const ledMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), ledMat);
  led.position.set(0.3, 0.42, 0.2);
  carriageGroup.add(led);

  // Soft spot/point light under carriage illuminating paper (matching Image "v")
  const penGlowLight = new THREE.PointLight(0x38bdf8, 0.85, 3.2, 2);
  penGlowLight.position.set(0, -0.3, 0.25);
  carriageGroup.add(penGlowLight);

  const penHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.4 }));
  penHolder.position.set(0, -0.2, 0.25);
  penHolder.castShadow = false;
  carriageGroup.add(penHolder);

  const penTip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }));
  penTip.rotation.x = Math.PI;
  penTip.position.set(0, -0.42, 0.25);
  penTip.castShadow = false;
  carriageGroup.add(penTip);

  // VIP Physical Stamp Mechanism (retracted out of view by default)
  const stampGroup = new THREE.Group();
  stampGroup.position.set(2.2, 25.0, -1.8);
  stampGroup.visible = false;
  scene.add(stampGroup);

  const stampRod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.0, 16), chromeMat);
  stampRod.position.set(0, 2.0, 0);
  stampRod.castShadow = false;
  stampGroup.add(stampRod);

  const stampHead = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.9), darkMetalMat);
  stampHead.position.set(0, 0, 0);
  stampHead.castShadow = true;
  stampGroup.add(stampHead);

  const stampFace = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.75), new THREE.MeshBasicMaterial({ color: 0x991b1b }));
  stampFace.position.set(0, -0.32, 0);
  stampGroup.add(stampFace);

  // Kinematic Coordinate Mapping
  function canvasXto3D(cx) {
    return ((cx / BUFFER_W) - 0.5) * paperW;
  }
  function canvasYto3D(cy) {
    // Mathematically exact mapping from buffer Y to 3D world Z matching paper UV coordinates & pen offset (+0.25)
    return -6.05 + (cy / BUFFER_H) * totalL;
  }

  function setPenPosition(cx, cy) {
    carriageGroup.position.x = canvasXto3D(cx);
    gantryGroup.position.z = canvasYto3D(cy);
    markSceneDirty(true);
  }

  // =========================================================================
  // 4. REALISTIC AVATARS & ROBUST IMAGE LOADING
  // =========================================================================
  const REAL_AVATARS = [
    { name: "Dzul Realty", handle: "dzul_realty", src: "avatars/dzul_realty.jpg" },
    { name: "tiara abrhy", handle: "tiara_abrhy", src: "avatars/tiara_abrhy.jpg" },
    { name: "deltafatiaa", handle: "deltafatiaa", src: "avatars/deltafatiaa.jpg" },
    { name: "Dek_$LM@", handle: "dek_slm", src: "avatars/dek_slm.jpg" },
    { name: "ricardo", handle: "ricardo", src: "avatars/ricardo.jpg" },
    { name: "Simba Fx", handle: "simba_fx", src: "avatars/simba_fx.jpg" },
    { name: "NEGRA", handle: "negra", src: "avatars/negra.jpg" },
    { name: "Edfernandez", handle: "edfernandez", src: "avatars/edfernandez.jpg" }
  ];
  let avatarCursor = 0;
  function getNextAvatar() {
    const a = REAL_AVATARS[avatarCursor % REAL_AVATARS.length];
    avatarCursor++;
    return a;
  }

  function createFallbackAvatar(name) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 256;
    const cx = cv.getContext("2d");
    const raw = String(name || "User").trim();
    // Extract first true letter or digit (Unicode-aware) so emojis/symbols never render as '?' or blank
    const match = raw.match(/[\p{L}\p{N}]/u);
    const ch = (match ? match[0] : (Array.from(raw)[0] || "U")).toUpperCase();
    const colors = ["#2563eb", "#dc2626", "#059669", "#7c3aed", "#d97706", "#db2777"];
    const col = colors[Math.abs(ch.codePointAt(0) || 65) % colors.length];
    const g = cx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, col);
    g.addColorStop(1, "#1e293b");
    cx.fillStyle = g;
    cx.fillRect(0, 0, 256, 256);
    cx.fillStyle = "#ffffff";
    cx.font = "bold 110px sans-serif";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText(ch, 128, 134);
    return cv;
  }

  const imgCache = new Map();
  function loadImg(src, nameFallback = "User") {
    if (!src) return Promise.resolve(createFallbackAvatar(nameFallback));

    // If it's a remote URL (http/https) not already proxied, route through local /img?u= proxy to prevent CORS/tainted canvas
    if ((src.startsWith("http://") || src.startsWith("https://")) && !src.startsWith("/img")) {
      src = "/img?u=" + encodeURIComponent(src);
    }

    // Instant zero-latency loading from embedded base64 avatars
    if (window.EMBEDDED_AVATARS) {
      const baseName = src.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
      if (window.EMBEDDED_AVATARS[baseName]) {
        src = window.EMBEDDED_AVATARS[baseName];
      }
    }

    if (imgCache.has(src)) return Promise.resolve(imgCache.get(src));
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      let done = false;
      const finish = (resImg, cacheIt = false) => {
        if (!done) {
          done = true;
          // Only cache real, non-blank loaded images so temporary network timeouts never poison the cache
          if (cacheIt) imgCache.set(src, resImg);
          resolve(resImg);
        }
      };
      // 4.5s timeout to give live TikTok CDN proxy plenty of time during active streams
      const timer = setTimeout(() => {
        finish(createFallbackAvatar(nameFallback), false);
      }, 4500);

      img.onload = () => {
        clearTimeout(timer);
        if (img.naturalWidth > 2 && img.naturalHeight > 2) {
          finish(img, true);
        } else {
          finish(createFallbackAvatar(nameFallback), false);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        finish(createFallbackAvatar(nameFallback), false);
      };
      img.src = src;
      if (img.complete && img.naturalWidth > 2) {
        clearTimeout(timer);
        finish(img, true);
      }
    });
  }

  // =========================================================================
  // 5. GSAP DRAWING & KINEMATICS ENGINE
  // =========================================================================
  const vipBanner = $("vipBanner");
  const vipBannerAvatar = $("vipBannerAvatar");
  const vipBannerBadge = $("vipBannerBadge");
  const vipBannerFollow = $("vipBannerFollow");
  const vipBannerGift = $("vipBannerGift");
  let vipBannerTimer = null;

  function showVipBanner(g, resolvedImg) {
    if (!vipBanner) return;
    if (vipBannerTimer) clearTimeout(vipBannerTimer);
    const cleanHandle = String(g.handle || g.name || "user").replace(/^@/, "").trim();
    const coins = g.coins || (g.isVvip ? 1000 : (g.count || 30));
    if (vipBannerBadge) {
      vipBannerBadge.textContent = g.isVvip
        ? `👑 ${g.rankText || "TOP 1"} VIP GIFTER`
        : `🍩 BIG GIFTER • ${g.rankText || "TOP"}`;
    }
    if (vipBannerFollow) {
      vipBannerFollow.textContent = `FOLLOW @${cleanHandle}`;
    }
    if (vipBannerGift) {
      vipBannerGift.textContent = `Sent ${g.gift || "Gift"}${g.count > 1 ? " ×" + g.count : ""} (${coins.toLocaleString()} coins)`;
    }
    if (vipBannerAvatar) {
      if (resolvedImg && resolvedImg.src) {
        vipBannerAvatar.src = resolvedImg.src;
      } else if (resolvedImg && resolvedImg.toDataURL) {
        vipBannerAvatar.src = resolvedImg.toDataURL();
      } else if (g.avatar) {
        vipBannerAvatar.src = g.avatar;
      }
    }
    vipBanner.classList.remove("hidden");
    vipBannerTimer = setTimeout(() => {
      vipBanner.classList.add("hidden");
    }, 9000);
  }
  function hideVipBanner() {
    if (!vipBanner) return;
    if (vipBannerTimer) clearTimeout(vipBannerTimer);
    vipBanner.classList.add("hidden");
  }

  function showPill(text) {
    if (!livePill) return;
    pillText.textContent = text;
    livePill.classList.remove("hidden");
  }
  function hidePill() {
    if (!livePill) return;
    livePill.classList.add("hidden");
  }

  // Draw Ornate Royal Crown, Flaming Wings, and TOP 1 Rank Badge (matching Image 1)
  function drawVipCrownOrnament(ctx, cx, cy, r, rankText = "TOP 1") {
    ctx.save();

    // 1. Left Flaming Wing
    ctx.save();
    const wingGradL = ctx.createLinearGradient(cx - r - 100, cy, cx - r, cy);
    wingGradL.addColorStop(0, "#92400e");
    wingGradL.addColorStop(0.5, "#d97706");
    wingGradL.addColorStop(1, "#fde047");
    ctx.fillStyle = wingGradL;
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(cx - r * 0.7, cy - r * 0.7);
    ctx.bezierCurveTo(cx - r - 35, cy - r - 20, cx - r - 75, cy - r - 30, cx - r - 125, cy - r - 10);
    ctx.bezierCurveTo(cx - r - 95, cy - r + 10, cx - r - 65, cy - r + 20, cx - r - 50, cy - r + 45);
    ctx.bezierCurveTo(cx - r - 85, cy - r + 40, cx - r - 115, cy - r + 50, cx - r - 140, cy - r + 75);
    ctx.bezierCurveTo(cx - r - 110, cy - r + 80, cx - r - 80, cy - r + 85, cx - r - 60, cy - r + 105);
    ctx.bezierCurveTo(cx - r - 90, cy - r + 110, cx - r - 115, cy - r + 125, cx - r - 125, cy - r + 150);
    ctx.bezierCurveTo(cx - r - 90, cy - r + 140, cx - r - 55, cy - r + 130, cx - r * 0.6, cy - r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Red wing feather accents
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - r - 115, cy - r - 5);
    ctx.quadraticCurveTo(cx - r - 55, cy - r + 15, cx - r * 0.7, cy - r * 0.5);
    ctx.moveTo(cx - r - 130, cy - r + 75);
    ctx.quadraticCurveTo(cx - r - 70, cy - r + 85, cx - r * 0.8, cy - r + 30);
    ctx.stroke();
    ctx.restore();

    // 2. Right Flaming Wing
    ctx.save();
    const wingGradR = ctx.createLinearGradient(cx + r, cy, cx + r + 100, cy);
    wingGradR.addColorStop(0, "#fde047");
    wingGradR.addColorStop(0.5, "#d97706");
    wingGradR.addColorStop(1, "#92400e");
    ctx.fillStyle = wingGradR;
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(cx + r * 0.7, cy - r * 0.7);
    ctx.bezierCurveTo(cx + r + 35, cy - r - 20, cx + r + 75, cy - r - 30, cx + r + 125, cy - r - 10);
    ctx.bezierCurveTo(cx + r + 95, cy - r + 10, cx + r + 65, cy - r + 20, cx + r + 50, cy - r + 45);
    ctx.bezierCurveTo(cx + r + 85, cy - r + 40, cx + r + 115, cy - r + 50, cx + r + 140, cy - r + 75);
    ctx.bezierCurveTo(cx + r + 110, cy - r + 80, cx + r + 80, cy - r + 85, cx + r + 60, cy - r + 105);
    ctx.bezierCurveTo(cx + r + 90, cy - r + 110, cx + r + 115, cy - r + 125, cx + r + 125, cy - r + 150);
    ctx.bezierCurveTo(cx + r + 90, cy - r + 140, cx + r + 55, cy - r + 130, cx + r * 0.6, cy - r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Red wing feather accents
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + r + 115, cy - r - 5);
    ctx.quadraticCurveTo(cx + r + 55, cy - r + 15, cx + r * 0.7, cy - r * 0.5);
    ctx.moveTo(cx + r + 130, cy - r + 75);
    ctx.quadraticCurveTo(cx + r + 70, cy - r + 85, cx + r * 0.8, cy - r + 30);
    ctx.stroke();
    ctx.restore();

    // 3. Ornate Double Golden Ring with Ruby Accents around Avatar
    const goldGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    goldGrad.addColorStop(0, "#fffbeb");
    goldGrad.addColorStop(0.25, "#fde047");
    goldGrad.addColorStop(0.55, "#eab308");
    goldGrad.addColorStop(0.85, "#ca8a04");
    goldGrad.addColorStop(1, "#854d0e");

    ctx.lineWidth = 8;
    ctx.strokeStyle = goldGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(cx, cy, r + 9, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Lower Filigree Crest
    ctx.fillStyle = goldGrad;
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 65, cy + r - 8);
    ctx.bezierCurveTo(cx - 35, cy + r + 25, cx + 35, cy + r + 25, cx + 65, cy + r - 8);
    ctx.bezierCurveTo(cx + 40, cy + r + 16, cx, cy + r + 24, cx, cy + r + 24);
    ctx.bezierCurveTo(cx, cy + r + 24, cx - 40, cy + r + 16, cx - 65, cy + r - 8);
    ctx.fill();
    ctx.stroke();

    // 5. Royal 5-Point Crown at Top
    const crownBaseY = cy - r + 4;
    const crownTopY = crownBaseY - 55;
    ctx.fillStyle = goldGrad;
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 60, crownBaseY);
    ctx.lineTo(cx - 68, crownTopY + 22);
    ctx.lineTo(cx - 36, crownTopY + 36);
    ctx.lineTo(cx, crownTopY); // Center tallest peak
    ctx.lineTo(cx + 36, crownTopY + 36);
    ctx.lineTo(cx + 68, crownTopY + 22);
    ctx.lineTo(cx + 60, crownBaseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Center Ruby Gemstone on Crown
    const rubyGrad = ctx.createLinearGradient(cx - 10, crownTopY + 12, cx + 10, crownTopY + 28);
    rubyGrad.addColorStop(0, "#f87171");
    rubyGrad.addColorStop(0.5, "#dc2626");
    rubyGrad.addColorStop(1, "#7f1d1d");
    ctx.fillStyle = rubyGrad;
    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, crownTopY + 12);
    ctx.lineTo(cx + 8, crownTopY + 20);
    ctx.lineTo(cx, crownTopY + 28);
    ctx.lineTo(cx - 8, crownTopY + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Side rubies
    ctx.beginPath(); ctx.arc(cx - 36, crownTopY + 38, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 36, crownTopY + 38, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // 6. Arched TOP 1 Plaque / Banner
    const plaqueY = crownBaseY - 6;
    ctx.fillStyle = rubyGrad;
    ctx.strokeStyle = goldGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(cx - 46, plaqueY - 14, 92, 28, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = "900 19px Impact, 'Arial Black', sans-serif";
    ctx.fillStyle = "#fffbeb";
    ctx.textAlign = "center";
    ctx.fillText(rankText, cx, plaqueY + 7);

    ctx.restore();
  }

  // Draw Standard Card (matching Image 4 & Image 1 sequence)
  function animateStandardCard(timeline, x, y, w, h, name, avatarImg) {
    const cx = x + w / 2;
    const cy = y + h * 0.42;
    const r = Math.min(w, h) * 0.27;

    // Step 1: Draw First Line across the top with corner tick marks (matching Image 1)
    const topProgress = { t: 0 };
    timeline.to(carriageGroup.position, { x: canvasXto3D(x), duration: 0.22 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(y + 14), duration: 0.22 / speed, ease: "power2.out" }, "<");

    timeline.to(topProgress, {
      t: 1,
      duration: 0.35 / speed,
      ease: "none",
      onStart: () => {
        ledMat.color.setHex(0xef4444);
        penGlowLight.color.setHex(0xf43f5e);
      },
      onUpdate: () => {
        const curX = x + w * topProgress.t;
        setPenPosition(curX, y);

        pCtx.strokeStyle = "#1c1917";
        pCtx.lineWidth = 4;
        pCtx.beginPath();
        pCtx.moveTo(x, y + 14);
        pCtx.lineTo(x, y);
        pCtx.lineTo(curX, y);
        pCtx.stroke();
        markPaperDirty();
      }
    });
    // Draw right corner tick
    timeline.call(() => {
      pCtx.beginPath();
      pCtx.moveTo(x + w, y);
      pCtx.lineTo(x + w, y + 14);
      pCtx.stroke();
      markPaperDirty();
    });

    // Step 2: "then it draws down nicely" - Move down to avatar circle & sketch photo
    timeline.to(carriageGroup.position, { x: canvasXto3D(cx + r), duration: 0.22 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(cy), duration: 0.22 / speed, ease: "power2.out" }, "<");

    const circleProgress = { t: 0 };
    timeline.to(circleProgress, {
      t: 1,
      duration: 0.75 / speed,
      ease: "none",
      onUpdate: () => {
        const theta = 2 * Math.PI * circleProgress.t - Math.PI / 2;
        const curX = cx + Math.cos(theta) * r;
        const curY = cy + Math.sin(theta) * r;
        setPenPosition(curX, curY);

        // Progressively reveal avatar inside circular clip
        pCtx.save();
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, 0, 2 * Math.PI * circleProgress.t);
        pCtx.clip();
        if (avatarImg) pCtx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
        pCtx.restore();

        // Stroke circular outline
        pCtx.lineWidth = 4;
        pCtx.strokeStyle = "#1c1917";
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, -Math.PI / 2, theta);
        pCtx.stroke();
        markPaperDirty();
      }
    });

    // Step 3: Name handwriting with hearts
    const nameProgress = { t: 0 };
    const textStartX = x + 35, textEndX = x + w - 35, textY = y + h * 0.88;
    timeline.to(carriageGroup.position, { x: canvasXto3D(textStartX), duration: 0.18 / speed });
    timeline.to(gantryGroup.position, { z: canvasYto3D(textY), duration: 0.18 / speed }, "<");

    timeline.to(nameProgress, {
      t: 1,
      duration: 0.55 / speed,
      ease: "none",
      onStart: () => {
        pCtx.font = "bold 26px sans-serif";
        pCtx.fillStyle = "#1c1917";
        pCtx.textAlign = "center";
        pCtx.fillText("♡ " + name + " ♡", cx, textY);
        markPaperDirty();
      },
      onUpdate: () => {
        const curX = textStartX + (textEndX - textStartX) * nameProgress.t;
        const wiggle = Math.sin(nameProgress.t * Math.PI * 18) * 12;
        setPenPosition(curX, textY + wiggle);
      }
    });

    // Step 4: "then encloses the left frame" - Down right edge, bottom edge, up left edge
    const encloseProgress = { t: 0 };
    timeline.to(carriageGroup.position, { x: canvasXto3D(x + w), duration: 0.2 / speed });
    timeline.to(gantryGroup.position, { z: canvasYto3D(y + 14), duration: 0.2 / speed }, "<");

    timeline.to(encloseProgress, {
      t: 1,
      duration: 0.65 / speed,
      ease: "none",
      onUpdate: () => {
        const t = encloseProgress.t;
        let curX, curY;
        // 3 legs: down right (0..0.4), across bottom (0.4..0.8), up left (0.8..1.0)
        pCtx.strokeStyle = "#1c1917";
        pCtx.lineWidth = 4;
        pCtx.beginPath();
        pCtx.moveTo(x + w, y + 14);

        if (t <= 0.4) {
          const p = t / 0.4;
          curX = x + w; curY = y + 14 + (h - 14) * p;
          pCtx.lineTo(curX, curY);
        } else if (t <= 0.8) {
          const p = (t - 0.4) / 0.4;
          pCtx.lineTo(x + w, y + h);
          curX = x + w - w * p; curY = y + h;
          pCtx.lineTo(curX, curY);
        } else {
          const p = (t - 0.8) / 0.2;
          pCtx.lineTo(x + w, y + h);
          pCtx.lineTo(x, y + h);
          curX = x; curY = y + h - (h - 14) * p;
          pCtx.lineTo(curX, curY);
        }
        setPenPosition(curX, curY);
        pCtx.stroke();
        markPaperDirty();
      },
      onComplete: () => {
        markPaperDirty(true);
      }
    });
  }

  // Draw Tap Supporter Card (for viewers tapping screen during warmup)
  function animateTapCard(timeline, x, y, w, h, name, avatarImg, taps) {
    const cx = x + w / 2;
    const cy = y + h * 0.42;
    const r = Math.min(w, h) * 0.27;

    // Step 1: Draw top line with rose-red corner ticks & Heart Banner
    const topProgress = { t: 0 };
    timeline.to(carriageGroup.position, { x: canvasXto3D(x), duration: 0.22 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(y + 14), duration: 0.22 / speed, ease: "power2.out" }, "<");

    timeline.to(topProgress, {
      t: 1,
      duration: 0.35 / speed,
      ease: "none",
      onStart: () => {
        ledMat.color.setHex(0xf43f5e);
        penGlowLight.color.setHex(0xf43f5e);
      },
      onUpdate: () => {
        const curX = x + w * topProgress.t;
        setPenPosition(curX, y);

        pCtx.strokeStyle = "#e11d48";
        pCtx.lineWidth = 4;
        pCtx.beginPath();
        pCtx.moveTo(x, y + 14);
        pCtx.lineTo(x, y);
        pCtx.lineTo(curX, y);
        pCtx.stroke();
        markPaperDirty();
      }
    });

    timeline.call(() => {
      pCtx.beginPath();
      pCtx.moveTo(x + w, y);
      pCtx.lineTo(x + w, y + 14);
      pCtx.stroke();

      pCtx.font = "bold 18px sans-serif";
      pCtx.fillStyle = "#e11d48";
      pCtx.textAlign = "center";
      pCtx.fillText("❤️ TAP HERO ❤️", cx, y - 8);
      markPaperDirty();
    });

    // Step 2: Draw avatar circle with cute pink border
    timeline.to(carriageGroup.position, { x: canvasXto3D(cx + r), duration: 0.22 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(cy), duration: 0.22 / speed, ease: "power2.out" }, "<");

    const circleProgress = { t: 0 };
    timeline.to(circleProgress, {
      t: 1,
      duration: 0.75 / speed,
      ease: "none",
      onUpdate: () => {
        const theta = 2 * Math.PI * circleProgress.t - Math.PI / 2;
        const curX = cx + Math.cos(theta) * r;
        const curY = cy + Math.sin(theta) * r;
        setPenPosition(curX, curY);

        pCtx.save();
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, 0, 2 * Math.PI * circleProgress.t);
        pCtx.clip();
        if (avatarImg) pCtx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
        pCtx.restore();

        pCtx.lineWidth = 4;
        pCtx.strokeStyle = "#fb7185";
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, -Math.PI / 2, theta);
        pCtx.stroke();
        markPaperDirty();
      }
    });

    // Step 3: Name & Heart Subtitle
    const nameProgress = { t: 0 };
    const textStartX = x + 35, textEndX = x + w - 35, textY = y + h * 0.82;
    timeline.to(carriageGroup.position, { x: canvasXto3D(textStartX), duration: 0.18 / speed });
    timeline.to(gantryGroup.position, { z: canvasYto3D(textY), duration: 0.18 / speed }, "<");

    timeline.to(nameProgress, {
      t: 1,
      duration: 0.55 / speed,
      ease: "none",
      onStart: () => {
        pCtx.font = "bold 24px sans-serif";
        pCtx.fillStyle = "#1c1917";
        pCtx.textAlign = "center";
        pCtx.fillText("♡ " + name + " ♡", cx, textY);

        pCtx.font = "bold 16px sans-serif";
        pCtx.fillStyle = "#e11d48";
        pCtx.fillText("❤️ " + (taps || 20) + " TAPS", cx, textY + 28);
        markPaperDirty();
      },
      onUpdate: () => {
        const curX = textStartX + (textEndX - textStartX) * nameProgress.t;
        const wiggle = Math.sin(nameProgress.t * Math.PI * 18) * 10;
        setPenPosition(curX, textY + wiggle);
      }
    });

    // Step 4: Enclose card frame
    const encloseProgress = { t: 0 };
    timeline.to(carriageGroup.position, { x: canvasXto3D(x + w), duration: 0.2 / speed });
    timeline.to(gantryGroup.position, { z: canvasYto3D(y + 14), duration: 0.2 / speed }, "<");

    timeline.to(encloseProgress, {
      t: 1,
      duration: 0.65 / speed,
      ease: "none",
      onUpdate: () => {
        const t = encloseProgress.t;
        let curX, curY;
        pCtx.strokeStyle = "#1c1917";
        pCtx.lineWidth = 4;
        pCtx.beginPath();
        pCtx.moveTo(x + w, y + 14);

        if (t <= 0.4) {
          const p = t / 0.4;
          curX = x + w; curY = y + 14 + (h - 14) * p;
          pCtx.lineTo(curX, curY);
        } else if (t <= 0.8) {
          const p = (t - 0.4) / 0.4;
          pCtx.lineTo(x + w, y + h);
          curX = x + w - w * p; curY = y + h;
          pCtx.lineTo(curX, curY);
        } else {
          const p = (t - 0.8) / 0.2;
          pCtx.lineTo(x + w, y + h);
          pCtx.lineTo(x, y + h);
          curX = x; curY = y + h - (h - 14) * p;
          pCtx.lineTo(curX, curY);
        }
        setPenPosition(curX, curY);
        pCtx.stroke();
        markPaperDirty();
      },
      onComplete: () => {
        markPaperDirty(true);
      }
    });
  }

  // Draw Big Card (matching Image 5: Dek_$LM@)
  function animateBigCard(timeline, y, name, avatarImg) {
    const w = 680, h = 420;
    const x = (BUFFER_W - w) / 2;
    const cx = BUFFER_W / 2;
    const cy = y + 175;
    const r = 120;

    // Step 1: Draw First Line across the top with corner tick marks
    const topProgress = { t: 0 };
    timeline.to(carriageGroup.position, { x: canvasXto3D(x), duration: 0.25 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(y + 16), duration: 0.25 / speed, ease: "power2.out" }, "<");

    timeline.to(topProgress, {
      t: 1,
      duration: 0.4 / speed,
      ease: "none",
      onStart: () => {
        ledMat.color.setHex(0xef4444);
        penGlowLight.color.setHex(0xf43f5e);
      },
      onUpdate: () => {
        const curX = x + w * topProgress.t;
        setPenPosition(curX, y);

        pCtx.strokeStyle = "#1c1917";
        pCtx.lineWidth = 5;
        pCtx.beginPath();
        pCtx.moveTo(x, y + 16);
        pCtx.lineTo(x, y);
        pCtx.lineTo(curX, y);
        pCtx.stroke();
        markPaperDirty();
      }
    });
    // Draw right corner tick
    timeline.call(() => {
      pCtx.beginPath();
      pCtx.moveTo(x + w, y);
      pCtx.lineTo(x + w, y + 16);
      pCtx.stroke();
      markPaperDirty();
    });

    // Step 2: "then it draws down nicely" - Draw Avatar Circle with Golden Ring
    timeline.to(carriageGroup.position, { x: canvasXto3D(cx + r), duration: 0.2 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(cy), duration: 0.2 / speed, ease: "power2.out" }, "<");

    const circleProgress = { t: 0 };
    timeline.to(circleProgress, {
      t: 1,
      duration: 0.85 / speed,
      ease: "none",
      onUpdate: () => {
        const theta = 2 * Math.PI * circleProgress.t - Math.PI / 2;
        setPenPosition(cx + Math.cos(theta) * r, cy + Math.sin(theta) * r);

        pCtx.save();
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, 0, 2 * Math.PI * circleProgress.t);
        pCtx.clip();
        if (avatarImg) pCtx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
        pCtx.restore();

        pCtx.lineWidth = 5.5;
        pCtx.strokeStyle = "#d97706";
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, -Math.PI / 2, theta);
        pCtx.stroke();
        markPaperDirty();
      }
    });

    // Step 3: Write Big Name with Roses and Hearts
    const textProgress = { t: 0 };
    const textStartX = cx - 220, textEndX = cx + 220, textY = y + 365;
    timeline.to(carriageGroup.position, { x: canvasXto3D(textStartX), duration: 0.2 / speed });
    timeline.to(gantryGroup.position, { z: canvasYto3D(textY), duration: 0.2 / speed }, "<");

    timeline.to(textProgress, {
      t: 1,
      duration: 0.65 / speed,
      ease: "none",
      onStart: () => {
        pCtx.font = "bold 34px sans-serif";
        pCtx.fillStyle = "#1c1917";
        pCtx.textAlign = "center";
        pCtx.fillText("♡ 🌹 " + name + " 🌹 ♡", cx, textY);
        markPaperDirty();
      },
      onUpdate: () => {
        const curX = textStartX + (textEndX - textStartX) * textProgress.t;
        const wiggle = Math.sin(textProgress.t * Math.PI * 18) * 14;
        setPenPosition(curX, textY + wiggle);
      }
    });

    // Step 4: "then encloses the left frame" - Down right edge, across bottom, up left edge
    const encloseProgress = { t: 0 };
    timeline.to(carriageGroup.position, { x: canvasXto3D(x + w), duration: 0.2 / speed });
    timeline.to(gantryGroup.position, { z: canvasYto3D(y + 16), duration: 0.2 / speed }, "<");

    timeline.to(encloseProgress, {
      t: 1,
      duration: 0.7 / speed,
      ease: "none",
      onUpdate: () => {
        const t = encloseProgress.t;
        let curX, curY;
        pCtx.strokeStyle = "#1c1917";
        pCtx.lineWidth = 5;
        pCtx.beginPath();
        pCtx.moveTo(x + w, y + 16);

        if (t <= 0.4) {
          const p = t / 0.4;
          curX = x + w; curY = y + 16 + (h - 16) * p;
          pCtx.lineTo(curX, curY);
        } else if (t <= 0.8) {
          const p = (t - 0.4) / 0.4;
          pCtx.lineTo(x + w, y + h);
          curX = x + w - w * p; curY = y + h;
          pCtx.lineTo(curX, curY);
        } else {
          const p = (t - 0.8) / 0.2;
          pCtx.lineTo(x + w, y + h);
          pCtx.lineTo(x, y + h);
          curX = x; curY = y + h - (h - 16) * p;
          pCtx.lineTo(curX, curY);
        }
        setPenPosition(curX, curY);
        pCtx.stroke();
        markPaperDirty();
      },
      onComplete: () => {
        markPaperDirty(true);
      }
    });
  }

  // Draw Tap Supporter Card (for viewers tapping screen during warmup)
  function animateTapCard(timeline, x, y, w, h, name, avatarImg, taps) {
    const cx = x + w / 2;
    const cy = y + h * 0.42;
    const r = Math.min(w, h) * 0.27;

    // Step 1: Draw top line with rose-red corner ticks & Heart Banner
    const topProgress = { t: 0 };
    timeline.to(carriageGroup.position, { x: canvasXto3D(x), duration: 0.22 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(y + 14), duration: 0.22 / speed, ease: "power2.out" }, "<");

    timeline.to(topProgress, {
      t: 1,
      duration: 0.35 / speed,
      ease: "none",
      onStart: () => {
        ledMat.color.setHex(0xf43f5e);
        penGlowLight.color.setHex(0xf43f5e);
      },
      onUpdate: () => {
        const curX = x + w * topProgress.t;
        setPenPosition(curX, y);

        pCtx.strokeStyle = "#e11d48";
        pCtx.lineWidth = 4;
        pCtx.beginPath();
        pCtx.moveTo(x, y + 14);
        pCtx.lineTo(x, y);
        pCtx.lineTo(curX, y);
        pCtx.stroke();
        markPaperDirty();
      }
    });

    timeline.call(() => {
      pCtx.beginPath();
      pCtx.moveTo(x + w, y);
      pCtx.lineTo(x + w, y + 14);
      pCtx.stroke();

      pCtx.font = "bold 18px sans-serif";
      pCtx.fillStyle = "#e11d48";
      pCtx.textAlign = "center";
      pCtx.fillText("❤️ TAP HERO ❤️", cx, y - 8);
      markPaperDirty();
    });

    // Step 2: Draw avatar circle with cute pink border
    timeline.to(carriageGroup.position, { x: canvasXto3D(cx + r), duration: 0.22 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(cy), duration: 0.22 / speed, ease: "power2.out" }, "<");

    const circleProgress = { t: 0 };
    timeline.to(circleProgress, {
      t: 1,
      duration: 0.75 / speed,
      ease: "none",
      onUpdate: () => {
        const theta = 2 * Math.PI * circleProgress.t - Math.PI / 2;
        const curX = cx + Math.cos(theta) * r;
        const curY = cy + Math.sin(theta) * r;
        setPenPosition(curX, curY);

        pCtx.save();
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, 0, 2 * Math.PI * circleProgress.t);
        pCtx.clip();
        if (avatarImg) pCtx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
        pCtx.restore();

        pCtx.lineWidth = 4;
        pCtx.strokeStyle = "#fb7185";
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, -Math.PI / 2, theta);
        pCtx.stroke();
        markPaperDirty();
      }
    });

    // Step 3: Name & Heart Subtitle
    const nameProgress = { t: 0 };
    const textStartX = x + 35, textEndX = x + w - 35, textY = y + h * 0.82;
    timeline.to(carriageGroup.position, { x: canvasXto3D(textStartX), duration: 0.18 / speed });
    timeline.to(gantryGroup.position, { z: canvasYto3D(textY), duration: 0.18 / speed }, "<");

    timeline.to(nameProgress, {
      t: 1,
      duration: 0.55 / speed,
      ease: "none",
      onStart: () => {
        pCtx.font = "bold 24px sans-serif";
        pCtx.fillStyle = "#1c1917";
        pCtx.textAlign = "center";
        pCtx.fillText("♡ " + name + " ♡", cx, textY);

        pCtx.font = "bold 16px sans-serif";
        pCtx.fillStyle = "#e11d48";
        pCtx.fillText("❤️ " + (taps || 20) + " TAPS", cx, textY + 28);
        markPaperDirty();
      },
      onUpdate: () => {
        const curX = textStartX + (textEndX - textStartX) * nameProgress.t;
        const wiggle = Math.sin(nameProgress.t * Math.PI * 18) * 10;
        setPenPosition(curX, textY + wiggle);
      }
    });

    // Step 4: Enclose card frame
    const encloseProgress = { t: 0 };
    timeline.to(carriageGroup.position, { x: canvasXto3D(x + w), duration: 0.2 / speed });
    timeline.to(gantryGroup.position, { z: canvasYto3D(y + 14), duration: 0.2 / speed }, "<");

    timeline.to(encloseProgress, {
      t: 1,
      duration: 0.65 / speed,
      ease: "none",
      onUpdate: () => {
        const t = encloseProgress.t;
        let curX, curY;
        pCtx.strokeStyle = "#1c1917";
        pCtx.lineWidth = 4;
        pCtx.beginPath();
        pCtx.moveTo(x + w, y + 14);

        if (t <= 0.4) {
          const p = t / 0.4;
          curX = x + w; curY = y + 14 + (h - 14) * p;
          pCtx.lineTo(curX, curY);
        } else if (t <= 0.8) {
          const p = (t - 0.4) / 0.4;
          pCtx.lineTo(x + w, y + h);
          curX = x + w - w * p; curY = y + h;
          pCtx.lineTo(curX, curY);
        } else {
          const p = (t - 0.8) / 0.2;
          pCtx.lineTo(x + w, y + h);
          pCtx.lineTo(x, y + h);
          curX = x; curY = y + h - (h - 14) * p;
          pCtx.lineTo(curX, curY);
        }
        setPenPosition(curX, curY);
        pCtx.stroke();
        markPaperDirty();
      },
      onComplete: () => {
        markPaperDirty(true);
      }
    });
  }

  // Draw VIP Full-Width Banner with Royal Crown & TOP 1 Rank (matching Image 1 & Image 3)
  function animateVvipCard(timeline, y, name, avatarImg, rank = 1, rankText = "TOP 1", crownImg = null, handle = "") {
    // Proportioned matching Image 1: generous margins from paper edge, NOT edge-to-edge
    const w = 680, h = 510;
    const x = (BUFFER_W - w) / 2;
    const cx = BUFFER_W / 2;
    const cy = y + 215;
    const r = 95;
    const cleanHandle = String(handle || name || "vip").replace(/^@/, "").trim();

    // Phase 1: "first the first line" across top with corner ticks (matching Image 1)
    const topProgress = { t: 0 };
    timeline.to(carriageGroup.position, { x: canvasXto3D(x), duration: 0.25 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(y + 18), duration: 0.25 / speed, ease: "power2.out" }, "<");

    timeline.to(topProgress, {
      t: 1,
      duration: 0.42 / speed,
      ease: "none",
      onStart: () => {
        ledMat.color.setHex(0xef4444);
        penGlowLight.color.setHex(0xf43f5e);
      },
      onUpdate: () => {
        const curX = x + w * topProgress.t;
        setPenPosition(curX, y);

        pCtx.strokeStyle = "#1c1917";
        pCtx.lineWidth = 4.5;
        pCtx.beginPath();
        pCtx.moveTo(x, y + 18);
        pCtx.lineTo(x, y);
        pCtx.lineTo(curX, y);
        pCtx.stroke();
        markPaperDirty();
      }
    });
    timeline.call(() => {
      pCtx.beginPath();
      pCtx.moveTo(x + w, y);
      pCtx.lineTo(x + w, y + 18);
      pCtx.stroke();
      markPaperDirty();
    });

    // Phase 2: "then it draws down nicely"
    // 2A: Move to Avatar Circle Perimeter & sketch user photo
    timeline.to(carriageGroup.position, { x: canvasXto3D(cx + r), duration: 0.2 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(cy), duration: 0.2 / speed, ease: "power2.out" }, "<");

    const circleProgress = { t: 0 };
    timeline.to(circleProgress, {
      t: 1,
      duration: 0.75 / speed,
      ease: "none",
      onUpdate: () => {
        const theta = 2 * Math.PI * circleProgress.t - Math.PI / 2;
        setPenPosition(cx + Math.cos(theta) * r, cy + Math.sin(theta) * r);

        pCtx.save();
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, 0, 2 * Math.PI * circleProgress.t);
        pCtx.clip();
        if (avatarImg) pCtx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
        pCtx.restore();

        markPaperDirty();
      }
    });

    // 2B: Move pen up to Crown Peak & Flaming Wings
    timeline.to(carriageGroup.position, { x: canvasXto3D(cx), duration: 0.2 / speed, ease: "power2.out" });
    timeline.to(gantryGroup.position, { z: canvasYto3D(cy - r - 55), duration: 0.2 / speed, ease: "power2.out" }, "<");

    // Animate pen tracing royal crown and flaming wings
    const crownProgress = { t: 0 };
    timeline.to(crownProgress, {
      t: 1,
      duration: 0.65 / speed,
      ease: "none",
      onUpdate: () => {
        const a = crownProgress.t * Math.PI * 2;
        const curX = cx + Math.sin(a) * (r + 42);
        const curY = (cy - r - 30) + Math.cos(a) * 22;
        setPenPosition(curX, curY);
      }
    });

    // Draw VIP Royal Crown, Flaming Wings, and TOP 1 Plaque
    timeline.call(() => {
      if (crownImg) {
        const scale = (r * 2) / 196;
        const sw = 500 * scale;
        const sh = 380 * scale;
        pCtx.drawImage(crownImg, cx - 250 * scale, cy - 210 * scale, sw, sh);
      } else {
        drawVipCrownOrnament(pCtx, cx, cy, r, rankText);
      }
      markPaperDirty(true);
    });

    // 2C: Pen traces lower laurel crest under avatar (where pen is in Image 1)
    timeline.to(carriageGroup.position, { x: canvasXto3D(cx - 50), duration: 0.18 / speed });
    timeline.to(gantryGroup.position, { z: canvasYto3D(cy + r + 15), duration: 0.18 / speed }, "<");

    const laurelProgress = { t: 0 };
    timeline.to(laurelProgress, {
      t: 1,
      duration: 0.4 / speed,
      ease: "none",
      onUpdate: () => {
        const curX = cx - 50 + 100 * laurelProgress.t;
        setPenPosition(curX, cy + r + 15 + Math.sin(laurelProgress.t * Math.PI) * 6);
      }
    });

    // 2D: Cursive "thank you! 💖", bold User Name, and "FOLLOW @username" callout
    timeline.call(() => {
      // Left script (explicit left alignment inside card margin so it never crosses left border)
      pCtx.save();
      pCtx.translate(x + 36, cy + 145);
      pCtx.rotate(-0.06);
      pCtx.font = "italic bold 32px cursive, sans-serif";
      pCtx.fillStyle = "#dc2626";
      pCtx.textAlign = "left";
      pCtx.fillText("thank you! 💖", 0, 0);
      pCtx.restore();

      // User name
      pCtx.font = "900 35px sans-serif";
      pCtx.fillStyle = "#1c1917";
      pCtx.textAlign = "center";
      pCtx.fillText("♡ " + name + " ♡", cx, cy + 195);

      // Printed "FOLLOW @username" Shoutout Banner at bottom of VIP card
      pCtx.font = "900 23px 'Arial Black', Impact, sans-serif";
      pCtx.fillStyle = "#b91c1c";
      pCtx.textAlign = "center";
      pCtx.fillText(`★ FOLLOW @${cleanHandle} ★`, cx, cy + 232);
      markPaperDirty(true);
    });

    // Phase 3: "then encloses the left frame" - Down right edge, across bottom, up left edge
    const encloseProgress = { t: 0 };
    timeline.to(carriageGroup.position, { x: canvasXto3D(x + w), duration: 0.22 / speed });
    timeline.to(gantryGroup.position, { z: canvasYto3D(y + 18), duration: 0.22 / speed }, "<");

    timeline.to(encloseProgress, {
      t: 1,
      duration: 0.72 / speed,
      ease: "none",
      onUpdate: () => {
        const t = encloseProgress.t;
        let curX, curY;
        pCtx.strokeStyle = "#1c1917";
        pCtx.lineWidth = 4.5;
        pCtx.beginPath();
        pCtx.moveTo(x + w, y + 18);

        if (t <= 0.4) {
          const p = t / 0.4;
          curX = x + w; curY = y + 18 + (h - 18) * p;
          pCtx.lineTo(curX, curY);
        } else if (t <= 0.8) {
          const p = (t - 0.4) / 0.4;
          pCtx.lineTo(x + w, y + h);
          curX = x + w - w * p; curY = y + h;
          pCtx.lineTo(curX, curY);
        } else {
          const p = (t - 0.8) / 0.2;
          pCtx.lineTo(x + w, y + h);
          pCtx.lineTo(x, y + h);
          curX = x; curY = y + h - (h - 18) * p;
          pCtx.lineTo(curX, curY);
        }
        setPenPosition(curX, curY);
        pCtx.stroke();
        markPaperDirty();
      },
      onComplete: () => {
        markPaperDirty(true);
      }
    });

    // Phase 4: Pen returns home before physical mechanical stamp drops
    timeline.to(carriageGroup.position, { x: 0, duration: 0.28 / speed });
    timeline.to(gantryGroup.position, { z: -5.15, duration: 0.28 / speed }, "<");

    // Physical Stamp Mechanism Drop, Rebound & Complete Retraction out of sight
    timeline.call(() => {
      stampGroup.position.set(canvasXto3D(x + w - 100), 22.0, canvasYto3D(cy + 145));
      stampGroup.scale.set(1, 1, 1);
      stampGroup.visible = true;
    });
    timeline.to(stampGroup.position, { y: 0.45, duration: 0.28 / speed, ease: "power3.in" });
    timeline.to(stampGroup.scale, { y: 0.88, duration: 0.05 / speed });
    timeline.call(() => {
      // Stamp Red [ VIP ] Impression neatly inside right card border
      pCtx.save();
      pCtx.translate(x + w - 165, cy + 125);
      pCtx.rotate(0.04);
      pCtx.strokeStyle = "#dc2626";
      pCtx.lineWidth = 4;
      pCtx.strokeRect(0, 0, 130, 48);
      pCtx.font = "900 28px 'Impact', 'Arial Black', sans-serif";
      pCtx.fillStyle = "#dc2626";
      pCtx.textAlign = "center";
      pCtx.fillText("VIP", 65, 34);
      pCtx.restore();
      markPaperDirty(true);
    });
    timeline.to(stampGroup.scale, { y: 1.0, duration: 0.08 / speed });
    timeline.to(stampGroup.position, { y: 1.2, duration: 0.12 / speed, ease: "power1.out" });
    // Shoot completely back up out of the camera view into the sky
    timeline.to(stampGroup.position, { y: 25.0, duration: 0.32 / speed, ease: "power2.in" });
    timeline.call(() => {
      stampGroup.visible = false;
    });
  }

  // =========================================================================
  // 6. PRINT QUEUE ENGINE & TIKTOK RANK TRACKER
  // =========================================================================
  const queue = [];
  const tapQueue = [];
  let lastGiftTimestamp = 0;
  let isPrinting = false;
  const userCoins = {};
  const chkDrawTaps = $("chkDrawTaps");

  // Track session leaderboard to detect TOP 1, TOP 2, TOP 3 gifters (matching Image 1)
  function trackUserRank(name, coins) {
    if (!name) return 1;
    userCoins[name] = (userCoins[name] || 0) + (coins || 1);
    const sorted = Object.keys(userCoins).sort((a, b) => userCoins[b] - userCoins[a]);
    return sorted.indexOf(name) + 1;
  }

  function isVvip(g) {
    if (g.vvip || g.giftType === "vvip") return true;
    if ((g.coins || 0) >= 99 || (g.unitCoins || 0) >= 99) return true;
    if (g.count >= 100) return true;
    const big = [
      "galaxy", "lion", "universe", "tiktok universe", "fireworks", "dragon", "rocket",
      "castle", "whale", "top 1", "phoenix", "legendary", "money gun", "corgi",
      "sports car", "interstellar", "falcon", "planet", "yacht", "private jet",
      "pegasus", "rosa nebula", "sunset speedway", "train", "motorcycle", "helicopter",
      "confetti", "hand hearts", "hand heart", "super", "leon the kitten"
    ];
    return big.includes(String(g.gift || "").toLowerCase());
  }

  function isBig(g) {
    if (isVvip(g)) return false;
    if (g.giftType === "big") return true;
    if ((g.coins || 0) >= 20 || (g.unitCoins || 0) >= 20) return true;
    if (g.count >= 20) return true;
    const big = ["doughnut", "donut", "hat", "cap", "sunglasses", "big", "perfume", "butterfly", "rosa"];
    return big.includes(String(g.gift || "").toLowerCase());
  }

  let lastRowWasPair = false; // Alternates 1-centered card row and 2-card side-by-side pair row like reference "v"

  function enqueue(g) {
    lastGiftTimestamp = Date.now();
    if (queue.length > 400) queue.shift();
    if (!g.avatar) {
      const mock = getNextAvatar();
      g.avatar = mock.src;
      if (!g.name) g.name = mock.name;
      if (!g.handle) g.handle = mock.handle;
    }
    if (!g.handle) {
      g.handle = String(g.name || "user").toLowerCase().replace(/\s+/g, "_");
    }
    g.isVvip = isVvip(g);
    g.isBig = isBig(g);

    // Calculate TikTok chat rank by true coin value (TOP 1, TOP 2, TOP 3, etc.)
    const coinVal = g.coins || (g.isVvip ? 1000 : (g.isBig ? 30 : (g.count || 1)));
    g.coins = coinVal;
    const trackedRank = trackUserRank(g.handle || g.name, coinVal);
    if (!g.rank) g.rank = trackedRank;
    g.rankText = `TOP ${g.rank}`;

    // If this exact user already has a standard gift waiting in the queue, merge into it
    // instead of printing duplicate identical cards of the same person back-to-back!
    if (!g.isVvip && !g.isBig && !g.forcePair && !g.forceSingle) {
      const existing = queue.find(item => !item.isVvip && !item.isBig && (item.handle === g.handle || item.name === g.name));
      if (existing) {
        existing.count = (existing.count || 1) + (g.count || 1);
        existing.coins = (existing.coins || 1) + coinVal;
        if (existing.coins >= 99) existing.isVvip = true;
        else if (existing.coins >= 20) existing.isBig = true;
        return;
      }
    }

    queue.push(g);
    showPill(`${g.name || "Viewer"} (${g.gift || "Gift"}) - added to the draw queue.`);
    processQueue();
  }

  function enqueueTap(t) {
    if (chkDrawTaps && !chkDrawTaps.checked) return;
    // Strictly prioritize gifters: if gifts are waiting or a gift arrived within 20s, suppress tappers!
    if (queue.length > 0 || (Date.now() - lastGiftTimestamp < 20000)) {
      return;
    }
    if (!t.avatar) {
      const mock = getNextAvatar();
      t.avatar = mock.src;
      if (!t.name) t.name = mock.name;
      if (!t.handle) t.handle = mock.handle;
    }
    if (!t.handle) {
      t.handle = String(t.name || "user").toLowerCase().replace(/\s+/g, "_");
    }
    const existing = tapQueue.find(item => item.handle === t.handle || item.name === t.name);
    if (existing) {
      existing.taps = Math.max(existing.taps || 0, t.taps || 0);
      return;
    }
    if (tapQueue.length > 30) tapQueue.shift();
    tapQueue.push(t);
    showPill(`❤️ ${t.name || "Viewer"} tapped ${t.taps || 20} likes!`);
    processQueue();
  }

  async function processQueue() {
    if (isPrinting) return;
    const hasGifts = queue.length > 0;
    const canPrintTap = tapQueue.length > 0 && (Date.now() - lastGiftTimestamp > 15000) && (!chkDrawTaps || chkDrawTaps.checked);
    if (!hasGifts && !canPrintTap) return;

    isPrinting = true;

    try {
      while (true) {
        let isTap = false;
        let g1 = null;

        // GIFTS HAVE ABSOLUTE TOP PRIORITY!
        if (queue.length > 0) {
          g1 = queue.shift();
          isTap = false;
        } else if (tapQueue.length > 0 && (Date.now() - lastGiftTimestamp > 15000) && (!chkDrawTaps || chkDrawTaps.checked)) {
          // No gifts queued and no gifts in last 15s (e.g. beginning of stream warmup)
          g1 = tapQueue.shift();
          isTap = true;
        } else {
          break;
        }

        const backlog = queue.length;
        // Adaptive speed acceleration when backlog accumulates to prevent stream lag
        const speedMultiplier = backlog > 8 ? 2.5 : (backlog > 4 ? 1.8 : (backlog > 1 ? 1.3 : 1.0));
        const effectiveSpeed = speed * speedMultiplier;

        const tl = gsap.timeline({ onUpdate: () => markSceneDirty(true) });

        try {
          if (isTap) {
            lastRowWasPair = false;
            showPill(`❤️ TAP HERO: ${g1.name} — ${g1.taps || 50} TAPS!`);
            const av1 = await loadImg(g1.avatar, g1.name);
            scrollBuffer(385);
            animateTapCard(tl, 294, 50, 435, 340, g1.name, av1, g1.taps || 50);
          } else if (g1.isVvip) {
            lastRowWasPair = false;
            showPill(`👑 ${g1.rankText || 'TOP 1'}: ${g1.name} — FOLLOW @${String(g1.handle || g1.name).replace(/^@/, '')}`);
            const [av1, crownImg] = await Promise.all([
              loadImg(g1.avatar, g1.name),
              loadImg("assets/vip_crown_top1.svg", "VIP Crown")
            ]);
            showVipBanner(g1, av1);
            // Scroll buffer down by 565px and start at y = 65 so parked carriage never covers the TOP 1 crown
            scrollBuffer(565);
            animateVvipCard(tl, 65, g1.name, av1, g1.rank, g1.rankText || "TOP 1", crownImg, g1.handle || g1.name);
          } else if (g1.isBig) {
            lastRowWasPair = false;
            showPill(`🍩 BIG GIFT: ${g1.name} — FOLLOW @${String(g1.handle || g1.name).replace(/^@/, '')}`);
            const av1 = await loadImg(g1.avatar, g1.name);
            showVipBanner(g1, av1);
            // Scroll buffer down by 465px for Big Card (golden avatar ring)
            scrollBuffer(465);
            animateBigCard(tl, 55, g1.name, av1);
          } else {
            // Standard gifts: Staggered 1-Centered / 2-Pair alternating layout matching reference "v"
            // Never pair the same person with themselves on a 2-card row
            const partnerIdx = (!g1.forceSingle && (g1.forcePair || !lastRowWasPair || backlog > 3))
              ? queue.findIndex(item => !item.isVvip && !item.isBig && !item.forceSingle && (g1.forcePair || (item.handle !== g1.handle && item.name !== g1.name)))
              : -1;

            if (partnerIdx !== -1) {
              const g2 = queue.splice(partnerIdx, 1)[0];
              lastRowWasPair = true;
              showPill(`🌹 Print x2: ${g1.name} & ${g2.name}`);
              const [av1, av2] = await Promise.all([loadImg(g1.avatar, g1.name), loadImg(g2.avatar, g2.name)]);
              scrollBuffer(385);
              animateStandardCard(tl, 50, 50, 435, 340, g1.name, av1);
              animateStandardCard(tl, 539, 50, 435, 340, g2.name, av2);
            } else {
              // Single centered card row (matching top & bottom cards in reference "v")
              lastRowWasPair = false;
              showPill(`🌹 Print: ${g1.name}`);
              const av1 = await loadImg(g1.avatar, g1.name);
              scrollBuffer(385);
              animateStandardCard(tl, 294, 50, 435, 340, g1.name, av1);
            }
          }

          // Return home tucked close to the top beam (z = -5.15) so the printed card below is 100% clear
          tl.to(carriageGroup.position, { x: 0, duration: 0.25 / effectiveSpeed });
          tl.to(gantryGroup.position, { z: -5.15, duration: 0.25 / effectiveSpeed }, "<");
          tl.call(() => {
            ledMat.color.setHex(0x38bdf8);
            penGlowLight.color.setHex(0x38bdf8);
            markSceneDirty(true);
          });

          await tl;
        } catch (cardErr) {
          console.error("Card drawing error (skipping gracefully):", cardErr);
        }
      }
    } catch (queueErr) {
      console.error("Queue loop error:", queueErr);
    } finally {
      isPrinting = false;
      hidePill();
    }
  }

  // Clear Paper Action
  function clearPaper() {
    queue.length = 0;
    tapQueue.length = 0;
    lastRowWasPair = false;
    hideVipBanner();
    fillPaperBase(pCtx, 0, BUFFER_H);
    markPaperDirty(true);
    gsap.to(carriageGroup.position, { x: 0, duration: 0.3, onUpdate: () => markSceneDirty(true) });
    gsap.to(gantryGroup.position, { z: -4.5, duration: 0.3, onUpdate: () => markSceneDirty(true) });
    ledMat.color.setHex(0x38bdf8);
    penGlowLight.color.setHex(0x38bdf8);
    stampGroup.visible = false;
    stampGroup.position.set(2.2, 25.0, -1.8);
    markSceneDirty(true);
    hidePill();
  }

  // =========================================================================
  // 7. WEBSOCKET & BACKEND CONNECTOR (Compatible with server.py)
  // =========================================================================
  const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.hostname + (location.port ? ":8765" : ":8765");
  let ws = null, retry = 1000, tiktok = "offline";
  const elDot = $("dot");
  const elStatus = $("statusText");
  const elUser = $("user");
  const btnConn = $("btnConn");

  function setStatus(local, text) {
    if (elDot) elDot.className = "dot " + (local ? (tiktok === "connected" ? "ok" : "warn") : "");
    if (elStatus) elStatus.textContent = text;
    if (btnConn) btnConn.textContent = tiktok === "offline" ? "Start" : "Stop";
  }

  function openWs() {
    try { ws = new WebSocket(WS_URL); } catch (e) { return setTimeout(openWs, retry); }
    ws.onopen = () => {
      retry = 1000;
      setStatus(true, "Local server connected");
      const urlUser = (q.get("user") || "").trim().replace(/^@/, "");
      if (urlUser) {
        if (elUser) elUser.value = urlUser;
        if (tiktok === "offline") ws.send(JSON.stringify({ type: "connect", username: urlUser }));
      }
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === "gift") enqueue(m);
      else if (m.type === "tap") enqueueTap(m);
      else if (m.type === "status") {
        tiktok = m.tiktok;
        setStatus(true, tiktok === "connected" ? `LIVE: @${m.user}` : m.msg || "TikTok idle");
      }
    };
    ws.onclose = () => {
      tiktok = "offline";
      setStatus(false, "No server - retrying…");
      setTimeout(openWs, retry);
      retry = Math.min(retry * 1.5, 8000);
    };
    ws.onerror = () => ws.close();
  }

  if (btnConn) {
    btnConn.onclick = () => {
      if (!ws || ws.readyState !== 1) {
        setStatus(false, "Local server not running - start server.py first");
        return;
      }
      if (tiktok === "offline") {
        const u = elUser.value.trim().replace(/^@/, "");
        if (!u) return elUser.focus();
        ws.send(JSON.stringify({ type: "connect", username: u }));
      } else ws.send(JSON.stringify({ type: "disconnect" }));
    };
  }

  // =========================================================================
  // 8. CONTROLS, BUTTONS & SPLIT MODE
  // =========================================================================
  const btnToggleControls = $("btnToggleControls");
  const controlsEl = $("controls");
  if (btnToggleControls && controlsEl) {
    btnToggleControls.onclick = () => {
      controlsEl.classList.toggle("collapsed");
    };
  }

  if ($("btnTestPair")) {
    $("btnTestPair").onclick = () => {
      const mock1 = getNextAvatar();
      const mock2 = getNextAvatar();
      enqueue({ name: mock1.name, avatar: mock1.src, gift: "Rose", count: 1, forcePair: true });
      enqueue({ name: mock2.name, avatar: mock2.src, gift: "Rose", count: 1, forcePair: true });
    };
  }
  if ($("btnTestSingle")) {
    $("btnTestSingle").onclick = () => {
      const mock = getNextAvatar();
      enqueue({ name: mock.name, avatar: mock.src, gift: "Rose", count: 1, forceSingle: true });
    };
  }
  if ($("btnTest")) {
    $("btnTest").onclick = () => {
      const mock = getNextAvatar();
      enqueue({ name: mock.name, avatar: mock.src, gift: "Rose", count: 1 });
    };
  }
  if ($("btnTestBig")) {
    $("btnTestBig").onclick = () => {
      enqueue({ name: "Dek_$LM@", handle: "dek_slm", avatar: "avatars/dek_slm.jpg", gift: "Doughnut", count: 1, coins: 30, giftType: "big" });
    };
  }
  if ($("btnVvip")) {
    $("btnVvip").onclick = () => {
      enqueue({ name: "Simba Fx", handle: "simba_fx", avatar: "avatars/simba_fx.jpg", gift: "Galaxy", count: 1, coins: 1000, vvip: true });
    };
  }
  if ($("btnTop1")) {
    $("btnTop1").onclick = () => {
      enqueue({ name: "Ronaldo", handle: "cristiano_ronaldo", avatar: "avatars/top1_man.jpg", gift: "TikTok Universe", count: 1, coins: 44999, vvip: true, rank: 1, rankText: "TOP 1" });
    };
  }
  if ($("btnTestTap")) {
    $("btnTestTap").onclick = () => {
      const mock = getNextAvatar();
      enqueueTap({ name: mock.name, handle: mock.handle, avatar: mock.src, taps: 50, isTap: true });
    };
  }
  if (q.get("demo") === "top1") {
    setTimeout(() => {
      if ($("btnTop1")) $("btnTop1").click();
    }, 500);
  }
  if ($("btnClear")) $("btnClear").onclick = clearPaper;

  // Split Video & Background Music Controls (only loads/decodes video when Split Mode is active)
  const musicInput = $("musicInput");
  const btnPickMusic = $("btnPickMusic");
  const bgMusic = new Audio();
  bgMusic.loop = true;
  bgMusic.volume = 0.45;
  if (q.get("music")) {
    bgMusic.src = q.get("music");
    bgMusic.play().catch(() => {});
  }
  if (q.get("video") && robloxVideo) {
    robloxVideo.dataset.src = q.get("video");
  }

  if (robloxVideo) {
    robloxVideo.onplaying = () => { if (robloxPlaceholder) robloxPlaceholder.style.display = "none"; };
  }
  function applySplit(val) {
    isSplit = !!val;
    document.body.classList.toggle("split", isSplit);
    if (chkSplit) chkSplit.checked = isSplit;
    if (robloxVideo) {
      if (isSplit) {
        if (!robloxVideo.getAttribute("src") && robloxVideo.dataset.src) {
          robloxVideo.src = robloxVideo.dataset.src;
        }
        robloxVideo.play().catch(() => { robloxVideo.muted = true; robloxVideo.play().catch(() => {}); });
      } else {
        robloxVideo.pause();
      }
    }
    setTimeout(resizeRenderer, 50);
  }
  if (chkSplit) chkSplit.onchange = () => applySplit(chkSplit.checked);

  // Choose Custom Video (Roblox gameplay, Campfire, etc.)
  if (btnPickVideo && videoInput) btnPickVideo.onclick = () => videoInput.click();
  if (btnBrowseVideo && videoInput) btnBrowseVideo.onclick = () => videoInput.click();
  if (videoInput && robloxVideo) {
    videoInput.onchange = () => {
      const file = videoInput.files && videoInput.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      robloxVideo.src = url;
      robloxVideo.dataset.src = url;
      if (robloxPlaceholder) robloxPlaceholder.style.display = "none";
      applySplit(true);
      robloxVideo.play().catch(() => {});
    };
  }

  // Choose Background Music (MP3 / WAV / audio loop)
  if (btnPickMusic && musicInput) btnPickMusic.onclick = () => musicInput.click();
  if (musicInput) {
    musicInput.onchange = () => {
      const file = musicInput.files && musicInput.files[0];
      if (!file) return;
      bgMusic.src = URL.createObjectURL(file);
      bgMusic.muted = false;
      bgMusic.play().catch(() => {});
      if (btnMuteVideo) btnMuteVideo.textContent = "🔊 Sound";
      if (btnPickMusic) btnPickMusic.textContent = "🎵 Playing";
    };
  }

  // Mute / Unmute Toggle (controls both Split Video sound and Background Music)
  if (btnMuteVideo) {
    btnMuteVideo.onclick = () => {
      const currentlyMuted = robloxVideo ? robloxVideo.muted : bgMusic.muted;
      const nextMuted = !currentlyMuted;
      if (robloxVideo) robloxVideo.muted = nextMuted;
      bgMusic.muted = nextMuted;
      if (!nextMuted && bgMusic.src && bgMusic.paused) bgMusic.play().catch(() => {});
      btnMuteVideo.textContent = nextMuted ? "🔇 Muted" : "🔊 Sound";
    };
  }

  applySplit(isSplit);

  // =========================================================================
  // 9. ON-DEMAND ANIMATION LOOP & INIT (0% GPU/CPU when idle, 30 FPS when printing)
  // =========================================================================
  let lastFrameTime = 0;
  const targetFrameInterval = 1000 / 30; // 30 FPS cap during active printing (matches OBS stream FPS)
  function animate(timestamp = 0) {
    requestAnimationFrame(animate);
    if (document.hidden) return;
    if (timestamp - lastFrameTime < targetFrameInterval - 1) return;

    // Throttled canvas texture upload: max ~20 FPS texture bus transfer
    if (paperDirty && (timestamp - lastTexUpload >= 48)) {
      paperTexture.needsUpdate = true;
      paperDirty = false;
      sceneDirty = true;
      lastTexUpload = timestamp;
    }

    // Zero-load idle: skip WebGL rendering entirely when nothing in the scene has changed
    if (!sceneDirty && !isPrinting) return;

    lastFrameTime = timestamp;
    sceneDirty = false;
    renderer.render(scene, camera);
  }

  resizeRenderer();
  animate();
  openWs();

  // Populate initial batch of cards on load
  if (q.get("empty") !== "1") {
    (async () => {
      if (q.has("vip") || q.has("top1")) {
        // Render VIP TOP 1 Card mid-print (matching Reference 1: media_1794389722400_8825aeff.png)
        const [ronaldo, crownSvg, couple, ever2, lami] = await Promise.all([
          loadImg("avatars/top1_man.jpg", "Ronaldo"),
          loadImg("assets/vip_crown_top1.svg", "VIP Crown"),
          loadImg("avatars/couple.jpg", "#evermendoza.07"),
          loadImg("avatars/evermendoza2.jpg", "#evermendoza.07"),
          loadImg("avatars/lami.jpg", "Lami¿?")
        ]);

        const w = 680, h = 510;
        const x = (BUFFER_W - w) / 2;
        const cx = BUFFER_W / 2;
        const y = 145;
        const cy = y + 215;
        const r = 95;

        // 1. Top line with corner ticks (generous margins, width = 680 on 1024 buffer)
        pCtx.strokeStyle = "#1c1917";
        pCtx.lineWidth = 4.5;
        pCtx.beginPath();
        pCtx.moveTo(x, y + 18);
        pCtx.lineTo(x, y);
        pCtx.lineTo(x + w, y);
        pCtx.lineTo(x + w, y + 18);
        pCtx.stroke();

        // 2. Avatar Photo
        pCtx.save();
        pCtx.beginPath();
        pCtx.arc(cx, cy, r, 0, Math.PI * 2);
        pCtx.clip();
        if (ronaldo) pCtx.drawImage(ronaldo, cx - r, cy - r, r * 2, r * 2);
        pCtx.restore();

        // 3. Ornate Royal Crown, Flaming Wings, and TOP 1 Plaque
        if (crownSvg) {
          const scale = (r * 2) / 196;
          const sw = 500 * scale;
          const sh = 380 * scale;
          pCtx.drawImage(crownSvg, cx - 250 * scale, cy - 210 * scale, sw, sh);
        } else {
          drawVipCrownOrnament(pCtx, cx, cy, r, "TOP 1");
        }

        // If completed mode requested (?vip=done), also enclose frame and stamp VIP
        if (q.get("vip") === "done") {
          // Cursive script
          pCtx.save();
          pCtx.translate(x + 36, cy + 145);
          pCtx.rotate(-0.06);
          pCtx.font = "italic bold 32px cursive, sans-serif";
          pCtx.fillStyle = "#dc2626";
          pCtx.textAlign = "left";
          pCtx.fillText("thank you! 💖", 0, 0);
          pCtx.restore();

          // User name
          pCtx.font = "900 36px sans-serif";
          pCtx.fillStyle = "#1c1917";
          pCtx.textAlign = "center";
          pCtx.fillText("♡ Ronaldo ♡", cx, cy + 205);

          // Enclose frame
          pCtx.strokeStyle = "#1c1917";
          pCtx.lineWidth = 4.5;
          pCtx.strokeRect(x, y, w, h);

          // Red VIP Stamp
          pCtx.save();
          pCtx.translate(x + w - 165, cy + 125);
          pCtx.rotate(0.04);
          pCtx.strokeStyle = "#dc2626";
          pCtx.lineWidth = 4;
          pCtx.strokeRect(0, 0, 130, 48);
          pCtx.font = "900 28px 'Impact', 'Arial Black', sans-serif";
          pCtx.fillStyle = "#dc2626";
          pCtx.textAlign = "center";
          pCtx.fillText("VIP", 65, 34);
          pCtx.restore();
        }

        // Background rows below (scrolled down)
        const y2 = y + h + 120;
        const wStd = 435, hStd = 340;
        const x2L = 50, x2R = 539;
        pCtx.strokeStyle = "#1c1917";
        pCtx.lineWidth = 4;
        pCtx.strokeRect(x2L, y2, wStd, hStd);
        pCtx.strokeRect(x2R, y2, wStd, hStd);

        markPaperDirty(true);
        // Park carriage right at the laurel crest (cx, cy + r + 15) exactly matching Reference 1!
        setPenPosition(cx, cy + r + 15);
        ledMat.color.setHex(0xef4444);
        penGlowLight.color.setHex(0xf43f5e);
        return;
      }

      const [ever, couple, ever2, lami] = await Promise.all([
        loadImg("avatars/evermendoza.jpg", "#evermendoza.07"),
        loadImg("avatars/couple.jpg", "#evermendoza.07"),
        loadImg("avatars/evermendoza2.jpg", "#evermendoza.07"),
        loadImg("avatars/lami.jpg", "Lami¿?")
      ]);

      // Row 1 (Top centered card matching "v"): #evermendoza.07
      const w = 435, h = 340;
      const x1 = (BUFFER_W - w) / 2, y1 = 170;
      pCtx.strokeStyle = "#1c1917";
      pCtx.lineWidth = 4;
      pCtx.strokeRect(x1, y1, w, h);

      const cx1 = x1 + w / 2, cy1 = y1 + h * 0.42, r1 = 92;
      pCtx.save();
      pCtx.beginPath();
      pCtx.arc(cx1, cy1, r1, 0, Math.PI * 2);
      pCtx.clip();
      if (ever) pCtx.drawImage(ever, cx1 - r1, cy1 - r1, r1 * 2, r1 * 2);
      pCtx.restore();

      pCtx.beginPath();
      pCtx.arc(cx1, cy1, r1, 0, Math.PI * 2);
      pCtx.strokeStyle = "#1c1917";
      pCtx.lineWidth = 4;
      pCtx.stroke();

      pCtx.font = "bold 25px sans-serif";
      pCtx.fillStyle = "#1c1917";
      pCtx.textAlign = "center";
      pCtx.fillText("♡ #evermendoza.07 ♡", cx1, y1 + h * 0.88);

      // Row 2 (Two cards side-by-side matching "v"): Couple (left) & #evermendoza.07 (right)
      const y2 = 550;
      // Left Card
      const x2L = 50;
      pCtx.strokeStyle = "#1c1917";
      pCtx.lineWidth = 4;
      pCtx.strokeRect(x2L, y2, w, h);

      const cx2L = x2L + w / 2, cy2L = y2 + h * 0.42;
      pCtx.save();
      pCtx.beginPath();
      pCtx.arc(cx2L, cy2L, r1, 0, Math.PI * 2);
      pCtx.clip();
      if (couple) pCtx.drawImage(couple, cx2L - r1, cy2L - r1, r1 * 2, r1 * 2);
      pCtx.restore();

      pCtx.beginPath();
      pCtx.arc(cx2L, cy2L, r1, 0, Math.PI * 2);
      pCtx.strokeStyle = "#1c1917";
      pCtx.lineWidth = 4;
      pCtx.stroke();

      pCtx.font = "bold 25px sans-serif";
      pCtx.fillStyle = "#1c1917";
      pCtx.textAlign = "center";
      pCtx.fillText("♡ 🌹 🌹 ♡", cx2L, y2 + h * 0.88);

      // Right Card
      const x2R = 539;
      pCtx.strokeStyle = "#1c1917";
      pCtx.lineWidth = 4;
      pCtx.strokeRect(x2R, y2, w, h);

      const cx2R = x2R + w / 2, cy2R = y2 + h * 0.42;
      pCtx.save();
      pCtx.beginPath();
      pCtx.arc(cx2R, cy2R, r1, 0, Math.PI * 2);
      pCtx.clip();
      if (ever2) pCtx.drawImage(ever2, cx2R - r1, cy2R - r1, r1 * 2, r1 * 2);
      pCtx.restore();

      pCtx.beginPath();
      pCtx.arc(cx2R, cy2R, r1, 0, Math.PI * 2);
      pCtx.strokeStyle = "#1c1917";
      pCtx.lineWidth = 4;
      pCtx.stroke();

      pCtx.font = "bold 25px sans-serif";
      pCtx.fillStyle = "#1c1917";
      pCtx.textAlign = "center";
      pCtx.fillText("♡ #evermendoza.07 ♡", cx2R, y2 + h * 0.88);

      // Row 3 (Rolling over the curved front edge matching "v"): Lami¿?
      const y3 = 930;
      const x3 = (BUFFER_W - w) / 2;
      pCtx.strokeStyle = "#1c1917";
      pCtx.lineWidth = 4;
      pCtx.strokeRect(x3, y3, w, h);

      const cx3 = x3 + w / 2, cy3 = y3 + h * 0.42;
      pCtx.save();
      pCtx.beginPath();
      pCtx.arc(cx3, cy3, r1, 0, Math.PI * 2);
      pCtx.clip();
      if (lami) pCtx.drawImage(lami, cx3 - r1, cy3 - r1, r1 * 2, r1 * 2);
      pCtx.restore();

      pCtx.beginPath();
      pCtx.arc(cx3, cy3, r1, 0, Math.PI * 2);
      pCtx.strokeStyle = "#1c1917";
      pCtx.lineWidth = 4;
      pCtx.stroke();

      pCtx.font = "bold 25px sans-serif";
      pCtx.fillStyle = "#1c1917";
      pCtx.textAlign = "center";
      pCtx.fillText("♡ Lami¿? 🌹 🍒 ♡", cx3, y3 + h * 0.88);

      markPaperDirty(true);
      // Park carriage neatly on the top edge of Card 1 hovering above the avatar (matching reference "v")
      setPenPosition(cx1, y1 + 15);
      ledMat.color.setHex(0xef4444);
      penGlowLight.color.setHex(0xf43f5e);
    })();
  }
})();
