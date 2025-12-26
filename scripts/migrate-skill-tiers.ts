#!/usr/bin/env tsx
/**
 * Migration Script: Classify Skills into Tiers (PROG-001)
 *
 * This script analyzes existing skills in procedural-memory.json and assigns
 * appropriate tier classifications based on usage patterns and characteristics.
 *
 * Tier Classification Rules:
 * - essential: High usage (>100 uses), common patterns (cookie banners, etc.)
 * - domain-specific: Domain-bound skills, moderate usage
 * - advanced: Rare/specialized skills, low usage, complex workflows
 *
 * Usage:
 *   npx tsx scripts/migrate-skill-tiers.ts [--dry-run] [--file=path/to/memory.json]
 */

import * as fs from 'fs/promises';
import * as path from 'path';

interface BrowsingSkill {
  id: string;
  name: string;
  description: string;
  preconditions: {
    urlPatterns?: string[];
    domainPatterns?: string[];
    requiredSelectors?: string[];
    pageType?: string;
  };
  actionSequence: Array<{ type: string }>;
  metrics: {
    successCount: number;
    failureCount: number;
    timesUsed: number;
  };
  sourceDomain?: string;
  tier?: 'essential' | 'domain-specific' | 'advanced';
  loadPriority?: number;
  sizeEstimate?: number;
}

interface ProceduralMemoryData {
  skills: BrowsingSkill[];
  workflows: any[];
  trajectoryBuffer: any[];
  visitedDomains: string[];
  visitedPageTypes: Record<string, number>;
  failedExtractions: Record<string, number>;
  skillVersions: Record<string, any[]>;
  antiPatterns: any[];
  feedbackLog: any[];
  lastSaved: number;
  config: any;
}

// Essential skill patterns (always loaded)
const ESSENTIAL_PATTERNS = [
  /cookie.*banner/i,
  /dismiss.*banner/i,
  /consent/i,
  /gdpr/i,
  /accept.*cookie/i,
  /close.*modal/i,
  /popup.*dismiss/i,
];

// High usage threshold for essential classification
const ESSENTIAL_USAGE_THRESHOLD = 100;

// Domain-specific threshold
const DOMAIN_SPECIFIC_USAGE_THRESHOLD = 10;

/**
 * Classify a skill into a tier based on heuristics
 */
function classifySkill(skill: BrowsingSkill): {
  tier: 'essential' | 'domain-specific' | 'advanced';
  loadPriority: number;
  sizeEstimate: number;
  reason: string;
} {
  const { name, description, metrics, preconditions, actionSequence, sourceDomain } = skill;
  const totalUses = metrics.timesUsed || 0;
  const successRate = metrics.successCount / (metrics.successCount + metrics.failureCount || 1);

  // Rule 1: Essential patterns (cookie banners, common UI patterns)
  const isEssentialPattern = ESSENTIAL_PATTERNS.some(
    (pattern) => pattern.test(name) || pattern.test(description)
  );

  if (isEssentialPattern) {
    return {
      tier: 'essential',
      loadPriority: 100, // Highest priority
      sizeEstimate: estimateSkillSize(skill),
      reason: 'Matches essential pattern (cookie banner, etc.)',
    };
  }

  // Rule 2: High usage skills are essential
  if (totalUses >= ESSENTIAL_USAGE_THRESHOLD && successRate > 0.8) {
    return {
      tier: 'essential',
      loadPriority: 90,
      sizeEstimate: estimateSkillSize(skill),
      reason: `High usage (${totalUses} uses, ${(successRate * 100).toFixed(0)}% success)`,
    };
  }

  // Rule 3: Domain-specific skills
  const hasDomainBinding = !!(
    sourceDomain ||
    preconditions.domainPatterns?.length ||
    preconditions.urlPatterns?.length
  );

  if (hasDomainBinding && totalUses >= DOMAIN_SPECIFIC_USAGE_THRESHOLD) {
    return {
      tier: 'domain-specific',
      loadPriority: 50,
      sizeEstimate: estimateSkillSize(skill),
      reason: `Domain-bound (${sourceDomain || preconditions.domainPatterns?.[0] || 'unknown'})`,
    };
  }

  // Rule 4: Complex workflows are advanced
  const isComplexWorkflow = actionSequence.length > 10;
  const hasMultipleSteps = actionSequence.filter((a) => a.type === 'navigate').length > 1;

  if (isComplexWorkflow || hasMultipleSteps) {
    return {
      tier: 'advanced',
      loadPriority: 10,
      sizeEstimate: estimateSkillSize(skill),
      reason: `Complex workflow (${actionSequence.length} actions)`,
    };
  }

  // Rule 5: Low usage skills are advanced
  if (totalUses < DOMAIN_SPECIFIC_USAGE_THRESHOLD) {
    return {
      tier: 'advanced',
      loadPriority: 5,
      sizeEstimate: estimateSkillSize(skill),
      reason: `Low usage (${totalUses} uses)`,
    };
  }

  // Default: domain-specific
  return {
    tier: 'domain-specific',
    loadPriority: 30,
    sizeEstimate: estimateSkillSize(skill),
    reason: 'Default classification',
  };
}

/**
 * Estimate skill size in KB (rough approximation)
 */
function estimateSkillSize(skill: BrowsingSkill): number {
  // Rough estimate based on action count and description length
  const jsonSize = JSON.stringify(skill).length;
  return Math.ceil(jsonSize / 1024); // Convert to KB
}

/**
 * Migrate a procedural memory file
 */
async function migrateFile(filePath: string, dryRun: boolean = false): Promise<void> {
  console.log(`\n📂 Processing: ${filePath}`);

  // Check if file exists
  try {
    await fs.access(filePath);
  } catch {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }

  // Read and parse
  const content = await fs.readFile(filePath, 'utf-8');
  const data: ProceduralMemoryData = JSON.parse(content);

  if (!data.skills || data.skills.length === 0) {
    console.log('ℹ️  No skills found in file');
    return;
  }

  console.log(`\n📊 Found ${data.skills.length} skills`);

  // Classify each skill
  const classifications: Record<string, { count: number; skills: string[] }> = {
    essential: { count: 0, skills: [] },
    'domain-specific': { count: 0, skills: [] },
    advanced: { count: 0, skills: [] },
  };

  let modified = 0;

  for (const skill of data.skills) {
    // Skip if already classified
    if (skill.tier) {
      continue;
    }

    const classification = classifySkill(skill);
    skill.tier = classification.tier;
    skill.loadPriority = classification.loadPriority;
    skill.sizeEstimate = classification.sizeEstimate;

    classifications[classification.tier].count++;
    classifications[classification.tier].skills.push(
      `  - ${skill.name} (${classification.reason})`
    );

    modified++;
  }

  // Summary
  console.log('\n📈 Classification Summary:');
  console.log(`   Essential:        ${classifications.essential.count} skills`);
  console.log(`   Domain-specific:  ${classifications['domain-specific'].count} skills`);
  console.log(`   Advanced:         ${classifications.advanced.count} skills`);
  console.log(`   Already migrated: ${data.skills.length - modified} skills`);

  // Details
  if (classifications.essential.count > 0) {
    console.log('\n✨ Essential Skills:');
    classifications.essential.skills.forEach((s) => console.log(s));
  }

  if (classifications['domain-specific'].count > 0) {
    console.log('\n🌐 Domain-Specific Skills:');
    classifications['domain-specific'].skills.slice(0, 5).forEach((s) => console.log(s));
    if (classifications['domain-specific'].count > 5) {
      console.log(`   ... and ${classifications['domain-specific'].count - 5} more`);
    }
  }

  if (classifications.advanced.count > 0) {
    console.log('\n🔧 Advanced Skills:');
    classifications.advanced.skills.slice(0, 5).forEach((s) => console.log(s));
    if (classifications.advanced.count > 5) {
      console.log(`   ... and ${classifications.advanced.count - 5} more`);
    }
  }

  // Memory savings estimate
  const totalSize = data.skills.reduce((sum, s) => sum + (s.sizeEstimate || 0), 0);
  const essentialSize = data.skills
    .filter((s) => s.tier === 'essential')
    .reduce((sum, s) => sum + (s.sizeEstimate || 0), 0);
  const savingsPercent = ((1 - essentialSize / totalSize) * 100).toFixed(1);

  console.log('\n💾 Memory Impact:');
  console.log(`   Total size:       ${totalSize} KB`);
  console.log(`   Essential size:   ${essentialSize} KB`);
  console.log(`   Lazy loaded:      ${totalSize - essentialSize} KB`);
  console.log(`   Memory savings:   ${savingsPercent}%`);

  // Write back
  if (!dryRun && modified > 0) {
    // Backup original
    const backupPath = `${filePath}.backup-${Date.now()}`;
    await fs.copyFile(filePath, backupPath);
    console.log(`\n💾 Backup created: ${backupPath}`);

    // Write migrated data
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ Migration complete: ${modified} skills classified`);
  } else if (dryRun) {
    console.log(`\n🔍 DRY RUN - No changes written`);
  } else {
    console.log(`\nℹ️  No changes needed (all skills already classified)`);
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArg = args.find((arg) => arg.startsWith('--file='));
  const customFile = fileArg?.split('=')[1];

  console.log('🚀 Skill Tier Migration (PROG-001)\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No files will be modified\n');
  }

  // Default file paths to check
  const filesToCheck = customFile
    ? [customFile]
    : [
        './procedural-memory.json',
        './sessions/procedural-memory.json',
        path.join(process.env.HOME || '~', '.unbrowser/procedural-memory.json'),
      ];

  for (const file of filesToCheck) {
    try {
      await migrateFile(file, dryRun);
    } catch (error: any) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log('\n✨ Migration complete!\n');

  if (!dryRun) {
    console.log('💡 Next steps:');
    console.log('   1. Test that Unbrowser loads correctly');
    console.log('   2. Verify memory usage with getLoadingStats()');
    console.log('   3. Monitor lazy loading in logs\n');
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { classifySkill, estimateSkillSize, migrateFile };
