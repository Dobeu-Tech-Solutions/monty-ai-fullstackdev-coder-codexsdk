/**
 * Test Fixtures - Mock Credentials
 * Provides mock credential objects for testing authentication flows.
 */

import type {
  UserCredentials,
  ProviderCredentials,
  MultiProviderCredentials,
} from '../../../src/config/auth-config';
import type { ProviderName } from '../../../src/config/provider-config';

/**
 * Mock API Keys by Provider
 */
export const MOCK_API_KEYS: Record<ProviderName, string> = {
  anthropic: 'sk-ant-api03-test123456789abcdefghijklmnopqrstuvwxyz',
  openai: 'sk-proj-test123456789abcdefghijklmnopqrstuvwxyz',
  google: 'AIzaSyB-test123456789abcdefghijklmnopqrstuvwxyz',
  cursor: 'cur_test123456789abcdefghijklmnopqrstuvwxyz',
};

/**
 * Mock OAuth Tokens
 */
export const MOCK_OAUTH_TOKENS = {
  accessToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.mock_access_token',
  refreshToken: 'rt_mock_refresh_token_1234567890',
  expiresAtValid: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
  expiresAtExpired: Date.now() - 60 * 60 * 1000, // 1 hour ago
  expiresAtExpiring: Date.now() + 4 * 60 * 1000, // 4 minutes (within grace period)
};

/**
 * Mock V1 (Legacy) Credentials
 */
export const MOCK_V1_CREDENTIALS: Record<string, UserCredentials> = {
  apiKey: {
    method: 'api_key',
    source: 'manual',
    apiKey: MOCK_API_KEYS.anthropic,
    email: 'test@example.com',
  },

  subscription: {
    method: 'subscription',
    source: 'auto-detect',
    subscriptionKey: MOCK_OAUTH_TOKENS.accessToken,
    refreshToken: MOCK_OAUTH_TOKENS.refreshToken,
    expiresAt: MOCK_OAUTH_TOKENS.expiresAtValid,
    tier: 'pro',
    email: 'subscriber@example.com',
    userId: 'user_123456',
  },

  expired: {
    method: 'subscription',
    source: 'auto-detect',
    subscriptionKey: MOCK_OAUTH_TOKENS.accessToken,
    refreshToken: MOCK_OAUTH_TOKENS.refreshToken,
    expiresAt: MOCK_OAUTH_TOKENS.expiresAtExpired,
    tier: 'pro',
  },
};

/**
 * Mock Provider Credentials
 */
export const MOCK_PROVIDER_CREDENTIALS: Record<ProviderName, ProviderCredentials> = {
  anthropic: {
    enabled: true,
    method: 'api_key',
    source: 'manual',
    apiKey: MOCK_API_KEYS.anthropic,
    email: 'claude-user@example.com',
    tier: 'pro',
  },

  openai: {
    enabled: true,
    method: 'api_key',
    source: 'manual',
    apiKey: MOCK_API_KEYS.openai,
    organizationId: 'org-test123',
    projectId: 'proj-test456',
  },

  google: {
    enabled: true,
    method: 'api_key',
    source: 'manual',
    apiKey: MOCK_API_KEYS.google,
    email: 'google-user@example.com',
  },

  cursor: {
    enabled: true,
    method: 'api_key',
    source: 'manual',
    apiKey: MOCK_API_KEYS.cursor,
  },
};

/**
 * Mock V2 (Multi-Provider) Credentials
 */
export const MOCK_V2_CREDENTIALS: MultiProviderCredentials = {
  version: '2.0.0',
  default_provider: 'anthropic',
  providers: {
    anthropic: MOCK_PROVIDER_CREDENTIALS.anthropic,
    openai: MOCK_PROVIDER_CREDENTIALS.openai,
    google: MOCK_PROVIDER_CREDENTIALS.google,
  },
  preferences: {
    cost_tracking: true,
    monthly_budget_usd: 100,
    prefer_subscription: true,
  },
};

/**
 * Mock subscription credentials for various tiers
 */
export const MOCK_SUBSCRIPTION_TIERS: Record<string, ProviderCredentials> = {
  free: {
    enabled: true,
    method: 'subscription',
    source: 'auto-detect',
    accessToken: MOCK_OAUTH_TOKENS.accessToken,
    tier: 'free',
  },

  pro: {
    enabled: true,
    method: 'subscription',
    source: 'auto-detect',
    accessToken: MOCK_OAUTH_TOKENS.accessToken,
    refreshToken: MOCK_OAUTH_TOKENS.refreshToken,
    expiresAt: MOCK_OAUTH_TOKENS.expiresAtValid,
    tier: 'pro',
    email: 'pro-user@example.com',
  },

  max: {
    enabled: true,
    method: 'subscription',
    source: 'auto-detect',
    accessToken: MOCK_OAUTH_TOKENS.accessToken,
    refreshToken: MOCK_OAUTH_TOKENS.refreshToken,
    expiresAt: MOCK_OAUTH_TOKENS.expiresAtValid,
    tier: 'max',
    email: 'max-user@example.com',
  },

  team: {
    enabled: true,
    method: 'subscription',
    source: 'auto-detect',
    accessToken: MOCK_OAUTH_TOKENS.accessToken,
    refreshToken: MOCK_OAUTH_TOKENS.refreshToken,
    expiresAt: MOCK_OAUTH_TOKENS.expiresAtValid,
    tier: 'team',
    organizationId: 'org-team123',
    email: 'team-user@example.com',
  },

  enterprise: {
    enabled: true,
    method: 'subscription',
    source: 'auto-detect',
    accessToken: MOCK_OAUTH_TOKENS.accessToken,
    tier: 'enterprise',
    organizationId: 'org-enterprise456',
  },
};

/**
 * Generate mock credentials file content
 */
export function generateV1CredentialsFile(creds: UserCredentials): string {
  return JSON.stringify(creds, null, 2);
}

/**
 * Generate mock V2 credentials file content
 */
export function generateV2CredentialsFile(creds: MultiProviderCredentials): string {
  return JSON.stringify(creds, null, 2);
}

/**
 * Generate mock Claude Code credentials (as would be found in ~/.claude/)
 */
export function generateClaudeCodeCredentials(): string {
  return JSON.stringify({
    accessToken: MOCK_OAUTH_TOKENS.accessToken,
    refreshToken: MOCK_OAUTH_TOKENS.refreshToken,
    expiresAt: MOCK_OAUTH_TOKENS.expiresAtValid,
    tokenType: 'bearer',
    scope: 'api',
  }, null, 2);
}

/**
 * Generate mock gcloud credentials (ADC format)
 */
export function generateGCloudCredentials(): string {
  return JSON.stringify({
    type: 'authorized_user',
    client_id: 'test-client-id.apps.googleusercontent.com',
    client_secret: 'test-client-secret',
    refresh_token: MOCK_OAUTH_TOKENS.refreshToken,
    quota_project_id: 'test-project-123',
  }, null, 2);
}

export default {
  MOCK_API_KEYS,
  MOCK_OAUTH_TOKENS,
  MOCK_V1_CREDENTIALS,
  MOCK_V2_CREDENTIALS,
  MOCK_PROVIDER_CREDENTIALS,
  MOCK_SUBSCRIPTION_TIERS,
};
