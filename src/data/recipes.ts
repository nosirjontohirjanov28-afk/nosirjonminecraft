import type { ItemId } from '../types/game';

export interface CraftingRecipe {
  id: string;
  result: ItemId;
  count: number;
  /** Row strings using single-char keys mapped in `keys`, or shapeless `ingredients` */
  pattern?: string[];
  keys?: Record<string, ItemId>;
  /** Shapeless ingredients list (e.g. 1x oak_log -> 4x plank) */
  shapeless?: ItemId[];
  requiresTable: boolean; // false = works in 2x2 pocket AND 3x3 table; true = 3x3 Verstak required
  categoryLabel: string;
}

export interface SmeltingRecipe {
  id: string;
  input: ItemId;
  output: ItemId;
  outputCount: number;
  label: string;
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  // Basic Materials (2x2 pocket)
  {
    id: 'plank_from_log',
    result: 'plank',
    count: 4,
    shapeless: ['oak_log'],
    requiresTable: false,
    categoryLabel: 'Asosiy',
  },
  {
    id: 'stick_from_plank',
    result: 'stick',
    count: 4,
    pattern: ['P', 'P'],
    keys: { P: 'plank' },
    requiresTable: false,
    categoryLabel: 'Asosiy',
  },
  {
    id: 'crafting_table',
    result: 'crafting_table',
    count: 1,
    pattern: ['PP', 'PP'],
    keys: { P: 'plank' },
    requiresTable: false,
    categoryLabel: 'Stansiya',
  },
  {
    id: 'torch_from_coal',
    result: 'torch',
    count: 4,
    pattern: ['C', 'S'],
    keys: { C: 'coal', S: 'stick' },
    requiresTable: false,
    categoryLabel: 'Yoritish',
  },

  // Stations & Blocks (3x3 Verstak)
  {
    id: 'furnace_from_cobble',
    result: 'furnace',
    count: 1,
    pattern: ['CCC', 'C C', 'CCC'],
    keys: { C: 'cobblestone' },
    requiresTable: true,
    categoryLabel: 'Stansiya',
  },
  {
    id: 'neon_blue_core',
    result: 'neon_blue',
    count: 2,
    pattern: ['NGN', 'GCG', 'NGN'],
    keys: { N: 'neon_crystal', G: 'glass', C: 'coal' },
    requiresTable: true,
    categoryLabel: 'Blok',
  },
  {
    id: 'neon_blue_shard_craft',
    result: 'neon_crystal',
    count: 1,
    pattern: ['SS', 'SS'],
    keys: { S: 'neon_shard' },
    requiresTable: false,
    categoryLabel: 'Resurs',
  },
  {
    id: 'brick_craft',
    result: 'brick',
    count: 4,
    pattern: ['DC', 'CD'],
    keys: { D: 'dirt', C: 'cobblestone' },
    requiresTable: false,
    categoryLabel: 'Blok',
  },

  // Swords (Qilichlar)
  {
    id: 'wood_sword',
    result: 'wood_sword',
    count: 1,
    pattern: ['M', 'M', 'S'],
    keys: { M: 'plank', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Qilich',
  },
  {
    id: 'stone_sword',
    result: 'stone_sword',
    count: 1,
    pattern: ['M', 'M', 'S'],
    keys: { M: 'cobblestone', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Qilich',
  },
  {
    id: 'iron_sword',
    result: 'iron_sword',
    count: 1,
    pattern: ['M', 'M', 'S'],
    keys: { M: 'iron_ingot', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Qilich',
  },
  {
    id: 'gold_sword',
    result: 'gold_sword',
    count: 1,
    pattern: ['M', 'M', 'S'],
    keys: { M: 'gold_ingot', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Qilich',
  },
  {
    id: 'diamond_sword',
    result: 'diamond_sword',
    count: 1,
    pattern: ['M', 'M', 'S'],
    keys: { M: 'diamond', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Qilich',
  },
  {
    id: 'neon_sword',
    result: 'neon_sword',
    count: 1,
    pattern: ['N', 'N', 'S'],
    keys: { N: 'neon_crystal', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Qilich',
  },

  // Pickaxes (Kirkalar)
  {
    id: 'wood_pickaxe',
    result: 'wood_pickaxe',
    count: 1,
    pattern: ['MMM', ' S ', ' S '],
    keys: { M: 'plank', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Kirka',
  },
  {
    id: 'stone_pickaxe',
    result: 'stone_pickaxe',
    count: 1,
    pattern: ['MMM', ' S ', ' S '],
    keys: { M: 'cobblestone', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Kirka',
  },
  {
    id: 'iron_pickaxe',
    result: 'iron_pickaxe',
    count: 1,
    pattern: ['MMM', ' S ', ' S '],
    keys: { M: 'iron_ingot', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Kirka',
  },
  {
    id: 'diamond_pickaxe',
    result: 'diamond_pickaxe',
    count: 1,
    pattern: ['MMM', ' S ', ' S '],
    keys: { M: 'diamond', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Kirka',
  },
  {
    id: 'neon_pickaxe',
    result: 'neon_pickaxe',
    count: 1,
    pattern: ['NNN', ' S ', ' S '],
    keys: { N: 'neon_crystal', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Kirka',
  },

  // Axes (Boltalar)
  {
    id: 'wood_axe',
    result: 'wood_axe',
    count: 1,
    pattern: ['MM', 'MS', ' S'],
    keys: { M: 'plank', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Bolta',
  },
  {
    id: 'stone_axe',
    result: 'stone_axe',
    count: 1,
    pattern: ['MM', 'MS', ' S'],
    keys: { M: 'cobblestone', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Bolta',
  },
  {
    id: 'iron_axe',
    result: 'iron_axe',
    count: 1,
    pattern: ['MM', 'MS', ' S'],
    keys: { M: 'iron_ingot', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Bolta',
  },
  {
    id: 'diamond_axe',
    result: 'diamond_axe',
    count: 1,
    pattern: ['MM', 'MS', ' S'],
    keys: { M: 'diamond', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Bolta',
  },

  // Shovels (Belkuraklar)
  {
    id: 'wood_shovel',
    result: 'wood_shovel',
    count: 1,
    pattern: ['M', 'S', 'S'],
    keys: { M: 'plank', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Belkurak',
  },
  {
    id: 'stone_shovel',
    result: 'stone_shovel',
    count: 1,
    pattern: ['M', 'S', 'S'],
    keys: { M: 'cobblestone', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Belkurak',
  },
  {
    id: 'iron_shovel',
    result: 'iron_shovel',
    count: 1,
    pattern: ['M', 'S', 'S'],
    keys: { M: 'iron_ingot', S: 'stick' },
    requiresTable: true,
    categoryLabel: 'Belkurak',
  },
];

export const SMELTING_RECIPES: SmeltingRecipe[] = [
  {
    id: 'smelt_iron',
    input: 'raw_iron',
    output: 'iron_ingot',
    outputCount: 1,
    label: 'Xom temir + Ko‘mir → Temir quyma',
  },
  {
    id: 'smelt_gold',
    input: 'raw_gold',
    output: 'gold_ingot',
    outputCount: 1,
    label: 'Xom oltin + Ko‘mir → Oltin quyma',
  },
  {
    id: 'smelt_glass',
    input: 'sand',
    output: 'glass',
    outputCount: 1,
    label: 'Qum + Ko‘mir → Kristal shisha',
  },
  {
    id: 'smelt_meat',
    input: 'raw_meat',
    output: 'cooked_meat',
    outputCount: 1,
    label: 'Xom go‘sht + Ko‘mir → Pishgan go‘sht',
  },
  {
    id: 'smelt_stone',
    input: 'cobblestone',
    output: 'stone',
    outputCount: 1,
    label: 'Toshg‘isht + Ko‘mir → Silliq tosh',
  },
  {
    id: 'smelt_charcoal',
    input: 'oak_log',
    output: 'coal',
    outputCount: 2,
    label: 'Eman yog‘och + Ko‘mir/Olov → 2x Ko‘mir',
  },
];

export function matchCraftingGrid(
  grid: Array<ItemId | null>,
  gridSize: 2 | 3,
): CraftingRecipe | null {
  const nonNullItems: ItemId[] = [];
  for (const item of grid) {
    if (item) nonNullItems.push(item);
  }
  if (nonNullItems.length === 0) return null;

  // Compute bounding box of non-null cells in grid
  let minR: number = gridSize;
  let maxR = -1;
  let minC: number = gridSize;
  let maxC = -1;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r * gridSize + c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  const boxH = maxR - minR + 1;
  const boxW = maxC - minC + 1;

  for (const recipe of CRAFTING_RECIPES) {
    if (gridSize === 2 && recipe.requiresTable) continue;

    if (recipe.shapeless) {
      if (recipe.shapeless.length !== nonNullItems.length) continue;
      const sortedA = [...recipe.shapeless].sort();
      const sortedB = [...nonNullItems].sort();
      if (sortedA.every((v, idx) => v === sortedB[idx])) {
        return recipe;
      }
      continue;
    }

    if (!recipe.pattern || !recipe.keys) continue;
    const patH = recipe.pattern.length;
    const patW = recipe.pattern[0].length;
    if (patH !== boxH || patW !== boxW) continue;

    // Check normal orientation and horizontal mirror (for axes!)
    const matches = (mirror: boolean): boolean => {
      for (let r = 0; r < patH; r++) {
        for (let c = 0; c < patW; c++) {
          const patChar = recipe.pattern![r][mirror ? patW - 1 - c : c];
          const expected: ItemId | null = patChar === ' ' ? null : recipe.keys![patChar] ?? null;
          const actual = grid[(minR + r) * gridSize + (minC + c)] ?? null;
          if (expected !== actual) return false;
        }
      }
      return true;
    };

    if (matches(false) || matches(true)) {
      return recipe;
    }
  }

  return null;
}

export function getRecipeIngredientCounts(recipe: CraftingRecipe): Array<{ itemId: ItemId; count: number }> {
  const counts = new Map<ItemId, number>();
  if (recipe.shapeless) {
    for (const id of recipe.shapeless) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  } else if (recipe.pattern && recipe.keys) {
    for (const row of recipe.pattern) {
      for (const ch of row) {
        if (ch === ' ') continue;
        const id = recipe.keys[ch];
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries()).map(([itemId, count]) => ({ itemId, count }));
}
