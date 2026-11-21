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

export type ConnectionState = 'connecting' | 'online' | 'offline';

export interface NetworkCallbacks {
  onConnected: (connected: boolean) => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
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
  private connectTimeoutTimer: number | null = null;
  private closed = false;
  private lastMoveSent = 0;
  private lockAbort: AbortController | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private readonly tabNonce = `t_${Math.random().toString(36).slice(2, 10)}`;
  private connected = false;

  public playerId = '';
  public nickname = '';

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
    window.addEventListener('online', this.handleWindowOnline);
    window.addEventListener('offline', this.handleWindowOffline);
    void this.initIdentityAndConnect();
  }

  public isConnected(): boolean {
    return this.connected && Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  private setConnState(state: ConnectionState) {
    this.connected = state === 'online';
    this.callbacks.onConnected(this.connected);
    this.callbacks.onConnectionStateChange?.(state);
  }

  private handleWindowOnline = () => {
    if (this.closed) return;
    if (!this.isConnected()) {
      if (this.reconnectTimer !== null) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.connect();
    }
  };

  private handleWindowOffline = () => {
    if (this.closed) return;
    this.setConnState('offline');
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  };

  private async checkTabCollision(candidateId: string): Promise<boolean> {
    if (typeof BroadcastChannel === 'undefined' || !candidateId) return false;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const probe = new BroadcastChannel('mcow_tab_presence');
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        probe.close();
        resolve(false);
      }, 90);

      probe.onmessage = (ev) => {
        const msg = ev.data as { kind?: string; playerId?: string; tabNonce?: string };
        if (
          !settled &&
          msg?.kind === 'pong' &&
          msg.playerId === candidateId &&
          msg.tabNonce !== this.tabNonce
        ) {
          settled = true;
          clearTimeout(timer);
          probe.close();
          resolve(true);
        }
      };

      probe.postMessage({ kind: 'ping', playerId: candidateId, tabNonce: this.tabNonce });
    });
  }

  private setupPresenceChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.broadcastChannel?.close();
      this.broadcastChannel = new BroadcastChannel('mcow_tab_presence');
      this.broadcastChannel.onmessage = (ev) => {
        const msg = ev.data as { kind?: string; playerId?: string; tabNonce?: string };
        if (msg?.kind === 'ping' && msg.playerId === this.playerId && msg.tabNonce !== this.tabNonce) {
          this.broadcastChannel?.postMessage({
            kind: 'pong',
            playerId: this.playerId,
            tabNonce: this.tabNonce,
          });
        }
      };
    } catch {
      // ignore
    }
  }

  private async initIdentityAndConnect() {
    let tabId = '';
    try {
      tabId = sessionStorage.getItem(SESSION_PLAYER_ID) || '';
    } catch {
      tabId = '';
    }

    // Detect duplicated Chrome tabs that cloned sessionStorage
    if (tabId && (await this.checkTabCollision(tabId))) {
      tabId = '';
    }

    if (tabId) {
      this.playerId = tabId;
      this.nickname = this.getStoredNickname(true);
      this.setupPresenceChannel();
      this.connect();
      return;
    }

    // Check if primary browser profile lock is available (150ms timeout so WebViews never stall)
    let canUsePrimary = true;
    if (typeof navigator !== 'undefined' && navigator.locks) {
      canUsePrimary = await new Promise<boolean>((resolve) => {
        let done = false;
        const guard = window.setTimeout(() => {
          if (!done) {
            done = true;
            resolve(true);
          }
        }, 150);

        navigator.locks
          .request('mcow_primary_profile_lock', { ifAvailable: true }, (lock) => {
            if (done) return;
            done = true;
            clearTimeout(guard);
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
          .catch(() => {
            if (!done) {
              done = true;
              clearTimeout(guard);
              resolve(true);
            }
          });
      });
    }

    if (this.closed) return;

    if (canUsePrimary) {
      const localId = this.getOrCreateLocalId();
      if (await this.checkTabCollision(localId)) {
        this.playerId = `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
        this.nickname = `Oyinchi_${this.playerId.slice(-4).toUpperCase()}`;
      } else {
        this.playerId = localId;
        this.nickname = this.getStoredNickname(false);
      }
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

    this.setupPresenceChannel();
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

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer !== null) return;
    const delay = typeof navigator !== 'undefined' && !navigator.onLine ? 6000 : 3500;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private connect() {
    if (this.closed) return;

    // Immediately report offline when browser has no network instead of stalling on "Ulanmoqda..."
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setConnState('offline');
      this.scheduleReconnect();
      return;
    }

    this.setConnState('connecting');
    if (this.connectTimeoutTimer !== null) {
      clearTimeout(this.connectTimeoutTimer);
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      this.setConnState('offline');
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    // If handshake does not complete within 2.5s, fall back cleanly to offline-ready mode
    this.connectTimeoutTimer = window.setTimeout(() => {
      this.connectTimeoutTimer = null;
      if (!this.closed && ws.readyState !== WebSocket.OPEN) {
        this.setConnState('offline');
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    }, 2500);

    ws.onopen = () => {
      if (this.connectTimeoutTimer !== null) {
        clearTimeout(this.connectTimeoutTimer);
        this.connectTimeoutTimer = null;
      }
      this.setConnState('online');
      ws.send(
        JSON.stringify({
          type: 'auth:hello',
          payload: {
            playerId: this.playerId,
            nickname: this.nickname,
            tabNonce: this.tabNonce,
          },
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
        case 'auth:welcome': {
          const info = msg.payload as Parameters<NetworkCallbacks['onWelcome']>[0];
          this.playerId = info.playerId;
          this.nickname = info.nickname;
          try {
            sessionStorage.setItem(SESSION_PLAYER_ID, info.playerId);
            sessionStorage.setItem(SESSION_NICKNAME, info.nickname);
          } catch {
            // ignore
          }
          this.callbacks.onWelcome(info);
          break;
        }
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

    ws.onerror = () => {
      if (this.connectTimeoutTimer !== null) {
        clearTimeout(this.connectTimeoutTimer);
        this.connectTimeoutTimer = null;
      }
      this.setConnState('offline');
    };

    ws.onclose = () => {
      if (this.connectTimeoutTimer !== null) {
        clearTimeout(this.connectTimeoutTimer);
        this.connectTimeoutTimer = null;
      }
      if (this.ws === ws) {
        this.ws = null;
      }
      this.setConnState('offline');
      this.scheduleReconnect();
    };
  }

  public send(type: string, payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    } else if (type === 'profile:update') {
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
    maxPlayers?: number;
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
    if (!this.isConnected()) return;
    const now = performance.now();
    if (now - this.lastMoveSent < 50) return;
    this.lastMoveSent = now;
    this.send('player:move', state);
  }

  public sendSwing() {
    if (!this.isConnected()) return;
    this.send('player:swing', {});
  }

  public sendBlockUpdate(x: number, y: number, z: number, block: BlockType) {
    if (!this.isConnected()) return;
    this.send('block:update', { x, y, z, block });
  }

  public sendChat(text: string) {
    if (!this.isConnected()) return;
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
    window.removeEventListener('online', this.handleWindowOnline);
    window.removeEventListener('offline', this.handleWindowOffline);
    this.broadcastChannel?.close();
    this.broadcastChannel = null;
    this.lockAbort?.abort();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.connectTimeoutTimer !== null) {
      clearTimeout(this.connectTimeoutTimer);
    }
    this.ws?.close();
    this.ws = null;
  }
}
