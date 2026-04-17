# Copilot Instructions

本项目 `ai-agent-article` 是一个 Node.js 内容 Agent 系统，不是简单脚本。

## 工作目标

在修改本项目时，默认优先级如下：

1. 保持主流程稳定可运行
2. 优先增强 Agent 决策质量，而不是只堆 prompt
3. 新能力尽量接入记忆层或反馈层，避免一次性逻辑

## 架构约束

遵循当前分层：`orchestrator + agents + services + data`

- `src/orchestrator/`：流程编排，不放复杂业务细节
- `src/agents/`：选题、写作、审稿、记忆、反馈等决策逻辑
- `src/services/`：可复用底层能力，如 LLM、日志、存储、封面生成
- `config/`：配置项与新闻源
- `data/`：记忆数据、反馈数据

不要把新逻辑重新堆回 `src/index.js` 或单个大文件。

## 当前主流程

默认执行链路：

1. 抓取资讯
2. 加载历史记忆
3. 同步反馈学习
4. 历史去重
5. 选题评分
6. 逐平台写作
7. 审稿与必要重写
8. 发布落盘
9. 写回记忆与来源统计

修改流程时，不要随意打破这个顺序。

## 修改时必须遵守

- 保持 ES Module 风格（`import/export`）
- 使用 async/await 处理异步逻辑
- 敏感信息只能走 `.env` / `.env.example`
- 新增阈值、开关、模型名时，优先加到环境变量
- 保持结构化日志风格，不要退回零散 `console.log`
- 不要删除记忆层或反馈层来“简化问题”

## Agent 相关规则

### 选题与策略

如果修改以下内容：

- 选题评分
- 标题风格
- 平台偏好
- 来源优先级

优先考虑接入：

- `data/memory/strategies.json`
- `data/memory/sources.json`
- `data/feedback/summary.json`

### 写作

- 严格基于原始资讯改写，避免虚构事实
- 避免与近期标题或高相似历史文章重复
- 如果已有反馈学习结果，优先参考高反馈样本与推荐标题风格
- 保持平台差异化，不要只是同文换语气

### 审稿

- 审稿不过应先重写
- 多轮重写仍不通过时，应跳过发布，而不是硬发
- 新增审稿规则时，必须能产出明确的 `issues` 和 `rewriteAdvice`

## 数据文件约定

重点数据文件：

- `data/memory/articles.json`
- `data/memory/strategies.json`
- `data/memory/sources.json`
- `data/feedback/metrics.json`
- `data/feedback/summary.json`

验证记忆写回、反馈学习、去重等能力时，不要把测试数据长期留在这些文件里。

## 验证要求

修改后优先做这些检查：

1. 静态错误检查
2. 关键模块轻量导入验证
3. 必要时做可回滚的样例测试

对于记忆层和反馈层测试，结束后恢复种子文件，避免污染真实策略。

## 文档同步

如果修改以下内容，需要同步更新 `README.md` 或 `AGENTS.md`：

- 主流程步骤
- Agent 职责边界
- 环境变量
- 数据文件格式
- 反馈学习方式
