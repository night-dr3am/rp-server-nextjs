// TypeScript types for Arkana character creation data

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
  picks: Set<string>;
  magicSchools: Set<string>;
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