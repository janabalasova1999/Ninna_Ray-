/**
 * Smart Content Recommendation Engine
 *
 * Analyzes user purchase history, behavior patterns, and available content
 * to generate AI-powered personalized content recommendations.
 * Recommendations are stored in DB and served via /api/bot/recommendations.
 */

import { storage } from "./storage";
import type { User, ContentItem } from "@shared/schema";

interface RecommendationCandidate {
  contentItemId: number;
  score: number;
  reason: string;
  category: string;
}

// Generate recommendations for a single user
export async function generateRecommendationsForUser(userId: number): Promise<number> {
  try {
    const user = await storage.getUser(userId);
    if (!user) return 0;

    const [allContent, purchasedIds, existingRecs] = await Promise.all([
      storage.getAllContentItems(),
      storage.getUserPurchasedContentIds(userId),
      storage.getContentRecommendations(userId, { statusFilter: ["pending", "shown"] }),
    ]);

    // Filter out already purchased and already-recommended content
    const existingRecIds = new Set(existingRecs.map(r => r.contentItemId));
    const purchasedSet = new Set(purchasedIds);
    const candidates = allContent.filter(
      c => !purchasedSet.has(c.id) && !existingRecIds.has(c.id)
    );

    if (candidates.length === 0) return 0;

    // Score candidates using heuristics + optional AI
    const scored = await scoreAndRankCandidates(user, candidates, purchasedIds, allContent);
    const top = scored.slice(0, 5); // Take top 5

    let created = 0;
    for (const rec of top) {
      await storage.createContentRecommendation({
        userId,
        contentItemId: rec.contentItemId,
        score: rec.score,
        reason: rec.reason,
        category: rec.category,
        status: "pending",
      });
      created++;
    }

    console.log(`[Recommendations] Generated ${created} recommendations for user #${userId}`);
    return created;
  } catch (err) {
    console.error("[Recommendations] generateRecommendationsForUser error:", err);
    return 0;
  }
}

async function scoreAndRankCandidates(
  user: User,
  candidates: ContentItem[],
  purchasedIds: number[],
  allContent: ContentItem[]
): Promise<RecommendationCandidate[]> {
  const aiProfile = (user.aiProfile as Record<string, any>) || {};
  const purchasedContent = allContent.filter(c => purchasedIds.includes(c.id));

  // Build tag affinity from purchases
  const tagScores: Record<string, number> = {};
  for (const item of purchasedContent) {
    const tags = [...(item.tags || []), ...(item.assetTags || [])];
    for (const tag of tags) {
      tagScores[tag] = (tagScores[tag] || 0) + 1;
    }
  }

  // Try AI scoring for better results
  if (purchasedContent.length > 0 && candidates.length > 0) {
    try {
      return await aiScoreCandidates(user, candidates, purchasedContent, aiProfile, tagScores);
    } catch {
      // Fallback to heuristic scoring
    }
  }

  return heuristicScoreCandidates(candidates, tagScores, purchasedIds);
}

async function aiScoreCandidates(
  user: User,
  candidates: ContentItem[],
  purchasedContent: ContentItem[],
  aiProfile: Record<string, any>,
  tagScores: Record<string, number>
): Promise<RecommendationCandidate[]> {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI();

  const purchasedSummary = purchasedContent
    .slice(0, 5)
    .map(c => `#${c.id}: ${c.description || c.originalName} [${(c.tags || []).join(", ")}]`)
    .join("\n");

  const candidateList = candidates
    .slice(0, 15)
    .map(c => `#${c.id}: ${c.description || c.originalName} [${(c.tags || []).join(", ")}]`)
    .join("\n");

  const prompt = `Jsi expert na content doporučení pro fanouškovský portál.
Fanouškův profil: engagementScore=${aiProfile.engagementScore || 50}, priceSensitivity=${aiProfile.priceSensitivity || "medium"}, sellStyle=${aiProfile.sellStyle || "standard"}

Co si koupil:
${purchasedSummary || "Zatím nic"}

Dostupný obsah ke koupi (výběr):
${candidateList}

Vrať JSON s "recommendations" polem — top 5 doporučení:
[{"contentItemId": NUMBER, "score": 0.0-1.0, "reason": "Krátké česky proč", "category": "content|upsell|bundle"}]

Základ skórování: podobné tagy jako koupené, rozmanitost, potenciál k prodeji.`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 400,
  });

  const json = JSON.parse(resp.choices[0].message.content || "{}");
  return (json.recommendations || []).map((r: any) => ({
    contentItemId: r.contentItemId,
    score: Math.min(1, Math.max(0, r.score || 0.5)),
    reason: r.reason || "Doporučeno pro tebe",
    category: r.category || "content",
  }));
}

function heuristicScoreCandidates(
  candidates: ContentItem[],
  tagScores: Record<string, number>,
  purchasedIds: number[]
): RecommendationCandidate[] {
  return candidates
    .map(c => {
      const tags = [...(c.tags || []), ...(c.assetTags || [])];
      let score = 0.3; // base score
      let matchedTags: string[] = [];

      for (const tag of tags) {
        if (tagScores[tag]) {
          score += 0.15 * tagScores[tag];
          matchedTags.push(tag);
        }
      }

      if (c.timesUsed > 5) score += 0.1;
      score = Math.min(1, score);

      const reason = matchedTags.length > 0
        ? `Podobné jako tvoje nákupy (${matchedTags.slice(0, 2).join(", ")})`
        : "Populární obsah, který by se ti mohl líbit";

      return {
        contentItemId: c.id,
        score,
        reason,
        category: "content" as const,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// Generate recommendations for all active subscribed users (called by AI Manager)
export async function generateRecommendationsForAllUsers(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    const subscribed = await Promise.all(
      allUsers.map(async u => ({
        user: u,
        isSubscribed: await storage.isUserSubscribed(u.id),
      }))
    );

    const targets = subscribed.filter(u => u.isSubscribed).slice(0, 10); // max 10 at a time
    for (const { user } of targets) {
      await generateRecommendationsForUser(user.id);
    }
    console.log(`[Recommendations] Batch generation done for ${targets.length} users`);
  } catch (err) {
    console.error("[Recommendations] batch error:", err);
  }
}
