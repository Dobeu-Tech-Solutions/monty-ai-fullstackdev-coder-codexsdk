/**
 * Provider Configuration
 * Configuration for all supported AI providers (Anthropic, OpenAI, Google, Cursor).
 * Defines capabilities, tool mappings, models, and rate limits per provider.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

/**
 * Supported provider names
 */
export type ProviderName = 'anthropic' | 'openai' | 'google' | 'cursor';

/**
 * Standard tool names used across providers
 */
export type StandardTool =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Glob'
  | 'Grep'
  | 'Browser'
  | 'Task'
  | 'WebFetch'
  | 'WebSearch';

/**
 * Task types for orchestrator routing
 */
export type TaskType =
  | 'complex_reasoning'
  | 'architectural_decision'
  | 'ci_cd_automation'
  | 'test_execution'
  | 'research'
  | 'documentation'
  | 'ide_task'
  | 'rapid_prototyping'
  | 'code_review'
  | 'general';

/**
 * Provider capabilities interface
 */
export interface ProviderCapabilities {
  streaming: boolean;
  threads: boolean;
  browserAutomation: boolean;
  codeExecution: boolean;
  multiAgent: boolean;
  toolCalling: boolean;
  vision: boolean;
}

/**
 * Model pricing information
 */
export interface ModelPricing {
  input: number;  // Cost per million tokens
  output: number; // Cost per million tokens
}

/**
 * Model configuration
 */
export interface ModelConfig {
  id: string;
  name: string;
  contextWindow: number;
  costPerMToken: ModelPricing;
  capabilities: string[];
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  tokensPerDay?: number;
}

/**
 * Full provider configuration
 */
export interface ProviderConfig {
  name: ProviderName;
  displayName: string;
  packageName: string | null;
  enabled: boolean;
  capabilities: ProviderCapabilities;
  toolMapping: Partial<Record<StandardTool, string | null>>;
  models: ModelConfig[];
  defaultModel: string;
  rateLimits: RateLimitConfig;
  apiEndpoint?: string;
  authHeader?: string;
  envVarName: string;
}

/**
 * Provider configurations for all supported providers
 */
export const PROVIDER_CONFIGS: Record<ProviderName, ProviderConfig> = {
  anthropic: {
    name: 'anthropic',
    displayName: 'Claude (Anthropic)',
    packageName: '@anthropic-ai/claude-agent-sdk',
    enabled: true,
    capabilities: {
      streaming: true,
      threads: false,
      browserAutomation: true,
      codeExecution: false,
      multiAgent: true,
      toolCalling: true,
      vision: true,
    },
    toolMapping: {
      Read: 'Read',
      Write: 'Write',
      Edit: 'Edit',
      Bash: 'Bash',
      Glob: 'Glob',
      Grep: 'Grep',
      Browser: 'Browser',
      Task: 'Task',
      WebFetch: 'WebFetch',
      WebSearch: 'WebSearch',
    },
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        contextWindow: 200000,
        costPerMToken: { input: 3.0, output: 15.0 },
        capabilities: ['reasoning', 'coding', 'vision', 'tool_use'],
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        contextWindow: 200000,
        costPerMToken: { input: 15.0, output: 75.0 },
        capabilities: ['reasoning', 'coding', 'vision', 'tool_use', 'extended_thinking'],
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        costPerMToken: { input: 3.0, output: 15.0 },
        capabilities: ['reasoning', 'coding', 'vision', 'tool_use'],
      },
    ],
    defaultModel: 'claude-sonnet-4-20250514',
    rateLimits: {
      requestsPerMinute: 50,
      tokensPerMinute: 100000,
      tokensPerDay: 1000000,
    },
    apiEndpoint: 'https://api.anthropic.com/v1',
    authHeader: 'x-api-key',
    envVarName: 'ANTHROPIC_API_KEY',
  },

  openai: {
    name: 'openai',
    displayName: 'Codex (OpenAI)',
    packageName: '@openai/codex-sdk',
    enabled: false,
    capabilities: {
      streaming: true,
      threads: true,
      browserAutomation: false,
      codeExecution: true,
      multiAgent: false,
      toolCalling: true,
      vision: true,
    },
    toolMapping: {
      Read: 'read_file',
      Write: 'write_file',
      Edit: 'edit_file',
      Bash: 'run_command',
      Glob: 'glob_files',
      Grep: 'search_files',
      Browser: null, // Not supported
      Task: null,    // Different implementation
      WebFetch: 'web_fetch',
      WebSearch: 'web_search',
    },
    models: [
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        contextWindow: 128000,
        costPerMToken: { input: 10.0, output: 30.0 },
        capabilities: ['reasoning', 'coding', 'vision', 'tool_use'],
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        costPerMToken: { input: 5.0, output: 15.0 },
        capabilities: ['reasoning', 'coding', 'vision', 'tool_use'],
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        contextWindow: 128000,
        costPerMToken: { input: 0.15, output: 0.60 },
        capabilities: ['reasoning', 'coding', 'tool_use'],
      },
      {
        id: 'o1',
        name: 'O1',
        contextWindow: 200000,
        costPerMToken: { input: 15.0, output: 60.0 },
        capabilities: ['extended_reasoning', 'coding'],
      },
    ],
    defaultModel: 'gpt-4-turbo',
    rateLimits: {
      requestsPerMinute: 60,
      tokensPerMinute: 150000,
    },
    apiEndpoint: 'https://api.openai.com/v1',
    authHeader: 'Authorization',
    envVarName: 'OPENAI_API_KEY',
  },

  google: {
    name: 'google',
    displayName: 'Gemini (Google ADK)',
    packageName: '@google/adk',
    enabled: false,
    capabilities: {
      streaming: true,
      threads: false,
      browserAutomation: false,
      codeExecution: true,
      multiAgent: true,
      toolCalling: true,
      vision: true,
    },
    toolMapping: {
      Read: 'read_file',
      Write: 'write_file',
      Edit: 'edit_file',
      Bash: 'execute_code',
      Glob: 'list_files',
      Grep: 'search_content',
      Browser: null,
      Task: 'spawn_agent',
      WebFetch: 'fetch_url',
      WebSearch: 'google_search',
    },
    models: [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        contextWindow: 1000000,
        costPerMToken: { input: 0.075, output: 0.30 },
        capabilities: ['reasoning', 'coding', 'vision', 'tool_use'],
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        contextWindow: 1000000,
        costPerMToken: { input: 1.25, output: 5.0 },
        capabilities: ['reasoning', 'coding', 'vision', 'tool_use', 'extended_thinking'],
      },
      {
        id: 'gemini-3-pro',
        name: 'Gemini 3 Pro',
        contextWindow: 2000000,
        costPerMToken: { input: 2.5, output: 10.0 },
        capabilities: ['reasoning', 'coding', 'vision', 'tool_use', 'agentic'],
      },
    ],
    defaultModel: 'gemini-2.5-flash',
    rateLimits: {
      requestsPerMinute: 60,
      tokensPerMinute: 1000000,
    },
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    authHeader: 'x-goog-api-key',
    envVarName: 'GOOGLE_API_KEY',
  },

  cursor: {
    name: 'cursor',
    displayName: 'Cursor Cloud Agents',
    packageName: null, // REST API only
    enabled: false,
    capabilities: {
      streaming: false,
      threads: false,
      browserAutomation: false,
      codeExecution: false,
      multiAgent: false,
      toolCalling: true,
      vision: false,
    },
    toolMapping: {
      Read: 'read',
      Write: 'write',
      Edit: 'edit',
      Bash: 'terminal',
      Glob: 'find_files',
      Grep: 'search',
      Browser: null,
      Task: null,
      WebFetch: null,
      WebSearch: null,
    },
    models: [
      {
        id: 'cursor-agent',
        name: 'Cursor Agent',
        contextWindow: 100000,
        costPerMToken: { input: 0, output: 0 }, // Subscription-based
        capabilities: ['coding', 'tool_use'],
      },
    ],
    defaultModel: 'cursor-agent',
    rateLimits: {
      requestsPerMinute: 30,
      tokensPerMinute: 50000,
    },
    apiEndpoint: 'https://api.cursor.com/v0',
    authHeader: 'Authorization',
    envVarName: 'CURSOR_API_KEY',
  },
};

/**
 * Task routing rules - maps task types to preferred providers (in order)
 */
export const TASK_ROUTING_RULES: Record<TaskType, ProviderName[]> = {
  complex_reasoning: ['anthropic', 'google', 'openai'],
  architectural_decision: ['anthropic', 'google'],
  ci_cd_automation: ['openai', 'anthropic', 'cursor'],
  test_execution: ['openai', 'anthropic'],
  research: ['google', 'anthropic'],
  documentation: ['google', 'anthropic', 'openai'],
  ide_task: ['cursor', 'anthropic'],
  rapid_prototyping: ['cursor', 'openai', 'anthropic'],
  code_review: ['anthropic', 'openai', 'google'], // Multi-agent review
  general: ['anthropic', 'openai', 'google', 'cursor'],
};

/**
 * Get provider configuration by name
 */
export function getProviderConfig(name: ProviderName): ProviderConfig {
  return PROVIDER_CONFIGS[name];
}

/**
 * Get all enabled providers
 */
export function getEnabledProviders(): ProviderConfig[] {
  return Object.values(PROVIDER_CONFIGS).filter(p => p.enabled);
}

/**
 * Get default provider configuration
 */
export function getDefaultProvider(): ProviderConfig {
  return PROVIDER_CONFIGS.anthropic;
}

/**
 * Check if a provider supports a specific tool
 */
export function providerSupportsTool(provider: ProviderName, tool: StandardTool): boolean {
  const config = PROVIDER_CONFIGS[provider];
  return config.toolMapping[tool] !== null && config.toolMapping[tool] !== undefined;
}

/**
 * Get routing preference for a task type
 */
export function getRoutingPreference(taskType: TaskType): ProviderName[] {
  return TASK_ROUTING_RULES[taskType];
}

/**
 * Get model configuration by ID
 */
export function getModelConfig(provider: ProviderName, modelId: string): ModelConfig | null {
  const config = PROVIDER_CONFIGS[provider];
  return config.models.find(m => m.id === modelId) ?? null;
}

/**
 * Get cheapest model for a provider
 */
export function getCheapestModel(provider: ProviderName): ModelConfig {
  const config = PROVIDER_CONFIGS[provider];
  return config.models.reduce((cheapest, model) =>
    model.costPerMToken.output < cheapest.costPerMToken.output ? model : cheapest
  );
}

/**
 * Calculate estimated cost for a query
 */
export function calculateQueryCost(
  provider: ProviderName,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getModelConfig(provider, modelId);
  if (!model) return 0;

  const inputCost = (inputTokens / 1_000_000) * model.costPerMToken.input;
  const outputCost = (outputTokens / 1_000_000) * model.costPerMToken.output;
  return inputCost + outputCost;
}

/**
 * Feature flag for multi-provider support
 */
export interface MultiProviderFeatureFlags {
  /** Enable multi-provider orchestration */
  orchestrationEnabled: boolean;
  /** Enable multi-agent code review */
  multiAgentReviewEnabled: boolean;
  /** Enable automatic provider fallback */
  fallbackEnabled: boolean;
  /** Enable cost tracking across providers */
  costTrackingEnabled: boolean;
  /** Enable task-based routing */
  taskRoutingEnabled: boolean;
}

/**
 * Default feature flags (conservative defaults for gradual rollout)
 */
export const DEFAULT_MULTI_PROVIDER_FLAGS: MultiProviderFeatureFlags = {
  orchestrationEnabled: false,  // Start disabled, enable after testing
  multiAgentReviewEnabled: false,
  fallbackEnabled: true,
  costTrackingEnabled: true,
  taskRoutingEnabled: false,
};

/**
 * Validate provider configuration at runtime
 */
export function validateProviderConfig(config: ProviderConfig): string[] {
  const errors: string[] = [];

  if (!config.name) errors.push('Provider name is required');
  if (!config.displayName) errors.push('Display name is required');
  if (!config.envVarName) errors.push('Environment variable name is required');
  if (!config.models || config.models.length === 0) {
    errors.push('At least one model must be configured');
  }
  if (!config.defaultModel) {
    errors.push('Default model must be specified');
  } else if (!config.models.find(m => m.id === config.defaultModel)) {
    errors.push(`Default model ${config.defaultModel} not found in models list`);
  }

  return errors;
}

export default PROVIDER_CONFIGS;
