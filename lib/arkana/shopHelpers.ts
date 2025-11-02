// Shop helper functions for Arkana XP Shop
import {
  Cybernetic,
  MagicSchool,
} from './types';
import {
  getAllCybernetics,
  getAllMagicSchools,
  canUseMagic,
  groupCyberneticsBySection as groupCyberneticsOriginal,
  groupMagicSchoolsBySection,
} from './dataLoader';

// Helper to lowercase strings for comparisons
function lc(s: string): string {
  return String(s || '').toLowerCase();
}

// Shop-specific item interfaces
export interface ShopCybernetic extends Cybernetic {
  owned: boolean;
  eligible: boolean;
  xpCost: number;
}

export interface ShopMagicWeave extends MagicSchool {
  owned: boolean;
  eligible: boolean;
  xpCost: number;
}

export interface ShopMagicSchool {
  schoolId: string;
  schoolName: string;
  schoolDesc: string;
  schoolCost: number;
  section: string;
  species?: string;
  owned: boolean;
  weaves: ShopMagicWeave[];
}

/**
 * Get available cybernetics for the shop, marking owned items
 * @param ownedCyberneticIds Array of already owned cybernetic IDs
 * @returns Array of cybernetics with shop metadata
 */
export function getAvailableCybernetics(ownedCyberneticIds: string[]): ShopCybernetic[] {
  const allCybernetics = getAllCybernetics();
  const ownedSet = new Set(ownedCyberneticIds);

  return allCybernetics.map(cyber => ({
    ...cyber,
    owned: ownedSet.has(cyber.id),
    eligible: true, // All cybernetics are available to all characters
    xpCost: cyber.cost, // 1 XP = 1 Power Point
  }));
}

/**
 * Get available magic (schools and weaves) for the shop, filtered by race/archetype
 * @param race Character's race
 * @param archetype Character's archetype
 * @param ownedSchoolIds Array of already owned school IDs
 * @param ownedWeaveIds Array of already owned weave IDs
 * @returns Array of magic schools with nested weaves
 */
export function getAvailableMagic(
  race: string,
  archetype: string,
  ownedSchoolIds: string[],
  ownedWeaveIds: string[]
): ShopMagicSchool[] {
  // Check if character can use magic at all
  if (!canUseMagic(race, archetype)) {
    return [];
  }

  const allMagicSchools = getAllMagicSchools();
  const ownedSchoolsSet = new Set(ownedSchoolIds);
  const ownedWeavesSet = new Set(ownedWeaveIds);

  // Group by section and filter by race/archetype
  const grouped = groupMagicSchoolsBySection(allMagicSchools, race, archetype);

  const shopSchools: ShopMagicSchool[] = [];

  Object.entries(grouped).forEach(([section, items]) => {
    // Find the school entry (ID starts with "school_")
    const schoolEntry = items.find(item => item.id.startsWith('school_'));
    if (!schoolEntry) return;

    // Get all weaves for this school (non-school entries in this section)
    const weaves = items.filter(item => !item.id.startsWith('school_'));

    // Check race restriction (for Technomancy and similar)
    const isSynthral = lc(race) === 'human' && lc(archetype) === 'synthral';
    const schoolSpecies = schoolEntry.species ? lc(schoolEntry.species) : '';

    // Skip if school has species restriction that doesn't match
    if (schoolSpecies && schoolSpecies !== '') {
      if (schoolSpecies === 'synthral' && !isSynthral) {
        return; // Skip Technomancy for non-Synthrals
      }
    }

    shopSchools.push({
      schoolId: schoolEntry.id,
      schoolName: schoolEntry.name,
      schoolDesc: schoolEntry.desc,
      schoolCost: schoolEntry.cost,
      section: section,
      species: schoolEntry.species,
      owned: ownedSchoolsSet.has(schoolEntry.id),
      weaves: weaves.map(weave => ({
        ...weave,
        owned: ownedWeavesSet.has(weave.id),
        eligible: true, // Eligible if school is available
        xpCost: weave.cost,
      })),
    });
  });

  return shopSchools;
}

/**
 * Group cybernetics by section for display in the shop
 * @param availableCybernetics Array of shop cybernetics
 * @returns Cybernetics grouped by section
 */
export function groupCyberneticsForShop(availableCybernetics: ShopCybernetic[]): Record<string, ShopCybernetic[]> {
  // Reuse the existing grouping logic
  const grouped = groupCyberneticsOriginal(availableCybernetics);
  return grouped as Record<string, ShopCybernetic[]>;
}

/**
 * Calculate total XP cost for selected items
 * @param selectedIds Array of item IDs
 * @param availableItems Array of available shop items (cybernetics or weaves)
 * @returns Total XP cost
 */
export function calculateTotalCost(
  selectedIds: string[],
  availableItems: Array<{ id: string; xpCost: number; owned: boolean }>
): number {
  const selectedSet = new Set(selectedIds);

  return availableItems
    .filter(item => selectedSet.has(item.id) && !item.owned)
    .reduce((total, item) => total + item.xpCost, 0);
}

/**
 * Get cybernetic by ID
 * @param cyberneticId Cybernetic ID
 * @returns Cybernetic or undefined
 */
export function getCyberneticById(cyberneticId: string): Cybernetic | undefined {
  return getAllCybernetics().find(cyber => cyber.id === cyberneticId);
}

/**
 * Get magic weave by ID
 * @param weaveId Weave ID
 * @returns Magic weave or undefined
 */
export function getMagicWeaveById(weaveId: string): MagicSchool | undefined {
  return getAllMagicSchools().find(magic => magic.id === weaveId && !magic.id.startsWith('school_'));
}

/**
 * Get magic school by ID
 * @param schoolId School ID
 * @returns Magic school or undefined
 */
export function getMagicSchoolById(schoolId: string): MagicSchool | undefined {
  return getAllMagicSchools().find(magic => magic.id === schoolId);
}

/**
 * Get the school ID for a given weave
 * @param weaveId Weave ID
 * @returns School ID or undefined
 */
export function getSchoolIdForWeave(weaveId: string): string | undefined {
  const weave = getMagicWeaveById(weaveId);
  if (!weave) return undefined;

  // Find the school with matching section
  const allMagic = getAllMagicSchools();
  const school = allMagic.find(
    magic => magic.id.startsWith('school_') && magic.section === weave.section
  );

  return school?.id;
}

/**
 * Check if a character is eligible to purchase a specific magic weave
 * @param weaveId Weave ID
 * @param race Character's race
 * @param archetype Character's archetype
 * @returns true if eligible, false otherwise
 */
export function isEligibleForMagicWeave(weaveId: string, race: string, archetype: string): boolean {
  if (!canUseMagic(race, archetype)) {
    return false;
  }

  const weave = getMagicWeaveById(weaveId);
  if (!weave) return false;

  // Check species restriction
  const isSynthral = lc(race) === 'human' && lc(archetype) === 'synthral';
  const weaveSpecies = weave.species ? lc(weave.species) : '';

  if (weaveSpecies && weaveSpecies !== '') {
    if (weaveSpecies === 'synthral' && !isSynthral) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a purchase request
 * @param itemType Type of item being purchased
 * @param itemId Item ID
 * @param xpCost XP cost claimed by client
 * @param race Character's race
 * @param archetype Character's archetype
 * @returns Validation result with error message if invalid
 */
export function validatePurchaseItem(
  itemType: 'cybernetic' | 'magic_weave',
  itemId: string,
  xpCost: number,
  race: string,
  archetype: string
): { valid: boolean; error?: string; actualCost?: number } {
  if (itemType === 'cybernetic') {
    const cyber = getCyberneticById(itemId);
    if (!cyber) {
      return { valid: false, error: `Cybernetic not found: ${itemId}` };
    }
    if (cyber.cost !== xpCost) {
      return { valid: false, error: `Invalid XP cost for ${cyber.name}. Expected ${cyber.cost}, got ${xpCost}`, actualCost: cyber.cost };
    }
    return { valid: true, actualCost: cyber.cost };
  }

  if (itemType === 'magic_weave') {
    const weave = getMagicWeaveById(itemId);
    if (!weave) {
      return { valid: false, error: `Magic weave not found: ${itemId}` };
    }
    if (!isEligibleForMagicWeave(itemId, race, archetype)) {
      return { valid: false, error: `You are not eligible to purchase ${weave.name}` };
    }
    if (weave.cost !== xpCost) {
      return { valid: false, error: `Invalid XP cost for ${weave.name}. Expected ${weave.cost}, got ${xpCost}`, actualCost: weave.cost };
    }
    return { valid: true, actualCost: weave.cost };
  }

  return { valid: false, error: `Invalid item type: ${itemType}` };
}
