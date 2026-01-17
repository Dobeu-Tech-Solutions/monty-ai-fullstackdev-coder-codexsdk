/**
 * ChatGPT Subscription Detector
 * Detects ChatGPT Plus/Team/Enterprise subscription credentials from local system.
 * Similar to Claude Code detector for Anthropic subscriptions.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * ChatGPT credential structure
 */
export interface ChatGPTCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  organizationId?: string;
  email?: string;
  tier?: 'free' | 'plus' | 'team' | 'enterprise';
}

/**
 * Possible paths where ChatGPT credentials might be stored
 */
export function getChatGPTPaths(): string[] {
  const home = homedir();

  return [
    // Codex CLI paths
    join(home, '.codex', 'credentials.json'),
    join(home, '.codex', 'auth.json'),
    join(home, '.config', 'codex', 'credentials.json'),
    join(home, '.config', 'codex', 'auth.json'),

    // ChatGPT CLI paths (hypothetical)
    join(home, '.chatgpt', 'credentials.json'),
    join(home, '.chatgpt', 'auth.json'),
    join(home, '.config', 'chatgpt', 'credentials.json'),

    // OpenAI CLI paths
    join(home, '.openai', 'credentials.json'),
    join(home, '.openai', 'auth.json'),
    join(home, '.config', 'openai', 'credentials.json'),

    // Windows-specific paths
    join(process.env.APPDATA || '', 'codex', 'credentials.json'),
    join(process.env.APPDATA || '', 'openai', 'credentials.json'),
    join(process.env.LOCALAPPDATA || '', 'codex', 'credentials.json'),
    join(process.env.LOCALAPPDATA || '', 'openai', 'credentials.json'),
  ].filter(p => p && !p.startsWith(join(''))); // Filter out paths starting with just separator
}

/**
 * Try to detect credentials using the codex CLI
 */
async function detectFromCodexCLI(): Promise<ChatGPTCredentials | null> {
  try {
    // Try using codex CLI to get auth info
    const { stdout } = await execAsync('codex auth show --format json', {
      timeout: 5000,
    });

    const config = JSON.parse(stdout);

    if (config.accessToken || config.access_token) {
      const credentials: ChatGPTCredentials = {
        accessToken: config.accessToken || config.access_token,
        refreshToken: config.refreshToken || config.refresh_token,
        expiresAt: config.expiresAt || config.expires_at,
        tokenType: config.tokenType || config.token_type || 'bearer',
        organizationId: config.organizationId || config.organization_id,
        email: config.email,
      };

      // Infer tier from token or organization
      if (config.tier) {
        credentials.tier = config.tier;
      } else if (credentials.organizationId) {
        credentials.tier = 'team';
      } else if (credentials.accessToken) {
        credentials.tier = 'plus';
      }

      return credentials;
    }

    return null;
  } catch {
    // CLI not available or command failed
    return null;
  }
}

/**
 * Try to detect credentials from file system
 */
async function detectFromFiles(): Promise<ChatGPTCredentials | null> {
  const paths = getChatGPTPaths();

  for (const path of paths) {
    try {
      if (!existsSync(path)) {
        continue;
      }

      const content = readFileSync(path, 'utf-8');
      const data = JSON.parse(content);

      // Check for various credential field names
      const accessToken =
        data.accessToken ||
        data.access_token ||
        data.token ||
        data.sessionToken ||
        data.session_token;

      if (accessToken) {
        const credentials: ChatGPTCredentials = {
          accessToken,
          refreshToken:
            data.refreshToken ||
            data.refresh_token,
          expiresAt:
            data.expiresAt ||
            data.expires_at ||
            data.exp,
          tokenType:
            data.tokenType ||
            data.token_type ||
            'bearer',
          organizationId:
            data.organizationId ||
            data.organization_id ||
            data.org_id,
          email: data.email,
        };

        // Determine tier
        if (data.tier || data.subscription) {
          credentials.tier = (data.tier || data.subscription).toLowerCase();
        } else if (credentials.organizationId) {
          credentials.tier = 'team';
        } else {
          credentials.tier = 'plus';
        }

        return credentials;
      }
    } catch {
      // Failed to read or parse this file, try next
      continue;
    }
  }

  return null;
}

/**
 * Check if token is expired
 */
export function isTokenExpired(credentials: ChatGPTCredentials): boolean {
  if (!credentials.expiresAt) {
    return false; // No expiration = assume valid
  }

  // Handle both seconds and milliseconds
  let expiresAt = credentials.expiresAt;
  if (expiresAt < 1e12) {
    expiresAt *= 1000; // Convert seconds to milliseconds
  }

  // Add 5-minute grace period
  const graceMs = 5 * 60 * 1000;
  return expiresAt - graceMs < Date.now();
}

/**
 * Get days until expiration
 */
export function getDaysUntilExpiration(credentials: ChatGPTCredentials): number | null {
  if (!credentials.expiresAt) {
    return null;
  }

  let expiresAt = credentials.expiresAt;
  if (expiresAt < 1e12) {
    expiresAt *= 1000;
  }

  const msUntil = expiresAt - Date.now();
  if (msUntil <= 0) {
    return 0;
  }

  return Math.ceil(msUntil / (24 * 60 * 60 * 1000));
}

/**
 * Attempt to refresh the access token
 */
export async function refreshChatGPTToken(
  refreshToken: string
): Promise<ChatGPTCredentials | null> {
  try {
    // Try using codex CLI to refresh
    const { stdout } = await execAsync('codex auth refresh --format json', {
      timeout: 10000,
    });

    const config = JSON.parse(stdout);

    if (config.accessToken || config.access_token) {
      return {
        accessToken: config.accessToken || config.access_token,
        refreshToken: config.refreshToken || config.refresh_token || refreshToken,
        expiresAt: config.expiresAt || config.expires_at,
        tokenType: config.tokenType || config.token_type || 'bearer',
      };
    }

    return null;
  } catch {
    // CLI refresh failed
    return null;
  }
}

/**
 * Main detection function
 * Attempts to find ChatGPT/OpenAI subscription credentials from the local system
 */
export async function detectChatGPTCredentials(): Promise<ChatGPTCredentials | null> {
  // First, try using the CLI
  const cliCredentials = await detectFromCodexCLI();
  if (cliCredentials) {
    if (!isTokenExpired(cliCredentials)) {
      return cliCredentials;
    }

    // Try to refresh expired token
    if (cliCredentials.refreshToken) {
      const refreshed = await refreshChatGPTToken(cliCredentials.refreshToken);
      if (refreshed && !isTokenExpired(refreshed)) {
        return refreshed;
      }
    }
  }

  // Fall back to file-based detection
  const fileCredentials = await detectFromFiles();
  if (fileCredentials) {
    if (!isTokenExpired(fileCredentials)) {
      return fileCredentials;
    }

    // Try to refresh
    if (fileCredentials.refreshToken) {
      const refreshed = await refreshChatGPTToken(fileCredentials.refreshToken);
      if (refreshed && !isTokenExpired(refreshed)) {
        return refreshed;
      }
    }
  }

  return null;
}

/**
 * Validate ChatGPT credentials against the API
 */
export async function validateChatGPTCredentials(
  credentials: ChatGPTCredentials
): Promise<boolean> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    });

    return response.status === 200;
  } catch {
    // Network error, assume valid
    return true;
  }
}

/**
 * Get credential status string
 */
export function getCredentialStatus(credentials: ChatGPTCredentials): string {
  const parts: string[] = [];

  parts.push(`Tier: ${credentials.tier || 'unknown'}`);

  if (credentials.email) {
    parts.push(`Email: ${credentials.email}`);
  }

  if (credentials.organizationId) {
    parts.push(`Org: ${credentials.organizationId}`);
  }

  const daysUntil = getDaysUntilExpiration(credentials);
  if (daysUntil !== null) {
    if (daysUntil === 0) {
      parts.push('Status: Expired');
    } else if (daysUntil <= 7) {
      parts.push(`Expires in: ${daysUntil} days ⚠️`);
    } else {
      parts.push(`Expires in: ${daysUntil} days`);
    }
  } else {
    parts.push('Status: Valid (no expiration)');
  }

  return parts.join(' | ');
}

export default detectChatGPTCredentials;
