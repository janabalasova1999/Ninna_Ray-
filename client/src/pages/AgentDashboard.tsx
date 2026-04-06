import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Save, LogOut, Sparkles, Shirt, Zap, Heart } from "lucide-react";

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw, role: "owner" }),
    });
    const data = await res.json();
    if (res.ok) onSuccess();
    else { setError(data.message || "Špatné heslo"); setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900/20 to-black flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-neutral-900 border border-pink-500/30 rounded-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="text-5xl mb-2">👑</div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">Ninna Master</h1>
          <p className="text-neutral-400 text-sm mt-1">Správa hlavní verze Niny</p>
        </div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()}
          placeholder="Ownérské heslo"
          className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 outline-none focus:border-pink-500 transition-colors" />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button onClick={login} disabled={loading || !pw.trim()}
          className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors">
          {loading ? "..." : "Přihlásit se"}
        </button>
      </motion.div>
    </div>
  );
}

interface NinaMasterProfile {
  id: number;
  name: string;
  personality: string[];
  outfit: string;
  hair: string;
  expression: string;
  specialty: string;
  greeting: string;
}

export default function NinnaMasterDashboard() {
  const [, setLocation] = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [masterProfile, setMasterProfile] = useState<NinaMasterProfile>({
    id: 1,
    name: "Ninna Ray 🍒",
    personality: ["playful", "flirty", "intelligent"],
    outfit: "Checkered top",
    hair: "White/Platinum blonde",
    expression: "teasing",
    specialty: "Virtual companionship & content creation",
    greeting: "Ahoj miláčku! Jsem tvoje osobní Ninna. Co tě dnes baví? 😏"
  });

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.role === "owner") { setAuthed(true); }
      else setAuthed(false);
    });
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (data: NinaMasterProfile) => {
      const res = await fetch("/api/owner/ninna-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Nepodařilo se uložit");
      return res.json();
    },
  });

  const handleSave = () => {
    saveMutation.mutate(masterProfile);
  };

  const handleLogout = () => {
    fetch("/api/auth/logout").then(() => setLocation("/"));
  };

  if (authed === null) return null;
  if (authed === false) return <LoginForm onSuccess={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900/20 via-neutral-950 to-black max-w-md mx-auto shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-black/60 backdrop-blur-xl border-b border-pink-500/20 p-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
              👑 Ninna Master
            </h1>
            <p className="text-xs text-pink-300/70">Spravuj svou hlavní verzi</p>
          </div>
          <button onClick={handleLogout} className="text-neutral-400 hover:text-white transition-colors p-2">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6 overflow-y-auto pb-32">
        
        {/* Master Ninna Preview */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-b from-purple-900/30 to-pink-900/20 border border-pink-500/20 rounded-2xl p-6 text-center"
        >
          <div className="text-6xl mb-2">🍒</div>
          <h2 className="text-2xl font-bold text-white mb-1">{masterProfile.name}</h2>
          <p className="text-pink-300/70 text-sm mb-4">{masterProfile.specialty}</p>
          <div className="bg-black/40 border border-pink-500/10 rounded-xl p-4">
            <p className="text-white/80 italic">"{masterProfile.greeting}"</p>
          </div>
        </motion.div>

        {/* Profile Editor */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-pink-400" />
            Metadata
          </h3>

          {/* Name */}
          <div>
            <label className="text-xs font-bold text-pink-300/70 uppercase">Jméno</label>
            <input
              value={masterProfile.name}
              onChange={e => setMasterProfile({ ...masterProfile, name: e.target.value })}
              className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-2 outline-none focus:border-pink-500 transition-colors text-sm mt-1"
            />
          </div>

          {/* Personality Tags */}
          <div>
            <label className="text-xs font-bold text-pink-300/70 uppercase">Osobnost</label>
            <input
              value={masterProfile.personality.join(", ")}
              onChange={e => setMasterProfile({ ...masterProfile, personality: e.target.value.split(",").map(s => s.trim()) })}
              placeholder="playful, flirty, intelligent, ..."
              className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-2 outline-none focus:border-pink-500 transition-colors text-sm mt-1"
            />
          </div>

          {/* Outfit */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-pink-300/70 uppercase flex items-center gap-1">
                <Shirt className="w-3 h-3" /> Outfit
              </label>
              <input
                value={masterProfile.outfit}
                onChange={e => setMasterProfile({ ...masterProfile, outfit: e.target.value })}
                className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-2 outline-none focus:border-pink-500 transition-colors text-sm mt-1"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-pink-300/70 uppercase">Vlasy</label>
              <input
                value={masterProfile.hair}
                onChange={e => setMasterProfile({ ...masterProfile, hair: e.target.value })}
                className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-2 outline-none focus:border-pink-500 transition-colors text-sm mt-1"
              />
            </div>
          </div>

          {/* Expression */}
          <div>
            <label className="text-xs font-bold text-pink-300/70 uppercase flex items-center gap-1">
              <Heart className="w-3 h-3" /> Základní výraz
            </label>
            <select
              value={masterProfile.expression}
              onChange={e => setMasterProfile({ ...masterProfile, expression: e.target.value })}
              className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-2 outline-none focus:border-pink-500 transition-colors text-sm mt-1"
            >
              <option>neutral</option>
              <option>happy</option>
              <option>teasing</option>
              <option>flirty</option>
            </select>
          </div>

          {/* Greeting */}
          <div>
            <label className="text-xs font-bold text-pink-300/70 uppercase">Úvodní zpráva</label>
            <textarea
              value={masterProfile.greeting}
              onChange={e => setMasterProfile({ ...masterProfile, greeting: e.target.value })}
              rows={3}
              className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-2 outline-none focus:border-pink-500 transition-colors text-sm mt-1 resize-none"
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 mt-4"
          >
            <Save className="w-5 h-5" />
            {saveMutation.isPending ? "Ukládám..." : "Uložit Master profil"}
          </button>

          {saveMutation.isSuccess && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-green-500/20 border border-green-500/50 text-green-300 text-sm p-3 rounded-xl text-center"
            >
              ✅ Master profil uložen! Všichni s předplatným budou mít tuto verzi.
            </motion.div>
          )}
        </motion.div>

        {/* Info Box */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-2"
        >
          <div className="flex items-start gap-2 text-xs text-blue-300">
            <Zap className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Jak to funguje:</p>
              <p className="mt-1 text-blue-300/70">
                Zde upravuješ "Master" verzi Niny. Když si uživatel zaplatí předplatné, dostane kopii této verze. Svou kopii si pak může individuálně přizpůsobit.
              </p>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
