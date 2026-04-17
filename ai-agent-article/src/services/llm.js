import 'dotenv/config';
import OpenAI from 'openai';

export const TEXT_MODEL = process.env.TEXT_MODEL || 'ZhipuAI/GLM-5.1';

let clientInstance;

export function getClient() {
  if (clientInstance) return clientInstance;

  if (!process.env.MODELSCOPE_API_KEY) {
    throw new Error('缺少 MODELSCOPE_API_KEY，请先在 .env 中完成配置');
  }

  clientInstance = new OpenAI({
    baseURL: 'https://api-inference.modelscope.cn/v1',
    apiKey: process.env.MODELSCOPE_API_KEY
  });

  return clientInstance;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
