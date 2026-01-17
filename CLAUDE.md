# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Monty Full-Stack Agent** - A multi-provider AI orchestration framework implementing Anthropic's best practices for long-running agents. The framework uses a two-agent architecture to enable incremental development across multiple context windows with intelligent task routing across Claude (Anthropic), Codex (OpenAI), Gemini (Google ADK), and Cursor Cloud.

### Key Capabilities
- **Multi-provider orchestration** - Routes tasks to optimal AI provider based on task type
- **Multi-agent code review** - Parallel review by multiple AI providers with arbitration
- **Intelligent fallback** - Automatic provider switching on failures
- **Incremental progress tracking** - State persistence across context windows
- **Tech stack auto-detection** - Works with any framework (React, Next.js, Vue, etc.)
- **Browser automation** - End-to-end testing via Puppeteer MCP

## Development Commands

### Essential Commands
```bash
# Install dependencies
npm install

# Development mode (runs without building)
npm run dev

# Build TypeScript to dist/
npm run build

# Type checking only (no output files)
npm run typecheck

# Testing
npm test              # Run all tests
npm run test:watch    # Watch mode

# Clean build artifacts and .agent directory
npm run clean
```

### Running the Agent
```bash
# Auto-detect mode (checks for .agent/ directory)
npm start

# Force initialization mode
npm run agent:init

# Force coding mode
npm run agent:code
```

### Testing as Global CLI
```bash
# Build first
npm run build

# Link globally for testing
npm link

# Now you can use 'monty' command anywhere
monty --help
monty login
monty init --spec="Build a todo app"
```

## Multi-Provider Architecture (Phase 5)

### Supported Providers

The framework now supports **four AI providers**:

1. **Claude (Anthropic)** - Default provider, best for complex reasoning and architecture
   - Models: Claude Sonnet 4, Claude Opus 4, Claude 3.5 Sonnet
   - SDK: `@anthropic-ai/claude-agent-sdk`
   - Full tool support: Read, Write, Edit, Bash, Browser, Task, etc.

2. **Codex (OpenAI)** - Best for CI/CD automation and test execution
   - Models: GPT-4 Turbo, GPT-4o, GPT-4o Mini, O1
   - SDK: `@openai/codex-sdk` (peer dependency)
   - Code execution support, thread management

3. **Gemini (Google ADK)** - Best for research and documentation with massive context
   - Models: Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 3 Pro
   - SDK: `@google/adk` (peer dependency)
   - 1M-2M token context windows

4. **Cursor Cloud** - Best for IDE tasks and rapid prototyping
   - REST API only (no SDK required)
   - Subscription-based (no per-token cost)

### Authentication System

The framework supports **multiple authentication flows** with auto-detection:

#### Authentication Priority (per provider)
1. Environment variable (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)
2. Credentials from `~/.monty/credentials.json` (v2.0 multi-provider format)
3. Auto-detected Claude Code credentials (Anthropic only)

#### Multi-Provider Commands
```bash
# Login to primary provider (Anthropic with auto-detect)
monty login

# Login to specific provider
monty login --provider=openai
monty login --provider=google
monty login --provider=cursor

# Configure all providers
monty login --provider=all

# Check authentication status
monty whoami
monty providers

# Set default provider for routing
monty --set-default=google

# Logout
monty logout                    # All providers
monty logout --provider=openai  # Specific provider
```

#### Key Authentication Components
- `src/utils/multi-auth-manager.ts` - Multi-provider credential management (v2.0)
- `src/utils/auth-manager.ts` - Legacy Anthropic-only auth (deprecated)
- `src/utils/claude-code-detector.ts` - Auto-detects Claude Code CLI credentials
- `src/config/auth-config.ts` - Authentication types, multi-provider schema

#### Credential File Format (v2.0)
```json
{
  "version": "2.0",
  "defaultProvider": "anthropic",
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-...",
      "method": "subscription",
      "source": "auto_detect",
      "expiresAt": "2025-02-01T00:00:00Z"
    },
    "openai": {
      "apiKey": "sk-...",
      "method": "api_key",
      "source": "env_var"
    }
  }
}
```

### Task Orchestrator

The orchestrator (`src/orchestrator/index.ts`) routes tasks to optimal providers:

**Task Classification** (`src/orchestrator/task-classifier.ts`):
- Analyzes task description and context
- Matches task type to provider strengths
- Returns recommended provider + fallback chain

**Task Types and Provider Preferences**:
- `complex_reasoning` → Claude, Gemini, OpenAI
- `architectural_decision` → Claude, Gemini
- `ci_cd_automation` → OpenAI, Claude, Cursor
- `test_execution` → OpenAI, Claude
- `research` → Gemini, Claude (massive context windows)
- `documentation` → Gemini, Claude, OpenAI
- `ide_task` → Cursor, Claude
- `rapid_prototyping` → Cursor, OpenAI, Claude
- `code_review` → Multi-agent (Claude + OpenAI + Gemini)
- `general` → Claude, OpenAI, Gemini, Cursor

**Orchestrator Features**:
- Automatic provider routing based on task type
- Fallback to alternative providers on failure
- Multi-agent code review with arbitration
- Cost tracking across providers
- Retry logic with exponential backoff

### Provider System

**Base Provider Interface** (`src/providers/base-provider.ts`):
```typescript
interface BaseProvider {
  name: ProviderName;
  initialize(): Promise<void>;
  query(prompt: string, options: QueryOptions): AsyncGenerator<AgentMessage>;
  isAvailable(): Promise<boolean>;
  getCapabilities(): ProviderCapabilities;
}
```

**Provider Implementations**:
- `src/providers/anthropic-provider.ts` - Claude Agent SDK wrapper
- `src/providers/openai-provider.ts` - OpenAI Codex SDK wrapper
- `src/providers/google-provider.ts` - Google ADK wrapper
- `src/providers/cursor-provider.ts` - REST API client

**Provider Configuration** (`src/config/provider-config.ts`):
- Tool mapping (standard tool names → provider-specific)
- Model configurations (IDs, context windows, pricing)
- Rate limits (requests/min, tokens/min, tokens/day)
- Capability flags (streaming, vision, tool_calling, etc.)

## Two-Agent Routing System

The entry point (`src/index.ts`) determines which agent to run:

```typescript
// Decision logic:
const shouldInitialize = args.forceInit || (isFirstRun() && !args.forceCoding);

if (shouldInitialize) {
  runInitializerAgent(spec);
} else {
  runCodingAgent(context);
}
```

**Initializer Agent** (`src/agents/initializer.ts`):
- Runs **once** when no `.agent/` directory exists
- Allowed tools: `['Read', 'Write', 'Bash', 'Glob', 'Grep']`
- Creates feature list, progress file, init scripts
- Makes initial git commit
- Always uses Claude (Anthropic) - most reliable for setup

**Coding Agent** (`src/agents/coding.ts`):
- Runs **every subsequent session**
- Allowed tools: `['Read', 'Edit', 'Bash', 'Glob', 'Grep', 'Browser', 'Task']`
- Follows 7-step startup sequence (see `prompts/coding.md`)
- Implements ONE feature per session
- Tests via browser automation
- Commits changes with `[monty]` prefix
- **Can use any provider** based on task routing

### System Prompts

Agent behavior is defined in markdown files loaded at runtime:

- `src/agents/prompts/initializer.md` - Instructs agent to create 50-200+ features, all marked `passes: false`
- `src/agents/prompts/coding.md` - Defines 7-step startup sequence, Poka-yoke rules, browser testing workflow
- `src/agents/prompts/arbitrator.md` - Coordinates multi-agent review and synthesizes consensus

### Configuration Files

**`src/config/agent-config.ts`** - Central agent configuration:
```typescript
export const agentConfig: AgentConfig = {
  paths: { agentDir: '.agent', featureList, progressFile, ... },
  tools: { initializer: [...], coding: [...] },
  permissionMode: 'acceptEdits',
  git: { autoCommit: true, commitMessagePrefix: '[monty]', ... },
  session: { maxRetries: 3, verifyBasicFunctionality: true, ... },
  features: { enableTDD: true, enableAuditLog: true, ... },
  model: { default: 'claude-3-5-sonnet', ... }
}
```

**`src/config/provider-config.ts`** - Multi-provider settings:
- Provider capabilities (streaming, vision, tool_calling, etc.)
- Tool mapping (standard names → provider-specific)
- Model configurations (context windows, pricing)
- Task routing rules
- Rate limits

**`src/config/mcp-config.ts`** - Browser automation settings for Puppeteer MCP server

**`src/config/auth-config.ts`** - Multi-provider authentication schema (v2.0)

### Runtime Files (`.agent/`)

Created during initialization, consumed by coding agent:

**`feature_list.json`** - Canonical source of truth for features:
```json
{
  "project": { "name": "...", "description": "...", "stack": [...] },
  "features": [
    {
      "id": "feat-001",
      "category": "functional|ui|integration|performance|accessibility",
      "priority": 1,
      "description": "...",
      "steps": ["Step 1", "Step 2", ...],
      "passes": false,
      "last_tested": null,
      "notes": ""
    }
  ]
}
```

**`claude-progress.txt`** - Session log for bridging context windows. First 50 lines are included in coding agent prompt.

**`session_state.json`** - Tracks current session state, last feature worked on

**`checkpoints/`** - Recovery checkpoints (auto-saved every 3 features by default)

**`usage_log.jsonl`** - Tracks API usage per session (multi-provider)

**`audit_log.jsonl`** - Records all file modifications for security

## Utilities Reference

### Multi-Provider Authentication
**`src/utils/multi-auth-manager.ts`** - Multi-provider credential management (v2.0):
- `loginProvider(name)` - Interactive login for specific provider
- `loginAll()` - Configure all providers
- `logoutProvider(name)` - Remove specific provider credentials
- `logoutAll()` - Clear all credentials
- `whoami()` - Show authentication status for all providers
- `getApiKey(provider)` - Get API key with auto-refresh
- `isAnyProviderAuthenticated()` - Check if any provider is ready
- `setDefaultProvider(name)` - Set routing default
- `setEnvForChildProcess()` - Inject API keys into environment

### Feature Management
**`src/utils/feature-list.ts`** - Feature CRUD with Poka-yoke validation:
- `readFeatureList()` - Load and parse JSON
- `writeFeatureList()` - Save with validation
- `addFeature()` - Append new feature
- `updateFeature()` - Update status/notes only (description/steps immutable)
- `deleteFeature()` - **BLOCKED** by Poka-yoke rules
- `getNextFeature()` - Select highest-priority failing feature
- `validateFeature()` - Ensure required fields present

### Progress Tracking
**`src/utils/progress.ts`** - Progress file management:
- `appendProgress(message)` - Add timestamped entry
- `readProgress()` - Get recent entries
- `createProgressFile()` - Initialize with project overview

### Project Detection
**`src/utils/project-detection.ts`** - Auto-detects tech stack:
- Scans `package.json` dependencies
- Identifies framework (React, Next.js, Vue, Svelte, Angular)
- Detects build tools (Vite, Webpack, Rollup)
- Finds testing setup (Vitest, Jest, Playwright)
- Discovers backend (Supabase, Express, Fastify)
- Returns structured `ProjectInfo` object

### Code Quality Checks
**`src/utils/code-quality.ts`** - Runs linting/type checks:
- `runTypeCheck()` - Executes `tsc --noEmit`
- `runLinter()` - Runs ESLint if configured
- `runFormatter()` - Checks Prettier formatting
- `generateQualitySummary()` - Aggregates results for prompt

### Dependency Management
**`src/utils/dependency-management.ts`** - Manages npm packages:
- `checkOutdatedPackages()` - Finds packages with updates
- `checkSecurityVulnerabilities()` - Runs `npm audit`
- `installMissingPackages()` - Auto-install if package.json changed

### Git Operations
**`src/utils/git-utils.ts`** - Git helpers:
- `getCurrentBranch()` - Get active branch name
- `hasUncommittedChanges()` - Check working directory status
- `commitChanges(message)` - Create commit with `[monty]` prefix
- `generateGitSummary()` - Recent commits, branch, status

### Error Recovery
**`src/utils/error-recovery.ts`** - Checkpoint system:
- `createCheckpoint(featureId)` - Save codebase state
- `restoreCheckpoint(checkpointId)` - Rollback to previous state
- `listCheckpoints()` - Show available recovery points

### Health Monitoring
**`src/utils/health-check.ts`** - System health validation:
- Checks if dev server is running
- Validates environment variables
- Ensures dependencies are installed
- Confirms browser automation is available
- Returns pass/fail status with warnings

## Poka-yoke Constraints

The framework enforces these rules to prevent common agent failures:

1. **Cannot delete features** - `deleteFeature()` throws error
2. **Cannot modify test steps** - `steps` field is immutable after creation
3. **Cannot modify descriptions** - `description` field is immutable
4. **Must verify via browser** - Features cannot be marked `passes: true` without browser test
5. **Must commit changes** - Session cannot end with uncommitted changes
6. **Cannot force push** - Git operations block `--force` flag
7. **Cannot push to main** - Direct pushes to main/master are blocked

## Feature Categories

- **functional** - Core application logic, data operations
- **ui** - User interface elements, styling, responsiveness
- **integration** - API calls, data flow, third-party services
- **performance** - Loading times, bundle size, optimizations
- **accessibility** - Keyboard navigation, screen readers, ARIA labels

## Session Workflow

Each coding session follows this pattern:

1. **Review system status** - Health checks, git status, dependencies
2. **Orient** - Run `pwd`, understand working directory
3. **Read progress history** - Load `claude-progress.txt`
4. **Review git history** - `git log --oneline -20`
5. **Read feature list** - Load `feature_list.json`, find next feature
6. **Address system issues** - Fix linting errors, install deps, resolve conflicts
7. **Start dev environment** - Run `scripts/init.sh` or `scripts/init.ps1`
8. **Implement feature** - Code changes to satisfy test steps
9. **Test via browser** - Use Browser tool to verify functionality
10. **Update feature status** - Mark `passes: true` if verified
11. **Commit changes** - `git add .` + `git commit -m "[monty] feat-XXX: ..."`
12. **Log progress** - Append summary to `claude-progress.txt`
13. **End session** - Provide summary to user

## Testing

### Test Structure
```
tests/
├── auth.test.ts                    # Legacy auth tests
├── auth-subscription.test.ts       # Subscription auth flow
├── multi-auth.test.ts              # Multi-provider auth
├── cli.test.ts                     # CLI argument parsing
├── providers.test.ts               # Provider unit tests
├── orchestrator.test.ts            # Task routing tests
├── sdk-features.test.ts            # SDK compatibility tests
├── e2e/
│   ├── browser-auth.test.ts        # Browser-based OAuth
│   └── coding-agent.test.ts        # End-to-end agent execution
└── integration/
    └── providers.test.ts           # Multi-provider integration
```

### Running Tests
```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Specific test file
npx vitest run tests/multi-auth.test.ts

# E2E tests (requires credentials)
npx vitest run tests/e2e/
```

## Publishing to npm

```bash
# 1. Update version in package.json
npm version patch  # or minor, major

# 2. Build TypeScript
npm run build

# 3. Test locally
npm link
monty --version

# 4. Publish to npm (requires npm login)
npm publish

# 5. Unlink if testing
npm unlink -g @dobeutechsolutions/monty-fullstack-agent
```

The package is published as `@dobeutechsolutions/monty-fullstack-agent` under CC BY-NC 4.0 license.

## Key Implementation Patterns

### Multi-Provider Query Pattern
```typescript
import { getOrchestrator } from './orchestrator';

const orchestrator = await getOrchestrator({
  routingEnabled: true,
  multiAgentReviewEnabled: true,
  fallbackEnabled: true,
});

for await (const message of orchestrator.execute(task, {
  context: { isCodeReview: true },
  allowedTools: agentConfig.tools.coding,
})) {
  // Handle streaming responses
  if (message.type === 'result') {
    // Task complete
  }
}
```

### Provider-Specific Query Pattern
```typescript
import { getProvider } from './providers';

const claude = getProvider('anthropic');
for await (const message of claude.query(prompt, options)) {
  // Direct Claude query
}
```

### Retry Logic with Provider Fallback
```typescript
async function runWithRetry(fn, maxRetries = 3) {
  const providers = ['anthropic', 'openai', 'google'];

  for (const provider of providers) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await fn(provider);
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          // Try next provider
          continue;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw new Error('All providers and retries exhausted');
}
```

### Environment Variable Injection
The framework sets API keys for all authenticated providers:
```typescript
multiAuthManager.setEnvForChildProcess();
// Sets ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, etc.
```

## Recent Changes (Phase 5)

**Multi-Provider Orchestration** (v1.0.3):
- Added support for OpenAI Codex, Google ADK, Cursor Cloud
- Implemented task-based routing with automatic fallback
- Created multi-agent code review coordinator
- Migrated to v2.0 credential format
- Added provider-specific CLI commands
- Comprehensive test coverage for all providers

**Files Added**:
- `src/orchestrator/` - Task orchestration system
- `src/providers/` - Provider abstraction layer
- `src/config/provider-config.ts` - Multi-provider configuration
- `src/utils/multi-auth-manager.ts` - v2.0 credential management
- `tests/multi-auth.test.ts` - Multi-provider auth tests
- `tests/orchestrator.test.ts` - Task routing tests
- `tests/providers.test.ts` - Provider unit tests

**Breaking Changes**:
- `~/.monty/credentials.json` now uses v2.0 format (auto-migrated)
- CLI now requires `monty login --provider=NAME` for non-Anthropic providers
- Auth manager singleton moved from `auth-manager.ts` to `multi-auth-manager.ts`
