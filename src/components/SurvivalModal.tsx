import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Flame,
  Hammer,
  Package,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CRAFTING_RECIPES,
  CraftingRecipe,
  SMELTING_RECIPES,
  getRecipeIngredientCounts,
  matchCraftingGrid,
} from '../data/recipes';
import { soundEngine } from '../engine/audio';
import {
  CraftingStationType,
  ITEM_DEFINITIONS,
  InventorySlot,
  ItemId,
} from '../types/game';

interface SurvivalModalProps {
  open: boolean;
  station: CraftingStationType;
  inventory: Array<InventorySlot | null>; // 36 slots: 0..8 hotbar, 9..35 backpack
  itemThumbnails: Record<string, string>;
  onClose: () => void;
  onUpdateInventory: (next: Array<InventorySlot | null>) => void;
  onSelectStation: (station: CraftingStationType) => void;
}

const FUEL_POWER: Partial<Record<ItemId, number>> = {
  coal: 8,
  oak_log: 2,
  plank: 2,
};

export const SurvivalModal: React.FC<SurvivalModalProps> = ({
  open,
  station,
  inventory,
  itemThumbnails,
  onClose,
  onUpdateInventory,
  onSelectStation,
}) => {
  const [grid2, setGrid2] = useState<Array<InventorySlot | null>>([null, null, null, null]);
  const [grid3, setGrid3] = useState<Array<InventorySlot | null>>(Array(9).fill(null));
  const [selectedInvIdx, setSelectedInvIdx] = useState<number | null>(null);
  const [recipeFilter, setRecipeFilter] = useState<'all' | 'tools' | 'blocks'>('all');
  const [smeltInput, setSmeltInput] = useState<InventorySlot | null>(null);
  const [smeltFuel, setSmeltFuel] = useState<InventorySlot | null>(null);
  const [fuelCharges, setFuelCharges] = useState(0);

  const itemCounts = useMemo(() => {
    const counts = new Map<ItemId, number>();
    for (const slot of inventory) {
      if (slot && slot.count > 0) {
        counts.set(slot.itemId, (counts.get(slot.itemId) ?? 0) + slot.count);
      }
    }
    return counts;
  }, [inventory]);

  if (!open) return null;

  const isTable = station === 'crafting';
  const gridSize: 2 | 3 = isTable ? 3 : 2;
  const activeGrid = isTable ? grid3 : grid2;
  const setActiveGrid = isTable ? setGrid3 : setGrid2;

  const matchedRecipe = matchCraftingGrid(
    activeGrid.map((s) => (s ? s.itemId : null)),
    gridSize,
  );
  const maxCraftBatches = matchedRecipe
    ? Math.min(
        ...activeGrid.filter((s): s is InventorySlot => Boolean(s)).map((s) => s.count),
      )
    : 0;

  const addItemToList = (
    list: Array<InventorySlot | null>,
    itemId: ItemId,
    count: number,
  ): Array<InventorySlot | null> => {
    const next = list.map((s) => (s ? { ...s } : null));
    const maxStack = ITEM_DEFINITIONS[itemId].maxStack;
    let remaining = count;

    for (let i = 0; i < next.length && remaining > 0; i++) {
      const slot = next[i];
      if (slot && slot.itemId === itemId && slot.count < maxStack) {
        const add = Math.min(remaining, maxStack - slot.count);
        slot.count += add;
        remaining -= add;
      }
    }

    for (let i = 0; i < next.length && remaining > 0; i++) {
      if (!next[i]) {
        const add = Math.min(remaining, maxStack);
        next[i] = { itemId, count: add };
        remaining -= add;
      }
    }
    return next;
  };

  const removeUpToFromInventory = (
    list: Array<InventorySlot | null>,
    itemId: ItemId,
    maxAmount: number,
  ): { next: Array<InventorySlot | null>; taken: number } => {
    const next = list.map((s) => (s ? { ...s } : null));
    let need = maxAmount;
    for (let i = 0; i < next.length && need > 0; i++) {
      const slot = next[i];
      if (slot && slot.itemId === itemId) {
        const take = Math.min(need, slot.count);
        slot.count -= take;
        need -= take;
        if (slot.count <= 0) next[i] = null;
      }
    }
    return { next, taken: maxAmount - need };
  };

  const removeExactFromInventory = (
    list: Array<InventorySlot | null>,
    itemId: ItemId,
    amount: number,
  ): Array<InventorySlot | null> | null => {
    const { next, taken } = removeUpToFromInventory(list, itemId, amount);
    return taken === amount ? next : null;
  };

  const returnGridToInventory = (
    gridToClear: Array<InventorySlot | null>,
    setGridFn: React.Dispatch<React.SetStateAction<Array<InventorySlot | null>>>,
  ) => {
    let nextInv = inventory;
    for (const slot of gridToClear) {
      if (slot && slot.count > 0) {
        nextInv = addItemToList(nextInv, slot.itemId, slot.count);
      }
    }
    onUpdateInventory(nextInv);
    setGridFn(Array(gridToClear.length).fill(null));
  };

  const handleCloseModal = () => {
    let nextInv = inventory;
    for (const slot of grid2) {
      if (slot && slot.count > 0) nextInv = addItemToList(nextInv, slot.itemId, slot.count);
    }
    for (const slot of grid3) {
      if (slot && slot.count > 0) nextInv = addItemToList(nextInv, slot.itemId, slot.count);
    }
    if (smeltInput && smeltInput.count > 0) {
      nextInv = addItemToList(nextInv, smeltInput.itemId, smeltInput.count);
    }
    if (smeltFuel && smeltFuel.count > 0) {
      nextInv = addItemToList(nextInv, smeltFuel.itemId, smeltFuel.count);
    }

    setGrid2([null, null, null, null]);
    setGrid3(Array(9).fill(null));
    setSmeltInput(null);
    setSmeltFuel(null);
    setFuelCharges(0);
    setSelectedInvIdx(null);
    onUpdateInventory(nextInv);
    onClose();
  };

  const handleInventorySlotClick = (idx: number) => {
    soundEngine.playMenuClick();
    if (selectedInvIdx === null) {
      if (inventory[idx]) setSelectedInvIdx(idx);
      return;
    }

    if (selectedInvIdx === idx) {
      setSelectedInvIdx(null);
      return;
    }

    const next = inventory.map((s) => (s ? { ...s } : null));
    const source = next[selectedInvIdx];
    const target = next[idx];

    if (source && target && source.itemId === target.itemId) {
      const maxStack = ITEM_DEFINITIONS[source.itemId].maxStack;
      const move = Math.min(source.count, maxStack - target.count);
      target.count += move;
      source.count -= move;
      if (source.count <= 0) next[selectedInvIdx] = null;
    } else {
      next[selectedInvIdx] = target;
      next[idx] = source;
    }
    onUpdateInventory(next);
    setSelectedInvIdx(null);
  };

  const handleCraftCellClick = (cellIdx: number) => {
    soundEngine.playMenuClick();
    const existingSlot = activeGrid[cellIdx];

    if (selectedInvIdx !== null && inventory[selectedInvIdx]) {
      const picked = inventory[selectedInvIdx]!;
      if (existingSlot && existingSlot.itemId === picked.itemId) {
        const maxStack = ITEM_DEFINITIONS[picked.itemId].maxStack;
        if (existingSlot.count >= maxStack) return;
        const nextInv = removeExactFromInventory(inventory, picked.itemId, 1);
        if (!nextInv) return;
        const nextGrid = [...activeGrid];
        nextGrid[cellIdx] = { itemId: picked.itemId, count: existingSlot.count + 1 };
        setActiveGrid(nextGrid);
        onUpdateInventory(nextInv);
        if (!nextInv[selectedInvIdx]) setSelectedInvIdx(null);
        return;
      }

      let nextInv = removeExactFromInventory(inventory, picked.itemId, 1);
      if (!nextInv) return;
      if (existingSlot) {
        nextInv = addItemToList(nextInv, existingSlot.itemId, existingSlot.count);
      }
      const nextGrid = [...activeGrid];
      nextGrid[cellIdx] = { itemId: picked.itemId, count: 1 };
      setActiveGrid(nextGrid);
      onUpdateInventory(nextInv);
      if (!nextInv[selectedInvIdx]) setSelectedInvIdx(null);
      return;
    }

    if (existingSlot) {
      const nextInv = addItemToList(inventory, existingSlot.itemId, existingSlot.count);
      const nextGrid = [...activeGrid];
      nextGrid[cellIdx] = null;
      setActiveGrid(nextGrid);
      onUpdateInventory(nextInv);
    }
  };

  const handleCraftTakeResult = (craftAll = false) => {
    if (!matchedRecipe || maxCraftBatches <= 0) return;
    soundEngine.playBlockPlace();
    const batches = craftAll ? maxCraftBatches : 1;
    const nextInv = addItemToList(
      inventory,
      matchedRecipe.result,
      matchedRecipe.count * batches,
    );
    const nextGrid = activeGrid.map((slot) => {
      if (!slot) return null;
      const left = slot.count - batches;
      return left > 0 ? { itemId: slot.itemId, count: left } : null;
    });
    onUpdateInventory(nextInv);
    setActiveGrid(nextGrid);
  };

  const hasEnoughForRecipe = (recipe: CraftingRecipe): boolean => {
    const reqs = getRecipeIngredientCounts(recipe);
    return reqs.every((r) => (itemCounts.get(r.itemId) ?? 0) >= r.count);
  };

  const getMaxCraftableFromInventory = (recipe: CraftingRecipe): number => {
    const reqs = getRecipeIngredientCounts(recipe);
    if (reqs.length === 0) return 0;
    return Math.min(
      ...reqs.map((r) => Math.floor((itemCounts.get(r.itemId) ?? 0) / r.count)),
    );
  };

  const handleApplyRecipeToGrid = (recipe: CraftingRecipe, fillMax = false) => {
    if (recipe.requiresTable && !isTable) return;
    if (!hasEnoughForRecipe(recipe)) return;
    soundEngine.playMenuClick();

    // First return any items currently on the active grid
    let nextInv = inventory;
    for (const slot of activeGrid) {
      if (slot && slot.count > 0) {
        nextInv = addItemToList(nextInv, slot.itemId, slot.count);
      }
    }

    // Recompute counts after returning grid items
    const availCounts = new Map<ItemId, number>();
    for (const slot of nextInv) {
      if (slot && slot.count > 0) {
        availCounts.set(slot.itemId, (availCounts.get(slot.itemId) ?? 0) + slot.count);
      }
    }
    const reqs = getRecipeIngredientCounts(recipe);
    const possibleBatches = Math.min(
      ...reqs.map((r) => Math.floor((availCounts.get(r.itemId) ?? 0) / r.count)),
    );
    const batches = fillMax ? Math.min(64, Math.max(1, possibleBatches)) : 1;

    const newGrid: Array<InventorySlot | null> = Array(gridSize * gridSize).fill(null);
    if (recipe.shapeless) {
      recipe.shapeless.forEach((id, idx) => {
        if (idx < newGrid.length) {
          const maxAmt = Math.min(batches, ITEM_DEFINITIONS[id].maxStack);
          newGrid[idx] = { itemId: id, count: maxAmt };
          const updated = removeExactFromInventory(nextInv, id, maxAmt);
          if (updated) nextInv = updated;
        }
      });
    } else if (recipe.pattern && recipe.keys) {
      for (let r = 0; r < recipe.pattern.length; r++) {
        for (let c = 0; c < recipe.pattern[r].length; c++) {
          const ch = recipe.pattern[r][c];
          if (ch === ' ') continue;
          const itemId = recipe.keys[ch];
          if (itemId) {
            const maxAmt = Math.min(batches, ITEM_DEFINITIONS[itemId].maxStack);
            newGrid[r * gridSize + c] = { itemId, count: maxAmt };
            const updated = removeExactFromInventory(nextInv, itemId, maxAmt);
            if (updated) nextInv = updated;
          }
        }
      }
    }

    setActiveGrid(newGrid);
    onUpdateInventory(nextInv);
    setSelectedInvIdx(null);
  };

  // --- FURNACE LOGIC ---
  const matchedSmelt = smeltInput
    ? SMELTING_RECIPES.find((s) => s.input === smeltInput.itemId) ?? null
    : null;
  const fuelPowerPerUnit = smeltFuel ? FUEL_POWER[smeltFuel.itemId] ?? 0 : 0;
  const totalFuelPower = fuelCharges + (smeltFuel ? smeltFuel.count * fuelPowerPerUnit : 0);
  const maxSmeltableCount =
    matchedSmelt && smeltInput ? Math.min(smeltInput.count, totalFuelPower) : 0;

  const placeAllOfItemIntoFurnace = (slotRole: 'input' | 'fuel', itemId: ItemId) => {
    let nextInv = inventory;
    const current = slotRole === 'input' ? smeltInput : smeltFuel;
    const maxStack = ITEM_DEFINITIONS[itemId].maxStack;

    if (current && current.itemId !== itemId) {
      nextInv = addItemToList(nextInv, current.itemId, current.count);
    }

    const alreadyInSlot = current && current.itemId === itemId ? current.count : 0;
    const roomLeft = Math.max(0, maxStack - alreadyInSlot);
    if (roomLeft === 0) return;

    const { next, taken } = removeUpToFromInventory(nextInv, itemId, roomLeft);
    if (taken === 0) return;

    const updatedSlot: InventorySlot = { itemId, count: alreadyInSlot + taken };
    if (slotRole === 'input') setSmeltInput(updatedSlot);
    else setSmeltFuel(updatedSlot);

    onUpdateInventory(next);
    setSelectedInvIdx(null);
  };

  const handleSmeltAssign = (slotRole: 'input' | 'fuel') => {
    soundEngine.playMenuClick();
    if (selectedInvIdx !== null && inventory[selectedInvIdx]) {
      const picked = inventory[selectedInvIdx]!;
      if (slotRole === 'fuel' && !FUEL_POWER[picked.itemId]) {
        return;
      }
      if (slotRole === 'input' && !SMELTING_RECIPES.some((r) => r.input === picked.itemId)) {
        return;
      }
      // Place ALL of that item you have (e.g. hamma temir nechta bo'lsa o'shanchasi!)
      placeAllOfItemIntoFurnace(slotRole, picked.itemId);
      return;
    }

    const cur = slotRole === 'input' ? smeltInput : smeltFuel;
    if (cur) {
      onUpdateInventory(addItemToList(inventory, cur.itemId, cur.count));
      if (slotRole === 'input') setSmeltInput(null);
      else setSmeltFuel(null);
    }
  };

  const handleExecuteSmelt = (smeltAll: boolean) => {
    if (!matchedSmelt || !smeltInput || maxSmeltableCount <= 0) return;
    soundEngine.playBlockPlace();

    const batch = smeltAll ? maxSmeltableCount : 1;

    // Deduct fuel power
    let nextCharges = fuelCharges;
    let nextFuelSlot = smeltFuel ? { ...smeltFuel } : null;
    if (batch <= nextCharges) {
      nextCharges -= batch;
    } else if (nextFuelSlot && fuelPowerPerUnit > 0) {
      const needed = batch - nextCharges;
      const fuelUsed = Math.ceil(needed / fuelPowerPerUnit);
      nextCharges = fuelUsed * fuelPowerPerUnit - needed;
      nextFuelSlot.count -= fuelUsed;
      if (nextFuelSlot.count <= 0) nextFuelSlot = null;
    }

    const remainingInput = smeltInput.count - batch;
    setSmeltInput(remainingInput > 0 ? { itemId: smeltInput.itemId, count: remainingInput } : null);
    setSmeltFuel(nextFuelSlot);
    setFuelCharges(nextCharges);

    onUpdateInventory(
      addItemToList(inventory, matchedSmelt.output, matchedSmelt.outputCount * batch),
    );
  };

  // Detect any smeltable ores/items & fuel currently in inventory for 1-click "Hammasini qo'yish"
  const availableSmeltables = SMELTING_RECIPES.filter(
    (sr) => (itemCounts.get(sr.input) ?? 0) > 0,
  );
  const availableFuels = (['coal', 'oak_log', 'plank'] as ItemId[]).filter(
    (fid) => (itemCounts.get(fid) ?? 0) > 0,
  );

  const filteredRecipes = CRAFTING_RECIPES.filter((r) => {
    if (recipeFilter === 'tools') {
      return ['Qilich', 'Kirka', 'Bolta', 'Belkurak'].includes(r.categoryLabel);
    }
    if (recipeFilter === 'blocks') {
      return ['Asosiy', 'Stansiya', 'Blok', 'Yoritish', 'Resurs'].includes(r.categoryLabel);
    }
    return true;
  });

  const renderSlotButton = (
    itemId: ItemId | null,
    count: number | null,
    active: boolean,
    onClick: () => void,
    subtitle?: string,
  ) => {
    const def = itemId ? ITEM_DEFINITIONS[itemId] : null;
    return (
      <button
        type="button"
        onClick={onClick}
        title={def ? `${def.name}${count ? ` (${count})` : ''}` : subtitle || 'Bo‘sh uyacha'}
        className={`relative w-12 h-12 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
          active
            ? 'bg-sky-500/30 border-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.5)]'
            : 'bg-[#040d21] border-sky-500/25 hover:border-sky-400/60'
        }`}
      >
        {itemId && itemThumbnails[itemId] ? (
          <img src={itemThumbnails[itemId]} alt={def?.name} className="w-8 h-8 object-contain" />
        ) : itemId && def ? (
          <div className="w-7 h-7 rounded" style={{ backgroundColor: def.accentColor }} />
        ) : subtitle ? (
          <span className="text-[9px] text-slate-500 text-center px-1 leading-tight">
            {subtitle}
          </span>
        ) : null}
        {count !== null && count > 1 && (
          <span className="absolute bottom-0.5 right-1 text-[10px] font-mono-tabular font-bold text-white bg-[#020817]/85 px-1 rounded">
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-5 bg-[#020817]/75 overflow-y-auto">
      <div className="neon-panel w-full max-w-5xl rounded-2xl p-4 sm:p-6 text-slate-100 my-auto">
        {/* Header + Station Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-sky-400/20">
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Survival Inventar, Verstak va Retseptlar
              </h2>
              <p className="text-xs text-slate-400">
                Buyumni tanlab katakka qo‘ying — Pechga bosilganda o‘sha turdagi hamma resurs birdan qo‘yiladi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuClick();
                if (station === 'crafting') returnGridToInventory(grid3, setGrid3);
                onSelectStation('pocket');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                station === 'pocket'
                  ? 'bg-sky-500/25 border-sky-400 text-white'
                  : 'bg-[#040d21] border-sky-500/25 text-slate-300'
              }`}
            >
              Cho‘ntak (2×2)
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuClick();
                if (station === 'pocket') returnGridToInventory(grid2, setGrid2);
                onSelectStation('crafting');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                station === 'crafting'
                  ? 'bg-sky-500/25 border-sky-400 text-white'
                  : 'bg-[#040d21] border-sky-500/25 text-slate-300'
              }`}
            >
              <Hammer className="w-3.5 h-3.5 text-sky-400" />
              Verstak (3×3)
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuClick();
                onSelectStation('furnace');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                station === 'furnace'
                  ? 'bg-sky-500/25 border-sky-400 text-white'
                  : 'bg-[#040d21] border-sky-500/25 text-slate-300'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Pech (Eritish)
            </button>
            <button
              type="button"
              onClick={handleCloseModal}
              className="p-2 rounded-lg bg-[#040d21] border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4">
          {/* LEFT: Crafting / Furnace + Inventory */}
          <div className="lg:col-span-7 space-y-4">
            {station !== 'furnace' ? (
              <div className="p-4 rounded-xl bg-[#040d21]/90 border border-sky-500/25">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-sky-300">
                    {isTable
                      ? 'Verstak (3×3) — Qilichlar, Kirkalar, Boltalar va Pech yasash'
                      : 'Cho‘ntak kraft (2×2) — Taxta, Tayoqcha va Verstak yasash'}
                  </span>
                  {activeGrid.some(Boolean) && (
                    <button
                      type="button"
                      onClick={() => returnGridToInventory(activeGrid, setActiveGrid)}
                      className="text-[11px] text-sky-300 hover:text-white cursor-pointer"
                    >
                      Tozalash
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className={`grid gap-1.5 ${isTable ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {activeGrid.map((cellSlot, idx) => (
                      <React.Fragment key={idx}>
                        {renderSlotButton(
                          cellSlot ? cellSlot.itemId : null,
                          cellSlot ? cellSlot.count : null,
                          false,
                          () => handleCraftCellClick(idx),
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  <ArrowRight className="w-5 h-5 text-sky-400 shrink-0" />

                  <div className="flex items-center gap-3">
                    {renderSlotButton(
                      matchedRecipe ? matchedRecipe.result : null,
                      matchedRecipe ? matchedRecipe.count * maxCraftBatches : null,
                      Boolean(matchedRecipe),
                      () => handleCraftTakeResult(false),
                      'Natija',
                    )}
                    {matchedRecipe && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-bold text-white">
                          {ITEM_DEFINITIONS[matchedRecipe.result].name}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCraftTakeResult(false)}
                            className="px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-[11px] font-bold text-white cursor-pointer"
                          >
                            Tayyorlash (+{matchedRecipe.count})
                          </button>
                          {maxCraftBatches > 1 && (
                            <button
                              type="button"
                              onClick={() => handleCraftTakeResult(true)}
                              className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[11px] font-bold text-slate-950 cursor-pointer"
                            >
                              Hammasini (+{matchedRecipe.count * maxCraftBatches})
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#040d21]/90 border border-sky-500/25 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-300">
                    Pech — Nechta ruda/temir bo‘lsa hammasini birdan qo‘ying va eriting
                  </span>
                  {fuelCharges > 0 && (
                    <span className="text-[11px] font-mono-tabular text-amber-200 bg-amber-500/15 border border-amber-400/40 px-2 py-0.5 rounded">
                      Olov quvvati: {fuelCharges} ta
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-col items-center gap-1.5">
                    {renderSlotButton(
                      smeltInput ? smeltInput.itemId : null,
                      smeltInput ? smeltInput.count : null,
                      Boolean(smeltInput),
                      () => handleSmeltAssign('input'),
                      'Temir / Ruda',
                    )}
                    <span className="text-[10px] text-slate-400">
                      Xomashyo {smeltInput ? `(${smeltInput.count})` : ''}
                    </span>
                  </div>

                  <span className="text-slate-400 font-bold">+</span>

                  <div className="flex flex-col items-center gap-1.5">
                    {renderSlotButton(
                      smeltFuel ? smeltFuel.itemId : null,
                      smeltFuel ? smeltFuel.count : null,
                      Boolean(smeltFuel),
                      () => handleSmeltAssign('fuel'),
                      'Ko‘mir / Yog‘och',
                    )}
                    <span className="text-[10px] text-slate-400">
                      Yoqilg‘i {smeltFuel ? `(${smeltFuel.count})` : ''}
                    </span>
                  </div>

                  <ArrowRight className="w-5 h-5 text-amber-400" />

                  <div className="flex items-center gap-3">
                    {renderSlotButton(
                      matchedSmelt && maxSmeltableCount > 0 ? matchedSmelt.output : null,
                      matchedSmelt && maxSmeltableCount > 0
                        ? matchedSmelt.outputCount * maxSmeltableCount
                        : null,
                      Boolean(matchedSmelt && maxSmeltableCount > 0),
                      () => handleExecuteSmelt(false),
                      'Tayyor',
                    )}
                    {matchedSmelt && maxSmeltableCount > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleExecuteSmelt(false)}
                          className="px-3 py-1 rounded-lg bg-amber-500/85 hover:bg-amber-400 text-[11px] font-bold text-slate-950 cursor-pointer"
                        >
                          1 ta eritish (+{matchedSmelt.outputCount})
                        </button>
                        {maxSmeltableCount > 1 && (
                          <button
                            type="button"
                            onClick={() => handleExecuteSmelt(true)}
                            className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[11px] font-bold text-slate-950 cursor-pointer"
                          >
                            Hammasini eritish (+{matchedSmelt.outputCount * maxSmeltableCount})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick 1-click "Hammasini qo'yish" buttons for Iron / Ores & Fuel */}
                {(availableSmeltables.length > 0 || availableFuels.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-sky-500/15">
                    {availableSmeltables.map((sr) => {
                      const cnt = itemCounts.get(sr.input) ?? 0;
                      return (
                        <button
                          key={sr.id}
                          type="button"
                          onClick={() => {
                            soundEngine.playMenuClick();
                            placeAllOfItemIntoFurnace('input', sr.input);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-400/40 hover:bg-sky-500/30 text-[11px] font-semibold text-sky-100 cursor-pointer"
                        >
                          Hammasini qo‘yish: {ITEM_DEFINITIONS[sr.input].name} ({cnt})
                        </button>
                      );
                    })}
                    {availableFuels.map((fid) => {
                      const cnt = itemCounts.get(fid) ?? 0;
                      return (
                        <button
                          key={fid}
                          type="button"
                          onClick={() => {
                            soundEngine.playMenuClick();
                            placeAllOfItemIntoFurnace('fuel', fid);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/40 hover:bg-amber-500/30 text-[11px] font-semibold text-amber-100 cursor-pointer"
                        >
                          Yoqilg‘i: {ITEM_DEFINITIONS[fid].name} ({cnt})
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-2 border-t border-sky-500/15">
                  {SMELTING_RECIPES.map((sr) => (
                    <div key={sr.id} className="text-[11px] text-slate-300">
                      · {sr.label}
                    </div>
                  ))}
                  <div className="text-[11px] text-amber-300/90 sm:col-span-2">
                    Yoqilg‘i quvvati: 1× Ko‘mir = 8 ta eritadi · 1× Yog‘och / Taxta = 2 ta eritadi
                  </div>
                </div>
              </div>
            )}

            {/* Backpack + Hotbar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-sky-300">
                  Mening Inventarim (Sumka + Tezkor panel 1–9)
                </span>
                {selectedInvIdx !== null && inventory[selectedInvIdx] && (
                  <span className="text-[11px] text-sky-200 font-medium">
                    Tanlangan: {ITEM_DEFINITIONS[inventory[selectedInvIdx]!.itemId].name} (
                    {inventory[selectedInvIdx]!.count})
                  </span>
                )}
              </div>

              <div className="grid grid-cols-9 gap-1.5">
                {inventory.slice(9, 36).map((slot, offset) => {
                  const idx = 9 + offset;
                  return (
                    <React.Fragment key={idx}>
                      {renderSlotButton(
                        slot ? slot.itemId : null,
                        slot ? slot.count : null,
                        selectedInvIdx === idx,
                        () => handleInventorySlotClick(idx),
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="mt-2 pt-2 border-t border-sky-400/20 grid grid-cols-9 gap-1.5">
                {inventory.slice(0, 9).map((slot, idx) => (
                  <div key={idx} className="relative">
                    <span className="absolute -top-1 left-1 z-10 text-[9px] font-mono-tabular text-sky-300">
                      {idx + 1}
                    </span>
                    {renderSlotButton(
                      slot ? slot.itemId : null,
                      slot ? slot.count : null,
                      selectedInvIdx === idx,
                      () => handleInventorySlotClick(idx),
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: Recipe Book (Nimani nimadan tayyorlanadi) */}
          <div className="lg:col-span-5 flex flex-col rounded-xl bg-[#040d21]/90 border border-sky-500/25 p-3.5 max-h-[500px]">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-200">
                <BookOpen className="w-4 h-4 text-sky-400" />
                Retseptlar kitobi
              </div>
              <div className="flex items-center gap-1">
                {(
                  [
                    ['all', 'Hammasi'],
                    ['tools', 'Qilich/Asbob'],
                    ['blocks', 'Blok/Resurs'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRecipeFilter(key)}
                    className={`px-2 py-1 rounded text-[10px] font-semibold cursor-pointer ${
                      recipeFilter === key
                        ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              {filteredRecipes.map((rec) => {
                const resDef = ITEM_DEFINITIONS[rec.result];
                const reqs = getRecipeIngredientCounts(rec);
                const canMake = hasEnoughForRecipe(rec);
                const maxMake = getMaxCraftableFromInventory(rec);
                const needsTable = rec.requiresTable && !isTable;

                return (
                  <div
                    key={rec.id}
                    className={`p-2.5 rounded-xl border ${
                      canMake
                        ? 'bg-sky-500/10 border-sky-400/40'
                        : 'bg-[#07132a]/70 border-sky-500/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {itemThumbnails[rec.result] && (
                          <img
                            src={itemThumbnails[rec.result]}
                            alt={resDef.name}
                            className="w-7 h-7 object-contain shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {resDef.name}{' '}
                            {rec.count > 1 && (
                              <span className="text-sky-300">×{rec.count}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-2">
                            {reqs.map((r) => {
                              const have = itemCounts.get(r.itemId) ?? 0;
                              const ok = have >= r.count;
                              return (
                                <span
                                  key={r.itemId}
                                  className={ok ? 'text-emerald-300' : 'text-slate-400'}
                                >
                                  {r.count}× {ITEM_DEFINITIONS[r.itemId].name} ({have})
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {needsTable ? (
                        <button
                          type="button"
                          onClick={() => {
                            returnGridToInventory(grid2, setGrid2);
                            onSelectStation('crafting');
                          }}
                          className="px-2 py-1 rounded-lg bg-[#040d21] border border-sky-500/30 text-[10px] font-semibold text-sky-300 hover:text-white shrink-0 cursor-pointer"
                        >
                          Verstak 3×3
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={!canMake}
                            onClick={() => handleApplyRecipeToGrid(rec, false)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${
                              canMake
                                ? 'bg-sky-500 hover:bg-sky-400 text-white cursor-pointer'
                                : 'bg-[#040d21] text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            <Sparkles className="w-3 h-3" />
                            Qo‘yish
                          </button>
                          {maxMake > 1 && (
                            <button
                              type="button"
                              onClick={() => handleApplyRecipeToGrid(rec, true)}
                              title={`Nechta bo‘lsa hammasini qo‘yish (×${maxMake})`}
                              className="px-2 py-1 rounded-lg bg-emerald-500/85 hover:bg-emerald-400 text-[10px] font-bold text-slate-950 cursor-pointer"
                            >
                              ×{Math.min(64, maxMake)}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
