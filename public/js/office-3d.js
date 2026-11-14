/**
 * 3D Live Office Visualization Engine - Living AI Workplace Edition
 * Built natively using Three.js (low-poly isometric miniature office)
 * Controlled entirely by Marketing Harness state events.
 */

class Office3DWorld {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container #${containerId} not found`);

    this.onAgentClick = options.onAgentClick || (() => {});
    this.officesData = [];
    this.agentsData = new Map();
    
    // Three.js primitives
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Scene object references
    this.agentMeshes = new Map();         // agentId -> Group
    this.workstationMeshes = new Map();   // deskId -> Group
    this.workstationMonitors = new Map(); // deskId -> Mesh[]
    this.statusPills = new Map();         // agentId -> Sprite
    this.alertBadges = new Map();         // agentId -> Sprite / Group
    this.carriedObjects = new Map();      // agentId -> Mesh (3D work product)
    this.selectedAgentId = null;
    this.activeFocusAgentId = null;
    this.currentSessionTargetId = null;

    // Living Workplace State
    this.idleSpots = [];                  // { id, type, x, y, z, department, orientation }
    this.agentIdleAssignments = new Map();// agentId -> { spot, action, timer, subAction }
    this.walkingAgents = new Map();       // agentId -> { startPos, endPos, progress, speed, onComplete, carriedMesh }
    this.meetingActive = false;
    this.hitlActiveAgents = new Set();
    this.hitlBeacon = null;

    // Animation state
    this.clock = new THREE.Clock();
    this.isAnimating = true;

    // Camera preset coordinates
    this.cameraPresets = {
      overview: { pos: [0, 58, 62], look: [0, 0, 0] },
      hq: { pos: [0, 22, 22], look: [0, 0, 0] },
      ads: { pos: [28, 22, 24], look: [28, 0, 2] },
      analytics: { pos: [-28, 22, 24], look: [-28, 0, 2] },
      research: { pos: [-28, 22, -8], look: [-28, 0, -26] },
      hitl: { pos: [12, 16, 12], look: [6, 0, 4] }
    };

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || (window.innerHeight - 56);

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1c);
    this.scene.fog = new THREE.FogExp2(0x0a0f1c, 0.0065);

    // 2. Camera (Isometric perspective angle)
    this.camera = new THREE.PerspectiveCamera(42, width / height, 1, 1000);
    this.camera.position.set(0, 58, 62);
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 150;

    // 5. Lighting
    this.setupLighting();

    // 6. Base Floor & Campus Walkways
    this.buildBaseFloor();

    // 7. Event Listeners
    window.addEventListener('resize', () => this.onWindowResize());
    this.renderer.domElement.addEventListener('click', (e) => this.onCanvasClick(e));
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));

    // 8. Start Render Loop
    this.animate();
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.82);
    this.scene.add(ambientLight);

    const mainSun = new THREE.DirectionalLight(0xfff7e8, 1.05);
    mainSun.position.set(45, 75, 45);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.width = 2048;
    mainSun.shadow.mapSize.height = 2048;
    mainSun.shadow.camera.near = 10;
    mainSun.shadow.camera.far = 220;
    mainSun.shadow.camera.left = -65;
    mainSun.shadow.camera.right = 65;
    mainSun.shadow.camera.top = 65;
    mainSun.shadow.camera.bottom = -65;
    mainSun.shadow.bias = -0.0005;
    this.scene.add(mainSun);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.35);
    fillLight.position.set(-50, 45, -45);
    this.scene.add(fillLight);
  }

  buildBaseFloor() {
    const floorGeo = new THREE.PlaneGeometry(130, 120);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(130, 65, 0x1e293b, 0x131d31);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Grand corridors connecting departments
    this.buildCampusWalkways();
  }

  buildCampusWalkways() {
    const corridorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    
    // Central North-South Main Concourse
    const nsGeo = new THREE.BoxGeometry(4, 0.15, 96);
    const nsMesh = new THREE.Mesh(nsGeo, corridorMat);
    nsMesh.position.set(0, 0.08, 0);
    nsMesh.receiveShadow = true;
    this.scene.add(nsMesh);

    // East-West Main Concourse
    const ewGeo = new THREE.BoxGeometry(96, 0.15, 4);
    const ewMesh = new THREE.Mesh(ewGeo, corridorMat);
    ewMesh.position.set(0, 0.08, 0);
    ewMesh.receiveShadow = true;
    this.scene.add(ewMesh);

    // Subtle walkway boundary guides
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
    for (const z of [-30, 0, 30]) {
      const g = new THREE.BoxGeometry(96, 0.02, 0.1);
      const l1 = new THREE.Mesh(g, lineMat);
      l1.position.set(0, 0.16, z + 2);
      this.scene.add(l1);
      const l2 = new THREE.Mesh(g, lineMat);
      l2.position.set(0, 0.16, z - 2);
      this.scene.add(l2);
    }
  }

  loadOffices(offices) {
    this.officesData = offices;
    this.idleSpots = [];
    for (const office of offices) {
      this.buildOfficeAmenities(office);
      this.buildDepartmentRoom(office);
    }
  }

  buildDepartmentRoom(office) {
    const roomGroup = new THREE.Group();
    roomGroup.name = `office_${office.id}`;

    const width = office.bounds.maxX - office.bounds.minX;
    const depth = office.bounds.maxZ - office.bounds.minZ;
    const centerX = office.center.x;
    const centerZ = office.center.z;

    // 1. Department Floor Tile
    const roomFloorGeo = new THREE.BoxGeometry(width, 0.2, depth);
    const roomFloorMat = new THREE.MeshStandardMaterial({
      color: parseInt(office.color.replace('#', '0x'), 16),
      roughness: 0.7,
      metalness: 0.2
    });
    const roomFloor = new THREE.Mesh(roomFloorGeo, roomFloorMat);
    roomFloor.position.set(centerX, 0.1, centerZ);
    roomFloor.receiveShadow = true;
    roomGroup.add(roomFloor);

    // 2. Glowing Accent Border Perimeter
    const borderGeo = new THREE.BoxGeometry(width + 0.2, 0.25, depth + 0.2);
    const borderMat = new THREE.MeshBasicMaterial({
      color: parseInt(office.accentColor.replace('#', '0x'), 16),
      wireframe: true
    });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.set(centerX, 0.12, centerZ);
    roomGroup.add(borderMesh);

    // 3. Department Name Signboard
    const signSprite = this.createTextSprite(office.name.toUpperCase(), office.accentColor);
    signSprite.position.set(centerX, 5.5, office.bounds.minZ + 1.5);
    roomGroup.add(signSprite);

    // 4. Special Zones (HITL Room, Memory Core, Conference Table)
    if (office.specialZones) {
      for (const zone of office.specialZones) {
        this.buildSpecialZone(zone, roomGroup);
      }
    }

    // 5. Build Workstations for each agent
    for (const ws of office.workstations) {
      this.buildWorkstation(ws, office, roomGroup);
    }

    this.scene.add(roomGroup);
  }

  /**
   * Build realistic living office amenities in each department:
   * Coffee station, Lounge sofa, Whiteboard / Planning board, Window viewpoint.
   */
  buildOfficeAmenities(office) {
    const group = new THREE.Group();
    const cx = office.center.x;
    const cz = office.center.z;
    const b = office.bounds;

    // --- A. COFFEE MACHINE & REFRESHMENT COUNTER ---
    const coffeeX = b.minX + 3.0;
    const coffeeZ = b.maxZ - 2.5;

    // Counter
    const counterGeo = new THREE.BoxGeometry(2.4, 1.0, 1.0);
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    const counter = new THREE.Mesh(counterGeo, counterMat);
    counter.position.set(coffeeX, 0.5, coffeeZ);
    counter.castShadow = true;
    group.add(counter);

    // Espresso Machine
    const machineGeo = new THREE.BoxGeometry(0.8, 0.6, 0.6);
    const machineMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });
    const machine = new THREE.Mesh(machineGeo, machineMat);
    machine.position.set(coffeeX - 0.5, 1.3, coffeeZ);
    machine.castShadow = true;
    group.add(machine);

    // Coffee Cups on counter
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
    for (let c = 0; c < 2; c++) {
      const cupGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.14, 8);
      const cup = new THREE.Mesh(cupGeo, cupMat);
      cup.position.set(coffeeX + 0.3 + c * 0.25, 1.07, coffeeZ);
      group.add(cup);
    }

    // Register idle spot: Coffee Station
    this.idleSpots.push({
      id: `idle_coffee_${office.id}`,
      type: 'COFFEE',
      x: coffeeX + 0.5,
      y: 0,
      z: coffeeZ + 1.2,
      department: office.id,
      facing: -Math.PI / 2
    });

    // --- B. LOUNGE SOFA & RELAXATION AREA ---
    const loungeX = b.maxX - 3.5;
    const loungeZ = b.maxZ - 3.0;

    // Modern low-poly sofa seat
    const sofaSeatGeo = new THREE.BoxGeometry(2.8, 0.45, 1.2);
    const sofaMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    const sofaSeat = new THREE.Mesh(sofaSeatGeo, sofaMat);
    sofaSeat.position.set(loungeX, 0.35, loungeZ);
    sofaSeat.castShadow = true;
    group.add(sofaSeat);

    // Sofa backrest
    const sofaBackGeo = new THREE.BoxGeometry(2.8, 0.65, 0.3);
    const sofaBack = new THREE.Mesh(sofaBackGeo, sofaMat);
    sofaBack.position.set(loungeX, 0.75, loungeZ + 0.5);
    sofaBack.castShadow = true;
    group.add(sofaBack);

    // Low glass coffee table
    const tableGeo = new THREE.BoxGeometry(1.6, 0.25, 0.8);
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 });
    const coffeeTable = new THREE.Mesh(tableGeo, tableMat);
    coffeeTable.position.set(loungeX, 0.2, loungeZ - 1.2);
    coffeeTable.castShadow = true;
    group.add(coffeeTable);

    // Register idle spot: Lounge
    this.idleSpots.push({
      id: `idle_lounge_${office.id}`,
      type: 'LOUNGE',
      x: loungeX,
      y: 0,
      z: loungeZ,
      department: office.id,
      facing: Math.PI
    });

    // --- C. STRATEGIC WHITEBOARD / PLANNING WALL ---
    const wbX = b.minX + 2.5;
    const wbZ = b.minZ + 3.0;

    const wbFrameGeo = new THREE.BoxGeometry(0.1, 2.2, 3.2);
    const wbFrameMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6 });
    const wbFrame = new THREE.Mesh(wbFrameGeo, wbFrameMat);
    wbFrame.position.set(wbX, 1.8, wbZ);
    wbFrame.castShadow = true;
    group.add(wbFrame);

    const wbSurfaceGeo = new THREE.BoxGeometry(0.04, 2.0, 3.0);
    const wbSurfaceMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 });
    const wbSurface = new THREE.Mesh(wbSurfaceGeo, wbSurfaceMat);
    wbSurface.position.set(wbX + 0.05, 1.8, wbZ);
    group.add(wbSurface);

    // Stickies / notes on whiteboard
    const stickyGeo = new THREE.BoxGeometry(0.01, 0.25, 0.3);
    const stickyColors = [0x38bdf8, 0xf59e0b, 0x10b981, 0xc084fc];
    for (let s = 0; s < 4; s++) {
      const sMat = new THREE.MeshBasicMaterial({ color: stickyColors[s] });
      const sticky = new THREE.Mesh(stickyGeo, sMat);
      sticky.position.set(wbX + 0.08, 2.0 - (s % 2) * 0.4, wbZ - 0.8 + s * 0.5);
      group.add(sticky);
    }

    // Register idle spot: Whiteboard
    this.idleSpots.push({
      id: `idle_wb_${office.id}`,
      type: 'WHITEBOARD',
      x: wbX + 1.2,
      y: 0,
      z: wbZ,
      department: office.id,
      facing: -Math.PI / 2
    });

    // --- D. WINDOW / HORIZON VIEWPOINT ---
    const winX = b.maxX - 2.0;
    const winZ = b.minZ + 3.0;

    // Glass panel with skyline accent
    const winGeo = new THREE.BoxGeometry(0.1, 3.0, 4.0);
    const winMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      transmission: 0.8
    });
    const winMesh = new THREE.Mesh(winGeo, winMat);
    winMesh.position.set(winX, 2.0, winZ);
    group.add(winMesh);

    // Register idle spot: Window
    this.idleSpots.push({
      id: `idle_window_${office.id}`,
      type: 'WINDOW',
      x: winX - 1.0,
      y: 0,
      z: winZ,
      department: office.id,
      facing: Math.PI / 2
    });

    this.scene.add(group);
  }

  buildSpecialZone(zone, parentGroup) {
    const zoneGroup = new THREE.Group();
    zoneGroup.position.set(zone.x, zone.y, zone.z);

    if (zone.type === 'HITL_ROOM') {
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.25,
        roughness: 0.1,
        transmission: 0.9,
        thickness: 0.5
      });

      const wallGeo = new THREE.BoxGeometry(zone.width, 3.5, 0.15);
      const backWall = new THREE.Mesh(wallGeo, glassMat);
      backWall.position.set(0, 1.75, -zone.depth / 2);
      zoneGroup.add(backWall);

      const sideWallGeo = new THREE.BoxGeometry(0.15, 3.5, zone.depth);
      const leftWall = new THREE.Mesh(sideWallGeo, glassMat);
      leftWall.position.set(-zone.width / 2, 1.75, 0);
      zoneGroup.add(leftWall);

      const hazardGeo = new THREE.PlaneGeometry(zone.width - 0.2, zone.depth - 0.2);
      const hazardMat = new THREE.MeshBasicMaterial({ color: 0xb45309 });
      const hazardMesh = new THREE.Mesh(hazardGeo, hazardMat);
      hazardMesh.rotation.x = -Math.PI / 2;
      hazardMesh.position.y = 0.21;
      zoneGroup.add(hazardMesh);

      // Warning beacon light on top (flashes when human review pending)
      const beaconGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 16);
      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.8
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(0, 3.7, -zone.depth / 2);
      zoneGroup.add(beacon);
      this.hitlBeacon = beacon;

      // Review table inside
      const revDeskGeo = new THREE.BoxGeometry(2.2, 0.12, 1.2);
      const revDeskMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
      const revDesk = new THREE.Mesh(revDeskGeo, revDeskMat);
      revDesk.position.set(0, 1.1, 0);
      revDesk.castShadow = true;
      zoneGroup.add(revDesk);

      const sign = this.createTextSprite('⚠️ NEEDS YOUR YES', '#f59e0b');
      sign.position.set(0, 4.5, 0);
      zoneGroup.add(sign);
    } else if (zone.type === 'MEMORY_CORE') {
      for (let i = -2; i <= 2; i += 1.8) {
        const rackGeo = new THREE.BoxGeometry(1.2, 3.2, 0.8);
        const rackMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 });
        const rack = new THREE.Mesh(rackGeo, rackMat);
        rack.position.set(i, 1.6, 0);
        rack.castShadow = true;
        zoneGroup.add(rack);

        const ledGeo = new THREE.BoxGeometry(1.0, 0.08, 0.02);
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.position.set(i, 2.5, 0.41);
        zoneGroup.add(led);
      }

      const sign = this.createTextSprite('🧠 MEMORY CORE', '#38bdf8');
      sign.position.set(0, 4.2, 0);
      zoneGroup.add(sign);
    } else if (zone.type === 'CONFERENCE_TABLE') {
      const tableGeo = new THREE.CylinderGeometry(2.8, 2.8, 0.2, 32);
      const tableMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
      const table = new THREE.Mesh(tableGeo, tableMat);
      table.position.set(0, 1.0, 0);
      table.castShadow = true;
      zoneGroup.add(table);

      // Conference chairs around table
      const confChairMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const cx = Math.cos(angle) * 3.4;
        const cz = Math.sin(angle) * 3.4;
        const cSeat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), confChairMat);
        cSeat.position.set(cx, 0.7, cz);
        cSeat.lookAt(0, 0.7, 0);
        zoneGroup.add(cSeat);
      }

      const pedGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.3, 16);
      const pedMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7 });
      const ped = new THREE.Mesh(pedGeo, pedMat);
      ped.position.set(0, 1.25, 0);
      zoneGroup.add(ped);

      const sign = this.createTextSprite('🤝 STRATEGY ROUNDTABLE', '#38bdf8');
      sign.position.set(0, 4.0, 0);
      zoneGroup.add(sign);
    }

    parentGroup.add(zoneGroup);
  }

  buildWorkstation(ws, office, parentGroup) {
    const wsGroup = new THREE.Group();
    wsGroup.name = `workstation_${ws.deskId}`;
    wsGroup.position.set(ws.x, ws.y, ws.z);
    wsGroup.rotation.y = ws.rotationY || 0;
    wsGroup.userData = { deskId: ws.deskId, agentId: ws.agentId };

    // 1. Desk Surface
    const deskTopGeo = new THREE.BoxGeometry(2.4, 0.12, 1.4);
    const deskTopMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    const deskTop = new THREE.Mesh(deskTopGeo, deskTopMat);
    deskTop.position.set(0, 1.1, 0);
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    wsGroup.add(deskTop);

    // Desk Legs
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 });
    const legPositions = [
      [-1.1, 0.55, -0.6],
      [1.1, 0.55, -0.6],
      [-1.1, 0.55, 0.6],
      [1.1, 0.55, 0.6]
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(...pos);
      leg.castShadow = true;
      wsGroup.add(leg);
    }

    // 2. Dual Monitors with Dynamic Glowing Screens
    const monitorGeo = new THREE.BoxGeometry(0.8, 0.5, 0.05);
    const accentHex = parseInt(office.accentColor.replace('#', '0x'), 16);
    
    // Standby screens (low glow until agent begins working)
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      emissive: accentHex,
      emissiveIntensity: 0.12
    });

    const monitor1 = new THREE.Mesh(monitorGeo, screenMat.clone());
    monitor1.position.set(-0.45, 1.55, -0.4);
    monitor1.rotation.y = 0.1;
    monitor1.castShadow = true;
    monitor1.name = 'monitor_left';
    wsGroup.add(monitor1);

    const monitor2 = new THREE.Mesh(monitorGeo, screenMat.clone());
    monitor2.position.set(0.45, 1.55, -0.4);
    monitor2.rotation.y = -0.1;
    monitor2.castShadow = true;
    monitor2.name = 'monitor_right';
    wsGroup.add(monitor2);

    this.workstationMonitors.set(ws.deskId, [monitor1, monitor2]);

    // Keyboard & Mouse
    const kbGeo = new THREE.BoxGeometry(0.6, 0.02, 0.2);
    const kbMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const kb = new THREE.Mesh(kbGeo, kbMat);
    kb.position.set(0, 1.17, 0.1);
    wsGroup.add(kb);

    // Mini Plant
    const potGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.2, 12);
    const potMat = new THREE.MeshStandardMaterial({ color: 0xd97706 });
    const pot = new THREE.Mesh(potGeo, potMat);
    pot.position.set(0.95, 1.25, -0.4);
    wsGroup.add(pot);

    const plantGeo = new THREE.DodecahedronGeometry(0.14);
    const plantMat = new THREE.MeshStandardMaterial({ color: 0x10b981 });
    const plant = new THREE.Mesh(plantGeo, plantMat);
    plant.position.set(0.95, 1.4, -0.4);
    wsGroup.add(plant);

    // Ergonomic Chair
    const chairSeatGeo = new THREE.BoxGeometry(0.8, 0.1, 0.8);
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const chairSeat = new THREE.Mesh(chairSeatGeo, chairMat);
    chairSeat.position.set(0, 0.7, 0.7);
    chairSeat.castShadow = true;
    wsGroup.add(chairSeat);

    const chairBackGeo = new THREE.BoxGeometry(0.8, 0.8, 0.1);
    const chairBack = new THREE.Mesh(chairBackGeo, chairMat);
    chairBack.position.set(0, 1.15, 1.05);
    chairBack.castShadow = true;
    wsGroup.add(chairBack);

    // Active Workstation Aura / Halo Ring
    const auraGeo = new THREE.RingGeometry(1.5, 1.7, 32);
    const auraMat = new THREE.MeshBasicMaterial({ color: accentHex, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.21;
    aura.name = 'activity_aura';
    wsGroup.add(aura);

    // Selection Ring
    const ringGeo = new THREE.RingGeometry(1.7, 1.85, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.22;
    ring.visible = false;
    ring.name = 'selection_ring';
    wsGroup.add(ring);

    this.workstationMeshes.set(ws.deskId, wsGroup);
    parentGroup.add(wsGroup);

    // Build the Agent Avatar inside the scene (not tied to chair so they can walk)
    this.buildAgentAvatar(ws, office);
  }

  buildAgentAvatar(ws, office) {
    const agentGroup = new THREE.Group();
    agentGroup.name = `agent_${ws.agentId}`;
    agentGroup.userData = {
      agentId: ws.agentId,
      deskId: ws.deskId,
      department: office.id,
      workstationPos: new THREE.Vector3(ws.x, ws.y, ws.z),
      chairPos: new THREE.Vector3(ws.x, ws.y, ws.z + 0.7),
      chairRotationY: ws.rotationY || 0,
      isSeated: false
    };

    const accentHex = parseInt(office.accentColor.replace('#', '0x'), 16);

    // Torso (Pixel/Low-poly character)
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.7, 0.4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 1.25, 0);
    body.castShadow = true;
    body.name = 'torso';
    agentGroup.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.42, 0.45, 0.42);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.5 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.85, 0);
    head.castShadow = true;
    head.name = 'head';
    agentGroup.add(head);

    // Visor / HUD Headset
    const visorGeo = new THREE.BoxGeometry(0.44, 0.12, 0.22);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.85, -0.14);
    visor.name = 'visor';
    agentGroup.add(visor);

    // Left Arm
    const armGeo = new THREE.BoxGeometry(0.16, 0.52, 0.16);
    const armMat = new THREE.MeshStandardMaterial({ color: accentHex });
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.38, 1.2, 0);
    leftArm.name = 'left_arm';
    agentGroup.add(leftArm);

    // Right Arm
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.38, 1.2, 0);
    rightArm.name = 'right_arm';
    agentGroup.add(rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.6, 0.2);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.16, 0.6, 0);
    leftLeg.name = 'left_leg';
    agentGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.16, 0.6, 0);
    rightLeg.name = 'right_leg';
    agentGroup.add(rightLeg);

    // Floating Status Pill
    const statusPill = this.createStatusPill('IDLE', '#94a3b8');
    statusPill.position.set(0, 2.45, 0);
    agentGroup.add(statusPill);
    this.statusPills.set(ws.agentId, statusPill);

    // Floating Alert Badge (hidden by default)
    const alertBadge = this.createAlertBadge('⚡');
    alertBadge.position.set(0, 3.1, 0);
    alertBadge.visible = false;
    agentGroup.add(alertBadge);
    this.alertBadges.set(ws.agentId, alertBadge);

    // Default placement: IDLE at an amenity/break spot (NOT sitting at workstation desk!)
    this.placeAgentAtIdleSpot(agentGroup, ws.agentId, office.id);

    this.agentMeshes.set(ws.agentId, agentGroup);
    this.scene.add(agentGroup);
  }

  placeAgentAtIdleSpot(agentMesh, agentId, departmentId) {
    const deptSpots = this.idleSpots.filter(s => s.department === departmentId);
    let chosenSpot = null;
    if (deptSpots.length > 0) {
      // Pick based on hash of agentId to scatter agents naturally
      const hash = agentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      chosenSpot = deptSpots[hash % deptSpots.length];
    } else {
      chosenSpot = { x: 0, y: 0, z: 0, facing: 0, type: 'COFFEE' };
    }

    agentMesh.position.set(chosenSpot.x, chosenSpot.y, chosenSpot.z);
    agentMesh.rotation.y = chosenSpot.facing || 0;
    agentMesh.userData.isSeated = (chosenSpot.type === 'LOUNGE');

    this.agentIdleAssignments.set(agentId, {
      spot: chosenSpot,
      action: chosenSpot.type,
      timer: Math.random() * 20,
      subAction: 'relaxing'
    });
  }

  createTextSprite(text, colorHex = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#080c16';
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 112, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colorHex;
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(6, 1.5, 1);
    return sprite;
  }

  createStatusPill(status, colorHex = '#94a3b8') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#080c16';
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(6, 6, 244, 68, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colorHex;
    ctx.font = 'bold 26px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(status, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.4, 0.75, 1);
    sprite.userData = { canvas, ctx, texture };
    return sprite;
  }

  createAlertBadge(symbol = '⚡') {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(48, 48, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 44px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 48, 50);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.1, 1.1, 1);
    return sprite;
  }

  /**
   * Spawns a physical 3D work product mesh (Document, Folder, Email Package, etc.)
   */
  createWorkProductMesh(payloadType = 'DOCUMENT') {
    const group = new THREE.Group();
    const type = (payloadType || 'DOCUMENT').toUpperCase();

    if (type.includes('EMAIL')) {
      // Glowing envelope with seal
      const envGeo = new THREE.BoxGeometry(0.5, 0.08, 0.35);
      const envMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.3 });
      const env = new THREE.Mesh(envGeo, envMat);
      group.add(env);

      const stampGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.09, 12);
      const stampMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
      const stamp = new THREE.Mesh(stampGeo, stampMat);
      stamp.position.set(0, 0.04, 0);
      group.add(stamp);
    } else if (type.includes('AD') || type.includes('CREATIVE')) {
      // Visual frame / ad canvas
      const frameGeo = new THREE.BoxGeometry(0.5, 0.4, 0.05);
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x818cf8, emissive: 0x4338ca, emissiveIntensity: 0.4 });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      group.add(frame);
    } else if (type.includes('ANALYTICS') || type.includes('REPORT') || type.includes('DATA')) {
      // Tablet / clipboard with glowing bar charts
      const tabGeo = new THREE.BoxGeometry(0.45, 0.06, 0.35);
      const tabMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, emissive: 0x10b981, emissiveIntensity: 0.5 });
      const tab = new THREE.Mesh(tabGeo, tabMat);
      group.add(tab);
    } else if (type.includes('BLOG') || type.includes('CONTENT')) {
      // Bound manuscript / document
      const docGeo = new THREE.BoxGeometry(0.4, 0.1, 0.5);
      const docMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.4 });
      const doc = new THREE.Mesh(docGeo, docMat);
      group.add(doc);
    } else {
      // Standard strategic briefing folder
      const folderGeo = new THREE.BoxGeometry(0.45, 0.08, 0.35);
      const folderMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });
      const folder = new THREE.Mesh(folderGeo, folderMat);
      group.add(folder);
    }

    return group;
  }

  /**
   * Main state machine hook from Marketing Harness events
   */
  updateAgentState(agentId, newState) {
    this.agentsData.set(agentId, newState);

    const agentMesh = this.agentMeshes.get(agentId);
    const sprite = this.statusPills.get(agentId);
    const badge = this.alertBadges.get(agentId);
    const wsMesh = agentMesh ? this.workstationMeshes.get(agentMesh.userData.deskId) : null;
    const monitors = agentMesh ? this.workstationMonitors.get(agentMesh.userData.deskId) : null;

    if (!agentMesh) return;

    // 1. Update Floating Status Pill
    if (sprite && sprite.userData) {
      const { canvas, ctx, texture } = sprite.userData;
      let colorHex = '#94a3b8';

      if (newState.status === 'WORKING' || newState.status === 'EXECUTING' || newState.status === 'PLANNING') {
        colorHex = '#38bdf8';
      } else if (newState.status === 'WAITING_FOR_HUMAN') {
        colorHex = '#f59e0b';
      } else if (newState.status === 'COMPLETED' || newState.status === 'SUBMITTED') {
        colorHex = '#10b981';
      } else if (newState.status === 'BLOCKED' || newState.status === 'FAILED') {
        colorHex = '#ef4444';
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#080c16';
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(6, 6, 244, 68, 20);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = colorHex;
      ctx.font = 'bold 26px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(newState.status, 128, 40);

      texture.needsUpdate = true;
    }

    // 2. Physical Behavior Transitions based on State Machine:
    const status = newState.status;

    if (status === 'WORKING' || status === 'EXECUTING' || status === 'PLANNING') {
      // Task Arrived: Show alert badge, leave break area, walk to workstation chair
      if (badge) {
        badge.visible = true;
        setTimeout(() => { if (badge) badge.visible = false; }, 1800);
      }

      // If not already seated, physically walk to chair!
      const targetPos = agentMesh.userData.chairPos;
      if (agentMesh.position.distanceTo(targetPos) > 0.6 && !this.walkingAgents.has(agentId)) {
        this.walkAgentTo(agentId, targetPos, () => {
          agentMesh.position.copy(targetPos);
          agentMesh.rotation.y = agentMesh.userData.chairRotationY;
          agentMesh.userData.isSeated = true;

          // Power on dual screens & workstation activity halo
          this.setWorkstationActive(agentMesh.userData.deskId, true);
        });
      } else {
        agentMesh.userData.isSeated = true;
        this.setWorkstationActive(agentMesh.userData.deskId, true);
      }

    } else if (status === 'WAITING_FOR_HUMAN') {
      // Human Review Required: Agent walks to glass HITL Room with the file!
      this.hitlActiveAgents.add(agentId);
      if (this.hitlBeacon) this.hitlBeacon.material.emissiveIntensity = 1.6;

      const hitlCenter = new THREE.Vector3(6, 0, 4);
      this.walkAgentTo(agentId, hitlCenter, () => {
        agentMesh.position.copy(hitlCenter);
        agentMesh.userData.isSeated = false;
      });
    } else if (status === 'COMPLETED' || status === 'SUBMITTED') {
      // Stand up, turn off workstation activity glow, hold 3D file
      this.setWorkstationActive(agentMesh.userData.deskId, false);
      agentMesh.userData.isSeated = false;

      // Spawn 3D Work Product package in hands if not already carrying
      if (!this.carriedObjects.has(agentId)) {
        const pkg = this.createWorkProductMesh(newState.taskName || 'DOCUMENT');
        pkg.position.set(0, 1.2, -0.35);
        agentMesh.add(pkg);
        this.carriedObjects.set(agentId, pkg);
      }
    } else if (status === 'IDLE') {
      // Remove any carried file
      const carried = this.carriedObjects.get(agentId);
      if (carried) {
        agentMesh.remove(carried);
        this.carriedObjects.delete(agentId);
      }
      this.hitlActiveAgents.delete(agentId);
      if (this.hitlBeacon && this.hitlActiveAgents.size === 0) {
        this.hitlBeacon.material.emissiveIntensity = 0.8;
      }

      // Turn off monitor active glow
      this.setWorkstationActive(agentMesh.userData.deskId, false);

      // Walk to an appropriate idle activity spot (coffee, lounge, window, etc.)
      const currentLoc = this.agentIdleAssignments.get(agentId)?.spot;
      if (currentLoc) {
        const targetPos = new THREE.Vector3(currentLoc.x, currentLoc.y, currentLoc.z);
        if (agentMesh.position.distanceTo(targetPos) > 1.0 && !this.walkingAgents.has(agentId)) {
          this.walkAgentTo(agentId, targetPos, () => {
            agentMesh.position.copy(targetPos);
            agentMesh.rotation.y = currentLoc.facing || 0;
            agentMesh.userData.isSeated = (currentLoc.type === 'LOUNGE');
          });
        }
      }
    }
  }

  setWorkstationActive(deskId, isActive) {
    const wsGroup = this.workstationMeshes.get(deskId);
    const monitors = this.workstationMonitors.get(deskId);
    if (!wsGroup || !monitors) return;

    const aura = wsGroup.getObjectByName('activity_aura');
    if (aura) {
      aura.material.opacity = isActive ? 0.45 : 0;
    }

    for (const m of monitors) {
      m.material.emissiveIntensity = isActive ? 0.85 : 0.12;
    }
  }

  /**
   * Smoothly walks an agent avatar to a target world position
   */
  walkAgentTo(agentId, targetPos, onComplete) {
    const mesh = this.agentMeshes.get(agentId);
    if (!mesh) return;

    const startPos = mesh.position.clone();
    const distance = startPos.distanceTo(targetPos);
    const speed = Math.max(0.015, Math.min(0.035, 1.0 / (distance * 15)));

    this.walkingAgents.set(agentId, {
      startPos,
      endPos: targetPos.clone(),
      progress: 0,
      speed: 0.02,
      onComplete
    });

    // Face direction of walking
    mesh.lookAt(targetPos.x, mesh.position.y, targetPos.z);
  }

  selectAgent(agentId) {
    for (const ws of this.workstationMeshes.values()) {
      const ring = ws.getObjectByName('selection_ring');
      if (ring) ring.visible = false;
    }

    this.selectedAgentId = agentId;
    const mesh = this.agentMeshes.get(agentId);
    if (mesh) {
      const ws = this.workstationMeshes.get(mesh.userData.deskId);
      if (ws) {
        const ring = ws.getObjectByName('selection_ring');
        if (ring) ring.visible = true;
      }
      this.frameAgentCamera(agentId);
    }

    if (this.onAgentClick) {
      this.onAgentClick(agentId);
    }
  }

  frameAgentCamera(agentId) {
    const mesh = this.agentMeshes.get(agentId);
    if (mesh) {
      const pos = mesh.position;
      this.tweenCamera([pos.x, pos.y + 12, pos.z + 14], [pos.x, pos.y + 1, pos.z]);
    }
  }

  focusCamera(presetKey) {
    const target = this.cameraPresets[presetKey] || this.cameraPresets.overview;
    this.tweenCamera(target.pos, target.look);
  }

  focusActiveAgent() {
    for (const [id, agent] of this.agentsData.entries()) {
      if (agent.status === 'WORKING' || agent.status === 'WAITING_FOR_HUMAN' || agent.status === 'EXECUTING') {
        this.selectAgent(id);
        return;
      }
    }
    this.focusCamera('hq');
  }

  tweenCamera(targetPos, targetLookAt) {
    const startPos = this.camera.position.clone();
    const startLook = this.controls.target.clone();
    const endPos = new THREE.Vector3(...targetPos);
    const endLook = new THREE.Vector3(...targetLookAt);

    let t = 0;
    const animateCamera = () => {
      t += 0.045;
      if (t <= 1) {
        this.camera.position.lerpVectors(startPos, endPos, t);
        this.controls.target.lerpVectors(startLook, endLook, t);
        requestAnimationFrame(animateCamera);
      } else {
        this.camera.position.copy(endPos);
        this.controls.target.copy(endLook);
      }
    };
    animateCamera();
  }

  onCanvasClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    for (const hit of intersects) {
      let curr = hit.object;
      while (curr && curr !== this.scene) {
        if (curr.userData && curr.userData.agentId) {
          this.selectAgent(curr.userData.agentId);
          return;
        }
        curr = curr.parent;
      }
    }
  }

  onMouseMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  onWindowResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || (window.innerHeight - 56);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    this.controls.update();

    // 1. Update Physical Walking Interpolations
    for (const [agentId, walk] of this.walkingAgents.entries()) {
      const mesh = this.agentMeshes.get(agentId);
      if (!mesh) continue;

      walk.progress += walk.speed;
      const leftLeg = mesh.getObjectByName('left_leg');
      const rightLeg = mesh.getObjectByName('right_leg');

      if (walk.progress >= 1.0) {
        mesh.position.copy(walk.endPos);
        if (leftLeg) leftLeg.rotation.x = 0;
        if (rightLeg) rightLeg.rotation.x = 0;
        this.walkingAgents.delete(agentId);
        if (walk.onComplete) walk.onComplete();
      } else {
        mesh.position.lerpVectors(walk.startPos, walk.endPos, walk.progress);
        // Walking footstep bobbing
        mesh.position.y = Math.abs(Math.sin(elapsed * 12)) * 0.12;
        if (leftLeg) leftLeg.rotation.x = Math.sin(elapsed * 12) * 0.5;
        if (rightLeg) rightLeg.rotation.x = -Math.sin(elapsed * 12) * 0.5;
      }
    }

    // 2. Working Typing vs. Idle Behavior Animations
    for (const [id, agent] of this.agentsData.entries()) {
      const mesh = this.agentMeshes.get(id);
      if (!mesh || this.walkingAgents.has(id)) continue;

      const leftArm = mesh.getObjectByName('left_arm');
      const rightArm = mesh.getObjectByName('right_arm');
      const head = mesh.getObjectByName('head');

      if (agent.status === 'WORKING' || agent.status === 'EXECUTING') {
        // High-fidelity varied typing
        const typingSpeed = 16;
        if (leftArm) leftArm.rotation.x = -Math.PI / 4 + Math.sin(elapsed * typingSpeed + id.length) * 0.16;
        if (rightArm) rightArm.rotation.x = -Math.PI / 4 + Math.cos(elapsed * typingSpeed + id.length) * 0.16;
        // Subtle screen glance alternation (left to right monitor)
        if (head) head.rotation.y = Math.sin(elapsed * 1.5) * 0.18;
      } else if (agent.status === 'IDLE') {
        const assignment = this.agentIdleAssignments.get(id);
        const actionType = assignment ? assignment.action : 'COFFEE';

        if (actionType === 'COFFEE') {
          // Sipping coffee movement
          if (rightArm) rightArm.rotation.x = -Math.PI / 3 + Math.sin(elapsed * 1.2) * 0.2;
          if (leftArm) leftArm.rotation.x = 0;
          if (head) head.rotation.x = Math.sin(elapsed * 1.2) * 0.08;
        } else if (actionType === 'WHITEBOARD') {
          // Examining whiteboard
          if (head) {
            head.rotation.y = Math.sin(elapsed * 0.8) * 0.25;
            head.rotation.x = -0.05 + Math.cos(elapsed * 0.6) * 0.05;
          }
          if (rightArm) rightArm.rotation.x = -Math.PI / 6 + Math.sin(elapsed * 0.8) * 0.1;
        } else if (actionType === 'WINDOW') {
          // Relaxed horizon contemplation
          if (leftArm) leftArm.rotation.x = 0;
          if (rightArm) rightArm.rotation.x = 0;
          if (head) head.rotation.y = Math.sin(elapsed * 0.4) * 0.1;
        } else {
          // Relaxed breathing
          if (leftArm) leftArm.rotation.x = Math.sin(elapsed * 2) * 0.04;
          if (rightArm) rightArm.rotation.x = Math.sin(elapsed * 2) * 0.04;
        }
      }
    }

    // 3. Flashing HITL Room Beacon
    if (this.hitlBeacon && this.hitlActiveAgents.size > 0) {
      this.hitlBeacon.material.emissiveIntensity = 1.0 + Math.sin(elapsed * 8) * 0.8;
    }

    // 4. Render Scene
    this.renderer.render(this.scene, this.camera);
  }
}

window.Office3DWorld = Office3DWorld;
