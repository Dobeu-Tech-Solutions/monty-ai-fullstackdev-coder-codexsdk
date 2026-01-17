/**
 * Test Fixtures - Mock API Responses
 * Provides mock API response objects for testing provider interactions.
 */

import type { ProviderName } from '../../../src/config/provider-config';

/**
 * Mock successful response structure
 */
export interface MockResponse<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<T>;
  text: () => Promise<string>;
  headers: Headers;
}

/**
 * Create a mock fetch response
 */
export function createMockResponse<T>(
  data: T,
  status: number = 200,
  ok: boolean = true
): MockResponse<T> {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers({
      'content-type': 'application/json',
    }),
  };
}

/**
 * Mock Anthropic API Responses
 */
export const MOCK_ANTHROPIC_RESPONSES = {
  messages: {
    success: createMockResponse({
      id: 'msg_01XFDUDYJgAACzvnptvVoYEL',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Hello! How can I help you today?',
        },
      ],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 25,
      },
    }),

    error401: createMockResponse(
      {
        type: 'error',
        error: {
          type: 'authentication_error',
          message: 'Invalid API Key',
        },
      },
      401,
      false
    ),

    error429: createMockResponse(
      {
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded',
        },
      },
      429,
      false
    ),

    error500: createMockResponse(
      {
        type: 'error',
        error: {
          type: 'server_error',
          message: 'Internal server error',
        },
      },
      500,
      false
    ),
  },

  validation: {
    validKey: createMockResponse({ id: 'msg_test' }, 200, true),
    invalidKey: createMockResponse(
      { error: { type: 'authentication_error' } },
      401,
      false
    ),
  },
};

/**
 * Mock OpenAI API Responses
 */
export const MOCK_OPENAI_RESPONSES = {
  models: {
    success: createMockResponse({
      object: 'list',
      data: [
        { id: 'gpt-4-turbo', object: 'model', owned_by: 'openai' },
        { id: 'gpt-4o', object: 'model', owned_by: 'openai' },
        { id: 'gpt-4o-mini', object: 'model', owned_by: 'openai' },
      ],
    }),

    error401: createMockResponse(
      { error: { message: 'Invalid API key', type: 'invalid_api_key' } },
      401,
      false
    ),
  },

  chat: {
    success: createMockResponse({
      id: 'chatcmpl-123abc',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4-turbo',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello! How can I assist you?',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    }),
  },

  threads: {
    create: createMockResponse({
      id: 'thread_abc123',
      object: 'thread',
      created_at: Date.now(),
      metadata: {},
    }),

    run: createMockResponse({
      id: 'run_xyz789',
      object: 'thread.run',
      status: 'completed',
      thread_id: 'thread_abc123',
    }),
  },
};

/**
 * Mock Google API Responses
 */
export const MOCK_GOOGLE_RESPONSES = {
  models: {
    success: createMockResponse({
      models: [
        { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
        { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
      ],
    }),

    error401: createMockResponse(
      { error: { code: 401, message: 'API key not valid' } },
      401,
      false
    ),
  },

  generate: {
    success: createMockResponse({
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello! How may I help you?' }],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 5,
        candidatesTokenCount: 10,
        totalTokenCount: 15,
      },
    }),
  },

  quota: {
    success: createMockResponse({
      quotas: [
        { metric: 'requests_per_minute', limit: 60, usage: 10 },
        { metric: 'tokens_per_minute', limit: 32000, usage: 5000 },
      ],
    }),
  },
};

/**
 * Mock Cursor API Responses
 */
export const MOCK_CURSOR_RESPONSES = {
  health: {
    success: createMockResponse({ status: 'healthy' }, 200, true),
    error: createMockResponse({ status: 'unhealthy' }, 503, false),
  },

  agents: {
    submit: createMockResponse({
      id: 'task_abc123',
      status: 'pending',
    }),

    pending: createMockResponse({
      id: 'task_abc123',
      status: 'running',
    }),

    completed: createMockResponse({
      id: 'task_abc123',
      status: 'completed',
      result: {
        content: 'Task completed successfully',
        files_modified: ['src/index.ts'],
      },
    }),

    failed: createMockResponse({
      id: 'task_abc123',
      status: 'failed',
      error: 'Task execution failed',
    }),
  },
};

/**
 * Mock streaming response chunks
 */
export const MOCK_STREAMING_CHUNKS = {
  anthropic: [
    { type: 'message_start', message: { id: 'msg_1', model: 'claude-sonnet-4-20250514' } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world!' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    { type: 'message_stop' },
  ],

  openai: [
    { choices: [{ delta: { role: 'assistant' }, index: 0 }] },
    { choices: [{ delta: { content: 'Hello' }, index: 0 }] },
    { choices: [{ delta: { content: ' world!' }, index: 0 }] },
    { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] },
  ],
};

/**
 * Get mock response for provider validation
 */
export function getMockValidationResponse(
  provider: ProviderName,
  isValid: boolean
): MockResponse {
  switch (provider) {
    case 'anthropic':
      return isValid
        ? MOCK_ANTHROPIC_RESPONSES.validation.validKey
        : MOCK_ANTHROPIC_RESPONSES.validation.invalidKey;

    case 'openai':
      return isValid
        ? MOCK_OPENAI_RESPONSES.models.success
        : MOCK_OPENAI_RESPONSES.models.error401;

    case 'google':
      return isValid
        ? MOCK_GOOGLE_RESPONSES.models.success
        : MOCK_GOOGLE_RESPONSES.models.error401;

    case 'cursor':
      return isValid
        ? MOCK_CURSOR_RESPONSES.health.success
        : MOCK_CURSOR_RESPONSES.health.error;

    default:
      return createMockResponse({ error: 'Unknown provider' }, 400, false);
  }
}

/**
 * Create mock error response
 */
export function createMockErrorResponse(
  message: string,
  status: number = 500,
  code?: string
): MockResponse {
  return createMockResponse(
    {
      error: {
        message,
        code: code || 'error',
        status,
      },
    },
    status,
    false
  );
}

/**
 * Create mock rate limit response
 */
export function createMockRateLimitResponse(retryAfterSeconds: number = 60): MockResponse {
  const response = createMockResponse(
    {
      error: {
        message: 'Rate limit exceeded',
        type: 'rate_limit_error',
      },
    },
    429,
    false
  );

  response.headers.set('retry-after', String(retryAfterSeconds));
  return response;
}

/**
 * Create mock timeout response
 */
export function createMockTimeoutResponse(): MockResponse {
  return createMockResponse(
    {
      error: {
        message: 'Request timeout',
        type: 'timeout_error',
      },
    },
    408,
    false
  );
}

export default {
  MOCK_ANTHROPIC_RESPONSES,
  MOCK_OPENAI_RESPONSES,
  MOCK_GOOGLE_RESPONSES,
  MOCK_CURSOR_RESPONSES,
  MOCK_STREAMING_CHUNKS,
  createMockResponse,
  getMockValidationResponse,
  createMockErrorResponse,
  createMockRateLimitResponse,
  createMockTimeoutResponse,
};
