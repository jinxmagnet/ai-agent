import Parser from 'rss-parser';
import { logError, logStep, logSuccess } from '../services/logger.js';

const rssParser = new Parser();

export async function fetchNews(sources) {
  logStep('fetch_news', '开始抓取 AI 资讯');
  const allItems = [];

  for (const source of sources) {
    try {
      if (source.type === 'rss') {
        const feed = await rssParser.parseURL(source.url);
        const items = feed.items
          .slice(0, 5)
          .map((item) => ({
            title: item.title,
            content: item.contentSnippet || item.content || item.title || '',
            link: item.link,
            source: source.name,
            date: item.pubDate || new Date().toISOString()
          }))
          .filter((item) => item.title);
        allItems.push(...items);
      } else if (source.type === 'api') {
        const res = await fetch(source.url);
        const data = await res.json();
        const items = await source.parse(data);
        allItems.push(...(items || []));
      }

      logSuccess('资讯源抓取成功', { source: source.name });
    } catch (error) {
      logError('资讯源抓取失败', { source: source.name, error: error.message });
    }
  }

  logStep('fetch_news', '资讯抓取完成', { totalItems: allItems.length });
  return allItems;
}
