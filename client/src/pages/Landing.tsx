import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

import ninnaPhoto from "@assets/IMG_4700_1768775323977.jpeg";

export default function Landing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [lang, setLang] = useState<"cs" | "en">("cs");

  // Redirect if already logged in
  useEffect(() => {
    const savedUser = localStorage.getItem("ninna_user");
    if (savedUser) {
      setLocation("/chat");
    }
  }, [setLocation]);

  const createUser = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/users", { name });
      return res.json();
    },
    onSuccess: (user) => {
      localStorage.setItem("ninna_user", JSON.stringify(user));
      setLocation("/chat");
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: lang === "cs" ? "Chyba" : "Error",
        description: lang === "cs" ? "Nepodařilo se připojit." : "Failed to connect.",
      });
    },
  });

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,#db277733,transparent)] pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="border-pink-500/20 bg-black/40 backdrop-blur-2xl shadow-2xl overflow-hidden rounded-3xl">
          <div className="relative h-[450px] overflow-hidden">
            <img 
              src={ninnaPhoto} 
              alt="Ninna Ray"
              className="w-full h-full object-contain bg-black"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent pointer-events-none" />
            <div className="absolute bottom-6 left-6">
              <h1 className="text-4xl font-bold text-white tracking-tight">Ninna_Ray🍒</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <p className="text-pink-400 text-sm font-medium uppercase tracking-wider">
                  {lang === "cs" ? "Nyní online" : "Online now"}
                </p>
              </div>
            </div>
          </div>

          <CardContent className="pt-8 pb-10 px-8 space-y-6">
            <div className="flex justify-center gap-3">
              <button 
                onClick={() => setLang("cs")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${lang === "cs" ? "bg-pink-600 text-white shadow-lg shadow-pink-600/20" : "bg-white/5 text-neutral-400 hover:bg-white/10"}`}
              >
                CZECH
              </button>
              <button 
                onClick={() => setLang("en")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${lang === "en" ? "bg-pink-600 text-white shadow-lg shadow-pink-600/20" : "bg-white/5 text-neutral-400 hover:bg-white/10"}`}
              >
                ENGLISH
              </button>
            </div>
            
            <div className="space-y-3">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest ml-1">
                {lang === "cs" ? "Tvé jméno" : "Your name"}
              </label>
              <Input
                placeholder={lang === "cs" ? "Jak ti mám říkat?" : "How should I call you?"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-14 bg-white/5 border-white/10 text-white rounded-2xl focus:border-pink-500/50 focus:ring-pink-500/20 transition-all text-lg px-6 placeholder:text-neutral-600"
              />
            </div>

            <Button
              className="w-full bg-pink-600 hover:bg-pink-500 text-white font-bold h-14 rounded-2xl text-lg shadow-xl shadow-pink-900/20 transition-all active:scale-[0.98] border-none"
              onClick={() => name.trim() && createUser.mutate(name)}
              disabled={!name.trim() || createUser.isPending}
            >
              {lang === "cs" ? "Vstoupit do chatu" : "Enter Private Chat"}
            </Button>

            <p className="text-center text-[10px] text-neutral-600 uppercase tracking-widest font-medium">
              {lang === "cs" ? "Vstupem potvrzuješ věk 18+" : "Must be 18+ to enter"}
            </p>

            <div className="flex justify-center gap-4 pt-2">
              <a href="/agent" className="text-[10px] text-neutral-700 hover:text-neutral-500 transition-colors uppercase tracking-widest">
                Agent Login
              </a>
              <span className="text-neutral-800 text-[10px]">·</span>
              <a href="/manager" className="text-[10px] text-neutral-700 hover:text-neutral-500 transition-colors uppercase tracking-widest">
                Manager
              </a>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
