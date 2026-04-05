import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
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

      const userObj = await storage.getUser(conversation.userId);
      import("./manager-engine").then(m => m.onNewMessage(conversation.userId, userObj?.name || "unknown")).catch(() => {});

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
        stripeCustomerId: u.stripeCustomerId || null,
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

      const prompt = `Jsi top expert na OnlyFans monetizaci, pricing strategie a analýzu trhu adult content creatorů. Tvým úkolem je navrhnout OPTIMÁLNÍ cenovou strategii pro maximalizaci výdělku.

AKTUÁLNÍ SITUACE AGENTURY "Ninna Ray":
- Aktuální cena: $14.99/měsíc (základní předplatné z OnlyFans)
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
1. Konkurenční ceny na OnlyFans, Fansly, Fanvue v podobné kategorii
2. Psychologii cen (charm pricing, anchoring, tiered value)
3. Aktuální trendy v adult content monetizaci (PPV pricing, tips, custom content, bundles)
4. Konverzní poměry při různých cenových hladinách
5. Upsell a cross-sell příležitosti
6. Sezónní faktory a promo strategie

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

  return httpServer;
}
