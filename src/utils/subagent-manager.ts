/**
 * Subagent Manager
 * Implements subagent spawning and coordination for the Claude Agent SDK.
 * Subagents are specialized agent instances for focused tasks.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { agentConfig } from '../config/agent-config.js';

/**
 * Subagent configuration
 */
export interface SubagentConfig {
  name: string;
  description: string;
  role: 'reviewer' | 'tester' | 'researcher' | 'documenter' | 'debugger' | 'custom';
  tools: string[];
  systemPrompt: string;
  maxTurns?: number;
  model?: string;
}

/**
 * Subagent execution result
 */
export interface SubagentResult {
  subagentId: string;
  name: string;
  role: string;
  success: boolean;
  output: string;
  artifacts?: Record<string, unknown>;
  durationMs: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  error?: string;
}

/**
 * Subagent task definition
 */
export interface SubagentTask {
  type: 'review' | 'test' | 'research' | 'document' | 'debug' | 'custom';
  description: string;
  context?: string;
  files?: string[];
  constraints?: string[];
  outputFormat?: 'text' | 'json' | 'markdown';
}

/**
 * Pre-defined subagent configurations
 */
export const PREDEFINED_SUBAGENTS: Record<string, SubagentConfig> = {
  codeReviewer: {
    name: 'Code Reviewer',
    description: 'Reviews code for quality, security, and best practices',
    role: 'reviewer',
    tools: ['Read', 'Glob', 'Grep'],
    systemPrompt: `You are a code reviewer specializing in finding issues and suggesting improvements.

Focus on:
- Security vulnerabilities
- Performance issues
- Code quality and maintainability
- Best practices adherence
- Potential bugs and edge cases

Provide specific, actionable feedback with file paths and line numbers when possible.`,
  },

  testGenerator: {
    name: 'Test Generator',
    description: 'Generates comprehensive test cases for code',
    role: 'tester',
    tools: ['Read', 'Glob', 'Grep'],
    systemPrompt: `You are a test engineer specializing in creating comprehensive test suites.

Focus on:
- Unit tests for individual functions
- Integration tests for components
- Edge cases and error handling
- Test coverage optimization
- Clear test naming and documentation

Generate tests that are maintainable and follow testing best practices.`,
  },

  researcher: {
    name: 'Research Assistant',
    description: 'Researches documentation and best practices',
    role: 'researcher',
    tools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    systemPrompt: `You are a research assistant helping developers find relevant information.

Focus on:
- Official documentation and APIs
- Best practices and patterns
- Common issues and solutions
- Performance considerations
- Security recommendations

Provide well-sourced, accurate information with links where possible.`,
  },

  documenter: {
    name: 'Documentation Writer',
    description: 'Creates and improves documentation',
    role: 'documenter',
    tools: ['Read', 'Glob', 'Grep'],
    systemPrompt: `You are a technical writer creating clear, comprehensive documentation.

Focus on:
- README files and getting started guides
- API documentation
- Code comments and docstrings
- Architecture documentation
- Usage examples

Write documentation that is clear, accurate, and helpful for developers.`,
  },

  debugger: {
    name: 'Debug Assistant',
    description: 'Helps diagnose and fix bugs',
    role: 'debugger',
    tools: ['Read', 'Glob', 'Grep', 'Bash'],
    systemPrompt: `You are a debugging expert helping to identify and resolve issues.

Focus on:
- Root cause analysis
- Error message interpretation
- Stack trace analysis
- Reproduction steps
- Fix recommendations

Provide systematic debugging approaches and clear explanations.`,
  },
};

/**
 * Subagent Manager class
 */
export class SubagentManager {
  private activeSubagents: Map<string, SubagentConfig> = new Map();
  private results: SubagentResult[] = [];
  private enabled: boolean;

  constructor() {
    this.enabled = agentConfig.features.enableSubagents;
  }

  /**
   * Check if subagents are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable subagents
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get a predefined subagent configuration
   */
  getPredefined(name: keyof typeof PREDEFINED_SUBAGENTS): SubagentConfig | undefined {
    return PREDEFINED_SUBAGENTS[name];
  }

  /**
   * List all predefined subagent types
   */
  listPredefined(): Array<{ name: string; description: string; role: string }> {
    return Object.entries(PREDEFINED_SUBAGENTS).map(([key, config]) => ({
      name: key,
      description: config.description,
      role: config.role,
    }));
  }

  /**
   * Create a custom subagent configuration
   */
  createConfig(
    name: string,
    description: string,
    systemPrompt: string,
    options?: Partial<Omit<SubagentConfig, 'name' | 'description' | 'systemPrompt'>>
  ): SubagentConfig {
    return {
      name,
      description,
      systemPrompt,
      role: options?.role || 'custom',
      tools: options?.tools || ['Read', 'Glob', 'Grep'],
      maxTurns: options?.maxTurns,
      model: options?.model,
    };
  }

  /**
   * Build prompt for subagent execution
   */
  buildSubagentPrompt(config: SubagentConfig, task: SubagentTask): string {
    const sections: string[] = [];

    // System context
    sections.push(`# ${config.name}`);
    sections.push(`Role: ${config.role}`);
    sections.push('');
    sections.push(config.systemPrompt);
    sections.push('');

    // Task description
    sections.push('## Task');
    sections.push(task.description);
    sections.push('');

    // Context if provided
    if (task.context) {
      sections.push('## Context');
      sections.push(task.context);
      sections.push('');
    }

    // Files to focus on
    if (task.files && task.files.length > 0) {
      sections.push('## Files to Review');
      for (const file of task.files) {
        sections.push(`- ${file}`);
      }
      sections.push('');
    }

    // Constraints
    if (task.constraints && task.constraints.length > 0) {
      sections.push('## Constraints');
      for (const constraint of task.constraints) {
        sections.push(`- ${constraint}`);
      }
      sections.push('');
    }

    // Output format
    if (task.outputFormat) {
      sections.push('## Output Format');
      sections.push(`Please provide your response in ${task.outputFormat} format.`);
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Create a code review task
   */
  createReviewTask(files: string[], context?: string): SubagentTask {
    return {
      type: 'review',
      description: 'Review the specified files for code quality, security, and best practices.',
      context,
      files,
      outputFormat: 'markdown',
    };
  }

  /**
   * Create a test generation task
   */
  createTestTask(files: string[], testType?: 'unit' | 'integration' | 'e2e'): SubagentTask {
    return {
      type: 'test',
      description: `Generate ${testType || 'unit'} tests for the specified files.`,
      files,
      constraints: [
        'Follow existing test patterns in the codebase',
        'Include edge cases and error handling',
        'Use descriptive test names',
      ],
      outputFormat: 'markdown',
    };
  }

  /**
   * Create a research task
   */
  createResearchTask(topic: string, context?: string): SubagentTask {
    return {
      type: 'research',
      description: `Research: ${topic}`,
      context,
      constraints: [
        'Cite sources when possible',
        'Focus on official documentation',
        'Provide practical examples',
      ],
      outputFormat: 'markdown',
    };
  }

  /**
   * Create a documentation task
   */
  createDocumentTask(files: string[], docType?: 'readme' | 'api' | 'inline'): SubagentTask {
    return {
      type: 'document',
      description: `Create ${docType || 'documentation'} for the specified files.`,
      files,
      constraints: [
        'Be clear and concise',
        'Include code examples',
        'Follow project documentation style',
      ],
      outputFormat: 'markdown',
    };
  }

  /**
   * Create a debug task
   */
  createDebugTask(
    errorDescription: string,
    stackTrace?: string,
    files?: string[]
  ): SubagentTask {
    return {
      type: 'debug',
      description: `Debug issue: ${errorDescription}`,
      context: stackTrace ? `Stack trace:\n\`\`\`\n${stackTrace}\n\`\`\`` : undefined,
      files,
      constraints: [
        'Identify the root cause',
        'Suggest specific fixes',
        'Explain the reasoning',
      ],
      outputFormat: 'markdown',
    };
  }

  /**
   * Register a subagent as active
   */
  registerActive(id: string, config: SubagentConfig): void {
    this.activeSubagents.set(id, config);
  }

  /**
   * Unregister an active subagent
   */
  unregisterActive(id: string): void {
    this.activeSubagents.delete(id);
  }

  /**
   * Get active subagent count
   */
  getActiveCount(): number {
    return this.activeSubagents.size;
  }

  /**
   * Record a subagent result
   */
  recordResult(result: SubagentResult): void {
    this.results.push(result);
    this.unregisterActive(result.subagentId);
  }

  /**
   * Get all results
   */
  getResults(): SubagentResult[] {
    return [...this.results];
  }

  /**
   * Get summary of subagent activity
   */
  getSummary(): string {
    if (this.results.length === 0) {
      return 'No subagent activity';
    }

    const successCount = this.results.filter(r => r.success).length;
    const totalTime = this.results.reduce((sum, r) => sum + r.durationMs, 0);
    const totalTokens = this.results.reduce(
      (sum, r) => sum + (r.tokenUsage?.input || 0) + (r.tokenUsage?.output || 0),
      0
    );

    return `Subagents: ${successCount}/${this.results.length} successful, ${Math.round(totalTime / 1000)}s total, ${totalTokens} tokens`;
  }

  /**
   * Clear results
   */
  clearResults(): void {
    this.results = [];
  }
}

/**
 * Create a subagent manager instance
 */
export function createSubagentManager(): SubagentManager {
  return new SubagentManager();
}

export default SubagentManager;
