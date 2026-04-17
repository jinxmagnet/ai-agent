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

function buildDecorations(width, height, palette, isXhs) {
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
        shapes.push(`<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${palette.accent}" opacity="${opacity}"/>`);
      } else if (i % 4 === 1) {
        const x2 = x + (Math.random() - 0.5) * 200;
        const y2 = y + (Math.random() - 0.5) * 200;
        shapes.push(`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${palette.accent}" stroke-width="1" opacity="${opacity}"/>`);
      } else if (i % 4 === 2) {
        shapes.push(`<rect x="${x}" y="${y}" width="${size * 0.6}" height="1" fill="${palette.accent}" opacity="${opacity}" transform="rotate(${Math.random() * 360} ${x} ${y})"/>`);
      } else {
        shapes.push(`<circle cx="${x}" cy="${y}" r="${size * 0.15}" fill="none" stroke="${palette.accent}" stroke-width="1" opacity="${opacity}"/>`);
      }
    }
  }

  if (!isXhs) {
    const gridSize = 60;
    for (let gx = 0; gx < width; gx += gridSize) {
      for (let gy = 0; gy < height; gy += gridSize) {
        if (Math.random() > 0.96) {
          shapes.push(`<circle cx="${gx}" cy="${gy}" r="1.5" fill="${palette.accent}" opacity="0.2"/>`);
        }
      }
    }
  }

  return shapes.join('\n  ');
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildCoverSvg(title, platform, width, height) {
  const isXhs = platform === 'xiaohongshu';

  const palettes = {
    xiaohongshu: [
      { bg1: '#FF6B6B', bg2: '#FF8E53', bg3: '#FFA751', accent: '#FFE66D', deco: 'rgba(255,255,255,0.12)' },
      { bg1: '#F857A6', bg2: '#FF5858', bg3: '#FF7E5F', accent: '#FEB47B', deco: 'rgba(255,255,255,0.10)' },
      { bg1: '#A18CD1', bg2: '#FBC2EB', bg3: '#D4A8FF', accent: '#FFFFFF', deco: 'rgba(255,255,255,0.08)' },
      { bg1: '#667EEA', bg2: '#764BA2', bg3: '#6B8DD6', accent: '#FBC2EB', deco: 'rgba(255,255,255,0.10)' }
    ],
    gongzhonghao: [
      { bg1: '#0F0C29', bg2: '#302B63', bg3: '#24243E', accent: '#6C63FF', deco: 'rgba(108,99,255,0.15)' },
      { bg1: '#000428', bg2: '#004E92', bg3: '#001F3F', accent: '#00D2FF', deco: 'rgba(0,210,255,0.10)' },
      { bg1: '#1A1A2E', bg2: '#16213E', bg3: '#0F3460', accent: '#E94560', deco: 'rgba(233,69,96,0.12)' },
      { bg1: '#0D1117', bg2: '#161B22', bg3: '#21262D', accent: '#58A6FF', deco: 'rgba(88,166,255,0.10)' }
    ]
  };

  const set = palettes[platform] || palettes.xiaohongshu;
  const palette = set[Math.floor(Math.random() * set.length)];

  const lines = wrapText(title, isXhs ? 14 : 22);
  const maxFontSize = isXhs ? 64 : 56;
  const minFontSize = isXhs ? 36 : 32;
  const fontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(width * 0.038)));
  const lineHeight = fontSize * 1.6;
  const blockHeight = lines.length * lineHeight;
  const startY = (height - blockHeight) / 2 + fontSize;

  const decorations = buildDecorations(width, height, palette, isXhs);
  const titleSvg = lines.map((line, i) =>
    `<text x="${width / 2}" y="${startY + i * lineHeight}" font-family="'PingFang SC','Microsoft YaHei','Noto Sans SC',Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle" opacity="0.95">${escapeXml(line)}</text>`
  ).join('\n');

  const subtitle = isXhs ? '✦ AI 资讯速递 ✦' : 'AI 前沿日报';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${palette.bg1}"/>
      <stop offset="50%" style="stop-color:${palette.bg2}"/>
      <stop offset="100%" style="stop-color:${palette.bg3}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" style="stop-color:${palette.accent};stop-opacity:0.25"/>
      <stop offset="100%" style="stop-color:${palette.accent};stop-opacity:0"/>
    </radialGradient>
    <filter id="textShadow">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.3)"/>
    </filter>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>

  ${decorations}

  ${isXhs ? '' : `<line x1="${width * 0.15}" y1="${startY - lineHeight * 1.2}" x2="${width * 0.85}" y2="${startY - lineHeight * 1.2}" stroke="${palette.accent}" stroke-width="1.5" opacity="0.4"/>`}

  <g filter="url(#textShadow)">
    ${titleSvg}
  </g>

  ${isXhs ? '' : `<line x1="${width * 0.15}" y1="${startY + (lines.length - 1) * lineHeight + lineHeight * 0.5}" x2="${width * 0.85}" y2="${startY + (lines.length - 1) * lineHeight + lineHeight * 0.5}" stroke="${palette.accent}" stroke-width="1.5" opacity="0.4"/>`}

  <text x="${width / 2}" y="${height * 0.9}" font-family="'PingFang SC','Microsoft YaHei',Arial,sans-serif" font-size="${isXhs ? 28 : 24}" fill="white" text-anchor="middle" opacity="0.6">${subtitle}</text>
</svg>`;
}

export async function generateCover(title, platform) {
  const width = platform === 'xiaohongshu' ? 1080 : 1920;
  const height = platform === 'xiaohongshu' ? 1440 : 1080;
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, ' ');
  const svg = buildCoverSvg(safeTitle, platform, width, height);

  try {
    const sharp = (await import('sharp')).default;
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return { data: pngBuffer, ext: 'png' };
  } catch (error) {
    return { data: svg, ext: 'svg', error };
  }
}
