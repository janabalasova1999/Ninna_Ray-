import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";
import { useLocation } from "wouter";

type ConvUser = { id: number; name: string; messageCount: number; platform?: string } | null;
type LastMsg = { id: number; role: string; content: string; createdAt: string } | null;
type AgentConv = {
  id: number; userId: number; title: string; createdAt: string;
  manualMode: boolean; assignedAgent: string | null;
  messageCount: number; user: ConvUser; lastMessage: LastMsg;
};
type Message = { id: number; role: string; content: string; createdAt: string };

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw, role: "agent", username: name }),
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
          <div className="text-4xl mb-2">👤</div>
          <h1 className="text-xl font-bold text-white">Agent Login</h1>
          <p className="text-neutral-500 text-sm mt-1">Přihlášení pro operátory</p>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Tvoje jméno"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-colors" />
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()}
          placeholder="Heslo agenta"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-colors" />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button onClick={login} disabled={loading || !pw.trim() || !name.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
          {loading ? "..." : "Přihlásit se"}
        </button>
      </motion.div>
    </div>
  );
}

export default function AgentDashboard() {
  const [, setLocation] = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [agentName, setAgentName] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.role === "agent" || d.role === "owner") { setAuthed(true); setAgentName(d.username); }
      else setAuthed(false);
    });
  }, []);

  const { data: conversations = [] } = useQuery<AgentConv[]>({
    queryKey: ["/api/agent/conversations"],
    enabled: authed === true,
    refetchInterval: 10000,
    queryFn: () => fetch("/api/agent/conversations").then(r => r.json()),
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/agent/conversations", selectedId, "messages"],
    enabled: authed === true && selectedId !== null,
    refetchInterval: 4000,
    queryFn: () => fetch(`/api/agent/conversations/${selectedId}/messages`).then(r => r.json()),
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const takeoverMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/agent/conversations/${id}/takeover`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agent/conversations"] }); },
  });

  const releaseMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/agent/conversations/${id}/release`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/agent/conversations"] }); },
  });

  const replyMut = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      fetch(`/api/agent/conversations/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }).then(r => r.json()),
    onSuccess: () => {
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["/api/agent/conversations", selectedId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/agent/conversations"] });
    },
  });

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthed(false);
  };

  if (authed === null) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center"><div className="text-neutral-600">Načítám...</div></div>;
  if (authed === false) return <LoginForm onSuccess={() => { setAuthed(true); window.location.reload(); }} />;

  const selectedConv = conversations.find(c => c.id === selectedId);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
            {agentName[0]?.toUpperCase() || "A"}
          </div>
          <div>
            <h1 className="font-bold leading-none text-sm">Agent: {agentName}</h1>
            <p className="text-neutral-500 text-xs">{conversations.length} konverzací</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-600 bg-neutral-800 px-3 py-1 rounded-full">
            {conversations.filter(c => c.manualMode && c.assignedAgent === agentName).length} převzato
          </span>
          <button onClick={logout} className="text-neutral-500 hover:text-white text-xs transition-colors">Odhlásit</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list */}
        <div className={`w-full md:w-80 border-r border-neutral-800 flex flex-col overflow-hidden ${selectedId !== null ? "hidden md:flex" : "flex"}`}>
          <div className="px-4 py-2 border-b border-neutral-800">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Aktivní konverzace</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map(conv => (
              <button key={conv.id} onClick={() => setSelectedId(conv.id)}
                className={`w-full text-left px-4 py-3 border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-colors ${selectedId === conv.id ? "bg-neutral-800" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-semibold text-sm truncate">{conv.user?.name || `#${conv.userId}`}</span>
                    {conv.user?.platform && conv.user.platform !== "direct" && (
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        conv.user.platform === "instagram" ? "bg-pink-500/20 text-pink-400" :
                        conv.user.platform === "telegram" ? "bg-blue-500/20 text-blue-400" :
                        conv.user.platform === "facebook" ? "bg-indigo-500/20 text-indigo-400" :
                        conv.user.platform === "onlyfans" ? "bg-cyan-500/20 text-cyan-400" :
                        conv.user.platform === "fansly" ? "bg-violet-500/20 text-violet-400" :
                        conv.user.platform === "twitter" ? "bg-sky-500/20 text-sky-400" :
                        "bg-neutral-700 text-neutral-400"
                      }`} data-testid={`platform-badge-${conv.id}`}>{conv.user.platform.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {conv.manualMode && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full px-1.5 py-0.5 font-bold">
                        MANUAL
                      </span>
                    )}
                    <span className="text-xs text-neutral-600">
                      {conv.lastMessage ? formatDistanceToNow(new Date(conv.lastMessage.createdAt), { locale: cs, addSuffix: true }) : ""}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-neutral-500 truncate">
                  {conv.lastMessage ? (conv.lastMessage.role === "user" ? "👤 " : "🍒 ") + conv.lastMessage.content : "Prázdná"}
                </p>
              </button>
            ))}
            {conversations.length === 0 && <div className="text-center text-neutral-600 py-12 text-sm">Žádné konverzace</div>}
          </div>
        </div>

        {/* Chat panel */}
        <div className={`flex-1 flex flex-col overflow-hidden ${selectedId === null ? "hidden md:flex" : "flex"}`}>
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">Vyber konverzaci</div>
          ) : (
            <>
              {/* Chat header */}
              <div className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between bg-neutral-900/50">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedId(null)} className="md:hidden text-neutral-500 hover:text-white mr-1 text-lg">←</button>
                  <div className="w-9 h-9 rounded-full bg-pink-600/20 border border-pink-500/30 flex items-center justify-center font-bold text-pink-400">
                    {selectedConv.user?.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm">{selectedConv.user?.name || `User #${selectedConv.userId}`}</p>
                      {selectedConv.user?.platform && selectedConv.user.platform !== "direct" && (
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                          selectedConv.user.platform === "instagram" ? "bg-pink-500/20 text-pink-400" :
                          selectedConv.user.platform === "telegram" ? "bg-blue-500/20 text-blue-400" :
                          selectedConv.user.platform === "onlyfans" ? "bg-cyan-500/20 text-cyan-400" :
                          "bg-neutral-700 text-neutral-400"
                        }`}>{selectedConv.user.platform}</span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500">{selectedConv.messageCount} zpráv</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedConv.manualMode ? (
                    <button onClick={() => releaseMut.mutate(selectedConv.id)}
                      disabled={releaseMut.isPending}
                      className="text-xs bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                      🤖 Vrátit AI
                    </button>
                  ) : (
                    <button onClick={() => takeoverMut.mutate(selectedConv.id)}
                      disabled={takeoverMut.isPending}
                      className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors font-bold">
                      ✋ Převzít
                    </button>
                  )}
                </div>
              </div>

              {/* Status banner */}
              {selectedConv.manualMode && (
                <div className="bg-blue-600/10 border-b border-blue-500/20 px-4 py-2 text-center">
                  <p className="text-xs text-blue-400 font-medium">
                    ✋ Manuální režim aktivní — AI je pozastavena · operátor: {selectedConv.assignedAgent}
                  </p>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                <AnimatePresence initial={false}>
                  {messages.map(msg => (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === "user" ? "bg-neutral-800 text-white rounded-tl-sm" : "bg-pink-600/90 text-white rounded-tr-sm"}`}>
                        <p className="leading-relaxed break-words">{msg.content}</p>
                        <p className="text-[10px] mt-1 opacity-40 text-right">
                          {msg.role === "assistant" ? "🍒" : "👤"} · {formatDistanceToNow(new Date(msg.createdAt), { locale: cs, addSuffix: true })}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input — only in manual mode */}
              {selectedConv.manualMode ? (
                <div className="border-t border-neutral-800 p-4 bg-neutral-900/50">
                  <p className="text-xs text-blue-400 mb-2 font-medium">✍️ Píšeš jako Ninna_Ray🍒</p>
                  <div className="flex gap-2">
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (replyText.trim()) replyMut.mutate({ id: selectedConv.id, content: replyText.trim() }); }}}
                      placeholder="Napiš zprávu za Ninnu..." rows={2}
                      className="flex-1 bg-neutral-800 border border-blue-500/30 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 resize-none transition-colors placeholder:text-neutral-600" />
                    <button onClick={() => replyText.trim() && replyMut.mutate({ id: selectedConv.id, content: replyText.trim() })}
                      disabled={!replyText.trim() || replyMut.isPending}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl px-4 font-bold text-sm transition-colors">
                      {replyMut.isPending ? "..." : "Odeslat"}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-700 mt-1">Enter = odeslat · Shift+Enter = nový řádek</p>
                </div>
              ) : (
                <div className="border-t border-neutral-800 p-4 bg-neutral-900/30 text-center">
                  <p className="text-xs text-neutral-600">AI automaticky odpovídá · klikni <strong className="text-neutral-400">Převzít</strong> pro ruční odpovědi</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
