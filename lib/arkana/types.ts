// TypeScript types for Arkana character creation data

// Effects structure based on effectsSystemSchema.json
export interface PowerEffects {
  attack?: string[];
  ability?: string[];
  passive?: string[];
  onHit?: string[];
  onDefense?: string[];
}

// Effect definition from effects.json
export interface EffectDefinition {
  id: string;
  name: string;
  desc: string;
  category: 'check' | 'damage' | 'stat_modifier' | 'control' | 'heal' | 'utility' | 'defense' | 'special' | 'ownership';
  type?: string;

  // Check-related fields
  checkStat?: string;
  checkVs?: 'fixed' | 'enemy_stat';
  checkVsStat?: string;
  checkTN?: number;

  // Damage-related fields
  damageType?: string;
  damageFormula?: string;
  damageFixed?: number;

  // Heal-related fields
  healType?: string;
  healFormula?: string;

  // Stat modifier fields
  stat?: string;
  modifier?: number;
  modifierType?: 'stat_value' | 'roll_bonus';

  // Control-related fields
  controlType?: string;

  // Utility fields
  utilityType?: string;

  // Defense fields
  defenseType?: string;
  damageReduction?: number;

  // Ownership fields (for WorldObject checks)
  requiresOwnership?: boolean;

  // Common fields
  target?: 'enemy' | 'self' | 'ally' | 'area' | 'all_enemies' | 'all_allies' | 'single';
  duration?: string;
  resistType?: string;
}

// Result of executing an effect
export interface EffectResult {
  success: boolean;
  effectDef: EffectDefinition;
  damage?: number;
  heal?: number;
  rollInfo?: string;
  defenseStat?: 'physical' | 'dexterity' | 'mental' | 'perception';  // Which stat was checked for defense (for detailed TN display)
}

// Active Effect tracking
export interface ActiveEffect {
  effectId: string;        // EffectDefinition id
  name: string;            // Effect name for display
  duration: string;        // Original duration (e.g., "turns:3", "scene")
  turnsLeft: number;       // Turns remaining
  appliedAt: string;       // ISO timestamp when effect was applied
  casterName?: string;     // Character name of who cast this effect (optional, for display)
  sourceId?: string;       // Power/Perk/Cybernetic/Magic ID that caused this effect (optional)
  sourceName?: string;     // Display name of source ability (e.g., "Emotional Resonance", "Chi Manipulation")
  sourceType?: 'power' | 'perk' | 'cybernetic' | 'magic';  // Type of source ability (optional)
}

// Live Stats for dynamic calculations
export interface LiveStats {
  [statName: string]: number | string;  // e.g., { Stealth: 5, Physical: -1, Status: "paralyzed" }
}

export interface Flaw {
  id: string;
  name: string;
  desc: string;
  cost: number;
  tags: string[];
}

export interface CommonPower {
  id: string;
  name: string;
  desc: string;
  cost: number;
  species: string;
  abilityType?: string[];
  tags?: string[];
  baseStat?: string;
  targetType?: string;
  range?: number;
  effects?: PowerEffects;
}

export interface Perk {
  id: string;
  name: string;
  desc: string;
  cost: number;
  species?: string;
  arch?: string;
  abilityType?: string[];  // ["passive", "ability", "attack"]
  baseStat?: string;        // For active perks (ability/attack)
  targetType?: string;      // For active perks
  range?: number;           // For active perks
  effects?: PowerEffects;   // Effects structure
}

export interface ArchetypePower {
  id: string;
  name: string;
  desc: string;
  cost: number;
  species: string;
  arch: string;
  abilityType?: string[];
  tags?: string[];
  baseStat?: string;
  targetType?: string;
  range?: number;
  effects?: PowerEffects;
}

export interface Cybernetic {
  id: string;
  name: string;
  desc: string;
  cost: number;
  type: string;
  section: string;
  abilityType?: string[];  // ["passive", "ability", "attack"]
  baseStat?: string;        // For active cybernetics (ability/attack)
  targetType?: string;      // For active cybernetics
  range?: number;           // For active cybernetics
  effects?: PowerEffects;   // Effects structure
}

export interface MagicSchool {
  id: string;
  name: string;
  desc: string;
  section: string;
  species?: string;
  cost: number;
  abilityType?: string[];  // ["ability", "attack"]
  baseStat?: string;        // Usually "Mental" for magic
  targetType?: string;      // Target type
  range?: number;           // Range in meters
  effects?: PowerEffects;   // Effects structure
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  type: 'required' | 'automatic' | 'simple_roll' | 'situational' | 'special';
  maxLevel: number;
  mechanic: string;
}

export interface CharacterSkill {
  skill_id: string;
  skill_name: string;
  level: number;
}

// Character model interface matching arkana-data-main
export interface CharacterModel {
  page: number;
  identity: {
    characterName?: string;
    agentName?: string;
    aliasCallsign?: string;
    faction?: string;
    conceptRole?: string;
    job?: string;
    background?: string;
  };
  race: string;
  arch: string;
  stats: {
    phys: number;
    dex: number;
    mental: number;
    perc: number;
    pool: number;
  };
  cyberSlots: number;
  flaws: Set<string>;
  // Skills System
  skills: CharacterSkill[];
  skillsAllocatedPoints: number;
  skillsSpentPoints: number;
  // Separate Sets for each power/ability type
  commonPowers: Set<string>;
  archetypePowers: Set<string>;
  perks: Set<string>;
  cyberneticAugments: Set<string>;
  // Separate Sets for magic schools and weaves
  magicSchools: Set<string>;
  magicWeaves: Set<string>;
  page5tab: string;
  freeMagicSchool: string;
  freeMagicWeave: string;
  synthralFreeWeave: string;
}

// Race definitions
export const RACES = {
  human: ["Human (no powers)", "Arcanist", "Synthral", "Psion"],
  strigoi: ["Life", "Death", "Warrior", "Ruler"],
  gaki: ["Yin", "Hun", "Yang", "P'o", "Chudo"],
  spliced: ["Predators", "Avian", "Aquatic", "Reptilian", "Insectoid", "Chimeric"],
  veilborn: ["Echoes", "Veils", "Blossoms", "Glass"]
} as const;

export type RaceName = keyof typeof RACES;

// Stat names and descriptions
export const STAT_NAMES = {
  phys: 'Physical',
  dex: 'Dexterity',
  mental: 'Mental',
  perc: 'Perception'
} as const;

export const STAT_DESCRIPTIONS = {
  phys: 'Strength, endurance, and health',
  dex: 'Agility, reflexes, and precision',
  mental: 'Intelligence, reasoning, and memory',
  perc: 'Awareness, intuition, and senses'
} as const;

// Utility function for stat modifiers
export function calculateStatModifier(statValue: number): number {
  if (statValue <= 0) return -3;
  if (statValue === 1) return -2;
  if (statValue === 2) return 0;
  if (statValue === 3) return 2;
  if (statValue === 4) return 4;
  if (statValue >= 5) return 6;
  return 0;
}

// ========================================
// XP Shop Types
// ========================================

// Purchase request for a single item
export interface ShopPurchaseItem {
  itemType: 'cybernetic' | 'magic_weave';
  itemId: string;
  xpCost: number;
}

// Full purchase request
export interface ShopPurchaseRequest {
  sl_uuid: string;
  universe: string;
  token: string;
  sessionId: string;
  purchases: ShopPurchaseItem[];
}

// Purchase result
export interface ShopPurchaseResult {
  success: boolean;
  data?: {
    updatedXp: number;
    addedCybernetics: string[];
    addedMagicWeaves: string[];
    addedMagicSchools: string[];
    totalCost: number;
  };
  error?: string;
}