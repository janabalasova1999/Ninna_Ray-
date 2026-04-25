import { storage } from "./storage";

export interface RevenueMetrics {
  mrr: number;
  arpu: number;
  churnRate: number;
  nrr: number;
  totalCustomers: number;
  payingCustomers: number;
  newCustomersThisMonth: number;
  lostCustomersThisMonth: number;
  expansionRevenue: number;
  avgRevenuePerPayingUser: number;
  conversionRate: number;
  mrrGrowthRate: number;
  revenueByPlatform: { platform: string; revenue: number; customers: number; arpu: number }[];
  mrrWaterfall: { label: string; value: number; color: string }[];
  churnCohorts: { month: string; retained: number; churned: number; retentionRate: number }[];
}

export type LeadClassification = "cold" | "warm" | "hot" | "monetized";

export interface EngagementScoreResult {
  userId: number;
  name: string;
  rawScore: number;
  decayedScore: number;
  classification: LeadClassification;
  classificationLabel: string;
  components: {
    messageScore: number;
    contentViewScore: number;
    purchaseScore: number;
    inactivityPenalty: number;
    decayFactor: number;
  };
  daysInactive: number;
  weeksSinceLastActivity: number;
}

export interface EngagementScore {
  userId: number;
  name: string;
  score: number;
  tier: string;
  messageCount: number;
  purchaseCount: number;
  daysSinceLastActivity: number;
  daysSinceRegistration: number;
  decayApplied: boolean;
  platform: string;
}

export interface WeeklyReport {
  generatedAt: string;
  period: string;
  kpis: {
    mrr: number;
    arpu: number;
    churnRate: number;
    nrr: number;
    totalCustomers: number;
    newCustomers: number;
    payingCustomers: number;
    avgEngagement: number;
    responseRate: number;
    conversionRate: number;
  };
  topPerformers: { name: string; spent: number; engagement: number }[];
  contentRanking: { name: string; revenue: number; convRate: number }[];
  funnelSnapshot: FunnelStage[];
  competitiveBenchmarks: { metric: string; ours: string; industry: string; verdict: string }[];
  strategicRecommendations: string[];
  weekOverWeek: { metric: string; thisWeek: number; lastWeek: number; change: number }[];
}

export interface DailyMetric {
  date: string;
  revenue: number;
  transactions: number;
  newUsers: number;
  activeUsers: number;
  messages: number;
}

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface ContentPerformance {
  id: number;
  name: string;
  category: string;
  timesUsed: number;
  timesSold: number;
  revenue: number;
  conversionRate: number;
  avgPrice: number;
  tags: string[];
}

export interface UserLTV {
  userId: number;
  name: string;
  totalSpent: number;
  transactionCount: number;
  avgTransaction: number;
  firstPurchase: string | null;
  lastPurchase: string | null;
  daysSinceFirst: number;
  monthlyValue: number;
  predictedLTV: number;
  segment: string;
  engagementScore: number;
  relationshipStage: string;
}

export interface DailyReport {
  generatedAt: string;
  period: string;
  revenue24h: number;
  transactions24h: number;
  newUsers24h: number;
  activeUsers24h: number;
  messages24h: number;
  funnelSnapshot: FunnelStage[];
  topContent: ContentPerformance[];
  topSpenders: { name: string; spent: number }[];
  engineActions24h: { total: number; executed: number; pending: number; failed: number };
  responseRate: number;
  avgEngagement: number;
  strategicNotes: string[];
}

export async function getDailyTimeline(days: number = 30): Promise<DailyMetric[]> {
  const safeDays = Math.min(Math.max(1, days || 30), 365);
  const allPayments = await storage.getAllPayments();
  const allUsers = await storage.getAllUsers();
  const allMessages = await storage.getAllMessages();
  const allConversations = await storage.getAllConversations();

  const convToUser = new Map<number, number>();
  for (const c of allConversations) {
    convToUser.set(c.id, c.userId);
  }

  const now = new Date();
  const timeline: DailyMetric[] = [];

  for (let i = safeDays - 1; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const dayPayments = allPayments.filter(p =>
      p.status === "completed" && p.createdAt && new Date(p.createdAt) >= dayStart && new Date(p.createdAt) <= dayEnd
    );
    const dayUsers = allUsers.filter(u => u.createdAt && new Date(u.createdAt) >= dayStart && new Date(u.createdAt) <= dayEnd);
    const dayMessages = allMessages.filter(m => m.createdAt && new Date(m.createdAt) >= dayStart && new Date(m.createdAt) <= dayEnd);
    const activeUserIds = new Set(
      dayMessages.filter(m => m.role === "user").map(m => convToUser.get(m.conversationId)).filter(Boolean)
    );

    timeline.push({
      date: dayStart.toISOString().split("T")[0],
      revenue: dayPayments.reduce((s, p) => s + (p.amount || 0), 0) / 100,
      transactions: dayPayments.length,
      newUsers: dayUsers.length,
      activeUsers: activeUserIds.size,
      messages: dayMessages.length,
    });
  }

  return timeline;
}

export async function getSalesFunnel(): Promise<FunnelStage[]> {
  const allUsers = await storage.getAllUsers();
  const customers = allUsers.filter(u => u.chatCode);

  let hot = 0, warm = 0, cold = 0, newU = 0, monetized = 0;

  for (const user of customers) {
    const profile = user.aiProfile as any;
    if (!profile) { newU++; continue; }

    const stage = profile.relationshipStage || "";
    const status = profile.status || "";

    const statusLower = status.toLowerCase();
    const stageLower = stage.toLowerCase();

    if (stageLower === "monetizace" || statusLower === "horký" || statusLower === "hot") { hot++; }
    else if (stageLower === "stabilní" || statusLower === "teplý" || statusLower === "warm") { warm++; }
    else if (stageLower === "budování" || statusLower === "studený" || statusLower === "cold") { cold++; }
    else { newU++; }
  }

  const allPayments = await storage.getAllPayments();
  const customerIds = new Set(customers.map(c => c.id));
  const buyerIds = new Set(allPayments.filter(p => p.status === "completed" && p.userId && customerIds.has(p.userId)).map(p => p.userId));
  monetized = buyerIds.size;

  const total = customers.length || 1;

  return [
    { stage: "all", label: "Celkem zákazníků", count: customers.length, percentage: 100, color: "#6b7280" },
    { stage: "new", label: "Noví", count: newU, percentage: Math.round((newU / total) * 100), color: "#3b82f6" },
    { stage: "cold", label: "Studení", count: cold, percentage: Math.round((cold / total) * 100), color: "#06b6d4" },
    { stage: "warm", label: "Teplí", count: warm, percentage: Math.round((warm / total) * 100), color: "#f59e0b" },
    { stage: "hot", label: "Horcí", count: hot, percentage: Math.round((hot / total) * 100), color: "#ef4444" },
    { stage: "monetized", label: "Platící", count: monetized, percentage: Math.round((monetized / total) * 100), color: "#10b981" },
  ];
}

export async function getContentPerformance(): Promise<ContentPerformance[]> {
  const allContent = await storage.getAllContentItems();
  const allPayments = await storage.getAllPayments();
  const completedPayments = allPayments.filter(p => p.status === "completed");

  return allContent.map(item => {
    const itemPayments = completedPayments.filter(p => p.contentItemId === item.id);
    const revenue = itemPayments.reduce((s, p) => s + (p.amount || 0), 0) / 100;

    return {
      id: item.id,
      name: item.originalName || item.filename,
      category: item.category,
      timesUsed: item.timesUsed,
      timesSold: itemPayments.length,
      revenue,
      conversionRate: item.timesUsed > 0 ? Math.round((itemPayments.length / item.timesUsed) * 1000) / 10 : 0,
      avgPrice: itemPayments.length > 0 ? Math.round(revenue / itemPayments.length) : 0,
      tags: item.tags || [],
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

export async function getUserLTVs(): Promise<UserLTV[]> {
  const allUsers = await storage.getAllUsers();
  const allPayments = await storage.getAllPayments();
  const completedPayments = allPayments.filter(p => p.status === "completed");

  const customers = allUsers.filter(u => u.chatCode);

  return customers.map(user => {
    const userPayments = completedPayments.filter(p => p.userId === user.id);
    const totalSpent = userPayments.reduce((s, p) => s + (p.amount || 0), 0) / 100;
    const sorted = userPayments.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    const firstPurchase = sorted[0]?.createdAt ? new Date(sorted[0].createdAt).toISOString() : null;
    const lastPurchase = sorted[sorted.length - 1]?.createdAt ? new Date(sorted[sorted.length - 1].createdAt).toISOString() : null;

    const daysSinceFirst = firstPurchase ? Math.max(1, Math.round((Date.now() - new Date(firstPurchase).getTime()) / (1000 * 60 * 60 * 24))) : 0;
    const monthlyValue = daysSinceFirst > 0 ? Math.round((totalSpent / daysSinceFirst) * 30 * 100) / 100 : 0;
    const predictedLTV = monthlyValue * 6;

    const profile = user.aiProfile as any;

    let segment = "non-buyer";
    if (totalSpent >= 500) segment = "vip";
    else if (totalSpent >= 100) segment = "mid";
    else if (totalSpent > 0) segment = "low";

    return {
      userId: user.id,
      name: user.name,
      totalSpent,
      transactionCount: userPayments.length,
      avgTransaction: userPayments.length > 0 ? Math.round(totalSpent / userPayments.length) : 0,
      firstPurchase,
      lastPurchase,
      daysSinceFirst,
      monthlyValue,
      predictedLTV,
      segment,
      engagementScore: profile?.engagementScore || 0,
      relationshipStage: profile?.relationshipStage || "neznámý",
    };
  }).sort((a, b) => b.predictedLTV - a.predictedLTV);
}

export async function generateDailyReport(): Promise<DailyReport> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const allPayments = await storage.getAllPayments();
  const allUsers = await storage.getAllUsers();
  const allMessages = await storage.getAllMessages();
  const allActions = await storage.getManagerActions(yesterday);
  const funnel = await getSalesFunnel();
  const contentPerf = await getContentPerformance();

  const recent24h = (d: Date | null) => d && new Date(d) >= yesterday;

  const payments24h = allPayments.filter(p => p.status === "completed" && recent24h(p.createdAt));
  const users24h = allUsers.filter(u => recent24h(u.createdAt));
  const messages24h = allMessages.filter(m => recent24h(m.createdAt));

  const executedActions = allActions.filter(a => a.status === "done");
  const pendingActions = allActions.filter(a => a.status === "pending");
  const failedActions = allActions.filter(a => a.status === "failed");

  const allConversations = await storage.getAllConversations();
  const userConvMap = new Map<number, Set<number>>();
  for (const c of allConversations) {
    if (!userConvMap.has(c.userId)) userConvMap.set(c.userId, new Set());
    userConvMap.get(c.userId)!.add(c.id);
  }

  const sentActions = allActions.filter(a => a.status === "done" && a.purpose);
  const repliedActions = sentActions.filter(a => {
    if (!a.userId || !a.executedAt) return false;
    const userConvIds = userConvMap.get(a.userId);
    if (!userConvIds) return false;
    return allMessages.some(m =>
      m.role === "user" && userConvIds.has(m.conversationId) && m.createdAt && new Date(m.createdAt) > new Date(a.executedAt!)
    );
  });
  const responseRate = sentActions.length > 0 ? Math.round((repliedActions.length / sentActions.length) * 100) : 0;

  const customers = allUsers.filter(u => u.chatCode);
  const avgEngagement = customers.reduce((s, u) => {
    const prof = u.aiProfile as any;
    return s + (prof?.engagementScore || 0);
  }, 0) / (customers.length || 1);

  const topSpenders = allPayments
    .filter(p => p.status === "completed" && recent24h(p.createdAt))
    .reduce((acc, p) => {
      const user = allUsers.find(u => u.id === p.userId);
      const name = user?.name || `User #${p.userId}`;
      acc[name] = (acc[name] || 0) + (p.amount || 0) / 100;
      return acc;
    }, {} as Record<string, number>);

  const strategicNotes: string[] = [];
  const convRate = customers.length > 0
    ? (new Set(allPayments.filter(p => p.status === "completed").map(p => p.userId)).size / customers.length) * 100
    : 0;

  if (convRate < 5) strategicNotes.push("Konverzní poměr pod 5% — zaměřit se na první nákup s nízkou bariérou (39-59 Kč).");
  if (funnel.find(f => f.stage === "cold")!.count > funnel.find(f => f.stage === "warm")!.count * 2) {
    strategicNotes.push("Příliš mnoho studených kontaktů — zvýšit frekvenci engagement zpráv.");
  }
  if (payments24h.length === 0) strategicNotes.push("Žádný prodej za 24h — zvážit flash nabídku nebo teaser kampaň.");
  if (responseRate < 30 && sentActions.length >= 5) strategicNotes.push("Nízká response rate (<30%) — upravit tón zpráv nebo timing.");
  if (avgEngagement < 40) strategicNotes.push("Průměrný engagement pod 40% — posílit personalizaci konverzací.");

  const hotCount = funnel.find(f => f.stage === "hot")?.count || 0;
  if (hotCount > 0 && payments24h.length === 0) {
    strategicNotes.push(`${hotCount} horkých kontaktů bez prodeje — okamžitě nabídnout exkluzivní obsah.`);
  }

  return {
    generatedAt: now.toISOString(),
    period: "24h",
    revenue24h: payments24h.reduce((s, p) => s + (p.amount || 0), 0) / 100,
    transactions24h: payments24h.length,
    newUsers24h: users24h.length,
    activeUsers24h: new Set(messages24h.filter(m => m.role === "user").map(m => m.conversationId)).size,
    messages24h: messages24h.length,
    funnelSnapshot: funnel,
    topContent: contentPerf.slice(0, 5),
    topSpenders: Object.entries(topSpenders).map(([name, spent]) => ({ name, spent })).sort((a, b) => b.spent - a.spent).slice(0, 5),
    engineActions24h: {
      total: allActions.length,
      executed: executedActions.length,
      pending: pendingActions.length,
      failed: failedActions.length,
    },
    responseRate,
    avgEngagement: Math.round(avgEngagement),
    strategicNotes,
  };
}

export async function getRevenueMetrics(): Promise<RevenueMetrics> {
  const allPayments = await storage.getAllPayments();
  const allUsers = await storage.getAllUsers();
  const customers = allUsers.filter(u => u.chatCode);
  const completedPayments = allPayments.filter(p => p.status === "completed");

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const twoMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);

  const thisMonthPayments = completedPayments.filter(p => p.createdAt && new Date(p.createdAt) >= thisMonthStart);
  const lastMonthPayments = completedPayments.filter(p => p.createdAt && new Date(p.createdAt) >= lastMonthStart && new Date(p.createdAt) <= lastMonthEnd);

  const thisMonthRevenue = thisMonthPayments.reduce((s, p) => s + (p.amount || 0), 0) / 100;
  const lastMonthRevenue = lastMonthPayments.reduce((s, p) => s + (p.amount || 0), 0) / 100;

  const buyerIdsThisMonth = new Set(thisMonthPayments.filter(p => p.userId).map(p => p.userId!));
  const buyerIdsLastMonth = new Set(lastMonthPayments.filter(p => p.userId).map(p => p.userId!));
  const buyerIdsEver = new Set(completedPayments.filter(p => p.userId).map(p => p.userId!));

  const newCustomersThisMonth = customers.filter(u => u.createdAt && new Date(u.createdAt) >= thisMonthStart).length;
  const lostCustomersThisMonth = [...buyerIdsLastMonth].filter(id => !buyerIdsThisMonth.has(id)).length;

  const totalCustomers = customers.length;
  const payingCustomers = buyerIdsEver.size;
  const mrr = thisMonthRevenue;
  const arpu = totalCustomers > 0 ? Math.round((thisMonthRevenue / totalCustomers) * 100) / 100 : 0;
  const avgRevenuePerPayingUser = payingCustomers > 0 ? Math.round((thisMonthRevenue / payingCustomers) * 100) / 100 : 0;

  const churnRate = buyerIdsLastMonth.size > 0
    ? Math.round((lostCustomersThisMonth / buyerIdsLastMonth.size) * 10000) / 100
    : 0;

  const expansionRevenue = (() => {
    let expansion = 0;
    for (const uid of buyerIdsThisMonth) {
      if (buyerIdsLastMonth.has(uid)) {
        const thisSpend = thisMonthPayments.filter(p => p.userId === uid).reduce((s, p) => s + (p.amount || 0), 0);
        const lastSpend = lastMonthPayments.filter(p => p.userId === uid).reduce((s, p) => s + (p.amount || 0), 0);
        if (thisSpend > lastSpend) expansion += (thisSpend - lastSpend) / 100;
      }
    }
    return Math.round(expansion * 100) / 100;
  })();

  const churnedRevenue = (() => {
    let churned = 0;
    for (const uid of buyerIdsLastMonth) {
      if (!buyerIdsThisMonth.has(uid)) {
        churned += lastMonthPayments.filter(p => p.userId === uid).reduce((s, p) => s + (p.amount || 0), 0) / 100;
      }
    }
    return Math.round(churned * 100) / 100;
  })();

  const nrr = lastMonthRevenue > 0
    ? Math.round(((lastMonthRevenue + expansionRevenue - churnedRevenue) / lastMonthRevenue) * 10000) / 100
    : 100;

  const conversionRate = totalCustomers > 0 ? Math.round((payingCustomers / totalCustomers) * 10000) / 100 : 0;
  const mrrGrowthRate = lastMonthRevenue > 0
    ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 10000) / 100
    : 0;

  const revenueByPlatform = (() => {
    const platformMap = new Map<string, { revenue: number; customers: Set<number> }>();
    for (const p of thisMonthPayments) {
      const user = allUsers.find(u => u.id === p.userId);
      const platform = (user as any)?.platform || "direct";
      if (!platformMap.has(platform)) platformMap.set(platform, { revenue: 0, customers: new Set() });
      const entry = platformMap.get(platform)!;
      entry.revenue += (p.amount || 0) / 100;
      if (p.userId) entry.customers.add(p.userId);
    }
    return [...platformMap.entries()].map(([platform, data]) => ({
      platform,
      revenue: Math.round(data.revenue * 100) / 100,
      customers: data.customers.size,
      arpu: data.customers.size > 0 ? Math.round((data.revenue / data.customers.size) * 100) / 100 : 0,
    })).sort((a, b) => b.revenue - a.revenue);
  })();

  const newMRR = (() => {
    let nr = 0;
    for (const uid of buyerIdsThisMonth) {
      if (!buyerIdsLastMonth.has(uid)) {
        nr += thisMonthPayments.filter(p => p.userId === uid).reduce((s, p) => s + (p.amount || 0), 0) / 100;
      }
    }
    return Math.round(nr * 100) / 100;
  })();

  const mrrWaterfall = [
    { label: "Předchozí MRR", value: Math.round(lastMonthRevenue * 100) / 100, color: "#6b7280" },
    { label: "Nový MRR", value: newMRR, color: "#10b981" },
    { label: "Expanze", value: expansionRevenue, color: "#3b82f6" },
    { label: "Odchod", value: -churnedRevenue, color: "#ef4444" },
    { label: "Aktuální MRR", value: Math.round(mrr * 100) / 100, color: "#8b5cf6" },
  ];

  const churnCohorts = (() => {
    const cohorts: RevenueMetrics["churnCohorts"] = [];
    for (let i = 5; i >= 0; i--) {
      const cohortStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const cohortEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthLabel = cohortStart.toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" });

      const cohortUsers = customers.filter(u => u.createdAt && new Date(u.createdAt) >= cohortStart && new Date(u.createdAt) <= cohortEnd);
      const cohortBuyers = cohortUsers.filter(u => completedPayments.some(p => p.userId === u.id));
      const stillActive = cohortBuyers.filter(u => {
        const lastPayment = completedPayments.filter(p => p.userId === u.id).sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())[0];
        return lastPayment && (now.getTime() - new Date(lastPayment.createdAt!).getTime()) < 60 * 24 * 60 * 60 * 1000;
      });

      const retained = stillActive.length;
      const churned = cohortBuyers.length - retained;
      const retentionRate = cohortBuyers.length > 0 ? Math.round((retained / cohortBuyers.length) * 100) : 100;

      cohorts.push({ month: monthLabel, retained, churned, retentionRate });
    }
    return cohorts;
  })();

  return {
    mrr: Math.round(mrr * 100) / 100,
    arpu: Math.round(arpu * 100) / 100,
    churnRate,
    nrr,
    totalCustomers,
    payingCustomers,
    newCustomersThisMonth,
    lostCustomersThisMonth,
    expansionRevenue,
    avgRevenuePerPayingUser,
    conversionRate,
    mrrGrowthRate,
    revenueByPlatform,
    mrrWaterfall,
    churnCohorts,
  };
}

export async function getEngagementScores(): Promise<EngagementScore[]> {
  const allUsers = await storage.getAllUsers();
  const allMessages = await storage.getAllMessages();
  const allPayments = await storage.getAllPayments();
  const allConversations = await storage.getAllConversations();
  const customers = allUsers.filter(u => u.chatCode);

  const convToUser = new Map<number, number>();
  for (const c of allConversations) convToUser.set(c.id, c.userId);

  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  return customers.map(user => {
    const userMessages = allMessages.filter(m => {
      const uid = convToUser.get(m.conversationId);
      return uid === user.id && m.role === "user";
    });
    const userPurchases = allPayments.filter(p => p.userId === user.id && p.status === "completed");

    const lastMsgDate = userMessages.length > 0
      ? Math.max(...userMessages.map(m => new Date(m.createdAt).getTime()))
      : (user.createdAt ? new Date(user.createdAt).getTime() : now);
    const daysSinceLastActivity = Math.round((now - lastMsgDate) / (24 * 60 * 60 * 1000));
    const daysSinceRegistration = user.createdAt ? Math.round((now - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000)) : 0;

    const weeksSinceLastActivity = Math.max(0, Math.floor((now - lastMsgDate) / WEEK_MS));
    const decayFactor = Math.pow(0.9, weeksSinceLastActivity);
    const decayApplied = weeksSinceLastActivity > 0;

    const rawScore = (2 * userMessages.length) + (5 * userPurchases.length) - (3 * Math.min(daysSinceLastActivity, 30));
    const normalizedScore = Math.max(0, Math.min(100, Math.round(rawScore * decayFactor)));

    let tier = "cold";
    if (normalizedScore >= 80) tier = "monetized";
    else if (normalizedScore >= 50) tier = "hot";
    else if (normalizedScore >= 25) tier = "warm";

    const platform = (user as any)?.platform || "direct";

    return {
      userId: user.id,
      name: user.name,
      score: normalizedScore,
      tier,
      messageCount: userMessages.length,
      purchaseCount: userPurchases.length,
      daysSinceLastActivity,
      daysSinceRegistration,
      decayApplied,
      platform,
    };
  }).sort((a, b) => b.score - a.score);
}

export async function generateWeeklyReport(): Promise<WeeklyReport> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const revenueMetrics = await getRevenueMetrics();
  const funnel = await getSalesFunnel();
  const contentPerf = await getContentPerformance();
  const engScores = await getEngagementScores();

  const allPayments = await storage.getAllPayments();
  const allUsers = await storage.getAllUsers();
  const allMessages = await storage.getAllMessages();
  const allActions = await storage.getManagerActions(weekAgo);
  const customers = allUsers.filter(u => u.chatCode);

  const thisWeekPayments = allPayments.filter(p => p.status === "completed" && p.createdAt && new Date(p.createdAt) >= weekAgo);
  const lastWeekPayments = allPayments.filter(p => p.status === "completed" && p.createdAt && new Date(p.createdAt) >= twoWeeksAgo && new Date(p.createdAt) < weekAgo);
  const thisWeekMessages = allMessages.filter(m => m.createdAt && new Date(m.createdAt) >= weekAgo);
  const lastWeekMessages = allMessages.filter(m => m.createdAt && new Date(m.createdAt) >= twoWeeksAgo && new Date(m.createdAt) < weekAgo);
  const thisWeekNewUsers = customers.filter(u => u.createdAt && new Date(u.createdAt) >= weekAgo);
  const lastWeekNewUsers = customers.filter(u => u.createdAt && new Date(u.createdAt) >= twoWeeksAgo && new Date(u.createdAt) < weekAgo);

  const thisWeekRevenue = thisWeekPayments.reduce((s, p) => s + (p.amount || 0), 0) / 100;
  const lastWeekRevenue = lastWeekPayments.reduce((s, p) => s + (p.amount || 0), 0) / 100;

  const sentActions = allActions.filter(a => a.status === "done" && a.purpose);
  const avgEngagement = engScores.length > 0
    ? Math.round(engScores.reduce((s, e) => s + e.score, 0) / engScores.length)
    : 0;

  const topPerformers = engScores.slice(0, 5).map(e => {
    const spent = allPayments.filter(p => p.userId === e.userId && p.status === "completed")
      .reduce((s, p) => s + (p.amount || 0), 0) / 100;
    return { name: e.name, spent, engagement: e.score };
  });

  const contentRanking = contentPerf.slice(0, 5).map(c => ({
    name: c.name,
    revenue: c.revenue,
    convRate: c.conversionRate,
  }));

  const benchmarks = [
    { metric: "Konverzní poměr", ours: `${revenueMetrics.conversionRate}%`, industry: "2-5%", verdict: revenueMetrics.conversionRate >= 2 ? "OK" : "Pod průměrem" },
    { metric: "Churn Rate", ours: `${revenueMetrics.churnRate}%`, industry: "<5%/měs", verdict: revenueMetrics.churnRate <= 5 ? "OK" : "Vysoký" },
    { metric: "NRR", ours: `${revenueMetrics.nrr}%`, industry: ">100%", verdict: revenueMetrics.nrr >= 100 ? "Výborný" : "Ke zlepšení" },
    { metric: "ARPU", ours: `${revenueMetrics.arpu} Kč`, industry: "50-200 Kč", verdict: revenueMetrics.arpu >= 50 ? "OK" : "Nízký" },
    { metric: "Avg Engagement", ours: `${avgEngagement}%`, industry: ">40%", verdict: avgEngagement >= 40 ? "OK" : "Nízký" },
    { metric: "Response Rate", ours: `${sentActions.length > 0 ? Math.round((sentActions.filter(a => a.result).length / sentActions.length) * 100) : 0}%`, industry: "30-50%", verdict: "OK" },
  ];

  const pctChange = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 100) : 0;

  const weekOverWeek = [
    { metric: "Revenue (Kč)", thisWeek: thisWeekRevenue, lastWeek: lastWeekRevenue, change: pctChange(thisWeekRevenue, lastWeekRevenue) },
    { metric: "Zprávy", thisWeek: thisWeekMessages.length, lastWeek: lastWeekMessages.length, change: pctChange(thisWeekMessages.length, lastWeekMessages.length) },
    { metric: "Noví uživatelé", thisWeek: thisWeekNewUsers.length, lastWeek: lastWeekNewUsers.length, change: pctChange(thisWeekNewUsers.length, lastWeekNewUsers.length) },
    { metric: "Transakce", thisWeek: thisWeekPayments.length, lastWeek: lastWeekPayments.length, change: pctChange(thisWeekPayments.length, lastWeekPayments.length) },
  ];

  const recommendations: string[] = [];
  if (revenueMetrics.churnRate > 5) recommendations.push("Churn rate přesahuje 5% — implementovat retenci: personalizované nabídky pro odcházející zákazníky.");
  if (revenueMetrics.conversionRate < 2) recommendations.push("Konverze pod 2% — snížit vstupní bariéru (akce 29 Kč na první obsah).");
  if (revenueMetrics.nrr < 100) recommendations.push("NRR pod 100% — zaměřit se na upsell stávajícím zákazníkům (premium obsah).");
  if (avgEngagement < 40) recommendations.push("Engagement pod 40% — zvýšit personalizaci a frekvenci proaktivních zpráv.");
  if (thisWeekRevenue < lastWeekRevenue) recommendations.push("Revenue klesá W/W — zvážit flash sale nebo novou kolekci obsahu.");
  if (revenueMetrics.payingCustomers < revenueMetrics.totalCustomers * 0.05) recommendations.push("Méně než 5% platících — testovat freemium model s preview obsahem.");
  if (recommendations.length === 0) recommendations.push("Všechny metriky v normě — pokračovat v aktuální strategii a optimalizovat obsah.");

  return {
    generatedAt: now.toISOString(),
    period: "7d",
    kpis: {
      mrr: revenueMetrics.mrr,
      arpu: revenueMetrics.arpu,
      churnRate: revenueMetrics.churnRate,
      nrr: revenueMetrics.nrr,
      totalCustomers: revenueMetrics.totalCustomers,
      newCustomers: revenueMetrics.newCustomersThisMonth,
      payingCustomers: revenueMetrics.payingCustomers,
      avgEngagement,
      responseRate: sentActions.length > 0 ? Math.round((sentActions.filter(a => a.result).length / sentActions.length) * 100) : 0,
      conversionRate: revenueMetrics.conversionRate,
    },
    topPerformers,
    contentRanking,
    funnelSnapshot: funnel,
    competitiveBenchmarks: benchmarks,
    strategicRecommendations: recommendations,
    weekOverWeek,
  };
}

export function classifyByScore(score: number): { classification: LeadClassification; label: string } {
  if (score >= 80) return { classification: "monetized", label: "Monetized" };
  if (score >= 50) return { classification: "hot", label: "Hot" };
  if (score >= 25) return { classification: "warm", label: "Warm" };
  return { classification: "cold", label: "Cold" };
}

export function computeEngagementScoreFromData(
  userId: number,
  name: string,
  messageCount: number,
  contentViews: number,
  purchaseCount: number,
  daysInactive: number,
  weeksSinceLastActivity: number
): EngagementScoreResult {
  const messageScore = 2 * messageCount;
  const contentViewScore = 4 * contentViews;
  const purchaseScore = 5 * purchaseCount;
  const inactivityPenalty = 3 * daysInactive;

  const rawScore = messageScore + contentViewScore + purchaseScore - inactivityPenalty;

  const decayFactor = Math.pow(0.9, weeksSinceLastActivity);
  const decayedScore = Math.max(0, Math.min(100, Math.round(rawScore * decayFactor)));

  const { classification, label } = classifyByScore(decayedScore);

  return {
    userId,
    name,
    rawScore: Math.round(rawScore),
    decayedScore,
    classification,
    classificationLabel: label,
    components: {
      messageScore,
      contentViewScore,
      purchaseScore,
      inactivityPenalty,
      decayFactor: Math.round(decayFactor * 100) / 100,
    },
    daysInactive,
    weeksSinceLastActivity,
  };
}

export async function computeEngagementScore(userId: number): Promise<EngagementScoreResult> {
  const user = await storage.getUser(userId);
  const userName = user?.name || `User #${userId}`;

  const conversations = await storage.getConversationsByUser(userId);
  let totalMessages = 0;
  let lastActivityTime = 0;

  for (const conv of conversations) {
    const msgs = await storage.getMessagesByConversation(conv.id);
    const userMsgs = msgs.filter(m => m.role === "user");
    totalMessages += userMsgs.length;
    for (const msg of userMsgs) {
      const msgTime = new Date(msg.createdAt).getTime();
      if (msgTime > lastActivityTime) lastActivityTime = msgTime;
    }
  }

  const payments = await storage.getPaymentsByUser(userId);
  const completedPayments = payments.filter(p => p.status === "completed");
  const purchaseCount = completedPayments.length;

  for (const p of completedPayments) {
    if (p.createdAt) {
      const pTime = new Date(p.createdAt).getTime();
      if (pTime > lastActivityTime) lastActivityTime = pTime;
    }
  }

  const contentViews = completedPayments.reduce((sum, p) => sum + (p.contentItemId ? 1 : 0), 0);

  const now = Date.now();
  const daysInactive = lastActivityTime > 0
    ? Math.max(0, Math.floor((now - lastActivityTime) / (24 * 60 * 60 * 1000)))
    : 30;

  const weeksSinceLastActivity = Math.floor(daysInactive / 7);

  return computeEngagementScoreFromData(userId, userName, totalMessages, contentViews, purchaseCount, daysInactive, weeksSinceLastActivity);
}

export async function computeAllEngagementScores(): Promise<EngagementScoreResult[]> {
  const allUsers = await storage.getAllUsers();
  const customers = allUsers.filter(u => u.chatCode);
  const results: EngagementScoreResult[] = [];

  for (const user of customers) {
    const score = await computeEngagementScore(user.id);
    results.push(score);
  }

  return results.sort((a, b) => b.decayedScore - a.decayedScore);
}
