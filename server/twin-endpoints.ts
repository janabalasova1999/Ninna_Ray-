import { Express } from "express";
import { storage } from "./storage";
import * as subscriptionStorage from "./storage-subscriptions";
import { db } from "./db";
import { avatarInstances, subscriptionTiers } from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerTwinEndpoints(app: Express) {
  // Get Twin instance for user
  app.get("/api/twin/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

      const [twin] = await db.select().from(avatarInstances).where(eq(avatarInstances.userId, userId));
      
      if (!twin) {
        return res.json({ id: null, botEnabled: false, capabilityLevel: 1 });
      }

      res.json(twin);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get user's subscription
  app.get("/api/subscription/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

      const sub = await subscriptionStorage.getUserSubscription(userId);
      
      if (!sub) {
        return res.json({ status: null });
      }

      const tier = await subscriptionStorage.getSubscriptionTier(sub.tierId);
      
      res.json({
        ...sub,
        tierName: tier?.name,
        capabilityLevel: tier?.capabilityLevel,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get user's unlocked skins
  app.get("/api/twin/:userId/skins", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

      const unlocked = await storage.getUserUnlockedAssets(userId);
      
      const { avatarElements } = await import("@shared/schema");
      const skins = await Promise.all(
        unlocked.map(async (u) => {
          const [element] = await db.select()
            .from(avatarElements)
            .where(eq(avatarElements.id, u.avatarElementId));
          return element;
        })
      );

      res.json(skins.filter(Boolean));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Apply skin to twin
  app.post("/api/twin/:userId/apply-skin", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { skinId } = req.body;
      
      if (isNaN(userId) || !skinId) {
        return res.status(400).json({ error: "Invalid input" });
      }

      const { avatarElements } = await import("@shared/schema");

      // Get the element (skin)
      const [element] = await db.select()
        .from(avatarElements)
        .where(eq(avatarElements.id, skinId));
      
      if (!element) return res.status(404).json({ error: "Skin not found" });

      // Update twin's visual config
      const [twin] = await db.select().from(avatarInstances).where(eq(avatarInstances.userId, userId));
      
      if (!twin) {
        // Create twin if doesn't exist
        const [newTwin] = await db.insert(avatarInstances).values({
          userId,
          visualConfig: { [element.elementType]: skinId },
          capabilityLevel: 1,
          botEnabled: false,
        }).returning();
        return res.json(newTwin);
      }

      const newConfig = {
        ...(twin.visualConfig || {}),
        [element.elementType]: skinId,
      };

      await db.update(avatarInstances)
        .set({ visualConfig: newConfig, updatedAt: new Date() })
        .where(eq(avatarInstances.userId, userId));

      const [updated] = await db.select().from(avatarInstances).where(eq(avatarInstances.userId, userId));
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List subscription tiers
  app.get("/api/subscription-tiers", async (req, res) => {
    try {
      const tiers = await subscriptionStorage.getSubscriptionTiers();
      res.json(tiers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create subscription checkout
  app.post("/api/subscription/checkout", async (req, res) => {
    try {
      const { userId, tierId } = req.body;
      if (!userId || !tierId) return res.status(400).json({ error: "Missing userId or tierId" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const tier = await subscriptionStorage.getSubscriptionTier(tierId);
      if (!tier) return res.status(404).json({ error: "Tier not found" });

      // Create Stripe subscription
      const { stripeService } = await import("./stripeService");
      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();

      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : "http://localhost:5000";

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "czk",
              product_data: {
                name: tier.name,
                description: tier.description || "Předplatné",
              },
              unit_amount: tier.priceCzk * 100,
              recurring: {
                interval: "month",
                interval_count: 1,
              },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${baseUrl}/twin?success=true`,
        cancel_url: `${baseUrl}/chat`,
        metadata: {
          userId: String(userId),
          tierId: String(tierId),
        },
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      console.error("[Subscription Checkout]", err.message);
      res.status(500).json({ error: err.message });
    }
  });
}
