import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type LLMProvider = 'openai' | 'anthropic' | 'nvidia';

function getProvider(): LLMProvider {
  const raw = (process.env.LLM_PROVIDER || 'nvidia').toLowerCase().trim();
  if (raw === 'anthropic') return 'anthropic';
  if (raw === 'nvidia') return 'nvidia';
  return 'openai';
}

export function getChatModel(): BaseChatModel {
  const provider = getProvider();
  const timeout = parseInt(process.env.LLM_TIMEOUT || '180000', 10); // Default 2 minutes

  switch (provider) {
    case 'anthropic': {
      const { ChatAnthropic } = require('@langchain/anthropic');
      return new ChatAnthropic({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 800,
      });
    }
    case 'nvidia': {
      const { ChatOpenAI } = require('@langchain/openai');
      const nvidiaApiKey = process.env.NVIDIA_API_KEY || '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';
      
      if (!nvidiaApiKey || nvidiaApiKey === '') {
        throw new Error('NVIDIA_API_KEY is not set in environment variables');
      }
      
      return new ChatOpenAI({
        apiKey: nvidiaApiKey,  // Use 'apiKey' instead of 'openAIApiKey'
        configuration: {
          baseURL: 'https://integrate.api.nvidia.com/v1',
        },
        model: process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b',
        temperature: 0.7,
        maxTokens: 800,
      });
    }
    case 'openai':
    default: {
      // To switch to OpenAI, set:
      //   LLM_PROVIDER=openai
      //   OPENAI_API_KEY=sk-...
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ChatOpenAI } = require('@langchain/openai');
      return new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 800,
      });
    }
  }
}

export { getProvider };
