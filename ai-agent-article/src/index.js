import 'dotenv/config';
import cron from 'node-cron';
import Parser from 'rss-parser';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import OpenAI from 'openai';

const rssParser = new Parser();
const TEXT_MODEL = process.env.TEXT_MODEL || 'ZhipuAI/GLM-5.1';
const CRON_EXPRESSION = process.env.CRON_EXPRESSION || '0 9 * * *';
const OUTPUT_DIR = join(process.cwd(), 'output');

const client = new OpenAI({
  baseURL: 'https://api-inference.modelscope.cn/v1',
  apiKey: process.env.MODELSCOPE_API_KEY
});

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function fetchNews() {
  console.log('📰 第一步：抓取 AI 资讯...');
  const { SOURCES } = await import('../config/sources.js');
  const allItems = [];

  for (const source of SOURCES) {
    try {
      if (source.type === 'rss') {
        const feed = await rssParser.parseURL(source.url);
        const items = feed.items.slice(0, 5).map((item) => ({
          title: item.title,
          content: item.contentSnippet || item.content || item.title || '',
          link: item.link,
          source: source.name,
          date: item.pubDate || new Date().toISOString()
        })).filter(item => item.title);
        allItems.push(...items);
      } else if (source.type === 'api') {
        const res = await fetch(source.url);
        const data = await res.json();
        const items = await source.parse(data);
        allItems.push(...(items || []));
      }
      console.log(`  ✅ ${source.name}: 获取成功`);
    } catch (e) {
      console.error(`  ❌ ${source.name}: ${e.message}`);
    }
  }

  console.log(`  共获取 ${allItems.length} 条资讯\n`);
  return allItems;
}

function generateTemplate(item, platform) {
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

async function optimizeWithAI(template, retries = 5) {
  const platformHint =
    template.platform === 'xiaohongshu'
      ? '小红书风格：多用emoji、短句、分段、话题标签，语气活泼亲切'
      : '公众号风格：专业深度、结构清晰、有观点、适合长文阅读';

  const prompt = `你是一个爆款文章写手。请根据以下原始内容，重新优化为${platformHint}。

要求：
1. 标题要吸引眼球，有悬念或数字
2. 开头要有钩子，抓住读者注意力
3. 内容要有价值、有观点
4. 结尾要有互动引导

原始标题：${template.title}
原始内容：
${template.body}

请直接输出优化后的文章，格式：
【标题】优化后的标题
【正文】优化后的正文`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
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

      console.error(`  ⚠️ 第${attempt}次尝试：未解析到内容，重新生成...`);
    } catch (e) {
      console.error(`  ❌ 第${attempt}次尝试失败: ${e.message}`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  console.error(`  ❌ AI 优化全部${retries}次失败，使用原始模板`);
  return template;
}

async function generateCover(title, platform) {
  const width = platform === 'xiaohongshu' ? 1080 : 1920;
  const height = platform === 'xiaohongshu' ? 1440 : 1080;
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, ' ').slice(0, 30);

  const colors = platform === 'xiaohongshu'
    ? { bg1: '#FF6B6B', bg2: '#FF8E53', text: '#FFFFFF' }
    : { bg1: '#667EEA', bg2: '#764BA2', text: '#FFFFFF' };

  const prompt = `生成一个 SVG 封面图代码。

要求：
- 尺寸：${width}x${height}
- 风格：${platform === 'xiaohongshu' ? '活泼时尚渐变色背景，适合小红书' : '专业科技感深色背景，适合公众号'}
- 画面中央显示标题文字："${safeTitle}"
- 背景使用渐变色从 ${colors.bg1} 到 ${colors.bg2}
- 标题文字白色，加粗，居中显示
- 不要显示日期

请直接输出 SVG 代码，不要有任何解释或 markdown 标记。`;

  const retries = 5;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const stream = await client.chat.completions.create({
        model: TEXT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        stream: true
      });

      let svgCode = '';
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) svgCode += content;
      }

      svgCode = svgCode.replace(/```svg/gi, '').replace(/```/gi, '').trim();
      if (svgCode.includes('<svg') && svgCode.includes('</svg>')) {
        const sharp = (await import('sharp')).default;
        const pngBuffer = await sharp(Buffer.from(svgCode)).png().toBuffer();
        return { data: pngBuffer, ext: 'png' };
      }

      console.error(`  ⚠️ 第${attempt}次尝试：未解析到有效SVG，重新生成...`);
    } catch (e) {
      console.error(`  ❌ 第${attempt}次尝试失败: ${e.message}`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  console.error(`  ❌ 封面图生成全部${retries}次失败，使用 SVG 兜底`);
  return { data: generateFallbackSvg(title, platform), ext: 'svg' };
}

function generateFallbackSvg(title, platform) {
  const width = 1080;
  const height = platform === 'xiaohongshu' ? 1440 : 900;
  const safeTitle = title.length > 30 ? title.slice(0, 30) + '...' : title;

  const colors = {
    xiaohongshu: { bg1: '#FF6B6B', bg2: '#FF8E53', text: '#FFFFFF' },
    gongzhonghao: { bg1: '#667EEA', bg2: '#764BA2', text: '#FFFFFF' }
  };
  const c = colors[platform] || colors.xiaohongshu;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c.bg1}"/>
      <stop offset="100%" style="stop-color:${c.bg2}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <text x="${width/2}" y="${height/2}" font-family="Arial,sans-serif" font-size="48" font-weight="bold" fill="${c.text}" text-anchor="middle">${escapeXml(safeTitle)}</text>
</svg>`;

  return svg;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function startSchedule() {
  console.log(`⏰ 启动定时任务：${CRON_EXPRESSION}`);

  cron.schedule(CRON_EXPRESSION, async () => {
    console.log(`\n${'='.repeat(40)}`);
    console.log(`🕐 定时执行：${new Date().toLocaleString('zh-CN')}`);
    console.log('='.repeat(40));
    await run();
  });

  console.log('定时任务已启动，按 Ctrl+C 退出');
}

async function run() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  ensureDir(join(OUTPUT_DIR, 'xiaohongshu', today));
  ensureDir(join(OUTPUT_DIR, 'gongzhonghao', today));

  const items = await fetchNews();
  if (items.length === 0) {
    console.log('❌ 未获取到任何资讯，退出');
    return;
  }

  const topItems = items.slice(0, 2);
  const results = [];

  for (const item of topItems) {
    console.log(`📝 处理：${item.title}`);

    for (const platform of ['xiaohongshu', 'gongzhonghao']) {
      let template = generateTemplate(item, platform);

      console.log(`  🤖 AI 优化（${platform}）...`);
      template = await optimizeWithAI(template);

      console.log(`  🖼️ 生成封面（${platform}）...`);
      const cover = await generateCover(template.title, platform);

      const safeName = template.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);

      const articlePath = join(OUTPUT_DIR, platform, today, `${safeName}.md`);
      const coverPath = join(OUTPUT_DIR, platform, today, `${safeName}_cover.${cover.ext}`);

      writeFileSync(articlePath, `# ${template.title}\n\n${template.body}`, 'utf-8');
      writeFileSync(coverPath, cover.data);

      results.push({ platform, title: template.title, articlePath, coverPath });
      console.log(`  ✅ 已生成：${platform}/${today}/${safeName}`);
    }
  }

  console.log(`\n🎉 完成！共生成 ${results.length} 篇文章：`);
  for (const r of results) {
    console.log(`  [${r.platform}] ${r.title}`);
    console.log(`    文章：${r.articlePath}`);
    console.log(`    封面：${r.coverPath}`);
  }
}

const args = process.argv.slice(2);
if (args.includes('--schedule')) {
  startSchedule();
  process.on('SIGINT', () => {
    console.log('\n定时任务已停止');
    process.exit(0);
  });
} else {
  run().catch(console.error);
}