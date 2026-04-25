import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Zap, Lock, Unlock, Sparkles, Users, Settings, BarChart3, Bot, User, Heart, Brain, Moon, Flame, MessageSquare } from "lucide-react";
import ninnaImg from "@assets/IMG_6506_1775388955437.jpeg";

interface TwinNeeds {
  energy: number;
  happiness: number;
  social: number;
  productivity: number;
}

const ACTIVITIES = [
  { id: "chat", name: "💬 Chat", icon: MessageSquare, cost: 5, gain: { happiness: 15, energy: -10 } },
  { id: "workout", name: "💪 Training", icon: Flame, cost: 10, gain: { energy: -30, productivity: 20 } },
  { id: "relax", name: "😴 Rest", icon: Moon, cost: 5, gain: { energy: 40, happiness: 10 } },
  { id: "socialize", name: "👥 Socialize", icon: Users, cost: 15, gain: { social: 30, happiness: 20 } },
];

export default function Twin() {
  const { user } = useAuth();
  const userId = user?.id;
  const [, setLocation] = useLocation();
  const [twin, setTwin] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [skins, setSkins] = useState<any[]>([]);
  const [selectedSkin, setSelectedSkin] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [applySkinLoading, setApplySkinLoading] = useState(false);
  const [needs, setNeeds] = useState<TwinNeeds>({
    energy: 75,
    happiness: 80,
    social: 60,
    productivity: 85,
  });
  const [interactionMsg, setInteractionMsg] = useState<string>("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [showActivityPanel, setShowActivityPanel] = useState(false);

  useEffect(() => {
    // Simulate data load - no API needed for demo
    setTimeout(() => {
      setTwin({
        userId: userId || 1,
        visualConfig: { baseAvatarId: "ninna-v1" },
        capabilityLevel: 3,
        botEnabled: true,
      });
      setSubscription({
        status: "active",
        tierName: "Premium",
        capabilityLevel: 3,
      });
      setSkins([
        { id: 1, name: "Pink Suit", url: ninnaImg, previewUrl: ninnaImg },
        { id: 2, name: "Casual", url: ninnaImg, previewUrl: ninnaImg },
        { id: 3, name: "Business", url: ninnaImg, previewUrl: ninnaImg },
        { id: 4, name: "Party", url: ninnaImg, previewUrl: ninnaImg },
        { id: 5, name: "Sport", url: ninnaImg, previewUrl: ninnaImg },
        { id: 6, name: "Luxury", url: ninnaImg, previewUrl: ninnaImg },
      ]);
      setLoading(false);
    }, 500);
  }, [userId]);

  // Simulate needs decay
  useEffect(() => {
    const interval = setInterval(() => {
      setNeeds(prev => ({
        energy: Math.max(0, prev.energy - 1),
        happiness: Math.max(0, prev.happiness - 0.5),
        social: Math.max(0, prev.social - 0.3),
        productivity: Math.max(0, prev.productivity - 0.2),
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleInteraction = (type: string) => {
    setIsAnimating(true);
    const messages = {
      tap: ["Ahoj! 😊", "Potřebuju něco?", "Jsem tady!", "Naslouchám! 👂"],
      chat: ["Ráda bych si povídala!", "Máš pro mě úkol?", "Zajímavé! 🤔", "Jasně, řešim to!"],
      tired: ["Potřebuju spát... 😴", "Jsem vážně unavená", "Možná si trochu odpočinu"],
      happy: ["Yay! 🎉", "To mě těší!", "Super nálada!", "Jsem skvělá! ✨"],
    };
    const msgArray = messages[type as keyof typeof messages] || messages.tap;
    setInteractionMsg(msgArray[Math.floor(Math.random() * msgArray.length)]);
    setTimeout(() => setIsAnimating(false), 1000);
    setTimeout(() => setInteractionMsg(""), 3000);
  };

  const performActivity = (activity: typeof ACTIVITIES[0]) => {
    setNeeds(prev => {
      const updated = { ...prev };
      Object.entries(activity.gain).forEach(([key, value]) => {
        updated[key as keyof TwinNeeds] = Math.max(0, Math.min(100, updated[key as keyof TwinNeeds] + value));
      });
      return updated;
    });
    handleInteraction("chat");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <Sparkles className="w-full h-full animate-spin text-pink-500" />
          </div>
          <p>Probouzím tvoji Ninnu...</p>
        </div>
      </div>
    );
  }

  if (!subscription || subscription.status !== "active") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Lock className="w-20 h-20 mx-auto mb-6 text-pink-500 animate-pulse" />
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
            Tvá Ninna čeká
          </h1>
          <p className="text-gray-300 mb-8 text-lg">
            Aktivuj si předplatné a vytvoř si svou virtuální osobnost!
          </p>
          <Button className="bg-gradient-to-r from-pink-500 to-purple-600 w-full text-lg py-6" onClick={() => setLocation("/chat")}>
            Koupit Předplatné
          </Button>
        </div>
      </div>
    );
  }

  const handleApplySkin = async () => {
    if (!selectedSkin || applySkinLoading) return;
    setApplySkinLoading(true);
    try {
      await fetch(`/api/twin/${userId}/apply-skin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skinId: selectedSkin.id }),
      });
      setSelectedSkin(null);
      handleInteraction("happy");
    } catch (err) {
      console.error("Apply skin error:", err);
    } finally {
      setApplySkinLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white">Tvá Virtuální Ninna</h1>
              <p className="text-gray-400 text-sm">The Sims: Agentura Edition</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-300"
              onClick={() => setShowActivityPanel(!showActivityPanel)}
              data-testid="button-toggle-activities"
            >
              {showActivityPanel ? "Skrýt" : "Aktivity"}
            </Button>
          </div>
        </div>

        {/* Main Game Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
          {/* Avatar Section - Interactive Game View */}
          <div className="xl:col-span-2">
            <Card className="bg-gradient-to-br from-gray-800/50 to-purple-900/30 border-pink-500/30 overflow-hidden relative h-[600px]">
              {/* Game Background */}
              <div className="absolute inset-0 bg-gradient-to-t from-purple-900/40 to-transparent" />
              
              {/* Interactive Avatar Container */}
              <div
                className={`relative w-full h-full flex flex-col items-center justify-center cursor-pointer group transition-all ${
                  isAnimating ? "scale-95" : "hover:scale-105"
                }`}
                onClick={() => handleInteraction("tap")}
                data-testid="avatar-interactive"
              >
                {/* Avatar Image */}
                <img
                  src={ninnaImg}
                  alt="Ninna Twin"
                  className={`w-full h-full object-cover transition-all duration-300 ${
                    isAnimating ? "scale-110 rotate-2" : "scale-100"
                  }`}
                />

                {/* Status Badge */}
                <div className="absolute top-4 right-4 bg-green-500/20 border border-green-500/50 rounded-full px-4 py-2 backdrop-blur-sm">
                  <span className="text-xs font-bold text-green-300 uppercase tracking-widest">● Online</span>
                </div>

                {/* Name Badge */}
                <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 text-center">
                  <h2 className="text-3xl font-black text-white drop-shadow-lg">
                    Ninna <span className="text-pink-400">Ray</span>
                  </h2>
                  <p className="text-pink-300 font-semibold text-sm mt-1">Tvá AI Agentura</p>
                </div>

                {/* Interaction Message Bubble */}
                {interactionMsg && (
                  <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-white text-black px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap shadow-lg animate-bounce">
                    {interactionMsg}
                  </div>
                )}

                {/* Hover Text */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
                  <span className="text-white font-bold text-lg">🖱️ Klikni na Ninnu!</span>
                </div>
              </div>
            </Card>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Button
                variant="outline"
                className="bg-gray-800/50 border-purple-500/30 text-white hover:bg-gray-700"
                onClick={() => performActivity(ACTIVITIES[0])}
                data-testid="button-quick-chat"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Chat
              </Button>
              <Button
                variant="outline"
                className="bg-gray-800/50 border-purple-500/30 text-white hover:bg-gray-700"
                onClick={() => performActivity(ACTIVITIES[2])}
                data-testid="button-quick-rest"
              >
                <Zzzz className="w-4 h-4 mr-2" />
                Odpočívej
              </Button>
              <Button
                variant="outline"
                className="bg-gray-800/50 border-purple-500/30 text-white hover:bg-gray-700"
                onClick={() => performActivity(ACTIVITIES[3])}
                data-testid="button-quick-socialize"
              >
                <Users className="w-4 h-4 mr-2" />
                Socialize
              </Button>
              <Button
                variant="outline"
                className="bg-gray-800/50 border-purple-500/30 text-white hover:bg-gray-700"
                onClick={() => performActivity(ACTIVITIES[1])}
                data-testid="button-quick-workout"
              >
                <Flame className="w-4 h-4 mr-2" />
                Training
              </Button>
            </div>
          </div>

          {/* Control Panel - Right Sidebar */}
          <div className="space-y-4">
            {/* Needs/Stats */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-400" />
                Potřeby
              </h3>
              <div className="space-y-4">
                {[
                  { key: "energy", label: "Energie", color: "bg-yellow-500" },
                  { key: "happiness", label: "Štěstí", color: "bg-pink-500" },
                  { key: "social", label: "Sociabilita", color: "bg-blue-500" },
                  { key: "productivity", label: "Produktivita", color: "bg-purple-500" },
                ].map(({ key, label, color }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-300">{label}</span>
                      <span className="text-xs text-gray-400">{Math.round(needs[key as keyof TwinNeeds])}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} transition-all duration-300`}
                        style={{ width: `${needs[key as keyof TwinNeeds]}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Quick Access */}
            <Card className="bg-gray-800/40 border-purple-500/30 p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Panely
              </h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start bg-gray-700/50 hover:bg-gray-700 border-gray-600 text-white text-sm"
                  onClick={() => setLocation("/agent")}
                  data-testid="button-agent"
                >
                  <User className="w-4 h-4 mr-2" />
                  Agent
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start bg-gray-700/50 hover:bg-gray-700 border-gray-600 text-white text-sm"
                  onClick={() => setLocation("/manager")}
                  data-testid="button-manager"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Manager
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start bg-gray-700/50 hover:bg-gray-700 border-gray-600 text-white text-sm"
                  onClick={() => setLocation("/admin")}
                  data-testid="button-admin"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Admin
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start bg-gray-700/50 hover:bg-gray-700 border-gray-600 text-white text-sm"
                  onClick={() => setLocation("/bot")}
                  data-testid="button-ebot"
                >
                  <Bot className="w-4 h-4 mr-2" />
                  E-Bot
                </Button>
              </div>
            </Card>

            {/* Chat Button */}
            <Button
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold py-6 text-lg"
              onClick={() => setLocation("/chat")}
              data-testid="button-chat-main"
            >
              💬 Psát Ninně
            </Button>
          </div>
        </div>

        {/* Activities Panel - Expandable */}
        {showActivityPanel && (
          <Card className="bg-gray-800/40 border-purple-500/30 p-6 mb-12">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-400" />
              Dostupné Aktivity
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ACTIVITIES.map((activity) => (
                <button
                  key={activity.id}
                  onClick={() => performActivity(activity)}
                  className="p-4 bg-gray-700/50 hover:bg-gray-700 border border-purple-500/30 rounded-lg transition-all text-left hover:scale-105"
                  data-testid={`activity-${activity.id}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold text-white">{activity.name}</span>
                    <span className="text-xs px-2 py-1 bg-purple-500/30 rounded text-purple-300">+{activity.cost} XP</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {Object.entries(activity.gain).map(([key, val]) => (
                      <div key={key}>
                        {key}: {val > 0 ? "+" : ""}{val}
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Wardrobe Section */}
        {skins.length > 0 && (
          <div>
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-7 h-7 text-purple-400" />
                Šatník
              </h2>
              <p className="text-gray-400">Vyber vzhled pro svou Ninnu</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {skins.map((skin) => (
                <button
                  key={skin.id}
                  onClick={() => setSelectedSkin(skin)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                    selectedSkin?.id === skin.id
                      ? "border-pink-500 scale-105 ring-2 ring-pink-400/50"
                      : "border-gray-700 hover:border-pink-500/50"
                  }`}
                  data-testid={`skin-${skin.id}`}
                >
                  {skin.previewUrl || skin.url ? (
                    <img
                      src={skin.previewUrl || skin.url}
                      alt={skin.name}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                      <span className="text-xs text-gray-400 text-center px-2">{skin.name}</span>
                    </div>
                  )}
                  {selectedSkin?.id === skin.id && (
                    <div className="absolute inset-0 bg-pink-500/20 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-pink-300 animate-bounce" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {selectedSkin && (
              <div className="mt-8 p-6 bg-gray-800/50 rounded-xl border border-pink-500/30">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">{selectedSkin.name}</h3>
                    <p className="text-gray-400 text-sm">{selectedSkin.description || "Aplikuj nový vzhled"}</p>
                  </div>
                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedSkin(null)}
                      className="border-gray-600 text-gray-300 hover:bg-gray-700"
                      data-testid="button-cancel"
                    >
                      Zrušit
                    </Button>
                    <Button
                      onClick={handleApplySkin}
                      disabled={applySkinLoading}
                      className="bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold"
                      data-testid="button-apply"
                    >
                      {applySkinLoading ? "Aplikuji..." : "✨ Aplikuj"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {skins.length === 0 && (
          <div className="text-center py-16 bg-gray-800/30 rounded-xl border border-purple-500/20">
            <Lock className="w-16 h-16 mx-auto mb-4 text-purple-400 opacity-50" />
            <h3 className="text-xl font-bold text-white mb-2">Šatník je prázdný</h3>
            <p className="text-gray-400 mb-6">Koupi si obsah v chatu a odemkneš nové vzhleды!</p>
            <Button
              onClick={() => setLocation("/chat")}
              className="bg-gradient-to-r from-pink-500 to-purple-600"
              data-testid="button-shop"
            >
              Koupit v Chatu
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
