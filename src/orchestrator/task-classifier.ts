/**
 * Task Classifier
 * Routes tasks to the most appropriate AI provider based on task type,
 * provider capabilities, and availability.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import {
  type ProviderName,
  type TaskType,
  TASK_ROUTING_RULES,
  PROVIDER_CONFIGS,
  getProviderConfig,
} from '../config/provider-config.js';

/**
 * Task classification result
 */
export interface TaskClassification {
  taskType: TaskType;
  recommendedProvider: ProviderName;
  fallbackProviders: ProviderName[];
  confidence: number;
  reasoning: string;
  requiredCapabilities: string[];
  keywords: string[];
}

/**
 * Task context for classification
 */
export interface TaskContext {
  /** Current feature being worked on */
  currentFeature?: string;
  /** Project type (react, nextjs, etc.) */
  projectType?: string;
  /** Available providers (authenticated) */
  availableProviders?: ProviderName[];
  /** Previous task types in session */
  sessionHistory?: TaskType[];
  /** User preference override */
  preferredProvider?: ProviderName;
}

/**
 * Keyword patterns for task classification
 */
const TASK_PATTERNS: Record<TaskType, {
  keywords: string[];
  phrases: string[];
  weight: number;
}> = {
  complex_reasoning: {
    keywords: ['analyze', 'design', 'architect', 'evaluate', 'compare', 'decide', 'trade-off', 'strategy'],
    phrases: ['best approach', 'should we', 'pros and cons', 'what if', 'how should'],
    weight: 1.0,
  },
  architectural_decision: {
    keywords: ['architecture', 'structure', 'design', 'pattern', 'refactor', 'reorganize', 'modular'],
    phrases: ['folder structure', 'code organization', 'design pattern', 'system design'],
    weight: 1.0,
  },
  ci_cd_automation: {
    keywords: ['ci', 'cd', 'pipeline', 'deploy', 'github', 'actions', 'workflow', 'build', 'release'],
    phrases: ['github actions', 'ci/cd', 'deployment', 'continuous integration', 'automated testing'],
    weight: 1.0,
  },
  test_execution: {
    keywords: ['test', 'spec', 'coverage', 'jest', 'vitest', 'playwright', 'cypress', 'unit', 'integration', 'e2e'],
    phrases: ['run tests', 'test coverage', 'write tests', 'test suite', 'test file'],
    weight: 0.9,
  },
  research: {
    keywords: ['research', 'investigate', 'explore', 'find', 'search', 'look up', 'learn', 'understand'],
    phrases: ['how does', 'what is', 'find out', 'look into', 'research about'],
    weight: 0.8,
  },
  documentation: {
    keywords: ['document', 'readme', 'docs', 'jsdoc', 'comment', 'explain', 'describe', 'api'],
    phrases: ['write documentation', 'add comments', 'update readme', 'api docs', 'document the'],
    weight: 0.9,
  },
  ide_task: {
    keywords: ['file', 'edit', 'rename', 'move', 'delete', 'create', 'open', 'navigate', 'quick'],
    phrases: ['create file', 'rename file', 'quick edit', 'simple change', 'small fix'],
    weight: 0.7,
  },
  rapid_prototyping: {
    keywords: ['prototype', 'quick', 'poc', 'sketch', 'mock', 'draft', 'experiment', 'try'],
    phrases: ['quick prototype', 'proof of concept', 'try out', 'experiment with'],
    weight: 0.8,
  },
  code_review: {
    keywords: ['review', 'audit', 'check', 'inspect', 'security', 'quality', 'lint', 'analyze'],
    phrases: ['code review', 'security audit', 'review the', 'check the code', 'analyze code'],
    weight: 1.0,
  },
  general: {
    keywords: [],
    phrases: [],
    weight: 0.5,
  },
};

/**
 * Task Classifier
 * Analyzes task descriptions and routes to appropriate providers
 */
export class TaskClassifier {
  private availableProviders: Set<ProviderName>;
  private defaultProvider: ProviderName = 'anthropic';

  constructor(availableProviders?: ProviderName[]) {
    this.availableProviders = new Set(
      availableProviders ?? ['anthropic']
    );
  }

  /**
   * Update available providers
   */
  setAvailableProviders(providers: ProviderName[]): void {
    this.availableProviders = new Set(providers);
  }

  /**
   * Set default provider
   */
  setDefaultProvider(provider: ProviderName): void {
    this.defaultProvider = provider;
  }

  /**
   * Classify a task and recommend a provider
   */
  classify(task: string, context?: TaskContext): TaskClassification {
    const normalizedTask = task.toLowerCase();
    const scores: Map<TaskType, number> = new Map();
    const matchedKeywords: string[] = [];

    // Score each task type
    for (const [taskType, patterns] of Object.entries(TASK_PATTERNS)) {
      let score = 0;

      // Check keywords
      for (const keyword of patterns.keywords) {
        if (normalizedTask.includes(keyword)) {
          score += 1;
          matchedKeywords.push(keyword);
        }
      }

      // Check phrases (weighted higher)
      for (const phrase of patterns.phrases) {
        if (normalizedTask.includes(phrase)) {
          score += 2;
          matchedKeywords.push(phrase);
        }
      }

      // Apply weight
      scores.set(taskType as TaskType, score * patterns.weight);
    }

    // Find best match
    let bestType: TaskType = 'general';
    let bestScore = 0;

    for (const [taskType, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestType = taskType;
      }
    }

    // Get routing preference
    const routingPreference = TASK_ROUTING_RULES[bestType];

    // Filter by available providers
    const availableRouting = routingPreference.filter(p =>
      this.availableProviders.has(p)
    );

    // Apply user preference if specified
    let recommendedProvider: ProviderName;
    if (context?.preferredProvider && this.availableProviders.has(context.preferredProvider)) {
      recommendedProvider = context.preferredProvider;
    } else if (availableRouting.length > 0) {
      recommendedProvider = availableRouting[0]!;
    } else {
      recommendedProvider = this.defaultProvider;
    }

    // Build fallback list
    const fallbackProviders = availableRouting
      .filter(p => p !== recommendedProvider)
      .slice(0, 3);

    // Calculate confidence
    const confidence = this.calculateConfidence(bestScore, matchedKeywords.length);

    // Get required capabilities for this task type
    const requiredCapabilities = this.getRequiredCapabilities(bestType);

    // Generate reasoning
    const reasoning = this.generateReasoning(
      bestType,
      recommendedProvider,
      matchedKeywords,
      confidence
    );

    return {
      taskType: bestType,
      recommendedProvider,
      fallbackProviders,
      confidence,
      reasoning,
      requiredCapabilities,
      keywords: [...new Set(matchedKeywords)],
    };
  }

  /**
   * Calculate classification confidence (0-1)
   */
  private calculateConfidence(score: number, keywordCount: number): number {
    if (score === 0) return 0.5; // Default confidence for general tasks

    // Base confidence from score
    const baseConfidence = Math.min(score / 5, 1);

    // Bonus for multiple keyword matches
    const keywordBonus = Math.min(keywordCount * 0.1, 0.3);

    return Math.min(baseConfidence + keywordBonus, 1);
  }

  /**
   * Get required capabilities for a task type
   */
  private getRequiredCapabilities(taskType: TaskType): string[] {
    switch (taskType) {
      case 'complex_reasoning':
        return ['reasoning', 'tool_use'];
      case 'architectural_decision':
        return ['reasoning', 'tool_use'];
      case 'ci_cd_automation':
        return ['tool_use', 'codeExecution'];
      case 'test_execution':
        return ['tool_use', 'codeExecution'];
      case 'research':
        return ['reasoning'];
      case 'documentation':
        return ['reasoning'];
      case 'ide_task':
        return ['tool_use'];
      case 'rapid_prototyping':
        return ['tool_use', 'codeExecution'];
      case 'code_review':
        return ['reasoning', 'tool_use'];
      default:
        return ['tool_use'];
    }
  }

  /**
   * Generate human-readable reasoning for the classification
   */
  private generateReasoning(
    taskType: TaskType,
    provider: ProviderName,
    keywords: string[],
    confidence: number
  ): string {
    const providerConfig = getProviderConfig(provider);
    const taskDescriptions: Record<TaskType, string> = {
      complex_reasoning: 'complex reasoning and analysis',
      architectural_decision: 'architectural design and decisions',
      ci_cd_automation: 'CI/CD and deployment automation',
      test_execution: 'test execution and coverage',
      research: 'research and investigation',
      documentation: 'documentation and explanation',
      ide_task: 'quick file operations',
      rapid_prototyping: 'rapid prototyping and experimentation',
      code_review: 'code review and quality analysis',
      general: 'general development tasks',
    };

    let reasoning = `Task classified as "${taskType}" (${taskDescriptions[taskType]})`;

    if (keywords.length > 0) {
      reasoning += ` based on keywords: ${keywords.slice(0, 3).join(', ')}`;
    }

    reasoning += `. Recommended provider: ${providerConfig.displayName}`;
    reasoning += ` (confidence: ${Math.round(confidence * 100)}%)`;

    return reasoning;
  }

  /**
   * Check if a task should trigger multi-agent review
   */
  isMultiAgentTask(taskType: TaskType): boolean {
    return taskType === 'code_review';
  }

  /**
   * Get providers suitable for a task type (ordered by preference)
   */
  getProvidersForTask(taskType: TaskType): ProviderName[] {
    const routing = TASK_ROUTING_RULES[taskType];
    return routing.filter(p => this.availableProviders.has(p));
  }

  /**
   * Suggest alternative providers if primary is unavailable
   */
  suggestAlternatives(
    taskType: TaskType,
    unavailableProvider: ProviderName
  ): ProviderName[] {
    const routing = TASK_ROUTING_RULES[taskType];
    return routing.filter(p =>
      p !== unavailableProvider && this.availableProviders.has(p)
    );
  }
}

/**
 * Create a task classifier with available providers
 */
export function createTaskClassifier(availableProviders?: ProviderName[]): TaskClassifier {
  return new TaskClassifier(availableProviders);
}

export default TaskClassifier;
