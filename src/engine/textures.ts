import * as THREE from 'three';
import {
  BLOCK_DEFINITIONS,
  BlockType,
  ITEM_DEFINITIONS,
  ItemId,
  TILE,
} from '../types/game';

const GRID_COLS = 8;
const GRID_ROWS = 4;
const TILE_PX = 16;
const ATLAS_W = GRID_COLS * TILE_PX; // 128
const ATLAS_H = GRID_ROWS * TILE_PX; // 64

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawTilePixel(
  ctx: CanvasRenderingContext2D,
  tileIndex: number,
  px: number,
  py: number,
  color: string,
) {
  const col = tileIndex % GRID_COLS;
  const row = Math.floor(tileIndex / GRID_COLS);
  ctx.fillStyle = color;
  ctx.fillRect(col * TILE_PX + px, row * TILE_PX + py, 1, 1);
}

function fillTileNoise(
  ctx: CanvasRenderingContext2D,
  tileIndex: number,
  palette: string[],
  seed: number,
) {
  const rand = seededRand(seed);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const c = palette[Math.floor(rand() * palette.length)];
      drawTilePixel(ctx, tileIndex, x, y, c);
    }
  }
}

export interface VoxelAtlasBundle {
  colorMap: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  thumbnails: Record<number, string>;
  itemThumbnails: Record<string, string>;
}

export function getTileUVs(tileIndex: number): [number, number, number, number] {
  const col = tileIndex % GRID_COLS;
  const row = Math.floor(tileIndex / GRID_COLS);
  const padX = 0.0015;
  const padY = 0.003;
  const u0 = col / GRID_COLS + padX;
  const u1 = (col + 1) / GRID_COLS - padX;
  // Canvas Y=0 is top; UV v=1 is top
  const v1 = 1 - row / GRID_ROWS - padY;
  const v0 = 1 - (row + 1) / GRID_ROWS + padY;
  return [u0, v0, u1, v1];
}

export function createVoxelAtlas(maxAnisotropy = 4): VoxelAtlasBundle {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d')!;

  const emCanvas = document.createElement('canvas');
  emCanvas.width = ATLAS_W;
  emCanvas.height = ATLAS_H;
  const emCtx = emCanvas.getContext('2d')!;
  emCtx.fillStyle = '#000000';
  emCtx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  // 0: GRASS_TOP
  fillTileNoise(ctx, TILE.GRASS_TOP, ['#4cb848', '#56c752', '#44a840', '#63d45e'], 101);

  // 1: GRASS_SIDE
  fillTileNoise(ctx, TILE.GRASS_SIDE, ['#7d5536', '#8a5f3e', '#6f4a2e', '#946845'], 102);
  const grassRand = seededRand(1029);
  for (let x = 0; x < TILE_PX; x++) {
    const drop = 2 + Math.floor(grassRand() * 3);
    for (let y = 0; y < drop; y++) {
      const green = y === 0 ? '#56c752' : '#44a840';
      drawTilePixel(ctx, TILE.GRASS_SIDE, x, y, green);
    }
  }

  // 2: DIRT
  fillTileNoise(ctx, TILE.DIRT, ['#7d5536', '#8a5f3e', '#6f4a2e', '#946845', '#654228'], 103);

  // 3: STONE
  fillTileNoise(ctx, TILE.STONE, ['#7e8691', '#88919c', '#727a85', '#929ba6'], 104);

  // 4: COBBLESTONE
  fillTileNoise(ctx, TILE.COBBLESTONE, ['#69717c', '#7d8693', '#565e68', '#8c96a4'], 105);
  for (let i = 0; i < TILE_PX; i++) {
    drawTilePixel(ctx, TILE.COBBLESTONE, i, 0, '#474e57');
    drawTilePixel(ctx, TILE.COBBLESTONE, i, 8, '#474e57');
    drawTilePixel(ctx, TILE.COBBLESTONE, 0, i, '#474e57');
    drawTilePixel(ctx, TILE.COBBLESTONE, 8, i, '#474e57');
  }

  // 5: OAK_LOG_SIDE
  const logPalette = ['#5e3f24', '#6d4a2b', '#52361e', '#755130'];
  const logRand = seededRand(106);
  for (let x = 0; x < TILE_PX; x++) {
    const stripe = x % 3 === 0 ? 0 : 1;
    for (let y = 0; y < TILE_PX; y++) {
      const idx = (stripe + Math.floor(logRand() * 3)) % logPalette.length;
      drawTilePixel(ctx, TILE.OAK_LOG_SIDE, x, y, logPalette[idx]);
    }
  }

  // 6: OAK_LOG_TOP
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const color = edge
        ? '#52361e'
        : ring > 4.5 || ring < 2.2
          ? '#b88b58'
          : '#9c7142';
      drawTilePixel(ctx, TILE.OAK_LOG_TOP, x, y, color);
    }
  }

  // 7: OAK_LEAVES
  fillTileNoise(ctx, TILE.OAK_LEAVES, ['#2a8a3d', '#34a34a', '#216e30', '#41b858'], 108);

  // 8: SAND
  fillTileNoise(ctx, TILE.SAND, ['#e5d393', '#ecdc9f', '#dcc782', '#f2e4ad'], 109);

  // 9: WATER
  fillTileNoise(ctx, TILE.WATER, ['#1d84d8', '#2594ea', '#1775c4', '#38a6f5'], 110);

  // 10: GLASS
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      const glint = (x === 3 && y === 3) || (x === 4 && y === 3) || (x === 3 && y === 4) || (x === 11 && y === 12);
      const color = border ? '#93c5fd' : glint ? '#e0f2fe' : '#bae6fd';
      drawTilePixel(ctx, TILE.GLASS, x, y, color);
    }
  }

  // 11: NEON_BLUE
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const outer = x === 0 || y === 0 || x === 15 || y === 15;
      const innerFrame = x === 2 || y === 2 || x === 13 || y === 13;
      const core = x >= 5 && x <= 10 && y >= 5 && y <= 10;
      const centerGlow = x >= 6 && x <= 9 && y >= 6 && y <= 9;
      let color = '#0a1628';
      let em = '#000000';
      if (outer) {
        color = '#0f2544';
        em = '#0284c7';
      } else if (innerFrame && x >= 2 && x <= 13 && y >= 2 && y <= 13) {
        color = '#0ea5e9';
        em = '#0ea5e9';
      } else if (centerGlow) {
        color = '#e0f2fe';
        em = '#7dd3fc';
      } else if (core) {
        color = '#38bdf8';
        em = '#38bdf8';
      }
      drawTilePixel(ctx, TILE.NEON_BLUE, x, y, color);
      drawTilePixel(emCtx, TILE.NEON_BLUE, x, y, em);
    }
  }

  // 12: GOLD_ORE
  fillTileNoise(ctx, TILE.GOLD_ORE, ['#7e8691', '#88919c', '#727a85'], 113);
  const goldCoords = [
    [3, 4], [4, 4], [4, 5],
    [10, 3], [11, 3], [11, 4],
    [6, 10], [7, 10], [7, 11], [8, 11],
    [12, 12], [13, 12],
  ];
  for (const [gx, gy] of goldCoords) {
    drawTilePixel(ctx, TILE.GOLD_ORE, gx, gy, '#facc15');
    drawTilePixel(emCtx, TILE.GOLD_ORE, gx, gy, '#854d0e');
  }

  // 13: SNOW
  fillTileNoise(ctx, TILE.SNOW, ['#eef4fa', '#f8fafc', '#e2ebf5', '#ffffff'], 114);

  // 14: BRICK
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const mortarY = y % 4 === 0;
      const offset = Math.floor(y / 4) % 2 === 0 ? 0 : 4;
      const mortarX = (x + offset) % 8 === 0;
      const color = mortarY || mortarX ? '#cbd5e1' : (x + y) % 3 === 0 ? '#b93829' : '#c94332';
      drawTilePixel(ctx, TILE.BRICK, x, y, color);
    }
  }

  // 15: PLANK
  const plankRand = seededRand(116);
  for (let y = 0; y < TILE_PX; y++) {
    const seamY = y % 4 === 0;
    for (let x = 0; x < TILE_PX; x++) {
      const seamX = (y < 8 && x === 7) || (y >= 8 && x === 14);
      const color =
        seamY || seamX
          ? '#6e4722'
          : plankRand() > 0.5
            ? '#bc864c'
            : '#ad7840';
      drawTilePixel(ctx, TILE.PLANK, x, y, color);
    }
  }

  // 16: CRAFTING_TOP (3x3 crafting grid on wood workbench)
  fillTileNoise(ctx, TILE.CRAFTING_TOP, ['#c28b51', '#b47d44', '#cf985c'], 117);
  for (let i = 0; i < TILE_PX; i++) {
    drawTilePixel(ctx, TILE.CRAFTING_TOP, i, 0, '#5a3818');
    drawTilePixel(ctx, TILE.CRAFTING_TOP, i, 15, '#5a3818');
    drawTilePixel(ctx, TILE.CRAFTING_TOP, 0, i, '#5a3818');
    drawTilePixel(ctx, TILE.CRAFTING_TOP, 15, i, '#5a3818');
  }
  for (const g of [5, 10]) {
    for (let k = 2; k <= 13; k++) {
      drawTilePixel(ctx, TILE.CRAFTING_TOP, g, k, '#4a2e12');
      drawTilePixel(ctx, TILE.CRAFTING_TOP, k, g, '#4a2e12');
    }
  }

  // 17: CRAFTING_SIDE (workbench side with saw & hammer pixels)
  fillTileNoise(ctx, TILE.CRAFTING_SIDE, ['#9c6a38', '#8c5d30', '#ad7840'], 118);
  for (let i = 0; i < TILE_PX; i++) {
    drawTilePixel(ctx, TILE.CRAFTING_SIDE, i, 0, '#5a3818');
    drawTilePixel(ctx, TILE.CRAFTING_SIDE, i, 1, '#5a3818');
    drawTilePixel(ctx, TILE.CRAFTING_SIDE, i, 15, '#5a3818');
  }
  // Tool silhouettes (saw & hammer)
  for (let y = 4; y <= 11; y++) {
    drawTilePixel(ctx, TILE.CRAFTING_SIDE, 4, y, y < 7 ? '#5a3818' : '#cbd5e1');
    drawTilePixel(ctx, TILE.CRAFTING_SIDE, 5, y, y < 6 ? '#5a3818' : '#94a3b8');
    drawTilePixel(ctx, TILE.CRAFTING_SIDE, 11, y, y < 7 ? '#64748b' : '#78350f');
  }
  drawTilePixel(ctx, TILE.CRAFTING_SIDE, 10, 5, '#94a3b8');
  drawTilePixel(ctx, TILE.CRAFTING_SIDE, 12, 5, '#94a3b8');

  // 18: FURNACE_FRONT (stone oven with glowing embers)
  fillTileNoise(ctx, TILE.FURNACE_FRONT, ['#69717c', '#7d8693', '#565e68'], 119);
  for (let y = 3; y <= 6; y++) {
    for (let x = 4; x <= 11; x++) {
      drawTilePixel(ctx, TILE.FURNACE_FRONT, x, y, '#1e293b');
    }
  }
  for (let y = 9; y <= 14; y++) {
    for (let x = 4; x <= 11; x++) {
      const fire = y >= 11 && x >= 5 && x <= 10;
      const core = y >= 12 && x >= 6 && x <= 9;
      const col = core ? '#fde047' : fire ? '#f97316' : '#0f172a';
      drawTilePixel(ctx, TILE.FURNACE_FRONT, x, y, col);
      if (fire) {
        drawTilePixel(emCtx, TILE.FURNACE_FRONT, x, y, core ? '#facc15' : '#ea580c');
      }
    }
  }

  // 19: FURNACE_SIDE
  fillTileNoise(ctx, TILE.FURNACE_SIDE, ['#69717c', '#7d8693', '#565e68', '#88919c'], 120);
  for (let i = 0; i < TILE_PX; i++) {
    drawTilePixel(ctx, TILE.FURNACE_SIDE, i, 0, '#474e57');
    drawTilePixel(ctx, TILE.FURNACE_SIDE, i, 15, '#474e57');
    drawTilePixel(ctx, TILE.FURNACE_SIDE, 0, i, '#474e57');
    drawTilePixel(ctx, TILE.FURNACE_SIDE, 15, i, '#474e57');
  }

  // 20: COAL_ORE
  fillTileNoise(ctx, TILE.COAL_ORE, ['#7e8691', '#88919c', '#727a85'], 121);
  const coalCoords = [
    [2, 3], [3, 3], [3, 4], [4, 4],
    [9, 4], [10, 4], [10, 5],
    [5, 10], [6, 10], [6, 11], [7, 11],
    [11, 11], [12, 11], [12, 12],
  ];
  for (const [cx, cy] of coalCoords) {
    drawTilePixel(ctx, TILE.COAL_ORE, cx, cy, '#111827');
  }

  // 21: IRON_ORE
  fillTileNoise(ctx, TILE.IRON_ORE, ['#7e8691', '#88919c', '#727a85'], 122);
  const ironCoords = [
    [3, 3], [4, 3], [4, 4],
    [10, 5], [11, 5], [11, 6],
    [5, 9], [6, 9], [6, 10],
    [11, 12], [12, 12], [13, 12],
  ];
  for (const [ix, iy] of ironCoords) {
    drawTilePixel(ctx, TILE.IRON_ORE, ix, iy, '#e7c3a8');
  }

  // 22: DIAMOND_ORE
  fillTileNoise(ctx, TILE.DIAMOND_ORE, ['#6e7682', '#7a8390', '#646c78'], 123);
  const diaCoords = [
    [3, 4], [4, 4], [4, 5],
    [10, 3], [11, 3], [11, 4],
    [6, 11], [7, 11], [7, 12],
    [12, 10], [13, 10],
  ];
  for (const [dx, dy] of diaCoords) {
    drawTilePixel(ctx, TILE.DIAMOND_ORE, dx, dy, '#22d3ee');
    drawTilePixel(emCtx, TILE.DIAMOND_ORE, dx, dy, '#0891b2');
  }

  // 23: NEON_CRYSTAL_ORE
  fillTileNoise(ctx, TILE.NEON_CRYSTAL_ORE, ['#1e293b', '#263449', '#334155'], 124);
  const neonCoords = [
    [3, 3], [4, 3], [4, 4], [5, 4],
    [10, 4], [11, 4], [11, 5],
    [6, 10], [7, 10], [7, 11], [8, 11],
    [12, 12], [13, 12],
  ];
  for (const [nx, ny] of neonCoords) {
    drawTilePixel(ctx, TILE.NEON_CRYSTAL_ORE, nx, ny, '#38bdf8');
    drawTilePixel(emCtx, TILE.NEON_CRYSTAL_ORE, nx, ny, '#38bdf8');
  }

  // 24: TORCH (Neon lantern block)
  fillTileNoise(ctx, TILE.TORCH, ['#0f172a', '#1e293b', '#0a1628'], 125);
  for (let y = 3; y <= 12; y++) {
    for (let x = 3; x <= 12; x++) {
      const inner = x >= 5 && x <= 10 && y >= 5 && y <= 10;
      const col = inner ? '#e0f2fe' : '#38bdf8';
      drawTilePixel(ctx, TILE.TORCH, x, y, col);
      drawTilePixel(emCtx, TILE.TORCH, x, y, inner ? '#bae6fd' : '#0ea5e9');
    }
  }

  const colorMap = new THREE.CanvasTexture(canvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.magFilter = THREE.NearestFilter;
  colorMap.minFilter = THREE.NearestFilter;
  colorMap.generateMipmaps = false;
  colorMap.anisotropy = maxAnisotropy;
  colorMap.needsUpdate = true;

  const emissiveMap = new THREE.CanvasTexture(emCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.magFilter = THREE.NearestFilter;
  emissiveMap.minFilter = THREE.NearestFilter;
  emissiveMap.generateMipmaps = false;
  emissiveMap.needsUpdate = true;

  const thumbnails: Record<number, string> = {};
  for (const key of Object.keys(BLOCK_DEFINITIONS)) {
    const id = Number(key) as BlockType;
    if (id === BlockType.AIR) continue;
    thumbnails[id] = renderIsometricThumbnail(canvas, id);
  }

  const itemThumbnails: Record<string, string> = {};
  for (const itemKey of Object.keys(ITEM_DEFINITIONS) as ItemId[]) {
    const itemDef = ITEM_DEFINITIONS[itemKey];
    if (itemDef.blockType !== undefined) {
      itemThumbnails[itemKey] = thumbnails[itemDef.blockType];
    } else {
      itemThumbnails[itemKey] = renderPixelItemIcon(itemKey, itemDef.accentColor);
    }
  }

  return { colorMap, emissiveMap, thumbnails, itemThumbnails };
}

function renderIsometricThumbnail(atlasCanvas: HTMLCanvasElement, blockId: BlockType): string {
  const def = BLOCK_DEFINITIONS[blockId];
  const size = 48;
  const thumb = document.createElement('canvas');
  thumb.width = size;
  thumb.height = size;
  const ctx = thumb.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const drawTileToQuad = (
    tileIdx: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    shade: number,
  ) => {
    const col = tileIdx % GRID_COLS;
    const row = Math.floor(tileIdx / GRID_COLS);
    const sx = col * TILE_PX;
    const sy = row * TILE_PX;

    ctx.save();
    const m11 = (bx - ax) / TILE_PX;
    const m12 = (by - ay) / TILE_PX;
    const m21 = (cx - ax) / TILE_PX;
    const m22 = (cy - ay) / TILE_PX;
    ctx.setTransform(m11, m12, m21, m22, ax, ay);
    ctx.drawImage(atlasCanvas, sx, sy, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    if (shade < 1) {
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - shade})`;
      ctx.fillRect(0, 0, TILE_PX, TILE_PX);
    }
    ctx.restore();
  };

  const top = { x: 24, y: 6 };
  const right = { x: 41, y: 15 };
  const left = { x: 7, y: 15 };
  const center = { x: 24, y: 24 };
  const botLeft = { x: 7, y: 34 };
  const botCenter = { x: 24, y: 43 };

  drawTileToQuad(def.tiles.top, top.x, top.y, right.x, right.y, left.x, left.y, 1.0);
  drawTileToQuad(def.tiles.front ?? def.tiles.side, left.x, left.y, center.x, center.y, botLeft.x, botLeft.y, 0.85);
  drawTileToQuad(def.tiles.side, center.x, center.y, right.x, right.y, botCenter.x, botCenter.y, 0.68);

  return thumb.toDataURL();
}

function renderPixelItemIcon(itemId: ItemId, accentColor: string): string {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const px = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * 3, y * 3, 3, 3);
  };

  const drawHandle = () => {
    px(3, 12, '#78350f');
    px(4, 11, '#92400e');
    px(5, 10, '#78350f');
    px(6, 9, '#92400e');
  };

  if (itemId.endsWith('_sword')) {
    // Diagonal pixel sword
    px(2, 13, '#78350f');
    px(3, 12, '#92400e');
    px(4, 11, '#a16207');
    // Crossguard
    px(3, 9, '#64748b');
    px(4, 10, '#cbd5e1');
    px(5, 11, '#64748b');
    px(6, 12, '#64748b');
    // Blade
    for (let i = 0; i < 8; i++) {
      px(5 + i, 10 - i, accentColor);
      if (i < 7) px(6 + i, 10 - i, '#ffffff55');
    }
    px(13, 2, '#ffffffaa');
    return c.toDataURL();
  }

  if (itemId.endsWith('_pickaxe')) {
    drawHandle();
    px(7, 8, '#78350f');
    px(8, 7, '#92400e');
    px(9, 6, '#78350f');
    // Pick head arc
    const head: Array<[number, number]> = [
      [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 4], [11, 5], [12, 6], [12, 7], [12, 8], [12, 9],
      [9, 4], [10, 5], [11, 6],
    ];
    for (const [hx, hy] of head) px(hx, hy, accentColor);
    return c.toDataURL();
  }

  if (itemId.endsWith('_axe')) {
    drawHandle();
    px(7, 8, '#78350f');
    px(8, 7, '#92400e');
    px(9, 6, '#78350f');
    const blade: Array<[number, number]> = [
      [7, 3], [8, 3], [9, 3], [10, 3],
      [6, 4], [7, 4], [8, 4], [9, 4], [10, 4],
      [6, 5], [7, 5], [8, 5], [9, 5],
      [7, 6], [8, 6],
    ];
    for (const [bx, by] of blade) px(bx, by, accentColor);
    return c.toDataURL();
  }

  if (itemId.endsWith('_shovel')) {
    drawHandle();
    px(7, 8, '#78350f');
    px(8, 7, '#92400e');
    const spade: Array<[number, number]> = [
      [9, 4], [10, 4], [11, 4],
      [8, 5], [9, 5], [10, 5], [11, 5], [12, 5],
      [8, 6], [9, 6], [10, 6], [11, 6],
      [9, 7], [10, 7],
    ];
    for (const [sx, sy] of spade) px(sx, sy, accentColor);
    return c.toDataURL();
  }

  if (itemId === 'stick') {
    for (let i = 3; i <= 12; i++) {
      px(i, 15 - i, i % 2 === 0 ? '#92400e' : '#b45309');
    }
    return c.toDataURL();
  }

  if (itemId === 'coal') {
    const pts = [[5,5],[6,5],[7,5],[8,5],[4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[5,8],[6,8],[7,8],[8,8],[9,8],[6,9],[7,9],[8,9]];
    for (const [x, y] of pts) px(x, y, (x + y) % 3 === 0 ? '#334155' : '#0f172a');
    return c.toDataURL();
  }

  if (itemId === 'iron_ingot' || itemId === 'gold_ingot') {
    const shade = itemId === 'gold_ingot' ? '#ca8a04' : '#94a3b8';
    const hi = itemId === 'gold_ingot' ? '#fef08a' : '#f8fafc';
    for (let y = 5; y <= 10; y++) {
      for (let x = 3; x <= 12; x++) {
        if ((y === 5 || y === 10) && (x === 3 || x === 12)) continue;
        px(x, y, y <= 6 ? hi : y >= 9 ? shade : accentColor);
      }
    }
    return c.toDataURL();
  }

  if (itemId === 'raw_iron' || itemId === 'raw_gold') {
    for (let y = 5; y <= 10; y++) {
      for (let x = 4; x <= 11; x++) {
        if ((x + y) % 2 === 0 || (x >= 5 && x <= 10 && y >= 6 && y <= 9)) {
          px(x, y, (x + y) % 3 === 0 ? '#64748b' : accentColor);
        }
      }
    }
    return c.toDataURL();
  }

  if (itemId === 'diamond' || itemId === 'neon_crystal' || itemId === 'neon_shard') {
    for (let y = 3; y <= 12; y++) {
      const span = y <= 7 ? y - 2 : 13 - y;
      for (let x = 8 - span; x <= 7 + span; x++) {
        const inner = Math.abs(x - 7.5) < span * 0.5 && Math.abs(y - 7.5) < 2.5;
        px(x, y, inner ? '#e0f2fe' : accentColor);
      }
    }
    return c.toDataURL();
  }

  if (itemId === 'apple') {
    px(7, 3, '#78350f');
    px(8, 2, '#22c55e');
    px(9, 2, '#4ade80');
    for (let y = 4; y <= 11; y++) {
      for (let x = 4; x <= 11; x++) {
        if ((y === 4 || y === 11) && (x === 4 || x === 11)) continue;
        px(x, y, x === 6 && y === 6 ? '#fca5a5' : y >= 10 ? '#b91c1c' : '#ef4444');
      }
    }
    return c.toDataURL();
  }

  // Raw or cooked meat
  for (let y = 5; y <= 10; y++) {
    for (let x = 4; x <= 11; x++) {
      const bone = x >= 10 && y <= 6;
      px(x, y, bone ? '#fef3c7' : y === 5 || y === 10 ? '#7f1d1d' : accentColor);
    }
  }
  return c.toDataURL();
}
