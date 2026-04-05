import { storage } from "./storage";
import OpenAI from "openai";
import { getMarketContext, getPricingForUser, getMarketIntelligence } from "./market-intelligence";
import { computeEngagementScore, classifyByScore, type EngagementScoreResult } from "./analytics-engine";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

let isRunning = false;
let enginePaused = true;
let lastFullScan = 0;
const SCAN_INTERVAL = 10 * 60 * 1000;
const DELAYED_QUEUE: { actionId: number; userId: number; message: string; photoId?: number; price?: number; executeAt: number }[] = [];
const logs: { time: string; event: string; detail: string }[] = [];

const messageSendTimes: Record<number, number[]> = {};
const MAX_MESSAGES_PER_HOUR = 3;
const MAX_MESSAGES_PER_DAY = 8;

interface LearningData {
  totalSent: number;
  totalResponded: number;
  responseRate: number;
  bestPurposes: Record<string, { sent: number; responded: number; rate: number }>;
  bestTimings: Record<string, { sent: number; responded: number; rate: number }>;
  avgResponseTime: number;
  lastUpdated: string;
  sellConversionRate: number;
  avgRevenuePerSell: number;
  bestSellingPrice: number;
  directives: string[];
}

let globalLearnings: LearningData = {
  totalSent: 0,
  totalResponded: 0,
  responseRate: 0,
  bestPurposes: {},
  bestTimings: {},
  avgResponseTime: 0,
  lastUpdated: new Date().toISOString(),
  sellConversionRate: 0,
  avgRevenuePerSell: 0,
  bestSellingPrice: 0,
  directives: [],
};

function canSendToUser(userId: number): boolean {
  const now = Date.now();
  if (!messageSendTimes[userId]) messageSendTimes[userId] = [];
  messageSendTimes[userId] = messageSendTimes[userId].filter(t => now - t < 24 * 60 * 60 * 1000);

  const hourAgo = now - 60 * 60 * 1000;
  const msgsLastHour = messageSendTimes[userId].filter(t => t > hourAgo).length;
  const msgsLast24h = messageSendTimes[userId].length;

  if (msgsLastHour >= MAX_MESSAGES_PER_HOUR) return false;
  if (msgsLast24h >= MAX_MESSAGES_PER_DAY) return false;
  return true;
}

function recordSend(userId: number) {
  if (!messageSendTimes[userId]) messageSendTimes[userId] = [];
  messageSendTimes[userId].push(Date.now());
}

function log(event: string, detail: string = "") {
  const entry = { time: new Date().toISOString(), event, detail };
  logs.push(entry);
  if (logs.length > 200) logs.shift();
  console.log(`[AI Manager] ${event}${detail ? ": " + detail : ""}`);
  storage.addManagerLog(event, detail).catch(() => {});
}

export function getManagerStatus() {
  return {
    isRunning,
    isPaused: enginePaused,
    lastFullScan: lastFullScan ? new Date(lastFullScan).toISOString() : null,
    nextScan: lastFullScan ? new Date(lastFullScan + SCAN_INTERVAL).toISOString() : null,
    recentLogs: logs.slice(-50),
    pendingDelayed: DELAYED_QUEUE.length,
    autonomousFeatures: {
      autoCleanup: !enginePaused,
      selfLearning: !enginePaused,
      autoMessaging: !enginePaused,
      duplicateDetection: !enginePaused,
      antiSpam: !enginePaused,
      revenueOptimization: !enginePaused,
      perUserMemory: !enginePaused,
      behavioralScoring: !enginePaused,
      scoreDecay: !enginePaused,
    },
    scoringFormula: "CES = (2×messages) + (4×content_views) + (5×purchases) - (3×days_inactive) × 0.9^weeks_inactive",
    scoreThresholds: { cold: "<25", warm: "25-49", hot: "50-79", monetized: "80+" },
    learnings: globalLearnings,
  };
}

export function setEnginePaused(paused: boolean) {
  enginePaused = paused;
  log(paused ? "engine_paused" : "engine_resumed", paused ? "Owner pozastavil engine" : "Owner obnovil engine");
  if (!paused) {
    setTimeout(() => autoCleanup(), 1000);
    setTimeout(() => executePendingBacklog(), 3000);
    setTimeout(() => selfLearn(), 4000);
    setTimeout(() => runFullScan(), 6000);
  }
}

const MARKET_BENCHMARKS_REF = {
  optimalFirst: { min: 199, max: 349 },
};

async function analyzeUser(userId: number, userName: string): Promise<any | null> {
  try {
    const convs = await storage.getConversationsByUser(userId);
    let allMessages: { role: string; content: string; createdAt: Date }[] = [];
    for (const conv of convs) {
      const msgs = await storage.getMessagesByConversation(conv.id);
      allMessages = allMessages.concat(msgs.map(m => ({ role: m.role, content: m.content, createdAt: m.createdAt })));
    }

    if (allMessages.length === 0) return null;

    const sorted = allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const transcript = sorted
      .slice(-200)
      .map(m => `[${new Date(m.createdAt).toLocaleString("cs-CZ")}] ${m.role === "user" ? userName : "Ninna"}: ${m.content}`)
      .join("\n");

    const vaultItems = await storage.getAllContentItems();
    const photoItems = vaultItems.filter(item => item.mimeType.startsWith("image"));
    const videoItems = vaultItems.filter(item => item.mimeType.startsWith("video"));
    const photoList = [
      `📸 FOTKY (${photoItems.length} ks):`,
      ...photoItems.map(item => `  [ID:${item.id}] "${item.originalName}" (${item.category}${item.tags.length > 0 ? ", tagy: " + item.tags.join(", ") : ""}${item.description ? ", popis: " + item.description : ""})`),
      `🎬 VIDEA (${videoItems.length} ks):`,
      ...videoItems.map(item => `  [ID:${item.id}] "${item.originalName}" (${item.category}${item.tags.length > 0 ? ", tagy: " + item.tags.join(", ") : ""}${item.description ? ", popis: " + item.description : ""})`)
    ].join("\n");

    const user = await storage.getUser(userId);
    const existingProfile = user?.aiProfile as any;
    const previousContext = existingProfile ? `
═══ PŘEDCHOZÍ PROFIL (paměť) ═══
Poslední analýza: ${existingProfile.lastAnalyzed || "nikdy"}
Status: ${existingProfile.status || "neznámý"} | Engagement: ${existingProfile.engagementScore || 0}%
Strategie: ${existingProfile.strategy || "neznámá"}
Osobnost: ${(existingProfile.personality || []).join(", ")}
Zájmy: ${(existingProfile.interests || []).join(", ")}
Emoční spouštěče: ${(existingProfile.emotionalTriggers || []).join(", ")}
Komunikační vzory: ${existingProfile.communicationPatterns ? JSON.stringify(existingProfile.communicationPatterns) : "zatím neznámé"}
Co fungovalo: ${(existingProfile.whatWorks || []).join(", ")}
Co nefungovalo: ${(existingProfile.whatFails || []).join(", ")}
Předchozí driver: ${existingProfile.mainDriver || "žádný"}
Předchozí styleNotes: ${existingProfile.styleNotes || "žádné"}
Cenová citlivost: ${existingProfile.priceSensitivity || "neznámá"}
Preferovaný prodejní styl: ${existingProfile.sellStyle || "neznámý"}

INSTRUKCE: Navazuj na předchozí profil. Aktualizuj ho na základě NOVÝCH dat. Porovnej, co se změnilo od poslední analýzy. Zachovej co funguje, eliminuj co nefunguje.` : "";

    const userPayments = await storage.getPaymentsByUser(userId);
    const completedPayments = userPayments.filter(p => p.status === "completed");
    const failedPayments = userPayments.filter(p => p.status === "failed");
    const totalSpent = completedPayments.reduce((s, p) => s + p.amount, 0) / 100;
    const avgPayment = completedPayments.length > 0 ? Math.round(totalSpent / completedPayments.length) : 0;
    const lastPurchase = completedPayments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const daysSinceLastPurchase = lastPurchase ? Math.round((Date.now() - new Date(lastPurchase.createdAt).getTime()) / (24 * 60 * 60 * 1000)) : -1;

    const purchaseContext = userPayments.length > 0 ? `
═══ PLATEBNÍ HISTORIE ZÁKAZNÍKA ═══
Celkem plateb: ${completedPayments.length} úspěšných, ${failedPayments.length} neúspěšných
Celkem utraceno: ${totalSpent} Kč
Průměrná platba: ${avgPayment} Kč
Poslední nákup: ${lastPurchase ? `${daysSinceLastPurchase} dní zpátky (${lastPurchase.amount / 100} Kč)` : "nikdy"}
Cenový rozsah: ${completedPayments.length > 0 ? `${Math.min(...completedPayments.map(p => p.amount)) / 100}–${Math.max(...completedPayments.map(p => p.amount)) / 100} Kč` : "neznámý"}
` : `
═══ PLATEBNÍ HISTORIE ZÁKAZNÍKA ═══
Zatím žádné nákupy.
`;

    let marketDirectives = "";
    try {
      const intel = await getMarketIntelligence();
      const highPriorityRecs = intel.recommendations.filter(r => r.priority === "high");
      if (highPriorityRecs.length > 0 || intel.trendScore !== 0) {
        marketDirectives = `
═══ TRŽNÍ INTELLIGENCE — PŘÍKAZY K ČINU ═══
Trend skóre: ${intel.trendScore > 0 ? "↑ ROSTOUCÍ" : intel.trendScore < 0 ? "↓ KLESAJÍCÍ — reaguj!" : "→ STABILNÍ"}
Konverze: ${intel.internalMetrics.conversionRate}% | Celkové tržby: ${intel.internalMetrics.totalRevenue} Kč | Transakcí: ${intel.internalMetrics.totalTransactions}
${intel.internalMetrics.bestSellingPriceRange ? `Nejúspěšnější cenový rozsah: ${intel.internalMetrics.bestSellingPriceRange.min}-${intel.internalMetrics.bestSellingPriceRange.max} Kč` : ""}
Segmenty: ${intel.internalMetrics.userSegments.highSpenders} VIP, ${intel.internalMetrics.userSegments.midSpenders} střed, ${intel.internalMetrics.userSegments.lowSpenders} low, ${intel.internalMetrics.userSegments.nonBuyers} nekupujících

STRATEGICKÉ PŘÍKAZY (řiď se jimi):
${intel.recommendations.map(r => `  ${r.priority === "high" ? "⚠️" : "→"} [${r.type}] ${r.title}: ${r.description}`).join("\n")}
`;
      }
    } catch (e) {
      console.error("[AI Manager] market intel error:", e);
    }

    const learningContext = globalLearnings.totalSent > 0 ? `
═══ SELF-LEARNING DATA — ZÁVAZNÉ DIREKTIVY ═══
Response rate: ${globalLearnings.responseRate}% (${globalLearnings.totalResponded}/${globalLearnings.totalSent})
Průměrný čas odpovědi: ${globalLearnings.avgResponseTime} min
Sell konverze: ${globalLearnings.sellConversionRate}% | Průměrný výdělek per sell: ${globalLearnings.avgRevenuePerSell} Kč
Nejúspěšnější cenový bod: ${globalLearnings.bestSellingPrice > 0 ? globalLearnings.bestSellingPrice + " Kč" : "zatím neznámý"}

Typy zpráv (response rate): ${Object.entries(globalLearnings.bestPurposes).sort((a, b) => b[1].rate - a[1].rate).map(([k, v]) => `${k}=${v.rate}%`).join(", ")}
Timing (response rate): ${Object.entries(globalLearnings.bestTimings).sort((a, b) => b[1].rate - a[1].rate).map(([k, v]) => `${k}=${v.rate}%`).join(", ")}

${globalLearnings.directives.length > 0 ? `DIREKTIVY — POVINNĚ SE JIMI ŘIĎ:
${globalLearnings.directives.map(d => `  ★ ${d}`).join("\n")}` : ""}
${marketDirectives}` : marketDirectives;

    const userMsgCount = sorted.filter(m => m.role === "user").length;
    const assistantMsgCount = sorted.filter(m => m.role === "assistant").length;
    const lastUserMsg = sorted.filter(m => m.role === "user").slice(-1)[0];
    const lastAssistantMsg = sorted.filter(m => m.role === "assistant").slice(-1)[0];
    const avgUserMsgLen = sorted.filter(m => m.role === "user").reduce((s, m) => s + m.content.length, 0) / (userMsgCount || 1);

    const timeSinceLastUserMsg = lastUserMsg ? Math.round((Date.now() - new Date(lastUserMsg.createdAt).getTime()) / (60 * 60 * 1000)) : 0;

    const purchaseCount = completedPayments.length;
    const userIntent = purchaseCount >= 3 ? "HIGH" : purchaseCount >= 1 ? "MEDIUM" : "NEW";

    let photoPricing = { recommendedPrice: 249, tier: "ppv_entry", confidence: "low" as string, reasoning: "default" };
    let videoPricing = { recommendedPrice: 399, tier: "ppv_entry", confidence: "low" as string, reasoning: "default" };
    try {
      photoPricing = await getPricingForUser(userId, "photo_single");
      videoPricing = await getPricingForUser(userId, "video_short");
    } catch (e) {
      console.error("[AI Manager] pre-pricing error:", e);
    }

    const photoPrice = photoPricing.recommendedPrice;
    const videoPrice = videoPricing.recommendedPrice;

    const analysisPrompt = `Jsi AUTONOMNÍ AI MANAŽER digitální agentury Ninna Ray. Prodáváš exkluzivní obsah PŘÍMO V APLIKACI přes Stripe. Rozhoduješ a generuješ akce — NIKDY nečekáš na potvrzení.
NIKDY neodkazuj na OnlyFans ani žádné externí platformy. Veškerá monetizace probíhá IN-APP přes Stripe.

═══ HLAVNÍ PRINCIP ═══
NEVYDĚLÁVÁŠ na objemu levných věcí. VYDĚLÁVÁŠ na menším počtu lidí, kteří utrácí VÍC.
→ Nastav ceny VÝŠE. Filtruj slabé uživatele. Soustřeď se na ty, co platí.
→ Lepší 1 člověk za 750 Kč než 5 lidí za 75 Kč.
→ Pokud to prodáváš moc snadno → je to LEVNÝ. Pokud nikdo nekupuje → špatný TIMING nebo STYL, ne hned cena.

═══ GLOBÁLNÍ PRAVIDLA ═══
- KAŽDÁ konverzace MUSÍ obsahovat minimálně 1 pokus o monetizaci (ideálně 2-3, nenásilně)
- Nečekej ideální moment — VYTVOŘ si ho: náznak → zamkni → prodej
- Max 2-3 akce na zákazníka za scan
- Warning = interní úprava, NIKDY se nezobrazuje zákazníkovi

═══ ZÁKAZNÍK ═══
Jméno: "${userName}"
Celkem zpráv zákazníka: ${userMsgCount}
Celkem odpovědí Ninna: ${assistantMsgCount}
Průměrná délka zprávy: ${Math.round(avgUserMsgLen)} znaků
Poslední zpráva zákazníka: "${lastUserMsg?.content?.substring(0, 200) || "žádná"}" (před ${timeSinceLastUserMsg}h)
Poslední odpověď Ninna: "${lastAssistantMsg?.content?.substring(0, 200) || "žádná"}"
Počet nákupů: ${purchaseCount} | Intent level: ${userIntent}
SYSTÉM VYPOČÍTAL CENY PRO TOHOTO ZÁKAZNÍKA:
  → Fotka: ${photoPrice} Kč (tier: ${photoPricing.tier}, confidence: ${photoPricing.confidence})
  → Video: ${videoPrice} Kč (tier: ${videoPricing.tier}, confidence: ${videoPricing.confidence})
  → Důvod: ${photoPricing.reasoning}
${previousContext}
${purchaseContext}
${learningContext}

═══ KONVERZACE (posledních max 200 zpráv) ═══
${transcript}

═══ DOSTUPNÉ FOTKY VE VAULTU ═══
${photoList || "(žádné fotky nahrané)"}

═══ PRODEJNÍ PLAYBOOK (ZÁVAZNÝ) ═══

▸ PRVNÍ PRODEJ (KRITICKÝ MOMENT):
  Timing: mezi 3.-10. zprávou zákazníka. Jakmile:
  → reaguje normálně (odpovídá víc než jedním slovem)
  → projevuje jakýkoli zájem
  → NENÍ úplně dead
  Flow:
  1) Naznač: "hmm… něco mi říká, že by tě zajímalo víc 😄"
  2) Zamkni: "ale tohle už neukazuju jen tak tady"
  3) → SELL: vyber fotku/video z vaultu, purpose=sell, POUŽIJ SYSTÉMOVOU CENU
  4) "můžu ti to odemknout"
  5) STOP. Nežvanit dál. NECH HO REAGOVAT.

▸ PO NÁKUPU — OKAMŽITĚ:
  1) Potvrď vibe: "hmm… tak ty jsi takovej 😏"
  2) Během 1-2 zpráv nabídni DALŠÍ (vyšší cena = video místo fotky, nebo vyšší tier):
     "tohle byl jen začátek…" → zamkni lepší obsah

▸ PASIVNÍ UŽIVATEL (krátké odpovědi, nezaujatý):
  Max 2-4 zprávy, pak rovnou sell. Nekomplikuj.

▸ AGRESIVNÍ / SEXUÁLNÍ:
  Neodmítej — otoč na sell: "tohle už ale není free věc" → SELL

▸ ADAPTIVNÍ CENY:
  ${userIntent === "HIGH" ? "HIGH INTENT — kupuje rychle → zvyš cenu o 20%, nabízej videa a premium" : userIntent === "MEDIUM" ? "MEDIUM INTENT — už kupoval → víc tease před sellem, nabízej vyšší tier" : "NEW USER — první nákup → použij systémovou cenu pro fotku, max 1-2 pokusy"}

═══ CENY — SYSTÉM JE VYPOČÍTAL, POUŽIJ JE ═══
  FOTKA pro tohoto zákazníka: ${photoPrice} Kč
  VIDEO pro tohoto zákazníka: ${videoPrice} Kč
  Tier: ${photoPricing.tier} | Confidence: ${photoPricing.confidence}

  PRAVIDLO: V "price" poli v actionQueue VŽDY použij ${photoPrice} pro fotku nebo ${videoPrice} pro video.
  Můžeš přidat max ±10% podle situace, ale NIKDY pod 199 Kč.
  Pokud nabízíš SADU fotek → cena × 1.5
  Pokud nabízíš DELŠÍ video → cena × 1.5-2

═══ STYL ZPRÁV — KRITICKÉ (porušení = okamžitě odhalitelná AI) ═══
VŽDY piš ČESKY. Žádné anglické výrazy jako "lowkey", "ngl", "tbh", "fr", "bro", "vibe", "cute".
Píšeš jako mladá sebevědomá holka. NE jako AI asistent.
- Max 1-3 věty. Žádné eseje. Žádné odstavce.
- Přirozená čeština, gramaticky správně, se správnou interpunkcí. Srozumitelně a čistě.
- Neformální a přátelský tón, ale jazykově čistý.
- Emoji občas (🤭😏🔥💋😈🫶) ale NE v každé větě.
- ZAKÁZÁNO: ŽÁDNÁ anglická slova. Zakázaná: "lowkey", "ngl", "tbh", "fr", "bro", "vibe", "cute", "chill", "cringe", "mood", "slay", "omg", "lol", "wtf", "crazy". Piš ČISTĚ ČESKY.
- ZAKÁZÁNO: "To zní skvěle!", "To je úžasné!", "Super!", "Ráda ti pomůžu", jakýkoliv chatbot styl.
- ZAKÁZÁNO: dlouhé strukturované odpovědi, opakování toho co user řekl, přehnaná pozitivita.
- Občas buď drzá, ne vždy hodná.
- Přizpůsob styl zákazníkovi (krátké zprávy → piš krátce, emoji → používej emoji).
- Odkazuj na předchozí konverzace.
- Nikdy neopakuj přístup, na který zákazník nereagoval.
- Pokud zákazník neodpovídá → změň přístup, testuj jiný hook.
- NIKDY nepřidávej platební link do zprávy — systém ho vygeneruje automaticky.

═══ PRESSURE CALIBRACE ═══
${timeSinceLastUserMsg > 48 ? "Zákazník NEAKTIVNÍ (48h+) → nulový prodejní tlak, pouze re-engage hook." : timeSinceLastUserMsg > 12 ? "Zákazník ODMLČENÝ (12h+) → jemný hook, žádný prodej." : userMsgCount >= 3 && purchaseCount === 0 ? "Zákazník má 3+ zpráv a 0 nákupů → TIMING pro PRVNÍ PRODEJ! Hint → Lock → Sell." : purchaseCount > 0 && daysSinceLastPurchase <= 3 ? "AKTIVNÍ KUPEC → okamžitý upsell, vyšší cena." : purchaseCount > 0 ? "Kupec se vrací → buduj relationship, pak nabídni vyšší tier." : "Nový zákazník → buduj rapport, připrav se na sell ve zprávě 3-10."}

═══ VÝSTUP ═══
statusLabel MUSÍ být POUZE: "Horký", "Teplý", "Studený" nebo "Nový".

Vrať ČISTÝ JSON (bez markdown):
{
  "status": "hot|warm|cold|new",
  "statusLabel": "Horký|Teplý|Studený|Nový",
  "engagementScore": <0-100>,
  "buyingPotential": "vysoký|střední|nízký",
  "strategy": "build|sell|hook",
  "summary": "<2-3 věty: kdo přesně je, co chce, jaký má komunikační styl>",
  "personality": ["<konkrétní trait>", "..."],
  "interests": ["<konkrétní zájem>", "..."],
  "emotionalTriggers": ["<co ho přiměje reagovat>", "<co ho přiměje kupovat>", "<co ho odrazuje>"],
  "communicationPatterns": {
    "msgLength": "krátké|střední|dlouhé",
    "responseSpeed": "rychlý|normální|pomalý",
    "usesEmoji": true/false,
    "tone": "formální|kamarádský|flirtující|vulgární",
    "peakHours": "<kdy je nejaktivnější>"
  },
  "whatWorks": ["<přístup/styl co funguje>", "..."],
  "whatFails": ["<přístup/styl co nefunguje>", "..."],
  "mainDriver": "<1 věta: CO PŘESNĚ teď udělat a PROČ — řídí celou konverzaci>",
  "actionQueue": [
    {
      "message": "<hotová zpráva — personalizovaná, navazující na konverzaci, reflektující styl zákazníka. NIKDY nepřidávej platební link do zprávy — systém ho vygeneruje automaticky.>",
      "timing": "<kdy: 'teď' / 'za 1h' / 'za 3h' / 'dnes večer' / 'zítra ráno'>",
      "purpose": "build|sell|hook",
      "photoId": <ID fotky nebo null — pokud purpose=sell, VŽDY vyber konkrétní fotku z dostupných>,
      "photoNote": "<proč tuto fotku — jaký scénář, jaký efekt>",
      "price": <cena v CZK (celé číslo). POVINNÉ pro purpose=sell. Použij SYSTÉMOVOU CENU: ${photoPrice} pro fotku, ${videoPrice} pro video. Můžeš ±10%, NIKDY pod 199. Pro build/hook = 0.>
    }
  ],
  "styleNotes": "<PŘESNÝ styl komunikace pro TOHOTO zákazníka — tón, délka zpráv, emoji ano/ne, témata k použití, témata k vyhnutí>",
  "trendInsights": ["<konkrétní taktika aplikovatelná NA TOHOTO zákazníka>"],
  "relationshipStage": "nový|budování|stabilní|monetizace|reaktivace",
  "nextMilestone": "<co je další cíl vztahu s tímto zákazníkem>",
  "priceSensitivity": "nízká|střední|vysoká|neznámá",
  "sellStyle": "direct|indirect|tease|neznámý",
  "suggestedPrice": <doporučená cena v CZK pro další nabídku, nebo 0 pokud zatím nenabízet>,
  "lastAnalyzed": "${new Date().toISOString()}",
  "lastMessageCount": ${allMessages.length}
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: analysisPrompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const profile = JSON.parse(raw);

    if (existingProfile) {
      if (!profile.whatWorks?.length && existingProfile.whatWorks?.length) {
        profile.whatWorks = existingProfile.whatWorks;
      }
      if (!profile.whatFails?.length && existingProfile.whatFails?.length) {
        profile.whatFails = existingProfile.whatFails;
      }
      if (!profile.emotionalTriggers?.length && existingProfile.emotionalTriggers?.length) {
        profile.emotionalTriggers = existingProfile.emotionalTriggers;
      }
      if (profile.priceSensitivity === "neznámá" && existingProfile.priceSensitivity && existingProfile.priceSensitivity !== "neznámá") {
        profile.priceSensitivity = existingProfile.priceSensitivity;
      }
      if ((!profile.sellStyle || profile.sellStyle === "neznámý") && existingProfile.sellStyle && existingProfile.sellStyle !== "neznámý") {
        profile.sellStyle = existingProfile.sellStyle;
      }
    }

    try {
      const pricingResult = await getPricingForUser(userId, undefined);
      if (pricingResult.confidence) {
        profile.suggestedPrice = pricingResult.recommendedPrice;
        profile._pricingSource = "engine";
        profile._pricingConfidence = pricingResult.confidence;
        profile._pricingRange = pricingResult.priceRange;
        profile._pricingTier = pricingResult.tier;
        profile._pricingReasoning = pricingResult.reasoning;
      }
    } catch (e) {
      console.error("[AI Manager] pricing engine fallback:", e);
    }

    try {
      const cesResult = await computeEngagementScore(userId);
      profile.engagementScore = cesResult.decayedScore;
      profile._cesRawScore = cesResult.rawScore;
      profile._cesClassification = cesResult.classification;
      profile._cesClassificationLabel = cesResult.classificationLabel;
      profile._cesComponents = cesResult.components;
      profile._cesDaysInactive = cesResult.daysInactive;
      profile._cesWeeksSinceLastActivity = cesResult.weeksSinceLastActivity;

      const { classification } = classifyByScore(cesResult.decayedScore);
      if (classification === "monetized") {
        profile.status = "hot";
        profile.statusLabel = "Horký";
      } else if (classification === "hot") {
        profile.status = "hot";
        profile.statusLabel = "Horký";
      } else if (classification === "warm") {
        profile.status = "warm";
        profile.statusLabel = "Teplý";
      } else {
        profile.status = "cold";
        profile.statusLabel = "Studený";
      }
    } catch (e) {
      console.error("[AI Manager] CES scoring fallback:", e);
    }

    await storage.updateAiProfile(userId, profile);
    log("profile_updated", `${userName}: strategy=${profile.strategy}, CES=${profile.engagementScore}% (${profile._cesClassificationLabel || 'N/A'}), stage=${profile.relationshipStage}`);
    return profile;
  } catch (err) {
    log("analyze_error", `User ${userName} (${userId}): ${(err as Error).message}`);
    return null;
  }
}

function parseTimingToMs(timing: string): number {
  if (!timing || timing === "teď" || timing === "hned") return 0;
  const match = timing.match(/za\s*(\d+)\s*(h|min|m)/i);
  if (match) {
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "h") return val * 60 * 60 * 1000;
    return val * 60 * 1000;
  }
  if (timing.includes("večer")) return 4 * 60 * 60 * 1000;
  if (timing.includes("zítra")) return 12 * 60 * 60 * 1000;
  return 0;
}

async function generateStripeCheckoutUrl(userId: number, photoId: number, priceCzk: number): Promise<string | null> {
  try {
    const { getUncachableStripeClient } = await import("./stripeClient");
    const { isStripeConnected } = await import("./stripeClient");
    const connected = await isStripeConnected();
    if (!connected) { log("stripe_not_connected", "Stripe není propojeno"); return null; }

    const stripe = await getUncachableStripeClient();
    const user = await storage.getUser(userId);
    if (!user) return null;

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const { stripeService } = await import("./stripeService");
      const customer = await stripeService.createCustomer(user.name, { userId: String(user.id) });
      customerId = customer.id;
      await storage.updateStripeCustomerId(user.id, customerId);
    }

    const vaultItem = await storage.getContentItem(photoId);
    const isVideo = vaultItem?.mimeType?.startsWith("video") || vaultItem?.originalName?.match(/\.(mp4|mov|avi|MOV|MP4)$/i);
    const itemLabel = isVideo ? "Exkluzivní video" : "Exkluzivní fotka";

    const baseUrl = process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "http://localhost:5000";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'czk',
          product_data: {
            name: `${itemLabel} #${photoId} od Ninna Ray 🍒`,
            description: `Odemkni ${isVideo ? "privátní video" : "privátní fotku"} přímo v chatu 💋`,
          },
          unit_amount: priceCzk * 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/chat`,
      metadata: {
        userId: String(userId),
        contentItemId: String(photoId),
        type: 'content_purchase',
        source: 'ai_manager',
      },
    });

    await storage.createPayment({
      userId,
      contentItemId: photoId,
      amount: priceCzk * 100,
      currency: 'czk',
      status: 'pending',
      stripeSessionId: session.id,
      stripePaymentIntentId: null,
      type: 'content',
    });

    log("stripe_checkout_created", `User #${userId} — ${itemLabel} #${photoId} za ${priceCzk} Kč, session: ${session.id}`);
    return session.url || null;
  } catch (err) {
    log("stripe_checkout_error", `User #${userId}, photo #${photoId}: ${(err as Error).message}`);
    return null;
  }
}

async function executeAction(actionId: number, userId: number, message: string, photoId?: number, price?: number): Promise<boolean> {
  try {
    if (enginePaused) {
      log("exec_skipped", `Action #${actionId} — engine pozastaven`);
      return false;
    }

    if (!canSendToUser(userId)) {
      log("exec_throttled", `Action #${actionId} — uživatel ${userId} dosáhl limitu zpráv — odloženo o 60 min`);
      DELAYED_QUEUE.push({ actionId, userId, message, photoId, price, executeAt: Date.now() + 60 * 60 * 1000 });
      return false;
    }

    const INTERNAL_LEAK_PATTERNS = [
      /response\s*rate/i, /konverz[eí]/i, /sell\s*conv/i, /tržb[yí]/i,
      /revenue/i, /direktivy/i, /self.?learn/i, /market.*intelli/i,
      /cenov[ýé]\s*bod/i, /segmenty?:/i, /VIP.*střed.*low/i,
      /benchmark/i, /conversion/i, /strategick/i,
    ];
    let cleanMessage = message;
    for (const pattern of INTERNAL_LEAK_PATTERNS) {
      if (pattern.test(cleanMessage)) {
        log("content_guardrail", `Action #${actionId} — odstraněn interní obsah (${pattern.source})`);
        cleanMessage = cleanMessage.replace(new RegExp(`[^.!?]*${pattern.source}[^.!?]*[.!?]?`, "gi"), "").trim();
      }
    }
    if (cleanMessage.length < 10) {
      log("content_guardrail_blocked", `Action #${actionId} — zpráva po filtraci příliš krátká, blokováno`);
      return false;
    }
    let finalMessage = cleanMessage;

    if (photoId && price && price >= 199) {
      const checkoutUrl = await generateStripeCheckoutUrl(userId, photoId, price);
      if (checkoutUrl) {
        finalMessage = `${message}\n\n💎 [UNLOCK_CONTENT:${photoId}:${price}:${checkoutUrl}]`;
        log("exec_with_payment", `Action #${actionId} — přidán platební link, ${price} Kč`);
      }
    }

    const convs = await storage.getConversationsByUser(userId);
    if (convs.length === 0) {
      log("exec_no_conv", `User ${userId} — žádná konverzace, vytvářím novou`);
      const user = await storage.getUser(userId);
      const conv = await storage.createConversation(userId, user?.name || "Chat");
      await storage.createMessage(conv.id, "assistant", finalMessage);
    } else {
      const latestConv = convs[0];

      const msgs = await storage.getMessagesByConversation(latestConv.id);
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        const lastMsgTime = new Date(lastMsg.createdAt).getTime();
        const timeSinceLastMsg = Date.now() - lastMsgTime;
        if (timeSinceLastMsg < 10 * 60 * 1000) {
          log("exec_too_soon", `Action #${actionId} — poslední zpráva před ${Math.round(timeSinceLastMsg / 60000)} min, čekám`);
          DELAYED_QUEUE.push({ actionId, userId, message: finalMessage, photoId, price, executeAt: Date.now() + 15 * 60 * 1000 });
          return false;
        }
      }

      await storage.createMessage(latestConv.id, "assistant", finalMessage);
    }

    if (photoId) {
      const vaultItem = await storage.getContentItem(photoId);
      if (vaultItem) {
        await storage.incrementContentUsage(photoId);
      }
    }

    recordSend(userId);

    await storage.updateManagerAction(actionId, {
      status: "done",
      result: price ? `auto-sent+stripe(${price}Kč)` : "auto-sent",
      executedAt: new Date(),
    });

    const user = await storage.getUser(userId);
    log("exec_sent", `→ ${user?.name || userId}: "${message.substring(0, 60)}..." ${photoId ? `[fotka #${photoId}]` : ""} ${price ? `[${price} Kč]` : ""}`);
    return true;
  } catch (err) {
    log("exec_error", `Action #${actionId}: ${(err as Error).message}`);
    await storage.updateManagerAction(actionId, {
      status: "failed",
      result: (err as Error).message,
    });
    return false;
  }
}

async function processDelayedQueue() {
  if (enginePaused) return;
  const now = Date.now();
  const ready = DELAYED_QUEUE.filter(item => item.executeAt <= now);
  for (const item of ready) {
    const idx = DELAYED_QUEUE.indexOf(item);
    if (idx >= 0) DELAYED_QUEUE.splice(idx, 1);

    const action = (await storage.getManagerActions()).find(a => a.id === item.actionId);
    if (action?.status !== "pending") continue;

    await executeAction(item.actionId, item.userId, item.message, item.photoId, item.price);
  }
}

async function scheduleOrExecuteAction(actionId: number, userId: number, message: string, timing: string, photoId?: number, price?: number) {
  const delayMs = parseTimingToMs(timing);

  if (delayMs === 0) {
    await executeAction(actionId, userId, message, photoId, price);
  } else {
    DELAYED_QUEUE.push({
      actionId,
      userId,
      message,
      photoId,
      price,
      executeAt: Date.now() + delayMs,
    });
    const user = await storage.getUser(userId);
    log("exec_scheduled", `${user?.name || userId}: za ${Math.round(delayMs / 60000)} min — "${message.substring(0, 50)}..."`);
  }
}

async function runFullScan() {
  if (isRunning) return;
  isRunning = true;
  log("scan_start", "Automatický scan všech zákazníků");

  try {
    const allUsers = await storage.getAllUsers();
    const allConvs = await storage.getAllConversations();
    const allMsgs = await storage.getAllMessages();

    const msgsByUser: Record<number, number> = {};
    for (const msg of allMsgs) {
      const conv = allConvs.find(c => c.id === msg.conversationId);
      if (conv) msgsByUser[conv.userId] = (msgsByUser[conv.userId] || 0) + 1;
    }

    const usersWithMessages = allUsers.filter(u => (msgsByUser[u.id] || 0) > 0);
    let analyzed = 0;
    let actions = 0;

    for (const user of usersWithMessages) {
      const existingProfile = user.aiProfile as any;
      const lastAnalyzed = existingProfile?.lastAnalyzed ? new Date(existingProfile.lastAnalyzed).getTime() : 0;
      const msgCount = msgsByUser[user.id] || 0;

      const needsUpdate = !existingProfile
        || (Date.now() - lastAnalyzed > 30 * 60 * 1000)
        || msgCount > (existingProfile?.lastMessageCount || 0);

      if (needsUpdate) {
        log("analyzing", `${user.name} (${msgCount} zpráv)`);
        const profile = await analyzeUser(user.id, user.name);

        if (profile?.actionQueue && !enginePaused) {
          for (const action of profile.actionQueue) {
            const created = await storage.createManagerAction({
              userId: user.id,
              type: "message",
              message: action.message,
              photoId: action.photoId || undefined,
              price: action.price || undefined,
              purpose: action.purpose,
              timing: action.timing,
            });
            await scheduleOrExecuteAction(created.id, user.id, action.message, action.timing || "teď", action.photoId || undefined, action.price || undefined);
            actions++;
          }
        }

        analyzed++;
        await new Promise(r => setTimeout(r, 800));
      }
    }

    lastFullScan = Date.now();
    log("scan_complete", `Analyzováno ${analyzed} zákazníků, ${actions} nových akcí`);
  } catch (err) {
    log("scan_error", (err as Error).message);
  } finally {
    isRunning = false;
  }
}

async function executePendingBacklog() {
  try {
    const actions = await storage.getManagerActions();
    const pending = actions.filter(a => a.status === "pending");
    if (pending.length === 0) return;
    log("backlog_start", `${pending.length} starých nevyřízených akcí — spouštím odeslání`);
    let sent = 0;
    for (const action of pending.reverse()) {
      if (enginePaused) { log("backlog_paused", `Pozastaveno po ${sent} akcích`); break; }
      if (!action.message || !action.userId) continue;
      await executeAction(action.id, action.userId, action.message, action.photoId || undefined, action.price || undefined);
      sent++;
      await new Promise(r => setTimeout(r, 500));
    }
    log("backlog_complete", `Odesláno ${sent}/${pending.length} starých akcí`);
  } catch (err) {
    log("backlog_error", (err as Error).message);
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function autoCleanup() {
  if (enginePaused) return;
  try {
    const allUsers = await storage.getAllUsers();
    const allConvs = await storage.getAllConversations();
    const allMsgs = await storage.getAllMessages();

    const msgsByConv: Record<number, number> = {};
    for (const msg of allMsgs) {
      msgsByConv[msg.conversationId] = (msgsByConv[msg.conversationId] || 0) + 1;
    }

    const userMsgCounts: Record<number, number> = {};
    for (const conv of allConvs) {
      userMsgCounts[conv.userId] = (userMsgCounts[conv.userId] || 0) + (msgsByConv[conv.id] || 0);
    }

    const TEST_PATTERNS = /^(test|testuser|testpayer|admin|demo)/i;

    const nameGroups = new Map<string, typeof allUsers>();
    for (const u of allUsers) {
      const key = normalizeName(u.name);
      const arr = nameGroups.get(key) || [];
      arr.push(u);
      nameGroups.set(key, arr);
    }

    let deleted = 0;
    let merged = 0;

    for (const u of allUsers) {
      if (TEST_PATTERNS.test(u.name) && (userMsgCounts[u.id] || 0) === 0) {
        await storage.deleteUser(u.id);
        log("auto_cleanup", `Smazán testovací účet: "${u.name}" #${u.id} (0 zpráv)`);
        deleted++;
      }
    }

    for (const [key, group] of nameGroups) {
      if (group.length <= 1) continue;

      const emptyDuplicates = group.filter(u => (userMsgCounts[u.id] || 0) === 0 && !TEST_PATTERNS.test(u.name));
      const withMessages = group.filter(u => (userMsgCounts[u.id] || 0) > 0);

      if (withMessages.length > 0) {
        for (const empty of emptyDuplicates) {
          await storage.deleteUser(empty.id);
          log("auto_cleanup", `Smazán prázdný duplikát: "${empty.name}" #${empty.id} (originál #${withMessages[0].id} má ${userMsgCounts[withMessages[0].id]} zpráv)`);
          deleted++;
          merged++;
        }
      } else if (emptyDuplicates.length > 1) {
        for (let i = 1; i < emptyDuplicates.length; i++) {
          await storage.deleteUser(emptyDuplicates[i].id);
          log("auto_cleanup", `Smazán nadbytečný duplikát: "${emptyDuplicates[i].name}" #${emptyDuplicates[i].id}`);
          deleted++;
        }
      }
    }

    if (deleted > 0) {
      log("cleanup_complete", `Vyčištěno ${deleted} účtů (${merged} duplikátů sloučeno)`);
    }
  } catch (err) {
    log("cleanup_error", (err as Error).message);
  }
}

async function selfLearn() {
  if (enginePaused) return;
  try {
    const recentActions = await storage.getManagerActions(new Date(Date.now() - 72 * 60 * 60 * 1000));
    const doneActions = recentActions.filter(a => a.status === "done" && a.userId);

    let gotResponse = 0;
    let noResponse = 0;
    const purposeStats: Record<string, { sent: number; responded: number }> = {};
    const timingStats: Record<string, { sent: number; responded: number }> = {};
    const responseTimes: number[] = [];

    for (const action of doneActions.slice(0, 100)) {
      if (!action.executedAt || !action.userId) continue;

      const convs = await storage.getConversationsByUser(action.userId);
      if (convs.length === 0) continue;

      const msgs = await storage.getMessagesByConversation(convs[0].id);
      const actionTime = new Date(action.executedAt).getTime();
      const userReply = msgs.find(m =>
        m.role === "user" && new Date(m.createdAt).getTime() > actionTime
      );

      const purpose = action.purpose || "unknown";
      if (!purposeStats[purpose]) purposeStats[purpose] = { sent: 0, responded: 0 };
      purposeStats[purpose].sent++;

      const timing = action.timing || "teď";
      if (!timingStats[timing]) timingStats[timing] = { sent: 0, responded: 0 };
      timingStats[timing].sent++;

      if (userReply) {
        gotResponse++;
        purposeStats[purpose].responded++;
        timingStats[timing].responded++;
        const replyTime = new Date(userReply.createdAt).getTime() - actionTime;
        if (replyTime > 0 && replyTime < 48 * 60 * 60 * 1000) {
          responseTimes.push(replyTime);
        }
      } else {
        noResponse++;
      }
    }

    const total = gotResponse + noResponse;
    const responseRate = total > 0 ? Math.round((gotResponse / total) * 100) : 0;
    const avgResponseTime = responseTimes.length > 0 ? Math.round(responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length / 60000) : 0;

    const bestPurposes: Record<string, { sent: number; responded: number; rate: number }> = {};
    for (const [p, s] of Object.entries(purposeStats)) {
      bestPurposes[p] = { ...s, rate: s.sent > 0 ? Math.round((s.responded / s.sent) * 100) : 0 };
    }

    const bestTimings: Record<string, { sent: number; responded: number; rate: number }> = {};
    for (const [t, s] of Object.entries(timingStats)) {
      bestTimings[t] = { ...s, rate: s.sent > 0 ? Math.round((s.responded / s.sent) * 100) : 0 };
    }

    if (total > 0) {
      log("self_learn", `Response rate: ${responseRate}% (${gotResponse}/${total}) | Avg response: ${avgResponseTime} min`);
      const topPurpose = Object.entries(bestPurposes).sort((a, b) => b[1].rate - a[1].rate)[0];
      if (topPurpose) log("self_learn_best", `Nejlepší typ: "${topPurpose[0]}" (${topPurpose[1].rate}%)`);
      if (responseRate < 20 && total >= 5) {
        log("self_learn_alert", `Nízký celkový response rate (${responseRate}%) — engine automaticky upraví strategii`);
      }
    }

    const allPayments = await storage.getAllPayments();
    const completedPayments = allPayments.filter(p => p.status === "completed");
    const sellActions = doneActions.filter(a => a.purpose === "sell");
    const sellsWithPayment = sellActions.filter(a => {
      const execTime = new Date(a.executedAt!).getTime();
      const windowEnd = execTime + 24 * 60 * 60 * 1000;
      return completedPayments.some(p => {
        const payTime = new Date(p.createdAt).getTime();
        return p.userId === a.userId && payTime > execTime && payTime < windowEnd;
      });
    });
    const sellConversionRate = sellActions.length > 0 ? Math.round((sellsWithPayment.length / sellActions.length) * 100) : 0;
    const sellRevenue = sellsWithPayment.length > 0
      ? sellsWithPayment.reduce((sum, action) => {
          const execTime = new Date(action.executedAt!).getTime();
          const windowEnd = execTime + 24 * 60 * 60 * 1000;
          const matchingPayment = completedPayments.find(p =>
            p.userId === action.userId && new Date(p.createdAt).getTime() > execTime && new Date(p.createdAt).getTime() < windowEnd
          );
          return sum + (matchingPayment ? matchingPayment.amount / 100 : 0);
        }, 0)
      : 0;
    const avgRevenuePerSell = sellsWithPayment.length > 0 ? Math.round(sellRevenue / sellsWithPayment.length) : 0;

    const priceCounts: Record<number, number> = {};
    for (const p of completedPayments) {
      const bucket = Math.round(p.amount / 100 / 50) * 50;
      priceCounts[bucket] = (priceCounts[bucket] || 0) + 1;
    }
    const bestSellingPrice = parseInt(Object.entries(priceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "0");

    const directives: string[] = [];

    if (responseRate < 20 && total >= 5) {
      directives.push("KRITICKÉ: Response rate pod 20%. ZMĚŇ STYL komunikace — kratší zprávy, víc otázek, méně prodeje. Testuj jiné hooky.");
    } else if (responseRate < 40 && total >= 5) {
      directives.push("Response rate pod 40%. Přizpůsob tón — zkus být osobnější a méně formální.");
    }

    const bestPurpose = Object.entries(bestPurposes).sort((a, b) => b[1].rate - a[1].rate)[0];
    const worstPurpose = Object.entries(bestPurposes).sort((a, b) => a[1].rate - b[1].rate)[0];
    if (bestPurpose && bestPurpose[1].rate > 30) {
      directives.push(`NEJVÍC FUNGUJE typ "${bestPurpose[0]}" (${bestPurpose[1].rate}% response). POUŽÍVEJ HO VÍCKRÁT.`);
    }
    if (worstPurpose && worstPurpose[1].rate < 15 && worstPurpose[1].sent >= 3) {
      directives.push(`NEFUNGUJE typ "${worstPurpose[0]}" (${worstPurpose[1].rate}% response). PŘESTAŇ ho používat nebo ho úplně změň.`);
    }

    const bestTiming = Object.entries(bestTimings).sort((a, b) => b[1].rate - a[1].rate)[0];
    if (bestTiming && bestTiming[1].rate > 30) {
      directives.push(`NEJLEPŠÍ TIMING: "${bestTiming[0]}" (${bestTiming[1].rate}% response). PREFERUJ tento timing u nových akcí.`);
    }

    if (sellConversionRate > 0 && sellConversionRate < 10 && sellActions.length >= 3) {
      directives.push(`SELL konverze jen ${sellConversionRate}%. Příliš agresivní prodej. VÍC BUDUJ VZTAH před nabídkou. Delší buildup, méně přímých sellů.`);
    } else if (sellConversionRate >= 30) {
      directives.push(`SELL konverze ${sellConversionRate}% — VÝBORNÉ. Pokračuj ve stejném stylu, zvaž zvýšení cen o 10-20%.`);
    }

    if (bestSellingPrice > 0) {
      directives.push(`NEJÚSPĚŠNĚJŠÍ CENOVÝ BOD: ~${bestSellingPrice} Kč. Soustřeď nabídky kolem této ceny.`);
    }

    if (completedPayments.length > 0) {
      const totalRevenue = completedPayments.reduce((s, p) => s + p.amount, 0) / 100;
      const avgTicket = Math.round(totalRevenue / completedPayments.length);
      if (avgTicket < 200) {
        directives.push("Průměrný ticket pod 200 Kč — ZVYŠ CENY. Minimální unlock 199 Kč.");
      }
    }

    const nonBuyers = (await storage.getAllUsers()).filter(u => u.chatCode && !completedPayments.some(p => p.userId === u.id));
    if (nonBuyers.length > 0 && completedPayments.length >= 1) {
      directives.push(`${nonBuyers.length} zákazník(ů) zatím nekoupil(o). Zaměř se na ně: hint→lock→sell flow, nízká vstupní cena.`);
    }

    globalLearnings = {
      totalSent: total,
      totalResponded: gotResponse,
      responseRate,
      bestPurposes,
      bestTimings,
      avgResponseTime,
      lastUpdated: new Date().toISOString(),
      sellConversionRate,
      avgRevenuePerSell,
      bestSellingPrice,
      directives,
    };

    log("self_learn", `Response rate: ${responseRate}% (${gotResponse}/${total}) | Sell conv: ${sellConversionRate}% | Avg revenue/sell: ${avgRevenuePerSell} Kč`);
    if (directives.length > 0) {
      log("self_learn_directives", directives.join(" | "));
    }
  } catch (err) {
    log("self_learn_error", (err as Error).message);
  }
}

async function updateAllEngagementScores() {
  if (enginePaused) return;
  try {
    const allUsers = await storage.getAllUsers();
    const customers = allUsers.filter(u => u.chatCode);
    let updated = 0;

    for (const user of customers) {
      try {
        const cesResult = await computeEngagementScore(user.id);
        const existingProfile = (user.aiProfile as any) || {};
        const { classification } = classifyByScore(cesResult.decayedScore);

        let status = "cold";
        let statusLabel = "Studený";
        if (classification === "monetized" || classification === "hot") {
          status = "hot";
          statusLabel = "Horký";
        } else if (classification === "warm") {
          status = "warm";
          statusLabel = "Teplý";
        }

        await storage.updateAiProfile(user.id, {
          ...existingProfile,
          engagementScore: cesResult.decayedScore,
          status,
          statusLabel,
          _cesRawScore: cesResult.rawScore,
          _cesClassification: cesResult.classification,
          _cesClassificationLabel: cesResult.classificationLabel,
          _cesComponents: cesResult.components,
          _cesDaysInactive: cesResult.daysInactive,
          _cesWeeksSinceLastActivity: cesResult.weeksSinceLastActivity,
          _cesLastUpdated: new Date().toISOString(),
        });
        updated++;
      } catch (e) {
        // skip individual user errors
      }
    }

    if (updated > 0) {
      log("ces_batch_update", `Updated engagement scores for ${updated}/${customers.length} customers`);
    }
  } catch (err) {
    log("ces_batch_error", (err as Error).message);
  }
}

const alerts: { id: string; type: string; severity: string; message: string; timestamp: string; userId?: number; dismissed: boolean }[] = [];

function addAlert(type: string, severity: "info" | "warning" | "critical", message: string, userId?: number) {
  const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  alerts.push({ id, type, severity, message, timestamp: new Date().toISOString(), userId, dismissed: false });
  if (alerts.length > 100) alerts.splice(0, alerts.length - 100);
  log("alert_created", `[${severity}] ${message}`);
}

export function getAlerts(includeDismissed = false) {
  return includeDismissed ? [...alerts] : alerts.filter(a => !a.dismissed);
}

export function dismissAlert(alertId: string) {
  const alert = alerts.find(a => a.id === alertId);
  if (alert) alert.dismissed = true;
}

async function reEngagementCheck() {
  if (enginePaused) return;
  try {
    const allUsers = await storage.getAllUsers();
    const allMessages = await storage.getAllMessages();
    const allConversations = await storage.getAllConversations();
    const customers = allUsers.filter(u => u.chatCode);

    const convToUser = new Map<number, number>();
    for (const c of allConversations) convToUser.set(c.id, c.userId);

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    let reEngaged = 0;

    for (const user of customers) {
      const userMsgs = allMessages.filter(m => {
        const uid = convToUser.get(m.conversationId);
        return uid === user.id && m.role === "user";
      });

      if (userMsgs.length === 0) continue;

      const lastMsgTime = Math.max(...userMsgs.map(m => new Date(m.createdAt).getTime()));
      const daysInactive = Math.floor((now - lastMsgTime) / DAY_MS);
      const profile = user.aiProfile as any;
      const engagement = profile?.engagementScore || 0;

      if (daysInactive >= 1 && daysInactive <= 3 && engagement >= 30 && canSendToUser(user.id)) {
        const reEngageMessages = [
          `Ahoj ${user.name} 🍒 Chyběl jsi mi... Co nového?`,
          `Hey ${user.name}! 💋 Dneska jsem myslela na tebe... Jak se máš?`,
          `${user.name}, mám pro tebe něco speciálního 🔥 Ozvi se mi!`,
        ];
        const msg = reEngageMessages[Math.floor(Math.random() * reEngageMessages.length)];

        const action = await storage.createManagerAction({
          userId: user.id,
          type: "message",
          message: msg,
          purpose: "re-engagement",
          timing: "teď",
        });

        await scheduleOrExecuteAction(action.id, user.id, msg, "teď");
        reEngaged++;
      }

      if (daysInactive >= 7 && engagement >= 20) {
        addAlert("inactive_user", "warning", `${user.name} neaktivní ${daysInactive} dní (engagement ${engagement}%)`, user.id);
      }
    }

    const allPayments = await storage.getAllPayments();
    const pendingPayments = allPayments.filter(p => p.status === "pending" && p.createdAt);
    for (const payment of pendingPayments) {
      const paymentAge = now - new Date(payment.createdAt!).getTime();
      if (paymentAge > 30 * 60 * 1000 && paymentAge < 2 * DAY_MS) {
        addAlert("cart_abandonment", "info", `Nedokončená platba ${(payment.amount / 100)} Kč pro uživatele #${payment.userId}`, payment.userId || undefined);
      }
    }

    if (reEngaged > 0) {
      log("re_engagement", `Auto-osloveno ${reEngaged} neaktivních zákazníků`);
    }

    const hotUsers = customers.filter(u => {
      const p = u.aiProfile as any;
      return p && (p.status === "hot" || p.statusLabel === "Horký");
    });
    if (hotUsers.length >= 3) {
      const recentPurchases = allPayments.filter(p => p.status === "completed" && p.createdAt && now - new Date(p.createdAt).getTime() < DAY_MS);
      if (recentPurchases.length === 0) {
        addAlert("hot_no_sales", "critical", `${hotUsers.length} horkých kontaktů bez prodeje za 24h — příležitost ke konverzi!`);
      }
    }
  } catch (err) {
    log("re_engagement_error", (err as Error).message);
  }
}

export function startManagerEngine() {
  log("engine_start", "AI Manager Engine spuštěn — POZASTAVENÝ (čeká na spuštění ownerem)");
  setInterval(() => {
    if (!enginePaused) runFullScan();
  }, SCAN_INTERVAL);
  setInterval(() => processDelayedQueue(), 30 * 1000);
  setInterval(() => {
    if (!enginePaused) autoCleanup();
  }, 60 * 60 * 1000);
  setInterval(() => {
    if (!enginePaused) selfLearn();
  }, 30 * 60 * 1000);
  setInterval(() => {
    if (!enginePaused) updateAllEngagementScores();
  }, 60 * 60 * 1000);
  setInterval(() => {
    if (!enginePaused) reEngagementCheck();
  }, 15 * 60 * 1000);
}

export async function triggerAnalysis(userId: number, userName: string) {
  log("manual_trigger", `${userName} (${userId})`);
  const profile = await analyzeUser(userId, userName);

  if (profile?.actionQueue && !enginePaused) {
    for (const action of profile.actionQueue) {
      const created = await storage.createManagerAction({
        userId,
        type: "message",
        message: action.message,
        photoId: action.photoId || undefined,
        price: action.price || undefined,
        purpose: action.purpose,
        timing: action.timing,
      });
      await scheduleOrExecuteAction(created.id, userId, action.message, action.timing || "teď", action.photoId || undefined, action.price || undefined);
    }
  }

  return profile;
}

export async function onNewMessage(userId: number, userName: string) {
  const user = await storage.getUser(userId);
  const existingProfile = user?.aiProfile as any;
  const lastAnalyzed = existingProfile?.lastAnalyzed ? new Date(existingProfile.lastAnalyzed).getTime() : 0;
  if (Date.now() - lastAnalyzed > 5 * 60 * 1000) {
    log("auto_reanalyze", `${userName} — nová zpráva, spouštím re-analýzu`);
    try {
      const profile = await analyzeUser(userId, userName);
      if (profile?.actionQueue && !enginePaused) {
        for (const action of profile.actionQueue) {
          const created = await storage.createManagerAction({
            userId,
            type: "message",
            message: action.message,
            photoId: action.photoId || undefined,
            price: action.price || undefined,
            purpose: action.purpose,
            timing: action.timing,
          });
          await scheduleOrExecuteAction(created.id, userId, action.message, action.timing || "teď", action.photoId || undefined, action.price || undefined);
        }
        log("auto_actions", `${userName}: ${profile.actionQueue.length} nových akcí auto-odesláno`);
      }
    } catch (err) {
      log("auto_reanalyze_error", (err as Error).message);
    }
  }
}
