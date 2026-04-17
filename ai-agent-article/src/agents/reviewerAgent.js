import { logStep } from '../services/logger.js';

const FORBIDDEN_PHRASES = ['抽奖', '送礼', '福利领取', '免费送', '赠送'];

function countParagraphs(body) {
  return body.split(/\n\s*\n/).filter(Boolean).length;
}

function buildIssues(template) {
  const issues = [];
  const title = template.title || '';
  const body = template.body || '';
  const bodyLength = body.trim().length;
  const paragraphs = countParagraphs(body);

  if (title.length < 12) {
    issues.push('标题偏短，吸引力不足');
  }

  if (title.length > 42) {
    issues.push('标题过长，平台展示可能被截断');
  }

  if (bodyLength < 180) {
    issues.push('正文过短，信息密度不足');
  }

  if (paragraphs < 3) {
    issues.push('段落数量过少，可读性一般');
  }

  if (!body.includes('来源：') && !body.includes('🔗 来源：')) {
    issues.push('正文缺少来源标识');
  }

  if (!body.includes('链接：') && !body.includes('🔗 链接：')) {
    issues.push('正文缺少原始链接');
  }

  if (FORBIDDEN_PHRASES.some((phrase) => body.includes(phrase))) {
    issues.push('正文包含不建议出现的营销表达');
  }

  if (template.platform === 'xiaohongshu' && !/#/.test(body)) {
    issues.push('小红书正文缺少话题标签');
  }

  if (template.platform === 'gongzhonghao' && paragraphs < 5) {
    issues.push('公众号正文结构还不够展开');
  }

  return issues;
}

function computeScore(issues) {
  return Math.max(0, 100 - issues.length * 12);
}

function buildRewriteAdvice(template, issues) {
  const platformAdvice =
    template.platform === 'xiaohongshu'
      ? '保持轻快口语和 emoji，但要补足信息密度、来源与链接。'
      : '保持专业分析风格，扩展段落层次并确保论点展开更清晰。';

  return [
    '请根据以下问题重写文章，并保留原始新闻事实，不要编造额外信息：',
    ...issues.map((issue, index) => `${index + 1}. ${issue}`),
    `补充要求：${platformAdvice}`
  ].join('\n');
}

export function reviewDraft(template) {
  const issues = buildIssues(template);
  const score = computeScore(issues);
  const passed = score >= 75;
  const result = {
    passed,
    score,
    issues,
    rewriteAdvice: issues.length ? buildRewriteAdvice(template, issues) : ''
  };

  logStep('review_draft', '完成稿件审核', {
    platform: template.platform,
    title: template.title,
    score,
    passed,
    issues
  });

  return result;
}
