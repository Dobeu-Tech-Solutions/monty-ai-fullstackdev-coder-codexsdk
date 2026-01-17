import { join } from 'path';
import { homedir, platform } from 'os';
import { existsSync, readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { authConfig } from '../config/auth-config.js';

const execAsync = promisify(exec);

/**
 * Claude Code Credential Detector
 * Detects existing Claude Code subscription credentials from the local system.
 * 
 * Claude Code stores credentials in different locations depending on OS:
 * - Linux/Windows: ~/.config/claude-code/auth.json
 * - macOS: Uses Keychain (encrypted) - we check file fallbacks
 * - Alternative: ~/.claude/credentials.json or ~/.claude/auth.json
 */

export interface ClaudeCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  tier?: string;
}

/**
 * Get platform-specific credential paths
 */
function getPlatformSpecificPaths(): string[] {
  const paths: string[] = [];
  const home = homedir();
  const platformType = platform();

  if (platformType === 'darwin') {
    // macOS paths
    paths.push(
      join(home, 'Library', 'Application Support', 'Claude Code', 'auth.json'),
      join(home, 'Library', 'Preferences', 'com.anthropic.claude-code.plist'),
      join(home, 'Library', 'Preferences', 'claude-code', 'auth.json'),
      join(home, '.config', 'claude-code', 'auth.json'),
      join(home, '.claude', 'credentials.json'),
      join(home, '.claude', 'auth.json'),
      join(home, '.claude', 'token.json')
    );
  } else if (platformType === 'win32') {
    // Windows paths
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');
    paths.push(
      join(appData, 'Claude Code', 'auth.json'),
      join(localAppData, 'Claude Code', 'auth.json'),
      join(appData, 'claude-code', 'auth.json'),
      join(localAppData, 'claude-code', 'auth.json'),
      join(home, '.config', 'claude-code', 'auth.json'),
      join(home, '.claude', 'credentials.json'),
      join(home, '.claude', 'auth.json'),
      join(home, '.claude', 'token.json')
    );
  } else {
    // Linux and other Unix-like systems
    paths.push(
      join(home, '.config', 'claude-code', 'auth.json'),
      join(home, '.local', 'share', 'claude-code', 'auth.json'),
      join(home, '.claude', 'credentials.json'),
      join(home, '.claude', 'auth.json'),
      join(home, '.claude', 'token.json'),
      join(home, '.config', 'claude', 'auth.json')
    );
  }

  return paths;
}

/**
 * Get all possible paths where Claude Code might store credentials
 * Includes platform-specific paths and config paths
 */
function getCredentialPaths(): string[] {
  // Use paths from config, plus platform-specific paths, plus additional fallbacks
  const paths = [
    ...authConfig.claudeCodePaths,
    ...getPlatformSpecificPaths(),
    join(homedir(), '.claude', 'token.json'),              // Legacy location
    join(homedir(), '.config', 'claude', 'auth.json'),     // Alternative config location
  ];
  
  // Remove duplicates
  return [...new Set(paths)];
}

/**
 * Try to parse credentials from a file
 */
function tryParseCredentials(filePath: string): ClaudeCredentials | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }

    const fileContent = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    // Handle different credential file formats
    // Format 1: Direct token format
    if (data.accessToken || data.access_token) {
      return {
        accessToken: data.accessToken || data.access_token,
        refreshToken: data.refreshToken || data.refresh_token,
        expiresAt: data.expiresAt || data.expires_at,
        tokenType: data.tokenType || data.token_type || 'Bearer',
        scope: data.scope,
        tier: data.tier || data.subscription_tier,
      };
    }

    // Format 2: Nested under 'credentials' key
    if (data.credentials) {
      return {
        accessToken: data.credentials.accessToken || data.credentials.access_token,
        refreshToken: data.credentials.refreshToken || data.credentials.refresh_token,
        expiresAt: data.credentials.expiresAt || data.credentials.expires_at,
        tokenType: data.credentials.tokenType || data.credentials.token_type || 'Bearer',
        scope: data.credentials.scope,
        tier: data.credentials.tier || data.credentials.subscription_tier,
      };
    }

    // Format 3: OAuth token format
    if (data.token) {
      return {
        accessToken: data.token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
        tokenType: 'Bearer',
        tier: data.tier,
      };
    }

    return null;
  } catch (error) {
    // File exists but couldn't be parsed
    return null;
  }
}

/**
 * Try to detect credentials from macOS Keychain
 */
async function detectFromKeychain(): Promise<ClaudeCredentials | null> {
  if (platform() !== 'darwin') {
    return null;
  }

  try {
    // Try to use security command to find generic password
    const { stdout } = await execAsync(
      'security find-generic-password -s "claude-code" -w 2>/dev/null || security find-generic-password -s "anthropic" -w 2>/dev/null',
      { timeout: 3000 }
    );
    
    if (stdout && stdout.trim()) {
      const token = stdout.trim();
      // If we got a token, try to parse it or use it directly
      if (token.length > 20) {
        return {
          accessToken: token,
          tokenType: 'Bearer',
        };
      }
    }
  } catch (error) {
    // Keychain access failed or not found
  }

  return null;
}

/**
 * Try to detect credentials from Windows Credential Manager
 */
async function detectFromCredentialManager(): Promise<ClaudeCredentials | null> {
  if (platform() !== 'win32') {
    return null;
  }

  try {
    // Try to use cmdkey to list credentials
    const { stdout } = await execAsync('cmdkey /list 2>nul', { timeout: 3000 });
    
    if (stdout && (stdout.includes('claude') || stdout.includes('anthropic'))) {
      // Credential exists, but we can't extract it directly via cmdkey
      // Fall back to file-based detection which should work on Windows
      return null;
    }
  } catch (error) {
    // Credential Manager access failed
  }

  return null;
}

/**
 * Try to detect credentials from Linux keyring
 */
async function detectFromKeyring(): Promise<ClaudeCredentials | null> {
  if (platform() === 'win32' || platform() === 'darwin') {
    return null;
  }

  try {
    // Try secret-tool (GNOME Keyring)
    const { stdout } = await execAsync(
      'secret-tool lookup service claude-code 2>/dev/null || secret-tool lookup service anthropic 2>/dev/null',
      { timeout: 3000 }
    );
    
    if (stdout && stdout.trim()) {
      const token = stdout.trim();
      if (token.length > 20) {
        return {
          accessToken: token,
          tokenType: 'Bearer',
        };
      }
    }
  } catch (error) {
    // Keyring access failed or not available
  }

  return null;
}

/**
 * Detects existing Claude Code subscription credentials from the local system
 * Priority:
 * 1. Use `claude config show` command (handles Keychain/Credential Manager/files automatically)
 * 2. Try platform-specific credential storage (Keychain, Credential Manager, keyring)
 * 3. Fall back to file-based detection across entire machine
 */
export async function detectClaudeCodeCredentials(): Promise<ClaudeCredentials | null> {
  // Try to use Claude CLI directly - it handles all platform-specific storage (Keychain, etc.)
  try {
    const { stdout } = await execAsync('claude config show --format json', {
      timeout: 5000, // 5 second timeout
    });

    const config = JSON.parse(stdout);

    if (config.accessToken || config.access_token) {
      const credentials: ClaudeCredentials = {
        accessToken: config.accessToken || config.access_token,
        refreshToken: config.refreshToken || config.refresh_token,
        expiresAt: config.expiresAt || config.expires_at,
        tier: config.tier || config.subscription_tier,
      };

      // Check if token is expired
      if (!isTokenExpired(credentials)) {
        return credentials;
      }
    }
  } catch (error) {
    // Claude CLI not installed, not authenticated, or command failed - try other methods
  }

  // Try platform-specific credential storage
  const platformCreds = 
    await detectFromKeychain() ||
    await detectFromCredentialManager() ||
    await detectFromKeyring();
  
  if (platformCreds && !isTokenExpired(platformCreds)) {
    return platformCreds;
  }

  // Fallback: Try file-based detection for users without Claude CLI or using file storage
  // This now scans entire machine with platform-specific paths
  return await detectFromFiles();
}

/**
 * Legacy file-based credential detection (fallback)
 */
async function detectFromFiles(): Promise<ClaudeCredentials | null> {
  const paths = getCredentialPaths();

  for (const path of paths) {
    const credentials = tryParseCredentials(path);

    if (credentials && credentials.accessToken) {
      // Check if token is expired
      if (credentials.expiresAt && isTokenExpired(credentials)) {
        console.log(`  Found credentials at ${path} but token is expired`);
        continue;
      }

      return credentials;
    }
  }

  return null;
}

/**
 * Checks if a token is expired
 */
export function isTokenExpired(tokenData: { expiresAt?: number }): boolean {
  if (!tokenData.expiresAt) {
    return false; // Assume valid if no expiry
  }
  
  // Check if expiresAt is in seconds or milliseconds
  const expiresAtMs = tokenData.expiresAt > 1e12 
    ? tokenData.expiresAt 
    : tokenData.expiresAt * 1000;
  
  // Add 5 minute buffer
  return Date.now() >= expiresAtMs - (5 * 60 * 1000);
}

/**
 * Get days remaining until token expiration
 */
export function getDaysUntilExpiration(expiresAt?: number): number | null {
  if (!expiresAt) return null;
  
  const expiresAtMs = expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
  const msRemaining = expiresAtMs - Date.now();
  
  if (msRemaining <= 0) return 0;
  
  return Math.floor(msRemaining / (1000 * 60 * 60 * 24));
}

/**
 * Get all paths that are checked for Claude Code credentials
 */
export function getClaudeCodePaths(): string[] {
  return getCredentialPaths();
}
