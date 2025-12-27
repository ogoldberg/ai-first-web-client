/**
 * Tests for Government Portal Skill Pack (INT-007)
 */

import { describe, it, expect } from 'vitest';
import {
  GOVERNMENT_SKILL_PACK,
  SPAIN_SKILLS,
  PORTUGAL_SKILLS,
  GERMANY_SKILLS,
  getSkillsForCountry,
  getSkillById,
  getSkillsByCategory,
  getSkillsForDomain,
  searchSkills,
  listGovernmentSkills,
  skillToPattern,
  exportSkillPack,
  importSkillPack,
  getSkillPackSummary,
  type GovernmentSkill,
  type GovernmentSkillPack,
} from '../../src/sdk.js';

// ============================================
// SKILL PACK STRUCTURE TESTS
// ============================================

describe('GOVERNMENT_SKILL_PACK', () => {
  it('should have required metadata', () => {
    expect(GOVERNMENT_SKILL_PACK.id).toBe('eu-government-portals');
    expect(GOVERNMENT_SKILL_PACK.name).toBe('EU Government Portal Skills');
    expect(GOVERNMENT_SKILL_PACK.version).toBe('1.0.0');
    expect(GOVERNMENT_SKILL_PACK.description).toBeDefined();
  });

  it('should cover Spain, Portugal, and Germany', () => {
    expect(GOVERNMENT_SKILL_PACK.countries).toContain('ES');
    expect(GOVERNMENT_SKILL_PACK.countries).toContain('PT');
    expect(GOVERNMENT_SKILL_PACK.countries).toContain('DE');
  });

  it('should have metadata with author info', () => {
    expect(GOVERNMENT_SKILL_PACK.metadata.author).toBe('Unbrowser');
    expect(GOVERNMENT_SKILL_PACK.metadata.license).toBe('MIT');
    expect(GOVERNMENT_SKILL_PACK.metadata.createdAt).toBeGreaterThan(0);
  });

  it('should contain skills from all countries', () => {
    const countries = new Set(GOVERNMENT_SKILL_PACK.skills.map((s) => s.countryCode));
    expect(countries.has('ES')).toBe(true);
    expect(countries.has('PT')).toBe(true);
    expect(countries.has('DE')).toBe(true);
  });
});

// ============================================
// SPAIN SKILLS TESTS
// ============================================

describe('SPAIN_SKILLS', () => {
  it('should have 4 skills', () => {
    expect(SPAIN_SKILLS.length).toBe(4);
  });

  it('should include NIE registration skill', () => {
    const nieSkill = SPAIN_SKILLS.find((s) => s.id === 'es_nie_registration');
    expect(nieSkill).toBeDefined();
    expect(nieSkill?.name).toBe('NIE (Tax ID) Registration');
    expect(nieSkill?.countryCode).toBe('ES');
  });

  it('should include Digital Nomad Visa skill', () => {
    const dnvSkill = SPAIN_SKILLS.find((s) => s.id === 'es_digital_nomad_visa');
    expect(dnvSkill).toBeDefined();
    expect(dnvSkill?.category).toBe('visa_residence');
  });

  it('should include Social Security skill', () => {
    const ssSkill = SPAIN_SKILLS.find((s) => s.id === 'es_social_security');
    expect(ssSkill).toBeDefined();
    expect(ssSkill?.category).toBe('social_security');
  });

  it('should include Beckham Law tax skill', () => {
    const taxSkill = SPAIN_SKILLS.find((s) => s.id === 'es_tax_residency');
    expect(taxSkill).toBeDefined();
    expect(taxSkill?.topic).toBe('tax_finance');
  });

  it('should have steps for each skill', () => {
    for (const skill of SPAIN_SKILLS) {
      expect(skill.steps.length).toBeGreaterThan(0);
      for (const step of skill.steps) {
        expect(step.id).toBeDefined();
        expect(step.name).toBeDefined();
        expect(step.urlPattern).toBeDefined();
        expect(step.contentType).toBeDefined();
      }
    }
  });

  it('should target Spanish government domains', () => {
    for (const skill of SPAIN_SKILLS) {
      expect(skill.targetDomains.length).toBeGreaterThan(0);
      // At least one domain should be Spanish
      const hasSpanishDomain = skill.targetDomains.some(
        (d) => d.includes('.gob.es') || d.includes('.es')
      );
      expect(hasSpanishDomain).toBe(true);
    }
  });
});

// ============================================
// PORTUGAL SKILLS TESTS
// ============================================

describe('PORTUGAL_SKILLS', () => {
  it('should have 4 skills', () => {
    expect(PORTUGAL_SKILLS.length).toBe(4);
  });

  it('should include NIF registration skill', () => {
    const nifSkill = PORTUGAL_SKILLS.find((s) => s.id === 'pt_nif_registration');
    expect(nifSkill).toBeDefined();
    expect(nifSkill?.name).toBe('NIF (Tax Number) Registration');
    expect(nifSkill?.countryCode).toBe('PT');
  });

  it('should include D7 visa skill', () => {
    const d7Skill = PORTUGAL_SKILLS.find((s) => s.id === 'pt_d7_visa');
    expect(d7Skill).toBeDefined();
    expect(d7Skill?.category).toBe('visa_residence');
  });

  it('should include NHR tax regime skill', () => {
    const nhrSkill = PORTUGAL_SKILLS.find((s) => s.id === 'pt_nhr_tax_regime');
    expect(nhrSkill).toBeDefined();
    expect(nhrSkill?.topic).toBe('tax_finance');
  });

  it('should include Digital Nomad Visa skill', () => {
    const dnvSkill = PORTUGAL_SKILLS.find((s) => s.id === 'pt_digital_nomad_visa');
    expect(dnvSkill).toBeDefined();
    expect(dnvSkill?.category).toBe('visa_residence');
  });

  it('should target Portuguese government domains', () => {
    for (const skill of PORTUGAL_SKILLS) {
      expect(skill.targetDomains.length).toBeGreaterThan(0);
      // At least one domain should be Portuguese
      const hasPortugueseDomain = skill.targetDomains.some(
        (d) => d.includes('.gov.pt') || d.includes('.pt')
      );
      expect(hasPortugueseDomain).toBe(true);
    }
  });
});

// ============================================
// GERMANY SKILLS TESTS
// ============================================

describe('GERMANY_SKILLS', () => {
  it('should have 4 skills', () => {
    expect(GERMANY_SKILLS.length).toBe(4);
  });

  it('should include Anmeldung skill', () => {
    const anmeldungSkill = GERMANY_SKILLS.find((s) => s.id === 'de_anmeldung');
    expect(anmeldungSkill).toBeDefined();
    expect(anmeldungSkill?.name).toBe('Residence Registration (Anmeldung)');
    expect(anmeldungSkill?.countryCode).toBe('DE');
  });

  it('should include Freelance Visa skill', () => {
    const freelanceSkill = GERMANY_SKILLS.find((s) => s.id === 'de_freelance_visa');
    expect(freelanceSkill).toBeDefined();
    expect(freelanceSkill?.category).toBe('visa_residence');
  });

  it('should include Tax ID skill', () => {
    const taxSkill = GERMANY_SKILLS.find((s) => s.id === 'de_tax_id');
    expect(taxSkill).toBeDefined();
    expect(taxSkill?.topic).toBe('tax_finance');
  });

  it('should include Health Insurance skill', () => {
    const healthSkill = GERMANY_SKILLS.find((s) => s.id === 'de_health_insurance');
    expect(healthSkill).toBeDefined();
    expect(healthSkill?.category).toBe('healthcare');
  });

  it('should target German government domains', () => {
    for (const skill of GERMANY_SKILLS) {
      expect(skill.targetDomains.length).toBeGreaterThan(0);
      // At least one domain should be German
      const hasGermanDomain = skill.targetDomains.some((d) => d.includes('.de'));
      expect(hasGermanDomain).toBe(true);
    }
  });
});

// ============================================
// HELPER FUNCTION TESTS
// ============================================

describe('getSkillsForCountry', () => {
  it('should return Spain skills for ES', () => {
    const skills = getSkillsForCountry('ES');
    expect(skills.length).toBe(4);
    expect(skills.every((s) => s.countryCode === 'ES')).toBe(true);
  });

  it('should return Portugal skills for PT', () => {
    const skills = getSkillsForCountry('PT');
    expect(skills.length).toBe(4);
    expect(skills.every((s) => s.countryCode === 'PT')).toBe(true);
  });

  it('should return Germany skills for DE', () => {
    const skills = getSkillsForCountry('DE');
    expect(skills.length).toBe(4);
    expect(skills.every((s) => s.countryCode === 'DE')).toBe(true);
  });

  it('should handle lowercase country codes', () => {
    const skills = getSkillsForCountry('es');
    expect(skills.length).toBe(4);
  });

  it('should return empty array for unknown country', () => {
    const skills = getSkillsForCountry('XX');
    expect(skills).toHaveLength(0);
  });
});

describe('getSkillById', () => {
  it('should return skill by ID', () => {
    const skill = getSkillById('es_nie_registration');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('NIE (Tax ID) Registration');
  });

  it('should return undefined for unknown ID', () => {
    const skill = getSkillById('unknown_skill');
    expect(skill).toBeUndefined();
  });

  it('should find skills from all countries', () => {
    expect(getSkillById('es_digital_nomad_visa')).toBeDefined();
    expect(getSkillById('pt_d7_visa')).toBeDefined();
    expect(getSkillById('de_freelance_visa')).toBeDefined();
  });
});

describe('getSkillsByCategory', () => {
  it('should return visa skills', () => {
    const skills = getSkillsByCategory('visa_residence');
    expect(skills.length).toBeGreaterThanOrEqual(4); // ES DNV, PT D7, PT DNV, DE Freelance
  });

  it('should return tax skills', () => {
    const skills = getSkillsByCategory('tax_registration');
    expect(skills.length).toBeGreaterThanOrEqual(3); // ES NIE, ES Tax, PT NIF
  });

  it('should return healthcare skills', () => {
    const skills = getSkillsByCategory('healthcare');
    expect(skills.length).toBeGreaterThanOrEqual(1); // DE Health
  });

  it('should return empty for unused category', () => {
    const skills = getSkillsByCategory('customs');
    expect(skills).toHaveLength(0);
  });
});

describe('getSkillsForDomain', () => {
  it('should return skills for Spanish immigration domain', () => {
    const skills = getSkillsForDomain('extranjeria.inclusion.gob.es');
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((s) => s.countryCode === 'ES')).toBe(true);
  });

  it('should return skills for Portuguese finance domain', () => {
    const skills = getSkillsForDomain('portaldasfinancas.gov.pt');
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((s) => s.countryCode === 'PT')).toBe(true);
  });

  it('should return skills for German BAMF domain', () => {
    const skills = getSkillsForDomain('www.bamf.de');
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((s) => s.countryCode === 'DE')).toBe(true);
  });

  it('should handle www prefix', () => {
    const withWww = getSkillsForDomain('www.seg-social.es');
    const withoutWww = getSkillsForDomain('seg-social.es');
    expect(withWww.length).toBeGreaterThan(0);
    expect(withoutWww.length).toBe(withWww.length);
  });
});

describe('searchSkills', () => {
  it('should find skills by name', () => {
    const results = searchSkills('NIE');
    expect(results.some((s) => s.id === 'es_nie_registration')).toBe(true);
  });

  it('should find skills by description', () => {
    const results = searchSkills('digital nomad');
    expect(results.length).toBeGreaterThanOrEqual(2); // ES and PT DNV
  });

  it('should find skills by expected fields', () => {
    const results = searchSkills('beckham');
    expect(results.some((s) => s.id === 'es_tax_residency')).toBe(true);
  });

  it('should be case insensitive', () => {
    const lower = searchSkills('visa');
    const upper = searchSkills('VISA');
    expect(lower.length).toBe(upper.length);
  });

  it('should return empty for no matches', () => {
    const results = searchSkills('xyznonexistent');
    expect(results).toHaveLength(0);
  });
});

describe('listGovernmentSkills', () => {
  it('should return all skills with metadata', () => {
    const list = listGovernmentSkills();
    expect(list.length).toBe(GOVERNMENT_SKILL_PACK.skills.length);
  });

  it('should include essential fields', () => {
    const list = listGovernmentSkills();
    for (const item of list) {
      expect(item.id).toBeDefined();
      expect(item.name).toBeDefined();
      expect(item.country).toBeDefined();
      expect(item.category).toBeDefined();
      expect(item.description).toBeDefined();
    }
  });
});

// ============================================
// PATTERN CONVERSION TESTS
// ============================================

describe('skillToPattern', () => {
  it('should convert skill to pattern format', () => {
    const skill = getSkillById('es_nie_registration')!;
    const pattern = skillToPattern(skill);

    expect(pattern.patternType).toBe('skill');
    expect(pattern.name).toBe(skill.name);
    expect(pattern.description).toBe(skill.description);
    expect(pattern.category).toBe('government');
    expect(pattern.isOfficial).toBe(true);
  });

  it('should include country in tags', () => {
    const skill = getSkillById('pt_d7_visa')!;
    const pattern = skillToPattern(skill);

    expect(pattern.tags).toContain('pt');
  });

  it('should preserve skill data in patternData', () => {
    const skill = getSkillById('de_anmeldung')!;
    const pattern = skillToPattern(skill);

    expect(pattern.patternData).toEqual(skill);
  });
});

// ============================================
// EXPORT/IMPORT TESTS
// ============================================

describe('exportSkillPack', () => {
  it('should export as valid JSON', () => {
    const json = exportSkillPack();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('should include all skills', () => {
    const json = exportSkillPack();
    const parsed = JSON.parse(json) as GovernmentSkillPack;
    expect(parsed.skills.length).toBe(GOVERNMENT_SKILL_PACK.skills.length);
  });
});

describe('importSkillPack', () => {
  it('should import exported pack', () => {
    const json = exportSkillPack();
    const imported = importSkillPack(json);

    expect(imported.id).toBe(GOVERNMENT_SKILL_PACK.id);
    expect(imported.skills.length).toBe(GOVERNMENT_SKILL_PACK.skills.length);
  });

  it('should throw on invalid JSON', () => {
    expect(() => importSkillPack('invalid')).toThrow();
  });

  it('should throw on missing required fields', () => {
    const invalid = JSON.stringify({ foo: 'bar' });
    expect(() => importSkillPack(invalid)).toThrow('Invalid skill pack format');
  });
});

describe('getSkillPackSummary', () => {
  it('should return correct total', () => {
    const summary = getSkillPackSummary();
    expect(summary.totalSkills).toBe(12); // 4 ES + 4 PT + 4 DE
  });

  it('should count by country', () => {
    const summary = getSkillPackSummary();
    expect(summary.byCountry.ES).toBe(4);
    expect(summary.byCountry.PT).toBe(4);
    expect(summary.byCountry.DE).toBe(4);
  });

  it('should count by category', () => {
    const summary = getSkillPackSummary();
    expect(summary.byCategory.visa_residence).toBeGreaterThanOrEqual(4);
    expect(summary.byCategory.tax_registration).toBeGreaterThanOrEqual(3);
  });

  it('should include version', () => {
    const summary = getSkillPackSummary();
    expect(summary.version).toBe('1.0.0');
  });
});

// ============================================
// SKILL STEP VALIDATION TESTS
// ============================================

describe('Skill Step Validation', () => {
  it('should have valid content types for all steps', () => {
    const validTypes = ['requirements', 'documents', 'fees', 'timeline', 'forms', 'contact', 'general'];

    for (const skill of GOVERNMENT_SKILL_PACK.skills) {
      for (const step of skill.steps) {
        expect(validTypes).toContain(step.contentType);
      }
    }
  });

  it('should have URL patterns for all steps', () => {
    for (const skill of GOVERNMENT_SKILL_PACK.skills) {
      for (const step of skill.steps) {
        expect(step.urlPattern).toMatch(/^https?:\/\//);
      }
    }
  });

  it('should have extract fields for all steps', () => {
    for (const skill of GOVERNMENT_SKILL_PACK.skills) {
      for (const step of skill.steps) {
        expect(step.extractFields.length).toBeGreaterThan(0);
      }
    }
  });

  it('should mark at least one step as critical per skill', () => {
    for (const skill of GOVERNMENT_SKILL_PACK.skills) {
      const hasCritical = skill.steps.some((s) => s.critical === true);
      expect(hasCritical).toBe(true);
    }
  });
});

// ============================================
// LANGUAGE SUPPORT TESTS
// ============================================

describe('Language Support', () => {
  it('should include local language for each country', () => {
    for (const skill of SPAIN_SKILLS) {
      expect(skill.languages).toContain('es');
    }
    for (const skill of PORTUGAL_SKILLS) {
      expect(skill.languages).toContain('pt');
    }
    for (const skill of GERMANY_SKILLS) {
      expect(skill.languages).toContain('de');
    }
  });

  it('should include English for most skills', () => {
    const skillsWithEnglish = GOVERNMENT_SKILL_PACK.skills.filter((s) =>
      s.languages.includes('en')
    );
    // At least 50% should have English
    expect(skillsWithEnglish.length).toBeGreaterThan(GOVERNMENT_SKILL_PACK.skills.length / 2);
  });
});

// ============================================
// RELATED SKILLS TESTS
// ============================================

describe('Related Skills', () => {
  it('should reference existing skills', () => {
    const allIds = GOVERNMENT_SKILL_PACK.skills.map((s) => s.id);

    for (const skill of GOVERNMENT_SKILL_PACK.skills) {
      if (skill.relatedSkills) {
        for (const relatedId of skill.relatedSkills) {
          expect(allIds).toContain(relatedId);
        }
      }
    }
  });

  it('should have related skills for visa skills', () => {
    const visaSkills = getSkillsByCategory('visa_residence');
    const withRelated = visaSkills.filter((s) => s.relatedSkills && s.relatedSkills.length > 0);
    // Visa skills should typically have related skills (tax, SS, etc.)
    expect(withRelated.length).toBeGreaterThan(0);
  });
});
