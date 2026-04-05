import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Check, Crown, Sparkles, Heart, MessageCircleHeart, Lock, CreditCard, Zap } from "lucide-react";

type Plan = {
  key: string;
  name: string;
  description: string;
  priceMonthly: number;
  features: string[];
  emoji: string;
  badge: string;
  priceId: string | null;
};

export default function Payment() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"subscription" | "ppv">("subscription");

  const userStr = localStorage.getItem("ninna_user");
  const user = userStr ? JSON.parse(userStr) : null;

  const { data: plansData, isLoading } = useQuery<{ plans: Plan[]; connected: boolean }>({
    queryKey: ["/api/stripe/subscription-plans"],
  });

  const { data: subData } = useQuery<{ subscription: any }>({
    queryKey: ["/api/stripe/subscription", user?.id ? String(user.id) : "0"],
    enabled: !!user?.id,
  });

  const hasActiveSubscription = subData?.subscription?.status === "active" || subData?.subscription?.status === "trialing";
  const activePlanKey = subData?.subscription?.items?.data?.[0]?.price?.product?.metadata?.ninnaKey;

  const handleSubscribe = async (plan: Plan) => {
    if (!user?.id) { setLocation("/"); return; }
    if (!plan.priceId) return;
    setLoading(plan.key);
    try {
      const res = await apiRequest("POST", "/api/stripe/subscription-checkout", { priceId: plan.priceId, userId: user.id });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setLoading(null);
    }
  };

  const planColors: Record<string, { border: string; bg: string; btn: string; badge: string }> = {
    basic:   { border: "border-pink-500/30",   bg: "bg-pink-500/5",   btn: "from-pink-600 to-rose-600",     badge: "bg-pink-500/20 text-pink-300" },
    vip:     { border: "border-purple-500/40", bg: "bg-purple-500/8", btn: "from-purple-600 to-pink-600",   badge: "bg-purple-500/20 text-purple-300" },
    premium: { border: "border-amber-500/40",  bg: "bg-amber-500/5",  btn: "from-amber-500 to-orange-600",  badge: "bg-amber-500/20 text-amber-300" },
  };

  const plans = plansData?.plans || [];
  const connected = plansData?.connected;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
      <div className="max-w-xl mx-auto px-4 py-8">

        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setLocation("/chat")} className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm" data-testid="button-back-chat">
            <ArrowLeft className="w-4 h-4" /> Zpět do chatu
          </button>
        </div>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center mx-auto mb-3 text-2xl shadow-lg shadow-pink-500/20">🍒</div>
          <h1 className="text-3xl font-bold mb-1" data-testid="text-payment-title">
            Ninna Ray <span className="text-pink-500">VIP</span>
          </h1>
          <p className="text-gray-400 text-sm">Odemkni exkluzivní obsah a zážitky</p>
        </div>

        {hasActiveSubscription && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center" data-testid="status-active-subscription">
            <div className="flex items-center justify-center gap-2 text-emerald-400 font-semibold">
              <Check className="w-5 h-5" />
              Máš aktivní VIP předplatné 🎉
            </div>
            <p className="text-gray-400 text-sm mt-1">Obsah ti Ninna posílá přímo do chatu.</p>
          </div>
        )}

        <div className="flex bg-gray-800/50 rounded-xl p-1 mb-6" data-testid="tabs-payment">
          <button
            onClick={() => setActiveTab("subscription")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "subscription" ? "bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
            data-testid="tab-subscription"
          >
            <Crown className="w-4 h-4 inline mr-1" />
            Předplatné
          </button>
          <button
            onClick={() => setActiveTab("ppv")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "ppv" ? "bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
            data-testid="tab-ppv"
          >
            <Sparkles className="w-4 h-4 inline mr-1" />
            Pay Per View
          </button>
        </div>

        {activeTab === "subscription" && (
          <div className="space-y-4">
            {isLoading && (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-48 bg-gray-800/50 rounded-2xl animate-pulse" />)}
              </div>
            )}

            {!isLoading && !connected && (
              <div className="p-6 rounded-2xl bg-gray-800/50 border border-gray-700 text-center">
                <Lock className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Platební systém se právě nastavuje. Zkus to za chvíli.</p>
              </div>
            )}

            {!isLoading && connected && plans.map((plan, i) => {
              const c = planColors[plan.key] || planColors.basic;
              const isActive = hasActiveSubscription && activePlanKey === plan.key;
              return (
                <motion.div
                  key={plan.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`rounded-2xl border p-5 relative ${c.border} ${c.bg}`}
                  data-testid={`plan-${plan.key}`}
                >
                  {plan.badge && (
                    <span className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-full ${c.badge}`}>
                      {plan.badge}
                    </span>
                  )}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{plan.emoji}</span>
                    <div>
                      <h3 className="font-bold text-white">{plan.name}</h3>
                      <p className="text-gray-400 text-xs">{plan.description}</p>
                    </div>
                  </div>
                  <div className="mb-4">
                    <span className="text-3xl font-bold text-white">{Math.round(plan.priceMonthly / 100)}</span>
                    <span className="text-gray-400 text-sm ml-1">Kč / měsíc</span>
                  </div>
                  <ul className="space-y-1.5 mb-4">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-center gap-2 text-sm text-gray-300">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isActive ? (
                    <div className="py-2.5 text-center text-emerald-400 font-semibold text-sm border border-emerald-500/30 rounded-xl bg-emerald-500/10">
                      ✓ Aktivní plán
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(plan)}
                      disabled={loading === plan.key || !plan.priceId}
                      className={`w-full py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r ${c.btn} hover:opacity-90 transition-opacity disabled:opacity-50`}
                      data-testid={`button-subscribe-${plan.key}`}
                    >
                      {loading === plan.key ? "Přesměrovávám..." : plan.priceId ? `Předplatit za ${Math.round(plan.priceMonthly / 100)} Kč/měsíc` : "Brzy dostupné"}
                    </button>
                  )}
                </motion.div>
              );
            })}

            <p className="text-center text-gray-600 text-xs mt-2">
              🔒 Bezpečné platby přes Stripe. Zrušit lze kdykoliv.
            </p>
          </div>
        )}

        {activeTab === "ppv" && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-900/30 to-pink-900/20 border border-purple-500/20">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="font-bold text-white">Pay Per View — co to je?</p>
                  <p className="text-gray-400 text-xs">Platíš jen za to, co chceš vidět</p>
                </div>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed">
                Ninna ti v chatu pošle nabídku konkrétní fotky nebo videa. Klikneš na tlačítko <span className="text-pink-400 font-semibold">Odemknout</span>, zaplatíš kartou a obsah se ti odemkne okamžitě přímo v konverzaci.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <CreditCard className="w-4 h-4" />, title: "Jednotlivé fotky", price: "od 199 Kč", color: "text-pink-400" },
                { icon: <Zap className="w-4 h-4" />, title: "Videa", price: "od 349 Kč", color: "text-purple-400" },
                { icon: <Heart className="w-4 h-4" />, title: "Sady fotek", price: "od 299 Kč", color: "text-rose-400" },
                { icon: <MessageCircleHeart className="w-4 h-4" />, title: "Custom obsah", price: "od 749 Kč", color: "text-amber-400" },
              ].map((item, i) => (
                <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                  <div className={`${item.color} mb-1`}>{item.icon}</div>
                  <p className="text-white text-xs font-semibold">{item.title}</p>
                  <p className="text-gray-400 text-[10px]">{item.price}</p>
                </div>
              ))}
            </div>

            <div className="p-4 bg-gray-800/30 border border-gray-700/40 rounded-2xl space-y-3">
              <p className="text-xs font-bold text-white">Jak to funguje:</p>
              {[
                "Píšeš si s Ninnou v chatu",
                "Ninna ti nabídne exkluzivní fotku/video",
                "Klikneš na tlačítko a zaplatíš kartou",
                "Obsah se odemkne okamžitě v chatu",
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-400 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <p className="text-gray-300 text-sm">{step}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setLocation("/chat")}
              className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 transition-opacity"
              data-testid="button-go-to-chat"
            >
              <MessageCircleHeart className="w-4 h-4 inline mr-2" />
              Jít do chatu s Ninnou
            </button>

            <p className="text-center text-gray-600 text-xs">
              🔒 Bezpečné platby přes Stripe. Tvoje údaje jsou šifrované.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
