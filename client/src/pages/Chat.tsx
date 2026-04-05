import { useEffect, useRef, useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { ChatBubble } from "@/components/ChatBubble";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, LogOut, ChevronLeft, Crown, Mic, Loader2, Wand2, Bot } from "lucide-react";
import { useVoice } from "@/hooks/use-voice";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import ninnaPhoto from "@assets/IMG_4700_1768775323977.jpeg";

export default function Chat() {
  const [user, setUser] = useState<any>(null);
  const [, setLocation] = useLocation();

  const { data: botStatus } = useQuery<{ isSubscribed: boolean; botEnabled: boolean; unlockedCount: number }>({
    queryKey: ["/api/bot/status"],
    enabled: !!user?.id,
    retry: false,
  });
  const { messages, sendMessage, isTyping, initConversation, activeConversationId, connectionError, clearError } = useChat({ userId: user?.id });
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { isRecording, isTranscribing, startRecording, stopRecording } = useVoice({
    onTranscription: (text) => {
      sendMessage(text);
    },
  });

  useEffect(() => {
    const savedUser = localStorage.getItem("ninna_user");
    if (!savedUser) {
      setLocation("/");
    } else {
      setUser(JSON.parse(savedUser));
    }
  }, [setLocation]);

  useEffect(() => {
    if (user?.id && !activeConversationId) {
      initConversation();
    }
  }, [user, initConversation, activeConversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    sendMessage(inputValue);
    setInputValue("");
    // Optimistic update for local message count if we want, but backend handles it
  };

  const handleLogout = () => {
    localStorage.removeItem("ninna_user");
    setLocation("/");
  };

  if (!user) return null;

  // Jestli user nemá předplatné, přesměruj na payment
  if (botStatus && !botStatus.isSubscribed) {
    return (
      <div className="flex flex-col h-screen bg-neutral-950 relative max-w-md mx-auto shadow-2xl overflow-hidden items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">🔐 Zamčeno</h1>
            <p className="text-neutral-400">Chat s Ninnou je dostupný pouze pro předplacené členy</p>
          </div>
          <Button
            onClick={() => setLocation("/payment")}
            className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold px-8 py-6 text-lg rounded-xl"
            data-testid="button-subscribe"
          >
            💜 Koupit Předplatné
          </Button>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="text-neutral-400 hover:text-white"
            data-testid="button-logout"
          >
            Odhlásit se
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-950 relative max-w-md mx-auto shadow-2xl overflow-hidden">
      <header className="flex items-center justify-between px-4 py-4 z-20 bg-black/60 backdrop-blur-xl border-b border-white/5 sticky top-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-neutral-400 -ml-2" onClick={handleLogout}>
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-pink-500/50 p-0.5">
               <img 
                 src={ninnaPhoto} 
                 alt="Ninna Ray" 
                 className="w-full h-full rounded-full object-cover"
               />
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black animate-pulse" />
          </div>
          <div>
            <h2 className="font-bold text-white leading-none">Ninna_Ray🍒</h2>
            <span className="text-[10px] text-pink-500 font-bold uppercase tracking-wider">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {botStatus?.isSubscribed ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-pink-400 hover:text-pink-300 relative"
              onClick={() => setLocation("/bot")}
              data-testid="button-ebot"
              title="Ninna E-Bot"
            >
              <Bot className="w-5 h-5" />
              {(botStatus?.unlockedCount ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-pink-500 rounded-full" />
              )}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="text-neutral-600 hover:text-neutral-400"
              onClick={() => setLocation("/payment")}
              data-testid="button-ebot-locked"
              title="E-Bot — vyžaduje předplatné"
            >
              <Bot className="w-5 h-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-amber-400 hover:text-amber-300"
            onClick={() => setLocation("/payment")}
            data-testid="button-vip"
            title="VIP & Předplatné"
          >
            <Crown className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-white" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <div className="text-center pb-4">
          <span className="px-3 py-1 rounded-full bg-white/5 text-[10px] text-neutral-500 font-bold uppercase tracking-widest border border-white/5">
            End-to-end encrypted
          </span>
        </div>

        <AvatarDisplay userId={user?.id} compact={false} />
        
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <ChatBubble 
              key={msg.id} 
              role={msg.role} 
              content={msg.content} 
              isTyping={msg.isTyping} 
              isSeen={msg.isSeen}
            />
          ))}
        </AnimatePresence>

        {isTyping && !messages.find(m => m.isTyping) && (
          <ChatBubble role="assistant" content="" isTyping={true} />
        )}

        {connectionError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-500/15 border border-red-500/30 rounded-2xl px-4 py-3 text-sm text-red-300"
            data-testid="text-connection-error"
          >
            <span className="text-base">⚠️</span>
            <span className="flex-1">{connectionError}</span>
            <button onClick={clearError} className="text-red-400 hover:text-red-200 transition-colors text-xs font-bold ml-2">✕</button>
          </motion.div>
        )}
        
        <div ref={scrollRef} className="h-4" />
      </main>

      <footer className="p-4 bg-black/60 backdrop-blur-xl border-t border-white/5 z-20">
        <form onSubmit={handleSend} className="flex items-center gap-2">
           <Button
             type="button"
             size="icon"
             data-testid="button-voice-record"
             disabled={isTranscribing}
             onPointerDown={(e) => {
               e.preventDefault();
               if (!isRecording && !isTranscribing) startRecording();
             }}
             onPointerUp={(e) => {
               e.preventDefault();
               if (isRecording) stopRecording();
             }}
             onPointerLeave={() => {
               if (isRecording) stopRecording();
             }}
             className={`flex-shrink-0 rounded-xl transition-all ${
               isRecording
                 ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
                 : isTranscribing
                   ? "bg-white/10 text-neutral-400"
                   : "bg-white/5 text-neutral-400 border border-white/10"
             }`}
           >
             {isTranscribing ? (
               <Loader2 className="w-5 h-5 animate-spin" />
             ) : (
               <Mic className="w-5 h-5" />
             )}
           </Button>
           <div className="flex-1 relative">
             <Input
               value={inputValue}
               onChange={(e) => setInputValue(e.target.value)}
               placeholder={isRecording ? "Recording..." : isTranscribing ? "Transcribing..." : "Write something sexy..."}
               disabled={isRecording || isTranscribing}
               className="h-12 rounded-2xl bg-white/5 border-white/10 text-white focus:border-pink-500/50 focus:ring-pink-500/20 px-4 transition-all"
               data-testid="input-chat-message"
             />
             <Button 
               type="submit" 
               size="icon"
               disabled={!inputValue.trim()}
               data-testid="button-send-message"
               className="absolute right-1 top-1 h-10 w-10 rounded-xl bg-pink-600 text-white disabled:opacity-30 transition-all shadow-lg shadow-pink-600/20"
             >
               <Send className="w-4 h-4" />
             </Button>
           </div>
        </form>
        <p className="text-[10px] text-neutral-600 text-center mt-3 uppercase tracking-widest font-bold">
          {isRecording ? "Hold to record, release to send" : "Message count tracked for loyalty rewards"}
        </p>
      </footer>
    </div>
  );
}
