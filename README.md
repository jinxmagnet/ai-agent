# AI Agent Projects

基于 AI Agent 的实践项目集合。

## 项目列表

### 1. ai-agent-weather
智能旅行助手，基于 ReAct 模式的 AI Agent，能够查询天气并推荐旅游景点。

**技术栈：** Hono + React + Vite + Vercel AI SDK + aihubmix

**功能：**
- 天气查询
- 智能景点推荐
- 实时展示 Agent 推理过程

**快速开始：**
```bash
cd ai-agent-weather/backend
npm install
npm run dev

# 另起终端
cd ai-agent-weather/frontend
npm install
npm run dev
```

访问 http://localhost:5173

---

### 2. ai-agent-article
自动化生成小红书/公众号爆款文章的 AI 工具。

**技术栈：** Node.js + rss-parser + ModelScope AI + sharp

**功能：**
- 自动抓取 AI 资讯
- AI 优化内容（小红书/公众号风格）
- 自动生成封面图
- 支持定时任务自动执行

**快速开始：**
```bash
cd ai-agent-article
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 ModelScope API Key

# 单次运行
node src/index.js

# 启动定时任务
node src/index.js --schedule
```

**输出目录：**
```
output/
├── xiaohongshu/YYYYMMDD/
│   ├── 标题.md
│   └── 标题_cover.png
└── gongzhonghao/YYYYMMDD/
    ├── 标题.md
    └── 标题_cover.png
```

---

## License

MIT
