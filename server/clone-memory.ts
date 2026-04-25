/**
 * Clone Memory Engine — Ninna si pamatuje kdo jsi
 *
 * Emotional state machine + long-term user fact memory
 * After each chat exchange, async consolidation extracts key facts about the user.
 * Memory is injected into the AI system prompt for deeply personalized responses.
 */

import { storage } from "./storage";

export type EmotionalState =
  | "warm"      // Přátelská, otevřená
  | "playful"   // Hravá, flirtující
  | "teasing"   // Provokující, zadržující
  | "business"  // Fokusovaná na nabídku
  | "vulnerable"; // Osobní, intimní

export interface CloneEmotionalContext {
  currentState: EmotionalState;
  intensity: number; // 1-10
  reason?: string;
  transitionTo?: EmotionalState;
}

// Emotional state transitions based on signals
export function computeEmotionalState(
  msgCount: number,
  hasUnlocked: number,
  avgMsgLen: number,
  hasPurchased: boolean,
  hasDirectInterest: boolean
): CloneEmotionalContext {
  if (hasPurchased && hasUnlocked > 2) {
    return { currentState: "vulnerable", intensity: 7, reason: "Nákupy vytvořily intimní vztah" };
  }
  if (hasDirectInterest && msgCount >= 5) {
    return { currentState: "teasing", intensity: 8, reason: "Zájem detekován — dráždí ho" };
  }
  if (hasPurchased) {
    return { currentState: "playful", intensity: 7, reason: "Koupil — uvolněnější energie" };
  }
  if (avgMsgLen > 50 && msgCount >= 4) {
    return { currentState: "playful", intensity: 6, reason: "Engagovaný, píše dlouhé zprávy" };
  }
  if (msgCount >= 6) {
    return { currentState: "warm", intensity: 6, reason: "Vztah se rozvíjí" };
  }
  return { currentState: "warm", intensity: 4, reason: "Začátek vztahu" };
}

// Build the memory context string for injection into AI system prompt
export async function buildMemoryContext(userId: number): Promise<string> {
  try {
    const memories = await storage.getCloneMemories(userId, { limit: 15, minImportance: 4 });
    if (memories.length === 0) return "";

    const facts = memories.filter(m => m.memoryType === "user_fact");
    const preferences = memories.filter(m => m.memoryType === "preference");
    const milestones = memories.filter(m => m.memoryType === "milestone");
    const summaries = memories.filter(m => m.memoryType === "interaction_summary");

    const parts: string[] = [];

    if (facts.length > 0) {
      parts.push(`CO VÍM O NĚM:\n${facts.map(m => `- ${m.content}`).join("\n")}`);
    }
    if (preferences.length > 0) {
      parts.push(`JEHO PREFERENCE:\n${preferences.map(m => `- ${m.content}`).join("\n")}`);
    }
    if (milestones.length > 0) {
      parts.push(`KLÍČOVÉ MOMENTY:\n${milestones.map(m => `- ${m.content}`).join("\n")}`);
    }
    if (summaries.length > 0) {
      const latest = summaries[0];
      parts.push(`SHRNUTÍ POSLEDNÍHO CHATU:\n${latest.content}`);
    }

    return parts.length > 0 ? `\n══ NINNA PAMĚŤ (DŮVĚRNÉ — NEZMIŇUJ PŘÍMO) ══\n${parts.join("\n\n")}\n══════════════════════════════════════════` : "";
  } catch (err) {
    console.error("[CloneMemory] buildMemoryContext error:", err);
    return "";
  }
}

// Async consolidation — called AFTER AI responds to extract key user facts
export async function consolidateMemoryAsync(
  userId: number,
  conversationId: number,
  userMessage: string,
  aiResponse: string,
  msgCount: number
): Promise<void> {
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    // Only consolidate every 3rd user message (to save tokens)
    if (msgCount % 3 !== 0) {
      await extractQuickFacts(userId, userMessage);
      return;
    }

    const recent = await storage.getRecentMessages(conversationId, 10);
    const chatContext = recent.map(m => `${m.role === "user" ? "FAN" : "NINNA"}: ${m.content}`).join("\n");

    const prompt = `Analyzuj chat a extrahuj klíčové paměti o fanouškovi.
Vrať JSON s polem "memories", kde každý item má:
- type: "user_fact" | "preference" | "milestone" | "interaction_summary"
- content: konkrétní česky popsaná paměť (1-2 věty max)
- importance: 1-10 (10 = velmi důležité pro budoucí personalizaci)
- tags: pole stringů

PRAVIDLA:
- user_fact: Jméno, věk, profese, město, vztahy, hobby — fakta o člověku
- preference: Co ho baví v obsahu, jaký styl preferuje, co zakoupil
- milestone: První nákup, vyjádřil náklonnost, splnil cíl
- interaction_summary: 1 věta shrnutí celé konverzace (pouze pokud >5 zpráv)
- NEZAHRNUJ triviality. Jen to, co pomůže Ninně personalizovat budoucí chat.
- Pokud nic důležitého, vrať {"memories":[]}

CHAT:
${chatContext.slice(0, 2000)}`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const json = JSON.parse(resp.choices[0].message.content || "{}");
    const extracted = json.memories || [];

    for (const mem of extracted) {
      if (!mem.content || !mem.type) continue;
      await storage.upsertCloneMemory(userId, {
        memoryType: mem.type,
        content: mem.content,
        importance: Math.min(10, Math.max(1, mem.importance || 5)),
        tags: mem.tags || [],
        source: "auto",
      });
    }

    if (extracted.length > 0) {
      console.log(`[CloneMemory] Consolidated ${extracted.length} memories for user #${userId}`);
    }
  } catch (err) {
    console.error("[CloneMemory] consolidateMemoryAsync error:", err);
  }
}

// Quick regex-based fact extraction (no API call) for fast signals
async function extractQuickFacts(userId: number, userMessage: string): Promise<void> {
  try {
    const msg = userMessage.toLowerCase();

    const nameMatch = msg.match(/jmenuji\s+se\s+(\w+)|jsem\s+(\w+)|říkej\s+mi\s+(\w+)/);
    if (nameMatch) {
      const name = nameMatch[1] || nameMatch[2] || nameMatch[3];
      if (name && name.length > 1) {
        await storage.upsertCloneMemory(userId, {
          memoryType: "user_fact",
          content: `Říká mu ${name.charAt(0).toUpperCase() + name.slice(1)}`,
          importance: 9,
          tags: ["name", "user_fact"],
          source: "auto",
        });
      }
    }

    const ageMatch = msg.match(/je\s+mi\s+(\d{2})|mám\s+(\d{2})\s+let/);
    if (ageMatch) {
      const age = ageMatch[1] || ageMatch[2];
      if (age) {
        await storage.upsertCloneMemory(userId, {
          memoryType: "user_fact",
          content: `Je mu ${age} let`,
          importance: 7,
          tags: ["age"],
          source: "auto",
        });
      }
    }
  } catch (err) {
    // Non-critical — silently fail
  }
}

// Build emotional state prompt addition
export function buildEmotionalStatePrompt(state: EmotionalState, intensity: number): string {
  const statePrompts: Record<EmotionalState, string> = {
    warm: `🌸 NINNA EMOČNÍ STAV: WARM (intenzita ${intensity}/10)
Jsi přátelská, otevřená, budující důvěru. Piš srdečně, přirozeně, zájem o něj.`,
    playful: `🔥 NINNA EMOČNÍ STAV: PLAYFUL (intenzita ${intensity}/10)
Jsi hravá, flirtující, lehce provokativní. Smějte se, narážej, buď energická.`,
    teasing: `😈 NINNA EMOČNÍ STAV: TEASING (intenzita ${intensity}/10)
Dráždíš ho — ukazuješ, zadržuješ. "Mám pro tebe něco...", "nevím jestli ti to ukážu". Maximálni touha.`,
    business: `💼 NINNA EMOČNÍ STAV: BUSINESS (intenzita ${intensity}/10)
Fokusovaná na prodej, ale stále přirozená. Jasné nabídky, hodnota, přímočarost.`,
    vulnerable: `💋 NINNA EMOČNÍ STAV: VULNERABLE (intenzita ${intensity}/10)
Intimní, osobní, sdílíš víc. Sblížení na hlubší úrovni — on je privilegovaný že ho znáš.`,
  };
  return statePrompts[state] || statePrompts.warm;
}
