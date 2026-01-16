/**
 * Task Orchestrator
 * Coordinates task execution across multiple AI providers with
 * automatic routing, fallback, and multi-agent review capabilities.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import {
  type ProviderName,
  type TaskType,
  PROVIDER_CONFIGS,
  getProviderConfig,
} from '../config/provider-config.js';
import {
  getProvider,
  getAvailableProviders,
  type BaseProvider,
  type AgentMessage,
  type QueryOptions,
} from '../providers/index.js';
import {
  TaskClassifier,
  createTaskClassifier,
  type TaskClassification,
  type TaskContext,
} from './task-classifier.js';

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Enable task-based routing */
  routingEnabled: boolean;
  /** Enable multi-agent review for code_review tasks */
  multiAgentReviewEnabled: boolean;
  /** Enable automatic fallback to alternative providers */
  fallbackEnabled: boolean;
  /** Maximum retry attempts per provider */
  maxRetries: number;
  /** Default provider when routing is disabled */
  defaultProvider: ProviderName;
  /** Minimum providers for multi-agent review */
  minReviewProviders: number;
  /** Provider to use for arbitration */
  arbitratorProvider: ProviderName;
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  routingEnabled: true,
  multiAgentReviewEnabled: true,
  fallbackEnabled: true,
  maxRetries: 3,
  defaultProvider: 'anthropic',
  minReviewProviders: 2,
  arbitratorProvider: 'anthropic',
};

/**
 * Orchestrator execution result
 */
export interface OrchestratorResult {
  success: boolean;
  provider: ProviderName;
  taskType: TaskType;
  classification: TaskClassification;
  messages: AgentMessage[];
  fallbacksUsed: ProviderName[];
  error?: string;
}

/**
 * Task Orchestrator
 * Main coordinator for multi-provider task execution
 */
export class TaskOrchestrator {
  private config: OrchestratorConfig;
  private classifier: TaskClassifier;
  private availableProviders: ProviderName[] = [];

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.classifier = createTaskClassifier();
  }

  /**
   * Initialize the orchestrator - detect available providers
   */
  async initialize(): Promise<void> {
    const available = await getAvailableProviders();
    this.availableProviders = available.map(p => p.name);
    this.classifier.setAvailableProviders(this.availableProviders);
    this.classifier.setDefaultProvider(this.config.defaultProvider);

    console.log(`Orchestrator initialized with ${this.availableProviders.length} providers:`);
    for (const provider of this.availableProviders) {
      console.log(`  ✓ ${getProviderConfig(provider).displayName}`);
    }
  }

  /**
   * Execute a task with automatic routing and fallback
   */
  async *execute(
    task: string,
    options: QueryOptions & { context?: TaskContext }
  ): AsyncGenerator<AgentMessage, OrchestratorResult, unknown> {
    const context = options.context ?? {};

    // Classify the task
    const classification = this.config.routingEnabled
      ? this.classifier.classify(task, context)
      : this.createDefaultClassification(task);

    console.log(`\n📋 Task Classification:`);
    console.log(`   Type: ${classification.taskType}`);
    console.log(`   Provider: ${getProviderConfig(classification.recommendedProvider).displayName}`);
    console.log(`   Confidence: ${Math.round(classification.confidence * 100)}%`);
    if (classification.keywords.length > 0) {
      console.log(`   Keywords: ${classification.keywords.join(', ')}`);
    }

    // Check if multi-agent review is needed
    if (
      this.config.multiAgentReviewEnabled &&
      this.classifier.isMultiAgentTask(classification.taskType)
    ) {
      console.log(`\n⚖️  Multi-agent review enabled for this task type`);
      // TODO: Implement multi-agent review coordinator
      // For now, fall through to single-provider execution
    }

    // Build provider order
    const providerOrder = [
      classification.recommendedProvider,
      ...classification.fallbackProviders,
    ];

    const messages: AgentMessage[] = [];
    const fallbacksUsed: ProviderName[] = [];
    let lastError: string | undefined;
    let successProvider: ProviderName | undefined;

    // Try providers in order
    for (const providerName of providerOrder) {
      if (!this.availableProviders.includes(providerName)) {
        continue;
      }

      try {
        console.log(`\n🔄 Executing with ${getProviderConfig(providerName).displayName}...`);

        const provider = getProvider(providerName);

        // Execute query
        for await (const message of provider.query(task, options)) {
          messages.push(message);
          yield message;

          // Check for success
          if (message.type === 'result' && message.subtype === 'success') {
            successProvider = providerName;
            break;
          }
        }

        if (successProvider) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.warn(`Provider ${providerName} failed: ${lastError}`);

        if (providerName !== classification.recommendedProvider) {
          fallbacksUsed.push(providerName);
        }

        if (!this.config.fallbackEnabled) {
          break;
        }

        // Continue to next provider
        continue;
      }
    }

    return {
      success: !!successProvider,
      provider: successProvider ?? classification.recommendedProvider,
      taskType: classification.taskType,
      classification,
      messages,
      fallbacksUsed,
      error: successProvider ? undefined : lastError,
    };
  }

  /**
   * Create a default classification when routing is disabled
   */
  private createDefaultClassification(task: string): TaskClassification {
    return {
      taskType: 'general',
      recommendedProvider: this.config.defaultProvider,
      fallbackProviders: this.availableProviders.filter(
        p => p !== this.config.defaultProvider
      ),
      confidence: 1.0,
      reasoning: 'Routing disabled, using default provider',
      requiredCapabilities: ['tool_use'],
      keywords: [],
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.defaultProvider) {
      this.classifier.setDefaultProvider(config.defaultProvider);
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): ProviderName[] {
    return [...this.availableProviders];
  }

  /**
   * Check if multi-agent review is available
   */
  canDoMultiAgentReview(): boolean {
    return (
      this.config.multiAgentReviewEnabled &&
      this.availableProviders.length >= this.config.minReviewProviders
    );
  }

  /**
   * Get the task classifier for direct access
   */
  getClassifier(): TaskClassifier {
    return this.classifier;
  }

  /**
   * Manually classify a task without executing
   */
  classifyTask(task: string, context?: TaskContext): TaskClassification {
    return this.classifier.classify(task, context);
  }

  /**
   * Get provider recommendation for a task type
   */
  getRecommendedProvider(taskType: TaskType): ProviderName | null {
    const providers = this.classifier.getProvidersForTask(taskType);
    return providers[0] ?? null;
  }
}

/**
 * Create a task orchestrator instance
 */
export function createOrchestrator(
  config?: Partial<OrchestratorConfig>
): TaskOrchestrator {
  return new TaskOrchestrator(config);
}

/**
 * Singleton orchestrator instance
 */
let orchestratorInstance: TaskOrchestrator | null = null;

/**
 * Get or create the orchestrator singleton
 */
export async function getOrchestrator(
  config?: Partial<OrchestratorConfig>
): Promise<TaskOrchestrator> {
  if (!orchestratorInstance) {
    orchestratorInstance = createOrchestrator(config);
    await orchestratorInstance.initialize();
  }
  return orchestratorInstance;
}

/**
 * Reset the orchestrator singleton (for testing)
 */
export function resetOrchestrator(): void {
  orchestratorInstance = null;
}

// Re-export types
export {
  TaskClassifier,
  createTaskClassifier,
  type TaskClassification,
  type TaskContext,
};

export default TaskOrchestrator;
