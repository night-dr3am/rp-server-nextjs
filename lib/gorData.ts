// Gorean character creation data loader
// Client-side data loading for all Gorean JSON files
import {
  SpeciesData,
  CultureData,
  StatusData,
  StatusSubtype,
  CasteData,
  TribalRole,
  RegionData,
  SkillData,
  GoreanCharacterModel,
  CharacterSkill,
  SpeciesCategory,
  CultureType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  calculateGoreanStatModifier,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  calculateHealthMax
} from './gor/types';

// Re-export types for convenience
export {
  type SpeciesData,
  type CultureData,
  type StatusData,
  type StatusSubtype,
  type CasteData,
  type TribalRole,
  type RegionData,
  type SkillData,
  type GoreanCharacterModel,
  type CharacterSkill,
  type SpeciesCategory,
  type CultureType,
  calculateGoreanStatModifier,
  calculateHealthMax
} from './gor/types';

// Constants
export const DEFAULT_STAT_POINTS = 10;
export const DEFAULT_SKILL_POINTS = 5;
export const MIN_STAT_VALUE = 1;
export const MAX_STAT_VALUE = 5;
export const BASE_STAT_TOTAL = 5; // All stats start at 1

// Data caches
let species: Record<SpeciesCategory, SpeciesData[]> = {} as Record<SpeciesCategory, SpeciesData[]>;
let cultures: CultureData[] = [];
let statuses: StatusData[] = [];
let castes: CasteData[] = [];
let tribalRoles: Record<string, TribalRole[]> = {};
let regions: RegionData[] = [];
let skills: SkillData[] = [];

// Track if data has been loaded
let dataLoaded = false;

/**
 * Check if Gorean data has been loaded
 */
export function isDataLoaded(): boolean {
  return dataLoaded;
}

// Utility functions
function lc(s: string): string {
  return String(s || '').toLowerCase();
}

/**
 * Load all Gorean data files
 */
export async function loadAllGoreanData(): Promise<void> {
  if (dataLoaded) return; // Already loaded

  try {
    const [
      speciesData,
      culturesData,
      statusesData,
      castesData,
      tribalRolesData,
      regionsData,
      skillsData
    ] = await Promise.all([
      import('./gor/species.json').then(m => m.default),
      import('./gor/cultures.json').then(m => m.default),
      import('./gor/statuses.json').then(m => m.default),
      import('./gor/castes.json').then(m => m.default),
      import('./gor/tribal_roles.json').then(m => m.default),
      import('./gor/regions.json').then(m => m.default),
      import('./gor/skills.json').then(m => m.default)
    ]);

    species = speciesData as Record<SpeciesCategory, SpeciesData[]>;
    cultures = culturesData as CultureData[];
    statuses = statusesData as StatusData[];
    castes = castesData as CasteData[];
    tribalRoles = tribalRolesData as Record<string, TribalRole[]>;
    regions = regionsData as RegionData[];
    skills = skillsData as SkillData[];

    dataLoaded = true;
  } catch (error) {
    console.error('[gorData] ✗ Failed to load Gorean data:', error);
    throw error;
  }
}

// ============================================================================
// SPECIES FUNCTIONS
// ============================================================================

/**
 * Get all species organized by category
 */
export function getAllSpecies(): Record<SpeciesCategory, SpeciesData[]> {
  return species;
}

/**
 * Get species by category
 */
export function getSpeciesByCategory(category: SpeciesCategory): SpeciesData[] {
  // Return empty array if data not loaded yet
  if (!dataLoaded) return [];

  return species[category] || [];
}

/**
 * Get all species flattened into single array
 */
export function getAllSpeciesFlat(): SpeciesData[] {
  // Return empty array if data not loaded yet
  if (!dataLoaded || !species) {
    return [];
  }
  const allSpecies: SpeciesData[] = [];
  Object.values(species).forEach(categorySpecies => {
    if (categorySpecies && Array.isArray(categorySpecies)) {
      allSpecies.push(...categorySpecies);
    }
  });
  return allSpecies;
}

/**
 * Find species by ID
 */
export function getSpeciesById(id: string): SpeciesData | undefined {
  const allSpecies = getAllSpeciesFlat();
  return allSpecies.find(s => s.id === id);
}

/**
 * Get species categories for display
 */
export function getSpeciesCategories(): SpeciesCategory[] {
  return [
    'sapient',
    'feline',
    'canine_like',
    'hooved',
    'avian',
    'reptilian',
    'aquatic',
    'small'
  ];
}

/**
 * Get display name for species category
 */
export function getSpeciesCategoryDisplayName(category: SpeciesCategory): string {
  const names: Record<SpeciesCategory, string> = {
    sapient: 'Sapient',
    feline: 'Feline',
    canine_like: 'Canine',
    hooved: 'Hooved',
    avian: 'Avian',
    reptilian: 'Reptilian',
    aquatic: 'Aquatic',
    small: 'Small Creatures'
  };
  return names[category] || category;
}

// ============================================================================
// CULTURE FUNCTIONS
// ============================================================================

/**
 * Get all cultures
 */
export function getAllCultures(): CultureData[] {
  return cultures;
}

/**
 * Get cultures applicable to a specific species
 */
export function getCulturesForSpecies(speciesId: string): CultureData[] {
  // Return empty array if data not loaded yet
  if (!dataLoaded || !cultures || cultures.length === 0) {
    return [];
  }

  if (!speciesId) return cultures;

  return cultures.filter(culture => {
    // Safety check for culture object
    if (!culture) return false;

    // If no applicableSpecies specified, assume all species can use it
    if (!culture.applicableSpecies || culture.applicableSpecies.length === 0) {
      return true;
    }
    // Check if species is in the applicable list
    return culture.applicableSpecies.some(s => lc(s) === lc(speciesId) || s === '*');
  });
}

/**
 * Find culture by ID
 */
export function getCultureById(id: string): CultureData | undefined {
  return cultures.find(c => c.id === id);
}

/**
 * Check if culture uses caste system
 */
export function cultureHasCastes(cultureId: string): boolean {
  const culture = getCultureById(cultureId);
  return culture?.hasCastes || false;
}

/**
 * Get cultures by type
 */
export function getCulturesByType(type: CultureType): CultureData[] {
  return cultures.filter(c => c.type === type);
}

// ============================================================================
// STATUS FUNCTIONS
// ============================================================================

/**
 * Get all statuses
 */
export function getAllStatuses(): StatusData[] {
  return statuses;
}

/**
 * Get statuses applicable to a specific species
 */
export function getStatusesForSpecies(speciesId: string): StatusData[] {
  // Return empty array if data not loaded yet
  if (!dataLoaded || !statuses || statuses.length === 0) {
    return [];
  }

  if (!speciesId) return statuses;

  return statuses.filter(status => {
    // Safety check for status object
    if (!status) return false;

    // If no applicableSpecies specified, assume all species can use it
    if (!status.applicableSpecies || status.applicableSpecies.length === 0) {
      return true;
    }
    // Check if species is in the applicable list
    return status.applicableSpecies.some(s => lc(s) === lc(speciesId) || s === '*');
  });
}

/**
 * Find status by ID
 */
export function getStatusById(id: string): StatusData | undefined {
  return statuses.find(s => s.id === id);
}

// ============================================================================
// CASTE & TRIBAL ROLE FUNCTIONS
// ============================================================================

/**
 * Get all castes
 */
export function getAllCastes(): CasteData[] {
  return castes;
}

/**
 * Get castes for a specific culture
 */
export function getCastesForCulture(cultureId: string): CasteData[] {
  const culture = getCultureById(cultureId);
  if (!culture || !culture.hasCastes) {
    return [];
  }

  // Return all castes (they're all available for city-states)
  return castes;
}

/**
 * Get high castes (castes with colors)
 */
export function getHighCastes(): CasteData[] {
  return castes.filter(c => c.color && c.color !== '');
}

/**
 * Get low castes (castes without colors)
 */
export function getLowCastes(): CasteData[] {
  return castes.filter(c => !c.color || c.color === '');
}

/**
 * Find caste by ID
 */
export function getCasteById(id: string): CasteData | undefined {
  return castes.find(c => c.id === id);
}

/**
 * Get all tribal roles
 */
export function getAllTribalRoles(): Record<string, TribalRole[]> {
  return tribalRoles;
}

/**
 * Get tribal roles for a specific culture
 */
export function getTribalRolesForCulture(cultureId: string): TribalRole[] {
  const culture = getCultureById(cultureId);
  if (!culture || culture.hasCastes) {
    return [];
  }

  // Return roles for this culture
  return tribalRoles[cultureId] || [];
}

/**
 * Find tribal role by ID
 */
export function getTribalRoleById(cultureId: string, roleId: string): TribalRole | undefined {
  const roles = tribalRoles[cultureId] || [];
  return roles.find(r => r.id === roleId);
}

/**
 * Get castes filtered by status (and optionally gender)
 * This enables status-based role selection during character creation
 */
export function getCastesForStatus(statusId: string, gender?: string): CasteData[] {
  // Return empty array if data not loaded yet
  if (!dataLoaded || !castes || castes.length === 0) {
    return [];
  }

  if (!statusId) return castes;

  return castes.filter(caste => {
    // Safety check for caste object
    if (!caste) return false;

    // If no applicableStatuses specified, assume all statuses can use it (legacy data)
    if (!caste.applicableStatuses || caste.applicableStatuses.length === 0) {
      return true;
    }

    // Check if status is in the applicable list
    const statusMatch = caste.applicableStatuses.some(s => lc(s) === lc(statusId));
    if (!statusMatch) return false;

    // If gender specified and caste has gender restriction, apply it
    if (gender && caste.gender) {
      // "both" or matching gender passes
      if (caste.gender === 'both') return true;
      if (caste.gender === 'male' && gender === 'male') return true;
      if (caste.gender === 'female' && gender === 'female') return true;
      if (caste.gender === 'mostly_male') return true; // Allow both but warn
      return false;
    }

    return true;
  });
}

/**
 * Get tribal roles filtered by status, culture, and optionally gender
 * This enables status-based role selection for tribal cultures
 */
export function getTribalRolesForStatus(statusId: string, cultureId: string, gender?: string): TribalRole[] {
  // Return empty array if data not loaded yet
  if (!dataLoaded || !tribalRoles) {
    return [];
  }

  if (!statusId || !cultureId) return [];

  // Get roles for this culture
  const roles = tribalRoles[cultureId] || [];

  return roles.filter(role => {
    // Safety check for role object
    if (!role) return false;

    // If no applicableStatuses specified, assume all statuses can use it (legacy data)
    if (!role.applicableStatuses || role.applicableStatuses.length === 0) {
      return true;
    }

    // Check if status is in the applicable list
    const statusMatch = role.applicableStatuses.some(s => lc(s) === lc(statusId));
    if (!statusMatch) return false;

    // If gender specified and role has gender restriction, apply it
    if (gender && role.gender) {
      // "both" or matching gender passes
      if (role.gender === 'both') return true;
      if (role.gender === 'male' && gender === 'male') return true;
      if (role.gender === 'female' && gender === 'female') return true;
      return false;
    }

    return true;
  });
}

/**
 * Get slave subtypes as role options
 * For slave statuses (kajira, kajirus), subtypes should be presented as "role" choices
 * instead of city castes or tribal roles
 */
export function getSlaveSubtypesAsRoles(statusId: string): StatusSubtype[] {
  // Return empty array if data not loaded yet
  if (!dataLoaded || !statuses || statuses.length === 0) {
    return [];
  }

  // Find the status
  const status = statuses.find(s => lc(s.id) === lc(statusId));
  if (!status) return [];

  // Return subtypes if they exist
  return status.subtypes || [];
}

// ============================================================================
// REGION FUNCTIONS
// ============================================================================

/**
 * Get all regions
 */
export function getAllRegions(): RegionData[] {
  return regions;
}

/**
 * Find region by ID
 */
export function getRegionById(id: string): RegionData | undefined {
  return regions.find(r => r.id === id);
}

/**
 * Get regions by type
 */
export function getRegionsByType(type: string): RegionData[] {
  return regions.filter(r => r.type === type);
}

// ============================================================================
// SKILL FUNCTIONS
// ============================================================================

/**
 * Get all skills
 */
export function getAllSkills(): SkillData[] {
  return skills;
}

/**
 * Get skills by type
 */
export function getSkillsByType(type: string): SkillData[] {
  // Return empty array if data not loaded yet
  if (!dataLoaded || !skills || skills.length === 0) {
    return [];
  }
  return skills.filter(s => s && s.type === type);
}

/**
 * Find skill by ID
 */
export function getSkillById(id: string): SkillData | undefined {
  return skills.find(s => s.id === id);
}

/**
 * Find skill by name
 */
export function getSkillByName(name: string): SkillData | undefined {
  return skills.find(s => lc(s.name) === lc(name));
}

/**
 * Calculate triangular cost for skill level
 * Level 1 = 1 point, Level 2 = 3 points, Level 3 = 6 points, etc.
 * Formula: (level * (level + 1)) / 2
 */
export function calculateSkillCost(level: number): number {
  if (level <= 0) return 0;
  return (level * (level + 1)) / 2;
}

/**
 * Calculate total skill points spent from skills array
 */
export function calculateTotalSkillPoints(skillsList: CharacterSkill[]): number {
  return skillsList.reduce((total, skill) => {
    return total + calculateSkillCost(skill.level);
  }, 0);
}

/**
 * Get skill type display name
 */
export function getSkillTypeDisplayName(type: string): string {
  const names: Record<string, string> = {
    combat: 'Combat',
    survival: 'Survival',
    mental: 'Mental',
    social: 'Social',
    special: 'Special'
  };
  return names[type] || type;
}

/**
 * Get skill types for display
 */
export function getSkillTypes(): string[] {
  return ['combat', 'survival', 'mental', 'social', 'special'];
}

// ============================================================================
// CHARACTER VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate stat point allocation
 * Returns { valid: boolean, error?: string }
 */
export function validateStatPoints(stats: GoreanCharacterModel['stats']): { valid: boolean; error?: string } {
  const { strength, agility, intellect, perception, charisma } = stats;

  // Check range (1-5)
  const statValues = [strength, agility, intellect, perception, charisma];
  for (const val of statValues) {
    if (val < MIN_STAT_VALUE || val > MAX_STAT_VALUE) {
      return { valid: false, error: `All stats must be between ${MIN_STAT_VALUE} and ${MAX_STAT_VALUE}` };
    }
  }

  // Check total (must be exactly 15 = 5 base + 10 allocated)
  const total = strength + agility + intellect + perception + charisma;
  const expectedTotal = BASE_STAT_TOTAL + DEFAULT_STAT_POINTS;
  if (total !== expectedTotal) {
    return { valid: false, error: `Total stats must equal ${expectedTotal} (5 base + 10 points)` };
  }

  return { valid: true };
}

/**
 * Validate skill point allocation
 * Returns { valid: boolean, error?: string }
 */
export function validateSkillPoints(
  skillsList: CharacterSkill[],
  allocatedPoints: number
): { valid: boolean; error?: string } {
  const spentPoints = calculateTotalSkillPoints(skillsList);

  if (spentPoints > allocatedPoints) {
    return { valid: false, error: `Skill points spent (${spentPoints}) exceeds allocated (${allocatedPoints})` };
  }

  return { valid: true };
}

/**
 * Validate complete character model
 * Returns { valid: boolean, errors: string[] }
 */
export function validateCharacterModel(model: GoreanCharacterModel): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Identity validation
  if (!model.identity.characterName || model.identity.characterName.trim() === '') {
    errors.push('Character name is required');
  }
  if (!model.identity.agentName || model.identity.agentName.trim() === '') {
    errors.push('Agent name is required');
  }

  // Species validation
  if (!model.species) {
    errors.push('Species selection is required');
  }

  // Culture validation
  if (!model.culture) {
    errors.push('Culture selection is required');
  }

  // Status validation
  if (!model.status) {
    errors.push('Status selection is required');
  }

  // Stat validation
  const statValidation = validateStatPoints(model.stats);
  if (!statValidation.valid) {
    errors.push(statValidation.error || 'Invalid stat allocation');
  }

  // Skill validation
  const skillValidation = validateSkillPoints(model.skills, model.skillsAllocatedPoints);
  if (!skillValidation.valid) {
    errors.push(skillValidation.error || 'Invalid skill allocation');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// CHARACTER MODEL HELPERS
// ============================================================================

/**
 * Create initial character model with defaults
 */
export function createInitialCharacterModel(): GoreanCharacterModel {
  return {
    page: 1,
    identity: {
      characterName: '',
      agentName: '',
      title: '',
      background: ''
    },
    stats: {
      strength: 1,
      agility: 1,
      intellect: 1,
      perception: 1,
      charisma: 1,
      pool: DEFAULT_STAT_POINTS,
      spent: 0
    },
    skills: [],
    skillsAllocatedPoints: DEFAULT_SKILL_POINTS,
    skillsSpentPoints: 0
  };
}

/**
 * Calculate stat points spent
 */
export function calculateStatPointsSpent(stats: GoreanCharacterModel['stats']): number {
  return (stats.strength - 1) +
         (stats.agility - 1) +
         (stats.intellect - 1) +
         (stats.perception - 1) +
         (stats.charisma - 1);
}

/**
 * Get remaining stat points
 */
export function getRemainingStatPoints(stats: GoreanCharacterModel['stats']): number {
  const spent = calculateStatPointsSpent(stats);
  return DEFAULT_STAT_POINTS - spent;
}
