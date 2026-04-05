import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";
import demoSkinImg from "@assets/IMG_6505_1775407468116.jpeg";

type AiProfile = {
  status: "hot" | "warm" | "cold" | "new";
  statusLabel: string;
  engagementScore: number;
  summary: string;
  personality: string[];
  interests: string[];
  buyingPotential: string;
  nextAction: string;
  suggestedMessages: string[];
  contentIdeas: string[];
  warnings: string[];
  lastAnalyzed: string;
};

type ManagerUser = {
  id: number;
  name: string;
  messageCount: number;
  createdAt: string;
  conversations: number;
  totalMessages: number;
  lastActivity: string | null;
  aiProfile: AiProfile | null;
  aiProfileUpdatedAt: string | null;
};

type ContentItem = {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  tags: string[];
  category: string;
  description: string | null;
  timesUsed: number;
  createdAt: string;
};

type TrendData = {
  trendingTopics: string[];
  contentRecommendations: { type: string; description: string; priority: string }[];
  promotionStrategy: { platform: string; action: string; timing: string }[];
  engagementTips: string[];
  warnings: string[];
  weeklyPlan: Record<string, string>;
  summary: string;
  analyzedAt: string;
};

const STATUS_CONFIG = {
  hot: { label: "🔥 Horký", bg: "bg-red-500/20", border: "border-red-500/40", text: "text-red-400" },
  warm: { label: "⚡ Teplý", bg: "bg-orange-500/20", border: "border-orange-500/40", text: "text-orange-400" },
  cold: { label: "❄️ Studený", bg: "bg-blue-500/20", border: "border-blue-500/40", text: "text-blue-400" },
  new: { label: "🌱 Nový", bg: "bg-neutral-700/40", border: "border-neutral-600", text: "text-neutral-400" },
};

const DAY_NAMES: Record<string, string> = {
  monday: "Pondělí", tuesday: "Úterý", wednesday: "Středa",
  thursday: "Čtvrtek", friday: "Pátek", saturday: "Sobota", sunday: "Neděle",
};

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const login = async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw, role: "owner", username: "Manager" }),
    });
    if (res.ok) onSuccess();
    else setError("Špatné heslo");
  };
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-2">🧠</div>
          <h1 className="text-xl font-bold text-white" data-testid="text-manager-title">AI Manager</h1>
          <p className="text-neutral-500 text-sm mt-1">Autonomní správce agentury</p>
        </div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()} placeholder="Owner heslo"
          data-testid="input-manager-password"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition-colors" />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button onClick={login} disabled={!pw.trim()} data-testid="button-manager-login"
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
          Přihlásit
        </button>
      </motion.div>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-red-500" : score >= 40 ? "bg-orange-400" : "bg-blue-500";
  return (
    <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
        className={`h-full rounded-full ${color}`} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <button onClick={copy} data-testid="button-copy" className="text-[10px] text-neutral-600 hover:text-emerald-400 transition-colors ml-2 shrink-0">
      {copied ? "✓" : "📋"}
    </button>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Tab: Customers ──────────────────────────────────────────────────────────

function CustomersTab({ users, qc }: { users: ManagerUser[]; qc: ReturnType<typeof useQueryClient> }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "hot" | "warm" | "cold" | "new">("all");

  const analyzeMut = useMutation({
    mutationFn: async (userId: number) => {
      setAnalyzingId(userId);
      const res = await fetch(`/api/manager/analyze/${userId}`, { method: "POST" });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/manager/overview"] }); setAnalyzingId(null); },
    onError: () => setAnalyzingId(null),
  });

  const analyzeAll = async () => {
    setBatchRunning(true);
    await fetch("/api/manager/analyze-all", { method: "POST" });
    setTimeout(() => { qc.invalidateQueries({ queryKey: ["/api/manager/overview"] }); setBatchRunning(false); }, 15000);
  };

  const filtered = filter === "all" ? users : users.filter(u => (u.aiProfile?.status || "new") === filter);
  const selectedUser = users.find(u => u.id === selectedId);

  const counts = {
    all: users.length,
    hot: users.filter(u => u.aiProfile?.status === "hot").length,
    warm: users.filter(u => u.aiProfile?.status === "warm").length,
    cold: users.filter(u => u.aiProfile?.status === "cold").length,
    new: users.filter(u => !u.aiProfile || u.aiProfile.status === "new").length,
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className={`w-full md:w-96 border-r border-neutral-800 flex flex-col overflow-hidden ${selectedId !== null ? "hidden md:flex" : "flex"}`}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
          <div className="flex gap-1 overflow-x-auto">
            {(["all", "hot", "warm", "cold", "new"] as const).map(f => (
              <button key={f} onClick={() => { setFilter(f); setSelectedId(null); }}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors whitespace-nowrap ${filter === f ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-300"}`}>
                {f === "all" ? `Vše (${counts.all})` : f === "hot" ? `🔥${counts.hot}` : f === "warm" ? `⚡${counts.warm}` : f === "cold" ? `❄️${counts.cold}` : `🌱${counts.new}`}
              </button>
            ))}
          </div>
          <button onClick={analyzeAll} disabled={batchRunning} data-testid="button-analyze-all"
            className={`text-[10px] px-3 py-1.5 rounded-lg font-bold transition-colors shrink-0 ml-2 ${batchRunning ? "bg-neutral-700 text-neutral-500" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}>
            {batchRunning ? "⏳..." : "⚡ Vše"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(user => {
            const profile = user.aiProfile;
            const cfg = STATUS_CONFIG[profile?.status || "new"];
            return (
              <button key={user.id} onClick={() => setSelectedId(user.id)} data-testid={`button-select-user-${user.id}`}
                className={`w-full text-left px-4 py-3 border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-colors ${selectedId === user.id ? "bg-neutral-800" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border shrink-0 ${cfg.bg} ${cfg.border} ${cfg.text}`}>{user.name[0]?.toUpperCase()}</div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{user.name}</p>
                      <p className="text-[10px] text-neutral-500">{user.totalMessages} zpráv</p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text}`}>{profile?.statusLabel || "Nový"}</span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="text-center text-neutral-600 py-12 text-sm">Žádní zákazníci</div>}
        </div>
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden ${selectedId === null ? "hidden md:flex" : "flex"}`}>
        {!selectedUser ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
            <div className="text-4xl">👥</div>
            <p className="text-neutral-500 text-sm">Vyber zákazníka ze seznamu</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="sticky top-0 border-b border-neutral-800 px-4 py-2 bg-neutral-950/95 backdrop-blur flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedId(null)} className="md:hidden text-neutral-500 hover:text-white">←</button>
                <p className="font-bold text-sm">{selectedUser.name}</p>
              </div>
              <button onClick={() => analyzeMut.mutate(selectedUser.id)} disabled={analyzingId === selectedUser.id} data-testid="button-analyze-user"
                className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-bold">
                {analyzingId === selectedUser.id ? "⏳..." : "🧠 Analyzovat"}
              </button>
            </div>
            {!selectedUser.aiProfile ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-3">
                <p className="text-neutral-500 text-sm">Neanalyzován</p>
                <button onClick={() => analyzeMut.mutate(selectedUser.id)} className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold text-sm">Spustit analýzu</button>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {(() => {
                  const p = selectedUser.aiProfile!;
                  const cfg = STATUS_CONFIG[p.status];
                  return (<>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${cfg.bg} ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                      <span className="text-xs text-neutral-500">Potenciál: <strong className={p.buyingPotential === "vysoký" ? "text-red-400" : p.buyingPotential === "střední" ? "text-orange-400" : "text-blue-400"}>{p.buyingPotential}</strong></span>
                    </div>
                    <div><div className="flex justify-between text-[10px] text-neutral-500 mb-1"><span>Engagement</span><span className="font-bold">{p.engagementScore}%</span></div><ScoreBar score={p.engagementScore} /></div>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">📋 Profil</p>
                      <p className="text-sm text-neutral-300">{p.summary}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">🎭 Osobnost</p>
                        <div className="flex flex-wrap gap-1">{p.personality.map((t, i) => <span key={i} className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">{t}</span>)}</div>
                      </div>
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">❤️ Zájmy</p>
                        <div className="flex flex-wrap gap-1">{p.interests.map((t, i) => <span key={i} className="text-[10px] bg-pink-500/20 border border-pink-500/30 text-pink-400 px-1.5 py-0.5 rounded">{t}</span>)}</div>
                      </div>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">💡 Doporučená akce</p>
                      <p className="text-sm text-emerald-300">{p.nextAction}</p>
                    </div>
                    {p.suggestedMessages.length > 0 && (
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">✍️ Navrhované zprávy</p>
                        {p.suggestedMessages.map((msg, i) => (
                          <div key={i} className="flex items-start justify-between gap-1 bg-neutral-800/60 rounded-lg px-2 py-2 mb-1">
                            <p className="text-xs text-white">{msg}</p>
                            <CopyButton text={msg} />
                          </div>
                        ))}
                      </div>
                    )}
                    {p.contentIdeas.length > 0 && (
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">🎬 Content nápady</p>
                        {p.contentIdeas.map((idea, i) => (
                          <div key={i} className="flex items-start gap-1 mb-1"><span className="text-pink-500 text-xs">→</span><p className="text-xs text-neutral-300">{idea}</p></div>
                        ))}
                      </div>
                    )}
                    {p.warnings.length > 0 && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">⚠️ Varování</p>
                        {p.warnings.map((w, i) => <p key={i} className="text-xs text-red-300">{w}</p>)}
                      </div>
                    )}
                  </>);
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Content Vault ──────────────────────────────────────────────────────

function VaultTab() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("general");

  const { data: items = [], isLoading } = useQuery<ContentItem[]>({
    queryKey: ["/api/vault/items"],
    queryFn: () => fetch("/api/vault/items").then(r => r.json()),
  });

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("description", desc);
    fd.append("tags", JSON.stringify(tags.split(",").map(t => t.trim()).filter(Boolean)));
    fd.append("category", category);
    await fetch("/api/vault/upload", { method: "POST", body: fd });
    qc.invalidateQueries({ queryKey: ["/api/vault/items"] });
    setDesc(""); setTags(""); setCategory("general");
    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
  };

  const deleteMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/vault/items/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/vault/items"] }),
  });

  const CATS = [
    { value: "general", label: "Obecné" },
    { value: "photo", label: "📸 Fotky" },
    { value: "video", label: "🎬 Videa" },
    { value: "audio", label: "🎵 Audio" },
    { value: "ppv", label: "💎 PPV" },
    { value: "teaser", label: "🔥 Teaser" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">📤 Nahrát obsah</p>
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*"
          data-testid="input-vault-file"
          className="w-full text-sm text-neutral-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 file:cursor-pointer" />
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Popis (volitelné)"
          data-testid="input-vault-description"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
        <div className="flex gap-2">
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tagy (oddělené čárkou)"
            data-testid="input-vault-tags"
            className="flex-1 bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          <select value={category} onChange={e => setCategory(e.target.value)} data-testid="select-vault-category"
            className="bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 text-sm outline-none">
            {CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <button onClick={handleUpload} disabled={uploading} data-testid="button-vault-upload"
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
          {uploading ? "⏳ Nahrávám..." : "📤 Nahrát"}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">📦 Vault · {items.length} položek</p>
        {isLoading && <p className="text-neutral-600 text-sm text-center py-8">Načítám...</p>}
        {items.map(item => (
          <div key={item.id} data-testid={`card-vault-item-${item.id}`}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${
              item.mimeType.startsWith("image") ? "bg-pink-500/20" :
              item.mimeType.startsWith("video") ? "bg-purple-500/20" :
              item.mimeType.startsWith("audio") ? "bg-blue-500/20" : "bg-neutral-800"
            }`}>
              {item.mimeType.startsWith("image") ? "📸" : item.mimeType.startsWith("video") ? "🎬" : item.mimeType.startsWith("audio") ? "🎵" : "📄"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{item.originalName}</p>
              <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                <span>{formatSize(item.size)}</span>
                <span>·</span>
                <span>Použito {item.timesUsed}×</span>
                {item.category !== "general" && <><span>·</span><span>{CATS.find(c => c.value === item.category)?.label}</span></>}
              </div>
              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.tags.map((t, i) => <span key={i} className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{t}</span>)}
                </div>
              )}
            </div>
            <button onClick={() => deleteMut.mutate(item.id)} data-testid={`button-delete-vault-${item.id}`}
              className="text-neutral-600 hover:text-red-400 text-sm transition-colors shrink-0">🗑️</button>
          </div>
        ))}
        {!isLoading && items.length === 0 && (
          <div className="text-center text-neutral-600 py-8 text-sm">Vault je prázdný — nahraj svůj první obsah</div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Trends ─────────────────────────────────────────────────────────────

function TrendsTab() {
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manager/trends", { method: "POST" });
      const data = await res.json();
      setTrends(data);
    } catch {}
    setLoading(false);
  };

  const PRIO = { vysoká: "text-red-400 bg-red-500/20 border-red-500/30", střední: "text-orange-400 bg-orange-500/20 border-orange-500/30", nízká: "text-blue-400 bg-blue-500/20 border-blue-500/30" };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-bold">📊 Trend Scanner</p>
          <p className="text-neutral-500 text-xs">AI analyzuje tvou agenturu a doporučí strategii</p>
        </div>
        <button onClick={analyze} disabled={loading} data-testid="button-scan-trends"
          className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold">
          {loading ? "⏳ Analyzuji..." : "🔍 Skenovat trendy"}
        </button>
      </div>

      {!trends && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="text-5xl">📊</div>
          <p className="text-neutral-500 text-sm">Klikni "Skenovat trendy" pro AI analýzu</p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="text-5xl animate-pulse">🧠</div>
          <p className="text-neutral-400 text-sm">AI analyzuje data a trendy...</p>
        </div>
      )}

      {trends && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2">📝 Shrnutí</p>
            <p className="text-sm text-emerald-300 leading-relaxed">{trends.summary}</p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">🔥 Trendy</p>
            <div className="flex flex-wrap gap-2">
              {trends.trendingTopics.map((t, i) => <span key={i} className="text-xs bg-pink-500/20 border border-pink-500/30 text-pink-400 px-2 py-1 rounded-lg">{t}</span>)}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">🎬 Content doporučení</p>
            <div className="space-y-2">
              {trends.contentRecommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-2 bg-neutral-800/60 rounded-lg px-3 py-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${PRIO[r.priority as keyof typeof PRIO] || PRIO.nízká}`}>{r.priority}</span>
                  <div><p className="text-xs text-neutral-400">{r.type}</p><p className="text-sm text-white">{r.description}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">📢 Kde a jak promovat</p>
            <div className="space-y-2">
              {trends.promotionStrategy.map((s, i) => (
                <div key={i} className="bg-neutral-800/60 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-white">{s.platform}</span>
                    <span className="text-[10px] text-neutral-500">{s.timing}</span>
                  </div>
                  <p className="text-xs text-neutral-300">{s.action}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">📅 Týdenní plán</p>
            <div className="space-y-1.5">
              {Object.entries(trends.weeklyPlan).map(([day, task]) => (
                <div key={day} className="flex gap-2 text-sm">
                  <span className="text-neutral-500 font-bold w-16 shrink-0 text-xs pt-0.5">{DAY_NAMES[day] || day}</span>
                  <p className="text-neutral-300 text-xs">{task}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">💡 Engagement tipy</p>
            {trends.engagementTips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 mb-1"><span className="text-emerald-500 text-xs">✓</span><p className="text-xs text-neutral-300">{tip}</p></div>
            ))}
          </div>

          {trends.warnings.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">⚠️ Varování</p>
              {trends.warnings.map((w, i) => <p key={i} className="text-xs text-red-300">{w}</p>)}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── Tab: Broadcast ──────────────────────────────────────────────────────────

function BroadcastTab() {
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; sent: number } | null>(null);

  const send = async () => {
    if (!msg.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/manager/broadcast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setResult(data);
      setMsg("");
    } catch {}
    setSending(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div>
        <p className="text-white font-bold">📢 Broadcast zpráva</p>
        <p className="text-neutral-500 text-xs">Pošli zprávu všem zákazníkům najednou</p>
      </div>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
        <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4}
          placeholder="Napíš zprávu pro všechny zákazníky..."
          data-testid="textarea-broadcast"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 resize-none" />
        <button onClick={send} disabled={sending || !msg.trim()} data-testid="button-broadcast-send"
          className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
          {sending ? "⏳ Odesílám..." : `📢 Odeslat všem`}
        </button>
      </div>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
            <p className="text-emerald-400 font-bold">✓ Odesláno do {result.sent} konverzací</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">💡 Tipy pro broadcast</p>
        <div className="space-y-1.5 text-xs text-neutral-400">
          <p>→ Personalizuj — nejlepší broadcast vypadá jako osobní zpráva</p>
          <p>→ Přidej urgenci — "Jen dnes" nebo "Posledních X míst"</p>
          <p>→ Nepřeháněj — max 2-3 broadcasty týdně</p>
          <p>→ Nejlepší čas — pátek večer, sobota odpoledne</p>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Skins/Wardrobe ─────────────────────────────────────────────────────
function SkinsTab() {
  const demoSkin = {
    id: 1,
    name: "AI Founder",
    price: 2999,
    description: "Twin v roli AI Founder - prezentační look",
    image: "@assets/IMG_6505_1775407468116.jpeg",
  };

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <div className="p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Virtuální Twin - Wardrobe Manager</h2>
          <p className="text-neutral-400">Správa outfitů a skinů Twin Agenta</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Dostupné Skins */}
          <div className="lg:col-span-2">
            <h3 className="text-lg font-bold mb-4">Dostupné Skins</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden hover:border-emerald-500/50 transition-colors">
                <div className="aspect-video bg-neutral-800 overflow-hidden">
                  <img src={demoSkinImg} alt={demoSkin.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-4">
                  <h4 className="font-bold mb-1">{demoSkin.name}</h4>
                  <p className="text-neutral-400 text-xs mb-3">{demoSkin.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400 font-bold">{(demoSkin.price / 100).toFixed(0)} Kč</span>
                    <button className="text-xs bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded transition-colors text-white font-bold">
                      Aktivovat
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-4">
            <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800">
              <p className="text-neutral-500 text-xs mb-1">CELKEM SKINŮ</p>
              <p className="text-3xl font-bold">1</p>
            </div>
            <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800">
              <p className="text-neutral-500 text-xs mb-1">UŽIVATELÉ S WARDROBE</p>
              <p className="text-3xl font-bold">0</p>
            </div>
            <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800">
              <p className="text-neutral-500 text-xs mb-1">AKTIVNÍ SKIN</p>
              <p className="text-sm text-emerald-400 font-bold">Žádný</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function ManagerDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"customers" | "vault" | "trends" | "broadcast" | "skins">("customers");
  const qc = useQueryClient();

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => setAuthed(d.role === "owner")).catch(() => setAuthed(false));
  }, []);

  const { data: users = [], isLoading } = useQuery<ManagerUser[]>({
    queryKey: ["/api/manager/overview"],
    enabled: authed === true,
    refetchInterval: 20000,
    queryFn: () => fetch("/api/manager/overview").then(r => r.json()),
  });

  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); setAuthed(false); };

  if (authed === null) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><div className="text-neutral-600">Načítám...</div></div>;
  if (authed === false) return <LoginForm onSuccess={() => { setAuthed(true); window.location.reload(); }} />;

  const TABS = [
    { id: "customers" as const, icon: "👥", label: "Zákazníci" },
    { id: "vault" as const, icon: "📦", label: "Vault" },
    { id: "trends" as const, icon: "📊", label: "Trendy" },
    { id: "broadcast" as const, icon: "📢", label: "Broadcast" },
    { id: "skins" as const, icon: "👯‍♀️", label: "Twin" },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <div className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <div>
            <h1 className="font-bold text-sm leading-none" data-testid="text-dashboard-title">AI Manager</h1>
            <p className="text-neutral-500 text-[10px]">{users.length} zákazníků</p>
          </div>
        </div>
        <button onClick={logout} data-testid="button-logout" className="text-neutral-500 hover:text-white text-xs transition-colors">Odhlásit</button>
      </div>

      <div className="flex border-b border-neutral-800 bg-neutral-900/40 px-2">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold transition-colors border-b-2 ${
              activeTab === tab.id ? "border-emerald-500 text-white" : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}>
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "customers" && <CustomersTab users={users} qc={qc} />}
        {activeTab === "vault" && <VaultTab />}
        {activeTab === "trends" && <TrendsTab />}
        {activeTab === "broadcast" && <BroadcastTab />}
        {activeTab === "skins" && <SkinsTab />}
      </div>
    </div>
  );
}
