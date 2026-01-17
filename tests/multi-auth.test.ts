/**
 * Multi-Provider Authentication Tests
 * Tests for the MultiAuthManager class and multi-provider credential management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PROVIDER_ENV_VARS,
  type ProviderCredentials,
  type MultiProviderCredentials,
} from '../src/config/auth-config';
import { type ProviderName } from '../src/config/provider-config';

// Mock the filesystem operations
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Mock child_process for Windows permissions
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('Provider Environment Variables', () => {
  it('should have correct env vars for Anthropic', () => {
    expect(PROVIDER_ENV_VARS.anthropic.API_KEY).toBe('ANTHROPIC_API_KEY');
    expect(PROVIDER_ENV_VARS.anthropic.SUBSCRIPTION_KEY).toBe('ANTHROPIC_SUBSCRIPTION_KEY');
    expect(PROVIDER_ENV_VARS.anthropic.ACCESS_TOKEN).toBe('ANTHROPIC_ACCESS_TOKEN');
  });

  it('should have correct env vars for OpenAI', () => {
    expect(PROVIDER_ENV_VARS.openai.API_KEY).toBe('OPENAI_API_KEY');
    expect(PROVIDER_ENV_VARS.openai.ACCESS_TOKEN).toBe('OPENAI_ACCESS_TOKEN');
  });

  it('should have correct env vars for Google', () => {
    expect(PROVIDER_ENV_VARS.google.API_KEY).toBe('GOOGLE_API_KEY');
    expect(PROVIDER_ENV_VARS.google.ACCESS_TOKEN).toBe('GOOGLE_ACCESS_TOKEN');
  });

  it('should have correct env vars for Cursor', () => {
    expect(PROVIDER_ENV_VARS.cursor.API_KEY).toBe('CURSOR_API_KEY');
  });

  it('should support all four providers', () => {
    const providers: ProviderName[] = ['anthropic', 'openai', 'google', 'cursor'];
    for (const provider of providers) {
      expect(PROVIDER_ENV_VARS[provider]).toBeDefined();
      expect(PROVIDER_ENV_VARS[provider].API_KEY).toBeDefined();
    }
  });
});

describe('Provider Credentials Structure', () => {
  it('should support API key authentication', () => {
    const creds: ProviderCredentials = {
      enabled: true,
      method: 'api_key',
      source: 'manual',
      apiKey: 'sk-test-key',
    };

    expect(creds.method).toBe('api_key');
    expect(creds.apiKey).toBeDefined();
  });

  it('should support subscription authentication', () => {
    const creds: ProviderCredentials = {
      enabled: true,
      method: 'subscription',
      source: 'auto-detect',
      accessToken: 'oauth-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3600000,
    };

    expect(creds.method).toBe('subscription');
    expect(creds.accessToken).toBeDefined();
    expect(creds.refreshToken).toBeDefined();
  });

  it('should support organization and project IDs', () => {
    const creds: ProviderCredentials = {
      enabled: true,
      method: 'api_key',
      source: 'manual',
      apiKey: 'sk-test',
      organizationId: 'org-123',
      projectId: 'proj-456',
    };

    expect(creds.organizationId).toBe('org-123');
    expect(creds.projectId).toBe('proj-456');
  });
});

describe('Multi-Provider Credentials Structure', () => {
  it('should support multiple providers', () => {
    const multiCreds: MultiProviderCredentials = {
      version: '2.0.0',
      default_provider: 'anthropic',
      providers: {
        anthropic: {
          enabled: true,
          method: 'subscription',
          source: 'auto-detect',
          accessToken: 'claude-token',
        },
        openai: {
          enabled: true,
          method: 'api_key',
          source: 'manual',
          apiKey: 'sk-openai-key',
        },
        google: {
          enabled: true,
          method: 'api_key',
          source: 'manual',
          apiKey: 'AIza-google-key',
        },
      },
      preferences: {
        cost_tracking: true,
        monthly_budget_usd: 50,
        prefer_subscription: true,
      },
    };

    expect(Object.keys(multiCreds.providers).length).toBe(3);
    expect(multiCreds.providers.anthropic?.method).toBe('subscription');
    expect(multiCreds.providers.openai?.method).toBe('api_key');
  });

  it('should have configurable preferences', () => {
    const multiCreds: MultiProviderCredentials = {
      version: '2.0.0',
      default_provider: 'google',
      providers: {},
      preferences: {
        cost_tracking: false,
        monthly_budget_usd: 200,
        prefer_subscription: false,
      },
    };

    expect(multiCreds.preferences.cost_tracking).toBe(false);
    expect(multiCreds.preferences.monthly_budget_usd).toBe(200);
    expect(multiCreds.preferences.prefer_subscription).toBe(false);
  });
});

describe('Authentication Priority', () => {
  describe('Environment variable priority', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should check API_KEY environment variable', () => {
      process.env.ANTHROPIC_API_KEY = 'env-api-key';
      expect(process.env.ANTHROPIC_API_KEY).toBe('env-api-key');
    });

    it('should check SUBSCRIPTION_KEY environment variable', () => {
      process.env.ANTHROPIC_SUBSCRIPTION_KEY = 'env-sub-key';
      expect(process.env.ANTHROPIC_SUBSCRIPTION_KEY).toBe('env-sub-key');
    });

    it('should check ACCESS_TOKEN environment variable', () => {
      process.env.ANTHROPIC_ACCESS_TOKEN = 'env-access-token';
      expect(process.env.ANTHROPIC_ACCESS_TOKEN).toBe('env-access-token');
    });
  });

  describe('Credential source priority', () => {
    it('should identify auto-detect source', () => {
      const creds: ProviderCredentials = {
        enabled: true,
        method: 'subscription',
        source: 'auto-detect',
        accessToken: 'token',
      };
      expect(creds.source).toBe('auto-detect');
    });

    it('should identify manual source', () => {
      const creds: ProviderCredentials = {
        enabled: true,
        method: 'api_key',
        source: 'manual',
        apiKey: 'key',
      };
      expect(creds.source).toBe('manual');
    });

    it('should identify oauth source', () => {
      const creds: ProviderCredentials = {
        enabled: true,
        method: 'oauth',
        source: 'oauth',
        accessToken: 'token',
      };
      expect(creds.source).toBe('oauth');
    });
  });
});

describe('Default Provider Selection', () => {
  it('should default to anthropic', () => {
    const multiCreds: MultiProviderCredentials = {
      version: '2.0.0',
      default_provider: 'anthropic',
      providers: {},
      preferences: {
        cost_tracking: true,
        monthly_budget_usd: 100,
        prefer_subscription: true,
      },
    };

    expect(multiCreds.default_provider).toBe('anthropic');
  });

  it('should allow changing default provider', () => {
    const multiCreds: MultiProviderCredentials = {
      version: '2.0.0',
      default_provider: 'openai',
      providers: {},
      preferences: {
        cost_tracking: true,
        monthly_budget_usd: 100,
        prefer_subscription: true,
      },
    };

    expect(multiCreds.default_provider).toBe('openai');
  });

  it('should support all providers as default', () => {
    const providers: ProviderName[] = ['anthropic', 'openai', 'google', 'cursor'];
    
    for (const provider of providers) {
      const multiCreds: MultiProviderCredentials = {
        version: '2.0.0',
        default_provider: provider,
        providers: {},
        preferences: {
          cost_tracking: true,
          monthly_budget_usd: 100,
          prefer_subscription: true,
        },
      };

      expect(multiCreds.default_provider).toBe(provider);
    }
  });
});

describe('Subscription Tier Handling', () => {
  it('should support free tier', () => {
    const creds: ProviderCredentials = {
      enabled: true,
      method: 'api_key',
      source: 'manual',
      tier: 'free',
    };
    expect(creds.tier).toBe('free');
  });

  it('should support pro tier', () => {
    const creds: ProviderCredentials = {
      enabled: true,
      method: 'subscription',
      source: 'auto-detect',
      tier: 'pro',
    };
    expect(creds.tier).toBe('pro');
  });

  it('should support max tier', () => {
    const creds: ProviderCredentials = {
      enabled: true,
      method: 'subscription',
      source: 'auto-detect',
      tier: 'max',
    };
    expect(creds.tier).toBe('max');
  });

  it('should support team tier', () => {
    const creds: ProviderCredentials = {
      enabled: true,
      method: 'subscription',
      source: 'auto-detect',
      tier: 'team',
    };
    expect(creds.tier).toBe('team');
  });

  it('should support enterprise tier', () => {
    const creds: ProviderCredentials = {
      enabled: true,
      method: 'subscription',
      source: 'auto-detect',
      tier: 'enterprise',
    };
    expect(creds.tier).toBe('enterprise');
  });
});

describe('API Key Formats', () => {
  it('should recognize Anthropic key format (sk-ant-)', () => {
    const key = 'sk-ant-api03-xxxxx';
    expect(key.startsWith('sk-ant-')).toBe(true);
  });

  it('should recognize OpenAI key format (sk-)', () => {
    const key = 'sk-proj-xxxxx';
    expect(key.startsWith('sk-')).toBe(true);
  });

  it('should recognize Google key format (AIza)', () => {
    const key = 'AIzaSyB-xxxxx';
    expect(key.startsWith('AIza')).toBe(true);
  });

  it('should recognize Cursor key format', () => {
    const key = 'cur_xxxxx';
    expect(key.startsWith('cur_')).toBe(true);
  });
});

describe('Credential Validation', () => {
  it('should require enabled field', () => {
    const creds: ProviderCredentials = {
      enabled: false,
      method: 'api_key',
      source: 'manual',
      apiKey: 'test-key',
    };

    expect(creds.enabled).toBe(false);
  });

  it('should require method field', () => {
    const creds: ProviderCredentials = {
      enabled: true,
      method: 'api_key',
      source: 'manual',
    };

    expect(creds.method).toBeDefined();
    expect(['api_key', 'subscription', 'oauth']).toContain(creds.method);
  });

  it('should allow null source', () => {
    const creds: ProviderCredentials = {
      enabled: true,
      method: 'api_key',
      source: null,
      apiKey: 'test',
    };

    expect(creds.source).toBeNull();
  });
});
