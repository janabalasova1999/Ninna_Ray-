import { users, conversations, messages, contentItems, managerActions, managerLog, payments, avatarElements, avatarInstances, userUnlockedAssets, cloneMemories, contentRecommendations, subscriptionEvents, type User, type InsertUser, type Conversation, type InsertConversation, type Message, type InsertMessage, type ContentItem, type InsertContentItem, type ManagerAction, type ManagerLog, type Payment, type InsertPayment, type AvatarElement, type InsertAvatarElement, type AvatarInstance, type InsertAvatarInstance, type UserUnlockedAsset, type CloneMemory, type ContentRecommendation } from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, sql, and, inArray } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByChatCode(chatCode: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  incrementMessageCount(userId: number): Promise<void>;
  getAllUsers(): Promise<User[]>;

  getConversation(id: number): Promise<Conversation | undefined>;
  getConversationsByUser(userId: number): Promise<Conversation[]>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(userId: number, title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  setManualMode(conversationId: number, manual: boolean, agentName?: string): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  getAllMessages(): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
  updateAiProfile(userId: number, profile: Record<string, any>): Promise<void>;
  createContentItem(item: InsertContentItem): Promise<ContentItem>;
  getAllContentItems(): Promise<ContentItem[]>;
  getContentItem(id: number): Promise<ContentItem | undefined>;
  deleteContentItem(id: number): Promise<void>;
  incrementContentUsage(id: number): Promise<void>;
  createManagerAction(data: { userId: number | null; type: string; message?: string; photoId?: number; price?: number; purpose?: string; timing?: string }): Promise<ManagerAction>;
  getManagerActions(since?: Date): Promise<ManagerAction[]>;
  updateManagerAction(id: number, updates: Partial<{ status: string; result: string; executedAt: Date }>): Promise<void>;
  addManagerLog(event: string, detail?: string): Promise<void>;
  getManagerLogs(limit?: number): Promise<ManagerLog[]>;
  updateUser(id: number, updates: Partial<{ platform: string }>): Promise<void>;
  updateStripeCustomerId(userId: number, stripeCustomerId: string): Promise<void>;
  deleteUser(userId: number): Promise<void>;
  createPayment(data: InsertPayment): Promise<Payment>;
  getPaymentsByUser(userId: number): Promise<Payment[]>;
  getAllPayments(): Promise<Payment[]>;
  updatePaymentStatus(id: number, status: string, stripePaymentIntentId?: string): Promise<void>;
  getPaymentByStripeSession(sessionId: string): Promise<Payment | undefined>;
  getPaymentStats(): Promise<{ totalRevenue: number; totalPayments: number; successfulPayments: number }>;

  // ─── Virtual Twin: Avatar ──────────────────────────────────────────────────
  getAvatarInstance(userId: number): Promise<AvatarInstance | undefined>;
  createAvatarInstance(userId: number): Promise<AvatarInstance>;
  updateAvatarConfig(userId: number, visualConfig: Record<string, any>): Promise<AvatarInstance>;
  resetAvatarConfig(userId: number): Promise<AvatarInstance>;
  getAvatarElementsByContentItem(contentItemId: number): Promise<AvatarElement[]>;
  getAvatarElementsForUser(userId: number): Promise<AvatarElement[]>;
  createAvatarElement(data: InsertAvatarElement): Promise<AvatarElement>;
  deleteAvatarElement(id: number): Promise<void>;
  getAllAvatarElements(): Promise<AvatarElement[]>;
  updateAvatarLastInteraction(userId: number): Promise<void>;

  // ─── E-Bot: Unlocked Assets & Bot State ───────────────────────────────────
  isUserSubscribed(userId: number): Promise<boolean>;
  enableBot(userId: number): Promise<void>;
  disableBot(userId: number): Promise<void>;
  getUserUnlockedAssetIds(userId: number): Promise<number[]>;
  unlockAssetsForPayment(userId: number, contentItemId: number, paymentId: number): Promise<number>;
  getAllAvatarInstances(): Promise<AvatarInstance[]>;
  getUnlockedAssetCountsByUser(): Promise<Map<number, number>>;
  getBotWardrobe(userId: number): Promise<{ unlocked: AvatarElement[]; locked: AvatarElement[] }>;
  getUserBotContext(userId: number): Promise<{ hasBot: boolean; capabilityLevel: number; unlockedCount: number; totalCount: number; outfitNames: string[] }>;
  updateCapabilityLevel(userId: number, level: number): Promise<void>;
  autoCreateAvatarElements(contentItemId: number): Promise<AvatarElement[]>;

  // ─── Clone Memory System ───────────────────────────────────────────────────
  getCloneMemories(userId: number, options?: { limit?: number; minImportance?: number; types?: string[] }): Promise<CloneMemory[]>;
  upsertCloneMemory(userId: number, data: { memoryType: string; content: string; importance: number; tags: string[]; source: string; emotionalContext?: string }): Promise<CloneMemory>;
  deleteCloneMemory(id: number): Promise<void>;

  // ─── Content Recommendations ──────────────────────────────────────────────
  createContentRecommendation(data: { userId: number; contentItemId: number; score: number; reason?: string; category: string; status: string }): Promise<ContentRecommendation>;
  getContentRecommendations(userId: number, options?: { statusFilter?: string[]; limit?: number }): Promise<ContentRecommendation[]>;
  updateRecommendationStatus(id: number, status: string, shownAt?: Date): Promise<void>;

  // ─── Payment Helpers ──────────────────────────────────────────────────────
  getUserPurchasedContentIds(userId: number): Promise<number[]>;
  getUserPaymentStats(userId: number): Promise<{ totalSpent: number; purchaseCount: number }>;
  getRecentMessages(conversationId: number, limit: number): Promise<Message[]>;

  // ─── Subscription Events ──────────────────────────────────────────────────
  createSubscriptionEvent(data: { userId?: number; stripeSubscriptionId?: string; eventType: string; planKey?: string; capabilityLevel?: number; amountCzk?: number; expiresAt?: Date; metadata?: Record<string, any> }): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByChatCode(chatCode: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.chatCode, chatCode.toUpperCase()));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const chatCode = `NINNA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [user] = await db.insert(users).values({ ...insertUser, chatCode }).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async incrementMessageCount(userId: number): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user) {
      await db.update(users)
        .set({ messageCount: (user.messageCount || 0) + 1 })
        .where(eq(users.id, userId));
    }
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conv;
  }

  async getConversationsByUser(userId: number): Promise<Conversation[]> {
    return db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.createdAt));
  }

  async getAllConversations(): Promise<Conversation[]> {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  }

  async createConversation(userId: number, title: string): Promise<Conversation> {
    const [conv] = await db.insert(conversations).values({ userId, title }).returning();
    return conv;
  }

  async deleteConversation(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async setManualMode(conversationId: number, manual: boolean, agentName?: string): Promise<void> {
    await db.update(conversations)
      .set({ manualMode: manual, assignedAgent: agentName || null })
      .where(eq(conversations.id, conversationId));
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async getAllMessages(): Promise<Message[]> {
    return db.select().from(messages).orderBy(desc(messages.createdAt));
  }

  async createMessage(conversationId: number, role: string, content: string): Promise<Message> {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  }

  async updateAiProfile(userId: number, profile: Record<string, any>): Promise<void> {
    await db.update(users)
      .set({ aiProfile: profile, aiProfileUpdatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async createContentItem(item: InsertContentItem): Promise<ContentItem> {
    const [contentItem] = await db.insert(contentItems).values(item).returning();
    return contentItem;
  }

  async getAllContentItems(): Promise<ContentItem[]> {
    return db.select().from(contentItems).orderBy(desc(contentItems.createdAt));
  }

  async getContentItem(id: number): Promise<ContentItem | undefined> {
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    return item;
  }

  async deleteContentItem(id: number): Promise<void> {
    await db.delete(contentItems).where(eq(contentItems.id, id));
  }

  async incrementContentUsage(id: number): Promise<void> {
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    if (item) {
      await db.update(contentItems)
        .set({ timesUsed: (item.timesUsed || 0) + 1 })
        .where(eq(contentItems.id, id));
    }
  }

  async createManagerAction(data: { userId: number | null; type: string; message?: string; photoId?: number; price?: number; purpose?: string; timing?: string }): Promise<ManagerAction> {
    const [action] = await db.insert(managerActions).values({
      userId: data.userId,
      type: data.type,
      message: data.message,
      photoId: data.photoId,
      price: data.price,
      purpose: data.purpose,
      timing: data.timing,
    }).returning();
    return action;
  }

  async getManagerActions(since?: Date): Promise<ManagerAction[]> {
    if (since) {
      return db.select().from(managerActions)
        .where(gte(managerActions.createdAt, since))
        .orderBy(desc(managerActions.createdAt));
    }
    return db.select().from(managerActions).orderBy(desc(managerActions.createdAt));
  }

  async updateManagerAction(id: number, updates: Partial<{ status: string; result: string; executedAt: Date }>): Promise<void> {
    await db.update(managerActions).set(updates).where(eq(managerActions.id, id));
  }

  async addManagerLog(event: string, detail?: string): Promise<void> {
    await db.insert(managerLog).values({ event, detail });
  }

  async getManagerLogs(limit = 100): Promise<ManagerLog[]> {
    return db.select().from(managerLog)
      .orderBy(desc(managerLog.createdAt))
      .limit(limit);
  }

  async updateUser(id: number, updates: Partial<{ platform: string }>): Promise<void> {
    await db.update(users).set(updates).where(eq(users.id, id));
  }

  async updateStripeCustomerId(userId: number, stripeCustomerId: string): Promise<void> {
    await db.update(users)
      .set({ stripeCustomerId })
      .where(eq(users.id, userId));
  }

  async deleteUser(userId: number): Promise<void> {
    const userConvs = await db.select().from(conversations).where(eq(conversations.userId, userId));
    for (const conv of userConvs) {
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
    }
    await db.delete(conversations).where(eq(conversations.userId, userId));
    await db.delete(managerActions).where(eq(managerActions.userId, userId));
    await db.delete(payments).where(eq(payments.userId, userId));
    await db.delete(userUnlockedAssets).where(eq(userUnlockedAssets.userId, userId));
    await db.delete(avatarInstances).where(eq(avatarInstances.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  async createPayment(data: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }

  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt));
  }

  async getAllPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  async updatePaymentStatus(id: number, status: string, stripePaymentIntentId?: string): Promise<void> {
    const updates: Record<string, any> = { status };
    if (stripePaymentIntentId) updates.stripePaymentIntentId = stripePaymentIntentId;
    await db.update(payments).set(updates).where(eq(payments.id, id));
  }

  async getPaymentByStripeSession(sessionId: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.stripeSessionId, sessionId));
    return payment;
  }

  async getPaymentById(paymentId: number): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    return payment;
  }

  async getPaymentStats(): Promise<{ totalRevenue: number; totalPayments: number; successfulPayments: number }> {
    const allPays = await db.select().from(payments);
    const successful = allPays.filter(p => p.status === "completed");
    return {
      totalRevenue: successful.reduce((sum, p) => sum + p.amount, 0),
      totalPayments: allPays.length,
      successfulPayments: successful.length,
    };
  }

  // ─── Virtual Twin: Avatar ──────────────────────────────────────────────────

  async getAvatarInstance(userId: number): Promise<AvatarInstance | undefined> {
    const [instance] = await db.select().from(avatarInstances).where(eq(avatarInstances.userId, userId));
    return instance;
  }

  async createAvatarInstance(userId: number): Promise<AvatarInstance> {
    const [instance] = await db.insert(avatarInstances).values({
      userId,
      visualConfig: {},
      personaName: "Ninna",
      capabilityLevel: 1,
      botEnabled: false,
    }).returning();
    return instance;
  }

  async updateAvatarConfig(userId: number, visualConfig: Record<string, any>): Promise<AvatarInstance> {
    const existing = await this.getAvatarInstance(userId);
    if (!existing) {
      const created = await this.createAvatarInstance(userId);
      const [updated] = await db.update(avatarInstances)
        .set({ visualConfig, updatedAt: new Date() })
        .where(eq(avatarInstances.id, created.id))
        .returning();
      return updated;
    }
    const [updated] = await db.update(avatarInstances)
      .set({ visualConfig, updatedAt: new Date() })
      .where(eq(avatarInstances.userId, userId))
      .returning();
    return updated;
  }

  async resetAvatarConfig(userId: number): Promise<AvatarInstance> {
    const existing = await this.getAvatarInstance(userId);
    if (!existing) {
      return this.createAvatarInstance(userId);
    }
    const [updated] = await db.update(avatarInstances)
      .set({ visualConfig: {}, updatedAt: new Date() })
      .where(eq(avatarInstances.userId, userId))
      .returning();
    return updated;
  }

  async getAvatarElementsByContentItem(contentItemId: number): Promise<AvatarElement[]> {
    return db.select().from(avatarElements)
      .where(eq(avatarElements.contentItemId, contentItemId));
  }

  async getAvatarElementsForUser(userId: number): Promise<AvatarElement[]> {
    // Vrátí odemčené assety přes userUnlockedAssets tabulku
    const unlockedIds = await this.getUserUnlockedAssetIds(userId);
    if (unlockedIds.length === 0) return [];
    return db.select().from(avatarElements)
      .where(inArray(avatarElements.id, unlockedIds));
  }

  async createAvatarElement(data: InsertAvatarElement): Promise<AvatarElement> {
    const [element] = await db.insert(avatarElements).values(data).returning();
    return element;
  }

  async deleteAvatarElement(id: number): Promise<void> {
    await db.delete(userUnlockedAssets).where(eq(userUnlockedAssets.avatarElementId, id));
    await db.delete(avatarElements).where(eq(avatarElements.id, id));
  }

  async getAllAvatarElements(): Promise<AvatarElement[]> {
    return db.select().from(avatarElements).orderBy(desc(avatarElements.createdAt));
  }

  async updateAvatarLastInteraction(userId: number): Promise<void> {
    await db.update(avatarInstances)
      .set({ lastInteraction: new Date(), updatedAt: new Date() })
      .where(eq(avatarInstances.userId, userId));
  }

  // ─── E-Bot: Unlocked Assets & Bot State ───────────────────────────────────

  async isUserSubscribed(userId: number): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;
    return user.platform === "vip_subscriber" || user.isPremium === true;
  }

  async enableBot(userId: number): Promise<void> {
    let instance = await this.getAvatarInstance(userId);
    if (!instance) {
      instance = await this.createAvatarInstance(userId);
    }
    
    // Pokud nemá ještě žádnou konfiguraci, nastavit default outfit + expression
    const current = (instance?.visualConfig as Record<string, any>) || {};
    if (!current.outfit_preview && !current.expression_preview) {
      const defaultConfig = {
        ...current,
        outfit_name: "Sexy pose",
        outfit_preview: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='280' viewBox='0 0 200 280'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%23ec4899'/%3E%3Cstop offset='100%25' style='stop-color:%23a21caf'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23grad)' width='200' height='280'/%3E%3Ccircle cx='100' cy='50' r='38' fill='%23fdbcb4'/%3E%3Cellipse cx='100' cy='150' rx='48' ry='65' fill='%23d946a6'/%3E%3Crect x='60' y='200' width='80' height='70' fill='%23a21caf' rx='8'/%3E%3Ccircle cx='70' cy='45' r='10' fill='%23000'/%3E%3Ccircle cx='130' cy='45' r='10' fill='%23000'/%3E%3Cpath d='M 85 65 Q 100 75 115 65' stroke='%23000' stroke-width='2.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E",
        expression_name: "Flirty smile 😏",
        expression_preview: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='280' viewBox='0 0 200 280'%3E%3Crect fill='%23fdbcb4' width='200' height='140'/%3E%3Ccircle cx='65' cy='55' r='14' fill='%23000'/%3E%3Ccircle cx='135' cy='55' r='14' fill='%23000'/%3E%3Cpath d='M 80 85 Q 100 105 120 85' stroke='%23d946a6' stroke-width='3.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E",
      };
      await db.update(avatarInstances)
        .set({ botEnabled: true, visualConfig: defaultConfig, updatedAt: new Date() })
        .where(eq(avatarInstances.userId, userId));
      console.log(`[E-Bot] Bot enabled for user #${userId} with default outfit`);
    } else {
      await db.update(avatarInstances)
        .set({ botEnabled: true, updatedAt: new Date() })
        .where(eq(avatarInstances.userId, userId));
      console.log(`[E-Bot] Bot enabled for user #${userId}`);
    }
  }

  async disableBot(userId: number): Promise<void> {
    await db.update(avatarInstances)
      .set({ botEnabled: false, updatedAt: new Date() })
      .where(eq(avatarInstances.userId, userId));
    console.log(`[E-Bot] Bot disabled for user #${userId}`);
  }

  async getUserUnlockedAssetIds(userId: number): Promise<number[]> {
    const rows = await db.select()
      .from(userUnlockedAssets)
      .where(eq(userUnlockedAssets.userId, userId));
    return rows.map(r => r.avatarElementId);
  }

  async getAllAvatarInstances(): Promise<AvatarInstance[]> {
    return db.select().from(avatarInstances);
  }

  async getUnlockedAssetCountsByUser(): Promise<Map<number, number>> {
    const rows = await db.select().from(userUnlockedAssets);
    const map = new Map<number, number>();
    for (const row of rows) {
      map.set(row.userId, (map.get(row.userId) || 0) + 1);
    }
    return map;
  }

  // Get all avatar elements for a specific content item
  async getAvatarElementsForContent(contentItemId: number): Promise<AvatarElement[]> {
    return db.select().from(avatarElements).where(eq(avatarElements.contentItemId, contentItemId));
  }

  // Check if a user has a specific asset unlocked
  async checkAssetUnlocked(userId: number, elementId: number): Promise<boolean> {
    const unlocked = await this.getUserUnlockedAssetIds(userId);
    return unlocked.includes(elementId);
  }

  async unlockAssetsForPayment(userId: number, contentItemId: number, paymentId: number): Promise<number> {
    // Najdi všechny avatar elementy pro tento content item
    const elements = await db.select().from(avatarElements)
      .where(eq(avatarElements.contentItemId, contentItemId));

    if (elements.length === 0) return 0;

    // Zjisti co už user má odemčené (aby neduplikoval)
    const alreadyUnlocked = await this.getUserUnlockedAssetIds(userId);
    const toUnlock = elements.filter(e => !alreadyUnlocked.includes(e.id));

    if (toUnlock.length === 0) return 0;

    // Vlož záznamy o odemčení
    for (const element of toUnlock) {
      await db.insert(userUnlockedAssets).values({
        userId,
        avatarElementId: element.id,
        paymentId,
      });
    }

    console.log(`[E-Bot] Unlocked ${toUnlock.length} avatar assets for user #${userId} (content #${contentItemId})`);
    return toUnlock.length;
  }

  async getBotWardrobe(userId: number): Promise<{ unlocked: AvatarElement[]; locked: AvatarElement[] }> {
    const allElements = await db.select().from(avatarElements).orderBy(avatarElements.elementType, avatarElements.createdAt);
    const unlockedIds = await this.getUserUnlockedAssetIds(userId);

    const unlocked: AvatarElement[] = [];
    const locked: AvatarElement[] = [];

    for (const el of allElements) {
      if (unlockedIds.includes(el.id)) {
        unlocked.push(el);
      } else {
        locked.push(el);
      }
    }

    return { unlocked, locked };
  }

  async getUserBotContext(userId: number): Promise<{ hasBot: boolean; capabilityLevel: number; unlockedCount: number; totalCount: number; outfitNames: string[] }> {
    const instance = await this.getAvatarInstance(userId);
    const hasBot = !!(instance?.botEnabled);
    const capabilityLevel = instance?.capabilityLevel || 0;
    const { unlocked } = await this.getBotWardrobe(userId);
    const allElements = await this.getAllAvatarElements();

    const config = (instance?.visualConfig as Record<string, any>) || {};
    const outfitNames: string[] = [];
    if (config.outfit_name) outfitNames.push(config.outfit_name);
    if (config.hair_name) outfitNames.push(config.hair_name);
    if (config.accessory_name) outfitNames.push(config.accessory_name);

    return {
      hasBot,
      capabilityLevel,
      unlockedCount: unlocked.length,
      totalCount: allElements.length,
      outfitNames,
    };
  }

  async updateCapabilityLevel(userId: number, level: number): Promise<void> {
    let instance = await this.getAvatarInstance(userId);
    if (!instance) {
      instance = await this.createAvatarInstance(userId);
    }
    await db.update(avatarInstances)
      .set({ capabilityLevel: level, updatedAt: new Date() })
      .where(eq(avatarInstances.userId, userId));
    console.log(`[Twin] Capability level updated to ${level} for user #${userId}`);
  }

  async autoCreateAvatarElements(contentItemId: number): Promise<AvatarElement[]> {
    const existing = await this.getAvatarElementsByContentItem(contentItemId);
    if (existing.length > 0) return existing;

    const item = await this.getContentItem(contentItemId);
    if (!item) return [];

    const isImage = item.mimeType?.startsWith("image");
    const isVideo = item.mimeType?.startsWith("video");
    if (!isImage && !isVideo) return [];

    const elements: AvatarElement[] = [];
    const baseName = item.description || item.originalName?.replace(/\.[^.]+$/, "") || `Obsah #${contentItemId}`;
    const tags = (item.tags || []).concat(item.assetTags || []);

    const typeFromTags = (ts: string[]): string => {
      const lower = ts.map(t => t.toLowerCase()).join(" ");
      if (lower.includes("outfit") || lower.includes("šaty") || lower.includes("dress") || lower.includes("oblečen") || lower.includes("bikini") || lower.includes("spodní") || lower.includes("lingerie")) return "outfit";
      if (lower.includes("vlas") || lower.includes("hair") || lower.includes("účes")) return "hair";
      if (lower.includes("pozadí") || lower.includes("background") || lower.includes("lokace") || lower.includes("exterior") || lower.includes("interior")) return "background";
      if (lower.includes("výraz") || lower.includes("expression") || lower.includes("smile") || lower.includes("úsměv") || lower.includes("sexy")) return "expression";
      if (lower.includes("doplněk") || lower.includes("accessory") || lower.includes("šperky") || lower.includes("brýle")) return "accessory";
      return "outfit";
    };

    const elementType = typeFromTags(tags);
    const previewUrl = isImage ? `/api/content/${contentItemId}/file` : null;

    const [el] = await db.insert(avatarElements).values({
      contentItemId,
      elementType,
      name: baseName,
      previewUrl,
      priceHint: null,
      metadata: { autoCreated: true, tags },
    }).returning();
    elements.push(el);

    console.log(`[Twin] Auto-created avatar element "${baseName}" (${elementType}) from content #${contentItemId}`);
    return elements;
  }

  // ─── Clone Memory System ────────────────────────────────────────────────────
  async getCloneMemories(userId: number, options: { limit?: number; minImportance?: number; types?: string[] } = {}): Promise<CloneMemory[]> {
    const { limit = 20, minImportance = 1, types } = options;
    let query = db.select().from(cloneMemories)
      .where(
        types && types.length > 0
          ? and(eq(cloneMemories.userId, userId), gte(cloneMemories.importance, minImportance), inArray(cloneMemories.memoryType, types))
          : and(eq(cloneMemories.userId, userId), gte(cloneMemories.importance, minImportance))
      )
      .orderBy(desc(cloneMemories.importance), desc(cloneMemories.updatedAt))
      .limit(limit);
    return await query;
  }

  async upsertCloneMemory(userId: number, data: { memoryType: string; content: string; importance: number; tags: string[]; source: string; emotionalContext?: string }): Promise<CloneMemory> {
    const existing = await db.select().from(cloneMemories)
      .where(and(eq(cloneMemories.userId, userId), eq(cloneMemories.memoryType, data.memoryType), eq(cloneMemories.content, data.content)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(cloneMemories)
        .set({ importance: Math.max(existing[0].importance, data.importance), updatedAt: new Date() })
        .where(eq(cloneMemories.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(cloneMemories).values({
      userId,
      memoryType: data.memoryType,
      content: data.content,
      importance: data.importance,
      tags: data.tags,
      source: data.source,
      emotionalContext: data.emotionalContext,
    }).returning();
    return created;
  }

  async deleteCloneMemory(id: number): Promise<void> {
    await db.delete(cloneMemories).where(eq(cloneMemories.id, id));
  }

  // ─── Content Recommendations ──────────────────────────────────────────────
  async createContentRecommendation(data: { userId: number; contentItemId: number; score: number; reason?: string; category: string; status: string }): Promise<ContentRecommendation> {
    const [rec] = await db.insert(contentRecommendations).values({
      userId: data.userId,
      contentItemId: data.contentItemId,
      score: data.score,
      reason: data.reason,
      category: data.category,
      status: data.status,
    }).returning();
    return rec;
  }

  async getContentRecommendations(userId: number, options: { statusFilter?: string[]; limit?: number } = {}): Promise<ContentRecommendation[]> {
    const { statusFilter, limit = 10 } = options;
    let query = db.select().from(contentRecommendations)
      .where(
        statusFilter && statusFilter.length > 0
          ? and(eq(contentRecommendations.userId, userId), inArray(contentRecommendations.status, statusFilter))
          : eq(contentRecommendations.userId, userId)
      )
      .orderBy(desc(contentRecommendations.score))
      .limit(limit);
    return await query;
  }

  async updateRecommendationStatus(id: number, status: string, shownAt?: Date): Promise<void> {
    await db.update(contentRecommendations)
      .set({ status, ...(shownAt ? { shownAt } : {}) })
      .where(eq(contentRecommendations.id, id));
  }

  // ─── Payment Helpers ──────────────────────────────────────────────────────
  async getUserPurchasedContentIds(userId: number): Promise<number[]> {
    const userPayments = await this.getPaymentsByUser(userId);
    return userPayments
      .filter(p => p.status === "completed" && p.contentItemId !== null)
      .map(p => p.contentItemId as number);
  }

  async getUserPaymentStats(userId: number): Promise<{ totalSpent: number; purchaseCount: number }> {
    const userPayments = await this.getPaymentsByUser(userId);
    const completed = userPayments.filter(p => p.status === "completed");
    const totalSpent = Math.round(completed.reduce((s, p) => s + p.amount, 0) / 100);
    return { totalSpent, purchaseCount: completed.length };
  }

  async getRecentMessages(conversationId: number, limit: number): Promise<Message[]> {
    return await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
  }

  // ─── Subscription Events ──────────────────────────────────────────────────
  async createSubscriptionEvent(data: { userId?: number; stripeSubscriptionId?: string; eventType: string; planKey?: string; capabilityLevel?: number; amountCzk?: number; expiresAt?: Date; metadata?: Record<string, any> }): Promise<void> {
    await db.insert(subscriptionEvents).values({
      userId: data.userId ?? null,
      stripeSubscriptionId: data.stripeSubscriptionId,
      eventType: data.eventType,
      planKey: data.planKey,
      capabilityLevel: data.capabilityLevel,
      amountCzk: data.amountCzk,
      expiresAt: data.expiresAt,
      metadata: data.metadata || {},
    });
  }
}

export const storage = new DatabaseStorage();
