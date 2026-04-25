import { pgTable, text, serial, boolean, timestamp, integer, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  chatCode: text("chat_code").unique(),
  isPremium: boolean("is_premium").default(false),
  messageCount: integer("message_count").default(0).notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  aiProfile: jsonb("ai_profile"),
  aiProfileUpdatedAt: timestamp("ai_profile_updated_at"),
  platform: text("platform").default("direct"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  manualMode: boolean("manual_mode").default(false).notNull(),
  assignedAgent: text("assigned_agent"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const contentItems = pgTable("content_items", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  tags: text("tags").array().default([]).notNull(),
  assetTags: text("asset_tags").array().default([]).notNull(),
  category: text("category").default("general").notNull(),
  description: text("description"),
  timesUsed: integer("times_used").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const managerActions = pgTable("manager_actions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").default("pending").notNull(),
  message: text("message"),
  photoId: integer("photo_id"),
  price: integer("price"),
  purpose: text("purpose"),
  timing: text("timing"),
  result: text("result"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const managerLog = pgTable("manager_log", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  contentItemId: integer("content_item_id").references(() => contentItems.id),
  amount: integer("amount").notNull(),
  currency: text("currency").default("czk").notNull(),
  status: text("status").default("pending").notNull(),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  type: text("type").default("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── Virtual Twin: Avatar Elements ─────────────────────────────────────────────
export const avatarElements = pgTable("avatar_elements", {
  id: serial("id").primaryKey(),
  contentItemId: integer("content_item_id").references(() => contentItems.id, { onDelete: "cascade" }),
  elementType: text("element_type").notNull(), // outfit | hair | background | expression | accessory
  name: text("name").notNull(),
  previewUrl: text("preview_url"),
  priceHint: integer("price_hint"), // doporučená cena pro upsell (v Kč)
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── Virtual Twin: Avatar Instances ────────────────────────────────────────────
export const avatarInstances = pgTable("avatar_instances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  visualConfig: jsonb("visual_config").default({}),
  personaName: text("persona_name").default("Ninna"),
  capabilityLevel: integer("capability_level").default(1),
  botEnabled: boolean("bot_enabled").default(false).notNull(),
  lastInteraction: timestamp("last_interaction"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── E-Bot: User Unlocked Assets ──────────────────────────────────────────────
// Explicitní záznamy co user odemkl a proč
export const userUnlockedAssets = pgTable("user_unlocked_assets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  avatarElementId: integer("avatar_element_id").notNull().references(() => avatarElements.id, { onDelete: "cascade" }),
  paymentId: integer("payment_id").references(() => payments.id),
  unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
});

// ─── Clone Memory System ────────────────────────────────────────────────────────
// Ninna si pamatuje fakta o uzivateli, emoční stavy, klíčové momenty
export const cloneMemories = pgTable("clone_memories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  memoryType: text("memory_type").notNull(), // 'user_fact' | 'emotional_state' | 'interaction_summary' | 'preference' | 'milestone'
  content: text("content").notNull(), // The actual memory text
  importance: integer("importance").default(5).notNull(), // 1-10 importance score
  emotionalContext: text("emotional_context"), // current emotional state when memory was formed
  tags: text("tags").array().default([]).notNull(), // searchable tags
  source: text("source").default("auto"), // 'auto' | 'manual' | 'purchase'
  expiresAt: timestamp("expires_at"), // null = permanent
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── Smart Content Recommendations ─────────────────────────────────────────────
// AI-driven personalized content picks based on purchase history & behavior
export const contentRecommendations = pgTable("content_recommendations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contentItemId: integer("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
  score: real("score").default(0.5).notNull(), // recommendation confidence 0.0 - 1.0
  reason: text("reason"), // why recommended (e.g. "Koupil podobné fotky")
  category: text("category").default("content"), // 'content' | 'upsell' | 'bundle'
  status: text("status").default("pending").notNull(), // 'pending' | 'shown' | 'purchased' | 'dismissed'
  shownAt: timestamp("shown_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── Subscription Tiers ────────────────────────────────────────────────────────
export const subscriptionTiers = pgTable("subscription_tiers", {
  id: serial("id").primaryKey(),
  key: text("key").unique().notNull(), // 'basic' | 'premium' | 'vip'
  name: text("name").notNull(),
  description: text("description"),
  priceCzk: integer("price_czk").notNull(),
  stripePriceId: text("stripe_price_id"),
  capabilityLevel: integer("capability_level").notNull(),
  features: jsonb("features").default([]), // array of feature strings
  proactiveRecommendations: boolean("proactive_recommendations").default(false),
  advancedCustomization: boolean("advanced_customization").default(false),
  prioritySupport: boolean("priority_support").default(false),
  exclusiveContent: boolean("exclusive_content").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── User Subscriptions ─────────────────────────────────────────────────────────
export const userSubscriptions = pgTable("user_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tierId: integer("tier_id").notNull().references(() => subscriptionTiers.id),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").default("active").notNull(), // 'active' | 'cancelled' | 'paused'
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── Subscription Events (lifecycle tracking) ───────────────────────────────────
export const subscriptionEvents = pgTable("subscription_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id"),
  eventType: text("event_type").notNull(), // 'created' | 'renewed' | 'cancelled' | 'expired' | 'at_risk'
  planKey: text("plan_key"), // 'basic' | 'vip' | 'premium'
  capabilityLevel: integer("capability_level"),
  amountCzk: integer("amount_czk"),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertContentItemSchema = createInsertSchema(contentItems).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertAvatarElementSchema = createInsertSchema(avatarElements).omit({ id: true, createdAt: true });
export const insertAvatarInstanceSchema = createInsertSchema(avatarInstances).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserUnlockedAssetSchema = createInsertSchema(userUnlockedAssets).omit({ id: true, unlockedAt: true });
export const insertCloneMemorySchema = createInsertSchema(cloneMemories).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContentRecommendationSchema = createInsertSchema(contentRecommendations).omit({ id: true, createdAt: true });
export const insertSubscriptionTierSchema = createInsertSchema(subscriptionTiers).omit({ id: true, createdAt: true });
export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSubscriptionEventSchema = createInsertSchema(subscriptionEvents).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type ContentItem = typeof contentItems.$inferSelect;
export type InsertContentItem = z.infer<typeof insertContentItemSchema>;
export type ManagerAction = typeof managerActions.$inferSelect;
export type ManagerLog = typeof managerLog.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type AvatarElement = typeof avatarElements.$inferSelect;
export type InsertAvatarElement = z.infer<typeof insertAvatarElementSchema>;
export type AvatarInstance = typeof avatarInstances.$inferSelect;
export type InsertAvatarInstance = z.infer<typeof insertAvatarInstanceSchema>;
export type UserUnlockedAsset = typeof userUnlockedAssets.$inferSelect;
export type InsertUserUnlockedAsset = z.infer<typeof insertUserUnlockedAssetSchema>;
export type CloneMemory = typeof cloneMemories.$inferSelect;
export type InsertCloneMemory = z.infer<typeof insertCloneMemorySchema>;
export type ContentRecommendation = typeof contentRecommendations.$inferSelect;
export type InsertContentRecommendation = z.infer<typeof insertContentRecommendationSchema>;
export type SubscriptionTier = typeof subscriptionTiers.$inferSelect;
export type InsertSubscriptionTier = z.infer<typeof insertSubscriptionTierSchema>;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;
export type InsertSubscriptionEvent = z.infer<typeof insertSubscriptionEventSchema>;
