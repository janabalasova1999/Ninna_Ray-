import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

type Stats = {
  totalUsers: number; totalConversations: number; totalMessages: number;
  avgMessagesPerUser: number; activeConversations24h: number; manualModeCount: number;
};
type AdminUser = {
  id: number; name: string; isPremium: boolean; messageCount: number;
  createdAt: string; totalMessages: number; lastActivity: string | null;
};
type ConvUser = { id: number; name: string } | null;
type LastMsg = { id: number; role: string; content: string; createdAt: string } | null;
type AdminConv = {
  id: number; userId: number; title: string; createdAt: string;
  manualMode: boolean; assignedAgent: string | null;
  messageCount: number; user: ConvUser; lastMessage: LastMsg;
};
type Message = { id: number; role: string; content: string; createdAt: string };

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true); setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw, role: "owner", username: "Owner" }),
    });
    const data = await res.json();
    if (res.ok) onSuccess();
    else { setError(data.message || "Chyba"); setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-2">👑</div>
          <h1 className="text-xl font-bold text-white">Owner Dashboard</h1>
          <p className="text-neutral-500 text-sm mt-1">Přístup pouze pro vlastníka</p>
        </div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()} placeholder="Owner heslo"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 outline-none focus:border-purple-500 transition-colors" />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button onClick={login} disabled={loading || !pw.trim()}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
          {loading ? "..." : "Přihlásit"}
        </button>
      </motion.div>
    </div>
  );
}

type Tab = "overview" | "users" | "conversations" | "avatar";
type AvatarElement = { id: number; contentItemId: number; elementType: string; name: string; previewUrl: string | null; metadata: Record<string, any>; contentItem: { id: number; filename: string; originalName: string; mimeType: string } | null };

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      setAuthed(d.role === "owner");
    });
  }, []);

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/admin/stats"],
    enabled: authed === true,
    refetchInterval: 30000,
    queryFn: () => fetch("/api/admin/stats").then(r => r.json()),
  });

  const { data: users = [] } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: authed === true && tab === "users",
    queryFn: () => fetch("/api/admin/users").then(r => r.json()),
  });

  const { data: conversations = [] } = useQuery<AdminConv[]>({
    queryKey: ["/api/admin/conversations"],
    enabled: authed === true && (tab === "conversations" || tab === "overview"),
    refetchInterval: 15000,
    queryFn: () => fetch("/api/admin/conversations").then(r => r.json()),
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/admin/conversations", selectedConvId, "messages"],
    enabled: authed === true && selectedConvId !== null,
    refetchInterval: 5000,
    queryFn: () => fetch(`/api/admin/conversations/${selectedConvId}/messages`).then(r => r.json()),
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const { data: avatarElements = [], refetch: refetchElements } = useQuery<AvatarElement[]>({
    queryKey: ["/api/avatar/elements/all"],
    enabled: authed === true && tab === "avatar",
    queryFn: () => fetch("/api/avatar/elements/all").then(r => r.json()).then(d => d.elements || []),
  });

  const { data: contentItems = [] } = useQuery<{ id: number; originalName: string; filename: string; mimeType: string }[]>({
    queryKey: ["/api/vault/items"],
    enabled: authed === true && tab === "avatar",
    queryFn: () => fetch("/api/vault/items").then(r => r.json()),
  });

  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);

  const analyzePhotoMutation = useMutation({
    mutationFn: async (contentItemId: number) => {
      const res = await fetch("/api/avatar/analyze-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentItemId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setAnalyzeResult(`Extrahováno ${data.createdElements.length} prvků: ${data.createdElements.map((e: any) => e.name).join(", ")}`);
      refetchElements();
    },
    onError: (err: any) => setAnalyzeResult(`Chyba: ${err.message}`),
  });

  const deleteElementMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/avatar/elements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => refetchElements(),
  });

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthed(false);
  };

  if (authed === null) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><div className="text-neutral-600">Načítám...</div></div>;
  if (authed === false) return <LoginForm onSuccess={() => { setAuthed(true); window.location.reload(); }} />;

  const selectedConv = conversations.find(c => c.id === selectedConvId);

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "Přehled", icon: "📊" },
    { id: "users", label: "Uživatelé", icon: "👥" },
    { id: "conversations", label: "Konverzace", icon: "💬" },
    { id: "avatar", label: "Virtual Twin", icon: "✨" },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👑</span>
          <div>
            <h1 className="font-bold leading-none">Ninna Agency — Owner</h1>
            <p className="text-neutral-500 text-xs">Plný přístup ke všem datům</p>
          </div>
        </div>
        <button onClick={logout} className="text-neutral-500 hover:text-white text-sm transition-colors">Odhlásit</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 bg-neutral-900/50">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelectedConvId(null); }}
            className={`px-5 py-3 text-sm font-medium transition-colors flex items-center gap-2 border-b-2 ${tab === t.id ? "border-purple-500 text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {/* Stats grid */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: "Uživatelé", value: stats.totalUsers, icon: "👤", color: "text-blue-400" },
                  { label: "Konverzace", value: stats.totalConversations, icon: "💬", color: "text-green-400" },
                  { label: "Zprávy", value: stats.totalMessages, icon: "📨", color: "text-yellow-400" },
                  { label: "Průměr/user", value: stats.avgMessagesPerUser, icon: "📊", color: "text-orange-400" },
                  { label: "Aktivní 24h", value: stats.activeConversations24h, icon: "🟢", color: "text-emerald-400" },
                  { label: "Manuální", value: stats.manualModeCount, icon: "✋", color: "text-purple-400" },
                ].map(s => (
                  <div key={s.label} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
                    <div className="text-2xl mb-1">{s.icon}</div>
                    <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-neutral-500 text-xs mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent conversations */}
            <div>
              <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-3">Poslední konverzace</h2>
              <div className="space-y-2">
                {conversations.slice(0, 10).map(conv => (
                  <button key={conv.id} onClick={() => { setTab("conversations"); setSelectedConvId(conv.id); }}
                    className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-neutral-600 rounded-xl p-4 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-pink-600/20 border border-pink-500/30 flex items-center justify-center text-xs font-bold text-pink-400">
                          {conv.user?.name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{conv.user?.name || `User #${conv.userId}`}</p>
                          <p className="text-xs text-neutral-500 truncate max-w-[250px]">
                            {conv.lastMessage ? (conv.lastMessage.role === "user" ? "👤 " : "🍒 ") + conv.lastMessage.content : "Prázdná"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-right shrink-0 ml-2">
                        {conv.manualMode && <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5">MANUAL</span>}
                        <span className="text-xs text-neutral-600">{conv.messageCount} zpráv</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* USERS TAB */}
        {tab === "users" && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-4">
              Všichni uživatelé ({users.length})
            </h2>
            <div className="space-y-2">
              {users.map(user => (
                <div key={user.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center font-bold text-white">
                      {user.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">{user.name}</p>
                      <p className="text-xs text-neutral-500">
                        Registrován: {formatDistanceToNow(new Date(user.createdAt), { locale: cs, addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right space-y-1 shrink-0">
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-xs bg-neutral-800 text-neutral-400 rounded-full px-2 py-0.5">
                        {user.totalMessages} zpráv
                      </span>
                      {user.isPremium && <span className="text-xs bg-yellow-500/20 text-yellow-400 rounded-full px-2 py-0.5">Premium</span>}
                    </div>
                    <p className="text-xs text-neutral-600">
                      {user.lastActivity
                        ? "Naposledy: " + formatDistanceToNow(new Date(user.lastActivity), { locale: cs, addSuffix: true })
                        : "Žádná aktivita"}
                    </p>
                  </div>
                </div>
              ))}
              {users.length === 0 && <div className="text-center text-neutral-600 py-12">Žádní uživatelé</div>}
            </div>
          </div>
        )}

        {/* CONVERSATIONS TAB */}
        {tab === "conversations" && (
          <div className="flex flex-1 overflow-hidden">
            {/* List */}
            <div className={`w-full md:w-80 border-r border-neutral-800 flex flex-col overflow-hidden ${selectedConvId !== null ? "hidden md:flex" : "flex"}`}>
              <div className="px-4 py-2 border-b border-neutral-800">
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Konverzace ({conversations.length})</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversations.map(conv => (
                  <button key={conv.id} onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-left px-4 py-3 border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-colors ${selectedConvId === conv.id ? "bg-neutral-800" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm truncate">{conv.user?.name || `#${conv.userId}`}</span>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        {conv.manualMode && <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full px-1.5 py-0.5">M</span>}
                        <span className="text-xs text-neutral-600">{conv.messageCount}</span>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500 truncate">
                      {conv.lastMessage ? (conv.lastMessage.role === "user" ? "👤 " : "🍒 ") + conv.lastMessage.content : "Prázdná"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat detail */}
            <div className={`flex-1 flex flex-col overflow-hidden ${selectedConvId === null ? "hidden md:flex" : "flex"}`}>
              {!selectedConv ? (
                <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">Vyber konverzaci</div>
              ) : (
                <>
                  <div className="border-b border-neutral-800 px-4 py-3 flex items-center gap-3 bg-neutral-900/50">
                    <button onClick={() => setSelectedConvId(null)} className="md:hidden text-neutral-500 hover:text-white text-lg">←</button>
                    <div className="w-8 h-8 rounded-full bg-pink-600/20 border border-pink-500/30 flex items-center justify-center text-xs font-bold text-pink-400">
                      {selectedConv.user?.name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{selectedConv.user?.name || `User #${selectedConv.userId}`}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-neutral-500">{selectedConv.messageCount} zpráv</p>
                        {selectedConv.manualMode && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5">
                            MANUAL · {selectedConv.assignedAgent}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    <AnimatePresence initial={false}>
                      {messages.map(msg => (
                        <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === "user" ? "bg-neutral-800 text-white rounded-tl-sm" : "bg-pink-600/90 text-white rounded-tr-sm"}`}>
                            <p className="leading-relaxed break-words">{msg.content}</p>
                            <p className="text-[10px] mt-1 opacity-40 text-right">
                              {msg.role === "assistant" ? "🍒 Ninna" : "👤"} · {formatDistanceToNow(new Date(msg.createdAt), { locale: cs, addSuffix: true })}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t border-neutral-800 p-3 bg-neutral-900/30 text-center">
                    <p className="text-xs text-neutral-600">👑 Režim pouze pro čtení — odpovědi jsou dostupné v Agent dashboardu</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── VIRTUAL TWIN TAB ─────────────────────────────────────────────── */}
        {tab === "avatar" && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">✨ Virtual Twin Skin Engine</h2>
              <p className="text-neutral-500 text-sm">Správa vizuálních prvků (skinů) pro zákazníky. Analyzuj fotky AI modelem a extrahuj elementy pro šatník.</p>
            </div>

            {/* Analyze Photo Section */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-white text-sm">🔬 Analýza fotografie (GPT-4o Vision)</h3>
              <p className="text-neutral-500 text-xs">Vyber fotku ze trezoru a AI automaticky extrahuje vizuální prvky (oblečení, vlasy, pozadí, výraz, doplněk).</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {contentItems.filter(c => c.mimeType.startsWith("image/")).slice(0, 20).map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-neutral-800/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-pink-400 text-sm shrink-0">🖼</span>
                      <span className="text-sm text-neutral-300 truncate">{item.originalName}</span>
                    </div>
                    <button
                      onClick={() => {
                        setAnalyzingId(item.id);
                        setAnalyzeResult(null);
                        analyzePhotoMutation.mutate(item.id);
                      }}
                      disabled={analyzePhotoMutation.isPending}
                      className="shrink-0 ml-2 px-3 py-1 text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                      data-testid={`button-analyze-${item.id}`}
                    >
                      {analyzePhotoMutation.isPending && analyzingId === item.id ? "Analyzuji..." : "Analyzovat"}
                    </button>
                  </div>
                ))}
                {contentItems.filter(c => c.mimeType.startsWith("image/")).length === 0 && (
                  <p className="text-neutral-600 text-sm col-span-2">Žádné fotky v trezoru</p>
                )}
              </div>
              {analyzeResult && (
                <div className="bg-violet-950/30 border border-violet-500/30 rounded-lg p-3 text-sm text-violet-300">
                  ✅ {analyzeResult}
                </div>
              )}
            </div>

            {/* Elements List */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white text-sm">🎨 Dostupné Avatar Elementy ({avatarElements.length})</h3>
                <button onClick={() => refetchElements()} className="text-xs text-neutral-500 hover:text-white transition-colors">↻ Obnovit</button>
              </div>
              {avatarElements.length === 0 ? (
                <p className="text-neutral-600 text-sm text-center py-8">Zatím žádné elementy. Analyzuj fotky výše.</p>
              ) : (
                <div className="space-y-2">
                  {["outfit", "hair", "background", "expression", "accessory"].map(type => {
                    const typeElements = avatarElements.filter(e => e.elementType === type);
                    if (typeElements.length === 0) return null;
                    const typeLabels: Record<string, string> = { outfit: "👗 Oblečení", hair: "💇 Vlasy", background: "🖼 Pozadí", expression: "😊 Výraz", accessory: "💎 Doplněk" };
                    return (
                      <div key={type}>
                        <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1.5 mt-3">{typeLabels[type]} ({typeElements.length})</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {typeElements.map(el => (
                            <div key={el.id} className="flex items-center gap-3 bg-neutral-800/50 rounded-lg p-2.5">
                              {el.previewUrl && (
                                <img src={el.previewUrl} alt={el.name} className="w-10 h-10 rounded object-cover shrink-0 opacity-80" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-white font-medium truncate">{el.name}</p>
                                <p className="text-xs text-neutral-500 truncate">{el.contentItem?.originalName || `Foto #${el.contentItemId}`}</p>
                              </div>
                              <button
                                onClick={() => deleteElementMutation.mutate(el.id)}
                                disabled={deleteElementMutation.isPending}
                                className="text-neutral-600 hover:text-red-400 transition-colors text-sm shrink-0"
                                title="Smazat"
                                data-testid={`button-delete-element-${el.id}`}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-4">
              <h4 className="text-amber-400 font-semibold text-sm mb-2">📋 Jak funguje Virtual Twin Engine?</h4>
              <ol className="text-neutral-400 text-xs space-y-1.5 list-decimal list-inside">
                <li>Zákazník si zakoupí fotku Ninny přes chat (Stripe PPV)</li>
                <li>Owner analyzuje fotku pomocí GPT-4o Vision → extrahuje vizuální prvky</li>
                <li>Prvky se uloží jako "skiny" dostupné zákazníkovi v šatníku (/avatar)</li>
                <li>Zákazník si vybere skiny z různých kategorií a uloží konfiguraci</li>
                <li>AI chat ví o preferencích zákazníka a personalizuje komunikaci</li>
              </ol>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
