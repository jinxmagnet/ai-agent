# AI Agent Weather - 智能旅行助手

基于 ReAct 模式的 AI Agent，自动查询天气并推荐旅游景点，通过 SSE 实时展示推理过程。

## 核心流程

```
用户提问 → Thought（思考）→ Action（调用工具）→ Observation（观察结果）→ 最终回答
```

Agent 可调用两个工具：
- **get_weather(city)** - 查询城市实时天气（wttr.in API）
- **search_attraction(city, weather)** - 根据天气推荐适合的景点（AI 生成）

## 快速开始

### 环境要求

- Node.js 18+

### 安装与运行

```bash
# 后端
cd backend
npm install
```

创建 `backend/.env`：
```env
AIHUBMIX_API_KEY=your_api_key_here
```

```bash
# 启动后端（端口 3000）
npm run dev

# 前端（另起终端）
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Hono + @hono/node-server |
| AI SDK | Vercel AI SDK + aihubmix |
| 前端 | React 18 + TypeScript + Vite |
| 数据验证 | Zod |
| 通信方式 | SSE (Server-Sent Events) |

## 使用示例

输入任意旅行相关问题，Agent 会自动推理并执行：

- "请帮我查询北京今天的天气，并推荐适合的景点"
- "上海天气怎么样？适合室内还是室外活动？"
- "帮我规划一个适合今天天气的户外活动"

## API

### POST /api/chat

**请求：**
```json
{ "message": "请帮我查询北京的天气" }
```

**响应：** SSE 流式返回

| 事件类型 | 说明 |
|----------|------|
| `thought` | Agent 思考过程 |
| `tool_call` | 工具调用（含工具名和参数） |
| `observation` | 工具执行结果 |
| `final_answer` | 最终答案 |
| `error` | 错误信息 |

## 项目结构

```
ai-agent-weather/
├── backend/
│   ├── src/index.ts        # Agent 核心逻辑 + API
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.tsx         # 主界面 + SSE 解析
    │   ├── App.css         # 样式
    │   └── main.tsx
    └── package.json
```

## License

MIT
