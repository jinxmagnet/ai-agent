import { getClient, sleep, TEXT_MODEL } from '../services/llm.js';
import { logError, logStep, logWarn } from '../services/logger.js';

function buildMemoryPrompt(memoryContext) {
  if (!memoryContext) {
    return '历史记忆：暂无可用历史记录。';
  }

  const similarEntries = memoryContext.similarEntries?.length
    ? memoryContext.similarEntries
        .map((entry, index) => `${index + 1}. ${entry.title}（${entry.platform}，相似度 ${entry.similarity}）`)
        .join('\n')
    : '无高相似历史文章';

  const recentTitles = memoryContext.recentTitles?.length
    ? memoryContext.recentTitles.map((title, index) => `${index + 1}. ${title}`).join('\n')
    : '无近期标题';

  const bestPerformers = memoryContext.bestPerformers?.length
    ? memoryContext.bestPerformers
        .map((entry, index) => `${index + 1}. ${entry.title}（反馈分 ${entry.feedbackScore}，来源 ${entry.source}）`)
        .join('\n')
    : '无历史高反馈样本';

  const recommendedTitleStyles = memoryContext.recommendedTitleStyles?.length
    ? memoryContext.recommendedTitleStyles.join('、')
    : '暂无推荐';

  const sourceFeedback = memoryContext.sourceFeedback
    ? `当前来源历史反馈：平均反馈分 ${memoryContext.sourceFeedback.averageFeedbackScore}，最佳平台 ${memoryContext.sourceFeedback.bestPlatform || '暂无'}，样本数 ${memoryContext.sourceFeedback.feedbackCount}`
    : '当前来源暂无历史反馈数据';

  return `历史记忆：
相似历史文章：
${similarEntries}

近期已用标题：
${recentTitles}

高反馈历史样本：
${bestPerformers}

推荐优先尝试的标题风格：${recommendedTitleStyles}

${sourceFeedback}

请避免与以上标题和切入角度过于相似。`;
}

export function generateTemplate(item, platform) {
  const today = new Date().toLocaleDateString('zh-CN');

  if (platform === 'xiaohongshu') {
    return {
      title: `🤖 AI日报 | ${item.title}`,
      body: `📌 ${today} AI资讯速递\n\n${item.title}\n\n📝 摘要：\n${item.content || '暂无摘要'}\n\n🔗 来源：${item.source}\n🔗 链接：${item.link}\n\n#AI资讯 #人工智能 #科技日报 #AI工具 #ChatGPT`,
      platform: 'xiaohongshu'
    };
  }

  return {
    title: `AI前沿 | ${item.title}`,
    body: `《AI前沿日报》${today}\n\n${'═'.repeat(20)}\n\n📌 ${item.title}\n\n${item.content || '暂无内容'}\n\n来源：${item.source}\n链接：${item.link}\n\n${'═'.repeat(20)}\n关注我们，每日获取最新 AI 资讯。`,
    platform: 'gongzhonghao'
  };
}

export async function optimizeWithAI(template, retries = 5, guidance = '', memoryContext = null) {
  const platformHint =
    template.platform === 'xiaohongshu'
      ? '小红书风格：多用emoji、短句、分段、话题标签，语气活泼亲切'
      : '公众号风格：专业深度、结构清晰、有观点、适合长文阅读';

  const prompt = `你是一个爆款文章写手。请根据以下原始内容，重新优化为${platformHint}。

要求：
1. 标题要吸引眼球，有悬念或数字
2. 开头要有钩子，抓住读者注意力
3. 内容要有价值、有观点
4. 结尾抛出一个与主题相关的开放性问题，引导读者在评论区讨论交流，不要送礼品、福利、抽奖、赠送任何东西
5. 严格基于原始内容改写，不要虚构新闻细节

额外修订要求：
${guidance || '无，按标准要求优化即可'}

${buildMemoryPrompt(memoryContext)}

原始标题：${template.title}
原始内容：
${template.body}

请直接输出优化后的文章，格式：
【标题】优化后的标题
【正文】优化后的正文`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logStep('optimize_article', '开始 AI 优化', {
        platform: template.platform,
        attempt,
        model: TEXT_MODEL
      });

      const client = getClient();
      const stream = await client.chat.completions.create({
        model: TEXT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        stream: true
      });

      let text = '';
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) text += content;
      }

      const titleMatch = text.match(/【标题】(.+)/);
      const bodyMatch = text.match(/【正文】([\s\S]+)/);

      if (titleMatch || bodyMatch) {
        return {
          ...template,
          title: titleMatch ? titleMatch[1].trim() : template.title,
          body: bodyMatch ? bodyMatch[1].trim() : text || template.body
        };
      }

      logWarn('未解析到结构化内容，准备重试', {
        platform: template.platform,
        attempt
      });
    } catch (error) {
      logError('AI 优化失败', {
        platform: template.platform,
        attempt,
        error: error.message
      });

      if (attempt < retries) {
        await sleep(2000);
      }
    }
  }

  logWarn('AI 优化已降级为原始模板', {
    platform: template.platform,
    retries
  });
  return template;
}

export async function createArticleDraft(item, platform, memoryContext = null) {
  const template = generateTemplate(item, platform);
  return optimizeWithAI(template, 5, '', memoryContext);
}

export async function rewriteArticleDraft(template, reviewResult, retries = 2, memoryContext = null) {
  logStep('rewrite_article', '根据审稿意见重写稿件', {
    platform: template.platform,
    title: template.title,
    issues: reviewResult.issues
  });

  return optimizeWithAI(template, retries, reviewResult.rewriteAdvice, memoryContext);
}
