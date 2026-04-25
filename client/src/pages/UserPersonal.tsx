import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Lock, Sparkles, Heart, MessageSquare, Zap, Settings, LogOut, ChevronRight } from "lucide-react";
import ninnaImg from "@assets/IMG_6506_1775388955437.jpeg";

interface PersonalizationPrefs {
  style: "professional" | "casual" | "fun" | "premium";
  expectations: string[];
  features: string[];
}

interface WardrobeItem {
  id: number;
  name: string;
  type: "outfit" | "hair" | "accessory" | "expression";
  preview: string;
  purchased: boolean;
}

const STYLE_OPTIONS = {
  professional: { label: "Profesionální", emoji: "👔", desc: "Business-ready, elegantní" },
  casual: { label: "Přítelský", emoji: "😊", desc: "Relaxovaný, přátelský" },
  fun: { label: "Zábavný", emoji: "🎉", desc: "Energetický, vtipný" },
  premium: { label: "Luxusní", emoji: "✨", desc: "Exkluzivní, VIP" },
};

const EXPECTATIONS = [
  { id: "daily", label: "Denní kontakt", emoji: "📱" },
  { id: "advice", label: "Rady a tipy", emoji: "💡" },
  { id: "support", label: "Emoční podpora", emoji: "💗" },
  { id: "fun", label: "Zábava", emoji: "🎮" },
  { id: "business", label: "Business help", emoji: "📊" },
  { id: "creative", label: "Kreativní nápady", emoji: "🎨" },
];

const FEATURES = [
  { id: "ai-reply", label: "AI odpovědi", emoji: "🤖" },
  { id: "voice", label: "Hlasové zprávy", emoji: "🎙️" },
  { id: "photos", label: "Exkluzivní fotky", emoji: "📸" },
  { id: "tasks", label: "Todo list", emoji: "✅" },
  { id: "calendar", label: "Kalendář", emoji: "📅" },
  { id: "stats", label: "Statistiky", emoji: "📈" },
];

// Demo wardrobe items (v realitě by to bylo z DB)
const DEMO_WARDROBE: WardrobeItem[] = [
  { id: 1, name: "Pink Suit", type: "outfit", preview: "👗", purchased: true },
  { id: 2, name: "Business Outfit", type: "outfit", preview: "👔", purchased: true },
  { id: 3, name: "Casual Wear", type: "outfit", preview: "👕", purchased: true },
  { id: 4, name: "Party Dress", type: "outfit", preview: "✨", purchased: true },
  { id: 5, name: "Long Hair", type: "hair", preview: "💁", purchased: true },
  { id: 6, name: "Short Hair", type: "hair", preview: "💇", purchased: false },
  { id: 7, name: "Sunglasses", type: "accessory", preview: "🕶️", purchased: true },
  { id: 8, name: "Hat", type: "accessory", preview: "🎩", purchased: false },
  { id: 9, name: "Happy Face", type: "expression", preview: "😊", purchased: true },
  { id: 10, name: "Wink", type: "expression", preview: "😉", purchased: false },
];

export default function UserPersonal() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"style" | "expectations" | "wardrobe" | "done">("style");
  const [prefs, setPrefs] = useState<PersonalizationPrefs>({
    style: "premium",
    expectations: ["daily", "advice"],
    features: ["ai-reply", "photos"],
  });
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>(DEMO_WARDROBE);
  const [selectedOutfits, setSelectedOutfits] = useState<Record<string, number>>({
    outfit: 1,
    hair: 5,
    accessory: 7,
    expression: 9,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const hasSubscription = localStorage.getItem("has_subscription");
    if (!hasSubscription && user?.id) {
      setLocation("/payment");
      return;
    }
    // Load user-specific preferences
    const savedPrefs = localStorage.getItem("user_prefs");
    if (savedPrefs) {
      try {
        const loaded = JSON.parse(savedPrefs);
        setPrefs(loaded);
      } catch (e) {
        console.log("Could not load saved prefs");
      }
    }
  }, [user, setLocation]);

  const toggleExpectation = (id: string) => {
    setPrefs(prev => ({
      ...prev,
      expectations: prev.expectations.includes(id)
        ? prev.expectations.filter(e => e !== id)
        : [...prev.expectations, id],
    }));
  };

  const selectOutfit = (type: string, itemId: number) => {
    setSelectedOutfits(prev => ({ ...prev, [type]: itemId }));
  };

  const savePreferences = async () => {
    setIsSaving(true);
    setTimeout(() => {
      localStorage.setItem("user_prefs", JSON.stringify(prefs));
      localStorage.setItem("selected_outfits", JSON.stringify(selectedOutfits));
      setIsSaving(false);
      setStep("done");
    }, 800);
  };

  if (!user) return null;

  // Step 1: Style Selection
  if (step === "style") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">Vítej! 🎉</h1>
            <p className="text-gray-400 text-lg">Personalizuj si svou Ninnu podle svých přání</p>
          </div>

          <Card className="bg-gray-800/50 border-purple-500/30 p-8">
            <h2 className="text-2xl font-bold text-white mb-6">1️⃣ Vyber si styl interakce</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {Object.entries(STYLE_OPTIONS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setPrefs(prev => ({ ...prev, style: key as any }))}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    prefs.style === key
                      ? "border-pink-500 bg-pink-500/10"
                      : "border-gray-700 hover:border-pink-500/50 bg-gray-700/30"
                  }`}
                  data-testid={`style-${key}`}
                >
                  <div className="text-4xl mb-2">{val.emoji}</div>
                  <div className="font-bold text-white text-sm">{val.label}</div>
                  <div className="text-xs text-gray-400">{val.desc}</div>
                </button>
              ))}
            </div>

            <Button
              onClick={() => setStep("expectations")}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 font-bold py-6"
              data-testid="button-next-expectations"
            >
              Pokračovat <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Step 2: Expectations
  if (step === "expectations") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-gray-800/50 border-purple-500/30 p-8">
            <h2 className="text-2xl font-bold text-white mb-6">2️⃣ Co od ní očekáváš?</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
              {EXPECTATIONS.map((exp) => (
                <button
                  key={exp.id}
                  onClick={() => toggleExpectation(exp.id)}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    prefs.expectations.includes(exp.id)
                      ? "border-pink-500 bg-pink-500/10"
                      : "border-gray-700 hover:border-pink-500/50 bg-gray-700/30"
                  }`}
                  data-testid={`expectation-${exp.id}`}
                >
                  <span className="text-lg">{exp.emoji}</span>
                  <div className="font-bold text-white text-sm">{exp.label}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
                onClick={() => setStep("style")}
                data-testid="button-back-style"
              >
                Zpět
              </Button>
              <Button
                onClick={() => setStep("wardrobe")}
                className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 font-bold"
                data-testid="button-next-wardrobe"
              >
                Pokračovat <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Step 3: Wardrobe Customization
  if (step === "wardrobe") {
    const selectedItems = {
      outfit: wardrobe.find(w => w.id === selectedOutfits.outfit),
      hair: wardrobe.find(w => w.id === selectedOutfits.hair),
      accessory: wardrobe.find(w => w.id === selectedOutfits.accessory),
      expression: wardrobe.find(w => w.id === selectedOutfits.expression),
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 p-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-6">3️⃣ Odšťuch si svou Ninnu</h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Avatar Preview - Left */}
            <div className="lg:col-span-2">
              <Card className="bg-gradient-to-br from-gray-800/50 to-purple-900/30 border-pink-500/30 overflow-hidden">
                <div className="relative h-[500px] flex flex-col items-center justify-center bg-gradient-to-t from-purple-900/40 to-transparent">
                  {/* Live Avatar Preview */}
                  <div className="text-center">
                    <div className="text-8xl mb-4 animate-bounce">
                      {selectedItems.expression?.preview || "😊"}
                    </div>
                    <div className="text-6xl flex justify-center gap-4 mb-4">
                      <span>{selectedItems.hair?.preview || "💁"}</span>
                      <span>{selectedItems.outfit?.preview || "👗"}</span>
                      <span>{selectedItems.accessory?.preview || "🕶️"}</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">Tvá Ninna</h3>
                    <div className="flex justify-center gap-2 mt-2 text-sm">
                      {Object.values(selectedItems).map((item, i) => (
                        item && <span key={i} className="px-2 py-1 bg-white/10 rounded text-xs text-gray-200">
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Info Bar */}
                  <div className="absolute bottom-4 left-4 right-4 flex justify-between text-xs text-gray-400">
                    <span>✨ Live Preview</span>
                    <span>4D Avatar</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Selected Items - Right */}
            <div className="space-y-4">
              <Card className="bg-gray-800/40 border-purple-500/30 p-4">
                <h3 className="text-lg font-bold text-white mb-4">Tvá Kombinace</h3>
                <div className="space-y-2">
                  {Object.entries(selectedItems).map(([type, item]) => (
                    <div key={type} className="p-2 bg-gray-700/30 rounded">
                      <div className="text-xs text-gray-400 uppercase">{type}</div>
                      {item && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-2xl">{item.preview}</span>
                          <div>
                            <div className="font-bold text-white text-sm">{item.name}</div>
                            {!item.purchased && (
                              <span className="text-xs text-yellow-400">🔒 Koupit</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {/* Wardrobe Categories */}
          {["outfit", "hair", "accessory", "expression"].map((type) => (
            <div key={type} className="mb-8">
              <h3 className="text-xl font-bold text-white mb-4 capitalize">{type}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {wardrobe
                  .filter(w => w.type === type)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => item.purchased && selectOutfit(type, item.id)}
                      disabled={!item.purchased}
                      className={`p-4 rounded-lg border-2 transition-all text-center ${
                        selectedOutfits[type] === item.id
                          ? "border-pink-500 bg-pink-500/20"
                          : "border-gray-700 hover:border-purple-500/50"
                      } ${!item.purchased ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      data-testid={`wardrobe-${item.id}`}
                    >
                      <div className="text-4xl mb-2">{item.preview}</div>
                      <div className="text-xs font-bold text-gray-300">{item.name}</div>
                      {!item.purchased && <div className="text-xs text-yellow-400 mt-1">🔒</div>}
                      {selectedOutfits[type] === item.id && (
                        <div className="text-xs text-pink-300 mt-1">✓ Vybrané</div>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          ))}

          {/* Navigation */}
          <div className="flex gap-4 mt-12">
            <Button
              variant="outline"
              className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700 py-6"
              onClick={() => setStep("expectations")}
              data-testid="button-back-expectations"
            >
              Zpět
            </Button>
            <Button
              onClick={savePreferences}
              disabled={isSaving}
              className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 font-bold py-6"
              data-testid="button-save-complete"
            >
              {isSaving ? "Ukládám..." : "✨ Hotovo!"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 4: Complete - Dashboard
  const finalSelectedItems = {
    outfit: wardrobe.find(w => w.id === selectedOutfits.outfit),
    hair: wardrobe.find(w => w.id === selectedOutfits.hair),
    accessory: wardrobe.find(w => w.id === selectedOutfits.accessory),
    expression: wardrobe.find(w => w.id === selectedOutfits.expression),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">Tvá Personalizovaná Ninna ✨</h1>
            <p className="text-gray-400">Nastaveno přesně tak, jak jsi si přála/a</p>
          </div>
          <Button
            variant="outline"
            className="border-gray-600 text-gray-300 hover:bg-gray-700"
            onClick={() => logout.mutate()}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Odhlásit
          </Button>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
          {/* Avatar Display */}
          <div className="xl:col-span-2">
            <Card className="bg-gradient-to-br from-gray-800/50 to-purple-900/30 border-pink-500/30 overflow-hidden">
              <div className="relative h-[600px] flex items-center justify-center bg-gradient-to-t from-purple-900/40 to-transparent">
                <img src={ninnaImg} alt="Tvá Ninna" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />

                {/* Your Style Badge */}
                <div className="absolute top-4 right-4 bg-purple-500/20 border border-purple-500/50 rounded-full px-4 py-2">
                  <span className="text-lg">{STYLE_OPTIONS[prefs.style].emoji}</span>
                  <span className="text-xs font-bold text-purple-300 ml-2 uppercase">
                    {STYLE_OPTIONS[prefs.style].label}
                  </span>
                </div>

                {/* Avatar Info */}
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-center">
                  <h2 className="text-3xl font-black text-white drop-shadow-lg">
                    Ninna <span className="text-pink-400">pro {user.firstName || "tebe"}</span>
                  </h2>
                  <div className="flex justify-center gap-2 mt-3 text-sm text-gray-200">
                    <span className="px-2 py-1 bg-white/10 rounded">{finalSelectedItems.outfit?.preview}</span>
                    <span className="px-2 py-1 bg-white/10 rounded">{finalSelectedItems.hair?.preview}</span>
                    <span className="px-2 py-1 bg-white/10 rounded">{finalSelectedItems.accessory?.preview}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Card className="bg-gray-800/40 border-purple-500/30 p-4 text-center">
                <Heart className="w-6 h-6 mx-auto mb-2 text-pink-500" />
                <div className="text-2xl font-bold text-white">100%</div>
                <div className="text-xs text-gray-400">Kompatibilita</div>
              </Card>
              <Card className="bg-gray-800/40 border-purple-500/30 p-4 text-center">
                <Zap className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                <div className="text-2xl font-bold text-white">24/7</div>
                <div className="text-xs text-gray-400">Dostupnost</div>
              </Card>
              <Card className="bg-gray-800/40 border-purple-500/30 p-4 text-center">
                <MessageSquare className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold text-white">∞</div>
                <div className="text-xs text-gray-400">Zprávy</div>
              </Card>
            </div>
          </div>

          {/* Summary - Right */}
          <div className="space-y-4">
            <Card className="bg-gray-800/40 border-purple-500/30 p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Tvoje Nastavení
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-gray-300 block mb-2">Styl</label>
                  <div className="px-3 py-2 bg-gray-700/50 rounded text-white text-sm">
                    {STYLE_OPTIONS[prefs.style].emoji} {STYLE_OPTIONS[prefs.style].label}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-300 block mb-2">Očekávání</label>
                  <div className="flex flex-wrap gap-2">
                    {prefs.expectations.map((e) => {
                      const exp = EXPECTATIONS.find(x => x.id === e);
                      return (
                        <span key={e} className="px-2 py-1 bg-pink-500/30 border border-pink-500/50 rounded text-xs text-pink-300">
                          {exp?.emoji} {exp?.label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-gray-300 block mb-2">Outfity</label>
                  <div className="flex gap-2">
                    {finalSelectedItems.outfit && <span className="px-2 py-1 bg-purple-500/30 border border-purple-500/50 rounded text-xs text-purple-300">{finalSelectedItems.outfit.preview} {finalSelectedItems.outfit.name}</span>}
                    {finalSelectedItems.hair && <span className="px-2 py-1 bg-purple-500/30 border border-purple-500/50 rounded text-xs text-purple-300">{finalSelectedItems.hair.preview}</span>}
                  </div>
                </div>
              </div>
            </Card>

            <Button
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 font-bold py-6"
              onClick={() => setLocation("/chat")}
              data-testid="button-start-chat"
            >
              💬 Začít chatovat s Ninnou
            </Button>

            <Button
              variant="outline"
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
              onClick={() => setStep("wardrobe")}
              data-testid="button-customize-wardrobe"
            >
              ⚙️ Upravit outfity
            </Button>
          </div>
        </div>

        {/* Info */}
        <Card className="bg-gray-800/40 border-purple-500/30 p-6">
          <h2 className="text-2xl font-bold text-white mb-4">Co máš k dispozici</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: "💭", title: "AI Rozhovory", desc: "Přesně podle tvojích potřeb" },
              { icon: "📸", title: "Exkluzivní Obsah", desc: "Tvůj osobní outfit keeper" },
              { icon: "🎯", title: "Personalizace", desc: "Měnit cokoliv chceš" },
            ].map((item, i) => (
              <div key={i} className="p-4 bg-gray-700/30 rounded-lg">
                <div className="text-3xl mb-2">{item.icon}</div>
                <h3 className="font-bold text-white mb-1">{item.title}</h3>
                <p className="text-sm text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
