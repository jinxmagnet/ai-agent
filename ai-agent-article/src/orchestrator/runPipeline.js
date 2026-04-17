import cron from 'node-cron';
import { SOURCES } from '../../config/sources.js';
import {
  buildMemoryContext,
  filterTopicsWithMemory,
  loadMemorySnapshot,
  recordPublishedArticle
} from '../agents/memoryAgent.js';
import { reviewDraft } from '../agents/reviewerAgent.js';
import { fetchNews } from '../agents/scoutAgent.js';
import { selectTopics } from '../agents/selectorAgent.js';
import { publishArticle, prepareOutputDirs } from '../agents/publisherAgent.js';
import { createArticleDraft, rewriteArticleDraft } from '../agents/writerAgent.js';
import { logInfo, logStep, logWarn } from '../services/logger.js';

export const CRON_EXPRESSION = process.env.CRON_EXPRESSION || '0 9 * * *';
const TARGET_PLATFORMS = ['xiaohongshu', 'gongzhonghao'];
const MAX_TOPICS = Number(process.env.MAX_ARTICLES_PER_RUN || 2);
const MAX_REWRITE_ROUNDS = Number(process.env.REWRITE_MAX_ROUNDS || 1);

async function generateReviewedDraft(item, platform, memoryContext) {
  let draft = await createArticleDraft(item, platform, memoryContext);
  let review = reviewDraft(draft);

  for (let round = 1; !review.passed && round <= MAX_REWRITE_ROUNDS; round++) {
    logWarn('稿件未通过审核，准备重写', {
      platform,
      title: draft.title,
      round,
      score: review.score,
      issues: review.issues
    });

    draft = await rewriteArticleDraft(draft, review, 2, memoryContext);
    review = reviewDraft(draft);
  }

  return { draft, review };
}

export async function runOnce() {
  const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  prepareOutputDirs(dateKey);
  const memorySnapshot = loadMemorySnapshot();

  const items = await fetchNews(SOURCES);
  if (items.length === 0) {
    logWarn('未获取到任何资讯，任务结束');
    return [];
  }

  const { freshItems, skippedItems } = filterTopicsWithMemory(items, memorySnapshot);
  if (freshItems.length === 0) {
    logWarn('所有资讯均与历史内容高度相似，任务结束', {
      skippedItems: skippedItems.map((entry) => ({
        title: entry.item.title,
        matchedTitle: entry.matchedTitle,
        similarity: Number(entry.similarity.toFixed(2))
      }))
    });
    return [];
  }

  const selectedTopics = selectTopics(freshItems, MAX_TOPICS, memorySnapshot);
  const results = [];

  for (const topic of selectedTopics) {
    const item = topic.item;
    logStep('process_topic', '开始处理资讯', {
      title: item.title,
      source: item.source,
      score: topic.score,
      recommendedPlatforms: topic.recommendedPlatforms,
      reasons: topic.reasons
    });

    const platforms = TARGET_PLATFORMS.filter((platform) => topic.recommendedPlatforms.includes(platform));

    for (const platform of platforms) {
      const memoryContext = buildMemoryContext(item, platform, memorySnapshot);
      const { draft, review } = await generateReviewedDraft(item, platform, memoryContext);
      if (!review.passed) {
        logWarn('稿件多轮重写后仍未通过审核，跳过发布', {
          platform,
          title: draft.title,
          score: review.score,
          issues: review.issues
        });
        continue;
      }

      const published = await publishArticle({ template: draft, platform, dateKey });
      recordPublishedArticle({ item, platform, draft, review, published });
      results.push(published);
    }
  }

  logInfo('本次任务已完成', {
    totalArticles: results.length,
    results
  });

  return results;
}

export function startSchedule() {
  logInfo('启动定时任务', { cron: CRON_EXPRESSION });

  cron.schedule(CRON_EXPRESSION, async () => {
    logStep('scheduled_run', '触发定时执行', {
      runAt: new Date().toLocaleString('zh-CN')
    });
    await runOnce();
  });

  logInfo('定时任务已启动，按 Ctrl+C 退出');
}
