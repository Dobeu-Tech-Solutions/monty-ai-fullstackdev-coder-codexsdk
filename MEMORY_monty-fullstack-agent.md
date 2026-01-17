# Memory: @dobeutechsolutions/monty-fullstack-agent

## Package Information
- **Package Name**: `@dobeutechsolutions/monty-fullstack-agent`
- **NPM URL**: https://www.npmjs.com/package/@dobeutechsolutions/monty-fullstack-agent
- **CLI Command**: `monty` (primary), `monty-agent`, `fullstack-agent` (aliases)
- **Version**: 1.0.3
- **Description**: Claude Agent SDK framework for autonomous full-stack development - from idea to production deployment
- **Repository**: https://github.com/dobeutech/monty-ai-fullstackdev-coder

## Installation

### Prerequisites
- **Node.js** >= 18.0.0
- **Claude Code Subscription** or **Anthropic API Key**

### Global Installation

#### Windows (PowerShell)
```powershell
# Install globally
npm install -g @dobeutechsolutions/monty-fullstack-agent

# Authenticate
monty login

# Verify installation
monty --help
```

#### macOS/Linux
```bash
# Install globally
npm install -g @dobeutechsolutions/monty-fullstack-agent

# Authenticate
monty login

# Verify installation
monty --help
```

### Project-Level Installation
```bash
# Add to existing project
npm install --save-dev @dobeutechsolutions/monty-fullstack-agent

# Add to package.json scripts:
# "scripts": {
#   "agent:init": "monty init",
#   "agent:code": "monty code"
# }
```

### Run with npx (No Install)
```bash
npx @dobeutechsolutions/monty-fullstack-agent --help
npx @dobeutechsolutions/monty-fullstack-agent init --spec="Your project idea"
```

## Initial Setup

### 1. Authentication
```bash
# Interactive login (recommended)
monty login

# Or set API key via environment variable
export ANTHROPIC_API_KEY="your-api-key-here"  # Linux/macOS
$env:ANTHROPIC_API_KEY="your-api-key-here"    # Windows PowerShell
```

### 2. Initialize New Project
```bash
# Create project directory
mkdir my-project && cd my-project

# Initialize with specification
monty init --spec="Build a todo app with React and Supabase"

# Or use auto-detect mode
monty --spec="Build a todo app with React and Supabase"
```

### 3. Continue Development
```bash
# Continue incremental development
monty code

# Check project status
monty status
```

## Key Commands

| Command | Description |
|---------|-------------|
| `monty` | Auto-detect mode (init or continue) |
| `monty init` | Initialize new project with feature list |
| `monty code` | Continue incremental development |
| `monty status` | Show project progress |
| `monty login` | Authenticate with Claude/Anthropic |
| `monty logout` | Sign out and clear credentials |
| `monty whoami` | Show authentication status |
| `monty --help` | Show detailed help |

## Configuration

### Config Directory
- **Location**: `~/.monty/credentials.json`
- **Format**: Stores authentication credentials
- **Permissions**: Should be `-rw-------` (600) on Unix/Mac

### Project Directory
- **Location**: `.agent/` (in project root)
- **Contents**:
  - `feature_list.json` - Feature tracking
  - `claude-progress.txt` - Progress log between sessions
  - `session_state.json` - Current session state
  - `checkpoints/` - Recovery checkpoints

### Git Integration
- **Commit Prefix**: `[monty]`
- **Auto-commit**: Enabled by default
- **Example**: `[monty] feat-001: Implement user authentication`

## Workflow

1. **First Run**: `monty init --spec="..."` creates feature list
2. **Development**: `monty code` implements features incrementally
3. **Testing**: Agent uses browser automation for verification
4. **Commits**: Changes auto-committed with `[monty]` prefix
5. **Repeat**: Run `monty code` until all features pass

## Architecture

- **Two-Agent System**: Initializer Agent (first run) + Coding Agent (subsequent runs)
- **Progress Tracking**: JSON-based feature list with immutable structure
- **Session Bridging**: Progress file maintains context across sessions
- **Browser Testing**: Puppeteer MCP integration for end-to-end verification

## Notes

- This is the **original** Claude Agent SDK framework
- Uses single-provider architecture (Anthropic/Claude)
- Config stored in `~/.monty/`
- Project data in `.agent/` directory
- Git commits prefixed with `[monty]`
