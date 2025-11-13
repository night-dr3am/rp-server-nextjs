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
  AbilityData,
  GoreanCharacterModel,
  CharacterSkill,
  CharacterAbility,
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
  type AbilityData,
  type GoreanCharacterModel,
  type CharacterSkill,
  type CharacterAbility,
  type SpeciesCategory,
  type CultureType,
  calculateGoreanStatModifier,
  calculateHealthMax
} from './gor/types';

// Constants
export const DEFAULT_STAT_POINTS = 10;
export const DEFAULT_SKILL_POINTS = 5;
export const DEFAULT_ABILITY_POINTS = 7;
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
let abilities: AbilityData[] = [];

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
      skillsData,
      abilitiesData
    ] = await Promise.all([
      import('./gor/species.json').then(m => m.default),
      import('./gor/cultures.json').then(m => m.default),
      import('./gor/statuses.json').then(m => m.default),
      import('./gor/castes.json').then(m => m.default),
      import('./gor/tribal_roles.json').then(m => m.default),
      import('./gor/regions.json').then(m => m.default),
      import('./gor/skills.json').then(m => m.default),
      import('./gor/abilities.json').then(m => m.default)
    ]);

    species = speciesData as Record<SpeciesCategory, SpeciesData[]>;
    cultures = culturesData as CultureData[];
    statuses = statusesData as StatusData[];
    castes = castesData as CasteData[];
    tribalRoles = tribalRolesData as Record<string, TribalRole[]>;
    regions = regionsData as RegionData[];
    skills = skillsData as SkillData[];
    abilities = abilitiesData as AbilityData[];

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

  // Get species data to access its category for category-based matching
  const speciesData = getSpeciesById(speciesId);
  const speciesCategory = speciesData?.category;

  return cultures.filter(culture => {
    // Safety check for culture object
    if (!culture) return false;

    // If no applicableSpecies specified, assume all species can use it
    if (!culture.applicableSpecies || culture.applicableSpecies.length === 0) {
      return true;
    }
    // Check if applicableSpecies contains either:
    // 1. The exact species ID (e.g., "sleen", "larl")
    // 2. The species category (e.g., "feline", "canine_like")
    // 3. Wildcard "*"
    return culture.applicableSpecies.some(s =>
      lc(s) === lc(speciesId) ||
      (speciesCategory && lc(s) === lc(speciesCategory)) ||
      s === '*'
    );
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

  // Get species data to access its category for category-based matching
  const speciesData = getSpeciesById(speciesId);
  const speciesCategory = speciesData?.category;

  return statuses.filter(status => {
    // Safety check for status object
    if (!status) return false;

    // If no applicableSpecies specified, assume all species can use it
    if (!status.applicableSpecies || status.applicableSpecies.length === 0) {
      return true;
    }
    // Check if applicableSpecies contains either:
    // 1. The exact species ID (e.g., "sleen", "larl")
    // 2. The species category (e.g., "feline", "canine_like")
    // 3. Wildcard "*"
    return status.applicableSpecies.some(s =>
      lc(s) === lc(speciesId) ||
      (speciesCategory && lc(s) === lc(speciesCategory)) ||
      s === '*'
    );
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
 * Calculate linear cost for skill level at character creation
 * Level 1 = 1 point, Level 2 = 2 points, Level 3 = 3 points, etc.
 * Formula: level (1:1 point-to-level ratio)
 */
export function calculateSkillCost(level: number): number {
  if (level <= 0) return 0;
  return level;  // Linear cost: 1 point per level
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
    subterfuge: 'Subterfuge',
    social: 'Social',
    survival: 'Survival',
    crafting: 'Crafting',
    mental: 'Mental'
  };
  return names[type] || type;
}

/**
 * Get maximum initial level allowed for a skill at character creation
 */
export function getSkillMaxInitialLevel(skillId: string): number {
  const skill = getSkillById(skillId);
  return skill?.maxInitialLevel ?? 2;  // Default to 2 if not found
}

/**
 * Get skill types for display
 */
export function getSkillTypes(): string[] {
  return ['combat', 'subterfuge', 'social', 'survival', 'crafting', 'mental'];
}

/**
 * Filter skills by species category
 * Returns only skills that the specified species category can learn
 *
 * @param speciesCategory - Species category (e.g., "sapient", "feline", etc.)
 * @returns Array of skills applicable to the species
 */
export function getSkillsForSpecies(speciesCategory: string): SkillData[] {
  return getAllSkills().filter(skill =>
    skill.applicableSpecies?.includes(speciesCategory) ?? true  // If no restriction, allow all species
  );
}

// ============================================================================
// ABILITY FUNCTIONS
// ============================================================================

/**
 * Get all abilities
 */
export function getAllAbilities(): AbilityData[] {
  return abilities;
}

/**
 * Get abilities by category
 */
export function getAbilitiesByCategory(category: string): AbilityData[] {
  // Return empty array if data not loaded yet
  if (!dataLoaded || !abilities || abilities.length === 0) {
    return [];
  }
  return abilities.filter(a => a && a.category === category);
}

/**
 * Find ability by ID
 */
export function getAbilityById(id: string): AbilityData | undefined {
  return abilities.find(a => a.id === id);
}

/**
 * Get ability categories for display
 */
export function getAbilityCategories(): string[] {
  return ['combat', 'social', 'survival', 'mental', 'special'];
}

/**
 * Get ability category display name
 */
export function getAbilityCategoryDisplayName(category: string): string {
  const names: Record<string, string> = {
    combat: 'Combat',
    social: 'Social',
    survival: 'Survival',
    mental: 'Mental',
    special: 'Special'
  };
  return names[category] || category;
}

/**
 * Calculate ability cost (abilities have fixed costs)
 */
export function calculateAbilityCost(abilityId: string): number {
  const ability = getAbilityById(abilityId);
  return ability?.cost || 0;
}

/**
 * Calculate total ability points spent from abilities array
 */
export function calculateTotalAbilityPoints(abilitiesList: CharacterAbility[]): number {
  return abilitiesList.reduce((total, ability) => {
    return total + calculateAbilityCost(ability.ability_id);
  }, 0);
}

/**
 * Check if ability is available to character based on requirements
 * Checks species, caste, status, skill levels, and stat minimums
 */
export function isAbilityAvailable(
  ability: AbilityData,
  character: {
    species?: SpeciesData;
    caste?: string;
    status?: string;
    skills?: CharacterSkill[];
    stats?: GoreanCharacterModel['stats'];
  }
): { available: boolean; reason?: string } {
  if (!ability.requirements) {
    return { available: true };
  }

  const req = ability.requirements;

  // Check species requirement
  if (req.species && req.species.length > 0 && character.species) {
    const speciesMatch = req.species.some(s =>
      lc(s) === lc(character.species!.id) ||
      lc(s) === lc(character.species!.category)
    );
    if (!speciesMatch) {
      return { available: false, reason: 'Species requirement not met' };
    }
  }

  // Check caste requirement
  if (req.caste && req.caste.length > 0 && character.caste) {
    const casteMatch = req.caste.some(c => lc(c) === lc(character.caste!));
    if (!casteMatch) {
      return { available: false, reason: 'Caste requirement not met' };
    }
  }

  // Check status requirement
  if (req.status && req.status.length > 0 && character.status) {
    const statusMatch = req.status.some(s => lc(s) === lc(character.status!));
    if (!statusMatch) {
      return { available: false, reason: 'Status requirement not met' };
    }
  }

  // Check skill requirement
  if (req.skill && character.skills) {
    const charSkill = character.skills.find(s => lc(s.skill_id) === lc(req.skill!.id));
    if (!charSkill || charSkill.level < req.skill.level) {
      return { available: false, reason: `Requires ${req.skill.id} level ${req.skill.level}` };
    }
  }

  // Check stat minimum requirement
  if (req.minStat && character.stats) {
    const statName = req.minStat.stat.toLowerCase() as keyof typeof character.stats;
    const statValue = character.stats[statName] as number;
    if (typeof statValue === 'number' && statValue < req.minStat.value) {
      return { available: false, reason: `Requires ${req.minStat.stat} ${req.minStat.value}+` };
    }
  }

  return { available: true };
}

/**
 * Get abilities available to character based on all requirements
 */
export function getAvailableAbilities(character: {
  species?: SpeciesData;
  caste?: string;
  status?: string;
  skills?: CharacterSkill[];
  stats?: GoreanCharacterModel['stats'];
}): AbilityData[] {
  return getAllAbilities().filter(ability => {
    const check = isAbilityAvailable(ability, character);
    return check.available;
  });
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

  // Validate each skill respects its maxInitialLevel
  for (const skill of skillsList) {
    const maxLevel = getSkillMaxInitialLevel(skill.skill_id);
    if (skill.level > maxLevel) {
      return {
        valid: false,
        error: `Skill "${skill.skill_name}" level ${skill.level} exceeds maximum initial level ${maxLevel}`
      };
    }
  }

  return { valid: true };
}

/**
 * Validate ability point allocation
 * Returns { valid: boolean, error?: string }
 */
export function validateAbilityPoints(
  abilitiesList: CharacterAbility[],
  allocatedPoints: number
): { valid: boolean; error?: string } {
  const spentPoints = calculateTotalAbilityPoints(abilitiesList);

  if (spentPoints > allocatedPoints) {
    return { valid: false, error: `Ability points spent (${spentPoints}) exceeds allocated (${allocatedPoints})` };
  }

  // Validate each ability exists
  for (const ability of abilitiesList) {
    const abilityData = getAbilityById(ability.ability_id);
    if (!abilityData) {
      return {
        valid: false,
        error: `Unknown ability: "${ability.ability_name}"`
      };
    }
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

  // Ability validation
  const abilityValidation = validateAbilityPoints(model.abilities, model.abilitiesAllocatedPoints);
  if (!abilityValidation.valid) {
    errors.push(abilityValidation.error || 'Invalid ability allocation');
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
    skillsSpentPoints: 0,
    abilities: [],
    abilitiesAllocatedPoints: DEFAULT_ABILITY_POINTS,
    abilitiesSpentPoints: 0
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
