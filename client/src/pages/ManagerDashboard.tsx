import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type ActionItem = {
  message: string;
  timing: string;
  purpose: "build" | "sell" | "hook";
  photoId: number | null;
  photoNote: string | null;
};

type CommunicationPatterns = {
  msgLength?: string;
  responseSpeed?: string;
  usesEmoji?: boolean;
  tone?: string;
  peakHours?: string;
};

type AiProfile = {
  status: "hot" | "warm" | "cold" | "new";
  statusLabel: string;
  engagementScore: number;
  buyingPotential: string;
  strategy?: "build" | "sell" | "hook";
  summary: string;
  personality: string[];
  interests: string[];
  emotionalTriggers?: string[];
  communicationPatterns?: CommunicationPatterns;
  whatWorks?: string[];
  whatFails?: string[];
  mainDriver?: string;
  nextAction?: string;
  actionQueue?: ActionItem[];
  suggestedMessages?: string[];
  contentIdeas?: string[];
  styleNotes?: string;
  trendInsights?: string[];
  warnings?: string[];
  relationshipStage?: string;
  nextMilestone?: string;
  priceSensitivity?: string;
  sellStyle?: string;
  suggestedPrice?: number;
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
  stripeCustomerId?: string | null;
  platform?: string;
  isSubscribed?: boolean;
  botEnabled?: boolean;
  unlockedCount?: number;
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

// ─── Grouping helpers ────────────────────────────────────────────────────────

type UserGroup = {
  name: string;
  sessions: ManagerUser[];
  bestProfile: AiProfile | null;
  bestStatus: "hot" | "warm" | "cold" | "new";
  totalMessages: number;
  totalConversations: number;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function groupUsers(users: ManagerUser[]): UserGroup[] {
  const map = new Map<string, ManagerUser[]>();
  users.forEach(u => {
    const key = normalizeName(u.name);
    const arr = map.get(key) || [];
    arr.push(u);
    map.set(key, arr);
  });
  const statusRank = { hot: 0, warm: 1, cold: 2, new: 3 };
  return Array.from(map.values()).map(sessions => {
    const withProfile = sessions.filter(s => s.aiProfile);
    const bestProfile = withProfile.sort((a, b) => statusRank[a.aiProfile!.status] - statusRank[b.aiProfile!.status])[0]?.aiProfile || null;
    return {
      name: sessions[0].name,
      sessions,
      bestProfile,
      bestStatus: bestProfile?.status || "new",
      totalMessages: sessions.reduce((s, u) => s + u.totalMessages, 0),
      totalConversations: sessions.reduce((s, u) => s + u.conversations, 0),
    };
  });
}

// ─── Chat history for detail view ────────────────────────────────────────────

type ConvMessage = { role: string; content: string; createdAt: string };
type ConvData = { id: number; title: string; messages: ConvMessage[] };

function ChatHistory({ userIds }: { userIds: number[] }) {
  const [convs, setConvs] = useState<ConvData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/manager/users/bulk-conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    })
      .then(r => r.json())
      .then(data => { setConvs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userIds.join(",")]);

  if (loading) return <div className="p-4 text-center text-neutral-500 text-sm">Načítám konverzace...</div>;

  const allMessages = convs.flatMap(conv =>
    conv.messages.map(msg => ({ ...msg, convTitle: conv.title }))
  ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (allMessages.length === 0) return <div className="p-4 text-center text-neutral-500 text-sm">Žádné zprávy</div>;

  let lastDate = "";

  return (
    <div className="px-4 py-3 space-y-1.5" data-testid="chat-history">
      {allMessages.map((msg, idx) => {
        const msgDate = new Date(msg.createdAt).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
        const showDate = msgDate !== lastDate;
        lastDate = msgDate;
        const isUser = msg.role === "user";
        return (
          <div key={idx}>
            {showDate && (
              <div className="text-center my-3">
                <span className="text-[10px] bg-neutral-800 text-neutral-500 px-3 py-1 rounded-full">{msgDate}</span>
              </div>
            )}
            <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div data-testid={`msg-bubble-${idx}`}
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${isUser ? "bg-emerald-600/30 text-emerald-100 rounded-br-md" : "bg-neutral-800 text-neutral-300 rounded-bl-md"}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className={`text-[9px] mt-1 ${isUser ? "text-emerald-400/60" : "text-neutral-600"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Detail Action Queue with vault photos ──────────────────────────────────

function DetailActionQueue({ actions, purposeConfig }: { actions: ActionItem[]; purposeConfig: Record<string, { icon: string; label: string; cls: string }> }) {
  const { data: vaultItems = [] } = useQuery<ContentItem[]>({
    queryKey: ["/api/vault/items"],
    queryFn: () => fetch("/api/vault/items").then(r => r.json()),
  });
  const vaultMap = new Map(vaultItems.map(v => [v.id, v]));
  const isImg = (fn: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(fn);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">📨 Fronta zpráv k odeslání</p>
      {actions.map((action, i) => {
        const aCfg = purposeConfig[action.purpose] || purposeConfig.build;
        const vaultItem = action.photoId ? vaultMap.get(action.photoId) : null;
        const hasPhoto = vaultItem && isImg(vaultItem.filename);
        return (
          <div key={i} data-testid={`action-card-${i}`}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${aCfg.cls}`}>{aCfg.icon} {aCfg.label}</span>
                <span className="text-[10px] text-neutral-500">⏰ {action.timing}</span>
              </div>
              <CopyButton text={action.message} />
            </div>
            <div className="bg-neutral-800/60 rounded-lg px-3 py-2">
              <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{action.message}</p>
            </div>
            {hasPhoto && (
              <div className="flex items-start gap-3">
                <button onClick={() => setExpandedIdx(expandedIdx === i ? null : i)} className="shrink-0">
                  <img src={`/uploads/${vaultItem!.filename}`} alt="Fotka"
                    className={`rounded-lg border border-pink-500/30 object-cover transition-all cursor-pointer hover:brightness-110 ${expandedIdx === i ? "w-40 h-40" : "w-14 h-14"}`} />
                </button>
                <div>
                  <p className="text-[10px] text-pink-400 font-bold">📸 Fotka #{action.photoId}</p>
                  {action.photoNote && <p className="text-[10px] text-pink-300">{action.photoNote}</p>}
                </div>
              </div>
            )}
            {action.photoId && !hasPhoto && (
              <p className="text-[10px] text-pink-400">📸 Fotka #{action.photoId}{action.photoNote ? ` — ${action.photoNote}` : ""}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Customers ──────────────────────────────────────────────────────────

function CustomersTab({ users, qc, selectedGroup, setSelectedGroup, initialFilter }: { users: ManagerUser[]; qc: ReturnType<typeof useQueryClient>; selectedGroup: string | null; setSelectedGroup: (g: string | null) => void; initialFilter?: string }) {
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "hot" | "warm" | "cold" | "new">((initialFilter as any) || "all");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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

  const deleteUser = async (userId: number) => {
    setDeletingId(userId);
    await fetch(`/api/manager/users/${userId}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["/api/manager/overview"] });
    setDeletingId(null);
    setConfirmDelete(null);
  };

  const deleteGroup = async (group: UserGroup) => {
    for (const s of group.sessions) {
      await fetch(`/api/manager/users/${s.id}`, { method: "DELETE" });
    }
    qc.invalidateQueries({ queryKey: ["/api/manager/overview"] });
    setSelectedGroup(null);
    setConfirmDelete(null);
  };

  const groups = groupUsers(users);

  const filteredGroups = groups
    .filter(g => filter === "all" || g.bestStatus === filter)
    .filter(g => !search.trim() || g.name.toLowerCase().includes(search.trim().toLowerCase()));

  const activeGroup = groups.find(g => g.name === selectedGroup);
  const primaryUser = activeGroup?.sessions.find(s => s.aiProfile) || activeGroup?.sessions[0];

  const counts = {
    all: groups.length,
    hot: groups.filter(g => g.bestStatus === "hot").length,
    warm: groups.filter(g => g.bestStatus === "warm").length,
    cold: groups.filter(g => g.bestStatus === "cold").length,
    new: groups.filter(g => g.bestStatus === "new").length,
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className={`w-full md:w-96 border-r border-neutral-800 flex flex-col overflow-hidden ${selectedGroup !== null ? "hidden md:flex" : "flex"}`}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
          <div className="flex gap-1 overflow-x-auto">
            {(["all", "hot", "warm", "cold", "new"] as const).map(f => (
              <button key={f} onClick={() => { setFilter(f); setSelectedGroup(null); }}
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
        <div className="px-3 py-2 border-b border-neutral-800">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat..."
            data-testid="input-search-users"
            className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:border-emerald-500" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredGroups.map(group => {
            const cfg = STATUS_CONFIG[group.bestStatus];
            const isSelected = selectedGroup === group.name;
            const p = group.bestProfile;
            const stratLabel = p?.strategy === "sell" ? "💰 SELL" : p?.strategy === "hook" ? "🎣 HOOK" : p?.strategy === "build" ? "🤝 BUILD" : null;
            return (
              <button key={group.name} onClick={() => setSelectedGroup(group.name)} data-testid={`button-select-group-${group.name}`}
                className={`w-full text-left px-3 py-2.5 border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-colors ${isSelected ? "bg-neutral-800" : ""}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs border shrink-0 ${cfg.bg} ${cfg.border} ${cfg.text}`}>{group.name[0]?.toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm truncate">{group.name}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ml-1 ${cfg.bg} ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-neutral-500">{group.totalMessages} zpráv</span>
                      {p && <span className="text-[10px] text-neutral-600">· {p.engagementScore}%</span>}
                      {stratLabel && <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${p?.strategy === "sell" ? "bg-yellow-500/20 text-yellow-400" : p?.strategy === "hook" ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"}`}>{stratLabel}</span>}
                      {p?.relationshipStage && <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${p.relationshipStage === "monetizace" ? "bg-yellow-500/15 text-yellow-400" : p.relationshipStage === "stabilní" ? "bg-emerald-500/15 text-emerald-400" : "bg-neutral-700 text-neutral-400"}`}>{p.relationshipStage}</span>}
                      {group.sessions.some(s => s.isSubscribed) && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-400" title="VIP předplatné">👑</span>
                      )}
                      {group.sessions.some(s => s.botEnabled) && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-pink-500/20 text-pink-400" title="E-Bot aktivní">🤖</span>
                      )}
                      {(group.sessions.reduce((s, u) => s + (u.unlockedCount || 0), 0)) > 0 && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-violet-500/20 text-violet-400" title="Odemčený obsah">
                          🔓{group.sessions.reduce((s, u) => s + (u.unlockedCount || 0), 0)}
                        </span>
                      )}
                    </div>
                    {p?.mainDriver && <p className="text-[10px] text-neutral-400 truncate mt-0.5">{p.mainDriver}</p>}
                    {group.sessions[0]?.lastActivity && <p className="text-[9px] text-neutral-600 mt-0.5">🕐 {formatDistanceToNow(new Date(group.sessions[0].lastActivity), { locale: cs, addSuffix: true })}</p>}
                  </div>
                </div>
              </button>
            );
          })}
          {filteredGroups.length === 0 && <div className="text-center text-neutral-600 py-12 text-sm">Žádní zákazníci</div>}
        </div>
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden ${selectedGroup === null ? "hidden md:flex" : "flex"}`}>
        {!activeGroup || !primaryUser ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
            <div className="text-4xl">👥</div>
            <p className="text-neutral-500 text-sm">Vyber zákazníka ze seznamu</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="sticky top-0 border-b border-neutral-800 px-4 py-2 bg-neutral-950/95 backdrop-blur flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedGroup(null)} data-testid="button-back-to-list"
                  className="text-neutral-500 hover:text-white transition-colors text-sm">← Zpět</button>
                <p className="font-bold text-sm">{activeGroup.name}</p>
                {activeGroup.sessions.length > 1 && <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">{activeGroup.sessions.length} sessions</span>}
              </div>
              <div className="flex items-center gap-2">
                {confirmDelete === activeGroup.name ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-red-400">Smazat?</span>
                    <button onClick={() => deleteGroup(activeGroup)} data-testid="button-confirm-delete-user"
                      className="text-[10px] bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded-lg font-bold">Ano</button>
                    <button onClick={() => setConfirmDelete(null)} data-testid="button-cancel-delete-user"
                      className="text-[10px] bg-neutral-700 hover:bg-neutral-600 text-white px-2 py-1 rounded-lg">Ne</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(activeGroup.name)} data-testid="button-delete-user"
                    className="text-xs text-neutral-600 hover:text-red-400 transition-colors" title="Smazat zákazníka">🗑️</button>
                )}
                <button onClick={() => primaryUser && analyzeMut.mutate(primaryUser.id)} disabled={analyzingId === primaryUser?.id} data-testid="button-analyze-user"
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-bold">
                  {analyzingId === primaryUser?.id ? "⏳..." : "🧠 Analyzovat"}
                </button>
              </div>
            </div>

            {!activeGroup.bestProfile ? (
              <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
                <p className="text-neutral-500 text-sm">Neanalyzován</p>
                <button onClick={() => primaryUser && analyzeMut.mutate(primaryUser.id)} className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold text-sm">Spustit analýzu</button>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {(() => {
                  const p = activeGroup.bestProfile!;
                  const cfg = STATUS_CONFIG[p.status];
                  const purposeConfig = {
                    build: { icon: "🤝", label: "BUILD", cls: "bg-blue-500/20 border-blue-500/30 text-blue-400" },
                    sell: { icon: "💰", label: "SELL", cls: "bg-yellow-500/20 border-yellow-500/30 text-yellow-400" },
                    hook: { icon: "🎣", label: "HOOK", cls: "bg-purple-500/20 border-purple-500/30 text-purple-400" },
                  };
                  const strat = p.strategy || "build";
                  const stratCfg = purposeConfig[strat];
                  return (<>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${cfg.bg} ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${stratCfg.cls}`}>{stratCfg.icon} {stratCfg.label}</span>
                      <span className="text-xs text-neutral-500">{p.engagementScore}% eng · {p.buyingPotential}</span>
                      {primaryUser?.isSubscribed && <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400">👑 VIP</span>}
                      {primaryUser?.botEnabled && <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-pink-500/20 border border-pink-500/30 text-pink-400">🤖 E-Bot ON</span>}
                      {p.lastAnalyzed && <span className="text-[9px] text-neutral-600 ml-auto">🕐 {formatDistanceToNow(new Date(p.lastAnalyzed), { locale: cs, addSuffix: true })}</span>}
                    </div>
                    <ScoreBar score={p.engagementScore} />

                    {(primaryUser?.isSubscribed || (primaryUser?.unlockedCount ?? 0) > 0) && (
                      <div className="bg-pink-500/5 border border-pink-500/20 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-pink-400 uppercase tracking-widest mb-2">🤖 E-Bot stav</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${primaryUser?.botEnabled ? "bg-pink-400 animate-pulse" : "bg-neutral-600"}`} />
                            <span className="text-[10px] text-neutral-300">{primaryUser?.botEnabled ? "Bot aktivní" : "Bot neaktivní"}</span>
                          </div>
                          <span className="text-[10px] text-violet-400">🔓 {primaryUser?.unlockedCount || 0} odemčeno</span>
                          <span className="text-[10px] text-amber-400">👑 {primaryUser?.isSubscribed ? "Předplatné aktivní" : "Bez předplatného"}</span>
                        </div>
                      </div>
                    )}

                    {(p.mainDriver || p.nextAction) && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">🎯 Hlavní driver</p>
                        <p className="text-sm text-emerald-300 font-medium">{p.mainDriver || p.nextAction}</p>
                      </div>
                    )}

                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">📋 Kontext</p>
                      <p className="text-xs text-neutral-300">{p.summary}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.personality.map((t, i) => <span key={i} className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{t}</span>)}
                        {p.interests.map((t, i) => <span key={`int-${i}`} className="text-[9px] bg-pink-500/15 text-pink-400 px-1.5 py-0.5 rounded">{t}</span>)}
                      </div>
                    </div>

                    {p.relationshipStage && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400">
                          {p.relationshipStage === "nový" ? "🌱" : p.relationshipStage === "budování" ? "🤝" : p.relationshipStage === "stabilní" ? "💎" : p.relationshipStage === "monetizace" ? "💰" : "🎣"} {p.relationshipStage}
                        </span>
                        {p.nextMilestone && <span className="text-[10px] text-neutral-400">→ {p.nextMilestone}</span>}
                      </div>
                    )}

                    {(p.priceSensitivity || p.sellStyle || p.suggestedPrice) && (
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">💰 Revenue profil</p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.priceSensitivity && <span className={`text-[9px] px-1.5 py-0.5 rounded ${p.priceSensitivity === "nízká" ? "bg-emerald-500/15 text-emerald-400" : p.priceSensitivity === "vysoká" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>💳 Cenová citlivost: {p.priceSensitivity}</span>}
                          {p.sellStyle && p.sellStyle !== "neznámý" && <span className="text-[9px] bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded">🎯 Styl: {p.sellStyle}</span>}
                          {p.suggestedPrice && p.suggestedPrice > 0 && <span className="text-[9px] bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded">💵 Doporučená cena: {p.suggestedPrice} Kč</span>}
                        </div>
                      </div>
                    )}

                    {p.communicationPatterns && (
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">📡 Komunikační vzory</p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.communicationPatterns.tone && <span className="text-[9px] bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded">🎭 {p.communicationPatterns.tone}</span>}
                          {p.communicationPatterns.msgLength && <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">📝 {p.communicationPatterns.msgLength}</span>}
                          {p.communicationPatterns.responseSpeed && <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">⚡ {p.communicationPatterns.responseSpeed}</span>}
                          {p.communicationPatterns.usesEmoji !== undefined && <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{p.communicationPatterns.usesEmoji ? "😊 emoji" : "🚫 bez emoji"}</span>}
                          {p.communicationPatterns.peakHours && <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">🕐 {p.communicationPatterns.peakHours}</span>}
                        </div>
                      </div>
                    )}

                    {(p.emotionalTriggers || []).length > 0 && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1.5">⚡ Emoční spouštěče</p>
                        <div className="space-y-1">
                          {(p.emotionalTriggers || []).map((t, i) => (
                            <p key={i} className="text-xs text-red-200">→ {t}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {(p.whatWorks || []).length > 0 && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-2.5">
                          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1">✅ Funguje</p>
                          {(p.whatWorks || []).map((w, i) => <p key={i} className="text-[10px] text-emerald-200">• {w}</p>)}
                        </div>
                      )}
                      {(p.whatFails || []).length > 0 && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-2.5">
                          <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-1">❌ Nefunguje</p>
                          {(p.whatFails || []).map((w, i) => <p key={i} className="text-[10px] text-red-200">• {w}</p>)}
                        </div>
                      )}
                    </div>

                    {p.styleNotes && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">🎨 Styl komunikace</p>
                        <p className="text-xs text-amber-200">{p.styleNotes}</p>
                      </div>
                    )}

                    {(p.actionQueue || []).length > 0 && (
                      <DetailActionQueue actions={p.actionQueue!} purposeConfig={purposeConfig} />
                    )}

                    {(p.suggestedMessages || []).length > 0 && !(p.actionQueue || []).length && (
                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">✍️ Navrhované zprávy</p>
                        {(p.suggestedMessages || []).map((msg, i) => (
                          <div key={i} className="flex items-start justify-between gap-1 bg-neutral-800/60 rounded-lg px-2 py-2 mb-1">
                            <p className="text-xs text-white">{msg}</p>
                            <CopyButton text={msg} />
                          </div>
                        ))}
                      </div>
                    )}

                    {(p.trendInsights || []).length > 0 && (
                      <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2">📈 Trendy</p>
                        {(p.trendInsights || []).map((tip, i) => (
                          <div key={i} className="flex items-start gap-1 mb-1"><span className="text-purple-400 text-xs">→</span><p className="text-xs text-purple-200">{tip}</p></div>
                        ))}
                      </div>
                    )}
                  </>);
                })()}
              </div>
            )}

            <div className="border-t border-neutral-800 mt-2">
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">💬 Historie konverzací</p>
              </div>
              <ChatHistory userIds={activeGroup.sessions.map(s => s.id)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Content Vault ──────────────────────────────────────────────────────

type AnalysisResult = {
  category: "photo" | "ppv" | "teaser";
  explicitness: "low" | "medium" | "high";
  suggestedTags: string[];
  reason: string;
  itemId: number;
  currentCategory: string;
};

function VaultTab() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("general");
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const { data: items = [], isLoading } = useQuery<ContentItem[]>({
    queryKey: ["/api/vault/items"],
    queryFn: () => fetch("/api/vault/items").then(r => r.json()),
  });

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const tagsParsed = JSON.stringify(tags.split(",").map(t => t.trim()).filter(Boolean));
    for (let i = 0; i < files.length; i++) {
      const fd = new FormData();
      fd.append("files", files[i]);
      fd.append("description", desc);
      fd.append("tags", tagsParsed);
      fd.append("category", category);
      await fetch("/api/vault/upload", { method: "POST", body: fd });
    }
    qc.invalidateQueries({ queryKey: ["/api/vault/items"] });
    setDesc(""); setTags(""); setCategory("general");
    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
  };

  const deleteMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/vault/items/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/vault/items"] }),
  });

  const handleAnalyze = async (itemId: number, isImage: boolean) => {
    if (!isImage) {
      alert("Lze analyzovat pouze obrázky");
      return;
    }
    setAnalyzing(itemId);
    try {
      const res = await fetch(`/api/vault/analyze-image/${itemId}`, { method: "POST" });
      const data = await res.json();
      setAnalysis(data);
    } catch (err) {
      alert("Chyba při analýze");
    } finally {
      setAnalyzing(null);
    }
  };

  const handleApplyCategory = async (newCategory: string) => {
    if (!analysis) return;
    try {
      const res = await fetch(`/api/vault/items/${analysis.itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          category: newCategory,
          tags: analysis.suggestedTags 
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      await qc.invalidateQueries({ queryKey: ["/api/vault/items"] });
      setAnalysis(null);
    } catch (err) {
      alert("Chyba při aplikaci kategorie");
    }
  };

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
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple
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
            {item.mimeType.startsWith("image") || item.mimeType.startsWith("video") ? (
              <img 
                src={`/uploads/${item.filename}`} 
                alt={item.originalName}
                className="w-16 h-16 rounded-lg object-cover shrink-0 border border-neutral-700"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  const fallback = (e.target as HTMLImageElement).nextElementSibling;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
            ) : null}
            <div className={`w-16 h-16 rounded-lg flex items-center justify-center text-lg shrink-0 ${
              item.mimeType.startsWith("image") ? "bg-pink-500/20" :
              item.mimeType.startsWith("video") ? "bg-purple-500/20" :
              item.mimeType.startsWith("audio") ? "bg-blue-500/20" : "bg-neutral-800"
            }`} style={item.mimeType.startsWith("image") || item.mimeType.startsWith("video") ? {display: "none"} : {}}>
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
            <div className="flex gap-1 shrink-0">
              {item.mimeType.startsWith("image") && (
                <button onClick={() => handleAnalyze(item.id, true)} disabled={analyzing === item.id} data-testid={`button-analyze-vault-${item.id}`}
                  className="text-neutral-600 hover:text-emerald-400 text-sm transition-colors disabled:opacity-50">
                  {analyzing === item.id ? "⏳" : "🔍"}
                </button>
              )}
              <button onClick={() => deleteMut.mutate(item.id)} data-testid={`button-delete-vault-${item.id}`}
                className="text-neutral-600 hover:text-red-400 text-sm transition-colors">🗑️</button>
            </div>
          </div>
        ))}
        {!isLoading && items.length === 0 && (
          <div className="text-center text-neutral-600 py-8 text-sm">Vault je prázdný — nahraj svůj první obsah</div>
        )}
      </div>

      {analysis && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setAnalysis(null)}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-sm w-full space-y-4">
            <div>
              <p className="text-xs font-bold text-emerald-500 uppercase mb-1">🔍 AI Analýza fotky</p>
              <p className="text-sm text-neutral-400">Item #{analysis.itemId}</p>
            </div>

            <div className="bg-neutral-800/50 rounded-lg p-3 space-y-2">
              <div>
                <p className="text-xs text-neutral-500 font-bold">Doporučená kategorie</p>
                <p className="text-sm font-bold text-emerald-400">{CATS.find(c => c.value === analysis.category)?.label || analysis.category}</p>
                <p className="text-[11px] text-neutral-500 mt-1">Explicitnost: <span className="text-emerald-400">{analysis.explicitness}</span></p>
              </div>
              <p className="text-xs text-neutral-400 italic">{analysis.reason}</p>
            </div>

            {analysis.suggestedTags.length > 0 && (
              <div>
                <p className="text-xs text-neutral-500 font-bold mb-2">Doporučené tagy</p>
                <div className="flex flex-wrap gap-1">
                  {analysis.suggestedTags.map((tag, i) => (
                    <span key={i} className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => handleApplyCategory(analysis.category)} data-testid="button-apply-category"
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-sm">
                ✅ Přijmout
              </button>
              <button onClick={() => setAnalysis(null)} data-testid="button-cancel-analysis"
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-bold py-2 rounded-lg text-sm">
                ✕ Zavřít
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
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

// ─── Main Dashboard ──────────────────────────────────────────────────────────

type LearningData = {
  totalSent: number;
  totalResponded: number;
  responseRate: number;
  bestPurposes: Record<string, { sent: number; responded: number; rate: number }>;
  bestTimings: Record<string, { sent: number; responded: number; rate: number }>;
  avgResponseTime: number;
  lastUpdated: string;
};

type EngineStatus = {
  isRunning: boolean;
  isPaused: boolean;
  lastFullScan: string | null;
  nextScan: string | null;
  recentLogs: { time: string; event: string; detail: string }[];
  pendingDelayed: number;
  autonomousFeatures?: {
    autoCleanup: boolean;
    selfLearning: boolean;
    autoMessaging: boolean;
    duplicateDetection: boolean;
    antiSpam: boolean;
    revenueOptimization: boolean;
    perUserMemory: boolean;
  };
  learnings?: LearningData;
};

type ManagerActionRecord = {
  id: number;
  userId: number | null;
  type: string;
  status: string;
  message: string | null;
  photoId: number | null;
  purpose: string | null;
  timing: string | null;
  result: string | null;
  executedAt: string | null;
  createdAt: string;
};

function OverviewTab({ users, onNavigate }: { users: ManagerUser[]; onNavigate?: (tab: "overview" | "customers" | "vault" | "trends" | "broadcast" | "payments" | "market" | "analytics" | "report", filter?: string, group?: string) => void }) {
  const qc = useQueryClient();
  const { data: engineStatus } = useQuery<EngineStatus>({
    queryKey: ["/api/manager/engine-status"],
    refetchInterval: 10000,
    queryFn: () => fetch("/api/manager/engine-status").then(r => r.json()),
  });

  const { data: actions = [] } = useQuery<ManagerActionRecord[]>({
    queryKey: ["/api/manager/actions"],
    refetchInterval: 15000,
    queryFn: () => fetch("/api/manager/actions").then(r => r.json()),
  });

  const { data: vaultItems = [] } = useQuery<ContentItem[]>({
    queryKey: ["/api/vault/items"],
    queryFn: () => fetch("/api/vault/items").then(r => r.json()),
  });

  const vaultMap = new Map(vaultItems.map(v => [v.id, v]));

  const markDone = async (id: number) => {
    await fetch(`/api/manager/actions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    qc.invalidateQueries({ queryKey: ["/api/manager/actions"] });
  };

  const dismissAction = async (id: number) => {
    await fetch(`/api/manager/actions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    qc.invalidateQueries({ queryKey: ["/api/manager/actions"] });
  };

  const [actionFilter, setActionFilter] = useState<"all" | "build" | "sell" | "hook">("all");
  const [showLogs, setShowLogs] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState<number | null>(null);

  const groups = groupUsers(users);
  const totalMessages = users.reduce((s, u) => s + u.totalMessages, 0);
  const analyzed = users.filter(u => u.aiProfile).length;
  const withProfiles = users.filter(u => u.aiProfile);
  const hotCount = groups.filter(g => g.bestStatus === "hot").length;
  const warmCount = groups.filter(g => g.bestStatus === "warm").length;
  const coldCount = groups.filter(g => g.bestStatus === "cold").length;
  const newCount = groups.filter(g => g.bestStatus === "new").length;
  const subscribedCount = users.filter(u => u.isSubscribed).length;
  const botEnabledCount = users.filter(u => u.botEnabled).length;
  const totalUnlocked = users.reduce((s, u) => s + (u.unlockedCount || 0), 0);
  const avgEngagement = withProfiles.reduce((s, u) => s + ((u.aiProfile as any)?.engagementScore || 0), 0) / (analyzed || 1);

  const stratCounts = { build: 0, sell: 0, hook: 0 };
  const stageCounts: Record<string, number> = {};
  const buyPotCounts: Record<string, number> = {};
  withProfiles.forEach(u => {
    const p = u.aiProfile as any;
    if (p?.strategy && stratCounts[p.strategy as keyof typeof stratCounts] !== undefined) stratCounts[p.strategy as keyof typeof stratCounts]++;
    if (p?.relationshipStage) stageCounts[p.relationshipStage] = (stageCounts[p.relationshipStage] || 0) + 1;
    if (p?.buyingPotential) buyPotCounts[p.buyingPotential] = (buyPotCounts[p.buyingPotential] || 0) + 1;
  });

  const pendingActions = actions.filter(a => a.status === "pending");
  const doneActions = actions.filter(a => a.status === "done");

  const filteredPending = actionFilter === "all" ? pendingActions : pendingActions.filter(a => a.purpose === actionFilter);

  const purposeConfig: Record<string, { icon: string; label: string; cls: string }> = {
    build: { icon: "🤝", label: "BUILD", cls: "bg-blue-500/20 border-blue-500/30 text-blue-400" },
    sell: { icon: "💰", label: "SELL", cls: "bg-yellow-500/20 border-yellow-500/30 text-yellow-400" },
    hook: { icon: "🎣", label: "HOOK", cls: "bg-purple-500/20 border-purple-500/30 text-purple-400" },
  };

  const userNameMap = new Map(users.map(u => [u.id, u.name]));

  const buildPct = pendingActions.length ? Math.round(pendingActions.filter(a => a.purpose === "build").length / pendingActions.length * 100) : 0;
  const sellPct = pendingActions.length ? Math.round(pendingActions.filter(a => a.purpose === "sell").length / pendingActions.length * 100) : 0;
  const hookPct = pendingActions.length ? Math.round(pendingActions.filter(a => a.purpose === "hook").length / pendingActions.length * 100) : 0;

  const isImgFile = (fn: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(fn);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className={`flex items-center gap-3 p-3 rounded-xl border ${engineStatus?.isPaused ? "bg-red-500/10 border-red-500/30" : engineStatus?.isRunning ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30"}`}>
        <div className={`w-3 h-3 rounded-full ${engineStatus?.isPaused ? "bg-red-400" : engineStatus?.isRunning ? "bg-amber-400 animate-pulse" : "bg-emerald-400 animate-pulse"}`} />
        <div className="flex-1">
          <p className={`text-sm font-bold ${engineStatus?.isPaused ? "text-red-300" : engineStatus?.isRunning ? "text-amber-300" : "text-emerald-300"}`}>
            {engineStatus?.isPaused ? "⏸ Engine pozastaven" : engineStatus?.isRunning ? "⏳ Analyzuje zákazníky..." : "✓ Engine běží — odesílá zprávy"}
          </p>
          <p className="text-[10px] text-neutral-400">
            {engineStatus?.lastFullScan ? `Poslední scan: ${formatDistanceToNow(new Date(engineStatus.lastFullScan), { locale: cs, addSuffix: true })}` : "První scan se připravuje..."}
            {engineStatus?.nextScan && ` · Další: ${formatDistanceToNow(new Date(engineStatus.nextScan), { locale: cs, addSuffix: true })}`}
            {(engineStatus?.pendingDelayed || 0) > 0 && ` · ${engineStatus!.pendingDelayed} naplánovaných`}
          </p>
        </div>
        <button onClick={async () => {
          const newState = !engineStatus?.isPaused;
          await fetch("/api/manager/engine-pause", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: newState }) });
          qc.invalidateQueries({ queryKey: ["/api/manager/engine-status"] });
        }} data-testid="button-toggle-engine"
          className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${engineStatus?.isPaused ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-red-600/80 hover:bg-red-500 text-white"}`}>
          {engineStatus?.isPaused ? "▶ Spustit" : "⏸ Pozastavit"}
        </button>
        <button onClick={() => setShowLogs(!showLogs)} data-testid="button-toggle-logs"
          className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors px-2 py-1 rounded bg-neutral-800/50">
          {showLogs ? "Skrýt" : "📋"}
        </button>
      </div>

      <AnimatePresence>
        {showLogs && engineStatus?.recentLogs && engineStatus.recentLogs.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
              {engineStatus.recentLogs.slice(-20).reverse().map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px]">
                  <span className="text-neutral-600 shrink-0">{new Date(log.time).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  <span className={`shrink-0 ${log.event.includes("error") ? "text-red-400" : log.event.includes("complete") ? "text-emerald-400" : "text-neutral-400"}`}>{log.event}</span>
                  {log.detail && <span className="text-neutral-500 truncate">{log.detail}</span>}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {engineStatus?.autonomousFeatures && (
        <div className="grid grid-cols-7 gap-1.5" data-testid="autonomous-features">
          {Object.entries(engineStatus.autonomousFeatures).map(([key, active]) => (
            <div key={key} className={`text-center p-1.5 rounded-lg border ${active ? "bg-emerald-500/10 border-emerald-500/20" : "bg-neutral-800/50 border-neutral-700/30"}`}>
              <div className={`w-1.5 h-1.5 rounded-full mx-auto mb-0.5 ${active ? "bg-emerald-400" : "bg-neutral-600"}`} />
              <p className={`text-[8px] ${active ? "text-emerald-400" : "text-neutral-600"}`}>
                {key === "autoCleanup" ? "Cleanup" : key === "selfLearning" ? "Learning" : key === "autoMessaging" ? "Zprávy" : key === "duplicateDetection" ? "Duplikáty" : key === "antiSpam" ? "Anti-spam" : key === "revenueOptimization" ? "Revenue" : key === "perUserMemory" ? "Paměť" : key}
              </p>
            </div>
          ))}
        </div>
      )}

      {engineStatus?.learnings && engineStatus.learnings.totalSent > 0 && (
        <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3 space-y-2" data-testid="learning-insights">
          <p className="text-[11px] font-bold text-violet-300">🧠 Self-Learning Insights</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className={`text-sm font-bold ${engineStatus.learnings.responseRate >= 40 ? "text-emerald-400" : engineStatus.learnings.responseRate >= 20 ? "text-amber-400" : "text-red-400"}`}>{engineStatus.learnings.responseRate}%</p>
              <p className="text-[9px] text-neutral-500">Response rate</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-violet-400">{engineStatus.learnings.avgResponseTime}m</p>
              <p className="text-[9px] text-neutral-500">Avg odpověď</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-blue-400">{engineStatus.learnings.totalSent}</p>
              <p className="text-[9px] text-neutral-500">Odesláno</p>
            </div>
          </div>
          {Object.keys(engineStatus.learnings.bestPurposes).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(engineStatus.learnings.bestPurposes).sort((a, b) => b[1].rate - a[1].rate).map(([purpose, data]) => (
                <span key={purpose} className={`text-[9px] px-2 py-0.5 rounded-full border ${data.rate >= 40 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : data.rate >= 20 ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                  {purpose}: {data.rate}% ({data.responded}/{data.sent})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-pink-500/5 border border-pink-500/20 rounded-xl p-3" data-testid="ebot-stats-panel">
        <p className="text-[10px] font-bold text-pink-400 uppercase tracking-widest mb-2">🤖 E-Bot Ekosystém</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-base font-bold text-amber-400">{subscribedCount}</p>
            <p className="text-[9px] text-neutral-500">👑 VIP předplatné</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-pink-400">{botEnabledCount}</p>
            <p className="text-[9px] text-neutral-500">🤖 Bot aktivní</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-violet-400">{totalUnlocked}</p>
            <p className="text-[9px] text-neutral-500">🔓 Odemčeno</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {([
          { status: "hot" as const, count: hotCount, icon: "🔥", label: "Horký", bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", textSub: "text-red-300" },
          { status: "warm" as const, count: warmCount, icon: "⚡", label: "Teplý", bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", textSub: "text-orange-300" },
          { status: "cold" as const, count: coldCount, icon: "❄️", label: "Studený", bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", textSub: "text-blue-300" },
          { status: "new" as const, count: newCount, icon: "🌱", label: "Nový", bg: "bg-neutral-700/30", border: "border-neutral-600", text: "text-neutral-400", textSub: "text-neutral-400" },
        ]).map(s => (
          <button key={s.status} onClick={() => onNavigate?.("customers", s.status)} data-testid={`nav-status-${s.status}`}
            className={`${s.bg} border ${s.border} rounded-xl p-2.5 text-center hover:brightness-125 transition-all cursor-pointer`}>
            <p className={`text-lg font-bold ${s.text}`}>{s.count}</p>
            <p className={`text-[9px] ${s.textSub}`}>{s.icon} {s.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => onNavigate?.("customers")} data-testid="stat-card-0"
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center hover:border-neutral-600 hover:bg-neutral-800/80 transition-all cursor-pointer">
          <p className="text-lg font-bold text-white">{groups.length}</p>
          <p className="text-[10px] text-neutral-500">👥 Zákazníci</p>
          <p className="text-[9px] text-neutral-600">{analyzed} analýz</p>
        </button>
        <button onClick={() => onNavigate?.("trends")} data-testid="stat-card-1"
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center hover:border-neutral-600 hover:bg-neutral-800/80 transition-all cursor-pointer">
          <p className={`text-lg font-bold ${avgEngagement >= 60 ? "text-red-400" : avgEngagement >= 35 ? "text-orange-400" : "text-blue-400"}`}>{Math.round(avgEngagement)}%</p>
          <p className="text-[10px] text-neutral-500">📊 Engagement</p>
          <p className="text-[9px] text-neutral-600">{avgEngagement >= 60 ? "silný" : avgEngagement >= 35 ? "střední" : "nízký"}</p>
        </button>
        <button onClick={() => onNavigate?.("payments")} data-testid="stat-card-2"
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center hover:border-neutral-600 hover:bg-neutral-800/80 transition-all cursor-pointer">
          <p className="text-lg font-bold text-emerald-400">{pendingActions.length}</p>
          <p className="text-[10px] text-neutral-500">📨 K odeslání</p>
          <p className="text-[9px] text-neutral-600">{doneActions.length} hotovo</p>
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-white">
            {filteredPending.length > 0 ? `⏳ Čekající na odeslání (${filteredPending.length})` : `✓ Vše odesláno — ${doneActions.length} zpráv`}
          </p>
          <div className="flex gap-1">
            {(["all", "build", "sell", "hook"] as const).map(f => (
              <button key={f} onClick={() => setActionFilter(f)} data-testid={`filter-action-${f}`}
                className={`text-[9px] px-2 py-1 rounded transition-colors ${actionFilter === f ? "bg-neutral-700 text-white" : "text-neutral-600 hover:text-neutral-400"}`}>
                {f === "all" ? "Vše" : purposeConfig[f].icon + " " + purposeConfig[f].label}
              </button>
            ))}
          </div>
        </div>

        {pendingActions.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-2.5">
            <div className="flex items-center gap-1 h-2 rounded-full overflow-hidden">
              {buildPct > 0 && <div className="bg-blue-500 h-full rounded-full" style={{ width: `${buildPct}%` }} />}
              {sellPct > 0 && <div className="bg-yellow-500 h-full rounded-full" style={{ width: `${sellPct}%` }} />}
              {hookPct > 0 && <div className="bg-purple-500 h-full rounded-full" style={{ width: `${hookPct}%` }} />}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-blue-400">BUILD {buildPct}%</span>
              <span className="text-[9px] text-yellow-400">SELL {sellPct}%</span>
              <span className="text-[9px] text-purple-400">HOOK {hookPct}%</span>
            </div>
          </div>
        )}

        {filteredPending.length === 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
            <p className="text-neutral-600 text-sm">Žádné čekající akce</p>
          </div>
        )}

        {filteredPending.slice(0, 30).map(action => {
          const pCfg = purposeConfig[action.purpose || "build"] || purposeConfig.build;
          const vaultItem = action.photoId ? vaultMap.get(action.photoId) : null;
          const hasPhoto = vaultItem && isImgFile(vaultItem.filename);
          return (
            <motion.div key={action.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -100 }}
              data-testid={`pending-action-${action.id}`}
              className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white">{userNameMap.get(action.userId!) || "?"}</span>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${pCfg.cls}`}>{pCfg.icon} {pCfg.label}</span>
                    {action.price && action.price > 0 && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">💰 {action.price} Kč</span>}
                    {action.timing && <span className="text-[10px] text-neutral-500">⏰ {action.timing}</span>}
                  </div>
                  <span className="text-[9px] text-neutral-600">{formatDistanceToNow(new Date(action.createdAt), { locale: cs, addSuffix: true })}</span>
                </div>

                {action.message && (
                  <div className="bg-neutral-800/60 rounded-lg px-3 py-2.5">
                    <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{action.message}</p>
                  </div>
                )}

                {hasPhoto && (
                  <div className="flex items-start gap-3">
                    <button onClick={() => setExpandedPhoto(expandedPhoto === action.id ? null : action.id)} className="shrink-0" data-testid={`photo-preview-${action.id}`}>
                      <img src={`/uploads/${vaultItem!.filename}`} alt="Doporučená fotka"
                        className={`rounded-lg border border-pink-500/30 object-cover transition-all cursor-pointer hover:brightness-110 ${expandedPhoto === action.id ? "w-48 h-48" : "w-16 h-16"}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-pink-400 font-bold">📸 Doporučená fotka #{action.photoId}</p>
                      {vaultItem!.description && <p className="text-[10px] text-neutral-400 mt-0.5">{vaultItem!.description}</p>}
                      {vaultItem!.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {vaultItem!.tags.map((t, i) => <span key={i} className="text-[8px] bg-pink-500/15 text-pink-400 px-1 py-0.5 rounded">{t}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {action.photoId && !hasPhoto && vaultItem && (
                  <p className="text-[10px] text-pink-400">📎 Doporučený soubor #{action.photoId}: {vaultItem.filename}</p>
                )}
                {action.photoId && !vaultItem && (
                  <p className="text-[10px] text-neutral-500">📸 Fotka #{action.photoId} (není ve vaultu)</p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => markDone(action.id)} data-testid={`btn-done-${action.id}`}
                    className="flex items-center gap-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors">
                    ✓ Odesláno
                  </button>
                  {action.message && <CopyButton text={action.message} />}
                  <button onClick={() => dismissAction(action.id)} data-testid={`btn-dismiss-${action.id}`}
                    className="text-[10px] text-neutral-600 hover:text-red-400 transition-colors ml-auto px-2 py-1">
                    ✕ Zahodit
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
        {filteredPending.length > 30 && <p className="text-[10px] text-neutral-600 text-center">+ dalších {filteredPending.length - 30} akcí</p>}
      </div>

      {(() => {
        const sellActions = pendingActions.filter(a => a.purpose === "sell" && a.photoId);
        const byUser = new Map<number, typeof sellActions>();
        sellActions.forEach(a => {
          if (!a.userId) return;
          if (!byUser.has(a.userId)) byUser.set(a.userId, []);
          byUser.get(a.userId)!.push(a);
        });
        if (byUser.size === 0) return null;
        return (
          <div className="space-y-2">
            <p className="text-xs font-bold text-white">📋 Plán obsahu per zákazník</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from(byUser.entries()).map(([uid, acts]) => {
                const name = userNameMap.get(uid) || "?";
                const totalRevenue = acts.reduce((s, a) => s + (a.price || 0), 0);
                return (
                  <div key={uid} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-2" data-testid={`content-plan-${uid}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{name}</span>
                      <span className="text-[9px] font-bold text-emerald-400">{totalRevenue > 0 ? `${totalRevenue} Kč` : ""}</span>
                    </div>
                    <div className="space-y-1">
                      {acts.map(a => {
                        const vi = a.photoId ? vaultMap.get(a.photoId) : null;
                        const isImg = vi && isImgFile(vi.filename);
                        return (
                          <div key={a.id} className="flex items-center gap-2 bg-neutral-800/50 rounded-lg p-1.5">
                            {isImg && <img src={`/uploads/${vi!.filename}`} alt="" className="w-8 h-8 rounded object-cover border border-pink-500/20" />}
                            {!isImg && vi && <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center text-[10px]">🎬</div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-white truncate">#{a.photoId} {vi?.description || vi?.originalName || ""}</p>
                              {a.price && a.price > 0 && <p className="text-[9px] text-emerald-400 font-bold">{a.price} Kč</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {doneActions.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setShowDone(!showDone)} data-testid="btn-toggle-done"
            className="flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
            <span>{showDone ? "▼" : "▶"}</span>
            <span>✅ Odesláno manažerem ({doneActions.length} zpráv)</span>
          </button>
          <AnimatePresence>
            {showDone && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5">
                {doneActions.slice(0, 30).map(action => {
                  const pCfg = purposeConfig[action.purpose || "build"] || purposeConfig.build;
                  const vaultItem = action.photoId ? vaultMap.get(action.photoId) : null;
                  return (
                    <div key={action.id} className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-emerald-400">✓</span>
                          <span className="text-xs font-bold text-neutral-300">{userNameMap.get(action.userId!) || "?"}</span>
                          <span className={`text-[8px] font-bold px-1 py-0.5 rounded border ${pCfg.cls}`}>{pCfg.icon}</span>
                          {action.result === "auto-sent" && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded">AUTO</span>}
                        </div>
                        {action.executedAt && <span className="text-[9px] text-neutral-600">{formatDistanceToNow(new Date(action.executedAt), { locale: cs, addSuffix: true })}</span>}
                      </div>
                      <p className="text-xs text-neutral-400 leading-relaxed">{action.message?.substring(0, 120)}{(action.message?.length || 0) > 120 ? "..." : ""}</p>
                      {vaultItem && isImgFile(vaultItem.filename) && (
                        <img src={`/uploads/${vaultItem.filename}`} alt="" className="w-10 h-10 rounded object-cover border border-neutral-700 inline-block" />
                      )}
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Strategie</p>
          <div className="space-y-1.5">
            {([["build", "🤝 BUILD", "text-blue-400", "bg-blue-500"], ["sell", "💰 SELL", "text-yellow-400", "bg-yellow-500"], ["hook", "🎣 HOOK", "text-purple-400", "bg-purple-500"]] as const).map(([key, label, textCls, bgCls]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`text-[10px] w-16 ${textCls}`}>{label}</span>
                <div className="flex-1 bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${bgCls}`} style={{ width: `${analyzed ? (stratCounts[key] / analyzed * 100) : 0}%` }} />
                </div>
                <span className="text-[10px] text-neutral-500 w-6 text-right">{stratCounts[key]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Kupní potenciál</p>
          <div className="space-y-1.5">
            {(["vysoký", "střední", "nízký"] as const).map(level => {
              const count = buyPotCounts[level] || 0;
              const color = level === "vysoký" ? "bg-emerald-500" : level === "střední" ? "bg-amber-500" : "bg-neutral-600";
              return (
                <div key={level} className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-400 w-14">{level}</span>
                  <div className="flex-1 bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${analyzed ? (count / analyzed * 100) : 0}%` }} />
                  </div>
                  <span className="text-[10px] text-neutral-500 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {Object.keys(stageCounts).length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Fáze vztahu</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).map(([stage, count]) => {
              const stageIcons: Record<string, string> = { "nový": "🌱", "budování": "🤝", "stabilní": "💎", "monetizace": "💰", "reaktivace": "🎣" };
              return (
                <div key={stage} className="bg-neutral-800 rounded-lg px-2.5 py-1.5 text-center">
                  <p className="text-xs font-bold text-white">{count}</p>
                  <p className="text-[9px] text-neutral-400">{stageIcons[stage] || "📍"} {stage}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {vaultItems.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
          <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-2">📦 Vault — poslední obsah</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {vaultItems.filter(v => isImgFile(v.filename)).slice(0, 8).map(item => (
              <div key={item.id} className="shrink-0">
                <img src={`/uploads/${item.filename}`} alt={item.description || item.filename}
                  className="w-16 h-16 rounded-lg object-cover border border-neutral-700" />
                <p className="text-[8px] text-neutral-600 text-center mt-0.5">#{item.id}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccordionCard({ title, icon, color, children, defaultOpen = false }: { title: string; icon: string; color: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const colorMap: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/5",
    blue: "border-blue-500/30 bg-blue-500/5",
    amber: "border-amber-500/30 bg-amber-500/5",
    purple: "border-purple-500/30 bg-purple-500/5",
    pink: "border-pink-500/30 bg-pink-500/5",
    red: "border-red-500/30 bg-red-500/5",
    neutral: "border-neutral-800 bg-neutral-900",
  };
  const textMap: Record<string, string> = {
    emerald: "text-emerald-400", blue: "text-blue-400", amber: "text-amber-400",
    purple: "text-purple-400", pink: "text-pink-400", red: "text-red-400", neutral: "text-neutral-400",
  };
  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${colorMap[color] || colorMap.neutral}`}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
        data-testid={`accordion-${title.replace(/\s+/g, "-").toLowerCase()}`}>
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className={`text-sm font-bold ${textMap[color] || "text-white"}`}>{title}</span>
        </div>
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""} ${textMap[color] || "text-neutral-500"}`}>▼</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PaymentsTab({ users }: { users: ManagerUser[] }) {
  const [pricingStrategy, setPricingStrategy] = useState<any>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  const { data: stripeStatus } = useQuery<{ connected: boolean; totalRevenue: number; totalPayments: number; successfulPayments: number }>({
    queryKey: ["/api/stripe/status"],
    queryFn: () => fetch("/api/stripe/status").then(r => r.json()),
    refetchInterval: 15000,
  });

  const { data: productsData } = useQuery<{ products: any[]; connected: boolean }>({
    queryKey: ["/api/stripe/products"],
    queryFn: () => fetch("/api/stripe/products").then(r => r.json()),
    enabled: !!stripeStatus?.connected,
  });

  const { data: paymentStats } = useQuery<{ totalRevenue: number; totalPayments: number; successfulPayments: number; recentPayments: any[] }>({
    queryKey: ["/api/payments/stats"],
    queryFn: () => fetch("/api/payments/stats", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 15000,
  });

  const connected = stripeStatus?.connected || false;
  const products = productsData?.products || [];
  const usersWithStripe = users.filter(u => u.stripeCustomerId);
  const revenue = (paymentStats?.totalRevenue || 0) / 100;
  const conversions = paymentStats?.successfulPayments || 0;
  const totalAttempts = paymentStats?.totalPayments || 0;
  const conversionRate = totalAttempts > 0 ? Math.round((conversions / totalAttempts) * 100) : 0;

  const analyzePricing = async () => {
    setPricingLoading(true);
    try {
      const res = await fetch("/api/manager/pricing-strategy", { method: "POST", credentials: "include" });
      const data = await res.json();
      setPricingStrategy(data);
    } catch {}
    setPricingLoading(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className={`p-4 rounded-xl border ${connected ? "bg-emerald-900/20 border-emerald-700/40" : "bg-amber-900/20 border-amber-700/40"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
          <div>
            <h3 className="font-bold text-sm" data-testid="text-stripe-status">
              Stripe: {connected ? "✅ OK" : "⚠️ NEPROPOJENÝ"}
            </h3>
            <p className="text-xs text-neutral-400">
              {connected
                ? `${products.length} produktů · ${usersWithStripe.length} zákazníků s platbou`
                : "Propoj Stripe v Integracích pro aktivaci plateb"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-700/30 text-center">
          <p className="text-2xl font-bold text-emerald-400" data-testid="text-revenue">{revenue.toLocaleString('cs-CZ')} Kč</p>
          <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Revenue</p>
        </div>
        <div className="p-4 rounded-xl bg-blue-900/20 border border-blue-700/30 text-center">
          <p className="text-2xl font-bold text-blue-400" data-testid="text-conversions">{conversions}</p>
          <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Konverze</p>
        </div>
        <div className="p-4 rounded-xl bg-purple-900/20 border border-purple-700/30 text-center">
          <p className="text-2xl font-bold text-purple-400" data-testid="text-conversion-rate">{conversionRate}%</p>
          <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Úspěšnost</p>
        </div>
      </div>

      {paymentStats?.recentPayments && paymentStats.recentPayments.length > 0 && (
        <AccordionCard title={`Poslední platby (${paymentStats.recentPayments.length})`} icon="💰" color="emerald">
          <div className="space-y-2">
            {paymentStats.recentPayments.map((p: any) => (
              <div key={p.id} className="p-3 rounded-lg bg-neutral-800/60 flex items-center justify-between" data-testid={`payment-row-${p.id}`}>
                <div>
                  <span className="text-sm font-medium">Platba #{p.id}</span>
                  <p className="text-xs text-neutral-500">{new Date(p.createdAt).toLocaleString('cs-CZ')}</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold">{(p.amount / 100).toLocaleString('cs-CZ')} Kč</span>
                  <p className={`text-[10px] font-bold ${p.status === 'completed' ? 'text-emerald-400' : p.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                    {p.status === 'completed' ? '✅ Úspěšná' : p.status === 'failed' ? '❌ Selhala' : '⏳ Čeká'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </AccordionCard>
      )}

      <div className="p-4 rounded-xl bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-700/30">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-white font-bold text-sm">💰 Cenová strategie & Analýza trhu</p>
            <p className="text-neutral-500 text-xs">AI prozkoumá trh, konkurenci a navrhne optimální ceny</p>
          </div>
          <button onClick={analyzePricing} disabled={pricingLoading} data-testid="button-analyze-pricing"
            className="text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold whitespace-nowrap">
            {pricingLoading ? "Analyzuji trh..." : "Analyzovat trh"}
          </button>
        </div>
        <p className="text-amber-400/60 text-[10px]">Monetizace: In-app Stripe platby za obsah</p>
      </div>

      {pricingLoading && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <div className="text-5xl animate-pulse">🧠</div>
          <p className="text-neutral-400 text-sm">AI analyzuje trh, konkurenci a tvoje zákazníky...</p>
          <p className="text-neutral-600 text-xs">Může to trvat 15-30 sekund</p>
        </div>
      )}

      {pricingStrategy && !pricingLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
          {pricingStrategy.summary && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <p className="text-sm text-emerald-300 leading-relaxed">{pricingStrategy.summary}</p>
            </div>
          )}

          {pricingStrategy.marketAnalysis && (
            <AccordionCard title="Analýza trhu" icon="📊" color="blue" defaultOpen={true}>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-neutral-800/60 rounded-lg p-3">
                  <p className="text-[10px] text-neutral-500 uppercase">Průměr konkurence</p>
                  <p className="text-sm font-bold text-white">{pricingStrategy.marketAnalysis.averageCompetitorPrice}</p>
                </div>
                <div className="bg-neutral-800/60 rounded-lg p-3">
                  <p className="text-[10px] text-neutral-500 uppercase">Cenový rozsah</p>
                  <p className="text-sm font-bold text-white">{pricingStrategy.marketAnalysis.priceRange}</p>
                </div>
              </div>
              <div className="bg-neutral-800/60 rounded-lg p-3">
                <p className="text-[10px] text-neutral-500 uppercase mb-1">Pozice na trhu</p>
                <p className="text-sm text-neutral-300">{pricingStrategy.marketAnalysis.marketPosition}</p>
              </div>
              {pricingStrategy.marketAnalysis.demandTrends && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {pricingStrategy.marketAnalysis.demandTrends.map((t: string, i: number) => (
                    <span key={i} className="text-xs bg-blue-500/20 border border-blue-500/30 text-blue-400 px-2 py-1 rounded-lg">{t}</span>
                  ))}
                </div>
              )}
            </AccordionCard>
          )}

          {pricingStrategy.recommendedPricing && (
            <AccordionCard title="Doporučené ceny" icon="💵" color="amber" defaultOpen={true}>
              {pricingStrategy.recommendedPricing.subscription && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-amber-400 mb-2">Předplatné</p>
                  <div className="space-y-2">
                    {Object.entries(pricingStrategy.recommendedPricing.subscription).map(([period, data]: [string, any]) => (
                      <div key={period} className="flex items-center justify-between bg-neutral-800/60 rounded-lg px-3 py-2">
                        <div>
                          <span className="text-xs text-neutral-400 capitalize">{period === "monthly" ? "Měsíčně" : period === "quarterly" ? "Čtvrtletně" : "Ročně"}</span>
                          {data.savings && <span className="text-[10px] text-emerald-400 ml-2">(-{data.savings})</span>}
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-white">{data.price}</span>
                          <p className="text-[10px] text-neutral-500 max-w-[200px]">{data.reasoning}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pricingStrategy.recommendedPricing.ppvContent && pricingStrategy.recommendedPricing.ppvContent.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-purple-400 mb-2">PPV obsah</p>
                  <div className="space-y-1.5">
                    {pricingStrategy.recommendedPricing.ppvContent.map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-neutral-800/60 rounded-lg px-3 py-2">
                        <div><p className="text-xs text-white">{item.type}</p><p className="text-[10px] text-neutral-500">{item.description}</p></div>
                        <span className="text-sm font-bold text-purple-400">{item.priceRange}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pricingStrategy.recommendedPricing.customContent && pricingStrategy.recommendedPricing.customContent.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-pink-400 mb-2">Custom obsah</p>
                  <div className="space-y-1.5">
                    {pricingStrategy.recommendedPricing.customContent.map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-neutral-800/60 rounded-lg px-3 py-2">
                        <div><p className="text-xs text-white">{item.type}</p><p className="text-[10px] text-neutral-500">{item.description}</p></div>
                        <span className="text-sm font-bold text-pink-400">{item.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pricingStrategy.recommendedPricing.tips && (
                <div>
                  <p className="text-xs font-bold text-red-400 mb-2">Tipy & Tip menu</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {pricingStrategy.recommendedPricing.tips.suggestedAmounts?.map((a: string, i: number) => (
                      <span key={i} className="text-xs bg-red-500/20 border border-red-500/30 text-red-400 px-2 py-1 rounded-lg font-bold">{a}</span>
                    ))}
                  </div>
                  {pricingStrategy.recommendedPricing.tips.tipMenuIdeas?.map((idea: string, i: number) => (
                    <p key={i} className="text-xs text-neutral-400 mb-0.5">• {idea}</p>
                  ))}
                </div>
              )}
            </AccordionCard>
          )}

          {pricingStrategy.revenueProjection && (
            <AccordionCard title="Projekce výdělku" icon="📈" color="emerald" defaultOpen={true}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-neutral-800/60 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-neutral-500 uppercase">Aktuální</p>
                  <p className="text-sm font-bold text-white">{pricingStrategy.revenueProjection.currentEstimate}</p>
                </div>
                <div className="bg-neutral-800/60 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-neutral-500 uppercase">Po optimalizaci</p>
                  <p className="text-sm font-bold text-emerald-400">{pricingStrategy.revenueProjection.optimizedEstimate}</p>
                </div>
                <div className="bg-neutral-800/60 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-neutral-500 uppercase">Potenciál</p>
                  <p className="text-sm font-bold text-amber-400">{pricingStrategy.revenueProjection.growthPotential}</p>
                </div>
              </div>
              {pricingStrategy.revenueProjection.keyDrivers?.map((d: string, i: number) => (
                <p key={i} className="text-xs text-emerald-400/80 mb-0.5">→ {d}</p>
              ))}
            </AccordionCard>
          )}

          {pricingStrategy.promoStrategy && pricingStrategy.promoStrategy.length > 0 && (
            <AccordionCard title="Promo strategie" icon="🎯" color="purple">
              <div className="space-y-2">
                {pricingStrategy.promoStrategy.map((promo: any, i: number) => (
                  <div key={i} className="bg-neutral-800/60 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">{promo.name}</span>
                      <span className="text-[10px] text-amber-400">{promo.discount}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                      <span>{promo.timing}</span>
                      <span>•</span>
                      <span>{promo.target}</span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">{promo.expectedImpact}</p>
                  </div>
                ))}
              </div>
            </AccordionCard>
          )}

          {pricingStrategy.upsellFunnel && pricingStrategy.upsellFunnel.length > 0 && (
            <AccordionCard title="Upsell funnel" icon="🔄" color="amber">
              <div className="space-y-2">
                {pricingStrategy.upsellFunnel.map((step: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 bg-neutral-800/60 rounded-lg px-3 py-2">
                    <span className="text-lg font-bold text-amber-500 shrink-0">{step.step}</span>
                    <div>
                      <p className="text-xs text-white">{step.action}</p>
                      <p className="text-[10px] text-emerald-400">{step.conversion}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionCard>
          )}

          {pricingStrategy.actionPlan && pricingStrategy.actionPlan.length > 0 && (
            <AccordionCard title="Akční plán" icon="📋" color="red" defaultOpen={true}>
              <div className="space-y-2">
                {pricingStrategy.actionPlan.map((action: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 bg-neutral-800/60 rounded-lg px-3 py-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${action.priority === "vysoká" ? "text-red-400 bg-red-500/20 border-red-500/30" : "text-orange-400 bg-orange-500/20 border-orange-500/30"}`}>{action.priority}</span>
                    <div>
                      <p className="text-xs text-white">{action.action}</p>
                      <p className="text-[10px] text-neutral-500">{action.expectedResult} • {action.timeline}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionCard>
          )}

          {pricingStrategy.warnings && pricingStrategy.warnings.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">Varování</p>
              {pricingStrategy.warnings.map((w: string, i: number) => <p key={i} className="text-xs text-red-300">{w}</p>)}
            </div>
          )}
        </motion.div>
      )}

      {connected && products.length > 0 && (
        <AccordionCard title={`Aktivní produkty (${products.length})`} icon="📦" color="neutral">
          <div className="space-y-2">
            {products.map((product: any) => (
              <div key={product.id} className="p-3 rounded-lg bg-neutral-800/60" data-testid={`payment-product-${product.id}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm">{product.name}</span>
                    {product.description && <p className="text-xs text-neutral-500 mt-0.5">{product.description}</p>}
                  </div>
                  <div className="text-right space-y-1">
                    {product.prices.map((price: any) => {
                      const amount = (price.unitAmount / 100).toFixed(2);
                      const interval = price.recurring?.interval;
                      const label = interval === "month" ? "/měs" : interval === "year" ? "/rok" : "";
                      return (
                        <div key={price.id} className="text-xs">
                          <span className="font-bold text-emerald-400">${amount}</span>
                          <span className="text-neutral-500">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </AccordionCard>
      )}

      {connected && usersWithStripe.length > 0 && (
        <AccordionCard title={`Zákazníci s platbou (${usersWithStripe.length})`} icon="👥" color="neutral">
          <div className="space-y-2">
            {usersWithStripe.map(user => (
              <div key={user.id} className="p-3 rounded-lg bg-neutral-800/60 flex items-center justify-between" data-testid={`payment-user-${user.id}`}>
                <span className="text-sm font-medium">{user.name}</span>
                <span className="text-xs text-neutral-500 font-mono">{user.stripeCustomerId}</span>
              </div>
            ))}
          </div>
        </AccordionCard>
      )}

      {!connected && !pricingStrategy && !pricingLoading && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">💳</div>
          <h3 className="font-bold text-lg mb-2">Připrav si platby</h3>
          <div className="text-sm text-neutral-400 space-y-2 max-w-md mx-auto">
            <p>1. Vytvoř si účet na <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">stripe.com</a></p>
            <p>2. Propoj Stripe v záložce Integrace (vlevo)</p>
            <p>3. Produkty se vytvoří automaticky</p>
            <p>4. Zákazníci uvidí tlačítko VIP v chatu</p>
          </div>
        </div>
      )}
    </div>
  );
}

type TimelinePoint = { date: string; revenue: number; transactions: number; newUsers: number; activeUsers: number; messages: number };
type FunnelStage = { stage: string; label: string; count: number; percentage: number; color: string };
type ContentPerf = { id: number; name: string; category: string; timesUsed: number; timesSold: number; revenue: number; conversionRate: number; avgPrice: number; tags: string[] };
type UserLTV = { userId: number; name: string; totalSpent: number; transactionCount: number; avgTransaction: number; firstPurchase: string | null; lastPurchase: string | null; daysSinceFirst: number; monthlyValue: number; predictedLTV: number; segment: string; engagementScore: number; relationshipStage: string };
type DailyReport = {
  generatedAt: string; period: string; revenue24h: number; transactions24h: number; newUsers24h: number; activeUsers24h: number; messages24h: number;
  funnelSnapshot: FunnelStage[]; topContent: ContentPerf[]; topSpenders: { name: string; spent: number }[];
  engineActions24h: { total: number; executed: number; pending: number; failed: number };
  responseRate: number; avgEngagement: number; strategicNotes: string[];
};

const chartTooltipStyle = { contentStyle: { background: "#171717", border: "1px solid #333", borderRadius: "8px", fontSize: "11px", color: "#e5e5e5" } };

const safeFetch = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
};

function AnalyticsTab() {
  const { data: timeline, isLoading: loadingTimeline, isError: errTimeline } = useQuery<TimelinePoint[]>({
    queryKey: ["/api/manager/analytics/timeline"],
    refetchInterval: 120000,
    queryFn: () => safeFetch("/api/manager/analytics/timeline"),
  });
  const { data: funnel, isLoading: loadingFunnel } = useQuery<FunnelStage[]>({
    queryKey: ["/api/manager/analytics/funnel"],
    refetchInterval: 60000,
    queryFn: () => safeFetch("/api/manager/analytics/funnel"),
  });
  const { data: contentPerf } = useQuery<ContentPerf[]>({
    queryKey: ["/api/manager/analytics/content-performance"],
    refetchInterval: 120000,
    queryFn: () => safeFetch("/api/manager/analytics/content-performance"),
  });
  const { data: ltvData } = useQuery<UserLTV[]>({
    queryKey: ["/api/manager/analytics/ltv"],
    refetchInterval: 120000,
    queryFn: () => safeFetch("/api/manager/analytics/ltv"),
  });

  if (loadingTimeline || loadingFunnel) return <div className="flex-1 flex items-center justify-center text-neutral-600">Načítám analytiku...</div>;

  const shortDate = (d: string) => { const p = d.split("-"); return `${p[2]}.${p[1]}.`; };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="revenue-chart">
        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Revenue (30 dní)</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#737373", fontSize: 9 }} axisLine={false} />
              <YAxis tick={{ fill: "#737373", fontSize: 9 }} axisLine={false} tickFormatter={v => `${v} Kč`} />
              <Tooltip {...chartTooltipStyle} formatter={(v: number) => [`${v} Kč`, "Revenue"]} labelFormatter={shortDate} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="messages-chart">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Zprávy / den</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#737373", fontSize: 8 }} axisLine={false} />
                <YAxis tick={{ fill: "#737373", fontSize: 8 }} axisLine={false} />
                <Tooltip {...chartTooltipStyle} labelFormatter={shortDate} />
                <Bar dataKey="messages" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="users-chart">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Noví uživatelé / den</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#737373", fontSize: 8 }} axisLine={false} />
                <YAxis tick={{ fill: "#737373", fontSize: 8 }} axisLine={false} />
                <Tooltip {...chartTooltipStyle} labelFormatter={shortDate} />
                <Line type="monotone" dataKey="newUsers" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="activeUsers" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {funnel && funnel.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="sales-funnel">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Prodejní trychtýř</p>
          <div className="space-y-1.5">
            {funnel.filter(f => f.stage !== "all").map(f => {
              const maxCount = Math.max(...funnel.filter(x => x.stage !== "all").map(x => x.count), 1);
              return (
                <div key={f.stage} className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-500 w-14 shrink-0">{f.label}</span>
                  <div className="flex-1 bg-neutral-800 rounded-full h-6 overflow-hidden relative">
                    <motion.div
                      className="h-full rounded-full flex items-center justify-end pr-2"
                      style={{ backgroundColor: f.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(5, (f.count / maxCount) * 100)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                      <span className="text-[9px] font-bold text-white drop-shadow">{f.count}</span>
                    </motion.div>
                  </div>
                  <span className="text-[9px] text-neutral-500 w-8 text-right">{f.percentage}%</span>
                </div>
              );
            })}
          </div>
          <p className="text-[8px] text-neutral-600 mt-2 text-center">Celkem: {funnel.find(f => f.stage === "all")?.count || 0} zákazníků</p>
        </div>
      )}

      {contentPerf && contentPerf.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="content-performance">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Výkon obsahu (Vault)</p>
          <div className="space-y-1.5">
            {contentPerf.slice(0, 8).map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 bg-neutral-800/50 rounded-lg px-3 py-2">
                <span className="text-[10px] text-neutral-500 w-4">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-white truncate">{c.name}</p>
                  <div className="flex gap-1 mt-0.5">
                    {c.tags.slice(0, 3).map(t => <span key={t} className="text-[7px] px-1 py-0.5 bg-neutral-700 text-neutral-400 rounded">{t}</span>)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-bold text-emerald-400">{c.revenue} Kč</p>
                  <p className="text-[8px] text-neutral-500">{c.timesSold}x prodáno | {c.conversionRate}% konv.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ltvData && ltvData.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="ltv-table">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Lifetime Value zákazníků</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-neutral-500 border-b border-neutral-800">
                  <th className="text-left py-1.5 px-1">Zákazník</th>
                  <th className="text-center py-1.5 px-1">Utraceno</th>
                  <th className="text-center py-1.5 px-1">Měsíčně</th>
                  <th className="text-center py-1.5 px-1">LTV (6M)</th>
                  <th className="text-center py-1.5 px-1">Segment</th>
                </tr>
              </thead>
              <tbody>
                {ltvData.filter(u => u.totalSpent > 0 || u.engagementScore > 30).slice(0, 15).map(u => (
                  <tr key={u.userId} className="border-b border-neutral-800/50">
                    <td className="py-1.5 px-1 text-white font-bold">{u.name}</td>
                    <td className="py-1.5 px-1 text-center text-emerald-400">{u.totalSpent} Kč</td>
                    <td className="py-1.5 px-1 text-center text-blue-400">{u.monthlyValue} Kč</td>
                    <td className="py-1.5 px-1 text-center text-violet-400 font-bold">{u.predictedLTV} Kč</td>
                    <td className="py-1.5 px-1 text-center">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${u.segment === "vip" ? "bg-yellow-500/20 text-yellow-400" : u.segment === "mid" ? "bg-blue-500/20 text-blue-400" : u.segment === "low" ? "bg-neutral-700 text-neutral-400" : "bg-red-500/10 text-red-400"}`}>{u.segment.toUpperCase()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportTab() {
  const { data: report, isLoading, isError } = useQuery<DailyReport>({
    queryKey: ["/api/manager/analytics/report"],
    refetchInterval: 300000,
    queryFn: () => safeFetch("/api/manager/analytics/report"),
  });

  if (isLoading || !report) return <div className="flex-1 flex items-center justify-center text-neutral-600">Generuji report...</div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="bg-gradient-to-r from-violet-500/10 to-emerald-500/10 border border-violet-500/20 rounded-xl p-4" data-testid="report-header">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-bold text-white">REPORT AI MANAŽERA</p>
          <p className="text-[9px] text-neutral-400">{new Date(report.generatedAt).toLocaleString("cs-CZ")}</p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-400">{report.revenue24h} Kč</p>
            <p className="text-[8px] text-neutral-500">Tržby 24h</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-400">{report.transactions24h}</p>
            <p className="text-[8px] text-neutral-500">Prodeje</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-violet-400">{report.newUsers24h}</p>
            <p className="text-[8px] text-neutral-500">Noví</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-amber-400">{report.activeUsers24h}</p>
            <p className="text-[8px] text-neutral-500">Aktivní</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-neutral-300">{report.messages24h}</p>
            <p className="text-[8px] text-neutral-500">Zpráv</p>
          </div>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="report-funnel">
        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Stav trychtýře</p>
        <div className="flex items-end gap-1 justify-center h-24">
          {(() => { const stages = report.funnelSnapshot.filter(f => f.stage !== "all"); const maxC = Math.max(...stages.map(s => s.count), 1); return stages.map(f => (
            <div key={f.stage} className="flex flex-col items-center gap-1">
              <motion.div
                className="rounded-t-md w-10"
                style={{ backgroundColor: f.color }}
                initial={{ height: 0 }}
                animate={{ height: Math.max(8, (f.count / maxC) * 80) }}
                transition={{ duration: 0.6 }}
              />
              <p className="text-[8px] font-bold text-white">{f.count}</p>
              <p className="text-[7px] text-neutral-500">{f.label}</p>
            </div>
          )); })()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="report-engine-actions">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Engine akce (24h)</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-neutral-500">Celkem:</span>
              <span className="text-white font-bold">{report.engineActions24h.total}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-neutral-500">Provedeno:</span>
              <span className="text-emerald-400 font-bold">{report.engineActions24h.executed}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-neutral-500">Čeká:</span>
              <span className="text-amber-400 font-bold">{report.engineActions24h.pending}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-neutral-500">Selhalo:</span>
              <span className="text-red-400 font-bold">{report.engineActions24h.failed}</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="report-kpis">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">KPI</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-neutral-500">Response rate:</span>
              <span className={`font-bold ${report.responseRate >= 40 ? "text-emerald-400" : report.responseRate >= 20 ? "text-amber-400" : "text-red-400"}`}>{report.responseRate}%</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-neutral-500">Avg engagement:</span>
              <span className={`font-bold ${report.avgEngagement >= 50 ? "text-emerald-400" : report.avgEngagement >= 30 ? "text-amber-400" : "text-red-400"}`}>{report.avgEngagement}%</span>
            </div>
          </div>
        </div>
      </div>

      {report.topContent.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="report-top-content">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">TOP obsah</p>
          <div className="space-y-1">
            {report.topContent.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 text-[10px]">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] ${i === 0 ? "bg-yellow-500/20 text-yellow-400" : i === 1 ? "bg-neutral-600 text-neutral-300" : "bg-orange-500/20 text-orange-400"}`}>{i + 1}</span>
                <span className="text-white flex-1 truncate">{c.name}</span>
                <span className="text-emerald-400 font-bold">{c.revenue} Kč</span>
                <span className="text-neutral-500">{c.conversionRate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.topSpenders.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="report-top-spenders">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">TOP zákazníci (24h)</p>
          <div className="space-y-1">
            {report.topSpenders.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="text-neutral-500 w-4">{i + 1}.</span>
                <span className="text-white flex-1">{s.name}</span>
                <span className="text-emerald-400 font-bold">{s.spent} Kč</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.strategicNotes.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3" data-testid="report-strategic-notes">
          <p className="text-[11px] font-bold text-amber-300 uppercase tracking-widest mb-2">Strategická doporučení AI</p>
          <div className="space-y-1.5">
            {report.strategicNotes.map((note, i) => (
              <div key={i} className="flex gap-2 text-[10px]">
                <span className="text-amber-400 shrink-0">→</span>
                <span className="text-neutral-300">{note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center text-[8px] text-neutral-600 py-2">
        Report generován: {new Date(report.generatedAt).toLocaleString("cs-CZ")} | Období: {report.period}
      </div>
    </div>
  );
}

type MarketIntelligenceData = {
  marketData: {
    lastUpdated: string;
    currency: string;
    tiers: { name: string; label: string; priceRange: { min: number; max: number }; description: string; conversionBenchmark: number }[];
    contentPricing: { type: string; label: string; tiers: { low: { min: number; max: number }; mid: { min: number; max: number }; high: { min: number; max: number } } }[];
    benchmarks: { avgConversionRate: number; avgFirstPurchase: number; avgRepeatPurchase: number; avgLifetimeValue: number; optimalFirstOffer: { min: number; max: number } };
    trendingContent: string[];
    leadSources: { platform: string; potential: string; strategy: string }[];
  };
  internalMetrics: {
    totalRevenue: number;
    totalTransactions: number;
    avgTransactionValue: number;
    conversionRate: number;
    bestSellingPriceRange: { min: number; max: number } | null;
    priceDistribution: { range: string; count: number; revenue: number }[];
    recentTrend: string;
    userSegments: { highSpenders: number; midSpenders: number; lowSpenders: number; nonBuyers: number };
  };
  trendScore: number;
  recommendations: { type: string; priority: string; title: string; description: string; dataSource: string }[];
};

function MarketTab() {
  const { data: intel, isLoading } = useQuery<MarketIntelligenceData>({
    queryKey: ["/api/manager/market-intelligence"],
    refetchInterval: 60000,
    queryFn: () => safeFetch("/api/manager/market-intelligence"),
  });

  if (isLoading || !intel) return <div className="flex-1 flex items-center justify-center text-neutral-600">Načítám tržní data...</div>;

  const m = intel.internalMetrics;
  const md = intel.marketData;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center" data-testid="metric-trend-score">
          <p className={`text-lg font-bold ${intel.trendScore >= 60 ? "text-emerald-400" : intel.trendScore >= 40 ? "text-amber-400" : "text-red-400"}`}>{intel.trendScore}</p>
          <p className="text-[9px] text-neutral-500">Trend Score</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center" data-testid="metric-revenue">
          <p className="text-lg font-bold text-emerald-400">{m.totalRevenue} Kč</p>
          <p className="text-[9px] text-neutral-500">Revenue</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center" data-testid="metric-conversion">
          <p className={`text-lg font-bold ${m.conversionRate >= md.benchmarks.avgConversionRate ? "text-emerald-400" : "text-amber-400"}`}>{m.conversionRate}%</p>
          <p className="text-[9px] text-neutral-500">Konverze</p>
          <p className="text-[8px] text-neutral-600">benchmark: {md.benchmarks.avgConversionRate}%</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center" data-testid="metric-avg-tx">
          <p className="text-lg font-bold text-blue-400">{m.avgTransactionValue} Kč</p>
          <p className="text-[9px] text-neutral-500">Avg platba</p>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="market-tiers">
        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Cenové tiers (tržní benchmarky)</p>
        <div className="space-y-1.5">
          {md.tiers.map(t => (
            <div key={t.name} className="flex items-center justify-between bg-neutral-800/50 rounded-lg px-3 py-2">
              <div>
                <p className="text-[11px] font-bold text-white">{t.label}</p>
                <p className="text-[9px] text-neutral-500">{t.description}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-emerald-400">{t.priceRange.min}-{t.priceRange.max} Kč</p>
                <p className="text-[9px] text-neutral-500">konverze: {t.conversionBenchmark}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {m.bestSellingPriceRange && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3" data-testid="best-selling-range">
          <p className="text-[11px] font-bold text-emerald-300">Nejúspěšnější cenový rozsah (z interních dat)</p>
          <p className="text-lg font-bold text-emerald-400">{m.bestSellingPriceRange.min}-{m.bestSellingPriceRange.max} Kč</p>
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="price-distribution">
        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Distribuce prodejů podle ceny</p>
        <div className="space-y-1">
          {m.priceDistribution.map(pd => (
            <div key={pd.range} className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 w-16 shrink-0">{pd.range}</span>
              <div className="flex-1 bg-neutral-800 rounded-full h-3 overflow-hidden">
                <div className="bg-violet-500/60 h-full rounded-full" style={{ width: `${m.totalTransactions > 0 ? Math.max(2, (pd.count / m.totalTransactions) * 100) : 0}%` }} />
              </div>
              <span className="text-[10px] text-neutral-400 w-10 text-right">{pd.count}x</span>
              <span className="text-[10px] text-emerald-400/70 w-16 text-right">{pd.revenue} Kč</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="user-segments">
        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Segmenty zákazníků</p>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-sm font-bold text-yellow-400">{m.userSegments.highSpenders}</p>
            <p className="text-[8px] text-neutral-500">VIP (500+ Kč)</p>
          </div>
          <div className="text-center p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-sm font-bold text-blue-400">{m.userSegments.midSpenders}</p>
            <p className="text-[8px] text-neutral-500">Mid (100-499)</p>
          </div>
          <div className="text-center p-2 bg-neutral-700/30 border border-neutral-600/30 rounded-lg">
            <p className="text-sm font-bold text-neutral-400">{m.userSegments.lowSpenders}</p>
            <p className="text-[8px] text-neutral-500">Low (1-99)</p>
          </div>
          <div className="text-center p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm font-bold text-red-400">{m.userSegments.nonBuyers}</p>
            <p className="text-[8px] text-neutral-500">Nekupují</p>
          </div>
        </div>
      </div>

      {intel.recommendations.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="recommendations">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">AI Doporučení (data-driven)</p>
          <div className="space-y-2">
            {intel.recommendations.map((rec, i) => (
              <div key={i} className={`p-2.5 rounded-lg border ${rec.priority === "high" ? "bg-red-500/5 border-red-500/20" : rec.priority === "medium" ? "bg-amber-500/5 border-amber-500/20" : "bg-neutral-800/50 border-neutral-700/30"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${rec.priority === "high" ? "bg-red-500/20 text-red-400" : rec.priority === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-neutral-700 text-neutral-400"}`}>{rec.priority}</span>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${rec.type === "pricing" ? "bg-emerald-500/20 text-emerald-400" : rec.type === "lead_gen" ? "bg-blue-500/20 text-blue-400" : rec.type === "content" ? "bg-violet-500/20 text-violet-400" : "bg-neutral-700 text-neutral-400"}`}>{rec.type}</span>
                  <span className="text-[10px] font-bold text-white">{rec.title}</span>
                </div>
                <p className="text-[10px] text-neutral-400">{rec.description}</p>
                <p className="text-[8px] text-neutral-600 mt-1">Zdroj: {rec.dataSource}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="content-pricing">
        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Ceny podle typu obsahu (tržní data)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-neutral-500 border-b border-neutral-800">
                <th className="text-left py-1.5 px-2">Typ</th>
                <th className="text-center py-1.5 px-2">Low</th>
                <th className="text-center py-1.5 px-2">Mid</th>
                <th className="text-center py-1.5 px-2">High</th>
              </tr>
            </thead>
            <tbody>
              {md.contentPricing.map(cp => (
                <tr key={cp.type} className="border-b border-neutral-800/50">
                  <td className="py-1.5 px-2 text-white font-bold">{cp.label}</td>
                  <td className="py-1.5 px-2 text-center text-neutral-400">{cp.tiers.low.min}-{cp.tiers.low.max} Kč</td>
                  <td className="py-1.5 px-2 text-center text-blue-400">{cp.tiers.mid.min}-{cp.tiers.mid.max} Kč</td>
                  <td className="py-1.5 px-2 text-center text-emerald-400">{cp.tiers.high.min}-{cp.tiers.high.max} Kč</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="trending-content">
        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Trending obsah</p>
        <div className="space-y-1">
          {md.trendingContent.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <span className="text-emerald-400">•</span>
              <span className="text-neutral-300">{t}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3" data-testid="lead-sources">
        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Lead generation - zdroje trafficu</p>
        <div className="space-y-1.5">
          {md.leadSources.map((ls, i) => (
            <div key={i} className="flex items-center gap-3 bg-neutral-800/50 rounded-lg px-3 py-2">
              <span className="text-[11px] font-bold text-white w-20 shrink-0">{ls.platform}</span>
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${ls.potential === "vysoký" ? "bg-emerald-500/20 text-emerald-400" : ls.potential === "střední" ? "bg-amber-500/20 text-amber-400" : "bg-neutral-700 text-neutral-400"}`}>{ls.potential}</span>
              <span className="text-[10px] text-neutral-400 flex-1">{ls.strategy}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center text-[8px] text-neutral-600 py-2">
        Tržní data aktualizována: {new Date(md.lastUpdated).toLocaleString("cs-CZ")} | Trend: {m.recentTrend === "growing" ? "rostoucí" : m.recentTrend === "stable" ? "stabilní" : m.recentTrend === "declining" ? "klesající" : "nedostatek dat"}
      </div>
    </div>
  );
}

function safeFetchJson(url: string) {
  return fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
}

function RevenueTab() {
  const { data: rev, isError } = useQuery<any>({ queryKey: ["/api/manager/analytics/revenue"], queryFn: () => safeFetchJson("/api/manager/analytics/revenue") });

  if (isError) return <div className="flex-1 flex items-center justify-center text-red-400">Chyba při načítání revenue dat</div>;
  if (!rev) return <div className="flex-1 flex items-center justify-center text-neutral-500">Načítám revenue metriky...</div>;

  const kpiCards = [
    { label: "MRR", value: `${rev.mrr} Kč`, color: "text-emerald-400" },
    { label: "ARPU", value: `${rev.arpu} Kč`, color: "text-blue-400" },
    { label: "Churn Rate", value: `${rev.churnRate}%`, color: rev.churnRate > 5 ? "text-red-400" : "text-emerald-400" },
    { label: "NRR", value: `${rev.nrr}%`, color: rev.nrr >= 100 ? "text-emerald-400" : "text-amber-400" },
    { label: "Platících", value: `${rev.payingCustomers}/${rev.totalCustomers}`, color: "text-violet-400" },
    { label: "Konverze", value: `${rev.conversionRate}%`, color: "text-pink-400" },
    { label: "Expanze", value: `${rev.expansionRevenue} Kč`, color: "text-cyan-400" },
    { label: "MRR růst", value: `${rev.mrrGrowthRate > 0 ? "+" : ""}${rev.mrrGrowthRate}%`, color: rev.mrrGrowthRate >= 0 ? "text-emerald-400" : "text-red-400" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="tab-revenue-content">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {kpiCards.map(k => (
          <div key={k.label} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
            <div className="text-[10px] text-neutral-500 font-bold uppercase">{k.label}</div>
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h3 className="text-sm font-bold mb-3">MRR Waterfall</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rev.mrrWaterfall}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="label" tick={{ fill: "#999", fontSize: 10 }} />
            <YAxis tick={{ fill: "#999", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }} />
            <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <h3 className="text-sm font-bold mb-3">Revenue podle platformy</h3>
          {rev.revenueByPlatform?.length > 0 ? rev.revenueByPlatform.map((p: any) => (
            <div key={p.platform} className="flex items-center justify-between py-1.5 border-b border-neutral-800 last:border-0">
              <span className="text-xs font-bold capitalize">{p.platform}</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-neutral-400">{p.customers} zákazníků</span>
                <span className="text-xs text-emerald-400 font-bold">{p.revenue} Kč</span>
              </div>
            </div>
          )) : <div className="text-neutral-500 text-xs">Zatím žádná data</div>}
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <h3 className="text-sm font-bold mb-3">Churn kohorty (6 měsíců)</h3>
          {rev.churnCohorts?.map((c: any) => (
            <div key={c.month} className="flex items-center gap-2 py-1.5">
              <span className="text-[10px] text-neutral-400 w-14">{c.month}</span>
              <div className="flex-1 bg-neutral-800 rounded-full h-3 overflow-hidden">
                <div className="h-full bg-emerald-500/60 rounded-full transition-all" style={{ width: `${c.retentionRate}%` }} />
              </div>
              <span className="text-[10px] font-bold text-emerald-400 w-10 text-right">{c.retentionRate}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EngagementTab() {
  const { data: scores, isError } = useQuery<any[]>({ queryKey: ["/api/manager/analytics/engagement-scores"], queryFn: () => safeFetchJson("/api/manager/analytics/engagement-scores") });

  if (isError) return <div className="flex-1 flex items-center justify-center text-red-400">Chyba při načítání engagement dat</div>;
  if (!scores) return <div className="flex-1 flex items-center justify-center text-neutral-500">Načítám engagement skóre...</div>;

  const tierColors: Record<string, string> = { monetized: "bg-emerald-500/20 text-emerald-400", hot: "bg-red-500/20 text-red-400", warm: "bg-amber-500/20 text-amber-400", cold: "bg-blue-500/20 text-blue-400" };
  const tierCounts = scores.reduce((acc, s) => { acc[s.tier] = (acc[s.tier] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="tab-engagement-content">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(tierCounts).map(([tier, count]) => (
          <div key={tier} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
            <div className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded inline-block ${tierColors[tier] || "bg-neutral-700 text-neutral-400"}`}>{tier}</div>
            <div className="text-2xl font-bold mt-1">{count as number}</div>
          </div>
        ))}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h3 className="text-sm font-bold mb-1">Engagement distribuce</h3>
        <p className="text-[10px] text-neutral-500 mb-3">Skóre = (2×zprávy) + (5×nákupy) − (3×dny neaktivity) × 0.9^týdny</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={scores.slice(0, 20)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="name" tick={{ fill: "#999", fontSize: 9 }} angle={-45} textAnchor="end" height={60} />
            <YAxis tick={{ fill: "#999", fontSize: 10 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }} />
            <Bar dataKey="score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-neutral-800/50">
              <th className="text-left px-3 py-2 text-neutral-400 font-bold">Jméno</th>
              <th className="text-center px-3 py-2 text-neutral-400 font-bold">Skóre</th>
              <th className="text-center px-3 py-2 text-neutral-400 font-bold">Tier</th>
              <th className="text-center px-3 py-2 text-neutral-400 font-bold">Zprávy</th>
              <th className="text-center px-3 py-2 text-neutral-400 font-bold">Nákupy</th>
              <th className="text-center px-3 py-2 text-neutral-400 font-bold">Neaktivita</th>
              <th className="text-center px-3 py-2 text-neutral-400 font-bold">Decay</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s: any) => (
              <tr key={s.userId} className="border-t border-neutral-800/50 hover:bg-neutral-800/30">
                <td className="px-3 py-2 font-bold">{s.name}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`font-bold ${s.score >= 80 ? "text-emerald-400" : s.score >= 50 ? "text-amber-400" : s.score >= 25 ? "text-blue-400" : "text-neutral-500"}`}>{s.score}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${tierColors[s.tier] || "bg-neutral-700 text-neutral-400"}`}>{s.tier}</span>
                </td>
                <td className="px-3 py-2 text-center text-neutral-400">{s.messageCount}</td>
                <td className="px-3 py-2 text-center text-neutral-400">{s.purchaseCount}</td>
                <td className="px-3 py-2 text-center text-neutral-400">{s.daysSinceLastActivity}d</td>
                <td className="px-3 py-2 text-center">{s.decayApplied ? <span className="text-amber-400">✓</span> : <span className="text-neutral-600">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeeklyReportTab() {
  const { data: report, isError } = useQuery<any>({ queryKey: ["/api/manager/analytics/weekly-report"], queryFn: () => safeFetchJson("/api/manager/analytics/weekly-report") });
  const { data: alertsData } = useQuery<any[]>({ queryKey: ["/api/manager/alerts"], queryFn: () => safeFetchJson("/api/manager/alerts"), refetchInterval: 30000 });
  const qc = useQueryClient();

  const dismissMut = useMutation({
    mutationFn: (id: string) => fetch(`/api/manager/alerts/${id}/dismiss`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/manager/alerts"] }),
  });

  if (isError) return <div className="flex-1 flex items-center justify-center text-red-400">Chyba při generování reportu</div>;
  if (!report) return <div className="flex-1 flex items-center justify-center text-neutral-500">Generuji týdenní report...</div>;

  const severityColors: Record<string, string> = { critical: "bg-red-500/20 text-red-400 border-red-500/30", warning: "bg-amber-500/20 text-amber-400 border-amber-500/30", info: "bg-blue-500/20 text-blue-400 border-blue-500/30" };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="tab-weekly-content">
      {alertsData && alertsData.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-sm font-bold flex items-center gap-2">🔔 Upozornění <span className="text-[10px] text-amber-400 font-normal">{alertsData.length} aktivních</span></h3>
          {alertsData.slice(0, 5).map((a: any) => (
            <div key={a.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${severityColors[a.severity] || "bg-neutral-800 border-neutral-700"}`}>
              <span className="text-xs flex-1">{a.message}</span>
              <span className="text-[8px] text-neutral-500">{new Date(a.timestamp).toLocaleTimeString("cs-CZ")}</span>
              <button onClick={() => dismissMut.mutate(a.id)} className="text-[10px] text-neutral-500 hover:text-white" data-testid={`dismiss-alert-${a.id}`}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { l: "MRR", v: `${report.kpis.mrr} Kč`, c: "text-emerald-400" },
          { l: "ARPU", v: `${report.kpis.arpu} Kč`, c: "text-blue-400" },
          { l: "Churn", v: `${report.kpis.churnRate}%`, c: report.kpis.churnRate > 5 ? "text-red-400" : "text-emerald-400" },
          { l: "NRR", v: `${report.kpis.nrr}%`, c: report.kpis.nrr >= 100 ? "text-emerald-400" : "text-amber-400" },
          { l: "Engagement", v: `${report.kpis.avgEngagement}%`, c: "text-violet-400" },
        ].map(k => (
          <div key={k.l} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
            <div className="text-[10px] text-neutral-500 font-bold">{k.l}</div>
            <div className={`text-lg font-bold ${k.c}`}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h3 className="text-sm font-bold mb-3">Týden vs. týden</h3>
        {report.weekOverWeek?.map((w: any) => (
          <div key={w.metric} className="flex items-center justify-between py-1.5 border-b border-neutral-800/50 last:border-0">
            <span className="text-xs text-neutral-400">{w.metric}</span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-neutral-500">{w.lastWeek}</span>
              <span className="text-xs">→</span>
              <span className="text-xs font-bold">{w.thisWeek}</span>
              <span className={`text-[10px] font-bold ${w.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {w.change > 0 ? "+" : ""}{w.change}%
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <h3 className="text-sm font-bold mb-2">Top zákazníci</h3>
          {report.topPerformers?.map((p: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-neutral-800/50 last:border-0">
              <span className="text-xs font-bold">{p.name}</span>
              <div className="flex gap-3">
                <span className="text-[10px] text-neutral-400">Eng: {p.engagement}%</span>
                <span className="text-xs text-emerald-400 font-bold">{p.spent} Kč</span>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <h3 className="text-sm font-bold mb-2">Benchmarky vs. industrie</h3>
          {report.competitiveBenchmarks?.map((b: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-neutral-800/50 last:border-0">
              <span className="text-xs text-neutral-400">{b.metric}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">{b.ours}</span>
                <span className="text-[10px] text-neutral-500">vs {b.industry}</span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${b.verdict === "OK" || b.verdict === "Výborný" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>{b.verdict}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h3 className="text-sm font-bold mb-2">Strategické doporučení</h3>
        <div className="space-y-1.5">
          {report.strategicRecommendations?.map((r: string, i: number) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-amber-400 shrink-0 mt-0.5">→</span>
              <span className="text-neutral-300">{r}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 py-3">
        <span className="text-[8px] text-neutral-600">
          Report vygenerován: {new Date(report.generatedAt).toLocaleString("cs-CZ")}
        </span>
        <a href="/api/manager/analytics/weekly-report/export" download
          className="text-[10px] bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg transition-colors font-bold"
          data-testid="export-report-btn">
          Exportovat report (.txt)
        </a>
      </div>
    </div>
  );
}

// ─── Subscription Health Tab ──────────────────────────────────────────────────
interface SubHealthUser {
  userId: number;
  userName: string;
  churnRisk: "low" | "medium" | "high" | "critical";
  riskScore: number;
  riskFactors: string[];
  daysSinceLastMessage: number;
  subscriptionAge: number;
  messageCount: number;
  purchaseCount: number;
  suggestedAction: string;
}

interface SubHealthReport {
  totalSubscribers: number;
  activeSubscribers: number;
  atRiskSubscribers: number;
  estimatedMRR: number;
  estimatedARR: number;
  churnCandidates: SubHealthUser[];
  generatedAt: string;
}

function SubscriptionHealthTab() {
  const { data: report, isLoading } = useQuery<SubHealthReport>({
    queryKey: ["/api/manager/subscription-health"],
    refetchInterval: 60000,
    queryFn: () => fetch("/api/manager/subscription-health").then(r => r.json()),
  });

  const riskColor = (risk: string) => {
    if (risk === "critical") return "text-red-400 bg-red-500/10 border-red-500/25";
    if (risk === "high") return "text-orange-400 bg-orange-500/10 border-orange-500/25";
    if (risk === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/25";
    return "text-emerald-400 bg-emerald-500/10 border-emerald-500/25";
  };

  const riskLabel = (risk: string) => {
    if (risk === "critical") return "Kritické";
    if (risk === "high") return "Vysoké";
    if (risk === "medium") return "Střední";
    return "Nízké";
  };

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-neutral-600 text-sm">Načítám přehled předplatného...</div>
    </div>
  );

  if (!report) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-neutral-600 text-sm">Žádná data</div>
    </div>
  );

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Zdraví předplatného</h2>
        <p className="text-neutral-500 text-xs">Churn risk a MRR přehled</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center" data-testid="kpi-total-subscribers">
          <p className="text-2xl font-bold text-white">{report.totalSubscribers}</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">Celkem subscribers</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center" data-testid="kpi-active-subscribers">
          <p className="text-2xl font-bold text-emerald-400">{report.activeSubscribers}</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">Aktivní</p>
        </div>
        <div className="bg-neutral-900 border border-orange-500/20 rounded-xl p-4 text-center" data-testid="kpi-at-risk">
          <p className="text-2xl font-bold text-orange-400">{report.atRiskSubscribers}</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">Ohrožené odchodem</p>
        </div>
        <div className="bg-neutral-900 border border-violet-500/20 rounded-xl p-4 text-center" data-testid="kpi-mrr">
          <p className="text-2xl font-bold text-violet-400">{Math.round(report.estimatedMRR / 100).toLocaleString()} Kč</p>
          <p className="text-[10px] text-neutral-500 mt-0.5">Odhadované MRR</p>
        </div>
      </div>

      {/* Churn Risk Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden" data-testid="churn-risk-table">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Zákazníci s rizikem odchodu</h3>
          <span className="text-[10px] text-neutral-500">{report.churnCandidates.length} zákazníků</span>
        </div>
        {report.churnCandidates.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-neutral-600 text-sm">Žádní zákazníci s rizikem odchodu 🎉</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {report.churnCandidates.map((user) => (
              <div key={user.userId} className="px-4 py-3 hover:bg-neutral-800/30 transition-colors" data-testid={`churn-row-${user.userId}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-white truncate">{user.userName}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${riskColor(user.churnRisk)}`}>
                        {riskLabel(user.churnRisk)} ({Math.round(user.riskScore * 100)}%)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {user.riskFactors.slice(0, 3).map((factor, i) => (
                        <span key={i} className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
                          {factor}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-amber-400/80">→ {user.suggestedAction}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-neutral-500">{user.daysSinceLastMessage}d bez aktivity</p>
                    <p className="text-[10px] text-neutral-600">{user.purchaseCount} nákupů</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-neutral-700 text-center">
        Generováno: {new Date(report.generatedAt).toLocaleString("cs-CZ")}
      </p>
    </div>
  );
}

export default function ManagerDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "customers" | "vault" | "trends" | "broadcast" | "payments" | "market" | "analytics" | "report" | "revenue" | "engagement" | "weekly" | "subscriptions">("overview");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [initialFilter, setInitialFilter] = useState<string | undefined>(undefined);
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
    { id: "overview" as const, icon: "🧠", label: "Přehled" },
    { id: "customers" as const, icon: "👥", label: "Zákazníci" },
    { id: "vault" as const, icon: "📦", label: "Vault" },
    { id: "trends" as const, icon: "📊", label: "Trendy" },
    { id: "broadcast" as const, icon: "📢", label: "Broadcast" },
    { id: "payments" as const, icon: "💳", label: "Platby" },
    { id: "analytics" as const, icon: "📉", label: "Analytika" },
    { id: "revenue" as const, icon: "💰", label: "Revenue" },
    { id: "engagement" as const, icon: "🎯", label: "Scoring" },
    { id: "weekly" as const, icon: "📊", label: "Týdenní" },
    { id: "report" as const, icon: "📋", label: "Report" },
    { id: "market" as const, icon: "📈", label: "Trh" },
    { id: "subscriptions" as const, icon: "💜", label: "Předplatné" },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <div className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🧠</span>
          <div>
            <h1 className="font-bold text-sm leading-none" data-testid="text-dashboard-title">Ninna Ray Manager</h1>
            <p className="text-neutral-500 text-[10px]">{users.length} zákazníků</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Engine aktivní" />
          <div className="flex items-center gap-2 ml-2" data-testid="ebot-stats-panel">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-400" title="VIP uživatelé">
              👑 {users.filter(u => u.isSubscribed).length}
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-pink-500/20 border border-pink-500/30 text-pink-400" title="E-Bot aktivní">
              🤖 {users.filter(u => u.botEnabled).length}
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/30 text-violet-400" title="Odemčený obsah">
              🔓 {users.reduce((s, u) => s + (u.unlockedCount || 0), 0)}
            </span>
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
        {activeTab === "overview" && <OverviewTab users={users} onNavigate={(tab, filter, group) => { setActiveTab(tab); setInitialFilter(filter); if (group) setSelectedGroup(group); else setSelectedGroup(null); }} />}
        {activeTab === "customers" && <CustomersTab users={users} qc={qc} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} initialFilter={initialFilter} />}
        {activeTab === "vault" && <VaultTab />}
        {activeTab === "trends" && <TrendsTab />}
        {activeTab === "broadcast" && <BroadcastTab />}
        {activeTab === "payments" && <PaymentsTab users={users} />}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "revenue" && <RevenueTab />}
        {activeTab === "engagement" && <EngagementTab />}
        {activeTab === "weekly" && <WeeklyReportTab />}
        {activeTab === "report" && <ReportTab />}
        {activeTab === "market" && <MarketTab />}
        {activeTab === "subscriptions" && <SubscriptionHealthTab />}
      </div>
    </div>
  );
}
