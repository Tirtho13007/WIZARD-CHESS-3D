import * as THREE_NS from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** @type {any} */
const THREE = THREE_NS;
const SkeletonUtils = { clone: cloneSkeleton };

export function initWizardChess() {
    // =========================================================================
    // Constants & Board Coordinates
    // =========================================================================
    const PIECE_TYPES = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
    const PIECE_VALUES = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000 };
    const BOARD_SQ_SIZE = 0.34;
    const BOARD_SURFACE_Y = 0.775;

    function boardToWorld(r, c) {
      return new THREE.Vector3(
        (c - 3.5) * BOARD_SQ_SIZE,
        BOARD_SURFACE_Y,
        (r - 3.5) * BOARD_SQ_SIZE
      );
    }

    function easeInOutCubic(x) {
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }

    function easeOutCubic(x) {
      return 1 - Math.pow(1 - x, 3);
    }

    // =========================================================================
    // Scene, Camera, Renderer, and Cathedral Lighting
    // =========================================================================
    const container = document.getElementById('canvas-container') || document.getElementById('viewport-container');
    if (container) container.innerHTML = '';
    const isAutomatedTest = Boolean(
      navigator.webdriver || new URLSearchParams(window.location.search).get('autotest') === '1'
    );
    function getLandscapeViewport() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (h > w) {
        return { width: h, height: w, rotated90: true };
      }
      return { width: w, height: h, rotated90: false };
    }

    const isMobileDevice = Boolean(
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      Math.min(window.innerWidth, window.innerHeight) <= 920
    );
    const gpuProbeInfo = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return { isSoftware: true, rendererStr: '', vendorStr: '' };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const rendererStr = String(
          gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''
        );
        const vendorStr = String(
          gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR) || ''
        );
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        const isSoftware = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
        return { isSoftware, rendererStr, vendorStr };
      } catch (e) {
        return { isSoftware: false, rendererStr: '', vendorStr: '' };
      }
    })();
    const isSoftwareGl = gpuProbeInfo.isSoftware;

    // =========================================================================
    // Smart Hardware Auto-Detection & Graphics Quality Presets ('low' | 'medium' | 'high')
    // - High: 100% untouched original visuals (Nothing Phone 3a / Snapdragon 7s Gen 3 / Adreno 7xx-8xx / 8GB+ RAM)
    // - Low: Smooth 60 FPS on budget GPUs (Snapdragon 685 / Adreno 610 / Mali-G52/G57) while preserving full visual quality
    // - Medium: Balanced tier for mid-range devices
    // =========================================================================
    const GRAPHICS_STORAGE_KEY = 'wizard_chess_3d_graphics_quality_v1';

    function detectOptimalGraphicsQuality() {
      if (isSoftwareGl) return 'low';
      const gpu = gpuProbeInfo.rendererStr || '';
      const ramGB = Number(navigator.deviceMemory || 0);
      const cores = Number(navigator.hardwareConcurrency || 4);

      // 1. Explicit Low-End / Budget Mobile GPUs (checked first even if phone has 6GB/8GB RAM, e.g. Snapdragon 685 + Adreno 610)
      if (
        /Adreno\s*\(TM\)\s*(3\d\d|4\d\d|5\d\d|605|608|610|612|613|615|616|618|619)\b/i.test(gpu) ||
        /Adreno[^0-9]*(3\d\d|4\d\d|5\d\d|605|608|610|612|613|615|616|618|619)\b/i.test(gpu) ||
        /Mali-(G31|G51|G52|G57|T\d+|4\d\d)\b/i.test(gpu) ||
        /PowerVR|IMG\s*(GE|BXM|Rogue)|VideoCore/i.test(gpu)
      ) {
        return 'low';
      }

      // 2. Explicit High-End & Upper-Mid GPUs (e.g. Nothing Phone 3a Snapdragon 7s Gen 3 Adreno 810, Adreno 7xx/8xx, Apple GPU, Desktop GPUs)
      if (
        /Adreno\s*\(TM\)\s*(7\d\d|8\d\d|650|660)\b/i.test(gpu) ||
        /Adreno[^0-9]*(7\d\d|8\d\d|650|660)\b/i.test(gpu) ||
        /Immortalis|Mali-G(710|715|720|925)|Xclipse/i.test(gpu) ||
        /Apple\s*(GPU|M\d|A1[5-9])/i.test(gpu) ||
        /NVIDIA|GeForce|RTX|GTX|Radeon\s*RX|Arc\s*A\d|Intel\(R\)\s*Iris/i.test(gpu)
      ) {
        return 'high';
      }

      // 3. Explicit Mid-Range Mobile GPUs
      if (
        /Adreno[^0-9]*(620|630|640|642|644)\b/i.test(gpu) ||
        /Mali-G(68|72|76|77|78|610)\b/i.test(gpu)
      ) {
        return 'medium';
      }

      // 4. Fallback when mobile browser masks exact GPU model digits:
      if (ramGB >= 8) {
        return 'high';
      }
      if (ramGB > 0 && ramGB <= 4) {
        return 'low';
      }
      if (isMobileDevice) {
        // On Android, 6GB RAM phones with masked GPU strings (like Snapdragon 685) default to 'low' for guaranteed lag-free 60 FPS
        if (ramGB > 0 && ramGB <= 6) {
          return 'low';
        }
        return cores >= 8 ? 'medium' : 'low';
      }
      return 'high';
    }

    const autoDetectedGraphicsQuality = detectOptimalGraphicsQuality();
    let graphicsQuality = (() => {
      try {
        const saved = localStorage.getItem(GRAPHICS_STORAGE_KEY);
        if (saved === 'low' || saved === 'medium' || saved === 'high') {
          return saved;
        }
      } catch (e) {}
      return autoDetectedGraphicsQuality;
    })();
    let shadowFrameCounter = 0;
    let shadowUpdateInterval = graphicsQuality === 'low' ? 2 : 1;

    const initialVp = getLandscapeViewport();
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: isAutomatedTest
    });
    renderer.setSize(initialVp.width, initialVp.height);
    const getTargetPixelRatio = (tier) => {
      if (isSoftwareGl) return 1.0;
      const dpr = window.devicePixelRatio || 1;
      if (tier === 'low') return Math.min(dpr, 1.25);
      if (tier === 'medium') return Math.min(dpr, 1.5);
      return Math.min(dpr, 2.0);
    };
    renderer.setPixelRatio(getTargetPixelRatio(graphicsQuality));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = graphicsQuality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a12);
    scene.fog = new THREE.FogExp2(0x080b14, 0.015);

    // Self-contained Cathedral PMREM Environment (inspired by three-gpu-pathtracer & realism-effects)
    function createCathedralPMREMEnvironment(glRenderer) {
      const pmremGen = new THREE.PMREMGenerator(glRenderer);
      pmremGen.compileEquirectangularShader();
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x161412);
      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      const addPanel = (colorHex, intensity, pos, scl) => {
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(colorHex).multiplyScalar(intensity)
        });
        const m = new THREE.Mesh(boxGeo, mat);
        m.position.fromArray(pos);
        m.scale.fromArray(scl);
        envScene.add(m);
      };
      // Upper Gothic clerestory & Rose Window light panels
      addPanel(0xdce6f7, 2.6, [0, 9.5, -12.0], [10.0, 2.0, 1.5]);
      addPanel(0xffe0b5, 2.4, [0, 9.5, 12.0], [10.0, 2.0, 1.5]);
      addPanel(0xd4deee, 2.0, [-9.0, 6.5, 0.0], [1.2, 4.5, 16.0]);
      addPanel(0xd4deee, 2.0, [9.0, 6.5, 0.0], [1.2, 4.5, 16.0]);
      // Side-aisle lancet windows & North/South portal grazing panels (baked into PMREM so 32 pieces get 360° specular highlights at zero PointLight cost)
      addPanel(0xdbe4f3, 2.3, [-6.8, 4.8, -5.0], [1.4, 3.2, 3.2]);
      addPanel(0xdbe4f3, 2.3, [-6.8, 4.8, 5.0], [1.4, 3.2, 3.2]);
      addPanel(0xdbe4f3, 2.3, [6.8, 4.8, -5.0], [1.4, 3.2, 3.2]);
      addPanel(0xdbe4f3, 2.3, [6.8, 4.8, 5.0], [1.4, 3.2, 3.2]);
      addPanel(0xe4ecf7, 2.7, [0, 5.8, -10.8], [5.5, 3.6, 1.4]);
      addPanel(0xffddb0, 2.7, [0, 5.2, 9.8], [5.5, 3.6, 1.4]);
      // Warm twin fire cauldron & limestone floor bounce panels
      addPanel(0xff9438, 3.4, [-4.5, 1.6, 0.0], [2.2, 2.2, 4.0]);
      addPanel(0xff9438, 3.4, [4.5, 1.6, 0.0], [2.2, 2.2, 4.0]);
      addPanel(0x6e5c49, 0.95, [0, -4.0, 0.0], [16.0, 1.0, 24.0]);
      const envTex = pmremGen.fromScene(envScene, 0.04).texture;
      boxGeo.dispose();
      pmremGen.dispose();
      return envTex;
    }

    scene.environment = createCathedralPMREMEnvironment(renderer);
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = 0.34;
    }

    const camera = new THREE.PerspectiveCamera(
      40,
      initialVp.width / initialVp.height,
      0.22,
      65
    );
    camera.position.set(0, 2.22, 2.72);

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.16;
    orbitControls.maxPolarAngle = Math.PI * 0.88;
    orbitControls.minPolarAngle = 0.05;
    orbitControls.minDistance = 0.95;
    orbitControls.maxDistance = 36.0;
    orbitControls.target.set(0, 0.85, -0.15);
    orbitControls.update();

    // =========================================================================
    // Feature 5: Hold Shift + Mouse Drag (Left=Rotate, Right=Pan) Axis Lock (X or Y)
    // =========================================================================
    let isShiftKeyDown = false;
    const shiftDragState = {
      active: false,
      startX: 0,
      startY: 0,
      lockedAxis: null // 'x' | 'y' | null
    };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') isShiftKeyDown = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        isShiftKeyDown = false;
        shiftDragState.lockedAxis = null;
      }
    });

    // Capture pointerdown BEFORE OrbitControls so Shift+LeftClick stays ROTATE (instead of OrbitControls' default Shift->PAN swap)
    renderer.domElement.addEventListener(
      'pointerdown',
      (e) => {
        shiftDragState.active = true;
        shiftDragState.startX = e.clientX;
        shiftDragState.startY = e.clientY;
        shiftDragState.lockedAxis = null;
        if (e.shiftKey) {
          isShiftKeyDown = true;
          if (e.button === 0) {
            try {
              Object.defineProperty(e, 'shiftKey', {
                get: () => false,
                configurable: true
              });
            } catch (err) {}
          }
        }
      },
      { capture: true }
    );

    window.addEventListener('pointerup', () => {
      shiftDragState.active = false;
      shiftDragState.lockedAxis = null;
    });

    const origHandleMouseMoveRotate = orbitControls._handleMouseMoveRotate.bind(orbitControls);
    orbitControls._handleMouseMoveRotate = function (event) {
      if (event.shiftKey || isShiftKeyDown) {
        const dx = Math.abs(event.clientX - shiftDragState.startX);
        const dy = Math.abs(event.clientY - shiftDragState.startY);
        if (!shiftDragState.lockedAxis && (dx > 2 || dy > 2)) {
          shiftDragState.lockedAxis = dx >= dy ? 'x' : 'y';
        }
        if (shiftDragState.lockedAxis === 'x') {
          return origHandleMouseMoveRotate({
            clientX: event.clientX,
            clientY: this._rotateStart.y
          });
        } else if (shiftDragState.lockedAxis === 'y') {
          return origHandleMouseMoveRotate({
            clientX: this._rotateStart.x,
            clientY: event.clientY
          });
        }
      } else {
        shiftDragState.lockedAxis = null;
      }
      return origHandleMouseMoveRotate(event);
    };

    const origHandleMouseMovePan = orbitControls._handleMouseMovePan.bind(orbitControls);
    orbitControls._handleMouseMovePan = function (event) {
      if (event.shiftKey || isShiftKeyDown) {
        const dx = Math.abs(event.clientX - shiftDragState.startX);
        const dy = Math.abs(event.clientY - shiftDragState.startY);
        if (!shiftDragState.lockedAxis && (dx > 2 || dy > 2)) {
          shiftDragState.lockedAxis = dx >= dy ? 'x' : 'y';
        }
        if (shiftDragState.lockedAxis === 'x') {
          return origHandleMouseMovePan({
            clientX: event.clientX,
            clientY: this._panStart.y
          });
        } else if (shiftDragState.lockedAxis === 'y') {
          return origHandleMouseMovePan({
            clientX: this._panStart.x,
            clientY: event.clientY
          });
        }
      } else {
        shiftDragState.lockedAxis = null;
      }
      return origHandleMouseMovePan(event);
    };

    // Dramatic Chiaroscuro Cathedral & Board Lighting (grazing raking key + warm lower fill so mortar joints catch deep shadow)
    const hemiLight = new THREE.HemisphereLight(
      0xd8ccb8,
      0x281e15,
      graphicsQuality === 'low' ? 0.90 : graphicsQuality === 'medium' ? 0.78 : 0.72
    );
    scene.add(hemiLight);

    const initialShadowSize =
      graphicsQuality === 'low' ? 1024 : graphicsQuality === 'medium' ? 1536 : 2048;
    const keyLight = new THREE.DirectionalLight(
      0xfff0d6,
      graphicsQuality === 'low' ? 2.62 : graphicsQuality === 'medium' ? 2.58 : 2.55
    );
    keyLight.position.set(3.8, 8.5, 4.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = initialShadowSize;
    keyLight.shadow.mapSize.height = initialShadowSize;
    keyLight.shadow.camera.near = 1.5;
    keyLight.shadow.camera.far = 18.0;
    const d = 3.0;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    // Subtle directional rim/fill (kept low so opposing directional lights never cancel normal-map mortar shadows)
    const rimLight = new THREE.DirectionalLight(0xdce2f0, 0.85);
    rimLight.position.set(-4.5, 6.0, -6.5);
    rimLight.visible = graphicsQuality !== 'low';
    scene.add(rimLight);

    const southFillLight = new THREE.DirectionalLight(0xf5e0c4, 0.65);
    southFillLight.position.set(0.0, 4.8, 8.5);
    southFillLight.visible = graphicsQuality === 'high';
    scene.add(southFillLight);

    if ('environmentIntensity' in scene) {
      scene.environmentIntensity =
        graphicsQuality === 'low' ? 0.42 : graphicsQuality === 'medium' ? 0.37 : 0.34;
    }

    // Twin Flickering Brazier Point Lights (centered at x = +/-3.65, z = 0.00, flanked by columns at z = +/-2.50)
    const brazierCoords = [
      { pos: [-3.65, 1.08, 0.00], baseIntensity: 4.10, dist: 16.5 },
      { pos: [3.65, 1.08, 0.00], baseIntensity: 4.10, dist: 16.5 }
    ];
    const brazierLights = [];
    for (const cfg of brazierCoords) {
      const pLight = new THREE.PointLight(0xff8e32, cfg.baseIntensity, cfg.dist, 1.40);
      pLight.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      pLight.userData.baseIntensity = cfg.baseIntensity;
      scene.add(pLight);
      brazierLights.push(pLight);
    }

    // Realistic Gaseous GLSL Brazier Flames & Soft Warm Firelight Glow (zero bouncing shapes)
    const brazierFireUniforms = [];
    const brazierGlowSprites = [];
    const brazierFlameMidMeshes = [];
    let flameCoreShaderRef = null;
    let flameOuterShaderRef = null;

    function createSoftGlowTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(128, 128, 2, 128, 128, 128);
      grad.addColorStop(0.0, 'rgba(255, 226, 155, 0.88)');
      grad.addColorStop(0.18, 'rgba(255, 154, 52, 0.50)');
      grad.addColorStop(0.45, 'rgba(255, 92, 16, 0.18)');
      grad.addColorStop(0.75, 'rgba(210, 48, 4, 0.04)');
      grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    // Strip the 14 tiny static icosphere spark balls baked above Opt8_Brazier_Flame_Mid (y > 1.26, height < 0.10)
    // while preserving 100% of the sculpted flame tongues (which start at y = 0.59..0.61)
    function stripIcosphereSparksFromFlameGeometry(geometry) {
      if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
      const pos = geometry.attributes.position;
      if (geometry.index) {
        const idx = geometry.index.array;
        for (let i = 0; i < idx.length; i += 3) {
          const i0 = idx[i];
          const i1 = idx[i + 1];
          const i2 = idx[i + 2];
          const y0 = pos.getY(i0);
          const y1 = pos.getY(i1);
          const y2 = pos.getY(i2);
          const minY = Math.min(y0, y1, y2);
          if (minY > 1.25) {
            idx[i] = 0;
            idx[i + 1] = 0;
            idx[i + 2] = 0;
          }
        }
        geometry.index.needsUpdate = true;
      } else {
        for (let i = 0; i < pos.count; i += 3) {
          const y0 = pos.getY(i);
          const y1 = pos.getY(i + 1);
          const y2 = pos.getY(i + 2);
          if (Math.min(y0, y1, y2) > 1.25) {
            pos.setXYZ(i, 0, 0, 0);
            pos.setXYZ(i + 1, 0, 0, 0);
            pos.setXYZ(i + 2, 0, 0, 0);
          }
        }
        pos.needsUpdate = true;
      }
    }

    // =========================================================================
    // Cathedral Room Boundary Clamping (Floor, Ceiling, Side & End Walls)
    // & Solid Cylindrical Column Collision / Circumferential Sliding Solver
    // =========================================================================
    const CATHEDRAL_BOUNDS = {
      minX: -6.65,
      maxX: 6.65,
      minY: 0.34,
      maxY: 8.85,
      minZ: -18.10,
      maxZ: 18.10
    };

    // 12 freestanding columns spread wider across the nave; the 4 columns closest to the chessboard (z = +/-2.20)
    // have been removed to create a grand 13.70m open Atrium around the altar and centered fire braziers
    const CATHEDRAL_COLUMN_ROWS = [
      { z: -16.65, xAbs: 4.25 },
      { z: -11.85, xAbs: 4.25 },
      { z: -6.85,  xAbs: 4.65 },
      { z: 6.85,   xAbs: 4.65 },
      { z: 11.85,  xAbs: 4.25 },
      { z: 16.65,  xAbs: 4.25 }
    ];
    const CATHEDRAL_SOLID_PILLARS = [
      ...CATHEDRAL_COLUMN_ROWS.flatMap(({ z, xAbs }) => [
        { x: -xAbs, z, r: 0.86, maxY: 9.65, isColumn: true },
        { x: xAbs,  z, r: 0.86, maxY: 9.65, isColumn: true }
      ]),
      { x: -3.65, z: 0.00, r: 0.68, maxY: 1.95, isColumn: false },
      { x: 3.65,  z: 0.00, r: 0.68, maxY: 1.95, isColumn: false }
    ];

    function clampPointToCathedralRoom(pt, isTarget = false) {
      const margin = isTarget ? 0.15 : 0.0;
      pt.x = Math.max(CATHEDRAL_BOUNDS.minX - margin, Math.min(CATHEDRAL_BOUNDS.maxX + margin, pt.x));
      pt.z = Math.max(CATHEDRAL_BOUNDS.minZ - margin, Math.min(CATHEDRAL_BOUNDS.maxZ + margin, pt.z));
      // Account for the sloped side-aisle ceiling vault outside x = +/-4.15
      const aisleDrop = Math.max(0, Math.abs(pt.x) - 4.15) * 0.55;
      const localMaxY = Math.min(CATHEDRAL_BOUNDS.maxY, 9.05 - aisleDrop);
      const localMinY = isTarget ? 0.20 : CATHEDRAL_BOUNDS.minY;
      pt.y = Math.max(localMinY, Math.min(localMaxY, pt.y));
    }

    function enforceCathedralBoundsAndSolidColumns(prevPos, curPos, targetPos) {
      clampPointToCathedralRoom(targetPos, true);
      clampPointToCathedralRoom(curPos, false);

      if (isAnimatingMove) {
        if (Math.abs(curPos.x) < 2.48 && Math.abs(curPos.z) < 2.38) {
          curPos.y = Math.max(curPos.y, BOARD_SURFACE_Y + 0.30);
        }
        return;
      }

      const x0 = prevPos ? prevPos.x : curPos.x;
      const z0 = prevPos ? prevPos.z : curPos.z;
      let x1 = curPos.x;
      let z1 = curPos.z;
      const moveDx = x1 - x0;
      const moveDz = z1 - z0;
      const moveLenSq = moveDx * moveDx + moveDz * moveDz;
      const moveLen = Math.sqrt(moveLenSq);
      const isContinuousStep = Boolean(prevPos) && moveLen > 1e-5 && moveLen < 8.0;

      for (const p of CATHEDRAL_SOLID_PILLARS) {
        if (curPos.y > p.maxY) continue;

        let tClosest = 1.0;
        if (isContinuousStep) {
          tClosest = ((p.x - x0) * moveDx + (p.z - z0) * moveDz) / moveLenSq;
          tClosest = Math.max(0.0, Math.min(1.0, tClosest));
        }
        const cxSeg = x0 + moveDx * tClosest;
        const czSeg = z0 + moveDz * tClosest;
        const dSeg = isContinuousStep ? Math.hypot(cxSeg - p.x, czSeg - p.z) : Infinity;
        const dEnd = Math.hypot(x1 - p.x, z1 - p.z);

        if (dSeg < p.r || dEnd < p.r) {
          if (typeof window.__wizardChessTelemetry === 'object' && window.__wizardChessTelemetry && p.isColumn) {
            window.__wizardChessTelemetry.columnDeflections = (window.__wizardChessTelemetry.columnDeflections || 0) + 1;
          }

          if (isContinuousStep) {
            // Smooth tangential circumferential slide around the column
            const startAng = Math.atan2(z0 - p.z, x0 - p.x);
            const endAng = Math.atan2(z1 - p.z, x1 - p.x);
            let deltaAng = endAng - startAng;
            while (deltaAng > Math.PI) deltaAng -= Math.PI * 2;
            while (deltaAng < -Math.PI) deltaAng += Math.PI * 2;

            // Project step onto unit tangent at startAng; if pushing dead-on into column center, bias toward center aisle
            const tanX = -Math.sin(startAng);
            const tanZ = Math.cos(startAng);
            let tangMove = moveDx * tanX + moveDz * tanZ;
            if (Math.abs(tangMove) < moveLen * 0.18) {
              const aisleSign = (p.x >= 0 ? -1 : 1) * Math.sign(moveDz || 1);
              tangMove = (tangMove >= 0 ? 1 : aisleSign || 1) * moveLen * 0.65;
            }
            const arcStep = Math.sign(deltaAng || tangMove || 1) * Math.max(Math.abs(deltaAng), Math.min(Math.PI * 0.35, Math.abs(tangMove) / p.r));
            const newAng = startAng + arcStep;
            x1 = p.x + Math.cos(newAng) * p.r;
            z1 = p.z + Math.sin(newAng) * p.r;
          } else {
            const radX = x1 - p.x;
            const radZ = z1 - p.z;
            const radLen = Math.hypot(radX, radZ);
            if (radLen > 1e-4) {
              x1 = p.x + (radX / radLen) * p.r;
              z1 = p.z + (radZ / radLen) * p.r;
            } else {
              x1 = p.x + (p.x >= 0 ? -p.r : p.r);
              z1 = p.z;
            }
          }
        }
      }

      // Solid Black Marble Altar (4.40m x 4.20m slab + pedestal) & Chessboard collision
      // Prevents the camera from passing down through either the chessboard OR the surrounding black marble altar rim
      const ALTAR_TOP_Y = 0.722;
      const ALTAR_HALF_X = 2.48; // 2.22m black marble slab half-width + 0.26m camera frustum near-clip margin
      const ALTAR_HALF_Z = 2.38; // 2.12m black marble slab half-depth + 0.26m camera frustum near-clip margin
      const BOARD_HALF_XZ = 1.66;
      if (Math.abs(targetPos.x) < 2.36 && Math.abs(targetPos.z) < 2.26) {
        const minTargetY =
          Math.abs(targetPos.x) < 1.56 && Math.abs(targetPos.z) < 1.56
            ? BOARD_SURFACE_Y + 0.05
            : ALTAR_TOP_Y + 0.05;
        if (targetPos.y < minTargetY) {
          targetPos.y = minTargetY;
        }
      }
      if (Math.abs(x1) < ALTAR_HALF_X && Math.abs(z1) < ALTAR_HALF_Z) {
        const isOverChessboard = Math.abs(x1) < BOARD_HALF_XZ && Math.abs(z1) < BOARD_HALF_XZ;
        const solidAltarTopY = isOverChessboard ? (BOARD_SURFACE_Y + 0.25) : (ALTAR_TOP_Y + 0.28); // 1.035m on board, 1.002m on black marble altar
        if (curPos.y < solidAltarTopY) {
          const wasInsideAltarFootprint =
            Boolean(prevPos) &&
            Math.abs(x0) < ALTAR_HALF_X - 0.005 &&
            Math.abs(z0) < ALTAR_HALF_Z - 0.005;
          const wasAboveAltarSlab =
            wasInsideAltarFootprint ||
            (Boolean(prevPos) && prevPos.y >= ALTAR_TOP_Y - 0.04) ||
            curPos.y >= ALTAR_TOP_Y - 0.10;
          if (wasAboveAltarSlab) {
            curPos.y = Math.max(curPos.y, solidAltarTopY);
          } else {
            const penX = ALTAR_HALF_X - Math.abs(x1);
            const penZ = ALTAR_HALF_Z - Math.abs(z1);
            if (penX < penZ) {
              x1 = (x1 >= 0 ? 1 : -1) * ALTAR_HALF_X;
            } else {
              z1 = (z1 >= 0 ? 1 : -1) * ALTAR_HALF_Z;
            }
          }
        }
      }

      // Solid Marble & Obsidian Chess Pieces collision during manual camera movement
      // (Bypassed when isAnimatingMove is true so automated duel/attack camera choreography never gets pinned between statues)
      if (
        !isAnimatingMove &&
        curPos.y < BOARD_SURFACE_Y + 0.85 &&
        typeof boardState === 'object' &&
        Array.isArray(boardState)
      ) {
        const pieceRad = 0.185;
        for (let r = 0; r < 8; r++) {
          const row = boardState[r];
          if (!row) continue;
          for (let c = 0; c < 8; c++) {
            const pc = row[c];
            if (!pc || !pc.mesh || !pc.mesh.parent) continue;
            const px = pc.mesh.position.x;
            const pz = pc.mesh.position.z;
            const pieceH = (typeof PIECE_HEIGHTS === 'object' && PIECE_HEIGHTS[pc.type]) ? PIECE_HEIGHTS[pc.type] : 0.42;
            const pieceTopY = pc.mesh.position.y + pieceH + 0.10;
            if (curPos.y >= pieceTopY) continue;

            let tPiece = 1.0;
            if (isContinuousStep) {
              tPiece = ((px - x0) * moveDx + (pz - z0) * moveDz) / moveLenSq;
              tPiece = Math.max(0.0, Math.min(1.0, tPiece));
            }
            const cxP = x0 + moveDx * tPiece;
            const czP = z0 + moveDz * tPiece;
            const dSegP = isContinuousStep ? Math.hypot(cxP - px, czP - pz) : Infinity;
            const dEndP = Math.hypot(x1 - px, z1 - pz);

            if (dSegP < pieceRad || dEndP < pieceRad) {
              if (
                prevPos &&
                prevPos.y >= pieceTopY - 0.08 &&
                Math.hypot(x0 - px, z0 - pz) < pieceRad * 0.85
              ) {
                curPos.y = Math.max(curPos.y, pieceTopY);
              } else {
                const radX = x1 - px;
                const radZ = z1 - pz;
                const radLen = Math.hypot(radX, radZ);
                if (radLen > 1e-4) {
                  x1 = px + (radX / radLen) * pieceRad;
                  z1 = pz + (radZ / radLen) * pieceRad;
                } else {
                  x1 = px + pieceRad;
                }
              }
            }
          }
        }
      }

      curPos.x = x1;
      curPos.z = z1;
      clampPointToCathedralRoom(curPos, false);

      // Update minimum column clearance telemetry across all 12 freestanding columns
      if (typeof window.__wizardChessTelemetry === 'object' && window.__wizardChessTelemetry) {
        let minClear = Infinity;
        for (const p of CATHEDRAL_SOLID_PILLARS) {
          if (!p.isColumn) continue;
          const d = Math.hypot(curPos.x - p.x, curPos.z - p.z);
          if (d < minClear) minClear = d;
        }
        window.__wizardChessTelemetry.lastColumnClearance = Number(minClear.toFixed(3));
        if (
          window.__wizardChessTelemetry.minColumnClearance === undefined ||
          minClear < window.__wizardChessTelemetry.minColumnClearance
        ) {
          window.__wizardChessTelemetry.minColumnClearance = Number(minClear.toFixed(3));
        }
      }
    }

    function createSculptedFlameTongueShader(cfg) {
      const uniforms = {
        uTime: { value: 0 },
        uZMin: { value: cfg.zMin },
        uZMax: { value: cfg.zMax },
        uLayerSeed: { value: cfg.layerSeed },
        uStrength: { value: cfg.strength },
        uOpacity: { value: cfg.opacity },
        uLowQuality: { value: graphicsQuality === 'low' ? 1.0 : 0.0 },
        uBaseColor: { value: new THREE.Color(...cfg.baseColor) },
        uMidColor: { value: new THREE.Color(...cfg.midColor) },
        uTipColor: { value: new THREE.Color(...cfg.tipColor) }
      };
      brazierFireUniforms.push(uniforms);

      return new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          uniform float uTime;
          uniform float uZMin;
          uniform float uZMax;
          uniform float uLayerSeed;
          varying vec3 vLocalPos;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying float vHeightNorm;

          void main() {
            vec3 pos = position;
            float h = clamp((pos.y - uZMin) / max(0.01, uZMax - uZMin), 0.0, 1.0);
            vHeightNorm = h;

            // Each brazier is centered at X = +/- 3.65, Z = 0.65 in local mesh space (world Z = 0.00)
            vec2 bCenter = vec2(sign(pos.x) * 3.65, 0.65);
            vec2 relXZ = vec2(pos.x, pos.z) - bCenter;

            // Distinct phase per sculpted tongue & fire layer so all 27 tongues dance independently
            float tonguePhase = relXZ.x * 14.0 + relXZ.y * 12.0 + uLayerSeed * 1.9;
            float sway = pow(h, 1.05);

            // Multi-frequency upward-propagating lateral flame wave (pinned at h = 0 in the logs)
            float waveX = sin(pos.y * 4.6 - uTime * 6.4 + tonguePhase) * 0.088
                        + cos(pos.y * 8.2 - uTime * 9.8 + tonguePhase * 1.35) * 0.048;
            float waveZ = cos(pos.y * 4.3 - uTime * 5.9 + tonguePhase * 1.15) * 0.088
                        + sin(pos.y * 7.8 - uTime * 9.1 + tonguePhase * 0.85) * 0.048;

            // Swirling thermal vortex twist + radial breathing around each brazier bowl
            float twistAngle = sin(uTime * 4.2 + pos.y * 4.5 + uLayerSeed) * 0.30 * sway;
            float cA = cos(twistAngle);
            float sA = sin(twistAngle);
            vec2 twistedXZ = vec2(relXZ.x * cA - relXZ.y * sA, relXZ.x * sA + relXZ.y * cA);
            float radialPulse = 1.0 + sin(uTime * 5.2 - h * 4.0 + tonguePhase) * 0.14 * sway;

            pos.x = bCenter.x + twistedXZ.x * radialPulse + waveX * sway;
            pos.z = bCenter.y + twistedXZ.y * radialPulse + waveZ * sway;

            // Active vertical flame-tongue licking (base h = 0 stays strictly anchored at uZMin)
            float lickStretch = 1.0 + (
              sin(uTime * 5.8 + tonguePhase * 1.3) * 0.22 +
              cos(uTime * 9.2 - tonguePhase * 0.9) * 0.12
            ) * smoothstep(0.05, 0.85, h);
            pos.y = uZMin + (pos.y - uZMin) * lickStretch;

            vLocalPos = pos;
            vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
            vWorldPos = worldPosition.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uZMin;
          uniform float uZMax;
          uniform float uLayerSeed;
          uniform float uStrength;
          uniform float uOpacity;
          uniform float uLowQuality;
          uniform vec3 uBaseColor;
          uniform vec3 uMidColor;
          uniform vec3 uTipColor;
          varying vec3 vLocalPos;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying float vHeightNorm;

          float hash3(vec3 p) {
            return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          }

          float noise3(vec3 x) {
            vec3 i = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
                  mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
              mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                  mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z
            );
          }

          void main() {
            float h = clamp(vHeightNorm, 0.0, 1.0);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 N = normalize(vWorldNormal);

            // Real-time port of Cycles LayerWeight.Facing^2.4 gaseous feathering
            float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
            float powFacing = pow(facing, 1.9);

            // Fast upward-convecting 3D flame turbulence that actively carves the flame tips
            float n1 = noise3(vec3(vLocalPos.x * 5.4, vLocalPos.y * 4.8 - uTime * 6.8, vLocalPos.z * 5.4 + uLayerSeed));
            float shimmer = n1;
            if (uLowQuality < 0.5) {
              float n2 = noise3(vec3(vLocalPos.x * 9.8 + 1.9, vLocalPos.y * 8.2 - uTime * 10.2, vLocalPos.z * 9.8 - uLayerSeed));
              shimmer = mix(n1, n2, 0.45);
            }

            // Dynamic tip erosion so flame tongues visibly lick up and recede
            float erodedH = clamp(h + (shimmer - 0.48) * 0.42 * smoothstep(0.08, 0.85, h), 0.0, 1.0);

            // Combine eroded height and (1.0 - facing) so grazing edges shift toward fiery orange-crimson
            float heatCoord = clamp(erodedH + (1.0 - facing) * 0.36 + (shimmer - 0.5) * 0.22, 0.0, 1.0);
            vec3 col = mix(uBaseColor, uMidColor, smoothstep(0.0, 0.45, heatCoord));
            col = mix(col, uTipColor, smoothstep(0.45, 0.90, heatCoord));

            float zAlpha = mix(0.96, 0.72, smoothstep(0.0, 0.68, erodedH)) * (1.0 - smoothstep(0.64, 0.98, erodedH));
            float baseSoft = smoothstep(0.0, 0.06, h);
            float flickerPulse = 0.76 + 0.48 * shimmer;
            float alpha = clamp(zAlpha * baseSoft * powFacing * uOpacity * flickerPulse, 0.0, 1.0);
            if (alpha < 0.008) discard;

            gl_FragColor = vec4(col * uStrength, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
    }

    function createCharredEmberLogsShader() {
      const uniforms = {
        uTime: { value: 0 },
        uLowQuality: { value: graphicsQuality === 'low' ? 1.0 : 0.0 }
      };
      brazierFireUniforms.push(uniforms);

      return new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec3 vLocalPos;
          varying vec3 vWorldNormal;
          void main() {
            vLocalPos = position;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uLowQuality;
          varying vec3 vLocalPos;
          varying vec3 vWorldNormal;

          float hash3(vec3 p) {
            return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          }

          float noise3(vec3 x) {
            vec3 i = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
                  mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
              mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                  mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z
            );
          }

          void main() {
            float nCrack = noise3(vLocalPos * 28.0);
            float nFine = uLowQuality > 0.5 ? nCrack : noise3(vLocalPos * 62.0 + vec3(0.0, uTime * 0.4, 0.0));
            float pulse = 0.88 + 0.12 * sin(uTime * 2.3 + vLocalPos.x * 4.0 + vLocalPos.z * 4.0);

            // Lower coal cone (y < 0.59) vs upper charred logs (y >= 0.59)
            float isCoalBed = 1.0 - smoothstep(0.56, 0.61, vLocalPos.y);
            float crackMask = smoothstep(0.62, 0.88, nCrack * 0.7 + nFine * 0.3);
            float underGlow = clamp(-vWorldNormal.y * 0.45 + 0.35, 0.0, 1.0) * smoothstep(0.72, 0.56, vLocalPos.y);

            vec3 charBark = vec3(0.035, 0.025, 0.020);
            vec3 emberOrange = vec3(1.0, 0.36, 0.04) * 1.45 * pulse;
            vec3 hotCoal = vec3(1.0, 0.58, 0.12) * 1.65 * pulse;

            float emberWeight = clamp(isCoalBed * (0.45 + 0.55 * nFine) + crackMask * 0.85 + underGlow * 0.45, 0.0, 1.0);
            vec3 col = mix(charBark, emberOrange, emberWeight);
            col = mix(col, hotCoal, smoothstep(0.72, 0.96, emberWeight));

            gl_FragColor = vec4(col, 1.0);
          }
        `
      });
    }

    function createBrazierWarmGlowHalos() {
      const glowTex = createSoftGlowTexture();
      const brazierCenters = [
        { x: -3.65, y: 0.56, z: 0.00, seed: 1.3 },
        { x: 3.65, y: 0.56, z: 0.00, seed: 5.8 }
      ];

      for (const b of brazierCenters) {
        // Layer 1: Inner warm hearth core glow halo centered in the flame body
        const coreGlowMat = new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xffb866,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const coreSprite = new THREE.Sprite(coreGlowMat);
        coreSprite.position.set(b.x, b.y + 0.28, b.z);
        coreSprite.scale.set(1.15, 1.25, 1.0);
        coreSprite.userData = { baseOpacity: 0.42, seed: b.seed };
        scene.add(coreSprite);
        brazierGlowSprites.push(coreSprite);

        // Layer 2: Wide, soft atmospheric warm glow halo bathing the surrounding air & ironwork
        const haloGlowMat = new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xff8524,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const haloSprite = new THREE.Sprite(haloGlowMat);
        haloSprite.position.set(b.x, b.y + 0.38, b.z);
        haloSprite.scale.set(2.45, 2.30, 1.0);
        haloSprite.userData = { baseOpacity: 0.28, seed: b.seed + 2.1 };
        scene.add(haloSprite);
        brazierGlowSprites.push(haloSprite);
      }
    }

    createBrazierWarmGlowHalos();

    // Side-Aisle & Portal Window Grazing Lights are pre-baked into the Cathedral PMREM Environment
    // and evaluated analytically in applyCathedralStoneRealismShader (saves 6 per-pixel PointLight BRDF loops on low-end GPUs with zero quality loss)

    // Impact Flash Light (kept visible=true with intensity=0 when idle so Three.js never recompiles shaders mid-attack!)
    const impactFlashLight = new THREE.PointLight(0xffb74d, 0, 6.0, 1.5);
    impactFlashLight.visible = true;
    scene.add(impactFlashLight);

    // =========================================================================
    // Materials for White & Black Sculpted Stone Chess Pieces
    // =========================================================================
    const whitePieceMat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd0,
      roughness: 0.32,
      metalness: 0.08,
      envMapIntensity: 1.55
    });

    const blackPieceMat = new THREE.MeshStandardMaterial({
      color: 0x222630,
      roughness: 0.25,
      metalness: 0.28,
      envMapIntensity: 1.75
    });

    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.24,
      metalness: 0.88,
      envMapIntensity: 1.95
    });

    const forgedSteelMat = new THREE.MeshStandardMaterial({
      color: 0xdce4ee,
      roughness: 0.18,
      metalness: 0.90,
      emissive: 0x222832,
      emissiveIntensity: 0.25,
      envMapIntensity: 2.00
    });

    // =========================================================================
    // Asset Loading (Cathedral GLB + 12 Rigged Piece GLBs)
    // =========================================================================
    const gltfLoader = new GLTFLoader();
    const pieceTemplates = {};
    const activeMixers = [];
    const shatterDebris = [];
    const clock = new THREE.Clock();

    const boardGroup = new THREE.Group();
    scene.add(boardGroup);
    const boardRaycastGroup = new THREE.Group();
    const squareHighlightsGroup = new THREE.Group();
    scene.add(squareHighlightsGroup);
    const checkAlertGroup = new THREE.Group();
    scene.add(checkAlertGroup);
    const boardSquareMeshes = [];
    const boardBorderMeshes = [];
    const checkCourtPulseMats = [];
    const checkBorderMat = new THREE.MeshStandardMaterial({
      color: 0xe6192e,
      roughness: 0.22,
      metalness: 0.55,
      emissive: 0xb80a1b,
      emissiveIntensity: 0.95,
      envMapIntensity: 1.8
    });

    function buildChessBoardGrid() {
      const tileH = 0.036;
      const sqGeo = new THREE.BoxGeometry(BOARD_SQ_SIZE * 0.985, tileH, BOARD_SQ_SIZE * 0.985);
      const lightSqMat = new THREE.MeshStandardMaterial({
        color: 0xdcd3c2,
        roughness: 0.38,
        metalness: 0.06,
        envMapIntensity: 1.15
      });
      const darkSqMat = new THREE.MeshStandardMaterial({
        color: 0x14171f,
        roughness: 0.28,
        metalness: 0.18,
        envMapIntensity: 1.25
      });

      // Render all 64 squares using only 2 InstancedMeshes (62 fewer draw calls every frame, 100% identical visuals!)
      const lightInstanced = new THREE.InstancedMesh(sqGeo, lightSqMat, 32);
      const darkInstanced = new THREE.InstancedMesh(sqGeo, darkSqMat, 32);
      lightInstanced.receiveShadow = true;
      darkInstanced.receiveShadow = true;
      let lightIdx = 0;
      let darkIdx = 0;
      const dummyMat4 = new THREE.Matrix4();

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const isLight = (r + c) % 2 === 0;
          const pos = boardToWorld(r, c);
          const tileY = BOARD_SURFACE_Y - tileH * 0.5;
          dummyMat4.makeTranslation(pos.x, tileY, pos.z);
          if (isLight) {
            lightInstanced.setMatrixAt(lightIdx++, dummyMat4);
          } else {
            darkInstanced.setMatrixAt(darkIdx++, dummyMat4);
          }

          // Keep lightweight off-scene raycast target so click/tap detection is 100% unchanged
          const sqMesh = new THREE.Mesh(sqGeo, isLight ? lightSqMat : darkSqMat);
          sqMesh.position.set(pos.x, tileY, pos.z);
          sqMesh.userData = { r, c, isSquare: true };
          boardRaycastGroup.add(sqMesh);
          boardSquareMeshes.push(sqMesh);
        }
      }
      lightInstanced.instanceMatrix.needsUpdate = true;
      darkInstanced.instanceMatrix.needsUpdate = true;
      boardGroup.add(lightInstanced);
      boardGroup.add(darkInstanced);
      boardRaycastGroup.updateMatrixWorld(true);

      // Sculpted Golden Border Frame around the 8x8 tiles on top of the Obsidian Altar
      const halfB = 4.0 * BOARD_SQ_SIZE;
      const rimW = 0.06;
      const rimH = 0.042;
      const horizGeo = new THREE.BoxGeometry(halfB * 2 + rimW * 2, rimH, rimW);
      const vertGeo = new THREE.BoxGeometry(rimW, rimH, halfB * 2);
      for (const s of [-1, 1]) {
        const hBar = new THREE.Mesh(horizGeo, goldTrimMat);
        hBar.position.set(0, BOARD_SURFACE_Y - rimH * 0.45, s * (halfB + rimW * 0.5));
        hBar.receiveShadow = true;
        boardGroup.add(hBar);
        boardBorderMeshes.push(hBar);

        const vBar = new THREE.Mesh(vertGeo, goldTrimMat);
        vBar.position.set(s * (halfB + rimW * 0.5), BOARD_SURFACE_Y - rimH * 0.45, 0);
        vBar.receiveShadow = true;
        boardGroup.add(vBar);
        boardBorderMeshes.push(vBar);
      }
    }

    buildChessBoardGrid();

    // =========================================================================
    // Native Baked Wall/Column Stone (Original Ashlar) & Floor Stone (Abbey Flagstone)
    // =========================================================================
    const WALL_STONE_LOOKS = [
      {
        name: 'Original Ashlar',
        fullName: 'Original Ashlar',
        useOriginalBaked: true,
        roughness: 0.78,
        normalScale: 1.18,
        colNormalScale: 1.06
      }
    ];

    const FLOOR_STONE_LOOKS = [
      {
        name: 'Abbey Flagstone',
        fullName: 'Abbey Flagstone',
        useOriginalBaked: true,
        roughness: 0.80,
        metalness: 0.02,
        normalScale: 1.18
      }
    ];

    let currentWallStoneLookIdx = 0;
    let currentFloorStoneLookIdx = 0;
    const cathedralWallMats = [];
    const cathedralColumnMats = [];
    const cathedralFloorMats = [];

    // Precomputed 128x128 tileable micro-chisel grain DataTexture (replaces 32 per-pixel 3D hashes every frame)
    const stoneMicroGrainTex = (() => {
      const size = 128;
      const data = new Uint8Array(size * size * 4);
      const fract = (v) => v - Math.floor(v);
      const hash2 = (x, y, s) => fract(Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453);
      const smoothNoise = (u, v, period, seed) => {
        const gx = u * period;
        const gy = v * period;
        const x0 = Math.floor(gx) % period;
        const y0 = Math.floor(gy) % period;
        const x1 = (x0 + 1) % period;
        const y1 = (y0 + 1) % period;
        const fx = gx - Math.floor(gx);
        const fy = gy - Math.floor(gy);
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const n00 = hash2(x0, y0, seed);
        const n10 = hash2(x1, y0, seed);
        const n01 = hash2(x0, y1, seed);
        const n11 = hash2(x1, y1, seed);
        return (n00 + (n10 - n00) * sx) * (1 - sy) + (n01 + (n11 - n01) * sx) * sy;
      };
      for (let y = 0; y < size; y++) {
        const v = y / size;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const mG1 = smoothNoise(u, v, 24, 1.7);
          const mG2 = smoothNoise(u, v, 64, 7.3);
          const idx = (y * size + x) * 4;
          data[idx] = Math.max(0, Math.min(255, Math.round(mG1 * 255)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(mG2 * 255)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round((0.5 + (mG1 - mG2) * 0.7) * 255)));
          data[idx + 3] = 255;
        }
      }
      const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      return tex;
    })();

    // =========================================================================
    // Realism Stone Shader Enhancement (inspired by 0beqz/realism-effects HBAO/HBIL
    // & gkjohnson/three-gpu-pathtracer Cavity Micro-Occlusion + Specular Occlusion)
    // =========================================================================
    function applyCathedralStoneRealismShader(mat, isFloor = false) {
      if (!mat || mat.userData.hasRealismStoneShader) return;
      mat.userData.hasRealismStoneShader = true;
      mat.customProgramCacheKey = () => (isFloor ? 'cathedral-floor-realism-v3' : 'cathedral-stone-realism-v3');

      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uCavityStrength = { value: isFloor ? 0.58 : 0.72 };
        shader.uniforms.uMicroDetailStrength = { value: isFloor ? 0.14 : 0.18 };
        shader.uniforms.uFireBounceStrength = { value: isFloor ? 0.16 : 0.24 };
        shader.uniforms.uMicroGrainMap = { value: stoneMicroGrainTex };

        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
          varying vec3 vStoneWorldPos;`
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vStoneWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
          varying vec3 vStoneWorldPos;
          uniform float uCavityStrength;
          uniform float uMicroDetailStrength;
          uniform float uFireBounceStrength;
          uniform sampler2D uMicroGrainMap;`
        );

        // Extract normal-map slope magnitude for Mortar/Crevice Cavity AO & Specular Micro-Occlusion,
        // plus precomputed tileable micro-chisel grain lookup (zero per-pixel 3D hash loops!).
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `float stoneCavityAO = 1.0;
          #include <normal_fragment_maps>
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec2 rawNrmXY = texture2D(normalMap, vNormalMapUv).xy * 2.0 - 1.0;
            float slopeSq = dot(rawNrmXY, rawNrmXY);
            stoneCavityAO = clamp(1.0 - slopeSq * uCavityStrength, 0.36, 1.0);
          #endif
          vec2 microUv = (vStoneWorldPos.xz + vStoneWorldPos.xy * 0.618) * 0.85;
          vec3 mgSample = texture2D(uMicroGrainMap, microUv).rgb - 0.5;
          float mG1 = mgSample.r;
          float mG2 = mgSample.g;
          vec3 microPerturb = vec3(mG1, mG2, mgSample.b) * uMicroDetailStrength;
          normal = normalize(normal + microPerturb * 0.22);
          diffuseColor.rgb *= mix(0.92, 1.07, clamp(0.5 + (mG1 * 0.65 + mG2 * 0.35), 0.0, 1.0));
          diffuseColor.rgb *= mix(1.0, stoneCavityAO, 0.68);
          roughnessFactor = clamp(roughnessFactor + (1.0 - stoneCavityAO) * 0.34 - mG1 * 0.06, 0.14, 0.99);`
        );

        // Add Horizon-Based Indirect Bounce (HBIL) from the twin fire cauldrons & upper lancet windows,
        // and apply Specular Micro-Occlusion in mortar crevices so grooves never have plastic shine.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          reflectedLight.directDiffuse *= mix(1.0, stoneCavityAO, 0.45);
          reflectedLight.indirectDiffuse *= stoneCavityAO;
          reflectedLight.directSpecular *= stoneCavityAO * stoneCavityAO;
          reflectedLight.indirectSpecular *= stoneCavityAO * stoneCavityAO;

          // Physical multi-bounce warm firelight GI from the twin atrium braziers & flanking columns
          vec3 toBrazierL = vec3(-3.65, 1.35, 0.0) - vStoneWorldPos;
          vec3 toBrazierR = vec3(3.65, 1.35, 0.0) - vStoneWorldPos;
          float distSqL = dot(toBrazierL, toBrazierL) + 2.6;
          float distSqR = dot(toBrazierR, toBrazierR) + 2.6;
          vec3 wNormal = inverseTransformDirection(normal, viewMatrix);
          float bounceL = max(0.0, dot(wNormal, normalize(toBrazierL)) * 0.65 + 0.35) / distSqL;
          float bounceR = max(0.0, dot(wNormal, normalize(toBrazierR)) * 0.65 + 0.35) / distSqR;
          vec3 fireBounceGI = vec3(1.0, 0.54, 0.20) * (bounceL + bounceR) * 5.2 * uFireBounceStrength * stoneCavityAO;

          // Analytic raking window-sill & end-wall grazing light (replaces 14 static PointLights at zero BRDF cost)
          vec3 toSideWin = vec3(sign(vStoneWorldPos.x) * 6.8, 3.8, vStoneWorldPos.z) - vStoneWorldPos;
          float sideWinDistSq = dot(toSideWin, toSideWin) + 3.2;
          float sideWinGraze = max(0.0, dot(wNormal, normalize(toSideWin)) * 0.75 + 0.25) / sideWinDistSq;
          vec3 windowGrazeGI = vec3(0.84, 0.89, 0.96) * sideWinGraze * 0.95 * stoneCavityAO;
          reflectedLight.indirectDiffuse += (fireBounceGI + windowGrazeGI) * diffuseColor.rgb;`
        );
      };
      mat.needsUpdate = true;
    }

    function setWallStoneLook() {
      currentWallStoneLookIdx = 0;
      const cfg = WALL_STONE_LOOKS[0];

      for (const mat of cathedralWallMats) {
        mat.map = mat.userData.origMap || mat.map;
        mat.normalMap = mat.userData.origNormalMap || mat.normalMap;
        mat.roughnessMap = mat.userData.origRoughnessMap || mat.roughnessMap;
        mat.emissiveMap = mat.userData.origEmissiveMap || null;
        mat.emissiveIntensity = 0.08;
        mat.roughness = cfg.roughness;
        mat.metalness = 0.02;
        if ('envMapIntensity' in mat) mat.envMapIntensity = 0.45;
        if (mat.color) mat.color.setRGB(1, 1, 1);
        if (mat.normalScale) mat.normalScale.set(cfg.normalScale, cfg.normalScale);
        mat.needsUpdate = true;
      }

      for (const mat of cathedralColumnMats) {
        mat.map = mat.userData.origMap || mat.map;
        mat.normalMap = mat.userData.origNormalMap || mat.normalMap;
        mat.roughnessMap = mat.userData.origRoughnessMap || mat.roughnessMap;
        mat.emissiveMap = mat.userData.origEmissiveMap || null;
        mat.emissiveIntensity = 0.08;
        mat.roughness = cfg.roughness;
        mat.metalness = 0.02;
        if ('envMapIntensity' in mat) mat.envMapIntensity = 0.48;
        if (mat.color) mat.color.setRGB(1, 1, 1);
        if (mat.normalScale) mat.normalScale.set(cfg.colNormalScale, cfg.colNormalScale);
        mat.needsUpdate = true;
      }

      return { index: 0, name: cfg.name, fullName: cfg.fullName };
    }

    function setFloorStoneLook() {
      currentFloorStoneLookIdx = 0;
      const cfg = FLOOR_STONE_LOOKS[0];

      for (const mat of cathedralFloorMats) {
        mat.map = mat.userData.origMap || mat.map;
        mat.normalMap = mat.userData.origNormalMap || mat.normalMap;
        mat.roughnessMap = mat.userData.origRoughnessMap || mat.roughnessMap;
        mat.emissiveMap = mat.userData.origEmissiveMap || null;
        mat.emissiveIntensity = 0.06;
        mat.roughness = cfg.roughness;
        mat.metalness = cfg.metalness;
        if (mat.color) mat.color.setRGB(1, 1, 1);
        if ('envMapIntensity' in mat) mat.envMapIntensity = 0.36;
        if (mat.normalScale) mat.normalScale.set(cfg.normalScale, cfg.normalScale);
        mat.needsUpdate = true;
      }

      return { index: 0, name: cfg.name, fullName: cfg.fullName };
    }

    function nextWallStoneLook() {
      return setWallStoneLook(0);
    }
    function prevWallStoneLook() {
      return setWallStoneLook(0);
    }
    function nextFloorStoneLook() {
      return setFloorStoneLook(0);
    }
    function prevFloorStoneLook() {
      return setFloorStoneLook(0);
    }

    async function loadAllAssets() {
      const loaderBar = document.getElementById('loader-bar');
      const loaderText = document.getElementById('loader-text');
      const totalItems = PIECE_TYPES.length + 1;

      async function loadGltfModel(baseName) {
        let arrayBuffer = null;
        try {
          const resB64 = await fetch(`./assets/glb/${baseName}.glb.gz.b64`);
          if (resB64.ok) {
            const b64Text = (await resB64.text()).trim();
            if (b64Text.length > 64) {
              // Fast native C++ browser data-URI base64 decode (avoids multi-million charCodeAt JS loop on main thread)
              let gzBlob = null;
              try {
                const dataRes = await fetch(`data:application/octet-stream;base64,${b64Text}`);
                gzBlob = await dataRes.blob();
              } catch (innerErr) {
                const binStr = atob(b64Text);
                const gzBytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) {
                  gzBytes[i] = binStr.charCodeAt(i);
                }
                gzBlob = new Blob([gzBytes]);
              }
              const ds = new DecompressionStream('gzip');
              const stream = gzBlob.stream().pipeThrough(ds);
              arrayBuffer = await new Response(stream).arrayBuffer();
            }
          }
        } catch (e) {}

        if (!arrayBuffer) {
          const resGlb = await fetch(`./assets/glb/${baseName}.glb`);
          if (!resGlb.ok) throw new Error(`Failed to fetch ${baseName}`);
          arrayBuffer = await resGlb.arrayBuffer();
        }

        return new Promise((resolve, reject) => {
          gltfLoader.parse(arrayBuffer, './assets/glb/', (gltf) => resolve(gltf), (err) => reject(err));
        });
      }
      let loadedCount = 0;

      function bumpProgress(label) {
        loadedCount++;
        const pct = Math.min(100, Math.round((loadedCount / totalItems) * 100));
        if (loaderBar) loaderBar.style.width = `${pct}%`;
        if (loaderText) loaderText.textContent = label;
      }

      // Instantiate custom GLSL shaders for the 3 sculpted brazier flame layers & charred ember logs
      const flameCoreShader = createSculptedFlameTongueShader({
        baseColor: [1.0, 0.96, 0.72],
        midColor: [1.0, 0.64, 0.12],
        tipColor: [1.0, 0.36, 0.03],
        strength: graphicsQuality === 'low' ? 2.05 : 1.85,
        opacity: 0.92,
        zMin: 0.60,
        zMax: 1.64,
        layerSeed: 0.0
      });
      flameCoreShaderRef = flameCoreShader;
      const flameMidShader = createSculptedFlameTongueShader({
        baseColor: [1.0, 0.78, 0.25],
        midColor: [1.0, 0.40, 0.04],
        tipColor: [0.92, 0.16, 0.01],
        strength: 1.35,
        opacity: 0.82,
        zMin: 0.60,
        zMax: 1.52,
        layerSeed: 2.1
      });
      const flameOuterShader = createSculptedFlameTongueShader({
        baseColor: [1.0, 0.45, 0.06],
        midColor: [0.88, 0.18, 0.015],
        tipColor: [0.45, 0.03, 0.002],
        strength: graphicsQuality === 'low' ? 1.08 : 0.95,
        opacity: 0.68,
        zMin: 0.60,
        zMax: 1.36,
        layerSeed: 4.4
      });
      flameOuterShaderRef = flameOuterShader;
      const charredEmberLogsShader = createCharredEmberLogsShader();

      // Load Cathedral + All 6 Chess Piece Models in PARALLEL for 3x faster startup!
      const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy() || 8, 8);

      const cathedralPromise = loadGltfModel('option8_cathedral')
        .then((gltf) => {
          const cathedralRoot = gltf.scene;
          cathedralRoot.position.set(0, 0, -0.65);

          cathedralRoot.traverse((child) => {
            if (!child.isMesh) return;
            child.receiveShadow = true;
            const meshName = child.name || '';
            const mNameFirst = (Array.isArray(child.material) ? child.material[0]?.name : child.material?.name) || '';

            if (meshName.includes('Brazier_Flame_Core') || mNameFirst.includes('Flame_Core')) {
              child.material = flameCoreShader;
              child.castShadow = false;
              child.receiveShadow = false;
              child.renderOrder = 12;
              return;
            }
            if (meshName.includes('Brazier_Flame_Mid') || mNameFirst.includes('Flame_Mid')) {
              stripIcosphereSparksFromFlameGeometry(child.geometry);
              child.material = flameMidShader;
              child.castShadow = false;
              child.receiveShadow = false;
              child.renderOrder = 11;
              child.visible = graphicsQuality !== 'low';
              brazierFlameMidMeshes.push(child);
              return;
            }
            if (meshName.includes('Brazier_Flame_Outer') || mNameFirst.includes('Flame_Outer')) {
              child.material = flameOuterShader;
              child.castShadow = false;
              child.receiveShadow = false;
              child.renderOrder = 10;
              return;
            }
            if (meshName.includes('Embers_Logs') || mNameFirst.includes('Ember')) {
              child.material = charredEmberLogsShader;
              child.castShadow = false;
              child.receiveShadow = false;
              return;
            }

            const isShadowCasterProp =
              meshName.includes('Obsidian_Altar') ||
              meshName.includes('Altar_Golden_Runes');

            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) {
              if (!mat) continue;
              const mName = mat.name || '';
              const isAmberGlass =
                mName.includes('Amber') ||
                mName.includes('Narthex_Amber') ||
                meshName.includes('Narthex_Amber');
              const isGlass =
                isAmberGlass ||
                mName.includes('Glass') ||
                mName.includes('Lancet') ||
                mName.includes('Rose') ||
                meshName.includes('Glass') ||
                meshName.includes('Window');
              const isRay = mName.includes('GodRay') || meshName.includes('GodRay');

              for (const texKey of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
                if (mat[texKey]) {
                  mat[texKey].anisotropy = maxAniso;
                  mat[texKey].needsUpdate = true;
                }
              }

              if (!mat.userData.origCaptured) {
                mat.userData.origCaptured = true;
                mat.userData.origMap = mat.map || null;
                mat.userData.origNormalMap = mat.normalMap || null;
                mat.userData.origRoughnessMap = mat.roughnessMap || null;
                mat.userData.origEmissiveMap = mat.emissiveMap || null;
              }

              if (mat.normalMap && mat.normalScale) {
                const isDoorMat = mName.includes('Oak') || mName.includes('Door') || meshName.includes('Door');
                const nScale = isDoorMat ? 1.05 : 1.15;
                mat.normalScale.set(nScale, nScale);
              }

              if (isAmberGlass) {
                mat.vertexColors = false;
                mat.color = new THREE.Color(0xffe6b8);
                mat.emissive = new THREE.Color(0xffa033);
                mat.emissiveIntensity = 2.45;
                mat.roughness = 0.15;
                mat.metalness = 0.0;
                mat.side = THREE.DoubleSide;
                child.castShadow = false;
              } else if (isGlass) {
                mat.vertexColors = false;
                mat.color = new THREE.Color(0xdbeeff);
                mat.emissive = new THREE.Color(0x68a8ff);
                mat.emissiveIntensity = 2.65;
                mat.roughness = 0.15;
                mat.metalness = 0.0;
                mat.side = THREE.DoubleSide;
                child.castShadow = false;
              } else if (isRay) {
                child.visible = false;
                child.castShadow = false;
                child.receiveShadow = false;
              } else {
                if (mat.map) {
                  mat.vertexColors = true;
                }
                child.castShadow = isShadowCasterProp;

                if (mName.includes('Floor') || mName.includes('Flagstone') || meshName.includes('Floor')) {
                  applyCathedralStoneRealismShader(mat, true);
                  if (!cathedralFloorMats.includes(mat)) cathedralFloorMats.push(mat);
                } else if (
                  mName.includes('Column_Stone') ||
                  mName.includes('Tracery') ||
                  meshName.includes('Plinth') ||
                  meshName.includes('Tracery')
                ) {
                  applyCathedralStoneRealismShader(mat, false);
                  if (!cathedralColumnMats.includes(mat)) cathedralColumnMats.push(mat);
                } else if (
                  mName.includes('Gothic_Ashlar') ||
                  mName.includes('Ashlar') ||
                  mName.includes('Vault') ||
                  meshName.includes('Cathedral_Stone')
                ) {
                  applyCathedralStoneRealismShader(mat, false);
                  if (!cathedralWallMats.includes(mat)) cathedralWallMats.push(mat);
                }
              }
              mat.needsUpdate = true;
            }
          });

          setWallStoneLook(0);
          setFloorStoneLook(0);
          scene.add(cathedralRoot);

          // Freeze static cathedral world matrices so Three.js never recomputes them every frame!
          cathedralRoot.updateMatrixWorld(true);
          cathedralRoot.traverse((child) => {
            child.matrixAutoUpdate = false;
          });
          boardGroup.updateMatrixWorld(true);
          boardGroup.traverse((child) => {
            child.matrixAutoUpdate = false;
          });

          bumpProgress('Cathedral Architecture Loaded...');
        })
        .catch((err) => {
          console.warn('Cathedral GLB load warning:', err);
          bumpProgress('Cathedral Loaded');
        });

      const piecePromises = PIECE_TYPES.map((type) =>
        loadGltfModel(`${type}_white`)
          .then((gltf) => {
            const toRemove = [];
            gltf.scene.traverse((child) => {
              const nm = child.name || '';
              if (nm.includes('Icosphere') || nm.includes('glTF_not_exported')) {
                child.visible = false;
                toRemove.push(child);
              }
            });
            for (const rem of toRemove) {
              if (rem.parent) rem.parent.remove(rem);
            }

            const tpl = {
              scene: gltf.scene,
              animations: gltf.animations || []
            };
            pieceTemplates[`${type}_w`] = tpl;
            pieceTemplates[`${type}_b`] = tpl;
            bumpProgress(`Summoned ${type.toUpperCase()} Statue...`);
          })
          .catch((err) => {
            console.warn(`Piece load warning (${type}):`, err);
            bumpProgress(`Loaded ${type}`);
          })
      );

      await Promise.all([cathedralPromise, ...piecePromises]);

      // Pre-warm shaders before hiding loading screen to eliminate first-frame stutter
      if (!isSoftwareGl) {
        try {
          renderer.compile(scene, camera);
        } catch (e) {}
      }

      document.getElementById('loading-overlay')?.classList.add('hidden');
    }

    // =========================================================================
    // Chess Game State, Complete Move Rules, and AI Engine
    // =========================================================================
    let boardState = Array.from({ length: 8 }, () => Array(8).fill(null));
    let currentTurn = 'w';
    let selectedSquare = null;
    let validMoves = [];
    let isAnimatingMove = false;
    let gameOver = false;
    let capturedByWhite = 0;
    let capturedByBlack = 0;

    // Mode & Player Configuration
    let gameMode = 'single'; // 'single' | 'multi'
    let playerColor = 'w';   // 'w' | 'b' | 'spectator'
    let aiAutoPlay = true;
    let aiTimer = null;

    // Multiplayer State
    let roomCode = null;
    let playerToken = localStorage.getItem('wizard_chess_token') || '';
    let roomEventSource = null;
    let roomPollTimer = null;
    let appliedMoveSeq = 0;
    let appliedResetCount = 0;

    // Camera Animation & Telemetry State
    const cameraTelemetry = {
      lastAttackSamples: [],
      attackCount: 0,
      maxStepDelta: 0,
      columnDeflections: 0,
      minColumnClearance: Infinity,
      lastColumnClearance: Infinity
    };
    window.__wizardChessTelemetry = cameraTelemetry;

    let activeCamTransition = null; // { startPos, endPos, startTarget, endTarget, elapsed, duration }

    function flushOrbitControlsDamping() {
      const wasDamping = orbitControls.enableDamping;
      orbitControls.enableDamping = false;
      orbitControls.update();
      enforceCathedralBoundsAndSolidColumns(null, camera.position, orbitControls.target);
      camera.lookAt(orbitControls.target);
      orbitControls.enableDamping = wasDamping;
    }

    function smoothCameraTo(targetPos, targetLookAt, duration = 0.75) {
      flushOrbitControlsDamping();
      const clampedPos = targetPos.clone();
      const clampedLook = targetLookAt.clone();
      enforceCathedralBoundsAndSolidColumns(clampedPos, clampedPos, clampedLook);
      activeCamTransition = {
        startPos: camera.position.clone(),
        endPos: clampedPos,
        startTarget: orbitControls.target.clone(),
        endTarget: clampedLook,
        elapsed: 0,
        duration: Math.max(0.05, duration)
      };
    }

    function setCameraForSide(color, immediate = false) {
      // White sits at +Z looking toward -Z (across the Obsidian Altar down the Cathedral Nave & Rose Window)
      // Black sits at -Z looking toward +Z (across the Obsidian Altar toward the South Narthex Royal Amber Triptych)
      const zSign = color === 'b' ? -1 : 1;
      const desiredPos = new THREE.Vector3(0, 2.22, zSign * 2.72);
      const desiredTarget = new THREE.Vector3(0, 0.85, zSign * -0.15);
      if (immediate) {
        activeCamTransition = null;
        camera.position.copy(desiredPos);
        orbitControls.target.copy(desiredTarget);
        flushOrbitControlsDamping();
      } else {
        smoothCameraTo(desiredPos, desiredTarget, 0.8);
      }
    }

    // Zero-Allocation 3D Piece Pool (reuses cloned SkinnedMeshes & AnimationMixers across New Game / Undo / Promotion)
    const piecePool = {};
    const activePiecesList = [];

    function recyclePieceInstance(piece) {
      if (!piece) return;
      if (piece.mesh && piece.mesh.parent) {
        piece.mesh.parent.remove(piece.mesh);
      }
      if (piece.mixer) {
        piece.mixer.stopAllAction();
      }
      piece.currentAction = null;
      piece.isIdleState = true;
      const idx = activePiecesList.indexOf(piece);
      if (idx !== -1) activePiecesList.splice(idx, 1);
      const poolKey = `${piece.type}_${piece.color}`;
      if (!piecePool[poolKey]) piecePool[poolKey] = [];
      piecePool[poolKey].push(piece);
    }

    function instantiatePiece(type, color, r, c) {
      const poolKey = `${type}_${color}`;
      let pieceObj = piecePool[poolKey]?.pop() || null;

      if (!pieceObj) {
        const tpl = pieceTemplates[poolKey];
        let root;
        let mixer = null;
        const actions = {};

        if (tpl && tpl.scene) {
          root = SkeletonUtils.clone(tpl.scene);
          const primaryMat = color === 'w' ? whitePieceMat : blackPieceMat;
          root.traverse((child) => {
            const nm = child.name || '';
            if (nm.includes('Icosphere') || nm.includes('glTF_not_exported')) {
              child.visible = false;
              return;
            }
            if (child.isMesh) {
              const mName = child.material?.name || '';
              if (mName.includes('Gold') || mName.includes('Trim') || mName.includes('Bronze') || mName.includes('Glow')) {
                child.material = goldTrimMat;
              } else if (mName.includes('Steel')) {
                child.material = forgedSteelMat;
              } else {
                child.material = primaryMat;
              }
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          mixer = new THREE.AnimationMixer(root);
          for (const clip of tpl.animations) {
            actions[clip.name] = mixer.clipAction(clip);
          }
        } else {
          root = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.14, 0.42, 16),
            color === 'w' ? whitePieceMat : blackPieceMat
          );
        }

        pieceObj = {
          type,
          color,
          r,
          c,
          mesh: root,
          mixer,
          actions,
          currentAction: null,
          isIdleState: true,
          fadeUntilTime: 0,
          hasMoved: false
        };

        root.traverse((child) => {
          child.userData.piece = pieceObj;
        });
      }

      pieceObj.r = r;
      pieceObj.c = c;
      pieceObj.hasMoved = false;
      pieceObj.currentAction = null;
      pieceObj.isIdleState = true;

      const root = pieceObj.mesh;
      const worldPos = boardToWorld(r, c);
      root.position.copy(worldPos);
      const scale = BOARD_SQ_SIZE;
      root.scale.set(scale, scale, scale);
      root.rotation.set(0, color === 'w' ? Math.PI : 0, 0);
      scene.add(root);

      if (pieceObj.mixer && !activeMixers.includes(pieceObj.mixer)) {
        activeMixers.push(pieceObj.mixer);
      }
      if (!activePiecesList.includes(pieceObj)) {
        activePiecesList.push(pieceObj);
      }

      playPieceClip(pieceObj, 'Idle', true, 0);
      return pieceObj;
    }

    // Exact per-piece Attack keyframe synchronization (24 fps Blender clips, zero overhead suspension freeze):
    // - All 6 pieces wind up smoothly through Frame 8..10 (0.29s..0.38s), launch their weapon strike at Frame 9..10 (0.35s..0.38s),
    //   make physical weapon contact at Frame 15 (0.58s..0.60s), and drive through the opponent at Frame 19.5..20 (0.76s..0.79s) before shatter burst!
    const ATTACK_SYNC_PROFILES = {
      pawn:   { timeScale: 1.15, swingStartClip: 0.36, contactClip: 0.60, blowClip: 0.78, maxLunge: 0.095 },
      king:   { timeScale: 1.10, swingStartClip: 0.34, contactClip: 0.56, blowClip: 0.75, maxLunge: 0.080 },
      queen:  { timeScale: 1.08, swingStartClip: 0.35, contactClip: 0.58, blowClip: 0.77, maxLunge: 0.065 },
      rook:   { timeScale: 1.06, swingStartClip: 0.35, contactClip: 0.58, blowClip: 0.77, maxLunge: 0.055 },
      knight: { timeScale: 1.08, swingStartClip: 0.35, contactClip: 0.58, blowClip: 0.77, maxLunge: 0.060 },
      bishop: { timeScale: 1.08, swingStartClip: 0.35, contactClip: 0.58, blowClip: 0.77, maxLunge: 0.065 }
    };

    function playPieceClip(piece, clipKeyword, loop = true, fadeSeconds = 0.18) {
      if (!piece || !piece.actions) return;
      const lowerKw = clipKeyword.toLowerCase();
      const key = Object.keys(piece.actions).find((k) =>
        k.toLowerCase().includes(lowerKw)
      );
      if (!key) return;
      const nextAction = piece.actions[key];
      const isIdle = lowerKw.includes('idle');
      const isAttack = lowerKw.includes('attack');
      piece.isIdleState = isIdle;
      piece.fadeUntilTime = (typeof elapsedTotal === 'number' ? elapsedTotal : 0) + (fadeSeconds || 0) + 0.1;

      if (piece.currentAction && piece.currentAction !== nextAction) {
        piece.currentAction.fadeOut(fadeSeconds);
      }
      nextAction.reset();
      nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      nextAction.clampWhenFinished = !loop;
      if (isAttack) {
        const prof = ATTACK_SYNC_PROFILES[piece.type] || ATTACK_SYNC_PROFILES.queen;
        nextAction.timeScale = prof.timeScale;
      } else {
        // Deliberate, weighty stone stride and idle breathing (another 10% slower than 0.90)
        nextAction.timeScale = 0.81;
      }
      if (isIdle && (!fadeSeconds || fadeSeconds <= 0.01)) {
        // Stagger initial idle phase per board square so the 32 pieces breathe organically out of lockstep
        nextAction.time = ((piece.r * 5 + piece.c * 3) % 16) * 0.11;
      }
      nextAction.fadeIn(fadeSeconds).play();
      piece.currentAction = nextAction;
      if (piece.mixer) {
        piece.mixer.update(0.016);
      }
      renderer.shadowMap.needsUpdate = true;
    }

    function clearAllPieces() {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (boardState[r][c]) {
            recyclePieceInstance(boardState[r][c]);
          }
          boardState[r][c] = null;
        }
      }
      activeMixers.length = 0;
      activePiecesList.length = 0;
    }

    // Scripted Chess Notation & Step-Through Choreography State (Features 3a, 3b, 3c)
    let scriptedGameActive = false;
    let scriptDeviated = false;
    let scriptMoves = [];
    let scriptCursor = 0;
    let moveHistory = [];
    let preMoveHighlightTask = null;
    let activeDuelSavedCam = null;
    let checkmateState = {
      active: false,
      bannerVisible: false,
      defeatedColor: null,
      winnerColor: null,
      kingFallAngleDeg: 0,
      phase: 'none'
    };

    function clearCheckmateSequence() {
      checkmateState.active = false;
      checkmateState.bannerVisible = false;
      checkmateState.defeatedColor = null;
      checkmateState.winnerColor = null;
      checkmateState.kingFallAngleDeg = 0;
      checkmateState.phase = 'none';
      const overlay = document.getElementById('checkmate-overlay');
      if (overlay) {
        overlay.classList.remove(
          'visible',
          'victory-flair-active',
          'defeat-banner-active',
          'draw-banner-active'
        );
      }
      const replayBtn = document.getElementById('btn-checkmate-replay');
      if (replayBtn) {
        replayBtn.style.display = '';
      }
    }

    function captureBoardSnapshot() {
      return {
        currentTurn,
        gameOver,
        capturedByWhite,
        capturedByBlack,
        scriptCursor,
        scriptedGameActive,
        scriptDeviated,
        cells: boardState.map((row) =>
          row.map((p) => (p ? { type: p.type, color: p.color, hasMoved: Boolean(p.hasMoved) } : null))
        )
      };
    }

    function restoreBoardSnapshot(snap) {
      if (!snap) return false;
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
      preMoveHighlightTask = null;
      activeMoveTweens.length = 0;
      clearCheckmateSequence();
      for (const d of shatterDebris) {
        if (d.mesh) scene.remove(d.mesh);
      }
      shatterDebris.length = 0;
      impactFlashLight.intensity = 0;
      impactFlashLight.visible = false;
      if (activeDuelSavedCam) {
        camera.position.copy(activeDuelSavedCam.pos);
        orbitControls.target.copy(activeDuelSavedCam.target);
        activeDuelSavedCam = null;
      }
      orbitControls.enabled = true;
      orbitControls.update();

      clearAllPieces();
      clearSquareHighlights();
      selectedSquare = null;
      validMoves = [];
      isAnimatingMove = false;
      currentTurn = snap.currentTurn;
      gameOver = snap.gameOver;
      capturedByWhite = snap.capturedByWhite;
      capturedByBlack = snap.capturedByBlack;
      if (typeof snap.scriptCursor === 'number') {
        scriptCursor = snap.scriptCursor;
      }
      if (typeof snap.scriptedGameActive === 'boolean') {
        scriptedGameActive = snap.scriptedGameActive;
      }
      if (typeof snap.scriptDeviated === 'boolean') {
        scriptDeviated = snap.scriptDeviated;
      }

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const cell = snap.cells[r][c];
          if (cell) {
            const inst = instantiatePiece(cell.type, cell.color, r, c);
            inst.hasMoved = Boolean(cell.hasMoved);
            boardState[r][c] = inst;
          }
        }
      }

      renderer.shadowMap.needsUpdate = true;
      updateTurnUI();
      if (typeof updateScriptBarUI === 'function') updateScriptBarUI();
      return true;
    }

    function resetChessBoard(orientCamera = true, preserveScript = false) {
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
      preMoveHighlightTask = null;
      activeMoveTweens.length = 0;
      clearCheckmateSequence();
      if (activeDuelSavedCam) {
        camera.position.copy(activeDuelSavedCam.pos);
        orbitControls.target.copy(activeDuelSavedCam.target);
        activeDuelSavedCam = null;
      }
      orbitControls.enabled = true;
      clearAllPieces();
      clearSquareHighlights();
      selectedSquare = null;
      validMoves = [];
      currentTurn = 'w';
      isAnimatingMove = false;
      gameOver = false;
      capturedByWhite = 0;
      capturedByBlack = 0;
      moveHistory = [];
      scriptDeviated = false;
      if (!preserveScript) {
        scriptCursor = 0;
      }

      const backRow = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
      for (let c = 0; c < 8; c++) {
        boardState[7][c] = instantiatePiece(backRow[c], 'w', 7, c);
        boardState[6][c] = instantiatePiece('pawn', 'w', 6, c);
        boardState[1][c] = instantiatePiece('pawn', 'b', 1, c);
        boardState[0][c] = instantiatePiece(backRow[c], 'b', 0, c);
      }

      if (orientCamera) {
        const viewSide = playerColor === 'b' ? 'b' : 'w';
        playerCamSide = viewSide;
        setActiveCamButton('btn-cam-player');
        setCameraForSide(viewSide, false);
      }

      renderer.shadowMap.needsUpdate = true;
      updateTurnUI();
      if (typeof updateScriptBarUI === 'function') updateScriptBarUI();
      maybeScheduleAIMove();
    }

    // =========================================================================
    // Legal Chess Move Generation (Including Check Filtering)
    // =========================================================================
    function getPseudoMovesForPiece(r, c, board = boardState) {
      const piece = board[r][c];
      if (!piece) return [];
      const moves = [];
      const { type, color } = piece;
      const dir = color === 'w' ? -1 : 1;

      const inBounds = (nr, nc) => nr >= 0 && nr < 8 && nc >= 0 && nc < 8;
      const addMove = (nr, nc) => {
        if (!inBounds(nr, nc)) return false;
        const target = board[nr][nc];
        if (!target) {
          moves.push({ r: nr, c: nc, capture: false });
          return true;
        } else if (target.color !== color) {
          moves.push({ r: nr, c: nc, capture: true });
          return false;
        }
        return false;
      };

      if (type === 'pawn') {
        if (inBounds(r + dir, c) && !board[r + dir][c]) {
          moves.push({ r: r + dir, c, capture: false });
          const startRow = color === 'w' ? 6 : 1;
          if (r === startRow && !board[r + dir * 2][c]) {
            moves.push({ r: r + dir * 2, c, capture: false });
          }
        }
        for (const dc of [-1, 1]) {
          if (inBounds(r + dir, c + dc)) {
            const target = board[r + dir][c + dc];
            if (target && target.color !== color) {
              moves.push({ r: r + dir, c: c + dc, capture: true });
            }
          }
        }
      } else if (type === 'knight') {
        const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of jumps) addMove(r + dr, c + dc);
      } else if (type === 'king') {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr !== 0 || dc !== 0) addMove(r + dr, c + dc);
          }
        }
      } else {
        const dirs = [];
        if (type === 'rook' || type === 'queen') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
        if (type === 'bishop' || type === 'queen') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
        for (const [dr, dc] of dirs) {
          for (let step = 1; step < 8; step++) {
            if (!addMove(r + dr * step, c + dc * step)) break;
          }
        }
      }
      return moves;
    }

    const KNIGHT_OFFSETS = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    const ORTHO_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const DIAG_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    // Zero-allocation O(1) attack detector (checks outward from target square, 40x faster than scanning all pieces)
    function isSquareAttacked(targetR, targetC, attackerColor, board = boardState) {
      // 1. Pawn attacks (a pawn of attackerColor attacks targetR from targetR - pawnDir)
      const pawnAttackFromR = attackerColor === 'w' ? targetR + 1 : targetR - 1;
      if (pawnAttackFromR >= 0 && pawnAttackFromR < 8) {
        if (targetC > 0) {
          const pl = board[pawnAttackFromR][targetC - 1];
          if (pl && pl.color === attackerColor && pl.type === 'pawn') return true;
        }
        if (targetC < 7) {
          const pr = board[pawnAttackFromR][targetC + 1];
          if (pr && pr.color === attackerColor && pr.type === 'pawn') return true;
        }
      }

      // 2. Knight jumps
      for (let i = 0; i < 8; i++) {
        const nr = targetR + KNIGHT_OFFSETS[i][0];
        const nc = targetC + KNIGHT_OFFSETS[i][1];
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const p = board[nr][nc];
          if (p && p.color === attackerColor && p.type === 'knight') return true;
        }
      }

      // 3. Adjacent King
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = targetR + dr;
          const nc = targetC + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const p = board[nr][nc];
            if (p && p.color === attackerColor && p.type === 'king') return true;
          }
        }
      }

      // 4. Orthogonal sliding rays (Rook / Queen)
      for (let d = 0; d < 4; d++) {
        const dr = ORTHO_DIRS[d][0];
        const dc = ORTHO_DIRS[d][1];
        let nr = targetR + dr;
        let nc = targetC + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const p = board[nr][nc];
          if (p) {
            if (p.color === attackerColor && (p.type === 'rook' || p.type === 'queen')) {
              return true;
            }
            break;
          }
          nr += dr;
          nc += dc;
        }
      }

      // 5. Diagonal sliding rays (Bishop / Queen)
      for (let d = 0; d < 4; d++) {
        const dr = DIAG_DIRS[d][0];
        const dc = DIAG_DIRS[d][1];
        let nr = targetR + dr;
        let nc = targetC + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const p = board[nr][nc];
          if (p) {
            if (p.color === attackerColor && (p.type === 'bishop' || p.type === 'queen')) {
              return true;
            }
            break;
          }
          nr += dr;
          nc += dc;
        }
      }

      return false;
    }

    function isKingInCheck(color, board = boardState) {
      let kingR = -1;
      let kingC = -1;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p && p.color === color && p.type === 'king') {
            kingR = r;
            kingC = c;
            break;
          }
        }
        if (kingR !== -1) break;
      }
      if (kingR === -1) return true;
      const oppColor = color === 'w' ? 'b' : 'w';
      return isSquareAttacked(kingR, kingC, oppColor, board);
    }

    function getLegalMovesForPiece(r, c) {
      const piece = boardState[r][c];
      if (!piece) return [];
      const pseudo = getPseudoMovesForPiece(r, c, boardState);
      const legal = [];
      for (const m of pseudo) {
        const savedTarget = boardState[m.r][m.c];
        boardState[m.r][m.c] = piece;
        boardState[r][c] = null;
        const inCheck = isKingInCheck(piece.color, boardState);
        boardState[r][c] = piece;
        boardState[m.r][m.c] = savedTarget;
        if (!inCheck) legal.push(m);
      }

      // Castling (Kingside O-O to c=6, Queenside O-O-O to c=2)
      const homeRow = piece.color === 'w' ? 7 : 0;
      if (
        piece.type === 'king' &&
        !piece.hasMoved &&
        r === homeRow &&
        c === 4 &&
        !isKingInCheck(piece.color, boardState)
      ) {
        // Kingside (O-O: King e->g [4->6], Rook h->f [7->5])
        const kRook = boardState[homeRow][7];
        if (
          kRook &&
          kRook.type === 'rook' &&
          kRook.color === piece.color &&
          !kRook.hasMoved &&
          !boardState[homeRow][5] &&
          !boardState[homeRow][6]
        ) {
          boardState[homeRow][5] = piece;
          boardState[homeRow][4] = null;
          const checkF = isKingInCheck(piece.color, boardState);
          boardState[homeRow][6] = piece;
          boardState[homeRow][5] = null;
          const checkG = isKingInCheck(piece.color, boardState);
          boardState[homeRow][4] = piece;
          boardState[homeRow][6] = null;
          if (!checkF && !checkG) {
            legal.push({ r: homeRow, c: 6, capture: false, castle: 'k', rookFromC: 7, rookToC: 5 });
          }
        }
        // Queenside (O-O-O: King e->c [4->2], Rook a->d [0->3])
        const qRook = boardState[homeRow][0];
        if (
          qRook &&
          qRook.type === 'rook' &&
          qRook.color === piece.color &&
          !qRook.hasMoved &&
          !boardState[homeRow][1] &&
          !boardState[homeRow][2] &&
          !boardState[homeRow][3]
        ) {
          boardState[homeRow][3] = piece;
          boardState[homeRow][4] = null;
          const checkD = isKingInCheck(piece.color, boardState);
          boardState[homeRow][2] = piece;
          boardState[homeRow][3] = null;
          const checkC = isKingInCheck(piece.color, boardState);
          boardState[homeRow][4] = piece;
          boardState[homeRow][2] = null;
          if (!checkD && !checkC) {
            legal.push({ r: homeRow, c: 2, capture: false, castle: 'q', rookFromC: 0, rookToC: 3 });
          }
        }
      }

      return legal;
    }

    function getAllLegalMoves(color) {
      const all = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = boardState[r][c];
          if (p && p.color === color) {
            const moves = getLegalMovesForPiece(r, c);
            for (const m of moves) {
              all.push({ fromR: r, fromC: c, toR: m.r, toC: m.c, capture: m.capture });
            }
          }
        }
      }
      return all;
    }

    // =========================================================================
    // Square Highlights
    // =========================================================================
    // Shared Square Highlight Geometries & Materials (Zero per-click GPU allocations)
    const sharedSelRingGeo = new THREE.RingGeometry(0.115, 0.155, 24);
    sharedSelRingGeo.rotateX(-Math.PI / 2);
    const sharedSelRingMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e, side: THREE.DoubleSide });

    const sharedCapRingGeo = new THREE.RingGeometry(0.12, 0.16, 24);
    sharedCapRingGeo.rotateX(-Math.PI / 2);
    const sharedCapRingMat = new THREE.MeshBasicMaterial({ color: 0xe63946, side: THREE.DoubleSide });

    const sharedMoveDotGeo = new THREE.CircleGeometry(0.06, 18);
    sharedMoveDotGeo.rotateX(-Math.PI / 2);
    const sharedMoveDotMat = new THREE.MeshBasicMaterial({
      color: 0x4ea8de,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });

    function clearSquareHighlights() {
      while (squareHighlightsGroup.children.length > 0) {
        squareHighlightsGroup.remove(squareHighlightsGroup.children[0]);
      }
    }

    function showSquareHighlights(r, c, moves) {
      clearSquareHighlights();
      const selMesh = new THREE.Mesh(sharedSelRingGeo, sharedSelRingMat);
      const selPos = boardToWorld(r, c);
      selMesh.position.set(selPos.x, BOARD_SURFACE_Y + 0.01, selPos.z);
      squareHighlightsGroup.add(selMesh);

      for (const m of moves) {
        const pos = boardToWorld(m.r, m.c);
        if (m.capture) {
          const capMesh = new THREE.Mesh(sharedCapRingGeo, sharedCapRingMat);
          capMesh.position.set(pos.x, BOARD_SURFACE_Y + 0.012, pos.z);
          squareHighlightsGroup.add(capMesh);
        } else {
          const dotMesh = new THREE.Mesh(sharedMoveDotGeo, sharedMoveDotMat);
          dotMesh.position.set(pos.x, BOARD_SURFACE_Y + 0.01, pos.z);
          squareHighlightsGroup.add(dotMesh);
        }
      }
    }

    // =========================================================================
    // Red Court Check Alert ("Raja Check Hoile Red Hobe Court Ta")
    // =========================================================================
    const checkCourtWashGeo = new THREE.PlaneGeometry(8 * BOARD_SQ_SIZE, 8 * BOARD_SQ_SIZE);
    checkCourtWashGeo.rotateX(-Math.PI / 2);
    const checkKingTileGeo = new THREE.PlaneGeometry(BOARD_SQ_SIZE * 0.96, BOARD_SQ_SIZE * 0.96);
    checkKingTileGeo.rotateX(-Math.PI / 2);
    const checkOuterRingGeo = new THREE.RingGeometry(0.125, 0.168, 36);
    checkOuterRingGeo.rotateX(-Math.PI / 2);
    const checkInnerRingGeo = new THREE.RingGeometry(0.082, 0.112, 36);
    checkInnerRingGeo.rotateX(-Math.PI / 2);

    function updateCheckCourtAlert(inCheck, checkedColor = currentTurn) {
      while (checkAlertGroup.children.length > 0) {
        checkAlertGroup.remove(checkAlertGroup.children[0]);
      }
      checkCourtPulseMats.length = 0;

      const statusPill = document.getElementById('status-pill');
      if (statusPill) {
        statusPill.classList.toggle('in-check-alert', Boolean(inCheck));
      }

      if (!inCheck) {
        for (const bar of boardBorderMeshes) {
          bar.material = goldTrimMat;
        }
        return;
      }

      // Turn the entire 8x8 court frame crimson red
      for (const bar of boardBorderMeshes) {
        bar.material = checkBorderMat;
      }

      // Crimson red wash across the 8x8 court surface
      const courtWashMat = new THREE.MeshBasicMaterial({
        color: 0xd91424,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      courtWashMat.userData = { baseOpacity: 0.22, pulseAmp: 0.09 };
      checkCourtPulseMats.push(courtWashMat);
      const courtWashMesh = new THREE.Mesh(checkCourtWashGeo, courtWashMat);
      courtWashMesh.position.set(0, BOARD_SURFACE_Y + 0.004, 0);
      checkAlertGroup.add(courtWashMesh);

      // Find the checked King's square and highlight it with a glowing crimson square & rings
      let kingR = -1;
      let kingC = -1;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = boardState[r][c];
          if (p && p.type === 'king' && p.color === checkedColor) {
            kingR = r;
            kingC = c;
            break;
          }
        }
      }

      if (kingR !== -1 && kingC !== -1) {
        const kPos = boardToWorld(kingR, kingC);
        const kingTileMat = new THREE.MeshBasicMaterial({
          color: 0xff1e2e,
          transparent: true,
          opacity: 0.56,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        });
        kingTileMat.userData = { baseOpacity: 0.56, pulseAmp: 0.22 };
        checkCourtPulseMats.push(kingTileMat);
        const kingTileMesh = new THREE.Mesh(checkKingTileGeo, kingTileMat);
        kingTileMesh.position.set(kPos.x, BOARD_SURFACE_Y + 0.008, kPos.z);
        checkAlertGroup.add(kingTileMesh);

        const outerMat = new THREE.MeshBasicMaterial({
          color: 0xff2a3b,
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide
        });
        outerMat.userData = { baseOpacity: 0.9, pulseAmp: 0.1 };
        checkCourtPulseMats.push(outerMat);
        const outerMesh = new THREE.Mesh(checkOuterRingGeo, outerMat);
        outerMesh.position.set(kPos.x, BOARD_SURFACE_Y + 0.015, kPos.z);
        checkAlertGroup.add(outerMesh);

        const innerMat = new THREE.MeshBasicMaterial({
          color: 0xffb703,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide
        });
        const innerMesh = new THREE.Mesh(checkInnerRingGeo, innerMat);
        innerMesh.position.set(kPos.x, BOARD_SURFACE_Y + 0.016, kPos.z);
        checkAlertGroup.add(innerMesh);
      }
    }

    // =========================================================================
    // Stone Shatter Debris Physics (Shared VBO to avoid mid-attack GPU buffer allocation)
    // =========================================================================
    const sharedShardGeo = new THREE.DodecahedronGeometry(1, 0);

    function spawnStoneShatter(worldPos, color) {
      const mat = color === 'w' ? whitePieceMat : blackPieceMat;
      const shardCount = isMobileDevice ? 18 : 28;
      for (let i = 0; i < shardCount; i++) {
        const sz = 0.024 + Math.random() * 0.048;
        const frag = new THREE.Mesh(sharedShardGeo, mat);
        frag.scale.setScalar(sz);
        frag.position.set(
          worldPos.x + (Math.random() - 0.5) * 0.16,
          worldPos.y + 0.10 + Math.random() * 0.28,
          worldPos.z + (Math.random() - 0.5) * 0.16
        );
        frag.castShadow = !isMobileDevice;
        scene.add(frag);
        shatterDebris.push({
          mesh: frag,
          baseScale: sz,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 2.2,
            1.2 + Math.random() * 2.0,
            (Math.random() - 0.5) * 2.2
          ),
          rotVel: new THREE.Vector3(
            Math.random() * 9,
            Math.random() * 9,
            Math.random() * 9
          ),
          life: 2.0
        });
      }
      impactFlashLight.position.set(worldPos.x, worldPos.y + 0.4, worldPos.z);
      impactFlashLight.intensity = 7.5;
    }

    // =========================================================================
    // Concrete 3D Piece Dimensions & Anti-Clipping Collision Constants
    // =========================================================================
    const PIECE_HEIGHTS = {
      pawn: 0.36,
      rook: 0.46,
      knight: 0.50,
      bishop: 0.51,
      queen: 0.55,
      king: 0.59
    };
    const MIN_PIECE_SEP = 0.318; // Stone pedestal diameter is ~0.29m; 0.318m enforces a solid concrete gap
    const MELEE_STANDOFF = 0.36; // Optimal melee standoff (1.06 squares) so sword blades visibly bridge the gap and cleave into defender before burst

    // =========================================================================
    // Smooth Attack Camera & Move Execution Choreography
    // =========================================================================
    function executeChessMove(fromR, fromC, toR, toC, options = {}) {
      const piece = boardState[fromR]?.[fromC];
      if (!piece || isAnimatingMove || gameOver) return false;
      if (piece.color !== currentTurn) return false;

      const targetOnDest = boardState[toR]?.[toC];
      // Strictly forbid friendly fire (a piece can never move onto or attack a piece of the same color)
      if (targetOnDest && targetOnDest.color === piece.color) {
        return false;
      }

      if (!options.fromRemote) {
        const legalForPiece = getLegalMovesForPiece(fromR, fromC);
        if (!legalForPiece.some((m) => m.r === toR && m.c === toC)) {
          return false;
        }
      }

      if (preMoveHighlightTask) {
        preMoveHighlightTask = null;
      }

      // Save board state snapshot (including pre-move scriptCursor & scriptDeviated) so Left Arrow / [ can step backward & re-record
      moveHistory.push({
        snapshot: captureBoardSnapshot(),
        move: {
          color: piece.color,
          pieceType: piece.type,
          fromR,
          fromC,
          toR,
          toC,
          capture: Boolean(targetOnDest),
          promotion: options.promotion || 'queen'
        }
      });

      // Advance scriptCursor if executing a scripted move or a manual move matching the script;
      // otherwise mark scriptDeviated = true and exit scriptedGameActive so the user takes over cleanly
      if (options.fromScript) {
        scriptCursor = Math.min(scriptMoves.length, scriptCursor + 1);
      } else if (!scriptDeviated && scriptCursor < scriptMoves.length) {
        const expected = scriptMoves[scriptCursor];
        if (
          expected &&
          expected.fromR === fromR &&
          expected.fromC === fromC &&
          expected.toR === toR &&
          expected.toC === toC
        ) {
          scriptCursor = Math.min(scriptMoves.length, scriptCursor + 1);
        } else {
          scriptDeviated = true;
          scriptedGameActive = false;
        }
      } else if (scriptMoves.length > 0) {
        scriptDeviated = true;
        scriptedGameActive = false;
      }
      if (typeof updateScriptBarUI === 'function') updateScriptBarUI();

      const captured = targetOnDest;
      const isCapture = Boolean(captured);
      isAnimatingMove = true;
      activeCamTransition = null;
      clearSquareHighlights();
      selectedSquare = null;
      validMoves = [];

      // Broadcast to multiplayer room (cloud API + static BroadcastChannel/localStorage fallback)
      if (gameMode === 'multi' && roomCode && !options.fromRemote) {
        sendMultiplayerMove({
          playerToken,
          color: piece.color,
          from: { r: fromR, c: fromC },
          to: { r: toR, c: toC },
          promotion: 'queen'
        });
      }

      const startPos = boardToWorld(fromR, fromC);
      const endPos = boardToWorld(toR, toC);
      const dx = endPos.x - startPos.x;
      const dz = endPos.z - startPos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const dirX = dx / dist;
      const dirZ = dz / dist;
      const moveHeading = Math.atan2(dx, dz);
      piece.mesh.rotation.y = moveHeading;
      playPieceClip(piece, 'Move', true, 0.10);

      // Detect Castling (King moves 2 files horizontally: e1->g1/c1 or e8->g8/c8) and animate the Rook simultaneously
      const isCastling = piece.type === 'king' && fromR === toR && Math.abs(toC - fromC) === 2;
      const castleRookFromC = isCastling ? (toC > fromC ? 7 : 0) : -1;
      const castleRookToC = isCastling ? (toC > fromC ? 5 : 3) : -1;
      const castleRook = isCastling ? boardState[fromR][castleRookFromC] : null;
      const castleRookStartPos = castleRook ? boardToWorld(fromR, castleRookFromC) : null;
      const castleRookEndPos = castleRook ? boardToWorld(fromR, castleRookToC) : null;
      if (castleRook && castleRook.mesh) {
        const rDx = castleRookEndPos.x - castleRookStartPos.x;
        const rDz = castleRookEndPos.z - castleRookStartPos.z;
        castleRook.mesh.rotation.y = Math.atan2(rDx, rDz);
        playPieceClip(castleRook, 'Move', true, 0.10);
      }

      // Defending enemy statue turns to face the incoming attacker shield-to-shield
      if (isCapture && captured && captured.mesh) {
        captured.mesh.rotation.y = Math.atan2(-dx, -dz);
      }

      // Full Concrete Standoff Distance for Melee Strike (0.36m for multi-square captures, scaled to 0.76*dist for 1-square captures so attacker always steps forward)
      const stopOffset = isCapture ? Math.min(MELEE_STANDOFF, dist * 0.76) : 0;
      const strikePos = new THREE.Vector3(
        endPos.x - dirX * stopOffset,
        BOARD_SURFACE_Y,
        endPos.z - dirZ * stopOffset
      );

      // Collect all bystander pieces (both friendly and enemy) on the board for concrete collision avoidance
      const bystanders = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const other = boardState[r][c];
          if (other && other !== piece && other !== captured && other.mesh) {
            bystanders.push({
              piece: other,
              homePos: boardToWorld(r, c),
              height: PIECE_HEIGHTS[other.type] || 0.45
            });
          }
        }
      }

      // Pre-analyze Knight path vs bystanders so Knights cleanly skirt single blockers or vault high over walls
      const segDx = (isCapture ? strikePos.x : endPos.x) - startPos.x;
      const segDz = (isCapture ? strikePos.z : endPos.z) - startPos.z;
      const segLen = Math.hypot(segDx, segDz) || 0.001;
      const segUx = segDx / segLen;
      const segUz = segDz / segLen;
      const segPerpX = -segUz;
      const segPerpZ = segUx;

      let knightLateralSign = 0;
      let knightVaultPeak = 0;
      if (piece.type === 'knight') {
        let blockedPosSide = false;
        let blockedNegSide = false;
        let maxBlockerHeight = 0;
        for (const b of bystanders) {
          const relX = b.homePos.x - startPos.x;
          const relZ = b.homePos.z - startPos.z;
          const proj = relX * segUx + relZ * segUz;
          if (proj > 0.04 && proj < segLen - 0.04) {
            const signedPerp = relX * segPerpX + relZ * segPerpZ;
            if (Math.abs(signedPerp) < MIN_PIECE_SEP) {
              if (signedPerp >= 0) blockedPosSide = true;
              if (signedPerp <= 0) blockedNegSide = true;
              if (b.height > maxBlockerHeight) maxBlockerHeight = b.height;
            }
          }
        }
        if (blockedPosSide && !blockedNegSide) {
          knightLateralSign = -1; // Skirt cleanly around the open -perp channel
        } else if (blockedNegSide && !blockedPosSide) {
          knightLateralSign = 1;  // Skirt cleanly around the open +perp channel
        } else if (blockedPosSide && blockedNegSide) {
          // Solid wall of pieces across both L-channels: vault high above the tallest blocker's crown/helmet
          knightVaultPeak = maxBlockerHeight + 0.09;
        }
      }

      function resetBystandersToHome() {
        for (const b of bystanders) {
          b.piece.mesh.position.copy(b.homePos);
        }
      }

      // Concrete 3D Trajectory Solver: enforces zero mesh intersection against all friendly & enemy bystanders
      const isDiagonalSlide =
        Math.abs(toR - fromR) === Math.abs(toC - fromC) &&
        Math.abs(toR - fromR) >= 1 &&
        piece.type !== 'knight';

      function applyConcreteTrajectory(u, fromVec, toVec) {
        const ease = isCapture ? (0.28 * u + 0.72 * easeInOutCubic(u)) : easeInOutCubic(u);
        let bx = fromVec.x + (toVec.x - fromVec.x) * ease;
        let bz = fromVec.z + (toVec.z - fromVec.z) * ease;
        let by = BOARD_SURFACE_Y;

        const archSin = Math.sin(u * Math.PI);

        if (piece.type === 'knight') {
          if (knightLateralSign !== 0) {
            // Curve horizontally through the open L-corridor
            bx += segPerpX * knightLateralSign * 0.165 * archSin;
            bz += segPerpZ * knightLateralSign * 0.165 * archSin;
            by = BOARD_SURFACE_Y + archSin * 0.06;
          } else if (knightVaultPeak > 0) {
            // Broad, high stone-steed vault that clears the full height of blocking pieces
            by = BOARD_SURFACE_Y + Math.pow(archSin, 0.65) * knightVaultPeak;
          } else {
            by = BOARD_SURFACE_Y + archSin * 0.06;
          }
        }

        // Check every bystander (friendly or enemy) for concrete 3D non-penetration
        const effectiveMinSep = isDiagonalSlide ? 0.262 : MIN_PIECE_SEP;
        for (const b of bystanders) {
          const hx = b.homePos.x;
          const hz = b.homePos.z;
          const dHomeX = bx - hx;
          const dHomeZ = bz - hz;
          const dHome = Math.hypot(dHomeX, dHomeZ);

          // If the moving piece is already vertically above this bystander's top + 2.5cm margin, no horizontal push needed
          if (by >= BOARD_SURFACE_Y + b.height + 0.025) {
            b.piece.mesh.position.copy(b.homePos);
            continue;
          }

          // When squeezing diagonally between adjacent pieces, bystanders subtly yield outward within their square
          if (dHome < 0.36 && dHome > 0.001 && knightVaultPeak === 0) {
            const yieldProx = Math.max(0, (0.36 - dHome) / 0.36) * archSin;
            const yieldDist = Math.min(0.068, yieldProx * 0.082);
            b.piece.mesh.position.set(
              hx - (dHomeX / dHome) * yieldDist,
              BOARD_SURFACE_Y,
              hz - (dHomeZ / dHome) * yieldDist
            );
          } else {
            b.piece.mesh.position.copy(b.homePos);
          }

          // Hard concrete cylinder separation against bystander's instantaneous position
          const curBx = b.piece.mesh.position.x;
          const curBz = b.piece.mesh.position.z;
          const sepX = bx - curBx;
          const sepZ = bz - curBz;
          const sepDist = Math.hypot(sepX, sepZ);

          if (sepDist < effectiveMinSep) {
            if (piece.type === 'knight' && knightVaultPeak > 0) {
              // Ensure Knight pedestal bottom clears the blocker's crown/helmet
              by = Math.max(by, BOARD_SURFACE_Y + b.height + 0.03);
            } else if (sepDist > 0.0001) {
              const push = effectiveMinSep - sepDist;
              bx += (sepX / sepDist) * push;
              bz += (sepZ / sepDist) * push;
            } else {
              bx += segPerpX * effectiveMinSep;
              bz += segPerpZ * effectiveMinSep;
            }
          }
        }

        piece.mesh.position.set(bx, by, bz);
      }

      // Save Player Camera State for Smooth Eased Entry & Return
      const savedCamPos = camera.position.clone();
      const savedTarget = orbitControls.target.clone();

      // Calculate Optimal Unobstructed 3/4 Duel Camera Angle
      const midPoint = new THREE.Vector3(
        (strikePos.x + endPos.x) * 0.5,
        BOARD_SURFACE_Y + 0.32,
        (strikePos.z + endPos.z) * 0.5
      );

      // Score both perpendicular sides for foreground bystander occlusion across both mid and close camera poses
      const perpA = new THREE.Vector3(-dirZ, 0, dirX);
      const perpB = new THREE.Vector3(dirZ, 0, -dirX);
      const camFromMid = new THREE.Vector3().subVectors(savedCamPos, midPoint);
      const prefPerp = camFromMid.dot(perpA) >= 0 ? perpA : perpB;
      const altPerp = prefPerp === perpA ? perpB : perpA;

      function scoreDuelPerpOcclusion(perpVec) {
        let penalty = 0;
        const probes = [
          { perpMul: 1.24, dirMul: -0.34 },
          { perpMul: 0.92, dirMul: 0.14 }
        ];
        for (const pr of probes) {
          const camX = midPoint.x + perpVec.x * pr.perpMul + dirX * pr.dirMul;
          const camZ = midPoint.z + perpVec.z * pr.perpMul + dirZ * pr.dirMul;
          const rayX = midPoint.x - camX;
          const rayZ = midPoint.z - camZ;
          const rayLenSq = Math.max(0.0001, rayX * rayX + rayZ * rayZ);
          for (const b of bystanders) {
            const bPos = b.piece && b.piece.mesh ? b.piece.mesh.position : b.homePos;
            if (!bPos) continue;
            const px = bPos.x - camX;
            const pz = bPos.z - camZ;
            const t = (px * rayX + pz * rayZ) / rayLenSq;
            if (t > 0.10 && t < 0.98) {
              const cx = camX + rayX * t;
              const cz = camZ + rayZ * t;
              const distB = Math.hypot(bPos.x - cx, bPos.z - cz);
              if (distB < 0.44) {
                penalty += (0.44 - distB) * 12.0;
              }
            }
          }
        }
        return penalty;
      }

      const chosenPerp =
        scoreDuelPerpOcclusion(prefPerp) > scoreDuelPerpOcclusion(altPerp) + 0.25 ? altPerp : prefPerp;

      // Continuous Quadratic Bezier 3/4 orbit-and-dolly arc (savedCamPos -> duelCamMid -> duelCamClose)
      // so the attack camera glides in a single unbroken C-infinity sweep across approach + strike without ever stalling at tApproach
      const duelCamMid = new THREE.Vector3(
        midPoint.x + chosenPerp.x * 1.34 - dirX * 0.44,
        BOARD_SURFACE_Y + 0.96,
        midPoint.z + chosenPerp.z * 1.34 - dirZ * 0.44
      );
      const duelCamClose = new THREE.Vector3(
        midPoint.x + chosenPerp.x * 0.92 + dirX * 0.18,
        BOARD_SURFACE_Y + 0.74,
        midPoint.z + chosenPerp.z * 0.92 + dirZ * 0.18
      );
      const duelTargetStart = new THREE.Vector3(
        strikePos.x + dirX * 0.10,
        BOARD_SURFACE_Y + 0.34,
        strikePos.z + dirZ * 0.10
      );
      const duelTargetEnd = new THREE.Vector3(
        endPos.x - dirX * 0.05,
        BOARD_SURFACE_Y + 0.30,
        endPos.z - dirZ * 0.05
      );

      function evalQuadraticBezier(outVec, p0, p1, p2, t) {
        const inv = 1 - t;
        const c0 = inv * inv;
        const c1 = 2 * inv * t;
        const c2 = t * t;
        outVec.set(
          c0 * p0.x + c1 * p1.x + c2 * p2.x,
          c0 * p0.y + c1 * p1.y + c2 * p2.y,
          c0 * p0.z + c1 * p1.z + c2 * p2.z
        );
      }

      if (isCapture) {
        activeDuelSavedCam = {
          pos: savedCamPos.clone(),
          target: savedTarget.clone()
        };
        orbitControls.enabled = false;
        cameraTelemetry.lastAttackSamples = [];
        cameraTelemetry.attackCount += 1;
        cameraTelemetry.maxStepDelta = 0;
        cameraTelemetry.minCombatSeparation = Infinity;
      } else {
        cameraTelemetry.lastSpaceMoveSamples = [];
      }

      // Distance-scaled piece movement duration (slowed by ~12-18% + scaled per square so 4-5 space Bishop/Rook/Queen glides feel weighty and unhurried):
      // - 1 square move: 0.64s
      // - 4-5 square move: 1.10s - 1.29s
      const squaresMoved = Math.max(1, Math.hypot(toR - fromR, toC - fromC));
      const stdMoveDuration = Number((0.64 + Math.max(0, squaresMoved - 1) * 0.14).toFixed(3));
      const atkProfile = ATTACK_SYNC_PROFILES[piece.type] || ATTACK_SYNC_PROFILES.queen;
      const SWING_START_CLIP_TIME = atkProfile.swingStartClip;
      const CONTACT_CLIP_TIME = atkProfile.contactClip; // Weapon physically strikes defender, triggering flash & flinch
      const BLOW_CLIP_TIME = atkProfile.blowClip;       // After visible weapon impact, defender explodes into stone shards
      const tApproach = isCapture
        ? Number((0.66 + Math.max(0, squaresMoved - 1) * 0.125).toFixed(3))
        : stdMoveDuration;
      const tContact = isCapture ? (tApproach + CONTACT_CLIP_TIME / atkProfile.timeScale) : stdMoveDuration;
      const tImpact = isCapture ? (tApproach + BLOW_CLIP_TIME / atkProfile.timeScale) : stdMoveDuration;
      const tStrikeDone = isCapture ? (tImpact + 0.48) : stdMoveDuration;
      // Slower, distance-aware post-attack camera return (~1.30s - 1.60s instead of 0.64s)
      const camReturnDist = savedCamPos.distanceTo(duelCamClose);
      const returnDuration = isCapture ? Number((1.18 + Math.min(0.42, camReturnDist * 0.10)).toFixed(3)) : 0;
      const totalDuration = isCapture ? (tStrikeDone + returnDuration) : stdMoveDuration;

      if (!isCapture) {
        cameraTelemetry.lastSpaceMoveDuration = stdMoveDuration;
        cameraTelemetry.lastSquaresMoved = Number(squaresMoved.toFixed(3));
      } else {
        cameraTelemetry.lastCaptureTiming = {
          pieceType: piece.type,
          squaresMoved: Number(squaresMoved.toFixed(3)),
          tApproach: Number(tApproach.toFixed(3)),
          tContact: Number(tContact.toFixed(3)),
          tImpact: Number(tImpact.toFixed(3)),
          tStrikeDone: Number(tStrikeDone.toFixed(3)),
          returnDuration: Number(returnDuration.toFixed(3)),
          totalDuration: Number(totalDuration.toFixed(3))
        };
      }

      let elapsed = 0;
      let attackAnimStarted = false;
      let defenderFlinchTriggered = false;
      let shatterTriggered = false;
      let impactActualTime = tImpact;
      const postShatterPiecePos = strikePos.clone();
      const postStrikePiecePos = strikePos.clone();
      let prevCamPos = camera.position.clone();
      let prevPiecePos = piece.mesh.position.clone();

      function finishMove() {
        resetBystandersToHome();
        boardState[fromR][fromC] = null;
        boardState[toR][toC] = piece;
        piece.r = toR;
        piece.c = toC;
        piece.hasMoved = true;

        if (isCastling && castleRook) {
          boardState[fromR][castleRookFromC] = null;
          boardState[fromR][castleRookToC] = castleRook;
          castleRook.r = fromR;
          castleRook.c = castleRookToC;
          castleRook.hasMoved = true;
          if (castleRook.mesh) {
            castleRook.mesh.position.copy(castleRookEndPos);
            castleRook.mesh.rotation.y = castleRook.color === 'w' ? Math.PI : 0;
          }
          playPieceClip(castleRook, 'Idle', true, 0.18);
        }

        // Pawn Promotion to Queen
        if (piece.type === 'pawn' && (toR === 0 || toR === 7)) {
          recyclePieceInstance(piece);
          const promoted = instantiatePiece('queen', piece.color, toR, toC);
          promoted.hasMoved = true;
          boardState[toR][toC] = promoted;
        } else {
          piece.mesh.position.copy(endPos);
          piece.mesh.rotation.y = piece.color === 'w' ? Math.PI : 0;
          playPieceClip(piece, 'Idle', true, 0.18);
        }

        if (isCapture) {
          if (piece.color === 'w') capturedByWhite += 1;
          else capturedByBlack += 1;
          activeDuelSavedCam = null;
          camera.position.copy(savedCamPos);
          orbitControls.target.copy(savedTarget);
          orbitControls.enabled = true;
          orbitControls.update();
        } else {
          window.wizardChessAudio?.playPieceMove?.();
        }

        currentTurn = currentTurn === 'w' ? 'b' : 'w';
        isAnimatingMove = false;
        const nowInCheck = isKingInCheck(currentTurn, boardState);
        const nextLegal = getAllLegalMoves(currentTurn);
        if (nowInCheck && nextLegal.length > 0) {
          window.wizardChessAudio?.playKingCheck?.();
        }
        updateTurnUI();
        maybeScheduleAIMove();
      }

      function stepMove(dt) {
        elapsed += dt;

        if (!isCapture) {
          const u = Math.min(1, elapsed / totalDuration);
          applyConcreteTrajectory(u, startPos, endPos);
          if (isCastling && castleRook && castleRook.mesh) {
            const rEase = easeInOutCubic(u);
            castleRook.mesh.position.set(
              castleRookStartPos.x + (castleRookEndPos.x - castleRookStartPos.x) * rEase,
              BOARD_SURFACE_Y + Math.sin(u * Math.PI) * 0.05,
              castleRookStartPos.z + (castleRookEndPos.z - castleRookStartPos.z) * rEase
            );
          }
          const pDelta = piece.mesh.position.distanceTo(prevPiecePos);
          prevPiecePos.copy(piece.mesh.position);
          cameraTelemetry.lastSpaceMoveSamples.push({
            t: Number(elapsed.toFixed(3)),
            u: Number(u.toFixed(3)),
            piecePos: [
              Number(piece.mesh.position.x.toFixed(3)),
              Number(piece.mesh.position.y.toFixed(3)),
              Number(piece.mesh.position.z.toFixed(3))
            ],
            pieceStep: Number(pDelta.toFixed(4))
          });
          if (u >= 1) {
            finishMove();
            return true;
          }
          return false;
        }

        // Capture Sequence with Continuous C-infinity Quadratic Bezier Camera & Zero-Freeze Piece Choreography
        let phaseName = 'approach';
        if (elapsed <= tStrikeDone) {
          // Single unbroken C-infinity camera arc across both approach and strike (never stops at tApproach!)
          const uActive = Math.min(1, elapsed / tStrikeDone);
          const sActive = 0.38 * uActive + 0.62 * easeInOutCubic(uActive);
          evalQuadraticBezier(camera.position, savedCamPos, duelCamMid, duelCamClose, sActive);
          evalQuadraticBezier(orbitControls.target, savedTarget, duelTargetStart, duelTargetEnd, sActive);

          if (elapsed <= tApproach) {
            // Phase 1: Smooth Glide-In to Concrete Standoff Position
            phaseName = 'approach';
            const u = Math.min(1, elapsed / tApproach);
            applyConcreteTrajectory(u, startPos, strikePos);
          } else {
            // Phase 2: Rigged Attack (Continuous Stalk -> Physical Weapon Impact -> Shatter Burst -> Follow-Through Advance)
            phaseName = 'strike';
            if (!attackAnimStarted) {
              attackAnimStarted = true;
              playPieceClip(piece, 'Attack', false, 0.08);
              window.wizardChessAudio?.playAttackWindup?.();
            }

            // Keep any bystanders immediately adjacent to strikePos yielded slightly outward during the weapon swing
            for (const b of bystanders) {
              const dxB = strikePos.x - b.homePos.x;
              const dzB = strikePos.z - b.homePos.z;
              const dB = Math.hypot(dxB, dzB);
              if (dB < 0.42 && dB > 0.001) {
                const yieldDist = ((0.42 - dB) / 0.42) * 0.068;
                b.piece.mesh.position.set(
                  b.homePos.x - (dxB / dB) * yieldDist,
                  BOARD_SURFACE_Y,
                  b.homePos.z - (dzB / dB) * yieldDist
                );
              } else {
                b.piece.mesh.position.copy(b.homePos);
              }
            }

            const atkClipTime = (elapsed - tApproach) * atkProfile.timeScale;

            // Keep attacker continuously moving forward during wind-up stalk, downward strike, and post-shatter follow-through
            if (!shatterTriggered && captured && captured.mesh) {
              const stalkLead = 0.028;
              let lungeOffset = 0;
              if (atkClipTime < SWING_START_CLIP_TIME) {
                const windupProgress = Math.min(1, atkClipTime / Math.max(0.05, SWING_START_CLIP_TIME));
                lungeOffset = windupProgress * stalkLead;
              } else {
                const slashPhase = Math.min(
                  1,
                  (atkClipTime - SWING_START_CLIP_TIME) / Math.max(0.05, BLOW_CLIP_TIME - SWING_START_CLIP_TIME)
                );
                lungeOffset =
                  stalkLead + Math.sin(slashPhase * Math.PI * 0.85) * Math.max(0.018, atkProfile.maxLunge - stalkLead);
              }
              piece.mesh.position.set(
                strikePos.x + dirX * lungeOffset,
                BOARD_SURFACE_Y,
                strikePos.z + dirZ * lungeOffset
              );
              if (atkClipTime < CONTACT_CLIP_TIME) {
                captured.mesh.position.copy(endPos);
              } else {
                // Weapon makes physical impact on defender before defender bursts
                const shoveProgress = Math.min(
                  1,
                  (atkClipTime - CONTACT_CLIP_TIME) / Math.max(0.04, BLOW_CLIP_TIME - CONTACT_CLIP_TIME)
                );
                const shoveDist = shoveProgress * 0.045;
                captured.mesh.position.set(
                  endPos.x + dirX * shoveDist,
                  BOARD_SURFACE_Y,
                  endPos.z + dirZ * shoveDist
                );
              }

              const curSep = piece.mesh.position.distanceTo(captured.mesh.position);
              if (curSep < (cameraTelemetry.minCombatSeparation ?? Infinity)) {
                cameraTelemetry.minCombatSeparation = Number(curSep.toFixed(3));
              }
            }

            // Contact: weapon physically strikes defender
            if (
              !defenderFlinchTriggered &&
              (atkClipTime >= CONTACT_CLIP_TIME || elapsed >= tContact + 0.06)
            ) {
              defenderFlinchTriggered = true;
              window.wizardChessAudio?.playCaptureStrike?.();
              if (captured) {
                playPieceClip(captured, 'Shatter', false, 0.04);
                impactFlashLight.position.set(
                  endPos.x - dirX * 0.08,
                  BOARD_SURFACE_Y + 0.28,
                  endPos.z - dirZ * 0.08
                );
                impactFlashLight.intensity = 4.5;
              }
            }

            // Blow Burst: after visible weapon impact & follow-through, defender explodes into stone shards!
            if (!shatterTriggered && (atkClipTime >= BLOW_CLIP_TIME || elapsed >= tImpact + 0.06)) {
              shatterTriggered = true;
              impactActualTime = elapsed;
              postShatterPiecePos.copy(piece.mesh.position);
              window.wizardChessAudio?.playStoneShatter?.();
              if (captured && captured.mesh) {
                const shatterOrigin = captured.mesh.position.clone();
                recyclePieceInstance(captured);
                spawnStoneShatter(shatterOrigin, captured.color);
              }
            }

            // Immediately after shattering defender, attacker smoothly begins advancing toward endPos (no post-impact freeze!)
            if (shatterTriggered) {
              const postStrikeSpan = Math.max(0.08, tStrikeDone - impactActualTime);
              const uFollow = Math.min(1, Math.max(0, (elapsed - impactActualTime) / postStrikeSpan));
              piece.mesh.position.lerpVectors(postShatterPiecePos, endPos, uFollow * 0.38);
              postStrikePiecePos.copy(piece.mesh.position);
            }

            // Subtle damped perpendicular impact vibration right when the blow shatters the defender
            if (shatterTriggered && elapsed >= impactActualTime && elapsed <= impactActualTime + 0.26) {
              const shakeProgress = (elapsed - impactActualTime) / 0.26;
              const decay = (1 - shakeProgress) * (1 - shakeProgress);
              const amp = 0.024 * decay;
              camera.position.y += Math.sin(shakeProgress * Math.PI * 8) * amp;
            }
          }
        } else {
          // Phase 3: Complete Advance onto Captured Square & Smooth Unhurried Camera Ease-Back
          phaseName = 'return';
          const uReturn = Math.min(1, (elapsed - tStrikeDone) / Math.max(0.1, totalDuration - tStrikeDone));
          const easeRet = easeInOutCubic(uReturn);
          const pieceAdvanceBlend = 0.35 * uReturn + 0.65 * easeRet;

          piece.mesh.position.lerpVectors(postStrikePiecePos, endPos, pieceAdvanceBlend);
          camera.position.lerpVectors(duelCamClose, savedCamPos, easeRet);
          orbitControls.target.lerpVectors(duelTargetEnd, savedTarget, easeRet);
        }

        camera.lookAt(orbitControls.target);

        const stepDelta = camera.position.distanceTo(prevCamPos);
        const pieceStepDelta = piece.mesh.position.distanceTo(prevPiecePos);
        if (stepDelta > cameraTelemetry.maxStepDelta) {
          cameraTelemetry.maxStepDelta = stepDelta;
        }
        prevCamPos.copy(camera.position);
        prevPiecePos.copy(piece.mesh.position);

        cameraTelemetry.lastAttackSamples.push({
          t: Number(elapsed.toFixed(3)),
          phase: phaseName,
          camStep: Number(stepDelta.toFixed(4)),
          pieceStep: Number(pieceStepDelta.toFixed(4)),
          pos: [
            Number(camera.position.x.toFixed(3)),
            Number(camera.position.y.toFixed(3)),
            Number(camera.position.z.toFixed(3))
          ],
          target: [
            Number(orbitControls.target.x.toFixed(3)),
            Number(orbitControls.target.y.toFixed(3)),
            Number(orbitControls.target.z.toFixed(3))
          ],
          piecePos: [
            Number(piece.mesh.position.x.toFixed(3)),
            Number(piece.mesh.position.y.toFixed(3)),
            Number(piece.mesh.position.z.toFixed(3))
          ]
        });

        if (elapsed >= totalDuration) {
          finishMove();
          return true;
        }
        return false;
      }

      activeMoveTweens.push(stepMove);
      return true;
    }

    const activeMoveTweens = [];

    // =========================================================================
    // Single-Player Tactical AI (Beginner, Professional, Grandmaster)
    // =========================================================================
    let aiDifficulty = 'professional'; // 'beginner' | 'professional' | 'grandmaster'
    let isGamePaused = false;

    function setGraphicsQuality(tier, persist = true) {
      if (tier !== 'low' && tier !== 'medium' && tier !== 'high') {
        return graphicsQuality;
      }
      graphicsQuality = tier;
      shadowUpdateInterval = tier === 'low' ? 2 : 1;
      if (persist) {
        try {
          localStorage.setItem(GRAPHICS_STORAGE_KEY, tier);
        } catch (e) {}
      }

      // 1. Update Renderer Pixel Ratio & Shadow Filtering
      const vp = getLandscapeViewport();
      renderer.setPixelRatio(getTargetPixelRatio(tier));
      renderer.setSize(vp.width, vp.height);
      renderer.shadowMap.enabled = !isSoftwareGl;
      const desiredShadowType = tier === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      if (renderer.shadowMap.type !== desiredShadowType) {
        renderer.shadowMap.type = desiredShadowType;
      }

      // 2. Update Shadow Map Resolution cleanly without losing piece shadows
      const targetShadowSize = tier === 'low' ? 1024 : tier === 'medium' ? 1536 : 2048;
      if (keyLight.shadow.mapSize.width !== targetShadowSize) {
        keyLight.shadow.mapSize.width = targetShadowSize;
        keyLight.shadow.mapSize.height = targetShadowSize;
        if (keyLight.shadow.map) {
          keyLight.shadow.map.dispose();
          keyLight.shadow.map = null;
        }
      }

      // 3. Smart Light Consolidation (compensates ambient/PMREM on Low/Medium so visual quality stays identical to High)
      hemiLight.intensity = tier === 'low' ? 0.90 : tier === 'medium' ? 0.78 : 0.72;
      keyLight.intensity = tier === 'low' ? 2.62 : tier === 'medium' ? 2.58 : 2.55;
      rimLight.visible = tier !== 'low';
      southFillLight.visible = tier === 'high';
      if ('environmentIntensity' in scene) {
        scene.environmentIntensity = tier === 'low' ? 0.42 : tier === 'medium' ? 0.37 : 0.34;
      }

      // 4. Update Volumetric Brazier Fire Shaders & Overdraw Layers
      const lowFlag = tier === 'low' ? 1.0 : 0.0;
      for (let i = 0; i < brazierFireUniforms.length; i++) {
        if (brazierFireUniforms[i].uLowQuality) {
          brazierFireUniforms[i].uLowQuality.value = lowFlag;
        }
      }
      if (flameCoreShaderRef && flameCoreShaderRef.uniforms?.uStrength) {
        flameCoreShaderRef.uniforms.uStrength.value = tier === 'low' ? 2.05 : 1.85;
      }
      if (flameOuterShaderRef && flameOuterShaderRef.uniforms?.uStrength) {
        flameOuterShaderRef.uniforms.uStrength.value = tier === 'low' ? 1.08 : 0.95;
      }
      for (let i = 0; i < brazierFlameMidMeshes.length; i++) {
        brazierFlameMidMeshes[i].visible = tier !== 'low';
      }

      renderer.shadowMap.needsUpdate = true;
      updateTurnUI();
      return graphicsQuality;
    }

    function getGraphicsQuality() {
      return graphicsQuality;
    }

    function getAutoDetectedGraphicsQuality() {
      return autoDetectedGraphicsQuality;
    }

    function setAIDifficulty(level) {
      if (level === 'beginner' || level === 'professional' || level === 'grandmaster') {
        aiDifficulty = level;
        updateTurnUI();
      }
      return aiDifficulty;
    }

    function getAIDifficulty() {
      return aiDifficulty;
    }

    function setGamePaused(paused) {
      isGamePaused = Boolean(paused);
      if (isGamePaused && aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      } else if (!isGamePaused) {
        maybeScheduleAIMove();
      }
      updateTurnUI();
      return isGamePaused;
    }

    function setGameMode(mode) {
      if (mode === 'single' || mode === 'local') {
        gameMode = mode;
        if (gameMode === 'local' && aiTimer) {
          clearTimeout(aiTimer);
          aiTimer = null;
        }
        updateTurnUI();
      }
      return gameMode;
    }

    function getGameMode() {
      return gameMode;
    }

    function triggerTimeoutVictory(winnerColor) {
      if (gameOver) return false;
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
      gameOver = true;
      const defeatedColor = winnerColor === 'w' ? 'b' : 'w';
      const turnText = document.getElementById('turn-text');
      const winnerName = winnerColor === 'w' ? 'White' : 'Black';
      if (turnText) {
        turnText.textContent = `Time Out — ${winnerName} Wins`;
      }
      triggerCheckmateSequence(defeatedColor, winnerColor);
      const titleEl = document.getElementById('checkmate-title');
      const subEl = document.getElementById('checkmate-subtitle');
      if (titleEl) titleEl.textContent = 'Time Out';
      if (subEl) {
        subEl.textContent = `${winnerName} Triumphs on Time • Clock Expired`;
      }
      return true;
    }

    function startNewMatch(opts = {}) {
      stopMultiplayerSync();
      scriptedGameActive = false;
      scriptDeviated = false;
      if (opts.mode === 'local' || opts.mode === 'single') {
        gameMode = opts.mode;
      } else {
        gameMode = 'single';
      }
      if (opts.side === 'b' || opts.side === 'w') {
        playerColor = opts.side;
      }
      if (opts.difficulty === 'beginner' || opts.difficulty === 'professional' || opts.difficulty === 'grandmaster') {
        aiDifficulty = opts.difficulty;
      }
      isGamePaused = false;
      resetChessBoard(true, false);
      window.wizardChessAudio?.playMatchStart?.();
      return { ok: true, mode: gameMode, side: playerColor, difficulty: aiDifficulty };
    }

    // =========================================================================
    // Grandmaster Positional Piece-Square Tables (from White's perspective, r=0 is rank 8, r=7 is rank 1)
    // =========================================================================
    const PST_PAWN = [
      [  0,   0,   0,   0,   0,   0,   0,   0],
      [ 65,  70,  70,  75,  75,  70,  70,  65],
      [ 22,  25,  32,  42,  42,  32,  25,  22],
      [  8,  12,  22,  34,  34,  22,  12,   8],
      [  2,   4,  12,  28,  28,  12,   4,   2],
      [  6,  -4,  -8,   4,   4,  -8,  -4,   6],
      [  6,  12,  12, -22, -22,  12,  12,   6],
      [  0,   0,   0,   0,   0,   0,   0,   0]
    ];

    const PST_KNIGHT = [
      [-50, -38, -30, -28, -28, -30, -38, -50],
      [-38, -18,   0,   6,   6,   0, -18, -38],
      [-28,   4,  16,  22,  22,  16,   4, -28],
      [-26,   8,  22,  28,  28,  22,   8, -26],
      [-26,   6,  18,  26,  26,  18,   6, -26],
      [-28,   6,  14,  18,  18,  14,   6, -28],
      [-38, -18,   2,   6,   6,   2, -18, -38],
      [-48, -32, -26, -26, -26, -26, -32, -48]
    ];

    const PST_BISHOP = [
      [-20, -12, -12, -10, -10, -12, -12, -20],
      [-12,   4,   0,   4,   4,   0,   4, -12],
      [-10,   6,  12,  16,  16,  12,   6, -10],
      [-10,   8,  14,  18,  18,  14,   8, -10],
      [-10,   4,  16,  18,  18,  16,   4, -10],
      [-10,  12,  12,  14,  14,  12,  12, -10],
      [-12,  14,   4,   6,   6,   4,  14, -12],
      [-20, -12, -16, -10, -10, -16, -12, -20]
    ];

    const PST_ROOK = [
      [  4,   6,   8,  12,  12,   8,   6,   4],
      [ 16,  22,  24,  26,  26,  24,  22,  16],
      [ -4,   0,   4,   6,   6,   4,   0,  -4],
      [ -6,   0,   2,   6,   6,   2,   0,  -6],
      [ -6,   0,   2,   6,   6,   2,   0,  -6],
      [ -6,   0,   2,   6,   6,   2,   0,  -6],
      [ -4,   2,   6,  10,  10,   6,   2,  -4],
      [  2,   4,   8,  14,  14,   8,   4,   2]
    ];

    const PST_QUEEN = [
      [-20, -10, -10,  -4,  -4, -10, -10, -20],
      [-10,   0,   4,   4,   4,   4,   0, -10],
      [-10,   4,   8,  10,  10,   8,   4, -10],
      [ -4,   4,  10,  12,  12,  10,   4,  -4],
      [  0,   4,  10,  12,  12,  10,   4,  -4],
      [-10,   8,   8,  10,  10,   8,   4, -10],
      [-10,   2,   6,   4,   4,   4,   2, -10],
      [-20, -10, -10,  -4,  -4, -10, -10, -20]
    ];

    const PST_KING_MG = [
      [-32, -42, -42, -52, -52, -42, -42, -32],
      [-32, -42, -42, -52, -52, -42, -42, -32],
      [-32, -42, -42, -52, -52, -42, -42, -32],
      [-32, -42, -42, -52, -52, -42, -42, -32],
      [-22, -32, -32, -42, -42, -32, -32, -22],
      [-12, -22, -22, -22, -22, -22, -22, -12],
      [ 16,  20,  -4,  -8,  -8,  -4,  20,  16],
      [ 22,  34,  18,  -6,   0,  10,  36,  22]
    ];

    const PST_KING_EG = [
      [-45, -30, -25, -20, -20, -25, -30, -45],
      [-28, -15,  -5,   4,   4,  -5, -15, -28],
      [-20,  -5,  14,  22,  22,  14,  -5, -20],
      [-18,   0,  20,  28,  28,  20,   0, -18],
      [-18,   0,  20,  28,  28,  20,   0, -18],
      [-20,  -5,  14,  22,  22,  14,  -5, -20],
      [-28, -15,  -5,   4,   4,  -5, -15, -28],
      [-45, -30, -25, -20, -20, -25, -30, -45]
    ];

    const AI_PIECE_VALUES = {
      pawn: 100,
      knight: 325,
      bishop: 340,
      rook: 500,
      queen: 955,
      king: 20000
    };

    function getPSTScore(type, color, r, c, isEndgame = false) {
      const tableR = color === 'w' ? r : 7 - r;
      switch (type) {
        case 'pawn': return PST_PAWN[tableR][c];
        case 'knight': return PST_KNIGHT[tableR][c];
        case 'bishop': return PST_BISHOP[tableR][c];
        case 'rook': return PST_ROOK[tableR][c];
        case 'queen': return PST_QUEEN[tableR][c];
        case 'king': return isEndgame ? PST_KING_EG[tableR][c] : PST_KING_MG[tableR][c];
        default: return 0;
      }
    }

    // Grandmaster Opening Book (keyed by compact move history "fromR,fromC->toR,toC;...")
    const GRANDMASTER_OPENING_BOOK = {
      // White's 1st move: e2->e4, d2->d4, c2->c4
      '': [
        { fromR: 6, fromC: 4, toR: 4, toC: 4 }, // 1. e4
        { fromR: 6, fromC: 3, toR: 4, toC: 3 }  // 1. d4
      ],
      // Black responses to 1. e4 (Sicilian c7->c5, Open e7->e5, French e7->e6)
      '6,4-4,4': [
        { fromR: 1, fromC: 2, toR: 3, toC: 2 }, // 1... c5 (Sicilian Defense)
        { fromR: 1, fromC: 4, toR: 3, toC: 4 }  // 1... e5 (Open Game)
      ],
      // Black responses to 1. d4 (1... Nf6, 1... d5)
      '6,3-4,3': [
        { fromR: 0, fromC: 6, toR: 2, toC: 5 }, // 1... Nf6
        { fromR: 1, fromC: 3, toR: 3, toC: 3 }  // 1... d5
      ],
      // White responses to 1. e4 e5 -> 2. Nf3
      '6,4-4,4;1,4-3,4': [
        { fromR: 7, fromC: 6, toR: 5, toC: 5 }  // 2. Nf3
      ],
      // Black responses to 1. e4 e5 2. Nf3 -> 2... Nc6
      '6,4-4,4;1,4-3,4;7,6-5,5': [
        { fromR: 0, fromC: 1, toR: 2, toC: 2 }  // 2... Nc6
      ],
      // White 3rd move: Ruy Lopez (3. Bb5) or Italian Game (3. Bc4)
      '6,4-4,4;1,4-3,4;7,6-5,5;0,1-2,2': [
        { fromR: 7, fromC: 5, toR: 3, toC: 1 }, // 3. Bb5 (Ruy Lopez)
        { fromR: 7, fromC: 5, toR: 4, toC: 2 }  // 3. Bc4 (Italian)
      ],
      // Black vs Ruy Lopez -> 3... a6 or 3... Nf6
      '6,4-4,4;1,4-3,4;7,6-5,5;0,1-2,2;7,5-3,1': [
        { fromR: 0, fromC: 6, toR: 2, toC: 5 }, // 3... Nf6 (Berlin Defense)
        { fromR: 1, fromC: 0, toR: 2, toC: 0 }  // 3... a6 (Morphy Defense)
      ],
      // Black vs Italian -> 3... Bc5 or 3... Nf6
      '6,4-4,4;1,4-3,4;7,6-5,5;0,1-2,2;7,5-4,2': [
        { fromR: 0, fromC: 5, toR: 3, toC: 2 }, // 3... Bc5 (Giuoco Piano)
        { fromR: 0, fromC: 6, toR: 2, toC: 5 }  // 3... Nf6 (Two Knights)
      ],
      // White vs Sicilian (1. e4 c5) -> 2. Nf3
      '6,4-4,4;1,2-3,2': [
        { fromR: 7, fromC: 6, toR: 5, toC: 5 }  // 2. Nf3
      ],
      // Black Sicilian 2... d6 or 2... Nc6
      '6,4-4,4;1,2-3,2;7,6-5,5': [
        { fromR: 0, fromC: 1, toR: 2, toC: 2 }, // 2... Nc6
        { fromR: 1, fromC: 3, toR: 2, toC: 3 }  // 2... d6
      ],
      // White Queen's Gambit (1. d4 d5 -> 2. c4)
      '6,3-4,3;1,3-3,3': [
        { fromR: 6, fromC: 2, toR: 4, toC: 2 }  // 2. c4
      ],
      // Black QGD (1. d4 d5 2. c4 -> 2... e6)
      '6,3-4,3;1,3-3,3;6,2-4,2': [
        { fromR: 1, fromC: 4, toR: 2, toC: 4 }  // 2... e6
      ],
      // White vs 1. d4 Nf6 -> 2. c4
      '6,3-4,3;0,6-2,5': [
        { fromR: 6, fromC: 2, toR: 4, toC: 2 }  // 2. c4
      ],
      // Black vs 1. d4 Nf6 2. c4 -> 2... e6
      '6,3-4,3;0,6-2,5;6,2-4,2': [
        { fromR: 1, fromC: 4, toR: 2, toC: 4 }  // 2... e6
      ]
    };

    // Fast static evaluation of boardState from `perspectiveColor`'s view
    const _wPawnsInCol = new Int8Array(8);
    const _bPawnsInCol = new Int8Array(8);

    function evaluateBoardPosition(perspectiveColor, includeGrandmasterPositional = true) {
      let wScore = 0;
      let bScore = 0;
      let wBishops = 0;
      let bBishops = 0;
      let nonPawnMaterial = 0;
      let wKingR = 7, wKingC = 4;
      let bKingR = 0, bKingC = 4;

      for (let c = 0; c < 8; c++) {
        _wPawnsInCol[c] = 0;
        _bPawnsInCol[c] = 0;
      }

      // First pass: count material, bishops, pawn columns, and king locations
      for (let r = 0; r < 8; r++) {
        const row = boardState[r];
        for (let c = 0; c < 8; c++) {
          const p = row[c];
          if (!p) continue;
          const val = AI_PIECE_VALUES[p.type] || 100;
          if (p.type !== 'pawn' && p.type !== 'king') {
            nonPawnMaterial += val;
          }
          if (p.color === 'w') {
            wScore += val;
            if (p.type === 'bishop') wBishops++;
            else if (p.type === 'pawn') _wPawnsInCol[c]++;
            else if (p.type === 'king') { wKingR = r; wKingC = c; }
          } else {
            bScore += val;
            if (p.type === 'bishop') bBishops++;
            else if (p.type === 'pawn') _bPawnsInCol[c]++;
            else if (p.type === 'king') { bKingR = r; bKingC = c; }
          }
        }
      }

      const isEndgame = nonPawnMaterial <= 2600;

      // Second pass: Piece-Square Tables + Positional structure
      for (let r = 0; r < 8; r++) {
        const row = boardState[r];
        for (let c = 0; c < 8; c++) {
          const p = row[c];
          if (!p) continue;
          const pst = getPSTScore(p.type, p.color, r, c, isEndgame);
          if (p.color === 'w') {
            wScore += pst;
          } else {
            bScore += pst;
          }

          if (includeGrandmasterPositional) {
            if (p.type === 'pawn') {
              if (p.color === 'w') {
                // Passed pawn check for White (no black pawns ahead on c-1, c, c+1)
                let passed = true;
                for (let rr = r - 1; rr >= 1; rr--) {
                  if (
                    (c > 0 && boardState[rr][c - 1]?.color === 'b' && boardState[rr][c - 1]?.type === 'pawn') ||
                    (boardState[rr][c]?.color === 'b' && boardState[rr][c]?.type === 'pawn') ||
                    (c < 7 && boardState[rr][c + 1]?.color === 'b' && boardState[rr][c + 1]?.type === 'pawn')
                  ) {
                    passed = false;
                    break;
                  }
                }
                if (passed) {
                  const rankAdv = 6 - r;
                  wScore += rankAdv * rankAdv * 4;
                }
              } else {
                // Passed pawn check for Black
                let passed = true;
                for (let rr = r + 1; rr <= 6; rr++) {
                  if (
                    (c > 0 && boardState[rr][c - 1]?.color === 'w' && boardState[rr][c - 1]?.type === 'pawn') ||
                    (boardState[rr][c]?.color === 'w' && boardState[rr][c]?.type === 'pawn') ||
                    (c < 7 && boardState[rr][c + 1]?.color === 'w' && boardState[rr][c + 1]?.type === 'pawn')
                  ) {
                    passed = false;
                    break;
                  }
                }
                if (passed) {
                  const rankAdv = r - 1;
                  bScore += rankAdv * rankAdv * 4;
                }
              }
            } else if (p.type === 'rook') {
              // Open / semi-open file bonus
              if (p.color === 'w') {
                if (_wPawnsInCol[c] === 0) {
                  wScore += _bPawnsInCol[c] === 0 ? 22 : 12;
                }
              } else {
                if (_bPawnsInCol[c] === 0) {
                  bScore += _wPawnsInCol[c] === 0 ? 22 : 12;
                }
              }
            }
          }
        }
      }

      if (includeGrandmasterPositional) {
        // Bishop Pair Bonus
        if (wBishops >= 2) wScore += 36;
        if (bBishops >= 2) bScore += 36;

        // Doubled Pawn Penalty
        for (let c = 0; c < 8; c++) {
          if (_wPawnsInCol[c] > 1) wScore -= (_wPawnsInCol[c] - 1) * 14;
          if (_bPawnsInCol[c] > 1) bScore -= (_bPawnsInCol[c] - 1) * 14;
        }

        // King Safety Pawn Shield in Middlegame
        if (!isEndgame) {
          if (wKingR >= 6) {
            for (let dc = -1; dc <= 1; dc++) {
              const sc = wKingC + dc;
              if (sc >= 0 && sc < 8) {
                const sp = boardState[wKingR - 1]?.[sc];
                if (sp && sp.color === 'w' && sp.type === 'pawn') wScore += 12;
              }
            }
          }
          if (bKingR <= 1) {
            for (let dc = -1; dc <= 1; dc++) {
              const sc = bKingC + dc;
              if (sc >= 0 && sc < 8) {
                const sp = boardState[bKingR + 1]?.[sc];
                if (sp && sp.color === 'b' && sp.type === 'pawn') bScore += 12;
              }
            }
          }
        } else {
          // Endgame Mop-up bonus: drive opponent King to the edge when ahead in material
          if (wScore > bScore + 300) {
            const bCenterDist = Math.abs(3.5 - bKingR) + Math.abs(3.5 - bKingC);
            const kingsDist = Math.abs(wKingR - bKingR) + Math.abs(wKingC - bKingC);
            wScore += bCenterDist * 14 + (14 - kingsDist) * 6;
          } else if (bScore > wScore + 300) {
            const wCenterDist = Math.abs(3.5 - wKingR) + Math.abs(3.5 - wKingC);
            const kingsDist = Math.abs(wKingR - bKingR) + Math.abs(wKingC - bKingC);
            bScore += wCenterDist * 14 + (14 - kingsDist) * 6;
          }
        }
      }

      return perspectiveColor === 'w' ? (wScore - bScore) : (bScore - wScore);
    }

    // Fast in-place move application & reversal on boardState for search tree
    function makeSearchMove(m) {
      const piece = boardState[m.fromR][m.fromC];
      const captured = boardState[m.toR][m.toC];
      const prevHasMoved = piece.hasMoved;
      const prevType = piece.type;

      boardState[m.toR][m.toC] = piece;
      boardState[m.fromR][m.fromC] = null;
      piece.hasMoved = true;

      // Handle Pawn Promotion in search
      if (piece.type === 'pawn' && (m.toR === 0 || m.toR === 7)) {
        piece.type = 'queen';
      }

      // Handle Castling Rook move in search
      let castleRook = null;
      let rookFromC = -1;
      let rookToC = -1;
      let rookPrevMoved = false;
      if (prevType === 'king' && m.fromR === m.toR && Math.abs(m.toC - m.fromC) === 2) {
        rookFromC = m.toC > m.fromC ? 7 : 0;
        rookToC = m.toC > m.fromC ? 5 : 3;
        castleRook = boardState[m.fromR][rookFromC];
        if (castleRook) {
          rookPrevMoved = castleRook.hasMoved;
          boardState[m.fromR][rookToC] = castleRook;
          boardState[m.fromR][rookFromC] = null;
          castleRook.hasMoved = true;
        }
      }

      return {
        piece,
        captured,
        prevHasMoved,
        prevType,
        castleRook,
        rookFromC,
        rookToC,
        rookPrevMoved
      };
    }

    function unmakeSearchMove(m, undo) {
      const { piece, captured, prevHasMoved, prevType, castleRook, rookFromC, rookToC, rookPrevMoved } = undo;
      piece.type = prevType;
      piece.hasMoved = prevHasMoved;
      boardState[m.fromR][m.fromC] = piece;
      boardState[m.toR][m.toC] = captured;

      if (castleRook) {
        castleRook.hasMoved = rookPrevMoved;
        boardState[m.fromR][rookFromC] = castleRook;
        boardState[m.fromR][rookToC] = null;
      }
    }

    // MVV-LVA & Positional Move Ordering (maximizes Alpha-Beta pruning cutoffs)
    function orderMovesForSearch(moves, turnColor) {
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const piece = boardState[m.fromR][m.fromC];
        const target = boardState[m.toR][m.toC];
        let orderScore = 0;
        if (target) {
          orderScore += 10000 + AI_PIECE_VALUES[target.type] * 10 - (AI_PIECE_VALUES[piece.type] || 100);
        }
        if (piece.type === 'pawn' && (m.toR === 0 || m.toR === 7)) {
          orderScore += 9000;
        }
        if (piece.type === 'king' && Math.abs(m.toC - m.fromC) === 2) {
          orderScore += 600;
        }
        orderScore += getPSTScore(piece.type, turnColor, m.toR, m.toC, false) - getPSTScore(piece.type, turnColor, m.fromR, m.fromC, false);
        m._orderScore = orderScore;
      }
      moves.sort((a, b) => b._orderScore - a._orderScore);
      return moves;
    }

    // Quiescence Search: resolves capture sequences at leaf nodes so AI never falls for capture traps
    function quiescenceSearch(alpha, beta, turnColor, qDepthLeft, useGmEval) {
      const standPat = evaluateBoardPosition(turnColor, useGmEval);
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
      if (qDepthLeft <= 0) return standPat;

      const oppColor = turnColor === 'w' ? 'b' : 'w';
      const allMoves = getAllLegalMoves(turnColor);
      if (allMoves.length === 0) {
        if (isKingInCheck(turnColor, boardState)) {
          return -90000 - qDepthLeft * 100;
        }
        return 0;
      }

      const tacticalMoves = [];
      for (let i = 0; i < allMoves.length; i++) {
        const m = allMoves[i];
        const p = boardState[m.fromR][m.fromC];
        if (m.capture || (p && p.type === 'pawn' && (m.toR === 0 || m.toR === 7))) {
          tacticalMoves.push(m);
        }
      }
      if (tacticalMoves.length === 0) return standPat;

      orderMovesForSearch(tacticalMoves, turnColor);

      for (let i = 0; i < tacticalMoves.length; i++) {
        const m = tacticalMoves[i];
        const undo = makeSearchMove(m);
        const score = -quiescenceSearch(-beta, -alpha, oppColor, qDepthLeft - 1, useGmEval);
        unmakeSearchMove(m, undo);

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    let searchDeadlineMs = 0;
    let searchAborted = false;
    let searchNodeCounter = 0;

    function alphaBetaSearch(depth, alpha, beta, turnColor, maxQuiescenceDepth, useGmEval) {
      if ((++searchNodeCounter & 127) === 0 && performance.now() > searchDeadlineMs) {
        searchAborted = true;
        return evaluateBoardPosition(turnColor, useGmEval);
      }

      const oppColor = turnColor === 'w' ? 'b' : 'w';
      const legalMoves = getAllLegalMoves(turnColor);

      if (legalMoves.length === 0) {
        if (isKingInCheck(turnColor, boardState)) {
          return -95000 - depth * 500; // Prefer fastest checkmate!
        }
        return 0; // Stalemate draw
      }

      if (depth <= 0) {
        return quiescenceSearch(alpha, beta, turnColor, maxQuiescenceDepth, useGmEval);
      }

      orderMovesForSearch(legalMoves, turnColor);

      let bestVal = -Infinity;
      for (let i = 0; i < legalMoves.length; i++) {
        const m = legalMoves[i];
        const undo = makeSearchMove(m);
        const val = -alphaBetaSearch(depth - 1, -beta, -alpha, oppColor, maxQuiescenceDepth, useGmEval);
        unmakeSearchMove(m, undo);

        if (searchAborted) return bestVal > -Infinity ? bestVal : 0;

        if (val > bestVal) bestVal = val;
        if (val > alpha) alpha = val;
        if (alpha >= beta) break; // Beta cutoff!
      }
      return bestVal;
    }

    function chooseSmartAIMove(color, forceBest = false) {
      const legalMoves = getAllLegalMoves(color);
      if (legalMoves.length === 0) return null;
      if (legalMoves.length === 1) return legalMoves[0];

      const mode = forceBest ? 'grandmaster' : aiDifficulty;

      // 1. BEGINNER LEVEL (Unchanged as requested)
      if (mode === 'beginner') {
        let bestScore = -Infinity;
        let chosen = legalMoves[0];
        for (const m of legalMoves) {
          const target = boardState[m.toR][m.toC];
          let score = target ? PIECE_VALUES[target.type] * 0.6 : 0;
          score += (Math.random() - 0.5) * 260;
          if (score > bestScore) {
            bestScore = score;
            chosen = m;
          }
        }
        return chosen;
      }

      // 2. GRANDMASTER LEVEL (~9.5 - 10/10 Difficulty: Opening Book + Iterative-Deepening 4-Ply Alpha-Beta + 4-Ply Quiescence Search + Full Positional Eval)
      if (mode === 'grandmaster') {
        if (!scriptedGameActive && moveHistory.length <= 6) {
          const histKey = moveHistory
            .map((entry) => `${entry.move.fromR},${entry.move.fromC}-${entry.move.toR},${entry.move.toC}`)
            .join(';');
          const bookReplies = GRANDMASTER_OPENING_BOOK[histKey];
          if (bookReplies && bookReplies.length > 0) {
            const validBookMoves = [];
            for (const bm of bookReplies) {
              const found = legalMoves.find(
                (lm) =>
                  lm.fromR === bm.fromR &&
                  lm.fromC === bm.fromC &&
                  lm.toR === bm.toR &&
                  lm.toC === bm.toC
              );
              if (found) validBookMoves.push(found);
            }
            if (validBookMoves.length > 0) {
              return validBookMoves[Math.floor(Math.random() * validBookMoves.length)];
            }
          }
        }

        const oppColor = color === 'w' ? 'b' : 'w';
        orderMovesForSearch(legalMoves, color);

        let bestMove = legalMoves[0];
        searchNodeCounter = 0;
        searchAborted = false;
        // 130ms max budget guarantees zero frame stutter while easily completing 3-4+ ply with Quiescence
        searchDeadlineMs = performance.now() + 130;

        // Iterative Deepening from depth 2 -> 3 -> 4 (so root move ordering improves each pass)
        for (let targetDepth = 2; targetDepth <= 4; targetDepth++) {
          let currentBestMove = legalMoves[0];
          let currentBestScore = -Infinity;
          let alpha = -Infinity;
          const beta = Infinity;

          for (let i = 0; i < legalMoves.length; i++) {
            const m = legalMoves[i];
            const undo = makeSearchMove(m);
            const score = -alphaBetaSearch(targetDepth - 1, -beta, -alpha, oppColor, 4, true);
            unmakeSearchMove(m, undo);

            if (searchAborted) break;

            m._lastSearchScore = score;
            if (score > currentBestScore) {
              currentBestScore = score;
              currentBestMove = m;
            }
            if (score > alpha) {
              alpha = score;
            }
          }

          if (!searchAborted) {
            bestMove = currentBestMove;
            // Re-sort root moves by exact search score for next deeper iteration
            legalMoves.sort((a, b) => (b._lastSearchScore ?? -999999) - (a._lastSearchScore ?? -999999));
            if (currentBestScore >= 85000) break; // Forced checkmate found!
          } else {
            break;
          }
        }

        return bestMove || legalMoves[0];
      }

      // 3. PROFESSIONAL LEVEL (~7.5 - 8/10 Difficulty: 3-Ply Alpha-Beta Search + 2-Ply Quiescence + Piece-Square Tables)
      const oppColor = color === 'w' ? 'b' : 'w';
      orderMovesForSearch(legalMoves, color);

      searchNodeCounter = 0;
      searchAborted = false;
      searchDeadlineMs = performance.now() + 85;

      let bestScore = -Infinity;
      let scoredMoves = [];
      let alpha = -Infinity;
      const beta = Infinity;

      for (let i = 0; i < legalMoves.length; i++) {
        const m = legalMoves[i];
        const undo = makeSearchMove(m);
        // Depth 2 remaining after root move = 3-Ply total lookahead + 2-Ply Quiescence capture verification
        const score = -alphaBetaSearch(2, -beta, -alpha, oppColor, 2, false);
        unmakeSearchMove(m, undo);

        const finalScore = searchAborted ? (m._orderScore || 0) : score;
        scoredMoves.push({ move: m, score: finalScore });

        if (finalScore > bestScore) {
          bestScore = finalScore;
        }
        if (!searchAborted && finalScore > alpha) {
          alpha = finalScore;
        }
      }

      // Choose among moves within 8 centipawns of the best tactical move (zero blunders, natural variety)
      const topCandidates = scoredMoves.filter((item) => item.score >= bestScore - 8);
      if (topCandidates.length > 0) {
        return topCandidates[Math.floor(Math.random() * topCandidates.length)].move;
      }
      return legalMoves[0];
    }

    function triggerAIMoveNow() {
      if (isAnimatingMove || gameOver || isGamePaused) return false;
      const chosen = chooseSmartAIMove(currentTurn);
      if (!chosen) return false;
      return executeChessMove(chosen.fromR, chosen.fromC, chosen.toR, chosen.toC);
    }

    function maybeScheduleAIMove() {
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
      if (gameOver || isAnimatingMove || preMoveHighlightTask || isGamePaused) return;
      if (scriptedGameActive) return;
      if (gameMode !== 'single' || !aiAutoPlay) return;

      const aiColor = playerColor === 'w' ? 'b' : 'w';
      if (currentTurn === aiColor) {
        aiTimer = setTimeout(() => {
          aiTimer = null;
          if (
            !scriptedGameActive &&
            gameMode === 'single' &&
            currentTurn === aiColor &&
            !isAnimatingMove &&
            !gameOver &&
            !isGamePaused
          ) {
            triggerAIMoveNow();
          }
        }, 540);
      }
    }

    // =========================================================================
    // Feature 3 (3a, 3b, 3c): Chess Notation Parser & Step-Through Choreography
    // =========================================================================
    function createInitialVirtualBoard() {
      const b = Array.from({ length: 8 }, () => Array(8).fill(null));
      const backRow = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
      for (let c = 0; c < 8; c++) {
        b[7][c] = { type: backRow[c], color: 'w', hasMoved: false };
        b[6][c] = { type: 'pawn', color: 'w', hasMoved: false };
        b[1][c] = { type: 'pawn', color: 'b', hasMoved: false };
        b[0][c] = { type: backRow[c], color: 'b', hasMoved: false };
      }
      return b;
    }

    function getVirtualLegalMovesForSquare(r, c, vBoard) {
      const piece = vBoard[r][c];
      if (!piece) return [];
      const pseudo = getPseudoMovesForPiece(r, c, vBoard);
      const legal = [];
      for (const m of pseudo) {
        const savedTarget = vBoard[m.r][m.c];
        vBoard[m.r][m.c] = piece;
        vBoard[r][c] = null;
        const inCheck = isKingInCheck(piece.color, vBoard);
        vBoard[r][c] = piece;
        vBoard[m.r][m.c] = savedTarget;
        if (!inCheck) legal.push(m);
      }
      return legal;
    }

    function parseNotationToMoves(notationText) {
      const cleaned = String(notationText || '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\{[^}]*\}/g, ' ')
        .replace(/;[^\n]*/g, ' ')
        .replace(/\([^)]*\)/g, ' ');

      const rawTokens = cleaned
        .split(/\s+/)
        .map((t) => t.replace(/^\d+\.+/g, '').trim())
        .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*|\d+\.?)$/.test(t));

      const vBoard = createInitialVirtualBoard();
      let turn = 'w';
      const parsedMoves = [];
      const promoMap = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
      const sanPieceMap = { N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king', P: 'pawn' };

      for (const rawTok of rawTokens) {
        let tok = rawTok.replace(/[+#!?]+$/g, '');
        if (!tok) continue;

        let matched = null;

        // 1. Castling (O-O / 0-0 / O-O-O / 0-0-0)
        if (/^(O-O-O|0-0-0|O-O|0-0)$/i.test(tok)) {
          const isQueenside = tok.length >= 5;
          const kr = turn === 'w' ? 7 : 0;
          const fromC = 4;
          const toC = isQueenside ? 2 : 6;
          if (vBoard[kr][fromC] && vBoard[kr][fromC].type === 'king') {
            matched = {
              fromR: kr,
              fromC,
              toR: kr,
              toC,
              pieceType: 'king',
              capture: false,
              promotion: null,
              castling: isQueenside ? 'q' : 'k'
            };
          }
        }

        // 2. Coordinate / UCI notation (e.g. e2e4, e2-e4, e4xd5, g1f3, e7e8q)
        if (!matched) {
          const uciMatch = tok.match(/^([a-h])([1-8])[-x]?([a-h])([1-8])(?:=?([qrbnQRBN]))?$/);
          if (uciMatch) {
            const fromC = uciMatch[1].charCodeAt(0) - 97;
            const fromR = 8 - parseInt(uciMatch[2], 10);
            const toC = uciMatch[3].charCodeAt(0) - 97;
            const toR = 8 - parseInt(uciMatch[4], 10);
            const promoChar = uciMatch[5] ? uciMatch[5].toLowerCase() : null;
            const p = vBoard[fromR]?.[fromC];
            if (p && p.color === turn) {
              matched = {
                fromR,
                fromC,
                toR,
                toC,
                pieceType: p.type,
                capture: Boolean(vBoard[toR]?.[toC]),
                promotion: promoChar ? promoMap[promoChar] : null
              };
            }
          }
        }

        // 3. Standard Algebraic Notation (SAN: e4, exd5, Nf3, Nc6, Bc4, Qxd5, Nbd7, R1e2, e8=Q)
        if (!matched) {
          let promotion = null;
          const promoEq = tok.match(/=([QRBNqrbn])$/);
          if (promoEq) {
            promotion = promoMap[promoEq[1].toLowerCase()] || 'queen';
            tok = tok.slice(0, -2);
          }

          let pieceType = 'pawn';
          let rest = tok;
          if (/^[NBRQK]/.test(rest)) {
            pieceType = sanPieceMap[rest[0]];
            rest = rest.slice(1);
          } else if (/^P/.test(rest)) {
            pieceType = 'pawn';
            rest = rest.slice(1);
          }

          const destMatch = rest.match(/([a-h])([1-8])$/);
          if (destMatch) {
            const toC = destMatch[1].charCodeAt(0) - 97;
            const toR = 8 - parseInt(destMatch[2], 10);
            const prefix = rest.slice(0, rest.length - 2).replace(/x/g, '');

            let disambigC = null;
            let disambigR = null;
            for (const ch of prefix) {
              if (ch >= 'a' && ch <= 'h') disambigC = ch.charCodeAt(0) - 97;
              else if (ch >= '1' && ch <= '8') disambigR = 8 - parseInt(ch, 10);
            }

            const candidates = [];
            for (let r = 0; r < 8; r++) {
              for (let c = 0; c < 8; c++) {
                const p = vBoard[r][c];
                if (!p || p.color !== turn || p.type !== pieceType) continue;
                if (disambigC !== null && c !== disambigC) continue;
                if (disambigR !== null && r !== disambigR) continue;
                const legals = getVirtualLegalMovesForSquare(r, c, vBoard);
                const hit = legals.find((m) => m.r === toR && m.c === toC);
                if (hit) {
                  candidates.push({
                    fromR: r,
                    fromC: c,
                    toR,
                    toC,
                    pieceType,
                    capture: Boolean(hit.capture || vBoard[toR][toC]),
                    promotion
                  });
                }
              }
            }
            if (candidates.length > 0) {
              matched = candidates[0];
            }
          }
        }

        if (!matched) {
          console.warn('Could not parse notation token:', rawTok);
          break;
        }

        const movingPiece = vBoard[matched.fromR][matched.fromC];
        vBoard[matched.fromR][matched.fromC] = null;
        if (matched.castling) {
          const kr = matched.fromR;
          if (matched.castling === 'k') {
            vBoard[kr][5] = vBoard[kr][7];
            vBoard[kr][7] = null;
          } else {
            vBoard[kr][3] = vBoard[kr][0];
            vBoard[kr][0] = null;
          }
        }
        const finalType =
          matched.promotion ||
          (movingPiece.type === 'pawn' && (matched.toR === 0 || matched.toR === 7)
            ? 'queen'
            : movingPiece.type);
        vBoard[matched.toR][matched.toC] = {
          type: finalType,
          color: turn,
          hasMoved: true
        };

        parsedMoves.push({
          index: parsedMoves.length,
          ply: parsedMoves.length + 1,
          moveNumber: Math.floor(parsedMoves.length / 2) + 1,
          color: turn,
          san: rawTok,
          fromR: matched.fromR,
          fromC: matched.fromC,
          toR: matched.toR,
          toC: matched.toC,
          pieceType: matched.pieceType,
          capture: matched.capture,
          promotion: matched.promotion || 'queen'
        });

        turn = turn === 'w' ? 'b' : 'w';
      }

      return parsedMoves;
    }

    function updateScriptBarUI() {
      const label = document.getElementById('script-step-label');
      const statusMsg = document.getElementById('script-status-msg');
      const prevBtn = document.getElementById('btn-script-prev');
      const nextBtn = document.getElementById('btn-script-next');

      const total = scriptMoves.length;
      if (label) {
        if (total === 0) {
          label.textContent = `Move ${moveHistory.length}`;
        } else if (scriptDeviated) {
          label.textContent = `Move ${moveHistory.length} • Custom Takeover`;
        } else if (scriptCursor < total) {
          const nextSan = scriptMoves[scriptCursor].san;
          label.textContent = `Step ${scriptCursor}/${total} • Next: ${nextSan}`;
        } else {
          label.textContent = `Step ${total}/${total} (Done)`;
        }
      }
      if (prevBtn) {
        prevBtn.disabled = moveHistory.length === 0 && !preMoveHighlightTask && !isAnimatingMove;
      }
      if (nextBtn) {
        nextBtn.disabled = gameOver || (!scriptDeviated && total > 0 && scriptCursor >= total && !preMoveHighlightTask);
      }
      if (statusMsg && total > 0) {
        if (scriptDeviated) {
          statusMsg.textContent = `Custom takeover active at Move ${moveHistory.length} (Use [ to step back or ] for AI move).`;
        } else {
          statusMsg.textContent = `Loaded ${total} half-moves. Step ${scriptCursor}/${total} ready (Use [ and ] to step, Arrow keys to rotate cam).`;
        }
      }
    }

    const DEFAULT_DIRECTOR_NOTATION =
      '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qd8 4. d4 c6 5. Bc4 h6 6. Nf3 Bg4 7. Bxf7+ Kxf7 8. Ne5+ Ke8 9. Qxg4 Nf6 10. Qg6#';

    function loadNotationScript(notationStr, options = {}) {
      const parsed = parseNotationToMoves(notationStr);
      scriptMoves = parsed;
      scriptCursor = 0;
      scriptDeviated = false;
      scriptedGameActive = parsed.length > 0;
      const inputEl = document.getElementById('input-notation');
      if (inputEl && notationStr) {
        inputEl.value = notationStr;
      }
      resetChessBoard(Boolean(options.orientCamera), true);
      updateScriptBarUI();
      return {
        ok: parsed.length > 0,
        count: parsed.length,
        moves: parsed
      };
    }

    function completeCurrentMoveImmediately() {
      if (preMoveHighlightTask) {
        const mv = preMoveHighlightTask.move;
        const fromScriptFlag = Boolean(preMoveHighlightTask.fromScript);
        preMoveHighlightTask = null;
        executeChessMove(mv.fromR, mv.fromC, mv.toR, mv.toC, { fromScript: fromScriptFlag });
      }
      let safety = 0;
      while (activeMoveTweens.length > 0 && safety < 200) {
        safety++;
        for (let i = activeMoveTweens.length - 1; i >= 0; i--) {
          const done = activeMoveTweens[i](0.05);
          if (done) activeMoveTweens.splice(i, 1);
        }
      }
    }

    function isScriptMoveLegalOnCurrentBoard(mv) {
      if (!mv) return false;
      const piece = boardState[mv.fromR]?.[mv.fromC];
      if (!piece || piece.color !== currentTurn) return false;
      const destPiece = boardState[mv.toR]?.[mv.toC];
      if (destPiece && destPiece.color === piece.color) return false;
      const legals = getLegalMovesForPiece(mv.fromR, mv.fromC);
      return legals.some((m) => m.r === mv.toR && m.c === mv.toC);
    }

    function stepScriptForward() {
      if (gameOver) return false;

      // If a move animation or pre-move highlight is currently running, finish it cleanly before advancing
      if (isAnimatingMove || preMoveHighlightTask) {
        completeCurrentMoveImmediately();
        if (gameOver) return false;
        if (!scriptDeviated && scriptMoves.length > 0 && scriptCursor >= scriptMoves.length) return false;
      }

      // If no notation script has been loaded yet and no moves have been played, parse the default script in #input-notation
      if (scriptMoves.length === 0 && moveHistory.length === 0) {
        const defaultPgn =
          document.getElementById('input-notation')?.value || DEFAULT_DIRECTOR_NOTATION;
        loadNotationScript(defaultPgn, { orientCamera: false });
      }

      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }

      // Determine whether the next scripted move is still valid on the current board
      let nextMove = null;
      let isFromScript = false;
      if (!scriptDeviated && scriptCursor < scriptMoves.length) {
        const candidate = scriptMoves[scriptCursor];
        if (isScriptMoveLegalOnCurrentBoard(candidate)) {
          nextMove = candidate;
          isFromScript = true;
          scriptedGameActive = true;
        } else {
          scriptDeviated = true;
          scriptedGameActive = false;
        }
      }

      // If the user took over and deviated from the script, Next ] cleanly executes a smart legal move for currentTurn
      if (!nextMove) {
        if (!scriptDeviated && scriptMoves.length > 0 && scriptCursor >= scriptMoves.length) {
          return false;
        }
        const aiFallback = chooseSmartAIMove(currentTurn);
        if (!aiFallback) return false;
        nextMove = {
          fromR: aiFallback.fromR,
          fromC: aiFallback.fromC,
          toR: aiFallback.toR,
          toC: aiFallback.toC,
          color: currentTurn
        };
        isFromScript = false;
      }

      const chkHighlight = document.getElementById('chk-premove-highlight');
      const chkBoth = document.getElementById('chk-premove-both');
      const showPreHighlight = chkHighlight ? chkHighlight.checked : true;
      const highlightBothSides = chkBoth ? chkBoth.checked : false;

      // Feature 3c: When triggering moves for the player's side (or both sides if toggled),
      // first show selecting the piece and its legal destination squares before executing the move!
      if (showPreHighlight && (nextMove.color === playerColor || highlightBothSides)) {
        selectedSquare = { r: nextMove.fromR, c: nextMove.fromC };
        validMoves = getLegalMovesForPiece(nextMove.fromR, nextMove.fromC);
        showSquareHighlights(nextMove.fromR, nextMove.fromC, validMoves);
        preMoveHighlightTask = {
          move: nextMove,
          fromScript: isFromScript,
          elapsedSim: 0,
          startWallMs: performance.now(),
          duration: 0.62
        };
        updateScriptBarUI();
        return true;
      }

      return executeChessMove(nextMove.fromR, nextMove.fromC, nextMove.toR, nextMove.toC, {
        fromScript: isFromScript
      });
    }

    function stepScriptBackward() {
      if (preMoveHighlightTask) {
        preMoveHighlightTask = null;
        clearSquareHighlights();
        selectedSquare = null;
        validMoves = [];
        updateScriptBarUI();
        return true;
      }

      if (moveHistory.length === 0) {
        return false;
      }

      const lastEntry = moveHistory.pop();
      restoreBoardSnapshot(lastEntry.snapshot);
      return true;
    }

    function canUndo() {
      return moveHistory.length > 0 || Boolean(preMoveHighlightTask);
    }

    function undoFullRound() {
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = null;
      }
      if (isAnimatingMove || preMoveHighlightTask) {
        completeCurrentMoveImmediately();
      }
      if (moveHistory.length === 0) {
        return { ok: false, undoneCount: 0 };
      }

      // In single-player mode, undo both the AI's last reply and the player's last move
      // so the board returns to the player's turn.
      let undoneCount = 0;
      let targetSnapshot = null;

      if (gameMode === 'single' && moveHistory.length >= 2) {
        const topEntry = moveHistory[moveHistory.length - 1];
        // If top move was made by AI (leaving currentTurn === playerColor), pop 2 moves (AI + Player)
        if (topEntry && topEntry.move && topEntry.move.color !== playerColor) {
          moveHistory.pop();
          const playerEntry = moveHistory.pop();
          targetSnapshot = playerEntry.snapshot;
          undoneCount = 2;
        } else {
          const singleEntry = moveHistory.pop();
          targetSnapshot = singleEntry.snapshot;
          undoneCount = 1;
        }
      } else {
        const singleEntry = moveHistory.pop();
        targetSnapshot = singleEntry.snapshot;
        undoneCount = 1;
      }

      // Ensure scripted autoplay doesn't override manual play after Undo
      targetSnapshot.scriptedGameActive = false;
      targetSnapshot.scriptDeviated = true;
      restoreBoardSnapshot(targetSnapshot);
      renderer.render(scene, camera);
      return { ok: true, undoneCount, moveHistoryCount: moveHistory.length };
    }

    function coordToAlgebraic(r, c) {
      const file = String.fromCharCode(97 + c);
      const rank = String(8 - r);
      return `${file}${rank}`;
    }

    function showBestMoveHint() {
      if (gameOver) return { ok: false, reason: 'Game is already over.' };
      if (isAnimatingMove || preMoveHighlightTask) {
        completeCurrentMoveImmediately();
      }
      const best = chooseSmartAIMove(currentTurn, true);
      if (!best) return { ok: false, reason: 'No legal moves available.' };

      const piece = boardState[best.fromR]?.[best.fromC];
      const legals = getLegalMovesForPiece(best.fromR, best.fromC);
      selectedSquare = { r: best.fromR, c: best.fromC };
      validMoves = legals;
      showSquareHighlights(best.fromR, best.fromC, legals);

      // Add high-visibility 3D Golden Hint Beacons on Origin and Target Squares
      const fromWorld = boardToWorld(best.fromR, best.fromC);
      const toWorld = boardToWorld(best.toR, best.toC);

      const hintOriginGeo = new THREE.RingGeometry(0.135, 0.178, 36);
      hintOriginGeo.rotateX(-Math.PI / 2);
      const hintOriginMat = new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide });
      const hintOriginRing = new THREE.Mesh(hintOriginGeo, hintOriginMat);
      hintOriginRing.position.set(fromWorld.x, BOARD_SURFACE_Y + 0.015, fromWorld.z);
      squareHighlightsGroup.add(hintOriginRing);

      const hintTargetOuterGeo = new THREE.RingGeometry(0.125, 0.175, 36);
      hintTargetOuterGeo.rotateX(-Math.PI / 2);
      const hintTargetOuterMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4, side: THREE.DoubleSide });
      const hintTargetOuter = new THREE.Mesh(hintTargetOuterGeo, hintTargetOuterMat);
      hintTargetOuter.position.set(toWorld.x, BOARD_SURFACE_Y + 0.016, toWorld.z);
      squareHighlightsGroup.add(hintTargetOuter);

      const hintTargetInnerGeo = new THREE.RingGeometry(0.065, 0.105, 36);
      hintTargetInnerGeo.rotateX(-Math.PI / 2);
      const hintTargetInnerMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e, side: THREE.DoubleSide });
      const hintTargetInner = new THREE.Mesh(hintTargetInnerGeo, hintTargetInnerMat);
      hintTargetInner.position.set(toWorld.x, BOARD_SURFACE_Y + 0.017, toWorld.z);
      squareHighlightsGroup.add(hintTargetInner);

      renderer.render(scene, camera);

      const pieceName = piece
        ? piece.type.charAt(0).toUpperCase() + piece.type.slice(1)
        : 'Piece';
      const fromCoord = coordToAlgebraic(best.fromR, best.fromC);
      const toCoord = coordToAlgebraic(best.toR, best.toC);
      const actionVerb = best.capture ? 'captures' : '→';

      return {
        ok: true,
        fromR: best.fromR,
        fromC: best.fromC,
        toR: best.toR,
        toC: best.toC,
        pieceType: piece?.type || 'pawn',
        fromCoord,
        toCoord,
        capture: Boolean(best.capture),
        label: `${pieceName} ${fromCoord.toUpperCase()} ${actionVerb} ${toCoord.toUpperCase()}`
      };
    }

    // =========================================================================
    // Feature 1: Toggle All On-Screen UI Off/On for Clean Cinematic Recording
    // =========================================================================
    function toggleUI(forceHidden) {
      const shouldHide =
        typeof forceHidden === 'boolean'
          ? forceHidden
          : !document.body.classList.contains('cinematic-ui-hidden');
      document.body.classList.toggle('cinematic-ui-hidden', shouldHide);
      const btnHide = document.getElementById('btn-hide-ui');
      if (btnHide) {
        btnHide.textContent = shouldHide ? 'Show UI' : 'Hide UI';
      }
      return shouldHide;
    }

    // =========================================================================
    // Feature 4: Video-Game Style WASD + R/F Translation & Arrow-Key Rotation
    // with Configurable Speed (Default 10%) & Smooth Ease-In / Ease-Out
    // =========================================================================
    const heldCameraKeys = new Set();
    const CAM_MOVE_KEY_CODES = new Set([
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyR',
      'KeyF',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight'
    ]);
    let cameraKeySpeedPct = 35;
    let cameraRotSpeedPct = 35;
    const keyMoveVelocity = new THREE.Vector3(0, 0, 0);
    const keyRotVelocity = { yaw: 0, pitch: 0 };

    function setCameraKeySpeedPercent(pct) {
      const clamped = Math.max(1, Math.min(200, Math.round(Number(pct) || 10)));
      cameraKeySpeedPct = clamped;
      const sliderEl = document.getElementById('input-cam-speed');
      const valEl = document.getElementById('cam-speed-val');
      if (sliderEl && Number(sliderEl.value) !== clamped) {
        sliderEl.value = String(clamped);
      }
      if (valEl) {
        valEl.textContent = `${clamped}%`;
      }
      return cameraKeySpeedPct;
    }

    function setCameraRotSpeedPercent(pct) {
      const clamped = Math.max(1, Math.min(200, Math.round(Number(pct) || 10)));
      cameraRotSpeedPct = clamped;
      const sliderEl = document.getElementById('input-rot-speed');
      const valEl = document.getElementById('rot-speed-val');
      if (sliderEl && Number(sliderEl.value) !== clamped) {
        sliderEl.value = String(clamped);
      }
      if (valEl) {
        valEl.textContent = `${clamped}%`;
      }
      return cameraRotSpeedPct;
    }

    const camSpeedSliderEl = document.getElementById('input-cam-speed');
    if (camSpeedSliderEl) {
      camSpeedSliderEl.addEventListener('input', (e) => {
        setCameraKeySpeedPercent(e.target.value);
      });
      camSpeedSliderEl.addEventListener('change', (e) => {
        setCameraKeySpeedPercent(e.target.value);
      });
    }

    const rotSpeedSliderEl = document.getElementById('input-rot-speed');
    if (rotSpeedSliderEl) {
      rotSpeedSliderEl.addEventListener('input', (e) => {
        setCameraRotSpeedPercent(e.target.value);
      });
      rotSpeedSliderEl.addEventListener('change', (e) => {
        setCameraRotSpeedPercent(e.target.value);
      });
    }

    function isTypingInInput(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA' || el.isContentEditable) return true;
      if (tag === 'INPUT') {
        const type = (el.type || '').toLowerCase();
        return type !== 'range' && type !== 'checkbox' && type !== 'button';
      }
      return false;
    }

    window.addEventListener('keydown', (e) => {
      if (isTypingInInput(document.activeElement)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (CAM_MOVE_KEY_CODES.has(e.code)) {
        e.preventDefault();
        heldCameraKeys.add(e.code);
        return;
      }

      if (e.code === 'KeyH' || e.code === 'KeyU') {
        e.preventDefault();
        toggleUI();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (CAM_MOVE_KEY_CODES.has(e.code)) {
        heldCameraKeys.delete(e.code);
      }
    });

    window.addEventListener('blur', () => {
      heldCameraKeys.clear();
    });

    // =========================================================================
    // Feature 7: Checkmate Rigged King Fall-Over Animation & Cathedral Overlay
    // =========================================================================
    function spawnKingFallImpact(worldPos, color) {
      const mat = color === 'w' ? whitePieceMat : blackPieceMat;
      const count = isMobileDevice ? 12 : 18;
      for (let i = 0; i < count; i++) {
        const sz = 0.015 + Math.random() * 0.028;
        const frag = new THREE.Mesh(sharedShardGeo, mat);
        frag.scale.setScalar(sz);
        frag.position.set(
          worldPos.x + (Math.random() - 0.5) * 0.14,
          BOARD_SURFACE_Y + 0.04 + Math.random() * 0.10,
          worldPos.z + (Math.random() - 0.5) * 0.14
        );
        frag.castShadow = !isMobileDevice;
        scene.add(frag);
        shatterDebris.push({
          mesh: frag,
          baseScale: sz,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 1.45,
            0.65 + Math.random() * 1.25,
            (Math.random() - 0.5) * 1.45
          ),
          rotVel: new THREE.Vector3(
            Math.random() * 8,
            Math.random() * 8,
            Math.random() * 8
          ),
          life: 1.65
        });
      }
      impactFlashLight.position.set(worldPos.x, BOARD_SURFACE_Y + 0.35, worldPos.z);
      impactFlashLight.intensity = 6.2;
    }

    // =========================================================================
    // Celebratory 3D Golden & Emerald Victory Flair Burst
    // =========================================================================
    const victoryFlairGoldMat = new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0.95
    });
    const victoryFlairEmeraldMat = new THREE.MeshBasicMaterial({
      color: 0x38ef7d,
      transparent: true,
      opacity: 0.92
    });

    function spawnVictoryFlairBurst(winnerColor) {
      let winKingPos = new THREE.Vector3(0, BOARD_SURFACE_Y, 0);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = boardState[r][c];
          if (p && p.type === 'king' && p.color === winnerColor) {
            winKingPos = boardToWorld(r, c);
            break;
          }
        }
      }

      const flairCount = isMobileDevice ? 28 : 42;
      for (let i = 0; i < flairCount; i++) {
        const sz = 0.018 + Math.random() * 0.032;
        const mat = i % 3 === 0 ? victoryFlairEmeraldMat : victoryFlairGoldMat;
        const spark = new THREE.Mesh(sharedShardGeo, mat);
        spark.scale.setScalar(sz);
        const angle = (i / flairCount) * Math.PI * 2 + Math.random() * 0.3;
        const radius = 0.12 + Math.random() * 0.85;
        spark.position.set(
          winKingPos.x + Math.cos(angle) * radius,
          BOARD_SURFACE_Y + 0.08 + Math.random() * 0.35,
          winKingPos.z + Math.sin(angle) * radius
        );
        scene.add(spark);
        shatterDebris.push({
          mesh: spark,
          baseScale: sz,
          vel: new THREE.Vector3(
            Math.cos(angle) * (0.65 + Math.random() * 1.45),
            1.85 + Math.random() * 2.4,
            Math.sin(angle) * (0.65 + Math.random() * 1.45)
          ),
          rotVel: new THREE.Vector3(
            Math.random() * 10,
            Math.random() * 10,
            Math.random() * 10
          ),
          life: 2.35
        });
      }
      impactFlashLight.position.set(winKingPos.x, BOARD_SURFACE_Y + 0.65, winKingPos.z);
      impactFlashLight.intensity = 7.2;
    }

    function showCheckmateBanner(winnerColor, defeatedColor) {
      const overlay = document.getElementById('checkmate-overlay');
      const ornamentEl = overlay?.querySelector('.checkmate-ornament');
      const crownEl = document.getElementById('checkmate-crown');
      const titleEl = document.getElementById('checkmate-title');
      const subEl = document.getElementById('checkmate-subtitle');
      const replayBtn = document.getElementById('btn-checkmate-replay');

      const winnerName = winnerColor === 'w' ? 'White' : 'Black';
      const defeatedName = defeatedColor === 'w' ? 'White' : 'Black';
      const isAiDefeat =
        !scriptedGameActive && gameMode === 'single' && winnerColor !== playerColor;

      if (replayBtn) {
        replayBtn.style.display = '';
      }

      if (isAiDefeat) {
        if (ornamentEl) ornamentEl.textContent = '✦   SANCTUM FALLEN   ✦';
        if (crownEl) crownEl.textContent = '☠';
        if (titleEl) titleEl.textContent = 'Defeat';
        if (subEl) {
          subEl.textContent = `AI Triumphs • Your ${defeatedName} King Has Fallen`;
        }
      } else {
        if (ornamentEl) {
          ornamentEl.textContent =
            gameMode === 'single' && !scriptedGameActive
              ? '✦   ROYAL VICTORY FLAIR   ✦'
              : '✦   SANCTUM JUDGMENT   ✦';
        }
        if (crownEl) crownEl.textContent = winnerColor === 'w' ? '♔' : '♚';
        if (titleEl) {
          titleEl.textContent =
            gameMode === 'single' && !scriptedGameActive ? 'Victory! • Checkmate' : 'Checkmate';
        }
        if (subEl) {
          subEl.textContent = `${winnerName} Triumphs • The ${defeatedName} King Has Fallen`;
        }
      }

      if (overlay) {
        overlay.classList.remove(
          'draw-banner-active',
          'defeat-banner-active',
          'victory-flair-active'
        );
        overlay.classList.add(
          'visible',
          isAiDefeat ? 'defeat-banner-active' : 'victory-flair-active'
        );
      }
      checkmateState.bannerVisible = true;
      window.dispatchEvent(
        new CustomEvent('wizardchess:checkmate', {
          detail: {
            winnerColor,
            defeatedColor,
            outcome: isAiDefeat ? 'defeat' : 'victory'
          }
        })
      );
    }

    function isInsufficientMaterial(board = boardState) {
      const pieces = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p && p.type !== 'king') {
            pieces.push(p);
          }
        }
      }
      if (pieces.length === 0) return true; // King vs King
      if (
        pieces.length === 1 &&
        (pieces[0].type === 'bishop' || pieces[0].type === 'knight')
      ) {
        return true; // King + minor piece vs King
      }
      return false;
    }

    function triggerDrawSequence(drawReason = 'Stalemate') {
      window.wizardChessAudio?.playDrawSound?.();
      checkmateState.active = true;
      checkmateState.defeatedColor = null;
      checkmateState.winnerColor = null;
      checkmateState.kingFallAngleDeg = 0;
      checkmateState.phase = 'draw';
      checkmateState.bannerVisible = true;

      const overlay = document.getElementById('checkmate-overlay');
      const ornamentEl = overlay?.querySelector('.checkmate-ornament');
      const crownEl = document.getElementById('checkmate-crown');
      const titleEl = document.getElementById('checkmate-title');
      const subEl = document.getElementById('checkmate-subtitle');
      const replayBtn = document.getElementById('btn-checkmate-replay');

      if (ornamentEl) ornamentEl.textContent = '✦   SANCTUM TRUCE   ✦';
      if (crownEl) crownEl.textContent = '⚖';
      if (titleEl) titleEl.textContent = 'Match Drawn';
      if (subEl) {
        subEl.textContent = `${drawReason} • Neither Army Prevails`;
      }
      if (replayBtn) {
        replayBtn.style.display = 'none';
      }
      if (overlay) {
        overlay.classList.remove('victory-flair-active', 'defeat-banner-active');
        overlay.classList.add('visible', 'draw-banner-active');
      }

      window.dispatchEvent(
        new CustomEvent('wizardchess:draw', {
          detail: { reason: drawReason }
        })
      );
      return true;
    }

    function triggerCheckmateSequence(defeatedColor = currentTurn, winnerColor = null) {
      const actualWinner = winnerColor || (defeatedColor === 'w' ? 'b' : 'w');
      const isAiDefeat =
        !scriptedGameActive && gameMode === 'single' && actualWinner !== playerColor;

      if (isAiDefeat) {
        window.wizardChessAudio?.playDefeatSound?.();
      } else {
        window.wizardChessAudio?.playWarVictoryHorn?.();
        spawnVictoryFlairBurst(actualWinner);
      }

      // Find the defeated King on the board
      let kingPiece = null;
      let kingR = -1;
      let kingC = -1;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = boardState[r][c];
          if (p && p.type === 'king' && p.color === defeatedColor) {
            kingPiece = p;
            kingR = r;
            kingC = c;
            break;
          }
        }
      }

      checkmateState.active = true;
      checkmateState.defeatedColor = defeatedColor;
      checkmateState.winnerColor = actualWinner;
      checkmateState.kingFallAngleDeg = 0;
      checkmateState.phase = 'stagger';

      if (!kingPiece || !kingPiece.mesh) {
        showCheckmateBanner(actualWinner, defeatedColor);
        return false;
      }

      // Find the checkmating attacker piece so the King falls away from the blow or into the clearest open square
      let attackerPos = null;
      if (moveHistory.length > 0) {
        const lastMv = moveHistory[moveHistory.length - 1].move;
        if (lastMv) {
          attackerPos = boardToWorld(lastMv.toR, lastMv.toC);
        }
      }
      if (!attackerPos) {
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const p = boardState[r][c];
            if (p && p.color === actualWinner) {
              const moves = getPseudoMovesForPiece(r, c, boardState);
              if (moves.some((m) => m.r === kingR && m.c === kingC)) {
                attackerPos = boardToWorld(r, c);
                break;
              }
            }
          }
        }
      }

      const homePos = boardToWorld(kingR, kingC);
      const forwardDirZ = defeatedColor === 'b' ? 1 : -1;

      // Evaluate 16 candidate fall directions around the King to pick the clearest open path on the board
      let bestDirX = 0.24;
      let bestDirZ = forwardDirZ * 0.97;
      let bestScore = -Infinity;

      const awayFromAttacker = attackerPos
        ? new THREE.Vector2(homePos.x - attackerPos.x, homePos.z - attackerPos.z).normalize()
        : new THREE.Vector2(0.25, forwardDirZ).normalize();

      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const dx = Math.cos(ang);
        const dz = Math.sin(ang);

        // Check where the King's crown (0.50m from base) lands in board coordinates
        const tipWorldX = homePos.x + dx * 0.44;
        const tipWorldZ = homePos.z + dz * 0.44;
        const tipC = Math.round(tipWorldX / BOARD_SQ_SIZE + 3.5);
        const tipR = Math.round(tipWorldZ / BOARD_SQ_SIZE + 3.5);

        let score = 0;
        // Prefer staying inside the 8x8 board surface
        if (tipR >= 0 && tipR < 8 && tipC >= 0 && tipC < 8) {
          score += 40;
          const occ = boardState[tipR]?.[tipC];
          if (!occ) {
            score += 65; // Open square for the fallen King's body & crown!
          } else if (occ !== kingPiece) {
            score -= 50;
          }
        } else {
          score -= 35;
        }

        // Prefer falling away from the attacker's blow or forward-diagonally toward the center
        score += (dx * awayFromAttacker.x + dz * awayFromAttacker.y) * 18;
        score += dz * forwardDirZ * 14;

        if (score > bestScore) {
          bestScore = score;
          bestDirX = dx;
          bestDirZ = dz;
        }
      }

      const fallLen = Math.hypot(bestDirX, bestDirZ) || 1;
      const fallDirX = bestDirX / fallLen;
      const fallDirZ = bestDirZ / fallLen;

      // Highlight the defeated King's square with a crimson-and-gold Checkmate ring
      clearSquareHighlights();
      const outerRingGeo = new THREE.RingGeometry(0.135, 0.175, 36);
      outerRingGeo.rotateX(-Math.PI / 2);
      const outerRingMat = new THREE.MeshBasicMaterial({ color: 0xe63946, side: THREE.DoubleSide });
      const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
      outerRing.position.set(homePos.x, BOARD_SURFACE_Y + 0.012, homePos.z);
      squareHighlightsGroup.add(outerRing);

      const innerRingGeo = new THREE.RingGeometry(0.10, 0.125, 36);
      innerRingGeo.rotateX(-Math.PI / 2);
      const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e, side: THREE.DoubleSide });
      const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
      innerRing.position.set(homePos.x, BOARD_SURFACE_Y + 0.014, homePos.z);
      squareHighlightsGroup.add(innerRing);

      // Pause the King's idle mixer so its stone statue mesh pivots cleanly as a rigid monument
      if (kingPiece.currentAction) {
        kingPiece.currentAction.paused = true;
      }

      // Face the King toward the checkmating attacker (or forward) before toppling
      const baseYaw = attackerPos
        ? Math.atan2(attackerPos.x - homePos.x, attackerPos.z - homePos.z)
        : (defeatedColor === 'w' ? Math.PI : 0);
      const qBaseFacing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), baseYaw);
      // Right-handed horizontal axis perpendicular to fallDir so +angle pitches the King's crown toward (fallDirX, 0, fallDirZ)
      const tiltAxis = new THREE.Vector3(fallDirZ, 0, -fallDirX).normalize();
      const qTilt = new THREE.Quaternion();

      // Smoothly frame the checkmate on the board if the user isn't manually flying the camera with WASD
      if (heldCameraKeys.size === 0) {
        const camSideX = homePos.x >= 0 ? -1.35 : 1.35;
        const camSideZ = homePos.z + forwardDirZ * 1.45;
        smoothCameraTo(
          new THREE.Vector3(homePos.x + camSideX, BOARD_SURFACE_Y + 1.15, camSideZ),
          new THREE.Vector3(
            homePos.x + fallDirX * 0.22,
            BOARD_SURFACE_Y + 0.18,
            homePos.z + fallDirZ * 0.22
          ),
          0.95
        );
      }

      const RIM_RADIUS = 0.135;    // Pedestal bottom rim radius so the lower edge stays grounded on the board
      const MAX_FALL_RAD = 1.50;   // 86 degrees: King lies fallen on its side across the board tiles
      const tStagger = 0.36;
      const tImpact = 1.12;
      const tTotal = 1.82;

      let elapsed = 0;
      let impactTriggered = false;
      let bannerShown = false;

      function applyKingTopplePose(thetaRad, shudderRoll = 0) {
        const clampedTheta = Math.max(-0.15, Math.min(1.55, thetaRad));
        checkmateState.kingFallAngleDeg = Number(((clampedTheta * 180) / Math.PI).toFixed(1));

        const px = homePos.x + fallDirX * RIM_RADIUS * (1 - Math.cos(clampedTheta));
        const py = BOARD_SURFACE_Y + RIM_RADIUS * Math.sin(Math.max(0, clampedTheta));
        const pz = homePos.z + fallDirZ * RIM_RADIUS * (1 - Math.cos(clampedTheta));
        kingPiece.mesh.position.set(px, py, pz);

        qTilt.setFromAxisAngle(tiltAxis, clampedTheta);
        if (Math.abs(shudderRoll) > 1e-4) {
          const qShudder = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(fallDirX, 0, fallDirZ),
            shudderRoll
          );
          qTilt.multiply(qShudder);
        }
        kingPiece.mesh.quaternion.copy(qTilt).multiply(qBaseFacing);
      }

      function stepKingFall(dt) {
        if (!checkmateState.active || !kingPiece.mesh) return true;
        elapsed += dt;

        if (!bannerShown && elapsed >= 0.48) {
          bannerShown = true;
          showCheckmateBanner(actualWinner, defeatedColor);
        }

        if (elapsed <= tStagger) {
          // Phase 1: Royal Stagger & Tremor as the checkmate blow echoes through the King statue
          checkmateState.phase = 'stagger';
          const u = elapsed / tStagger;
          const shudder = Math.sin(u * Math.PI * 6) * 0.065 * (1 - u * 0.3);
          const initialLean = u * u * 0.12;
          applyKingTopplePose(initialLean, shudder);
        } else if (elapsed <= tImpact) {
          // Phase 2: Accelerating Gravity Topple around the stone pedestal rim (0.12 rad -> 1.50 rad = 86 deg)
          checkmateState.phase = 'topple';
          const u = Math.min(1, (elapsed - tStagger) / (tImpact - tStagger));
          const gravCurve = Math.pow(u, 2.25);
          const theta = 0.12 + (MAX_FALL_RAD - 0.12) * gravCurve;
          applyKingTopplePose(theta, 0);
        } else {
          // Phase 3: Heavy Stone Impact, Crown Shard Burst & Damped Restitution Bounce
          checkmateState.phase = 'impact';
          if (!impactTriggered) {
            impactTriggered = true;
            const crownImpactPos = new THREE.Vector3(
              homePos.x + fallDirX * 0.45,
              BOARD_SURFACE_Y,
              homePos.z + fallDirZ * 0.45
            );
            spawnKingFallImpact(crownImpactPos, defeatedColor);
          }

          const uBounce = Math.min(1, (elapsed - tImpact) / (tTotal - tImpact));
          const bounceAmp = 0.13 * Math.pow(1 - uBounce, 1.85);
          const theta = MAX_FALL_RAD - Math.abs(Math.sin(uBounce * Math.PI * 2.0)) * bounceAmp;
          applyKingTopplePose(theta, 0);

          // Subtle damped camera tremor when the heavy stone King crashes onto the altar board
          if (elapsed <= tImpact + 0.28) {
            const sProg = (elapsed - tImpact) / 0.28;
            const decay = (1 - sProg) * (1 - sProg);
            camera.position.y += Math.cos(sProg * Math.PI * 8) * 0.022 * decay;
          }
        }

        if (elapsed >= tTotal) {
          applyKingTopplePose(MAX_FALL_RAD, 0);
          checkmateState.phase = 'fallen';
          if (!bannerShown) {
            showCheckmateBanner(actualWinner, defeatedColor);
          }
          return true;
        }
        return false;
      }

      activeMoveTweens.push(stepKingFall);
      return true;
    }

    // =========================================================================
    // UI & Turn Status Updates
    // =========================================================================
    function updateTurnUI() {
      const turnDot = document.getElementById('turn-dot');
      const turnText = document.getElementById('turn-text');
      const modeBadge = document.getElementById('mode-badge');
      const btnAiMove = document.getElementById('btn-ai-move');
      const btnSideToggle = document.getElementById('btn-side-toggle');
      const roomPill = document.getElementById('room-pill');
      const capturedTray = document.getElementById('captured-tray');

      turnDot.className = 'turn-dot' + (currentTurn === 'b' ? ' black' : '');

      const legalMoves = getAllLegalMoves(currentTurn);
      const inCheck = isKingInCheck(currentTurn, boardState);
      const insufficientDraw = !inCheck && isInsufficientMaterial(boardState);

      updateCheckCourtAlert(inCheck, currentTurn);

      if (legalMoves.length === 0 || insufficientDraw) {
        gameOver = true;
        if (inCheck && legalMoves.length === 0) {
          const winner = currentTurn === 'w' ? 'Black' : 'White';
          turnText.textContent = `Checkmate — ${winner} Wins`;
          if (!checkmateState.active) {
            triggerCheckmateSequence(currentTurn, currentTurn === 'w' ? 'b' : 'w');
          }
        } else {
          const drawReason = insufficientDraw ? 'Insufficient Material' : 'Stalemate';
          turnText.textContent = `${drawReason} — Draw`;
          if (!checkmateState.active) {
            triggerDrawSequence(drawReason);
          }
        }
      } else {
        const turnLabel = currentTurn === 'w' ? 'White to Move' : 'Black to Move';
        const aiColor = playerColor === 'w' ? 'b' : 'w';
        const isAiTurn = !scriptedGameActive && gameMode === 'single' && currentTurn === aiColor;
        if (inCheck) {
          turnText.textContent = `${turnLabel} — CHECK!`;
        } else if (isAiTurn) {
          turnText.textContent = `${turnLabel} (AI)...`;
        } else {
          turnText.textContent = turnLabel;
        }
      }

      if (modeBadge) {
        if (gameMode === 'local') {
          modeBadge.textContent = '2P Local Match';
        } else {
          const diffLabel =
            aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1);
          modeBadge.textContent = `${diffLabel} AI · ${playerColor === 'w' ? 'White' : 'Black'}`;
        }
      }
      if (btnAiMove) {
        btnAiMove.style.display = 'inline-flex';
      }
      if (btnSideToggle) {
        btnSideToggle.style.display = 'inline-flex';
        btnSideToggle.textContent = playerColor === 'w' ? 'Play as Black' : 'Play as White';
      }
      if (roomPill) {
        roomPill.style.display = 'none';
      }

      if (capturedByWhite > 0 || capturedByBlack > 0) {
        capturedTray.textContent = `Captured — White: ${capturedByWhite} | Black: ${capturedByBlack}`;
      } else {
        capturedTray.textContent = '';
      }
      if (typeof updateScriptBarUI === 'function') updateScriptBarUI();
      window.dispatchEvent(
        new CustomEvent('wizardchess:statechange', {
          detail: {
            moveHistoryCount: moveHistory.length,
            currentTurn,
            playerColor,
            gameMode,
            aiDifficulty,
            graphicsQuality,
            autoDetectedGraphicsQuality,
            isGamePaused,
            gameOver,
            isAnimatingMove,
            capturedByWhite,
            capturedByBlack
          }
        })
      );
    }

    // =========================================================================
    // Raycasting & Board Interaction (with Fast Bounding-Sphere Pre-Filter)
    // =========================================================================
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const _pieceBoundSphere = new THREE.Sphere();
    let pointerDownPos = { x: 0, y: 0 };

    renderer.domElement.addEventListener('pointerdown', (e) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('pointerup', (e) => {
      const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moveDist > 6) return;
      if (isAnimatingMove || gameOver || isGamePaused) return;

      // Enforce turn ownership in Multiplayer, and in Single Player only block while AI auto-move timer is actively pending
      if (gameMode === 'multi' && currentTurn !== playerColor) return;
      if (!scriptedGameActive && gameMode === 'single' && currentTurn !== playerColor && aiTimer !== null) return;

      const vp = getLandscapeViewport();
      if (vp.rotated90) {
        const landscapeX = e.clientY;
        const landscapeY = window.innerWidth - e.clientX;
        pointer.x = (landscapeX / vp.width) * 2 - 1;
        pointer.y = -(landscapeY / vp.height) * 2 + 1;
      } else {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }

      raycaster.setFromCamera(pointer, camera);

      // Fast O(1) bounding-sphere pre-filter so we only triangle-raycast the 1-3 SkinnedMeshes near the tap ray
      const candidatePieceMeshes = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const pc = boardState[r][c];
          if (pc && pc.mesh) {
            const pH = PIECE_HEIGHTS[pc.type] || 0.48;
            _pieceBoundSphere.center.set(
              pc.mesh.position.x,
              pc.mesh.position.y + pH * 0.5,
              pc.mesh.position.z
            );
            _pieceBoundSphere.radius = Math.max(0.24, pH * 0.62);
            if (raycaster.ray.intersectsSphere(_pieceBoundSphere)) {
              candidatePieceMeshes.push(pc.mesh);
            }
          }
        }
      }

      const hits = raycaster.intersectObjects([...candidatePieceMeshes, ...boardSquareMeshes], true);
      if (hits.length === 0) {
        if (preMoveHighlightTask) preMoveHighlightTask = null;
        clearSquareHighlights();
        selectedSquare = null;
        validMoves = [];
        return;
      }

      let clickedR = -1;
      let clickedC = -1;
      let obj = hits[0].object;
      while (obj) {
        if (obj.userData && obj.userData.piece) {
          clickedR = obj.userData.piece.r;
          clickedC = obj.userData.piece.c;
          break;
        }
        if (obj.userData && obj.userData.isSquare) {
          clickedR = obj.userData.r;
          clickedC = obj.userData.c;
          break;
        }
        obj = obj.parent;
      }

      if (clickedR === -1) return;

      // Cancel any pending scripted pre-move highlight timer when the user manually interacts with the board
      if (preMoveHighlightTask) {
        preMoveHighlightTask = null;
      }

      if (selectedSquare) {
        const move = validMoves.find(
          (m) =>
            (m.r === clickedR && m.c === clickedC) ||
            (m.castle && m.r === clickedR && m.rookFromC === clickedC)
        );
        if (move) {
          executeChessMove(selectedSquare.r, selectedSquare.c, move.r, move.c);
          return;
        }
      }

      const clickedPiece = boardState[clickedR][clickedC];
      if (clickedPiece && clickedPiece.color === currentTurn) {
        selectedSquare = { r: clickedR, c: clickedC };
        validMoves = getLegalMovesForPiece(clickedR, clickedC);
        showSquareHighlights(clickedR, clickedC, validMoves);
        window.wizardChessAudio?.playPieceSelect?.();
      } else {
        clearSquareHighlights();
        selectedSquare = null;
        validMoves = [];
      }
    });

    // =========================================================================
    // Multiplayer Room Synchronization (Same-Origin API + Static Site Fallback)
    // =========================================================================
    const CLOUD_MP_API_BASE = '';
    const isStaticHost =
      window.location.hostname.includes('zipline') ||
      window.location.hostname.includes('github.io') ||
      window.location.protocol === 'file:';

    let staticBroadcastChannel = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        staticBroadcastChannel = new BroadcastChannel('wizard_chess_mp_channel');
        staticBroadcastChannel.onmessage = (ev) => {
          const msg = ev.data;
          if (msg && msg.type === 'room_state' && msg.room && msg.room.code === roomCode) {
            applyRemoteRoomState(msg.room);
          }
        };
      }
    } catch (e) {}

    window.addEventListener('storage', (ev) => {
      if (ev.key === `wizard_chess_room_${roomCode}` && ev.newValue) {
        try {
          applyRemoteRoomState(JSON.parse(ev.newValue));
        } catch (e) {}
      }
    });

    function getStaticRoom(code) {
      try {
        const raw = localStorage.getItem(`wizard_chess_room_${code}`);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    function saveAndBroadcastStaticRoom(room) {
      try {
        localStorage.setItem(`wizard_chess_room_${room.code}`, JSON.stringify(room));
      } catch (e) {}
      try {
        if (staticBroadcastChannel) {
          staticBroadcastChannel.postMessage({ type: 'room_state', room });
        }
      } catch (e) {}
    }

    function ensurePlayerToken() {
      if (!playerToken) {
        playerToken = 'tok_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
        try {
          localStorage.setItem('wizard_chess_token', playerToken);
        } catch (e) {}
      }
      return playerToken;
    }

    async function mpApiRequest(apiPath, options = {}) {
      const bases = isStaticHost
        ? (CLOUD_MP_API_BASE ? [CLOUD_MP_API_BASE] : [])
        : (CLOUD_MP_API_BASE ? ['', CLOUD_MP_API_BASE] : ['']);
      for (const base of bases) {
        try {
          const res = await fetch(`${base}${apiPath}`, options);
          if (res.ok) {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              return await res.json();
            }
          }
        } catch (e) {}
      }
      return null;
    }

    async function sendMultiplayerMove(movePayload) {
      if (!roomCode) return;
      // 1. Update static local/BroadcastChannel room store immediately
      const stRoom = getStaticRoom(roomCode);
      if (stRoom) {
        stRoom.moves = stRoom.moves || [];
        stRoom.moves.push({
          seq: stRoom.moves.length + 1,
          color: movePayload.color,
          from: movePayload.from,
          to: movePayload.to,
          promotion: movePayload.promotion || 'queen',
          ts: Date.now()
        });
        stRoom.turn = movePayload.color === 'w' ? 'b' : 'w';
        stRoom.updatedAt = Date.now();
        saveAndBroadcastStaticRoom(stRoom);
      }
      // 2. Also broadcast to cloud/local room API if reachable
      await mpApiRequest(`/api/rooms/${roomCode}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(movePayload)
      });
    }

    function stopMultiplayerSync() {
      if (roomEventSource) {
        roomEventSource.close();
        roomEventSource = null;
      }
      if (roomPollTimer) {
        clearInterval(roomPollTimer);
        roomPollTimer = null;
      }
    }

    function applyRemoteRoomState(room) {
      if (!room) return;
      const statusEl = document.getElementById('hud-room-status');
      const bothReady = room.whiteJoined && room.blackJoined;
      if (statusEl) {
        statusEl.textContent = bothReady ? '2/2 Connected' : 'Waiting for Opponent';
      }
      const mpMsg = document.getElementById('mp-status-msg');
      if (mpMsg && roomCode) {
        mpMsg.textContent = bothReady
          ? `Both players connected to Room ${room.code}!`
          : `Room ${room.code} ready — waiting for second player to join...`;
      }

      if (room.resetCount > appliedResetCount) {
        appliedResetCount = room.resetCount;
        appliedMoveSeq = 0;
        resetChessBoard(false);
      }

      if (Array.isArray(room.moves) && room.moves.length > appliedMoveSeq) {
        const tryApplyNext = () => {
          if (isAnimatingMove) {
            setTimeout(tryApplyNext, 120);
            return;
          }
          if (appliedMoveSeq >= room.moves.length) return;
          const nextMove = room.moves[appliedMoveSeq];
          appliedMoveSeq = nextMove.seq || (appliedMoveSeq + 1);
          const pieceAtFrom = boardState[nextMove.from.r]?.[nextMove.from.c];
          if (pieceAtFrom) {
            executeChessMove(
              nextMove.from.r,
              nextMove.from.c,
              nextMove.to.r,
              nextMove.to.c,
              { fromRemote: true }
            );
          }
          if (appliedMoveSeq < room.moves.length) {
            setTimeout(tryApplyNext, 250);
          }
        };
        tryApplyNext();
      }
    }

    function startMultiplayerSync(code) {
      stopMultiplayerSync();
      roomCode = code;

      if (!isStaticHost) {
        try {
          roomEventSource = new EventSource(`/api/rooms/${code}/events`);
          roomEventSource.onmessage = (ev) => {
            try {
              const data = JSON.parse(ev.data);
              if (data.room) applyRemoteRoomState(data.room);
            } catch (e) {}
          };
        } catch (e) {}
      }

      roomPollTimer = setInterval(async () => {
        if (gameMode !== 'multi' || !roomCode) return;
        const data = await mpApiRequest(
          `/api/rooms/${roomCode}/state?playerToken=${encodeURIComponent(playerToken)}`
        );
        if (data && data.ok && data.room) {
          saveAndBroadcastStaticRoom(data.room);
          applyRemoteRoomState(data.room);
          return;
        }
        const stRoom = getStaticRoom(roomCode);
        if (stRoom) {
          applyRemoteRoomState(stRoom);
        }
      }, 1500);
    }

    async function createMultiplayerRoom(preferredColor) {
      const mpMsg = document.getElementById('mp-status-msg');
      mpMsg.textContent = 'Creating room...';
      ensurePlayerToken();

      let data = await mpApiRequest('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredColor, playerToken })
      });

      // Pure static fallback if neither local nor remote server is reachable
      if (!data || !data.ok) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let genCode = '';
        for (let i = 0; i < 4; i++) {
          genCode += chars[Math.floor(Math.random() * chars.length)];
        }
        const side = preferredColor === 'b' ? 'b' : 'w';
        const staticRoom = {
          code: genCode,
          status: 'waiting',
          whiteJoined: side === 'w',
          blackJoined: side === 'b',
          turn: 'w',
          moves: [],
          resetCount: 0,
          updatedAt: Date.now()
        };
        saveAndBroadcastStaticRoom(staticRoom);
        data = {
          ok: true,
          code: genCode,
          color: side,
          playerToken,
          room: staticRoom
        };
      } else if (data.room) {
        saveAndBroadcastStaticRoom(data.room);
      }

      playerToken = data.playerToken;
      try {
        localStorage.setItem('wizard_chess_token', playerToken);
      } catch (e) {}
      scriptedGameActive = false;
      gameMode = 'multi';
      playerColor = data.color;
      roomCode = data.code;
      appliedMoveSeq = 0;
      appliedResetCount = data.room.resetCount || 0;

      document.getElementById('modal-room-code').textContent = roomCode;
      document.getElementById('room-created-panel').style.display = 'block';

      resetChessBoard(true);
      startMultiplayerSync(roomCode);
      applyRemoteRoomState(data.room);
      window.history.replaceState({}, '', `?room=${roomCode}`);
    }

    async function joinMultiplayerRoom(codeInput) {
      const code = String(codeInput || '').trim().toUpperCase();
      const mpMsg = document.getElementById('mp-status-msg');
      if (!code) {
        mpMsg.textContent = 'Please enter a 4-character Room Code.';
        return false;
      }
      mpMsg.textContent = `Joining room ${code}...`;
      ensurePlayerToken();

      let data = await mpApiRequest('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, playerToken })
      });

      if (!data || !data.ok) {
        let stRoom = getStaticRoom(code);
        if (!stRoom) {
          stRoom = {
            code,
            status: 'playing',
            whiteJoined: true,
            blackJoined: true,
            turn: 'w',
            moves: [],
            resetCount: 0,
            updatedAt: Date.now()
          };
        } else {
          if (!stRoom.whiteJoined) stRoom.whiteJoined = true;
          else if (!stRoom.blackJoined) stRoom.blackJoined = true;
          stRoom.status = stRoom.whiteJoined && stRoom.blackJoined ? 'playing' : 'waiting';
          stRoom.updatedAt = Date.now();
        }
        const assignedColor = !stRoom.blackJoined ? 'w' : 'b';
        saveAndBroadcastStaticRoom(stRoom);
        data = {
          ok: true,
          code,
          color: assignedColor,
          playerToken,
          room: stRoom
        };
      } else if (data.room) {
        saveAndBroadcastStaticRoom(data.room);
      }

      playerToken = data.playerToken;
      try {
        localStorage.setItem('wizard_chess_token', playerToken);
      } catch (e) {}
      scriptedGameActive = false;
      gameMode = 'multi';
      playerColor = data.color;
      roomCode = data.code;
      appliedMoveSeq = 0;
      appliedResetCount = data.room.resetCount || 0;

      resetChessBoard(true);
      startMultiplayerSync(roomCode);
      applyRemoteRoomState(data.room);
      window.history.replaceState({}, '', `?room=${roomCode}`);
      closeLobbyModal();
      return true;
    }

    // =========================================================================
    // Camera Presets & HUD Controls
    // =========================================================================
    const camButtons = [
      'btn-cam-player',
      'btn-cam-top',
      'btn-cam-side',
      'btn-cam-wide'
    ];

    function setActiveCamButton(activeId) {
      for (const id of camButtons) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', id === activeId);
      }
    }

    let playerCamSide = 'w';     // toggles 'w' (White) <-> 'b' (Black) on repeat click of Player Cam
    let overheadCamSide = 'w';   // toggles 'w' (White) <-> 'b' (Black) on repeat click of Overhead
    let sideCamSide = 'east';    // toggles 'east' (+X) <-> 'west' (-X) on repeat click of Side
    let cathedralWideSide = 'north'; // toggles 'north' (Rose Window) <-> 'south' (Narthex Triptych) on repeat click of Cathedral

    function setCameraPose(posArr, targetArr) {
      activeCamTransition = null;
      if (Array.isArray(posArr) && posArr.length === 3) {
        camera.position.set(posArr[0], posArr[1], posArr[2]);
      }
      if (Array.isArray(targetArr) && targetArr.length === 3) {
        orbitControls.target.set(targetArr[0], targetArr[1], targetArr[2]);
      }
      enforceCathedralBoundsAndSolidColumns(null, camera.position, orbitControls.target);
      flushOrbitControlsDamping();
    }

    function setCameraPreset(preset) {
      if (preset === 'player') {
        const wasPlayerActive = document.getElementById('btn-cam-player')?.classList.contains('active');
        if (wasPlayerActive) {
          playerCamSide = playerCamSide === 'w' ? 'b' : 'w';
        } else {
          playerCamSide = playerColor === 'b' ? 'b' : 'w';
        }
        setActiveCamButton('btn-cam-player');
        setCameraForSide(playerCamSide, false);
      } else if (preset === 'top') {
        const wasTopActive = document.getElementById('btn-cam-top')?.classList.contains('active');
        if (wasTopActive) {
          overheadCamSide = overheadCamSide === 'w' ? 'b' : 'w';
        } else {
          overheadCamSide = playerColor === 'b' ? 'b' : 'w';
        }
        setActiveCamButton('btn-cam-top');
        const zSign = overheadCamSide === 'b' ? -1 : 1;
        smoothCameraTo(new THREE.Vector3(0, 6.85, zSign * 3.65), new THREE.Vector3(0, 0.78, 0), 0.75);
      } else if (preset === 'side') {
        const wasSideActive = document.getElementById('btn-cam-side')?.classList.contains('active');
        if (wasSideActive) {
          sideCamSide = sideCamSide === 'east' ? 'west' : 'east';
        } else {
          sideCamSide = 'east';
        }
        setActiveCamButton('btn-cam-side');
        const xSign = sideCamSide === 'west' ? -1 : 1;
        smoothCameraTo(new THREE.Vector3(xSign * 2.85, 1.85, 0), new THREE.Vector3(0, 0.84, 0), 0.75);
      } else if (preset === 'wide') {
        const wasWideActive = document.getElementById('btn-cam-wide')?.classList.contains('active');
        if (wasWideActive) {
          cathedralWideSide = cathedralWideSide === 'north' ? 'south' : 'north';
        } else {
          cathedralWideSide = playerColor === 'b' ? 'south' : 'north';
        }
        setActiveCamButton('btn-cam-wide');
        if (cathedralWideSide === 'south') {
          // Black's wide Cathedral perspective looking South toward the Narthex Triptych (chessboard centered in frame)
          smoothCameraTo(new THREE.Vector3(0, 2.55, -6.65), new THREE.Vector3(0, 1.95, 2.50), 0.85);
        } else {
          // White's wide Cathedral perspective looking North toward the Rose Window (chessboard centered in frame)
          smoothCameraTo(new THREE.Vector3(0, 2.55, 6.65), new THREE.Vector3(0, 1.95, -2.50), 0.85);
        }
      } else if (preset === 'white_backdrop') {
        smoothCameraTo(new THREE.Vector3(0, 2.35, -3.10), new THREE.Vector3(0, 2.20, 8.50), 0.85);
      } else if (preset === 'vaults') {
        smoothCameraTo(new THREE.Vector3(-1.60, 2.65, 3.20), new THREE.Vector3(2.20, 7.60, -9.50), 0.85);
      } else if (preset === 'side_windows') {
        smoothCameraTo(new THREE.Vector3(-1.40, 2.30, 0.60), new THREE.Vector3(5.20, 4.10, -5.80), 0.85);
      } else if (preset === 'back_windows') {
        smoothCameraTo(new THREE.Vector3(0, 3.40, -7.80), new THREE.Vector3(0, 4.60, -18.10), 0.85);
      } else if (preset === 'rear_windows') {
        smoothCameraTo(new THREE.Vector3(0, 3.40, 7.80), new THREE.Vector3(0, 4.60, 18.10), 0.85);
      }
    }

    document.getElementById('btn-cam-player')?.addEventListener('click', () => setCameraPreset('player'));
    document.getElementById('btn-cam-top')?.addEventListener('click', () => setCameraPreset('top'));
    document.getElementById('btn-cam-side')?.addEventListener('click', () => setCameraPreset('side'));
    document.getElementById('btn-cam-wide')?.addEventListener('click', () => setCameraPreset('wide'));
    document.getElementById('btn-hide-ui')?.addEventListener('click', () => toggleUI());

    document.getElementById('btn-script-modal')?.addEventListener('click', () => openLobbyModal('script'));
    document.getElementById('btn-script-prev')?.addEventListener('click', () => stepScriptBackward());
    document.getElementById('btn-script-next')?.addEventListener('click', () => stepScriptForward());

    document.getElementById('btn-ai-move')?.addEventListener('click', () => {
      triggerAIMoveNow();
    });

    document.getElementById('btn-side-toggle')?.addEventListener('click', () => {
      if (gameMode !== 'single') return;
      playerColor = playerColor === 'w' ? 'b' : 'w';
      resetChessBoard(true, scriptedGameActive);
    });

    document.getElementById('btn-reset')?.addEventListener('click', async () => {
      if (window.__reactHandlesReset) return;
      if (gameMode === 'multi' && roomCode) {
        const stRoom = getStaticRoom(roomCode);
        if (stRoom) {
          stRoom.moves = [];
          stRoom.turn = 'w';
          stRoom.resetCount = (stRoom.resetCount || 0) + 1;
          stRoom.updatedAt = Date.now();
          saveAndBroadcastStaticRoom(stRoom);
          applyRemoteRoomState(stRoom);
        }
        await mpApiRequest(`/api/rooms/${roomCode}/reset`, { method: 'POST' });
      } else {
        resetChessBoard(true, false);
      }
    });

    // =========================================================================
    // Lobby & Director Script Modal Interactions
    // =========================================================================
    const lobbyModal = document.getElementById('lobby-modal');
    let selectedSpColor = 'w';
    let selectedMpColor = 'w';

    function openLobbyModal(tab = null) {
      lobbyModal?.classList.add('open');
      if (tab === 'multi') switchLobbyTab('multi');
      else if (tab === 'script') switchLobbyTab('script');
      else if (tab === 'single') switchLobbyTab('single');
    }

    function closeLobbyModal() {
      lobbyModal?.classList.remove('open');
    }

    function switchLobbyTab(tab) {
      const isSingle = tab === 'single';
      const isMulti = tab === 'multi';
      const isScript = tab === 'script';
      document.getElementById('tab-single').classList.toggle('active', isSingle);
      document.getElementById('tab-multi').classList.toggle('active', isMulti);
      document.getElementById('tab-script').classList.toggle('active', isScript);
      document.getElementById('panel-single').style.display = isSingle ? 'block' : 'none';
      document.getElementById('panel-multi').style.display = isMulti ? 'block' : 'none';
      document.getElementById('panel-script').style.display = isScript ? 'block' : 'none';
    }

    document.getElementById('btn-lobby')?.addEventListener('click', () => openLobbyModal());
    document.getElementById('btn-close-lobby')?.addEventListener('click', closeLobbyModal);
    document.getElementById('tab-single')?.addEventListener('click', () => switchLobbyTab('single'));
    document.getElementById('tab-multi')?.addEventListener('click', () => switchLobbyTab('multi'));
    document.getElementById('tab-script')?.addEventListener('click', () => switchLobbyTab('script'));

    document.getElementById('btn-preset-scandi')?.addEventListener('click', () => {
      document.getElementById('input-notation').value = DEFAULT_DIRECTOR_NOTATION;
    });
    document.getElementById('btn-preset-italian')?.addEventListener('click', () => {
      document.getElementById('input-notation').value =
        '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+';
    });
    document.getElementById('btn-preset-scholar')?.addEventListener('click', () => {
      document.getElementById('input-notation').value =
        '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#';
    });

    document.getElementById('btn-load-notation')?.addEventListener('click', () => {
      const val = document.getElementById('input-notation').value;
      const res = loadNotationScript(val, { orientCamera: false });
      if (res.ok) {
        closeLobbyModal();
      } else {
        document.getElementById('script-status-msg').textContent =
          'Could not parse notation. Please enter valid PGN/SAN (e.g. 1. e4 e5 2. Nf3 Nc6) or UCI.';
      }
    });

    document.getElementById('pick-sp-white')?.addEventListener('click', () => {
      selectedSpColor = 'w';
      document.getElementById('pick-sp-white').classList.add('selected');
      document.getElementById('pick-sp-black').classList.remove('selected');
    });
    document.getElementById('pick-sp-black')?.addEventListener('click', () => {
      selectedSpColor = 'b';
      document.getElementById('pick-sp-black').classList.add('selected');
      document.getElementById('pick-sp-white').classList.remove('selected');
    });

    document.getElementById('btn-start-single')?.addEventListener('click', () => {
      stopMultiplayerSync();
      scriptedGameActive = false;
      gameMode = 'single';
      roomCode = null;
      playerColor = selectedSpColor;
      window.history.replaceState({}, '', window.location.pathname);
      closeLobbyModal();
      resetChessBoard(true);
    });

    document.getElementById('pick-mp-white')?.addEventListener('click', () => {
      selectedMpColor = 'w';
      document.getElementById('pick-mp-white').classList.add('selected');
      document.getElementById('pick-mp-black').classList.remove('selected');
    });
    document.getElementById('pick-mp-black')?.addEventListener('click', () => {
      selectedMpColor = 'b';
      document.getElementById('pick-mp-black').classList.add('selected');
      document.getElementById('pick-mp-white').classList.remove('selected');
    });

    document.getElementById('btn-create-room')?.addEventListener('click', () => {
      createMultiplayerRoom(selectedMpColor);
    });

    document.getElementById('btn-enter-created-room')?.addEventListener('click', () => {
      closeLobbyModal();
    });

    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
      if (!roomCode) return;
      navigator.clipboard?.writeText(roomCode);
      document.getElementById('mp-status-msg').textContent = `Copied room code ${roomCode}!`;
    });

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      if (!roomCode) return;
      const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      navigator.clipboard?.writeText(inviteUrl);
      document.getElementById('mp-status-msg').textContent = 'Copied invite link to clipboard!';
    });

    document.getElementById('room-pill')?.addEventListener('click', () => {
      openLobbyModal('multi');
    });

    document.getElementById('btn-join-room')?.addEventListener('click', () => {
      const val = document.getElementById('input-room-code').value;
      joinMultiplayerRoom(val);
    });

    document.getElementById('input-room-code')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        joinMultiplayerRoom(e.target.value);
      }
    });

    document.getElementById('btn-checkmate-stepback')?.addEventListener('click', () => {
      stepScriptBackward();
    });
    document.getElementById('btn-checkmate-replay')?.addEventListener('click', () => {
      const defCol = checkmateState.defeatedColor || currentTurn;
      const winCol = checkmateState.winnerColor || (defCol === 'w' ? 'b' : 'w');
      triggerCheckmateSequence(defCol, winCol);
    });
    document.getElementById('btn-checkmate-newgame')?.addEventListener('click', () => {
      if (window.__reactHandlesReset) return;
      resetChessBoard(true, false);
    });
    document.getElementById('btn-checkmate-dismiss')?.addEventListener('click', () => {
      const overlay = document.getElementById('checkmate-overlay');
      if (overlay) overlay.classList.remove('visible');
      checkmateState.bannerVisible = false;
    });

    // =========================================================================
    // Programmatic API for Automated Verification & Camera Inspection
    // =========================================================================
    window.wizardChess = {
      setCameraPreset,
      setCameraPose,
      setCameraLook: setCameraPose,
      setCameraKeySpeedPercent,
      setCameraRotSpeedPercent,
      setWallStoneLook,
      nextWallStoneLook,
      prevWallStoneLook,
      setFloorStoneLook,
      nextFloorStoneLook,
      prevFloorStoneLook,
      WALL_STONE_LOOKS,
      FLOOR_STONE_LOOKS,
      holdCameraKey: (code, down = true) => {
        if (down) heldCameraKeys.add(code);
        else heldCameraKeys.delete(code);
      },
      executeChessMove,
      triggerAIMoveNow,
      resetChessBoard,
      canUndo,
      undoFullRound,
      showBestMoveHint,
      setAIDifficulty,
      getAIDifficulty,
      setGraphicsQuality,
      getGraphicsQuality,
      getAutoDetectedGraphicsQuality,
      setGameMode,
      getGameMode,
      triggerTimeoutVictory,
      setGamePaused,
      startNewMatch,
      openLobbyModal,
      closeLobbyModal,
      toggleUI,
      loadNotation: (pgn, opts) => loadNotationScript(pgn, opts),
      stepScriptForward,
      stepScriptBackward,
      triggerCheckmateSequence,
      testColumnCollisionSlide: (startArr, endArr, steps = 20) => {
        activeCamTransition = null;
        camera.position.set(startArr[0], startArr[1], startArr[2]);
        const path = [];
        for (let i = 1; i <= steps; i++) {
          const u = i / steps;
          const prev = camera.position.clone();
          camera.position.set(
            startArr[0] + (endArr[0] - startArr[0]) * u,
            startArr[1] + (endArr[1] - startArr[1]) * u,
            startArr[2] + (endArr[2] - startArr[2]) * u
          );
          enforceCathedralBoundsAndSolidColumns(prev, camera.position, orbitControls.target);
          path.push(camera.position.toArray().map((v) => Number(v.toFixed(3))));
        }
        renderer.render(scene, camera);
        return path;
      },
      setSinglePlayerSide: (color) => {
        stopMultiplayerSync();
        scriptedGameActive = false;
        gameMode = 'single';
        playerColor = color === 'b' ? 'b' : 'w';
        resetChessBoard(true);
      },
      setupCustomScenario: (pieces, turn = 'w') => {
        stopMultiplayerSync();
        if (aiTimer) {
          clearTimeout(aiTimer);
          aiTimer = null;
        }
        activeMoveTweens.length = 0;
        isAnimatingMove = false;
        gameOver = false;
        scriptedGameActive = false;
        scriptDeviated = false;
        preMoveHighlightTask = null;
        clearCheckmateSequence();
        clearSquareHighlights();
        clearAllPieces();
        for (const p of pieces) {
          const inst = instantiatePiece(p.type, p.color, p.r, p.c);
          inst.hasMoved = Boolean(p.hasMoved);
          boardState[p.r][p.c] = inst;
        }
        currentTurn = turn;
        updateTurnUI();
        renderer.render(scene, camera);
      },
      triggerDemoCapture: () => {
        // Set up an immediate pawn capture (e4 x d5) and execute it
        resetChessBoard(true);
        // Move White e2->e4 and Black d7->d5 immediately on boardState, then animate White e4xd5
        const wp = boardState[6][4];
        boardState[6][4] = null;
        boardState[4][4] = wp;
        wp.r = 4; wp.c = 4;
        wp.mesh.position.copy(boardToWorld(4, 4));

        const bp = boardState[1][3];
        boardState[1][3] = null;
        boardState[3][3] = bp;
        bp.r = 3; bp.c = 3;
        bp.mesh.position.copy(boardToWorld(3, 3));

        currentTurn = 'w';
        return executeChessMove(4, 4, 3, 3);
      },
      getState: () => ({
        gameMode,
        graphicsQuality,
        autoDetectedGraphicsQuality,
        scriptedGameActive,
        scriptDeviated,
        scriptMovesCount: scriptMoves.length,
        scriptCursor,
        moveHistoryCount: moveHistory.length,
        preMoveHighlightActive: Boolean(preMoveHighlightTask),
        selectedSquare,
        validMovesCount: validMoves.length,
        highlightMeshCount: squareHighlightsGroup.children.length,
        uiHidden: document.body.classList.contains('cinematic-ui-hidden'),
        playerColor,
        currentTurn,
        roomCode,
        isAnimatingMove,
        gameOver,
        checkmateState: { ...checkmateState },
        capturedByWhite,
        capturedByBlack,
        cameraPos: camera.position.toArray(),
        cameraTarget: orbitControls.target.toArray(),
        playerCamSide,
        overheadCamSide,
        sideCamSide,
        cathedralWideSide,
        cameraKeySpeedPct,
        cameraRotSpeedPct,
        wallStoneLookIndex: currentWallStoneLookIdx,
        wallStoneLookName: WALL_STONE_LOOKS[currentWallStoneLookIdx]?.name || '',
        floorStoneLookIndex: currentFloorStoneLookIdx,
        floorStoneLookName: FLOOR_STONE_LOOKS[currentFloorStoneLookIdx]?.name || '',
        floorMaterialRoughness: cathedralFloorMats[0]?.roughness ?? null,
        floorMaterialMetalness: cathedralFloorMats[0]?.metalness ?? null,
        keyMoveVelocity: keyMoveVelocity.toArray().map((v) => Number(v.toFixed(4))),
        keyRotVelocity: {
          yaw: Number(keyRotVelocity.yaw.toFixed(4)),
          pitch: Number(keyRotVelocity.pitch.toFixed(4))
        },
        cathedralBounds: CATHEDRAL_BOUNDS,
        solidColumnsCount: CATHEDRAL_SOLID_PILLARS.filter((p) => p.isColumn).length,
        brazierPillars: CATHEDRAL_SOLID_PILLARS.filter((p) => !p.isColumn),
        telemetry: cameraTelemetry
      }),
      captureScreenshot: async (filename) => {
        renderer.render(scene, camera);
        const outCanvas = document.createElement('canvas');
        outCanvas.width = renderer.domElement.width;
        outCanvas.height = renderer.domElement.height;
        const ctx = outCanvas.getContext('2d');
        ctx.drawImage(renderer.domElement, 0, 0);

        const scale = outCanvas.width / window.innerWidth;

        // Draw Gothic Cathedral Checkmate Banner if active
        if (checkmateState.bannerVisible) {
          ctx.save();
          ctx.scale(scale, scale);
          const bw = 560;
          const bh = 168;
          const bx = (window.innerWidth - bw) / 2;
          const by = 84;

          ctx.fillStyle = 'rgba(10, 12, 20, 0.94)';
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.88)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 6);
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = 'rgba(212, 175, 55, 0.38)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bx + 6, by + 6, bw - 12, bh - 12, 4);
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(212, 175, 55, 0.88)';
          ctx.font = '600 12px Georgia, serif';
          ctx.fillText('✦   SANCTUM JUDGMENT   ✦', window.innerWidth / 2, by + 28);

          ctx.fillStyle = '#f5d76e';
          ctx.font = '26px serif';
          const crownChar = checkmateState.winnerColor === 'b' ? '♚' : '♔';
          ctx.fillText(crownChar, window.innerWidth / 2, by + 56);

          ctx.fillStyle = '#f7e299';
          ctx.font = 'bold 40px Georgia, serif';
          ctx.fillText('C H E C K M A T E', window.innerWidth / 2, by + 102);

          ctx.strokeStyle = 'rgba(212, 175, 55, 0.65)';
          ctx.beginPath();
          ctx.moveTo(bx + 90, by + 116);
          ctx.lineTo(bx + bw - 90, by + 116);
          ctx.stroke();

          const subTxt =
            document.getElementById('checkmate-subtitle')?.textContent ||
            'WHITE TRIUMPHS • THE BLACK KING HAS FALLEN';
          ctx.fillStyle = '#f0ece1';
          ctx.font = 'bold 14px Georgia, serif';
          ctx.fillText(subTxt.toUpperCase(), window.innerWidth / 2, by + 142);
          ctx.restore();
        }

        // Only draw HUD summary bar if UI is NOT hidden by cinematic mode
        if (!document.body.classList.contains('cinematic-ui-hidden')) {
          ctx.save();
          ctx.scale(scale, scale);
          ctx.fillStyle = 'rgba(12, 15, 22, 0.82)';
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(16, 16, 520, 42, 10);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#d4af37';
          ctx.font = 'bold 13px Inter, sans-serif';
          ctx.fillText('Arcane Chess 3D', 26, 42);

          const turnStr = document.getElementById('turn-text')?.textContent || '';
          const modeStr = document.getElementById('mode-badge')?.textContent || '';
          ctx.fillStyle = '#f0ece1';
          ctx.font = '600 13px Inter, sans-serif';
          ctx.fillText(`${turnStr}   |   ${modeStr}`, 168, 42);

          if (lobbyModal?.classList.contains('open')) {
            ctx.fillStyle = 'rgba(6, 8, 14, 0.72)';
            ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
            const cw = 440;
            const ch = 290;
            const cx = (window.innerWidth - cw) / 2;
            const cy = (window.innerHeight - ch) / 2;
            ctx.fillStyle = 'rgba(14, 17, 26, 0.96)';
            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(cx, cy, cw, ch, 16);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#d4af37';
            ctx.font = 'bold 18px Inter, sans-serif';
            ctx.fillText('MULTIPLAYER LOBBY • ROOM CODE', cx + 28, cy + 42);

            ctx.fillStyle = '#9aa0a6';
            ctx.font = '13px Inter, sans-serif';
            ctx.fillText('Share this 4-character Room Code with Player 2:', cx + 28, cy + 82);

            ctx.fillStyle = '#f5d76e';
            ctx.font = 'bold 38px monospace';
            ctx.fillText(roomCode || '----', cx + 150, cy + 138);

            ctx.fillStyle = '#4ea8de';
            ctx.font = '600 14px Inter, sans-serif';
            ctx.fillText('Create Room  •  Join Room by Code  •  Live Move Sync', cx + 42, cy + 195);

            ctx.fillStyle = '#f0ece1';
            ctx.font = '13px Inter, sans-serif';
            ctx.fillText(`Host Assigned: ${playerColor === 'w' ? 'White' : 'Black'}  |  Status: Waiting for Opponent`, cx + 48, cy + 240);
          }
          ctx.restore();
        }

        const dataUrl = outCanvas.toDataURL('image/png');
        const res = await fetch('/api/upload-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl, filename })
        });
        return res.json();
      }
    };

    window.wizardChess.stepBy = (seconds, steps = 24) => {
      const subDt = seconds / steps;
      for (let i = 0; i < steps; i++) {
        stepScene(subDt, false);
      }
      renderer.render(scene, camera);
    };

    // =========================================================================
    // Main Animation Loop (Zero-GC Preallocated Vectors & Full 60Hz Skeletal Precision)
    // =========================================================================
    let elapsedTotal = 0;
    const _prevCamPos = new THREE.Vector3();
    const _forwardVec = new THREE.Vector3();
    const _rightVec = new THREE.Vector3();
    const _horizDir = new THREE.Vector3();
    const _desiredMoveVel = new THREE.Vector3();
    const _moveDelta = new THREE.Vector3();
    const _beforeMovePos = new THREE.Vector3();
    const _actualMoveDelta = new THREE.Vector3();
    const _lookOffset = new THREE.Vector3();
    const _newOffset = new THREE.Vector3();

    function stepScene(dt, doRender = true) {
      elapsedTotal += dt;
      _prevCamPos.copy(camera.position);

      if (!doRender || navigator.webdriver) {
        for (let i = 0; i < activeMixers.length; i++) {
          activeMixers[i].update(dt);
        }
      } else {
        // Stationary Statue Skeleton Freeze:
        // Only evaluate bone matrices on pieces that are actively moving, attacking, dying, or cross-fading.
        // Stationary Idle stone statues stay locked in their sculpted Idle pose at 0 CPU/bone overhead!
        const pieceCount = activePiecesList.length;
        for (let i = 0; i < pieceCount; i++) {
          const p = activePiecesList[i];
          if (!p || !p.mixer) continue;
          if (!p.isIdleState || elapsedTotal < (p.fadeUntilTime || 0)) {
            p.mixer.update(dt);
          }
        }
      }

      // Feature 3c: Advance pre-move piece selection & valid-squares highlight beat before executing scripted move
      if (preMoveHighlightTask && !isAnimatingMove) {
        preMoveHighlightTask.elapsedSim += dt;
        const wallElapsed = (performance.now() - preMoveHighlightTask.startWallMs) / 1000;
        if (
          preMoveHighlightTask.elapsedSim >= preMoveHighlightTask.duration ||
          wallElapsed >= preMoveHighlightTask.duration
        ) {
          const mv = preMoveHighlightTask.move;
          const fromScriptFlag = Boolean(preMoveHighlightTask.fromScript);
          preMoveHighlightTask = null;
          executeChessMove(mv.fromR, mv.fromC, mv.toR, mv.toC, { fromScript: fromScriptFlag });
        }
      }

      for (let i = activeMoveTweens.length - 1; i >= 0; i--) {
        const done = activeMoveTweens[i](dt);
        if (done) activeMoveTweens.splice(i, 1);
      }

      // Feature 4: Video-game style WASD + R/F camera translation AND Arrow-key camera rotation
      if (!isAnimatingMove) {
        const moveSpeedScale = cameraKeySpeedPct / 100;
        const rotSpeedScale = cameraRotSpeedPct / 100;
        const maxMoveSpeed = 3.2 * moveSpeedScale;
        const maxVertSpeed = 2.6 * moveSpeedScale;
        const maxRotSpeed = 1.2 * rotSpeedScale;

        _forwardVec.subVectors(orbitControls.target, camera.position);
        _forwardVec.y = 0;
        if (_forwardVec.lengthSq() < 1e-6) {
          camera.getWorldDirection(_forwardVec);
          _forwardVec.y = 0;
        }
        _forwardVec.normalize();
        _rightVec.set(-_forwardVec.z, 0, _forwardVec.x).normalize();

        _horizDir.set(0, 0, 0);
        if (heldCameraKeys.has('KeyW')) _horizDir.add(_forwardVec);
        if (heldCameraKeys.has('KeyS')) _horizDir.sub(_forwardVec);
        if (heldCameraKeys.has('KeyD')) _horizDir.add(_rightVec);
        if (heldCameraKeys.has('KeyA')) _horizDir.sub(_rightVec);
        if (_horizDir.lengthSq() > 1e-6) _horizDir.normalize();

        _desiredMoveVel.copy(_horizDir).multiplyScalar(maxMoveSpeed);
        if (heldCameraKeys.has('KeyR')) _desiredMoveVel.y += maxVertSpeed;
        if (heldCameraKeys.has('KeyF')) _desiredMoveVel.y -= maxVertSpeed;

        let desiredYawVel = 0;
        let desiredPitchVel = 0;
        if (heldCameraKeys.has('ArrowLeft')) desiredYawVel += maxRotSpeed;
        if (heldCameraKeys.has('ArrowRight')) desiredYawVel -= maxRotSpeed;
        if (heldCameraKeys.has('ArrowUp')) desiredPitchVel += maxRotSpeed;
        if (heldCameraKeys.has('ArrowDown')) desiredPitchVel -= maxRotSpeed;

        const easeAlpha = 1 - Math.exp(-Math.max(0.001, dt) * 7.5);
        keyMoveVelocity.lerp(_desiredMoveVel, easeAlpha);
        keyRotVelocity.yaw += (desiredYawVel - keyRotVelocity.yaw) * easeAlpha;
        keyRotVelocity.pitch += (desiredPitchVel - keyRotVelocity.pitch) * easeAlpha;

        if (keyMoveVelocity.lengthSq() < 1e-8 && _desiredMoveVel.lengthSq() === 0) {
          keyMoveVelocity.set(0, 0, 0);
        }
        if (Math.abs(keyRotVelocity.yaw) < 1e-5 && desiredYawVel === 0) keyRotVelocity.yaw = 0;
        if (Math.abs(keyRotVelocity.pitch) < 1e-5 && desiredPitchVel === 0) keyRotVelocity.pitch = 0;

        const hasActiveMove = keyMoveVelocity.lengthSq() > 0;
        const hasActiveRot = keyRotVelocity.yaw !== 0 || keyRotVelocity.pitch !== 0;

        if (hasActiveMove || hasActiveRot) {
          activeCamTransition = null;

          if (hasActiveMove) {
            _moveDelta.copy(keyMoveVelocity).multiplyScalar(dt);
            _beforeMovePos.copy(camera.position);
            camera.position.add(_moveDelta);
            enforceCathedralBoundsAndSolidColumns(_beforeMovePos, camera.position, orbitControls.target);
            _actualMoveDelta.subVectors(camera.position, _beforeMovePos);
            orbitControls.target.add(_actualMoveDelta);
          }

          if (hasActiveRot) {
            _lookOffset.subVectors(orbitControls.target, camera.position);
            const dist = Math.max(0.5, _lookOffset.length());
            const dir = _lookOffset.normalize();
            let yaw = Math.atan2(dir.x, dir.z);
            let pitch = Math.asin(Math.max(-0.98, Math.min(0.98, dir.y)));

            yaw += keyRotVelocity.yaw * dt;
            pitch = Math.max(-1.35, Math.min(1.35, pitch + keyRotVelocity.pitch * dt));

            const cosP = Math.cos(pitch);
            _newOffset.set(
              Math.sin(yaw) * cosP * dist,
              Math.sin(pitch) * dist,
              Math.cos(yaw) * cosP * dist
            );
            orbitControls.target.copy(camera.position).add(_newOffset);
          }

          if (heldCameraKeys.size > 0) {
            document
              .querySelectorAll('#btn-cam-player, #btn-cam-wide, #btn-cam-top, #btn-cam-side')
              .forEach((b) => b.classList.remove('active'));
          }
        }
      }

      if (activeCamTransition && !isAnimatingMove) {
        activeCamTransition.elapsed += dt;
        const u = Math.min(1, activeCamTransition.elapsed / activeCamTransition.duration);
        const ease = easeInOutCubic(u);
        camera.position.lerpVectors(activeCamTransition.startPos, activeCamTransition.endPos, ease);
        orbitControls.target.lerpVectors(activeCamTransition.startTarget, activeCamTransition.endTarget, ease);
        enforceCathedralBoundsAndSolidColumns(_prevCamPos, camera.position, orbitControls.target);
        camera.lookAt(orbitControls.target);
        if (u >= 1) {
          activeCamTransition = null;
          flushOrbitControlsDamping();
        }
      } else if (orbitControls.enabled && !isAnimatingMove) {
        orbitControls.update();
        enforceCathedralBoundsAndSolidColumns(_prevCamPos, camera.position, orbitControls.target);
        camera.lookAt(orbitControls.target);
      } else if (isAnimatingMove) {
        enforceCathedralBoundsAndSolidColumns(_prevCamPos, camera.position, orbitControls.target);
        camera.lookAt(orbitControls.target);
      }

      if (impactFlashLight.intensity > 0) {
        impactFlashLight.intensity = Math.max(0, impactFlashLight.intensity - dt * 28);
      }

      for (let i = shatterDebris.length - 1; i >= 0; i--) {
        const d = shatterDebris[i];
        d.life -= dt;
        if (d.life <= 0) {
          scene.remove(d.mesh);
          shatterDebris.splice(i, 1);
          continue;
        }
        d.vel.y -= 9.8 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        if (d.mesh.position.y < BOARD_SURFACE_Y + 0.03) {
          d.mesh.position.y = BOARD_SURFACE_Y + 0.03;
          d.vel.y *= -0.35;
          d.vel.x *= 0.72;
          d.vel.z *= 0.72;
        }
        // Bounce flying stone shards off intact pieces on the board so all statues feel solid
        if (d.mesh.position.y < BOARD_SURFACE_Y + 0.48) {
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const p = boardState[r][c];
              if (p && p.mesh) {
                const rx = d.mesh.position.x - p.mesh.position.x;
                const rz = d.mesh.position.z - p.mesh.position.z;
                const rDist = Math.hypot(rx, rz);
                if (rDist < 0.165 && rDist > 0.0001) {
                  const nx = rx / rDist;
                  const nz = rz / rDist;
                  d.mesh.position.x = p.mesh.position.x + nx * 0.165;
                  d.mesh.position.z = p.mesh.position.z + nz * 0.165;
                  const vn = d.vel.x * nx + d.vel.z * nz;
                  if (vn < 0) {
                    d.vel.x -= 1.55 * vn * nx;
                    d.vel.z -= 1.55 * vn * nz;
                  }
                }
              }
            }
          }
        }
        d.mesh.rotation.x += d.rotVel.x * dt;
        d.mesh.rotation.y += d.rotVel.y * dt;
        d.mesh.rotation.z += d.rotVel.z * dt;
        if (d.life < 0.5) {
          const s = Math.max(0.01, d.life * 2);
          d.mesh.scale.setScalar((d.baseScale || 0.036) * s);
        }
      }

      // Advance volumetric GLSL brazier flames & active warm firelight flicker
      for (let i = 0; i < brazierFireUniforms.length; i++) {
        brazierFireUniforms[i].uTime.value = elapsedTotal;
      }
      for (let i = 0; i < brazierGlowSprites.length; i++) {
        const sp = brazierGlowSprites[i];
        const baseOp = sp.userData.baseOpacity || 0.4;
        const seed = sp.userData.seed || 0;
        sp.material.opacity =
          baseOp +
          Math.sin(elapsedTotal * 5.2 + seed) * 0.045 +
          Math.cos(elapsedTotal * 8.4 + seed * 1.3) * 0.025;
      }
      for (let i = 0; i < brazierLights.length; i++) {
        const baseInt = brazierLights[i].userData.baseIntensity || 3.2;
        brazierLights[i].intensity =
          baseInt +
          Math.sin(elapsedTotal * 5.6 + i * 1.7) * 0.28 +
          Math.cos(elapsedTotal * 9.1 + i) * 0.16;
      }

      // Pulse Red Court Check Alert materials when a King is in Check
      if (checkCourtPulseMats.length > 0) {
        const checkWave = Math.sin(elapsedTotal * 7.2);
        checkBorderMat.emissiveIntensity = 0.85 + checkWave * 0.45;
        for (let i = 0; i < checkCourtPulseMats.length; i++) {
          const m = checkCourtPulseMats[i];
          const baseOp = m.userData?.baseOpacity ?? 0.3;
          const amp = m.userData?.pulseAmp ?? 0.1;
          m.opacity = Math.max(0.05, Math.min(1.0, baseOp + checkWave * amp));
        }
      }

      if (isAnimatingMove || activeMoveTweens.length > 0 || shatterDebris.length > 0 || checkmateState.active) {
        shadowFrameCounter++;
        if (shadowFrameCounter % shadowUpdateInterval === 0) {
          renderer.shadowMap.needsUpdate = true;
        }
      }

      if (doRender) {
        renderer.render(scene, camera);
      }
    }

    let manualStepMode = false;
    window.wizardChess.setManualStepMode = (v) => {
      manualStepMode = Boolean(v);
    };

    function animate() {
      if (!navigator.webdriver && !manualStepMode) {
        requestAnimationFrame(animate);
      }
      if (manualStepMode) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      stepScene(dt || 0.016, true);
    }

    const handleViewportResize = () => {
      const vp = getLandscapeViewport();
      camera.aspect = vp.width / vp.height;
      camera.updateProjectionMatrix();
      renderer.setSize(vp.width, vp.height);
    };
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', handleViewportResize);


    // Startup sequence (Standalone Single-Player AI Studio Applet)
    (async () => {
      await loadAllAssets();
      const params = new URLSearchParams(window.location.search);
      const urlSide = params.get('side');
      if (urlSide === 'b' || urlSide === 'black') {
        playerColor = 'b';
      }
      resetChessBoard(true, true);
      if (navigator.webdriver) {
        window.wizardChess.stepBy(0.9, 15);
      } else {
        animate();
      }
    })();
}
