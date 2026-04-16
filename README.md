# AI Agent Projects

基于 AI Agent 的实践项目集合，探索 ReAct 模式与 AI 自动化应用。

## 项目一览

| 项目 | 简介 | 技术栈 |
|------|------|--------|
| [ai-agent-weather](./ai-agent-weather) | 智能旅行助手 - ReAct 模式 AI Agent | Hono, React, Vercel AI SDK |
| [ai-agent-article](./ai-agent-article) | 小红书/公众号爆款文章自动生成 | Node.js, ModelScope AI, rss-parser |

---

## ai-agent-weather

基于 ReAct 模式的智能旅行助手，自动查询天气并推荐景点，实时展示 Agent 推理过程。

**核心流程：** Thought → Action → Observation → Answer

```bash
# 后端 (端口 3000)
cd ai-agent-weather/backend && npm install && npm run dev

# 前端 (端口 5173)
cd ai-agent-weather/frontend && npm install && npm run dev
```

> 需要在 `backend/.env` 中配置 `AIHUBMIX_API_KEY`，访问 http://localhost:5173

---

## ai-agent-article

自动化生成小红书/公众号爆款文章，从资讯抓取到内容优化、封面生成一站式完成。

**五步流程：** 抓取资讯 → 生成模板 → AI 优化 → 生成封面 → 定时执行

```bash
cd ai-agent-article && npm install
cp .env.example .env   # 填入 MODELSCOPE_API_KEY

node src/index.js           # 单次运行
node src/index.js --schedule # 定时任务（每天 9:00）
```

**输出：**
```
output/
├── xiaohongshu/YYYYMMDD/   # 小红书文章 + 封面
└── gongzhonghao/YYYYMMDD/  # 公众号文章 + 封面
```

---

## License

MIT
