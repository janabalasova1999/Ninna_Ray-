/**
 * Subscription Tracker — Lifecycle & Churn Risk
 *
 * Pulls subscription state from Stripe, computes churn risk per user,
 * and provides health dashboards for the Manager UI.
 */

import { storage } from "./storage";
import { SUBSCRIPTION_PLANS } from "./stripeService";

export interface SubscriptionHealth {
  userId: number;
  userName: string;
  planName: string;
  planKey: string;
  capabilityLevel: number;
  status: "active" | "at_risk" | "expired" | "cancelled" | "none";
  churnRiskScore: number; // 0-100 (100 = very likely to churn)
  churnRiskLabel: "low" | "medium" | "high" | "critical";
  daysUntilExpiry: number | null;
  lastActiveAt: Date | null;
  totalSpent: number; // CZK
  purchaseCount: number;
  unlockedAssets: number;
  stripeSubscriptionId?: string;
  expiresAt?: Date;
  signals: string[];
}

// Compute churn risk score from multiple signals
function computeChurnRisk(signals: {
  daysSinceLastMessage: number;
  daysUntilExpiry: number | null;
  purchaseCount: number;
  totalSpent: number;
  capabilityLevel: number;
}): { score: number; label: "low" | "medium" | "high" | "critical"; signals: string[] } {
  let score = 0;
  const flags: string[] = [];

  // Days since last activity
  if (signals.daysSinceLastMessage > 30) {
    score += 40;
    flags.push(`Neaktivní ${signals.daysSinceLastMessage} dní`);
  } else if (signals.daysSinceLastMessage > 14) {
    score += 20;
    flags.push(`Slabá aktivita posledních ${signals.daysSinceLastMessage} dní`);
  } else if (signals.daysSinceLastMessage > 7) {
    score += 10;
    flags.push(`${signals.daysSinceLastMessage} dní bez zprávy`);
  }

  // Days until expiry
  if (signals.daysUntilExpiry !== null) {
    if (signals.daysUntilExpiry <= 3) {
      score += 40;
      flags.push(`⚠️ Předplatné vyprší za ${signals.daysUntilExpiry} den(ů)!`);
    } else if (signals.daysUntilExpiry <= 7) {
      score += 25;
      flags.push(`Vyprší za ${signals.daysUntilExpiry} dní`);
    } else if (signals.daysUntilExpiry <= 14) {
      score += 10;
      flags.push(`Obnovení za ${signals.daysUntilExpiry} dní`);
    }
  }

  // Low spend = less invested
  if (signals.purchaseCount === 0) {
    score += 15;
    flags.push("Nikdy nic nekoupil");
  } else if (signals.purchaseCount === 1) {
    score += 5;
    flags.push("Jen 1 nákup");
  }

  // Basic tier has higher churn
  if (signals.capabilityLevel === 1) {
    score += 10;
    flags.push("BASIC tier — upgrade potenciál");
  }

  const label =
    score >= 70 ? "critical" :
    score >= 50 ? "high" :
    score >= 25 ? "medium" : "low";

  return { score: Math.min(100, score), label, signals: flags };
}

// Get full subscription health for all users
export async function getSubscriptionHealthReport(): Promise<{
  users: SubscriptionHealth[];
  summary: {
    totalSubscribed: number;
    atRisk: number;
    critical: number;
    avgChurnRisk: number;
    totalMrr: number;
  };
}> {
  const allUsers = await storage.getAllUsers();
  const healthList: SubscriptionHealth[] = [];

  for (const user of allUsers) {
    try {
      const [isSubscribed, instance, paymentStats] = await Promise.all([
        storage.isUserSubscribed(user.id),
        storage.getAvatarInstance(user.id),
        storage.getUserPaymentStats(user.id),
      ]);

      if (!isSubscribed) continue;

      const capLevel = instance?.capabilityLevel || 1;
      const plan = SUBSCRIPTION_PLANS.find(p => p.capabilityLevel === capLevel);

      // Get last message time for activity tracking
      const convs = await storage.getConversationsByUser(user.id);
      let lastActiveAt: Date | null = null;
      let daysSinceLastMessage = 999;

      if (convs.length > 0) {
        const recentMessages = await storage.getRecentMessages(convs[0].id, 1);
        if (recentMessages.length > 0) {
          lastActiveAt = new Date(recentMessages[0].createdAt);
          daysSinceLastMessage = Math.floor(
            (Date.now() - lastActiveAt.getTime()) / (1000 * 60 * 60 * 24)
          );
        }
      }

      // Try to get Stripe subscription info
      let daysUntilExpiry: number | null = null;
      let expiresAt: Date | undefined;
      let stripeSubscriptionId: string | undefined;
      let subStatus: SubscriptionHealth["status"] = "active";

      if (user.stripeCustomerId) {
        try {
          const { getUncachableStripeClient } = await import("./stripeClient");
          const stripe = await getUncachableStripeClient();
          const subs = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status: "all",
            limit: 1,
          });

          if (subs.data.length > 0) {
            const sub = subs.data[0];
            stripeSubscriptionId = sub.id;

            if (sub.status === "active" || sub.status === "trialing") {
              subStatus = "active";
              const expTs = sub.current_period_end * 1000;
              expiresAt = new Date(expTs);
              daysUntilExpiry = Math.max(0, Math.floor((expTs - Date.now()) / (1000 * 60 * 60 * 24)));
            } else if (sub.status === "canceled") {
              subStatus = "cancelled";
            } else if (sub.status === "past_due" || sub.status === "unpaid") {
              subStatus = "at_risk";
            }
          }
        } catch {
          // Stripe may not be configured
        }
      }

      const churnRisk = computeChurnRisk({
        daysSinceLastMessage,
        daysUntilExpiry,
        purchaseCount: paymentStats.purchaseCount,
        totalSpent: paymentStats.totalSpent,
        capabilityLevel: capLevel,
      });

      if (subStatus === "active" && churnRisk.label === "critical") {
        subStatus = "at_risk";
      }

      const unlockedCount = (await storage.getBotWardrobe(user.id)).unlocked.length;

      healthList.push({
        userId: user.id,
        userName: user.name,
        planName: plan?.name || `Level ${capLevel}`,
        planKey: plan?.key || "basic",
        capabilityLevel: capLevel,
        status: subStatus,
        churnRiskScore: churnRisk.score,
        churnRiskLabel: churnRisk.label,
        daysUntilExpiry,
        lastActiveAt,
        totalSpent: paymentStats.totalSpent,
        purchaseCount: paymentStats.purchaseCount,
        unlockedAssets: unlockedCount,
        stripeSubscriptionId,
        expiresAt,
        signals: churnRisk.signals,
      });
    } catch (err) {
      console.error(`[SubTracker] Error processing user #${user.id}:`, err);
    }
  }

  healthList.sort((a, b) => b.churnRiskScore - a.churnRiskScore);

  const atRisk = healthList.filter(u => u.churnRiskLabel === "high" || u.churnRiskLabel === "critical").length;
  const critical = healthList.filter(u => u.churnRiskLabel === "critical").length;
  const avgChurnRisk = healthList.length > 0
    ? Math.round(healthList.reduce((s, u) => s + u.churnRiskScore, 0) / healthList.length)
    : 0;

  // Estimate MRR from capability levels
  const totalMrr = healthList.reduce((s, u) => {
    const plan = SUBSCRIPTION_PLANS.find(p => p.capabilityLevel === u.capabilityLevel);
    return s + (plan ? Math.round(plan.priceMonthly / 100) : 0);
  }, 0);

  return {
    users: healthList,
    summary: {
      totalSubscribed: healthList.length,
      atRisk,
      critical,
      avgChurnRisk,
      totalMrr,
    },
  };
}

// Log a subscription lifecycle event
export async function logSubscriptionEvent(
  userId: number | null,
  eventType: string,
  data: {
    stripeSubscriptionId?: string;
    planKey?: string;
    capabilityLevel?: number;
    amountCzk?: number;
    expiresAt?: Date;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  try {
    await storage.createSubscriptionEvent({
      userId: userId ?? undefined,
      stripeSubscriptionId: data.stripeSubscriptionId,
      eventType,
      planKey: data.planKey,
      capabilityLevel: data.capabilityLevel,
      amountCzk: data.amountCzk,
      expiresAt: data.expiresAt,
      metadata: data.metadata || {},
    });
  } catch (err) {
    console.error("[SubTracker] logSubscriptionEvent error:", err);
  }
}
