/**
 * Terms of Service Warning System
 * Warns users about potential ToS violations when using subscription credentials
 * for automated or commercial purposes.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { type ProviderName } from '../config/provider-config.js';
import { type AuthMethod, type AuthSource } from '../config/auth-config.js';

/**
 * ToS compliance status
 */
export interface TosComplianceStatus {
  isCompliant: boolean;
  warnings: TosWarning[];
  recommendations: string[];
}

/**
 * Individual ToS warning
 */
export interface TosWarning {
  provider: ProviderName;
  severity: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
  link?: string;
  action?: string;
}

/**
 * Provider ToS policies
 */
export interface ProviderTosPolicy {
  name: string;
  allowsAutomation: boolean;
  requiresApiKey: boolean;
  subscriptionRestrictions: string[];
  tosUrl: string;
  apiKeyUrl: string;
}

/**
 * Provider ToS policies
 */
export const PROVIDER_TOS_POLICIES: Record<ProviderName, ProviderTosPolicy> = {
  anthropic: {
    name: 'Anthropic',
    allowsAutomation: false, // Subscription is for interactive Claude use
    requiresApiKey: true,
    subscriptionRestrictions: [
      'Claude Pro/Team subscriptions are for interactive use via claude.ai',
      'Automated or programmatic use requires an API key',
      'SDK usage should use API keys, not subscription tokens',
    ],
    tosUrl: 'https://www.anthropic.com/legal/consumer-terms',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
  },

  openai: {
    name: 'OpenAI',
    allowsAutomation: false, // ChatGPT Plus is for interactive use
    requiresApiKey: true,
    subscriptionRestrictions: [
      'ChatGPT Plus is for personal, interactive use via chatgpt.com',
      'API access requires a separate API key',
      'Commercial or automated use needs API billing',
    ],
    tosUrl: 'https://openai.com/policies/terms-of-use',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },

  google: {
    name: 'Google',
    allowsAutomation: true, // Gemini Code Assist allows programmatic use
    requiresApiKey: false, // gcloud auth is acceptable
    subscriptionRestrictions: [
      'Free tier has usage quotas',
      'Commercial use may require paid tier',
    ],
    tosUrl: 'https://ai.google.dev/terms',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
  },

  cursor: {
    name: 'Cursor',
    allowsAutomation: true, // Cursor is designed for developer automation
    requiresApiKey: false,
    subscriptionRestrictions: [
      'Cursor Pro subscription includes automation features',
      'Usage within Cursor editor is expected',
    ],
    tosUrl: 'https://www.cursor.com/terms',
    apiKeyUrl: 'https://www.cursor.com/settings',
  },
};

/**
 * Check if running in automation context
 */
export function isAutomationContext(): boolean {
  // Check common CI/CD environment variables
  const ciEnvVars = [
    'CI',
    'CONTINUOUS_INTEGRATION',
    'BUILD_NUMBER',
    'JENKINS_URL',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'CIRCLECI',
    'TRAVIS',
    'AZURE_PIPELINES',
  ];

  for (const envVar of ciEnvVars) {
    if (process.env[envVar]) {
      return true;
    }
  }

  // Check for automation-specific flag
  if (process.env.MONTY_AUTOMATION_MODE === 'true') {
    return true;
  }

  // Check if running non-interactively
  if (!process.stdin.isTTY && !process.env.TERM) {
    return true;
  }

  return false;
}

/**
 * Check ToS compliance for a specific provider
 */
export function checkProviderCompliance(
  provider: ProviderName,
  authMethod: AuthMethod,
  authSource?: AuthSource
): TosComplianceStatus {
  const policy = PROVIDER_TOS_POLICIES[provider];
  const warnings: TosWarning[] = [];
  const recommendations: string[] = [];
  const isAutomation = isAutomationContext();

  // Check subscription use in automation
  if (authMethod === 'subscription' && isAutomation && !policy.allowsAutomation) {
    warnings.push({
      provider,
      severity: 'critical',
      code: 'SUBSCRIPTION_IN_AUTOMATION',
      message: `Using ${policy.name} subscription in automation may violate Terms of Service`,
      link: policy.tosUrl,
      action: `Consider using an API key instead: ${policy.apiKeyUrl}`,
    });

    recommendations.push(
      `Switch to API key authentication for ${policy.name}`,
      `Get an API key at: ${policy.apiKeyUrl}`
    );
  }

  // Warn about subscription use for programmatic access
  if (authMethod === 'subscription' && policy.requiresApiKey) {
    warnings.push({
      provider,
      severity: 'warning',
      code: 'SUBSCRIPTION_FOR_API',
      message: `${policy.name} subscriptions are intended for interactive use, not API access`,
      link: policy.tosUrl,
    });

    for (const restriction of policy.subscriptionRestrictions) {
      recommendations.push(restriction);
    }
  }

  // Warn about auto-detected credentials in automation
  if (authSource === 'auto-detect' && isAutomation) {
    warnings.push({
      provider,
      severity: 'warning',
      code: 'AUTO_DETECT_IN_AUTOMATION',
      message: 'Auto-detected credentials being used in automation context',
      action: 'Set explicit API key via environment variable',
    });

    recommendations.push(
      `Set ${provider.toUpperCase()}_API_KEY environment variable for CI/CD`
    );
  }

  return {
    isCompliant: warnings.filter(w => w.severity === 'critical').length === 0,
    warnings,
    recommendations,
  };
}

/**
 * Format warnings for display
 */
export function formatWarnings(status: TosComplianceStatus): string {
  if (status.warnings.length === 0) {
    return '';
  }

  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════════════════════╗');
  lines.push('║                        TERMS OF SERVICE NOTICE                               ║');
  lines.push('╚══════════════════════════════════════════════════════════════════════════════╝');
  lines.push('');

  for (const warning of status.warnings) {
    const icon =
      warning.severity === 'critical' ? '🚫' :
      warning.severity === 'warning' ? '⚠️' : 'ℹ️';

    lines.push(`${icon} [${warning.code}] ${warning.message}`);

    if (warning.action) {
      lines.push(`   Action: ${warning.action}`);
    }

    if (warning.link) {
      lines.push(`   More info: ${warning.link}`);
    }

    lines.push('');
  }

  if (status.recommendations.length > 0) {
    lines.push('Recommendations:');
    for (const rec of status.recommendations) {
      lines.push(`  • ${rec}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * TOS Warning Manager class
 */
export class TosWarningManager {
  private acknowledgedWarnings: Set<string> = new Set();
  private lastCheckTime: number = 0;
  private checkIntervalMs: number = 60 * 60 * 1000; // 1 hour
  private warningCallbacks: Array<(warnings: TosWarning[]) => void> = [];

  /**
   * Check compliance for all active providers
   */
  checkAllProviders(
    activeProviders: Array<{
      provider: ProviderName;
      authMethod: AuthMethod;
      authSource?: AuthSource;
    }>
  ): TosComplianceStatus {
    const allWarnings: TosWarning[] = [];
    const allRecommendations: string[] = [];

    for (const { provider, authMethod, authSource } of activeProviders) {
      const status = checkProviderCompliance(provider, authMethod, authSource);
      allWarnings.push(...status.warnings);
      allRecommendations.push(...status.recommendations);
    }

    // Dedupe recommendations
    const uniqueRecommendations = [...new Set(allRecommendations)];

    return {
      isCompliant: allWarnings.filter(w => w.severity === 'critical').length === 0,
      warnings: allWarnings,
      recommendations: uniqueRecommendations,
    };
  }

  /**
   * Display warnings if not recently checked
   */
  displayWarningsIfNeeded(
    providers: Array<{
      provider: ProviderName;
      authMethod: AuthMethod;
      authSource?: AuthSource;
    }>
  ): boolean {
    const now = Date.now();

    // Skip if recently checked
    if (now - this.lastCheckTime < this.checkIntervalMs) {
      return false;
    }

    this.lastCheckTime = now;

    const status = this.checkAllProviders(providers);

    // Filter out acknowledged warnings
    const newWarnings = status.warnings.filter(
      w => !this.acknowledgedWarnings.has(`${w.provider}-${w.code}`)
    );

    if (newWarnings.length === 0) {
      return false;
    }

    // Display warnings
    const formatted = formatWarnings({ ...status, warnings: newWarnings });
    if (formatted) {
      console.log(formatted);
    }

    // Trigger callbacks
    this.warningCallbacks.forEach(cb => cb(newWarnings));

    return newWarnings.length > 0;
  }

  /**
   * Acknowledge a warning (won't show again this session)
   */
  acknowledgeWarning(provider: ProviderName, code: string): void {
    this.acknowledgedWarnings.add(`${provider}-${code}`);
  }

  /**
   * Acknowledge all current warnings
   */
  acknowledgeAll(warnings: TosWarning[]): void {
    for (const warning of warnings) {
      this.acknowledgedWarnings.add(`${warning.provider}-${warning.code}`);
    }
  }

  /**
   * Register warning callback
   */
  onWarning(callback: (warnings: TosWarning[]) => void): void {
    this.warningCallbacks.push(callback);
  }

  /**
   * Set check interval
   */
  setCheckInterval(intervalMs: number): void {
    this.checkIntervalMs = intervalMs;
  }

  /**
   * Force next check
   */
  forceNextCheck(): void {
    this.lastCheckTime = 0;
  }

  /**
   * Get policy for a provider
   */
  getPolicy(provider: ProviderName): ProviderTosPolicy {
    return PROVIDER_TOS_POLICIES[provider];
  }
}

/**
 * Create a ToS warning manager
 */
export function createTosWarningManager(): TosWarningManager {
  return new TosWarningManager();
}

/**
 * Quick check for subscription compliance
 */
export function warnIfSubscriptionInAutomation(
  provider: ProviderName,
  authMethod: AuthMethod
): void {
  if (authMethod !== 'subscription') {
    return;
  }

  if (!isAutomationContext()) {
    return;
  }

  const policy = PROVIDER_TOS_POLICIES[provider];
  if (policy.allowsAutomation) {
    return;
  }

  console.warn(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                              ⚠️  WARNING                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝

You are using a ${policy.name} subscription in an automation context.
This may violate the Terms of Service.

Subscription credentials are typically intended for interactive use.
For automated or programmatic use, please use an API key.

Get an API key at: ${policy.apiKeyUrl}
Terms of Service: ${policy.tosUrl}

To suppress this warning, set ${provider.toUpperCase()}_API_KEY environment variable.
`);
}

export default TosWarningManager;
