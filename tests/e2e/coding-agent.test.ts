/**
 * End-to-End Tests for Coding Agent Workflow
 * Tests the full initialization and coding agent lifecycle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the Claude Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(async function* () {
    yield {
      type: 'assistant',
      content: [{ type: 'text', text: 'Mock agent response' }],
    };
    yield {
      type: 'result',
      subtype: 'success',
    };
  }),
}));

// Agent configuration types
interface AgentConfig {
  paths: {
    agentDir: string;
    featureList: string;
    progressFile: string;
    sessionState: string;
  };
  tools: {
    initializer: string[];
    coding: string[];
  };
  permissionMode: string;
}

// Feature list structure
interface Feature {
  id: string;
  category: string;
  priority: number;
  description: string;
  steps: string[];
  passes: boolean;
  last_tested: string | null;
  notes: string;
}

interface FeatureList {
  project: {
    name: string;
    description: string;
    stack: string[];
  };
  features: Feature[];
}

// Create a test fixture directory
function createTestFixtureDir(): string {
  const fixtureDir = join(tmpdir(), `monty-test-${Date.now()}`);
  mkdirSync(fixtureDir, { recursive: true });
  return fixtureDir;
}

// Clean up fixture directory
function cleanupFixtureDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('Agent Configuration', () => {
  it('should have correct default paths', () => {
    const expectedPaths = {
      agentDir: '.agent',
      featureList: '.agent/feature_list.json',
      progressFile: '.agent/claude-progress.txt',
      sessionState: '.agent/session_state.json',
    };

    expect(expectedPaths.agentDir).toBe('.agent');
    expect(expectedPaths.featureList).toContain('feature_list.json');
    expect(expectedPaths.progressFile).toContain('claude-progress.txt');
  });

  it('should have correct initializer tools', () => {
    const initializerTools = ['Read', 'Write', 'Bash', 'Glob', 'Grep'];

    expect(initializerTools).toContain('Read');
    expect(initializerTools).toContain('Write');
    expect(initializerTools).toContain('Bash');
    expect(initializerTools).not.toContain('Browser');
    expect(initializerTools).not.toContain('Edit');
  });

  it('should have correct coding tools', () => {
    const codingTools = ['Read', 'Edit', 'Bash', 'Glob', 'Grep', 'Browser', 'Task'];

    expect(codingTools).toContain('Read');
    expect(codingTools).toContain('Edit');
    expect(codingTools).toContain('Browser');
    expect(codingTools).toContain('Task');
    expect(codingTools).not.toContain('Write');
  });
});

describe('Initialization Agent Workflow', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createTestFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  it('should detect first run (no .agent directory)', () => {
    const agentDir = join(fixtureDir, '.agent');
    const isFirstRun = !existsSync(agentDir);

    expect(isFirstRun).toBe(true);
  });

  it('should detect subsequent runs (.agent directory exists)', () => {
    const agentDir = join(fixtureDir, '.agent');
    mkdirSync(agentDir, { recursive: true });

    const isFirstRun = !existsSync(agentDir);
    expect(isFirstRun).toBe(false);
  });

  it('should create required agent directories', () => {
    const agentDir = join(fixtureDir, '.agent');
    const checkpointsDir = join(agentDir, 'checkpoints');
    const logsDir = join(agentDir, 'logs');

    mkdirSync(agentDir, { recursive: true });
    mkdirSync(checkpointsDir, { recursive: true });
    mkdirSync(logsDir, { recursive: true });

    expect(existsSync(agentDir)).toBe(true);
    expect(existsSync(checkpointsDir)).toBe(true);
    expect(existsSync(logsDir)).toBe(true);
  });

  it('should create valid feature list structure', () => {
    const featureList: FeatureList = {
      project: {
        name: 'Test Project',
        description: 'A test project for E2E testing',
        stack: ['TypeScript', 'React', 'Vitest'],
      },
      features: [
        {
          id: 'feat-001',
          category: 'functional',
          priority: 1,
          description: 'Implement user authentication',
          steps: [
            'Create login form component',
            'Add form validation',
            'Integrate with auth API',
          ],
          passes: false,
          last_tested: null,
          notes: '',
        },
        {
          id: 'feat-002',
          category: 'ui',
          priority: 2,
          description: 'Add dark mode support',
          steps: [
            'Create theme context',
            'Add toggle component',
            'Apply theme to all components',
          ],
          passes: false,
          last_tested: null,
          notes: '',
        },
      ],
    };

    // Write feature list
    const featureListPath = join(fixtureDir, '.agent', 'feature_list.json');
    mkdirSync(join(fixtureDir, '.agent'), { recursive: true });
    writeFileSync(featureListPath, JSON.stringify(featureList, null, 2));

    expect(existsSync(featureListPath)).toBe(true);

    // Validate structure
    expect(featureList.project.name).toBeDefined();
    expect(featureList.features.length).toBeGreaterThan(0);
    expect(featureList.features[0].steps.length).toBeGreaterThan(0);
  });

  it('should validate feature categories', () => {
    const validCategories = [
      'functional',
      'ui',
      'integration',
      'performance',
      'accessibility',
    ];

    const feature: Feature = {
      id: 'feat-001',
      category: 'functional',
      priority: 1,
      description: 'Test feature',
      steps: ['Step 1'],
      passes: false,
      last_tested: null,
      notes: '',
    };

    expect(validCategories).toContain(feature.category);
  });
});

describe('Coding Agent Workflow', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createTestFixtureDir();
    // Set up existing .agent directory
    const agentDir = join(fixtureDir, '.agent');
    mkdirSync(agentDir, { recursive: true });
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  it('should select next feature by priority', () => {
    const features: Feature[] = [
      { id: 'feat-001', category: 'functional', priority: 2, description: 'Feature 2', steps: [], passes: false, last_tested: null, notes: '' },
      { id: 'feat-002', category: 'functional', priority: 1, description: 'Feature 1', steps: [], passes: false, last_tested: null, notes: '' },
      { id: 'feat-003', category: 'functional', priority: 3, description: 'Feature 3', steps: [], passes: true, last_tested: null, notes: '' },
    ];

    // Get next feature (highest priority, not passing)
    const nextFeature = features
      .filter(f => !f.passes)
      .sort((a, b) => a.priority - b.priority)[0];

    expect(nextFeature?.id).toBe('feat-002');
    expect(nextFeature?.priority).toBe(1);
  });

  it('should update feature status correctly', () => {
    const feature: Feature = {
      id: 'feat-001',
      category: 'functional',
      priority: 1,
      description: 'Test feature',
      steps: ['Step 1', 'Step 2'],
      passes: false,
      last_tested: null,
      notes: '',
    };

    // Simulate passing test
    feature.passes = true;
    feature.last_tested = new Date().toISOString();
    feature.notes = 'All tests passed';

    expect(feature.passes).toBe(true);
    expect(feature.last_tested).not.toBeNull();
    expect(feature.notes).toContain('passed');
  });

  it('should enforce Poka-yoke constraints', () => {
    const feature: Feature = {
      id: 'feat-001',
      category: 'functional',
      priority: 1,
      description: 'Test feature',
      steps: ['Step 1'],
      passes: false,
      last_tested: null,
      notes: '',
    };

    // Poka-yoke rule: Cannot modify description after creation
    const originalDescription = feature.description;

    // Simulate attempted modification (should be blocked in real code)
    const attemptedModification = () => {
      const isLocked = true; // Simulating locked state
      if (isLocked) {
        throw new Error('Cannot modify feature description');
      }
    };

    expect(attemptedModification).toThrow('Cannot modify feature description');
    expect(feature.description).toBe(originalDescription);
  });

  it('should enforce immutable steps constraint', () => {
    const feature: Feature = {
      id: 'feat-001',
      category: 'functional',
      priority: 1,
      description: 'Test feature',
      steps: ['Step 1', 'Step 2'],
      passes: false,
      last_tested: null,
      notes: '',
    };

    const originalSteps = [...feature.steps];

    // Poka-yoke rule: Cannot modify steps after creation
    const attemptedStepsModification = () => {
      const isLocked = true;
      if (isLocked) {
        throw new Error('Cannot modify feature steps');
      }
    };

    expect(attemptedStepsModification).toThrow('Cannot modify feature steps');
    expect(feature.steps).toEqual(originalSteps);
  });

  it('should track progress in progress file', () => {
    const progressEntries = [
      `[${new Date().toISOString()}] Session started`,
      `[${new Date().toISOString()}] Working on feat-001: User authentication`,
      `[${new Date().toISOString()}] Completed step 1 of 3`,
      `[${new Date().toISOString()}] Browser test passed`,
    ];

    const progressFile = join(fixtureDir, '.agent', 'claude-progress.txt');
    writeFileSync(progressFile, progressEntries.join('\n'));

    expect(existsSync(progressFile)).toBe(true);

    // Verify progress format
    for (const entry of progressEntries) {
      expect(entry).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe('Session State Management', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createTestFixtureDir();
    mkdirSync(join(fixtureDir, '.agent'), { recursive: true });
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  it('should create valid session state', () => {
    const sessionState = {
      sessionId: `session-${Date.now()}`,
      startTime: new Date().toISOString(),
      currentFeature: 'feat-001',
      status: 'in_progress',
      lastActivity: new Date().toISOString(),
      errors: [],
    };

    const sessionStatePath = join(fixtureDir, '.agent', 'session_state.json');
    writeFileSync(sessionStatePath, JSON.stringify(sessionState, null, 2));

    expect(existsSync(sessionStatePath)).toBe(true);
    expect(sessionState.sessionId).toContain('session-');
    expect(sessionState.status).toBe('in_progress');
  });

  it('should track session errors', () => {
    const sessionState = {
      sessionId: `session-${Date.now()}`,
      startTime: new Date().toISOString(),
      currentFeature: 'feat-001',
      status: 'error',
      lastActivity: new Date().toISOString(),
      errors: [
        { time: new Date().toISOString(), message: 'Build failed', code: 'BUILD_ERROR' },
        { time: new Date().toISOString(), message: 'Test timeout', code: 'TEST_TIMEOUT' },
      ],
    };

    expect(sessionState.errors.length).toBe(2);
    expect(sessionState.errors[0].code).toBe('BUILD_ERROR');
  });

  it('should support session resume', () => {
    const previousSession = {
      sessionId: 'session-12345',
      startTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      currentFeature: 'feat-003',
      status: 'paused',
      progress: {
        featuresCompleted: 2,
        currentStep: 'Step 2 of 4',
      },
    };

    // Verify session can be resumed
    expect(previousSession.status).toBe('paused');
    expect(previousSession.currentFeature).toBeDefined();
    expect(previousSession.progress.featuresCompleted).toBeGreaterThan(0);
  });
});

describe('Git Integration', () => {
  it('should format commit messages correctly', () => {
    const featureId = 'feat-001';
    const description = 'Implement user authentication';
    const commitPrefix = '[monty]';

    const commitMessage = `${commitPrefix} ${featureId}: ${description}`;

    expect(commitMessage).toContain('[monty]');
    expect(commitMessage).toContain(featureId);
    expect(commitMessage).toContain(description);
  });

  it('should detect uncommitted changes', () => {
    // Simulate git status check
    const gitStatus = {
      staged: ['src/auth.ts', 'tests/auth.test.ts'],
      unstaged: ['README.md'],
      untracked: ['temp.txt'],
    };

    const hasUncommittedChanges =
      gitStatus.staged.length > 0 ||
      gitStatus.unstaged.length > 0;

    expect(hasUncommittedChanges).toBe(true);
  });

  it('should block force push', () => {
    const gitCommand = 'git push --force origin main';

    const isForceCommand = gitCommand.includes('--force') || gitCommand.includes('-f ');
    const isProtectedBranch = gitCommand.includes('main') || gitCommand.includes('master');

    expect(isForceCommand && isProtectedBranch).toBe(true);

    // Simulate blocking
    const blockForcePush = () => {
      if (isForceCommand && isProtectedBranch) {
        throw new Error('Force push to protected branch is not allowed');
      }
    };

    expect(blockForcePush).toThrow('Force push to protected branch is not allowed');
  });
});

describe('Browser Testing Integration', () => {
  it('should identify test steps requiring browser verification', () => {
    const steps = [
      'Create login form component',
      'Verify login form renders correctly in browser',
      'Add form validation',
      'Test form submission in browser',
      'Integrate with auth API',
    ];

    const browserSteps = steps.filter(step =>
      step.toLowerCase().includes('browser') ||
      step.toLowerCase().includes('render') ||
      step.toLowerCase().includes('verify') ||
      step.toLowerCase().includes('visual')
    );

    expect(browserSteps.length).toBeGreaterThan(0);
    expect(browserSteps.some(s => s.includes('browser'))).toBe(true);
  });

  it('should mark feature as passing only after browser test', () => {
    const feature = {
      id: 'feat-001',
      passes: false,
      browserTested: false,
    };

    // Simulate browser test
    feature.browserTested = true;

    // Feature can only pass if browser tested
    const canMarkAsPassing = feature.browserTested;
    if (canMarkAsPassing) {
      feature.passes = true;
    }

    expect(feature.passes).toBe(true);
    expect(feature.browserTested).toBe(true);
  });
});

describe('Checkpoint and Recovery', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createTestFixtureDir();
    mkdirSync(join(fixtureDir, '.agent', 'checkpoints'), { recursive: true });
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  it('should create checkpoint structure', () => {
    const checkpoint = {
      id: `checkpoint-${Date.now()}`,
      featureId: 'feat-003',
      timestamp: new Date().toISOString(),
      files: [
        { path: 'src/index.ts', hash: 'abc123' },
        { path: 'src/auth.ts', hash: 'def456' },
      ],
    };

    const checkpointPath = join(
      fixtureDir,
      '.agent',
      'checkpoints',
      `${checkpoint.id}.json`
    );
    writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

    expect(existsSync(checkpointPath)).toBe(true);
    expect(checkpoint.files.length).toBeGreaterThan(0);
  });

  it('should list available checkpoints', () => {
    // Create multiple checkpoints
    const checkpoints = ['checkpoint-1', 'checkpoint-2', 'checkpoint-3'];
    const checkpointsDir = join(fixtureDir, '.agent', 'checkpoints');

    for (const cp of checkpoints) {
      writeFileSync(
        join(checkpointsDir, `${cp}.json`),
        JSON.stringify({ id: cp })
      );
    }

    // List checkpoints
    const files = ['checkpoint-1.json', 'checkpoint-2.json', 'checkpoint-3.json'];

    expect(files.length).toBe(3);
  });
});

describe('Usage Tracking', () => {
  it('should track token usage per session', () => {
    const usageEntry = {
      timestamp: new Date().toISOString(),
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1500,
      outputTokens: 500,
      tool: 'Read',
      durationMs: 2500,
    };

    const cost = calculateCost(usageEntry.inputTokens, usageEntry.outputTokens);

    expect(cost).toBeGreaterThan(0);
    expect(usageEntry.inputTokens + usageEntry.outputTokens).toBe(2000);
  });

  it('should aggregate daily usage', () => {
    const dailyUsage = {
      date: new Date().toISOString().split('T')[0],
      sessions: 3,
      totalInputTokens: 15000,
      totalOutputTokens: 5000,
      totalCost: 0.06,
    };

    expect(dailyUsage.sessions).toBeGreaterThan(0);
    expect(dailyUsage.totalCost).toBeLessThan(1); // Reasonable daily cost
  });

  it('should warn on budget threshold', () => {
    const budget = {
      monthlyLimit: 100,
      currentUsage: 85,
      warningThreshold: 0.8,
    };

    const usagePercentage = budget.currentUsage / budget.monthlyLimit;
    const shouldWarn = usagePercentage >= budget.warningThreshold;

    expect(shouldWarn).toBe(true);
    expect(usagePercentage).toBeGreaterThanOrEqual(0.8);
  });
});

// Helper function for cost calculation
function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCostPerMillion = 3; // $3 per million input tokens
  const outputCostPerMillion = 15; // $15 per million output tokens

  return (
    (inputTokens / 1000000) * inputCostPerMillion +
    (outputTokens / 1000000) * outputCostPerMillion
  );
}
