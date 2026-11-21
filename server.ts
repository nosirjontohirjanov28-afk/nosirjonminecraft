import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  BiomePreset,
  BlockType,
  ChatMessage,
  FriendEntry,
  FriendRequestEntry,
  GameMode,
  OnlinePlayerEntry,
  RemotePlayerState,
  RoomInitPayload,
  ServerRoomSummary,
  SocialStatePayload,
} from './src/types/game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.resolve(__dirname, '.world-data.json');

interface StoredUser {
  playerId: string;
  nickname: string;
  friendCode: string;
  friends: string[]; // array of friend playerIds
}

interface StoredRoom {
  code: string;
  name: string;
  preset: BiomePreset;
  seed: string;
  gameMode?: GameMode;
  isPublic: boolean;
  hostId: string;
  hostName: string;
  createdAt: number;
  edits: Record<string, number>;
  chat: ChatMessage[];
}

interface PersistedData {
  users: Record<string, StoredUser>;
  friendRequests: FriendRequestEntry[];
  rooms: Record<string, StoredRoom>;
}

interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
  nickname: string;
  friendCode: string;
  roomCode: string | null;
  state: RemotePlayerState;
}

const data: PersistedData = {
  users: {},
  friendRequests: [],
  rooms: {},
};

function loadPersistedData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedData>;
      if (parsed.users) data.users = parsed.users;
      if (Array.isArray(parsed.friendRequests)) data.friendRequests = parsed.friendRequests;
      if (parsed.rooms) data.rooms = parsed.rooms;
    }
  } catch (err) {
    console.warn('Could not load persisted world data:', err);
  }

  // Ensure the default public hub world exists
  if (!data.rooms['WORLD1']) {
    data.rooms['WORLD1'] = {
      code: 'WORLD1',
      name: 'Markaziy Neon Olam',
      preset: 'emerald-valley',
      seed: 'AETHER-404',
      gameMode: 'survival',
      isPublic: true,
      hostId: 'system',
      hostName: 'Asosiy Server',
      createdAt: Date.now(),
      edits: {},
      chat: [
        {
          id: 'welcome-1',
          senderId: 'system',
          senderName: 'Server',
          text: 'Markaziy Neon Olamga xush kelibsiz (Kod: WORLD1). 6 tagacha do‘st bilan Survival rejimda o‘ynang!',
          timestamp: Date.now(),
          isSystem: true,
        },
      ],
    };
  } else if (data.rooms['WORLD1'].name === 'Central Neon Hub') {
    data.rooms['WORLD1'].name = 'Markaziy Neon Olam';
    data.rooms['WORLD1'].hostName = 'Asosiy Server';
    if (!data.rooms['WORLD1'].gameMode) data.rooms['WORLD1'].gameMode = 'survival';
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf-8');
    } catch (err) {
      console.warn('Failed saving world data:', err);
    }
  }, 500);
}

loadPersistedData();

const clients = new Map<string, ConnectedClient>();

function generateFriendCode(seedNum: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MCO-';
  let n = Math.abs(seedNum) + Math.floor(Math.random() * 99999);
  for (let i = 0; i < 4; i++) {
    code += chars[n % chars.length];
    n = Math.floor(n / chars.length) + 7;
  }
  return code;
}

function generateServerCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!data.rooms[code]) return code;
  }
  return `MC${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

function getRoomPlayerCount(roomCode: string): number {
  let count = 0;
  for (const c of clients.values()) {
    if (c.roomCode === roomCode) count++;
  }
  return count;
}

const MAX_SERVER_PLAYERS = 6;

function toRoomSummary(room: StoredRoom): ServerRoomSummary {
  return {
    code: room.code,
    name: room.name,
    preset: room.preset,
    seed: room.seed,
    gameMode: room.gameMode || 'survival',
    isPublic: room.isPublic,
    hostId: room.hostId,
    hostName: room.hostName,
    playerCount: getRoomPlayerCount(room.code),
    maxPlayers: MAX_SERVER_PLAYERS,
    createdAt: room.createdAt,
  };
}

function getPublicServers(): ServerRoomSummary[] {
  return Object.values(data.rooms)
    .filter((r) => r.isPublic)
    .map(toRoomSummary)
    .sort((a, b) => b.playerCount - a.playerCount || b.createdAt - a.createdAt);
}

function sendJson(ws: WebSocket, type: string, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastToRoom(roomCode: string, type: string, payload: unknown, excludePlayerId?: string) {
  for (const client of clients.values()) {
    if (client.roomCode === roomCode && client.playerId !== excludePlayerId) {
      sendJson(client.ws, type, payload);
    }
  }
}

function getOnlinePlayers(): OnlinePlayerEntry[] {
  const list: OnlinePlayerEntry[] = [];
  for (const c of clients.values()) {
    const room = c.roomCode ? data.rooms[c.roomCode] : undefined;
    list.push({
      playerId: c.playerId,
      nickname: c.nickname,
      friendCode: c.friendCode,
      roomCode: c.roomCode,
      roomName: room ? room.name : null,
    });
  }
  return list;
}

function broadcastOnlinePlayers() {
  const list = getOnlinePlayers();
  for (const client of clients.values()) {
    sendJson(client.ws, 'players:online', list);
  }
}

function broadcastServerList() {
  const list = getPublicServers();
  for (const client of clients.values()) {
    sendJson(client.ws, 'servers:list', list);
  }
}

function buildSocialState(playerId: string): SocialStatePayload {
  const user = data.users[playerId];
  const friends: FriendEntry[] = [];
  if (user) {
    for (const fid of user.friends) {
      const fu = data.users[fid];
      if (!fu) continue;
      const connected = clients.get(fid);
      const room = connected?.roomCode ? data.rooms[connected.roomCode] : undefined;
      friends.push({
        playerId: fu.playerId,
        nickname: fu.nickname,
        friendCode: fu.friendCode,
        online: Boolean(connected),
        currentRoomCode: connected?.roomCode ?? null,
        currentRoomName: room ? room.name : null,
      });
    }
  }

  const incomingRequests = data.friendRequests.filter((r) => r.toId === playerId);
  const outgoingRequests = data.friendRequests.filter((r) => r.fromId === playerId);
  return { friends, incomingRequests, outgoingRequests };
}

function pushSocialUpdate(playerId: string) {
  const client = clients.get(playerId);
  if (client) {
    sendJson(client.ws, 'social:update', buildSocialState(playerId));
  }
}

function notifyFriendsPresence(playerId: string) {
  const user = data.users[playerId];
  if (!user) return;
  for (const fid of user.friends) {
    pushSocialUpdate(fid);
  }
}

function leaveCurrentRoom(client: ConnectedClient) {
  const oldCode = client.roomCode;
  if (!oldCode) return;
  client.roomCode = null;
  broadcastToRoom(oldCode, 'player:left', { playerId: client.playerId }, client.playerId);

  const room = data.rooms[oldCode];
  if (room) {
    const sysMsg: ChatMessage = {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: 'system',
      senderName: 'Server',
      text: `${client.nickname} serverdan chiqdi`,
      timestamp: Date.now(),
      isSystem: true,
    };
    room.chat = [...room.chat.slice(-49), sysMsg];
    broadcastToRoom(oldCode, 'chat:message', sysMsg);
  }
  notifyFriendsPresence(client.playerId);
  broadcastServerList();
  broadcastOnlinePlayers();
}

function joinRoom(client: ConnectedClient, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  const room = data.rooms[code];
  if (!room) {
    sendJson(client.ws, 'error', { message: `"${code}" kodli server topilmadi.` });
    return;
  }

  if (client.roomCode !== code && getRoomPlayerCount(code) >= MAX_SERVER_PLAYERS) {
    sendJson(client.ws, 'error', {
      message: `Server to‘lgan (${MAX_SERVER_PLAYERS}/${MAX_SERVER_PLAYERS} joy band). Boshqa serverga kiring yoki yangisini yarating.`,
    });
    return;
  }

  if (client.roomCode === code) {
    // Re-sync current room
  } else {
    leaveCurrentRoom(client);
    client.roomCode = code;
  }

  const others: RemotePlayerState[] = [];
  for (const other of clients.values()) {
    if (other.roomCode === code && other.playerId !== client.playerId) {
      others.push(other.state);
    }
  }

  const initPayload: RoomInitPayload = {
    room: toRoomSummary(room),
    edits: Object.entries(room.edits),
    players: others,
    chat: room.chat.slice(-40),
  };

  sendJson(client.ws, 'room:init', initPayload);
  broadcastToRoom(code, 'player:joined', client.state, client.playerId);

  const sysMsg: ChatMessage = {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    senderId: 'system',
    senderName: 'Server',
    text: `${client.nickname} serverga qo‘shildi`,
    timestamp: Date.now(),
    isSystem: true,
  };
  room.chat = [...room.chat.slice(-49), sysMsg];
  broadcastToRoom(code, 'chat:message', sysMsg);
  scheduleSave();

  notifyFriendsPresence(client.playerId);
  broadcastServerList();
  broadcastOnlinePlayers();
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: Object.keys(data.rooms).length, onlinePlayers: clients.size });
  });

  app.get('/api/servers', (_req, res) => {
    res.json(getPublicServers());
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let currentClient: ConnectedClient | null = null;

    ws.on('message', (raw) => {
      let msg: { type?: string; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      const type = msg.type;
      const payload = msg.payload || {};

      if (type === 'auth:hello') {
        const requestedId = typeof payload.playerId === 'string' && payload.playerId.trim()
          ? payload.playerId.trim()
          : `p_${Math.random().toString(36).slice(2, 10)}`;
        const rawNick = typeof payload.nickname === 'string' ? payload.nickname.trim() : '';
        const nickname = (rawNick || `Oyinchi_${requestedId.slice(-4).toUpperCase()}`).slice(0, 20);

        let user = data.users[requestedId];
        if (!user) {
          let code = generateFriendCode(Date.now());
          while (Object.values(data.users).some((u) => u.friendCode === code)) {
            code = generateFriendCode(Math.floor(Math.random() * 1000000));
          }
          user = {
            playerId: requestedId,
            nickname,
            friendCode: code,
            friends: [],
          };
          data.users[requestedId] = user;
        } else {
          user.nickname = nickname;
        }
        scheduleSave();

        // Replace previous socket for same playerId if reconnecting
        const existing = clients.get(requestedId);
        if (existing && existing.ws !== ws) {
          existing.ws.close();
        }

        currentClient = {
          ws,
          playerId: user.playerId,
          nickname: user.nickname,
          friendCode: user.friendCode,
          roomCode: null,
          state: {
            playerId: user.playerId,
            nickname: user.nickname,
            friendCode: user.friendCode,
            x: 4.5,
            y: 20,
            z: 11.5,
            yaw: 0,
            pitch: 0,
            isFlying: false,
            isGrounded: true,
            isSprinting: false,
            selectedBlock: 10 as BlockType,
          },
        };
        clients.set(user.playerId, currentClient);

        sendJson(ws, 'auth:welcome', {
          playerId: user.playerId,
          nickname: user.nickname,
          friendCode: user.friendCode,
          servers: getPublicServers(),
          onlinePlayers: getOnlinePlayers(),
          social: buildSocialState(user.playerId),
        });
        notifyFriendsPresence(user.playerId);
        broadcastOnlinePlayers();
        return;
      }

      if (!currentClient) return;

      if (type === 'profile:update') {
        const nick = typeof payload.nickname === 'string' ? payload.nickname.trim().slice(0, 20) : '';
        if (nick) {
          currentClient.nickname = nick;
          currentClient.state.nickname = nick;
          const user = data.users[currentClient.playerId];
          if (user) user.nickname = nick;
          scheduleSave();
          sendJson(ws, 'profile:updated', { nickname: nick });
          if (currentClient.roomCode) {
            broadcastToRoom(currentClient.roomCode, 'player:moved', currentClient.state, currentClient.playerId);
          }
          notifyFriendsPresence(currentClient.playerId);
          broadcastOnlinePlayers();
        }
        return;
      }

      if (type === 'room:create') {
        const name = (typeof payload.name === 'string' ? payload.name.trim() : '') || `${currentClient.nickname} olami`;
        const preset = (payload.preset as BiomePreset) || 'emerald-valley';
        const seed = (typeof payload.seed === 'string' ? payload.seed.trim() : '') || `SEED-${Math.floor(100 + Math.random() * 899)}`;
        const gameMode: GameMode = payload.gameMode === 'creative' ? 'creative' : 'survival';
        const isPublic = payload.isPublic !== false;
        const code = generateServerCode();

        const room: StoredRoom = {
          code,
          name: name.slice(0, 32),
          preset,
          seed: seed.slice(0, 24),
          gameMode,
          isPublic,
          hostId: currentClient.playerId,
          hostName: currentClient.nickname,
          createdAt: Date.now(),
          edits: {},
          chat: [
            {
              id: `sys-${Date.now()}`,
              senderId: 'system',
              senderName: 'Server',
              text: `"${name.slice(0, 32)}" (${gameMode === 'survival' ? 'Survival' : 'Kreativ'}) serveri yaratildi! Kod: ${code}`,
              timestamp: Date.now(),
              isSystem: true,
            },
          ],
        };
        data.rooms[code] = room;
        scheduleSave();
        joinRoom(currentClient, code);
        return;
      }

      if (type === 'room:join') {
        const code = typeof payload.code === 'string' ? payload.code : '';
        if (code) joinRoom(currentClient, code);
        return;
      }

      if (type === 'room:leave') {
        leaveCurrentRoom(currentClient);
        return;
      }

      if (type === 'player:move') {
        const s = currentClient.state;
        if (typeof payload.x === 'number') s.x = payload.x;
        if (typeof payload.y === 'number') s.y = payload.y;
        if (typeof payload.z === 'number') s.z = payload.z;
        if (typeof payload.yaw === 'number') s.yaw = payload.yaw;
        if (typeof payload.pitch === 'number') s.pitch = payload.pitch;
        if (typeof payload.isFlying === 'boolean') s.isFlying = payload.isFlying;
        if (typeof payload.isGrounded === 'boolean') s.isGrounded = payload.isGrounded;
        if (typeof payload.isSprinting === 'boolean') s.isSprinting = payload.isSprinting;
        if (typeof payload.selectedBlock === 'number') s.selectedBlock = payload.selectedBlock as BlockType;

        if (currentClient.roomCode) {
          broadcastToRoom(currentClient.roomCode, 'player:moved', s, currentClient.playerId);
        }
        return;
      }

      if (type === 'player:swing') {
        if (currentClient.roomCode) {
          broadcastToRoom(
            currentClient.roomCode,
            'player:swung',
            { playerId: currentClient.playerId },
            currentClient.playerId,
          );
        }
        return;
      }

      if (type === 'block:update') {
        const roomCode = currentClient.roomCode;
        if (!roomCode || !data.rooms[roomCode]) return;
        const x = Number(payload.x);
        const y = Number(payload.y);
        const z = Number(payload.z);
        const block = Number(payload.block);
        if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return;
        if (y <= 0 || y >= 48) return;

        data.rooms[roomCode].edits[`${x},${y},${z}`] = block;
        scheduleSave();
        broadcastToRoom(
          roomCode,
          'block:updated',
          { x, y, z, block, by: currentClient.playerId },
          currentClient.playerId,
        );
        return;
      }

      if (type === 'chat:send') {
        const roomCode = currentClient.roomCode;
        if (!roomCode || !data.rooms[roomCode]) return;
        const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, 240) : '';
        if (!text) return;

        const chatMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          senderId: currentClient.playerId,
          senderName: currentClient.nickname,
          text,
          timestamp: Date.now(),
        };
        data.rooms[roomCode].chat = [...data.rooms[roomCode].chat.slice(-49), chatMsg];
        scheduleSave();
        broadcastToRoom(roomCode, 'chat:message', chatMsg);
        return;
      }

      if (type === 'friend:request') {
        const query = typeof payload.target === 'string' ? payload.target.trim().toUpperCase() : '';
        if (!query) return;

        const targetUser = Object.values(data.users).find(
          (u) =>
            u.playerId !== currentClient!.playerId &&
            (u.friendCode.toUpperCase() === query ||
              u.nickname.toUpperCase() === query ||
              u.playerId.toUpperCase() === query),
        );

        if (!targetUser) {
          sendJson(ws, 'social:notice', {
            kind: 'error',
            message: `"${query}" bo‘yicha o‘yinchi topilmadi. Do‘st kodi (MCO-XXXX) yoki ismini tekshiring.`,
          });
          return;
        }

        const me = data.users[currentClient.playerId];
        if (me.friends.includes(targetUser.playerId)) {
          sendJson(ws, 'social:notice', {
            kind: 'info',
            message: `${targetUser.nickname} allaqachon do‘stlaringiz ro‘yxatida.`,
          });
          return;
        }

        // If target already sent us a request, auto-accept!
        const reverseIdx = data.friendRequests.findIndex(
          (r) => r.fromId === targetUser.playerId && r.toId === currentClient!.playerId,
        );
        if (reverseIdx !== -1) {
          data.friendRequests.splice(reverseIdx, 1);
          if (!me.friends.includes(targetUser.playerId)) me.friends.push(targetUser.playerId);
          if (!targetUser.friends.includes(me.playerId)) targetUser.friends.push(me.playerId);
          scheduleSave();
          pushSocialUpdate(me.playerId);
          pushSocialUpdate(targetUser.playerId);
          sendJson(ws, 'social:notice', {
            kind: 'success',
            message: `Siz va ${targetUser.nickname} endi do‘st bo‘ldingiz!`,
          });
          return;
        }

        const dup = data.friendRequests.some(
          (r) => r.fromId === currentClient!.playerId && r.toId === targetUser.playerId,
        );
        if (dup) {
          sendJson(ws, 'social:notice', {
            kind: 'info',
            message: `${targetUser.nickname} ga do‘stlik so‘rovi allaqachon yuborilgan.`,
          });
          return;
        }

        const reqEntry: FriendRequestEntry = {
          id: `fr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromId: currentClient.playerId,
          fromName: currentClient.nickname,
          fromCode: currentClient.friendCode,
          toId: targetUser.playerId,
          toName: targetUser.nickname,
          toCode: targetUser.friendCode,
          createdAt: Date.now(),
        };
        data.friendRequests.push(reqEntry);
        scheduleSave();
        pushSocialUpdate(currentClient.playerId);
        pushSocialUpdate(targetUser.playerId);

        sendJson(ws, 'social:notice', {
          kind: 'success',
          message: `${targetUser.nickname} ga do‘stlik so‘rovi yuborildi!`,
        });
        return;
      }

      if (type === 'friend:respond') {
        const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
        const accept = Boolean(payload.accept);
        const idx = data.friendRequests.findIndex(
          (r) => r.id === requestId && r.toId === currentClient!.playerId,
        );
        if (idx === -1) return;

        const req = data.friendRequests[idx];
        data.friendRequests.splice(idx, 1);

        if (accept) {
          const me = data.users[req.toId];
          const sender = data.users[req.fromId];
          if (me && sender) {
            if (!me.friends.includes(sender.playerId)) me.friends.push(sender.playerId);
            if (!sender.friends.includes(me.playerId)) sender.friends.push(me.playerId);
          }
          const senderClient = clients.get(req.fromId);
          if (senderClient) {
            sendJson(senderClient.ws, 'social:notice', {
              kind: 'success',
              message: `${currentClient.nickname} do‘stlik so‘rovingizni qabul qildi!`,
            });
          }
        }
        scheduleSave();
        pushSocialUpdate(req.toId);
        pushSocialUpdate(req.fromId);
        return;
      }

      if (type === 'friend:invite') {
        const friendId = typeof payload.friendId === 'string' ? payload.friendId : '';
        if (!currentClient.roomCode) return;
        const room = data.rooms[currentClient.roomCode];
        const targetClient = clients.get(friendId);
        if (!room || !targetClient) {
          sendJson(ws, 'social:notice', {
            kind: 'info',
            message: 'Do‘stingiz hozir onlayn emas.',
          });
          return;
        }
        if (getRoomPlayerCount(room.code) >= MAX_SERVER_PLAYERS) {
          sendJson(ws, 'social:notice', {
            kind: 'error',
            message: `Serverda bo‘sh joy qolmadi (${MAX_SERVER_PLAYERS}/${MAX_SERVER_PLAYERS}).`,
          });
          return;
        }
        sendJson(targetClient.ws, 'friend:invited', {
          id: `inv-${Date.now()}`,
          fromName: currentClient.nickname,
          roomCode: room.code,
          roomName: room.name,
          createdAt: Date.now(),
        });
        sendJson(ws, 'social:notice', {
          kind: 'success',
          message: `${targetClient.nickname} ga ${room.name} (${room.code}) serveriga taklif yuborildi!`,
        });
        return;
      }
    });

    ws.on('close', () => {
      if (currentClient) {
        const latest = clients.get(currentClient.playerId);
        if (latest && latest.ws === ws) {
          leaveCurrentRoom(currentClient);
          clients.delete(currentClient.playerId);
          notifyFriendsPresence(currentClient.playerId);
          broadcastServerList();
          broadcastOnlinePlayers();
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await import('vite');
    const viteServer = await vite.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MINECRAFT ONLINE WORLD server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
