import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Lock, Unlock, Crown, Sparkles, MessageCircleHeart,
  Shirt, ImageIcon, Smile, Gem, Wand2, RefreshCw, ChevronRight,
  ShoppingBag, Bot, Zap, CheckCircle, Brain, Trash2, Star, Heart, BookOpen
} from "lucide-react";

const ELEMENT_TYPES: { key: string; label: string; icon: any; color: string }[] = [
  { key: "outfit", label: "Oblečení", icon: Shirt, color: "text-rose-400" },
  { key: "hair", label: "Vlasy", icon: Sparkles, color: "text-amber-400" },
  { key: "background", label: "Pozadí", icon: ImageIcon, color: "text-blue-400" },
  { key: "expression", label: "Výraz", icon: Smile, color: "text-emerald-400" },
  { key: "accessory", label: "Doplněk", icon: Gem, color: "text-violet-400" },
];

interface AvatarElement {
  id: number;
  contentItemId: number | null;
  elementType: string;
  name: string;
  previewUrl: string | null;
  priceHint: number | null;
  metadata: Record<string, any>;
}

interface TwinCapabilities {
  basicChat: boolean;
  purchaseHistory: boolean;
  skinUnlocking: boolean;
  proactiveRecommendations: boolean;
  notifications: boolean;
  visualCustomization: boolean;
  advancedCustomization: boolean;
  exclusiveContent: boolean;
  prioritySupport: boolean;
  planning: boolean;
}

interface BotStatus {
  isSubscribed: boolean;
  botEnabled: boolean;
  capabilityLevel: number;
  capabilities: TwinCapabilities;
  currentPlan: { key: string; name: string; emoji: string } | null;
  nextPlan: { key: string; name: string; emoji: string; priceMonthly: number } | null;
  unlockedCount: number;
  lockedCount: number;
  totalCount: number;
}

interface WardrobeData {
  unlocked: AvatarElement[];
  locked: AvatarElement[];
  currentConfig: Record<string, any>;
}

interface NinnaComment {
  comment: string;
  mood: "default" | "happy" | "teasing" | "upsell";
  unlockedCount: number;
  lockedCount: number;
}

interface CloneMemory {
  id: number;
  userId: number;
  memoryType: string;
  key: string;
  value: string;
  importance: number;
  emotionalContext: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContentRecommendation {
  id: number;
  userId: number;
  contentItemId: number;
  score: number;
  reasonCzech: string;
  status: string;
  contentItem?: {
    id: number;
    description: string | null;
    priceAmount: number;
    contentType: string;
    thumbnailUrl: string | null;
  };
}

// ─── Subscription Gate ────────────────────────────────────────────────────────
function SubscriptionGate({ onGoPayment }: { onGoPayment: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f0610] via-[#120818] to-black flex flex-col items-center justify-center px-4 py-12 text-white">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-sm w-full text-center"
      >
        <div className="relative w-28 h-28 mx-auto mb-6">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-pink-600/30 to-purple-600/30 border border-pink-500/20 flex items-center justify-center">
            <span className="text-5xl">🍒</span>
          </div>
          <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
            <Lock className="w-4 h-4 text-zinc-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-2">Ninna E-Bot</h1>
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
          Svůj osobní interaktivní bot Ninny odemkneš s aktivním předplatným.
          Přizpůsob ji, jak chceš — oblečením z fotek, co sis zakoupil.
        </p>

        <div className="space-y-3 mb-8 text-left">
          {[
            { icon: Bot, text: "Ninna jen pro tebe, vizuálně přizpůsobitelná" },
            { icon: Shirt, text: "Oblékej ji outfity z fotek, co vlastníš" },
            { icon: Zap, text: "Každý nákup odemkne nový look" },
            { icon: Crown, text: "Progress zůstane i po obnovení předplatného" },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-4 py-3">
              <Icon className="w-4 h-4 text-pink-400 shrink-0" />
              <p className="text-sm text-zinc-300">{text}</p>
            </div>
          ))}
        </div>

        <Button
          onClick={onGoPayment}
          className="w-full py-3 text-sm font-bold bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-xl h-12"
          data-testid="button-subscribe-bot"
        >
          <Crown className="w-4 h-4 mr-2" />
          Odemknout Ninna E-Bot
        </Button>
        <p className="text-zinc-600 text-xs mt-3">
          🔒 Zrušit předplatné lze kdykoliv
        </p>
      </motion.div>
    </div>
  );
}

// ─── Default Ninna Visual ─────────────────────────────────────────────────────
function NinnaDisplay({ config, mood }: { config: Record<string, any>; mood: string }) {
  const hasOutfit = !!(config.outfit_preview);
  const hasExpression = !!(config.expression_preview);

  const moodGradients: Record<string, string> = {
    default: "from-[#2a0f1f] to-[#1a0a12]",
    happy: "from-[#1a2a0f] to-[#0e1a08]",
    teasing: "from-[#2a1a0f] to-[#1a0e08]",
    upsell: "from-[#2a0a2f] to-[#12081a]",
  };

  return (
    <div className={`relative aspect-[3/4] rounded-2xl overflow-hidden bg-gradient-to-b ${moodGradients[mood] || moodGradients.default} border border-white/8 shadow-2xl`}>
      {config.background_preview && (
        <img
          src={config.background_preview}
          alt="Pozadí"
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {hasOutfit || hasExpression ? (
          <div className="relative w-36 h-48">
            <img
              src={config.outfit_preview || config.expression_preview}
              alt="Ninna"
              className="w-full h-full object-cover rounded-xl border border-pink-500/20 shadow-xl"
            />
            {config.hair_name && (
              <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 text-[10px] text-amber-300 font-medium">
                ✦ {config.hair_name}
              </div>
            )}
            {config.accessory_name && (
              <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 text-[10px] text-violet-300 font-medium">
                💎
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-600/40 to-purple-600/40 border-2 border-pink-500/30 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <span className="text-4xl">🍒</span>
            </div>
            <div className="text-center">
              <p className="text-white/70 text-sm font-semibold">Ninna</p>
              <p className="text-white/30 text-xs mt-0.5">základní outfit</p>
            </div>
            <div className="flex gap-1">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-pink-500/40 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex gap-1.5 flex-wrap justify-center">
          {ELEMENT_TYPES.map(type => {
            const name = config[`${type.key}_name`];
            if (!name) return null;
            return (
              <span key={type.key} className="text-[10px] bg-black/60 backdrop-blur-sm border border-white/10 rounded-full px-2 py-0.5 text-white/60">
                {name}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Ninna Chat Bubble ────────────────────────────────────────────────────────
function NinnaBubble({ comment, mood }: { comment: string; mood: string }) {
  const bubbleColors: Record<string, string> = {
    default: "border-white/10 bg-white/4",
    happy: "border-emerald-500/20 bg-emerald-500/5",
    teasing: "border-pink-500/20 bg-pink-500/5",
    upsell: "border-purple-500/20 bg-purple-500/5",
  };

  return (
    <motion.div
      key={comment}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-3 p-4 rounded-2xl border ${bubbleColors[mood] || bubbleColors.default}`}
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-600/50 to-purple-600/50 flex items-center justify-center shrink-0 mt-0.5 text-base">
        🍒
      </div>
      <div className="flex-1">
        <p className="text-xs text-pink-300/70 font-medium mb-0.5">Ninna_Ray</p>
        {comment.split("\n").map((line, i) => (
          <p key={i} className="text-sm text-white/80 leading-relaxed">{line}</p>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Asset Card ───────────────────────────────────────────────────────────────
function AssetCard({
  element,
  isSelected,
  isLocked,
  onSelect,
  onBuy,
}: {
  element: AvatarElement;
  isSelected: boolean;
  isLocked: boolean;
  onSelect: () => void;
  onBuy: () => void;
}) {
  const typeInfo = ELEMENT_TYPES.find(t => t.key === element.elementType);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative rounded-xl overflow-hidden border transition-all ${
        isLocked
          ? "border-white/5 opacity-70"
          : isSelected
          ? "border-pink-500 ring-2 ring-pink-500/30 shadow-lg shadow-pink-500/10"
          : "border-white/10 hover:border-white/25"
      }`}
    >
      <button
        onClick={isLocked ? onBuy : onSelect}
        className="w-full text-left"
        data-testid={`asset-card-${element.id}`}
      >
        <div className="aspect-[3/4] bg-gradient-to-br from-zinc-900 to-black relative overflow-hidden">
          {element.previewUrl ? (
            <img
              src={element.previewUrl}
              alt={element.name}
              className={`w-full h-full object-cover transition-all duration-300 ${isLocked ? "brightness-50 blur-[2px]" : "hover:scale-105"}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {typeInfo && <typeInfo.icon className={`w-8 h-8 ${isLocked ? "text-white/10" : "text-white/20"}`} />}
            </div>
          )}

          {isLocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/15">
                <Lock className="w-5 h-5 text-white/60" />
              </div>
              {element.priceHint && (
                <span className="text-xs font-bold text-white/80 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-0.5">
                  od {element.priceHint} Kč
                </span>
              )}
            </div>
          )}

          {!isLocked && isSelected && (
            <div className="absolute inset-0 bg-pink-500/10 flex items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-pink-500 flex items-center justify-center shadow-lg">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
            </div>
          )}
        </div>

        <div className={`p-2.5 ${isSelected && !isLocked ? "bg-pink-500/10" : "bg-black/40"}`}>
          <p className="text-xs font-medium text-white/80 truncate">{element.name}</p>
          {isLocked ? (
            <p className="text-[10px] text-zinc-600 mt-0.5">🔒 Koupit v chatu</p>
          ) : (
            <p className={`text-[10px] mt-0.5 ${typeInfo?.color || "text-white/40"}`}>
              {element.elementType}
            </p>
          )}
        </div>
      </button>
    </motion.div>
  );
}

// ─── Main EBot Page ───────────────────────────────────────────────────────────
export default function EBot() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"unlocked" | "locked" | "recommendations">("unlocked");
  const [activeType, setActiveType] = useState<string>("all");
  const [previewConfig, setPreviewConfig] = useState<Record<string, any> | null>(null);
  const [memoryExpanded, setMemoryExpanded] = useState(false);

  const userStr = typeof window !== "undefined" ? localStorage.getItem("ninna_user") : null;
  const localUser = userStr ? JSON.parse(userStr) : null;

  const { data: botStatus, isLoading: statusLoading } = useQuery<BotStatus>({
    queryKey: ["/api/bot/status"],
    enabled: !!localUser?.id,
    retry: false,
  });

  const { data: wardrobeData, isLoading: wardrobeLoading } = useQuery<WardrobeData>({
    queryKey: ["/api/bot/wardrobe"],
    enabled: !!botStatus?.isSubscribed,
    retry: false,
  });

  const { data: ninnaComment } = useQuery<NinnaComment>({
    queryKey: ["/api/bot/ninna-comment"],
    enabled: !!botStatus?.botEnabled,
    refetchInterval: 30000,
  });

  const { data: memoryData, isLoading: memoryLoading } = useQuery<{ memories: CloneMemory[] }>({
    queryKey: ["/api/bot/memory"],
    enabled: !!botStatus?.botEnabled,
    refetchInterval: 60000,
  });

  const { data: recsData, isLoading: recsLoading } = useQuery<{ recommendations: ContentRecommendation[] }>({
    queryKey: ["/api/bot/recommendations"],
    enabled: !!botStatus?.botEnabled && activeTab === "recommendations",
    retry: false,
  });

  const deleteMemoryMutation = useMutation({
    mutationFn: async (memoryId: number) => apiRequest("DELETE", `/api/bot/memory/${memoryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/memory"] });
      toast({ title: "Vzpomínka smazána", description: "Ninna si to nebude pamatovat" });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nelze smazat vzpomínku", variant: "destructive" });
    },
  });

  const currentConfig = previewConfig || wardrobeData?.currentConfig || {};

  const applySkinMutation = useMutation({
    mutationFn: async ({ elementType, elementId }: { elementType: string; elementId: number | null }) => {
      return apiRequest("POST", "/api/avatar/apply-skin", { elementType, elementId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/avatar/instance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bot/wardrobe"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bot/ninna-comment"] });
      setPreviewConfig(null);
      toast({ title: "Ninna aktualizována ✨", description: "Změna uložena" });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nelze aplikovat skin", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/avatar/reset"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/wardrobe"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bot/ninna-comment"] });
      setPreviewConfig(null);
      toast({ title: "Resetováno", description: "Ninna je zpět v základu" });
    },
  });

  const handleSelectSkin = (element: AvatarElement) => {
    const isCurrentlySelected = currentConfig[`${element.elementType}_id`] === element.id;
    if (isCurrentlySelected) {
      const newConfig = { ...currentConfig };
      delete newConfig[`${element.elementType}_id`];
      delete newConfig[`${element.elementType}_name`];
      delete newConfig[`${element.elementType}_preview`];
      setPreviewConfig(newConfig);
    } else {
      setPreviewConfig({
        ...currentConfig,
        [`${element.elementType}_id`]: element.id,
        [`${element.elementType}_name`]: element.name,
        [`${element.elementType}_preview`]: element.previewUrl,
      });
    }
  };

  const handleApply = () => {
    if (!previewConfig) return;
    const savedConfig = wardrobeData?.currentConfig || {};
    for (const type of ELEMENT_TYPES) {
      const newId = previewConfig[`${type.key}_id`];
      const oldId = savedConfig[`${type.key}_id`];
      if (newId !== oldId) {
        applySkinMutation.mutate({ elementType: type.key, elementId: newId ?? null });
        return;
      }
    }
    setPreviewConfig(null);
  };

  const handleBuyLocked = (element: AvatarElement) => {
    setLocation("/chat");
    setTimeout(() => {
      toast({
        title: "Jdi do chatu",
        description: `Popros Ninnu o "${element.name}" — ona ti nabídne jak ho získat 😏`,
      });
    }, 300);
  };

  if (!localUser) {
    setLocation("/");
    return null;
  }

  if (statusLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0f0610] to-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-pink-300/50 text-sm">Načítám E-Bot...</p>
        </div>
      </div>
    );
  }

  if (!botStatus?.isSubscribed) {
    return <SubscriptionGate onGoPayment={() => setLocation("/payment")} />;
  }

  const unlocked = wardrobeData?.unlocked || [];
  const locked = wardrobeData?.locked || [];
  const hasPendingChanges = previewConfig !== null;

  const activeElements = activeTab === "unlocked" ? unlocked : locked;
  const filteredElements = activeType === "all"
    ? activeElements
    : activeElements.filter(e => e.elementType === activeType);

  const mood = ninnaComment?.mood || "default";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f0610] via-[#120818] to-black text-white">

      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/chat")}
            className="text-white/50 hover:text-white hover:bg-white/5 -ml-2"
            data-testid="button-back-chat"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Chat
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <Bot className="w-4 h-4 text-pink-400" />
            <span className="text-sm font-bold text-white">Ninna Twin</span>
            {botStatus.currentPlan && (
              <Badge className="bg-gradient-to-r from-pink-500/15 to-purple-500/15 text-pink-300 border-pink-500/25 text-[10px] px-2" data-testid="badge-current-tier">
                {botStatus.currentPlan.emoji} {botStatus.currentPlan.name.replace("Ninna Ray ", "")}
              </Badge>
            )}
            <Badge className="bg-white/5 text-zinc-400 border-white/10 text-[10px] px-2" data-testid="badge-unlocked-count">
              {botStatus.unlockedCount}/{botStatus.totalCount} skinů
            </Badge>
          </div>
          {botStatus.nextPlan && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/payment")}
              className="text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 text-xs gap-1"
              data-testid="button-upgrade-tier"
            >
              <Crown className="w-3.5 h-3.5" />
              Upgrade
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* LEFT — Ninna Display + Controls */}
          <div className="lg:col-span-2 space-y-4">
            <NinnaDisplay config={currentConfig} mood={mood} />

            {/* Ninna comment */}
            {ninnaComment?.comment && (
              <NinnaBubble comment={ninnaComment.comment} mood={mood} />
            )}

            {/* Apply / Reset */}
            <div className="space-y-2">
              {hasPendingChanges && (
                <Button
                  onClick={handleApply}
                  disabled={applySkinMutation.isPending}
                  className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold h-10"
                  data-testid="button-apply-skin"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  {applySkinMutation.isPending ? "Ukládám..." : "Uložit vzhled"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="w-full text-white/30 hover:text-white/50 hover:bg-white/4 text-xs h-8"
                data-testid="button-reset-avatar"
              >
                <RefreshCw className="w-3 h-3 mr-1.5" />
                Reset na výchozí
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-pink-400">{unlocked.length}</p>
                <p className="text-[10px] text-white/40 mt-0.5">odemčeno</p>
              </div>
              <div className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-zinc-600">{locked.length}</p>
                <p className="text-[10px] text-white/40 mt-0.5">zamčeno</p>
              </div>
            </div>

            {/* Tier Capabilities */}
            {botStatus.capabilities && (
              <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3" data-testid="panel-tier-capabilities">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white/70">Schopnosti Twina</p>
                  <span className="text-[10px] text-zinc-500">Level {botStatus.capabilityLevel}/3</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { key: "basicChat", label: "Chat s Ninnou", icon: "💬" },
                    { key: "purchaseHistory", label: "Přehled nákupů", icon: "📋" },
                    { key: "skinUnlocking", label: "Odemykání skinů", icon: "🔓" },
                    { key: "proactiveRecommendations", label: "Proaktivní doporučení", icon: "💡" },
                    { key: "notifications", label: "Upozornění na novinky", icon: "🔔" },
                    { key: "visualCustomization", label: "Vizuální customizace", icon: "🎨" },
                    { key: "advancedCustomization", label: "Pokročilá customizace", icon: "⚡" },
                    { key: "exclusiveContent", label: "Exkluzivní obsah", icon: "🌟" },
                    { key: "prioritySupport", label: "Prioritní podpora", icon: "🛡️" },
                    { key: "planning", label: "Plánování eventů", icon: "📅" },
                  ].map(({ key, label, icon }) => {
                    const enabled = (botStatus.capabilities as any)[key];
                    return (
                      <div key={key} className={`flex items-center gap-2 text-xs py-1 ${enabled ? "text-white/80" : "text-white/25"}`} data-testid={`capability-${key}`}>
                        <span className={`text-sm ${enabled ? "" : "grayscale opacity-30"}`}>{icon}</span>
                        <span className="flex-1">{label}</span>
                        {enabled ? (
                          <CheckCircle className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Lock className="w-3 h-3 text-zinc-600" />
                        )}
                      </div>
                    );
                  })}
                </div>
                {botStatus.nextPlan && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocation("/payment")}
                    className="w-full text-xs text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/8 border border-amber-500/15 rounded-lg h-8 mt-2"
                    data-testid="button-upgrade-capabilities"
                  >
                    <Crown className="w-3 h-3 mr-1.5" />
                    Upgrade na {botStatus.nextPlan.name.replace("Ninna Ray ", "")} — {Math.round(botStatus.nextPlan.priceMonthly / 100)} Kč/měs
                  </Button>
                )}
              </div>
            )}

            {/* Memory Panel */}
            {botStatus.botEnabled && (
              <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3" data-testid="panel-memory">
                <button
                  onClick={() => setMemoryExpanded(!memoryExpanded)}
                  className="w-full flex items-center justify-between"
                  data-testid="button-toggle-memory"
                >
                  <div className="flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-violet-400" />
                    <p className="text-xs font-bold text-white/70">Co Ninna ví o tobě</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {memoryData?.memories && memoryData.memories.length > 0 && (
                      <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full">
                        {memoryData.memories.length}
                      </span>
                    )}
                    <ChevronRight className={`w-3 h-3 text-white/30 transition-transform ${memoryExpanded ? "rotate-90" : ""}`} />
                  </div>
                </button>
                <AnimatePresence>
                  {memoryExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      {memoryLoading ? (
                        <div className="text-xs text-white/30 py-2 text-center">Načítám paměť...</div>
                      ) : !memoryData?.memories || memoryData.memories.length === 0 ? (
                        <div className="text-xs text-white/30 py-2 text-center">
                          Ninna si tě zatím moc nepamatuje.<br />
                          <span className="text-violet-400/60">Piš si s ní více 💜</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {memoryData.memories.slice(0, 5).map((mem) => (
                            <div
                              key={mem.id}
                              className="flex items-start justify-between gap-2 bg-white/3 rounded-lg px-2.5 py-2"
                              data-testid={`memory-item-${mem.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-violet-300/70 font-medium uppercase tracking-wider mb-0.5">{mem.key}</p>
                                <p className="text-xs text-white/70 leading-snug">{mem.value}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {Array.from({ length: Math.min(mem.importance, 3) }).map((_, i) => (
                                  <Star key={i} className="w-2.5 h-2.5 text-amber-400/70 fill-amber-400/70" />
                                ))}
                                <button
                                  onClick={() => deleteMemoryMutation.mutate(mem.id)}
                                  className="ml-1 text-white/20 hover:text-red-400/70 transition-colors"
                                  data-testid={`button-delete-memory-${mem.id}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {memoryData.memories.length > 5 && (
                            <p className="text-[10px] text-white/25 text-center pt-1">
                              +{memoryData.memories.length - 5} dalších vzpomínek
                            </p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* RIGHT — Šatník */}
          <div className="lg:col-span-3 space-y-4">

            {/* Tab: Unlocked / Locked / Recommendations */}
            <div className="flex bg-white/4 border border-white/8 rounded-xl p-1 gap-1">
              <button
                onClick={() => setActiveTab("unlocked")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "unlocked"
                    ? "bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow"
                    : "text-white/40 hover:text-white/60"
                }`}
                data-testid="tab-unlocked"
              >
                <Unlock className="w-3 h-3" />
                Tvoje
                {unlocked.length > 0 && (
                  <span className={`text-[10px] px-1.5 rounded-full ${activeTab === "unlocked" ? "bg-white/20" : "bg-white/10 text-white/40"}`}>
                    {unlocked.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("locked")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "locked"
                    ? "bg-gradient-to-r from-zinc-700 to-zinc-600 text-white shadow"
                    : "text-white/40 hover:text-white/60"
                }`}
                data-testid="tab-locked"
              >
                <Lock className="w-3 h-3" />
                Zamčené
                {locked.length > 0 && (
                  <span className={`text-[10px] px-1.5 rounded-full ${activeTab === "locked" ? "bg-white/20" : "bg-white/10 text-white/40"}`}>
                    {locked.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("recommendations")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "recommendations"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow"
                    : "text-white/40 hover:text-white/60"
                }`}
                data-testid="tab-recommendations"
              >
                <Sparkles className="w-3 h-3" />
                Pro tebe
              </button>
            </div>

            {/* Recommendations Panel */}
            {activeTab === "recommendations" && (
              <div className="space-y-3" data-testid="panel-recommendations">
                {recsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="aspect-[3/4] rounded-xl bg-white/3 animate-pulse" />
                    ))}
                  </div>
                ) : !recsData?.recommendations || recsData.recommendations.length === 0 ? (
                  <div className="bg-white/2 border border-white/6 rounded-2xl p-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-6 h-6 text-violet-400/50" />
                    </div>
                    <p className="text-white/50 font-semibold mb-2">Ninna chystá doporučení</p>
                    <p className="text-white/25 text-sm">
                      Piš si s Ninnou a ona ti doporučí obsah přesně pro tebe 💜
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {recsData.recommendations.map((rec) => (
                      <motion.div
                        key={rec.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white/3 border border-violet-500/20 rounded-xl overflow-hidden"
                        data-testid={`recommendation-${rec.id}`}
                      >
                        <div className="aspect-[3/4] bg-gradient-to-br from-violet-900/30 to-indigo-900/30 relative flex items-center justify-center">
                          {rec.contentItem?.thumbnailUrl ? (
                            <img
                              src={rec.contentItem.thumbnailUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-4xl">
                              {rec.contentItem?.contentType === "video" ? "🎬" : "📸"}
                            </div>
                          )}
                          <div className="absolute top-2 right-2">
                            <span className="text-[10px] bg-violet-600/80 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                              {Math.round(rec.score * 100)}% shoda
                            </span>
                          </div>
                        </div>
                        <div className="p-2.5">
                          <p className="text-xs text-white/70 leading-snug line-clamp-2">{rec.reasonCzech}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[11px] font-bold text-violet-300">
                              {rec.contentItem?.priceAmount ? `${rec.contentItem.priceAmount} Kč` : ""}
                            </span>
                            <button
                              onClick={() => setLocation("/chat")}
                              className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                              data-testid={`button-get-rec-${rec.id}`}
                            >
                              Získat →
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
                <div className="bg-violet-500/5 border border-violet-500/15 rounded-xl p-3 flex gap-2 items-start">
                  <Heart className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-white/40 leading-relaxed">
                    Ninna tato doporučení připravila speciálně pro tebe na základě toho, co se ti líbí.
                  </p>
                </div>
              </div>
            )}

            {/* Type filter + Grid — only for wardrobe tabs */}
            {activeTab !== "recommendations" && (
            <><div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveType("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeType === "all"
                    ? "bg-white/10 text-white border border-white/20"
                    : "bg-white/3 text-white/40 border border-white/8 hover:bg-white/6"
                }`}
                data-testid="filter-all"
              >
                Vše
              </button>
              {ELEMENT_TYPES.map(type => {
                const count = activeElements.filter(e => e.elementType === type.key).length;
                if (count === 0) return null;
                return (
                  <button
                    key={type.key}
                    onClick={() => setActiveType(type.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeType === type.key
                        ? "bg-white/10 text-white border border-white/20"
                        : "bg-white/3 text-white/40 border border-white/8 hover:bg-white/6"
                    }`}
                    data-testid={`filter-${type.key}`}
                  >
                    <type.icon className={`w-3 h-3 ${type.color}`} />
                    {type.label}
                    <span className="bg-white/10 px-1 rounded text-[10px]">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Grid */}
            {wardrobeLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="aspect-[3/4] rounded-xl bg-white/3 animate-pulse" />
                ))}
              </div>
            ) : filteredElements.length === 0 ? (
              <div className="bg-white/2 border border-white/6 rounded-2xl p-10 text-center">
                {activeTab === "unlocked" ? (
                  <>
                    <div className="w-14 h-14 rounded-full bg-white/4 flex items-center justify-center mx-auto mb-4">
                      <ShoppingBag className="w-6 h-6 text-white/20" />
                    </div>
                    <p className="text-white/50 font-semibold mb-2">Ještě nic</p>
                    <p className="text-white/25 text-sm mb-5">
                      {activeType !== "all"
                        ? `Nemáš žádné "${ELEMENT_TYPES.find(t => t.key === activeType)?.label}" assety.`
                        : "Zakup si obsah v chatu a odemkni outfity pro Ninnu."}
                    </p>
                    <Button
                      onClick={() => setLocation("/chat")}
                      className="bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 text-white text-sm"
                      data-testid="button-go-chat-unlock"
                    >
                      <MessageCircleHeart className="w-4 h-4 mr-2" />
                      Jít do chatu
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="w-6 h-6 text-emerald-400" />
                    </div>
                    <p className="text-white/50 font-semibold">Vše odemčeno!</p>
                    <p className="text-white/25 text-sm mt-1">Máš celý šatník 🔥</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <AnimatePresence>
                  {filteredElements.map(element => (
                    <AssetCard
                      key={element.id}
                      element={element}
                      isLocked={activeTab === "locked"}
                      isSelected={currentConfig[`${element.elementType}_id`] === element.id}
                      onSelect={() => handleSelectSkin(element)}
                      onBuy={() => handleBuyLocked(element)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Footer info */}
            {activeTab === "locked" && locked.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-pink-500/5 border border-pink-500/15 rounded-xl p-4 flex gap-3 items-start"
              >
                <Sparkles className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
                <p className="text-xs text-white/50 leading-relaxed">
                  Zamčené assety odemkneš nákupem obsahu v chatu s Ninnou.
                  Každá koupená fotka může odemknout nový outfit, vlasy nebo doplněk.
                  <button
                    onClick={() => setLocation("/chat")}
                    className="text-pink-400 ml-1 hover:text-pink-300 transition-colors inline-flex items-center gap-1"
                  >
                    Jít do chatu <ChevronRight className="w-3 h-3" />
                  </button>
                </p>
              </motion.div>
            )}
            </>)}
          </div>
        </div>
      </div>
    </div>
  );
}
