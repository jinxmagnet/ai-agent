import { logStep } from '../services/logger.js';

const SOURCE_WEIGHTS = {
  'Hacker News': 16,
  'Hacker News AI': 16,
  '36kr AI': 14,
  'TechCrunch AI': 15
};

const HIGH_VALUE_KEYWORDS = [
  'claude',
  'openai',
  'gpt',
  'gemini',
  'agent',
  '模型',
  '融资',
  '发布',
  '上线',
  '芯片',
  'ai',
  'llm'
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreFreshness(date) {
  if (!date) return 8;

  const publishedAt = new Date(date).getTime();
  if (Number.isNaN(publishedAt)) return 8;

  const ageHours = (Date.now() - publishedAt) / (1000 * 60 * 60);
  if (ageHours <= 12) return 20;
  if (ageHours <= 24) return 18;
  if (ageHours <= 48) return 14;
  if (ageHours <= 72) return 10;
  return 6;
}

function scoreKeywordMatch(item) {
  const text = `${item.title || ''} ${item.content || ''}`.toLowerCase();
  const matches = HIGH_VALUE_KEYWORDS.filter((keyword) => text.includes(keyword)).length;
  return clamp(matches * 4, 4, 20);
}

function scoreContentDepth(item) {
  const contentLength = (item.content || '').replace(/<[^>]+>/g, '').trim().length;
  if (contentLength >= 800) return 20;
  if (contentLength >= 300) return 16;
  if (contentLength >= 120) return 12;
  if (contentLength >= 50) return 8;
  return 4;
}

function scoreSource(item, memorySnapshot) {
  const baseline = SOURCE_WEIGHTS[item.source] || 10;
  const sourceStats = memorySnapshot?.sources?.[item.source];

  if (!sourceStats) {
    return baseline;
  }

  const qualityBonus = Math.min(4, Math.round((sourceStats.averageReviewScore || 0) / 25));
  const stabilityBonus = Math.min(2, sourceStats.publishedCount || 0);
  const feedbackBonus = Math.min(4, Math.round((Number(sourceStats.averageFeedbackScore || 0)) / 20));
  return clamp(baseline + qualityBonus + stabilityBonus + feedbackBonus, baseline, 20);
}

function scoreFeedbackPerformance(item, memorySnapshot) {
  const sourceStats = memorySnapshot?.sources?.[item.source];
  if (!sourceStats?.feedbackCount) return 0;

  return clamp(Math.round(Number(sourceStats.averageFeedbackScore || 0) / 10), 0, 10);
}

function inferPlatforms(item) {
  const contentLength = (item.content || '').length;
  const title = (item.title || '').toLowerCase();

  const platforms = ['gongzhonghao'];

  if (contentLength <= 1200 || /发布|上线|融资|爆|重磅|crazy|launch/.test(title)) {
    platforms.unshift('xiaohongshu');
  }

  return [...new Set(platforms)];
}

export function scoreTopic(item, memorySnapshot) {
  const freshness = scoreFreshness(item.date);
  const keywordScore = scoreKeywordMatch(item);
  const depth = scoreContentDepth(item);
  const sourceScore = scoreSource(item, memorySnapshot);
  const feedbackScore = scoreFeedbackPerformance(item, memorySnapshot);
  const score = freshness + keywordScore + depth + sourceScore + feedbackScore;

  return {
    item,
    score,
    recommendedPlatforms: inferPlatforms(item),
    reasons: [
      `时效分 ${freshness}`,
      `关键词分 ${keywordScore}`,
      `内容分 ${depth}`,
      `来源分 ${sourceScore}`,
      `反馈分 ${feedbackScore}`
    ]
  };
}

export function selectTopics(items, maxTopics = 2, memorySnapshot) {
  const rankedTopics = items
    .map((item) => scoreTopic(item, memorySnapshot))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTopics);

  logStep('select_topics', '选题评分完成', {
    candidates: items.length,
    selected: rankedTopics.map((topic) => ({
      title: topic.item.title,
      score: topic.score,
      recommendedPlatforms: topic.recommendedPlatforms,
      reasons: topic.reasons
    }))
  });

  return rankedTopics;
}
