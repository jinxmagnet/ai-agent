import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logStep } from '../services/logger.js';

const FEEDBACK_DIR = join(process.cwd(), 'data', 'feedback');
const METRICS_FILE = join(FEEDBACK_DIR, 'metrics.json');
const SUMMARY_FILE = join(FEEDBACK_DIR, 'summary.json');
const FEEDBACK_ENABLED = process.env.FEEDBACK_ENABLED !== 'false';

function ensureFeedbackDir() {
  if (!existsSync(FEEDBACK_DIR)) {
    mkdirSync(FEEDBACK_DIR, { recursive: true });
  }
}

function ensureJsonFile(filePath, initialValue) {
  ensureFeedbackDir();
  if (!existsSync(filePath)) {
    writeFileSync(filePath, JSON.stringify(initialValue, null, 2), 'utf-8');
  }
}

function readJson(filePath, fallback) {
  ensureJsonFile(filePath, fallback);
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureJsonFile(filePath, value);
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function computeFeedbackScore(metrics) {
  const impressions = Math.max(toNumber(metrics.impressions), toNumber(metrics.views), 1);
  const views = Math.max(toNumber(metrics.views), 1);
  const clicks = toNumber(metrics.clicks);
  const likes = toNumber(metrics.likes);
  const comments = toNumber(metrics.comments);
  const shares = toNumber(metrics.shares);
  const saves = toNumber(metrics.saves);
  const conversions = toNumber(metrics.conversions);

  const ctr = clicks / impressions;
  const engagementRate = (likes + comments * 2 + shares * 3 + saves * 2) / views;
  const conversionRate = conversions / Math.max(clicks, views, 1);

  const score =
    clamp(ctr * 220, 0, 35) +
    clamp(engagementRate * 300, 0, 45) +
    clamp(conversionRate * 800, 0, 20);

  return Number(score.toFixed(2));
}

function buildMetricsIndex(metrics) {
  const index = new Map();
  for (const metric of metrics) {
    const key = metric.articlePath || metric.articleId;
    if (!key) continue;

    const previous = index.get(key);
    if (!previous) {
      index.set(key, metric);
      continue;
    }

    const previousTime = new Date(previous.capturedAt || 0).getTime();
    const currentTime = new Date(metric.capturedAt || 0).getTime();
    if (currentTime >= previousTime) {
      index.set(key, metric);
    }
  }
  return index;
}

function summarizeByPlatform(articles) {
  const platforms = {};

  for (const article of articles) {
    if (article.feedbackScore == null) continue;
    const platform = article.platform;
    platforms[platform] ??= {
      count: 0,
      averageFeedbackScore: 0,
      titleStyles: {},
      bestArticles: [],
      promptHints: []
    };

    const stats = platforms[platform];
    stats.count += 1;
    const previousCount = stats.count - 1;
    stats.averageFeedbackScore = Number((((stats.averageFeedbackScore * previousCount) + article.feedbackScore) / stats.count).toFixed(2));
    stats.titleStyles[article.titleStyle] = (stats.titleStyles[article.titleStyle] || 0) + 1;
    stats.bestArticles.push({
      title: article.title,
      feedbackScore: article.feedbackScore,
      source: article.source,
      articlePath: article.articlePath
    });
  }

  for (const platform of Object.keys(platforms)) {
    const stats = platforms[platform];
    stats.bestArticles = stats.bestArticles.sort((a, b) => b.feedbackScore - a.feedbackScore).slice(0, 5);
    stats.recommendedTitleStyles = Object.entries(stats.titleStyles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([style]) => style);
    stats.promptHints = stats.bestArticles.slice(0, 3).map((article) => `${article.title}（反馈分 ${article.feedbackScore}）`);
  }

  return platforms;
}

function summarizeBySource(articles, existingSources) {
  const nextSources = { ...existingSources };

  for (const article of articles) {
    if (article.feedbackScore == null) continue;

    nextSources[article.source] ??= {
      publishedCount: 0,
      averageReviewScore: 0,
      lastPublishedAt: null,
      averageFeedbackScore: 0,
      feedbackCount: 0,
      bestPlatform: null
    };

    const sourceStats = nextSources[article.source];
    const previousCount = sourceStats.feedbackCount || 0;
    sourceStats.feedbackCount = previousCount + 1;
    sourceStats.averageFeedbackScore = Number(((((sourceStats.averageFeedbackScore || 0) * previousCount) + article.feedbackScore) / sourceStats.feedbackCount).toFixed(2));

    if (!sourceStats.platformBreakdown) {
      sourceStats.platformBreakdown = {};
    }

    sourceStats.platformBreakdown[article.platform] ??= { count: 0, averageFeedbackScore: 0 };
    const breakdown = sourceStats.platformBreakdown[article.platform];
    const previousPlatformCount = breakdown.count;
    breakdown.count += 1;
    breakdown.averageFeedbackScore = Number(((((breakdown.averageFeedbackScore || 0) * previousPlatformCount) + article.feedbackScore) / breakdown.count).toFixed(2));

    sourceStats.bestPlatform = Object.entries(sourceStats.platformBreakdown)
      .sort((a, b) => Number(b[1].averageFeedbackScore) - Number(a[1].averageFeedbackScore))[0]?.[0] || sourceStats.bestPlatform;
  }

  return nextSources;
}

export function ensureFeedbackStorage() {
  if (!FEEDBACK_ENABLED) return;
  ensureJsonFile(METRICS_FILE, []);
  ensureJsonFile(SUMMARY_FILE, { lastSyncedAt: null, matchedMetrics: 0, unmatchedMetrics: 0, platforms: {}, notes: [] });
}

export function syncFeedbackLearning({ articles, strategies, sources }) {
  if (!FEEDBACK_ENABLED) {
    return {
      articles,
      strategies,
      sources,
      summary: { enabled: false, matchedMetrics: 0, unmatchedMetrics: 0 }
    };
  }

  ensureFeedbackStorage();
  const metrics = readJson(METRICS_FILE, []);
  const metricsIndex = buildMetricsIndex(metrics);
  let matchedMetrics = 0;

  const nextArticles = articles.map((article) => {
    const metric = metricsIndex.get(article.articlePath) || metricsIndex.get(article.id);
    if (!metric) {
      return article;
    }

    matchedMetrics += 1;
    return {
      ...article,
      performance: {
        impressions: toNumber(metric.impressions),
        views: toNumber(metric.views),
        clicks: toNumber(metric.clicks),
        likes: toNumber(metric.likes),
        comments: toNumber(metric.comments),
        shares: toNumber(metric.shares),
        saves: toNumber(metric.saves),
        conversions: toNumber(metric.conversions),
        capturedAt: metric.capturedAt || new Date().toISOString()
      },
      feedbackScore: computeFeedbackScore(metric),
      lastFeedbackAt: metric.capturedAt || new Date().toISOString()
    };
  });

  const unmatchedMetrics = metrics.length - matchedMetrics;
  const platformSummary = summarizeByPlatform(nextArticles);
  const nextStrategies = {
    ...strategies,
    feedback: {
      lastSyncedAt: new Date().toISOString(),
      matchedMetrics,
      unmatchedMetrics,
      platforms: platformSummary
    }
  };

  const nextSources = summarizeBySource(nextArticles, sources);
  const summary = {
    lastSyncedAt: new Date().toISOString(),
    matchedMetrics,
    unmatchedMetrics,
    platforms: platformSummary,
    notes: unmatchedMetrics > 0 ? ['存在未匹配的反馈记录，请检查 articlePath 或 articleId 是否正确。'] : []
  };

  writeJson(SUMMARY_FILE, summary);

  logStep('feedback_sync', '完成反馈学习同步', {
    metricsCount: metrics.length,
    matchedMetrics,
    unmatchedMetrics,
    platformCount: Object.keys(platformSummary).length
  });

  return {
    articles: nextArticles,
    strategies: nextStrategies,
    sources: nextSources,
    summary
  };
}
