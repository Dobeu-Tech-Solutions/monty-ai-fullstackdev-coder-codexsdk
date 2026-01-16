/**
 * Authentication Configuration
 * Configuration for multi-provider authentication (Anthropic, OpenAI, Google, Cursor).
 * Supports Claude subscription, API keys, and OAuth flows.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { join } from 'path';
import { homedir } from 'os';
import type { ProviderName } from './provider-config.js';

/**
 * Authentication method types
 * - subscription: Subscription-based auth (Claude.ai, OpenAI Plus, etc.) via OAuth
 * - api_key: API key from provider console
 * - oauth: OAuth 2.0 flow
 */
export type AuthMethod = 'api_key' | 'subscription' | 'oauth';

/**
 * Authentication source - how credentials were obtained
 */
export type AuthSource = 'oauth' | 'auto-detect' | 'manual';

/**
 * Subscription tier levels
 */
export type SubscriptionTier = 'free' | 'pro' | 'max' | 'team' | 'enterprise';

/**
 * User credentials interface
 */
export interface UserCredentials {
  method: AuthMethod;
  source?: AuthSource;
  apiKey?: string;              // For api_key method
  subscriptionKey?: string;     // For subscription method (OAuth token)
  accessToken?: string;         // OAuth access token
  refreshToken?: string;        // OAuth refresh token
  expiresAt?: number;           // Token expiration timestamp (ms)
  userId?: string;
  email?: string;
  tier?: SubscriptionTier;
}

/**
 * Auth session state
 */
export interface AuthSession {
  isAuthenticated: boolean;
  credentials: UserCredentials | null;
  lastValidated: number | null;
}

/**
 * Auth configuration interface
 */
export interface AuthConfig {
  /** Path to store credentials */
  credentialsPath: string;
  /** Path to store session info */
  sessionPath: string;
  /** Config directory */
  configDir: string;
  /** Claude.ai subscription OAuth endpoints */
  oauth: {
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    redirectUri: string;
    scopes: string[];
  };
  /** Paths to check for Claude Code credentials (auto-detection) */
  claudeCodePaths: string[];
  /** Token validation settings */
  validation: {
    /** How often to revalidate credentials (ms) */
    revalidateInterval: number;
    /** Grace period before token expiry to refresh (ms) */
    refreshGracePeriod: number;
  };
  /** Supported authentication methods */
  supportedMethods: AuthMethod[];
}

// Get user's home config directory
const configDir = join(homedir(), '.monty');

/**
 * Default authentication configuration
 */
export const authConfig: AuthConfig = {
  credentialsPath: join(configDir, 'credentials.json'),
  sessionPath: join(configDir, 'session.json'),
  configDir,
  oauth: {
    // Claude.ai subscription OAuth endpoints
    authorizationUrl: 'https://claude.ai/oauth/authorize',
    tokenUrl: 'https://claude.ai/oauth/token',
    clientId: 'monty-fullstack-agent',
    redirectUri: 'http://localhost:9876/callback',
    scopes: ['subscription', 'agent'],
  },
  // Claude Code credential paths for auto-detection
  claudeCodePaths: [
    join(homedir(), '.config', 'claude-code', 'auth.json'),  // Linux/Windows standard
    join(homedir(), '.claude', 'credentials.json'),          // Alternative location
    join(homedir(), '.claude', 'auth.json'),                 // Alternative location
  ],
  validation: {
    revalidateInterval: 24 * 60 * 60 * 1000, // 24 hours
    refreshGracePeriod: 5 * 60 * 1000, // 5 minutes
  },
  supportedMethods: ['api_key', 'subscription'],
};

/**
 * Environment variable names for auth (legacy - Anthropic only)
 */
export const AUTH_ENV_VARS = {
  API_KEY: 'ANTHROPIC_API_KEY',
  SUBSCRIPTION_KEY: 'ANTHROPIC_SUBSCRIPTION_KEY',
  ACCESS_TOKEN: 'ANTHROPIC_ACCESS_TOKEN',
} as const;

/**
 * Environment variable names per provider
 */
export const PROVIDER_ENV_VARS: Record<ProviderName, {
  API_KEY: string;
  SUBSCRIPTION_KEY?: string;
  ACCESS_TOKEN?: string;
}> = {
  anthropic: {
    API_KEY: 'ANTHROPIC_API_KEY',
    SUBSCRIPTION_KEY: 'ANTHROPIC_SUBSCRIPTION_KEY',
    ACCESS_TOKEN: 'ANTHROPIC_ACCESS_TOKEN',
  },
  openai: {
    API_KEY: 'OPENAI_API_KEY',
    ACCESS_TOKEN: 'OPENAI_ACCESS_TOKEN',
  },
  google: {
    API_KEY: 'GOOGLE_API_KEY',
    ACCESS_TOKEN: 'GOOGLE_ACCESS_TOKEN',
  },
  cursor: {
    API_KEY: 'CURSOR_API_KEY',
  },
};

/**
 * Provider-specific credentials
 */
export interface ProviderCredentials {
  enabled: boolean;
  method: AuthMethod;
  source: AuthSource | null;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  organizationId?: string;
  projectId?: string;
  email?: string;
  tier?: string;
}

/**
 * Multi-provider credentials store (v2.0)
 */
export interface MultiProviderCredentials {
  version: string;
  default_provider: ProviderName;
  providers: Partial<Record<ProviderName, ProviderCredentials>>;
  preferences: {
    cost_tracking: boolean;
    monthly_budget_usd: number;
    prefer_subscription: boolean;
  };
}

/**
 * Default multi-provider credentials structure
 */
export const DEFAULT_MULTI_PROVIDER_CREDENTIALS: MultiProviderCredentials = {
  version: '2.0.0',
  default_provider: 'anthropic',
  providers: {},
  preferences: {
    cost_tracking: true,
    monthly_budget_usd: 100,
    prefer_subscription: true,
  },
};

/**
 * Check if credentials are in v2 (multi-provider) format
 */
export function isMultiProviderCredentials(data: unknown): data is MultiProviderCredentials {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.version === 'string' &&
    obj.version.startsWith('2.') &&
    typeof obj.providers === 'object'
  );
}

/**
 * Migrate v1 credentials to v2 format
 */
export function migrateToMultiProvider(v1Credentials: UserCredentials): MultiProviderCredentials {
  return {
    version: '2.0.0',
    default_provider: 'anthropic',
    providers: {
      anthropic: {
        enabled: true,
        method: v1Credentials.method,
        source: v1Credentials.source ?? null,
        apiKey: v1Credentials.apiKey,
        accessToken: v1Credentials.accessToken ?? v1Credentials.subscriptionKey,
        refreshToken: v1Credentials.refreshToken,
        expiresAt: v1Credentials.expiresAt,
        email: v1Credentials.email,
        tier: v1Credentials.tier,
      },
    },
    preferences: {
      cost_tracking: true,
      monthly_budget_usd: 100,
      prefer_subscription: v1Credentials.method === 'subscription',
    },
  };
}

/**
 * Get the credentials file path
 */
export function getCredentialsPath(): string {
  return authConfig.credentialsPath;
}

/**
 * Get the session file path
 */
export function getSessionPath(): string {
  return authConfig.sessionPath;
}

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  return authConfig.configDir;
}

export default authConfig;
