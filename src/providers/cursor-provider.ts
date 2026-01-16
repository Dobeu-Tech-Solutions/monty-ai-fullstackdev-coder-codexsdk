/**
 * Cursor Provider (Cloud Agents API)
 * Wrapper around Cursor's Cloud Agents REST API for multi-provider orchestration.
 * Supports IDE-integrated workflows and rapid prototyping.
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
 * Cursor API response types
 */
interface CursorAgentRequest {
  prompt: string;
  tools?: string[];
  model?: string;
  workspace_context?: {
    files?: string[];
    cwd?: string;
  };
}

interface CursorAgentResponse {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: {
    content: string;
    tool_calls?: Array<{
      tool: string;
      input: Record<string, unknown>;
      output?: string;
    }>;
    files_modified?: string[];
  };
  error?: string;
  usage?: {
    tokens_used: number;
  };
}

/**
 * Cursor Provider Implementation
 * Wraps the Cursor Cloud Agents API for use in multi-provider orchestration
 */
export class CursorProvider extends BaseProvider {
  readonly name: ProviderName = 'cursor';
  readonly displayName = 'Cursor Cloud Agents';
  readonly packageName = null; // REST API only

  private config = PROVIDER_CONFIGS.cursor;
  private apiKey: string | null = null;
  private baseUrl = 'https://api.cursor.com/v0';
  private currentTaskId: string | null = null;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey ?? process.env.CURSOR_API_KEY ?? null;
    this.status.authenticated = !!this.apiKey;
    this.status.available = this.status.authenticated;
  }

  /**
   * Execute a query using the Cursor Cloud Agents API
   */
  async *query(
    prompt: string,
    options: QueryOptions
  ): AsyncGenerator<AgentMessage, void, unknown> {
    const startTime = Date.now();

    if (!this.apiKey) {
      yield {
        type: 'error',
        content: [{
          type: 'text',
          text: 'Cursor API key not configured. Set CURSOR_API_KEY environment variable.',
        }],
        metadata: {
          provider: this.name,
          latency_ms: Date.now() - startTime,
        },
      };
      return;
    }

    try {
      // Map standard tools to Cursor tools
      const cursorTools = options.tools
        ? this.mapToolNames(options.tools)
        : undefined;

      // Build request body
      const requestBody: CursorAgentRequest = {
        prompt,
        tools: cursorTools,
        model: options.model,
        workspace_context: {
          cwd: process.cwd(),
        },
      };

      // Submit task
      const submitResponse = await fetch(`${this.baseUrl}/agents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        throw new Error(`Cursor API error (${submitResponse.status}): ${errorText}`);
      }

      const task = await submitResponse.json() as CursorAgentResponse;
      this.currentTaskId = task.id;

      // Poll for completion (Cursor API is async)
      const result = await this.pollForCompletion(task.id, options.timeout_ms ?? 120000);

      // Normalize and yield result
      const message = this.normalizeMessage(result);
      message.metadata = {
        ...message.metadata,
        provider: this.name,
        latency_ms: Date.now() - startTime,
      };

      yield message;

      // Yield final result message
      yield {
        type: 'result',
        subtype: result.status === 'completed' ? 'success' : 'error',
        content: [],
        metadata: {
          provider: this.name,
          latency_ms: Date.now() - startTime,
        },
      };

      this.updateStatus(result.status === 'completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateStatus(false, errorMessage);

      yield {
        type: 'error',
        content: [{
          type: 'text',
          text: `Cursor provider error: ${errorMessage}`,
        }],
        metadata: {
          provider: this.name,
          latency_ms: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Poll for task completion
   */
  private async pollForCompletion(
    taskId: string,
    timeout: number
  ): Promise<CursorAgentResponse> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < timeout) {
      const response = await fetch(`${this.baseUrl}/agents/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get task status: ${response.status}`);
      }

      const task = await response.json() as CursorAgentResponse;

      if (task.status === 'completed' || task.status === 'failed') {
        return task;
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Task timed out after ${timeout}ms`);
  }

  /**
   * Validate Cursor API credentials
   */
  async validateCredentials(): Promise<boolean> {
    const key = this.apiKey ?? process.env.CURSOR_API_KEY;
    if (!key) {
      this.status.authenticated = false;
      return false;
    }

    try {
      // Make a health check request
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
        },
      });

      const isValid = response.status === 200;
      this.status.authenticated = isValid;
      this.status.available = isValid;
      return isValid;
    } catch (error) {
      console.warn('Could not validate Cursor API key online');
      // Assume valid if we can't check (network error)
      return true;
    }
  }

  /**
   * List available Cursor models
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
   * Get Cursor provider capabilities
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
   * Map standard tool name to Cursor tool name
   */
  mapToolName(standardTool: string): string | null {
    const mapped = this.config.toolMapping[standardTool as StandardTool];
    return mapped ?? null;
  }

  /**
   * Get current task ID
   */
  getCurrentTaskId(): string | null {
    return this.currentTaskId;
  }

  /**
   * Cancel current task (if running)
   */
  async cancelCurrentTask(): Promise<boolean> {
    if (!this.currentTaskId || !this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/agents/${this.currentTaskId}/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Normalize Cursor response to standard format
   */
  protected normalizeMessage(rawMessage: unknown): AgentMessage {
    const response = rawMessage as CursorAgentResponse;

    const content: AgentMessage['content'] = [];

    // Handle errors
    if (response.status === 'failed') {
      content.push({
        type: 'text',
        text: response.error ?? 'Task failed without error message',
      });

      return {
        type: 'error',
        content,
        metadata: {
          provider: this.name,
        },
      };
    }

    // Add main content
    if (response.result?.content) {
      content.push({
        type: 'text',
        text: response.result.content,
      });
    }

    // Add tool calls if present
    if (response.result?.tool_calls) {
      for (const toolCall of response.result.tool_calls) {
        content.push({
          type: 'tool_use',
          id: `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: toolCall.tool,
          input: toolCall.input,
        });

        if (toolCall.output) {
          content.push({
            type: 'tool_result',
            tool_use_id: `tool_${Date.now()}`,
            content: toolCall.output,
          });
        }
      }
    }

    // Add files modified info
    if (response.result?.files_modified && response.result.files_modified.length > 0) {
      content.push({
        type: 'text',
        text: `\n\nFiles modified:\n${response.result.files_modified.map(f => `  - ${f}`).join('\n')}`,
      });
    }

    return {
      type: 'assistant',
      content,
      metadata: {
        provider: this.name,
        usage: response.usage ? {
          input_tokens: response.usage.tokens_used,
          output_tokens: 0, // Cursor doesn't separate input/output
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
    this.status.available = true;
  }

  /**
   * Get the current API key (masked for display)
   */
  getApiKeyPreview(): string | null {
    if (!this.apiKey) return null;
    return `${this.apiKey.slice(0, 8)}...${this.apiKey.slice(-4)}`;
  }

  /**
   * Set custom API endpoint (for self-hosted instances)
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }
}

/**
 * Create a new Cursor provider instance
 */
export function createCursorProvider(apiKey?: string): CursorProvider {
  return new CursorProvider(apiKey);
}

export default CursorProvider;
