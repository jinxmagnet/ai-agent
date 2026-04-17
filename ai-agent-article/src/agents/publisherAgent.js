import { join } from 'path';
import { generateCover } from '../services/cover.js';
import { logError, logStep, logSuccess } from '../services/logger.js';
import { ensureDir, OUTPUT_DIR, writeArticleFile, writeAssetFile } from '../services/storage.js';

export function prepareOutputDirs(dateKey) {
  ensureDir(join(OUTPUT_DIR, 'xiaohongshu', dateKey));
  ensureDir(join(OUTPUT_DIR, 'gongzhonghao', dateKey));
}

export async function publishArticle({ template, platform, dateKey }) {
  logStep('publish_article', '开始生成封面与落盘', {
    platform,
    title: template.title
  });

  const cover = await generateCover(template.title, platform);
  if (cover.error) {
    logError('SVG 转 PNG 失败，已切换到 SVG 兜底', {
      platform,
      title: template.title,
      error: cover.error.message
    });
  }

  const safeName = template.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
  const articlePath = join(OUTPUT_DIR, platform, dateKey, `${safeName}.md`);
  const coverPath = join(OUTPUT_DIR, platform, dateKey, `${safeName}_cover.${cover.ext}`);

  writeArticleFile(articlePath, `# ${template.title}\n\n${template.body}`);
  writeAssetFile(coverPath, cover.data);

  logSuccess('文章发布完成', {
    platform,
    title: template.title,
    articlePath,
    coverPath
  });

  return { platform, title: template.title, articlePath, coverPath };
}
