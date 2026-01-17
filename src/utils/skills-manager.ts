/**
 * Skills Manager
 * Implements skill loading and management for the Claude Agent SDK.
 * Skills are specialized SKILL.md files that extend agent capabilities.
 *
 * Copyright (c) 2025 Dobeu Tech Solutions LLC
 * Licensed under CC BY-NC 4.0
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname, relative } from 'path';
import { homedir } from 'os';

/**
 * Skill metadata parsed from SKILL.md frontmatter
 */
export interface SkillMetadata {
  name: string;
  description: string;
  triggers?: string[];
  category?: string;
  version?: string;
  author?: string;
  priority?: number;
}

/**
 * Loaded skill with content and metadata
 */
export interface LoadedSkill {
  path: string;
  relativePath: string;
  name: string;
  content: string;
  metadata: SkillMetadata;
  source: 'workspace' | 'user' | 'system' | 'marketplace';
}

/**
 * Skill search paths
 */
export const SKILL_SEARCH_PATHS = [
  // Workspace skills (highest priority)
  '.claude/skills',
  '.cursor/skills',
  '.codex/skills',
  // User-level skills
  join(homedir(), '.claude', 'skills'),
  join(homedir(), '.codex', 'skills'),
  // System skills (from package)
  join(dirname(__dirname), 'skills'),
];

/**
 * Parse YAML frontmatter from SKILL.md content
 */
export function parseSkillFrontmatter(content: string): SkillMetadata {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  
  if (!frontmatterMatch) {
    // Return default metadata if no frontmatter
    return {
      name: 'Unnamed Skill',
      description: 'No description provided',
    };
  }

  const frontmatter = frontmatterMatch[1];
  const metadata: SkillMetadata = {
    name: 'Unnamed Skill',
    description: 'No description provided',
  };

  // Simple YAML-like parsing (for basic key: value pairs)
  if (!frontmatter) return metadata;
  const lines = frontmatter.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (!key || !value) continue;
      switch (key.toLowerCase()) {
        case 'name':
          metadata.name = value.replace(/^["']|["']$/g, '');
          break;
        case 'description':
          metadata.description = value.replace(/^["']|["']$/g, '');
          break;
        case 'category':
          metadata.category = value.replace(/^["']|["']$/g, '');
          break;
        case 'version':
          metadata.version = value.replace(/^["']|["']$/g, '');
          break;
        case 'author':
          metadata.author = value.replace(/^["']|["']$/g, '');
          break;
        case 'priority':
          const priorityValue = parseInt(value, 10);
          if (!isNaN(priorityValue)) {
            metadata.priority = priorityValue;
          }
          break;
        case 'triggers':
          // Handle array format: triggers: ["trigger1", "trigger2"]
          const triggersMatch = value.match(/\[(.*)\]/);
          if (triggersMatch && triggersMatch[1]) {
            metadata.triggers = triggersMatch[1]
              .split(',')
              .map(t => t.trim().replace(/^["']|["']$/g, ''));
          }
          break;
      }
    }
  }

  return metadata;
}

/**
 * Get skill content without frontmatter
 */
export function getSkillContent(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
}

/**
 * Load a single skill from a path
 */
export function loadSkill(
  skillPath: string,
  baseDir: string,
  source: LoadedSkill['source']
): LoadedSkill | null {
  try {
    if (!existsSync(skillPath)) {
      return null;
    }

    const content = readFileSync(skillPath, 'utf-8');
    const metadata = parseSkillFrontmatter(content);
    const skillContent = getSkillContent(content);

    return {
      path: skillPath,
      relativePath: relative(baseDir, skillPath),
      name: metadata.name || basename(dirname(skillPath)),
      content: skillContent,
      metadata,
      source,
    };
  } catch (error) {
    console.warn(`Failed to load skill from ${skillPath}:`, error);
    return null;
  }
}

/**
 * Recursively find SKILL.md files in a directory
 */
export function findSkillFiles(directory: string): string[] {
  const skillFiles: string[] = [];

  if (!existsSync(directory)) {
    return skillFiles;
  }

  try {
    const entries = readdirSync(directory);

    for (const entry of entries) {
      const entryPath = join(directory, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        // Check for SKILL.md in subdirectory
        const skillPath = join(entryPath, 'SKILL.md');
        if (existsSync(skillPath)) {
          skillFiles.push(skillPath);
        }
        // Recursively search subdirectories
        skillFiles.push(...findSkillFiles(entryPath));
      } else if (entry === 'SKILL.md') {
        skillFiles.push(entryPath);
      }
    }
  } catch (error) {
    console.warn(`Failed to search directory ${directory}:`, error);
  }

  return skillFiles;
}

/**
 * Load all skills from search paths
 */
export function loadAllSkills(projectRoot: string = process.cwd()): LoadedSkill[] {
  const skills: LoadedSkill[] = [];
  const loadedPaths = new Set<string>();

  // Helper to determine source type
  const getSource = (path: string): LoadedSkill['source'] => {
    if (path.startsWith(projectRoot)) return 'workspace';
    if (path.startsWith(homedir())) return 'user';
    if (path.includes('marketplace')) return 'marketplace';
    return 'system';
  };

  // Search all configured paths
  for (const searchPath of SKILL_SEARCH_PATHS) {
    const fullPath = searchPath.startsWith('/') || searchPath.includes(':')
      ? searchPath
      : join(projectRoot, searchPath);

    const skillFiles = findSkillFiles(fullPath);

    for (const skillFile of skillFiles) {
      if (!loadedPaths.has(skillFile)) {
        loadedPaths.add(skillFile);
        const skill = loadSkill(skillFile, projectRoot, getSource(fullPath));
        if (skill) {
          skills.push(skill);
        }
      }
    }
  }

  // Sort by priority (higher priority first) then by name
  skills.sort((a, b) => {
    const priorityDiff = (b.metadata.priority || 0) - (a.metadata.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return a.name.localeCompare(b.name);
  });

  return skills;
}

/**
 * Find skills that match a query or context
 */
export function findMatchingSkills(
  skills: LoadedSkill[],
  query: string
): LoadedSkill[] {
  const lowerQuery = query.toLowerCase();

  return skills.filter(skill => {
    // Check name
    if (skill.name.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Check description
    if (skill.metadata.description.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Check triggers
    if (skill.metadata.triggers) {
      for (const trigger of skill.metadata.triggers) {
        if (lowerQuery.includes(trigger.toLowerCase())) {
          return true;
        }
      }
    }

    // Check category
    if (skill.metadata.category?.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    return false;
  });
}

/**
 * Format skills for inclusion in agent prompt
 */
export function formatSkillsForPrompt(skills: LoadedSkill[]): string {
  if (skills.length === 0) {
    return '';
  }

  const sections: string[] = [];

  sections.push('## Available Skills\n');
  sections.push('The following specialized skills are available to assist with specific tasks:\n');

  for (const skill of skills) {
    sections.push(`### ${skill.name}`);
    sections.push(`**Source:** ${skill.source}`);
    if (skill.metadata.category) {
      sections.push(`**Category:** ${skill.metadata.category}`);
    }
    sections.push(`**Description:** ${skill.metadata.description}`);
    if (skill.metadata.triggers && skill.metadata.triggers.length > 0) {
      sections.push(`**Triggers:** ${skill.metadata.triggers.join(', ')}`);
    }
    sections.push('');
    sections.push('```');
    sections.push(skill.content);
    sections.push('```');
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Get skills summary for status display
 */
export function getSkillsSummary(skills: LoadedSkill[]): string {
  if (skills.length === 0) {
    return 'No skills loaded';
  }

  const bySource: Record<string, number> = {};
  for (const skill of skills) {
    bySource[skill.source] = (bySource[skill.source] || 0) + 1;
  }

  const parts = Object.entries(bySource)
    .map(([source, count]) => `${count} ${source}`)
    .join(', ');

  return `${skills.length} skills loaded (${parts})`;
}

/**
 * Skills Manager class for stateful skill management
 */
export class SkillsManager {
  private skills: LoadedSkill[] = [];
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Load all available skills
   */
  load(): LoadedSkill[] {
    this.skills = loadAllSkills(this.projectRoot);
    return this.skills;
  }

  /**
   * Get all loaded skills
   */
  getAll(): LoadedSkill[] {
    return this.skills;
  }

  /**
   * Find skills matching a query
   */
  find(query: string): LoadedSkill[] {
    return findMatchingSkills(this.skills, query);
  }

  /**
   * Get skills formatted for prompt inclusion
   */
  formatForPrompt(): string {
    return formatSkillsForPrompt(this.skills);
  }

  /**
   * Get summary for status display
   */
  getSummary(): string {
    return getSkillsSummary(this.skills);
  }

  /**
   * Get skill by name
   */
  getByName(name: string): LoadedSkill | undefined {
    return this.skills.find(s => 
      s.name.toLowerCase() === name.toLowerCase()
    );
  }

  /**
   * Get skills by category
   */
  getByCategory(category: string): LoadedSkill[] {
    return this.skills.filter(s =>
      s.metadata.category?.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Get skills by source
   */
  getBySource(source: LoadedSkill['source']): LoadedSkill[] {
    return this.skills.filter(s => s.source === source);
  }
}

/**
 * Create a skills manager instance
 */
export function createSkillsManager(projectRoot?: string): SkillsManager {
  return new SkillsManager(projectRoot);
}

export default SkillsManager;
