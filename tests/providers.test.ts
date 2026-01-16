/**
 * Provider System Tests
 * Tests for the multi-provider abstraction layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getProvider,
  createProvider,
  clearProviderRegistry,
  configureProviderFactory,
  getFactoryConfig,
  isProviderAvailable,
  AnthropicProvider,
  OpenAIProvider,
  GoogleProvider,
  CursorProvider,
} from '../src/providers/index';
import {
  PROVIDER_CONFIGS,
  getProviderConfig,
  getEnabledProviders,
  providerSupportsTool,
  getRoutingPreference,
  calculateQueryCost,
  type ProviderName,
} from '../src/config/provider-config';

describe('Provider Configuration', () => {
  it('should have configurations for all providers', () => {
    expect(PROVIDER_CONFIGS.anthropic).toBeDefined();
    expect(PROVIDER_CONFIGS.openai).toBeDefined();
    expect(PROVIDER_CONFIGS.google).toBeDefined();
    expect(PROVIDER_CONFIGS.cursor).toBeDefined();
  });

  it('should have valid provider names', () => {
    expect(PROVIDER_CONFIGS.anthropic.name).toBe('anthropic');
    expect(PROVIDER_CONFIGS.openai.name).toBe('openai');
    expect(PROVIDER_CONFIGS.google.name).toBe('google');
    expect(PROVIDER_CONFIGS.cursor.name).toBe('cursor');
  });

  it('should have display names for all providers', () => {
    expect(PROVIDER_CONFIGS.anthropic.displayName).toBe('Claude (Anthropic)');
    expect(PROVIDER_CONFIGS.openai.displayName).toBe('Codex (OpenAI)');
    expect(PROVIDER_CONFIGS.google.displayName).toBe('Gemini (Google ADK)');
    expect(PROVIDER_CONFIGS.cursor.displayName).toBe('Cursor Cloud Agents');
  });

  it('should have at least one model per provider', () => {
    for (const config of Object.values(PROVIDER_CONFIGS)) {
      expect(config.models.length).toBeGreaterThan(0);
    }
  });

  it('should have valid default models', () => {
    for (const config of Object.values(PROVIDER_CONFIGS)) {
      const defaultModel = config.models.find(m => m.id === config.defaultModel);
      expect(defaultModel).toBeDefined();
    }
  });

  it('should have environment variable names', () => {
    expect(PROVIDER_CONFIGS.anthropic.envVarName).toBe('ANTHROPIC_API_KEY');
    expect(PROVIDER_CONFIGS.openai.envVarName).toBe('OPENAI_API_KEY');
    expect(PROVIDER_CONFIGS.google.envVarName).toBe('GOOGLE_API_KEY');
    expect(PROVIDER_CONFIGS.cursor.envVarName).toBe('CURSOR_API_KEY');
  });
});

describe('Provider Capabilities', () => {
  it('should define capabilities for all providers', () => {
    for (const config of Object.values(PROVIDER_CONFIGS)) {
      expect(config.capabilities).toBeDefined();
      expect(typeof config.capabilities.streaming).toBe('boolean');
      expect(typeof config.capabilities.threads).toBe('boolean');
      expect(typeof config.capabilities.browserAutomation).toBe('boolean');
      expect(typeof config.capabilities.codeExecution).toBe('boolean');
      expect(typeof config.capabilities.multiAgent).toBe('boolean');
      expect(typeof config.capabilities.toolCalling).toBe('boolean');
      expect(typeof config.capabilities.vision).toBe('boolean');
    }
  });

  it('should have Anthropic with browser automation', () => {
    expect(PROVIDER_CONFIGS.anthropic.capabilities.browserAutomation).toBe(true);
  });

  it('should have OpenAI with threads support', () => {
    expect(PROVIDER_CONFIGS.openai.capabilities.threads).toBe(true);
  });

  it('should have Google with multi-agent support', () => {
    expect(PROVIDER_CONFIGS.google.capabilities.multiAgent).toBe(true);
  });
});

describe('Tool Mapping', () => {
  it('should support Read tool across providers with mapping', () => {
    expect(providerSupportsTool('anthropic', 'Read')).toBe(true);
    expect(providerSupportsTool('openai', 'Read')).toBe(true);
    expect(providerSupportsTool('google', 'Read')).toBe(true);
    expect(providerSupportsTool('cursor', 'Read')).toBe(true);
  });

  it('should not support Browser tool on all providers', () => {
    expect(providerSupportsTool('anthropic', 'Browser')).toBe(true);
    expect(providerSupportsTool('openai', 'Browser')).toBe(false);
    expect(providerSupportsTool('google', 'Browser')).toBe(false);
    expect(providerSupportsTool('cursor', 'Browser')).toBe(false);
  });

  it('should map tool names correctly', () => {
    expect(PROVIDER_CONFIGS.anthropic.toolMapping.Read).toBe('Read');
    expect(PROVIDER_CONFIGS.openai.toolMapping.Read).toBe('read_file');
    expect(PROVIDER_CONFIGS.google.toolMapping.Read).toBe('read_file');
    expect(PROVIDER_CONFIGS.cursor.toolMapping.Read).toBe('read');
  });
});

describe('Task Routing', () => {
  it('should route complex reasoning to Anthropic first', () => {
    const preference = getRoutingPreference('complex_reasoning');
    expect(preference[0]).toBe('anthropic');
  });

  it('should route CI/CD to OpenAI first', () => {
    const preference = getRoutingPreference('ci_cd_automation');
    expect(preference[0]).toBe('openai');
  });

  it('should route research to Google first', () => {
    const preference = getRoutingPreference('research');
    expect(preference[0]).toBe('google');
  });

  it('should route IDE tasks to Cursor first', () => {
    const preference = getRoutingPreference('ide_task');
    expect(preference[0]).toBe('cursor');
  });

  it('should include multiple providers for fallback', () => {
    const preference = getRoutingPreference('general');
    expect(preference.length).toBeGreaterThan(1);
  });
});

describe('Cost Calculation', () => {
  it('should calculate cost for Anthropic models', () => {
    const cost = calculateQueryCost('anthropic', 'claude-sonnet-4-20250514', 1000000, 500000);
    // Input: 1M tokens * $3/M = $3
    // Output: 0.5M tokens * $15/M = $7.5
    expect(cost).toBe(10.5);
  });

  it('should calculate cost for OpenAI models', () => {
    const cost = calculateQueryCost('openai', 'gpt-4-turbo', 1000000, 500000);
    // Input: 1M tokens * $10/M = $10
    // Output: 0.5M tokens * $30/M = $15
    expect(cost).toBe(25);
  });

  it('should calculate cost for Google models', () => {
    const cost = calculateQueryCost('google', 'gemini-2.5-flash', 1000000, 500000);
    // Input: 1M tokens * $0.075/M = $0.075
    // Output: 0.5M tokens * $0.30/M = $0.15
    expect(cost).toBeCloseTo(0.225);
  });

  it('should return 0 for unknown models', () => {
    const cost = calculateQueryCost('anthropic', 'unknown-model', 1000000, 500000);
    expect(cost).toBe(0);
  });
});

describe('Provider Factory', () => {
  beforeEach(() => {
    clearProviderRegistry();
  });

  it('should create Anthropic provider', () => {
    const provider = createProvider('anthropic');
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe('anthropic');
  });

  it('should create OpenAI provider', () => {
    const provider = createProvider('openai');
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe('openai');
  });

  it('should create Google provider', () => {
    const provider = createProvider('google');
    expect(provider).toBeInstanceOf(GoogleProvider);
    expect(provider.name).toBe('google');
  });

  it('should create Cursor provider', () => {
    const provider = createProvider('cursor');
    expect(provider).toBeInstanceOf(CursorProvider);
    expect(provider.name).toBe('cursor');
  });

  it('should return same instance from getProvider', () => {
    const provider1 = getProvider('anthropic');
    const provider2 = getProvider('anthropic');
    expect(provider1).toBe(provider2);
  });

  it('should throw for unknown provider', () => {
    expect(() => createProvider('unknown' as ProviderName)).toThrow();
  });
});

describe('Provider Factory Configuration', () => {
  beforeEach(() => {
    clearProviderRegistry();
  });

  it('should have default configuration', () => {
    const config = getFactoryConfig();
    expect(config.defaultProvider).toBe('anthropic');
    expect(config.fallbackEnabled).toBe(true);
  });

  it('should allow configuration updates', () => {
    configureProviderFactory({
      defaultProvider: 'openai',
      fallbackEnabled: false,
    });

    const config = getFactoryConfig();
    expect(config.defaultProvider).toBe('openai');
    expect(config.fallbackEnabled).toBe(false);
  });
});

describe('Provider Instance Methods', () => {
  let anthropicProvider: AnthropicProvider;

  beforeEach(() => {
    clearProviderRegistry();
    anthropicProvider = createProvider('anthropic') as AnthropicProvider;
  });

  it('should return capabilities', () => {
    const capabilities = anthropicProvider.getCapabilities();
    expect(capabilities.streaming).toBe(true);
    expect(capabilities.browserAutomation).toBe(true);
  });

  it('should return supported tools', () => {
    const tools = anthropicProvider.getSupportedTools();
    expect(tools).toContain('Read');
    expect(tools).toContain('Write');
    expect(tools).toContain('Browser');
  });

  it('should map tool names', () => {
    expect(anthropicProvider.mapToolName('Read')).toBe('Read');
    expect(anthropicProvider.mapToolName('UnknownTool')).toBeNull();
  });

  it('should filter supported tools', () => {
    const requested = ['Read', 'Write', 'UnknownTool', 'Browser'];
    const filtered = anthropicProvider.filterSupportedTools(requested);
    expect(filtered).toContain('Read');
    expect(filtered).toContain('Write');
    expect(filtered).toContain('Browser');
    expect(filtered).not.toContain('UnknownTool');
  });

  it('should support browser automation check', () => {
    expect(anthropicProvider.supportsBrowserAutomation()).toBe(true);
  });

  it('should not support threads', () => {
    expect(anthropicProvider.supportsThreads()).toBe(false);
  });
});

describe('OpenAI Provider Threads', () => {
  let openaiProvider: OpenAIProvider;

  beforeEach(() => {
    clearProviderRegistry();
    openaiProvider = createProvider('openai') as OpenAIProvider;
  });

  it('should support threads', () => {
    expect(openaiProvider.supportsThreads()).toBe(true);
  });

  it('should not have browser automation', () => {
    expect(openaiProvider.supportsBrowserAutomation()).toBe(false);
  });

  it('should have code execution', () => {
    expect(openaiProvider.supportsCodeExecution()).toBe(true);
  });
});

describe('Provider Status', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    clearProviderRegistry();
    provider = createProvider('anthropic') as AnthropicProvider;
  });

  it('should return initial status', () => {
    const status = provider.getStatus();
    expect(status.rateLimited).toBe(false);
  });

  it('should have authenticated status based on API key presence', () => {
    const status = provider.getStatus();
    // Will be false since no API key is set in test environment
    expect(typeof status.authenticated).toBe('boolean');
  });
});

describe('Provider Models', () => {
  it('should list Anthropic models', async () => {
    clearProviderRegistry();
    const provider = createProvider('anthropic');
    const models = await provider.listModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id.includes('claude'))).toBe(true);
  });

  it('should list OpenAI models', async () => {
    clearProviderRegistry();
    const provider = createProvider('openai');
    const models = await provider.listModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id.includes('gpt'))).toBe(true);
  });

  it('should list Google models', async () => {
    clearProviderRegistry();
    const provider = createProvider('google');
    const models = await provider.listModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models.some(m => m.id.includes('gemini'))).toBe(true);
  });
});
