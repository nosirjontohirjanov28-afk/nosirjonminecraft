import React, { useEffect, useState } from 'react';
import {
  Check,
  Compass,
  Copy,
  Gamepad2,
  Globe,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Mountain,
  Play,
  Plus,
  RefreshCw,
  Sliders,
  Sparkles,
  Sun,
  Trees,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { soundEngine } from '../engine/audio';
import {
  BiomePreset,
  GameMode,
  GamePhase,
  GameSettings,
  OnlinePlayerEntry,
  ServerInviteEntry,
  ServerRoomSummary,
  SocialStatePayload,
} from '../types/game';

interface NeonMenuProps {
  phase: GamePhase;
  wsConnected: boolean;
  playerId: string;
  playerNickname: string;
  friendCode: string;
  currentRoom: ServerRoomSummary | null;
  servers: ServerRoomSummary[];
  onlinePlayers: OnlinePlayerEntry[];
  social: SocialStatePayload;
  invites: ServerInviteEntry[];
  notice: { kind: 'info' | 'success' | 'error'; message: string } | null;
  settings: GameSettings;
  onUpdateNickname: (name: string) => void;
  onResumeGame: () => void;
  onCreateServer: (opts: {
    name: string;
    preset: BiomePreset;
    seed: string;
    gameMode: GameMode;
    isPublic: boolean;
  }) => void;
  onJoinServer: (code: string) => void;
  onLeaveServer: () => void;
  onSendFriendRequest: (target: string) => void;
  onRespondFriendRequest: (requestId: string, accept: boolean) => void;
  onInviteFriend: (friendId: string) => void;
  onDismissInvite: (inviteId: string) => void;
  onUpdateSettings: (next: GameSettings) => void;
}

type MenuTab = 'servers' | 'friends' | 'settings' | 'controls';

const BIOMES: Array<{
  id: BiomePreset;
  title: string;
  summary: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'emerald-valley',
    title: 'Zumrad Vodiy',
    summary: 'Quyoshli tepaliklar, eman o‘rmonlari va sokin ko‘rfazlar',
    icon: <Trees className="w-4 h-4 text-sky-400" />,
  },
  {
    id: 'neon-archipelago',
    title: 'Neon Arxipelagi',
    summary: 'Okean orollari va ko‘k nurli neon ustunlari',
    icon: <Sparkles className="w-4 h-4 text-sky-400" />,
  },
  {
    id: 'alpine-peaks',
    title: 'Alp Cho‘qqilari',
    summary: 'Qorli tog‘ tizmalari va muzlik vodiylari',
    icon: <Mountain className="w-4 h-4 text-sky-400" />,
  },
];

const PRESET_LABELS: Record<BiomePreset, string> = {
  'emerald-valley': 'Zumrad Vodiy',
  'neon-archipelago': 'Neon Arxipelagi',
  'alpine-peaks': 'Alp Cho‘qqilari',
};

const TIME_PRESETS = [
  { label: 'Tong', hour: 6.5 },
  { label: 'Kun', hour: 11.0 },
  { label: 'Shom', hour: 17.8 },
  { label: 'Tun', hour: 23.0 },
];

function formatHour(h: number): string {
  const whole = Math.floor(h) % 24;
  const mins = Math.floor((h - Math.floor(h)) * 60);
  return `${String(whole).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function SlotMeter({ count, max }: { count: number; max: number }) {
  const total = Math.max(1, max);
  return (
    <div className="inline-flex items-center gap-1" aria-label={`${count} / ${total} joy`}>
      {Array.from({ length: total }).map((_, idx) => (
        <span
          key={idx}
          className={`w-2.5 h-2.5 rounded-[3px] border ${
            idx < count
              ? 'bg-sky-400 border-sky-200 shadow-[0_0_6px_rgba(56,189,248,0.65)]'
              : 'bg-[#07132a] border-sky-500/30'
          }`}
        />
      ))}
    </div>
  );
}

export const NeonMenu: React.FC<NeonMenuProps> = ({
  phase,
  wsConnected,
  playerId,
  playerNickname,
  friendCode,
  currentRoom,
  servers,
  onlinePlayers,
  social,
  invites,
  notice,
  settings,
  onUpdateNickname,
  onResumeGame,
  onCreateServer,
  onJoinServer,
  onLeaveServer,
  onSendFriendRequest,
  onRespondFriendRequest,
  onInviteFriend,
  onDismissInvite,
  onUpdateSettings,
}) => {
  const [tab, setTab] = useState<MenuTab>('servers');
  const [nickDraft, setNickDraft] = useState(playerNickname);
  const [joinCode, setJoinCode] = useState('');
  const [serverName, setServerName] = useState('Do‘stlar Survival Olami');
  const [serverPreset, setServerPreset] = useState<BiomePreset>('emerald-valley');
  const [serverSeed, setServerSeed] = useState('AETHER-404');
  const [serverGameMode, setServerGameMode] = useState<GameMode>('survival');
  const [isPublicServer, setIsPublicServer] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [friendTarget, setFriendTarget] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setNickDraft(playerNickname);
  }, [playerNickname]);

  if (phase === 'playing') return null;

  const copyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  };

  const buildInviteLink = (roomCode: string) => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('server', roomCode);
    if (friendCode) url.searchParams.set('friend', friendCode);
    return url.toString();
  };

  const handleRandomSeed = () => {
    soundEngine.playMenuClick();
    const words = ['ORION', 'COBALT', 'ATLAS', 'VORTEX', 'AETHER', 'NOVA', 'ZENITH'];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(100 + Math.random() * 899);
    setServerSeed(`${word}-${num}`);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCode.trim().toUpperCase();
    if (!clean) return;
    soundEngine.playMenuClick();
    onJoinServer(clean);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.playMenuClick();
    onCreateServer({
      name: serverName.trim() || `${nickDraft || playerNickname} olami`,
      preset: serverPreset,
      seed: serverSeed.trim() || 'AETHER-404',
      gameMode: serverGameMode,
      isPublic: isPublicServer,
    });
    setShowCreateForm(false);
  };

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendTarget.trim()) return;
    soundEngine.playMenuClick();
    onSendFriendRequest(friendTarget.trim());
    setFriendTarget('');
  };

  const pendingCount = social.incomingRequests.length + invites.length;
  const friendIdSet = new Set(social.friends.map((f) => f.playerId));
  const outgoingIdSet = new Set(social.outgoingRequests.map((r) => r.toId));
  const otherOnlinePlayers = onlinePlayers.filter((p) => p.playerId !== playerId);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6 bg-[#020817]/65 overflow-y-auto">
      <div className="neon-panel w-full max-w-4xl rounded-2xl p-5 sm:p-7 text-slate-100 my-auto">
        {/* Top Brand + Profile Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-sky-400/20">
          <div>
            <div className="flex items-center gap-2.5 text-xs font-medium text-sky-400">
              <span>{phase === 'paused' ? 'O‘yin pauzada' : 'Onlayn 3D Voxel Olam'}</span>
              <span aria-hidden="true">·</span>
              <span className={wsConnected ? 'text-sky-300' : 'text-amber-300'}>
                {wsConnected
                  ? `Server ulangan (${onlinePlayers.length} onlayn)`
                  : 'Ulanmoqda...'}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white neon-text-glow mt-0.5">
              MINECRAFT ONLINE WORLD
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Nickname & Friend Code */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#040d21] border border-sky-500/30">
              <input
                type="text"
                value={nickDraft}
                maxLength={20}
                onChange={(e) => setNickDraft(e.target.value)}
                onBlur={() => {
                  if (nickDraft.trim() && nickDraft.trim() !== playerNickname) {
                    onUpdateNickname(nickDraft.trim());
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nickDraft.trim()) {
                    onUpdateNickname(nickDraft.trim());
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                aria-label="O‘yinchi ismi"
                className="w-28 sm:w-32 bg-transparent text-xs font-semibold text-white focus:outline-none"
              />
              <span className="text-sky-500/40" aria-hidden="true">
                |
              </span>
              <button
                type="button"
                onClick={() => copyText('friend', friendCode)}
                title="Do‘st kodingizni nusxalash"
                className="inline-flex items-center gap-1 text-[11px] font-mono-tabular text-sky-300 hover:text-white cursor-pointer"
              >
                <span>{friendCode || 'MCO-...'}</span>
                {copiedKey === 'friend' ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>

            {currentRoom ? (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuClick();
                  onResumeGame();
                }}
                className="neon-button-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-display font-bold text-sm text-white tracking-wide transition-transform active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Davom etish ({currentRoom.code})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuClick();
                  onJoinServer('WORLD1');
                }}
                className="neon-button-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-display font-bold text-sm text-white tracking-wide transition-transform active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Tezkor kirish
              </button>
            )}
          </div>
        </div>

        {/* Notice / Error Banner */}
        {notice && (
          <div
            className={`mt-4 px-4 py-2.5 rounded-xl border text-xs font-medium ${
              notice.kind === 'error'
                ? 'bg-red-950/60 border-red-400/50 text-red-200'
                : notice.kind === 'success'
                  ? 'bg-emerald-950/60 border-emerald-400/50 text-emerald-200'
                  : 'bg-sky-950/60 border-sky-400/40 text-sky-200'
            }`}
          >
            {notice.message}
          </div>
        )}

        {/* Incoming Server Invites */}
        {invites.length > 0 && (
          <div className="mt-4 space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-sky-500/15 border border-sky-400/50"
              >
                <span className="text-xs text-sky-100">
                  <strong>{inv.fromName}</strong> sizni{' '}
                  <strong>{inv.roomName}</strong> ({inv.roomCode}) serveriga taklif qildi
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playMenuClick();
                      onJoinServer(inv.roomCode);
                      onDismissInvite(inv.id);
                    }}
                    className="px-3 py-1 rounded-lg bg-sky-500 text-white text-xs font-bold hover:bg-sky-400 cursor-pointer"
                  >
                    Qo‘shilish
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissInvite(inv.id)}
                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 mt-4 p-1 rounded-xl bg-[#040d21] border border-sky-500/20 w-fit">
          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuClick();
              setTab('servers');
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'servers'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Compass className="w-4 h-4" />
            Olamlar va Serverlar
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuClick();
              setTab('friends');
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'friends'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Users className="w-4 h-4" />
            Do‘stlar ({social.friends.length})
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-sky-500 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuClick();
              setTab('settings');
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'settings'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Grafika va Kamera
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuClick();
              setTab('controls');
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'controls'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            Boshqaruv
          </button>
        </div>

        {/* TAB 1: WORLDS & SERVERS */}
        {tab === 'servers' && (
          <div className="mt-5 space-y-5">
            {currentRoom && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-sky-500/12 border border-sky-400/40">
                <div>
                  <div className="flex items-center gap-2 text-xs text-sky-300 font-semibold">
                    <span>Faol Server</span>
                    <span aria-hidden="true">·</span>
                    <span>{currentRoom.gameMode === 'creative' ? 'Kreativ' : 'Survival'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {currentRoom.playerCount} / {currentRoom.maxPlayers || 6} joy
                    </span>
                    <SlotMeter
                      count={currentRoom.playerCount}
                      max={currentRoom.maxPlayers || 6}
                    />
                  </div>
                  <div className="font-display text-base font-bold text-white mt-0.5">
                    {currentRoom.name}{' '}
                    <span className="font-mono-tabular text-sky-300 text-sm">
                      #{currentRoom.code}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyText('room', currentRoom.code)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#040d21] border border-sky-400/40 text-xs font-semibold text-sky-200 hover:text-white cursor-pointer"
                  >
                    {copiedKey === 'room' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedKey === 'room' ? 'Nusxalandi' : 'Kodni nusxalash'}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText('link', buildInviteLink(currentRoom.code))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/50 text-xs font-semibold text-sky-100 hover:bg-sky-500/35 cursor-pointer"
                  >
                    {copiedKey === 'link' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Link2 className="w-3.5 h-3.5" />
                    )}
                    {copiedKey === 'link' ? 'Havola nusxalandi!' : 'Taklif havolasi'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playMenuClick();
                      onLeaveServer();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#040d21] border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Chiqish
                  </button>
                </div>
              </div>
            )}

            {/* Join by Code + Create Server Action Bar */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <form
                onSubmit={handleJoinSubmit}
                className="md:col-span-7 flex items-center gap-2 p-2 rounded-xl bg-[#040d21] border border-sky-500/25"
              >
                <KeyRound className="w-4 h-4 text-sky-400 ml-2 shrink-0" />
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Server kodini kiriting (masalan: WORLD1)"
                  maxLength={10}
                  className="flex-1 bg-transparent text-sm font-mono-tabular text-white placeholder:text-slate-500 focus:outline-none uppercase"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Kod bilan kirish
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuClick();
                  setShowCreateForm((v) => !v);
                }}
                className="md:col-span-5 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-500/15 border border-sky-400/50 hover:bg-sky-500/25 text-sm font-semibold text-sky-200 hover:text-white transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {showCreateForm ? 'Yaratishni yopish' : 'Olam va Server yaratish'}
              </button>
            </div>

            {/* Create World & Server Form */}
            {showCreateForm && (
              <form
                onSubmit={handleCreateSubmit}
                className="p-4 rounded-xl bg-[#040d21]/95 border border-sky-400/35 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-sky-300 block mb-1">
                      Server / Olam nomi
                    </label>
                    <input
                      type="text"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      maxLength={32}
                      placeholder="Do‘stlar Neon Olami"
                      className="w-full px-3 py-2 rounded-lg bg-[#07132a] border border-sky-500/30 text-sm text-white focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-sky-300 block mb-1">
                      Olam urug‘i (Seed)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={serverSeed}
                        onChange={(e) => setServerSeed(e.target.value)}
                        maxLength={24}
                        className="flex-1 px-3 py-2 rounded-lg bg-[#07132a] border border-sky-500/30 text-sm font-mono-tabular text-white focus:outline-none focus:border-sky-400"
                      />
                      <button
                        type="button"
                        onClick={handleRandomSeed}
                        title="Tasodifiy urug‘"
                        className="px-3 py-2 rounded-lg bg-[#07132a] border border-sky-500/30 text-sky-300 hover:text-white cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-sky-300 block mb-2">
                    Biom turini tanlang
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {BIOMES.map((b) => {
                      const active = serverPreset === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setServerPreset(b.id)}
                          className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                            active
                              ? 'bg-sky-500/20 border-sky-400'
                              : 'bg-[#07132a]/80 border-sky-500/20 hover:border-sky-400/45'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-display text-xs font-bold text-white">
                            {b.icon}
                            {b.title}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">{b.summary}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setServerGameMode('survival')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        serverGameMode === 'survival'
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-[#07132a] border-slate-700 text-slate-400'
                      }`}
                    >
                      Survival (Omon qolish)
                    </button>
                    <button
                      type="button"
                      onClick={() => setServerGameMode('creative')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        serverGameMode === 'creative'
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-[#07132a] border-slate-700 text-slate-400'
                      }`}
                    >
                      Kreativ (Cheksiz)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPublicServer(true)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        isPublicServer
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-[#07132a] border-slate-700 text-slate-400'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" /> Ommaviy
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPublicServer(false)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        !isPublicServer
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-[#07132a] border-slate-700 text-slate-400'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" /> Yopiq kodli
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="neon-button-primary px-5 py-2.5 rounded-xl font-display font-bold text-xs sm:text-sm text-white cursor-pointer shrink-0"
                  >
                    Serverni ishga tushirish
                  </button>
                </div>
              </form>
            )}

            {/* Public Servers List */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-sky-300/90">
                  Ommaviy Onlayn Serverlar ({servers.length}) · Har bir serverda 6 ta joy
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {servers.map((srv) => {
                  const isCurrent = currentRoom?.code === srv.code;
                  const maxSlots = srv.maxPlayers || 6;
                  const isFull = srv.playerCount >= maxSlots && !isCurrent;
                  return (
                    <div
                      key={srv.code}
                      className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border ${
                        isCurrent
                          ? 'bg-sky-500/15 border-sky-400'
                          : 'bg-[#040d21]/90 border-sky-500/20'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-sm text-white truncate">
                            {srv.name}
                          </span>
                          <span className="font-mono-tabular text-[11px] text-sky-300">
                            {srv.code}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                          <span>{srv.gameMode === 'creative' ? 'Kreativ' : 'Survival'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{PRESET_LABELS[srv.preset] ?? srv.preset}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular text-sky-200">
                            {srv.playerCount}/{maxSlots}
                          </span>
                          <SlotMeter count={srv.playerCount} max={maxSlots} />
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                          Yaratuvchi: {srv.hostName}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isFull}
                        onClick={() => {
                          soundEngine.playMenuClick();
                          if (isCurrent) onResumeGame();
                          else onJoinServer(srv.code);
                        }}
                        className={`px-3.5 py-1.5 rounded-lg border text-xs font-bold transition-colors shrink-0 ${
                          isFull
                            ? 'bg-[#07132a] border-slate-700 text-slate-500 cursor-not-allowed'
                            : 'bg-sky-500/20 border-sky-400/50 hover:bg-sky-500 text-sky-200 hover:text-white cursor-pointer'
                        }`}
                      >
                        {isCurrent ? 'Davom etish' : isFull ? 'To‘lgan (6/6)' : 'Kirish'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FRIENDS, ONLINE PLAYERS & REQUESTS */}
        {tab === 'friends' && (
          <div className="mt-5 space-y-5">
            <form
              onSubmit={handleAddFriend}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-xl bg-[#040d21] border border-sky-500/25"
            >
              <div className="flex items-center gap-2 flex-1 px-2">
                <UserPlus className="w-4 h-4 text-sky-400 shrink-0" />
                <input
                  type="text"
                  value={friendTarget}
                  onChange={(e) => setFriendTarget(e.target.value)}
                  placeholder="Do‘st kodi (masalan: MCO-AB12) yoki o‘yinchi ismi"
                  className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Do‘stlik so‘rovi yuborish
              </button>
            </form>

            {/* Incoming Requests */}
            {social.incomingRequests.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-sky-300 block mb-2">
                  Kelgan do‘stlik so‘rovlari ({social.incomingRequests.length})
                </span>
                <div className="space-y-2">
                  {social.incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-sky-500/12 border border-sky-400/40"
                    >
                      <div className="text-xs">
                        <span className="font-bold text-white">{req.fromName}</span>{' '}
                        <span className="font-mono-tabular text-sky-300">
                          ({req.fromCode})
                        </span>{' '}
                        <span className="text-slate-300">sizga do‘stlik tashladi</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playMenuClick();
                            onRespondFriendRequest(req.id, true);
                          }}
                          className="px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white cursor-pointer"
                        >
                          Qabul qilish
                        </button>
                        <button
                          type="button"
                          onClick={() => onRespondFriendRequest(req.id, false)}
                          className="px-3 py-1 rounded-lg bg-[#040d21] border border-slate-700 text-xs text-slate-300 hover:text-white cursor-pointer"
                        >
                          Rad etish
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friends List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-sky-300">
                  Do‘stlarim ({social.friends.length})
                </span>
                {social.outgoingRequests.length > 0 && (
                  <span className="text-[11px] text-slate-400">
                    {social.outgoingRequests.length} ta yuborilgan so‘rov kutilmoqda
                  </span>
                )}
              </div>

              {social.friends.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#040d21]/70 border border-sky-500/15 text-center text-xs text-slate-400">
                  Hozircha do‘stlar yo‘q. Do‘st kodingiz{' '}
                  <span className="font-mono-tabular text-sky-300 font-semibold">
                    {friendCode}
                  </span>{' '}
                  ni ulashing yoki quyidagi onlayn o‘yinchilarga do‘stlik tashlang!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-44 overflow-y-auto pr-1">
                  {social.friends.map((f) => (
                    <div
                      key={f.playerId}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#040d21]/90 border border-sky-500/20"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white truncate">
                            {f.nickname}
                          </span>
                          <span className="font-mono-tabular text-[11px] text-sky-300">
                            {f.friendCode}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {f.online
                            ? f.currentRoomCode
                              ? `${f.currentRoomName} (${f.currentRoomCode}) da o‘ynamoqda`
                              : 'Onlayn (menyuda)'
                            : 'Oflayn'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {f.online &&
                          f.currentRoomCode &&
                          f.currentRoomCode !== currentRoom?.code && (
                            <button
                              type="button"
                              onClick={() => {
                                soundEngine.playMenuClick();
                                onJoinServer(f.currentRoomCode!);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white cursor-pointer"
                            >
                              Birga kirish
                            </button>
                          )}
                        {f.online && currentRoom && f.currentRoomCode !== currentRoom.code && (
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playMenuClick();
                              onInviteFriend(f.playerId);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/40 hover:bg-sky-500/35 text-xs font-semibold text-sky-200 cursor-pointer"
                          >
                            Taklif qilish
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Real Online Players Right Now */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-sky-300">
                  Hozir onlayn o‘yinchilar ({otherOnlinePlayers.length})
                </span>
                {currentRoom && (
                  <button
                    type="button"
                    onClick={() => copyText('link2', buildInviteLink(currentRoom.code))}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-white cursor-pointer"
                  >
                    {copiedKey === 'link2' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Link2 className="w-3 h-3" />
                    )}
                    {copiedKey === 'link2'
                      ? 'Taklif havolasi nusxalandi!'
                      : 'Do‘stlarni havola bilan chaqirish'}
                  </button>
                )}
              </div>

              {otherOnlinePlayers.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-[#040d21]/60 border border-sky-500/15 text-xs text-slate-400">
                  Hozircha boshqa onlayn o‘yinchi ulanmagan. Do‘stingizga{' '}
                  {currentRoom ? (
                    <>
                      <span className="font-mono-tabular text-sky-300 font-semibold">
                        {currentRoom.code}
                      </span>{' '}
                      server kodini yoki taklif havolasini yuboring!
                    </>
                  ) : (
                    'server yarating yoki kodni ulashing!'
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-40 overflow-y-auto pr-1">
                  {otherOnlinePlayers.map((op) => {
                    const isFriend = friendIdSet.has(op.playerId);
                    const isPending = outgoingIdSet.has(op.playerId);
                    return (
                      <div
                        key={op.playerId}
                        className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#040d21]/90 border border-sky-500/20"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-white truncate">
                              {op.nickname}
                            </span>
                            <span className="font-mono-tabular text-[10px] text-sky-300">
                              {op.friendCode}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {op.roomCode
                              ? `${op.roomName} (${op.roomCode})`
                              : 'Menyuda'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isFriend && !isPending && (
                            <button
                              type="button"
                              onClick={() => {
                                soundEngine.playMenuClick();
                                onSendFriendRequest(op.friendCode);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-400/50 hover:bg-sky-500 text-[11px] font-bold text-sky-200 hover:text-white cursor-pointer"
                            >
                              <UserPlus className="w-3 h-3" /> Do‘st qo‘shish
                            </button>
                          )}
                          {isPending && (
                            <span className="text-[10px] text-amber-300 font-medium px-1.5">
                              Yuborildi
                            </span>
                          )}
                          {currentRoom && op.roomCode !== currentRoom.code && (
                            <button
                              type="button"
                              onClick={() => {
                                soundEngine.playMenuClick();
                                onInviteFriend(op.playerId);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-[11px] font-bold text-white cursor-pointer"
                            >
                              Serverga taklif
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: GRAPHICS & CAMERA */}
        {tab === 'settings' && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-medium mb-1.5">
                  <span className="text-slate-300">Ko‘rish burchagi (FOV)</span>
                  <span className="font-mono-tabular text-sky-300">{settings.fov}°</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={105}
                  step={1}
                  value={settings.fov}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, fov: Number(e.target.value) })
                  }
                  className="neon-slider w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium mb-1.5">
                  <span className="text-slate-300">Kamera sezgirligi</span>
                  <span className="font-mono-tabular text-sky-300">
                    {settings.sensitivity.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={2.2}
                  step={0.1}
                  value={settings.sensitivity}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      sensitivity: Number(e.target.value),
                    })
                  }
                  className="neon-slider w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium mb-1.5">
                  <span className="text-slate-300">Ko‘rish masofasi</span>
                  <span className="font-mono-tabular text-sky-300">
                    {settings.renderDistance} bo‘lak
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={5}
                  step={1}
                  value={settings.renderDistance}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      renderDistance: Number(e.target.value),
                    })
                  }
                  className="neon-slider w-full"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                  <span className="inline-flex items-center gap-1.5 text-slate-300">
                    <Sun className="w-3.5 h-3.5 text-sky-400" />
                    Kun vaqti
                  </span>
                  <span className="font-mono-tabular text-sky-300">
                    {formatHour(settings.timeOfDay)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={0.25}
                  value={settings.timeOfDay}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      timeOfDay: Number(e.target.value),
                    })
                  }
                  className="neon-slider w-full"
                />
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {TIME_PRESETS.map((tp) => (
                    <button
                      key={tp.label}
                      type="button"
                      onClick={() => {
                        soundEngine.playMenuClick();
                        onUpdateSettings({ ...settings, timeOfDay: tp.hour });
                      }}
                      className="px-2 py-1.5 rounded-lg bg-[#040d21] border border-sky-500/25 hover:border-sky-400 text-xs font-medium text-sky-200 transition-colors cursor-pointer"
                    >
                      {tp.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-slate-200 font-medium">Dinamik soyalar</span>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuClick();
                    onUpdateSettings({ ...settings, shadows: !settings.shadows });
                  }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    settings.shadows
                      ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                      : 'bg-[#040d21] border-slate-700 text-slate-400'
                  }`}
                >
                  {settings.shadows ? 'Yoqilgan' : 'O‘chirilgan'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-200 font-medium">Ovoz effektlari</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = !settings.soundEnabled;
                    onUpdateSettings({ ...settings, soundEnabled: next });
                    if (next) soundEngine.playMenuClick();
                  }}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    settings.soundEnabled
                      ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                      : 'bg-[#040d21] border-slate-700 text-slate-400'
                  }`}
                >
                  {settings.soundEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5" /> Yoqilgan
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5" /> O‘chirilgan
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONTROLS */}
        {tab === 'controls' && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
            {[
              ['W A S D / Strelkalar', 'O‘yinchini harakatlantirish'],
              ['Sichqoncha', 'Atrofga qarash (ekranni bosing)'],
              ['Probel (x2)', 'Sakrash / 2 marta bossangiz uchish'],
              ['Shift', 'Tez yugurish / Uchishni tezlashtirish'],
              ['F', 'Yurish va Uchish rejimini almashtirish'],
              ['C yoki I', 'Survival Inventar, Verstak va Retseptlar'],
              ['Chap tugma (bosib turish)', 'Blok qazish / Qilich bilan hujum qilish'],
              ['O‘ng tugma / E', 'Blok qo‘yish / Verstak va Pechni ochish / Ovqat yeyish'],
              ['V', '1-shaxs va 3-shaxs kamerasini almashtirish'],
              ['T yoki Enter', 'Do‘stlar bilan chatni ochish va yozish'],
              ['1 – 9 / B', 'Tezkor panel uyachasi / Kreativ buyumlar'],
              ['Esc', 'Serverlar, Do‘stlar va Menyuni ochish'],
            ].map(([keyLabel, desc]) => (
              <div
                key={keyLabel}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#040d21]/90 border border-sky-500/20"
              >
                <span className="font-mono-tabular text-xs font-semibold text-sky-300 whitespace-nowrap">
                  {keyLabel}
                </span>
                <span className="text-xs text-slate-300 text-right">{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
