# AGENTS.md

## 项目定位

`ai-agent-article` 是一个面向小红书 / 公众号内容生产的 Node.js Agent 项目。

当前版本已经不是单纯的“抓取 + 生成”脚本，而是具备以下能力的内容 Agent：

- 资讯抓取
- 历史去重
- 选题评分
- 平台化写作
- 审稿与回退重写
- 记忆写回
- 基于反馈指标的策略学习

如果你要修改这个项目，默认目标应当是：

1. 保持现有流水线稳定可运行
2. 优先增强 Agent 决策质量，而不是只堆 prompt
3. 所有新增能力尽量能被记忆层或反馈层复用

---

## 当前架构

项目采用分层结构：`orchestrator + agents + services + data`。

### 入口与编排

- `src/index.js`
  - CLI 入口
  - 支持单次执行与 `--schedule` 定时模式

- `src/orchestrator/runPipeline.js`
  - 主编排器
  - 串联抓取、去重、选题、写作、审稿、发布、记忆、反馈学习

### Agents

- `src/agents/scoutAgent.js`
  - 负责抓取 RSS / API 资讯

- `src/agents/selectorAgent.js`
  - 负责选题评分
  - 当前评分会综合时效、关键词、内容长度、来源表现、反馈表现

- `src/agents/writerAgent.js`
  - 负责模板生成、AI 优化、按审稿意见重写
  - 会消费历史记忆与反馈型策略提示

- `src/agents/reviewerAgent.js`
  - 负责规则化审稿
  - 输出通过/不通过、问题列表、重写建议

- `src/agents/publisherAgent.js`
  - 负责封面生成与文章落盘

- `src/agents/memoryAgent.js`
  - 负责历史文章记忆、相似内容去重、平台策略与来源表现沉淀

- `src/agents/feedbackAgent.js`
  - 负责读取反馈指标、计算反馈分、汇总高反馈样本、反哺策略

### Services

- `src/services/llm.js`
  - 模型客户端封装
  - 采用懒加载，避免 import 阶段因缺少密钥直接失败

- `src/services/logger.js`
  - 结构化日志输出

- `src/services/storage.js`
  - 输出目录与文件写入

- `src/services/cover.js`
  - SVG 封面生成与 PNG 转换

### 配置与数据

- `config/sources.js`
  - 新闻源配置

- `data/memory/`
  - 文章记忆、策略记忆、来源表现

- `data/feedback/`
  - 外部/手工回填的反馈指标与学习摘要

- `output/`
  - 按平台和日期输出文章与封面

---

## 当前主流程

默认运行链路如下：

1. 抓取 AI 资讯
2. 加载历史记忆
3. 同步反馈学习
4. 基于历史内容做相似去重
5. 对候选资讯做评分与排序
6. 逐平台生成草稿
7. 审稿，必要时按建议重写
8. 通过后生成封面并落盘
9. 写回记忆与来源统计

请不要在未评估影响的前提下，打破这个顺序。

尤其注意：

- 反馈学习不是独立脚本，而是主流程初始化的一部分
- 记忆层不仅负责“存”，还负责“过滤”和“提供上下文”
- Writer 的输入不应只依赖当前新闻，还应尽量利用记忆与反馈信息

---

## 修改约束

### 1. 保持模块职责单一

新增能力时优先放到对应 Agent / Service 中，不要重新把逻辑堆回 `src/index.js` 或 `runPipeline.js`。

建议原则：

- 流程控制放 `orchestrator`
- 决策逻辑放 `agents`
- 可复用工具能力放 `services`
- 配置与状态数据放 `config` / `data`

### 2. 不要绕开记忆与反馈层

如果新增：

- 选题策略
- 标题策略
- 平台偏好
- 来源优先级

优先考虑是否应该：

- 写入 `data/memory/strategies.json`
- 写入 `data/memory/sources.json`
- 或通过 `data/feedback/summary.json` 反哺

### 3. 不要把敏感信息写进代码

所有密钥、开关、阈值配置都应通过 `.env` / `.env.example` 暴露。

当前重点环境变量包括：

- `MODELSCOPE_API_KEY`
- `TEXT_MODEL`
- `CRON_EXPRESSION`
- `MAX_ARTICLES_PER_RUN`
- `REWRITE_MAX_ROUNDS`
- `MEMORY_ENABLED`
- `DUPLICATE_SIMILARITY_THRESHOLD`
- `MEMORY_LOOKBACK_DAYS`
- `FEEDBACK_ENABLED`

### 4. 优先做可验证的小步改动

这类项目非常容易出现“看起来更聪明，但实际更脆”。

修改时优先遵循：

- 先小步重构
- 再静态检查
- 再做轻量运行验证
- 必要时做可回滚的样例测试

---

## 数据文件约定

### `data/memory/articles.json`

记录已发布文章的历史条目，通常包含：

- 最终标题
- 原始选题标题
- 来源
- 平台
- 审稿分数
- 标题风格
- 输出路径
- 反馈分（如已同步）

### `data/memory/strategies.json`

记录平台级策略，例如：

- 发布次数
- 常用标题风格
- 平均审稿分
- 最近标题
- 反馈学习汇总

### `data/memory/sources.json`

记录来源级表现，例如：

- 来源发布次数
- 平均审稿分
- 平均反馈分
- 最优平台

### `data/feedback/metrics.json`

这是第 4 期的输入文件，支持外部或手工回填发布效果指标。

匹配主键优先使用：

- `articlePath`
- 或 `articleId`

### `data/feedback/summary.json`

这是学习结果摘要，供系统与开发者查看当前：

- 哪个平台反馈最好
- 哪些标题风格更有效
- 哪些文章是高反馈样本
- 是否存在未匹配的反馈记录

---

## 写作与审稿原则

### 写作侧

- 优先保持平台差异化，而不是同文换语气
- 严格基于原始资讯改写，避免虚构事实
- 尽量避免与近期标题或高相似历史文章重复
- 如果已有反馈学习结果，优先参考高反馈样本的标题风格与表达模式

### 审稿侧

- 不通过的稿件应先尝试定向重写
- 如果多轮重写仍不过关，应跳过发布，而不是硬发
- 新增审稿规则时，尽量保证可解释，能产出明确的 `issues` 与 `rewriteAdvice`

---

## 验证方式

修改后优先使用以下验证方式：

### 静态检查

- 检查改动文件是否有语法或类型错误

### 轻量导入验证

- 验证关键模块可被正常 import
- 尤其适合 `runPipeline.js`、新 Agent、新 Service

### 样例数据验证

对于以下场景，建议使用可回滚样例测试：

- 记忆写回
- 反馈学习
- 去重过滤
- 选题评分

测试后应恢复种子文件，避免污染真实记忆或反馈数据。

---

## 当前阶段最值得继续演进的方向

如果后续继续开发，建议优先级如下：

1. **事实核验能力**
   - 增加回源校验、关键断言检查、风险标记

2. **更细的策略学习**
   - 标题风格 A/B
   - 平台偏好分层
   - 来源 × 平台组合效果分析

3. **自动反馈接入**
   - 从手工 JSON 回填升级为平台 API 或后台同步

4. **更强的内容规划能力**
   - 在写作前加入 brief / 大纲 / 角度规划步骤

---

## 不建议的做法

- 不要把所有逻辑重新写回一个大文件
- 不要把 prompt 复杂度当成 Agent 能力本身
- 不要直接删除记忆/反馈逻辑来“简化问题”
- 不要在验证过程中把测试数据长期留在 `data/memory` 或 `data/feedback`
- 不要让模型在没有来源约束的情况下扩展事实结论

---

## 运行方式

```bash
npm install
node src/index.js
node src/index.js --schedule
```

Windows 下也可以通过任务计划程序运行 `node src/index.js`。

---

## 文档同步要求

如果你修改了以下任一项，请同步更新 `README.md` 或本文件：

- 主流程步骤
- 目录结构
- 环境变量
- 记忆/反馈数据格式
- Agent 职责边界

否则文档会很快再次过期——而过期文档的杀伤力，通常比没有文档还大。