export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  COBBLESTONE = 4,
  OAK_LOG = 5,
  OAK_LEAVES = 6,
  SAND = 7,
  WATER = 8,
  GLASS = 9,
  NEON_BLUE = 10,
  GOLD_ORE = 11,
  SNOW = 12,
  BRICK = 13,
  PLANK = 14,
  CRAFTING_TABLE = 15,
  FURNACE = 16,
  COAL_ORE = 17,
  IRON_ORE = 18,
  DIAMOND_ORE = 19,
  NEON_CRYSTAL_ORE = 20,
  TORCH = 21,
}

export type ToolKind = 'none' | 'sword' | 'pickaxe' | 'axe' | 'shovel';

export interface BlockDefinition {
  id: BlockType;
  name: string;
  solid: boolean;
  transparent: boolean;
  isWater?: boolean;
  emissive?: boolean;
  hardness: number; // seconds with bare hand (approx)
  preferredTool: ToolKind;
  minPickTier?: number; // 0=any, 1=wood, 2=stone, 3=iron
  dropItemId?: ItemId | null;
  accentColor: string;
  tiles: {
    top: number;
    bottom: number;
    side: number;
    front?: number;
  };
}

// Tile indices inside the 8x4 procedural texture atlas (0..31)
export const TILE = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  OAK_LOG_SIDE: 5,
  OAK_LOG_TOP: 6,
  OAK_LEAVES: 7,
  SAND: 8,
  WATER: 9,
  GLASS: 10,
  NEON_BLUE: 11,
  GOLD_ORE: 12,
  SNOW: 13,
  BRICK: 14,
  PLANK: 15,
  CRAFTING_TOP: 16,
  CRAFTING_SIDE: 17,
  FURNACE_FRONT: 18,
  FURNACE_SIDE: 19,
  COAL_ORE: 20,
  IRON_ORE: 21,
  DIAMOND_ORE: 22,
  NEON_CRYSTAL_ORE: 23,
  TORCH: 24,
} as const;

export type ItemId =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'cobblestone'
  | 'oak_log'
  | 'oak_leaves'
  | 'sand'
  | 'glass'
  | 'neon_blue'
  | 'gold_ore'
  | 'snow'
  | 'brick'
  | 'plank'
  | 'crafting_table'
  | 'furnace'
  | 'coal_ore'
  | 'iron_ore'
  | 'diamond_ore'
  | 'neon_crystal_ore'
  | 'torch'
  | 'stick'
  | 'coal'
  | 'raw_iron'
  | 'iron_ingot'
  | 'raw_gold'
  | 'gold_ingot'
  | 'diamond'
  | 'neon_crystal'
  | 'apple'
  | 'raw_meat'
  | 'cooked_meat'
  | 'neon_shard'
  | 'wood_sword'
  | 'stone_sword'
  | 'iron_sword'
  | 'gold_sword'
  | 'diamond_sword'
  | 'neon_sword'
  | 'wood_pickaxe'
  | 'stone_pickaxe'
  | 'iron_pickaxe'
  | 'diamond_pickaxe'
  | 'neon_pickaxe'
  | 'wood_axe'
  | 'stone_axe'
  | 'iron_axe'
  | 'diamond_axe'
  | 'wood_shovel'
  | 'stone_shovel'
  | 'iron_shovel';

export type ItemCategory = 'block' | 'resource' | 'food' | 'weapon' | 'tool';

export interface ItemDefinition {
  id: ItemId;
  name: string;
  category: ItemCategory;
  blockType?: BlockType;
  maxStack: number;
  toolKind?: ToolKind;
  toolTier?: number; // 1=wood, 2=stone, 3=iron, 4=diamond, 5=neon
  miningMultiplier?: number;
  attackDamage?: number;
  hungerRestore?: number;
  healthRestore?: number;
  accentColor: string;
}

export const BLOCK_DEFINITIONS: Record<BlockType, BlockDefinition> = {
  [BlockType.AIR]: {
    id: BlockType.AIR,
    name: 'Havo',
    solid: false,
    transparent: true,
    hardness: 0,
    preferredTool: 'none',
    accentColor: '#000000',
    tiles: { top: 0, bottom: 0, side: 0 },
  },
  [BlockType.GRASS]: {
    id: BlockType.GRASS,
    name: 'Maysa bloki',
    solid: true,
    transparent: false,
    hardness: 0.45,
    preferredTool: 'shovel',
    dropItemId: 'dirt',
    accentColor: '#4ade80',
    tiles: { top: TILE.GRASS_TOP, bottom: TILE.DIRT, side: TILE.GRASS_SIDE },
  },
  [BlockType.DIRT]: {
    id: BlockType.DIRT,
    name: 'Tuproq',
    solid: true,
    transparent: false,
    hardness: 0.4,
    preferredTool: 'shovel',
    dropItemId: 'dirt',
    accentColor: '#9a6b44',
    tiles: { top: TILE.DIRT, bottom: TILE.DIRT, side: TILE.DIRT },
  },
  [BlockType.STONE]: {
    id: BlockType.STONE,
    name: 'Tosh',
    solid: true,
    transparent: false,
    hardness: 1.5,
    preferredTool: 'pickaxe',
    minPickTier: 1,
    dropItemId: 'cobblestone',
    accentColor: '#94a3b8',
    tiles: { top: TILE.STONE, bottom: TILE.STONE, side: TILE.STONE },
  },
  [BlockType.COBBLESTONE]: {
    id: BlockType.COBBLESTONE,
    name: 'Toshg‘isht',
    solid: true,
    transparent: false,
    hardness: 1.6,
    preferredTool: 'pickaxe',
    minPickTier: 1,
    dropItemId: 'cobblestone',
    accentColor: '#64748b',
    tiles: { top: TILE.COBBLESTONE, bottom: TILE.COBBLESTONE, side: TILE.COBBLESTONE },
  },
  [BlockType.OAK_LOG]: {
    id: BlockType.OAK_LOG,
    name: 'Eman yog‘och',
    solid: true,
    transparent: false,
    hardness: 0.85,
    preferredTool: 'axe',
    dropItemId: 'oak_log',
    accentColor: '#855836',
    tiles: { top: TILE.OAK_LOG_TOP, bottom: TILE.OAK_LOG_TOP, side: TILE.OAK_LOG_SIDE },
  },
  [BlockType.OAK_LEAVES]: {
    id: BlockType.OAK_LEAVES,
    name: 'Barglar',
    solid: true,
    transparent: false,
    hardness: 0.25,
    preferredTool: 'axe',
    dropItemId: 'oak_leaves',
    accentColor: '#22c55e',
    tiles: { top: TILE.OAK_LEAVES, bottom: TILE.OAK_LEAVES, side: TILE.OAK_LEAVES },
  },
  [BlockType.SAND]: {
    id: BlockType.SAND,
    name: 'Qum',
    solid: true,
    transparent: false,
    hardness: 0.4,
    preferredTool: 'shovel',
    dropItemId: 'sand',
    accentColor: '#fde047',
    tiles: { top: TILE.SAND, bottom: TILE.SAND, side: TILE.SAND },
  },
  [BlockType.WATER]: {
    id: BlockType.WATER,
    name: 'Suv',
    solid: false,
    transparent: true,
    isWater: true,
    hardness: 0,
    preferredTool: 'none',
    accentColor: '#0ea5e9',
    tiles: { top: TILE.WATER, bottom: TILE.WATER, side: TILE.WATER },
  },
  [BlockType.GLASS]: {
    id: BlockType.GLASS,
    name: 'Kristal shisha',
    solid: true,
    transparent: true,
    hardness: 0.35,
    preferredTool: 'pickaxe',
    dropItemId: 'glass',
    accentColor: '#bae6fd',
    tiles: { top: TILE.GLASS, bottom: TILE.GLASS, side: TILE.GLASS },
  },
  [BlockType.NEON_BLUE]: {
    id: BlockType.NEON_BLUE,
    name: 'Ko‘k Neon Yadro',
    solid: true,
    transparent: false,
    emissive: true,
    hardness: 1.4,
    preferredTool: 'pickaxe',
    minPickTier: 2,
    dropItemId: 'neon_blue',
    accentColor: '#38bdf8',
    tiles: { top: TILE.NEON_BLUE, bottom: TILE.NEON_BLUE, side: TILE.NEON_BLUE },
  },
  [BlockType.GOLD_ORE]: {
    id: BlockType.GOLD_ORE,
    name: 'Oltin rudasi',
    solid: true,
    transparent: false,
    hardness: 2.4,
    preferredTool: 'pickaxe',
    minPickTier: 3,
    dropItemId: 'raw_gold',
    accentColor: '#facc15',
    tiles: { top: TILE.GOLD_ORE, bottom: TILE.GOLD_ORE, side: TILE.GOLD_ORE },
  },
  [BlockType.SNOW]: {
    id: BlockType.SNOW,
    name: 'Qor bloki',
    solid: true,
    transparent: false,
    hardness: 0.3,
    preferredTool: 'shovel',
    dropItemId: 'snow',
    accentColor: '#f1f5f9',
    tiles: { top: TILE.SNOW, bottom: TILE.SNOW, side: TILE.SNOW },
  },
  [BlockType.BRICK]: {
    id: BlockType.BRICK,
    name: 'Qizil g‘isht',
    solid: true,
    transparent: false,
    hardness: 1.6,
    preferredTool: 'pickaxe',
    minPickTier: 1,
    dropItemId: 'brick',
    accentColor: '#ef4444',
    tiles: { top: TILE.BRICK, bottom: TILE.BRICK, side: TILE.BRICK },
  },
  [BlockType.PLANK]: {
    id: BlockType.PLANK,
    name: 'Eman taxta',
    solid: true,
    transparent: false,
    hardness: 0.75,
    preferredTool: 'axe',
    dropItemId: 'plank',
    accentColor: '#d97706',
    tiles: { top: TILE.PLANK, bottom: TILE.PLANK, side: TILE.PLANK },
  },
  [BlockType.CRAFTING_TABLE]: {
    id: BlockType.CRAFTING_TABLE,
    name: 'Verstak',
    solid: true,
    transparent: false,
    hardness: 0.8,
    preferredTool: 'axe',
    dropItemId: 'crafting_table',
    accentColor: '#b45309',
    tiles: { top: TILE.CRAFTING_TOP, bottom: TILE.PLANK, side: TILE.CRAFTING_SIDE },
  },
  [BlockType.FURNACE]: {
    id: BlockType.FURNACE,
    name: 'Pech',
    solid: true,
    transparent: false,
    emissive: true,
    hardness: 1.8,
    preferredTool: 'pickaxe',
    minPickTier: 1,
    dropItemId: 'furnace',
    accentColor: '#fb923c',
    tiles: {
      top: TILE.FURNACE_SIDE,
      bottom: TILE.FURNACE_SIDE,
      side: TILE.FURNACE_SIDE,
      front: TILE.FURNACE_FRONT,
    },
  },
  [BlockType.COAL_ORE]: {
    id: BlockType.COAL_ORE,
    name: 'Ko‘mir rudasi',
    solid: true,
    transparent: false,
    hardness: 1.7,
    preferredTool: 'pickaxe',
    minPickTier: 1,
    dropItemId: 'coal',
    accentColor: '#334155',
    tiles: { top: TILE.COAL_ORE, bottom: TILE.COAL_ORE, side: TILE.COAL_ORE },
  },
  [BlockType.IRON_ORE]: {
    id: BlockType.IRON_ORE,
    name: 'Temir rudasi',
    solid: true,
    transparent: false,
    hardness: 2.1,
    preferredTool: 'pickaxe',
    minPickTier: 2,
    dropItemId: 'raw_iron',
    accentColor: '#d6b49c',
    tiles: { top: TILE.IRON_ORE, bottom: TILE.IRON_ORE, side: TILE.IRON_ORE },
  },
  [BlockType.DIAMOND_ORE]: {
    id: BlockType.DIAMOND_ORE,
    name: 'Olmos rudasi',
    solid: true,
    transparent: false,
    emissive: true,
    hardness: 2.8,
    preferredTool: 'pickaxe',
    minPickTier: 3,
    dropItemId: 'diamond',
    accentColor: '#22d3ee',
    tiles: { top: TILE.DIAMOND_ORE, bottom: TILE.DIAMOND_ORE, side: TILE.DIAMOND_ORE },
  },
  [BlockType.NEON_CRYSTAL_ORE]: {
    id: BlockType.NEON_CRYSTAL_ORE,
    name: 'Neon kristall rudasi',
    solid: true,
    transparent: false,
    emissive: true,
    hardness: 2.6,
    preferredTool: 'pickaxe',
    minPickTier: 3,
    dropItemId: 'neon_crystal',
    accentColor: '#38bdf8',
    tiles: { top: TILE.NEON_CRYSTAL_ORE, bottom: TILE.NEON_CRYSTAL_ORE, side: TILE.NEON_CRYSTAL_ORE },
  },
  [BlockType.TORCH]: {
    id: BlockType.TORCH,
    name: 'Neon chiroq',
    solid: true,
    transparent: false,
    emissive: true,
    hardness: 0.25,
    preferredTool: 'none',
    dropItemId: 'torch',
    accentColor: '#7dd3fc',
    tiles: { top: TILE.TORCH, bottom: TILE.OAK_LOG_TOP, side: TILE.TORCH },
  },
};

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  grass: { id: 'grass', name: 'Maysa bloki', category: 'block', blockType: BlockType.GRASS, maxStack: 64, accentColor: '#4ade80' },
  dirt: { id: 'dirt', name: 'Tuproq', category: 'block', blockType: BlockType.DIRT, maxStack: 64, accentColor: '#9a6b44' },
  stone: { id: 'stone', name: 'Tosh', category: 'block', blockType: BlockType.STONE, maxStack: 64, accentColor: '#94a3b8' },
  cobblestone: { id: 'cobblestone', name: 'Toshg‘isht', category: 'block', blockType: BlockType.COBBLESTONE, maxStack: 64, accentColor: '#64748b' },
  oak_log: { id: 'oak_log', name: 'Eman yog‘och', category: 'block', blockType: BlockType.OAK_LOG, maxStack: 64, accentColor: '#855836' },
  oak_leaves: { id: 'oak_leaves', name: 'Barglar', category: 'block', blockType: BlockType.OAK_LEAVES, maxStack: 64, accentColor: '#22c55e' },
  sand: { id: 'sand', name: 'Qum', category: 'block', blockType: BlockType.SAND, maxStack: 64, accentColor: '#fde047' },
  glass: { id: 'glass', name: 'Kristal shisha', category: 'block', blockType: BlockType.GLASS, maxStack: 64, accentColor: '#bae6fd' },
  neon_blue: { id: 'neon_blue', name: 'Ko‘k Neon Yadro', category: 'block', blockType: BlockType.NEON_BLUE, maxStack: 64, accentColor: '#38bdf8' },
  gold_ore: { id: 'gold_ore', name: 'Oltin rudasi', category: 'block', blockType: BlockType.GOLD_ORE, maxStack: 64, accentColor: '#facc15' },
  snow: { id: 'snow', name: 'Qor bloki', category: 'block', blockType: BlockType.SNOW, maxStack: 64, accentColor: '#f1f5f9' },
  brick: { id: 'brick', name: 'Qizil g‘isht', category: 'block', blockType: BlockType.BRICK, maxStack: 64, accentColor: '#ef4444' },
  plank: { id: 'plank', name: 'Eman taxta', category: 'block', blockType: BlockType.PLANK, maxStack: 64, accentColor: '#d97706' },
  crafting_table: { id: 'crafting_table', name: 'Verstak', category: 'block', blockType: BlockType.CRAFTING_TABLE, maxStack: 64, accentColor: '#b45309' },
  furnace: { id: 'furnace', name: 'Pech', category: 'block', blockType: BlockType.FURNACE, maxStack: 64, accentColor: '#fb923c' },
  coal_ore: { id: 'coal_ore', name: 'Ko‘mir rudasi', category: 'block', blockType: BlockType.COAL_ORE, maxStack: 64, accentColor: '#334155' },
  iron_ore: { id: 'iron_ore', name: 'Temir rudasi', category: 'block', blockType: BlockType.IRON_ORE, maxStack: 64, accentColor: '#d6b49c' },
  diamond_ore: { id: 'diamond_ore', name: 'Olmos rudasi', category: 'block', blockType: BlockType.DIAMOND_ORE, maxStack: 64, accentColor: '#22d3ee' },
  neon_crystal_ore: { id: 'neon_crystal_ore', name: 'Neon kristall rudasi', category: 'block', blockType: BlockType.NEON_CRYSTAL_ORE, maxStack: 64, accentColor: '#38bdf8' },
  torch: { id: 'torch', name: 'Neon chiroq', category: 'block', blockType: BlockType.TORCH, maxStack: 64, accentColor: '#7dd3fc' },

  // Resources
  stick: { id: 'stick', name: 'Tayoqcha', category: 'resource', maxStack: 64, accentColor: '#a16207' },
  coal: { id: 'coal', name: 'Ko‘mir', category: 'resource', maxStack: 64, accentColor: '#1e293b' },
  raw_iron: { id: 'raw_iron', name: 'Xom temir', category: 'resource', maxStack: 64, accentColor: '#d6b49c' },
  iron_ingot: { id: 'iron_ingot', name: 'Temir quyma', category: 'resource', maxStack: 64, accentColor: '#e2e8f0' },
  raw_gold: { id: 'raw_gold', name: 'Xom oltin', category: 'resource', maxStack: 64, accentColor: '#facc15' },
  gold_ingot: { id: 'gold_ingot', name: 'Oltin quyma', category: 'resource', maxStack: 64, accentColor: '#fde047' },
  diamond: { id: 'diamond', name: 'Olmos', category: 'resource', maxStack: 64, accentColor: '#22d3ee' },
  neon_crystal: { id: 'neon_crystal', name: 'Neon kristali', category: 'resource', maxStack: 64, accentColor: '#38bdf8' },
  neon_shard: { id: 'neon_shard', name: 'Neon zarrasi', category: 'resource', maxStack: 64, accentColor: '#60a5fa' },

  // Food
  apple: { id: 'apple', name: 'Olma', category: 'food', maxStack: 64, hungerRestore: 5, healthRestore: 2, accentColor: '#ef4444' },
  raw_meat: { id: 'raw_meat', name: 'Xom go‘sht', category: 'food', maxStack: 64, hungerRestore: 3, healthRestore: 0, accentColor: '#f87171' },
  cooked_meat: { id: 'cooked_meat', name: 'Pishgan go‘sht', category: 'food', maxStack: 64, hungerRestore: 9, healthRestore: 4, accentColor: '#b45309' },

  // Swords
  wood_sword: { id: 'wood_sword', name: 'Yog‘och qilich', category: 'weapon', maxStack: 1, toolKind: 'sword', toolTier: 1, attackDamage: 5, accentColor: '#b45309' },
  stone_sword: { id: 'stone_sword', name: 'Tosh qilich', category: 'weapon', maxStack: 1, toolKind: 'sword', toolTier: 2, attackDamage: 7, accentColor: '#94a3b8' },
  iron_sword: { id: 'iron_sword', name: 'Temir qilich', category: 'weapon', maxStack: 1, toolKind: 'sword', toolTier: 3, attackDamage: 10, accentColor: '#e2e8f0' },
  gold_sword: { id: 'gold_sword', name: 'Oltin qilich', category: 'weapon', maxStack: 1, toolKind: 'sword', toolTier: 3, attackDamage: 8, accentColor: '#fde047' },
  diamond_sword: { id: 'diamond_sword', name: 'Olmos qilich', category: 'weapon', maxStack: 1, toolKind: 'sword', toolTier: 4, attackDamage: 14, accentColor: '#22d3ee' },
  neon_sword: { id: 'neon_sword', name: 'Ko‘k Neon Qilich', category: 'weapon', maxStack: 1, toolKind: 'sword', toolTier: 5, attackDamage: 18, accentColor: '#38bdf8' },

  // Pickaxes
  wood_pickaxe: { id: 'wood_pickaxe', name: 'Yog‘och kirka', category: 'tool', maxStack: 1, toolKind: 'pickaxe', toolTier: 1, miningMultiplier: 2.2, attackDamage: 2, accentColor: '#b45309' },
  stone_pickaxe: { id: 'stone_pickaxe', name: 'Tosh kirka', category: 'tool', maxStack: 1, toolKind: 'pickaxe', toolTier: 2, miningMultiplier: 3.4, attackDamage: 3, accentColor: '#94a3b8' },
  iron_pickaxe: { id: 'iron_pickaxe', name: 'Temir kirka', category: 'tool', maxStack: 1, toolKind: 'pickaxe', toolTier: 3, miningMultiplier: 4.8, attackDamage: 4, accentColor: '#e2e8f0' },
  diamond_pickaxe: { id: 'diamond_pickaxe', name: 'Olmos kirka', category: 'tool', maxStack: 1, toolKind: 'pickaxe', toolTier: 4, miningMultiplier: 6.5, attackDamage: 5, accentColor: '#22d3ee' },
  neon_pickaxe: { id: 'neon_pickaxe', name: 'Neon kirka', category: 'tool', maxStack: 1, toolKind: 'pickaxe', toolTier: 5, miningMultiplier: 8.5, attackDamage: 6, accentColor: '#38bdf8' },

  // Axes
  wood_axe: { id: 'wood_axe', name: 'Yog‘och bolta', category: 'tool', maxStack: 1, toolKind: 'axe', toolTier: 1, miningMultiplier: 2.4, attackDamage: 4, accentColor: '#b45309' },
  stone_axe: { id: 'stone_axe', name: 'Tosh bolta', category: 'tool', maxStack: 1, toolKind: 'axe', toolTier: 2, miningMultiplier: 3.6, attackDamage: 5, accentColor: '#94a3b8' },
  iron_axe: { id: 'iron_axe', name: 'Temir bolta', category: 'tool', maxStack: 1, toolKind: 'axe', toolTier: 3, miningMultiplier: 5.0, attackDamage: 7, accentColor: '#e2e8f0' },
  diamond_axe: { id: 'diamond_axe', name: 'Olmos bolta', category: 'tool', maxStack: 1, toolKind: 'axe', toolTier: 4, miningMultiplier: 6.8, attackDamage: 9, accentColor: '#22d3ee' },

  // Shovels
  wood_shovel: { id: 'wood_shovel', name: 'Yog‘och belkurak', category: 'tool', maxStack: 1, toolKind: 'shovel', toolTier: 1, miningMultiplier: 2.5, attackDamage: 2, accentColor: '#b45309' },
  stone_shovel: { id: 'stone_shovel', name: 'Tosh belkurak', category: 'tool', maxStack: 1, toolKind: 'shovel', toolTier: 2, miningMultiplier: 3.8, attackDamage: 3, accentColor: '#94a3b8' },
  iron_shovel: { id: 'iron_shovel', name: 'Temir belkurak', category: 'tool', maxStack: 1, toolKind: 'shovel', toolTier: 3, miningMultiplier: 5.2, attackDamage: 4, accentColor: '#e2e8f0' },
};

export const ALL_CREATIVE_ITEMS: ItemId[] = [
  'grass',
  'dirt',
  'stone',
  'cobblestone',
  'plank',
  'oak_log',
  'oak_leaves',
  'sand',
  'glass',
  'crafting_table',
  'furnace',
  'torch',
  'neon_blue',
  'brick',
  'coal_ore',
  'iron_ore',
  'gold_ore',
  'diamond_ore',
  'neon_crystal_ore',
  'snow',
  'neon_sword',
  'diamond_sword',
  'iron_sword',
  'neon_pickaxe',
  'diamond_pickaxe',
  'iron_pickaxe',
  'diamond_axe',
  'iron_shovel',
  'cooked_meat',
  'apple',
];

export interface InventorySlot {
  itemId: ItemId;
  count: number;
}

export type CraftingStationType = 'pocket' | 'crafting' | 'furnace';

export type GamePhase = 'menu' | 'playing' | 'paused';
export type GameMode = 'survival' | 'creative';
export type CameraMode = 'first-person' | 'third-person';
export type BiomePreset = 'emerald-valley' | 'neon-archipelago' | 'alpine-peaks';

export interface GameSettings {
  fov: number;
  sensitivity: number;
  renderDistance: number;
  shadows: boolean;
  soundEnabled: boolean;
  timeOfDay: number; // 0..24
}

export interface PlayerHudState {
  x: number;
  y: number;
  z: number;
  isFlying: boolean;
  isGrounded: boolean;
  isSprinting: boolean;
  isInWater: boolean;
  cameraMode: CameraMode;
  gameMode: GameMode;
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  isDead: boolean;
  miningProgress: number;
  miningHint: string | null;
  targetBlockName: string | null;
  targetBlockType: BlockType | null;
  targetCoords: [number, number, number] | null;
  targetMobName: string | null;
  targetMobHp: number;
  targetMobMaxHp: number;
  pointerLocked: boolean;
  blocksPlaced: number;
  blocksBroken: number;
}

export interface RemotePlayerState {
  playerId: string;
  nickname: string;
  friendCode: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  isFlying: boolean;
  isGrounded: boolean;
  isSprinting: boolean;
  selectedBlock: BlockType;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface ServerRoomSummary {
  code: string;
  name: string;
  preset: BiomePreset;
  seed: string;
  gameMode: GameMode;
  isPublic: boolean;
  hostId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  createdAt: number;
}

export interface RoomInitPayload {
  room: ServerRoomSummary;
  edits: Array<[string, number]>;
  players: RemotePlayerState[];
  chat: ChatMessage[];
}

export interface FriendEntry {
  playerId: string;
  nickname: string;
  friendCode: string;
  online: boolean;
  currentRoomCode: string | null;
  currentRoomName: string | null;
}

export interface FriendRequestEntry {
  id: string;
  fromId: string;
  fromName: string;
  fromCode: string;
  toId: string;
  toName: string;
  toCode: string;
  createdAt: number;
}

export interface ServerInviteEntry {
  id: string;
  fromName: string;
  roomCode: string;
  roomName: string;
  createdAt: number;
}

export interface SocialStatePayload {
  friends: FriendEntry[];
  incomingRequests: FriendRequestEntry[];
  outgoingRequests: FriendRequestEntry[];
}

export interface OnlinePlayerEntry {
  playerId: string;
  nickname: string;
  friendCode: string;
  roomCode: string | null;
  roomName: string | null;
}
