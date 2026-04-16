# ai-agent-article

自动化生成小红书 / 公众号爆款文章。

## 五步流程

```
第一步：抓取 AI 资讯（RSS / API）
        ↓
第二步：生成内容模板（小红书 / 公众号）
        ↓
第三步：AI 优化内容（AIHubMix）
        ↓
第四步：自动生成封面图
        ↓
第五步：每天自动执行（cron / 任务计划程序）
```

## 技术选型

| 用途 | 技术 |
|------|------|
| 运行时 | Node.js |
| RSS 抓取 | rss-parser |
| API 请求 | Node.js 原生 fetch |
| AI 优化 | AIHubMix (coding-glm-5.1-free) |
| 封面图 | AIHubMix (gemini-3.1-flash-image-preview-free) |
| 定时任务 | node-cron / Windows 任务计划程序 |

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 AIHubMix API Key 等信息

# 单次运行
node src/index.js

# 启动定时任务（每天自动执行）
node src/index.js --schedule
```

## Windows 定时任务（替代方案）

```powershell
# 打开任务计划程序，添加基本任务：
# - 触发器：每天指定时间
# - 操作：启动程序 node
# - 参数：src/index.js
# - 起始目录：项目根目录
```

## 输出

生成的文章保存在 `output/` 目录，按平台分类：

- `output/xiaohongshu/` — 小红书格式文章
- `output/gongzhonghao/` — 公众号格式文章

## License

MIT
