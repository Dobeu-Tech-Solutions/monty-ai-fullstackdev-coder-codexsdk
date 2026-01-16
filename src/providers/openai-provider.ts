/**
 * OpenAI Provider (Codex SDK)
 * Wrapper around OpenAI's Codex SDK for multi-provider orchestration.
 * Supports thread-based conversations and code execution.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import {
  BaseProvider,
  type AgentMessage,
  type QueryOptions,
  type ProviderCapabilities,
  type ModelInfo,
} from './base-provider.js';
import {
  type ProviderName,
  PROVIDER_CONFIGS,
  type StandardTool,
} from '../config/provider-config.js';

/**
 * Codex SDK types (flexible to handle optional dependency)
 * Using 'any' types intentionally for optional SDK compatibility
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface CodexResult {
  content: string;
  tool_calls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  finish_reason?: string;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * OpenAI Provider Implementation
 * Wraps the Codex SDK for use in multi-provider orchestration
 */
export class OpenAIProvider extends BaseProvider {
  readonly name: ProviderName = 'openai';
  readonly displayName = 'Codex (OpenAI)';
  readonly packageName = '@openai/codex-sdk';

  private config = PROVIDER_CONFIGS.openai;
  private apiKey: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private codexClient: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentThread: any = null;
  private currentThreadId: string | null = null;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? null;
    this.status.authenticated = !!this.apiKey;
    this.status.available = false; // Will be set after SDK initialization
  }

  /**
   * Initialize the Codex SDK client
   */
  private async initializeClient(): Promise<boolean> {
    if (this.codexClient) return true;

    try {
      // Dynamic import of Codex SDK (optional dependency)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let CodexModule: any;
      try {
        CodexModule = await import('@openai/codex-sdk' as string);
      } catch {
        console.error('Codex SDK not found. Install with: npm install @openai/codex-sdk');
        this.status.available = false;
        return false;
      }

      const Codex = CodexModule.default || CodexModule.Codex;

      if (!Codex) {
        console.error('Codex SDK not found. Install with: npm install @openai/codex-sdk');
        return false;
      }

      this.codexClient = new Codex({
        apiKey: this.apiKey,
      });

      this.status.available = true;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Could not initialize Codex SDK: ${message}`);
      console.warn('Install with: npm install @openai/codex-sdk');
      this.status.available = false;
      return false;
    }
  }

  /**
   * Execute a query using the Codex SDK
   */
  async *query(
    prompt: string,
    options: QueryOptions
  ): AsyncGenerator<AgentMessage, void, unknown> {
    const startTime = Date.now();

    try {
      // Initialize client if needed
      if (!await this.initializeClient()) {
        yield {
          type: 'error',
          content: [{
            type: 'text',
            text: 'Codex SDK not available. Install with: npm install @openai/codex-sdk',
          }],
          metadata: {
            provider: this.name,
            latency_ms: Date.now() - startTime,
          },
        };
        return;
      }

      // Start or resume thread
      if (!this.currentThread) {
        this.currentThread = this.codexClient!.startThread();
        this.currentThreadId = this.currentThread.id;
      }

      // Execute query
      const result = await this.currentThread.run(prompt);

      // Normalize and yield result
      const message = this.normalizeMessage(result);
      message.metadata = {
        ...message.metadata,
        provider: this.name,
        thread_id: this.currentThreadId ?? undefined,
        latency_ms: Date.now() - startTime,
      };

      yield message;

      // Yield final result message
      yield {
        type: 'result',
        subtype: 'success',
        content: [],
        metadata: {
          provider: this.name,
          thread_id: this.currentThreadId ?? undefined,
          latency_ms: Date.now() - startTime,
        },
      };

      this.updateStatus(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateStatus(false, errorMessage);

      yield {
        type: 'error',
        content: [{
          type: 'text',
          text: `OpenAI provider error: ${errorMessage}`,
        }],
        metadata: {
          provider: this.name,
          latency_ms: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Validate OpenAI API credentials
   */
  async validateCredentials(): Promise<boolean> {
    const key = this.apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      this.status.authenticated = false;
      return false;
    }

    try {
      // Make a minimal API request to validate the key
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
        },
      });

      const isValid = response.status === 200;
      this.status.authenticated = isValid;
      return isValid;
    } catch (error) {
      console.warn('Could not validate OpenAI key online');
      return true;
    }
  }

  /**
   * List available OpenAI models
   */
  async listModels(): Promise<ModelInfo[]> {
    return this.config.models.map(model => ({
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      costPerMToken: model.costPerMToken,
      capabilities: model.capabilities,
    }));
  }

  /**
   * Get OpenAI provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return { ...this.config.capabilities };
  }

  /**
   * Get list of supported standard tools
   */
  getSupportedTools(): string[] {
    return Object.entries(this.config.toolMapping)
      .filter(([_, mapped]) => mapped !== null)
      .map(([standard]) => standard);
  }

  /**
   * Map standard tool name to OpenAI tool name
   */
  mapToolName(standardTool: string): string | null {
    const mapped = this.config.toolMapping[standardTool as StandardTool];
    return mapped ?? null;
  }

  /**
   * Resume a previous thread
   */
  async resumeThread(threadId: string): Promise<boolean> {
    if (!await this.initializeClient()) {
      return false;
    }

    try {
      this.currentThread = this.codexClient!.resumeThread(threadId);
      this.currentThreadId = threadId;
      return true;
    } catch (error) {
      console.error('Failed to resume thread:', error);
      return false;
    }
  }

  /**
   * Get current thread ID
   */
  getCurrentThreadId(): string | null {
    return this.currentThreadId;
  }

  /**
   * Clear current thread (start fresh on next query)
   */
  clearThread(): void {
    this.currentThread = null;
    this.currentThreadId = null;
  }

  /**
   * Normalize Codex result to standard format
   */
  protected normalizeMessage(rawMessage: unknown): AgentMessage {
    const result = rawMessage as CodexResult;

    const content: AgentMessage['content'] = [];

    // Add main content
    if (result.content) {
      content.push({
        type: 'text',
        text: result.content,
      });
    }

    // Add tool calls if present
    if (result.tool_calls) {
      for (const toolCall of result.tool_calls) {
        content.push({
          type: 'tool_use',
          id: `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: toolCall.name,
          input: toolCall.arguments,
        });

        if (toolCall.result) {
          content.push({
            type: 'tool_result',
            tool_use_id: `tool_${Date.now()}`,
            content: toolCall.result,
          });
        }
      }
    }

    return {
      type: 'assistant',
      content,
      metadata: {
        provider: this.name,
        usage: result.usage ? {
          input_tokens: result.usage.prompt_tokens,
          output_tokens: result.usage.completion_tokens,
        } : undefined,
      },
    };
  }

  /**
   * Set API key at runtime
   */
  setApiKey(key: string): void {
    this.apiKey = key;
    this.status.authenticated = true;
    // Reset client to use new key
    this.codexClient = null;
    this.currentThread = null;
    this.currentThreadId = null;
  }

  /**
   * Get the current API key (masked for display)
   */
  getApiKeyPreview(): string | null {
    if (!this.apiKey) return null;
    return `${this.apiKey.slice(0, 8)}...${this.apiKey.slice(-4)}`;
  }
}

/**
 * Create a new OpenAI provider instance
 */
export function createOpenAIProvider(apiKey?: string): OpenAIProvider {
  return new OpenAIProvider(apiKey);
}

export default OpenAIProvider;
