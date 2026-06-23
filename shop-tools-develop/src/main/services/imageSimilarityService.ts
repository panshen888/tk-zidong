import fs from 'node:fs/promises';
import path from 'node:path';
import type { AiUsageStats } from '../../shared/types';
import type { AsyncLimiter } from './concurrency';

export type ImageSimilarityInput = {
  sourceImagePath: string;
  targetImageUrlOrPath: string;
};

export type ImageSimilarityBatchInput = {
  sourceImagePath: string;
  targetImageUrlOrPaths: string[];
};

export type ImageSimilarityResult = {
  score: number;
  isSameProduct: boolean;
  reason: string;
  provider: 'mock' | 'openai_compatible';
};

export type ImageSimilarityService = {
  compare: (input: ImageSimilarityInput) => Promise<ImageSimilarityResult>;
  compareBatch: (input: ImageSimilarityBatchInput) => Promise<ImageSimilarityResult[]>;
};

export type OpenAICompatibleSimilarityOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  threshold: number;
  limiter?: AsyncLimiter;
  usage?: AiUsageStats;
};

const batchSimilarityTimeoutMs = 60000;
const singleSimilarityTimeoutMs = 60000;
const batchSimilarityRetryCount = 0;

export function normalizeOpenAICompatibleBaseUrl(baseUrl: string) {
  return baseUrl
    .trim()
    .replace(/\\/g, '/')
    .replace(/([^:]\/)\/+/g, '$1')
    .replace(/\/+$/, '');
}

export function buildOpenAICompatibleChatCompletionsUrl(baseUrl: string) {
  return `${normalizeOpenAICompatibleBaseUrl(baseUrl)}/chat/completions`;
}

export function createImageSimilarityService(options: OpenAICompatibleSimilarityOptions): ImageSimilarityService {
  if (!options.baseUrl || !options.apiKey || !options.model) {
    if (options.usage) {
      options.usage.provider = 'mock';
    }
    return createMockImageSimilarityService(options.threshold);
  }

  if (options.usage) {
    options.usage.provider = 'openai_compatible';
  }
  return createOpenAICompatibleImageSimilarityService(options);
}

export function createMockImageSimilarityService(threshold = 0.86): ImageSimilarityService {
  async function compare(input: ImageSimilarityInput): Promise<ImageSimilarityResult> {
    const stableScore =
      input.targetImageUrlOrPath.includes('candidate-rank-1') ||
      input.targetImageUrlOrPath.includes('mock-rank-1') ||
      input.targetImageUrlOrPath.includes('mock-rank-2') ||
      input.targetImageUrlOrPath.includes('mock-rank-3') ||
      input.targetImageUrlOrPath.includes('候选 1')
        ? 0.92
        : 0.82;
    return {
      score: stableScore,
      isSameProduct: stableScore >= threshold,
      reason: 'mock 相似度结果，待中转站视觉模型替换',
      provider: 'mock',
    };
  }

  return {
    compare,
    async compareBatch(input) {
      return await Promise.all(
        input.targetImageUrlOrPaths.map((targetImageUrlOrPath) =>
          compare({
            sourceImagePath: input.sourceImagePath,
            targetImageUrlOrPath,
          }),
        ),
      );
    },
  };
}

function createOpenAICompatibleImageSimilarityService(
  options: OpenAICompatibleSimilarityOptions,
): ImageSimilarityService {
  return {
    async compare(input) {
      if (options.limiter) {
        return await options.limiter.run(() => compareWithOpenAICompatible(input, options));
      }

      return await compareWithOpenAICompatible(input, options);
    },
    async compareBatch(input) {
      if (input.targetImageUrlOrPaths.length === 0) {
        return [];
      }

      const operation = async () => {
        try {
          return await retryAsync(
            () => compareBatchWithOpenAICompatible(input, options),
            batchSimilarityRetryCount,
            1500,
          );
        } catch (error) {
          throw new Error(`AI 批量相似度识别失败：${error instanceof Error ? error.message : String(error)}`);
        }
      };

      return options.limiter ? await options.limiter.run(operation) : await operation();
    },
  };
}

async function compareWithOpenAICompatible(
  input: ImageSimilarityInput,
  options: OpenAICompatibleSimilarityOptions,
): Promise<ImageSimilarityResult> {
  const sourceImage = await toImageUrl(input.sourceImagePath);
  const targetImage = await toImageUrl(input.targetImageUrlOrPath);
  const response = await fetchWithTimeout(
    buildOpenAICompatibleChatCompletionsUrl(options.baseUrl),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是电商商品图片相似度识别器。只判断两张图是否是同一件商品或同一 SKU。输出 JSON。',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  '比较两张图片是否为同一件商品/SKU。返回 JSON：{"score":0到1数字,"isSameProduct":布尔值,"reason":"简短中文原因"}。不要输出额外文本。',
              },
              { type: 'image_url', image_url: { url: sourceImage } },
              { type: 'image_url', image_url: { url: targetImage } },
            ],
          },
        ],
      }),
    },
    singleSimilarityTimeoutMs,
  );

  if (!response.ok) {
    throw await createAiHttpError('AI 相似度接口调用失败', response);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: AiUsageResponse;
  };
  addUsage(options.usage, {
    kind: 'singleImage',
    imageCount: 2,
    usage: payload.usage,
  });
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI 相似度接口未返回内容');
  }

  const parsed = JSON.parse(content) as Partial<ImageSimilarityResult>;
  const score = Number(parsed.score);
  if (!Number.isFinite(score)) {
    throw new Error('AI 相似度接口返回的 score 无效');
  }

  return {
    score,
    isSameProduct: typeof parsed.isSameProduct === 'boolean' ? parsed.isSameProduct : score >= options.threshold,
    reason: parsed.reason || 'AI 相似度接口未返回原因',
    provider: 'openai_compatible',
  };
}

async function retryAsync<T>(operation: () => Promise<T>, retryCount: number, baseDelayMs: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retryCount) {
        break;
      }

      await delay(baseDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function compareBatchWithOpenAICompatible(
  input: ImageSimilarityBatchInput,
  options: OpenAICompatibleSimilarityOptions,
): Promise<ImageSimilarityResult[]> {
  const sourceImage = await toImageUrl(input.sourceImagePath);
  const targetImages = await Promise.all(input.targetImageUrlOrPaths.map((targetImage) => toImageUrl(targetImage)));
  const response = await fetchWithTimeout(
    buildOpenAICompatibleChatCompletionsUrl(options.baseUrl),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是电商商品图片相似度识别器。只判断候选封面是否与原图为同一件商品或同一 SKU。必须输出严格 JSON，不要输出额外文本。',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  `下面第 1 张图片是原商品图，后面 ${targetImages.length} 张图片是 1688 搜索结果候选封面，顺序编号为 1 到 ${targetImages.length}。`,
                  `请逐张比较每个候选封面与原商品图是否为同一件商品或同一 SKU。`,
                  `只返回 JSON：{"scores":[{"index":1,"score":0到1数字,"isSameProduct":布尔值,"reason":"不超过20字中文原因"}]}`,
                  `scores 数组长度必须等于 ${targetImages.length}，index 必须从 1 到 ${targetImages.length} 且顺序一致。`,
                  `score 越高表示越像；只比较商品主体，不要被背景、手、包装、角度、光线影响。`,
                ].join('\n'),
              },
              { type: 'image_url', image_url: { url: sourceImage } },
              ...targetImages.map((targetImage) => ({ type: 'image_url' as const, image_url: { url: targetImage } })),
            ],
          },
        ],
      }),
    },
    batchSimilarityTimeoutMs,
  );

  if (!response.ok) {
    throw await createAiHttpError('AI 批量相似度接口调用失败', response);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: AiUsageResponse;
  };
  addUsage(options.usage, {
    kind: 'batchImage',
    imageCount: targetImages.length + 1,
    usage: payload.usage,
  });
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI 批量相似度接口未返回内容');
  }

  const parsed = JSON.parse(content) as {
    scores?: Array<{
      index?: number;
      score?: number;
      isSameProduct?: boolean;
      reason?: string;
    }>;
  };
  if (!Array.isArray(parsed.scores)) {
    throw new Error('AI 批量相似度接口返回的 scores 不是数组');
  }

  return input.targetImageUrlOrPaths.map((_, index) => {
    const result = parsed.scores?.find((entry) => Number(entry.index) === index + 1) ?? parsed.scores?.[index];
    const score = Number(result?.score);
    if (!Number.isFinite(score)) {
      throw new Error(`AI 批量相似度接口返回的第 ${index + 1} 个 score 无效`);
    }

    return {
      score,
      isSameProduct: typeof result?.isSameProduct === 'boolean' ? result.isSameProduct : score >= options.threshold,
      reason: result?.reason || 'AI 批量相似度接口未返回原因',
      provider: 'openai_compatible' as const,
    };
  });
}

async function toImageUrl(imageUrlOrPath: string) {
  if (imageUrlOrPath.startsWith('http://') || imageUrlOrPath.startsWith('https://') || imageUrlOrPath.startsWith('data:')) {
    return imageUrlOrPath;
  }

  if (imageUrlOrPath.startsWith('local://')) {
    throw new Error(`local:// 图片无法直接调用 AI 相似度接口：${imageUrlOrPath}`);
  }

  const bytes = await fs.readFile(imageUrlOrPath);
  const extension = path.extname(imageUrlOrPath).slice(1).toLowerCase();
  const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`AI 相似度接口请求超时：${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function createAiHttpError(prefix: string, response: Response) {
  const body = await readResponseBodySnippet(response);
  const requestTrace = formatResponseTraceHeaders(response);
  const bodyText = body ? `；响应体：${body}` : '；响应体为空';
  return new Error(`${prefix}：${response.status} ${response.statusText}${requestTrace}${bodyText}`);
}

function formatResponseTraceHeaders(response: Response) {
  const traceHeaders = [
    'request-id',
    'x-request-id',
    'x-openai-request-id',
    'cf-ray',
    'retry-after',
  ]
    .map((header) => {
      const value = response.headers.get(header);
      return value ? `${header}=${value}` : '';
    })
    .filter(Boolean);

  return traceHeaders.length > 0 ? `；响应头：${traceHeaders.join('，')}` : '';
}

async function readResponseBodySnippet(response: Response) {
  const text = await response.text().catch(() => '');
  return normalizeErrorBody(text).slice(0, 2000);
}

function normalizeErrorBody(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

type AiUsageResponse = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export function createAiUsageStats(model: string): AiUsageStats {
  return {
    provider: 'mock',
    model,
    singleImageCalls: 0,
    batchImageCalls: 0,
    attributeCalls: 0,
    imageCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
}

export function recordAttributeAiUsage(stats: AiUsageStats | undefined, usage?: AiUsageResponse) {
  if (!stats) {
    return;
  }

  stats.attributeCalls += 1;
  addTokenUsage(stats, usage);
}

function addUsage(
  stats: AiUsageStats | undefined,
  input: { kind: 'singleImage' | 'batchImage'; imageCount: number; usage?: AiUsageResponse },
) {
  if (!stats) {
    return;
  }

  if (input.kind === 'singleImage') {
    stats.singleImageCalls += 1;
  } else {
    stats.batchImageCalls += 1;
  }
  stats.imageCount += input.imageCount;
  addTokenUsage(stats, input.usage);
}

function addTokenUsage(stats: AiUsageStats, usage?: AiUsageResponse) {
  stats.promptTokens += Number(usage?.prompt_tokens) || 0;
  stats.completionTokens += Number(usage?.completion_tokens) || 0;
  stats.totalTokens += Number(usage?.total_tokens) || 0;
}
