/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { NeonMenu } from './components/NeonMenu';
import { SurvivalModal } from './components/SurvivalModal';
import { GameEngine } from './engine/GameEngine';
import { MobDrop } from './engine/mobs';
import { ConnectionState, MultiplayerClient } from './engine/network';
import {
  OfflineRoomRecord,
  createOfflineRoom,
  getOfflineRoomByCode,
  loadCachedServers,
  loadOfflineBlockEdits,
  loadOfflineRooms,
  saveCachedServers,
} from './engine/offlineWorlds';
import { saveOfflineBlockEdit } from './engine/offlineWorlds';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  BiomePreset,
  BlockType,
  ChatMessage,
  CraftingStationType,
  GameMode,
  GamePhase,
  GameSettings,
  ITEM_DEFINITIONS,
  InventorySlot,
  ItemId,
  OnlinePlayerEntry,
  PlayerHudState,
  RemotePlayerState,
  ServerInviteEntry,
  ServerRoomSummary,
  SocialStatePayload,
} from './types/game';

const DEFAULT_CREATIVE_SLOTS: Array<InventorySlot | null> = [
  { itemId: 'neon_blue', count: 1 },
  { itemId: 'grass', count: 1 },
  { itemId: 'stone', count: 1 },
  { itemId: 'plank', count: 1 },
  { itemId: 'oak_log', count: 1 },
  { itemId: 'crafting_table', count: 1 },
  { itemId: 'furnace', count: 1 },
  { itemId: 'neon_sword', count: 1 },
  { itemId: 'diamond_pickaxe', count: 1 },
];

const EMPTY_SURVIVAL_INVENTORY: Array<InventorySlot | null> = Array(36).fill(null);

const INITIAL_SETTINGS: GameSettings = {
  fov: 75,
  sensitivity: 1.0,
  renderDistance: 3,
  shadows: true,
  soundEnabled: true,
  timeOfDay: 11.0,
};

const INITIAL_HUD: PlayerHudState = {
  x: 4,
  y: 20,
  z: 11,
  isFlying: false,
  isGrounded: true,
  isSprinting: false,
  isInWater: false,
  cameraMode: 'first-person',
  gameMode: 'survival',
  health: 20,
  maxHealth: 20,
  hunger: 20,
  maxHunger: 20,
  isDead: false,
  miningProgress: 0,
  miningHint: null,
  targetBlockName: null,
  targetBlockType: null,
  targetCoords: null,
  targetMobName: null,
  targetMobHp: 0,
  targetMobMaxHp: 0,
  pointerLocked: false,
  blocksPlaced: 0,
  blocksBroken: 0,
};

const INITIAL_SOCIAL: SocialStatePayload = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
};

function loadRoomInventory(roomCode: string): Array<InventorySlot | null> {
  try {
    const raw = localStorage.getItem(`mcow_inv_${roomCode}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Array<InventorySlot | null>;
      if (Array.isArray(parsed) && parsed.length === 36) return parsed;
    }
  } catch {
    // ignore
  }
  return Array(36).fill(null);
}

function saveRoomInventory(roomCode: string, inv: Array<InventorySlot | null>) {
  try {
    localStorage.setItem(`mcow_inv_${roomCode}`, JSON.stringify(inv));
  } catch {
    // ignore
  }
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const netRef = useRef<MultiplayerClient | null>(null);
  const browserOnline = useOnlineStatus();

  const [phase, setPhase] = useState<GamePhase>('menu');
  const [settings, setSettings] = useState<GameSettings>(INITIAL_SETTINGS);
  const [creativeSlots, setCreativeSlots] = useState<Array<InventorySlot | null>>(
    DEFAULT_CREATIVE_SLOTS,
  );
  const [survivalInventory, setSurvivalInventory] = useState<Array<InventorySlot | null>>(
    EMPTY_SURVIVAL_INVENTORY,
  );
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [itemThumbnails, setItemThumbnails] = useState<Record<string, string>>({});
  const [hud, setHud] = useState<PlayerHudState>(INITIAL_HUD);
  const [contextLost, setContextLost] = useState(false);

  // Crafting / Inventory Modal state
  const [stationOpen, setStationOpen] = useState(false);
  const [stationType, setStationType] = useState<CraftingStationType>('pocket');
  const [chatActive, setChatActive] = useState(false);

  // Multiplayer & Social state
  const [wsConnected, setWsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connecting',
  );
  const [playerId, setPlayerId] = useState('');
  const [playerNickname, setPlayerNickname] = useState('Oyinchi');
  const [friendCode, setFriendCode] = useState('');
  const [currentRoom, setCurrentRoom] = useState<ServerRoomSummary | null>(null);
  const [isOfflineRoom, setIsOfflineRoom] = useState(false);
  const [servers, setServers] = useState<ServerRoomSummary[]>(() => loadCachedServers());
  const [offlineWorlds, setOfflineWorlds] = useState<OfflineRoomRecord[]>(() => loadOfflineRooms());
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerEntry[]>([]);
  const [remotePlayers, setRemotePlayers] = useState<RemotePlayerState[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [social, setSocial] = useState<SocialStatePayload>(INITIAL_SOCIAL);
  const [invites, setInvites] = useState<ServerInviteEntry[]>([]);
  const [notice, setNotice] = useState<{
    kind: 'info' | 'success' | 'error';
    message: string;
  } | null>(null);

  const pendingInviteServerRef = useRef<string | null>(null);
  const pendingInviteFriendRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const srv = params.get('server')?.trim().toUpperCase();
      const fr = params.get('friend')?.trim().toUpperCase();
      if (srv) pendingInviteServerRef.current = srv;
      if (fr) pendingInviteFriendRef.current = fr;
    } catch {
      // ignore
    }
  }, []);

  const gameMode: GameMode = currentRoom?.gameMode ?? 'survival';
  const creativeSlotsRef = useRef(creativeSlots);
  creativeSlotsRef.current = creativeSlots;
  const survivalInvRef = useRef(survivalInventory);
  survivalInvRef.current = survivalInventory;
  const selectedSlotRef = useRef(selectedSlot);
  selectedSlotRef.current = selectedSlot;
  const gameModeRef = useRef<GameMode>(gameMode);
  gameModeRef.current = gameMode;
  const currentRoomRef = useRef(currentRoom);
  currentRoomRef.current = currentRoom;
  const isOfflineRoomRef = useRef(isOfflineRoom);
  isOfflineRoomRef.current = isOfflineRoom;

  const syncEngineHeldItem = useCallback((slotIdx: number, mode: GameMode) => {
    const slots = mode === 'creative' ? creativeSlotsRef.current : survivalInvRef.current;
    const slot = slots[slotIdx] ?? null;
    engineRef.current?.setSelectedItem(slot ? slot.itemId : null);
  }, []);

  const updateSurvivalInventory = useCallback((next: Array<InventorySlot | null>) => {
    survivalInvRef.current = next;
    setSurvivalInventory(next);
    if (currentRoomRef.current) {
      saveRoomInventory(currentRoomRef.current.code, next);
    }
    if (gameModeRef.current === 'survival') {
      const cur = next[selectedSlotRef.current] ?? null;
      engineRef.current?.setSelectedItem(cur ? cur.itemId : null);
    }
  }, []);

  const showNotice = useCallback(
    (next: { kind: 'info' | 'success' | 'error'; message: string }) => {
      setNotice(next);
      window.setTimeout(() => {
        setNotice((cur) => (cur?.message === next.message ? null : cur));
      }, 4500);
    },
    [],
  );

  const launchOfflineRoom = useCallback(
    (room: OfflineRoomRecord) => {
      const engine = engineRef.current;
      if (!engine) return;
      const mode: GameMode = room.gameMode || 'survival';
      setIsOfflineRoom(true);
      isOfflineRoomRef.current = true;
      setCurrentRoom(room);
      currentRoomRef.current = room;
      gameModeRef.current = mode;

      const roomInv = loadRoomInventory(room.code);
      survivalInvRef.current = roomInv;
      setSurvivalInventory(roomInv);

      const edits = loadOfflineBlockEdits(room.code);
      setRemotePlayers([]);
      setChatMessages([
        {
          id: `offline-${Date.now()}`,
          senderId: 'system',
          senderName: 'Oflayn Olam',
          text: `"${room.name}" oflayn rejimda ochildi. Barcha qurilgan bloklar va inventar qurilmangizda saqlanadi.`,
          timestamp: Date.now(),
          isSystem: true,
        },
      ]);

      engine.loadMultiplayerRoom(room.seed, room.preset, edits, [], mode);
      syncEngineHeldItem(selectedSlotRef.current, mode);
      engine.setPhase('playing');
      engine.requestLock();
    },
    [syncEngineHeldItem],
  );

  // Sync engine input lock when chat or crafting modal opens/closes
  useEffect(() => {
    const blocked = stationOpen || chatActive;
    engineRef.current?.setInputEnabled(!blocked);
  }, [stationOpen, chatActive]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new GameEngine(
      container,
      'AETHER-404',
      'emerald-valley',
      INITIAL_SETTINGS,
      {
        onHudUpdate: (nextHud) => setHud(nextHud),
        onPhaseChange: (nextPhase) => {
          setPhase(nextPhase);
          if (nextPhase !== 'playing') {
            setStationOpen(false);
          }
        },
        onHotbarSelect: (idx) => {
          if (idx >= 0 && idx < 9) {
            selectedSlotRef.current = idx;
            setSelectedSlot(idx);
            syncEngineHeldItem(idx, gameModeRef.current);
          }
        },
        onContextLost: (lost) => setContextLost(lost),
        onLocalMove: (moveState) => {
          if (!isOfflineRoomRef.current) {
            netRef.current?.sendMove(moveState);
          }
        },
        onLocalBlockUpdate: (x, y, z, block) => {
          const activeRoom = currentRoomRef.current;
          if (isOfflineRoomRef.current || !netRef.current?.isConnected()) {
            if (activeRoom) {
              saveOfflineBlockEdit(activeRoom.code, x, y, z, block);
            }
          } else {
            netRef.current.sendBlockUpdate(x, y, z, block);
          }
        },
        onLocalSwing: () => {
          if (!isOfflineRoomRef.current) {
            netRef.current?.sendSwing();
          }
        },
        onCollectDrops: (drops: MobDrop[]) => {
          const next = survivalInvRef.current.map((s) => (s ? { ...s } : null));
          for (const drop of drops) {
            let rem = drop.count;
            const maxStack = ITEM_DEFINITIONS[drop.itemId].maxStack;
            for (let i = 0; i < next.length && rem > 0; i++) {
              const s = next[i];
              if (s && s.itemId === drop.itemId && s.count < maxStack) {
                const add = Math.min(rem, maxStack - s.count);
                s.count += add;
                rem -= add;
              }
            }
            for (let i = 0; i < next.length && rem > 0; i++) {
              if (!next[i]) {
                const add = Math.min(rem, maxStack);
                next[i] = { itemId: drop.itemId, count: add };
                rem -= add;
              }
            }
          }
          updateSurvivalInventory(next);
        },
        canPlaceSelectedItem: () => {
          if (gameModeRef.current === 'creative') return true;
          const slot = survivalInvRef.current[selectedSlotRef.current];
          if (!slot || slot.count <= 0) return false;
          return ITEM_DEFINITIONS[slot.itemId].blockType !== undefined;
        },
        onConsumeSelectedItem: () => {
          if (gameModeRef.current === 'creative') return;
          const idx = selectedSlotRef.current;
          const next = survivalInvRef.current.map((s) => (s ? { ...s } : null));
          const slot = next[idx];
          if (!slot) return;
          slot.count -= 1;
          if (slot.count <= 0) next[idx] = null;
          updateSurvivalInventory(next);
        },
        onEatHeldItem: () => {
          const idx = selectedSlotRef.current;
          const next = survivalInvRef.current.map((s) => (s ? { ...s } : null));
          const slot = next[idx];
          if (!slot) return;
          const def = ITEM_DEFINITIONS[slot.itemId];
          if (def.category !== 'food') return;
          engine.healFromFood(def.hungerRestore ?? 4, def.healthRestore ?? 2);
          slot.count -= 1;
          if (slot.count <= 0) next[idx] = null;
          updateSurvivalInventory(next);
        },
        onOpenStation: (st) => {
          if (document.pointerLockElement) document.exitPointerLock();
          setStationType(st);
          setStationOpen(true);
        },
      },
    );

    engineRef.current = engine;
    setItemThumbnails(engine.getItemThumbnails());
    syncEngineHeldItem(0, 'survival');

    const net = new MultiplayerClient({
      onConnected: (connected) => setWsConnected(connected),
      onConnectionStateChange: (state) => setConnectionState(state),
      onWelcome: (info) => {
        setPlayerId(info.playerId);
        setPlayerNickname(info.nickname);
        setFriendCode(info.friendCode);
        setServers(info.servers);
        saveCachedServers(info.servers);
        setOnlinePlayers(info.onlinePlayers);
        setSocial(info.social);

        const inviteFriend = pendingInviteFriendRef.current;
        const inviteServer = pendingInviteServerRef.current;
        if (inviteFriend || inviteServer) {
          if (inviteFriend && inviteFriend !== info.friendCode.toUpperCase()) {
            net.sendFriendRequest(inviteFriend);
          }
          if (inviteServer) {
            net.joinServer(inviteServer);
          }
          pendingInviteFriendRef.current = null;
          pendingInviteServerRef.current = null;
          try {
            window.history.replaceState({}, '', window.location.pathname);
          } catch {
            // ignore
          }
        }
      },
      onServerList: (list) => {
        setServers(list);
        saveCachedServers(list);
      },
      onOnlinePlayers: (players) => setOnlinePlayers(players),
      onSocialUpdate: (s) => setSocial(s),
      onNotice: (n) => showNotice(n),
      onRoomInit: (payload) => {
        const mode: GameMode = payload.room.gameMode || 'survival';
        setIsOfflineRoom(false);
        isOfflineRoomRef.current = false;
        setCurrentRoom(payload.room);
        currentRoomRef.current = payload.room;
        gameModeRef.current = mode;

        const roomInv = loadRoomInventory(payload.room.code);
        survivalInvRef.current = roomInv;
        setSurvivalInventory(roomInv);

        setRemotePlayers(payload.players);
        setChatMessages(payload.chat);
        engine.loadMultiplayerRoom(
          payload.room.seed,
          payload.room.preset,
          payload.edits,
          payload.players,
          mode,
        );
        syncEngineHeldItem(selectedSlotRef.current, mode);
        engine.setPhase('playing');
        engine.requestLock();
      },
      onPlayerJoined: (player) => {
        engine.upsertRemotePlayer(player);
        setRemotePlayers((prev) => {
          const exists = prev.some((p) => p.playerId === player.playerId);
          return exists
            ? prev.map((p) => (p.playerId === player.playerId ? player : p))
            : [...prev, player];
        });
      },
      onPlayerMoved: (player) => {
        engine.upsertRemotePlayer(player);
        setRemotePlayers((prev) => {
          const exists = prev.some((p) => p.playerId === player.playerId);
          return exists
            ? prev.map((p) => (p.playerId === player.playerId ? player : p))
            : [...prev, player];
        });
      },
      onPlayerLeft: (pid) => {
        engine.removeRemotePlayer(pid);
        setRemotePlayers((prev) => prev.filter((p) => p.playerId !== pid));
      },
      onPlayerSwung: (pid) => {
        engine.swingRemotePlayer(pid);
      },
      onBlockUpdated: (x, y, z, block) => {
        engine.applyRemoteBlockUpdate(x, y, z, block);
      },
      onChatMessage: (msg) => {
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev.slice(-49), msg];
        });
      },
      onFriendInvited: (invite) => {
        setInvites((prev) => [invite, ...prev.slice(0, 4)]);
      },
      onError: (message) => {
        showNotice({ kind: 'error', message });
      },
    });
    netRef.current = net;
    setPlayerNickname(net.nickname);

    return () => {
      net.dispose();
      netRef.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, [showNotice, syncEngineHeldItem, updateSurvivalInventory]);

  const friendIds = useMemo(
    () => new Set(social.friends.map((f) => f.playerId)),
    [social.friends],
  );

  const handleResumeGame = useCallback(() => {
    engineRef.current?.setPhase('playing');
    engineRef.current?.requestLock();
  }, []);

  const handleCreateServer = useCallback(
    (opts: {
      name: string;
      preset: BiomePreset;
      seed: string;
      gameMode: GameMode;
      maxPlayers?: number;
      isPublic: boolean;
    }) => {
      if (netRef.current?.isConnected()) {
        netRef.current.createServer(opts);
        return;
      }
      // Instant offline world creation when internetsiz / offline
      const created = createOfflineRoom({
        name: opts.name,
        preset: opts.preset,
        seed: opts.seed,
        gameMode: opts.gameMode,
        hostName: playerNickname,
      });
      setOfflineWorlds(loadOfflineRooms());
      launchOfflineRoom(created);
    },
    [launchOfflineRoom, playerNickname],
  );

  const handleJoinServer = useCallback(
    (code: string) => {
      const clean = code.trim().toUpperCase();
      if (!clean) return;
      if (clean.startsWith('OFF-') || !netRef.current?.isConnected()) {
        const offlineRoom = getOfflineRoomByCode(clean);
        launchOfflineRoom(offlineRoom);
        return;
      }
      netRef.current.joinServer(clean);
    },
    [launchOfflineRoom],
  );

  const handlePlayOffline = useCallback(
    (code = 'WORLD1') => {
      const offlineRoom = getOfflineRoomByCode(code);
      launchOfflineRoom(offlineRoom);
    },
    [launchOfflineRoom],
  );

  const handleLeaveServer = useCallback(() => {
    if (!isOfflineRoomRef.current) {
      netRef.current?.leaveServer();
    }
    setIsOfflineRoom(false);
    isOfflineRoomRef.current = false;
    setCurrentRoom(null);
    setRemotePlayers([]);
    setChatMessages([]);
    engineRef.current?.clearRemotePlayers();
  }, []);

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    engineRef.current?.updateSettings(next);
  }, []);

  const handleSelectSlot = useCallback(
    (idx: number) => {
      selectedSlotRef.current = idx;
      setSelectedSlot(idx);
      syncEngineHeldItem(idx, gameModeRef.current);
    },
    [syncEngineHeldItem],
  );

  const handleAssignCreativeSlot = useCallback((slotIdx: number, itemId: ItemId) => {
    setCreativeSlots((prev) => {
      const copy = [...prev];
      copy[slotIdx] = { itemId, count: 1 };
      creativeSlotsRef.current = copy;
      return copy;
    });
    selectedSlotRef.current = slotIdx;
    setSelectedSlot(slotIdx);
    engineRef.current?.setSelectedItem(itemId);
  }, []);

  const handleEatHeld = useCallback(() => {
    const idx = selectedSlotRef.current;
    const next = survivalInvRef.current.map((s) => (s ? { ...s } : null));
    const slot = next[idx];
    if (!slot) return;
    const def = ITEM_DEFINITIONS[slot.itemId];
    if (def.category !== 'food') return;
    engineRef.current?.healFromFood(def.hungerRestore ?? 4, def.healthRestore ?? 2);
    slot.count -= 1;
    if (slot.count <= 0) next[idx] = null;
    updateSurvivalInventory(next);
  }, [updateSurvivalInventory]);

  const liveRoom = useMemo(
    () =>
      currentRoom
        ? {
            ...currentRoom,
            playerCount: isOfflineRoom ? 1 : remotePlayers.length + 1,
          }
        : null,
    [currentRoom, isOfflineRoom, remotePlayers.length],
  );

  const activeHotbarSlots =
    gameMode === 'creative' ? creativeSlots : survivalInventory.slice(0, 9);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#030814]">
      {/* Dedicated WebGL Mount Container */}
      <div ref={mountRef} className="fixed inset-0 w-full h-full" />

      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030814]/95 p-6 text-center">
          <div className="neon-panel rounded-2xl p-6 max-w-md">
            <h2 className="font-display text-xl font-bold text-sky-300">
              WebGL grafik rejimi vaqtincha to‘xtatildi
            </h2>
            <p className="text-sm text-slate-300 mt-2">
              Brauzeringiz 3D grafika tezlatgichini vaqtincha to‘xtatdi. Sahna tiklanmoqda...
            </p>
          </div>
        </div>
      )}

      {phase === 'playing' && (
        <GameHUD
          hud={hud}
          wsConnected={wsConnected && !isOfflineRoom}
          playerId={playerId}
          currentRoom={liveRoom}
          friendCode={friendCode}
          remotePlayers={remotePlayers}
          onlinePlayers={onlinePlayers}
          social={social}
          friendIds={friendIds}
          chatMessages={chatMessages}
          invites={invites}
          hotbarSlots={activeHotbarSlots}
          selectedSlot={selectedSlot}
          itemThumbnails={itemThumbnails}
          onSelectSlot={handleSelectSlot}
          onAssignCreativeSlot={handleAssignCreativeSlot}
          onOpenInventory={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            setStationType('pocket');
            setStationOpen((v) => !v);
          }}
          onEatHeld={handleEatHeld}
          onRespawn={() => engineRef.current?.respawn()}
          onToggleCamera={() => engineRef.current?.toggleCameraMode()}
          onToggleFly={() => engineRef.current?.toggleFlyMode()}
          onOpenMenu={() => engineRef.current?.setPhase('paused')}
          onSendChat={(text) => {
            if (isOfflineRoomRef.current || !netRef.current?.isConnected()) {
              setChatMessages((prev) => [
                ...prev.slice(-49),
                {
                  id: `local-${Date.now()}`,
                  senderId: 'system',
                  senderName: 'Oflayn',
                  text: 'Oflayn rejimdasiz — chat faqat onlayn serverda do‘stlar bilan ishlaydi.',
                  timestamp: Date.now(),
                  isSystem: true,
                },
              ]);
              return;
            }
            netRef.current.sendChat(text);
          }}
          onChatActiveChange={setChatActive}
          onAddFriend={(target) => netRef.current?.sendFriendRequest(target)}
          onRespondFriendRequest={(id, accept) =>
            netRef.current?.respondFriendRequest(id, accept)
          }
          onInviteFriend={(fid) => netRef.current?.inviteFriend(fid)}
          onJoinServer={handleJoinServer}
          onDismissInvite={(id) =>
            setInvites((prev) => prev.filter((inv) => inv.id !== id))
          }
          onVirtualKey={(code, down) => engineRef.current?.triggerVirtualKey(code, down)}
          onVirtualJump={() => engineRef.current?.triggerVirtualJump()}
          onMobileActionMode={(mode) => engineRef.current?.setMobileActionMode(mode)}
        />
      )}

      <SurvivalModal
        open={phase === 'playing' && stationOpen}
        station={stationType}
        inventory={survivalInventory}
        itemThumbnails={itemThumbnails}
        onClose={() => setStationOpen(false)}
        onUpdateInventory={updateSurvivalInventory}
        onSelectStation={setStationType}
      />

      <NeonMenu
        phase={phase}
        wsConnected={wsConnected}
        connectionState={browserOnline ? connectionState : 'offline'}
        playerId={playerId}
        playerNickname={playerNickname}
        friendCode={friendCode}
        currentRoom={liveRoom}
        isOfflineRoom={isOfflineRoom}
        servers={servers}
        offlineWorlds={offlineWorlds}
        onlinePlayers={onlinePlayers}
        social={social}
        invites={invites}
        notice={notice}
        settings={settings}
        onUpdateNickname={(name) => {
          setPlayerNickname(name);
          netRef.current?.updateNickname(name);
        }}
        onResumeGame={handleResumeGame}
        onCreateServer={handleCreateServer}
        onJoinServer={handleJoinServer}
        onPlayOffline={handlePlayOffline}
        onLeaveServer={handleLeaveServer}
        onSendFriendRequest={(target) => netRef.current?.sendFriendRequest(target)}
        onRespondFriendRequest={(id, accept) =>
          netRef.current?.respondFriendRequest(id, accept)
        }
        onInviteFriend={(fid) => netRef.current?.inviteFriend(fid)}
        onDismissInvite={(id) =>
          setInvites((prev) => prev.filter((inv) => inv.id !== id))
        }
        onUpdateSettings={handleUpdateSettings}
      />
    </div>
  );
}
