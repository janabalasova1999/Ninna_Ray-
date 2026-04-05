import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

type AgencyConversation = {
  id: number;
  userId: number;
  title: string;
  createdAt: string;
  messageCount: number;
  user: { id: number; name: string; messageCount: number } | null;
  lastMessage: { id: number; role: string; content: string; createdAt: string } | null;
};

type AgencyStats = {
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  avgMessagesPerUser: number;
  activeConversations24h: number;
};

type Message = {
  id: number;
  role: string;
  content: string;
  createdAt: string;
};

export default function Agency() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("agency_auth") === "1");
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const login = async () => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwInput, role: "agency" }),
      });
      if (res.ok) {
        sessionStorage.setItem("agency_auth", "1");
        setAuthed(true);
      } else {
        setPwError(true);
        setTimeout(() => setPwError(false), 1500);
      }
    } catch {
      setPwError(true);
      setTimeout(() => setPwError(false), 1500);
    }
  };

  const { data: stats } = useQuery<AgencyStats>({
    queryKey: ["/api/agency/stats"],
    enabled: authed,
    refetchInterval: 30000,
  });

  const { data: conversations = [] } = useQuery<AgencyConversation[]>({
    queryKey: ["/api/agency/conversations"],
    enabled: authed,
    refetchInterval: 15000,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/agency/conversations", selectedConvId, "messages"],
    enabled: authed && selectedConvId !== null,
    refetchInterval: 5000,
  });

  const sendReply = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/agency/conversations/${selectedConvId}/manual-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Chyba při odesílání");
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/agency/conversations", selectedConvId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agency/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agency/stats"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!replyText.trim() || sendReply.isPending) return;
    sendReply.mutate(replyText.trim());
  };

  const selectedConv = conversations.find(c => c.id === selectedConvId);

  if (!authed) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-8 space-y-6"
        >
          <div className="text-center">
            <div className="text-4xl mb-2">🍒</div>
            <h1 className="text-xl font-bold text-white">Ninna Agency</h1>
            <p className="text-neutral-500 text-sm mt-1">Zadej přístupové heslo</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
              placeholder="Heslo..."
              className={`w-full bg-neutral-800 border ${pwError ? "border-red-500" : "border-neutral-700"} text-white rounded-xl px-4 py-3 outline-none focus:border-pink-500 transition-colors`}
              autoFocus
            />
            {pwError && <p className="text-red-400 text-sm text-center">Špatné heslo</p>}
            <button
              onClick={login}
              className="w-full bg-pink-600 hover:bg-pink-500 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Vstoupit
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍒</span>
          <div>
            <h1 className="font-bold text-lg leading-none">Ninna Agency</h1>
            <p className="text-neutral-500 text-xs">Dashboard</p>
          </div>
        </div>
        <button
          onClick={() => { sessionStorage.removeItem("agency_auth"); setAuthed(false); }}
          className="text-neutral-500 hover:text-white text-sm transition-colors"
        >
          Odhlásit
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-4 py-4 border-b border-neutral-800">
          {[
            { label: "Uživatelé", value: stats.totalUsers, icon: "👤" },
            { label: "Konverzace", value: stats.totalConversations, icon: "💬" },
            { label: "Zprávy celkem", value: stats.totalMessages, icon: "📨" },
            { label: "Průměr/user", value: stats.avgMessagesPerUser, icon: "📊" },
            { label: "Aktivní 24h", value: stats.activeConversations24h, icon: "🟢" },
          ].map(s => (
            <div key={s.label} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center">
              <div className="text-lg">{s.icon}</div>
              <div className="text-2xl font-bold text-pink-400">{s.value}</div>
              <div className="text-neutral-500 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list */}
        <div className="w-full md:w-80 border-r border-neutral-800 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
              Konverzace ({conversations.length})
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <div className="text-center text-neutral-600 py-12 text-sm">
                Zatím žádné konverzace
              </div>
            )}
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={`w-full text-left px-4 py-3 border-b border-neutral-800/50 hover:bg-neutral-800/50 transition-colors ${selectedConvId === conv.id ? "bg-neutral-800" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-white truncate">
                    {conv.user?.name || `User #${conv.userId}`}
                  </span>
                  <span className="text-xs text-neutral-600 ml-2 shrink-0">
                    {conv.lastMessage
                      ? formatDistanceToNow(new Date(conv.lastMessage.createdAt), { locale: cs, addSuffix: true })
                      : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-neutral-500 truncate max-w-[180px]">
                    {conv.lastMessage
                      ? (conv.lastMessage.role === "user" ? "👤 " : "🍒 ") + conv.lastMessage.content
                      : "Prázdná konverzace"}
                  </p>
                  <span className="text-xs bg-neutral-700 text-neutral-400 rounded-full px-2 py-0.5 ml-1 shrink-0">
                    {conv.messageCount}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat detail */}
        <div className={`flex-1 flex flex-col overflow-hidden ${selectedConvId === null ? "hidden md:flex" : "flex"}`}>
          {selectedConvId === null ? (
            <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
              Vyber konverzaci ze seznamu
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="border-b border-neutral-800 px-4 py-3 flex items-center gap-3 bg-neutral-900/50">
                <button
                  onClick={() => setSelectedConvId(null)}
                  className="md:hidden text-neutral-500 hover:text-white mr-1"
                >
                  ←
                </button>
                <div className="w-8 h-8 rounded-full bg-pink-600/20 border border-pink-500/30 flex items-center justify-center text-sm font-bold text-pink-400">
                  {selectedConv?.user?.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <p className="font-semibold text-sm">{selectedConv?.user?.name || `User #${selectedConv?.userId}`}</p>
                  <p className="text-xs text-neutral-500">{selectedConv?.messageCount} zpráv</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                <AnimatePresence initial={false}>
                  {messages.map(msg => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                          msg.role === "user"
                            ? "bg-neutral-800 text-white rounded-tl-sm"
                            : "bg-pink-600/90 text-white rounded-tr-sm"
                        }`}
                      >
                        <p className="leading-relaxed break-words">{msg.content}</p>
                        <p className="text-xs mt-1 opacity-50 text-right">
                          {msg.role === "assistant" ? "🍒 Ninna" : "👤"} ·{" "}
                          {formatDistanceToNow(new Date(msg.createdAt), { locale: cs, addSuffix: true })}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>

              {/* Manual reply box */}
              <div className="border-t border-neutral-800 p-4 bg-neutral-900/50">
                <p className="text-xs text-neutral-600 mb-2 font-medium uppercase tracking-widest">
                  ✍️ Ruční odpověď jako Ninna
                </p>
                <div className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Napiš zprávu za Ninnu..."
                    rows={2}
                    className="flex-1 bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-pink-500 resize-none transition-colors placeholder:text-neutral-600"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!replyText.trim() || sendReply.isPending}
                    className="bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white rounded-xl px-4 font-bold text-sm transition-colors"
                  >
                    {sendReply.isPending ? "..." : "Odeslat"}
                  </button>
                </div>
                <p className="text-xs text-neutral-700 mt-2">Enter = odeslat · Shift+Enter = nový řádek</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
