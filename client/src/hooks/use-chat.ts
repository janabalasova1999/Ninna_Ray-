import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Message {
  id: string; // Temporary ID for UI or DB ID
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
  isSeen?: boolean;
}

interface UseChatProps {
  userId: number | null;
}

export function useChat({ userId }: UseChatProps) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  // Store the active conversation ID
  const conversationIdRef = useRef<number | null>(null);

  // 1. Get or Create Conversation
  // We'll just use a single conversation for simplicity in this MVP
  const initConversation = useCallback(async () => {
    if (!userId) return;

    // Check if we have one already stored or fetch latest
    try {
      const res = await fetch(`/api/conversations?userId=${userId}`);
      if (!res.ok) throw new Error("Failed to fetch conversations");
      const convs = await res.json();
      
      if (convs.length > 0) {
        conversationIdRef.current = convs[0].id;
        setActiveConversationId(convs[0].id);
        // Fetch history
        const histRes = await fetch(`/api/conversations/${convs[0].id}`);
        if (histRes.ok) {
           const data = await histRes.json();
           setMessages(data.messages.map((m: any) => ({
             id: m.id.toString(),
             role: m.role,
             content: m.content
           })));
        }
      } else {
        // Create new
        const createRes = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, title: "Chat with Lexi" }),
        });
        if (createRes.ok) {
          const newConv = await createRes.json();
          conversationIdRef.current = newConv.id;
          setActiveConversationId(newConv.id);
          // Add welcome message from AI locally
          setMessages([{
            id: "welcome",
            role: "assistant",
            content: "Hey babe... I've been waiting for you. What kept you? 😉"
          }]);
        }
      }
    } catch (err) {
      console.error("Setup failed", err);
    }
  }, [userId]);

  // 2. Send Message & Stream Response
  const sendMessage = async (content: string) => {
    if (!conversationIdRef.current || !content.trim()) return;

    // Optimistic UI update
    const tempId = Date.now().toString();
    setMessages(prev => [...prev, { id: tempId, role: "user", content }]);
    // We don't set setIsTyping(true) immediately here anymore
    // It will be set after the random initial delay from the server

    setConnectionError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationIdRef.current}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) throw new Error("Chyba serveru " + res.status);

      // Handle SSE Stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Chyba připojení");

      const decoder = new TextDecoder();
      let aiResponseText = "";
      let hasStartedTyping = false;
      
      // Add placeholder for AI message
      const aiMsgId = (Date.now() + 1).toString();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
              const lines = chunk.split("\n\n");
              
              for (const line of lines) {
                if (line.trim().startsWith("data: ")) {
                  try {
                    const dataStr = line.trim().slice(6);
                    if (!dataStr) continue;
                    const data = JSON.parse(dataStr);
              
              if (data.isSeen) {
                setMessages(prev => {
                  const lastUserMsgIndex = [...prev].reverse().findIndex(m => m.role === "user");
                  if (lastUserMsgIndex !== -1) {
                    const actualIndex = prev.length - 1 - lastUserMsgIndex;
                    return prev.map((msg, i) => i === actualIndex ? { ...msg, isSeen: true } : msg);
                  }
                  return prev;
                });
                continue;
              }

              if (data.isTyping) {
                setIsTyping(true);
                continue;
              }

              if (data.content) {
                if (!hasStartedTyping) {
                  setMessages(prev => [...prev, { id: aiMsgId, role: "assistant", content: "", isTyping: true }]);
                  setIsTyping(false);
                  hasStartedTyping = true;
                }
                aiResponseText += data.content;
                setMessages(prev => prev.map(msg => 
                  msg.id === aiMsgId 
                    ? { ...msg, content: aiResponseText, isTyping: false } 
                    : msg
                ));
              }
            } catch (e) {
              console.error("Parse error", e);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Message failed", err);
      setIsTyping(false);
      setConnectionError(err?.message || "Chyba připojení — zkus to znovu");
    }
  };

  const clearError = () => setConnectionError(null);

  return {
    messages,
    sendMessage,
    isTyping,
    initConversation,
    activeConversationId,
    connectionError,
    clearError,
  };
}
