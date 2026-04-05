import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Shirt, Sparkles, ImageIcon, Smile, Crown, RefreshCw,
  ArrowLeft, Lock, CheckCircle, Gem, Wand2, ChevronRight
} from "lucide-react";

type ElementType = "outfit" | "hair" | "background" | "expression" | "accessory";

const ELEMENT_TYPES: { key: ElementType; label: string; icon: any; color: string }[] = [
  { key: "outfit", label: "Oblečení", icon: Shirt, color: "from-rose-500 to-pink-600" },
  { key: "hair", label: "Vlasy", icon: Sparkles, color: "from-amber-400 to-yellow-500" },
  { key: "background", label: "Pozadí", icon: ImageIcon, color: "from-indigo-500 to-blue-600" },
  { key: "expression", label: "Výraz", icon: Smile, color: "from-emerald-500 to-teal-600" },
  { key: "accessory", label: "Doplněk", icon: Gem, color: "from-violet-500 to-purple-600" },
];

interface AvatarElement {
  id: number;
  contentItemId: number;
  elementType: string;
  name: string;
  previewUrl: string | null;
  metadata: Record<string, any>;
}

interface AvatarInstance {
  id: number;
  userId: number;
  visualConfig: Record<string, any>;
  personaName: string;
  capabilityLevel: number;
  lastInteraction: string | null;
}

export default function AvatarCustomizer() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ElementType>("outfit");
  const [previewConfig, setPreviewConfig] = useState<Record<string, any> | null>(null);

  // Načíst aktuální avatar instanci
  const { data: instanceData, isLoading: instanceLoading } = useQuery<{ instance: AvatarInstance }>({
    queryKey: ["/api/avatar/instance"],
  });

  // Načíst dostupné skiny ze zakoupených fotek
  const { data: elementsData, isLoading: elementsLoading } = useQuery<{ elements: AvatarElement[] }>({
    queryKey: ["/api/avatar/elements"],
  });

  const instance = instanceData?.instance;
  const allElements = elementsData?.elements || [];
  const currentConfig = previewConfig || instance?.visualConfig || {};

  const filteredElements = allElements.filter(e => e.elementType === activeTab);

  // Aplikovat skin
  const applySkinMutation = useMutation({
    mutationFn: async ({ elementType, elementId }: { elementType: string; elementId: number | null }) => {
      return apiRequest("POST", "/api/avatar/apply-skin", { elementType, elementId });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/avatar/instance"] });
      if (variables.elementId === null) {
        toast({ title: "Skin odebrán", description: "Výchozí styl obnoven" });
      } else {
        toast({ title: "Skin aplikován!", description: "Tvůj Virtual Twin byl aktualizován" });
      }
      setPreviewConfig(null);
    },
    onError: (err: any) => {
      toast({ title: "Chyba", description: err.message || "Nelze aplikovat skin", variant: "destructive" });
    },
  });

  // Reset avataru
  const resetMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/avatar/reset"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/avatar/instance"] });
      setPreviewConfig(null);
      toast({ title: "Avatar resetován", description: "Výchozí vzhled obnoven" });
    },
  });

  const handleSelectSkin = (element: AvatarElement) => {
    // Lokální preview bez uložení
    const newConfig = {
      ...currentConfig,
      [`${element.elementType}_id`]: element.id,
      [`${element.elementType}_content_id`]: element.contentItemId,
      [`${element.elementType}_name`]: element.name,
      [`${element.elementType}_preview`]: element.previewUrl,
    };
    setPreviewConfig(newConfig);
  };

  const handleApplySkin = () => {
    if (!previewConfig) return;
    // Najít která kategorie se změnila
    const savedConfig = instance?.visualConfig || {};
    for (const type of ELEMENT_TYPES) {
      const newId = previewConfig[`${type.key}_id`];
      const oldId = savedConfig[`${type.key}_id`];
      if (newId !== oldId && newId !== undefined) {
        applySkinMutation.mutate({ elementType: type.key, elementId: newId });
        return;
      }
    }
    toast({ title: "Žádná změna", description: "Vyber jiný skin než je aktuální" });
  };

  const handleRemoveSkin = (elementType: string) => {
    applySkinMutation.mutate({ elementType, elementId: null });
  };

  const isSelected = (element: AvatarElement) => {
    return currentConfig[`${element.elementType}_id`] === element.id;
  };

  const hasPendingChanges = previewConfig !== null;

  if (instanceLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a0a12] via-[#12080e] to-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-pink-300/60 text-sm">Načítám tvého Virtual Twina...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0a12] via-[#12080e] to-black text-white">
      {/* Header */}
      <div className="border-b border-white/5 bg-black/40 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/chat")}
            className="text-white/60 hover:text-white hover:bg-white/5 -ml-2"
            data-testid="button-back-chat"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Zpět do chatu
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-white">Virtual Twin</span>
            <Badge className="bg-pink-500/20 text-pink-300 border-pink-500/30 text-xs">
              Ninna_Ray
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT: Avatar Preview */}
          <div className="lg:col-span-1">
            <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden sticky top-20">

              {/* Avatar Visual */}
              <div className="relative bg-gradient-to-b from-[#2a0f1f] to-[#1a0a12] aspect-[3/4] flex flex-col items-center justify-center">

                {/* Background Layer */}
                {currentConfig.background_preview ? (
                  <img
                    src={currentConfig.background_preview}
                    alt="Pozadí"
                    className="absolute inset-0 w-full h-full object-cover opacity-30"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-b from-pink-950/20 to-purple-950/20" />
                )}

                {/* Base Avatar — Ninna silhouette */}
                <div className="relative z-10 flex flex-col items-center">
                  {/* Main Photo Preview */}
                  {currentConfig.outfit_preview || currentConfig.expression_preview ? (
                    <div className="relative w-48 h-64 rounded-xl overflow-hidden shadow-2xl border border-pink-500/20">
                      <img
                        src={currentConfig.outfit_preview || currentConfig.expression_preview}
                        alt="Ninna Avatar"
                        className="w-full h-full object-cover"
                      />
                      {/* Hair overlay badge */}
                      {currentConfig.hair_name && (
                        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 text-[10px] text-amber-300">
                          ✦ {currentConfig.hair_name}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-48 h-64 rounded-xl border border-white/10 bg-white/3 flex flex-col items-center justify-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/20 flex items-center justify-center">
                        <span className="text-2xl">🍒</span>
                      </div>
                      <div className="text-center">
                        <p className="text-white/50 text-sm font-medium">Ninna</p>
                        <p className="text-white/25 text-xs">Výchozí vzhled</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Overlay gradient */}
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#1a0a12] to-transparent" />
              </div>

              {/* Active Skins Summary */}
              <div className="p-4 space-y-2">
                <p className="text-xs text-white/40 uppercase tracking-widest font-medium mb-3">Aktivní skiny</p>
                {ELEMENT_TYPES.map(type => {
                  const name = currentConfig[`${type.key}_name`];
                  const isActive = !!name;
                  return (
                    <div key={type.key} className={`flex items-center justify-between py-1.5 px-3 rounded-lg transition-all ${isActive ? "bg-white/5 border border-white/8" : "opacity-40"}`}>
                      <div className="flex items-center gap-2">
                        <type.icon className={`w-3.5 h-3.5 ${isActive ? "text-pink-400" : "text-white/30"}`} />
                        <span className="text-xs text-white/60">{type.label}</span>
                      </div>
                      {isActive ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-white/80 max-w-[80px] truncate">{name}</span>
                          <button
                            onClick={() => handleRemoveSkin(type.key)}
                            className="text-white/30 hover:text-red-400 transition-colors ml-1 text-xs"
                            title="Odebrat"
                            data-testid={`button-remove-skin-${type.key}`}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-white/20">—</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="px-4 pb-4 space-y-2">
                {hasPendingChanges && (
                  <Button
                    onClick={handleApplySkin}
                    disabled={applySkinMutation.isPending}
                    className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-semibold text-sm h-9"
                    data-testid="button-apply-skin"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    {applySkinMutation.isPending ? "Ukládám..." : "Uložit změny"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetMutation.mutate()}
                  disabled={resetMutation.isPending}
                  className="w-full text-white/40 hover:text-white/60 hover:bg-white/5 text-xs h-8"
                  data-testid="button-reset-avatar"
                >
                  <RefreshCw className="w-3 h-3 mr-1.5" />
                  Resetovat na výchozí
                </Button>
              </div>
            </div>
          </div>

          {/* RIGHT: Šatník */}
          <div className="lg:col-span-2 space-y-4">

            {/* Title */}
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">Šatník Ninny</h1>
              <p className="text-white/40 text-sm">
                Přizpůsob svého Virtual Twina pomocí vizuálních prvků z fotek, které sis zakoupil.
              </p>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 flex-wrap">
              {ELEMENT_TYPES.map(type => {
                const isActive = activeTab === type.key;
                const count = allElements.filter(e => e.elementType === type.key).length;
                return (
                  <button
                    key={type.key}
                    onClick={() => setActiveTab(type.key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? "bg-white/10 text-white border border-white/20"
                        : "bg-white/3 text-white/40 border border-white/5 hover:bg-white/6 hover:text-white/60"
                    }`}
                    data-testid={`tab-${type.key}`}
                  >
                    <type.icon className="w-4 h-4" />
                    {type.label}
                    {count > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-pink-500/30 text-pink-300" : "bg-white/10 text-white/40"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Skins Grid */}
            {elementsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="aspect-[3/4] rounded-xl bg-white/3 animate-pulse" />
                ))}
              </div>
            ) : filteredElements.length === 0 ? (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-6 h-6 text-white/20" />
                </div>
                <h3 className="text-white/60 font-semibold mb-2">Žádné skiny k dispozici</h3>
                <p className="text-white/30 text-sm mb-4">
                  Pro kategorii <strong className="text-white/50">{ELEMENT_TYPES.find(t => t.key === activeTab)?.label}</strong> zatím nemáš žádné skiny.
                  Zakup si fotky a odemkni nové vizuální prvky!
                </p>
                <Button
                  onClick={() => setLocation("/chat")}
                  className="bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 border border-pink-500/30 text-sm"
                  data-testid="button-go-chat-unlock"
                >
                  Jít do chatu a zakoupit fotky
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredElements.map(element => {
                  const selected = isSelected(element);
                  const savedId = instance?.visualConfig[`${element.elementType}_id`];
                  const isSaved = savedId === element.id;
                  return (
                    <button
                      key={element.id}
                      onClick={() => handleSelectSkin(element)}
                      className={`group relative rounded-xl overflow-hidden border transition-all text-left ${
                        selected
                          ? "border-pink-500 ring-2 ring-pink-500/30 shadow-lg shadow-pink-500/10"
                          : "border-white/8 hover:border-white/20"
                      }`}
                      data-testid={`skin-card-${element.id}`}
                    >
                      {/* Preview Image */}
                      <div className="aspect-[3/4] bg-white/3 relative overflow-hidden">
                        {element.previewUrl ? (
                          <img
                            src={element.previewUrl}
                            alt={element.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-950/30 to-purple-950/30">
                            {(() => {
                              const T = ELEMENT_TYPES.find(t => t.key === element.elementType);
                              return T ? <T.icon className="w-8 h-8 text-white/20" /> : null;
                            })()}
                          </div>
                        )}

                        {/* Selected overlay */}
                        {selected && (
                          <div className="absolute inset-0 bg-pink-500/10 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center shadow-lg">
                              <CheckCircle className="w-5 h-5 text-white" />
                            </div>
                          </div>
                        )}

                        {/* Saved badge */}
                        {isSaved && !selected && (
                          <div className="absolute top-2 right-2 bg-green-500/80 backdrop-blur-sm rounded-full p-0.5">
                            <CheckCircle className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Name & Meta */}
                      <div className={`p-3 ${selected ? "bg-pink-500/10" : "bg-black/40"}`}>
                        <p className="text-sm font-medium text-white truncate">{element.name}</p>
                        {element.metadata && typeof element.metadata === "object" && (
                          <div className="flex gap-1 flex-wrap mt-1">
                            {Object.entries(element.metadata as Record<string, string>)
                              .filter(([k]) => k !== "name")
                              .slice(0, 2)
                              .map(([k, v]) => (
                                <span key={k} className="text-[10px] text-white/30 bg-white/5 rounded px-1.5 py-0.5">
                                  {String(v)}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Info Footer */}
            <div className="bg-white/2 border border-white/5 rounded-xl p-4 flex gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-white/60 font-medium mb-0.5">Jak fungují skiny?</p>
                <p className="text-xs text-white/30 leading-relaxed">
                  Každá fotka, kterou si zakoupíš v chatu s Ninnou, automaticky odemkne nové vizuální prvky
                  (oblečení, vlasy, pozadí, výrazy). Tyto prvky pak můžeš aplikovat na svého Virtual Twina
                  a přizpůsobit jeho vzhled přesně podle svého vkusu.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
