import * as THREE from 'three';
import { BLOCK_DEFINITIONS, BiomePreset, BlockType } from '../types/game';
import { SeededNoise, hashSeed } from './noise';
import { getTileUVs } from './textures';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 48;
export const WATER_LEVEL = 14;

export interface ChunkMeshes {
  group: THREE.Group;
  opaque: THREE.Mesh | null;
  water: THREE.Mesh | null;
  glass: THREE.Mesh | null;
}

interface FaceSpec {
  dir: [number, number, number];
  corners: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  shade: number;
  role: 'top' | 'bottom' | 'side';
}

// Counter-clockwise winding order looking from outside the cube
const FACES: FaceSpec[] = [
  {
    // +Y Top
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    shade: 1.0,
    role: 'top',
  },
  {
    // -Y Bottom
    dir: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    shade: 0.62,
    role: 'bottom',
  },
  {
    // +X East
    dir: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    shade: 0.84,
    role: 'side',
  },
  {
    // -X West
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    shade: 0.84,
    role: 'side',
  },
  {
    // +Z South
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    shade: 0.92,
    role: 'side',
  },
  {
    // -Z North
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    shade: 0.92,
    role: 'side',
  },
];

export class VoxelWorld {
  private chunks = new Map<string, Uint8Array>();
  private chunkMeshes = new Map<string, ChunkMeshes>();
  private dirtyChunks = new Set<string>();
  private userEdits = new Map<string, BlockType>();
  private noise: SeededNoise;
  private treeNoise: SeededNoise;
  private preset: BiomePreset;
  private seedText: string;

  public readonly rootGroup = new THREE.Group();
  private opaqueMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshPhysicalMaterial;
  private glassMaterial: THREE.MeshStandardMaterial;

  private useLocalStorage: boolean;

  constructor(
    seedText: string,
    preset: BiomePreset,
    opaqueMaterial: THREE.MeshStandardMaterial,
    waterMaterial: THREE.MeshPhysicalMaterial,
    glassMaterial: THREE.MeshStandardMaterial,
    serverEdits?: Array<[string, number]>,
  ) {
    this.seedText = seedText;
    this.preset = preset;
    const hashed = hashSeed(`${seedText}:${preset}`);
    this.noise = new SeededNoise(hashed);
    this.treeNoise = new SeededNoise(hashed ^ 0x9e3779b9);
    this.opaqueMaterial = opaqueMaterial;
    this.waterMaterial = waterMaterial;
    this.glassMaterial = glassMaterial;
    this.useLocalStorage = !serverEdits;
    if (serverEdits) {
      for (const [k, v] of serverEdits) {
        this.userEdits.set(k, v as BlockType);
      }
    } else {
      this.loadEditsFromStorage();
    }
  }

  private storageKey(): string {
    return `mcow_edits_${this.preset}_${this.seedText}`;
  }

  private loadEditsFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      for (const [k, v] of Object.entries(parsed)) {
        this.userEdits.set(k, v as BlockType);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveEditsToStorage() {
    try {
      const obj: Record<string, number> = {};
      this.userEdits.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(this.storageKey(), JSON.stringify(obj));
    } catch {
      // Ignore quota errors
    }
  }

  public clearSavedEdits() {
    this.userEdits.clear();
    try {
      localStorage.removeItem(this.storageKey());
    } catch {
      // Ignore
    }
  }

  public static chunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private static voxelIndex(lx: number, y: number, lz: number): number {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  public getSurfaceHeight(wx: number, wz: number): number {
    if (this.preset === 'neon-archipelago') {
      const island = this.noise.fbm2D(wx * 0.022, wz * 0.022, 4, 0.55, 2.0);
      const detail = this.noise.fbm2D(wx * 0.07 + 100, wz * 0.07 - 50, 2, 0.5, 2.0);
      const distFromOrigin = Math.hypot(wx, wz);
      const spawnBoost = Math.max(0, 1 - distFromOrigin / 18) * 0.25;
      const h = 13 + (island + spawnBoost) * 20 + detail * 4;
      return Math.max(4, Math.min(CHUNK_HEIGHT - 10, Math.round(h)));
    }

    if (this.preset === 'alpine-peaks') {
      const base = this.noise.fbm2D(wx * 0.015, wz * 0.015, 4, 0.52, 2.1);
      const ridge = 1 - Math.abs(this.noise.noise2D(wx * 0.032 + 40, wz * 0.032 - 20)) * 2;
      const h = 17 + base * 16 + Math.max(0, ridge) * 12;
      return Math.max(6, Math.min(CHUNK_HEIGHT - 8, Math.round(h)));
    }

    // Default: emerald-valley
    const hills = this.noise.fbm2D(wx * 0.018, wz * 0.018, 4, 0.5, 2.0);
    const micro = this.noise.fbm2D(wx * 0.06 + 31, wz * 0.06 + 17, 2, 0.45, 2.0);
    const distFromOrigin = Math.hypot(wx, wz);
    const spawnFlatten = Math.max(0, 1 - distFromOrigin / 14);
    const rawHeight = 16 + hills * 14 + micro * 3;
    const h = rawHeight * (1 - spawnFlatten * 0.65) + 17 * (spawnFlatten * 0.65);
    return Math.max(5, Math.min(CHUNK_HEIGHT - 10, Math.round(h)));
  }

  private generateChunkData(cx: number, cz: number): Uint8Array {
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    // First pass: base terrain & strata
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wz = baseZ + lz;
        const surfaceY = this.getSurfaceHeight(wx, wz);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let block = BlockType.AIR;

          if (y === 0) {
            block = BlockType.COBBLESTONE;
          } else if (y < surfaceY - 3) {
            // Subtle cave pocket check
            const cave =
              y > 3 && y < surfaceY - 4
                ? this.noise.noise3D(wx * 0.09, y * 0.11, wz * 0.09)
                : 0;
            if (cave > 0.24) {
              block = BlockType.AIR;
            } else {
              const ore1 = this.noise.noise3D(wx * 0.23 + 11, y * 0.23, wz * 0.23 - 7);
              const ore2 = this.noise.noise3D(wx * 0.27 - 19, y * 0.27 + 5, wz * 0.27 + 13);
              if (ore2 > 0.34 && y <= 10) {
                block = BlockType.DIAMOND_ORE;
              } else if (ore1 > 0.32 && (y <= 12 || this.preset === 'neon-archipelago')) {
                block = BlockType.NEON_CRYSTAL_ORE;
              } else if (ore1 > 0.26 && y < 17) {
                block = BlockType.GOLD_ORE;
              } else if (ore2 > 0.19 && y < 24) {
                block = BlockType.IRON_ORE;
              } else if (ore1 > 0.14) {
                block = BlockType.COAL_ORE;
              } else {
                block = BlockType.STONE;
              }
            }
          } else if (y < surfaceY) {
            if (this.preset === 'alpine-peaks' && surfaceY > 27) {
              const surfCoal = this.noise.noise3D(wx * 0.25, y * 0.25, wz * 0.25);
              block = surfCoal > 0.24 ? BlockType.COAL_ORE : BlockType.STONE;
            } else if (surfaceY <= WATER_LEVEL + 1) {
              block = BlockType.SAND;
            } else {
              block = BlockType.DIRT;
            }
          } else if (y === surfaceY) {
            if (this.preset === 'alpine-peaks' && surfaceY >= 26) {
              block = BlockType.SNOW;
            } else if (surfaceY <= WATER_LEVEL + 1) {
              block = BlockType.SAND;
            } else {
              block = BlockType.GRASS;
            }
          } else if (y <= WATER_LEVEL) {
            block = BlockType.WATER;
          }

          data[VoxelWorld.voxelIndex(lx, y, lz)] = block;
        }
      }
    }

    // Second pass: procedural oak trees (kept inside chunk interior margins so canopies stay clean)
    for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
      const wx = baseX + lx;
      for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
        const wz = baseZ + lz;
        // Keep immediate spawn shrine clear
        if (Math.abs(wx) <= 5 && Math.abs(wz) <= 5) continue;

        const surfaceY = this.getSurfaceHeight(wx, wz);
        if (surfaceY <= WATER_LEVEL + 1 || surfaceY >= CHUNK_HEIGHT - 9) continue;
        if (this.preset === 'alpine-peaks' && surfaceY >= 26) continue;

        const treeChance = this.treeNoise.hash2D(wx, wz);
        const density = this.preset === 'neon-archipelago' ? 0.985 : 0.978;
        const guaranteedStarterTree =
          cx === 0 && cz === 0 && ((lx === 10 && lz === 10) || (lx === 2 && lz === 12));
        if (treeChance > density || guaranteedStarterTree) {
          const trunkH = 4 + Math.floor(this.treeNoise.hash2D(wx + 7, wz - 3) * 2);
          for (let ty = 1; ty <= trunkH; ty++) {
            data[VoxelWorld.voxelIndex(lx, surfaceY + ty, lz)] = BlockType.OAK_LOG;
          }
          const crownBase = surfaceY + trunkH - 1;
          for (let dy = 0; dy <= 3; dy++) {
            const radius = dy === 3 ? 1 : dy === 0 ? 2 : 2;
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dz = -radius; dz <= radius; dz++) {
                if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy >= 2) continue;
                if (dx === 0 && dz === 0 && dy <= 1) continue;
                const nx = lx + dx;
                const ny = crownBase + dy;
                const nz = lz + dz;
                if (
                  nx >= 0 &&
                  nx < CHUNK_SIZE &&
                  nz >= 0 &&
                  nz < CHUNK_SIZE &&
                  ny < CHUNK_HEIGHT
                ) {
                  const idx = VoxelWorld.voxelIndex(nx, ny, nz);
                  if (data[idx] === BlockType.AIR) {
                    data[idx] = BlockType.OAK_LEAVES;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Third pass: Iconic Blue Neon Spawn Shrine in chunk (0, 0)
    if (cx === 0 && cz === 0) {
      const sy = this.getSurfaceHeight(2, 2);
      const baseX0 = 4;
      const baseZ0 = 4;
      // Stone + Neon pedestal (3x3)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const px = baseX0 + dx;
          const pz = baseZ0 + dz;
          const isCenter = dx === 0 && dz === 0;
          const isCorner = Math.abs(dx) === 1 && Math.abs(dz) === 1;
          data[VoxelWorld.voxelIndex(px, sy, pz)] = BlockType.COBBLESTONE;
          data[VoxelWorld.voxelIndex(px, sy + 1, pz)] = isCenter
            ? BlockType.NEON_BLUE
            : isCorner
              ? BlockType.COBBLESTONE
              : BlockType.STONE;
          if (isCorner) {
            data[VoxelWorld.voxelIndex(px, sy + 2, pz)] = BlockType.GLASS;
            data[VoxelWorld.voxelIndex(px, sy + 3, pz)] = BlockType.NEON_BLUE;
          }
        }
      }
      // Floating Neon Beacon Core
      data[VoxelWorld.voxelIndex(baseX0, sy + 3, baseZ0)] = BlockType.NEON_BLUE;
      data[VoxelWorld.voxelIndex(baseX0, sy + 4, baseZ0)] = BlockType.GLASS;
    }

    // Neon Archipelago extra neon monoliths
    if (this.preset === 'neon-archipelago') {
      const crystalRoll = this.treeNoise.hash2D(cx * 31 + 5, cz * 17 - 9);
      if (crystalRoll > 0.72) {
        const lx = 8;
        const lz = 8;
        const sy = this.getSurfaceHeight(baseX + lx, baseZ + lz);
        if (sy > WATER_LEVEL && sy < CHUNK_HEIGHT - 8) {
          data[VoxelWorld.voxelIndex(lx, sy + 1, lz)] = BlockType.STONE;
          data[VoxelWorld.voxelIndex(lx, sy + 2, lz)] = BlockType.NEON_BLUE;
          data[VoxelWorld.voxelIndex(lx, sy + 3, lz)] = BlockType.GLASS;
          data[VoxelWorld.voxelIndex(lx, sy + 4, lz)] = BlockType.NEON_BLUE;
        }
      }
    }

    // Apply persisted user edits inside this chunk
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const key = `${baseX + lx},${y},${baseZ + lz}`;
          const edit = this.userEdits.get(key);
          if (edit !== undefined) {
            data[VoxelWorld.voxelIndex(lx, y, lz)] = edit;
          }
        }
      }
    }

    return data;
  }

  public ensureChunkData(cx: number, cz: number): Uint8Array {
    const key = VoxelWorld.chunkKey(cx, cz);
    let data = this.chunks.get(key);
    if (!data) {
      data = this.generateChunkData(cx, cz);
      this.chunks.set(key, data);
    }
    return data;
  }

  public getBlock(wx: number, wy: number, wz: number): BlockType {
    const y = Math.floor(wy);
    if (y < 0 || y >= CHUNK_HEIGHT) return BlockType.AIR;
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = VoxelWorld.chunkKey(cx, cz);
    const data = this.chunks.get(key);
    if (!data) {
      // Check user edits even if chunk not loaded yet
      const edit = this.userEdits.get(`${x},${y},${z}`);
      return edit !== undefined ? edit : BlockType.AIR;
    }
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return data[VoxelWorld.voxelIndex(lx, y, lz)] as BlockType;
  }

  public setBlock(wx: number, wy: number, wz: number, block: BlockType): boolean {
    const y = Math.floor(wy);
    if (y <= 0 || y >= CHUNK_HEIGHT) return false;
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const data = this.ensureChunkData(cx, cz);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    data[VoxelWorld.voxelIndex(lx, y, lz)] = block;
    this.userEdits.set(`${x},${y},${z}`, block);
    if (this.useLocalStorage) {
      this.saveEditsToStorage();
    }

    this.dirtyChunks.add(VoxelWorld.chunkKey(cx, cz));
    if (lx === 0) this.dirtyChunks.add(VoxelWorld.chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.dirtyChunks.add(VoxelWorld.chunkKey(cx + 1, cz));
    if (lz === 0) this.dirtyChunks.add(VoxelWorld.chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.dirtyChunks.add(VoxelWorld.chunkKey(cx, cz + 1));

    return true;
  }

  private isOpaqueAt(wx: number, wy: number, wz: number): boolean {
    const b = this.getBlock(wx, wy, wz);
    if (b === BlockType.AIR) return false;
    return !BLOCK_DEFINITIONS[b].transparent;
  }

  private vertexAO(side1: boolean, side2: boolean, corner: boolean): number {
    if (side1 && side2) return 0.54;
    const occ = (side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0);
    return 1.0 - occ * 0.14;
  }

  private buildChunkMesh(cx: number, cz: number, shadowsEnabled: boolean) {
    const key = VoxelWorld.chunkKey(cx, cz);
    const existing = this.chunkMeshes.get(key);
    if (existing) {
      if (existing.opaque) existing.opaque.geometry.dispose();
      if (existing.water) existing.water.geometry.dispose();
      if (existing.glass) existing.glass.geometry.dispose();
      this.rootGroup.remove(existing.group);
      this.chunkMeshes.delete(key);
    }

    const data = this.ensureChunkData(cx, cz);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    // Ensure neighbors exist for seamless border culling
    this.ensureChunkData(cx + 1, cz);
    this.ensureChunkData(cx - 1, cz);
    this.ensureChunkData(cx, cz + 1);
    this.ensureChunkData(cx, cz - 1);

    const opaqueBuf = { pos: [] as number[], norm: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] };
    const waterBuf = { pos: [] as number[], norm: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] };
    const glassBuf = { pos: [] as number[], norm: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] };

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wz = baseZ + lz;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = baseX + lx;
          const block = data[VoxelWorld.voxelIndex(lx, y, lz)] as BlockType;
          if (block === BlockType.AIR) continue;

          const def = BLOCK_DEFINITIONS[block];
          const isWater = !!def.isWater;
          const isGlass = block === BlockType.GLASS;
          const buf = isWater ? waterBuf : isGlass ? glassBuf : opaqueBuf;

          for (const face of FACES) {
            const [dx, dy, dz] = face.dir;
            const nb = this.getBlock(wx + dx, y + dy, wz + dz);
            const nbDef = BLOCK_DEFINITIONS[nb];

            if (isWater) {
              if (nb !== BlockType.AIR) continue;
            } else if (isGlass) {
              if (nb === BlockType.GLASS || (nb !== BlockType.AIR && !nbDef.transparent)) continue;
            } else {
              if (nb !== BlockType.AIR && !nbDef.transparent) continue;
            }

            const tileIdx =
              dz === 1 && def.tiles.front !== undefined
                ? def.tiles.front
                : def.tiles[face.role];
            const [u0, v0, u1, v1] = getTileUVs(tileIdx);
            const uvCorners: [number, number][] = [
              [u0, v0],
              [u1, v0],
              [u1, v1],
              [u0, v1],
            ];

            const vStart = buf.pos.length / 3;
            const waterTopDrop = isWater && this.getBlock(wx, y + 1, wz) === BlockType.AIR ? 0.12 : 0;

            for (let c = 0; c < 4; c++) {
              const [cxOff, cyOff, czOff] = face.corners[c];
              const vy = y + cyOff - (cyOff === 1 ? waterTopDrop : 0);
              buf.pos.push(wx + cxOff, vy, wz + czOff);
              buf.norm.push(dx, dy, dz);
              buf.uv.push(uvCorners[c][0], uvCorners[c][1]);

              // Compute subtle voxel AO for opaque faces
              let ao = 1.0;
              if (!isWater && !isGlass && !def.emissive) {
                const sx = cxOff === 1 ? 1 : -1;
                const sy = cyOff === 1 ? 1 : -1;
                const sz = czOff === 1 ? 1 : -1;
                if (dy !== 0) {
                  ao = this.vertexAO(
                    this.isOpaqueAt(wx + sx, y + dy, wz),
                    this.isOpaqueAt(wx, y + dy, wz + sz),
                    this.isOpaqueAt(wx + sx, y + dy, wz + sz),
                  );
                } else if (dx !== 0) {
                  ao = this.vertexAO(
                    this.isOpaqueAt(wx + dx, y + sy, wz),
                    this.isOpaqueAt(wx + dx, y, wz + sz),
                    this.isOpaqueAt(wx + dx, y + sy, wz + sz),
                  );
                } else {
                  ao = this.vertexAO(
                    this.isOpaqueAt(wx + sx, y + sy, wz + dz),
                    this.isOpaqueAt(wx, y + sy, wz + dz),
                    this.isOpaqueAt(wx + sx, y, wz + dz),
                  );
                }
              }

              const light = (def.emissive ? 1.0 : face.shade) * ao;
              buf.col.push(light, light, light);
            }

            buf.idx.push(vStart, vStart + 1, vStart + 2, vStart, vStart + 2, vStart + 3);
          }
        }
      }
    }

    const group = new THREE.Group();
    const result: ChunkMeshes = { group, opaque: null, water: null, glass: null };

    const makeMesh = (
      b: typeof opaqueBuf,
      mat: THREE.Material,
      cast: boolean,
      receive: boolean,
      renderOrder = 0,
    ): THREE.Mesh | null => {
      if (b.idx.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.setIndex(b.idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast && shadowsEnabled;
      mesh.receiveShadow = receive && shadowsEnabled;
      mesh.renderOrder = renderOrder;
      group.add(mesh);
      return mesh;
    };

    result.opaque = makeMesh(opaqueBuf, this.opaqueMaterial, true, true, 0);
    result.glass = makeMesh(glassBuf, this.glassMaterial, false, true, 1);
    result.water = makeMesh(waterBuf, this.waterMaterial, false, true, 2);

    this.rootGroup.add(group);
    this.chunkMeshes.set(key, result);
  }

  public updateAroundPlayer(playerX: number, playerZ: number, radius: number, shadowsEnabled: boolean) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);

    const desiredKeys = new Set<string>();
    const toBuild: Array<{ cx: number; cz: number; dist: number }> = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius + 1) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = VoxelWorld.chunkKey(cx, cz);
        desiredKeys.add(key);
        if (!this.chunkMeshes.has(key) || this.dirtyChunks.has(key)) {
          toBuild.push({ cx, cz, dist: dx * dx + dz * dz });
        }
      }
    }

    // Unload distant chunk meshes
    for (const [key, entry] of this.chunkMeshes.entries()) {
      if (!desiredKeys.has(key)) {
        if (entry.opaque) entry.opaque.geometry.dispose();
        if (entry.water) entry.water.geometry.dispose();
        if (entry.glass) entry.glass.geometry.dispose();
        this.rootGroup.remove(entry.group);
        this.chunkMeshes.delete(key);
      }
    }

    // Build dirty or closest chunks (limit new chunk builds per frame for buttery FPS)
    toBuild.sort((a, b) => a.dist - b.dist);
    let builtThisFrame = 0;
    for (const item of toBuild) {
      const key = VoxelWorld.chunkKey(item.cx, item.cz);
      const isDirty = this.dirtyChunks.has(key);
      if (!isDirty && builtThisFrame >= 2 && this.chunkMeshes.size > 4) break;
      this.dirtyChunks.delete(key);
      this.buildChunkMesh(item.cx, item.cz, shadowsEnabled);
      if (!isDirty) builtThisFrame++;
    }
  }

  public buildInitialChunks(radius: number, shadowsEnabled: boolean) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius + 1) continue;
        this.buildChunkMesh(dx, dz, shadowsEnabled);
      }
    }
  }

  public refreshShadows(enabled: boolean) {
    for (const entry of this.chunkMeshes.values()) {
      if (entry.opaque) {
        entry.opaque.castShadow = enabled;
        entry.opaque.receiveShadow = enabled;
      }
      if (entry.water) entry.water.receiveShadow = enabled;
      if (entry.glass) entry.glass.receiveShadow = enabled;
    }
  }

  public dispose() {
    for (const entry of this.chunkMeshes.values()) {
      if (entry.opaque) entry.opaque.geometry.dispose();
      if (entry.water) entry.water.geometry.dispose();
      if (entry.glass) entry.glass.geometry.dispose();
      this.rootGroup.remove(entry.group);
    }
    this.chunkMeshes.clear();
    this.chunks.clear();
    this.dirtyChunks.clear();
  }
}
