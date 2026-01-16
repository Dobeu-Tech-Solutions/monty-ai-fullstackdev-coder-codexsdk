/**
 * Orchestrator System Tests
 * Tests for task classification, orchestration, and multi-agent review
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TaskClassifier,
  createTaskClassifier,
  type TaskClassification,
} from '../src/orchestrator/task-classifier';
import {
  TaskOrchestrator,
  createOrchestrator,
  resetOrchestrator,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from '../src/orchestrator/index';
import {
  ReviewCoordinator,
  createReviewCoordinator,
  type ReviewFinding,
  type ProviderReview,
  type ReviewConflict,
} from '../src/orchestrator/review-coordinator';
import {
  Arbitrator,
  createArbitrator,
} from '../src/orchestrator/arbitrator';

describe('Task Classifier', () => {
  let classifier: TaskClassifier;

  beforeEach(() => {
    classifier = createTaskClassifier(['anthropic', 'openai', 'google']);
  });

  describe('Task Type Classification', () => {
    it('should classify architectural tasks', () => {
      const result = classifier.classify('Refactor the folder structure and reorganize the code modules');
      expect(result.taskType).toBe('architectural_decision');
    });

    it('should classify CI/CD tasks', () => {
      const result = classifier.classify('Set up GitHub Actions pipeline for deployment');
      expect(result.taskType).toBe('ci_cd_automation');
    });

    it('should classify test execution tasks', () => {
      const result = classifier.classify('Run the test suite and fix failing tests');
      expect(result.taskType).toBe('test_execution');
    });

    it('should classify research tasks', () => {
      const result = classifier.classify('Research how the authentication flow works');
      expect(result.taskType).toBe('research');
    });

    it('should classify documentation tasks', () => {
      const result = classifier.classify('Write API documentation for the user endpoints');
      expect(result.taskType).toBe('documentation');
    });

    it('should classify code review tasks', () => {
      const result = classifier.classify('Review the code changes in the pull request');
      expect(result.taskType).toBe('code_review');
    });

    it('should classify general tasks', () => {
      const result = classifier.classify('Hello world');
      expect(result.taskType).toBe('general');
    });
  });

  describe('Provider Routing', () => {
    it('should route complex reasoning to Anthropic', () => {
      const result = classifier.classify('Analyze the trade-offs between approaches');
      expect(result.recommendedProvider).toBe('anthropic');
    });

    it('should route CI/CD to OpenAI', () => {
      const result = classifier.classify('Create a CI pipeline');
      expect(result.recommendedProvider).toBe('openai');
    });

    it('should route research to Google', () => {
      const result = classifier.classify('Research the best practices');
      expect(result.recommendedProvider).toBe('google');
    });

    it('should provide fallback providers', () => {
      const result = classifier.classify('Run tests');
      expect(result.fallbackProviders.length).toBeGreaterThan(0);
      expect(result.fallbackProviders).not.toContain(result.recommendedProvider);
    });

    it('should respect user preference', () => {
      const result = classifier.classify('Any task', { preferredProvider: 'google' });
      expect(result.recommendedProvider).toBe('google');
    });
  });

  describe('Confidence Scoring', () => {
    it('should have higher confidence for keyword matches', () => {
      const specificTask = classifier.classify('Design the system architecture');
      const genericTask = classifier.classify('Do something');

      expect(specificTask.confidence).toBeGreaterThan(genericTask.confidence);
    });

    it('should include matched keywords', () => {
      const result = classifier.classify('Review the security of the code');
      expect(result.keywords.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Agent Detection', () => {
    it('should detect code review as multi-agent task', () => {
      expect(classifier.isMultiAgentTask('code_review')).toBe(true);
    });

    it('should not detect general tasks as multi-agent', () => {
      expect(classifier.isMultiAgentTask('general')).toBe(false);
    });
  });
});

describe('Task Orchestrator', () => {
  let orchestrator: TaskOrchestrator;

  beforeEach(() => {
    resetOrchestrator();
    orchestrator = createOrchestrator();
  });

  describe('Configuration', () => {
    it('should have default configuration', () => {
      const config = orchestrator.getConfig();
      expect(config.routingEnabled).toBe(DEFAULT_ORCHESTRATOR_CONFIG.routingEnabled);
      expect(config.fallbackEnabled).toBe(DEFAULT_ORCHESTRATOR_CONFIG.fallbackEnabled);
    });

    it('should allow configuration updates', () => {
      orchestrator.updateConfig({ routingEnabled: false });
      const config = orchestrator.getConfig();
      expect(config.routingEnabled).toBe(false);
    });
  });

  describe('Task Classification', () => {
    it('should classify tasks without executing', () => {
      const classification = orchestrator.classifyTask('Review the code');
      expect(classification.taskType).toBe('code_review');
    });

    it('should get recommended provider for task type', () => {
      // Note: May be null if no providers available
      const provider = orchestrator.getRecommendedProvider('complex_reasoning');
      // Provider could be null or a valid provider name
      expect(provider === null || typeof provider === 'string').toBe(true);
    });
  });
});

describe('Review Coordinator', () => {
  describe('Conflict Detection', () => {
    it('should detect severity mismatches', () => {
      const coordinator = createReviewCoordinator(['anthropic', 'openai']);

      const reviews: ProviderReview[] = [
        {
          provider: 'anthropic',
          findings: [{
            id: '1',
            file: 'test.ts',
            line: 10,
            type: 'security',
            severity: 'critical',
            message: 'SQL injection vulnerability',
          }],
          suggestions: [],
          overallSeverity: 'critical',
          confidence: 0.9,
          executionTime: 1000,
          rawMessages: [],
        },
        {
          provider: 'openai',
          findings: [{
            id: '2',
            file: 'test.ts',
            line: 10,
            type: 'security',
            severity: 'info',
            message: 'Potential query issue',
          }],
          suggestions: [],
          overallSeverity: 'minor',
          confidence: 0.8,
          executionTime: 1000,
          rawMessages: [],
        },
      ];

      const conflicts = coordinator.detectConflicts(reviews);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts.some(c => c.type === 'severity_mismatch')).toBe(true);
    });

    it('should detect overall assessment conflicts', () => {
      const coordinator = createReviewCoordinator(['anthropic', 'openai']);

      const reviews: ProviderReview[] = [
        {
          provider: 'anthropic',
          findings: [],
          suggestions: [],
          overallSeverity: 'critical',
          confidence: 0.9,
          executionTime: 1000,
          rawMessages: [],
        },
        {
          provider: 'openai',
          findings: [],
          suggestions: [],
          overallSeverity: 'pass',
          confidence: 0.8,
          executionTime: 1000,
          rawMessages: [],
        },
      ];

      const conflicts = coordinator.detectConflicts(reviews);
      expect(conflicts.some(c => c.type === 'contradictory')).toBe(true);
    });

    it('should not detect conflicts for similar assessments', () => {
      const coordinator = createReviewCoordinator(['anthropic', 'openai']);

      const reviews: ProviderReview[] = [
        {
          provider: 'anthropic',
          findings: [],
          suggestions: [],
          overallSeverity: 'minor',
          confidence: 0.9,
          executionTime: 1000,
          rawMessages: [],
        },
        {
          provider: 'openai',
          findings: [],
          suggestions: [],
          overallSeverity: 'minor',
          confidence: 0.8,
          executionTime: 1000,
          rawMessages: [],
        },
      ];

      const conflicts = coordinator.detectConflicts(reviews);
      expect(conflicts.length).toBe(0);
    });
  });

  describe('Consensus Finding', () => {
    it('should find consensus findings across reviews', () => {
      const coordinator = createReviewCoordinator(['anthropic', 'openai']);

      const sharedFinding: ReviewFinding = {
        id: 'shared',
        file: 'test.ts',
        line: 10,
        type: 'bug',
        severity: 'error',
        message: 'Off-by-one error',
      };

      const reviews: ProviderReview[] = [
        {
          provider: 'anthropic',
          findings: [sharedFinding],
          suggestions: [],
          overallSeverity: 'major',
          confidence: 0.9,
          executionTime: 1000,
          rawMessages: [],
        },
        {
          provider: 'openai',
          findings: [{
            ...sharedFinding,
            id: 'shared2',
            line: 11, // Close enough (within 3 lines)
          }],
          suggestions: [],
          overallSeverity: 'major',
          confidence: 0.8,
          executionTime: 1000,
          rawMessages: [],
        },
      ];

      const consensus = coordinator.findConsensus(reviews);
      expect(consensus.length).toBe(1);
    });
  });

  describe('Arbitration Need', () => {
    it('should require arbitration for contradictory conflicts', () => {
      const coordinator = createReviewCoordinator(['anthropic', 'openai']);

      const conflicts: ReviewConflict[] = [{
        id: '1',
        type: 'contradictory',
        provider1: 'anthropic',
        position1: 'critical',
        provider2: 'openai',
        position2: 'pass',
        description: 'Overall assessment differs',
      }];

      expect(coordinator.needsArbitration(conflicts)).toBe(true);
    });

    it('should not require arbitration for no conflicts', () => {
      const coordinator = createReviewCoordinator(['anthropic', 'openai']);
      expect(coordinator.needsArbitration([])).toBe(false);
    });
  });
});

describe('Arbitrator', () => {
  let arbitrator: Arbitrator;

  beforeEach(() => {
    arbitrator = createArbitrator();
  });

  describe('Configuration', () => {
    it('should have default configuration', () => {
      const config = arbitrator.getConfig();
      expect(config.provider).toBe('anthropic');
      expect(config.investigateCode).toBe(true);
    });

    it('should allow configuration updates', () => {
      arbitrator.updateConfig({ provider: 'google' });
      const config = arbitrator.getConfig();
      expect(config.provider).toBe('google');
    });
  });

  describe('No Conflict Resolution', () => {
    it('should return clean result when no conflicts exist', async () => {
      const reviewResult = {
        reviews: [{
          provider: 'anthropic' as const,
          findings: [],
          suggestions: [],
          overallSeverity: 'pass' as const,
          confidence: 0.9,
          executionTime: 1000,
          rawMessages: [],
        }],
        conflicts: [],
        consensusFindings: [],
        needsArbitration: false,
        summary: 'No conflicts',
      };

      const result = await arbitrator.resolve(reviewResult);

      expect(result.decisions.length).toBe(0);
      expect(result.summary).toContain('No conflicts');
    });
  });
});
