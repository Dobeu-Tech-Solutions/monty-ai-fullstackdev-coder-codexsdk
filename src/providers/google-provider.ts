/**
 * Google Provider (Gemini ADK)
 * Wrapper around Google's Agent Development Kit for multi-provider orchestration.
 * Supports multi-agent workflows and large context windows.
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
 * Google ADK types (flexible to handle optional dependency)
 * Using 'any' types intentionally for optional SDK compatibility
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type LlmAgentConstructor = new (config: any) => any;
type FunctionToolConstructor = new (config: any) => any;

interface AgentRunResult {
  content: string;
  tool_calls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result?: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Google Provider Implementation
 * Wraps the Google ADK for use in multi-provider orchestration
 */
export class GoogleProvider extends BaseProvider {
  readonly name: ProviderName = 'google';
  readonly displayName = 'Gemini (Google ADK)';
  readonly packageName = '@google/adk';

  private config = PROVIDER_CONFIGS.google;
  private apiKey: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private agent: any = null;
  private LlmAgentClass: LlmAgentConstructor | null = null;
  private FunctionToolClass: FunctionToolConstructor | null = null;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey ?? process.env.GOOGLE_API_KEY ?? null;
    this.status.authenticated = !!this.apiKey;
    this.status.available = false; // Will be set after SDK initialization
  }

  /**
   * Initialize the Google ADK client
   */
  private async initializeClient(): Promise<boolean> {
    if (this.LlmAgentClass) return true;

    try {
      // Dynamic import of Google ADK (optional dependency)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ADKModule: any;
      try {
        ADKModule = await import('@google/adk' as string);
      } catch {
        console.error('Google ADK not found. Install with: npm install @google/adk');
        this.status.available = false;
        return false;
      }

      this.LlmAgentClass = ADKModule.LlmAgent;
      this.FunctionToolClass = ADKModule.FunctionTool;

      if (!this.LlmAgentClass) {
        console.error('Google ADK not found. Install with: npm install @google/adk');
        return false;
      }

      // Set API key in environment for ADK
      if (this.apiKey) {
        process.env.GOOGLE_API_KEY = this.apiKey;
      }

      this.status.available = true;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Could not initialize Google ADK: ${message}`);
      console.warn('Install with: npm install @google/adk');
      this.status.available = false;
      return false;
    }
  }

  /**
   * Create an agent instance with the given configuration
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createAgent(model?: string): any {
    if (!this.LlmAgentClass) return null;

    const selectedModel = model ?? this.config.defaultModel;

    return new this.LlmAgentClass({
      name: 'monty_gemini_agent',
      model: selectedModel,
      description: 'Full-stack development assistant powered by Gemini',
      instruction: `You are a helpful full-stack development assistant.
You help with coding tasks, research, documentation, and architectural decisions.
Always provide clear, accurate, and well-structured responses.`,
    });
  }

  /**
   * Execute a query using the Google ADK
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
            text: 'Google ADK not available. Install with: npm install @google/adk',
          }],
          metadata: {
            provider: this.name,
            latency_ms: Date.now() - startTime,
          },
        };
        return;
      }

      // Create agent for this query
      this.agent = this.createAgent(options.model);
      if (!this.agent) {
        throw new Error('Failed to create Gemini agent');
      }

      // Execute query
      const result = await this.agent.run(prompt);

      // Normalize and yield result
      const message = this.normalizeMessage(result);
      message.metadata = {
        ...message.metadata,
        provider: this.name,
        model: options.model ?? this.config.defaultModel,
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
          text: `Google provider error: ${errorMessage}`,
        }],
        metadata: {
          provider: this.name,
          latency_ms: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Validate Google API credentials
   */
  async validateCredentials(): Promise<boolean> {
    const key = this.apiKey ?? process.env.GOOGLE_API_KEY;
    if (!key) {
      this.status.authenticated = false;
      return false;
    }

    try {
      // Make a minimal API request to validate the key
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
        { method: 'GET' }
      );

      const isValid = response.status === 200;
      this.status.authenticated = isValid;
      return isValid;
    } catch (error) {
      console.warn('Could not validate Google API key online');
      return true;
    }
  }

  /**
   * List available Gemini models
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
   * Get Google provider capabilities
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
   * Map standard tool name to Google tool name
   */
  mapToolName(standardTool: string): string | null {
    const mapped = this.config.toolMapping[standardTool as StandardTool];
    return mapped ?? null;
  }

  /**
   * Normalize ADK result to standard format
   */
  protected normalizeMessage(rawMessage: unknown): AgentMessage {
    const result = rawMessage as AgentRunResult;

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
        usage: result.usage,
      },
    };
  }

  /**
   * Set API key at runtime
   */
  setApiKey(key: string): void {
    this.apiKey = key;
    this.status.authenticated = true;
    // Update environment for ADK
    process.env.GOOGLE_API_KEY = key;
    // Reset agent to use new key
    this.agent = null;
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
 * Create a new Google provider instance
 */
export function createGoogleProvider(apiKey?: string): GoogleProvider {
  return new GoogleProvider(apiKey);
}

export default GoogleProvider;
