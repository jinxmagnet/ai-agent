# AI Agent Weather - 智能旅行助手

基于 ReAct 模式的 AI Agent 演示项目，能够根据用户需求查询天气并推荐旅游景点。

## 功能特性

- **智能旅行规划**：自动分析用户需求，分步骤完成旅行规划
- **天气查询**：实时查询全球城市天气信息
- **景点推荐**：根据天气状况智能推荐适合的旅游景点
- **实时展示**：通过 SSE 实时展示 Agent 的推理过程
- **工具调用**：模拟 ReAct 模式的 Thought → Action → Observation 循环

## 技术栈

### 后端
- Hono - 轻量级 Web 框架
- Vercel AI SDK - AI 模型调用
- aihubmix - AI 模型提供商
- Zod - 数据验证

### 前端
- React 18
- Vite
- TypeScript

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 pnpm

### 安装

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 配置

在 `backend` 目录创建 `.env` 文件：

```env
AIHUBMIX_API_KEY=your_api_key_here
```

### 运行

```bash
# 启动后端 (端口 3000)
cd backend
npm run dev

# 启动前端 (端口 5173)
cd frontend
npm run dev
```

访问 http://localhost:5173 即可体验。

## 使用方法

1. 在输入框中描述您的旅行需求，例如：
   - "请帮我查询北京今天的天气，并推荐适合的景点"
   - "上海天气怎么样？适合室内还是室外活动？"

2. 点击发送按钮，观察 Agent 的推理过程

3. Agent 会自动：
   - 分析用户需求
   - 调用天气查询工具
   - 根据天气情况推荐景点
   - 给出最终建议

## API 接口

### POST /api/chat

发送聊天消息，启动 Agent 推理流程。

**请求：**
```json
{
  "message": "请帮我查询北京的天气"
}
```

**响应：** SSE 流式返回，包含以下事件类型：
- `thought`: Agent 思考过程
- `tool_call`: 工具调用
- `observation`: 工具执行结果
- `final_answer`: 最终答案
- `error`: 错误信息

## 项目结构

```
ai-agent-weather/
├── backend/
│   └── src/
│       └── index.ts      # 后端入口
└── frontend/
    └── src/
        ├── App.tsx       # 主应用组件
        ├── App.css       # 样式
        └── main.tsx      # 入口文件
```

## License

MIT
