/**
 * Anthropic Provider
 * Wrapper around Claude Agent SDK for multi-provider orchestration.
 * Maintains full backwards compatibility with existing implementation.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  BaseProvider,
  type AgentMessage,
  type QueryOptions,
  type ProviderCapabilities,
  type ModelInfo,
  type ContentBlock,
} from './base-provider.js';
import {
  type ProviderName,
  PROVIDER_CONFIGS,
  type StandardTool,
} from '../config/provider-config.js';

/**
 * Raw message types from Claude Agent SDK
 */
interface ClaudeSDKContentBlock {
  type?: string;
  text?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface ClaudeSDKMessage {
  type: string;
  subtype?: string;
  message?: {
    content?: ClaudeSDKContentBlock[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

/**
 * Anthropic Provider Implementation
 * Wraps the Claude Agent SDK for use in multi-provider orchestration
 */
export class AnthropicProvider extends BaseProvider {
  readonly name: ProviderName = 'anthropic';
  readonly displayName = 'Claude (Anthropic)';
  readonly packageName = '@anthropic-ai/claude-agent-sdk';

  private config = PROVIDER_CONFIGS.anthropic;
  private apiKey: string | null = null;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? null;
    this.status.authenticated = !!this.apiKey;
    this.status.available = this.status.authenticated;
  }

  /**
   * Execute a query using the Claude Agent SDK
   */
  async *query(
    prompt: string,
    options: QueryOptions
  ): AsyncGenerator<AgentMessage, void, unknown> {
    const startTime = Date.now();

    try {
      // Map standard tools to Anthropic tool names
      const allowedTools = options.tools
        ? this.filterSupportedTools(options.tools)
        : undefined;

      // Build SDK options
      const sdkOptions: Record<string, unknown> = {
        allowedTools,
        permissionMode: options.permissionMode ?? 'acceptEdits',
      };

      // Pass API key via environment
      if (this.apiKey) {
        sdkOptions.env = {
          ANTHROPIC_API_KEY: this.apiKey,
          ...options.env,
        };
      }

      // Execute query
      for await (const rawMessage of query({
        prompt,
        options: sdkOptions,
      })) {
        const message = this.normalizeMessage(rawMessage);
        message.metadata = {
          ...message.metadata,
          provider: this.name,
          latency_ms: Date.now() - startTime,
        };
        yield message;

        // Update status on result
        if (message.type === 'result') {
          this.updateStatus(message.subtype === 'success');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateStatus(false, errorMessage);

      yield {
        type: 'error',
        content: [{
          type: 'text',
          text: `Anthropic provider error: ${errorMessage}`,
        }],
        metadata: {
          provider: this.name,
          latency_ms: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Validate Anthropic API credentials
   */
  async validateCredentials(): Promise<boolean> {
    const key = this.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      this.status.authenticated = false;
      return false;
    }

    try {
      // Make a minimal API request to validate the key
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      // 200 = valid, 401 = invalid key, 400 = valid key but bad request (still valid)
      const isValid = response.status === 200 || response.status === 400;
      this.status.authenticated = isValid;
      this.status.available = isValid;
      return isValid;
    } catch (error) {
      // Network error - assume key might be valid
      console.warn('Could not validate Anthropic key online');
      return true;
    }
  }

  /**
   * List available Claude models
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
   * Get Anthropic provider capabilities
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
   * Map standard tool name to Anthropic tool name
   */
  mapToolName(standardTool: string): string | null {
    const mapped = this.config.toolMapping[standardTool as StandardTool];
    return mapped ?? null;
  }

  /**
   * Normalize Claude SDK message to standard format
   */
  protected normalizeMessage(rawMessage: unknown): AgentMessage {
    const sdkMessage = rawMessage as ClaudeSDKMessage;

    // Handle result messages
    if (sdkMessage.type === 'result') {
      return {
        type: 'result',
        subtype: sdkMessage.subtype as AgentMessage['subtype'],
        content: [],
        metadata: {
          provider: this.name,
        },
      };
    }

    // Handle assistant messages
    if (sdkMessage.type === 'assistant' && sdkMessage.message?.content) {
      const content: ContentBlock[] = sdkMessage.message.content.map(block => {
        if (block.text !== undefined) {
          return {
            type: 'text' as const,
            text: block.text,
          };
        }
        if (block.name !== undefined) {
          return {
            type: 'tool_use' as const,
            id: block.id ?? `tool_${Date.now()}`,
            name: block.name,
            input: block.input ?? {},
          };
        }
        if (block.tool_use_id !== undefined) {
          return {
            type: 'tool_result' as const,
            tool_use_id: block.tool_use_id,
            content: block.content ?? '',
          };
        }
        // Default to text block for unknown types
        return {
          type: 'text' as const,
          text: JSON.stringify(block),
        };
      });

      return {
        type: 'assistant',
        content,
        metadata: {
          provider: this.name,
          usage: sdkMessage.message.usage,
        },
      };
    }

    // Handle tool_use messages
    if (sdkMessage.type === 'tool_use') {
      return {
        type: 'tool_use',
        content: [],
        metadata: {
          provider: this.name,
        },
      };
    }

    // Handle tool_result messages
    if (sdkMessage.type === 'tool_result') {
      return {
        type: 'tool_result',
        content: [],
        metadata: {
          provider: this.name,
        },
      };
    }

    // Default fallback
    return {
      type: 'assistant',
      content: [{
        type: 'text',
        text: JSON.stringify(rawMessage),
      }],
      metadata: {
        provider: this.name,
      },
    };
  }

  /**
   * Set API key at runtime
   */
  setApiKey(key: string): void {
    this.apiKey = key;
    this.status.authenticated = true;
    this.status.available = true;
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
 * Create a new Anthropic provider instance
 */
export function createAnthropicProvider(apiKey?: string): AnthropicProvider {
  return new AnthropicProvider(apiKey);
}

export default AnthropicProvider;
