/**
 * Hooks Manager
 * Implements lifecycle hooks for the Claude Agent SDK.
 * Hooks allow customization of agent behavior at key points.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { agentConfig } from '../config/agent-config.js';

/**
 * Hook event types
 */
export type HookEvent =
  | 'session.start'
  | 'session.end'
  | 'query.before'
  | 'query.after'
  | 'tool.before'
  | 'tool.after'
  | 'file.read'
  | 'file.write'
  | 'file.edit'
  | 'error.caught'
  | 'feature.start'
  | 'feature.complete'
  | 'feature.fail'
  | 'checkpoint.create'
  | 'checkpoint.restore'
  | 'git.commit'
  | 'browser.navigate'
  | 'browser.action';

/**
 * Hook context passed to hook handlers
 */
export interface HookContext {
  event: HookEvent;
  timestamp: number;
  sessionId?: string;
  featureId?: string;
  data?: Record<string, unknown>;
}

/**
 * Hook handler function type
 */
export type HookHandler = (context: HookContext) => Promise<HookResult> | HookResult;

/**
 * Hook result that can modify agent behavior
 */
export interface HookResult {
  continue: boolean;
  modified?: Record<string, unknown>;
  message?: string;
  warnings?: string[];
  block?: {
    reason: string;
    suggestion?: string;
  };
}

/**
 * Registered hook with metadata
 */
interface RegisteredHook {
  id: string;
  event: HookEvent;
  handler: HookHandler;
  priority: number;
  name: string;
  description?: string;
  enabled: boolean;
}

/**
 * Security hook configuration
 */
export interface SecurityHookConfig {
  blockSensitiveFiles: boolean;
  sensitivePatterns: RegExp[];
  blockDangerousCommands: boolean;
  dangerousCommandPatterns: RegExp[];
  requireConfirmation: boolean;
  confirmationPatterns: RegExp[];
  auditAllActions: boolean;
}

/**
 * Default security hook configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityHookConfig = {
  blockSensitiveFiles: true,
  sensitivePatterns: [
    /\.env$/,
    /\.env\.\w+$/,
    /credentials\.(json|yaml|yml)$/,
    /secrets?\.(json|yaml|yml)$/,
    /private[_-]?key/i,
    /\.pem$/,
    /\.key$/,
    /id_rsa/,
    /\.ssh\//,
  ],
  blockDangerousCommands: true,
  dangerousCommandPatterns: [
    /rm\s+-rf\s+\//,
    /rm\s+-rf\s+~\//,
    /rm\s+-rf\s+\.\.\//,
    /:\s*>\s*[^>]/,
    /mkfs\./,
    /dd\s+if=/,
    /chmod\s+777/,
    /curl\s+.*\|\s*(ba)?sh/,
    /wget\s+.*\|\s*(ba)?sh/,
  ],
  requireConfirmation: false,
  confirmationPatterns: [
    /drop\s+database/i,
    /drop\s+table/i,
    /truncate/i,
    /delete\s+from/i,
    /git\s+reset\s+--hard/,
    /git\s+push\s+.*--force/,
  ],
  auditAllActions: true,
};

/**
 * Hooks Manager class
 */
export class HooksManager {
  private hooks: Map<HookEvent, RegisteredHook[]> = new Map();
  private securityConfig: SecurityHookConfig;
  private hookIdCounter = 0;
  private auditLog: HookContext[] = [];
  private enabled: boolean;

  constructor(securityConfig?: Partial<SecurityHookConfig>) {
    this.securityConfig = { ...DEFAULT_SECURITY_CONFIG, ...securityConfig };
    this.enabled = agentConfig.features.enableSecurityHooks;

    // Register default security hooks
    if (this.enabled) {
      this.registerSecurityHooks();
    }
  }

  /**
   * Check if hooks are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable hooks
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Generate unique hook ID
   */
  private generateId(): string {
    return `hook_${++this.hookIdCounter}_${Date.now()}`;
  }

  /**
   * Register a hook
   */
  register(
    event: HookEvent,
    handler: HookHandler,
    options?: {
      name?: string;
      description?: string;
      priority?: number;
      enabled?: boolean;
    }
  ): string {
    const hookId = this.generateId();

    const registeredHook: RegisteredHook = {
      id: hookId,
      event,
      handler,
      priority: options?.priority ?? 50,
      name: options?.name ?? `Hook ${hookId}`,
      description: options?.description,
      enabled: options?.enabled ?? true,
    };

    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }

    const eventHooks = this.hooks.get(event)!;
    eventHooks.push(registeredHook);

    // Sort by priority (higher priority runs first)
    eventHooks.sort((a, b) => b.priority - a.priority);

    return hookId;
  }

  /**
   * Unregister a hook
   */
  unregister(hookId: string): boolean {
    for (const [event, hooks] of this.hooks.entries()) {
      const index = hooks.findIndex(h => h.id === hookId);
      if (index !== -1) {
        hooks.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Enable a hook
   */
  enable(hookId: string): boolean {
    for (const hooks of this.hooks.values()) {
      const hook = hooks.find(h => h.id === hookId);
      if (hook) {
        hook.enabled = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Disable a hook
   */
  disable(hookId: string): boolean {
    for (const hooks of this.hooks.values()) {
      const hook = hooks.find(h => h.id === hookId);
      if (hook) {
        hook.enabled = false;
        return true;
      }
    }
    return false;
  }

  /**
   * Trigger hooks for an event
   */
  async trigger(event: HookEvent, data?: Record<string, unknown>): Promise<HookResult> {
    if (!this.enabled) {
      return { continue: true };
    }

    const context: HookContext = {
      event,
      timestamp: Date.now(),
      data,
    };

    // Audit logging
    if (this.securityConfig.auditAllActions) {
      this.auditLog.push(context);
    }

    const eventHooks = this.hooks.get(event) || [];
    const enabledHooks = eventHooks.filter(h => h.enabled);

    const warnings: string[] = [];
    let modified: Record<string, unknown> = {};

    for (const hook of enabledHooks) {
      try {
        const result = await hook.handler(context);

        if (!result.continue) {
          return result;
        }

        if (result.warnings) {
          warnings.push(...result.warnings);
        }

        if (result.modified) {
          modified = { ...modified, ...result.modified };
        }
      } catch (error) {
        console.error(`Hook ${hook.name} failed:`, error);
        warnings.push(`Hook ${hook.name} threw an error`);
      }
    }

    return {
      continue: true,
      modified: Object.keys(modified).length > 0 ? modified : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Register default security hooks
   */
  private registerSecurityHooks(): void {
    // File read security hook
    this.register(
      'file.read',
      async (context) => {
        const filePath = context.data?.path as string;
        if (!filePath) return { continue: true };

        for (const pattern of this.securityConfig.sensitivePatterns) {
          if (pattern.test(filePath)) {
            return {
              continue: false,
              block: {
                reason: `Blocked read of sensitive file: ${filePath}`,
                suggestion: 'Use environment variables for sensitive data',
              },
            };
          }
        }

        return { continue: true };
      },
      { name: 'Sensitive File Read Block', priority: 100 }
    );

    // File write security hook
    this.register(
      'file.write',
      async (context) => {
        const filePath = context.data?.path as string;
        if (!filePath) return { continue: true };

        for (const pattern of this.securityConfig.sensitivePatterns) {
          if (pattern.test(filePath)) {
            return {
              continue: false,
              block: {
                reason: `Blocked write to sensitive file: ${filePath}`,
                suggestion: 'Use environment variables for sensitive data',
              },
            };
          }
        }

        return { continue: true };
      },
      { name: 'Sensitive File Write Block', priority: 100 }
    );

    // Command execution security hook
    this.register(
      'tool.before',
      async (context) => {
        const toolName = context.data?.tool as string;
        const command = context.data?.command as string;

        if (toolName !== 'Bash' || !command) {
          return { continue: true };
        }

        // Check for dangerous commands
        if (this.securityConfig.blockDangerousCommands) {
          for (const pattern of this.securityConfig.dangerousCommandPatterns) {
            if (pattern.test(command)) {
              return {
                continue: false,
                block: {
                  reason: `Blocked dangerous command: ${command}`,
                  suggestion: 'Review command for safety before execution',
                },
              };
            }
          }
        }

        // Check for commands requiring confirmation
        if (this.securityConfig.requireConfirmation) {
          for (const pattern of this.securityConfig.confirmationPatterns) {
            if (pattern.test(command)) {
              return {
                continue: true,
                warnings: [`Command requires user confirmation: ${command}`],
              };
            }
          }
        }

        return { continue: true };
      },
      { name: 'Dangerous Command Block', priority: 100 }
    );
  }

  /**
   * Get audit log
   */
  getAuditLog(): HookContext[] {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Get all registered hooks
   */
  listHooks(): Array<{ event: HookEvent; name: string; enabled: boolean; priority: number }> {
    const result: Array<{ event: HookEvent; name: string; enabled: boolean; priority: number }> = [];

    for (const [event, hooks] of this.hooks.entries()) {
      for (const hook of hooks) {
        result.push({
          event,
          name: hook.name,
          enabled: hook.enabled,
          priority: hook.priority,
        });
      }
    }

    return result;
  }

  /**
   * Get hooks summary
   */
  getSummary(): string {
    const total = this.listHooks().length;
    const enabled = this.listHooks().filter(h => h.enabled).length;
    const auditCount = this.auditLog.length;

    return `Hooks: ${enabled}/${total} enabled, ${auditCount} audit entries`;
  }

  /**
   * Update security configuration
   */
  updateSecurityConfig(config: Partial<SecurityHookConfig>): void {
    this.securityConfig = { ...this.securityConfig, ...config };
  }

  /**
   * Get current security configuration
   */
  getSecurityConfig(): SecurityHookConfig {
    return { ...this.securityConfig };
  }
}

// Convenience functions for common hooks

/**
 * Create a logging hook
 */
export function createLoggingHook(
  logFn: (context: HookContext) => void
): HookHandler {
  return async (context) => {
    logFn(context);
    return { continue: true };
  };
}

/**
 * Create a validation hook
 */
export function createValidationHook(
  validate: (context: HookContext) => boolean | string
): HookHandler {
  return async (context) => {
    const result = validate(context);
    if (result === true) {
      return { continue: true };
    }
    return {
      continue: false,
      block: {
        reason: typeof result === 'string' ? result : 'Validation failed',
      },
    };
  };
}

/**
 * Create a transformation hook
 */
export function createTransformationHook(
  transform: (context: HookContext) => Record<string, unknown>
): HookHandler {
  return async (context) => {
    const modified = transform(context);
    return { continue: true, modified };
  };
}

/**
 * Create a hooks manager instance
 */
export function createHooksManager(
  securityConfig?: Partial<SecurityHookConfig>
): HooksManager {
  return new HooksManager(securityConfig);
}

export default HooksManager;
