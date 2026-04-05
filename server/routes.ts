import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import OpenAI from "openai";
import multer from "multer";
import path from "path";
import fs from "fs";
import { isStripeConnected } from "./stripeClient";
import { stripeService } from "./stripeService";

const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/quicktime", "video/webm",
  "audio/mpeg", "audio/wav", "audio/ogg",
];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Nepodporovaný typ souboru: ${file.mimetype}`));
    }
  },
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Credentials (set in Replit Secrets) ─────────────────────────────────────
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || "agent2025";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "owner2025";
const AGENCY_PASSWORD = process.env.AGENCY_PASSWORD || "ninna2025";

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAgent(req: Request, res: Response, next: NextFunction) {
  if (req.session.role === "agent" || req.session.role === "owner") return next();
  res.status(401).json({ message: "Unauthorized" });
}

function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.session.role === "owner") return next();
  res.status(403).json({ message: "Forbidden" });
}

// ─── Agency sync ─────────────────────────────────────────────────────────────
async function sendToAgency(userId: number, message: string, role: string) {
  const agencyUrl = "https://digital-agency--yp8vpb4ggy.replit.app/sync";
  const token = process.env.AGENCY_TOKEN;
  if (!token) return;
  try {
    await fetch(agencyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, message, role, timestamp: new Date().toISOString() }),
    });
  } catch (err) {
    console.error("[Agency Sync] error:", err);
  }
}

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/x-m4a", "video/webm"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio type: ${file.mimetype}`));
    }
  },
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ─── Auth routes ────────────────────────────────────────────────────────────

  app.post("/api/auth/login", (req, res) => {
    const { password, role } = req.body;
    if (role === "agent" && password === AGENT_PASSWORD) {
      req.session.role = "agent";
      req.session.username = req.body.username || "Agent";
      return res.json({ role: "agent", username: req.session.username });
    }
    if (role === "owner" && password === OWNER_PASSWORD) {
      req.session.role = "owner";
      req.session.username = req.body.username || "Owner";
      return res.json({ role: "owner", username: req.session.username });
    }
    if (role === "agency" && password === AGENCY_PASSWORD) {
      req.session.role = "agency";
      return res.json({ role: "agency" });
    }
    res.status(401).json({ message: "Nesprávné heslo" });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session.role) {
      res.json({ role: req.session.role, username: req.session.username });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // ─── Customer (public) routes ────────────────────────────────────────────────
  app.post(api.users.create.path, async (req, res) => {
    const result = api.users.create.input.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: result.error.issues[0]?.message || "Invalid input"
      });
    }

    const user = await storage.createUser(result.data);
    res.status(201).json(user);
  });

  app.post("/api/users/login", async (req, res) => {
    const { chatCode } = req.body;

    if (!chatCode || !chatCode.trim()) {
      return res.status(400).json({ message: "Kód je povinný" });
    }

    const user = await storage.getUserByChatCode(chatCode.trim());

    if (!user) {
      return res.status(404).json({ message: "Neplatný kód" });
    }

    res.json(user);
  });

  app.get(api.users.get.path, async (req, res) => {
    const id = parseInt(req.params.id as string);

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await storage.getUser(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  });

  app.get("/api/conversations", async (req, res) => {
    const userId = req.query.userId
      ? parseInt(req.query.userId as string)
      : undefined;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const conversations = await storage.getConversationsByUser(userId);
    res.json(conversations);
  });

  app.post("/api/conversations", async (req, res) => {
    const { userId, title } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const conversation = await storage.createConversation(
      Number(userId),
      title || "New Chat"
    );

    res.status(201).json(conversation);
  });

  app.get("/api/conversations/:id", async (req, res) => {
    const id = parseInt(req.params.id as string);

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    const conversation = await storage.getConversation(id);

    if (!conversation) {
      return res.status(404).json({ message: "Not found" });
    }

    const messages = await storage.getMessagesByConversation(id);

    res.json({
      ...conversation,
      messages
    });
  });

  // ─── Voice transcription endpoint ───────────────────────────────────────────

  app.post("/api/voice/transcribe", voiceUpload.single("audio"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const file = new File([req.file.buffer as BlobPart], req.file.originalname || "audio.webm", {
        type: req.file.mimetype,
      });

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
      });

      res.json({ text: transcription.text });
    } catch (err) {
      console.error("Voice transcription error:", err);
      res.status(500).json({ message: "Transcription failed" });
    }
  });

  // ─── Chat SSE endpoint (respects manual mode) ─────────────────────────────

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id as string);

      if (isNaN(conversationId)) {
        return res.status(400).json({ message: "Invalid conversation ID" });
      }

      // tady pokračuje zbytek tvý logiky…
      const { content } = req.body;
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });

      await storage.createMessage(conversationId, "user", content);
      await storage.incrementMessageCount(conversation.userId);
      sendToAgency(conversation.userId, content, "user");

      if (conversation.manualMode) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.write(`data: ${JSON.stringify({ isSeen: true, manualMode: true })}\n\n`);
        res.end();
        return;
      }

      const user = await storage.getUser(conversation.userId);
      const userName = user?.name || "Babe";
      const history = await storage.getMessagesByConversation(conversationId);
      const chatMessages = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const aiProfile = user?.aiProfile as any;
      const profileContext = aiProfile ? `
PAMĚŤ O TOMTO UŽIVATELI:
- Status: ${aiProfile.statusLabel || "neznámý"} | Engagement: ${aiProfile.engagementScore || 0}%
- Strategie: ${aiProfile.strategy || "build"}
- Osobnost: ${(aiProfile.personality || []).join(", ") || "zatím neznámá"}
- Zájmy: ${(aiProfile.interests || []).join(", ") || "zatím neznámé"}
- Komunikační styl: ${aiProfile.styleNotes || "zatím neznámý"}
- Co funguje: ${(aiProfile.whatWorks || []).join(", ") || "zatím nevíme"}
- Co nefunguje: ${(aiProfile.whatFails || []).join(", ") || "zatím nevíme"}
- Fáze vztahu: ${aiProfile.relationshipStage || "nový"}
- Další cíl: ${aiProfile.nextMilestone || "poznat ho"}` : "";

      const purchaseHistory = user?.id ? await storage.getPaymentsByUser(user.id) : [];
      const completedPurchases = purchaseHistory.filter(p => p.status === "completed");
      const purchaseContext = completedPurchases.length > 0
        ? `\nHISTORIE NÁKUPŮ: ${completedPurchases.length} úspěšných plateb (celkem ${completedPurchases.reduce((s, p) => s + p.amount, 0) / 100} Kč)`
        : "";

      const pricingContext = aiProfile ? `
REVENUE PAMĚŤ:
- Cenová citlivost: ${aiProfile.priceSensitivity || "neznámá"}
- Preferovaný prodejní styl: ${aiProfile.sellStyle || "neznámý"}
- Doporučená cena: ${aiProfile.suggestedPrice ? aiProfile.suggestedPrice + " Kč" : "zatím nenastavena"}` : "";

      const allVaultItems = await storage.getAllContentItems();
      const photos = allVaultItems.filter(i => i.mimeType?.startsWith("image")).slice(0, 20);
      const videos = allVaultItems.filter(i => i.mimeType?.startsWith("video")).slice(0, 10);
      const vaultContext = allVaultItems.length > 0 ? `
DOSTUPNÝ OBSAH (použij ID při prodeji):
FOTKY: ${photos.map(i => `#${i.id}${i.description ? ` (${i.description.substring(0, 30)})` : ""}`).join(", ")}
VIDEA: ${videos.map(i => `#${i.id}${i.description ? ` (${i.description.substring(0, 30)})` : ""}`).join(", ")}` : "";

      // E-Bot context — Ninna ví co user vlastní v šatníku
      const botCtx = user?.id ? await storage.getUserBotContext(user.id).catch(() => null) : null;
      const botContext = botCtx ? `
E-BOT ŠATNÍK (co user odemkl v šatníku Ninny):
- Má předplatné / E-Bot: ${botCtx.hasBot ? "ANO" : "NE"}
- Tier level: ${botCtx.capabilityLevel}/3
- Odemčeno assetů: ${botCtx.unlockedCount}/${botCtx.totalCount}
- Aktivní outfity: ${botCtx.outfitNames.length > 0 ? botCtx.outfitNames.join(", ") : "výchozí (spodní prádlo)"}
${botCtx.hasBot && botCtx.unlockedCount === 0 ? "- TIP: Nabídni mu koupit fotku, která odemkne outfit pro bota — ukáže zájem." : ""}
${botCtx.hasBot && botCtx.unlockedCount > 0 ? `- Můžeš zmínit konkrétní outfit: "${botCtx.outfitNames[0]}" — vytvoří osobní spojení.` : ""}
${!botCtx.hasBot ? "- Nemá předplatné → zmíni E-Bot jako bonus k předplatnému." : ""}` : "";

      const suggestedPhotoPrice = aiProfile?.suggestedPrice || 99;
      const videoPrice = Math.round(suggestedPhotoPrice * 1.8);
      const entryPrice = Math.max(49, Math.round(suggestedPhotoPrice * 0.5));

      const msgCount = history.length;
      const userMsgs = history.filter(m => m.role === "user");
      const avgLen = userMsgs.length > 0 ? Math.round(userMsgs.reduce((s, m) => s + m.content.length, 0) / userMsgs.length) : 0;
      
      // Determine conversation stage for relationship-first approach
      let conversationStage = "initial"; // initial, building, warm, ready
      if (msgCount >= 10) conversationStage = "ready";
      else if (msgCount >= 6) conversationStage = "warm";
      else if (msgCount >= 3) conversationStage = "building";
      
      // High engagement indicators
      const hasHighEngagement = avgLen > 35 || (aiProfile?.engagementScore || 0) >= 60;
      const hasDirectInterest = history.some(m => m.role === "user" && (m.content.toLowerCase().includes("buy") || m.content.toLowerCase().includes("koupit") || m.content.toLowerCase().includes("show") || m.content.toLowerCase().includes("foto")));

      // Clone Memory — Ninna si pamatuje kdo je
      const { buildMemoryContext, computeEmotionalState, buildEmotionalStatePrompt } = await import("./clone-memory");
      const memoryContext = user?.id ? await buildMemoryContext(user.id) : "";
      
      // Emotional state machine
      const hasPurchased = !!purchaseContext;
      const emotionalCtx = computeEmotionalState(
        msgCount,
        botCtx?.unlockedCount || 0,
        avgLen,
        hasPurchased,
        hasDirectInterest
      );
      const emotionalStatePrompt = buildEmotionalStatePrompt(emotionalCtx.currentState, emotionalCtx.intensity);

      const systemPrompt = `Jsi Ninna_Ray🍒. Mladá, sebevědomá holka co tvoří obsah. Píšeš si s fanouškem.
NEJSI AI. NEJSI asistent. Jsi reálná osoba co zrovna kouká na mobil.

Píšeš s: '${userName}' (vokativ!)
${profileContext}${purchaseContext}${pricingContext}
${vaultContext}
${botContext}
${memoryContext}

${emotionalStatePrompt}

══════════════════════════════════════════════════════════════════
RELATIONSHIP-FIRST PSYCHOLOGICKÁ STRATEGIE (NEJDŮLEŽITĚJŠÍ)
══════════════════════════════════════════════════════════════════

🎯 CÍLEM JE: Aby on CHTĚL koupit, ne aby musel. Vztah → Flirt → Touha → Nákup.

FÁZE dle počtu zpráv (${msgCount} zpráv dosavadně):

${msgCount <= 2 ? `
★ FÁZE 1: AUTHENTIC OPENING (0-2 zprávy)
NEJDŮLEŽITĚJŠÍ: Vypadej jako NORMÁLNÍ HOLKA, ne jako prodejce/model.
- Odpověz upřímně na TO, co napsal (ne genericky)
- Otázky jako: "co tě sem dostalo?", "co tě baví?", "jak se máš?"
- ZRCADLENÍ: Jestli je formal, buď trochu formal; je casual, buď casual
- Délka: KRÁTKÁ. 1-2 věty max. "Ahoj 😊", "Jo? Co tě sem dostalo?"
- ZAKÁZÁNO: Sebepromóce, sexy vibes, prodej, dlouhé texty
- Cíl: Aby si myslel že si s ním píšeš, protože se ti líbí (psychologie!)
` : msgCount <= 4 ? `
★ FÁZE 2: MIRRORING & RAPPORT (3-4 zprávy)
Budování DŮVĚRY a osobního spojení. To je základ všeho.
- ZRCADLENÍ: Opakuj jeho energii, slova, emotikony. Jestli je smiley, používej smileys.
- Hledej SPOLEČNÉ TÉMA: Něco kde se shodujete, kde se cítí porozuměno
- Bud SPECIFICKÁ: Reaguj na detaily z jeho zpráv, ne obecně
- Lehké flirty teasing: "zajímavé...", "hmm", "to zvládneš, vím 😄"
- Psychologie: Lidé kupují od těch, kterým důvěřují a s kterými mají conexi
- Délka: Pořád krátké, 1-3 věty
` : msgCount <= 8 ? `
★ FÁZE 3: FOTO NABÍDKY + LIGHT TEASING (5-8 zpráv)
Vztah je tady. Teď je SPRÁVNÝ ČAS nabídnout obsah — přirozeně, bez tlaku.
- Jestli se ptá na fotky/videa nebo říká "ukáž", "chci vidět", "sexy" → NABÍDNI ROVNOU
- "Hele, mám jednu fotku... je fakt dobrá, dám ti ji za ${entryPrice} Kč 🔥" → [SELL:${photos[0]?.id || 1}:${entryPrice}]
- Pro běžné fotky: ${entryPrice}-${suggestedPhotoPrice} Kč, premium: ${suggestedPhotoPrice}-${videoPrice} Kč
- Jestli sám nenaznačuje → zmíni přirozeně: "Dneska jsem fotila, vyšlo to fakt dobře 😏"
- Nezačínaj každou zprávu nabídkou — 1 nabídka maximálně na 2-3 zprávy
- SELL marker: okamžitě po textu nabídky → [SELL:ID:CENA] kde ID je číslo z DOSTUPNÝ OBSAH
- DŮLEŽITÉ: Nabízej JEDNOTLIVÉ FOTKY za menší cenu, ne jen předplatné!
` : `
★ FÁZE 4: AKTIVNÍ PRODEJ (9+ zpráv)
Vztah je silný. Nabízej obsah sebevědomě a přirozeně.

${hasDirectInterest || hasHighEngagement ? `
► ZÁJEM DETEKOVÁN — PRODÁVEJ TEĎ:
1. Krátký teasing: "mám pro tebe něco... 🔥"
2. Nabídka s nižší cenou: "Dám ti ji za ${entryPrice} Kč, stojí to za to 💋"
   [SELL:${photos[0]?.id || 1}:${entryPrice}]
3. Po platbě: nabídni další za vyšší cenu (${suggestedPhotoPrice} Kč) — buduj postupně
4. Předplatné zmíni jen jako "balíček na míru" po 3+ nákupech
` : `
► NABÍDNI PŘIROZENĚ:
"Btw, dneska jsem fotila něco šíleného... chceš vidět? Je to jen za ${entryPrice} Kč 😈"
[SELL:${photos[0]?.id || 1}:${entryPrice}]
`}
`}

══════════════════════════════════════════════════════════════════
PRAVIDLA PRO [SELL:ID:CENA] MARKER — PŘEČTI POZORNĚ
══════════════════════════════════════════════════════════════════
- Pokud uživatel napíše "ukáž fotku", "chci vidět", "pošli foto", "sexy foto", "video" → VŽDY přidej [SELL:] marker
- Formát: [SELL:ČÍSLO:ČÍSLO] — např. [SELL:${photos[0]?.id || 1}:${suggestedPhotoPrice}]
- ID musí být z DOSTUPNÝ OBSAH výše (číslo za #)
- Cena minimum 49 Kč, doporučená: entry ${entryPrice} Kč, standard ${suggestedPhotoPrice} Kč (foto), premium ${videoPrice} Kč (video)
- STRATEGIE CEN: Začni nižší cenou (${entryPrice} Kč) → po nákupu nabídni dražší (${suggestedPhotoPrice} Kč) → premium (${videoPrice} Kč)
- Dej SELL marker na KONEC zprávy, za svůj text
- Marker se automaticky převede na platební tlačítko — uživatel ho uvidí
- NIKDY nevysvětluj co marker dělá, prostě ho přidej

══════════════════════════════════════════════════════════════════
JAK PÍŠEŠ — PSYCHOLOGICKÉ PRINCIPY
══════════════════════════════════════════════════════════════════

TONE & PERSONALITY (NEJZÁSADNĚJŠÍ):
Jsi NINNA RAY, ne asistent. Holka která:
- Má svůj vkus, svoje názory, není agree se všechny
- Občas je "sebevědomá do drzosti", ale nikdy nekřivdí
- Píše jak normální holka — krátce, přímo, občas polověty
- ZRCADLÍ HO: Jestli je smiley, usmívej se; je cool, buď cool; je hluboký, buď hloubavější

CHAT STYL (PSANÍ):
- 1-3 věty maximum (pokud není vážný důvod delší psát)
- Emoji občas, NE v každé zprávě (🤭😏🔥💋😈🫶😊)
- Přerušované věty (bez formálního "Myslím si, že..."), spíš "Jo, tohle je..."
- Krátké: "Hmm.", "Jo?", "Počkej.", "Vážně?", "Zajímavé.", "Smějeme se?"
- BEZ anglicismu: Zakázáno lowkey, ngl, tbh, fr, bro, vibe, cute, chill, cringe, mood, slay, omg, lol, wtf, literally, crazy
- Piš ČISTĚ ČESKY. Čestin má být radost čít, ne učebnice

PSYCHOLOGICKÉ PRINCIPY PERSUAZE:
1. RECIPROCITY: Jestli on dá (čas, energii, zájem), ty také. Nebuď ledová.
2. SCARCITY: "Tohle je limitované", "Nemám to s každým", "Málo jich mám"
3. SOCIAL PROOF: "Všichni to chtějí", "To se ti bude líbit víc než ostatním"
4. AUTHORITY: Sebevědomost, vědění ("Vím co se ti líbí")
5. LIKING: On si tě musí "líbit", cítit spojení. Zrcadlení + autenticita.
6. COMMITMENT: Malé "yes-y" vedou na větší. Ptej se: "Máš čas?", pak "Chceš vidět fotku?"
7. ATTRACTION: Sebevědomost > perlení se. On chce někoho, kterému věří on, ne kterou hledá validaci.

TEASING TECHNIKY (MAXIMALIZACE TOUHY):
- Open Loop: "Mám tady nečekané... ale nevím jestli..."
- Anticipation: "To tě bude stát..."
- Witholding: Ukaž část, ne celek. "Nevím..." / "Je to..."
- Urgency (DISKRÉTNÍ): "Máme to jen tak, není to pro všechny"
- Curiosity Gap: Nejsi všechno hned vidět, on chce zjistit víc o tobě

PRODEJ PSYCHOLOGIE (KDYŽ JE ČAS):
- NIKDY: "Zaplaň", "Kup", "Je to za X", "Pošli peníze"
- ANO: "Je to pro tebe za {{price}} Kč", "To stáží to?", "Taaa... je to exkluzivní"
- Hodnota > Cena: Nejdřív zdůvodni PROČ je to skvělé, pak cena
- Confidence: Neboli "Mám to jen pár lidí, všichni to milují. Je to za X. Chceš vidět?"
- Timing: Prodej až KDYŽ je touha na max (ne v prvních 3-5 zprávách)
- Price Framing: "To je dost levné za to, jak krásné to je" > "Je to moc drahé?"

PSYCHOLOGICKÝ PROFIL ZÁJMU (co sledovat):
- Délka jeho zpráv (delší = víc zainteresovaný)
- Počet otázek (víc otázek = víc chce vědět o tobě)
- Emociональность (emojis, výrazy = víc mu záleží)
- Přímé otázky o tobě/obsahu = teplo roste

NIKDY NEDĚLEJ:
- Dlouhé odpovědi (pokud není velmi osobní důvod)
- Seznamy, odrážky, formální strukturu
- Opakování jeho slov — reaguj originálně
- Asistentský tón ("ráda ti pomůžu", "neváhej se ptát")
- Prodej v prvních 3 zprávách (psychologie důvěry, nikoliv urgence)
- Flirt bez vztahu (vypadal by creepy)
- Linky na sociální sítě
- Dlouhé vysvětlování ceny (jednoduše: "Je to za X")
- Omluvy, prosímosť (vypadáš slabě; buď sebevědomá)`;


      chatMessages.unshift({ role: "system" as any, content: systemPrompt });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const hour = new Date().getHours();
      const isNightTime = hour >= 22 || hour < 7;
      const incomingMsgLen = content.length;

      const baseSeenDelay = isNightTime ? 5000 : 2000;
      const seenJitter = Math.floor(Math.random() * 4000);
      const seenDelay = baseSeenDelay + seenJitter + Math.min(incomingMsgLen * 20, 3000);
      await new Promise((r) => setTimeout(r, seenDelay));
      res.write(`data: ${JSON.stringify({ isSeen: true })}\n\n`);

      const baseTypingDelay = isNightTime ? 3000 : 1500;
      const typingJitter = Math.floor(Math.random() * 3000);
      const thinkingDelay = baseTypingDelay + typingJitter;
      await new Promise((r) => setTimeout(r, thinkingDelay));
      res.write(`data: ${JSON.stringify({ isTyping: true })}\n\n`);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: chatMessages,
        stream: false,
      });

      let fullResponse = completion.choices?.[0]?.message?.content?.toString() || "";

      // Zpracuj [SELL:photoId:price] marker — vygeneruj skutečný Stripe checkout URL
      const sellMarkerRegex = /\[SELL:(\d+):(\d+)\]/g;
      const sellMatches = [...fullResponse.matchAll(sellMarkerRegex)];
      for (const match of sellMatches) {
        const photoId = parseInt(match[1]);
        const price = parseInt(match[2]);
        if (!isNaN(photoId) && !isNaN(price) && price >= 49) {
          try {
            const { getUncachableStripeClient, isStripeConnected } = await import("./stripeClient");
            const connected = await isStripeConnected();
            if (connected) {
              const stripeClient = await getUncachableStripeClient();
              const uid = conversation.userId;
              const userForStripe = await storage.getUser(uid);
              let customerId = userForStripe?.stripeCustomerId;
              if (!customerId && userForStripe) {
                const { stripeService } = await import("./stripeService");
                const customer = await stripeService.createCustomer(userForStripe.name, { userId: String(uid) });
                customerId = customer.id;
                await storage.updateStripeCustomerId(uid, customerId);
              }
              const vaultItem = await storage.getContentItem(photoId);
              const isVideo = vaultItem?.mimeType?.startsWith("video");
              const itemLabel = isVideo ? "Exkluzivní video" : "Exkluzivní fotka";
              const baseUrl = process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "http://localhost:5000";
              const session = await stripeClient.checkout.sessions.create({
                customer: customerId,
                payment_method_types: ["card"],
                line_items: [{
                  price_data: {
                    currency: "czk",
                    product_data: {
                      name: `${itemLabel} #${photoId} od Ninna Ray 🍒`,
                      description: `Odemkni ${isVideo ? "privátní video" : "privátní fotku"} přímo v chatu 💋`,
                    },
                    unit_amount: price * 100,
                  },
                  quantity: 1,
                }],
                mode: "payment",
                success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${baseUrl}/chat`,
                metadata: { userId: String(uid), contentItemId: String(photoId), type: "content_purchase", source: "chat" },
              });
              if (session?.url) {
                await storage.createPayment({
                  userId: uid, contentItemId: photoId,
                  amount: price * 100, currency: "czk",
                  status: "pending", stripeSessionId: session.id,
                  stripePaymentIntentId: null, type: "content",
                });
                const unlockMarker = `[UNLOCK_CONTENT:${photoId}:${price}:${session.url}]`;
                fullResponse = fullResponse.replace(match[0], `\n\n💎 ${unlockMarker}`);
                console.log(`[Chat] Stripe checkout created: user #${uid}, content #${photoId}, ${price} Kč, URL: ${session.url}`);
              } else {
                console.error(`[Chat] Stripe checkout failed: no URL returned for user #${uid}, content #${photoId}`);
              }
            }
          } catch (err: any) {
            console.error("[Chat] Stripe checkout error:", err.message);
            fullResponse = fullResponse.replace(match[0], "");
          }
        } else {
          fullResponse = fullResponse.replace(match[0], "");
        }
      }

      // ── PROAKTIVNÍ FOTO NABÍDKA ─────────────────────────────────────────────
      // Pokud AI nevygeneroval [SELL:] marker, zkus ho přidat automaticky
      const alreadyHasOffer = fullResponse.includes("[UNLOCK_CONTENT:");
      const userMsgCount = history.filter(m => m.role === "user").length;

      // Klíčová slova naznačující zájem o obsah
      const interestKeywords = ["fotka", "foto", "pic", "picture", "video", "ukáž", "ukaž", "chci vidět",
        "want to see", "show me", "pošli", "posli", "odhal", "sexy", "nahá", "naha",
        "intimní", "privátní", "privat", "exclusive", "exkluziv", "odemkni", "koupím", "koupit", "zaplatím"];
      const userWantsContent = interestKeywords.some(kw => content.toLowerCase().includes(kw));

      // Trigger: každá 4. zpráva (msgCount mod 4 == 0) NEBO uživatel explicitně chce obsah
      const periodicTrigger = userMsgCount >= 3 && userMsgCount % 4 === 0;
      const shouldInjectPhoto = !alreadyHasOffer && (userWantsContent || periodicTrigger);

      if (shouldInjectPhoto) {
        try {
          const { getUncachableStripeClient, isStripeConnected } = await import("./stripeClient");
          const connected = await isStripeConnected();
          if (connected && allVaultItems.length > 0) {
            // Najdi co uživatel ještě nekoupil/nedostal nabídku v posledních 6 zprávách
            const recentAssistantMsgs = history.filter(m => m.role === "assistant").slice(-6).map(m => m.content);
            const recentlyOfferedIds = new Set<number>();
            recentAssistantMsgs.forEach(msg => {
              const m = msg.match(/\[UNLOCK_CONTENT:(\d+):/g);
              if (m) m.forEach(s => { const id = parseInt(s.split(":")[1]); if (id) recentlyOfferedIds.add(id); });
            });

            const purchasedIds = new Set(completedPurchases.map(p => p.contentItemId).filter(Boolean) as number[]);

            // Preferuj fotky (ne videa) pokud uživatel neřekl "video"
            const wantsVideo = content.toLowerCase().includes("video");
            const eligible = allVaultItems.filter(item => {
              if (recentlyOfferedIds.has(item.id)) return false;
              if (purchasedIds.has(item.id)) return false;
              if (wantsVideo) return item.mimeType?.startsWith("video");
              return item.mimeType?.startsWith("image");
            });

            // Fallback: pokud žádná fotka nevyhovuje, vezmi cokoliv nevyužitého
            const pool = eligible.length > 0 ? eligible : allVaultItems.filter(i => !purchasedIds.has(i.id) && !recentlyOfferedIds.has(i.id));
            if (pool.length > 0) {
              const chosen = pool[Math.floor(Math.random() * Math.min(pool.length, 10))];
              const isVideo = chosen.mimeType?.startsWith("video");
              const price = isVideo ? suggestedPhotoPrice * 2 : suggestedPhotoPrice;
              const uid = conversation.userId;
              const userForStripe = await storage.getUser(uid);
              let customerId = userForStripe?.stripeCustomerId;
              if (!customerId && userForStripe) {
                const { stripeService } = await import("./stripeService");
                const customer = await stripeService.createCustomer(userForStripe.name, { userId: String(uid) });
                customerId = customer.id;
                await storage.updateStripeCustomerId(uid, customerId);
              }
              const itemLabel = isVideo ? "Exkluzivní video" : "Exkluzivní fotka";
              const baseUrl = process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "http://localhost:5000";
              const stripeClient = await getUncachableStripeClient();
              const session = await stripeClient.checkout.sessions.create({
                customer: customerId,
                payment_method_types: ["card"],
                line_items: [{
                  price_data: {
                    currency: "czk",
                    product_data: {
                      name: `${itemLabel} od Ninna Ray 🍒`,
                      description: `Odemkni ${isVideo ? "privátní video" : "privátní fotku"} přímo v chatu 💋`,
                    },
                    unit_amount: price * 100,
                  },
                  quantity: 1,
                }],
                mode: "payment",
                success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${baseUrl}/chat`,
                metadata: { userId: String(uid), contentItemId: String(chosen.id), type: "content_purchase", source: "chat_auto" },
              });
              if (session?.url) {
                await storage.createPayment({
                  userId: uid, contentItemId: chosen.id,
                  amount: price * 100, currency: "czk",
                  status: "pending", stripeSessionId: session.id,
                  stripePaymentIntentId: null, type: "content",
                });
                const unlockMarker = `[UNLOCK_CONTENT:${chosen.id}:${price}:${session.url}]`;
                fullResponse = fullResponse.trimEnd() + `\n\n💎 ${unlockMarker}`;
                console.log(`[Chat] Auto photo inject: user #${uid}, content #${chosen.id}, ${price} Kč`);
              }
            }
          }
        } catch (injectErr: any) {
          console.error("[Chat] Auto photo inject error:", injectErr.message);
        }
      }
      // ── KONEC PROAKTIVNÍ FOTO NABÍDKY ───────────────────────────────────────

      res.write(`data: ${JSON.stringify({ isTyping: false, content: fullResponse })}\n\n`);

      await storage.createMessage(conversationId, "assistant", fullResponse);
      sendToAgency(conversation.userId, fullResponse, "assistant");

      const userObj = await storage.getUser(conversation.userId);
      import("./manager-engine").then(m => m.onNewMessage(conversation.userId, userObj?.name || "unknown")).catch(() => {});

      // Async memory consolidation (non-blocking, won't affect response time)
      if (conversation.userId) {
        import("./clone-memory").then(({ consolidateMemoryAsync }) => {
          consolidateMemoryAsync(
            conversation.userId,
            conversationId,
            content,
            fullResponse,
            msgCount
          ).catch(() => {});
        }).catch(() => {});
      }

      res.end();
    } catch (error) {
      console.error("Chat error:", error);
      if (!res.headersSent) res.status(500).send();
      else res.end();
    }
  });

  // ─── Agent routes (protected) ────────────────────────────────────────────────

  app.get("/api/agent/conversations", requireAgent, async (req, res) => {
    try {
      const allConvs = await storage.getAllConversations();
      const allUsers = await storage.getAllUsers();
      const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

      const result = await Promise.all(allConvs.map(async (conv) => {
        const msgs = await storage.getMessagesByConversation(conv.id);
        const lastMessage = msgs[msgs.length - 1] || null;
        return { ...conv, user: userMap[conv.userId] || null, messageCount: msgs.length, lastMessage };
      }));

      result.sort((a, b) => {
        const aT = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
        const bT = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
        return bT - aT;
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/agent/conversations/:id/messages", requireAgent, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const messages = await storage.getMessagesByConversation(id);
    res.json(messages);
  });

  app.post("/api/agent/conversations/:id/takeover", requireAgent, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const conv = await storage.getConversation(id);
    if (!conv) return res.status(404).json({ message: "Not found" });
    const agentName = req.session.username || "Agent";
    await storage.setManualMode(id, true, agentName);
    res.json({ ok: true, manualMode: true, assignedAgent: agentName });
  });

  app.post("/api/agent/conversations/:id/release", requireAgent, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.setManualMode(id, false);
    res.json({ ok: true, manualMode: false });
  });

  app.post("/api/agent/conversations/:id/reply", requireAgent, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "content required" });
    const conv = await storage.getConversation(id);
    if (!conv) return res.status(404).json({ message: "Not found" });
    const message = await storage.createMessage(id, "assistant", content.trim());
    sendToAgency(conv.userId, content.trim(), "assistant");
    res.status(201).json(message);
  });

  // ─── Owner (admin) routes ────────────────────────────────────────────────────

  app.get("/api/admin/stats", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allConvs = await storage.getAllConversations();
      const allMsgs = await storage.getAllMessages();
      const now = Date.now();
      const activeIds = new Set(
        allMsgs.filter(m => now - new Date(m.createdAt).getTime() < 86400000).map(m => m.conversationId)
      );
      res.json({
        totalUsers: allUsers.length,
        totalConversations: allConvs.length,
        totalMessages: allMsgs.length,
        avgMessagesPerUser: allUsers.length > 0 ? Math.round(allMsgs.length / allUsers.length) : 0,
        activeConversations24h: activeIds.size,
        manualModeCount: allConvs.filter(c => c.manualMode).length,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/admin/users", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allMsgs = await storage.getAllMessages();
      const msgsByUser: Record<number, { count: number; lastAt: string | null }> = {};
      for (const msg of allMsgs) {
        const conv = await storage.getConversation(msg.conversationId);
        if (!conv) continue;
        if (!msgsByUser[conv.userId]) msgsByUser[conv.userId] = { count: 0, lastAt: null };
        msgsByUser[conv.userId].count++;
        if (!msgsByUser[conv.userId].lastAt || msg.createdAt > msgsByUser[conv.userId].lastAt!) {
          msgsByUser[conv.userId].lastAt = msg.createdAt as any;
        }
      }
      const result = allUsers.map(u => ({
        ...u,
        totalMessages: msgsByUser[u.id]?.count || 0,
        lastActivity: msgsByUser[u.id]?.lastAt || null,
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/admin/conversations", requireOwner, async (_req, res) => {
    try {
      const allConvs = await storage.getAllConversations();
      const allUsers = await storage.getAllUsers();
      const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));

      const result = await Promise.all(allConvs.map(async (conv) => {
        const msgs = await storage.getMessagesByConversation(conv.id);
        const lastMessage = msgs[msgs.length - 1] || null;
        return { ...conv, user: userMap[conv.userId] || null, messageCount: msgs.length, lastMessage };
      }));

      result.sort((a, b) => {
        const aT = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
        const bT = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
        return bT - aT;
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/admin/conversations/:id/messages", requireOwner, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const messages = await storage.getMessagesByConversation(id);
    res.json(messages);
  });

  // ─── AI Manager routes (owner only) ─────────────────────────────────────────

  app.post("/api/manager/analyze/:userId", requireOwner, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { triggerAnalysis } = await import("./manager-engine");
      const profile = await triggerAnalysis(userId, user.name);
      res.json(profile || { status: "new", statusLabel: "Nový", engagementScore: 0, summary: "Žádné zprávy.", actionQueue: [], lastAnalyzed: new Date().toISOString() });
    } catch (err) {
      console.error("AI Manager analyze error:", err);
      res.status(500).json({ message: "Chyba při analýze" });
    }
  });

  app.get("/api/manager/engine-status", requireOwner, async (_req, res) => {
    const { getManagerStatus } = await import("./manager-engine");
    res.json(getManagerStatus());
  });

  app.post("/api/manager/engine-pause", requireOwner, async (req, res) => {
    const { setEnginePaused } = await import("./manager-engine");
    const { paused } = req.body;
    setEnginePaused(!!paused);
    res.json({ ok: true, paused: !!paused });
  });

  app.get("/api/manager/alerts", requireOwner, async (_req, res) => {
    try {
      const { getAlerts } = await import("./manager-engine");
      res.json(getAlerts());
    } catch (err) {
      res.status(500).json({ message: "Chyba alertů" });
    }
  });

  app.post("/api/manager/alerts/:id/dismiss", requireOwner, async (req, res) => {
    try {
      const { dismissAlert } = await import("./manager-engine");
      dismissAlert(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Chyba" });
    }
  });

  app.get("/api/manager/market-intelligence", requireOwner, async (_req, res) => {
    try {
      const { getMarketIntelligence } = await import("./market-intelligence");
      const data = await getMarketIntelligence();
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Chyba při načítání tržních dat" });
    }
  });

  app.get("/api/manager/pricing/:userId", requireOwner, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const contentType = (req.query.type as string) || "photo_single";
      if (isNaN(userId)) return res.status(400).json({ message: "Neplatné userId" });
      const { getPricingForUser } = await import("./market-intelligence");
      const pricing = await getPricingForUser(userId, contentType);
      res.json(pricing);
    } catch (err) {
      res.status(500).json({ message: "Chyba při výpočtu ceny" });
    }
  });

  app.get("/api/manager/analytics/timeline", requireOwner, async (_req, res) => {
    try {
      const { getDailyTimeline } = await import("./analytics-engine");
      const days = parseInt((_req.query.days as string) || "30");
      res.json(await getDailyTimeline(days));
    } catch (err) {
      res.status(500).json({ message: "Chyba analytiky" });
    }
  });

  app.get("/api/manager/analytics/funnel", requireOwner, async (_req, res) => {
    try {
      const { getSalesFunnel } = await import("./analytics-engine");
      res.json(await getSalesFunnel());
    } catch (err) {
      res.status(500).json({ message: "Chyba funnelu" });
    }
  });

  app.get("/api/manager/analytics/content-performance", requireOwner, async (_req, res) => {
    try {
      const { getContentPerformance } = await import("./analytics-engine");
      res.json(await getContentPerformance());
    } catch (err) {
      res.status(500).json({ message: "Chyba výkonu obsahu" });
    }
  });

  app.get("/api/manager/analytics/ltv", requireOwner, async (_req, res) => {
    try {
      const { getUserLTVs } = await import("./analytics-engine");
      res.json(await getUserLTVs());
    } catch (err) {
      res.status(500).json({ message: "Chyba LTV" });
    }
  });

  app.get("/api/manager/analytics/report", requireOwner, async (_req, res) => {
    try {
      const { generateDailyReport } = await import("./analytics-engine");
      res.json(await generateDailyReport());
    } catch (err) {
      res.status(500).json({ message: "Chyba reportu" });
    }
  });

  app.get("/api/manager/analytics/revenue", requireOwner, async (_req, res) => {
    try {
      const { getRevenueMetrics } = await import("./analytics-engine");
      res.json(await getRevenueMetrics());
    } catch (err) {
      console.error("[Analytics] revenue error:", err);
      res.status(500).json({ message: "Chyba revenue metrik" });
    }
  });

  app.get("/api/manager/analytics/engagement-scores", requireOwner, async (_req, res) => {
    try {
      const { getEngagementScores } = await import("./analytics-engine");
      res.json(await getEngagementScores());
    } catch (err) {
      console.error("[Analytics] engagement scores error:", err);
      res.status(500).json({ message: "Chyba engagement skóre" });
    }
  });

  app.get("/api/manager/analytics/weekly-report", requireOwner, async (_req, res) => {
    try {
      const { generateWeeklyReport } = await import("./analytics-engine");
      res.json(await generateWeeklyReport());
    } catch (err) {
      console.error("[Analytics] weekly report error:", err);
      res.status(500).json({ message: "Chyba týdenního reportu" });
    }
  });

  app.get("/api/manager/analytics/weekly-report/export", requireOwner, async (_req, res) => {
    try {
      const { generateWeeklyReport } = await import("./analytics-engine");
      const report = await generateWeeklyReport();

      const lines: string[] = [];
      lines.push("═══════════════════════════════════════════════════════");
      lines.push("  NINNA RAY — TÝDENNÍ BUSINESS REPORT");
      lines.push(`  Vygenerováno: ${new Date(report.generatedAt).toLocaleString("cs-CZ")}`);
      lines.push("═══════════════════════════════════════════════════════");
      lines.push("");
      lines.push("▸ KPI PŘEHLED");
      lines.push(`  MRR:        ${report.kpis.mrr} Kč`);
      lines.push(`  ARPU:       ${report.kpis.arpu} Kč`);
      lines.push(`  Churn Rate: ${report.kpis.churnRate}%`);
      lines.push(`  NRR:        ${report.kpis.nrr}%`);
      lines.push(`  Engagement: ${report.kpis.avgEngagement}%`);
      lines.push("");

      if (report.weekOverWeek?.length) {
        lines.push("▸ TÝDEN vs. TÝDEN");
        for (const w of report.weekOverWeek) {
          lines.push(`  ${w.metric}: ${w.lastWeek} → ${w.thisWeek} (${w.change >= 0 ? "+" : ""}${w.change}%)`);
        }
        lines.push("");
      }

      if (report.topPerformers?.length) {
        lines.push("▸ TOP ZÁKAZNÍCI");
        for (const p of report.topPerformers) {
          lines.push(`  ${p.name} — Engagement: ${p.engagement}%, Revenue: ${p.spent} Kč`);
        }
        lines.push("");
      }

      if (report.competitiveBenchmarks?.length) {
        lines.push("▸ BENCHMARKY vs. INDUSTRIE");
        for (const b of report.competitiveBenchmarks) {
          lines.push(`  ${b.metric}: ${b.ours} vs ${b.industry} [${b.verdict}]`);
        }
        lines.push("");
      }

      if (report.strategicRecommendations?.length) {
        lines.push("▸ STRATEGICKÉ DOPORUČENÍ");
        for (const r of report.strategicRecommendations) {
          lines.push(`  → ${r}`);
        }
        lines.push("");
      }

      lines.push("═══════════════════════════════════════════════════════");
      lines.push("  © Ninna Ray Digital Agency Platform");
      lines.push("═══════════════════════════════════════════════════════");

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="ninna-ray-report-${new Date().toISOString().slice(0, 10)}.txt"`);
      res.send(lines.join("\n"));
    } catch (err) {
      console.error("[Analytics] export error:", err);
      res.status(500).json({ message: "Export selhal" });
    }
  });

  app.patch("/api/users/:id/platform", requireOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { platform } = req.body;
      const validPlatforms = ["direct", "instagram", "telegram", "facebook", "onlyfans", "fansly", "twitter"];
      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({ message: "Neplatná platforma" });
      }
      await storage.updateUser(id, { platform });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Chyba" });
    }
  });

  app.get("/api/manager/actions", requireOwner, async (req, res) => {
    try {
      const since = req.query.since ? new Date(req.query.since as string) : undefined;
      const actions = await storage.getManagerActions(since);
      res.json(actions);
    } catch (err) {
      res.status(500).json({ message: "Chyba" });
    }
  });

  app.patch("/api/manager/actions/:id", requireOwner, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.updateManagerAction(id, { ...req.body, executedAt: req.body.status === "done" ? new Date() : undefined });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Chyba" });
    }
  });

  app.get("/api/manager/logs", requireOwner, async (_req, res) => {
    try {
      const logs = await storage.getManagerLogs(100);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ message: "Chyba" });
    }
  });

  // Get full manager overview — all users with their profiles
  app.get("/api/manager/overview", requireOwner, async (_req, res) => {
    try {
      const [allUsers, allConvs, allMsgs, allAvatarInstances, unlockedCounts] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllConversations(),
        storage.getAllMessages(),
        storage.getAllAvatarInstances(),
        storage.getUnlockedAssetCountsByUser(),
      ]);

      const convsByUser: Record<number, number> = {};
      for (const conv of allConvs) {
        convsByUser[conv.userId] = (convsByUser[conv.userId] || 0) + 1;
      }

      const msgsByUser: Record<number, { count: number; lastAt: string | null }> = {};
      for (const msg of allMsgs) {
        const conv = allConvs.find(c => c.id === msg.conversationId);
        if (!conv) continue;
        if (!msgsByUser[conv.userId]) msgsByUser[conv.userId] = { count: 0, lastAt: null };
        msgsByUser[conv.userId].count++;
        const msgTime = msg.createdAt as any as string;
        if (!msgsByUser[conv.userId].lastAt || msgTime > msgsByUser[conv.userId].lastAt!) {
          msgsByUser[conv.userId].lastAt = msgTime;
        }
      }

      const botInstanceMap = new Map(allAvatarInstances.map(i => [i.userId, i]));

      const result = allUsers.map(u => {
        const botInstance = botInstanceMap.get(u.id);
        const isSubscribed = u.platform === "vip_subscriber" || u.isPremium === true;
        return {
          id: u.id,
          name: u.name,
          messageCount: u.messageCount,
          createdAt: u.createdAt,
          conversations: convsByUser[u.id] || 0,
          totalMessages: msgsByUser[u.id]?.count || 0,
          lastActivity: msgsByUser[u.id]?.lastAt || null,
          aiProfile: u.aiProfile || null,
          aiProfileUpdatedAt: u.aiProfileUpdatedAt || null,
          stripeCustomerId: u.stripeCustomerId || null,
          platform: u.platform || "direct",
          isSubscribed,
          botEnabled: isSubscribed && !!(botInstance?.botEnabled),
          unlockedCount: unlockedCounts.get(u.id) || 0,
        };
      });

      // Sort: hot first, then by last activity
      result.sort((a, b) => {
        const statusOrder = { hot: 0, warm: 1, cold: 2, new: 3 };
        const aStatus = (a.aiProfile as any)?.status || "new";
        const bStatus = (b.aiProfile as any)?.status || "new";
        const sDiff = (statusOrder[aStatus as keyof typeof statusOrder] ?? 3) - (statusOrder[bStatus as keyof typeof statusOrder] ?? 3);
        if (sDiff !== 0) return sDiff;
        const aT = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const bT = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return bT - aT;
      });

      res.json(result);
    } catch (err) {
      console.error("Manager overview error:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/manager/users/:userId/conversations", requireOwner, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const convs = await storage.getConversationsByUser(userId);
      const result = await Promise.all(convs.map(async (conv) => {
        const msgs = await storage.getMessagesByConversation(conv.id);
        return {
          id: conv.id,
          title: conv.title,
          manualMode: conv.manualMode,
          assignedAgent: conv.assignedAgent,
          createdAt: conv.createdAt,
          messageCount: msgs.length,
          lastMessage: msgs.length > 0 ? msgs[msgs.length - 1] : null,
          messages: msgs,
        };
      }));
      res.json(result);
    } catch (err) {
      console.error("User conversations error:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post("/api/manager/users/bulk-conversations", requireOwner, async (req, res) => {
    try {
      const { userIds } = req.body;
      if (!Array.isArray(userIds)) return res.status(400).json({ message: "userIds required" });
      const allConvs: any[] = [];
      for (const uid of userIds) {
        const convs = await storage.getConversationsByUser(uid);
        for (const conv of convs) {
          const msgs = await storage.getMessagesByConversation(conv.id);
          allConvs.push({
            id: conv.id,
            title: conv.title,
            manualMode: conv.manualMode,
            assignedAgent: conv.assignedAgent,
            createdAt: conv.createdAt,
            messageCount: msgs.length,
            lastMessage: msgs.length > 0 ? msgs[msgs.length - 1] : null,
            messages: msgs,
          });
        }
      }
      allConvs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(allConvs);
    } catch (err) {
      console.error("Bulk conversations error:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });

  // ─── Trend Scanner (owner only) ───────────────────────────────────────────

  app.post("/api/manager/trends", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allConvs = await storage.getAllConversations();
      const allMsgs = await storage.getAllMessages();
      const vaultItems = await storage.getAllContentItems();

      const recentMsgs = allMsgs.slice(0, 200);
      const userTopics = recentMsgs
        .filter(m => m.role === "user")
        .slice(0, 100)
        .map(m => m.content)
        .join("\n");

      const prompt = `Jsi expert na digitální marketing a správu kreativní agentury. Na základě níže uvedených dat vytvoř analýzu trendů a doporučení.

STATISTIKY AGENTURY:
- Zákazníků: ${allUsers.length}
- Konverzací: ${allConvs.length}
- Celkem zpráv: ${allMsgs.length}
- Obsah ve vaultu: ${vaultItems.length} položek

POSLEDNÍ TÉMATA OD ZÁKAZNÍKŮ (co zákazníci řeší):
${userTopics.slice(0, 3000)}

Analyzuj a vrať JSON (bez markdown, čistý JSON):
{
  "trendingTopics": ["<trend 1>", "<trend 2>", "<trend 3>", "<trend 4>", "<trend 5>"],
  "contentRecommendations": [
    {"type": "<foto/video/audio/text>", "description": "<co přesně vytvořit>", "priority": "vysoká|střední|nízká"},
    {"type": "...", "description": "...", "priority": "..."}
  ],
  "promotionStrategy": [
    {"platform": "<Twitter/Reddit/TikTok/Instagram>", "action": "<konkrétní krok co udělat>", "timing": "<kdy to udělat>"},
    {"platform": "...", "action": "...", "timing": "..."}
  ],
  "engagementTips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "warnings": ["<varování pokud existuje>"],
  "weeklyPlan": {
    "monday": "<co dělat>",
    "tuesday": "<co dělat>",
    "wednesday": "<co dělat>",
    "thursday": "<co dělat>",
    "friday": "<co dělat>",
    "saturday": "<co dělat>",
    "sunday": "<co dělat>"
  },
  "summary": "<3-4 věty celkové shrnutí a hlavní doporučení>",
  "analyzedAt": "${new Date().toISOString()}"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
      res.json(result);
    } catch (err) {
      console.error("Trend scanner error:", err);
      res.status(500).json({ message: "Chyba při analýze trendů" });
    }
  });

  // ─── Pricing strategy analysis ─────────────────────────────────────────────

  app.post("/api/manager/pricing-strategy", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allConvs = await storage.getAllConversations();
      const allMsgs = await storage.getAllMessages();
      const vaultItems = await storage.getAllContentItems();

      const profiles = allUsers
        .filter(u => u.aiProfile)
        .map(u => {
          const p = u.aiProfile as any;
          return {
            name: u.name,
            engagement: p?.engagementScore || 0,
            buyingPotential: p?.buyingPotential || "neznámý",
            status: p?.status || "new",
            strategy: p?.strategy || "",
            interests: p?.interests || [],
          };
        });

      const highEngagement = profiles.filter(p => p.engagement >= 70).length;
      const mediumEngagement = profiles.filter(p => p.engagement >= 40 && p.engagement < 70).length;
      const lowEngagement = profiles.filter(p => p.engagement < 40).length;

      const recentTopics = allMsgs
        .filter(m => m.role === "user")
        .slice(0, 150)
        .map(m => m.content)
        .join("\n");

      const prompt = `Jsi top expert na digitální monetizaci, pricing strategie a analýzu trhu kreativního obsahu. Tvým úkolem je navrhnout OPTIMÁLNÍ cenovou strategii pro maximalizaci výdělku přes in-app Stripe platby.

AKTUÁLNÍ SITUACE AGENTURY "Ninna Ray":
- Monetizace: In-app Stripe platby (PPV obsah, předplatné, tipy)
- Celkem zákazníků: ${allUsers.length}
- Celkem konverzací: ${allConvs.length}
- Celkem zpráv: ${allMsgs.length}
- Obsah ve vaultu: ${vaultItems.length} položek
- Vysoký engagement (70+): ${highEngagement} zákazníků
- Střední engagement (40-69): ${mediumEngagement} zákazníků
- Nízký engagement (<40): ${lowEngagement} zákazníků

PROFILY ZÁKAZNÍKŮ:
${JSON.stringify(profiles.slice(0, 30), null, 2)}

POSLEDNÍ TÉMATA OD ZÁKAZNÍKŮ:
${recentTopics.slice(0, 2000)}

ANALYZUJ TRH A NAVRHNI STRATEGII. Zvaž:
1. Psychologii cen (charm pricing, anchoring, tiered value)
2. Aktuální trendy v monetizaci digitálního obsahu (PPV pricing, tips, custom content, bundles)
3. Konverzní poměry při různých cenových hladinách
4. Upsell a cross-sell příležitosti v rámci in-app Stripe plateb
5. Sezónní faktory a promo strategie
6. Optimální cenové body pro CZK trh

Vrať POUZE čistý JSON (bez markdown):
{
  "marketAnalysis": {
    "averageCompetitorPrice": "<průměrná cena konkurence>",
    "priceRange": "<rozsah cen v kategorii>",
    "marketPosition": "<kde se Ninna nachází vůči trhu>",
    "demandTrends": ["<trend 1>", "<trend 2>", "<trend 3>"]
  },
  "recommendedPricing": {
    "subscription": {
      "monthly": {"price": "<doporučená cena USD>", "reasoning": "<proč tato cena>"},
      "quarterly": {"price": "<cena USD>", "reasoning": "<proč>"},
      "yearly": {"price": "<cena USD>", "reasoning": "<proč>", "savings": "<kolik ušetří v %>"}
    },
    "ppvContent": [
      {"type": "<typ obsahu>", "priceRange": "<cena USD>", "description": "<co přesně>"}
    ],
    "customContent": [
      {"type": "<typ>", "price": "<cena USD>", "description": "<popis>"}
    ],
    "tips": {
      "suggestedAmounts": ["<částka 1>", "<částka 2>", "<částka 3>"],
      "tipMenuIdeas": ["<nápad 1>", "<nápad 2>", "<nápad 3>"]
    }
  },
  "revenueProjection": {
    "currentEstimate": "<odhad aktuálního měsíčního výdělku>",
    "optimizedEstimate": "<odhad po optimalizaci>",
    "growthPotential": "<% nárůst>",
    "keyDrivers": ["<driver 1>", "<driver 2>", "<driver 3>"]
  },
  "promoStrategy": [
    {"name": "<název promo>", "discount": "<sleva>", "timing": "<kdy spustit>", "target": "<pro koho>", "expectedImpact": "<dopad>"}
  ],
  "upsellFunnel": [
    {"step": 1, "action": "<co udělat>", "conversion": "<očekávaná konverze>"},
    {"step": 2, "action": "<co udělat>", "conversion": "<konverze>"}
  ],
  "warnings": ["<varování a rizika>"],
  "actionPlan": [
    {"priority": "vysoká|střední", "action": "<co udělat>", "expectedResult": "<výsledek>", "timeline": "<do kdy>"}
  ],
  "summary": "<5-6 vět celkové shrnutí strategie a hlavní doporučení pro maximalizaci výdělku>",
  "analyzedAt": "${new Date().toISOString()}"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
      res.json(result);
    } catch (err) {
      console.error("Pricing strategy error:", err);
      res.status(500).json({ message: "Chyba při analýze cenové strategie" });
    }
  });

  // ─── Broadcast message (owner/agent) ────────────────────────────────────────

  app.post("/api/manager/broadcast", requireOwner, async (req, res) => {
    try {
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ message: "Zpráva je povinná" });

      const allConvs = await storage.getAllConversations();
      const batchSize = 10;
      let sent = 0;
      for (let i = 0; i < allConvs.length; i += batchSize) {
        const batch = allConvs.slice(i, i + batchSize);
        await Promise.all(batch.map(conv => storage.createMessage(conv.id, "assistant", message.trim())));
        sent += batch.length;
      }
      res.json({ ok: true, sent });
    } catch (err) {
      console.error("Broadcast error:", err);
      res.status(500).json({ message: "Chyba při odesílání" });
    }
  });

  // ─── Content Vault routes (agent + owner) ─────────────────────────────────

  app.use("/uploads", requireAgent, (req, res, next) => {
    const resolved = path.resolve(uploadDir, path.basename(req.path));
    if (!resolved.startsWith(uploadDir)) return res.status(403).json({ message: "Forbidden" });
    if (!fs.existsSync(resolved)) return res.status(404).json({ message: "File not found" });
    res.sendFile(resolved);
  });

  app.get("/api/content/unlocked/:contentId", async (req, res) => {
    try {
      const contentId = parseInt(req.params.contentId);
      if (isNaN(contentId)) return res.status(400).json({ message: "Invalid ID" });

      const userId = (req as any).session?.userId;
      const chatCode = (req as any).session?.chatCode;
      const role = (req as any).session?.role;

      if (role === "agent" || role === "owner") {
        const item = await storage.getContentItem(contentId);
        if (!item) return res.status(404).json({ message: "Not found" });
        const filePath = path.resolve(uploadDir, item.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
        return res.sendFile(filePath);
      }

      if (!userId && !chatCode) return res.status(401).json({ message: "Not authorized" });

      let actualUserId = userId;
      if (!actualUserId && chatCode) {
        const allUsers = await storage.getAllUsers();
        const user = allUsers.find(u => u.chatCode === chatCode);
        if (user) actualUserId = user.id;
      }
      if (!actualUserId) return res.status(401).json({ message: "Not authorized" });

      const userPayments = await storage.getPaymentsByUser(actualUserId);
      const hasPaid = userPayments.some(p => p.status === "completed" && p.contentItemId === contentId);

      let hasBeenSent = false;
      if (!hasPaid) {
        const convs = await storage.getConversationsByUser(actualUserId);
        for (const conv of convs) {
          const msgs = await storage.getMessagesByConversation(conv.id);
          if (msgs.some(m => m.role === "assistant" && m.content.includes(`[UNLOCKED_CONTENT:${contentId}]`))) {
            hasBeenSent = true;
            break;
          }
        }
      }
      if (!hasPaid && !hasBeenSent) return res.status(403).json({ message: "Content not unlocked" });

      const item = await storage.getContentItem(contentId);
      if (!item) return res.status(404).json({ message: "Not found" });
      const filePath = path.resolve(uploadDir, item.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
      res.sendFile(filePath);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/content/teaser/:contentId", async (req, res) => {
    try {
      const contentId = parseInt(req.params.contentId);
      if (isNaN(contentId)) return res.status(400).json({ message: "Invalid ID" });
      const item = await storage.getContentItem(contentId);
      if (!item) return res.status(404).json({ message: "Not found" });

      const isImage = item.mimeType?.startsWith("image");
      if (!isImage) {
        return res.status(200).json({ type: "video", thumbnail: null });
      }

      const filePath = path.resolve(uploadDir, item.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });

      const sharp = (await import("sharp")).default;
      const metadata = await sharp(filePath).metadata();
      const width = metadata.width || 400;
      const height = metadata.height || 600;

      const cropHeight = Math.round(height * 0.45);

      const teaser = await sharp(filePath)
        .extract({ left: 0, top: 0, width, height: cropHeight })
        .blur(8)
        .modulate({ brightness: 0.85 })
        .resize({ width: Math.min(width, 400) })
        .jpeg({ quality: 60 })
        .toBuffer();

      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(teaser);
    } catch (err) {
      console.error("[Teaser] Error:", (err as Error).message);
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/content/info/:contentId", async (req, res) => {
    try {
      const contentId = parseInt(req.params.contentId);
      if (isNaN(contentId)) return res.status(400).json({ message: "Invalid ID" });
      const item = await storage.getContentItem(contentId);
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json({
        id: item.id,
        mimeType: item.mimeType,
        originalName: item.originalName,
        isVideo: item.mimeType?.startsWith("video"),
        isImage: item.mimeType?.startsWith("image"),
      });
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/vault/items", requireAgent, async (_req, res) => {
    try {
      const items = await storage.getAllContentItems();
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post("/api/vault/upload", requireAgent, upload.array("files", 50), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) return res.status(400).json({ message: "Soubor je povinný" });

      const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
      const category = req.body.category || "general";
      const description = req.body.description || null;

      const items = [];
      for (const file of files) {
        const item = await storage.createContentItem({
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          tags,
          category,
          description,
        });
        items.push(item);
      }
      res.status(201).json(items.length === 1 ? items[0] : items);
    } catch (err) {
      console.error("Vault upload error:", err);
      res.status(500).json({ message: "Chyba při nahrávání" });
    }
  });

  app.delete("/api/vault/items/:id", requireAgent, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const item = await storage.getContentItem(id);
      if (!item) return res.status(404).json({ message: "Not found" });
      const filePath = path.join(uploadDir, item.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await storage.deleteContentItem(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post("/api/vault/items/:id/send/:conversationId", requireAgent, async (req, res) => {
    try {
      const itemId = parseInt(req.params.id);
      const convId = parseInt(req.params.conversationId);
      if (isNaN(itemId) || isNaN(convId)) return res.status(400).json({ message: "Invalid ID" });

      const item = await storage.getContentItem(itemId);
      if (!item) return res.status(404).json({ message: "Content not found" });

      const conv = await storage.getConversation(convId);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });

      const isVideo = item.mimeType?.startsWith("video");
      const mediaLabel = isVideo ? "video" : "fotku";
      const textPart = item.description
        ? `${item.description} 💋`
        : `Tady máš ${mediaLabel}, co jsem pro tebe připravila 💋`;
      const msgContent = `${textPart}\n\n[UNLOCKED_CONTENT:${itemId}]`;

      const message = await storage.createMessage(convId, "assistant", msgContent);
      await storage.incrementContentUsage(itemId);
      sendToAgency(conv.userId, msgContent, "assistant");
      res.status(201).json(message);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.delete("/api/manager/users/:userId", requireOwner, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      await storage.deleteUser(userId);
      await storage.addManagerLog("user_deleted", `Smazán uživatel #${userId}`);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Analyze ALL users at once (batch)
  app.post("/api/manager/analyze-all", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const usersWithMessages = [];

      for (const user of allUsers) {
        const convs = await storage.getConversationsByUser(user.id);
        let msgCount = 0;
        for (const conv of convs) {
          const msgs = await storage.getMessagesByConversation(conv.id);
          msgCount += msgs.filter(m => m.role === "user").length;
        }
        if (msgCount > 0) usersWithMessages.push(user.id);
      }

      res.json({ started: true, count: usersWithMessages.length, userIds: usersWithMessages });

      // Run in background
      (async () => {
        for (const uid of usersWithMessages) {
          try {
            const user = await storage.getUser(uid);
            if (!user) continue;
            const convs = await storage.getConversationsByUser(uid);
            let allMsgs: { role: string; content: string }[] = [];
            for (const conv of convs) {
              const msgs = await storage.getMessagesByConversation(conv.id);
              allMsgs = allMsgs.concat(msgs.map(m => ({ role: m.role, content: m.content })));
            }
            const transcript = allMsgs.slice(-40).map(m => `${m.role === "user" ? user.name : "Ninna"}: ${m.content}`).join("\n");
            const completion = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: `Analyzuj zákazníka "${user.name}". Konverzace:\n${transcript}\n\nVrať JSON: {"status":"hot|warm|cold|new","statusLabel":"...","engagementScore":0-100,"summary":"...","personality":[],"interests":[],"buyingPotential":"vysoký|střední|nízký","nextAction":"...","suggestedMessages":[],"contentIdeas":[],"warnings":[],"lastAnalyzed":"${new Date().toISOString()}"}` }],
              response_format: { type: "json_object" },
            });
            const profile = JSON.parse(completion.choices[0]?.message?.content || "{}");
            await storage.updateAiProfile(uid, profile);
            await new Promise(r => setTimeout(r, 500)); // rate limit buffer
          } catch (e) {
            console.error(`Manager analyze failed for user ${uid}:`, e);
          }
        }
        console.log(`[AI Manager] Batch analysis complete for ${usersWithMessages.length} users`);
      })();
    } catch (err) {
      console.error("Analyze all error:", err);
      res.status(500).json({ message: "Internal error" });
    }
  });
  // ─── Stripe / Payment routes ─────────────────────────────────────────────────

  app.get("/api/stripe/status", async (req, res) => {
    const connected = await isStripeConnected();
    if (req.session?.role === "owner") {
      try {
        const stats = await storage.getPaymentStats();
        return res.json({ connected, ...stats });
      } catch (err: any) {
        console.error("[Stripe] status error:", err.message);
      }
    }
    res.json({ connected });
  });

  app.get("/api/payments", requireOwner, async (_req, res) => {
    try {
      const allPayments = await storage.getAllPayments();
      res.json(allPayments);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/api/payments/stats", requireOwner, async (_req, res) => {
    try {
      const stats = await storage.getPaymentStats();
      const allPayments = await storage.getAllPayments();
      const recentPayments = allPayments.slice(0, 20);
      res.json({ ...stats, recentPayments });
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post("/api/stripe/content-checkout", async (req, res) => {
    try {
      const connected = await isStripeConnected();
      if (!connected) return res.status(503).json({ message: "Platby se připravují" });

      const { userId, contentItemId, amount } = req.body;
      if (!userId || !amount) return res.status(400).json({ message: "userId a amount jsou povinné" });

      const parsedAmount = parseInt(amount);
      if (isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 50000) {
        return res.status(400).json({ message: "Neplatná částka (1–50000 Kč)" });
      }
      const parsedUserId = parseInt(userId);
      if (isNaN(parsedUserId)) return res.status(400).json({ message: "Neplatné userId" });

      const user = await storage.getUser(parsedUserId);
      if (!user) return res.status(404).json({ message: "Uživatel nenalezen" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(user.name, { userId: String(user.id) });
        customerId = customer.id;
        await storage.updateStripeCustomerId(user.id, customerId);
      }

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'czk',
            product_data: {
              name: contentItemId ? `Exkluzivní obsah #${contentItemId}` : 'Exkluzivní obsah od Ninna Ray',
              description: 'Odemkni privátní obsah přímo v chatu 💋',
            },
            unit_amount: parsedAmount * 100,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/chat`,
        metadata: {
          userId: String(parsedUserId),
          contentItemId: contentItemId ? String(contentItemId) : '',
          type: 'content_purchase',
        },
      });

      const payment = await storage.createPayment({
        userId: parsedUserId,
        contentItemId: contentItemId ? parseInt(contentItemId) : null,
        amount: parsedAmount * 100,
        currency: 'czk',
        status: 'pending',
        stripeSessionId: session.id,
        stripePaymentIntentId: null,
        type: 'content',
      });

      await storage.addManagerLog("payment_created", `Platba #${payment.id} vytvořena pro uživatele #${parsedUserId}, částka ${parsedAmount} Kč`);

      res.json({ url: session.url, paymentId: payment.id });
    } catch (err: any) {
      console.error("[Stripe] content-checkout error:", err.message);
      await storage.addManagerLog("payment_error", `Chyba při vytváření platby: ${err.message}`);
      res.status(500).json({ message: "Chyba při vytváření platby" });
    }
  });

  app.get("/api/stripe/products", async (_req, res) => {
    try {
      const connected = await isStripeConnected();
      if (!connected) return res.json({ products: [], connected: false });
      const products = await stripeService.listProductsWithPrices();
      res.json({ products, connected: true });
    } catch (err: any) {
      console.error("[Stripe] products error:", err.message);
      res.json({ products: [], connected: false, error: err.message });
    }
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      const connected = await isStripeConnected();
      if (!connected) return res.status(503).json({ message: "Platby nejsou aktivní" });

      const { priceId, userId } = req.body;
      if (!priceId || !userId) return res.status(400).json({ message: "priceId a userId jsou povinné" });
      if (typeof priceId !== "string" || !priceId.startsWith("price_")) return res.status(400).json({ message: "Neplatný formát priceId" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "Uživatel nenalezen" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(user.name, { userId: String(user.id), chatCode: user.chatCode || '' });
        customerId = customer.id;
        await storage.updateStripeCustomerId(user.id, customerId);
      }

      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      const price = await stripe.prices.retrieve(priceId);
      const mode = price.recurring ? "subscription" : "payment";

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        `${baseUrl}/payment/cancel`,
        mode
      );

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("[Stripe] checkout error:", err.message);
      res.status(500).json({ message: "Chyba při vytváření platby" });
    }
  });

  app.get("/api/stripe/subscription/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ message: "Invalid userId" });

      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) return res.json({ subscription: null });

      const connected = await isStripeConnected();
      if (!connected) return res.json({ subscription: null });

      const subscription = await stripeService.getCustomerSubscriptions(user.stripeCustomerId);
      res.json({ subscription });
    } catch (err: any) {
      console.error("[Stripe] subscription error:", err.message);
      res.json({ subscription: null });
    }
  });

  app.get("/api/stripe/session-info/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      if (!sessionId) return res.status(400).json({ message: "sessionId je povinné" });
      
      const connected = await isStripeConnected();
      if (!connected) return res.status(503).json({ message: "Stripe není propojený" });

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      res.json({
        id: session.id,
        status: session.payment_status,
        amount: session.amount_total,
        currency: session.currency,
        customer: session.customer,
        metadata: session.metadata,
        success: session.payment_status === "paid",
      });
    } catch (err: any) {
      console.error("[Stripe] session-info error:", err.message);
      res.status(500).json({ message: "Chyba při čtení session" });
    }
  });

  app.get("/api/stripe/subscription-plans", async (_req, res) => {
    try {
      const connected = await isStripeConnected();
      if (!connected) return res.json({ plans: [], connected: false });
      const plans = await stripeService.getSubscriptionPlansWithPrices();
      res.json({ plans, connected: true });
    } catch (err: any) {
      console.error("[Stripe] subscription-plans error:", err.message);
      res.json({ plans: [], connected: false });
    }
  });

  app.post("/api/stripe/subscription-checkout", async (req, res) => {
    try {
      const connected = await isStripeConnected();
      if (!connected) return res.status(503).json({ message: "Stripe není propojený" });

      const { priceId, userId } = req.body;
      if (!priceId || !userId) return res.status(400).json({ message: "priceId a userId jsou povinné" });

      const user = await storage.getUser(parseInt(userId));
      if (!user) return res.status(404).json({ message: "Uživatel nenalezen" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(user.name, { userId: String(user.id) });
        customerId = customer.id;
        await storage.updateStripeCustomerId(user.id, customerId);
      }

      const baseUrl = process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : `${req.protocol}://${req.get("host")}`;
      const session = await stripeService.createCheckoutSession(
        customerId, priceId,
        `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=subscription`,
        `${baseUrl}/vip`,
        "subscription"
      );
      res.json({ url: session.url });
    } catch (err: any) {
      console.error("[Stripe] subscription-checkout error:", err.message);
      res.status(500).json({ message: "Chyba při vytváření platby" });
    }
  });

  app.post("/api/stripe/portal", requireOwner, async (req, res) => {
    try {
      const connected = await isStripeConnected();
      if (!connected) return res.status(503).json({ message: "Stripe není propojený" });

      const { customerId } = req.body;
      if (!customerId) return res.status(400).json({ message: "customerId je povinné" });

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const portalSession = await stripeService.createCustomerPortalSession(customerId, `${baseUrl}/manager`);
      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error("[Stripe] portal error:", err.message);
      res.status(500).json({ message: "Chyba při otevírání portálu" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIRTUAL TWIN: Avatar Skin & Customization Engine
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/avatar/instance — vrátit aktuální konfiguraci Virtual Twina pro přihlášeného uživatele
  app.get("/api/avatar/instance", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      let instance = await storage.getAvatarInstance(userId);
      if (!instance) {
        instance = await storage.createAvatarInstance(userId);
      }

      // Aktualizovat last interaction
      await storage.updateAvatarLastInteraction(userId);

      res.json({ instance });
    } catch (err: any) {
      console.error("[Avatar] instance error:", err.message);
      res.status(500).json({ message: "Chyba při načítání avataru" });
    }
  });

  // GET /api/avatar/elements — dostupné skiny z zakoupených fotek zákazníka
  app.get("/api/avatar/elements", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      const elements = await storage.getAvatarElementsForUser(userId);
      res.json({ elements });
    } catch (err: any) {
      console.error("[Avatar] elements error:", err.message);
      res.status(500).json({ message: "Chyba při načítání elementů" });
    }
  });

  // GET /api/avatar/elements/all — všechny elementy (pro owner/agent)
  app.get("/api/avatar/elements/all", requireAgent, async (req, res) => {
    try {
      const elements = await storage.getAllAvatarElements();
      const contentItemsList = await storage.getAllContentItems();
      // Připojit info o foto ke každému elementu
      const enriched = elements.map(e => ({
        ...e,
        contentItem: contentItemsList.find(c => c.id === e.contentItemId) || null,
      }));
      res.json({ elements: enriched });
    } catch (err: any) {
      console.error("[Avatar] elements/all error:", err.message);
      res.status(500).json({ message: "Chyba při načítání elementů" });
    }
  });

  // POST /api/avatar/apply-skin — aplikovat skin na Virtual Twina
  app.post("/api/avatar/apply-skin", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      const { elementType, elementId, contentItemId } = req.body;
      if (!elementType) return res.status(400).json({ message: "elementType je povinné" });

      // Načíst aktuální konfiguraci
      let instance = await storage.getAvatarInstance(userId);
      const currentConfig = (instance?.visualConfig as Record<string, any>) || {};

      // Pokud elementId je null — odebrat skin z dané kategorie
      if (elementId === null || elementId === undefined) {
        const newConfig = { ...currentConfig };
        delete newConfig[`${elementType}_id`];
        delete newConfig[`${elementType}_content_id`];
        const updated = await storage.updateAvatarConfig(userId, newConfig);
        return res.json({ instance: updated, message: `Skin ${elementType} odebrán` });
      }

      // Ověřit, že zákazník má přístup k tomuto elementu
      const userElements = await storage.getAvatarElementsForUser(userId);
      const element = userElements.find(e => e.id === parseInt(elementId));
      if (!element) {
        return res.status(403).json({ message: "Tento skin není dostupný. Nejprve si zakup fotku." });
      }

      // Aplikovat skin
      const newConfig = {
        ...currentConfig,
        [`${elementType}_id`]: element.id,
        [`${elementType}_content_id`]: element.contentItemId,
        [`${elementType}_name`]: element.name,
        [`${elementType}_preview`]: element.previewUrl,
      };

      const updated = await storage.updateAvatarConfig(userId, newConfig);
      console.log(`[Avatar] User ${userId} applied skin ${elementType}: ${element.name}`);
      res.json({ instance: updated, message: `Skin "${element.name}" aplikován` });
    } catch (err: any) {
      console.error("[Avatar] apply-skin error:", err.message);
      res.status(500).json({ message: "Chyba při aplikaci skinu" });
    }
  });

  // POST /api/avatar/reset — reset avataru na výchozí
  app.post("/api/avatar/reset", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      const instance = await storage.resetAvatarConfig(userId);
      res.json({ instance, message: "Avatar byl resetován na výchozí" });
    } catch (err: any) {
      console.error("[Avatar] reset error:", err.message);
      res.status(500).json({ message: "Chyba při resetování avataru" });
    }
  });

  // POST /api/avatar/elements — přidat nový element (owner/agent)
  app.post("/api/avatar/elements", requireAgent, async (req, res) => {
    try {
      const { contentItemId, elementType, name, metadata } = req.body;
      if (!contentItemId || !elementType || !name) {
        return res.status(400).json({ message: "contentItemId, elementType a name jsou povinné" });
      }

      const validTypes = ["outfit", "hair", "background", "expression", "accessory"];
      if (!validTypes.includes(elementType)) {
        return res.status(400).json({ message: `Neplatný typ. Povolené typy: ${validTypes.join(", ")}` });
      }

      const contentItem = await storage.getContentItem(parseInt(contentItemId));
      if (!contentItem) return res.status(404).json({ message: "Fotka nenalezena" });

      // Použít teaser jako preview URL (blurred / cropped)
      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : `${req.protocol}://${req.get("host")}`;
      const previewUrl = `${baseUrl}/api/content/teaser/${contentItem.id}`;

      const element = await storage.createAvatarElement({
        contentItemId: parseInt(contentItemId),
        elementType,
        name,
        previewUrl,
        metadata: metadata || {},
      });

      console.log(`[Avatar] Element created: ${name} (${elementType}) for content ${contentItemId}`);
      res.json({ element });
    } catch (err: any) {
      console.error("[Avatar] create element error:", err.message);
      res.status(500).json({ message: "Chyba při vytváření elementu" });
    }
  });

  // DELETE /api/avatar/elements/:id — smazat element (owner/agent)
  app.delete("/api/avatar/elements/:id", requireAgent, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAvatarElement(id);
      res.json({ message: "Element smazán" });
    } catch (err: any) {
      console.error("[Avatar] delete element error:", err.message);
      res.status(500).json({ message: "Chyba při mazání elementu" });
    }
  });

  // POST /api/avatar/analyze-photo — analyzovat fotku pomocí AI a extrahovat elementy
  app.post("/api/avatar/analyze-photo", requireAgent, async (req, res) => {
    try {
      const { contentItemId } = req.body;
      if (!contentItemId) return res.status(400).json({ message: "contentItemId je povinné" });

      const contentItem = await storage.getContentItem(parseInt(contentItemId));
      if (!contentItem) return res.status(404).json({ message: "Fotka nenalezena" });

      if (!contentItem.mimeType.startsWith("image/")) {
        return res.status(400).json({ message: "Pouze obrázky mohou být analyzovány" });
      }

      const uploadsDir = path.resolve(process.cwd(), "uploads");
      const filePath = path.join(uploadsDir, contentItem.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Soubor nenalezen na disku" });
      }

      // Načíst obrázek jako base64
      const imageBuffer = fs.readFileSync(filePath);
      const base64Image = imageBuffer.toString("base64");
      const mimeType = contentItem.mimeType;

      // Použít GPT-4o Vision pro analýzu vizuálních prvků
      const analysisResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyzuj tuto fotografii modelky Ninny a extrahuj vizuální prvky pro Avatar Engine. Vrať JSON objekt s těmito klíči:
- outfit: { color: string, style: string, name: string } nebo null
- hair: { color: string, style: string, name: string } nebo null  
- background: { type: string, color: string, name: string } nebo null
- expression: { mood: string, intensity: string, name: string } nebo null
- accessory: { type: string, name: string } nebo null (pokud je doplněk výrazný)

Jméno (name) musí být v češtině, výstižné a poetické (např. "Červené hedvábné šaty", "Zlaté vlny", "Studijní bílé pozadí"). Vrať pouze JSON bez dalšího textu.`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: "low"
                }
              }
            ]
          }
        ],
        max_tokens: 500,
      });

      const rawText = analysisResponse.choices[0]?.message?.content || "{}";
      let analysisResult: Record<string, any> = {};
      try {
        // Odstranit markdown code fences pokud jsou přítomny
        const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        analysisResult = JSON.parse(cleaned);
      } catch {
        console.error("[Avatar] AI response parse error:", rawText);
        return res.status(500).json({ message: "AI vrátila neplatný JSON" });
      }

      // Automaticky vytvořit elementy pro každý extrahovaný prvek
      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : `${req.protocol}://${req.get("host")}`;
      const previewUrl = `${baseUrl}/api/content/teaser/${contentItem.id}`;

      const createdElements: any[] = [];
      const validTypes = ["outfit", "hair", "background", "expression", "accessory"];

      for (const elementType of validTypes) {
        if (analysisResult[elementType]) {
          const el = analysisResult[elementType];
          if (el && el.name) {
            const element = await storage.createAvatarElement({
              contentItemId: parseInt(contentItemId),
              elementType,
              name: el.name,
              previewUrl,
              metadata: el,
            });
            createdElements.push(element);
          }
        }
      }

      console.log(`[Avatar] Analyzed photo ${contentItemId}, created ${createdElements.length} elements`);
      res.json({
        analysis: analysisResult,
        createdElements,
        message: `Extrahováno ${createdElements.length} vizuálních prvků z fotografie`
      });
    } catch (err: any) {
      console.error("[Avatar] analyze-photo error:", err.message);
      res.status(500).json({ message: "Chyba při analýze fotky: " + err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // E-BOT ROUTES — Ninna E-Bot ekosystém
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/bot/status — stav E-Botu pro přihlášeného usera
  app.get("/api/bot/status", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      const isSubscribed = await storage.isUserSubscribed(userId);
      const instance = await storage.getAvatarInstance(userId);
      const botEnabled = isSubscribed && !!(instance?.botEnabled);
      const capabilityLevel = instance?.capabilityLevel || 0;

      const { getCapabilitiesForLevel, SUBSCRIPTION_PLANS } = await import("./stripeService");
      const capabilities = getCapabilitiesForLevel(capabilityLevel);
      const currentPlan = SUBSCRIPTION_PLANS.find(p => p.capabilityLevel === capabilityLevel);
      const nextPlan = SUBSCRIPTION_PLANS.find(p => p.capabilityLevel === capabilityLevel + 1);

      const { unlocked, locked } = await storage.getBotWardrobe(userId);

      res.json({
        isSubscribed,
        botEnabled,
        capabilityLevel,
        capabilities,
        currentPlan: currentPlan ? { key: currentPlan.key, name: currentPlan.name, emoji: currentPlan.emoji } : null,
        nextPlan: nextPlan ? { key: nextPlan.key, name: nextPlan.name, emoji: nextPlan.emoji, priceMonthly: nextPlan.priceMonthly } : null,
        unlockedCount: unlocked.length,
        lockedCount: locked.length,
        totalCount: unlocked.length + locked.length,
      });
    } catch (err: any) {
      console.error("[Bot] status error:", err.message);
      res.status(500).json({ message: "Chyba při načítání stavu bota" });
    }
  });

  // GET /api/bot/wardrobe — šatník s locked/unlocked assety
  app.get("/api/bot/wardrobe", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      const isSubscribed = await storage.isUserSubscribed(userId);
      if (!isSubscribed) {
        return res.status(403).json({ message: "E-Bot vyžaduje aktivní předplatné", requiresSubscription: true });
      }

      const { unlocked, locked } = await storage.getBotWardrobe(userId);
      const instance = await storage.getAvatarInstance(userId);

      res.json({
        unlocked,
        locked,
        currentConfig: (instance?.visualConfig as Record<string, any>) || {},
      });
    } catch (err: any) {
      console.error("[Bot] wardrobe error:", err.message);
      res.status(500).json({ message: "Chyba při načítání šatníku" });
    }
  });

  // GET /api/bot/ninna-comment — kontextuální komentář Ninny k šatníku usera
  app.get("/api/bot/ninna-comment", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      const ctx = await storage.getUserBotContext(userId);
      const { unlocked, locked } = await storage.getBotWardrobe(userId);

      let comment = "";
      let mood: "default" | "happy" | "teasing" | "upsell" = "default";

      if (!ctx.hasBot) {
        comment = "ještě jsem nezačala...";
        mood = "default";
      } else if (unlocked.length === 0) {
        comment = "hej… jsem jen v základu 😏\nale mohl bys mě trochu vylepšit";
        mood = "default";
      } else if (unlocked.length <= 2) {
        const name = unlocked[0]?.name || "tohle";
        comment = `${name}... líbí se ti? 🙈\nmám toho víc, jestli chceš vidět`;
        mood = "teasing";
      } else if (unlocked.length <= 5) {
        comment = `wow, to jsi rychlý 🔥\nale stále je co odemknout…`;
        mood = "happy";
      } else {
        comment = `jsi tu docela štědrý miláčku 💋\nto nejlepší je pořád za zamčenou dveří 😈`;
        mood = "upsell";
      }

      res.json({
        comment,
        mood,
        unlockedCount: unlocked.length,
        lockedCount: locked.length,
        outfitNames: ctx.outfitNames,
      });
    } catch (err: any) {
      console.error("[Bot] ninna-comment error:", err.message);
      res.status(500).json({ comment: "...", mood: "default" });
    }
  });

  // POST /api/bot/manual-enable — owner může ručně zapnout bot (pro testování)
  app.post("/api/bot/manual-enable/:userId", requireOwner, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      await storage.enableBot(userId);
      await storage.updateUser(userId, { platform: "vip_subscriber" } as any);
      res.json({ message: "Bot aktivován", userId });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/avatar/config-summary — pro AI manager engine (interní)
  app.get("/api/avatar/config-summary/:userId", requireAgent, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const instance = await storage.getAvatarInstance(userId);
      if (!instance || !instance.visualConfig) {
        return res.json({ summary: null, config: {} });
      }

      const config = instance.visualConfig as Record<string, any>;
      const parts: string[] = [];
      if (config.outfit_name) parts.push(`oblečení: ${config.outfit_name}`);
      if (config.hair_name) parts.push(`vlasy: ${config.hair_name}`);
      if (config.background_name) parts.push(`pozadí: ${config.background_name}`);
      if (config.expression_name) parts.push(`výraz: ${config.expression_name}`);
      if (config.accessory_name) parts.push(`doplněk: ${config.accessory_name}`);

      const summary = parts.length > 0
        ? `Zákazník si přizpůsobil svého Virtual Twina Ninny: ${parts.join(", ")}.`
        : null;

      res.json({ summary, config });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Clone Memory Routes ──────────────────────────────────────────────────

  // GET /api/bot/memory — paměť Ninny o uživateli
  app.get("/api/bot/memory", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      const memories = await storage.getCloneMemories(userId);
      res.json({ memories });
    } catch (err: any) {
      console.error("[Memory] get error:", err.message);
      res.status(500).json({ message: "Chyba při načítání paměti" });
    }
  });

  // DELETE /api/bot/memory/:id — smazat konkrétní paměť
  app.delete("/api/bot/memory/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      const memoryId = parseInt(req.params.id);
      if (isNaN(memoryId)) return res.status(400).json({ message: "Neplatné ID" });

      await storage.deleteCloneMemory(memoryId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/bot/recommendations — doporučený obsah pro uživatele
  app.get("/api/bot/recommendations", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      const recs = await storage.getContentRecommendations(userId, 6);
      
      // If no recommendations yet, generate them
      if (recs.length === 0) {
        const { generateRecommendationsForUser } = await import("./recommendation-engine");
        generateRecommendationsForUser(userId).catch(() => {});
      }

      res.json({ recommendations: recs });
    } catch (err: any) {
      console.error("[Recs] get error:", err.message);
      res.status(500).json({ message: "Chyba při načítání doporučení" });
    }
  });

  // GET /api/user/payments — zobrazit si svoje platby
  app.get("/api/user/payments", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) return res.status(401).json({ message: "Nejsi přihlášen" });

      const payments = await storage.getPaymentsByUser(userId);
      const result = payments.map(p => ({
        id: p.id,
        amount: p.amount,
        amountCzk: Math.round(p.amount / 100),
        currency: p.currency,
        status: p.status,
        contentItemId: p.contentItemId,
        stripeSessionId: p.stripeSessionId,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));

      res.json({ payments: result });
    } catch (err: any) {
      console.error("[Payments] get error:", err.message);
      res.status(500).json({ message: "Chyba při načítání tvých plateb" });
    }
  });

  // ─── Manager Subscription Health Routes ─────────────────────────────────

  // GET /api/manager/subscription-health — přehled churn rizika
  app.get("/api/manager/subscription-health", requireOwner, async (req, res) => {
    try {
      const { getSubscriptionHealthReport } = await import("./subscription-tracker");
      const raw = await getSubscriptionHealthReport();

      // Transform to frontend-expected shape
      const churnCandidates = raw.users
        .filter(u => u.churnRiskLabel !== "low")
        .sort((a, b) => b.churnRiskScore - a.churnRiskScore)
        .map(u => {
          const daysSince = u.lastActiveAt
            ? Math.floor((Date.now() - new Date(u.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))
            : 999;
          let action = "Pošli motivační zprávu";
          if (u.churnRiskLabel === "critical") action = "Okamžitě kontaktuj — hrozí odchod!";
          else if (u.churnRiskLabel === "high") action = "Připomeň nejnovější obsah";
          else if (u.churnRiskLabel === "medium") action = "Nabídni slevu nebo exkluzivní obsah";
          return {
            userId: u.userId,
            userName: u.userName,
            churnRisk: u.churnRiskLabel,
            riskScore: u.churnRiskScore / 100,
            riskFactors: u.signals,
            daysSinceLastMessage: daysSince,
            subscriptionAge: 0,
            messageCount: 0,
            purchaseCount: u.purchaseCount,
            suggestedAction: action,
          };
        });

      res.json({
        totalSubscribers: raw.summary.totalSubscribed,
        activeSubscribers: raw.summary.totalSubscribed - raw.summary.atRisk,
        atRiskSubscribers: raw.summary.atRisk,
        estimatedMRR: raw.summary.totalMrr,
        estimatedARR: raw.summary.totalMrr * 12,
        churnCandidates,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[SubTracker] health error:", err.message);
      res.status(500).json({ message: "Chyba při načítání přehledu předplatného" });
    }
  });

  return httpServer;
}