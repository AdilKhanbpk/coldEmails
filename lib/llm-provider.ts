// ---------------------------------------------------------------------------
// LLM Provider Abstraction
//
// This is the SINGLE place that decides which LLM backend the app uses.
// Switch providers by setting the LLM_PROVIDER environment variable:
//
//   LLM_PROVIDER=openai       -> uses @langchain/openai  (ChatOpenAI)
//   LLM_PROVIDER=anthropic    -> uses @langchain/anthropic (ChatAnthropic)
//
// Required env vars per provider:
//   openai:    OPENAI_API_KEY
//   anthropic: ANTHROPIC_API_KEY
//
// No other file in the app imports @langchain/openai or @langchain/anthropic
// directly — they all go through getChatModel() below. To add a new provider,
// install the corresponding @langchain/<provider> package and add a case here.
// ---------------------------------------------------------------------------

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type LLMProvider = 'openai' | 'anthropic' | 'nvidia';

function getProvider(): LLMProvider {
  const raw = (process.env.LLM_PROVIDER || 'openai').toLowerCase().trim();
  if (raw === 'anthropic') return 'anthropic';
  if (raw === 'nvidia') return 'nvidia';
  return 'openai';
}

export function getChatModel(): BaseChatModel {
  const provider = getProvider();

  switch (provider) {
    case 'anthropic': {
      // To switch to Anthropic, install @langchain/anthropic and set:
      //   LLM_PROVIDER=anthropic
      //   ANTHROPIC_API_KEY=sk-ant-...
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ChatAnthropic } = require('@langchain/anthropic');
      return new ChatAnthropic({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 800,
      });
    }
    case 'nvidia': {
      // To switch to Nvidia NIM via OpenAI-compatible endpoint, set:
      //   LLM_PROVIDER=nvidia
      //   NVIDIA_API_KEY=nvapi-...
      //   NVIDIA_MODEL=meta/llama-3.1-8b-instruct (optional)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ChatOpenAI } = require('@langchain/openai');
      return new ChatOpenAI({
        openAIApiKey: process.env.NVIDIA_API_KEY,
        configuration: {
          baseURL: 'https://integrate.api.nvidia.com/v1',
        },
        model: process.env.NVIDIA_MODEL || 'meta/llama-3.1-8b-instruct',
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
