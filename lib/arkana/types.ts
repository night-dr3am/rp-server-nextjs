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
  category: 'check' | 'damage' | 'stat_modifier' | 'control' | 'heal' | 'utility' | 'defense' | 'special';
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
}

// Active Effect tracking
export interface ActiveEffect {
  effectId: string;        // EffectDefinition id
  name: string;            // Effect name for display
  duration: string;        // Original duration (e.g., "turns:3", "scene")
  turnsLeft: number;       // Turns remaining
  appliedAt: string;       // ISO timestamp when effect was applied
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
}

export interface MagicSchool {
  id: string;
  name: string;
  desc: string;
  section: string;
  species?: string;
  cost: number;
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
  if (statValue === 0) return -3;
  if (statValue === 1) return -2;
  if (statValue === 2) return 0;
  if (statValue === 3) return 2;
  if (statValue === 4) return 4;
  if (statValue === 5) return 6;
  return 0;
}