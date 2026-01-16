/**
 * Provider Factory
 * Central factory for creating and managing AI provider instances.
 * Supports multi-provider orchestration with automatic fallback.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { BaseProvider, type AgentMessage, type QueryOptions } from './base-provider.js';
import { AnthropicProvider, createAnthropicProvider } from './anthropic-provider.js';
import { OpenAIProvider, createOpenAIProvider } from './openai-provider.js';
import { GoogleProvider, createGoogleProvider } from './google-provider.js';
import { CursorProvider, createCursorProvider } from './cursor-provider.js';
import {
  type ProviderName,
  PROVIDER_CONFIGS,
  getEnabledProviders,
  getProviderConfig,
} from '../config/provider-config.js';

/**
 * Provider registry - singleton instances
 */
const providerRegistry: Map<ProviderName, BaseProvider> = new Map();

/**
 * Get or create a provider instance
 */
export function getProvider(name: ProviderName, apiKey?: string): BaseProvider {
  // Check if already created
  let provider = providerRegistry.get(name);
  if (provider) {
    // Update API key if provided
    if (apiKey && 'setApiKey' in provider) {
      (provider as AnthropicProvider).setApiKey(apiKey);
    }
    return provider;
  }

  // Create new provider
  provider = createProvider(name, apiKey);
  providerRegistry.set(name, provider);
  return provider;
}

/**
 * Create a new provider instance
 */
export function createProvider(name: ProviderName, apiKey?: string): BaseProvider {
  switch (name) {
    case 'anthropic':
      return createAnthropicProvider(apiKey);
    case 'openai':
      return createOpenAIProvider(apiKey);
    case 'google':
      return createGoogleProvider(apiKey);
    case 'cursor':
      return createCursorProvider(apiKey);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

/**
 * Get all available providers (initialized and authenticated)
 */
export async function getAvailableProviders(): Promise<BaseProvider[]> {
  const available: BaseProvider[] = [];

  for (const config of Object.values(PROVIDER_CONFIGS)) {
    if (!config.enabled) continue;

    try {
      const provider = getProvider(config.name);
      const isValid = await provider.validateCredentials();
      if (isValid) {
        available.push(provider);
      }
    } catch {
      // Provider not available (SDK not installed, etc.)
      continue;
    }
  }

  return available;
}

/**
 * Check which providers are available and return their status
 */
export async function getProviderStatuses(): Promise<Map<ProviderName, {
  available: boolean;
  authenticated: boolean;
  error?: string;
}>> {
  const statuses = new Map<ProviderName, {
    available: boolean;
    authenticated: boolean;
    error?: string;
  }>();

  for (const config of Object.values(PROVIDER_CONFIGS)) {
    try {
      const provider = getProvider(config.name);
      const isAuthenticated = await provider.validateCredentials();

      statuses.set(config.name, {
        available: provider.getStatus().available,
        authenticated: isAuthenticated,
      });
    } catch (error) {
      statuses.set(config.name, {
        available: false,
        authenticated: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return statuses;
}

/**
 * Get the default provider (Anthropic)
 */
export function getDefaultProvider(): BaseProvider {
  return getProvider('anthropic');
}

/**
 * Clear provider registry (for testing or re-initialization)
 */
export function clearProviderRegistry(): void {
  providerRegistry.clear();
}

/**
 * Provider factory configuration
 */
export interface ProviderFactoryConfig {
  defaultProvider: ProviderName;
  fallbackEnabled: boolean;
  fallbackOrder: ProviderName[];
  credentials: Partial<Record<ProviderName, string>>;
}

/**
 * Default factory configuration
 */
const defaultFactoryConfig: ProviderFactoryConfig = {
  defaultProvider: 'anthropic',
  fallbackEnabled: true,
  fallbackOrder: ['anthropic', 'openai', 'google', 'cursor'],
  credentials: {},
};

let factoryConfig = { ...defaultFactoryConfig };

/**
 * Configure the provider factory
 */
export function configureProviderFactory(config: Partial<ProviderFactoryConfig>): void {
  factoryConfig = { ...factoryConfig, ...config };

  // Initialize providers with credentials
  for (const [name, apiKey] of Object.entries(config.credentials ?? {})) {
    if (apiKey) {
      getProvider(name as ProviderName, apiKey);
    }
  }
}

/**
 * Get current factory configuration
 */
export function getFactoryConfig(): ProviderFactoryConfig {
  return { ...factoryConfig };
}

/**
 * Execute a query with automatic fallback
 * Tries the primary provider first, then falls back to alternatives if enabled
 */
export async function* queryWithFallback(
  prompt: string,
  options: QueryOptions & { preferredProvider?: ProviderName }
): AsyncGenerator<AgentMessage, void, unknown> {
  const providerOrder = options.preferredProvider
    ? [options.preferredProvider, ...factoryConfig.fallbackOrder.filter(p => p !== options.preferredProvider)]
    : factoryConfig.fallbackOrder;

  let lastError: Error | null = null;

  for (const providerName of providerOrder) {
    const config = getProviderConfig(providerName);
    if (!config.enabled) continue;

    try {
      const provider = getProvider(providerName);

      // Check if provider is authenticated
      const isValid = await provider.validateCredentials();
      if (!isValid) continue;

      // Execute query
      for await (const message of provider.query(prompt, options)) {
        yield message;

        // If we get a successful result, we're done
        if (message.type === 'result' && message.subtype === 'success') {
          return;
        }
      }

      // If we got here without error, we're done
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Provider ${providerName} failed: ${lastError.message}`);

      if (!factoryConfig.fallbackEnabled) {
        throw lastError;
      }

      // Continue to next provider
      continue;
    }
  }

  // All providers failed
  yield {
    type: 'error',
    content: [{
      type: 'text',
      text: `All providers failed. Last error: ${lastError?.message ?? 'Unknown error'}`,
    }],
    metadata: {
      provider: factoryConfig.defaultProvider,
    },
  };
}

/**
 * Check if a specific provider is available
 */
export async function isProviderAvailable(name: ProviderName): Promise<boolean> {
  try {
    const provider = getProvider(name);
    return await provider.validateCredentials();
  } catch {
    return false;
  }
}

/**
 * Get provider by name with type assertion
 */
export function getAnthropicProvider(apiKey?: string): AnthropicProvider {
  return getProvider('anthropic', apiKey) as AnthropicProvider;
}

export function getOpenAIProvider(apiKey?: string): OpenAIProvider {
  return getProvider('openai', apiKey) as OpenAIProvider;
}

export function getGoogleProvider(apiKey?: string): GoogleProvider {
  return getProvider('google', apiKey) as GoogleProvider;
}

export function getCursorProvider(apiKey?: string): CursorProvider {
  return getProvider('cursor', apiKey) as CursorProvider;
}

// Re-export types and classes
export {
  BaseProvider,
  AnthropicProvider,
  OpenAIProvider,
  GoogleProvider,
  CursorProvider,
  type AgentMessage,
  type QueryOptions,
};

export default {
  getProvider,
  createProvider,
  getAvailableProviders,
  getProviderStatuses,
  getDefaultProvider,
  clearProviderRegistry,
  configureProviderFactory,
  getFactoryConfig,
  queryWithFallback,
  isProviderAvailable,
};
