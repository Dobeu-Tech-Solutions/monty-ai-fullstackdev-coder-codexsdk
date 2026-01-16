/**
 * Base Provider Interface
 * Abstract class defining the contract for all AI provider implementations.
 * Enables multi-provider orchestration with consistent API.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import type { ProviderName } from '../config/provider-config.js';

/**
 * Content block types for normalized messages
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextContentBlock | ToolUseContentBlock | ToolResultContentBlock;

/**
 * Normalized message format across all providers
 */
export interface AgentMessage {
  type: 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error';
  subtype?: 'success' | 'error' | 'interrupted' | 'error_during_execution';
  content: ContentBlock[];
  metadata?: {
    provider: ProviderName;
    model?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
    latency_ms?: number;
    thread_id?: string;
    [key: string]: unknown;
  };
}

/**
 * Query options for provider execution
 */
export interface QueryOptions {
  /** Allowed tools for this query */
  tools?: string[];
  /** Permission mode for file operations */
  permissionMode?: 'acceptEdits' | 'plan' | 'bypassPermissions' | 'default';
  /** Timeout in milliseconds */
  timeout_ms?: number;
  /** Specific model to use (overrides provider default) */
  model?: string;
  /** Environment variables to pass to subprocess */
  env?: Record<string, string | undefined>;
  /** Maximum turns/iterations */
  maxTurns?: number;
  /** Additional provider-specific options */
  providerOptions?: Record<string, unknown>;
}

/**
 * Provider capabilities declaration
 */
export interface ProviderCapabilities {
  /** Supports streaming responses */
  streaming: boolean;
  /** Supports resumable threads/conversations */
  threads: boolean;
  /** Supports browser automation tools */
  browserAutomation: boolean;
  /** Supports sandboxed code execution */
  codeExecution: boolean;
  /** Supports spawning sub-agents */
  multiAgent: boolean;
  /** Supports function/tool calling */
  toolCalling: boolean;
  /** Supports vision/image input */
  vision: boolean;
}

/**
 * Provider status for health checks
 */
export interface ProviderStatus {
  available: boolean;
  authenticated: boolean;
  rateLimited: boolean;
  lastError?: string;
  lastSuccessfulQuery?: Date;
}

/**
 * Model information
 */
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  costPerMToken: {
    input: number;
    output: number;
  };
  capabilities: string[];
}

/**
 * Abstract base class for AI providers
 * All provider implementations must extend this class
 */
export abstract class BaseProvider {
  /** Unique provider identifier */
  abstract readonly name: ProviderName;

  /** Human-readable display name */
  abstract readonly displayName: string;

  /** NPM package name (null for REST-only providers) */
  abstract readonly packageName: string | null;

  /** Provider status */
  protected status: ProviderStatus = {
    available: false,
    authenticated: false,
    rateLimited: false,
  };

  /**
   * Execute a query against this provider
   * Returns an async generator yielding normalized messages
   */
  abstract query(
    prompt: string,
    options: QueryOptions
  ): AsyncGenerator<AgentMessage, void, unknown>;

  /**
   * Validate that credentials are configured and valid
   */
  abstract validateCredentials(): Promise<boolean>;

  /**
   * List available models for this provider
   */
  abstract listModels(): Promise<ModelInfo[]>;

  /**
   * Get provider capabilities
   */
  abstract getCapabilities(): ProviderCapabilities;

  /**
   * Get list of supported tool names (in standard format)
   */
  abstract getSupportedTools(): string[];

  /**
   * Map a standard tool name to provider-specific name
   * Returns null if tool is not supported
   */
  abstract mapToolName(standardTool: string): string | null;

  /**
   * Get current provider status
   */
  getStatus(): ProviderStatus {
    return { ...this.status };
  }

  /**
   * Check if provider supports threads (resumable conversations)
   */
  supportsThreads(): boolean {
    return this.getCapabilities().threads;
  }

  /**
   * Check if provider supports browser automation
   */
  supportsBrowserAutomation(): boolean {
    return this.getCapabilities().browserAutomation;
  }

  /**
   * Check if provider supports sandboxed code execution
   */
  supportsCodeExecution(): boolean {
    return this.getCapabilities().codeExecution;
  }

  /**
   * Check if provider supports multi-agent workflows
   */
  supportsMultiAgent(): boolean {
    return this.getCapabilities().multiAgent;
  }

  /**
   * Resume a previous thread/conversation (if supported)
   * Override in providers that support threads
   */
  async resumeThread(_threadId: string): Promise<boolean> {
    if (!this.supportsThreads()) {
      throw new Error(`Provider ${this.name} does not support threads`);
    }
    return false;
  }

  /**
   * Get the current thread ID (if in a threaded conversation)
   * Override in providers that support threads
   */
  getCurrentThreadId(): string | null {
    return null;
  }

  /**
   * Normalize provider-specific message to standard format
   * Subclasses should implement this based on their response format
   */
  protected abstract normalizeMessage(rawMessage: unknown): AgentMessage;

  /**
   * Filter tools based on provider capabilities
   * Returns only tools that this provider supports
   */
  filterSupportedTools(requestedTools: string[]): string[] {
    const supported = this.getSupportedTools();
    return requestedTools.filter(tool => supported.includes(tool));
  }

  /**
   * Map multiple standard tool names to provider-specific names
   */
  mapToolNames(standardTools: string[]): string[] {
    return standardTools
      .map(tool => this.mapToolName(tool))
      .filter((tool): tool is string => tool !== null);
  }

  /**
   * Calculate cost for a query based on token usage
   */
  async calculateCost(inputTokens: number, outputTokens: number): Promise<number> {
    const models = await this.listModels();
    const defaultModel = models[0];
    if (!defaultModel) return 0;

    const inputCost = (inputTokens / 1_000_000) * defaultModel.costPerMToken.input;
    const outputCost = (outputTokens / 1_000_000) * defaultModel.costPerMToken.output;
    return inputCost + outputCost;
  }

  /**
   * Update provider status after a query
   */
  protected updateStatus(success: boolean, error?: string): void {
    if (success) {
      this.status.available = true;
      this.status.lastSuccessfulQuery = new Date();
      this.status.lastError = undefined;
      this.status.rateLimited = false;
    } else {
      this.status.lastError = error;
      if (error?.includes('rate limit')) {
        this.status.rateLimited = true;
      }
    }
  }
}

/**
 * Type guard for checking if an object is a valid AgentMessage
 */
export function isAgentMessage(obj: unknown): obj is AgentMessage {
  if (typeof obj !== 'object' || obj === null) return false;
  const msg = obj as Record<string, unknown>;
  return (
    typeof msg.type === 'string' &&
    ['assistant', 'tool_use', 'tool_result', 'result', 'error'].includes(msg.type) &&
    Array.isArray(msg.content)
  );
}

/**
 * Type guard for text content block
 */
export function isTextContentBlock(block: ContentBlock): block is TextContentBlock {
  return block.type === 'text';
}

/**
 * Type guard for tool use content block
 */
export function isToolUseContentBlock(block: ContentBlock): block is ToolUseContentBlock {
  return block.type === 'tool_use';
}

/**
 * Type guard for tool result content block
 */
export function isToolResultContentBlock(block: ContentBlock): block is ToolResultContentBlock {
  return block.type === 'tool_result';
}

export default BaseProvider;
