/**
 * Arbitrator Sub-Agent
 * Resolves conflicts between multiple AI provider reviews
 * using a designated arbitrator provider (default: Claude).
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import {
  type ProviderName,
  getProviderConfig,
} from '../config/provider-config.js';
import {
  getProvider,
  type AgentMessage,
  type QueryOptions,
} from '../providers/index.js';
import {
  type ProviderReview,
  type ReviewConflict,
  type ReviewFinding,
  type CoordinatedReviewResult,
} from './review-coordinator.js';

/**
 * Arbitration decision for a single conflict
 */
export interface ConflictDecision {
  conflictId: string;
  winner: ProviderName;
  reasoning: string;
  confidence: number;
  resolvedFinding?: ReviewFinding;
}

/**
 * Full arbitration result
 */
export interface ArbitrationResult {
  decisions: ConflictDecision[];
  finalReview: {
    findings: ReviewFinding[];
    suggestions: string[];
    overallSeverity: 'pass' | 'minor' | 'major' | 'critical';
  };
  summary: string;
  arbitratorProvider: ProviderName;
  executionTime: number;
}

/**
 * Arbitrator configuration
 */
export interface ArbitratorConfig {
  /** Provider to use for arbitration */
  provider: ProviderName;
  /** Maximum time for arbitration (ms) */
  timeout: number;
  /** Read-only tools for investigation */
  allowedTools: string[];
  /** Whether to investigate code directly */
  investigateCode: boolean;
}

/**
 * Default arbitrator config
 */
const DEFAULT_ARBITRATOR_CONFIG: ArbitratorConfig = {
  provider: 'anthropic',
  timeout: 180000,
  allowedTools: ['Read', 'Glob', 'Grep'],
  investigateCode: true,
};

/**
 * Arbitrator Sub-Agent
 * Resolves conflicts between AI provider reviews
 */
export class Arbitrator {
  private config: ArbitratorConfig;

  constructor(config?: Partial<ArbitratorConfig>) {
    this.config = { ...DEFAULT_ARBITRATOR_CONFIG, ...config };
  }

  /**
   * Resolve conflicts from a coordinated review
   */
  async resolve(
    reviewResult: CoordinatedReviewResult,
    context?: string
  ): Promise<ArbitrationResult> {
    const startTime = Date.now();

    if (reviewResult.conflicts.length === 0) {
      // No conflicts to resolve
      return this.createNoConflictResult(reviewResult);
    }

    console.log(`\n⚖️  Starting Arbitration`);
    console.log(`   Arbitrator: ${getProviderConfig(this.config.provider).displayName}`);
    console.log(`   Conflicts to resolve: ${reviewResult.conflicts.length}`);

    const provider = getProvider(this.config.provider);

    // Build arbitration prompt
    const prompt = this.buildArbitrationPrompt(
      reviewResult.reviews,
      reviewResult.conflicts,
      context
    );

    // Execute arbitration query
    const messages: AgentMessage[] = [];
    for await (const message of provider.query(prompt, {
      tools: this.config.allowedTools,
      timeout_ms: this.config.timeout,
    })) {
      messages.push(message);
    }

    // Parse arbitration decisions
    const decisions = this.parseArbitrationDecisions(messages, reviewResult.conflicts);

    // Build final merged review
    const finalReview = this.buildFinalReview(
      reviewResult.reviews,
      reviewResult.consensusFindings,
      decisions
    );

    // Generate summary
    const summary = this.generateSummary(decisions, finalReview);

    const executionTime = Date.now() - startTime;

    console.log(`\n✓ Arbitration complete (${Math.round(executionTime / 1000)}s)`);
    console.log(`   Decisions made: ${decisions.length}`);

    return {
      decisions,
      finalReview,
      summary,
      arbitratorProvider: this.config.provider,
      executionTime,
    };
  }

  /**
   * Build the arbitration prompt
   */
  private buildArbitrationPrompt(
    reviews: ProviderReview[],
    conflicts: ReviewConflict[],
    context?: string
  ): string {
    return `# Code Review Arbitration

You are the arbitrator sub-agent responsible for resolving conflicts between
multiple AI code reviewers. Your decision is final and must be well-reasoned.

${context ? `## Context\n${context}\n` : ''}

## Reviews Received

${reviews.map(r => `
### ${getProviderConfig(r.provider).displayName} Review
Overall Severity: ${r.overallSeverity.toUpperCase()}
Confidence: ${Math.round(r.confidence * 100)}%
Findings: ${r.findings.length}

${r.findings.slice(0, 10).map(f =>
  `- [${f.severity.toUpperCase()}] ${f.file}:${f.line} - ${f.message}`
).join('\n')}
${r.findings.length > 10 ? `\n... and ${r.findings.length - 10} more findings` : ''}

Suggestions:
${r.suggestions.slice(0, 5).map(s => `- ${s}`).join('\n')}
`).join('\n')}

## Conflicts to Resolve

${conflicts.map((c, i) => `
### Conflict ${i + 1}: ${c.description}
Type: ${c.type}
${c.file ? `Location: ${c.file}:${c.line}` : ''}

**${getProviderConfig(c.provider1).displayName}** says:
${c.position1}

**${getProviderConfig(c.provider2).displayName}** says:
${c.position2}
`).join('\n')}

## Your Task

1. For each conflict, analyze both positions carefully
2. ${this.config.investigateCode ? 'Use the Read tool to investigate the actual code if needed' : 'Consider the provided context'}
3. Make a final decision for each conflict
4. Explain your reasoning clearly
5. Provide a merged, conflict-free final review

## Decision Framework

When resolving conflicts, consider:
1. **Correctness**: Which assessment is factually accurate?
2. **Severity**: Which correctly identifies the risk level?
3. **Best Practices**: Which aligns with industry standards?
4. **Security**: When in doubt about security, err on caution

## Required Output Format

Provide your decisions in this exact format:

<arbitration>
CONFLICT 1:
Winner: [provider_name]
Reasoning: [Your detailed reasoning]
Resolved Severity: [info|warning|error|critical]

CONFLICT 2:
Winner: [provider_name]
Reasoning: [Your detailed reasoning]
Resolved Severity: [info|warning|error|critical]

FINAL ASSESSMENT:
Overall: [pass|minor|major|critical]
Key Findings:
- [List the most important findings after conflict resolution]
</arbitration>

Begin your analysis now.`;
  }

  /**
   * Parse arbitration decisions from response
   */
  private parseArbitrationDecisions(
    messages: AgentMessage[],
    conflicts: ReviewConflict[]
  ): ConflictDecision[] {
    const decisions: ConflictDecision[] = [];

    // Extract text content
    const textContent = messages
      .flatMap(m => m.content)
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('\n');

    // Parse arbitration block
    const arbitrationMatch = textContent.match(/<arbitration>([\s\S]*?)<\/arbitration>/i);
    const arbitrationText = arbitrationMatch?.[1] ?? textContent;

    // Parse each conflict decision
    for (let i = 0; i < conflicts.length; i++) {
      const conflict = conflicts[i]!;
      const conflictPattern = new RegExp(
        `CONFLICT\\s*${i + 1}[:\\s]*([\\s\\S]*?)(?=CONFLICT|FINAL|$)`,
        'i'
      );
      const conflictMatch = arbitrationText.match(conflictPattern);

      if (conflictMatch?.[1]) {
        const decisionText = conflictMatch[1];

        // Extract winner
        const winnerMatch = decisionText.match(/Winner:\s*(\w+)/i);
        let winner: ProviderName = conflict.provider1;
        if (winnerMatch?.[1]) {
          const winnerStr = winnerMatch[1].toLowerCase();
          if (winnerStr.includes('openai') || winnerStr.includes('codex')) winner = 'openai';
          else if (winnerStr.includes('google') || winnerStr.includes('gemini')) winner = 'google';
          else if (winnerStr.includes('cursor')) winner = 'cursor';
          else if (winnerStr.includes('anthropic') || winnerStr.includes('claude')) winner = 'anthropic';
          else if (winnerStr === conflict.provider2) winner = conflict.provider2;
        }

        // Extract reasoning
        const reasoningMatch = decisionText.match(/Reasoning:\s*([^\n]+(?:\n(?!Winner|Resolved)[^\n]+)*)/i);
        const reasoning = reasoningMatch?.[1]?.trim() ?? 'No reasoning provided';

        decisions.push({
          conflictId: conflict.id,
          winner,
          reasoning,
          confidence: 0.85, // Default confidence
        });
      } else {
        // Default decision if parsing fails
        decisions.push({
          conflictId: conflict.id,
          winner: conflict.provider1,
          reasoning: 'Unable to parse decision, defaulting to first provider',
          confidence: 0.5,
        });
      }
    }

    return decisions;
  }

  /**
   * Build the final merged review
   */
  private buildFinalReview(
    reviews: ProviderReview[],
    consensusFindings: ReviewFinding[],
    decisions: ConflictDecision[]
  ): ArbitrationResult['finalReview'] {
    // Start with consensus findings
    const findings: ReviewFinding[] = [...consensusFindings];
    const suggestions: string[] = [];

    // Collect suggestions from all reviews
    for (const review of reviews) {
      suggestions.push(...review.suggestions);
    }

    // Deduplicate suggestions
    const uniqueSuggestions = [...new Set(suggestions)];

    // Determine overall severity
    let overallSeverity: 'pass' | 'minor' | 'major' | 'critical' = 'pass';

    // Use the winning assessment from arbitration if available
    const severityVotes: Record<string, number> = {};
    for (const decision of decisions) {
      const winningReview = reviews.find(r => r.provider === decision.winner);
      if (winningReview) {
        severityVotes[winningReview.overallSeverity] =
          (severityVotes[winningReview.overallSeverity] ?? 0) + 1;
      }
    }

    // Find most voted severity
    let maxVotes = 0;
    for (const [severity, votes] of Object.entries(severityVotes)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        overallSeverity = severity as typeof overallSeverity;
      }
    }

    // If no arbitration decisions affected severity, use consensus
    if (maxVotes === 0 && findings.length > 0) {
      if (findings.some(f => f.severity === 'critical')) overallSeverity = 'critical';
      else if (findings.some(f => f.severity === 'error')) overallSeverity = 'major';
      else if (findings.some(f => f.severity === 'warning')) overallSeverity = 'minor';
    }

    return {
      findings,
      suggestions: uniqueSuggestions.slice(0, 10),
      overallSeverity,
    };
  }

  /**
   * Generate arbitration summary
   */
  private generateSummary(
    decisions: ConflictDecision[],
    finalReview: ArbitrationResult['finalReview']
  ): string {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('                    Arbitration Summary                         ');
    lines.push('═══════════════════════════════════════════════════════════════\n');

    lines.push(`Conflicts Resolved: ${decisions.length}`);
    lines.push(`Final Assessment: ${finalReview.overallSeverity.toUpperCase()}`);
    lines.push(`Final Findings: ${finalReview.findings.length}\n`);

    lines.push('Decisions:');
    for (const decision of decisions) {
      lines.push(`  ${decision.conflictId}: Winner = ${getProviderConfig(decision.winner).displayName}`);
      lines.push(`    Reasoning: ${decision.reasoning.slice(0, 100)}${decision.reasoning.length > 100 ? '...' : ''}`);
    }

    if (finalReview.findings.length > 0) {
      lines.push('\nKey Findings After Arbitration:');
      for (const finding of finalReview.findings.slice(0, 5)) {
        lines.push(`  [${finding.severity.toUpperCase()}] ${finding.file}:${finding.line} - ${finding.message}`);
      }
    }

    lines.push('\n═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Create result when there are no conflicts
   */
  private createNoConflictResult(
    reviewResult: CoordinatedReviewResult
  ): ArbitrationResult {
    // Merge all findings
    const allFindings = reviewResult.consensusFindings;

    // Determine overall severity
    let overallSeverity: 'pass' | 'minor' | 'major' | 'critical' = 'pass';
    if (allFindings.some(f => f.severity === 'critical')) overallSeverity = 'critical';
    else if (allFindings.some(f => f.severity === 'error')) overallSeverity = 'major';
    else if (allFindings.some(f => f.severity === 'warning')) overallSeverity = 'minor';

    // Collect all suggestions
    const suggestions = reviewResult.reviews
      .flatMap(r => r.suggestions)
      .filter((s, i, arr) => arr.indexOf(s) === i)
      .slice(0, 10);

    return {
      decisions: [],
      finalReview: {
        findings: allFindings,
        suggestions,
        overallSeverity,
      },
      summary: 'No conflicts to resolve. All providers agree on the review.',
      arbitratorProvider: this.config.provider,
      executionTime: 0,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ArbitratorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ArbitratorConfig {
    return { ...this.config };
  }
}

/**
 * Create an arbitrator instance
 */
export function createArbitrator(config?: Partial<ArbitratorConfig>): Arbitrator {
  return new Arbitrator(config);
}

export default Arbitrator;
