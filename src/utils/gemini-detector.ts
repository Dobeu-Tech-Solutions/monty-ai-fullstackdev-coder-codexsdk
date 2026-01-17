/**
 * Gemini Code Assist Detector
 * Detects Gemini Code Assist subscription credentials and quota status.
 * Supports both API key and Google Cloud auth flows.
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
 * Gemini credential structure
 */
export interface GeminiCredentials {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  projectId?: string;
  quotaProjectId?: string;
  email?: string;
  tier?: 'free' | 'code_assist' | 'enterprise';
  authMethod: 'api_key' | 'gcloud' | 'service_account';
}

/**
 * Gemini quota information
 */
export interface GeminiQuota {
  requestsPerMinute: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  currentUsage?: {
    requestsToday: number;
    tokensToday: number;
    lastReset: string;
  };
}

/**
 * Possible paths where Gemini credentials might be stored
 */
export function getGeminiPaths(): string[] {
  const home = homedir();

  return [
    // Gemini CLI paths
    join(home, '.gemini', 'credentials.json'),
    join(home, '.gemini', 'auth.json'),
    join(home, '.config', 'gemini', 'credentials.json'),

    // Google Cloud SDK paths
    join(home, '.config', 'gcloud', 'application_default_credentials.json'),
    join(home, '.config', 'gcloud', 'credentials.db'),

    // Service account paths
    join(home, '.config', 'gcloud', 'service_account.json'),

    // Google AI Studio paths
    join(home, '.google-ai', 'credentials.json'),
    join(home, '.config', 'google-ai', 'credentials.json'),

    // Windows-specific paths
    join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json'),
    join(process.env.LOCALAPPDATA || '', 'Google', 'Cloud SDK', 'credentials.json'),
  ].filter(p => p && !p.startsWith(join('')));
}

/**
 * Try to detect credentials using gcloud CLI
 */
async function detectFromGCloudCLI(): Promise<GeminiCredentials | null> {
  try {
    // Check if gcloud is available and authenticated
    const { stdout: authList } = await execAsync('gcloud auth list --format=json', {
      timeout: 5000,
    });

    const accounts = JSON.parse(authList);
    const activeAccount = accounts.find((a: { status: string }) => a.status === 'ACTIVE');

    if (!activeAccount) {
      return null;
    }

    // Get access token
    const { stdout: tokenOutput } = await execAsync('gcloud auth print-access-token', {
      timeout: 5000,
    });

    const accessToken = tokenOutput.trim();

    if (!accessToken) {
      return null;
    }

    // Get project info
    let projectId: string | undefined;
    try {
      const { stdout: projectOutput } = await execAsync('gcloud config get-value project', {
        timeout: 5000,
      });
      projectId = projectOutput.trim() || undefined;
    } catch {
      // Project not set
    }

    return {
      accessToken,
      email: activeAccount.account,
      projectId,
      authMethod: 'gcloud',
      tier: 'code_assist', // gcloud auth typically indicates Code Assist
    };
  } catch {
    // gcloud CLI not available
    return null;
  }
}

/**
 * Try to detect credentials using gemini CLI
 */
async function detectFromGeminiCLI(): Promise<GeminiCredentials | null> {
  try {
    // Try using gemini CLI to get auth info
    const { stdout } = await execAsync('gemini auth show --format json', {
      timeout: 5000,
    });

    const config = JSON.parse(stdout);

    if (config.apiKey || config.api_key) {
      return {
        apiKey: config.apiKey || config.api_key,
        projectId: config.projectId || config.project_id,
        email: config.email,
        authMethod: 'api_key',
        tier: config.tier || 'free',
      };
    }

    if (config.accessToken || config.access_token) {
      return {
        accessToken: config.accessToken || config.access_token,
        refreshToken: config.refreshToken || config.refresh_token,
        expiresAt: config.expiresAt || config.expires_at,
        projectId: config.projectId || config.project_id,
        email: config.email,
        authMethod: 'gcloud',
        tier: config.tier || 'code_assist',
      };
    }

    return null;
  } catch {
    // CLI not available
    return null;
  }
}

/**
 * Try to detect credentials from file system
 */
async function detectFromFiles(): Promise<GeminiCredentials | null> {
  const paths = getGeminiPaths();

  for (const path of paths) {
    try {
      if (!existsSync(path)) {
        continue;
      }

      const content = readFileSync(path, 'utf-8');
      const data = JSON.parse(content);

      // Check for API key
      if (data.api_key || data.apiKey) {
        return {
          apiKey: data.api_key || data.apiKey,
          projectId: data.project_id || data.projectId,
          quotaProjectId: data.quota_project_id || data.quotaProjectId,
          email: data.email || data.client_email,
          authMethod: 'api_key',
          tier: 'free',
        };
      }

      // Check for OAuth credentials (application_default_credentials.json)
      if (data.type === 'authorized_user') {
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          email: data.client_email,
          authMethod: 'gcloud',
          tier: 'code_assist',
        };
      }

      // Check for service account
      if (data.type === 'service_account') {
        return {
          email: data.client_email,
          projectId: data.project_id,
          authMethod: 'service_account',
          tier: 'enterprise',
        };
      }
    } catch {
      // Failed to read or parse
      continue;
    }
  }

  return null;
}

/**
 * Check if access token is expired
 */
export function isTokenExpired(credentials: GeminiCredentials): boolean {
  // API keys don't expire
  if (credentials.authMethod === 'api_key' && credentials.apiKey) {
    return false;
  }

  if (!credentials.expiresAt) {
    return false;
  }

  let expiresAt = credentials.expiresAt;
  if (expiresAt < 1e12) {
    expiresAt *= 1000;
  }

  const graceMs = 5 * 60 * 1000;
  return expiresAt - graceMs < Date.now();
}

/**
 * Refresh gcloud access token
 */
export async function refreshGCloudToken(): Promise<GeminiCredentials | null> {
  try {
    const { stdout } = await execAsync('gcloud auth print-access-token', {
      timeout: 10000,
    });

    const accessToken = stdout.trim();
    if (accessToken) {
      return {
        accessToken,
        authMethod: 'gcloud',
        // Token expires in 1 hour typically
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get quota information from the API
 */
export async function getQuotaInfo(credentials: GeminiCredentials): Promise<GeminiQuota | null> {
  try {
    const key = credentials.apiKey || credentials.accessToken;
    if (!key) return null;

    // Default quotas based on tier
    const quotas: Record<string, GeminiQuota> = {
      free: {
        requestsPerMinute: 60,
        requestsPerDay: 1500,
        tokensPerMinute: 32000,
      },
      code_assist: {
        requestsPerMinute: 1000,
        requestsPerDay: 50000,
        tokensPerMinute: 120000,
      },
      enterprise: {
        requestsPerMinute: 10000,
        requestsPerDay: 500000,
        tokensPerMinute: 1000000,
      },
    };

    const quota = quotas[credentials.tier || 'free'];
    return quota || null;
  } catch {
    return null;
  }
}

/**
 * Validate Gemini credentials
 */
export async function validateGeminiCredentials(
  credentials: GeminiCredentials
): Promise<boolean> {
  try {
    const key = credentials.apiKey || credentials.accessToken;
    if (!key) return false;

    const url = credentials.apiKey
      ? `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
      : 'https://generativelanguage.googleapis.com/v1beta/models';

    const headers: Record<string, string> = {};
    if (credentials.accessToken) {
      headers['Authorization'] = `Bearer ${credentials.accessToken}`;
    }

    const response = await fetch(url, { method: 'GET', headers });
    return response.status === 200;
  } catch {
    return true; // Assume valid on network error
  }
}

/**
 * Main detection function
 */
export async function detectGeminiCredentials(): Promise<GeminiCredentials | null> {
  // Check environment variable first
  const envApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      authMethod: 'api_key',
      tier: 'free',
    };
  }

  // Try Gemini CLI
  const geminiCreds = await detectFromGeminiCLI();
  if (geminiCreds) {
    if (!isTokenExpired(geminiCreds)) {
      return geminiCreds;
    }
  }

  // Try gcloud CLI
  const gcloudCreds = await detectFromGCloudCLI();
  if (gcloudCreds) {
    return gcloudCreds;
  }

  // Try file detection
  const fileCreds = await detectFromFiles();
  if (fileCreds) {
    if (!isTokenExpired(fileCreds)) {
      return fileCreds;
    }

    // Try refresh for gcloud auth
    if (fileCreds.authMethod === 'gcloud') {
      const refreshed = await refreshGCloudToken();
      if (refreshed) {
        return { ...fileCreds, ...refreshed };
      }
    }
  }

  return null;
}

/**
 * Get credential status string
 */
export function getCredentialStatus(credentials: GeminiCredentials): string {
  const parts: string[] = [];

  parts.push(`Method: ${credentials.authMethod}`);
  parts.push(`Tier: ${credentials.tier || 'unknown'}`);

  if (credentials.email) {
    parts.push(`Email: ${credentials.email}`);
  }

  if (credentials.projectId) {
    parts.push(`Project: ${credentials.projectId}`);
  }

  if (credentials.authMethod === 'api_key') {
    parts.push('Status: Valid (API key)');
  } else if (credentials.expiresAt) {
    const msUntil = credentials.expiresAt - Date.now();
    if (msUntil <= 0) {
      parts.push('Status: Expired');
    } else {
      const minsUntil = Math.ceil(msUntil / (60 * 1000));
      parts.push(`Expires in: ${minsUntil} minutes`);
    }
  } else {
    parts.push('Status: Valid');
  }

  return parts.join(' | ');
}

export default detectGeminiCredentials;
