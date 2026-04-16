export const SOURCES = [
  {
    name: 'Hacker News AI',
    type: 'api',
    url: 'https://hacker-news.firebaseio.com/v0/topstories.json',
    parse: async (ids) => {
      const items = await Promise.all(
        ids.slice(0, 10).map(async (id) => {
          const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          const item = await res.json();
          if (!item || !item.title) return null;
          const titleLower = item.title.toLowerCase();
          const aiKeywords = ['ai', 'gpt', 'llm', 'openai', 'claude', 'gemini', 'diffusion', 'machine learning', 'deep learning'];
          const isAI = aiKeywords.some((k) => titleLower.includes(k));
          if (!isAI) return null;
          return {
            title: item.title,
            content: item.text || item.title,
            link: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
            source: 'Hacker News',
            date: new Date(item.time * 1000).toISOString()
          };
        })
      );
      return items.filter(Boolean);
    }
  },
  {
    name: '36kr AI',
    type: 'rss',
    url: 'https://36kr.com/feed'
  },
  {
    name: 'TechCrunch AI',
    type: 'rss',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/'
  }
];
