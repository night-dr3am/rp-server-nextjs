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
  popularityRating: number;
  size: Size;
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
  popularityRating: number;
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

export interface StatusData {
  id: string;
  name: string;
  category: StatusCategory;
  description: string;
  rights?: string[];
  restrictions?: string[];
  applicableSpecies: string[];
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
  popularityRating?: number;
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
  subcastes?: string[];
  notes?: string;
  applicableSpecies: string[];
  popularityRating?: number;
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

export type SkillType = 'combat' | 'survival' | 'mental' | 'social' | 'special';

export interface SkillData {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  baseStat: string;
  maxLevel: number;
  applicableTo?: string[];
  restrictedTo?: string[];
  xpCost: number[];
  notes?: string;
}

// ============================================================================
// CHARACTER CREATION MODEL
// ============================================================================

export interface CharacterSkill {
  skill_id: string;
  skill_name: string;
  level: number;
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

  // Step 5: Status
  status?: string;
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
 * Calculate health max from strength (Strength × 5)
 */
export function calculateHealthMax(strength: number): number {
  return strength * 5;
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

  // Status
  status: string;
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

  status: string;
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
