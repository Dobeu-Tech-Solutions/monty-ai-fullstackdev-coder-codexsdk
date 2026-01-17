# Memory: monty-autonomous-fullstack-dev-multillm

## Package Information
- **Package Name**: `monty-autonomous-fullstack-dev-multillm`
- **NPM URL**: https://www.npmjs.com/package/monty-autonomous-fullstack-dev-multillm
- **CLI Command**: `montyx` (ONLY - no aliases)
- **Version**: 1.0.2
- **Description**: Multi-LLM autonomous full-stack development agent - supports Anthropic, OpenAI, Google, and Cursor
- **Repository**: https://github.com/Dobeu-Tech-Solutions/monty-ai-fullstackdev-coder-codexsdk

## Installation

### Prerequisites
- **Node.js** >= 18.0.0
- **AI Provider Access**: Claude Code Subscription, Anthropic API Key, OpenAI API Key, Google API Key, or Cursor Cloud subscription

### Global Installation

#### Windows (PowerShell)
```powershell
# Install globally
npm install -g monty-autonomous-fullstack-dev-multillm

# Authenticate (interactive - auto-detects Claude Code)
montyx login

# Or configure specific providers
montyx login --provider=anthropic
montyx login --provider=openai
montyx login --provider=google
montyx login --provider=cursor
montyx login --provider=all  # Configure all providers

# Verify installation
montyx --help
```

#### macOS
```bash
# Install globally
npm install -g monty-autonomous-fullstack-dev-multillm

# Authenticate
montyx login

# Verify installation
montyx --help
```

#### Linux
```bash
# Install globally
npm install -g monty-autonomous-fullstack-dev-multillm

# Authenticate
montyx login

# Verify installation
montyx --help
```

### Project-Level Installation
```bash
# Add to existing project
npm install --save-dev monty-autonomous-fullstack-dev-multillm

# Add to package.json scripts:
# "scripts": {
#   "agent:init": "montyx init",
#   "agent:code": "montyx code"
# }
```

### Run with npx (No Install)
```bash
npx monty-autonomous-fullstack-dev-multillm --help
npx monty-autonomous-fullstack-dev-multillm init --spec="Your project idea"
```

## Initial Setup

### 1. Authentication (Multi-Provider)

#### Interactive Login (Recommended)
```bash
# Auto-detects Claude Code subscription across machine
montyx login

# Configure specific provider
montyx login --provider=anthropic   # Claude/Anthropic
montyx login --provider=openai       # OpenAI/Codex
montyx login --provider=google       # Google/Gemini
montyx login --provider=cursor       # Cursor Cloud
montyx login --provider=all         # Configure all providers
```

#### Environment Variables (Alternative)
```bash
# Set API keys via environment variables
export ANTHROPIC_API_KEY="sk-ant-..."      # Linux/macOS
export OPENAI_API_KEY="sk-..."             # Linux/macOS
export GOOGLE_API_KEY="..."                # Linux/macOS
export CURSOR_API_KEY="..."                # Linux/macOS

# Windows PowerShell
$env:ANTHROPIC_API_KEY="sk-ant-..."
$env:OPENAI_API_KEY="sk-..."
$env:GOOGLE_API_KEY="..."
$env:CURSOR_API_KEY="..."
```

#### Check Authentication Status
```bash
# Show all provider status
montyx providers

# Show current authentication
montyx whoami
```

### 2. Initialize New Project
```bash
# Create project directory
mkdir my-project && cd my-project

# Initialize with specification
montyx init --spec="Build a todo app with React, TypeScript, Tailwind CSS, and Supabase backend. Include user authentication, real-time updates, and dark mode."

# Or use auto-detect mode
montyx --spec="Build a todo app with React and Supabase"
```

### 3. Continue Development
```bash
# Continue incremental development
montyx code

# With additional context
montyx code --context="Focus on fixing the login bug in auth.ts"

# Check project status
montyx status
```

### 4. Add Providers After Initialization
```bash
# If you skipped a provider during initial setup, add it later
montyx --add-provider=openai
montyx --add-provider=google
```

## Key Commands

| Command | Description |
|---------|-------------|
| `montyx` | Auto-detect mode (init or continue) |
| `montyx init` | Initialize new project with feature list |
| `montyx code` | Continue incremental development |
| `montyx status` | Show project progress |
| `montyx setup` | Set up Montyx in current directory |
| `montyx login` | Interactive login (auto-detects Claude Code) |
| `montyx login --provider=NAME` | Login to specific provider |
| `montyx logout` | Sign out from all providers |
| `montyx logout --provider=NAME` | Logout from specific provider |
| `montyx whoami` | Show current authentication status |
| `montyx providers` | Show all provider status |
| `montyx --add-provider=NAME` | Add provider after initialization |
| `montyx --set-default=NAME` | Set default provider for routing |
| `montyx --help` | Show detailed help |

## Configuration

### Config Directory
- **Location**: `~/.montyx/credentials.json`
- **Format**: v2.0 multi-provider credentials format
- **Structure**:
```json
{
  "version": "2.0",
  "defaultProvider": "anthropic",
  "providers": {
    "anthropic": { "apiKey": "...", "method": "subscription" },
    "openai": { "apiKey": "...", "method": "api_key" },
    "google": { "apiKey": "...", "method": "api_key" },
    "cursor": { "apiKey": "...", "method": "api_key" }
  },
  "optedOutProviders": []
}
```
- **Permissions**: Should be `-rw-------` (600) on Unix/Mac

### Project Directory
- **Location**: `.montyx/` (in project root)
- **Contents**:
  - `feature_list.json` - Feature tracking (immutable structure)
  - `claude-progress.txt` - Progress log between sessions
  - `session_state.json` - Current session state
  - `usage_log.jsonl` - API usage tracking
  - `audit_log.jsonl` - File modification audit log
  - `checkpoints/` - Recovery checkpoints

### Git Integration
- **Commit Prefix**: `[montyx]`
- **Auto-commit**: Enabled by default
- **Example**: `[montyx] feat-001: Implement user authentication`

## Multi-Provider Architecture

### Supported Providers
1. **Anthropic (Claude)** - Default, best for complex reasoning
   - Models: Claude Sonnet 4, Claude Opus 4, Claude 3.5 Sonnet
   - Auto-detects Claude Code subscription across machine

2. **OpenAI (Codex)** - Best for CI/CD automation
   - Models: GPT-4 Turbo, GPT-4o, GPT-4o Mini, O1

3. **Google (Gemini)** - Best for research and documentation
   - Models: Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 3 Pro
   - 1M-2M token context windows

4. **Cursor Cloud** - Best for IDE tasks
   - REST API only
   - Subscription-based

### Task Routing
The orchestrator automatically routes tasks to optimal providers:
- `complex_reasoning` → Claude, Gemini
- `ci_cd_automation` → OpenAI, Claude
- `research` → Gemini, Claude
- `code_review` → Multi-agent (Claude + OpenAI + Gemini)

## Workflow

1. **First Run**: `montyx init --spec="..."` creates feature list
2. **Development**: `montyx code` implements features incrementally
3. **Provider Routing**: Tasks automatically routed to optimal provider
4. **Testing**: Agent uses browser automation for verification
5. **Commits**: Changes auto-committed with `[montyx]` prefix
6. **Repeat**: Run `montyx code` until all features pass

## Architecture

- **Two-Agent System**: Initializer Agent (first run) + Coding Agent (subsequent runs)
- **Multi-Provider Orchestration**: Automatic task routing with fallback
- **Multi-Agent Code Review**: Parallel review by multiple providers
- **Progress Tracking**: JSON-based feature list with immutable structure
- **Session Bridging**: Progress file maintains context across sessions
- **Browser Testing**: Puppeteer MCP integration for end-to-end verification

## Key Differences from @dobeutechsolutions/monty-fullstack-agent

| Aspect | Old Package | New Package |
|--------|------------|-------------|
| CLI Command | `monty` | `montyx` |
| Config Directory | `~/.monty/` | `~/.montyx/` |
| Project Directory | `.agent/` | `.montyx/` |
| Git Prefix | `[monty]` | `[montyx]` |
| Providers | Single (Anthropic) | Multi (Anthropic, OpenAI, Google, Cursor) |
| Task Routing | N/A | Automatic provider routing |
| Code Review | Single agent | Multi-agent with arbitration |

## Notes

- This is the **enhanced** multi-LLM version
- Supports 4 AI providers with automatic routing
- Config stored in `~/.montyx/` (unique from old package)
- Project data in `.montyx/` directory (unique from old package)
- Git commits prefixed with `[montyx]` (unique from old package)
- Can be installed alongside `@dobeutechsolutions/monty-fullstack-agent` without conflicts
