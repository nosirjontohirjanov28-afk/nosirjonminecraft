import type { BiomePreset, BlockType, GameMode, ServerRoomSummary } from '../types/game';

const OFFLINE_ROOMS_KEY = 'mcow_offline_rooms_v1';
const OFFLINE_EDITS_PREFIX = 'mcow_offline_edits_';
const CACHED_SERVERS_KEY = 'mcow_cached_servers_v1';

export interface OfflineRoomRecord extends ServerRoomSummary {
  isOfflineOnly: true;
}

export function getDefaultOfflineWorld(): OfflineRoomRecord {
  return {
    code: 'WORLD1',
    name: 'Markaziy Neon Olam',
    preset: 'emerald-valley',
    seed: 'AETHER-404',
    gameMode: 'survival',
    isPublic: true,
    hostId: 'local',
    hostName: 'Oflayn O‘yinchi',
    playerCount: 1,
    maxPlayers: 6,
    createdAt: 0,
    isOfflineOnly: true,
  };
}

export function loadOfflineRooms(): OfflineRoomRecord[] {
  try {
    const raw = localStorage.getItem(OFFLINE_ROOMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OfflineRoomRecord[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return [getDefaultOfflineWorld()];
}

export function saveOfflineRooms(rooms: OfflineRoomRecord[]) {
  try {
    localStorage.setItem(OFFLINE_ROOMS_KEY, JSON.stringify(rooms));
  } catch {
    // ignore storage errors
  }
}

export function createOfflineRoom(opts: {
  name: string;
  preset: BiomePreset;
  seed: string;
  gameMode: GameMode;
  hostName: string;
}): OfflineRoomRecord {
  const rooms = loadOfflineRooms();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const code = `OFF-${suffix}`;
  const created: OfflineRoomRecord = {
    code,
    name: opts.name.trim() || 'Oflayn Olam',
    preset: opts.preset,
    seed: opts.seed.trim() || 'AETHER-404',
    gameMode: opts.gameMode,
    isPublic: false,
    hostId: 'local',
    hostName: opts.hostName || 'Oflayn O‘yinchi',
    playerCount: 1,
    maxPlayers: 1,
    createdAt: Date.now(),
    isOfflineOnly: true,
  };
  saveOfflineRooms([created, ...rooms.filter((r) => r.code !== code)]);
  return created;
}

export function getOfflineRoomByCode(code: string): OfflineRoomRecord {
  const clean = code.trim().toUpperCase();
  const rooms = loadOfflineRooms();
  const found = rooms.find((r) => r.code === clean);
  if (found) return found;

  // Also check cached online servers so user can open any previously seen world offline
  const cached = loadCachedServers().find((s) => s.code === clean);
  if (cached) {
    return { ...cached, playerCount: 1, isOfflineOnly: true };
  }
  return getDefaultOfflineWorld();
}

export function loadOfflineBlockEdits(roomCode: string): Array<[string, number]> {
  try {
    const raw = localStorage.getItem(`${OFFLINE_EDITS_PREFIX}${roomCode}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveOfflineBlockEdit(
  roomCode: string,
  x: number,
  y: number,
  z: number,
  block: BlockType,
) {
  try {
    const key = `${OFFLINE_EDITS_PREFIX}${roomCode}`;
    const raw = localStorage.getItem(key);
    const map: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[`${x},${y},${z}`] = block;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function saveCachedServers(servers: ServerRoomSummary[]) {
  try {
    localStorage.setItem(CACHED_SERVERS_KEY, JSON.stringify(servers));
  } catch {
    // ignore
  }
}

export function loadCachedServers(): ServerRoomSummary[] {
  try {
    const raw = localStorage.getItem(CACHED_SERVERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ServerRoomSummary[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [getDefaultOfflineWorld()];
}
