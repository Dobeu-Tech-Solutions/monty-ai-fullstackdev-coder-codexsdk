/**
 * Budget Enforcer
 * Real-time budget enforcement and quota warning system.
 * Monitors usage across providers and enforces spending limits.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { type ProviderName } from '../config/provider-config.js';

/**
 * Budget configuration
 */
export interface BudgetConfig {
  monthlyLimitUsd: number;
  dailyLimitUsd: number;
  sessionLimitUsd: number;
  warningThreshold: number; // Percentage (0-1) to trigger warning
  hardLimit: boolean; // If true, block operations when budget exceeded
  providers: Partial<Record<ProviderName, ProviderBudget>>;
}

/**
 * Per-provider budget limits
 */
export interface ProviderBudget {
  dailyLimitUsd?: number;
  monthlyLimitUsd?: number;
  requestsPerMinute?: number;
  tokensPerMinute?: number;
}

/**
 * Budget status for a time period
 */
export interface BudgetStatus {
  period: 'daily' | 'monthly' | 'session' | 'all-time';
  limitUsd: number;
  usedUsd: number;
  remainingUsd: number;
  percentUsed: number;
  isExceeded: boolean;
  isWarning: boolean;
}

/**
 * Usage tracking entry
 */
export interface UsageEntry {
  timestamp: number;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  tool?: string;
  sessionId?: string;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  provider: ProviderName;
  requestsInWindow: number;
  tokensInWindow: number;
  windowStartMs: number;
  isRateLimited: boolean;
  resetInMs: number;
}

/**
 * Default budget configuration
 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  monthlyLimitUsd: 100,
  dailyLimitUsd: 10,
  sessionLimitUsd: 5,
  warningThreshold: 0.8,
  hardLimit: false,
  providers: {
    anthropic: {
      dailyLimitUsd: 10,
      requestsPerMinute: 50,
      tokensPerMinute: 100000,
    },
    openai: {
      dailyLimitUsd: 10,
      requestsPerMinute: 60,
      tokensPerMinute: 90000,
    },
    google: {
      dailyLimitUsd: 5,
      requestsPerMinute: 60,
      tokensPerMinute: 32000,
    },
    cursor: {
      dailyLimitUsd: 5,
    },
  },
};

/**
 * Token pricing per million tokens
 */
export const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  // Claude models
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },

  // GPT models
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'o1-preview': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },

  // Gemini models
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.5-pro': { input: 1.25, output: 5 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },

  // Cursor models
  'cursor-agent': { input: 0, output: 0 }, // Subscription-based

  // Default fallback
  default: { input: 3, output: 15 },
};

/**
 * Budget Enforcer class
 */
export class BudgetEnforcer {
  private config: BudgetConfig;
  private usageLog: UsageEntry[] = [];
  private usageFilePath: string;
  private currentSessionId: string;
  private rateLimitWindows: Map<ProviderName, RateLimitStatus> = new Map();
  private warningCallbacks: Array<(status: BudgetStatus) => void> = [];
  private blockCallbacks: Array<(status: BudgetStatus) => void> = [];

  constructor(agentDir: string, config?: Partial<BudgetConfig>) {
    this.config = { ...DEFAULT_BUDGET_CONFIG, ...config };
    this.usageFilePath = join(agentDir, 'usage_log.jsonl');
    this.currentSessionId = `session-${Date.now()}`;
    this.loadUsageLog();
  }

  /**
   * Load usage log from file
   */
  private loadUsageLog(): void {
    try {
      if (!existsSync(this.usageFilePath)) {
        return;
      }

      const content = readFileSync(this.usageFilePath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      this.usageLog = lines.map(line => JSON.parse(line));
    } catch {
      this.usageLog = [];
    }
  }

  /**
   * Save usage log to file
   */
  private saveUsageLog(): void {
    try {
      const dir = dirname(this.usageFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const content = this.usageLog.map(e => JSON.stringify(e)).join('\n');
      writeFileSync(this.usageFilePath, content, 'utf-8');
    } catch {
      // Failed to save
    }
  }

  /**
   * Calculate cost for token usage
   */
  calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: string
  ): number {
    const pricing = TOKEN_PRICING[model] || TOKEN_PRICING.default;
    if (!pricing) return 0;
    return (
      (inputTokens / 1000000) * pricing.input +
      (outputTokens / 1000000) * pricing.output
    );
  }

  /**
   * Record usage
   */
  recordUsage(
    provider: ProviderName,
    model: string,
    inputTokens: number,
    outputTokens: number,
    tool?: string
  ): BudgetStatus {
    const costUsd = this.calculateCost(inputTokens, outputTokens, model);

    const entry: UsageEntry = {
      timestamp: Date.now(),
      provider,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      tool,
      sessionId: this.currentSessionId,
    };

    this.usageLog.push(entry);
    this.saveUsageLog();

    // Update rate limit tracking
    this.updateRateLimitWindow(provider, inputTokens + outputTokens);

    // Check budget status and trigger callbacks
    const status = this.checkBudget('daily');

    if (status.isWarning && !status.isExceeded) {
      this.warningCallbacks.forEach(cb => cb(status));
    }

    if (status.isExceeded) {
      this.blockCallbacks.forEach(cb => cb(status));
    }

    return status;
  }

  /**
   * Update rate limit tracking window
   */
  private updateRateLimitWindow(
    provider: ProviderName,
    tokens: number
  ): void {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window

    let status = this.rateLimitWindows.get(provider);

    if (!status || now - status.windowStartMs > windowMs) {
      status = {
        provider,
        requestsInWindow: 0,
        tokensInWindow: 0,
        windowStartMs: now,
        isRateLimited: false,
        resetInMs: windowMs,
      };
    }

    status.requestsInWindow++;
    status.tokensInWindow += tokens;
    status.resetInMs = windowMs - (now - status.windowStartMs);

    // Check rate limits
    const providerConfig = this.config.providers[provider];
    if (providerConfig) {
      const rpmLimit = providerConfig.requestsPerMinute || Infinity;
      const tpmLimit = providerConfig.tokensPerMinute || Infinity;

      status.isRateLimited =
        status.requestsInWindow >= rpmLimit ||
        status.tokensInWindow >= tpmLimit;
    }

    this.rateLimitWindows.set(provider, status);
  }

  /**
   * Check rate limit status for a provider
   */
  checkRateLimit(provider: ProviderName): RateLimitStatus | null {
    return this.rateLimitWindows.get(provider) || null;
  }

  /**
   * Check if operation should be blocked due to rate limits
   */
  isRateLimited(provider: ProviderName): boolean {
    const status = this.rateLimitWindows.get(provider);
    if (!status) return false;

    // Check if window has expired
    if (Date.now() - status.windowStartMs > 60 * 1000) {
      return false;
    }

    return status.isRateLimited;
  }

  /**
   * Check budget status
   */
  checkBudget(period: 'daily' | 'monthly' | 'session' | 'all-time'): BudgetStatus {
    const now = Date.now();
    let limitUsd: number;
    let entries: UsageEntry[];

    switch (period) {
      case 'daily':
        limitUsd = this.config.dailyLimitUsd;
        const dayStart = new Date().setHours(0, 0, 0, 0);
        entries = this.usageLog.filter(e => e.timestamp >= dayStart);
        break;

      case 'monthly':
        limitUsd = this.config.monthlyLimitUsd;
        const monthStart = new Date(new Date().setDate(1)).setHours(0, 0, 0, 0);
        entries = this.usageLog.filter(e => e.timestamp >= monthStart);
        break;

      case 'session':
        limitUsd = this.config.sessionLimitUsd;
        entries = this.usageLog.filter(e => e.sessionId === this.currentSessionId);
        break;

      case 'all-time':
        limitUsd = Infinity;
        entries = this.usageLog;
        break;

      default:
        throw new Error(`Unknown period: ${period}`);
    }

    const usedUsd = entries.reduce((sum, e) => sum + e.costUsd, 0);
    const remainingUsd = Math.max(0, limitUsd - usedUsd);
    const percentUsed = limitUsd > 0 ? usedUsd / limitUsd : 0;

    return {
      period,
      limitUsd,
      usedUsd,
      remainingUsd,
      percentUsed,
      isExceeded: percentUsed >= 1,
      isWarning: percentUsed >= this.config.warningThreshold,
    };
  }

  /**
   * Check if operation should be blocked due to budget
   */
  shouldBlock(): { blocked: boolean; reason?: string } {
    if (!this.config.hardLimit) {
      return { blocked: false };
    }

    const daily = this.checkBudget('daily');
    if (daily.isExceeded) {
      return {
        blocked: true,
        reason: `Daily budget exceeded ($${daily.usedUsd.toFixed(2)} / $${daily.limitUsd.toFixed(2)})`,
      };
    }

    const monthly = this.checkBudget('monthly');
    if (monthly.isExceeded) {
      return {
        blocked: true,
        reason: `Monthly budget exceeded ($${monthly.usedUsd.toFixed(2)} / $${monthly.limitUsd.toFixed(2)})`,
      };
    }

    const session = this.checkBudget('session');
    if (session.isExceeded) {
      return {
        blocked: true,
        reason: `Session budget exceeded ($${session.usedUsd.toFixed(2)} / $${session.limitUsd.toFixed(2)})`,
      };
    }

    return { blocked: false };
  }

  /**
   * Get usage summary
   */
  getUsageSummary(): string {
    const daily = this.checkBudget('daily');
    const monthly = this.checkBudget('monthly');
    const session = this.checkBudget('session');

    const lines: string[] = [
      '## Budget Status',
      '',
      `**Session:** $${session.usedUsd.toFixed(4)} / $${session.limitUsd.toFixed(2)} (${(session.percentUsed * 100).toFixed(1)}%)`,
      `**Today:** $${daily.usedUsd.toFixed(4)} / $${daily.limitUsd.toFixed(2)} (${(daily.percentUsed * 100).toFixed(1)}%)`,
      `**Month:** $${monthly.usedUsd.toFixed(4)} / $${monthly.limitUsd.toFixed(2)} (${(monthly.percentUsed * 100).toFixed(1)}%)`,
      '',
    ];

    if (daily.isWarning || monthly.isWarning) {
      lines.push('⚠️ **Warning:** Approaching budget limit');
    }

    if (daily.isExceeded || monthly.isExceeded) {
      lines.push('🚫 **Budget Exceeded**');
    }

    return lines.join('\n');
  }

  /**
   * Get per-provider usage breakdown
   */
  getProviderBreakdown(): Record<ProviderName, number> {
    const breakdown: Partial<Record<ProviderName, number>> = {};

    for (const entry of this.usageLog) {
      breakdown[entry.provider] = (breakdown[entry.provider] || 0) + entry.costUsd;
    }

    return breakdown as Record<ProviderName, number>;
  }

  /**
   * Get burn rate ($ per hour)
   */
  getBurnRate(hoursLookback: number = 1): number {
    const cutoff = Date.now() - hoursLookback * 60 * 60 * 1000;
    const recentEntries = this.usageLog.filter(e => e.timestamp >= cutoff);
    const totalCost = recentEntries.reduce((sum, e) => sum + e.costUsd, 0);

    return totalCost / hoursLookback;
  }

  /**
   * Estimate time until budget exhausted
   */
  estimateTimeUntilExhaustion(): { hours: number | null; limitType: string } {
    const burnRate = this.getBurnRate();
    if (burnRate <= 0) {
      return { hours: null, limitType: 'none' };
    }

    const daily = this.checkBudget('daily');
    const dailyHours = daily.remainingUsd / burnRate;

    const monthly = this.checkBudget('monthly');
    const monthlyHours = monthly.remainingUsd / burnRate;

    if (dailyHours < monthlyHours) {
      return { hours: dailyHours, limitType: 'daily' };
    }

    return { hours: monthlyHours, limitType: 'monthly' };
  }

  /**
   * Register warning callback
   */
  onWarning(callback: (status: BudgetStatus) => void): void {
    this.warningCallbacks.push(callback);
  }

  /**
   * Register block callback
   */
  onBlock(callback: (status: BudgetStatus) => void): void {
    this.blockCallbacks.push(callback);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  /**
   * Start a new session
   */
  startNewSession(): string {
    this.currentSessionId = `session-${Date.now()}`;
    return this.currentSessionId;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string {
    return this.currentSessionId;
  }

  /**
   * Clear usage history (for testing)
   */
  clearHistory(): void {
    this.usageLog = [];
    this.saveUsageLog();
  }
}

/**
 * Create a budget enforcer instance
 */
export function createBudgetEnforcer(
  agentDir: string,
  config?: Partial<BudgetConfig>
): BudgetEnforcer {
  return new BudgetEnforcer(agentDir, config);
}

export default BudgetEnforcer;
