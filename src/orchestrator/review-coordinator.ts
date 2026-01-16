/**
 * Review Coordinator
 * Coordinates multi-agent code reviews across multiple AI providers
 * and manages conflict detection for arbitration.
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
  type BaseProvider,
  type AgentMessage,
  type QueryOptions,
} from '../providers/index.js';

/**
 * Review finding from a provider
 */
export interface ReviewFinding {
  id: string;
  file: string;
  line: number;
  type: 'bug' | 'security' | 'performance' | 'style' | 'logic' | 'suggestion';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  suggestion?: string;
  code?: string;
}

/**
 * Review result from a single provider
 */
export interface ProviderReview {
  provider: ProviderName;
  findings: ReviewFinding[];
  suggestions: string[];
  overallSeverity: 'pass' | 'minor' | 'major' | 'critical';
  confidence: number;
  executionTime: number;
  rawMessages: AgentMessage[];
}

/**
 * Conflict between provider reviews
 */
export interface ReviewConflict {
  id: string;
  type: 'contradictory' | 'severity_mismatch' | 'missing_finding';
  file?: string;
  line?: number;
  provider1: ProviderName;
  position1: string;
  provider2: ProviderName;
  position2: string;
  description: string;
}

/**
 * Coordinated review result
 */
export interface CoordinatedReviewResult {
  reviews: ProviderReview[];
  conflicts: ReviewConflict[];
  consensusFindings: ReviewFinding[];
  needsArbitration: boolean;
  summary: string;
}

/**
 * Review coordinator configuration
 */
export interface ReviewCoordinatorConfig {
  /** Minimum providers for a valid review */
  minProviders: number;
  /** Run reviews in parallel or sequentially */
  parallel: boolean;
  /** Timeout for each provider review (ms) */
  timeout: number;
  /** Severity threshold for conflicts (findings above this require arbitration) */
  arbitrationSeverityThreshold: 'warning' | 'error' | 'critical';
}

/**
 * Default review coordinator config
 */
const DEFAULT_REVIEW_CONFIG: ReviewCoordinatorConfig = {
  minProviders: 2,
  parallel: true,
  timeout: 120000,
  arbitrationSeverityThreshold: 'error',
};

/**
 * Review Coordinator
 * Manages multi-agent code reviews
 */
export class ReviewCoordinator {
  private config: ReviewCoordinatorConfig;
  private enabledProviders: ProviderName[];

  constructor(
    enabledProviders: ProviderName[],
    config?: Partial<ReviewCoordinatorConfig>
  ) {
    this.enabledProviders = enabledProviders;
    this.config = { ...DEFAULT_REVIEW_CONFIG, ...config };
  }

  /**
   * Execute a coordinated multi-agent review
   */
  async coordinateReview(
    task: string,
    options: QueryOptions
  ): Promise<CoordinatedReviewResult> {
    if (this.enabledProviders.length < this.config.minProviders) {
      throw new Error(
        `Insufficient providers for multi-agent review. ` +
        `Need ${this.config.minProviders}, have ${this.enabledProviders.length}`
      );
    }

    console.log(`\n📋 Starting Multi-Agent Code Review`);
    console.log(`   Providers: ${this.enabledProviders.map(p => getProviderConfig(p).displayName).join(', ')}`);

    // Get reviews from all providers
    const reviews = this.config.parallel
      ? await this.getParallelReviews(task, options)
      : await this.getSequentialReviews(task, options);

    console.log(`\n✓ Received ${reviews.length} reviews`);

    // Detect conflicts
    const conflicts = this.detectConflicts(reviews);

    console.log(`   Conflicts detected: ${conflicts.length}`);

    // Find consensus findings
    const consensusFindings = this.findConsensus(reviews);

    console.log(`   Consensus findings: ${consensusFindings.length}`);

    // Determine if arbitration is needed
    const needsArbitration = this.needsArbitration(conflicts);

    // Generate summary
    const summary = this.generateSummary(reviews, conflicts, consensusFindings);

    return {
      reviews,
      conflicts,
      consensusFindings,
      needsArbitration,
      summary,
    };
  }

  /**
   * Get reviews from all providers in parallel
   */
  private async getParallelReviews(
    task: string,
    options: QueryOptions
  ): Promise<ProviderReview[]> {
    const reviewPromises = this.enabledProviders.map(provider =>
      this.getProviderReview(provider, task, options)
    );

    const results = await Promise.allSettled(reviewPromises);

    return results
      .filter((r): r is PromiseFulfilledResult<ProviderReview> =>
        r.status === 'fulfilled'
      )
      .map(r => r.value);
  }

  /**
   * Get reviews from all providers sequentially
   */
  private async getSequentialReviews(
    task: string,
    options: QueryOptions
  ): Promise<ProviderReview[]> {
    const reviews: ProviderReview[] = [];

    for (const provider of this.enabledProviders) {
      try {
        const review = await this.getProviderReview(provider, task, options);
        reviews.push(review);
      } catch (error) {
        console.warn(`Review from ${provider} failed:`, error);
      }
    }

    return reviews;
  }

  /**
   * Get a review from a single provider
   */
  private async getProviderReview(
    providerName: ProviderName,
    task: string,
    options: QueryOptions
  ): Promise<ProviderReview> {
    const startTime = Date.now();
    const provider = getProvider(providerName);

    console.log(`\n   🔍 Getting review from ${getProviderConfig(providerName).displayName}...`);

    // Build review-specific prompt
    const reviewPrompt = this.buildReviewPrompt(task);

    // Collect messages
    const messages: AgentMessage[] = [];
    for await (const message of provider.query(reviewPrompt, {
      ...options,
      timeout_ms: this.config.timeout,
    })) {
      messages.push(message);
    }

    const executionTime = Date.now() - startTime;

    // Parse findings from messages
    const { findings, suggestions, overallSeverity, confidence } =
      this.parseReviewMessages(messages, providerName);

    console.log(`      Findings: ${findings.length}, Severity: ${overallSeverity}`);

    return {
      provider: providerName,
      findings,
      suggestions,
      overallSeverity,
      confidence,
      executionTime,
      rawMessages: messages,
    };
  }

  /**
   * Build a review-specific prompt
   */
  private buildReviewPrompt(task: string): string {
    return `You are performing a code review. ${task}

IMPORTANT: Structure your response with clear sections:

## FINDINGS
For each issue found, format as:
- [SEVERITY] FILE:LINE - Description
  Suggestion: How to fix

Severity levels: INFO, WARNING, ERROR, CRITICAL

## SUGGESTIONS
General improvement suggestions for the code.

## OVERALL ASSESSMENT
Rate the code: PASS (no issues), MINOR (small issues), MAJOR (significant issues), CRITICAL (blocking issues)

Be thorough but concise. Focus on:
1. Security vulnerabilities (OWASP Top 10)
2. Logic errors and bugs
3. Performance issues
4. Code quality and maintainability
5. Best practices`;
  }

  /**
   * Parse review findings from provider messages
   */
  private parseReviewMessages(
    messages: AgentMessage[],
    provider: ProviderName
  ): {
    findings: ReviewFinding[];
    suggestions: string[];
    overallSeverity: 'pass' | 'minor' | 'major' | 'critical';
    confidence: number;
  } {
    const findings: ReviewFinding[] = [];
    const suggestions: string[] = [];
    let overallSeverity: 'pass' | 'minor' | 'major' | 'critical' = 'pass';
    let confidence = 0.8;

    // Extract text content
    const textContent = messages
      .flatMap(m => m.content)
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('\n');

    // Parse findings using regex patterns
    const findingPattern = /\[(\w+)\]\s+([^:]+):(\d+)\s*-\s*(.+?)(?=\n\[|\n##|$)/gs;
    let match;

    while ((match = findingPattern.exec(textContent)) !== null) {
      const [, severityStr, file, lineStr, message] = match;
      if (severityStr && file && lineStr && message) {
        const severity = this.parseSeverity(severityStr);
        findings.push({
          id: `${provider}_${findings.length + 1}`,
          file: file.trim(),
          line: parseInt(lineStr, 10),
          type: this.inferFindingType(message),
          severity,
          message: message.trim(),
        });

        // Update overall severity
        if (severity === 'critical') overallSeverity = 'critical';
        else if (severity === 'error' && overallSeverity !== 'critical') overallSeverity = 'major';
        else if (severity === 'warning' && overallSeverity === 'pass') overallSeverity = 'minor';
      }
    }

    // Parse overall assessment
    if (textContent.includes('CRITICAL') || textContent.includes('blocking')) {
      overallSeverity = 'critical';
    } else if (textContent.includes('MAJOR') || textContent.includes('significant')) {
      if (overallSeverity !== 'critical') overallSeverity = 'major';
    } else if (textContent.includes('MINOR') || textContent.includes('small issues')) {
      if (overallSeverity === 'pass') overallSeverity = 'minor';
    }

    // Parse suggestions
    const suggestionsMatch = textContent.match(/##\s*SUGGESTIONS\s*([\s\S]*?)(?=##|$)/i);
    if (suggestionsMatch?.[1]) {
      const suggestionLines = suggestionsMatch[1].split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(line => line.length > 0);
      suggestions.push(...suggestionLines);
    }

    return { findings, suggestions, overallSeverity, confidence };
  }

  /**
   * Parse severity string to enum
   */
  private parseSeverity(severity: string): ReviewFinding['severity'] {
    const upper = severity.toUpperCase();
    if (upper === 'CRITICAL') return 'critical';
    if (upper === 'ERROR') return 'error';
    if (upper === 'WARNING') return 'warning';
    return 'info';
  }

  /**
   * Infer finding type from message
   */
  private inferFindingType(message: string): ReviewFinding['type'] {
    const lower = message.toLowerCase();
    if (lower.includes('security') || lower.includes('vulnerability') || lower.includes('xss') || lower.includes('injection')) {
      return 'security';
    }
    if (lower.includes('performance') || lower.includes('slow') || lower.includes('memory')) {
      return 'performance';
    }
    if (lower.includes('style') || lower.includes('formatting') || lower.includes('naming')) {
      return 'style';
    }
    if (lower.includes('logic') || lower.includes('condition') || lower.includes('branch')) {
      return 'logic';
    }
    if (lower.includes('suggest') || lower.includes('consider') || lower.includes('could')) {
      return 'suggestion';
    }
    return 'bug';
  }

  /**
   * Detect conflicts between reviews
   */
  detectConflicts(reviews: ProviderReview[]): ReviewConflict[] {
    const conflicts: ReviewConflict[] = [];

    if (reviews.length < 2) return conflicts;

    // Compare findings across providers
    for (let i = 0; i < reviews.length; i++) {
      for (let j = i + 1; j < reviews.length; j++) {
        const review1 = reviews[i]!;
        const review2 = reviews[j]!;

        // Check for severity mismatches on same location
        for (const finding1 of review1.findings) {
          const matchingFinding = review2.findings.find(
            f => f.file === finding1.file && Math.abs(f.line - finding1.line) <= 3
          );

          if (matchingFinding) {
            // Check severity difference
            const severityOrder = ['info', 'warning', 'error', 'critical'];
            const sev1 = severityOrder.indexOf(finding1.severity);
            const sev2 = severityOrder.indexOf(matchingFinding.severity);

            if (Math.abs(sev1 - sev2) >= 2) {
              conflicts.push({
                id: `conflict_${conflicts.length + 1}`,
                type: 'severity_mismatch',
                file: finding1.file,
                line: finding1.line,
                provider1: review1.provider,
                position1: `${finding1.severity}: ${finding1.message}`,
                provider2: review2.provider,
                position2: `${matchingFinding.severity}: ${matchingFinding.message}`,
                description: `Severity mismatch at ${finding1.file}:${finding1.line}`,
              });
            }
          }
        }

        // Check for overall assessment conflicts
        const assessments = ['pass', 'minor', 'major', 'critical'];
        const assess1 = assessments.indexOf(review1.overallSeverity);
        const assess2 = assessments.indexOf(review2.overallSeverity);

        if (Math.abs(assess1 - assess2) >= 2) {
          conflicts.push({
            id: `conflict_${conflicts.length + 1}`,
            type: 'contradictory',
            provider1: review1.provider,
            position1: `Overall: ${review1.overallSeverity}`,
            provider2: review2.provider,
            position2: `Overall: ${review2.overallSeverity}`,
            description: 'Overall assessment differs significantly',
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Find consensus findings across reviews
   */
  findConsensus(reviews: ProviderReview[]): ReviewFinding[] {
    if (reviews.length < 2) {
      return reviews[0]?.findings ?? [];
    }

    const consensus: ReviewFinding[] = [];

    // Find findings that appear in multiple reviews
    for (const finding of reviews[0]!.findings) {
      const matches = reviews.slice(1).filter(review =>
        review.findings.some(f =>
          f.file === finding.file &&
          Math.abs(f.line - finding.line) <= 3 &&
          f.type === finding.type
        )
      );

      // If finding appears in majority of reviews, it's consensus
      if (matches.length >= Math.floor(reviews.length / 2)) {
        consensus.push({
          ...finding,
          id: `consensus_${consensus.length + 1}`,
        });
      }
    }

    return consensus;
  }

  /**
   * Determine if conflicts require arbitration
   */
  needsArbitration(conflicts: ReviewConflict[]): boolean {
    if (conflicts.length === 0) return false;

    // Any contradictory conflicts require arbitration
    if (conflicts.some(c => c.type === 'contradictory')) {
      return true;
    }

    // Severity mismatches on critical/error items require arbitration
    const severityThreshold = this.config.arbitrationSeverityThreshold;
    const thresholdOrder = ['warning', 'error', 'critical'];
    const thresholdIdx = thresholdOrder.indexOf(severityThreshold);

    return conflicts.some(c => {
      if (c.type !== 'severity_mismatch') return false;
      const pos1Severity = c.position1.split(':')[0]?.toLowerCase() ?? '';
      const pos2Severity = c.position2.split(':')[0]?.toLowerCase() ?? '';
      return (
        thresholdOrder.indexOf(pos1Severity) >= thresholdIdx ||
        thresholdOrder.indexOf(pos2Severity) >= thresholdIdx
      );
    });
  }

  /**
   * Generate a summary of the review results
   */
  generateSummary(
    reviews: ProviderReview[],
    conflicts: ReviewConflict[],
    consensus: ReviewFinding[]
  ): string {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('                    Multi-Agent Code Review Summary             ');
    lines.push('═══════════════════════════════════════════════════════════════\n');

    // Per-provider summary
    lines.push('Provider Reviews:');
    for (const review of reviews) {
      const config = getProviderConfig(review.provider);
      lines.push(`  ${config.displayName}:`);
      lines.push(`    Findings: ${review.findings.length}`);
      lines.push(`    Overall: ${review.overallSeverity.toUpperCase()}`);
      lines.push(`    Time: ${Math.round(review.executionTime / 1000)}s`);
    }

    // Consensus findings
    lines.push(`\nConsensus Findings: ${consensus.length}`);
    for (const finding of consensus.slice(0, 5)) {
      lines.push(`  [${finding.severity.toUpperCase()}] ${finding.file}:${finding.line}`);
      lines.push(`    ${finding.message}`);
    }
    if (consensus.length > 5) {
      lines.push(`  ... and ${consensus.length - 5} more`);
    }

    // Conflicts
    if (conflicts.length > 0) {
      lines.push(`\n⚠️  Conflicts Detected: ${conflicts.length}`);
      for (const conflict of conflicts) {
        lines.push(`  ${conflict.description}`);
      }
    }

    lines.push('\n═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Update enabled providers
   */
  setEnabledProviders(providers: ProviderName[]): void {
    this.enabledProviders = providers;
  }

  /**
   * Get current configuration
   */
  getConfig(): ReviewCoordinatorConfig {
    return { ...this.config };
  }
}

/**
 * Create a review coordinator instance
 */
export function createReviewCoordinator(
  enabledProviders: ProviderName[],
  config?: Partial<ReviewCoordinatorConfig>
): ReviewCoordinator {
  return new ReviewCoordinator(enabledProviders, config);
}

export default ReviewCoordinator;
