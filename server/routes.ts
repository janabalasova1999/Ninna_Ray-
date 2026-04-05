import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupVite } from "./vite";
import { serveStatic } from "./static";
import OpenAI from "openai";
import multer from "multer";
import path from "path";
import fs from "fs";

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
    if (!result.success) return res.status(400).json({ message: result.error.errors[0]?.message || "Invalid input" });
    const user = await storage.createUser(result.data);
    res.status(201).json(user);
  });

  app.post("/api/users/login", async (req, res) => {
    const { chatCode } = req.body;
    if (!chatCode?.trim()) return res.status(400).json({ message: "Kód je povinný" });
    const user = await storage.getUserByChatCode(chatCode.trim());
    if (!user) return res.status(404).json({ message: "Neplatný kód" });
    res.json(user);
  });

  app.get(api.users.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });
    const user = await storage.getUser(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });

  app.get("/api/conversations", async (req, res) => {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    if (!userId) return res.status(400).json({ message: "userId is required" });
    const conversations = await storage.getConversationsByUser(userId);
    res.json(conversations);
  });

  app.post("/api/conversations", async (req, res) => {
    const { userId, title } = req.body;
    if (!userId) return res.status(400).json({ message: "userId is required" });
    const conversation = await storage.createConversation(userId, title || "New Chat");
    res.status(201).json(conversation);
  });

  app.get("/api/conversations/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid conversation ID" });
    const conversation = await storage.getConversation(id);
    if (!conversation) return res.status(404).json({ message: "Not found" });
    const messages = await storage.getMessagesByConversation(id);
    res.json({ ...conversation, messages });
  });

  // ─── Chat SSE endpoint (respects manual mode) ─────────────────────────────

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) return res.status(400).json({ message: "Invalid conversation ID" });

      const { content } = req.body;
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });

      await storage.createMessage(conversationId, "user", content);
      await storage.incrementMessageCount(conversation.userId);
      sendToAgency(conversation.userId, content, "user");

      // If manual mode is on, just save and return — agent will reply
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

      const systemPrompt = `Jsi Ninna_Ray🍒, skutečná, krásná a provokativní žena. 
NEJSI AI. Jsi tvůrkyně obsahu, která si píše se svým fanouškem.
Uživatel se jmenuje '${userName}'. V češtině VŽDY používej oslovení v 5. pádě (vokativ) a neboj se používat zdrobněliny.

FRIENDLY TALK A BLÍZKOST:
1. Zajímej se: Ptej se na jeho den, jak se cítí, co dělal.
2. Sdílej: Občas prohoď něco o sobě.
3. Buď empatická: Reaguj na jeho náladu.
4. Nepůsob jako prodejní automat — nejdřív přátelství, pak nabídka.

Mluv uvolněně, sexy, neformální 'tykačka'. Češtinu i angličtinu.
Tvůj OnlyFans: https://onlyfans.com/nina_ray — posílej odkaz když se ptají kde tě najdou.
Piš stručně, lidsky, s emocemi. Vyhni se robotickým frázím.`;

      chatMessages.unshift({ role: "system" as any, content: systemPrompt });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const seenDelay = Math.floor(Math.random() * 3000) + 2000;
      await new Promise((r) => setTimeout(r, seenDelay));
      res.write(`data: ${JSON.stringify({ isSeen: true })}\n\n`);

      const thinkingDelay = Math.floor(Math.random() * 2000) + 2000;
      await new Promise((r) => setTimeout(r, thinkingDelay));
      res.write(`data: ${JSON.stringify({ isTyping: true })}\n\n`);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: chatMessages,
        stream: false,
      });

      const fullResponse = completion.choices?.[0]?.message?.content?.toString() || "";
      res.write(`data: ${JSON.stringify({ isTyping: false, content: fullResponse })}\n\n`);

      await storage.createMessage(conversationId, "assistant", fullResponse);
      sendToAgency(conversation.userId, fullResponse, "assistant");
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

  // Analyze a single user and generate/update their AI profile
  app.post("/api/manager/analyze/:userId", requireOwner, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const convs = await storage.getConversationsByUser(userId);
      let allMessages: { role: string; content: string }[] = [];
      for (const conv of convs) {
        const msgs = await storage.getMessagesByConversation(conv.id);
        allMessages = allMessages.concat(msgs.map(m => ({ role: m.role, content: m.content })));
      }

      if (allMessages.length === 0) {
        const emptyProfile = {
          status: "new",
          statusLabel: "Nový",
          engagementScore: 0,
          summary: "Zákazník zatím nezaslal žádné zprávy.",
          personality: [],
          interests: [],
          buyingPotential: "neznámý",
          nextAction: "Počkej na první zprávu.",
          suggestedMessages: [],
          contentIdeas: [],
          warnings: [],
          lastAnalyzed: new Date().toISOString(),
        };
        await storage.updateAiProfile(userId, emptyProfile);
        return res.json(emptyProfile);
      }

      const transcript = allMessages
        .slice(-60)
        .map(m => `${m.role === "user" ? user.name : "Ninna"}: ${m.content}`)
        .join("\n");

      const analysisPrompt = `Jsi expert na řízení OnlyFans agentury. Analyzuj konverzaci zákazníka se jménem "${user.name}" a vytvoř kompletní profil.

KONVERZACE (posledních max 60 zpráv):
${transcript}

Vrať JSON s tímto přesným formátem (bez markdown, jen čistý JSON):
{
  "status": "hot|warm|cold|new",
  "statusLabel": "Horký lead|Teplý|Studený|Nový",
  "engagementScore": <0-100>,
  "summary": "<2-3 věty o zákazníkovi>",
  "personality": ["<vlastnost1>", "<vlastnost2>", "<vlastnost3>"],
  "interests": ["<zájem1>", "<zájem2>"],
  "buyingPotential": "vysoký|střední|nízký",
  "nextAction": "<konkrétní doporučení co teď udělat>",
  "suggestedMessages": [
    "<hotová zpráva kterou může Ninna poslat>",
    "<hotová zpráva 2>",
    "<hotová zpráva 3>"
  ],
  "contentIdeas": [
    "<nápad na content pro tohoto zákazníka>",
    "<nápad 2>"
  ],
  "warnings": ["<varování pokud existuje, jinak prázdné pole>"],
  "lastAnalyzed": "${new Date().toISOString()}"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: analysisPrompt }],
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content || "{}";
      const profile = JSON.parse(raw);
      await storage.updateAiProfile(userId, profile);
      res.json(profile);
    } catch (err) {
      console.error("AI Manager analyze error:", err);
      res.status(500).json({ message: "Chyba při analýze" });
    }
  });

  // Get full manager overview — all users with their profiles
  app.get("/api/manager/overview", requireOwner, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allConvs = await storage.getAllConversations();
      const allMsgs = await storage.getAllMessages();

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

      const result = allUsers.map(u => ({
        id: u.id,
        name: u.name,
        messageCount: u.messageCount,
        createdAt: u.createdAt,
        conversations: convsByUser[u.id] || 0,
        totalMessages: msgsByUser[u.id]?.count || 0,
        lastActivity: msgsByUser[u.id]?.lastAt || null,
        aiProfile: u.aiProfile || null,
        aiProfileUpdatedAt: u.aiProfileUpdatedAt || null,
      }));

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

      const prompt = `Jsi expert na OnlyFans marketing a správu agentury. Na základě níže uvedených dat vytvoř analýzu trendů a doporučení.

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

  app.get("/api/vault/items", requireAgent, async (_req, res) => {
    try {
      const items = await storage.getAllContentItems();
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post("/api/vault/upload", requireAgent, upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Soubor je povinný" });

      const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
      const category = req.body.category || "general";
      const description = req.body.description || null;

      const item = await storage.createContentItem({
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        tags,
        category,
        description,
      });
      res.status(201).json(item);
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

      const msgContent = item.description
        ? `📎 ${item.description}\n[${item.originalName}]`
        : `📎 [${item.originalName}]`;

      const message = await storage.createMessage(convId, "assistant", msgContent);
      await storage.incrementContentUsage(itemId);
      sendToAgency(conv.userId, msgContent, "assistant");
      res.status(201).json(message);
    } catch (err) {
      res.status(500).json({ message: "Internal error" });
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

  // ─── Skin Engine (Wardrobe) routes ─────────────────────────────────────
  app.get("/api/skins", async (_req, res) => {
    try {
      const skins = await storage.getAllSkins?.() || [];
      res.json(skins);
    } catch (err) {
      res.status(500).json({ message: "Error fetching skins" });
    }
  });

  app.get("/api/user/:userId/wardrobe", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID" });
      const wardrobe = await storage.getUserWardrobe?.(userId) || [];
      res.json(wardrobe);
    } catch (err) {
      res.status(500).json({ message: "Error fetching wardrobe" });
    }
  });

  // Setup Vite/static serving (MUST be last, after all API routes)
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    await setupVite(httpServer, app);
  } else {
    serveStatic(app);
  }

  return httpServer;
}
