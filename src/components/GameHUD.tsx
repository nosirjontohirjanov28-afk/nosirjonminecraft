import React, { useEffect, useRef, useState } from 'react';
import {
  Apple,
  Box,
  Camera,
  Check,
  Copy,
  Feather,
  Footprints,
  Hammer,
  Heart,
  Link2,
  Menu,
  MessageSquare,
  Pickaxe,
  PlusSquare,
  RotateCcw,
  Send,
  UserPlus,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import {
  ALL_CREATIVE_ITEMS,
  BlockType,
  ChatMessage,
  ITEM_DEFINITIONS,
  InventorySlot,
  ItemId,
  PlayerHudState,
  RemotePlayerState,
  ServerInviteEntry,
  ServerRoomSummary,
} from '../types/game';

interface GameHUDProps {
  hud: PlayerHudState;
  currentRoom: ServerRoomSummary | null;
  friendCode: string;
  remotePlayers: RemotePlayerState[];
  friendIds: Set<string>;
  chatMessages: ChatMessage[];
  invites: ServerInviteEntry[];
  hotbarSlots: Array<InventorySlot | null>;
  selectedSlot: number;
  itemThumbnails: Record<string, string>;
  onSelectSlot: (idx: number) => void;
  onAssignCreativeSlot: (slotIdx: number, itemId: ItemId) => void;
  onOpenInventory: () => void;
  onEatHeld: () => void;
  onRespawn: () => void;
  onToggleCamera: () => void;
  onToggleFly: () => void;
  onOpenMenu: () => void;
  onSendChat: (text: string) => void;
  onChatActiveChange: (active: boolean) => void;
  onAddFriend: (target: string) => void;
  onJoinServer: (code: string) => void;
  onDismissInvite: (id: string) => void;
  onVirtualKey: (code: string, down: boolean) => void;
  onVirtualJump: () => void;
  onMobileActionMode: (mode: 'break' | 'place') => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  currentRoom,
  friendCode,
  remotePlayers,
  friendIds,
  chatMessages,
  invites,
  hotbarSlots,
  selectedSlot,
  itemThumbnails,
  onSelectSlot,
  onAssignCreativeSlot,
  onOpenInventory,
  onEatHeld,
  onRespawn,
  onToggleCamera,
  onToggleFly,
  onOpenMenu,
  onSendChat,
  onChatActiveChange,
  onAddFriend,
  onJoinServer,
  onDismissInvite,
  onVirtualKey,
  onVirtualJump,
  onMobileActionMode,
}) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [touchMode, setTouchMode] = useState<'break' | 'place'>('break');

  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onChatActiveChange(chatOpen);
    if (chatOpen) {
      if (document.pointerLockElement) document.exitPointerLock();
      window.setTimeout(() => chatInputRef.current?.focus(), 20);
    }
  }, [chatOpen, onChatActiveChange]);

  useEffect(() => {
    if (paletteOpen && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [paletteOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (chatOpen) {
        if (e.code === 'Escape') {
          e.preventDefault();
          setChatOpen(false);
        }
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'KeyB' && hud.gameMode === 'creative') {
        setPaletteOpen((prev) => !prev);
      } else if (e.code === 'KeyC' || e.code === 'KeyI' || (e.code === 'KeyB' && hud.gameMode === 'survival')) {
        e.preventDefault();
        onOpenInventory();
      } else if (e.code === 'KeyT' || e.code === 'Enter') {
        e.preventDefault();
        setChatOpen(true);
      } else if (e.code === 'KeyP') {
        setPlayersOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatOpen, hud.gameMode, onOpenInventory]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = chatDraft.trim();
    if (clean) {
      onSendChat(clean);
      setChatDraft('');
    }
    setChatOpen(false);
  };

  const copyInviteLink = () => {
    if (!currentRoom) return;
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('server', currentRoom.code);
    if (friendCode) url.searchParams.set('friend', friendCode);
    navigator.clipboard?.writeText(url.toString()).catch(() => {});
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1800);
  };

  const maxSlots = currentRoom?.maxPlayers || 6;
  const currentPlayersCount = remotePlayers.length + 1;
  const activeSlot = hotbarSlots[selectedSlot] ?? null;
  const activeItemDef = activeSlot ? ITEM_DEFINITIONS[activeSlot.itemId] : null;
  const visibleMessages = chatOpen ? chatMessages.slice(-24) : chatMessages.slice(-5);

  const interactPrompt =
    hud.targetBlockType === BlockType.CRAFTING_TABLE
      ? 'O‘ng tugma / E — Verstakni (3×3) ochish'
      : hud.targetBlockType === BlockType.FURNACE
        ? 'O‘ng tugma / E — Pechni ochish'
        : null;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none">
      {/* Top Bar: Left Server + Coords / Right Action Controls */}
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="pointer-events-auto px-3.5 py-2 rounded-xl bg-[#040c1d]/88 border border-sky-400/35 shadow-[0_0_18px_rgba(14,165,233,0.18)]">
          <div className="flex items-center gap-2.5 text-xs">
            <span className="font-display font-bold text-sky-300 tracking-wide">
              {currentRoom ? currentRoom.name : 'MINECRAFT ONLINE WORLD'}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                hud.gameMode === 'survival'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
              }`}
            >
              {hud.gameMode === 'survival' ? 'Survival' : 'Kreativ'}
            </span>
            {currentRoom && (
              <>
                <span className="text-sky-500/40" aria-hidden="true">
                  /
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(currentRoom.code).catch(() => {});
                    setCopiedCode(true);
                    window.setTimeout(() => setCopiedCode(false), 1500);
                  }}
                  title="Server kodini nusxalash"
                  className="inline-flex items-center gap-1 font-mono-tabular text-sky-200 hover:text-white cursor-pointer"
                >
                  <span>Kod: {currentRoom.code}</span>
                  {copiedCode ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2.5 text-[11px] text-slate-400 mt-0.5">
            <span className="font-mono-tabular text-slate-200">
              X {hud.x} · Y {hud.y} · Z {hud.z}
            </span>
            <span aria-hidden="true">·</span>
            <span>{hud.isFlying ? 'Uchish' : hud.isInWater ? 'Suzish' : 'Yurish'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular text-sky-300">
              {currentPlayersCount}/{maxSlots} o‘yinchi
            </span>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onOpenInventory}
            title="Inventar, Verstak va Retseptlar (C)"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/20 border border-sky-400/50 hover:bg-sky-500/35 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Hammer className="w-3.5 h-3.5 text-sky-300" />
            <span className="hidden sm:inline">Kraft / Inventar</span>
            <span className="text-sky-300 font-mono-tabular">(C)</span>
          </button>

          <button
            type="button"
            onClick={() => setPlayersOpen((v) => !v)}
            title="Server o‘yinchilari va Do‘st qo‘shish (P)"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              playersOpen
                ? 'bg-sky-500/25 border-sky-300 text-white'
                : 'bg-[#040c1d]/88 border-sky-400/35 hover:border-sky-300 text-sky-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">
              O‘yinchilar ({currentPlayersCount}/{maxSlots})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setChatOpen((v) => !v)}
            title="Chat (T)"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              chatOpen
                ? 'bg-sky-500/25 border-sky-300 text-white'
                : 'bg-[#040c1d]/88 border-sky-400/35 hover:border-sky-300 text-sky-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Chat</span>
            <span className="text-sky-400/70 font-mono-tabular">(T)</span>
          </button>

          <button
            type="button"
            onClick={onToggleCamera}
            title="Kamerani almashtirish (V)"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#040c1d]/88 border border-sky-400/35 hover:border-sky-300 text-xs font-semibold text-sky-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Camera className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">
              {hud.cameraMode === 'first-person' ? '1-shaxs' : '3-shaxs'}
            </span>
            <span className="text-sky-400/70 font-mono-tabular">(V)</span>
          </button>

          {hud.gameMode === 'creative' && (
            <>
              <button
                type="button"
                onClick={onToggleFly}
                title="Uchish rejimini almashtirish (F)"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  hud.isFlying
                    ? 'bg-sky-500/25 border-sky-300 text-white shadow-[0_0_14px_rgba(56,189,248,0.35)]'
                    : 'bg-[#040c1d]/88 border-sky-400/35 hover:border-sky-300 text-sky-200'
                }`}
              >
                {hud.isFlying ? (
                  <Feather className="w-3.5 h-3.5 text-sky-300" />
                ) : (
                  <Footprints className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span className="hidden sm:inline">{hud.isFlying ? 'Uchish' : 'Yurish'}</span>
              </button>

              <button
                type="button"
                onClick={() => setPaletteOpen((p) => !p)}
                title="Kreativ buyumlar (B)"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#040c1d]/88 border border-sky-400/35 hover:border-sky-300 text-xs font-semibold text-sky-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Box className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Bloklar</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onOpenMenu}
            title="Serverlar, Do‘stlar va Sozlamalar (Esc)"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#040c1d]/88 border border-sky-400/35 hover:border-sky-300 text-xs font-semibold text-sky-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Menu className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Menyu</span>
          </button>
        </div>
      </div>

      {/* Incoming Friend Invite Toast while in-game */}
      {invites.length > 0 && (
        <div className="pointer-events-auto fixed top-20 left-1/2 -translate-x-1/2 neon-panel rounded-xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs text-sky-100">
            <strong>{invites[0].fromName}</strong> sizni{' '}
            <strong>{invites[0].roomName}</strong> ({invites[0].roomCode}) serveriga taklif qildi
          </span>
          <button
            type="button"
            onClick={() => {
              onJoinServer(invites[0].roomCode);
              onDismissInvite(invites[0].id);
            }}
            className="px-2.5 py-1 rounded-lg bg-sky-500 text-xs font-bold text-white cursor-pointer"
          >
            Qo‘shilish
          </button>
          <button
            type="button"
            onClick={() => onDismissInvite(invites[0].id)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Server Players & Quick Add Friend Popover */}
      {playersOpen && (
        <div className="pointer-events-auto fixed top-20 right-4 w-80 neon-panel rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold text-sky-200">
              Serverdagi o‘yinchilar ({currentPlayersCount}/{maxSlots})
            </span>
            <button
              type="button"
              onClick={() => setPlayersOpen(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {currentRoom && (
            <button
              type="button"
              onClick={copyInviteLink}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/20 border border-sky-400/45 hover:bg-sky-500/35 text-xs font-semibold text-sky-100 cursor-pointer"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              {copiedLink
                ? 'Taklif havolasi nusxalandi!'
                : `Do‘stni taklif qilish (Kod: ${currentRoom.code})`}
            </button>
          )}

          {remotePlayers.length === 0 ? (
            <p className="text-xs text-slate-400">
              Hozircha bu serverda faqat siz borsiz ({maxSlots} ta joydan 1 tasi band). Kod{' '}
              <span className="font-mono-tabular text-sky-300 font-semibold">
                {currentRoom?.code}
              </span>{' '}
              ni do‘stlaringizga yuboring!
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {remotePlayers.map((rp) => {
                const isFriend = friendIds.has(rp.playerId);
                return (
                  <div
                    key={rp.playerId}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#040d21] border border-sky-500/20"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {rp.nickname}
                      </div>
                      <div className="text-[10px] font-mono-tabular text-sky-300/80">
                        {rp.friendCode}
                      </div>
                    </div>
                    {isFriend ? (
                      <span className="text-[11px] font-semibold text-emerald-400">
                        Do‘st
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAddFriend(rp.friendCode)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-400/50 hover:bg-sky-500 text-[11px] font-bold text-sky-200 hover:text-white cursor-pointer"
                      >
                        <UserPlus className="w-3 h-3" /> Do‘st qo‘shish
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Center Crosshair + Target Block/Mob + Mining Progress */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative flex items-center justify-center">
          <div className="w-5 h-0.5 bg-sky-300/90 shadow-[0_0_8px_rgba(56,189,248,0.9)]" />
          <div className="absolute w-0.5 h-5 bg-sky-300/90 shadow-[0_0_8px_rgba(56,189,248,0.9)]" />
          <div className="absolute w-1.5 h-1.5 rounded-full border border-sky-200/80" />
        </div>

        {(hud.targetMobName || hud.targetBlockName || hud.miningHint) && (
          <div className="absolute translate-y-9 flex flex-col items-center gap-1">
            {hud.targetMobName ? (
              <div className="px-2.5 py-1 rounded bg-[#040c1d]/90 border border-red-400/45 text-[11px] font-semibold text-red-200">
                {hud.targetMobName} · {hud.targetMobHp}/{hud.targetMobMaxHp} HP
              </div>
            ) : hud.targetBlockName ? (
              <div className="px-2.5 py-0.5 rounded bg-[#040c1d]/85 border border-sky-400/30 text-[11px] font-medium text-sky-200">
                {hud.targetBlockName}
              </div>
            ) : null}

            {interactPrompt && (
              <div className="px-2.5 py-0.5 rounded bg-sky-500/20 border border-sky-300/60 text-[10px] font-semibold text-sky-100">
                {interactPrompt}
              </div>
            )}

            {hud.miningProgress > 0.02 && (
              <div className="w-32 h-1.5 rounded-full bg-[#040c1d] border border-sky-400/40 overflow-hidden">
                <div
                  className="h-full bg-sky-400"
                  style={{ width: `${Math.min(100, Math.round(hud.miningProgress * 100))}%` }}
                />
              </div>
            )}

            {hud.miningHint && (
              <div className="px-2.5 py-0.5 rounded bg-amber-950/90 border border-amber-400/50 text-[11px] font-semibold text-amber-200">
                {hud.miningHint}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Death & Respawn Overlay */}
      {hud.isDead && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-red-950/55 p-4">
          <div className="neon-panel rounded-2xl p-6 max-w-sm w-full text-center space-y-4 border-red-400/60">
            <h2 className="font-display text-2xl font-extrabold text-red-300">
              Siz halok bo‘ldingiz!
            </h2>
            <p className="text-xs text-slate-300">
              Survival rejimda joningiz tugadi. Boshlang‘ich nuqtaga qaytib o‘yinni davom ettiring.
            </p>
            <button
              type="button"
              onClick={onRespawn}
              className="neon-button-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-display font-bold text-sm text-white cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Qayta tirilish
            </button>
          </div>
        </div>
      )}

      {/* Real-Time Server Chat (Bottom Left) */}
      <div
        className={`fixed left-4 bottom-28 w-[min(360px,84vw)] rounded-xl transition-opacity ${
          chatOpen
            ? 'pointer-events-auto bg-[#040c1d]/94 border border-sky-400/45 shadow-[0_0_24px_rgba(14,165,233,0.25)] p-3'
            : 'pointer-events-none bg-[#040c1d]/65 border border-sky-500/20 p-2.5'
        }`}
      >
        <div className="space-y-1 max-h-44 overflow-y-auto text-xs pr-1">
          {visibleMessages.map((m) => (
            <div key={m.id} className="leading-snug break-words">
              {m.isSystem ? (
                <span className="text-sky-300/90 italic">{m.text}</span>
              ) : (
                <>
                  <span className="font-semibold text-sky-300">{m.senderName}: </span>
                  <span className="text-slate-100">{m.text}</span>
                </>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {chatOpen && (
          <form onSubmit={handleChatSubmit} className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-sky-500/20">
            <input
              ref={chatInputRef}
              type="text"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              maxLength={240}
              placeholder="Do‘stlarga xabar yozing..."
              className="flex-1 bg-[#07132a] border border-sky-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              className="p-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>

      {/* Creative Mode Block & Tool Palette */}
      {paletteOpen && hud.gameMode === 'creative' && (
        <div className="pointer-events-auto fixed bottom-28 left-1/2 -translate-x-1/2 w-[min(600px,92vw)] neon-panel rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-display text-sm font-bold text-sky-200">
              {selectedSlot + 1}-uyacha uchun buyum tanlang
            </span>
            <button
              type="button"
              onClick={() => setPaletteOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto pr-1">
            {ALL_CREATIVE_ITEMS.map((itemId) => {
              const def = ITEM_DEFINITIONS[itemId];
              const isEquipped = activeSlot?.itemId === itemId;
              return (
                <button
                  key={itemId}
                  type="button"
                  onClick={() => {
                    onAssignCreativeSlot(selectedSlot, itemId);
                    setPaletteOpen(false);
                  }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-colors cursor-pointer ${
                    isEquipped
                      ? 'bg-sky-500/25 border-sky-300'
                      : 'bg-[#040c1d] border-sky-500/20 hover:border-sky-400/60'
                  }`}
                >
                  {itemThumbnails[itemId] ? (
                    <img
                      src={itemThumbnails[itemId]}
                      alt={def.name}
                      className="w-9 h-9 object-contain"
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded"
                      style={{ backgroundColor: def.accentColor }}
                    />
                  )}
                  <span className="text-[10px] text-slate-200 truncate w-full text-center">
                    {def.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Touch Controls */}
      <div className="md:hidden fixed bottom-28 left-4 right-4 flex items-end justify-between pointer-events-none">
        <div className="pointer-events-auto grid grid-cols-3 gap-1.5 w-32">
          <div />
          <button
            type="button"
            onPointerDown={() => onVirtualKey('KeyW', true)}
            onPointerUp={() => onVirtualKey('KeyW', false)}
            onPointerLeave={() => onVirtualKey('KeyW', false)}
            className="h-10 rounded-lg bg-[#040c1d]/85 border border-sky-400/40 text-xs font-bold text-sky-200"
          >
            W
          </button>
          <div />
          <button
            type="button"
            onPointerDown={() => onVirtualKey('KeyA', true)}
            onPointerUp={() => onVirtualKey('KeyA', false)}
            onPointerLeave={() => onVirtualKey('KeyA', false)}
            className="h-10 rounded-lg bg-[#040c1d]/85 border border-sky-400/40 text-xs font-bold text-sky-200"
          >
            A
          </button>
          <button
            type="button"
            onPointerDown={() => onVirtualKey('KeyS', true)}
            onPointerUp={() => onVirtualKey('KeyS', false)}
            onPointerLeave={() => onVirtualKey('KeyS', false)}
            className="h-10 rounded-lg bg-[#040c1d]/85 border border-sky-400/40 text-xs font-bold text-sky-200"
          >
            S
          </button>
          <button
            type="button"
            onPointerDown={() => onVirtualKey('KeyD', true)}
            onPointerUp={() => onVirtualKey('KeyD', false)}
            onPointerLeave={() => onVirtualKey('KeyD', false)}
            className="h-10 rounded-lg bg-[#040c1d]/85 border border-sky-400/40 text-xs font-bold text-sky-200"
          >
            D
          </button>
        </div>

        <div className="pointer-events-auto flex flex-col gap-2 items-end">
          <button
            type="button"
            onClick={() => {
              const next = touchMode === 'break' ? 'place' : 'break';
              setTouchMode(next);
              onMobileActionMode(next);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#040c1d]/85 border border-sky-400/45 text-xs font-semibold text-sky-200"
          >
            {touchMode === 'break' ? (
              <>
                <Pickaxe className="w-3.5 h-3.5 text-sky-400" /> Bosish: Qazish
              </>
            ) : (
              <>
                <PlusSquare className="w-3.5 h-3.5 text-sky-400" /> Bosish: Qo‘yish
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onVirtualJump}
            className="px-4 py-2.5 rounded-lg bg-sky-500/25 border border-sky-300 text-xs font-bold text-white"
          >
            Sakrash
          </button>
        </div>
      </div>

      {/* Bottom Center Survival Bars + 9-Slot Hotbar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-auto">
        {hud.gameMode === 'survival' && (
          <div className="w-full max-w-[490px] flex items-center justify-between gap-3 px-2">
            {/* Health Bar */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#040c1d]/88 border border-red-400/35">
              <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
              <div className="w-24 h-2 rounded-full bg-slate-900 overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${Math.round((hud.health / hud.maxHealth) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] font-mono-tabular font-bold text-red-200">
                {hud.health}/{hud.maxHealth}
              </span>
            </div>

            {activeItemDef?.category === 'food' && (
              <button
                type="button"
                onClick={onEatHeld}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/25 border border-emerald-400 text-[11px] font-bold text-emerald-100 hover:bg-emerald-500/40 cursor-pointer"
              >
                <Apple className="w-3 h-3" /> Yeyish (E)
              </button>
            )}

            {/* Hunger Bar */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#040c1d]/88 border border-amber-400/35">
              <Utensils className="w-3.5 h-3.5 text-amber-400" />
              <div className="w-24 h-2 rounded-full bg-slate-900 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all"
                  style={{ width: `${Math.round((hud.hunger / hud.maxHunger) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] font-mono-tabular font-bold text-amber-200">
                {hud.hunger}/{hud.maxHunger}
              </span>
            </div>
          </div>
        )}

        <div className="text-[11px] font-medium text-sky-200/90 px-2.5 py-0.5 rounded bg-[#040c1d]/85 border border-sky-500/25">
          {activeItemDef ? (
            <>
              {activeItemDef.name}
              {activeItemDef.attackDamage ? ` (${activeItemDef.attackDamage} zarba)` : ''}
            </>
          ) : (
            'Bo‘sh qo‘l'
          )}
          <span className="hidden sm:inline text-slate-400">
            {' '}
            · C Kraft/Verstak · T Chat · E Ochish/Qo‘yish
          </span>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#040c1d]/90 border border-sky-400/35 shadow-[0_0_24px_rgba(14,165,233,0.22)]">
          {hotbarSlots.map((slot, idx) => {
            const def = slot ? ITEM_DEFINITIONS[slot.itemId] : null;
            const selected = idx === selectedSlot;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectSlot(idx)}
                title={def ? `${idx + 1}: ${def.name}` : `${idx + 1}: Bo‘sh`}
                className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                  selected
                    ? 'bg-sky-500/25 border-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.5)] -translate-y-0.5'
                    : 'bg-[#07132a]/85 border-sky-500/20 hover:border-sky-400/50'
                }`}
              >
                <span className="absolute top-0.5 left-1.5 text-[9px] font-mono-tabular text-sky-300/75">
                  {idx + 1}
                </span>
                {slot && itemThumbnails[slot.itemId] ? (
                  <img
                    src={itemThumbnails[slot.itemId]}
                    alt={def?.name}
                    className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
                  />
                ) : slot && def ? (
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: def.accentColor }}
                  />
                ) : null}
                {slot && hud.gameMode === 'survival' && slot.count > 0 && (
                  <span className="absolute bottom-0.5 right-1 text-[10px] font-mono-tabular font-bold text-white bg-[#020817]/80 px-1 rounded">
                    {slot.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
