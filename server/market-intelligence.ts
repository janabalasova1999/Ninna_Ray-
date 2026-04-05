import { storage } from "./storage";

export interface MarketTier {
  name: string;
  label: string;
  priceRange: { min: number; max: number };
  description: string;
  conversionBenchmark: number;
}

export interface ContentPricing {
  type: string;
  label: string;
  tiers: {
    low: { min: number; max: number };
    mid: { min: number; max: number };
    high: { min: number; max: number };
  };
}

export interface MarketData {
  lastUpdated: string;
  currency: string;
  tiers: MarketTier[];
  contentPricing: ContentPricing[];
  benchmarks: {
    avgConversionRate: number;
    avgFirstPurchase: number;
    avgRepeatPurchase: number;
    avgLifetimeValue: number;
    optimalFirstOffer: { min: number; max: number };
  };
  trendingContent: string[];
  leadSources: { platform: string; potential: string; strategy: string }[];
}

export interface PricingDecision {
  recommendedPrice: number;
  tier: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  priceRange: { min: number; max: number };
  basedOn: string[];
}

export interface MarketIntelligence {
  marketData: MarketData;
  internalMetrics: InternalMetrics;
  pricingEngine: (userId: number, contentType: string) => Promise<PricingDecision>;
  getTrendScore: () => number;
  getStrategyRecommendations: () => StrategyRecommendation[];
}

interface InternalMetrics {
  totalRevenue: number;
  totalTransactions: number;
  avgTransactionValue: number;
  conversionRate: number;
  bestSellingPriceRange: { min: number; max: number } | null;
  priceDistribution: { range: string; count: number; revenue: number }[];
  recentTrend: "growing" | "stable" | "declining" | "no_data";
  userSegments: {
    highSpenders: number;
    midSpenders: number;
    lowSpenders: number;
    nonBuyers: number;
  };
}

interface StrategyRecommendation {
  type: "pricing" | "content" | "timing" | "targeting" | "lead_gen";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  dataSource: string;
}

const MARKET_BENCHMARKS: MarketData = {
  lastUpdated: new Date().toISOString(),
  currency: "CZK",
  tiers: [
    {
      name: "ppv_entry",
      label: "PPV Entry (první nákup)",
      priceRange: { min: 199, max: 349 },
      description: "První nákup — filtruje neplatiče. Nesnižuj pod 199 Kč. Testuj 225/299/375.",
      conversionBenchmark: 6,
    },
    {
      name: "ppv_standard",
      label: "PPV Standard (2. nákup)",
      priceRange: { min: 375, max: 749 },
      description: "Druhý nákup — ověřený kupec. Vyšší kvalita obsahu, vyšší cena.",
      conversionBenchmark: 4,
    },
    {
      name: "ppv_premium",
      label: "PPV Premium (3.+ nákup)",
      priceRange: { min: 749, max: 1999 },
      description: "Balíčky, delší videa, série. Pro zákazníky se 2+ nákupy.",
      conversionBenchmark: 3,
    },
    {
      name: "ppv_vip",
      label: "PPV VIP / Custom",
      priceRange: { min: 1999, max: 4999 },
      description: "Custom obsah, osobní. Pouze pro ověřené high-spendery.",
      conversionBenchmark: 1,
    },
  ],
  contentPricing: [
    {
      type: "photo_single",
      label: "Jednotlivá fotka",
      tiers: {
        low: { min: 199, max: 299 },
        mid: { min: 375, max: 599 },
        high: { min: 749, max: 1249 },
      },
    },
    {
      type: "photo_set",
      label: "Sada fotek 3-5ks",
      tiers: {
        low: { min: 299, max: 499 },
        mid: { min: 599, max: 999 },
        high: { min: 1249, max: 1999 },
      },
    },
    {
      type: "video_short",
      label: "Krátké video do 2 min",
      tiers: {
        low: { min: 299, max: 499 },
        mid: { min: 599, max: 999 },
        high: { min: 1249, max: 1999 },
      },
    },
    {
      type: "video_long",
      label: "Delší video 2+ min",
      tiers: {
        low: { min: 499, max: 749 },
        mid: { min: 999, max: 1499 },
        high: { min: 1999, max: 3499 },
      },
    },
    {
      type: "custom",
      label: "Custom obsah na míru",
      tiers: {
        low: { min: 749, max: 1249 },
        mid: { min: 1499, max: 2499 },
        high: { min: 2999, max: 4999 },
      },
    },
  ],
  benchmarks: {
    avgConversionRate: 5,
    avgFirstPurchase: 249,
    avgRepeatPurchase: 599,
    avgLifetimeValue: 4500,
    optimalFirstOffer: { min: 199, max: 349 },
  },
  trendingContent: [
    "Behind-the-scenes / osobní momenty",
    "Série obsahu (part 1, 2, 3... nutí kupovat další)",
    "Exkluzivní preview / coming soon teasery",
    "Personalizované zprávy a pozdravy",
    "Limitované edice (jen dnes, jen pro tebe)",
    "Reakce na požadavky zákazníka",
  ],
  leadSources: [
    { platform: "Instagram", potential: "vysoký", strategy: "Stories s teasery, link v bio, Reels pro reach" },
    { platform: "TikTok", potential: "vysoký", strategy: "Virální krátká videa, trendy zvuky, redirect do DM" },
    { platform: "Twitter/X", potential: "střední", strategy: "Tease obsah, engagement s komunitou, přímé DM" },
    { platform: "Reddit", potential: "střední", strategy: "Niche subreddity, AMA, teaser posty s odkazem" },
    { platform: "Telegram", potential: "střední", strategy: "Kanál s free preview, premium skupina pro platící" },
    { platform: "Discord", potential: "nízký-střední", strategy: "Komunitní server, exkluzivní role pro platící" },
  ],
};

async function computeInternalMetrics(): Promise<InternalMetrics> {
  const allPayments = await storage.getAllPayments();
  const completed = allPayments.filter(p => p.status === "completed");
  const allUsers = await storage.getAllUsers();

  const totalRevenue = completed.reduce((s, p) => s + p.amount, 0) / 100;
  const totalTransactions = completed.length;
  const avgTransactionValue = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;

  const buyerIds = new Set(completed.map(p => p.userId));
  const totalCustomers = allUsers.filter(u => u.role === "customer").length || allUsers.length;
  const conversionRate = totalCustomers > 0 ? Math.round((buyerIds.size / totalCustomers) * 1000) / 10 : 0;

  const ranges = [
    { label: "0-49 Kč", min: 0, max: 4999 },
    { label: "50-99 Kč", min: 5000, max: 9999 },
    { label: "100-199 Kč", min: 10000, max: 19999 },
    { label: "200-499 Kč", min: 20000, max: 49999 },
    { label: "500+ Kč", min: 50000, max: Infinity },
  ];

  const priceDistribution = ranges.map(r => {
    const inRange = completed.filter(p => p.amount >= r.min && p.amount <= r.max);
    return {
      range: r.label,
      count: inRange.length,
      revenue: Math.round(inRange.reduce((s, p) => s + p.amount, 0) / 100),
    };
  });

  let bestSellingPriceRange: { min: number; max: number } | null = null;
  if (completed.length >= 3) {
    const sorted = completed.map(p => p.amount / 100).sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    bestSellingPriceRange = { min: Math.round(q1), max: Math.round(q3) };
  }

  const now = Date.now();
  const last7d = completed.filter(p => now - new Date(p.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000);
  const prev7d = completed.filter(p => {
    const age = now - new Date(p.createdAt).getTime();
    return age >= 7 * 24 * 60 * 60 * 1000 && age < 14 * 24 * 60 * 60 * 1000;
  });

  let recentTrend: "growing" | "stable" | "declining" | "no_data" = "no_data";
  if (completed.length >= 3) {
    const recentRevenue = last7d.reduce((s, p) => s + p.amount, 0);
    const prevRevenue = prev7d.reduce((s, p) => s + p.amount, 0);
    if (prevRevenue === 0 && recentRevenue > 0) recentTrend = "growing";
    else if (prevRevenue > 0) {
      const change = (recentRevenue - prevRevenue) / prevRevenue;
      if (change > 0.15) recentTrend = "growing";
      else if (change < -0.15) recentTrend = "declining";
      else recentTrend = "stable";
    }
  }

  const spendByUser: Record<number, number> = {};
  for (const p of completed) {
    spendByUser[p.userId] = (spendByUser[p.userId] || 0) + p.amount / 100;
  }
  const spenders = Object.values(spendByUser);
  const highSpenders = spenders.filter(s => s >= 500).length;
  const midSpenders = spenders.filter(s => s >= 100 && s < 500).length;
  const lowSpenders = spenders.filter(s => s > 0 && s < 100).length;
  const nonBuyers = totalCustomers - buyerIds.size;

  return {
    totalRevenue,
    totalTransactions,
    avgTransactionValue,
    conversionRate,
    bestSellingPriceRange,
    priceDistribution,
    recentTrend,
    userSegments: { highSpenders, midSpenders, lowSpenders, nonBuyers },
  };
}

async function pricingEngine(userId: number, contentType: string): Promise<PricingDecision> {
  const metrics = await computeInternalMetrics();
  const userPayments = await storage.getPaymentsByUser(userId);
  const completedUserPayments = userPayments.filter(p => p.status === "completed");
  const user = await storage.getUser(userId);
  const profile = user?.aiProfile as any;

  const basedOn: string[] = [];
  const contentConfig = MARKET_BENCHMARKS.contentPricing.find(c => c.type === contentType);

  const isFirstBuy = completedUserPayments.length === 0;
  const userTotalSpent = completedUserPayments.reduce((s, p) => s + p.amount, 0) / 100;
  const userAvgPayment = completedUserPayments.length > 0 ? Math.round(userTotalSpent / completedUserPayments.length) : 0;

  let tier: string;
  let priceRange: { min: number; max: number };
  let recommendedPrice: number;
  let confidence: "high" | "medium" | "low";
  let reasoning: string;

  if (isFirstBuy) {
    tier = "ppv_entry";
    if (contentConfig) {
      priceRange = { ...contentConfig.tiers.low };
      basedOn.push(`content_type_${contentType}`);
    } else {
      priceRange = MARKET_BENCHMARKS.benchmarks.optimalFirstOffer;
    }
    basedOn.push("market_benchmark_first_purchase");

    if (metrics.totalTransactions >= 5 && metrics.avgTransactionValue > 0) {
      const allPayments = await storage.getAllPayments();
      const firstBuys = new Map<number, number>();
      for (const p of allPayments.filter(pp => pp.status === "completed")) {
        if (!firstBuys.has(p.userId)) firstBuys.set(p.userId, p.amount / 100);
      }
      const firstBuyPrices = Array.from(firstBuys.values());
      if (firstBuyPrices.length >= 3) {
        const avgFirstBuy = Math.round(firstBuyPrices.reduce((s, v) => s + v, 0) / firstBuyPrices.length);
        priceRange = { min: Math.max(priceRange.min, avgFirstBuy - 20), max: Math.max(priceRange.max, avgFirstBuy + 20) };
        basedOn.push("internal_first_buy_avg");
      }
    }

    recommendedPrice = Math.round((priceRange.min + priceRange.max) / 2);
    confidence = metrics.totalTransactions >= 5 ? "medium" : "low";
    reasoning = `První nákup (${contentType}). ${confidence === "low" ? "Málo interních dat, použit tržní benchmark." : "Cena založena na interním průměru prvních nákupů."}`;
  } else {
    basedOn.push("user_purchase_history");

    if (userAvgPayment < 400) {
      tier = "ppv_standard";
    } else if (userAvgPayment < 1000) {
      tier = "ppv_premium";
    } else {
      tier = "ppv_vip";
    }

    const tierConfig = MARKET_BENCHMARKS.tiers.find(t => t.name === tier);
    priceRange = tierConfig ? { ...tierConfig.priceRange } : { min: 375, max: 749 };

    if (contentConfig) {
      const tierKey = tier === "ppv_entry" || tier === "ppv_standard" ? (tier === "ppv_entry" ? "low" : "mid") : "high";
      const contentRange = contentConfig.tiers[tierKey as keyof typeof contentConfig.tiers];
      if (contentRange) {
        if (tier === "ppv_vip") {
          priceRange = { min: Math.max(contentRange.max, priceRange.min), max: priceRange.max };
        } else {
          priceRange = contentRange;
        }
        basedOn.push(`content_type_${contentType}`);
      }
    }

    if (metrics.bestSellingPriceRange && metrics.totalTransactions >= 5) {
      priceRange.min = Math.max(priceRange.min, metrics.bestSellingPriceRange.min);
      priceRange.max = Math.min(priceRange.max, metrics.bestSellingPriceRange.max);
      if (priceRange.min > priceRange.max) priceRange.max = priceRange.min + 50;
      basedOn.push("internal_best_selling_range");
    }

    const uplift = completedUserPayments.length >= 3 ? 1.15 : 1.05;
    recommendedPrice = Math.round(userAvgPayment * uplift);
    recommendedPrice = Math.max(priceRange.min, Math.min(priceRange.max, recommendedPrice));

    confidence = completedUserPayments.length >= 3 ? "high" : "medium";
    reasoning = `Zákazník utratil celkem ${userTotalSpent} Kč (${completedUserPayments.length}x, průměr ${userAvgPayment} Kč). Cena: ${recommendedPrice} Kč (uplift ${Math.round((uplift - 1) * 100)}% z průměru). Tier: ${tier}.`;
  }

  if (profile?.priceSensitivity === "vysoká") {
    recommendedPrice = Math.max(priceRange.min, Math.round(recommendedPrice * 0.85));
    basedOn.push("high_price_sensitivity_discount");
    reasoning += " Sníženo kvůli vysoké cenové citlivosti.";
  } else if (profile?.priceSensitivity === "nízká") {
    recommendedPrice = Math.min(priceRange.max, Math.round(recommendedPrice * 1.1));
    basedOn.push("low_price_sensitivity_premium");
    reasoning += " Navýšeno — nízká cenová citlivost.";
  }

  return {
    recommendedPrice,
    tier,
    confidence,
    reasoning,
    priceRange,
    basedOn,
  };
}

function computeTrendScore(metrics: InternalMetrics): number {
  let score = 50;

  if (metrics.recentTrend === "growing") score += 20;
  else if (metrics.recentTrend === "declining") score -= 15;

  if (metrics.conversionRate > 5) score += 15;
  else if (metrics.conversionRate > 2) score += 5;
  else if (metrics.conversionRate < 1) score -= 10;

  if (metrics.userSegments.highSpenders > 0) score += 10;
  if (metrics.totalTransactions > 10) score += 5;

  return Math.max(0, Math.min(100, score));
}

function generateStrategyRecommendations(metrics: InternalMetrics): StrategyRecommendation[] {
  const recs: StrategyRecommendation[] = [];

  if (metrics.totalTransactions === 0) {
    recs.push({
      type: "pricing",
      priority: "high",
      title: "Spustit první prodej",
      description: `Zatím žádné transakce. Nabídni entry-level obsah za ${MARKET_BENCHMARKS.benchmarks.optimalFirstOffer.min}-${MARKET_BENCHMARKS.benchmarks.optimalFirstOffer.max} Kč pro testování trhu.`,
      dataSource: "market_benchmark",
    });
  }

  if (metrics.conversionRate < MARKET_BENCHMARKS.benchmarks.avgConversionRate && metrics.userSegments.nonBuyers > 0) {
    recs.push({
      type: "targeting",
      priority: "high",
      title: "Zvýšit konverzi",
      description: `Konverze ${metrics.conversionRate}% je pod tržním průměrem (${MARKET_BENCHMARKS.benchmarks.avgConversionRate}%). ${metrics.userSegments.nonBuyers} uživatelů zatím nekoupilo — soustřeď se na ně s nižšími cenami.`,
      dataSource: "internal_metrics + market_benchmark",
    });
  }

  if (metrics.bestSellingPriceRange) {
    recs.push({
      type: "pricing",
      priority: "medium",
      title: "Optimální cenový rozsah",
      description: `Nejúspěšnější prodeje: ${metrics.bestSellingPriceRange.min}-${metrics.bestSellingPriceRange.max} Kč. Soustřeď nabídky do tohoto rozsahu.`,
      dataSource: "internal_sales_data",
    });
  }

  if (metrics.recentTrend === "declining") {
    recs.push({
      type: "content",
      priority: "high",
      title: "Revenue klesá",
      description: "Tržby za posledních 7 dní klesly oproti předchozímu týdnu. Zkus změnit typ obsahu nebo nabídnout akci.",
      dataSource: "internal_trend_analysis",
    });
  }

  if (metrics.userSegments.highSpenders > 0) {
    recs.push({
      type: "pricing",
      priority: "medium",
      title: "VIP segment existuje",
      description: `${metrics.userSegments.highSpenders} zákazník(ů) utratil(o) 500+ Kč. Nabídni jim premium/custom obsah za vyšší ceny.`,
      dataSource: "internal_user_segments",
    });
  }

  const bestDist = metrics.priceDistribution.sort((a, b) => b.count - a.count)[0];
  if (bestDist && bestDist.count > 0) {
    recs.push({
      type: "pricing",
      priority: "low",
      title: "Nejčastější cenový rozsah",
      description: `Nejvíce prodejů (${bestDist.count}x) v rozsahu ${bestDist.range}. Revenue z tohoto rozsahu: ${bestDist.revenue} Kč.`,
      dataSource: "internal_price_distribution",
    });
  }

  for (const source of MARKET_BENCHMARKS.leadSources.filter(s => s.potential === "vysoký")) {
    recs.push({
      type: "lead_gen",
      priority: "medium",
      title: `${source.platform} — vysoký potenciál`,
      description: source.strategy,
      dataSource: "market_benchmark",
    });
  }

  return recs.sort((a, b) => {
    const p = { high: 0, medium: 1, low: 2 };
    return p[a.priority] - p[b.priority];
  });
}

export async function getMarketIntelligence(): Promise<{
  marketData: MarketData;
  internalMetrics: InternalMetrics;
  trendScore: number;
  recommendations: StrategyRecommendation[];
}> {
  const metrics = await computeInternalMetrics();
  const trendScore = computeTrendScore(metrics);
  const recommendations = generateStrategyRecommendations(metrics);

  return {
    marketData: { ...MARKET_BENCHMARKS, lastUpdated: new Date().toISOString() },
    internalMetrics: metrics,
    trendScore,
    recommendations,
  };
}

export async function getPricingForUser(userId: number, contentType: string = "photo_single"): Promise<PricingDecision> {
  return pricingEngine(userId, contentType);
}

export function getMarketContext(): string {
  const tiers = MARKET_BENCHMARKS.tiers
    .map(t => `${t.label}: ${t.priceRange.min}-${t.priceRange.max} Kč (benchmark konverze: ${t.conversionBenchmark}%)`)
    .join("\n  ");

  const contentTypes = MARKET_BENCHMARKS.contentPricing
    .map(c => `${c.label}: low ${c.tiers.low.min}-${c.tiers.low.max} | mid ${c.tiers.mid.min}-${c.tiers.mid.max} | high ${c.tiers.high.min}-${c.tiers.high.max} Kč`)
    .join("\n  ");

  return `═══ TRŽNÍ DATA (reálné benchmarky) ═══
CENOVÉ TIERS:
  ${tiers}

CENY PODLE TYPU OBSAHU:
  ${contentTypes}

TRŽNÍ BENCHMARKY:
  Průměrná konverze: ${MARKET_BENCHMARKS.benchmarks.avgConversionRate}%
  Průměrný první nákup: ${MARKET_BENCHMARKS.benchmarks.avgFirstPurchase} Kč
  Průměrný opakovaný nákup: ${MARKET_BENCHMARKS.benchmarks.avgRepeatPurchase} Kč
  Optimální první nabídka: ${MARKET_BENCHMARKS.benchmarks.optimalFirstOffer.min}-${MARKET_BENCHMARKS.benchmarks.optimalFirstOffer.max} Kč

TRENDING OBSAH:
  ${MARKET_BENCHMARKS.trendingContent.join("\n  ")}

KRITICKÉ PRAVIDLO: NIKDY nevymýšlej ceny z hlavy. VŽDY použij tržní data + interní metriky. Pokud nemáš dost dat, použij bezpečný rozsah z benchmarků.`;
}

export function getMarketBenchmarks(): MarketData {
  return MARKET_BENCHMARKS;
}
