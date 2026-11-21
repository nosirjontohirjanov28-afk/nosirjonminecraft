// Fast Amanatides-Woo 3D DDA voxel grid raycaster
import { BLOCK_DEFINITIONS, BlockType } from '../types/game';

export interface VoxelHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  block: BlockType;
  distance: number;
}

export function raycastVoxel(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance: number,
  getBlock: (x: number, y: number, z: number) => BlockType,
): VoxelHit | null {
  let x = Math.floor(originX);
  let y = Math.floor(originY);
  let z = Math.floor(originZ);

  const stepX = dirX > 0 ? 1 : dirX < 0 ? -1 : 0;
  const stepY = dirY > 0 ? 1 : dirY < 0 ? -1 : 0;
  const stepZ = dirZ > 0 ? 1 : dirZ < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dirX) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dirY) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dirZ) : Infinity;

  let tMaxX =
    stepX > 0
      ? (x + 1 - originX) * tDeltaX
      : stepX < 0
        ? (originX - x) * tDeltaX
        : Infinity;
  let tMaxY =
    stepY > 0
      ? (y + 1 - originY) * tDeltaY
      : stepY < 0
        ? (originY - y) * tDeltaY
        : Infinity;
  let tMaxZ =
    stepZ > 0
      ? (z + 1 - originZ) * tDeltaZ
      : stepZ < 0
        ? (originZ - z) * tDeltaZ
        : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let dist = 0;

  for (let i = 0; i < 64; i++) {
    const block = getBlock(x, y, z);
    if (block !== BlockType.AIR && !BLOCK_DEFINITIONS[block].isWater) {
      return { x, y, z, nx, ny, nz, block, distance: dist };
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        dist = tMaxX;
        if (dist > maxDistance) break;
        x += stepX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else {
        dist = tMaxZ;
        if (dist > maxDistance) break;
        z += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        dist = tMaxY;
        if (dist > maxDistance) break;
        y += stepY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        dist = tMaxZ;
        if (dist > maxDistance) break;
        z += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
  }

  return null;
}
