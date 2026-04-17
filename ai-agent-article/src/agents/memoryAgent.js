import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureFeedbackStorage, syncFeedbackLearning } from './feedbackAgent.js';
import { logStep } from '../services/logger.js';

const MEMORY_DIR = join(process.cwd(), 'data', 'memory');
const ARTICLES_FILE = join(MEMORY_DIR, 'articles.json');
const STRATEGIES_FILE = join(MEMORY_DIR, 'strategies.json');
const SOURCES_FILE = join(MEMORY_DIR, 'sources.json');
const MEMORY_ENABLED = process.env.MEMORY_ENABLED !== 'false';
const DUPLICATE_SIMILARITY_THRESHOLD = Number(process.env.DUPLICATE_SIMILARITY_THRESHOLD || 0.55);
const MEMORY_LOOKBACK_DAYS = Number(process.env.MEMORY_LOOKBACK_DAYS || 30);

function ensureMemoryDir() {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function ensureJsonFile(filePath, initialValue) {
  ensureMemoryDir();
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

function normalizeText(text = '') {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text = '') {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const parts = normalized.split(' ');
  const compoundTokens = [];
  for (const part of parts) {
    if (part.length >= 2) {
      compoundTokens.push(part);
    }

    if (/^[\u4e00-\u9fff]+$/.test(part) && part.length > 2) {
      for (let i = 0; i < part.length - 1; i++) {
        compoundTokens.push(part.slice(i, i + 2));
      }
    }
  }

  return [...new Set(compoundTokens)];
}

function jaccardSimilarity(left, right) {
  const leftSet = new Set(tokenize(left));
  const rightSet = new Set(tokenize(right));

  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }

  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function isWithinLookback(date) {
  if (!date) return false;
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return false;
  const lookbackMs = MEMORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp <= lookbackMs;
}

function computeSimilarity(item, memoryEntry) {
  const titleSimilarity = jaccardSimilarity(item.title || '', memoryEntry.originalTitle || memoryEntry.title || '');
  const sourceSimilarity = jaccardSimilarity(item.content || '', memoryEntry.summary || '');
  return Math.max(titleSimilarity, sourceSimilarity * 0.8);
}

export function loadMemorySnapshot() {
  if (!MEMORY_ENABLED) {
    return {
      enabled: false,
      articles: [],
      strategies: { platforms: {}, recentTitles: [], feedback: { platforms: {} } },
      sources: {}
    };
  }

  ensureFeedbackStorage();

  const rawArticles = readJson(ARTICLES_FILE, []);
  const rawStrategies = readJson(STRATEGIES_FILE, { platforms: {}, recentTitles: [], feedback: { platforms: {} } });
  const rawSources = readJson(SOURCES_FILE, {});

  const synced = syncFeedbackLearning({
    articles: rawArticles,
    strategies: rawStrategies,
    sources: rawSources
  });

  writeJson(ARTICLES_FILE, synced.articles);
  writeJson(STRATEGIES_FILE, synced.strategies);
  writeJson(SOURCES_FILE, synced.sources);

  const snapshot = {
    enabled: true,
    articles: synced.articles,
    strategies: synced.strategies,
    sources: synced.sources,
    feedbackSummary: synced.summary
  };

  logStep('memory_load', '已加载记忆快照', {
    articleCount: snapshot.articles.length,
    recentTitleCount: snapshot.strategies.recentTitles?.length || 0,
    sourceCount: Object.keys(snapshot.sources).length
  });

  return snapshot;
}

export function findSimilarMemoryEntries(item, memorySnapshot) {
  if (!memorySnapshot?.enabled) return [];

  return memorySnapshot.articles
    .filter((entry) => isWithinLookback(entry.generatedAt || entry.topicDate))
    .map((entry) => ({
      entry,
      similarity: computeSimilarity(item, entry)
    }))
    .filter((match) => match.similarity >= DUPLICATE_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);
}

export function buildMemoryContext(item, platform, memorySnapshot) {
  const similarEntries = findSimilarMemoryEntries(item, memorySnapshot);
  const recentTitles = (memorySnapshot?.strategies?.recentTitles || [])
    .filter((entry) => entry.platform === platform)
    .slice(0, 5)
    .map((entry) => entry.title);

  const feedbackPlatformStats = memorySnapshot?.strategies?.feedback?.platforms?.[platform];
  const bestPerformers = feedbackPlatformStats?.bestArticles || [];
  const recommendedTitleStyles = feedbackPlatformStats?.recommendedTitleStyles || [];
  const sourceFeedback = memorySnapshot?.sources?.[item.source] || null;

  return {
    similarEntries: similarEntries.slice(0, 3).map((match) => ({
      title: match.entry.title,
      platform: match.entry.platform,
      similarity: Number(match.similarity.toFixed(2)),
      generatedAt: match.entry.generatedAt
    })),
    recentTitles,
    bestPerformers: bestPerformers.slice(0, 3),
    recommendedTitleStyles,
    sourceFeedback: sourceFeedback
      ? {
          averageFeedbackScore: Number(sourceFeedback.averageFeedbackScore || 0),
          bestPlatform: sourceFeedback.bestPlatform || null,
          feedbackCount: sourceFeedback.feedbackCount || 0
        }
      : null
  };
}

export function filterTopicsWithMemory(items, memorySnapshot) {
  if (!memorySnapshot?.enabled) return { freshItems: items, skippedItems: [] };

  const freshItems = [];
  const skippedItems = [];

  for (const item of items) {
    const matches = findSimilarMemoryEntries(item, memorySnapshot);
    if (matches.length > 0) {
      skippedItems.push({
        item,
        similarity: matches[0].similarity,
        matchedTitle: matches[0].entry.title
      });
      continue;
    }

    freshItems.push(item);
  }

  logStep('memory_filter', '完成历史去重筛选', {
    totalItems: items.length,
    freshItems: freshItems.length,
    skippedItems: skippedItems.map((entry) => ({
      title: entry.item.title,
      similarity: Number(entry.similarity.toFixed(2)),
      matchedTitle: entry.matchedTitle
    }))
  });

  return { freshItems, skippedItems };
}

function detectTitleStyle(title = '') {
  if (/\d/.test(title)) return 'numeric';
  if (/[？?！!]/.test(title)) return 'emotional';
  if (/[:：]/.test(title)) return 'analysis';
  return 'standard';
}

export function recordPublishedArticle({ item, platform, draft, review, published }) {
  if (!MEMORY_ENABLED) return;

  const articles = readJson(ARTICLES_FILE, []);
  const strategies = readJson(STRATEGIES_FILE, { platforms: {}, recentTitles: [] });
  const sources = readJson(SOURCES_FILE, {});

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: draft.title,
    originalTitle: item.title,
    summary: (item.content || '').replace(/<[^>]+>/g, ' ').slice(0, 500),
    platform,
    source: item.source,
    topicDate: item.date,
    generatedAt: new Date().toISOString(),
    articlePath: published.articlePath,
    reviewScore: review.score,
    titleStyle: detectTitleStyle(draft.title),
    feedbackScore: null,
    lastFeedbackAt: null,
    performance: null
  };

  articles.unshift(record);
  writeJson(ARTICLES_FILE, articles.slice(0, 500));

  strategies.platforms[platform] ??= { totalPublished: 0, titleStyles: {}, averageReviewScore: 0 };
  const platformStats = strategies.platforms[platform];
  platformStats.totalPublished += 1;
  platformStats.titleStyles[record.titleStyle] = (platformStats.titleStyles[record.titleStyle] || 0) + 1;
  const previousCount = platformStats.totalPublished - 1;
  platformStats.averageReviewScore = Number((((platformStats.averageReviewScore * previousCount) + review.score) / platformStats.totalPublished).toFixed(2));

  strategies.recentTitles.unshift({
    title: draft.title,
    platform,
    generatedAt: record.generatedAt,
    originalTitle: item.title
  });
  strategies.recentTitles = strategies.recentTitles.slice(0, 50);
  writeJson(STRATEGIES_FILE, strategies);

  sources[item.source] ??= { publishedCount: 0, averageReviewScore: 0, lastPublishedAt: null };
  const sourceStats = sources[item.source];
  const previousSourceCount = sourceStats.publishedCount;
  sourceStats.publishedCount += 1;
  sourceStats.averageReviewScore = Number((((sourceStats.averageReviewScore * previousSourceCount) + review.score) / sourceStats.publishedCount).toFixed(2));
  sourceStats.lastPublishedAt = record.generatedAt;
  writeJson(SOURCES_FILE, sources);

  logStep('memory_record', '已写入发布记忆', {
    platform,
    title: draft.title,
    source: item.source,
    reviewScore: review.score
  });

  return record;
}
