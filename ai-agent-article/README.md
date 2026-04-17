# ai-agent-article

自动化生成小红书 / 公众号文章的内容 Agent，当前已具备**选题、审稿、记忆、反馈学习**等基础能力。

## Agent 化流程

```
第一步：抓取 AI 资讯（RSS / API）
        ↓
第二步：历史去重 + 选题评分
        ↓
第三步：生成内容模板（小红书 / 公众号）
        ↓
第四步：AI 优化内容 + 审稿回退
        ↓
第五步：自动生成封面图（AI生成SVG → sharp转PNG）
        ↓
第六步：写入记忆、同步反馈、更新策略
        ↓
第七步：每天自动执行（cron / 任务计划程序）
```

## 当前已具备的 Agent 能力

- 资讯抓取与平台化内容生成
- 规则化选题评分
- 审稿评分与定向重写
- 历史记忆与相似内容去重
- 基于反馈指标的策略学习（文件驱动）

## 技术选型

| 用途 | 技术 |
|------|------|
| 运行时 | Node.js |
| RSS 抓取 | rss-parser |
| AI 服务 | ModelScope (ZhipuAI/GLM-5.1) |
| SVG 转 PNG | sharp |
| 定时任务 | node-cron / Windows 任务计划程序 |
| 反馈学习 | 本地 JSON 指标回填 |

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 ModelScope API Key

# 单次运行
node src/index.js

# 启动定时任务（每天自动执行）
node src/index.js --schedule
```

## 关键环境变量

```env
MODELSCOPE_API_KEY=
TEXT_MODEL=ZhipuAI/GLM-5.1
CRON_EXPRESSION=0 9 * * *
MAX_ARTICLES_PER_RUN=2
REWRITE_MAX_ROUNDS=1
MEMORY_ENABLED=true
DUPLICATE_SIMILARITY_THRESHOLD=0.55
MEMORY_LOOKBACK_DAYS=30
FEEDBACK_ENABLED=true
```

## 反馈学习如何使用

当前版本尚未直连小红书 / 公众号平台 API，因此第 4 期采用**文件回填**方式完成效果学习。

### 1. 查看已发布文章记录

每次运行后，系统会把发布结果写入：

- `data/memory/articles.json`
- `data/memory/strategies.json`
- `data/memory/sources.json`

这些文件会记录：

- 文章标题、原始选题、来源、平台
- 审稿分数与标题风格
- 最近标题与平台策略
- 来源历史表现

### 2. 回填反馈指标

在 `data/feedback/metrics.json` 中增加反馈记录，使用 `articlePath` 或 `articleId` 对应文章：

```json
[
  {
    "articlePath": "output/gongzhonghao/20260417/AI前沿｜示例文章.md",
    "impressions": 1200,
    "views": 860,
    "clicks": 140,
    "likes": 48,
    "comments": 12,
    "shares": 8,
    "saves": 20,
    "conversions": 3,
    "capturedAt": "2026-04-17T18:00:00.000Z"
  }
]
```

### 3. 下次运行时自动学习

程序启动时会自动：

- 匹配反馈指标到历史文章
- 计算 `feedbackScore`
- 汇总平台高反馈样本
- 提取推荐标题风格
- 更新来源反馈表现

学习结果会写入：

- `data/feedback/summary.json`

后续选题与写作会自动参考这些学习结果。

## Windows 定时任务（替代方案）

```powershell
# 打开任务计划程序，添加基本任务：
# - 触发器：每天指定时间
# - 操作：启动程序 node
# - 参数：src/index.js
# - 起始目录：项目根目录
```

## 输出与数据

生成的文章保存在 `output/` 目录，策略与反馈数据保存在 `data/` 目录：

```
output/
├── xiaohongshu/YYYYMMDD/
│   ├── 标题.md
│   └── 标题_cover.png
└── gongzhonghao/YYYYMMDD/
    ├── 标题.md
    └── 标题_cover.png

data/
├── memory/
│   ├── articles.json
│   ├── strategies.json
│   └── sources.json
└── feedback/
    ├── metrics.json
    └── summary.json
```

## License

MIT