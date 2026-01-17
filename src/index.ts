#!/usr/bin/env node
/**
 * Monty Full-Stack Agent Framework
 * Main entry point that routes between initializer and coding agents.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0 - Non-commercial use only
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Based on Anthropic's best practices for effective agent harnesses:
 * https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
 */

import { existsSync, mkdirSync } from "fs";
import { agentConfig } from "./config/agent-config.js";
import { runInitializerAgent } from "./agents/initializer.js";
import { runCodingAgent } from "./agents/coding.js";
import { isAuthenticated, checkAuth, setEnvForChildProcess, authManager } from "./utils/auth-manager.js";
import { multiAuthManager } from "./utils/multi-auth-manager.js";
import type { ProviderName } from "./config/provider-config.js";

/**
 * Check if this is the first run (no .agent directory)
 */
function isFirstRun(): boolean {
  return !existsSync(agentConfig.paths.agentDir);
}

/**
 * Run a function with retry logic for transient failures
 * Implements exponential backoff with configurable max retries
 */
async function runWithRetry(
  runFn: () => Promise<void>,
  maxRetries: number = agentConfig.session.maxRetries
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await runFn();
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Don't retry on certain errors that indicate configuration issues
      if (errorMessage.includes("Feature list not found") || 
          errorMessage.includes("not been initialized")) {
        throw error;
      }
      
      if (attempt === maxRetries) {
        console.error(`\n❌ All ${maxRetries} attempts failed.`);
        throw error;
      }
      
      console.log(`\n⚠️  Attempt ${attempt}/${maxRetries} failed: ${errorMessage}`);
      console.log(`   Retrying in ${attempt} second(s)...`);
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/**
 * Valid provider names for --provider option
 */
const VALID_PROVIDERS: ProviderName[] = ['anthropic', 'openai', 'google', 'cursor'];

/**
 * Parse command line arguments
 */
function parseArgs(): {
  forceInit: boolean;
  forceCoding: boolean;
  spec: string | undefined;
  context: string | undefined;
  login: boolean;
  logout: boolean;
  whoami: boolean;
  providers: boolean;
  provider: ProviderName | 'all' | undefined;
  setDefault: ProviderName | undefined;
  addProvider: ProviderName | undefined;
} {
  const args = process.argv.slice(2);

  // Parse --provider=<name> option
  const providerArg = args.find(a => a.startsWith("--provider="))?.split("=")[1];
  let provider: ProviderName | 'all' | undefined;
  if (providerArg) {
    if (providerArg === 'all') {
      provider = 'all';
    } else if (VALID_PROVIDERS.includes(providerArg as ProviderName)) {
      provider = providerArg as ProviderName;
    } else {
      console.error(`\n✗ Invalid provider: "${providerArg}"`);
      console.error(`  Valid providers: ${VALID_PROVIDERS.join(', ')}, all\n`);
      process.exit(1);
    }
  }

  // Parse --set-default=<name> option
  const setDefaultArg = args.find(a => a.startsWith("--set-default="))?.split("=")[1];
  let setDefault: ProviderName | undefined;
  if (setDefaultArg && VALID_PROVIDERS.includes(setDefaultArg as ProviderName)) {
    setDefault = setDefaultArg as ProviderName;
  }

  // Parse --add-provider=<name> option
  const addProviderArg = args.find(a => a.startsWith("--add-provider="))?.split("=")[1];
  let addProvider: ProviderName | undefined;
  if (addProviderArg && VALID_PROVIDERS.includes(addProviderArg as ProviderName)) {
    addProvider = addProviderArg as ProviderName;
  }

  return {
    forceInit: args.includes("--init") || process.env.FORCE_INIT === "true",
    forceCoding: args.includes("--code"),
    spec: args.find(a => a.startsWith("--spec="))?.split("=").slice(1).join("="),
    context: args.find(a => a.startsWith("--context="))?.split("=").slice(1).join("="),
    login: args.includes("--login") || args.includes("login"),
    logout: args.includes("--logout") || args.includes("logout"),
    whoami: args.includes("--whoami") || args.includes("whoami"),
    providers: args.includes("--providers") || args.includes("providers"),
    provider,
    setDefault,
    addProvider,
  };
}

/**
 * Display usage information
 */
function showUsage(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    MONTY FULL-STACK AGENT FRAMEWORK                          ║
║                                                                              ║
║  Multi-provider AI orchestration with Claude, OpenAI, Google, and Cursor     ║
╚══════════════════════════════════════════════════════════════════════════════╝

USAGE:
  montyx                        Auto-detect mode (init or coding)
  montyx init                   Force initialization mode
  montyx code                   Force coding mode

AUTHENTICATION:
  montyx login                  Interactive login (auto-detects Claude Code)
  montyx login --provider=NAME  Login to specific provider
  montyx logout                 Logout from all providers
  montyx logout --provider=NAME Logout from specific provider
  montyx whoami                 Show current authentication status
  montyx providers              Show all provider status

  Provider Names: anthropic, openai, google, cursor, all

PROVIDER OPTIONS:
  --provider=NAME              Target specific provider (anthropic, openai, google, cursor)
  --provider=all               Configure all providers
  --set-default=NAME           Set default provider for routing
  --add-provider=NAME          Add provider after initialization (removes from opted-out list)

AGENT OPTIONS:
  --init                       Force run initializer agent
  --code                       Force run coding agent
  --spec="..."                 Project specification for initializer
  --context="..."              Additional context for coding agent

ENVIRONMENT VARIABLES:
  ANTHROPIC_API_KEY            Anthropic/Claude API key
  OPENAI_API_KEY               OpenAI/Codex API key
  GOOGLE_API_KEY               Google/Gemini API key
  CURSOR_API_KEY               Cursor Cloud API key
  FORCE_INIT=true              Force initialization mode

WORKFLOW:
  1. First run automatically triggers Initializer Agent
  2. Subsequent runs use Coding Agent for incremental progress
  3. Task orchestrator routes tasks to optimal provider
  4. Multi-agent review available for code review tasks

FILES:
  ~/.monty/credentials.json    Multi-provider credentials (v2.0)
  .agent/feature_list.json     Feature tracking (JSON)
  .agent/claude-progress.txt   Progress log between sessions

EXAMPLES:
  montyx login                      # Interactive login, auto-detect Claude Code
  montyx login --provider=openai    # Login to OpenAI only
  montyx login --provider=all       # Configure all providers
  montyx providers                  # Show status of all providers
  montyx --set-default=google       # Set Google as default provider
`);
}

/**
 * Display provider status
 */
function showProviderStatus(): void {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         AI PROVIDER STATUS                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const providers = multiAuthManager.getProviderDisplayInfo();
  const defaultProvider = multiAuthManager.getDefaultProvider();

  console.log('  Provider          Status              Auth Method    Default');
  console.log('  ─────────────────────────────────────────────────────────────────────────────');

  for (const provider of providers) {
    const status = provider.authenticated
      ? '\x1b[32m✓ Authenticated\x1b[0m'
      : '\x1b[90m○ Not configured\x1b[0m';
    const method = provider.method ?? '-';
    const isDefault = provider.name === defaultProvider ? '★' : '';
    const keyPreview = provider.keyPreview ? ` (${provider.keyPreview})` : '';

    console.log(
      `  ${provider.displayName.padEnd(18)} ${(provider.authenticated ? '✓ Authenticated' : '○ Not configured').padEnd(20)} ${method.padEnd(14)} ${isDefault}`
    );
    if (provider.keyPreview) {
      console.log(`                      Key: ${provider.keyPreview}`);
    }
  }

  const authenticatedCount = providers.filter(p => p.authenticated).length;

  console.log('\n  ─────────────────────────────────────────────────────────────────────────────');
  console.log(`  Authenticated: ${authenticatedCount}/${providers.length} providers`);
  console.log(`  Default: ${defaultProvider}`);

  if (authenticatedCount === 0) {
    console.log('\n  Run "montyx login" to authenticate with a provider.');
  } else if (authenticatedCount === 1) {
    console.log('\n  Run "montyx login --provider=NAME" to add more providers.');
  } else {
    console.log('\n  Multi-agent code review is available with multiple providers.');
  }

  console.log('');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  // Show help if requested
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showUsage();
    process.exit(0);
  }

  // Handle set-default option
  if (args.setDefault) {
    multiAuthManager.setDefaultProvider(args.setDefault);
    console.log(`\n✓ Default provider set to: ${args.setDefault}\n`);
    process.exit(0);
  }

  // Handle add-provider option
  if (args.addProvider) {
    const success = await multiAuthManager.addProviderAfterInit(args.addProvider);
    process.exit(success ? 0 : 1);
  }

  // Handle providers command - show all provider status
  if (args.providers) {
    showProviderStatus();
    process.exit(0);
  }

  // Handle authentication commands FIRST (before auth check)
  if (args.login) {
    let success: boolean;
    if (args.provider === 'all') {
      await multiAuthManager.loginAll();
      success = multiAuthManager.isAnyProviderAuthenticated();
    } else if (args.provider) {
      success = await multiAuthManager.loginProvider(args.provider);
    } else {
      // Default: try multi-auth login (starts with Anthropic auto-detect)
      success = await multiAuthManager.loginProvider('anthropic');
      if (success) {
        // Ask if user wants to configure additional providers
        const rl = await import('readline').then(m => m.createInterface({
          input: process.stdin,
          output: process.stdout,
        }));
        const answer = await new Promise<string>(resolve => {
          rl.question('\nWould you like to configure additional providers? (y/N): ', resolve);
        });
        rl.close();
        if (answer.toLowerCase() === 'y') {
          for (const provider of ['openai', 'google', 'cursor'] as ProviderName[]) {
            const configure = await new Promise<string>(resolve => {
              const rl2 = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout,
              });
              rl2.question(`Configure ${provider}? (y/N): `, (ans: string) => {
                rl2.close();
                resolve(ans);
              });
            });
            if (configure.toLowerCase() === 'y') {
              await multiAuthManager.loginProvider(provider);
            } else {
              // Mark as opted out
              multiAuthManager.markProviderOptedOut(provider);
            }
          }
        }
      }
    }
    process.exit(success ? 0 : 1);
  }

  if (args.logout) {
    if (args.provider && args.provider !== 'all') {
      multiAuthManager.logoutProvider(args.provider);
    } else {
      multiAuthManager.logoutAll();
    }
    process.exit(0);
  }

  if (args.whoami) {
    multiAuthManager.whoami();
    process.exit(0);
  }

  // Check authentication for other commands - now checks any provider
  if (!multiAuthManager.isAnyProviderAuthenticated()) {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                         AUTHENTICATION REQUIRED                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

No AI provider is authenticated.

To authenticate, choose one of:
  1. Run: montyx login                          (auto-detect Claude Code)
  2. Run: montyx login --provider=anthropic     (configure Anthropic/Claude)
  3. Run: montyx login --provider=openai        (configure OpenAI/Codex)
  4. Run: montyx login --provider=google        (configure Google/Gemini)
  5. Run: montyx login --provider=all           (configure all providers)

Or set environment variables:
  export ANTHROPIC_API_KEY=your-key
  export OPENAI_API_KEY=your-key
  export GOOGLE_API_KEY=your-key
`);
    process.exit(1);
  }

  // Validate authentication before proceeding (async to handle token refresh)
  const defaultProvider = multiAuthManager.getDefaultProvider();
  const apiKey = await multiAuthManager.getApiKey(defaultProvider);
  if (!apiKey) {
    // Try to find any authenticated provider
    const authenticatedProviders = multiAuthManager.getAuthenticatedProviders();
    if (authenticatedProviders.length === 0) {
      console.error(`
No valid authentication found for any provider.

Please authenticate using: montyx login
`);
      process.exit(1);
    }
    // Use the first authenticated provider
    const fallbackProvider = authenticatedProviders[0]!;
    console.log(`Default provider (${defaultProvider}) not authenticated, using ${fallbackProvider}`);
    multiAuthManager.setDefaultProvider(fallbackProvider);
  }

  // Ensure API keys are set in environment for all authenticated providers
  multiAuthManager.setEnvForChildProcess();

  // Show provider status
  const authenticatedProviders = multiAuthManager.getAuthenticatedProviders();
  const providerList = authenticatedProviders.length > 1
    ? `(${authenticatedProviders.join(', ')})`
    : `(${defaultProvider})`;

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    MONTY FULL-STACK AGENT FRAMEWORK                          ║
║                  Multi-Provider AI Orchestration System                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
  Providers: ${authenticatedProviders.length} active ${providerList}
`);

  // Determine which agent to run
  const shouldInitialize = args.forceInit || (isFirstRun() && !args.forceCoding);
  
  if (shouldInitialize) {
    // Initialize mode
    console.log("📦 Mode: INITIALIZER");
    console.log("━".repeat(70));
    
    if (!args.spec) {
      console.log(`
⚠️  No project specification provided.

Please provide a project spec using one of these methods:
  1. Command line: npm start -- --spec="Build a todo app with React..."
  2. Interactive: The agent will ask for your specification

For now, please describe what you want to build:
`);
      // In a real implementation, you'd read from stdin here
      // For now, we'll use a placeholder that prompts the agent to ask
      const spec = "Please ask the user for their project specification.";
      
      // Ensure .agent directory exists
      if (!existsSync(agentConfig.paths.agentDir)) {
        mkdirSync(agentConfig.paths.agentDir, { recursive: true });
      }
      
      await runWithRetry(() => runInitializerAgent(spec));
    } else {
      // Ensure .agent directory exists
      if (!existsSync(agentConfig.paths.agentDir)) {
        mkdirSync(agentConfig.paths.agentDir, { recursive: true });
      }
      
      await runWithRetry(() => runInitializerAgent(args.spec!));
    }
  } else {
    // Coding mode
    console.log("🔨 Mode: CODING");
    console.log("━".repeat(70));
    
    if (!existsSync(agentConfig.paths.featureList)) {
      console.error(`
❌ Error: Feature list not found at ${agentConfig.paths.featureList}

The project has not been initialized. Run with --init flag first:
  npm run agent:init
`);
      process.exit(1);
    }
    
    await runWithRetry(() => runCodingAgent(args.context));
  }
}

// Run main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
