// TypeScript types for Gorean character creation system

// ============================================================================
// SPECIES TYPES
// ============================================================================

export type SpeciesCategory = 'sapient' | 'feline' | 'canine_like' | 'hooved' | 'avian' | 'reptilian' | 'aquatic' | 'small';

export type Rarity = 'very_common' | 'common' | 'uncommon' | 'rare' | 'very_rare' | 'extremely_rare';

export type Size = 'tiny' | 'small' | 'medium' | 'large' | 'very_large' | 'gigantic' | 'tiny_to_large';

export interface SpeciesData {
  id: string;
  name: string;
  category: SpeciesCategory;
  description: string;
  physicalDesc: string;
  playabilityNotes: string;
  mechanicalNotes: string;
  rarity: Rarity;
  rarityRating: number; // 1=very rare (standout/diverse), 2=rare (uncommon), 3=common (standard)
  size: Size;
  hpBase: number;
  hpStrengthMult: number;
  habitat: string[];
  variants?: string[];
  bookReferences: string[];
}

// Quick reference for species IDs
export const GOREAN_SPECIES_IDS = {
  // Sapient
  HUMAN: 'human',
  KURII: 'kurii',
  PRIEST_KING: 'priestKing',
  SPIDER_PEOPLE: 'spiderPeople',

  // Feline
  LARL: 'larl',
  PANTHER: 'panther',
  GIANI: 'giani',

  // Canine-like
  SLEEN: 'sleen',
  PRAIRIE_SLEEN: 'prairie_sleen',
  SNOW_SLEEN: 'snow_sleen',

  // Hooved
  TABUK: 'tabuk',
  KAILIAUK: 'kailiauk',
  BOSK: 'bosk',
  VERR: 'verr',
  HURT: 'hurt',
  KAIILA: 'kaiila',

  // Avian
  TARN: 'tarn',
  HERLIT: 'herlit',
  VART: 'vart',
  UL: 'ul',

  // Reptilian
  THARLARION: 'tharlarion',
  MAMBA: 'mamba',
  HITH: 'hith',

  // Aquatic
  SEA_SLEEN: 'sea_sleen',
  SHARK: 'shark',
  WHALE: 'whale',
  PARSIT: 'parsit',

  // Small
  URT: 'urt',
  LEEM: 'leem',
  QUALA: 'quala',
  TARSK: 'tarsk'
} as const;

// ============================================================================
// CULTURE TYPES
// ============================================================================

export type CultureType = 'cityState' | 'northern' | 'nomadic' | 'marshForestJungle' | 'special' | 'animal';

export interface CultureData {
  id: string;
  name: string;
  type: CultureType;
  description: string;
  characteristics: string[];
  hasCastes: boolean;
  applicableSpecies: string[];
  examples?: string[];
  tribes?: string[];
  roles?: string[];
  gender?: string;
  rarityRating: number; // 1=very rare (standout/diverse), 2=rare (uncommon), 3=common (standard)
  bookReferences: string[];
}

// ============================================================================
// STATUS TYPES
// ============================================================================

export type StatusCategory = 'free' | 'slave' | 'special' | 'animal';

export interface StatusSubtype {
  id: string;
  name: string;
  description: string;
  desc?: string;
  training?: string;
  examples?: string[];
  notes?: string;
}

export interface SlaveType {
  id: string;
  name: string;
  description: string;
  culturalOrigin: string;
}

export interface StatusData {
  id: string;
  name: string;
  category: StatusCategory;
  description: string;
  rights?: string[];
  restrictions?: string[];
  applicableSpecies: string[];
  slaveTypes?: SlaveType[]; // Cultural variants of slave type (Kajira/Bondmaid for female, Kajirus/Thrall for male)
  subtypes?: StatusSubtype[];
  culturalVariations?: Record<string, string>;
  virginityStatus?: {
    white_silk: string;
    red_silk: string;
  };
  penalties?: Record<string, string>;
  redemption?: string;
  notes?: string;
  characteristics?: string[];
  purposes?: string[];
  examples?: string[];
  rarityRating?: number; // 1=very rare (standout/diverse), 2=rare (uncommon), 3=common (standard)
}

// ============================================================================
// CASTE/ROLE TYPES
// ============================================================================

export type CasteType = 'high' | 'low' | 'special';

export interface CasteData {
  id: string;
  name: string;
  type?: CasteType; // Caste type: high, low, or special
  color?: string;
  rank?: number | string;
  description: string;
  characteristics?: string[];
  restrictions?: string[];
  rights?: string[];
  gender?: string;
  joinByBirth?: boolean;
  joinByChoice?: boolean;
  hpBonus?: number; // Percentage HP bonus (0-100) - combat castes get +10%
  subcastes?: string[];
  notes?: string;
  applicableSpecies: string[];
  applicableStatuses?: string[]; // Which statuses can access this caste (e.g., ["freeMan", "freeWoman"])
  rarityRating?: number; // 1=very rare (standout/diverse), 2=rare (uncommon), 3=common (standard)
  bookReferences?: string[];
  parentCaste?: string;
}

export interface TribalRole {
  id: string;
  name: string;
  description: string;
  responsibilities?: string[];
  prestige?: string;
  gender?: string;
  hpBonus?: number; // Percentage HP bonus (0-100) - combat roles get +10%
  applicableStatuses?: string[]; // Which statuses can access this role (e.g., ["freeMan"], ["freeWoman"], ["kajira"])
  notes?: string;
  training?: string;
  examples?: string[];
}

// ============================================================================
// REGION TYPES
// ============================================================================

export type RegionType = 'city' | 'tribe' | 'confederation' | 'mountains' | 'marsh' | 'river' | 'desert' | 'plains' | 'forest' | 'jungle' | 'tundra' | 'region' | 'ocean' | 'oasis' | 'mines' | 'mountain' | 'underground' | 'glacier';

export interface RegionData {
  id: string;
  name: string;
  type: RegionType;
  culture?: string;
  description: string;
  region?: string;
  notes?: string;
}

// ============================================================================
// SKILLS TYPES
// ============================================================================

export type SkillType = 'combat' | 'subterfuge' | 'social' | 'survival' | 'crafting' | 'mental';

export interface SkillData {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  baseStat: string;
  maxLevel: number;
  maxInitialLevel: number;  // Maximum level allowed at character creation
  xpCost: number[];
  hpBonus?: number;  // HP bonus per level (0, 1, or 2)
  applicableSpecies?: string[];  // Species categories that can learn this skill (e.g., ["sapient"] or ["sapient", "feline", ...])
  applicableTo?: string[];
  restrictedTo?: string[];
  notes?: string;
}

// ============================================================================
// CHARACTER CREATION MODEL
// ============================================================================

export interface CharacterSkill {
  skill_id: string;
  skill_name: string;
  level: number;
  xp: number;  // Current XP progress towards next level
}

export interface GoreanCharacterModel {
  page: number;

  // Step 1: Identity
  identity: {
    characterName?: string;
    agentName?: string;
    title?: string;
    background?: string;
  };

  // Step 2-3: Species
  species?: string;
  speciesCategory?: SpeciesCategory;
  speciesVariant?: string;

  // Step 4: Culture
  culture?: string;
  cultureType?: CultureType;

  // Step 5: Social Status
  socialStatus?: string;
  slaveType?: string; // Cultural variant (kajira, bondmaid, kajirus, thrall) - only for slave statuses
  statusSubtype?: string;

  // Step 6: Caste/Role
  casteRole?: string;
  casteRoleType?: string;

  // Step 7: Region
  region?: string;
  homeStoneName?: string;

  // Step 8: Stats
  stats: {
    strength: number;
    agility: number;
    intellect: number;
    perception: number;
    charisma: number;
    pool: number;
    spent: number;
  };

  // Step 9: Skills
  skills: CharacterSkill[];
  skillsAllocatedPoints: number;
  skillsSpentPoints: number;

  // Step 10: Abilities
  abilities: CharacterAbility[];
  abilitiesAllocatedPoints: number;
  abilitiesSpentPoints: number;
}

// ============================================================================
// STAT SYSTEM
// ============================================================================

export const GOREAN_STAT_NAMES = {
  strength: 'Strength',
  agility: 'Agility',
  intellect: 'Intellect',
  perception: 'Perception',
  charisma: 'Charisma'
} as const;

export const GOREAN_STAT_DESCRIPTIONS = {
  strength: 'Physical power, health capacity, melee damage, carrying capacity',
  agility: 'Speed, reflexes, dodge, ranged accuracy, initiative',
  intellect: 'Intelligence, reasoning, memory, learning, problem-solving',
  perception: 'Awareness, senses, tracking, spotting danger, intuition',
  charisma: 'Personality, leadership, persuasion, intimidation, animal handling'
} as const;

export type GoreanStatName = keyof typeof GOREAN_STAT_NAMES;

/**
 * Calculate stat modifier from stat value (1-5)
 * Same calculation as Arkana for consistency
 *
 * @param statValue - Stat value from 1-5
 * @returns Modifier value
 */
export function calculateGoreanStatModifier(statValue: number): number {
  if (statValue <= 0) return -3;
  if (statValue === 1) return -2;
  if (statValue === 2) return 0;
  if (statValue === 3) return 2;
  if (statValue === 4) return 4;
  if (statValue >= 5) return 6;
  return 0;
}

/**
 * Calculate health max based on species, strength, caste/role, and skills
 * Formula: speciesBaseHP + (Strength × strengthMult) + casteOrRoleBonus% + skillBonuses
 *
 * @param strength - Character's strength stat (1-5)
 * @param speciesData - Species data with hpBase and hpStrengthMult
 * @param casteOrRoleData - Optional caste or tribal role data with hpBonus percentage
 * @param skills - Optional array of character skills
 * @returns Calculated maximum HP
 */
export function calculateHealthMax(
  strength: number,
  speciesData: SpeciesData,
  casteOrRoleData?: CasteData | TribalRole,
  skills?: CharacterSkill[]
): number {
  // Base calculation: species base HP + (strength × species strength multiplier)
  let hp = speciesData.hpBase + (strength * speciesData.hpStrengthMult);

  // Apply caste or tribal role bonus (percentage)
  if (casteOrRoleData?.hpBonus) {
    hp = Math.floor(hp * (1 + casteOrRoleData.hpBonus / 100));
  }

  // Skill bonuses: certain skills grant +1 or +2 HP per level
  if (skills) {
    const hpSkills: Record<string, number> = {
      'unarmed_combat': 2,  // Combat skill - significant HP bonus
      'swordplay': 1,        // Combat skill - moderate HP bonus
      'hunting': 1           // Survival skill - moderate HP bonus
    };

    skills.forEach(skill => {
      if (hpSkills[skill.skill_id]) {
        hp += hpSkills[skill.skill_id] * skill.level;
      }
    });
  }

  return hp;
}

// ============================================================================
// DATABASE MODEL INTERFACE (matches Prisma schema)
// ============================================================================

export interface GoreanStatsDB {
  id: number;
  userId: string;

  // Identity
  characterName: string;
  agentName: string;
  title?: string;
  background?: string;

  // Species
  species: string;
  speciesCategory: string;
  speciesVariant?: string;

  // Culture
  culture: string;
  cultureType: string;

  // Social Status
  socialStatus: string;
  slaveType?: string; // Cultural variant (kajira, bondmaid, kajirus, thrall) - only for slave statuses
  statusSubtype?: string;

  // Caste/Role
  casteRole?: string;
  casteRoleType?: string;

  // Region
  region?: string;
  homeStoneName?: string;

  // Base Stats (1-5)
  strength: number;
  agility: number;
  intellect: number;
  perception: number;
  charisma: number;
  statPointsPool: number;
  statPointsSpent: number;

  // Derived Stats
  healthMax: number;
  hungerMax: number;
  thirstMax: number;

  // Current State
  healthCurrent: number;
  hungerCurrent: number;
  thirstCurrent: number;

  // Economy
  goldCoin: number;
  silverCoin: number;
  copperCoin: number;
  xp: number;

  // Skills
  skills: CharacterSkill[]; // JSON stored as array
  skillsAllocatedPoints: number;
  skillsSpentPoints: number;

  // Active Effects
  activeEffects: unknown; // JSON - runtime structure not known
  liveStats: unknown; // JSON - runtime structure not known

  // Metadata
  registrationCompleted: boolean;
  gorRole: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface GoreanCharacterCreateRequest {
  sl_uuid: string;
  character_name: string;
  agent_name: string;
  title?: string;
  background?: string;

  species: string;
  species_category: string;
  species_variant?: string;

  culture: string;
  culture_type: string;

  socialStatus: string;
  slave_type?: string; // Cultural variant (kajira, bondmaid, kajirus, thrall) - only for slave statuses
  status_subtype?: string;

  caste_role?: string;
  caste_role_type?: string;

  region?: string;
  home_stone_name?: string;

  strength: number;
  agility: number;
  intellect: number;
  perception: number;
  charisma: number;

  skills?: CharacterSkill[];

  registration_completed?: boolean;
}

export interface GoreanCharacterResponse {
  success: boolean;
  data?: GoreanStatsDB;
  error?: string;
}

// ============================================================================
// ABILITIES AND EFFECTS TYPES
// ============================================================================

export type EffectCategory = 'check' | 'damage' | 'heal' | 'stat_modifier' | 'control';
export type DamageType = 'physical' | 'mental';
export type ControlType = 'stun' | 'fear' | 'daze' | 'charm' | 'sleep';
export type EffectTarget = 'self' | 'enemy' | 'ally' | 'area' | 'all_enemies' | 'all_allies' | 'all_enemies_and_self' | 'all_allies_and_self';
export type EffectDuration = 'immediate' | 'scene' | `turns:${number}`;
export type ModifierType = 'roll_bonus';  // Simplified: only linear stacking for Gor

export interface EffectData {
  id: string;
  orderNumber: number;  // Sequential position in effects.json (starting from 1)
  category: EffectCategory;

  // Check effect fields
  checkStat?: string;
  checkVs?: 'enemy_stat' | 'tn';
  checkVsStat?: string;
  targetNumber?: number;

  // Damage effect fields
  damageType?: DamageType;
  damageFormula?: string;  // e.g., "3 + Strength" or "5"

  // Heal effect fields
  healFormula?: string;  // e.g., "3" or "2 + Intellect"

  // Stat modifier fields
  stat?: string;  // Stat name or "all" for all stats
  modifier?: number;  // Positive for buffs, negative for debuffs
  modifierType?: ModifierType;  // How modifier is applied

  // Control effect fields
  controlType?: ControlType;

  // Common fields
  target?: EffectTarget;
  duration?: EffectDuration;
  description?: string;
}

export interface AbilityRequirements {
  species?: string[];  // Species IDs or categories (e.g., ["sapient"] or ["kurii", "larl"])
  caste?: string[];    // Caste IDs (e.g., ["warrior", "assassin"])
  status?: string[];   // Status IDs (e.g., ["freeMan", "freeWoman"])
  skill?: {            // Required skill and minimum level
    id: string;
    level: number;
  };
  minStat?: {          // Minimum stat requirement
    stat: string;
    value: number;
  };
}

export interface AbilityData {
  id: string;
  orderNumber: number;  // Sequential position in abilities.json (starting from 1)
  name: string;
  desc: string;
  category: 'combat' | 'social' | 'survival' | 'mental' | 'special';
  cost: number;        // Ability points cost
  cooldown?: number;   // Cooldown in seconds (enforced via events table timestamp checking)
  range?: number;      // Range in meters (0 = melee)
  targetType?: 'single' | 'area' | 'self';  // Type of targeting (ability level)

  // Effect references (matching Arkana structure)
  effects: {
    attack?: string[];   // Effect IDs for attack usage
    ability?: string[];  // Effect IDs for ability usage
    passive?: string[];  // Effect IDs that are always active (if any)
  };

  // Ability type classification
  abilityType: ('attack' | 'ability')[];  // e.g., ["attack"], ["ability"], or ["attack", "ability"]

  // Requirements and restrictions
  requirements?: AbilityRequirements;

  // Metadata
  notes?: string;
  bookReferences?: string[];
}

// Character's learned abilities (for database storage)
export interface CharacterAbility {
  ability_id: string;
  ability_name: string;
  learned_at?: Date;    // When ability was learned (optional tracking)
  uses?: number;        // Number of times used (optional tracking)
}

// Active effect instance (stored in activeEffects array)
export interface ActiveEffect {
  effectId: string;
  name: string;
  category: EffectCategory;
  sourceAbilityId?: string;
  sourceAbilityName?: string;
  turnsRemaining?: number;  // For turn-based effects
  sceneEffect?: boolean;    // For scene-long effects
  appliedBy?: string;       // User ID who applied the effect
  appliedTo?: string;       // User ID who has the effect

  // Effect data (copied from EffectData for runtime access)
  stat?: string;
  modifier?: number;
  modifierType?: ModifierType;
  controlType?: ControlType;
  target?: EffectTarget;
  duration?: EffectDuration;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_STAT_POINTS_POOL = 10;
export const DEFAULT_SKILL_POINTS = 5;
export const MIN_STAT_VALUE = 1;
export const MAX_STAT_VALUE = 5;

// Stat costs for point-buy (1 point per level)
export const STAT_COSTS = [0, 1, 2, 3, 4];

// ============================================================================
// HELPER TYPES
// ============================================================================

export type SpeciesCategoryKey = keyof typeof GOREAN_SPECIES_IDS;
export type GoreanStatKey = keyof typeof GOREAN_STAT_NAMES;
