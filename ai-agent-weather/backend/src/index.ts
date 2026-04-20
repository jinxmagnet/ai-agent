import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { createAihubmix } from '@aihubmix/ai-sdk-provider';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const aihubmix = createAihubmix({
  apiKey: process.env.AIHUBMIX_API_KEY,
});

const app = new Hono();
app.use('/api/*', cors());

const MAX_OBSERVATION_LENGTH = 2000;
const TOOL_TIMEOUT_MS = 15000;
const MAX_STEPS = 8;

function truncate(text: string): string {
  if (text.length <= MAX_OBSERVATION_LENGTH) return text;
  return text.slice(0, MAX_OBSERVATION_LENGTH) + '\n...(内容已截断)';
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `你是一个智能旅行助手，能够根据用户需求分步骤完成旅行规划任务。

你可以使用工具查询天气和推荐景点。对于复杂任务（如多城市比较、多日规划），请先分解任务再逐步执行。
如果工具返回错误，请根据错误信息调整策略（如更换城市名拼写）后重试。

回答时结合工具返回的原始数据给出具体、实用的建议。`;

interface StepEvent {
  type: 'thought' | 'tool_call' | 'observation' | 'final_answer' | 'error';
  step: number;
  content: string;
  tool?: string;
  args?: Record<string, string>;
}

type AttractionType = 'indoor' | 'outdoor' | 'both';

interface Attraction {
  name: string;
  type: AttractionType;
  description: string;
}

const ATTRACTIONS_DB: Record<string, Attraction[]> = {
  Beijing: [
    { name: '故宫博物院', type: 'outdoor', description: '明清皇家宫殿，世界最大古建筑群' },
    { name: '中国国家博物馆', type: 'indoor', description: '中国最大的综合性博物馆' },
    { name: '颐和园', type: 'outdoor', description: '清代皇家园林，世界文化遗产' },
    { name: '798艺术区', type: 'indoor', description: '当代艺术与创意产业聚集区' },
    { name: '天坛公园', type: 'outdoor', description: '明清皇帝祭天场所，古建筑精粹' },
    { name: '中国科学技术馆', type: 'indoor', description: '国家级综合性科技博物馆' },
    { name: '长城（八达岭）', type: 'outdoor', description: '世界文化遗产，万里长城代表段' },
    { name: '国家大剧院', type: 'indoor', description: '现代艺术表演场馆' },
    { name: '南锣鼓巷', type: 'outdoor', description: '历史文化街区，特色小店与小吃' },
    { name: '北京海洋馆', type: 'indoor', description: '大型内陆海洋馆' },
  ],
  Shanghai: [
    { name: '外滩', type: 'outdoor', description: '上海标志性滨江景观带' },
    { name: '上海博物馆', type: 'indoor', description: '中国古代艺术珍藏馆' },
    { name: '豫园', type: 'outdoor', description: '明代古典园林，城隍庙相邻' },
    { name: '上海科技馆', type: 'indoor', description: '大型科普教育场馆' },
    { name: '东方明珠广播电视塔', type: 'indoor', description: '上海地标，可登塔俯瞰全城' },
    { name: '田子坊', type: 'indoor', description: '文艺创意街区，画廊与咖啡馆' },
    { name: '迪士尼乐园', type: 'both', description: '大型主题乐园，含室内外项目' },
    { name: '静安寺', type: 'indoor', description: '千年古刹，闹市中的佛教圣地' },
  ],
  Guangzhou: [
    { name: '广州塔', type: 'indoor', description: '广州地标，可登塔观景' },
    { name: '陈家祠', type: 'indoor', description: '岭南建筑艺术代表' },
    { name: '白云山', type: 'outdoor', description: '城市绿肺，登高望远' },
    { name: '长隆野生动物世界', type: 'both', description: '大型野生动物主题公园' },
    { name: '广东省博物馆', type: 'indoor', description: '省级综合性博物馆' },
    { name: '沙面岛', type: 'outdoor', description: '欧式建筑群，摄影胜地' },
  ],
  Chengdu: [
    { name: '大熊猫繁育研究基地', type: 'outdoor', description: '近距离观赏国宝大熊猫' },
    { name: '武侯祠', type: 'outdoor', description: '三国文化圣地' },
    { name: '锦里古街', type: 'outdoor', description: '仿古商业街，体验成都文化' },
    { name: '四川博物院', type: 'indoor', description: '西南地区最大综合性博物馆' },
    { name: '宽窄巷子', type: 'outdoor', description: '清朝古街区，美食与文化体验' },
    { name: '成都博物馆', type: 'indoor', description: '展示成都历史文化' },
  ],
  Hangzhou: [
    { name: '西湖', type: 'outdoor', description: '世界文化遗产，人间天堂' },
    { name: '灵隐寺', type: 'outdoor', description: '江南著名古刹' },
    { name: '中国丝绸博物馆', type: 'indoor', description: '世界最大丝绸博物馆' },
    { name: '宋城', type: 'both', description: '大型宋代主题公园' },
    { name: '西溪湿地', type: 'outdoor', description: '城市湿地公园' },
    { name: '浙江省博物馆', type: 'indoor', description: '省级综合博物馆' },
  ],
  XiAn: [
    { name: '秦始皇兵马俑博物馆', type: 'indoor', description: '世界第八大奇迹' },
    { name: '大雁塔', type: 'outdoor', description: '唐代佛教建筑，西安地标' },
    { name: '古城墙', type: 'outdoor', description: '中国现存最完整的古城墙' },
    { name: '陕西历史博物馆', type: 'indoor', description: '中国第一座大型现代化博物馆' },
    { name: '回民街', type: 'outdoor', description: '特色美食文化街区' },
    { name: '华清宫', type: 'outdoor', description: '唐代皇家温泉行宫' },
  ],
  Tokyo: [
    { name: '浅草寺', type: 'outdoor', description: '东京最古老的寺庙' },
    { name: '东京国立博物馆', type: 'indoor', description: '日本最大的博物馆' },
    { name: '明治神宫', type: 'outdoor', description: '供奉明治天皇的神社' },
    { name: '东京塔', type: 'indoor', description: '东京地标塔，观景台' },
    { name: '秋叶原', type: 'indoor', description: '电子产品与动漫文化圣地' },
    { name: '上野公园', type: 'outdoor', description: '樱花名所，博物馆聚集区' },
  ],
  Seoul: [
    { name: '景福宫', type: 'outdoor', description: '朝鲜王朝正宫' },
    { name: '国立中央博物馆', type: 'indoor', description: '韩国最大博物馆' },
    { name: '北村韩屋村', type: 'outdoor', description: '传统韩屋建筑群' },
    { name: '明洞', type: 'indoor', description: '购物与美食天堂' },
    { name: '南山首尔塔', type: 'indoor', description: '首尔地标，城市全景' },
  ],
  NewYork: [
    { name: '中央公园', type: 'outdoor', description: '曼哈顿中心的大型公园' },
    { name: '大都会艺术博物馆', type: 'indoor', description: '世界四大博物馆之一' },
    { name: '自由女神像', type: 'outdoor', description: '美国标志性地标' },
    { name: '时代广场', type: 'outdoor', description: '世界十字路口' },
    { name: '现代艺术博物馆 (MoMA)', type: 'indoor', description: '世界顶级现代艺术馆' },
  ],
  London: [
    { name: '大英博物馆', type: 'indoor', description: '世界最大博物馆之一' },
    { name: '伦敦塔', type: 'outdoor', description: '千年历史的皇家城堡' },
    { name: '海德公园', type: 'outdoor', description: '伦敦最大的皇家公园' },
    { name: '国家美术馆', type: 'indoor', description: '收藏西欧绘画杰作' },
    { name: '伦敦眼', type: 'outdoor', description: '泰晤士河畔摩天轮' },
  ],
  Paris: [
    { name: '埃菲尔铁塔', type: 'outdoor', description: '巴黎标志性建筑' },
    { name: '卢浮宫', type: 'indoor', description: '世界最大艺术博物馆' },
    { name: '凯旋门', type: 'outdoor', description: '拿破仑时期纪念建筑' },
    { name: '奥赛博物馆', type: 'indoor', description: '印象派艺术收藏' },
    { name: '塞纳河游船', type: 'outdoor', description: '水上观赏巴黎两岸风光' },
  ],
};

function getAttractionsForWeather(city: string, weatherDesc: string): string {
  const attractions = ATTRACTIONS_DB[city];
  if (!attractions) {
    return `${city} 暂无景点数据。支持的城市：${Object.keys(ATTRACTIONS_DB).join(', ')}`;
  }

  const badWeatherPattern = /rain|storm|thunder|snow|sleet|hail|fog|drizzle/i;
  const isBadWeather = badWeatherPattern.test(weatherDesc);

  const filtered = isBadWeather
    ? attractions.filter(a => a.type === 'indoor' || a.type === 'both')
    : attractions;

  return JSON.stringify(
    filtered.map(a => ({
      name: a.name,
      type: a.type === 'indoor' ? '室内' : a.type === 'outdoor' ? '室外' : '室内外',
      description: a.description,
      weatherNote: isBadWeather
        ? (a.type === 'indoor' ? '天气不佳时首选' : a.type === 'both' ? '含室内项目' : '室外景点，建议改日')
        : '适宜游览',
    })),
    null,
    2,
  );
}

const weatherTool = tool({
  description: '查询指定城市的实时天气信息，包括温度、体感温度、天气状况、湿度、风速等。city 参数请使用英文城市名。',
  parameters: z.object({
    city: z.string().min(1, '城市名不能为空').describe('城市英文名称，如 Beijing, Shanghai, Tokyo'),
  }),
  execute: async ({ city }) => {
    try {
      const res = await fetchWithTimeout(
        `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
        TOOL_TIMEOUT_MS,
      );
      if (!res.ok) {
        return `天气查询失败：HTTP ${res.status}，请检查城市名是否正确。`;
      }
      const data = (await res.json()) as any;
      const current = data.current_condition?.[0];
      const area = data.nearest_area?.[0];
      if (!current || !area) {
        return `无法解析 ${city} 的天气数据，请确认城市名是否正确。`;
      }
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
        uv_index: current.uvIndex,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return `天气查询超时（${TOOL_TIMEOUT_MS / 1000}秒），请稍后重试。`;
      }
      return `天气查询失败：${(e as Error).message}，请检查城市名或稍后重试。`;
    }
  },
});

const attractionTool = tool({
  description: '根据城市和天气状况查询适合游览的景点。恶劣天气时优先推荐室内景点。支持多个主要城市。',
  parameters: z.object({
    city: z.string().min(1, '城市名不能为空').describe('城市英文名称'),
    weather: z.string().min(1, '天气状况不能为空').describe('天气状况描述，如 Sunny, Rainy, Cloudy'),
  }),
  execute: async ({ city, weather }) => {
    return getAttractionsForWeather(city, weather);
  },
});

app.post('/api/chat', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const message = body?.message;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return c.json({ error: 'message 字段必填且为非空字符串' }, 400);
  }

  return streamSSE(c, async (stream) => {
    let stepNum = 0;

    try {
      const result = await generateText({
        model: aihubmix('coding-glm-5.1-free'),
        system: SYSTEM_PROMPT,
        prompt: message.trim(),
        tools: {
          get_weather: weatherTool,
          search_attraction: attractionTool,
        },
        maxSteps: MAX_STEPS,
        onStepFinish: async (step) => {
          const hasToolCalls = step.toolCalls && step.toolCalls.length > 0;
          if (!hasToolCalls) return;

          stepNum++;

          if (step.text) {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'thought',
                step: stepNum,
                content: step.text,
              } as StepEvent),
            });
          }

          for (const tc of step.toolCalls) {
            const argsRecord: Record<string, string> = {};
            if (tc.args && typeof tc.args === 'object') {
              for (const [k, v] of Object.entries(tc.args)) {
                argsRecord[k] = String(v);
              }
            }
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'tool_call',
                step: stepNum,
                content: `${tc.toolName}(${Object.entries(argsRecord).map(([k, v]) => `${k}="${v}"`).join(', ')})`,
                tool: tc.toolName,
                args: argsRecord,
              } as StepEvent),
            });
          }

          if (step.toolResults && step.toolResults.length > 0) {
            for (const tr of step.toolResults) {
              const content = typeof tr.result === 'string'
                ? tr.result
                : JSON.stringify(tr.result);
              await stream.writeSSE({
                data: JSON.stringify({
                  type: 'observation',
                  step: stepNum,
                  content: truncate(content),
                } as StepEvent),
              });
            }
          }
        },
      });

      if (result.text) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'final_answer',
            step: stepNum + 1,
            content: result.text,
          } as StepEvent),
        });
      } else {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            step: stepNum,
            content: 'Agent 未生成最终回复，请重试或简化问题。',
          } as StepEvent),
        });
      }
    } catch (e) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          step: stepNum,
          content: `Agent 执行失败: ${(e as Error).message}`,
        } as StepEvent),
      });
    }
  });
});

const port = 3000;
console.log(`Server running on http://localhost:${port}`);
serve(app);
