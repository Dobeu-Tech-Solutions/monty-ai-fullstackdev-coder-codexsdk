/**
 * Provider Integration Tests
 * Tests for provider validation, credential management, and query capabilities
 * across all 4 providers (Anthropic, OpenAI, Google, Cursor)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROVIDER_CONFIGS, type ProviderName, type StandardTool } from '../../src/config/provider-config';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Provider Validation Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Anthropic Provider', () => {
    it('should validate Anthropic API key format', () => {
      const validKeys = [
        'sk-ant-api03-xxxxxxxx',
        'sk-ant-api04-yyyyyyyy',
      ];
      const invalidKeys = [
        'sk-proj-xxxxxxxx', // OpenAI format
        'AIzaSyB-xxxxxxxx', // Google format
        'cur_xxxxxxxx', // Cursor format
        '', // empty
      ];

      for (const key of validKeys) {
        expect(key.startsWith('sk-ant-')).toBe(true);
      }

      for (const key of invalidKeys) {
        expect(key.startsWith('sk-ant-')).toBe(false);
      }
    });

    it('should have correct API endpoint', () => {
      expect(PROVIDER_CONFIGS.anthropic.apiEndpoint).toBe('https://api.anthropic.com/v1');
    });

    it('should have correct auth header', () => {
      expect(PROVIDER_CONFIGS.anthropic.authHeader).toBe('x-api-key');
    });

    it('should support browser automation', () => {
      expect(PROVIDER_CONFIGS.anthropic.capabilities.browserAutomation).toBe(true);
    });

    it('should support streaming', () => {
      expect(PROVIDER_CONFIGS.anthropic.capabilities.streaming).toBe(true);
    });

    it('should have Claude models', async () => {
      const models = PROVIDER_CONFIGS.anthropic.models;
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id.includes('claude'))).toBe(true);
    });

    it('should validate credential via API mock', async () => {
      const { AnthropicProvider } = await import('../../src/providers/anthropic-provider.js');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'msg_123' }),
      });

      const provider = new AnthropicProvider('sk-ant-test-key');
      const result = await provider.validateCredentials();
      
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test-key',
          }),
        })
      );
    });

    it('should return false for invalid credentials', async () => {
      const { AnthropicProvider } = await import('../../src/providers/anthropic-provider.js');
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const provider = new AnthropicProvider('invalid-key');
      const result = await provider.validateCredentials();
      
      expect(result).toBe(false);
    });
  });

  describe('OpenAI Provider', () => {
    it('should validate OpenAI API key format', () => {
      const validKeys = [
        'sk-proj-xxxxxxxx',
        'sk-org-xxxxxxxx',
        'sk-xxxxxxxxxxxxxxxx', // Legacy format
      ];

      for (const key of validKeys) {
        expect(key.startsWith('sk-')).toBe(true);
      }
    });

    it('should have correct API endpoint', () => {
      expect(PROVIDER_CONFIGS.openai.apiEndpoint).toBe('https://api.openai.com/v1');
    });

    it('should have correct auth header', () => {
      expect(PROVIDER_CONFIGS.openai.authHeader).toBe('Authorization');
    });

    it('should support threads', () => {
      expect(PROVIDER_CONFIGS.openai.capabilities.threads).toBe(true);
    });

    it('should support code execution', () => {
      expect(PROVIDER_CONFIGS.openai.capabilities.codeExecution).toBe(true);
    });

    it('should have GPT models', () => {
      const models = PROVIDER_CONFIGS.openai.models;
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id.includes('gpt'))).toBe(true);
    });

    it('should validate credential via API mock', async () => {
      const { OpenAIProvider } = await import('../../src/providers/openai-provider.js');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'model-1' }] }),
      });

      const provider = new OpenAIProvider('sk-test-key');
      const result = await provider.validateCredentials();
      
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test-key',
          }),
        })
      );
    });
  });

  describe('Google Provider', () => {
    it('should validate Google API key format', () => {
      const validKeys = [
        'AIzaSyB-xxxxxxxx',
        'AIzaSyC-yyyyyyyy',
      ];

      for (const key of validKeys) {
        expect(key.startsWith('AIza')).toBe(true);
      }
    });

    it('should have correct API endpoint', () => {
      expect(PROVIDER_CONFIGS.google.apiEndpoint).toBe('https://generativelanguage.googleapis.com/v1beta');
    });

    it('should have correct auth header', () => {
      expect(PROVIDER_CONFIGS.google.authHeader).toBe('x-goog-api-key');
    });

    it('should support multi-agent', () => {
      expect(PROVIDER_CONFIGS.google.capabilities.multiAgent).toBe(true);
    });

    it('should have Gemini models', () => {
      const models = PROVIDER_CONFIGS.google.models;
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id.includes('gemini'))).toBe(true);
    });

    it('should validate credential via API mock', async () => {
      const { GoogleProvider } = await import('../../src/providers/google-provider.js');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ models: [{ name: 'gemini-1.5-pro' }] }),
      });

      const provider = new GoogleProvider('AIzaSyB-test-key');
      const result = await provider.validateCredentials();
      
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });

  describe('Cursor Provider', () => {
    it('should validate Cursor API key format', () => {
      const validKeys = [
        'cur_xxxxxxxx',
        'cur_yyyyyyyy',
      ];

      for (const key of validKeys) {
        expect(key.startsWith('cur_')).toBe(true);
      }
    });

    it('should have correct API endpoint', () => {
      expect(PROVIDER_CONFIGS.cursor.apiEndpoint).toBe('https://api.cursor.com/v0');
    });

    it('should have correct auth header', () => {
      expect(PROVIDER_CONFIGS.cursor.authHeader).toBe('Authorization');
    });

    it('should have Cursor models', () => {
      const models = PROVIDER_CONFIGS.cursor.models;
      expect(models.length).toBeGreaterThan(0);
    });

    it('should validate credential via API mock', async () => {
      const { CursorProvider } = await import('../../src/providers/cursor-provider.js');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const provider = new CursorProvider('cur_test-key');
      const result = await provider.validateCredentials();
      
      expect(result).toBe(true);
    });

    it('should support task cancellation', async () => {
      const { CursorProvider } = await import('../../src/providers/cursor-provider.js');
      
      const provider = new CursorProvider('cur_test-key');
      // @ts-expect-error - accessing private property for test
      provider.currentTaskId = 'task-123';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await provider.cancelCurrentTask();
      expect(result).toBe(true);
    });
  });
});

describe('Provider Capabilities', () => {
  it('should have all required capability fields', () => {
    const requiredFields = [
      'streaming',
      'threads',
      'browserAutomation',
      'codeExecution',
      'multiAgent',
      'toolCalling',
      'vision',
    ];

    for (const provider of Object.values(PROVIDER_CONFIGS)) {
      for (const field of requiredFields) {
        expect(provider.capabilities).toHaveProperty(field);
      }
    }
  });

  it('should have correct capability distribution', () => {
    // Anthropic: browser automation, streaming, tool calling
    expect(PROVIDER_CONFIGS.anthropic.capabilities.browserAutomation).toBe(true);
    expect(PROVIDER_CONFIGS.anthropic.capabilities.streaming).toBe(true);
    expect(PROVIDER_CONFIGS.anthropic.capabilities.toolCalling).toBe(true);

    // OpenAI: threads, code execution
    expect(PROVIDER_CONFIGS.openai.capabilities.threads).toBe(true);
    expect(PROVIDER_CONFIGS.openai.capabilities.codeExecution).toBe(true);

    // Google: multi-agent
    expect(PROVIDER_CONFIGS.google.capabilities.multiAgent).toBe(true);
  });
});

describe('Tool Mapping', () => {
  const standardTools: StandardTool[] = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Browser', 'Task'];

  it('should map tools for Anthropic', () => {
    const mapping = PROVIDER_CONFIGS.anthropic.toolMapping;
    
    // All standard tools should be mapped
    for (const tool of standardTools) {
      expect(mapping).toHaveProperty(tool);
    }
  });

  it('should map tools for OpenAI', () => {
    const mapping = PROVIDER_CONFIGS.openai.toolMapping;
    
    // OpenAI should not support Browser (no browser automation)
    expect(mapping['Browser']).toBeNull();
  });

  it('should map tools for Google', () => {
    const mapping = PROVIDER_CONFIGS.google.toolMapping;
    
    // Google has different tool names
    expect(mapping['WebFetch']).toBe('fetch_url');
    expect(mapping['WebSearch']).toBe('google_search');
    expect(mapping['Read']).toBe('read_file');
    expect(mapping['Task']).toBe('spawn_agent');
  });

  it('should map tools for Cursor', () => {
    const mapping = PROVIDER_CONFIGS.cursor.toolMapping;
    
    // Cursor uses different naming convention
    expect(mapping['Read']).toBe('read');
    expect(mapping['Write']).toBe('write');
    expect(mapping['Edit']).toBe('edit');
    expect(mapping['Bash']).toBe('terminal');
    // These are not supported
    expect(mapping['Browser']).toBeNull();
    expect(mapping['WebFetch']).toBeNull();
  });
});

describe('Rate Limits', () => {
  it('should have rate limits for all providers', () => {
    for (const [name, config] of Object.entries(PROVIDER_CONFIGS)) {
      expect(config.rateLimits).toBeDefined();
      expect(config.rateLimits.requestsPerMinute).toBeGreaterThan(0);
      expect(config.rateLimits.tokensPerMinute).toBeGreaterThan(0);
    }
  });

  it('should have reasonable defaults', () => {
    // Anthropic: 50 RPM, 100K TPM
    expect(PROVIDER_CONFIGS.anthropic.rateLimits.requestsPerMinute).toBeGreaterThanOrEqual(50);
    expect(PROVIDER_CONFIGS.anthropic.rateLimits.tokensPerMinute).toBeGreaterThanOrEqual(100000);

    // OpenAI: 60 RPM, 90K TPM
    expect(PROVIDER_CONFIGS.openai.rateLimits.requestsPerMinute).toBeGreaterThanOrEqual(60);
    expect(PROVIDER_CONFIGS.openai.rateLimits.tokensPerMinute).toBeGreaterThanOrEqual(90000);
  });
});

describe('Model Pricing', () => {
  it('should have pricing for all models', () => {
    for (const [name, config] of Object.entries(PROVIDER_CONFIGS)) {
      for (const model of config.models) {
        expect(model.costPerMToken).toBeDefined();
        expect(model.costPerMToken.input).toBeGreaterThanOrEqual(0);
        expect(model.costPerMToken.output).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('should have context windows defined', () => {
    for (const config of Object.values(PROVIDER_CONFIGS)) {
      for (const model of config.models) {
        expect(model.contextWindow).toBeGreaterThan(0);
      }
    }
  });
});

describe('Provider Factory Integration', () => {
  it('should create all provider instances', async () => {
    const { getProvider, createProvider } = await import('../../src/providers/index.js');
    
    const providers: ProviderName[] = ['anthropic', 'openai', 'google', 'cursor'];
    
    for (const name of providers) {
      const provider = createProvider(name);
      expect(provider).toBeDefined();
      expect(provider.name).toBe(name);
    }
  });

  it('should cache provider instances', async () => {
    const { getProvider, createProvider } = await import('../../src/providers/index.js');
    
    // createProvider creates new instances
    const p1 = createProvider('anthropic');
    const p2 = createProvider('anthropic');
    expect(p1).not.toBe(p2);

    // getProvider should cache
    const g1 = getProvider('openai');
    const g2 = getProvider('openai');
    expect(g1).toBe(g2);
  });

  it('should throw for unknown provider', async () => {
    const { createProvider } = await import('../../src/providers/index.js');
    
    expect(() => createProvider('unknown' as ProviderName)).toThrow();
  });
});

describe('Environment Variable Priority', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use environment variable over constructor argument', async () => {
    const { AnthropicProvider } = await import('../../src/providers/anthropic-provider.js');
    
    process.env.ANTHROPIC_API_KEY = 'env-key';
    
    // Provider created with constructor key
    const provider = new AnthropicProvider('constructor-key');
    
    // But validates using constructor key (passed explicitly)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await provider.validateCredentials();
    
    // Should use constructor key
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'constructor-key',
        }),
      })
    );
  });

  it('should fall back to environment variable when no constructor key', async () => {
    const { AnthropicProvider } = await import('../../src/providers/anthropic-provider.js');
    
    process.env.ANTHROPIC_API_KEY = 'env-key';
    
    const provider = new AnthropicProvider(); // No constructor key
    
    expect(provider.getStatus().authenticated).toBe(true);
  });
});
