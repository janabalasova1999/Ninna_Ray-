import { users, conversations, messages, contentItems, avatarElements, avatarInstances, type User, type InsertUser, type Conversation, type InsertConversation, type Message, type InsertMessage, type ContentItem, type InsertContentItem } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByChatCode(chatCode: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  incrementMessageCount(userId: number): Promise<void>;
  getAllUsers(): Promise<User[]>;

  // Chat operations
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
  getAllAvatarElements?(): Promise<any[]>;
  getAvatarInstance?(userId: number): Promise<any | undefined>;
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
        .set({ messageCount: user.messageCount + 1 })
        .where(eq(users.id, userId));
    }
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
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
    const [conversation] = await db.insert(conversations).values({ userId, title }).returning();
    return conversation;
  }

  async deleteConversation(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async setManualMode(conversationId: number, manual: boolean, agentName?: string): Promise<void> {
    await db.update(conversations)
      .set({ manualMode: manual, assignedAgent: agentName ?? null })
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

  async updateAiProfile(userId: number, profile: Record<string, any>): Promise<void> {
    await db.update(users)
      .set({ aiProfile: profile, aiProfileUpdatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async createMessage(conversationId: number, role: string, content: string): Promise<Message> {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  }

  async createContentItem(item: InsertContentItem): Promise<ContentItem> {
    const [ci] = await db.insert(contentItems).values(item).returning();
    return ci;
  }

  async getAllContentItems(): Promise<ContentItem[]> {
    return db.select().from(contentItems).orderBy(desc(contentItems.createdAt));
  }

  async getContentItem(id: number): Promise<ContentItem | undefined> {
    const [ci] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    return ci;
  }

  async deleteContentItem(id: number): Promise<void> {
    await db.delete(contentItems).where(eq(contentItems.id, id));
  }

  async incrementContentUsage(id: number): Promise<void> {
    const ci = await this.getContentItem(id);
    if (ci) {
      await db.update(contentItems).set({ timesUsed: ci.timesUsed + 1 }).where(eq(contentItems.id, id));
    }
  }
}

export const storage = new DatabaseStorage();
