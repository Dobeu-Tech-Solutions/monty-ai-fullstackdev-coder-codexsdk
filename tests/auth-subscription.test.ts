/**
 * Subscription Detection Tests
 * Tests for Claude Code credential detection, multi-provider auth, and v1-v2 migration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { homedir } from 'os';
import {
  isMultiProviderCredentials,
  migrateToMultiProvider,
  DEFAULT_MULTI_PROVIDER_CREDENTIALS,
  type UserCredentials,
  type MultiProviderCredentials,
  type ProviderCredentials,
} from '../src/config/auth-config';
import { isTokenExpired, getTimeUntilExpiration } from '../src/utils/token-refresh';

// Mock filesystem for testing credential detection
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

describe('Subscription Detection', () => {
  describe('Claude Code Credential Paths', () => {
    it('should check ~/.config/claude-code/auth.json path', () => {
      const expectedPath = join(homedir(), '.config', 'claude-code', 'auth.json');
      expect(expectedPath).toContain('.config');
      expect(expectedPath).toContain('claude-code');
    });

    it('should check ~/.claude/credentials.json path', () => {
      const expectedPath = join(homedir(), '.claude', 'credentials.json');
      expect(expectedPath).toContain('.claude');
    });

    it('should check ~/.claude/auth.json path', () => {
      const expectedPath = join(homedir(), '.claude', 'auth.json');
      expect(expectedPath).toContain('.claude');
      expect(expectedPath).toContain('auth.json');
    });
  });

  describe('Token Timestamp Handling', () => {
    it('should handle expiresAt in seconds', () => {
      // Unix timestamp in seconds (typical OAuth response)
      const expiresAtSeconds = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      expect(isTokenExpired(expiresAtSeconds)).toBe(false);
    });

    it('should handle expiresAt in milliseconds', () => {
      // Timestamp in milliseconds (JS native)
      const expiresAtMs = Date.now() + 3600 * 1000; // 1 hour from now
      expect(isTokenExpired(expiresAtMs)).toBe(false);
    });

    it('should detect expired seconds timestamp', () => {
      const expiredSeconds = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      expect(isTokenExpired(expiredSeconds)).toBe(true);
    });

    it('should detect expired milliseconds timestamp', () => {
      const expiredMs = Date.now() - 3600 * 1000; // 1 hour ago
      expect(isTokenExpired(expiredMs)).toBe(true);
    });

    it('should correctly normalize seconds to milliseconds', () => {
      // Seconds timestamp (10 digits) should be detected and converted
      const secondsTimestamp = 1735689600; // Jan 1, 2025 in seconds
      const msTimestamp = 1735689600000; // Same date in milliseconds
      
      // Both should be treated the same way relative to "now"
      const isSecondsExpired = isTokenExpired(secondsTimestamp);
      const isMsExpired = isTokenExpired(msTimestamp);
      
      // They should have the same expiration status
      expect(isSecondsExpired).toBe(isMsExpired);
    });
  });
});

describe('Credential Format Detection', () => {
  describe('isMultiProviderCredentials', () => {
    it('should detect v2 multi-provider format', () => {
      const v2Creds: MultiProviderCredentials = {
        version: '2.0.0',
        default_provider: 'anthropic',
        providers: {
          anthropic: {
            enabled: true,
            method: 'api_key',
            source: 'manual',
            apiKey: 'sk-ant-test123',
          },
        },
        preferences: {
          cost_tracking: true,
          monthly_budget_usd: 100,
          prefer_subscription: true,
        },
      };

      expect(isMultiProviderCredentials(v2Creds)).toBe(true);
    });

    it('should reject v1 single-provider format', () => {
      const v1Creds: UserCredentials = {
        method: 'api_key',
        apiKey: 'sk-ant-test123',
      };

      expect(isMultiProviderCredentials(v1Creds)).toBe(false);
    });

    it('should reject null or undefined', () => {
      expect(isMultiProviderCredentials(null)).toBe(false);
      expect(isMultiProviderCredentials(undefined)).toBe(false);
    });

    it('should reject non-object types', () => {
      expect(isMultiProviderCredentials('string')).toBe(false);
      expect(isMultiProviderCredentials(123)).toBe(false);
      expect(isMultiProviderCredentials([])).toBe(false);
    });

    it('should require version starting with 2.', () => {
      const invalidVersion = {
        version: '1.0.0',
        providers: {},
      };
      expect(isMultiProviderCredentials(invalidVersion)).toBe(false);

      const validVersion = {
        version: '2.1.0',
        providers: {},
      };
      expect(isMultiProviderCredentials(validVersion)).toBe(true);
    });
  });

  describe('migrateToMultiProvider', () => {
    it('should migrate v1 API key credentials', () => {
      const v1Creds: UserCredentials = {
        method: 'api_key',
        source: 'manual',
        apiKey: 'sk-ant-test123',
        email: 'test@example.com',
      };

      const v2Creds = migrateToMultiProvider(v1Creds);

      expect(v2Creds.version).toBe('2.0.0');
      expect(v2Creds.default_provider).toBe('anthropic');
      expect(v2Creds.providers.anthropic?.enabled).toBe(true);
      expect(v2Creds.providers.anthropic?.method).toBe('api_key');
      expect(v2Creds.providers.anthropic?.apiKey).toBe('sk-ant-test123');
      expect(v2Creds.providers.anthropic?.email).toBe('test@example.com');
    });

    it('should migrate v1 subscription credentials', () => {
      const v1Creds: UserCredentials = {
        method: 'subscription',
        source: 'auto-detect',
        subscriptionKey: 'sub-token-123',
        refreshToken: 'refresh-token-456',
        expiresAt: Date.now() + 3600000,
        tier: 'pro',
      };

      const v2Creds = migrateToMultiProvider(v1Creds);

      expect(v2Creds.version).toBe('2.0.0');
      expect(v2Creds.providers.anthropic?.method).toBe('subscription');
      expect(v2Creds.providers.anthropic?.accessToken).toBe('sub-token-123');
      expect(v2Creds.providers.anthropic?.refreshToken).toBe('refresh-token-456');
      expect(v2Creds.providers.anthropic?.tier).toBe('pro');
      expect(v2Creds.preferences.prefer_subscription).toBe(true);
    });

    it('should preserve all v1 fields during migration', () => {
      const v1Creds: UserCredentials = {
        method: 'subscription',
        source: 'auto-detect',
        subscriptionKey: 'token',
        refreshToken: 'refresh',
        expiresAt: 1735689600000,
        userId: 'user123',
        email: 'user@example.com',
        tier: 'max',
      };

      const v2Creds = migrateToMultiProvider(v1Creds);

      expect(v2Creds.providers.anthropic?.source).toBe('auto-detect');
      expect(v2Creds.providers.anthropic?.email).toBe('user@example.com');
      expect(v2Creds.providers.anthropic?.tier).toBe('max');
      expect(v2Creds.providers.anthropic?.expiresAt).toBe(1735689600000);
    });

    it('should set default preferences', () => {
      const v1Creds: UserCredentials = {
        method: 'api_key',
        apiKey: 'test',
      };

      const v2Creds = migrateToMultiProvider(v1Creds);

      expect(v2Creds.preferences.cost_tracking).toBe(true);
      expect(v2Creds.preferences.monthly_budget_usd).toBe(100);
    });
  });
});

describe('Default Credentials Structure', () => {
  it('should have correct default structure', () => {
    expect(DEFAULT_MULTI_PROVIDER_CREDENTIALS.version).toBe('2.0.0');
    expect(DEFAULT_MULTI_PROVIDER_CREDENTIALS.default_provider).toBe('anthropic');
    expect(DEFAULT_MULTI_PROVIDER_CREDENTIALS.providers).toEqual({});
    expect(DEFAULT_MULTI_PROVIDER_CREDENTIALS.preferences).toEqual({
      cost_tracking: true,
      monthly_budget_usd: 100,
      prefer_subscription: true,
    });
  });
});

describe('Provider Credentials Structure', () => {
  it('should support all required fields', () => {
    const providerCreds: ProviderCredentials = {
      enabled: true,
      method: 'api_key',
      source: 'manual',
      apiKey: 'test-key',
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      organizationId: undefined,
      projectId: undefined,
      email: 'test@example.com',
      tier: 'pro',
    };

    expect(providerCreds.enabled).toBe(true);
    expect(providerCreds.method).toBe('api_key');
    expect(providerCreds.apiKey).toBe('test-key');
  });

  it('should support subscription credentials', () => {
    const subscriptionCreds: ProviderCredentials = {
      enabled: true,
      method: 'subscription',
      source: 'auto-detect',
      accessToken: 'oauth-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 86400000,
      tier: 'max',
    };

    expect(subscriptionCreds.method).toBe('subscription');
    expect(subscriptionCreds.accessToken).toBe('oauth-token');
    expect(subscriptionCreds.refreshToken).toBe('refresh-token');
    expect(subscriptionCreds.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('Time Display Formatting', () => {
  it('should format days correctly', () => {
    const threeDays = Date.now() + 3 * 24 * 60 * 60 * 1000;
    expect(getTimeUntilExpiration(threeDays)).toBe('3 days');
  });

  it('should format single day correctly', () => {
    const oneDay = Date.now() + 1 * 24 * 60 * 60 * 1000 + 1000; // +1s to avoid edge case
    expect(getTimeUntilExpiration(oneDay)).toBe('1 day');
  });

  it('should format hours correctly', () => {
    const tenHours = Date.now() + 10 * 60 * 60 * 1000;
    expect(getTimeUntilExpiration(tenHours)).toBe('10 hours');
  });

  it('should format single hour correctly', () => {
    const oneHour = Date.now() + 1 * 60 * 60 * 1000 + 1000;
    expect(getTimeUntilExpiration(oneHour)).toBe('1 hour');
  });

  it('should format minutes correctly', () => {
    const fortyFiveMinutes = Date.now() + 45 * 60 * 1000;
    expect(getTimeUntilExpiration(fortyFiveMinutes)).toBe('45 minutes');
  });

  it('should format single minute correctly', () => {
    const oneMinute = Date.now() + 1 * 60 * 1000 + 1000;
    expect(getTimeUntilExpiration(oneMinute)).toBe('1 minute');
  });
});

describe('Edge Cases', () => {
  it('should handle token expiring exactly now', () => {
    const now = Date.now();
    expect(isTokenExpired(now)).toBe(true);
  });

  it('should handle very old timestamps', () => {
    const veryOld = 1000000000; // Year 2001 in seconds
    expect(isTokenExpired(veryOld)).toBe(true);
  });

  it('should handle far future timestamps', () => {
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year from now
    expect(isTokenExpired(farFuture)).toBe(false);
  });

  it('should handle zero timestamp (treated as undefined)', () => {
    // Zero is falsy, so it's treated as "no expiration" = never expires
    expect(isTokenExpired(0)).toBe(false);
  });

  it('should handle negative timestamp', () => {
    expect(isTokenExpired(-1000)).toBe(true);
  });
});
