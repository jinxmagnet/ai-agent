import 'dotenv/config';
import { serve } from '@hono/node-server'
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { createAihubmix } from '@aihubmix/ai-sdk-provider';
import { generateText } from 'ai';

const aihubmix = createAihubmix({
  apiKey: process.env.AIHUBMIX_API_KEY,
});

const app = new Hono();
app.use('/api/*', cors());

const SYSTEM_PROMPT = `你是一个智能旅行助手，能够根据用户需求，分步骤地完成旅行规划任务。

# 可用工具:

- get_weather(city: str): 查询指定城市的实时天气。
- search_attraction(city: str, weather: str): 根据城市和天气搜索推荐的旅游景点。

# 输出格式要求:

你的每次回复必须严格遵循以下格式，包含一对Thought和Action：

Thought: [你的思考过程和下一步计划]
Action: [你要执行的具体行动]

Action的格式必须是以下之一：
1. 调用工具：function_name(arg_name="arg_value")
2. 结束任务：Finish[最终答案]

# 重要提示:
- 每次只输出一对Thought-Action
- Action必须在同一行，不要换行
- 当收集到足够信息可以回答用户问题时，必须使用 Action: Finish[最终答案] 格式结束
- city 参数请使用英文城市名（如 Beijing, Shanghai）
- 天气查询后，请将天气信息传递给景点推荐工具

请开始吧！`;

interface StepEvent {
  type: 'thought' | 'action' | 'tool_call' | 'observation' | 'final_answer' | 'error';
  step: number;
  content: string;
  tool?: string;
  args?: Record<string, string>;
}

function parseResponse(text: string): { thought: string; action: string } {
  const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=Action:)/i);
  const actionMatch = text.match(/Action:\s*(.+)/i);

  return {
    thought: thoughtMatch ? thoughtMatch[1].trim() : '',
    action: actionMatch ? actionMatch[1].trim() : '',
  };
}

function parseAction(action: string):
  | { type: 'tool_call'; tool: string; args: Record<string, string> }
  | { type: 'finish'; answer: string } {
  if (action.startsWith('Finish[') || action.startsWith('finish[')) {
    const match = action.match(/[Ff]inish\[(.+)\]$/);
    return { type: 'finish', answer: match ? match[1] : action };
  }

  const fnMatch = action.match(/(\w+)\((.+)\)/);
  if (!fnMatch) {
    return { type: 'finish', answer: action };
  }

  const tool = fnMatch[1];
  const argsStr = fnMatch[2];
  const args: Record<string, string> = {};

  const argRegex = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = argRegex.exec(argsStr)) !== null) {
    args[m[1]] = m[2];
  }

  return { type: 'tool_call', tool, args };
}

async function getWeather(city: string): Promise<string> {
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    const data = await res.json() as any;
    const current = data.current_condition[0];
    const area = data.nearest_area[0];
    return JSON.stringify({
      city: area.areaName[0].value,
      country: area.country[0].value,
      temperature: current.temp_C + '°C',
      feels_like: current.FeelsLikeC + '°C',
      weather: current.weatherDesc[0].value,
      humidity: current.humidity + '%',
      wind_speed: current.windspeedKmph + ' km/h',
      wind_dir: current.winddir16Point,
      visibility: current.visibility + ' km',
      pressure: current.pressure + ' hPa',
      uv_index: current.uvIndex,
    });
  } catch (e) {
    return `查询天气失败: ${(e as Error).message}`;
  }
}

async function searchAttraction(city: string, weather: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: aihubmix('coding-glm-5.1-free'),
      prompt: `你是一个旅游推荐专家。请根据以下信息推荐适合的旅游景点：

城市：${city}
当前天气：${weather}

请推荐3-5个适合当前天气游览的景点，每个景点包括：
1. 景点名称
2. 简要描述
3. 推荐理由（结合当前天气）
4. 游览建议和注意事项

请用中文详细回答。`,
    });
    return text;
  } catch (e) {
    return `搜索景点失败: ${(e as Error).message}`;
  }
}

async function executeTool(
  toolName: string,
  args: Record<string, string>
): Promise<string> {
  switch (toolName) {
    case 'get_weather':
      return getWeather(args.city || 'Beijing');
    case 'search_attraction':
      return searchAttraction(args.city || 'Beijing', args.weather || '未知');
    default:
      return `未知工具: ${toolName}`;
  }
}

app.post('/api/chat', async (c) => {
  const { message } = await c.req.json<{ message: string }>();

  return streamSSE(c, async (stream) => {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message },
    ];

    const maxSteps = 5;

    for (let step = 1; step <= maxSteps; step++) {
      let llmResponse: string;
      try {
        const result = await generateText({
          model: aihubmix('coding-glm-5.1-free'),
          messages,
        });
        llmResponse = result.text;
      } catch (e) {
        const errEvent: StepEvent = {
          type: 'error',
          step,
          content: `LLM 调用失败: ${(e as Error).message}`,
        };
        await stream.writeSSE({ data: JSON.stringify(errEvent) });
        return;
      }

      const { thought, action: actionStr } = parseResponse(llmResponse);

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'thought',
          step,
          content: thought,
        } as StepEvent),
      });

      if (!actionStr) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            step,
            content: '无法解析 Agent 的回复',
          } as StepEvent),
        });
        return;
      }

      const parsed = parseAction(actionStr);

      if (parsed.type === 'finish') {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'final_answer',
            step,
            content: parsed.answer,
          } as StepEvent),
        });
        return;
      }

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'tool_call',
          step,
          content: actionStr,
          tool: parsed.tool,
          args: parsed.args,
        } as StepEvent),
      });

      const observation = await executeTool(parsed.tool, parsed.args);

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'observation',
          step,
          content: observation,
        } as StepEvent),
      });

      messages.push({ role: 'assistant', content: llmResponse });
      messages.push({
        role: 'user',
        content: `Observation: ${observation}`,
      });
    }

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'error',
        step: maxSteps,
        content: '已达到最大步骤数，请重试或简化您的问题。',
      } as StepEvent),
    });
  });
});

const port = 3000;
console.log(`Server running on http://localhost:${port}`);
serve(app)
