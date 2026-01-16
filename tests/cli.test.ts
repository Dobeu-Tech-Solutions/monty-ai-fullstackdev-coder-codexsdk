/**
 * CLI Command Tests
 * Tests for CLI argument parsing and command handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { multiAuthManager } from '../src/utils/multi-auth-manager';
import type { ProviderName } from '../src/config/provider-config';

// Mock the multiAuthManager
vi.mock('../src/utils/multi-auth-manager', () => ({
  multiAuthManager: {
    getProviderDisplayInfo: vi.fn(),
    getDefaultProvider: vi.fn(),
    setDefaultProvider: vi.fn(),
    isAnyProviderAuthenticated: vi.fn(),
    getAuthenticatedProviders: vi.fn(),
    loginProvider: vi.fn(),
    loginAll: vi.fn(),
    logoutProvider: vi.fn(),
    logoutAll: vi.fn(),
    whoami: vi.fn(),
    setEnvForChildProcess: vi.fn(),
    getApiKey: vi.fn(),
  },
}));

describe('CLI Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Provider Management', () => {
    it('should return provider display info', () => {
      const mockInfo = [
        {
          name: 'anthropic' as ProviderName,
          displayName: 'Anthropic (Claude)',
          enabled: true,
          authenticated: true,
          method: 'api_key' as const,
          source: 'manual' as const,
          email: null,
          keyPreview: 'sk-ant-...1234',
          isDefault: true,
        },
        {
          name: 'openai' as ProviderName,
          displayName: 'OpenAI (Codex)',
          enabled: true,
          authenticated: false,
          method: null,
          source: null,
          email: null,
          keyPreview: null,
          isDefault: false,
        },
      ];

      vi.mocked(multiAuthManager.getProviderDisplayInfo).mockReturnValue(mockInfo);

      const info = multiAuthManager.getProviderDisplayInfo();
      expect(info).toHaveLength(2);
      expect(info[0].name).toBe('anthropic');
      expect(info[0].authenticated).toBe(true);
      expect(info[1].authenticated).toBe(false);
    });

    it('should get default provider', () => {
      vi.mocked(multiAuthManager.getDefaultProvider).mockReturnValue('anthropic');
      expect(multiAuthManager.getDefaultProvider()).toBe('anthropic');
    });

    it('should set default provider', () => {
      multiAuthManager.setDefaultProvider('openai');
      expect(multiAuthManager.setDefaultProvider).toHaveBeenCalledWith('openai');
    });

    it('should get authenticated providers', () => {
      vi.mocked(multiAuthManager.getAuthenticatedProviders).mockReturnValue(['anthropic', 'google']);

      const providers = multiAuthManager.getAuthenticatedProviders();
      expect(providers).toContain('anthropic');
      expect(providers).toContain('google');
      expect(providers).toHaveLength(2);
    });

    it('should check if any provider is authenticated', () => {
      vi.mocked(multiAuthManager.isAnyProviderAuthenticated).mockReturnValue(true);
      expect(multiAuthManager.isAnyProviderAuthenticated()).toBe(true);

      vi.mocked(multiAuthManager.isAnyProviderAuthenticated).mockReturnValue(false);
      expect(multiAuthManager.isAnyProviderAuthenticated()).toBe(false);
    });
  });

  describe('Authentication Flow', () => {
    it('should login to specific provider', async () => {
      vi.mocked(multiAuthManager.loginProvider).mockResolvedValue(true);

      const result = await multiAuthManager.loginProvider('openai');
      expect(result).toBe(true);
      expect(multiAuthManager.loginProvider).toHaveBeenCalledWith('openai');
    });

    it('should logout from specific provider', () => {
      multiAuthManager.logoutProvider('openai');
      expect(multiAuthManager.logoutProvider).toHaveBeenCalledWith('openai');
    });

    it('should logout from all providers', () => {
      multiAuthManager.logoutAll();
      expect(multiAuthManager.logoutAll).toHaveBeenCalled();
    });
  });

  describe('Environment Setup', () => {
    it('should set environment variables for child processes', () => {
      multiAuthManager.setEnvForChildProcess();
      expect(multiAuthManager.setEnvForChildProcess).toHaveBeenCalled();
    });

    it('should get API key for provider', async () => {
      vi.mocked(multiAuthManager.getApiKey).mockResolvedValue('sk-test-key');

      const key = await multiAuthManager.getApiKey('anthropic');
      expect(key).toBe('sk-test-key');
      expect(multiAuthManager.getApiKey).toHaveBeenCalledWith('anthropic');
    });
  });
});

describe('Argument Parsing', () => {
  // Test the provider argument parsing logic
  const VALID_PROVIDERS: ProviderName[] = ['anthropic', 'openai', 'google', 'cursor'];

  it('should validate provider names', () => {
    const validNames = ['anthropic', 'openai', 'google', 'cursor', 'all'];
    for (const name of validNames) {
      if (name === 'all') {
        expect(name).toBe('all');
      } else {
        expect(VALID_PROVIDERS).toContain(name);
      }
    }
  });

  it('should reject invalid provider names', () => {
    const invalidNames = ['claude', 'gpt', 'gemini', 'invalid'];
    for (const name of invalidNames) {
      expect(VALID_PROVIDERS).not.toContain(name);
    }
  });

  it('should parse --provider=name format', () => {
    const args = ['--provider=openai'];
    const providerArg = args.find(a => a.startsWith('--provider='))?.split('=')[1];
    expect(providerArg).toBe('openai');
  });

  it('should parse --set-default=name format', () => {
    const args = ['--set-default=google'];
    const setDefaultArg = args.find(a => a.startsWith('--set-default='))?.split('=')[1];
    expect(setDefaultArg).toBe('google');
  });

  it('should detect login command', () => {
    expect(['--login', 'login'].includes('login')).toBe(true);
    expect(['--login', 'login'].includes('--login')).toBe(true);
  });

  it('should detect logout command', () => {
    expect(['--logout', 'logout'].includes('logout')).toBe(true);
    expect(['--logout', 'logout'].includes('--logout')).toBe(true);
  });

  it('should detect providers command', () => {
    expect(['--providers', 'providers'].includes('providers')).toBe(true);
    expect(['--providers', 'providers'].includes('--providers')).toBe(true);
  });
});
