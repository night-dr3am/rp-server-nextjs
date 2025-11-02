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
 * Get all passive effects with source information from perks, cybernetics, and magic weaves
 * Enhanced version that tracks which ability grants each passive effect
 * Used to apply passive modifiers to liveStats in combat with full source tracking
 *
 * @param perks - Array of perk IDs the user owns
 * @param cybernetics - Array of cybernetic IDs the user owns
 * @param magicWeaves - Array of magic weave IDs the user owns
 * @returns Array of effects with source tracking (sourceId, sourceName, sourceType)
 */
export function getPassiveEffectsWithSource(
  perks: string[],
  cybernetics: string[],
  magicWeaves: string[]
): Array<{
  effectId: string;
  sourceId: string;
  sourceName: string;
  sourceType: 'perk' | 'cybernetic' | 'magic';
}> {
  const effectsWithSource: Array<{
    effectId: string;
    sourceId: string;
    sourceName: string;
    sourceType: 'perk' | 'cybernetic' | 'magic';
  }> = [];

  // Load all data
  const allPerks = getAllPerks();
  const allCybernetics = getAllCybernetics();
  const allMagicSchools = getAllMagicSchools();

  // Process perks with passive effects
  perks.forEach(perkId => {
    const perk = allPerks.find(p => p.id === perkId);
    if (perk && perk.abilityType?.includes('passive') && perk.effects?.passive) {
      perk.effects.passive.forEach(effectId => {
        effectsWithSource.push({
          effectId,
          sourceId: perk.id,
          sourceName: perk.name,
          sourceType: 'perk'
        });
      });
    }
  });

  // Process cybernetics with passive effects
  cybernetics.forEach(cyberId => {
    const cyber = allCybernetics.find(c => c.id === cyberId);
    if (cyber && cyber.abilityType?.includes('passive') && cyber.effects?.passive) {
      cyber.effects.passive.forEach(effectId => {
        effectsWithSource.push({
          effectId,
          sourceId: cyber.id,
          sourceName: cyber.name,
          sourceType: 'cybernetic'
        });
      });
    }
  });

  // Process magic weaves with passive effects
  magicWeaves.forEach(weaveId => {
    const weave = allMagicSchools.find(m => m.id === weaveId);
    if (weave && weave.abilityType?.includes('passive') && weave.effects?.passive) {
      weave.effects.passive.forEach(effectId => {
        effectsWithSource.push({
          effectId,
          sourceId: weave.id,
          sourceName: weave.name,
          sourceType: 'magic'
        });
      });
    }
  });

  return effectsWithSource;
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
 * Load a perk by name (case-insensitive search)
 *
 * @param perkName - Perk name to search for
 * @returns Perk object or null if not found
 */
export function loadPerkByName(perkName: string): Perk | null {
  const allPerks = getAllPerks();
  const lowerName = perkName.toLowerCase();
  return allPerks.find(p => p.name.toLowerCase() === lowerName) || null;
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
 * @param passiveEffectIds - Array of passive effect IDs (legacy signature for backward compatibility)
 * @returns Array of ActiveEffect objects
 */
export function passiveEffectsToActiveFormat(passiveEffectIds: string[]): Array<{
  effectId: string;
  name: string;
  duration: string;
  turnsLeft: number;
  appliedAt: string;
}>;

/**
 * Convert passive effects with source info to ActiveEffect format for liveStats calculation
 * Passive effects are treated as permanent (999 turns)
 * Enhanced version that includes source tracking for better combat message display
 *
 * @param passiveEffects - Array of passive effects with source information
 * @returns Array of ActiveEffect objects with source tracking
 */
export function passiveEffectsToActiveFormat(
  passiveEffects: Array<{
    effectId: string;
    sourceId: string;
    sourceName: string;
    sourceType: 'perk' | 'cybernetic' | 'magic';
  }>
): Array<{
  effectId: string;
  name: string;
  duration: string;
  turnsLeft: number;
  appliedAt: string;
  sourceId: string;
  sourceName: string;
  sourceType: 'perk' | 'cybernetic' | 'magic';
}>;

/**
 * Implementation with overload support for both legacy and enhanced usage
 */
export function passiveEffectsToActiveFormat(
  passiveEffects: string[] | Array<{
    effectId: string;
    sourceId: string;
    sourceName: string;
    sourceType: 'perk' | 'cybernetic' | 'magic';
  }>
): Array<{
  effectId: string;
  name: string;
  duration: string;
  turnsLeft: number;
  appliedAt: string;
  sourceId?: string;
  sourceName?: string;
  sourceType?: 'perk' | 'cybernetic' | 'magic';
}> {
  // Legacy path: array of strings (effect IDs only)
  if (passiveEffects.length === 0 || typeof passiveEffects[0] === 'string') {
    return (passiveEffects as string[]).map(effectId => ({
      effectId,
      name: effectId, // Will be resolved by effectsUtils
      duration: 'permanent',
      turnsLeft: 999, // Permanent passive effects
      appliedAt: new Date().toISOString()
    }));
  }

  // Enhanced path: array of objects with source info
  return (passiveEffects as Array<{
    effectId: string;
    sourceId: string;
    sourceName: string;
    sourceType: 'perk' | 'cybernetic' | 'magic';
  }>).map(effect => ({
    effectId: effect.effectId,
    name: effect.effectId, // Will be resolved by effectsUtils
    duration: 'permanent',
    turnsLeft: 999, // Permanent passive effects
    appliedAt: new Date().toISOString(),
    sourceId: effect.sourceId,
    sourceName: effect.sourceName,
    sourceType: effect.sourceType
  }));
}

/**
 * Filter users by social group membership
 * Checks if users' arkanaStats.id is in caster's social groups (Allies or Enemies)
 * Used by combat system to determine which nearby players should be affected by group-targeted powers
 *
 * @param casterGroups - Caster's User.groups JSON field (format: {"Allies": [arkanaId1, arkanaId2], "Enemies": [arkanaId3]})
 * @param users - Array of users with arkanaStats to filter
 * @param groupType - 'Allies' or 'Enemies'
 * @returns Filtered array containing only users whose arkanaStats.id is in the specified group
 *
 * @example
 * // Filter nearby users to only allies
 * const caster = { groups: {"Allies": [101, 102], "Enemies": [103]} };
 * const nearbyUsers = [user1, user2, user3]; // user1.arkanaStats.id=101, user2.arkanaStats.id=103
 * const allies = filterUsersByGroup(caster.groups, nearbyUsers, 'Allies'); // Returns [user1]
 */
export function filterUsersByGroup<T extends { arkanaStats: { id: number } | null }>(
  casterGroups: unknown,
  users: T[],
  groupType: 'Allies' | 'Enemies'
): T[] {
  // Safely parse groups JSON
  let groups: Record<string, number[]> = {};
  try {
    if (casterGroups && typeof casterGroups === 'object') {
      groups = casterGroups as Record<string, number[]>;
    }
  } catch (e) {
    console.warn('Failed to parse caster groups:', e);
    return [];
  }

  // Get arkana IDs for the specified group (default to empty array if group doesn't exist)
  const groupMembers = groups[groupType] || [];
  if (groupMembers.length === 0) return [];

  // Filter users whose arkanaStats.id is in the group
  return users.filter(user =>
    user.arkanaStats && groupMembers.includes(user.arkanaStats.id)
  );
}
