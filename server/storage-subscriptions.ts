import { db } from "./db";
import { subscriptionTiers, userSubscriptions } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export async function getSubscriptionTiers() {
  return db.select().from(subscriptionTiers).orderBy(desc(subscriptionTiers.capabilityLevel));
}

export async function getSubscriptionTier(tierId: number) {
  const [tier] = await db.select().from(subscriptionTiers).where(eq(subscriptionTiers.id, tierId));
  return tier;
}

export async function getSubscriptionTierByKey(key: string) {
  const [tier] = await db.select().from(subscriptionTiers).where(eq(subscriptionTiers.key, key));
  return tier;
}

export async function getUserSubscription(userId: number) {
  const [sub] = await db.select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(1);
  return sub;
}

export async function createUserSubscription(userId: number, tierId: number, stripeSubscriptionId: string, currentPeriodStart?: Date, currentPeriodEnd?: Date) {
  const [sub] = await db.insert(userSubscriptions).values({
    userId,
    tierId,
    stripeSubscriptionId,
    status: "active",
    currentPeriodStart,
    currentPeriodEnd,
  }).returning();
  return sub;
}

export async function updateUserSubscriptionStatus(userId: number, status: "active" | "cancelled" | "paused") {
  return db.update(userSubscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(userSubscriptions.userId, userId));
}

export async function initializeSubscriptionTiers() {
  try {
    const existing = await getSubscriptionTiers();
    if (existing.length > 0) return existing;
  } catch (err) {
    console.log('[Subscriptions] Table not ready yet, skipping initialization');
    return [];
  }

  const tiers = [
    {
      key: "basic",
      name: "Basic Twin",
      description: "Základní virtuální dvojče",
      priceCzk: 499,
      capabilityLevel: 1,
      features: ["basic_chat", "unlocked_photos", "avatar_customization"],
      proactiveRecommendations: false,
      advancedCustomization: false,
      prioritySupport: false,
      exclusiveContent: false,
    },
    {
      key: "premium",
      name: "Premium Twin",
      description: "Prémiové virtuální dvojče s extra funkcemi",
      priceCzk: 999,
      capabilityLevel: 2,
      features: ["basic_chat", "unlocked_photos", "avatar_customization", "proactive_recommendations", "advanced_customization"],
      proactiveRecommendations: true,
      advancedCustomization: true,
      prioritySupport: false,
      exclusiveContent: false,
    },
    {
      key: "vip",
      name: "VIP Twin",
      description: "Nejlepší virtuální dvojče s úplnými funkcemi",
      priceCzk: 1999,
      capabilityLevel: 3,
      features: ["basic_chat", "unlocked_photos", "avatar_customization", "proactive_recommendations", "advanced_customization", "priority_support", "exclusive_content"],
      proactiveRecommendations: true,
      advancedCustomization: true,
      prioritySupport: true,
      exclusiveContent: true,
    },
  ];

  try {
    const created = await db.insert(subscriptionTiers).values(tiers).returning();
    return created;
  } catch (err: any) {
    console.log('[Subscriptions] Insert error:', err.message);
    return [];
  }
}
