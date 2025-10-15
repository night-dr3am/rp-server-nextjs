// Helper utilities for loading and processing abilities (perks, cybernetics, magic)
import { Perk, Cybernetic, MagicSchool } from './types';
import { getAllPerks, getAllCybernetics, getAllMagicSchools } from './dataLoader';

/**
 * Get all passive effect IDs from user's perks, cybernetics, and magic
 * Used to apply passive modifiers to liveStats in combat
 *
 * @param perks - Array of perk IDs the user owns
 * @param cybernetics - Array of cybernetic IDs the user owns
 * @param magicWeaves - Array of magic weave IDs the user owns
 * @returns Array of effect IDs from passive abilities
 */
export function getPassiveEffects(
  perks: string[],
  cybernetics: string[],
  magicWeaves: string[]
): string[] {
  const effectIds: string[] = [];

  // Load all data
  const allPerks = getAllPerks();
  const allCybernetics = getAllCybernetics();
  const allMagicSchools = getAllMagicSchools();

  // Process perks with passive effects
  perks.forEach(perkId => {
    const perk = allPerks.find(p => p.id === perkId);
    if (perk && perk.abilityType?.includes('passive') && perk.effects?.passive) {
      effectIds.push(...perk.effects.passive);
    }
  });

  // Process cybernetics with passive effects
  cybernetics.forEach(cyberId => {
    const cyber = allCybernetics.find(c => c.id === cyberId);
    if (cyber && cyber.abilityType?.includes('passive') && cyber.effects?.passive) {
      effectIds.push(...cyber.effects.passive);
    }
  });

  // Process magic weaves with passive effects
  magicWeaves.forEach(weaveId => {
    const weave = allMagicSchools.find(m => m.id === weaveId);
    if (weave && weave.abilityType?.includes('passive') && weave.effects?.passive) {
      effectIds.push(...weave.effects.passive);
    }
  });

  return effectIds;
}

/**
 * Load a perk by ID
 *
 * @param perkId - Perk ID to load
 * @returns Perk object or null if not found
 */
export function loadPerk(perkId: string): Perk | null {
  const allPerks = getAllPerks();
  return allPerks.find(p => p.id === perkId) || null;
}

/**
 * Load a cybernetic by ID
 *
 * @param cyberId - Cybernetic ID to load
 * @returns Cybernetic object or null if not found
 */
export function loadCybernetic(cyberId: string): Cybernetic | null {
  const allCybernetics = getAllCybernetics();
  return allCybernetics.find(c => c.id === cyberId) || null;
}

/**
 * Load a magic weave by ID
 *
 * @param weaveId - Magic weave ID to load
 * @returns MagicSchool object or null if not found
 */
export function loadMagicWeave(weaveId: string): MagicSchool | null {
  const allMagicSchools = getAllMagicSchools();
  return allMagicSchools.find(m => m.id === weaveId) || null;
}

/**
 * Load a magic weave by name (case-insensitive search)
 *
 * @param weaveName - Magic weave name to search for
 * @returns MagicSchool object or null if not found
 */
export function loadMagicWeaveByName(weaveName: string): MagicSchool | null {
  const allMagicSchools = getAllMagicSchools();
  const lowerName = weaveName.toLowerCase();
  return allMagicSchools.find(m => m.name.toLowerCase() === lowerName) || null;
}

/**
 * Load a cybernetic by name (case-insensitive search)
 *
 * @param cyberName - Cybernetic name to search for
 * @returns Cybernetic object or null if not found
 */
export function loadCyberneticByName(cyberName: string): Cybernetic | null {
  const allCybernetics = getAllCybernetics();
  const lowerName = cyberName.toLowerCase();
  return allCybernetics.find(c => c.name.toLowerCase() === lowerName) || null;
}

/**
 * Check if user owns a perk
 *
 * @param userPerks - Array of perk IDs the user owns
 * @param perkId - Perk ID to check
 * @returns True if user owns the perk
 */
export function ownsPerk(userPerks: string[], perkId: string): boolean {
  return userPerks.includes(perkId);
}

/**
 * Check if user owns a cybernetic
 *
 * @param userCybernetics - Array of cybernetic IDs the user owns
 * @param cyberId - Cybernetic ID to check
 * @returns True if user owns the cybernetic
 */
export function ownsCybernetic(userCybernetics: string[], cyberId: string): boolean {
  return userCybernetics.includes(cyberId);
}

/**
 * Check if user owns a magic weave
 *
 * @param userMagicWeaves - Array of magic weave IDs the user owns
 * @param weaveId - Magic weave ID to check
 * @returns True if user owns the magic weave
 */
export function ownsMagicWeave(userMagicWeaves: string[], weaveId: string): boolean {
  return userMagicWeaves.includes(weaveId);
}

/**
 * Check if an ability has attack effects
 *
 * @param ability - Perk, Cybernetic, or MagicSchool object
 * @returns True if ability has attack effects
 */
export function hasAttackEffects(ability: Perk | Cybernetic | MagicSchool): boolean {
  return (ability.abilityType?.includes('attack') && !!ability.effects?.attack) || false;
}

/**
 * Check if an ability has ability effects (active abilities, not attacks)
 *
 * @param ability - Perk, Cybernetic, or MagicSchool object
 * @returns True if ability has ability effects
 */
export function hasAbilityEffects(ability: Perk | Cybernetic | MagicSchool): boolean {
  return (ability.abilityType?.includes('ability') && !!ability.effects?.ability) || false;
}

/**
 * Check if an ability has passive effects
 *
 * @param ability - Perk, Cybernetic, or MagicSchool object
 * @returns True if ability has passive effects
 */
export function hasPassiveEffects(ability: Perk | Cybernetic | MagicSchool): boolean {
  return (ability.abilityType?.includes('passive') && !!ability.effects?.passive) || false;
}

/**
 * Convert passive effect IDs to ActiveEffect format for liveStats calculation
 * Passive effects are treated as permanent (999 turns)
 *
 * @param passiveEffectIds - Array of passive effect IDs
 * @returns Array of ActiveEffect objects
 */
export function passiveEffectsToActiveFormat(passiveEffectIds: string[]): Array<{
  effectId: string;
  name: string;
  duration: string;
  turnsLeft: number;
  appliedAt: string;
}> {
  return passiveEffectIds.map(effectId => ({
    effectId,
    name: effectId, // Will be resolved by effectsUtils
    duration: 'permanent',
    turnsLeft: 999, // Permanent passive effects
    appliedAt: new Date().toISOString()
  }));
}
