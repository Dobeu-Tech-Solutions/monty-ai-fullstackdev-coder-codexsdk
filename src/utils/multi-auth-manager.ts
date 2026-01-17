/**
 * Multi-Provider Authentication Manager
 * Unified credential management for all supported AI providers.
 * Supports auto-migration from v1 credentials and provider-specific login flows.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { createInterface } from 'readline';
import open from 'open';
import {
  authConfig,
  PROVIDER_ENV_VARS,
  type ProviderCredentials,
  type MultiProviderCredentials,
  type AuthMethod,
  type AuthSource,
  DEFAULT_MULTI_PROVIDER_CREDENTIALS,
  isMultiProviderCredentials,
  migrateToMultiProvider,
  type UserCredentials,
} from '../config/auth-config.js';
import {
  type ProviderName,
  PROVIDER_CONFIGS,
  getProviderConfig,
} from '../config/provider-config.js';
import { detectClaudeCodeCredentials, getDaysUntilExpiration, getClaudeCodePaths } from './claude-code-detector.js';
import { isTokenExpired, refreshSubscriptionToken } from './token-refresh.js';

/**
 * Provider display information
 */
interface ProviderDisplayInfo {
  name: ProviderName;
  displayName: string;
  enabled: boolean;
  authenticated: boolean;
  method: AuthMethod | null;
  source: AuthSource | null;
  email: string | null;
  keyPreview: string | null;
  isDefault: boolean;
}

/**
 * MultiAuthManager - Singleton for managing multi-provider authentication
 */
export class MultiAuthManager {
  private static instance: MultiAuthManager;
  private credentials: MultiProviderCredentials;

  private constructor() {
    this.credentials = this.loadCredentials();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): MultiAuthManager {
    if (!MultiAuthManager.instance) {
      MultiAuthManager.instance = new MultiAuthManager();
    }
    return MultiAuthManager.instance;
  }

  /**
   * Ensure the config directory exists
   */
  private ensureConfigDir(): void {
    if (!existsSync(authConfig.configDir)) {
      mkdirSync(authConfig.configDir, { recursive: true });
    }
  }

  /**
   * Load credentials from file (auto-migrates v1 to v2 format)
   */
  public loadCredentials(): MultiProviderCredentials {
    try {
      if (existsSync(authConfig.credentialsPath)) {
        const data = readFileSync(authConfig.credentialsPath, 'utf-8');
        const parsed = JSON.parse(data);

        // Check if v2 format
        if (isMultiProviderCredentials(parsed)) {
          return parsed;
        }

        // Migrate v1 to v2
        const v1 = parsed as UserCredentials;
        const v2 = migrateToMultiProvider(v1);
        this.saveCredentials(v2);
        console.log('✓ Migrated credentials to multi-provider format (v2.0)');
        return v2;
      }
    } catch (error) {
      console.error('Failed to load credentials:', error);
    }
    return { ...DEFAULT_MULTI_PROVIDER_CREDENTIALS };
  }

  /**
   * Save credentials to file
   */
  public saveCredentials(credentials: MultiProviderCredentials): void {
    this.ensureConfigDir();
    writeFileSync(authConfig.credentialsPath, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
    });

    // On Windows, mode parameter is ignored
    if (process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        execSync(`icacls "${authConfig.credentialsPath}" /inheritance:r /grant:r "%USERNAME%:F"`, {
          stdio: 'ignore',
        });
      } catch {
        console.warn('Warning: Could not set Windows file permissions for credentials file');
      }
    }

    this.credentials = credentials;
  }

  /**
   * Get credentials for a specific provider
   */
  public getProviderCredentials(provider: ProviderName): ProviderCredentials | null {
    // Check environment variables first
    const envVars = PROVIDER_ENV_VARS[provider];
    if (envVars) {
      const apiKey = process.env[envVars.API_KEY];
      if (apiKey) {
        return {
          enabled: true,
          method: 'api_key',
          source: 'manual',
          apiKey,
        };
      }
      if (envVars.ACCESS_TOKEN) {
        const token = process.env[envVars.ACCESS_TOKEN];
        if (token) {
          return {
            enabled: true,
            method: 'subscription',
            source: 'manual',
            accessToken: token,
          };
        }
      }
    }

    // Return stored credentials
    return this.credentials.providers[provider] ?? null;
  }

  /**
   * Set credentials for a specific provider
   */
  public setProviderCredentials(
    provider: ProviderName,
    creds: ProviderCredentials
  ): void {
    this.credentials.providers[provider] = creds;
    this.saveCredentials(this.credentials);
  }

  /**
   * Remove credentials for a specific provider
   */
  public removeProviderCredentials(provider: ProviderName): void {
    delete this.credentials.providers[provider];
    this.saveCredentials(this.credentials);
  }

  /**
   * Get API key for a provider (with token refresh if needed)
   */
  public async getApiKey(provider: ProviderName): Promise<string | null> {
    const creds = this.getProviderCredentials(provider);
    if (!creds) return null;

    // Check if subscription token needs refresh
    if (creds.method === 'subscription' && creds.refreshToken && creds.expiresAt) {
      if (isTokenExpired(creds.expiresAt)) {
        console.log(`Token expired for ${provider}, attempting refresh...`);

        if (provider === 'anthropic') {
          const refreshed = await refreshSubscriptionToken(creds.refreshToken);
          if (refreshed) {
            this.setProviderCredentials(provider, {
              ...creds,
              accessToken: refreshed.subscriptionKey ?? refreshed.apiKey,
              refreshToken: refreshed.refreshToken,
              expiresAt: refreshed.expiresAt,
            });
            console.log(`✓ Token refreshed for ${provider}`);
            return refreshed.subscriptionKey ?? refreshed.apiKey ?? null;
          }
        }

        console.error(`✗ Token refresh failed for ${provider}`);
        return null;
      }
    }

    return creds.apiKey ?? creds.accessToken ?? null;
  }

  /**
   * Get API key synchronously (no refresh)
   */
  public getApiKeySync(provider: ProviderName): string | null {
    const creds = this.getProviderCredentials(provider);
    return creds?.apiKey ?? creds?.accessToken ?? null;
  }

  /**
   * Check if a provider is authenticated
   */
  public isProviderAuthenticated(provider: ProviderName): boolean {
    const creds = this.getProviderCredentials(provider);
    if (!creds || !creds.enabled) return false;

    // Check for valid credentials
    if (creds.apiKey || creds.accessToken) {
      // Check expiration for subscription tokens
      if (creds.expiresAt && creds.expiresAt < Date.now()) {
        return !!creds.refreshToken; // Can potentially be refreshed
      }
      return true;
    }

    return false;
  }

  /**
   * Check if any provider is authenticated
   */
  public isAnyProviderAuthenticated(): boolean {
    for (const provider of Object.keys(PROVIDER_CONFIGS) as ProviderName[]) {
      if (this.isProviderAuthenticated(provider)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all authenticated providers
   */
  public getAuthenticatedProviders(): ProviderName[] {
    return (Object.keys(PROVIDER_CONFIGS) as ProviderName[])
      .filter(provider => this.isProviderAuthenticated(provider));
  }

  /**
   * Get default provider
   */
  public getDefaultProvider(): ProviderName {
    return this.credentials.default_provider;
  }

  /**
   * Set default provider
   */
  public setDefaultProvider(provider: ProviderName): void {
    this.credentials.default_provider = provider;
    this.saveCredentials(this.credentials);
  }

  /**
   * Get display info for all providers
   */
  public getProviderDisplayInfo(): ProviderDisplayInfo[] {
    const result: ProviderDisplayInfo[] = [];

    for (const [name, config] of Object.entries(PROVIDER_CONFIGS)) {
      const providerName = name as ProviderName;
      const creds = this.getProviderCredentials(providerName);
      const key = creds?.apiKey ?? creds?.accessToken;

      result.push({
        name: providerName,
        displayName: config.displayName,
        enabled: config.enabled && !!creds?.enabled,
        authenticated: this.isProviderAuthenticated(providerName),
        method: creds?.method ?? null,
        source: creds?.source ?? null,
        email: creds?.email ?? null,
        keyPreview: key ? `${key.slice(0, 8)}...${key.slice(-4)}` : null,
        isDefault: providerName === this.credentials.default_provider,
      });
    }

    return result;
  }

  /**
   * Validate a provider's API key
   */
  public async validateProviderKey(provider: ProviderName, key: string): Promise<boolean> {
    const config = getProviderConfig(provider);

    try {
      switch (provider) {
        case 'anthropic': {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            }),
          });
          return response.status === 200 || response.status === 400;
        }

        case 'openai': {
          const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${key}` },
          });
          return response.status === 200;
        }

        case 'google': {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
            { method: 'GET' }
          );
          return response.status === 200;
        }

        case 'cursor': {
          const response = await fetch(`${config.apiEndpoint}/health`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${key}` },
          });
          return response.status === 200;
        }

        default:
          return true;
      }
    } catch {
      console.warn(`Could not validate ${provider} key online`);
      return true; // Assume valid if network error
    }
  }

  /**
   * Interactive login for a specific provider
   */
  public async loginProvider(
    provider: ProviderName,
    options?: { key?: string; method?: AuthMethod }
  ): Promise<boolean> {
    const config = getProviderConfig(provider);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const question = (prompt: string): Promise<string> =>
      new Promise(resolve => rl.question(prompt, answer => resolve(answer.trim())));

    try {
      // Special handling for Anthropic (auto-detect Claude Code)
      if (provider === 'anthropic' && !options?.key) {
        console.log('\nChecking for existing Claude Code subscription credentials...');
        console.log('  Checking paths:', getClaudeCodePaths().join(', '));

        const claudeCreds = await detectClaudeCodeCredentials();
        if (claudeCreds) {
          console.log('✓ Found Claude Code subscription credentials!');
          const daysRemaining = getDaysUntilExpiration(claudeCreds.expiresAt);
          if (daysRemaining !== null) {
            console.log(`✓ Token is valid (expires in ${daysRemaining} days)`);
          }

          this.setProviderCredentials('anthropic', {
            enabled: true,
            method: 'subscription',
            source: 'auto-detect',
            accessToken: claudeCreds.accessToken,
            refreshToken: claudeCreds.refreshToken,
            expiresAt: claudeCreds.expiresAt
              ? (claudeCreds.expiresAt > 1e12 ? claudeCreds.expiresAt : claudeCreds.expiresAt * 1000)
              : undefined,
            tier: claudeCreds.tier ?? 'pro',
          });

          console.log('✓ Imported successfully');
          rl.close();
          return true;
        }
        console.log('No Claude Code subscription credentials found.');
      }

      // Manual key entry
      console.log(`\n─────────────────────────────────────────────────────────────`);
      console.log(`  ${config.displayName} Setup`);
      console.log(`─────────────────────────────────────────────────────────────\n`);

      let key = options?.key ?? '';

      if (!key) {
        const envVar = PROVIDER_ENV_VARS[provider]?.API_KEY;
        if (envVar && process.env[envVar]) {
          const useEnv = await question(`Use existing ${envVar} environment variable? (Y/n): `);
          if (useEnv.toLowerCase() !== 'n') {
            key = process.env[envVar]!;
          }
        }
      }

      if (!key) {
        const consoleUrls: Record<ProviderName, string> = {
          anthropic: 'https://console.anthropic.com/settings/keys',
          openai: 'https://platform.openai.com/api-keys',
          google: 'https://aistudio.google.com/app/apikey',
          cursor: 'https://cursor.com/settings/api',
        };

        console.log(`To get your API key, visit: ${consoleUrls[provider]}\n`);

        const openBrowser = await question('Open browser to get API key? (y/N): ');
        if (openBrowser.toLowerCase() === 'y') {
          try {
            await open(consoleUrls[provider]);
            console.log('✓ Browser opened\n');
          } catch {
            console.log('Could not open browser. Please visit the URL manually.\n');
          }
        }

        const keyPrefixes: Record<ProviderName, string> = {
          anthropic: 'sk-ant-...',
          openai: 'sk-...',
          google: 'AIza...',
          cursor: 'cur_...',
        };

        key = await question(`API key (${keyPrefixes[provider]}): `);
      }

      if (!key || key.length < 10) {
        console.log('\n✗ Error: Invalid key format.');
        rl.close();
        return false;
      }

      // Validate key
      console.log('\nValidating credentials...');
      const isValid = await this.validateProviderKey(provider, key);

      if (!isValid) {
        console.log('\n✗ Error: Could not validate credentials.');
        rl.close();
        return false;
      }

      console.log('✓ Credentials validated');

      // Get optional email
      const email = await question('\nEmail (optional, press Enter to skip): ');

      // Save credentials
      this.setProviderCredentials(provider, {
        enabled: true,
        method: 'api_key',
        source: 'manual',
        apiKey: key,
        email: email || undefined,
      });

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log(`                    ✓ ${config.displayName} Login Successful!`);
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log(`  Key: ${key.slice(0, 8)}...${key.slice(-4)}`);
      if (email) console.log(`  Email: ${email}`);
      console.log(`\n  Credentials saved to: ~/.monty/credentials.json\n`);

      rl.close();
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      rl.close();
      return false;
    }
  }

  /**
   * Interactive login for all providers
   */
  public async loginAll(): Promise<void> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const question = (prompt: string): Promise<string> =>
      new Promise(resolve => rl.question(prompt, answer => resolve(answer.trim())));

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    Monty Multi-Provider Login                 ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║                                                               ║');
    console.log('║  Available Providers:                                         ║');

    const providerInfo = this.getProviderDisplayInfo();
    for (const info of providerInfo) {
      const status = info.authenticated ? '✓ Configured' : '○ Not configured';
      const defaultMarker = info.isDefault ? ' ★' : '';
      console.log(`║  [${info.name.slice(0, 1).toUpperCase()}] ${info.displayName.padEnd(20)} ${status}${defaultMarker}`);
    }

    console.log('║                                                               ║');
    console.log('║  [A] Configure all providers                                  ║');
    console.log('║  [S] Skip - use only configured providers                     ║');
    console.log('║                                                               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    const choice = await question('\nSelect option: ');
    rl.close();

    if (choice.toLowerCase() === 's') {
      return;
    }

    if (choice.toLowerCase() === 'a') {
      for (const provider of ['anthropic', 'openai', 'google', 'cursor'] as ProviderName[]) {
        await this.loginProvider(provider);
      }
      return;
    }

    // Map single letter choices to providers
    const choiceMap: Record<string, ProviderName> = {
      'a': 'anthropic',
      '1': 'anthropic',
      'o': 'openai',
      '2': 'openai',
      'g': 'google',
      '3': 'google',
      'c': 'cursor',
      '4': 'cursor',
    };

    const provider = choiceMap[choice.toLowerCase()];
    if (provider) {
      await this.loginProvider(provider);
    }
  }

  /**
   * Logout from a specific provider
   */
  public logoutProvider(provider: ProviderName): void {
    const wasAuthenticated = this.isProviderAuthenticated(provider);
    this.removeProviderCredentials(provider);

    if (wasAuthenticated) {
      console.log(`\n✓ Logged out from ${getProviderConfig(provider).displayName}`);
    } else {
      console.log(`\nNo credentials found for ${getProviderConfig(provider).displayName}`);
    }
  }

  /**
   * Logout from all providers
   */
  public logoutAll(): void {
    const wasAuthenticated = this.isAnyProviderAuthenticated();

    try {
      if (existsSync(authConfig.credentialsPath)) {
        unlinkSync(authConfig.credentialsPath);
      }
      if (existsSync(authConfig.sessionPath)) {
        unlinkSync(authConfig.sessionPath);
      }
    } catch {
      // Ignore errors during cleanup
    }

    this.credentials = { ...DEFAULT_MULTI_PROVIDER_CREDENTIALS };

    if (wasAuthenticated) {
      console.log('\n✓ Logged out from all providers');
      console.log('  Credentials removed from ~/.monty/credentials.json\n');
    } else {
      console.log('\nNo credentials were stored.\n');
    }
  }

  /**
   * Mark a provider as opted out (skipped during initial setup)
   */
  public markProviderOptedOut(provider: ProviderName): void {
    if (!this.credentials.optedOutProviders) {
      this.credentials.optedOutProviders = [];
    }
    if (!this.credentials.optedOutProviders.includes(provider)) {
      this.credentials.optedOutProviders.push(provider);
      this.saveCredentials(this.credentials);
    }
  }

  /**
   * Get list of opted-out providers
   */
  public getOptedOutProviders(): ProviderName[] {
    return this.credentials.optedOutProviders || [];
  }

  /**
   * Check if a provider is opted out
   */
  public isProviderOptedOut(provider: ProviderName): boolean {
    return this.getOptedOutProviders().includes(provider);
  }

  /**
   * Add a provider after initialization (removes from opted-out list and prompts for credentials)
   */
  public async addProviderAfterInit(provider: ProviderName): Promise<boolean> {
    // Remove from opted-out list if present
    if (this.credentials.optedOutProviders) {
      this.credentials.optedOutProviders = this.credentials.optedOutProviders.filter(
        p => p !== provider
      );
      this.saveCredentials(this.credentials);
    }

    // Check if already authenticated
    if (this.isProviderAuthenticated(provider)) {
      console.log(`\n✓ ${getProviderConfig(provider).displayName} is already configured.`);
      return true;
    }

    // Prompt for credentials
    console.log(`\nAdding ${getProviderConfig(provider).displayName}...`);
    const success = await this.loginProvider(provider);
    
    if (success) {
      console.log(`\n✓ ${getProviderConfig(provider).displayName} has been added and will be included in future initialization workflows.`);
    }
    
    return success;
  }

  /**
   * Display current auth status (whoami)
   */
  public whoami(): void {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                 Monty Agent - Current User                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const providerInfo = this.getProviderDisplayInfo();
    let anyAuthenticated = false;

    console.log('  Provider                Status        Auth Method');
    console.log('  ─────────────────────────────────────────────────────────────');

    for (const info of providerInfo) {
      const status = info.authenticated ? '✓ Authenticated' : '○ Not configured';
      const method = info.method ?? '-';
      const defaultMarker = info.isDefault ? ' ★' : '';
      console.log(`  ${info.displayName.padEnd(22)} ${status.padEnd(14)} ${method}${defaultMarker}`);

      if (info.authenticated) anyAuthenticated = true;
    }

    if (!anyAuthenticated) {
      console.log('\n  No providers authenticated.');
      console.log('  Run "montyx login" to authenticate.\n');
      return;
    }

    console.log(`\n  Default Provider: ${this.credentials.default_provider}`);
    console.log(`  Credentials: ~/.monty/credentials.json`);
    console.log('');
  }

  /**
   * Set environment variables for all authenticated providers
   */
  public setEnvForChildProcess(): void {
    for (const provider of Object.keys(PROVIDER_CONFIGS) as ProviderName[]) {
      const key = this.getApiKeySync(provider);
      const envVar = PROVIDER_ENV_VARS[provider]?.API_KEY;
      if (key && envVar) {
        process.env[envVar] = key;
      }
    }

    // Log authentication status
    const authenticated = this.getAuthenticatedProviders();
    if (authenticated.length > 0) {
      console.log(`✓ Authentication configured: ${authenticated.join(', ')}`);
    }
  }

  /**
   * Get preferences
   */
  public getPreferences(): MultiProviderCredentials['preferences'] {
    return { ...this.credentials.preferences };
  }

  /**
   * Update preferences
   */
  public setPreferences(prefs: Partial<MultiProviderCredentials['preferences']>): void {
    this.credentials.preferences = { ...this.credentials.preferences, ...prefs };
    this.saveCredentials(this.credentials);
  }
}

// Export singleton instance
export const multiAuthManager = MultiAuthManager.getInstance();

// Export convenience functions
export function getApiKey(provider: ProviderName): Promise<string | null> {
  return multiAuthManager.getApiKey(provider);
}

export function getApiKeySync(provider: ProviderName): string | null {
  return multiAuthManager.getApiKeySync(provider);
}

export function isProviderAuthenticated(provider: ProviderName): boolean {
  return multiAuthManager.isProviderAuthenticated(provider);
}

export function getAuthenticatedProviders(): ProviderName[] {
  return multiAuthManager.getAuthenticatedProviders();
}

export function loginProvider(provider: ProviderName): Promise<boolean> {
  return multiAuthManager.loginProvider(provider);
}

export function loginAll(): Promise<void> {
  return multiAuthManager.loginAll();
}

export function logoutProvider(provider: ProviderName): void {
  multiAuthManager.logoutProvider(provider);
}

export function logoutAll(): void {
  multiAuthManager.logoutAll();
}

export function whoami(): void {
  multiAuthManager.whoami();
}

export function setEnvForChildProcess(): void {
  multiAuthManager.setEnvForChildProcess();
}

export default multiAuthManager;
