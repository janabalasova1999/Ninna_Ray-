import { pgTable, text, serial, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  chatCode: text("chat_code").unique(),
  isPremium: boolean("is_premium").default(false),
  messageCount: integer("message_count").default(0).notNull(),
  aiProfile: jsonb("ai_profile"),
  aiProfileUpdatedAt: timestamp("ai_profile_updated_at"),
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
  role: text("role").notNull(), // 'user', 'assistant', 'system'
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
  category: text("category").default("general").notNull(),
  description: text("description"),
  timesUsed: integer("times_used").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── Virtual Twin: Avatar Elements ─────────────────────────────────────────────
// Vizuální prvky (skiny) odvozené ze zakoupených fotografií
export const avatarElements = pgTable("avatar_elements", {
  id: serial("id").primaryKey(),
  contentItemId: integer("content_item_id").references(() => contentItems.id, { onDelete: "cascade" }),
  elementType: text("element_type").notNull(), // outfit | hair | background | expression | accessory
  name: text("name").notNull(),
  previewUrl: text("preview_url"), // URL náhledu (teaser image)
  metadata: jsonb("metadata").default({}), // { color, style, season, ... }
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ─── Virtual Twin: Avatar Instances ────────────────────────────────────────────
// Konfigurace virtuálního twina pro každého zákazníka
export const avatarInstances = pgTable("avatar_instances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  visualConfig: jsonb("visual_config").default({}), // { outfit_id, hair_id, background_id, expression_id, ... }
  personaName: text("persona_name").default("Ninna"),
  capabilityLevel: integer("capability_level").default(1), // 1=basic, 2=vip, 3=premium
  lastInteraction: timestamp("last_interaction"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertContentItemSchema = createInsertSchema(contentItems).omit({ id: true, createdAt: true });
export const insertAvatarElementSchema = createInsertSchema(avatarElements).omit({ id: true, createdAt: true });
export const insertAvatarInstanceSchema = createInsertSchema(avatarInstances).omit({ id: true, createdAt: true, updatedAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type ContentItem = typeof contentItems.$inferSelect;
export type InsertContentItem = z.infer<typeof insertContentItemSchema>;
