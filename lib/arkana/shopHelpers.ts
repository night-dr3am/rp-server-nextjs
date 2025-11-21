// Shop helper functions for Arkana XP Shop
import {
  Cybernetic,
  MagicSchool,
  CommonPower,
  ArchetypePower,
  Perk,
} from './types';
import {
  getAllCybernetics,
  getAllMagicSchools,
  getAllCommonPowers,
  getAllArchPowers,
  getAllPerks,
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

// Shop-specific power/perk interfaces
export interface ShopCommonPower extends CommonPower {
  owned: boolean;
  eligible: boolean;
  xpCost: number;
}

export interface ShopArchetypePower extends ArchetypePower {
  owned: boolean;
  eligible: boolean;
  xpCost: number;
}

export interface ShopPerk extends Perk {
  owned: boolean;
  eligible: boolean;
  xpCost: number;
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
 * Get available common powers for the shop, filtered by race
 * @param race Character's race
 * @param ownedPowerIds Array of already owned common power IDs
 * @returns Array of common powers with shop metadata
 */
export function getAvailableCommonPowers(
  race: string,
  ownedPowerIds: string[]
): ShopCommonPower[] {
  const allPowers = getAllCommonPowers();
  const ownedSet = new Set(ownedPowerIds);

  return allPowers.map(power => {
    // Check race eligibility
    const isEligible = !power.species || lc(power.species) === lc(race) || lc(power.species) === 'all';

    return {
      ...power,
      owned: ownedSet.has(power.id),
      eligible: isEligible,
      xpCost: power.cost,
    };
  });
}

/**
 * Get available archetype powers for the shop, filtered by race and archetype
 * @param race Character's race
 * @param archetype Character's archetype
 * @param ownedPowerIds Array of already owned archetype power IDs
 * @returns Array of archetype powers with shop metadata
 */
export function getAvailableArchetypePowers(
  race: string,
  archetype: string,
  ownedPowerIds: string[]
): ShopArchetypePower[] {
  const allPowers = getAllArchPowers();
  const ownedSet = new Set(ownedPowerIds);

  return allPowers.map(power => {
    // Check race and archetype eligibility
    const raceMatch = !power.species || lc(power.species) === lc(race) || lc(power.species) === 'all';
    const archMatch = !power.arch || lc(power.arch) === lc(archetype) || lc(power.arch) === 'all';
    const isEligible = raceMatch && archMatch;

    return {
      ...power,
      owned: ownedSet.has(power.id),
      eligible: isEligible,
      xpCost: power.cost,
    };
  });
}

/**
 * Get available perks for the shop, filtered by race and archetype
 * @param race Character's race
 * @param archetype Character's archetype
 * @param ownedPerkIds Array of already owned perk IDs
 * @returns Array of perks with shop metadata
 */
export function getAvailablePerks(
  race: string,
  archetype: string,
  ownedPerkIds: string[]
): ShopPerk[] {
  const allPerks = getAllPerks();
  const ownedSet = new Set(ownedPerkIds);

  return allPerks.map(perk => {
    // Check race and archetype eligibility (perks have optional filters)
    const raceMatch = !perk.species || lc(perk.species) === lc(race) || lc(perk.species) === 'all';
    const archMatch = !perk.arch || lc(perk.arch) === lc(archetype) || lc(perk.arch) === 'all';
    const isEligible = raceMatch && archMatch;

    return {
      ...perk,
      owned: ownedSet.has(perk.id),
      eligible: isEligible,
      xpCost: perk.cost,
    };
  });
}

/**
 * Get common power by ID
 */
export function getCommonPowerById(powerId: string): CommonPower | undefined {
  return getAllCommonPowers().find(p => p.id === powerId);
}

/**
 * Get archetype power by ID
 */
export function getArchetypePowerById(powerId: string): ArchetypePower | undefined {
  return getAllArchPowers().find(p => p.id === powerId);
}

/**
 * Get perk by ID
 */
export function getPerkById(perkId: string): Perk | undefined {
  return getAllPerks().find(p => p.id === perkId);
}

/**
 * Check if a character is eligible for a common power
 */
export function isEligibleForCommonPower(powerId: string, race: string): boolean {
  const power = getCommonPowerById(powerId);
  if (!power) return false;
  return !power.species || lc(power.species) === lc(race) || lc(power.species) === 'all';
}

/**
 * Check if a character is eligible for an archetype power
 */
export function isEligibleForArchetypePower(powerId: string, race: string, archetype: string): boolean {
  const power = getArchetypePowerById(powerId);
  if (!power) return false;
  const raceMatch = !power.species || lc(power.species) === lc(race) || lc(power.species) === 'all';
  const archMatch = !power.arch || lc(power.arch) === lc(archetype) || lc(power.arch) === 'all';
  return raceMatch && archMatch;
}

/**
 * Check if a character is eligible for a perk
 */
export function isEligibleForPerk(perkId: string, race: string, archetype: string): boolean {
  const perk = getPerkById(perkId);
  if (!perk) return false;
  const raceMatch = !perk.species || lc(perk.species) === lc(race) || lc(perk.species) === 'all';
  const archMatch = !perk.arch || lc(perk.arch) === lc(archetype) || lc(perk.arch) === 'all';
  return raceMatch && archMatch;
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
  itemType: 'cybernetic' | 'magic_weave' | 'magic_school' | 'common_power' | 'archetype_power' | 'perk',
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

  if (itemType === 'magic_school') {
    const school = getMagicSchoolById(itemId);
    if (!school) {
      return { valid: false, error: `Magic school not found: ${itemId}` };
    }
    // Check if character can use magic at all
    if (!canUseMagic(race, archetype)) {
      return { valid: false, error: `Your race/archetype cannot use magic` };
    }
    // Check school eligibility (species-restricted schools like Technomancy)
    if (school.species && lc(school.species) !== lc(archetype)) {
      return { valid: false, error: `${school.name} is restricted to ${school.species} archetype` };
    }
    if (school.cost !== xpCost) {
      return { valid: false, error: `Invalid XP cost for ${school.name}. Expected ${school.cost}, got ${xpCost}`, actualCost: school.cost };
    }
    return { valid: true, actualCost: school.cost };
  }

  if (itemType === 'common_power') {
    const power = getCommonPowerById(itemId);
    if (!power) {
      return { valid: false, error: `Common power not found: ${itemId}` };
    }
    if (!isEligibleForCommonPower(itemId, race)) {
      return { valid: false, error: `You are not eligible to purchase ${power.name}` };
    }
    if (power.cost !== xpCost) {
      return { valid: false, error: `Invalid XP cost for ${power.name}. Expected ${power.cost}, got ${xpCost}`, actualCost: power.cost };
    }
    return { valid: true, actualCost: power.cost };
  }

  if (itemType === 'archetype_power') {
    const power = getArchetypePowerById(itemId);
    if (!power) {
      return { valid: false, error: `Archetype power not found: ${itemId}` };
    }
    if (!isEligibleForArchetypePower(itemId, race, archetype)) {
      return { valid: false, error: `You are not eligible to purchase ${power.name}` };
    }
    if (power.cost !== xpCost) {
      return { valid: false, error: `Invalid XP cost for ${power.name}. Expected ${power.cost}, got ${xpCost}`, actualCost: power.cost };
    }
    return { valid: true, actualCost: power.cost };
  }

  if (itemType === 'perk') {
    const perk = getPerkById(itemId);
    if (!perk) {
      return { valid: false, error: `Perk not found: ${itemId}` };
    }
    if (!isEligibleForPerk(itemId, race, archetype)) {
      return { valid: false, error: `You are not eligible to purchase ${perk.name}` };
    }
    if (perk.cost !== xpCost) {
      return { valid: false, error: `Invalid XP cost for ${perk.name}. Expected ${perk.cost}, got ${xpCost}`, actualCost: perk.cost };
    }
    return { valid: true, actualCost: perk.cost };
  }

  return { valid: false, error: `Invalid item type: ${itemType}` };
}
