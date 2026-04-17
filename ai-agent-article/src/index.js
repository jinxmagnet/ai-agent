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
4. 结尾抛出一个与主题相关的开放性问题，引导读者在评论区讨论交流，不要送礼品、福利、抽奖、赠送任何东西

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
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, ' ');

  const svg = buildCoverSvg(safeTitle, platform, width, height);

  try {
    const sharp = (await import('sharp')).default;
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return { data: pngBuffer, ext: 'png' };
  } catch (e) {
    console.error(`  ❌ SVG 转 PNG 失败: ${e.message}，使用 SVG 兜底`);
    return { data: svg, ext: 'svg' };
  }
}

function buildCoverSvg(title, platform, width, height) {
  const isXhs = platform === 'xiaohongshu';

  const palettes = {
    xiaohongshu: [
      { bg1: '#FF6B6B', bg2: '#FF8E53', bg3: '#FFA751', accent: '#FFE66D', deco: 'rgba(255,255,255,0.12)' },
      { bg1: '#F857A6', bg2: '#FF5858', bg3: '#FF7E5F', accent: '#FEB47B', deco: 'rgba(255,255,255,0.10)' },
      { bg1: '#A18CD1', bg2: '#FBC2EB', bg3: '#D4A8FF', accent: '#FFFFFF', deco: 'rgba(255,255,255,0.08)' },
      { bg1: '#667EEA', bg2: '#764BA2', bg3: '#6B8DD6', accent: '#FBC2EB', deco: 'rgba(255,255,255,0.10)' },
    ],
    gongzhonghao: [
      { bg1: '#0F0C29', bg2: '#302B63', bg3: '#24243E', accent: '#6C63FF', deco: 'rgba(108,99,255,0.15)' },
      { bg1: '#000428', bg2: '#004E92', bg3: '#001F3F', accent: '#00D2FF', deco: 'rgba(0,210,255,0.10)' },
      { bg1: '#1A1A2E', bg2: '#16213E', bg3: '#0F3460', accent: '#E94560', deco: 'rgba(233,69,96,0.12)' },
      { bg1: '#0D1117', bg2: '#161B22', bg3: '#21262D', accent: '#58A6FF', deco: 'rgba(88,166,255,0.10)' },
    ]
  };

  const set = palettes[platform] || palettes.xiaohongshu;
  const p = set[Math.floor(Math.random() * set.length)];

  const lines = wrapText(title, isXhs ? 14 : 22);
  const maxFontSize = isXhs ? 64 : 56;
  const minFontSize = isXhs ? 36 : 32;
  const fontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(width * 0.038)));
  const lineHeight = fontSize * 1.6;
  const blockHeight = lines.length * lineHeight;
  const startY = (height - blockHeight) / 2 + fontSize;

  const decorates = buildDecorations(width, height, p, isXhs);

  const titleSvg = lines.map((line, i) =>
    `<text x="${width / 2}" y="${startY + i * lineHeight}" font-family="'PingFang SC','Microsoft YaHei','Noto Sans SC',Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle" opacity="0.95">${escapeXml(line)}</text>`
  ).join('\n');

  const subtitle = isXhs ? '✦ AI 资讯速递 ✦' : 'AI 前沿日报';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${p.bg1}"/>
      <stop offset="50%" style="stop-color:${p.bg2}"/>
      <stop offset="100%" style="stop-color:${p.bg3}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" style="stop-color:${p.accent};stop-opacity:0.25"/>
      <stop offset="100%" style="stop-color:${p.accent};stop-opacity:0"/>
    </radialGradient>
    <filter id="textShadow">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.3)"/>
    </filter>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>

  ${decorates}

  ${isXhs ? '' : `<line x1="${width * 0.15}" y1="${startY - lineHeight * 1.2}" x2="${width * 0.85}" y2="${startY - lineHeight * 1.2}" stroke="${p.accent}" stroke-width="1.5" opacity="0.4"/>`}

  <g filter="url(#textShadow)">
    ${titleSvg}
  </g>

  ${isXhs ? '' : `<line x1="${width * 0.15}" y1="${startY + (lines.length - 1) * lineHeight + lineHeight * 0.5}" x2="${width * 0.85}" y2="${startY + (lines.length - 1) * lineHeight + lineHeight * 0.5}" stroke="${p.accent}" stroke-width="1.5" opacity="0.4"/>`}

  <text x="${width / 2}" y="${height * 0.9}" font-family="'PingFang SC','Microsoft YaHei',Arial,sans-serif" font-size="${isXhs ? 28 : 24}" fill="white" text-anchor="middle" opacity="0.6">${subtitle}</text>
</svg>`;
}

function wrapText(text, maxCharsPerLine) {
  const lines = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) {
      lines.push(remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf(' ', maxCharsPerLine);
    if (breakAt <= 0) breakAt = maxCharsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  return lines;
}

function buildDecorations(width, height, p, isXhs) {
  const shapes = [];
  const count = isXhs ? 12 : 15;

  for (let i = 0; i < count; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = 20 + Math.random() * 120;
    const opacity = 0.04 + Math.random() * 0.12;

    if (isXhs) {
      if (i % 3 === 0) {
        shapes.push(`<circle cx="${x}" cy="${y}" r="${size / 2}" fill="white" opacity="${opacity}"/>`);
      } else if (i % 3 === 1) {
        shapes.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.3}" fill="white" opacity="${opacity}" transform="rotate(${Math.random() * 45} ${x + size / 2} ${y + size / 2})"/>`);
      } else {
        shapes.push(`<circle cx="${x}" cy="${y}" r="${size * 0.4}" fill="none" stroke="white" stroke-width="2" opacity="${opacity * 0.8}"/>`);
      }
    } else {
      if (i % 4 === 0) {
        shapes.push(`<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${p.accent}" opacity="${opacity}"/>`);
      } else if (i % 4 === 1) {
        const x2 = x + (Math.random() - 0.5) * 200;
        const y2 = y + (Math.random() - 0.5) * 200;
        shapes.push(`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${p.accent}" stroke-width="1" opacity="${opacity}"/>`);
      } else if (i % 4 === 2) {
        shapes.push(`<rect x="${x}" y="${y}" width="${size * 0.6}" height="1" fill="${p.accent}" opacity="${opacity}" transform="rotate(${Math.random() * 360} ${x} ${y})"/>`);
      } else {
        shapes.push(`<circle cx="${x}" cy="${y}" r="${size * 0.15}" fill="none" stroke="${p.accent}" stroke-width="1" opacity="${opacity}"/>`);
      }
    }
  }

  if (!isXhs) {
    const gridSize = 60;
    for (let gx = 0; gx < width; gx += gridSize) {
      for (let gy = 0; gy < height; gy += gridSize) {
        if (Math.random() > 0.96) {
          shapes.push(`<circle cx="${gx}" cy="${gy}" r="1.5" fill="${p.accent}" opacity="0.2"/>`);
        }
      }
    }
  }

  return shapes.join('\n  ');
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