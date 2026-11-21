import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BLOCK_DEFINITIONS,
  BiomePreset,
  BlockType,
  CameraMode,
  CraftingStationType,
  GameMode,
  GamePhase,
  GameSettings,
  ITEM_DEFINITIONS,
  ItemId,
  PlayerHudState,
  RemotePlayerState,
} from '../types/game';
import { soundEngine } from './audio';
import { MobDrop, MobEntity, MobManager } from './mobs';
import { PlayerAvatar } from './playerAvatar';
import { createVoxelAtlas, VoxelAtlasBundle } from './textures';
import { raycastVoxel, VoxelHit } from './voxelRaycaster';
import { CHUNK_HEIGHT, VoxelWorld, WATER_LEVEL } from './world';

// Pre-allocated scratch math objects (zero GC in render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: PlayerHudState) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onHotbarSelect: (index: number) => void;
  onContextLost?: (lost: boolean) => void;
  onLocalMove?: (state: Omit<RemotePlayerState, 'playerId' | 'nickname' | 'friendCode'>) => void;
  onLocalBlockUpdate?: (x: number, y: number, z: number, block: BlockType) => void;
  onLocalSwing?: () => void;
  onCollectDrops?: (drops: MobDrop[]) => void;
  canPlaceSelectedItem?: () => boolean;
  onConsumeSelectedItem?: () => void;
  onEatHeldItem?: () => void;
  onOpenStation?: (station: CraftingStationType) => void;
}

export class GameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private pmremEnvTex: THREE.Texture | null = null;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private shrineLight: THREE.PointLight;
  private skyMesh: THREE.Mesh;
  private skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uNightAmount: { value: number };
  };

  private atlas: VoxelAtlasBundle;
  private opaqueMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshPhysicalMaterial;
  private glassMaterial: THREE.MeshStandardMaterial;

  private world!: VoxelWorld;
  private mobManager = new MobManager();
  private avatar: PlayerAvatar;
  private firstPersonHand: THREE.Group;
  private firstPersonBlock: THREE.Mesh;
  private highlightMesh: THREE.LineSegments;
  private cloudMesh: THREE.InstancedMesh;
  private cloudBasePositions: Array<{ x: number; y: number; z: number; sx: number; sz: number; speed: number }> = [];

  private particleMesh: THREE.InstancedMesh;
  private particles: Particle[] = [];

  // Game & Player State
  private phase: GamePhase = 'menu';
  private gameMode: GameMode = 'survival';
  private settings: GameSettings;
  private preset: BiomePreset;
  private seedText: string;
  private selectedBlock: BlockType = BlockType.NEON_BLUE;
  private selectedItem: ItemId | null = 'oak_log';

  private health = 20;
  private readonly maxHealth = 20;
  private hunger = 20;
  private readonly maxHunger = 20;
  private isDead = false;
  private fallPeakY = 0;
  private wasGrounded = true;
  private regenTimer = 0;
  private starveTimer = 0;
  private hungerDrainAccum = 0;
  private hurtFlashTimer = 0;

  private playerPos = new THREE.Vector3(2.5, 22, 10.5);
  private playerVel = new THREE.Vector3(0, 0, 0);
  private yaw = 0; // 0 looks toward -Z (north toward spawn shrine)
  private pitch = -0.08;
  private cameraMode: CameraMode = 'first-person';
  private thirdPersonDist = 5.5;
  private smoothCamPos = new THREE.Vector3();
  private smoothCamLook = new THREE.Vector3();
  private menuOrbitAngle = 0.55;

  private isGrounded = false;
  private isFlying = false;
  private isInWater = false;
  private blocksPlaced = 0;
  private blocksBroken = 0;
  private lastSpaceTap = 0;
  private footstepAccum = 0;
  private handSwing = 0;
  private bobPhase = 0;

  private currentHit: VoxelHit | null = null;
  private targetMob: MobEntity | null = null;
  private isMiningHeld = false;
  private miningKey = '';
  private miningProgress = 0;
  private miningHint: string | null = null;
  private miningHintTimer = 0;
  private swingSoundCooldown = 0;

  // Input state
  private keys = new Set<string>();
  private inputEnabled = true;
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private dragMovedDist = 0;
  private pointerLocked = false;
  private mobileActionMode: 'break' | 'place' = 'break';

  // Remote multiplayer avatars
  private remotePlayers = new Map<
    string,
    {
      avatar: PlayerAvatar;
      target: RemotePlayerState;
      curX: number;
      curY: number;
      curZ: number;
      curYaw: number;
    }
  >();

  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private elapsed = 0;
  private hudTimer = 0;

  // Bound event listeners
  private onResizeBound: () => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onPointerDownBound: (e: PointerEvent) => void;
  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onContextMenuBound: (e: MouseEvent) => void;
  private onPointerLockChangeBound: () => void;
  private onContextLostBound: (e: Event) => void;
  private onContextRestoredBound: () => void;

  constructor(
    container: HTMLElement,
    initialSeed: string,
    initialPreset: BiomePreset,
    initialSettings: GameSettings,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.seedText = initialSeed;
    this.preset = initialPreset;
    this.settings = { ...initialSettings };
    this.callbacks = callbacks;
    soundEngine.setEnabled(this.settings.soundEnabled);

    // 1. Software WebGL detection
    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Modern Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 3. Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x7ec8f8, 0.014);

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, aspect, 0.1, 260);
    this.scene.add(this.camera);

    // 4. Studio Environment Map (RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmremEnvTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.pmremEnvTex;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    // 5. Sky Dome
    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(0x0b4ea2) },
      uHorizonColor: { value: new THREE.Color(0x88d4ff) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
      uNightAmount: { value: 0 },
    };
    const skyGeo = new THREE.SphereGeometry(210, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        uniform float uNightAmount;

        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y * 0.85 + 0.15, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.65));

          // Sun disc & corona
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.92, 0.76) * pow(sunDot, 24.0) * 0.45 * (1.0 - uNightAmount);
          col += vec3(1.0, 0.98, 0.92) * smoothstep(0.996, 0.999, sunDot) * (1.0 - uNightAmount);

          // Crisp stars at night
          if (uNightAmount > 0.05 && dir.y > 0.05) {
            float star = step(0.994, hash(floor(dir * 140.0)));
            col += vec3(0.7, 0.88, 1.0) * star * uNightAmount * smoothstep(0.05, 0.3, dir.y);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);

    // 6. Three-point / Outdoor Lighting
    this.hemiLight = new THREE.HemisphereLight(0x9bd8ff, 0x2c3b47, 0.78);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 1.45);
    this.sunLight.position.set(28, 48, 22);
    this.sunLight.castShadow = !this.isSoftwareGl && this.settings.shadows;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    const d = 32;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 120;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Blue neon shrine beacon light
    this.shrineLight = new THREE.PointLight(0x38bdf8, 4.5, 18, 1.6);
    this.shrineLight.position.set(4.5, 22, 4.5);
    this.scene.add(this.shrineLight);

    // 7. Procedural Textures & Materials
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.atlas = createVoxelAtlas(maxAniso);

    this.opaqueMaterial = new THREE.MeshStandardMaterial({
      map: this.atlas.colorMap,
      emissiveMap: this.atlas.emissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.35,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.06,
    });

    this.waterMaterial = new THREE.MeshPhysicalMaterial({
      map: this.atlas.colorMap,
      color: 0x67c8ff,
      transparent: true,
      opacity: 0.76,
      roughness: 0.14,
      metalness: 0.08,
      clearcoat: 0.7,
      clearcoatRoughness: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.glassMaterial = new THREE.MeshStandardMaterial({
      map: this.atlas.colorMap,
      transparent: true,
      opacity: 0.62,
      roughness: 0.12,
      metalness: 0.25,
      depthWrite: false,
    });

    // 8. World, Mobs & Player Avatar
    this.scene.add(this.mobManager.rootGroup);
    this.avatar = new PlayerAvatar();
    this.scene.add(this.avatar.group);

    // First-person held block viewmodel attached to camera
    this.firstPersonHand = new THREE.Group();
    const fpGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    const fpMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.2,
    });
    this.firstPersonBlock = new THREE.Mesh(fpGeo, fpMat);
    this.firstPersonHand.add(this.firstPersonBlock);
    this.firstPersonHand.position.set(0.36, -0.32, -0.52);
    this.firstPersonHand.rotation.set(0.18, -0.45, 0.08);
    this.firstPersonHand.visible = false;
    this.camera.add(this.firstPersonHand);

    // 9. Target Block Wireframe Highlight
    const hlBox = new THREE.BoxGeometry(1.006, 1.006, 1.006);
    const hlEdges = new THREE.EdgesGeometry(hlBox);
    hlBox.dispose();
    const hlMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
    });
    this.highlightMesh = new THREE.LineSegments(hlEdges, hlMat);
    this.highlightMesh.visible = false;
    this.scene.add(this.highlightMesh);

    // 10. Instanced Voxel Clouds
    const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xf8fbff,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.88,
    });
    const cloudCount = 48;
    this.cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
    this.cloudMesh.frustumCulled = false;
    for (let i = 0; i < cloudCount; i++) {
      const cx = (Math.random() - 0.5) * 180;
      const cz = (Math.random() - 0.5) * 180;
      const cy = 38 + Math.random() * 8;
      const sx = 5 + Math.random() * 9;
      const sz = 4 + Math.random() * 7;
      this.cloudBasePositions.push({
        x: cx,
        y: cy,
        z: cz,
        sx,
        sz,
        speed: 0.45 + Math.random() * 0.4,
      });
      _v1.set(cx, cy, cz);
      _scale.set(sx, 1.4, sz);
      _mat4.compose(_v1, _quat.identity(), _scale);
      this.cloudMesh.setMatrixAt(i, _mat4);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
    this.cloudMesh.computeBoundingSphere();
    this.scene.add(this.cloudMesh);

    // 11. Block Break Particle Pool (InstancedMesh)
    const pGeo = new THREE.BoxGeometry(1, 1, 1);
    const pMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
    const maxParticles = 60;
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, maxParticles);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        scale: 0.15,
        color: new THREE.Color(0x38bdf8),
      });
      _v1.set(0, -100, 0);
      _scale.set(0.001, 0.001, 0.001);
      _mat4.compose(_v1, _quat.identity(), _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.set(0x38bdf8));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);

    // 12. Build Initial World
    this.initWorld(initialSeed, initialPreset);
    this.applyTimeOfDay(this.settings.timeOfDay);

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 13. Bind Events
    this.onResizeBound = this.handleResize.bind(this);
    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onPointerDownBound = this.handlePointerDown.bind(this);
    this.onPointerMoveBound = this.handlePointerMove.bind(this);
    this.onPointerUpBound = this.handlePointerUp.bind(this);
    this.onWheelBound = this.handleWheel.bind(this);
    this.onContextMenuBound = (e: MouseEvent) => e.preventDefault();
    this.onPointerLockChangeBound = this.handlePointerLockChange.bind(this);
    this.onContextLostBound = (e: Event) => {
      e.preventDefault();
      this.callbacks.onContextLost?.(true);
    };
    this.onContextRestoredBound = () => {
      this.callbacks.onContextLost?.(false);
    };

    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    canvas.addEventListener('wheel', this.onWheelBound, { passive: true });
    canvas.addEventListener('contextmenu', this.onContextMenuBound);
    canvas.addEventListener('webglcontextlost', this.onContextLostBound);
    canvas.addEventListener('webglcontextrestored', this.onContextRestoredBound);

    this.lastTime = performance.now();
    this.tick();
  }

  public getThumbnails(): Record<number, string> {
    return this.atlas.thumbnails;
  }

  public getItemThumbnails(): Record<string, string> {
    return this.atlas.itemThumbnails;
  }

  public initWorld(
    seed: string,
    preset: BiomePreset,
    serverEdits?: Array<[string, number]>,
  ) {
    if (this.world) {
      this.scene.remove(this.world.rootGroup);
      this.world.dispose();
    }
    this.seedText = seed;
    this.preset = preset;
    this.world = new VoxelWorld(
      seed,
      preset,
      this.opaqueMaterial,
      this.waterMaterial,
      this.glassMaterial,
      serverEdits,
    );
    this.scene.add(this.world.rootGroup);

    const shadows = !this.isSoftwareGl && this.settings.shadows;
    this.world.buildInitialChunks(Math.min(this.settings.renderDistance, 3), shadows);

    // Spawn player facing the glowing blue neon shrine
    const spawnX = 4.5 + (Math.random() - 0.5) * 2.5;
    const spawnZ = 11.5 + (Math.random() - 0.5) * 2.5;
    const surfY = this.world.getSurfaceHeight(Math.floor(spawnX), Math.floor(spawnZ));
    const shrineSurface = this.world.getSurfaceHeight(4, 4);
    this.shrineLight.position.set(4.5, shrineSurface + 4.2, 4.5);

    this.playerPos.set(spawnX, Math.max(surfY + 1.1, WATER_LEVEL + 1.5), spawnZ);
    this.playerVel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.06;
    this.isFlying = false;
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.isDead = false;
    this.fallPeakY = this.playerPos.y;
    this.wasGrounded = true;
    this.miningProgress = 0;
    this.isMiningHeld = false;
    this.mobManager.clearAll();
    this.avatar.group.position.copy(this.playerPos);
    this.smoothCamPos.set(spawnX + 10, this.playerPos.y + 8, spawnZ + 8);
    this.smoothCamLook.set(4.5, shrineSurface + 2.5, 4.5);
  }

  public clearRemotePlayers() {
    for (const entry of this.remotePlayers.values()) {
      this.scene.remove(entry.avatar.group);
      entry.avatar.dispose();
    }
    this.remotePlayers.clear();
  }

  public loadMultiplayerRoom(
    seed: string,
    preset: BiomePreset,
    edits: Array<[string, number]>,
    players: RemotePlayerState[],
    gameMode: GameMode = 'survival',
  ) {
    this.clearRemotePlayers();
    this.gameMode = gameMode;
    this.initWorld(seed, preset, edits);
    for (const p of players) {
      this.upsertRemotePlayer(p);
    }
    this.pushHudState();
  }

  public setGameMode(mode: GameMode) {
    this.gameMode = mode;
    if (mode === 'survival') {
      this.isFlying = false;
    }
    this.pushHudState();
  }

  public healFromFood(hungerAdd: number, healthAdd: number) {
    this.hunger = Math.min(this.maxHunger, this.hunger + hungerAdd);
    this.health = Math.min(this.maxHealth, this.health + healthAdd);
    this.handSwing = 0.22;
    soundEngine.playMenuClick();
    this.pushHudState();
  }

  public respawn() {
    const sx = 4.5;
    const sz = 11.5;
    const sy = this.world.getSurfaceHeight(Math.floor(sx), Math.floor(sz));
    this.playerPos.set(sx, Math.max(sy + 1.2, WATER_LEVEL + 1.5), sz);
    this.playerVel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.isDead = false;
    this.fallPeakY = this.playerPos.y;
    this.wasGrounded = true;
    this.isFlying = false;
    this.pushHudState();
  }

  public upsertRemotePlayer(state: RemotePlayerState) {
    let entry = this.remotePlayers.get(state.playerId);
    if (!entry) {
      const avatar = new PlayerAvatar();
      avatar.setLabel(state.nickname);
      avatar.group.position.set(state.x, state.y, state.z);
      avatar.group.rotation.y = state.yaw;
      const blockDef = BLOCK_DEFINITIONS[state.selectedBlock] || BLOCK_DEFINITIONS[BlockType.NEON_BLUE];
      avatar.setHeldColor(blockDef.accentColor);
      this.scene.add(avatar.group);
      entry = {
        avatar,
        target: { ...state },
        curX: state.x,
        curY: state.y,
        curZ: state.z,
        curYaw: state.yaw,
      };
      this.remotePlayers.set(state.playerId, entry);
    } else {
      entry.target = { ...state };
      entry.avatar.setLabel(state.nickname);
      const blockDef = BLOCK_DEFINITIONS[state.selectedBlock] || BLOCK_DEFINITIONS[BlockType.NEON_BLUE];
      entry.avatar.setHeldColor(blockDef.accentColor);
    }
  }

  public removeRemotePlayer(playerId: string) {
    const entry = this.remotePlayers.get(playerId);
    if (entry) {
      this.scene.remove(entry.avatar.group);
      entry.avatar.dispose();
      this.remotePlayers.delete(playerId);
    }
  }

  public swingRemotePlayer(playerId: string) {
    const entry = this.remotePlayers.get(playerId);
    if (entry) {
      entry.avatar.triggerSwing();
    }
  }

  public applyRemoteBlockUpdate(x: number, y: number, z: number, block: BlockType) {
    const prev = this.world.getBlock(x, y, z);
    if (prev === block) return;
    this.world.setBlock(x, y, z, block);
    if (block === BlockType.AIR && prev !== BlockType.AIR) {
      this.spawnBreakParticles(x, y, z, prev);
    }
  }

  public setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.isDraggingLook = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    }
  }

  public regenerateWorld(seed: string, preset: BiomePreset, clearEdits = false) {
    this.clearRemotePlayers();
    if (clearEdits && this.world) {
      this.world.clearSavedEdits();
    }
    this.initWorld(seed, preset);
  }

  public setPhase(phase: GamePhase) {
    this.phase = phase;
    if (phase !== 'playing' && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    if (phase === 'playing') {
      this.isDraggingLook = false;
      this.keys.clear();
    }
    this.callbacks.onPhaseChange(phase);
  }

  public requestLock() {
    if (this.phase === 'playing' && this.renderer.domElement.requestPointerLock) {
      try {
        this.renderer.domElement.requestPointerLock();
      } catch {
        // Fallback to drag-to-look if browser/iframe blocks pointer lock
      }
    }
  }

  public updateSettings(next: GameSettings) {
    const prevRender = this.settings.renderDistance;
    this.settings = { ...next };
    soundEngine.setEnabled(next.soundEnabled);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && next.shadows;
    this.sunLight.castShadow = !this.isSoftwareGl && next.shadows;
    this.world.refreshShadows(!this.isSoftwareGl && next.shadows);
    this.applyTimeOfDay(next.timeOfDay);
    if (next.renderDistance !== prevRender) {
      this.world.updateAroundPlayer(
        this.playerPos.x,
        this.playerPos.z,
        next.renderDistance,
        !this.isSoftwareGl && next.shadows,
      );
    }
  }

  public setSelectedItem(itemId: ItemId | null) {
    this.selectedItem = itemId;
    if (!itemId) {
      this.selectedBlock = BlockType.AIR;
      this.avatar.setHeldColor('#94a3b8');
      this.firstPersonBlock.scale.set(0.32, 0.32, 0.32);
      const mat = this.firstPersonBlock.material as THREE.MeshStandardMaterial;
      mat.color.set('#cbd5e1');
      mat.emissive.set('#000000');
      mat.emissiveIntensity = 0;
      return;
    }

    const itemDef = ITEM_DEFINITIONS[itemId];
    if (itemDef.blockType !== undefined) {
      this.setSelectedBlock(itemDef.blockType);
      this.firstPersonBlock.scale.set(1, 1, 1);
      return;
    }

    this.selectedBlock = BlockType.AIR;
    this.avatar.setHeldColor(itemDef.accentColor);
    const mat = this.firstPersonBlock.material as THREE.MeshStandardMaterial;
    mat.color.set(itemDef.accentColor);
    mat.emissive.set(itemDef.accentColor);
    mat.emissiveIntensity = itemId.startsWith('neon_') ? 0.85 : 0.2;

    if (itemDef.toolKind === 'sword') {
      this.firstPersonBlock.scale.set(0.28, 2.0, 0.14);
    } else if (itemDef.toolKind) {
      this.firstPersonBlock.scale.set(0.9, 1.35, 0.16);
    } else {
      this.firstPersonBlock.scale.set(0.55, 0.55, 0.55);
    }
  }

  public setSelectedBlock(block: BlockType) {
    this.selectedBlock = block;
    const def = BLOCK_DEFINITIONS[block];
    this.avatar.setHeldColor(def.accentColor);
    this.firstPersonBlock.scale.set(1, 1, 1);
    const mat = this.firstPersonBlock.material as THREE.MeshStandardMaterial;
    mat.color.set(def.accentColor);
    mat.emissive.set(def.accentColor);
    mat.emissiveIntensity = def.emissive ? 0.9 : 0.12;
  }

  public toggleCameraMode() {
    this.cameraMode = this.cameraMode === 'first-person' ? 'third-person' : 'first-person';
    this.pushHudState();
  }

  public toggleFlyMode() {
    if (this.gameMode === 'survival') {
      this.isFlying = false;
      this.miningHint = 'Uchish faqat Kreativ rejimda';
      this.miningHintTimer = 2.0;
      this.pushHudState();
      return;
    }
    this.isFlying = !this.isFlying;
    this.playerVel.y = 0;
    this.pushHudState();
  }

  public setMobileActionMode(mode: 'break' | 'place') {
    this.mobileActionMode = mode;
  }

  public triggerVirtualJump() {
    if (this.isFlying) {
      this.playerPos.y += 1.0;
    } else if (this.isGrounded || this.isInWater) {
      this.playerVel.y = 7.6;
      this.isGrounded = false;
      soundEngine.playJump();
    }
  }

  public triggerVirtualKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  private applyTimeOfDay(hour: number) {
    // 6 = dawn, 12 = noon, 18 = dusk, 0/24 = midnight
    const angle = ((hour - 6) / 24) * Math.PI * 2;
    const sunY = Math.sin(angle);
    const sunX = Math.cos(angle);
    const sunZ = 0.35;

    this.skyUniforms.uSunDir.value.set(sunX, sunY, sunZ).normalize();
    const dayFactor = THREE.MathUtils.clamp((sunY + 0.15) / 0.55, 0, 1);
    const nightFactor = 1 - dayFactor;
    this.skyUniforms.uNightAmount.value = nightFactor;

    const twilight = THREE.MathUtils.clamp(1 - Math.abs(sunY) * 3.5, 0, 1);

    // Sky colors
    const dayTop = _color.set(0x0b5ed7);
    const nightTop = new THREE.Color(0x020714);
    this.skyUniforms.uTopColor.value.copy(dayTop).lerp(nightTop, nightFactor);

    const dayHoriz = new THREE.Color(0x9bdcff);
    const duskHoriz = new THREE.Color(0x3b82f6);
    const nightHoriz = new THREE.Color(0x07142b);
    this.skyUniforms.uHorizonColor.value
      .copy(dayHoriz)
      .lerp(duskHoriz, twilight * 0.6)
      .lerp(nightHoriz, nightFactor);

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.skyUniforms.uHorizonColor.value);
      this.scene.fog.density = THREE.MathUtils.lerp(0.011, 0.016, nightFactor);
    }

    // Lighting intensities
    this.sunLight.intensity = THREE.MathUtils.lerp(0.22, 1.55, dayFactor);
    this.sunLight.color
      .set(0xfff4de)
      .lerp(new THREE.Color(0x60a5fa), nightFactor * 0.85);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.32, 0.82, dayFactor);
    this.hemiLight.color
      .set(0x9bd8ff)
      .lerp(new THREE.Color(0x1e3a8a), nightFactor);
    this.hemiLight.groundColor
      .set(0x334155)
      .lerp(new THREE.Color(0x090f1e), nightFactor);
  }

  private spawnBreakParticles(bx: number, by: number, bz: number, block: BlockType) {
    const def = BLOCK_DEFINITIONS[block];
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < 12; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = bx + 0.25 + Math.random() * 0.5;
        p.y = by + 0.25 + Math.random() * 0.5;
        p.z = bz + 0.25 + Math.random() * 0.5;
        p.vx = (Math.random() - 0.5) * 4.5;
        p.vy = 2.0 + Math.random() * 3.5;
        p.vz = (Math.random() - 0.5) * 4.5;
        p.life = 0;
        p.maxLife = 0.35 + Math.random() * 0.25;
        p.scale = 0.11 + Math.random() * 0.09;
        p.color.set(def.accentColor);
        spawned++;
      }
    }
  }

  private updateParticles(dt: number) {
    let anyChanged = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _v1.set(0, -100, 0);
        _scale.set(0.001, 0.001, 0.001);
        _mat4.compose(_v1, _quat.identity(), _scale);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const s = p.scale * (1 - p.life / p.maxLife);
      _v1.set(p.x, p.y, p.z);
      _scale.set(s, s, s);
      _mat4.compose(_v1, _quat.identity(), _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private isSolidAt(wx: number, wy: number, wz: number): boolean {
    const b = this.world.getBlock(wx, wy, wz);
    return BLOCK_DEFINITIONS[b].solid;
  }

  private collidesAt(px: number, py: number, pz: number): boolean {
    const hw = 0.29;
    const h = 1.72;
    const minX = Math.floor(px - hw);
    const maxX = Math.floor(px + hw);
    const minY = Math.floor(py + 0.02);
    const maxY = Math.floor(py + h);
    const minZ = Math.floor(pz - hw);
    const maxZ = Math.floor(pz + hw);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private updatePlayerPhysics(dt: number) {
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let moveF = 0;
    let moveR = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveF += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveF -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveR += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveR -= 1;

    const inputLen = Math.hypot(moveF, moveR);
    if (inputLen > 0) {
      moveF /= inputLen;
      moveR /= inputLen;
    }

    const isSprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const inWaterBlock = this.world.getBlock(
      this.playerPos.x,
      this.playerPos.y + 0.5,
      this.playerPos.z,
    );
    this.isInWater = inWaterBlock === BlockType.WATER;

    const baseSpeed = this.isFlying ? 11.5 : this.isInWater ? 3.8 : 5.4;
    const targetSpeed = isSprinting ? baseSpeed * 1.58 : baseSpeed;

    const wishX = (forwardX * moveF + rightX * moveR) * targetSpeed;
    const wishZ = (forwardZ * moveF + rightZ * moveR) * targetSpeed;

    const accel = this.isGrounded || this.isFlying ? 15 : 6;
    this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, wishX, accel, dt);
    this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, wishZ, accel, dt);

    if (this.isFlying) {
      let flyY = 0;
      if (this.keys.has('Space')) flyY += 1;
      if (this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.keys.has('KeyQ')) flyY -= 1;
      const flySpeed = isSprinting ? 11 : 7.5;
      this.playerVel.y = THREE.MathUtils.damp(this.playerVel.y, flyY * flySpeed, 12, dt);
      this.isGrounded = false;
    } else {
      if (this.isInWater) {
        this.playerVel.y -= 9.5 * dt;
        if (this.keys.has('Space')) {
          this.playerVel.y = 4.6;
        } else {
          this.playerVel.y = Math.max(this.playerVel.y, -2.5);
        }
      } else {
        this.playerVel.y -= 22.5 * dt;
        this.playerVel.y = Math.max(this.playerVel.y, -32);
      }
    }

    // Move X
    const nextX = this.playerPos.x + this.playerVel.x * dt;
    if (!this.collidesAt(nextX, this.playerPos.y, this.playerPos.z)) {
      this.playerPos.x = nextX;
    } else {
      this.playerVel.x = 0;
    }

    // Move Z
    const nextZ = this.playerPos.z + this.playerVel.z * dt;
    if (!this.collidesAt(this.playerPos.x, this.playerPos.y, nextZ)) {
      this.playerPos.z = nextZ;
    } else {
      this.playerVel.z = 0;
    }

    // Move Y
    const nextY = this.playerPos.y + this.playerVel.y * dt;
    if (!this.collidesAt(this.playerPos.x, nextY, this.playerPos.z)) {
      this.playerPos.y = nextY;
      this.isGrounded = false;
    } else {
      if (this.playerVel.y < 0) {
        this.isGrounded = true;
        this.playerPos.y = Math.floor(this.playerPos.y + 0.02);
      }
      this.playerVel.y = 0;
    }

    // Safety floor rescue
    if (this.playerPos.y < 1.5) {
      this.playerPos.y = this.world.getSurfaceHeight(Math.floor(this.playerPos.x), Math.floor(this.playerPos.z)) + 2;
      this.playerVel.y = 0;
    }

    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);

    // Fall damage & Survival vitals
    if (this.gameMode === 'survival' && !this.isDead) {
      if (!this.isGrounded && !this.isInWater && !this.isFlying) {
        if (this.wasGrounded) this.fallPeakY = this.playerPos.y;
        else if (this.playerPos.y > this.fallPeakY) this.fallPeakY = this.playerPos.y;
      }
      if (!this.wasGrounded && this.isGrounded && !this.isInWater && !this.isFlying) {
        const fallDist = this.fallPeakY - this.playerPos.y;
        if (fallDist > 3.8) {
          const dmg = Math.max(1, Math.floor((fallDist - 3.5) * 2));
          this.applyPlayerDamage(dmg, 0, 0);
        }
      }
      if (this.isInWater) {
        this.fallPeakY = this.playerPos.y;
      }
      this.wasGrounded = this.isGrounded;

      const drainRate = isSprinting && horizSpeed > 1 ? 0.14 : horizSpeed > 0.8 ? 0.045 : 0.012;
      this.hungerDrainAccum += drainRate * dt;
      if (this.hungerDrainAccum >= 1) {
        this.hungerDrainAccum -= 1;
        this.hunger = Math.max(0, this.hunger - 1);
      }

      if (this.hunger >= 14 && this.health < this.maxHealth) {
        this.regenTimer += dt;
        if (this.regenTimer >= 3.5) {
          this.regenTimer = 0;
          this.health = Math.min(this.maxHealth, this.health + 1);
        }
      } else {
        this.regenTimer = 0;
      }

      if (this.hunger <= 0 && this.health > 1) {
        this.starveTimer += dt;
        if (this.starveTimer >= 4.0) {
          this.starveTimer = 0;
          this.health = Math.max(1, this.health - 1);
        }
      } else {
        this.starveTimer = 0;
      }
    }

    // Footstep audio
    if (horizSpeed > 1.2 && (this.isGrounded || this.isInWater) && !this.isFlying) {
      this.footstepAccum += horizSpeed * dt;
      if (this.footstepAccum > 2.35) {
        this.footstepAccum = 0;
        soundEngine.playFootstep(this.isInWater);
      }
    }

    // FOV boost on sprint/fly
    const targetFov =
      this.settings.fov +
      (isSprinting && horizSpeed > 2 ? 7 : 0) +
      (this.isFlying && horizSpeed > 2 ? 4 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 10, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private applyPlayerDamage(amount: number, knockX: number, knockZ: number) {
    if (this.gameMode !== 'survival' || this.isDead) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlashTimer = 0.25;
    this.playerVel.x += knockX;
    this.playerVel.z += knockZ;
    if (knockX !== 0 || knockZ !== 0) {
      this.playerVel.y = Math.max(this.playerVel.y, 3.6);
    }
    soundEngine.playBlockBreak();
    if (this.health <= 0) {
      this.isDead = true;
      this.isMiningHeld = false;
      this.miningProgress = 0;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    }
    this.pushHudState();
  }

  private updateRayTarget() {
    if (this.phase !== 'playing' || this.isDead) {
      this.highlightMesh.visible = false;
      this.currentHit = null;
      this.targetMob = null;
      return;
    }

    const eyeY = this.playerPos.y + 1.56;
    const cosPitch = Math.cos(this.pitch);
    const dirX = -Math.sin(this.yaw) * cosPitch;
    const dirY = Math.sin(this.pitch);
    const dirZ = -Math.cos(this.yaw) * cosPitch;

    const mobHit = this.mobManager.raycastMob(
      this.playerPos.x,
      eyeY,
      this.playerPos.z,
      dirX,
      dirY,
      dirZ,
      4.4,
    );
    const hit = raycastVoxel(
      this.playerPos.x,
      eyeY,
      this.playerPos.z,
      dirX,
      dirY,
      dirZ,
      6.5,
      (x, y, z) => this.world.getBlock(x, y, z),
    );

    if (mobHit && (!hit || Math.hypot(mobHit.x - this.playerPos.x, mobHit.z - this.playerPos.z) < hit.distance + 0.4)) {
      this.targetMob = mobHit;
      this.currentHit = null;
      this.highlightMesh.visible = false;
      return;
    }

    this.targetMob = null;
    this.currentHit = hit;
    if (hit) {
      this.highlightMesh.visible = true;
      this.highlightMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.highlightMesh.visible = false;
    }
  }

  private computeMiningDuration(block: BlockType): { duration: number; canHarvest: boolean; hint: string | null } {
    const def = BLOCK_DEFINITIONS[block];
    const heldDef = this.selectedItem ? ITEM_DEFINITIONS[this.selectedItem] : null;
    const heldKind = heldDef?.toolKind ?? 'none';
    const heldTier = heldDef?.toolTier ?? 0;

    let speed = 1;
    if (heldKind !== 'none' && heldKind === def.preferredTool) {
      speed = heldDef?.miningMultiplier ?? 2;
    } else if (heldKind === 'sword' && block === BlockType.OAK_LEAVES) {
      speed = 2.0;
    }

    const minTier = def.minPickTier ?? 0;
    let canHarvest = true;
    let hint: string | null = null;
    if (minTier > 0) {
      if (heldKind !== 'pickaxe' || heldTier < minTier) {
        canHarvest = false;
        speed *= 0.45;
        hint =
          minTier === 1
            ? 'Resurs uchun Kirka kerak!'
            : minTier === 2
              ? 'Tosh kirka kerak!'
              : 'Temir kirka kerak!';
      }
    }

    return {
      duration: Math.max(0.14, def.hardness / speed),
      canHarvest,
      hint,
    };
  }

  private finishBreakBlock(hit: VoxelHit, canHarvest: boolean) {
    if (hit.y <= 0) return;
    const oldBlock = hit.block;
    if (this.world.setBlock(hit.x, hit.y, hit.z, BlockType.AIR)) {
      this.blocksBroken++;
      this.handSwing = 0.22;
      this.avatar.triggerSwing();
      this.spawnBreakParticles(hit.x, hit.y, hit.z, oldBlock);
      soundEngine.playBlockBreak();
      this.callbacks.onLocalBlockUpdate?.(hit.x, hit.y, hit.z, BlockType.AIR);
      this.callbacks.onLocalSwing?.();

      if (this.gameMode === 'survival' && canHarvest) {
        const drops: MobDrop[] = [];
        const def = BLOCK_DEFINITIONS[oldBlock];
        if (oldBlock === BlockType.OAK_LEAVES) {
          if (Math.random() < 0.45) drops.push({ itemId: 'oak_leaves', count: 1 });
          if (Math.random() < 0.32) drops.push({ itemId: 'apple', count: 1 });
          if (Math.random() < 0.28) drops.push({ itemId: 'stick', count: 1 });
        } else if (oldBlock === BlockType.COAL_ORE) {
          drops.push({ itemId: 'coal', count: 1 + (Math.random() > 0.6 ? 1 : 0) });
        } else if (oldBlock === BlockType.NEON_CRYSTAL_ORE) {
          drops.push({ itemId: 'neon_crystal', count: 1 + (Math.random() > 0.55 ? 1 : 0) });
        } else if (def.dropItemId) {
          drops.push({ itemId: def.dropItemId, count: 1 });
        }
        if (drops.length > 0) {
          this.callbacks.onCollectDrops?.(drops);
        }
      }

      this.miningProgress = 0;
      this.miningKey = '';
      this.updateRayTarget();
      this.pushHudState();
    }
  }

  private attackTargetMob() {
    if (!this.targetMob || this.isDead) return;
    const heldDef = this.selectedItem ? ITEM_DEFINITIONS[this.selectedItem] : null;
    const dmg = heldDef?.attackDamage ?? 1;
    const dirX = -Math.sin(this.yaw);
    const dirZ = -Math.cos(this.yaw);

    this.handSwing = 0.22;
    this.avatar.triggerSwing();
    this.callbacks.onLocalSwing?.();
    soundEngine.playBlockBreak();

    const mx = this.targetMob.x;
    const my = this.targetMob.y + 0.6;
    const mz = this.targetMob.z;
    const res = this.mobManager.damageMob(this.targetMob.id, dmg, dirX, dirZ);
    if (res) {
      this.spawnBreakParticles(Math.floor(mx), Math.floor(my), Math.floor(mz), BlockType.NEON_BLUE);
      if (res.killed && res.drops.length > 0 && this.gameMode === 'survival') {
        this.callbacks.onCollectDrops?.(res.drops);
      }
    }
    this.updateRayTarget();
    this.pushHudState();
  }

  private performBlockAction(action: 'break' | 'place') {
    if (this.isDead) return;

    if (action === 'break') {
      if (this.targetMob) {
        this.attackTargetMob();
        return;
      }
      if (!this.currentHit) return;
      if (this.gameMode === 'creative') {
        this.finishBreakBlock(this.currentHit, false);
        return;
      }
      // In survival, soft blocks break quickly on click or hold; check instant if very fast
      const { duration, canHarvest, hint } = this.computeMiningDuration(this.currentHit.block);
      if (hint) {
        this.miningHint = hint;
        this.miningHintTimer = 2.0;
      }
      if (duration <= 0.26) {
        this.finishBreakBlock(this.currentHit, canHarvest);
      }
      return;
    }

    // Place / Interact / Eat
    if (this.currentHit) {
      if (this.currentHit.block === BlockType.CRAFTING_TABLE) {
        this.callbacks.onOpenStation?.('crafting');
        return;
      }
      if (this.currentHit.block === BlockType.FURNACE) {
        this.callbacks.onOpenStation?.('furnace');
        return;
      }
    }

    const heldDef = this.selectedItem ? ITEM_DEFINITIONS[this.selectedItem] : null;
    if (heldDef?.category === 'food' && this.gameMode === 'survival') {
      if (this.hunger < this.maxHunger || this.health < this.maxHealth) {
        this.callbacks.onEatHeldItem?.();
        return;
      }
    }

    if (!this.currentHit || this.selectedBlock === BlockType.AIR) return;
    const hit = this.currentHit;
    const px = hit.x + hit.nx;
    const py = hit.y + hit.ny;
    const pz = hit.z + hit.nz;
    if (py <= 0 || py >= CHUNK_HEIGHT) return;

    const overlapsPlayer =
      px + 1 > this.playerPos.x - 0.28 &&
      px < this.playerPos.x + 0.28 &&
      pz + 1 > this.playerPos.z - 0.28 &&
      pz < this.playerPos.z + 0.28 &&
      py + 1 > this.playerPos.y + 0.05 &&
      py < this.playerPos.y + 1.72;
    if (overlapsPlayer) return;

    if (this.gameMode === 'survival' && this.callbacks.canPlaceSelectedItem && !this.callbacks.canPlaceSelectedItem()) {
      return;
    }

    if (this.world.setBlock(px, py, pz, this.selectedBlock)) {
      this.blocksPlaced++;
      this.handSwing = 0.22;
      this.avatar.triggerSwing();
      soundEngine.playBlockPlace();
      if (this.gameMode === 'survival') {
        this.callbacks.onConsumeSelectedItem?.();
      }
      this.callbacks.onLocalBlockUpdate?.(px, py, pz, this.selectedBlock);
      this.callbacks.onLocalSwing?.();
      this.updateRayTarget();
      this.pushHudState();
    }
  }

  private updateCameraAndAvatar(dt: number) {
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    this.avatar.group.position.copy(this.playerPos);
    this.avatar.group.rotation.y = this.yaw;
    this.avatar.update(dt, horizSpeed, this.isGrounded, this.isFlying, this.pitch);

    if (this.phase !== 'playing') {
      // Cinematic blue-hour / sunlit orbit around the spawn shrine and explorer
      this.avatar.group.visible = true;
      this.firstPersonHand.visible = false;
      this.menuOrbitAngle += dt * 0.14;
      const radius = 15.5;
      const focusX = 4.5;
      const focusZ = 7.0;
      const focusY = this.shrineLight.position.y - 1.2;

      _v1.set(
        focusX + Math.sin(this.menuOrbitAngle) * radius,
        focusY + 5.2 + Math.sin(this.menuOrbitAngle * 0.7) * 1.4,
        focusZ + Math.cos(this.menuOrbitAngle) * radius,
      );
      _v2.set(focusX, focusY, focusZ);
      this.smoothCamPos.lerp(_v1, 1 - Math.exp(-4 * dt));
      this.smoothCamLook.lerp(_v2, 1 - Math.exp(-4 * dt));
      this.camera.position.copy(this.smoothCamPos);
      this.camera.lookAt(this.smoothCamLook);
      return;
    }

    const eyeY = this.playerPos.y + 1.56;
    const cosPitch = Math.cos(this.pitch);
    _dir.set(
      -Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch,
    );

    if (this.cameraMode === 'first-person') {
      this.avatar.group.visible = false;
      this.firstPersonHand.visible = true;

      if (horizSpeed > 0.4 && this.isGrounded && !this.isFlying) {
        this.bobPhase += dt * (4.5 + horizSpeed * 1.4);
      }
      const bobY = Math.sin(this.bobPhase * 2) * 0.025 * Math.min(1, horizSpeed / 5);
      const bobX = Math.cos(this.bobPhase) * 0.018 * Math.min(1, horizSpeed / 5);

      this.camera.position.set(this.playerPos.x, eyeY + bobY, this.playerPos.z);
      _v2.copy(this.camera.position).add(_dir);
      this.camera.lookAt(_v2);

      // Animate held block viewmodel
      if (this.handSwing > 0) this.handSwing = Math.max(0, this.handSwing - dt);
      const swingAmt = this.handSwing > 0 ? Math.sin((this.handSwing / 0.22) * Math.PI) : 0;
      this.firstPersonHand.position.set(
        0.36 + bobX - swingAmt * 0.12,
        -0.32 + bobY * 0.6 - swingAmt * 0.08,
        -0.52 - swingAmt * 0.14,
      );
      this.firstPersonHand.rotation.set(
        0.18 - swingAmt * 0.75,
        -0.45 + swingAmt * 0.25,
        0.08,
      );
    } else {
      // Third-person smooth damped chase camera with terrain collision pull-in
      this.avatar.group.visible = true;
      this.firstPersonHand.visible = false;

      const targetLookX = this.playerPos.x;
      const targetLookY = this.playerPos.y + 1.4;
      const targetLookZ = this.playerPos.z;

      let effectiveDist = this.thirdPersonDist;
      const step = 0.25;
      for (let d = 0.6; d <= this.thirdPersonDist; d += step) {
        const cx = targetLookX - _dir.x * d;
        const cy = targetLookY - _dir.y * d;
        const cz = targetLookZ - _dir.z * d;
        if (this.isSolidAt(Math.floor(cx), Math.floor(cy), Math.floor(cz))) {
          effectiveDist = Math.max(0.9, d - 0.35);
          break;
        }
      }

      _v1.set(
        targetLookX - _dir.x * effectiveDist,
        targetLookY - _dir.y * effectiveDist + 0.35,
        targetLookZ - _dir.z * effectiveDist,
      );
      _v2.set(targetLookX, targetLookY, targetLookZ);

      this.smoothCamPos.lerp(_v1, 1 - Math.exp(-16 * dt));
      this.smoothCamLook.lerp(_v2, 1 - Math.exp(-18 * dt));
      this.camera.position.copy(this.smoothCamPos);
      this.camera.lookAt(this.smoothCamLook);
    }
  }

  private pushHudState() {
    this.callbacks.onHudUpdate({
      x: Math.round(this.playerPos.x),
      y: Math.round(this.playerPos.y),
      z: Math.round(this.playerPos.z),
      isFlying: this.isFlying,
      isGrounded: this.isGrounded,
      isSprinting: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      isInWater: this.isInWater,
      cameraMode: this.cameraMode,
      gameMode: this.gameMode,
      health: this.health,
      maxHealth: this.maxHealth,
      hunger: this.hunger,
      maxHunger: this.maxHunger,
      isDead: this.isDead,
      miningProgress: this.miningProgress,
      miningHint: this.miningHintTimer > 0 ? this.miningHint : null,
      targetBlockName: this.currentHit ? BLOCK_DEFINITIONS[this.currentHit.block].name : null,
      targetBlockType: this.currentHit ? this.currentHit.block : null,
      targetCoords: this.currentHit
        ? [this.currentHit.x, this.currentHit.y, this.currentHit.z]
        : null,
      targetMobName: this.targetMob ? this.targetMob.name : null,
      targetMobHp: this.targetMob ? this.targetMob.hp : 0,
      targetMobMaxHp: this.targetMob ? this.targetMob.maxHp : 0,
      pointerLocked: this.pointerLocked,
      blocksPlaced: this.blocksPlaced,
      blocksBroken: this.blocksBroken,
    });
  }

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.elapsed += dt;

    if (this.miningHintTimer > 0) this.miningHintTimer = Math.max(0, this.miningHintTimer - dt);
    if (this.hurtFlashTimer > 0) this.hurtFlashTimer = Math.max(0, this.hurtFlashTimer - dt);
    if (this.swingSoundCooldown > 0) this.swingSoundCooldown = Math.max(0, this.swingSoundCooldown - dt);

    // Keep sky dome centered on camera & directional shadows centered on player
    this.skyMesh.position.copy(this.camera.position);
    this.sunLight.target.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
    this.sunLight.position.set(
      this.playerPos.x + this.skyUniforms.uSunDir.value.x * 48,
      this.playerPos.y + Math.max(12, this.skyUniforms.uSunDir.value.y * 48),
      this.playerPos.z + this.skyUniforms.uSunDir.value.z * 48,
    );

    // Subtle neon beacon pulse
    this.shrineLight.intensity = 3.6 + Math.sin(this.elapsed * 2.4) * 1.1;

    // Drift voxel clouds
    for (let i = 0; i < this.cloudBasePositions.length; i++) {
      const c = this.cloudBasePositions[i];
      let cx = c.x + this.elapsed * c.speed;
      cx = ((cx + 90) % 180) - 90;
      _v1.set(this.playerPos.x + cx, c.y, this.playerPos.z + c.z);
      _scale.set(c.sx, 1.4, c.sz);
      _mat4.compose(_v1, _quat.identity(), _scale);
      this.cloudMesh.setMatrixAt(i, _mat4);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;

    const hour = this.settings.timeOfDay;
    const isNight = hour < 5.5 || hour > 19.0;

    if (this.phase === 'playing') {
      if (!this.isDead) {
        this.updatePlayerPhysics(dt);
      }
      this.world.updateAroundPlayer(
        this.playerPos.x,
        this.playerPos.z,
        this.settings.renderDistance,
        !this.isSoftwareGl && this.settings.shadows,
      );
      this.updateRayTarget();

      // Continuous Survival mining loop while primary mouse button is held
      if (this.isMiningHeld && this.gameMode === 'survival' && !this.isDead && this.currentHit && this.currentHit.y > 0) {
        const key = `${this.currentHit.x},${this.currentHit.y},${this.currentHit.z}`;
        if (key !== this.miningKey) {
          this.miningKey = key;
          this.miningProgress = 0;
        }
        const { duration, canHarvest, hint } = this.computeMiningDuration(this.currentHit.block);
        if (hint) {
          this.miningHint = hint;
          this.miningHintTimer = 0.4;
        }
        this.miningProgress += dt / duration;
        if (this.swingSoundCooldown <= 0) {
          this.swingSoundCooldown = 0.24;
          this.handSwing = 0.2;
          this.avatar.triggerSwing();
          this.callbacks.onLocalSwing?.();
        }
        if (this.miningProgress >= 1) {
          this.finishBreakBlock(this.currentHit, canHarvest);
        }
      } else if (!this.isMiningHeld) {
        this.miningProgress = 0;
        this.miningKey = '';
      }

      this.mobManager.update(
        dt,
        this.playerPos.x,
        this.playerPos.y,
        this.playerPos.z,
        isNight,
        this.gameMode === 'survival',
        (x, y, z) => this.isSolidAt(x, y, z),
        (x, y, z) => this.world.getBlock(x, y, z),
        (x, z) => this.world.getSurfaceHeight(x, z),
        (amt, kx, kz) => this.applyPlayerDamage(amt, kx, kz),
      );

      this.callbacks.onLocalMove?.({
        x: this.playerPos.x,
        y: this.playerPos.y,
        z: this.playerPos.z,
        yaw: this.yaw,
        pitch: this.pitch,
        isFlying: this.isFlying,
        isGrounded: this.isGrounded,
        isSprinting: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
        selectedBlock: this.selectedBlock,
      });
    } else {
      this.highlightMesh.visible = false;
      this.isMiningHeld = false;
      this.miningProgress = 0;
    }

    // Smoothly animate remote players (friends)
    for (const entry of this.remotePlayers.values()) {
      const prevX = entry.curX;
      const prevZ = entry.curZ;
      entry.curX = THREE.MathUtils.damp(entry.curX, entry.target.x, 14, dt);
      entry.curY = THREE.MathUtils.damp(entry.curY, entry.target.y, 14, dt);
      entry.curZ = THREE.MathUtils.damp(entry.curZ, entry.target.z, 14, dt);
      // Shortest-angle yaw damping
      const yawDiff = Math.atan2(
        Math.sin(entry.target.yaw - entry.curYaw),
        Math.cos(entry.target.yaw - entry.curYaw),
      );
      entry.curYaw += yawDiff * (1 - Math.exp(-14 * dt));

      entry.avatar.group.position.set(entry.curX, entry.curY, entry.curZ);
      entry.avatar.group.rotation.y = entry.curYaw;
      const speed = Math.hypot(entry.curX - prevX, entry.curZ - prevZ) / Math.max(dt, 0.001);
      entry.avatar.update(
        dt,
        speed,
        entry.target.isGrounded,
        entry.target.isFlying,
        entry.target.pitch,
      );
    }

    this.updateCameraAndAvatar(dt);
    this.updateParticles(dt);

    this.hudTimer += dt;
    if (this.hudTimer >= 0.08) {
      this.hudTimer = 0;
      this.pushHudState();
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private handleResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (!this.inputEnabled) return;

    if (e.code === 'Escape') {
      if (this.phase === 'playing') {
        this.setPhase('paused');
      } else if (this.phase === 'paused') {
        this.setPhase('playing');
      }
      return;
    }

    if (this.phase !== 'playing') return;

    this.keys.add(e.code);

    if (e.code === 'Space') {
      e.preventDefault();
      const now = performance.now();
      if (now - this.lastSpaceTap < 260) {
        this.toggleFlyMode();
        this.lastSpaceTap = 0;
      } else {
        this.lastSpaceTap = now;
        if (!this.isFlying && (this.isGrounded || this.isInWater)) {
          this.playerVel.y = 7.8;
          this.isGrounded = false;
          soundEngine.playJump();
        }
      }
    } else if (e.code === 'KeyF') {
      this.toggleFlyMode();
    } else if (e.code === 'KeyV') {
      this.toggleCameraMode();
    } else if (e.code === 'KeyE') {
      this.performBlockAction('place');
    } else if (e.code >= 'Digit1' && e.code <= 'Digit9') {
      const idx = Number(e.code.replace('Digit', '')) - 1;
      this.callbacks.onHotbarSelect(idx);
    }
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
  }

  private handlePointerLockChange() {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.pushHudState();
  }

  private handlePointerDown(e: PointerEvent) {
    if (this.phase !== 'playing' || !this.inputEnabled) return;

    if (e.button === 0 && (e.pointerType !== 'touch' || this.mobileActionMode === 'break')) {
      this.isMiningHeld = true;
    }

    if (this.pointerLocked) {
      if (e.button === 0) this.performBlockAction('break');
      else if (e.button === 2) this.performBlockAction('place');
      return;
    }

    this.isDraggingLook = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.dragMovedDist = 0;

    if (e.pointerType === 'mouse' && e.button === 0 && !this.pointerLocked) {
      this.requestLock();
    }
  }

  private handlePointerMove(e: PointerEvent) {
    if (this.phase !== 'playing') return;
    const sens = 0.0022 * this.settings.sensitivity;

    if (this.pointerLocked) {
      this.yaw -= e.movementX * sens;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * sens,
        -Math.PI * 0.48,
        Math.PI * 0.48,
      );
      return;
    }

    if (this.isDraggingLook) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.dragMovedDist += Math.hypot(dx, dy);
      if (this.dragMovedDist > 8) {
        this.isMiningHeld = false;
      }
      this.yaw -= dx * sens * 1.4;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - dy * sens * 1.4,
        -Math.PI * 0.48,
        Math.PI * 0.48,
      );
    }
  }

  private handlePointerUp(e: PointerEvent) {
    this.isMiningHeld = false;
    if (this.phase !== 'playing') return;
    if (!this.pointerLocked && this.isDraggingLook) {
      this.isDraggingLook = false;
      if (this.dragMovedDist < 6) {
        if (e.button === 2) {
          this.performBlockAction('place');
        } else if (e.button === 0) {
          this.performBlockAction(e.pointerType === 'touch' ? this.mobileActionMode : 'break');
        }
      }
    }
  }

  private handleWheel(e: WheelEvent) {
    if (this.phase !== 'playing') return;
    if (this.cameraMode === 'third-person') {
      this.thirdPersonDist = THREE.MathUtils.clamp(
        this.thirdPersonDist + Math.sign(e.deltaY) * 0.65,
        2.5,
        12,
      );
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    canvas.removeEventListener('wheel', this.onWheelBound);
    canvas.removeEventListener('contextmenu', this.onContextMenuBound);
    canvas.removeEventListener('webglcontextlost', this.onContextLostBound);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestoredBound);

    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }

    this.clearRemotePlayers();
    this.mobManager.dispose();
    this.world?.dispose();
    this.avatar.dispose();
    this.atlas.colorMap.dispose();
    this.atlas.emissiveMap.dispose();
    this.opaqueMaterial.dispose();
    this.waterMaterial.dispose();
    this.glassMaterial.dispose();
    this.pmremEnvTex?.dispose();

    this.skyMesh.geometry.dispose();
    (this.skyMesh.material as THREE.Material).dispose();
    this.highlightMesh.geometry.dispose();
    (this.highlightMesh.material as THREE.Material).dispose();
    this.cloudMesh.geometry.dispose();
    (this.cloudMesh.material as THREE.Material).dispose();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.firstPersonBlock.geometry.dispose();
    (this.firstPersonBlock.material as THREE.Material).dispose();

    this.renderer.dispose();
    if (canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
  }
}
