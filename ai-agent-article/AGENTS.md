# AGENTS.md

## 项目概述

ai-agent-article 是一个自动化生成小红书/公众号爆款文章的工具。

## 技术栈

- **运行时**: Node.js
- **依赖**: rss-parser, node-cron
- **HTTP 请求**: Node.js 原生 fetch
- **AI 服务**: AIHubMix（内容优化：coding-glm-5.1-free，封面图：gemini-3.1-flash-image-preview-free）

## 项目结构（规划）

```
ai-agent-article/
├── src/
│   └── index.js            # 主入口（5步流程）
├── output/
│   ├── xiaohongshu/        # 小红书格式文章
│   └── gongzhonghao/       # 公众号格式文章
├── config/                 # 配置文件（RSS 源、API Key 等）
├── package.json
├── AGENTS.md
└── README.md
```

## 开发规范

- 使用 ES Module（`import/export`），package.json 中设置 `"type": "module"`
- 异步操作使用 async/await
- 所有配置项放 `config/` 目录，不硬编码
- API Key 等敏感信息使用 `.env` 文件管理，不提交到仓库
- 不添加多余注释

## 构建与运行

```bash
npm install
node src/index.js
```

### 定时执行

- **Linux/macOS**: 使用 node-cron 或系统 cron
- **Windows**: 使用任务计划程序，添加定时任务执行 `node src/index.js`

## Lint / 检查

暂无，后续按需添加 ESLint。
