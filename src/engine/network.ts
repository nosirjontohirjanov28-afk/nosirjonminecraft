import type {
  BiomePreset,
  BlockType,
  ChatMessage,
  GameMode,
  OnlinePlayerEntry,
  RemotePlayerState,
  RoomInitPayload,
  ServerInviteEntry,
  ServerRoomSummary,
  SocialStatePayload,
} from '../types/game';

export interface NetworkCallbacks {
  onConnected: (connected: boolean) => void;
  onWelcome: (info: {
    playerId: string;
    nickname: string;
    friendCode: string;
    servers: ServerRoomSummary[];
    onlinePlayers: OnlinePlayerEntry[];
    social: SocialStatePayload;
  }) => void;
  onServerList: (servers: ServerRoomSummary[]) => void;
  onOnlinePlayers: (players: OnlinePlayerEntry[]) => void;
  onSocialUpdate: (social: SocialStatePayload) => void;
  onNotice: (notice: { kind: 'info' | 'success' | 'error'; message: string }) => void;
  onRoomInit: (payload: RoomInitPayload) => void;
  onPlayerJoined: (player: RemotePlayerState) => void;
  onPlayerMoved: (player: RemotePlayerState) => void;
  onPlayerLeft: (playerId: string) => void;
  onPlayerSwung: (playerId: string) => void;
  onBlockUpdated: (x: number, y: number, z: number, block: BlockType) => void;
  onChatMessage: (msg: ChatMessage) => void;
  onFriendInvited: (invite: ServerInviteEntry) => void;
  onError: (message: string) => void;
}

const STORAGE_PLAYER_ID = 'mcow_player_id';
const STORAGE_NICKNAME = 'mcow_nickname';
const SESSION_PLAYER_ID = 'mcow_tab_player_id';
const SESSION_NICKNAME = 'mcow_tab_nickname';

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: NetworkCallbacks;
  private queue: Array<{ type: string; payload: unknown }> = [];
  private reconnectTimer: number | null = null;
  private closed = false;
  private lastMoveSent = 0;
  private lockAbort: AbortController | null = null;

  public playerId = '';
  public nickname = '';

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
    void this.initIdentityAndConnect();
  }

  private async initIdentityAndConnect() {
    // Preserve tab identity across refreshes
    let tabId = '';
    try {
      tabId = sessionStorage.getItem(SESSION_PLAYER_ID) || '';
    } catch {
      tabId = '';
    }

    if (tabId) {
      this.playerId = tabId;
      this.nickname = this.getStoredNickname(true);
      this.connect();
      return;
    }

    // Check if primary browser profile lock is available (prevents Tab 2 from kicking Tab 1)
    let canUsePrimary = true;
    if (typeof navigator !== 'undefined' && navigator.locks) {
      canUsePrimary = await new Promise<boolean>((resolve) => {
        navigator.locks
          .request('mcow_primary_profile_lock', { ifAvailable: true }, (lock) => {
            if (!lock) {
              resolve(false);
              return;
            }
            resolve(true);
            return new Promise<void>((holdResolve) => {
              this.lockAbort = new AbortController();
              this.lockAbort.signal.addEventListener('abort', () => holdResolve());
            });
          })
          .catch(() => resolve(true));
      });
    }

    if (this.closed) return;

    if (canUsePrimary) {
      this.playerId = this.getOrCreateLocalId();
      this.nickname = this.getStoredNickname(false);
    } else {
      this.playerId = `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
      this.nickname = `Oyinchi_${this.playerId.slice(-4).toUpperCase()}`;
    }

    try {
      sessionStorage.setItem(SESSION_PLAYER_ID, this.playerId);
      sessionStorage.setItem(SESSION_NICKNAME, this.nickname);
    } catch {
      // ignore
    }

    this.connect();
  }

  private getOrCreateLocalId(): string {
    try {
      const existing = localStorage.getItem(STORAGE_PLAYER_ID);
      if (existing) return existing;
      const fresh = `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
      localStorage.setItem(STORAGE_PLAYER_ID, fresh);
      return fresh;
    } catch {
      return `p_${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  private getStoredNickname(preferSession: boolean): string {
    try {
      if (preferSession) {
        const sn = sessionStorage.getItem(SESSION_NICKNAME);
        if (sn && sn.trim()) return sn.trim();
      }
      const n = localStorage.getItem(STORAGE_NICKNAME);
      if (n && n.trim()) return n.trim();
    } catch {
      // ignore
    }
    return `Oyinchi_${this.playerId.slice(-4).toUpperCase()}`;
  }

  private connect() {
    if (this.closed) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.callbacks.onConnected(true);
      ws.send(
        JSON.stringify({
          type: 'auth:hello',
          payload: { playerId: this.playerId, nickname: this.nickname },
        }),
      );
      while (this.queue.length > 0) {
        const next = this.queue.shift()!;
        ws.send(JSON.stringify(next));
      }
    };

    ws.onmessage = (event) => {
      let msg: { type: string; payload: unknown };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      switch (msg.type) {
        case 'auth:welcome':
          this.callbacks.onWelcome(
            msg.payload as Parameters<NetworkCallbacks['onWelcome']>[0],
          );
          break;
        case 'servers:list':
          this.callbacks.onServerList(msg.payload as ServerRoomSummary[]);
          break;
        case 'players:online':
          this.callbacks.onOnlinePlayers(msg.payload as OnlinePlayerEntry[]);
          break;
        case 'social:update':
          this.callbacks.onSocialUpdate(msg.payload as SocialStatePayload);
          break;
        case 'social:notice':
          this.callbacks.onNotice(
            msg.payload as { kind: 'info' | 'success' | 'error'; message: string },
          );
          break;
        case 'room:init':
          this.callbacks.onRoomInit(msg.payload as RoomInitPayload);
          break;
        case 'player:joined':
          this.callbacks.onPlayerJoined(msg.payload as RemotePlayerState);
          break;
        case 'player:moved':
          this.callbacks.onPlayerMoved(msg.payload as RemotePlayerState);
          break;
        case 'player:left': {
          const p = msg.payload as { playerId: string };
          this.callbacks.onPlayerLeft(p.playerId);
          break;
        }
        case 'player:swung': {
          const p = msg.payload as { playerId: string };
          this.callbacks.onPlayerSwung(p.playerId);
          break;
        }
        case 'block:updated': {
          const b = msg.payload as { x: number; y: number; z: number; block: BlockType };
          this.callbacks.onBlockUpdated(b.x, b.y, b.z, b.block);
          break;
        }
        case 'chat:message':
          this.callbacks.onChatMessage(msg.payload as ChatMessage);
          break;
        case 'friend:invited':
          this.callbacks.onFriendInvited(msg.payload as ServerInviteEntry);
          break;
        case 'error': {
          const err = msg.payload as { message: string };
          this.callbacks.onError(err.message);
          break;
        }
      }
    };

    ws.onclose = () => {
      this.callbacks.onConnected(false);
      if (!this.closed && !this.reconnectTimer) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 1800);
      }
    };
  }

  public send(type: string, payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    } else {
      this.queue.push({ type, payload });
    }
  }

  public updateNickname(nickname: string) {
    const clean = nickname.trim().slice(0, 20);
    if (!clean) return;
    this.nickname = clean;
    try {
      sessionStorage.setItem(SESSION_NICKNAME, clean);
      localStorage.setItem(STORAGE_NICKNAME, clean);
    } catch {
      // ignore
    }
    this.send('profile:update', { nickname: clean });
  }

  public createServer(opts: {
    name: string;
    preset: BiomePreset;
    seed: string;
    gameMode: GameMode;
    isPublic: boolean;
  }) {
    this.send('room:create', opts);
  }

  public joinServer(code: string) {
    this.send('room:join', { code: code.trim().toUpperCase() });
  }

  public leaveServer() {
    this.send('room:leave', {});
  }

  public sendMove(state: Omit<RemotePlayerState, 'playerId' | 'nickname' | 'friendCode'>) {
    const now = performance.now();
    if (now - this.lastMoveSent < 50) return; // 20Hz throttle
    this.lastMoveSent = now;
    this.send('player:move', state);
  }

  public sendSwing() {
    this.send('player:swing', {});
  }

  public sendBlockUpdate(x: number, y: number, z: number, block: BlockType) {
    this.send('block:update', { x, y, z, block });
  }

  public sendChat(text: string) {
    this.send('chat:send', { text });
  }

  public sendFriendRequest(target: string) {
    this.send('friend:request', { target });
  }

  public respondFriendRequest(requestId: string, accept: boolean) {
    this.send('friend:respond', { requestId, accept });
  }

  public inviteFriend(friendId: string) {
    this.send('friend:invite', { friendId });
  }

  public dispose() {
    this.closed = true;
    this.lockAbort?.abort();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = null;
  }
}
