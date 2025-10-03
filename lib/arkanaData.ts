// Arkana character creation data - now using JSON data sources
// Import for use in legacy functions
import { RACES, type RaceName } from './arkana/types';

// Re-export types and functions from the new arkana module
export {
  RACES,
  type RaceName,
  STAT_NAMES,
  STAT_DESCRIPTIONS,
  calculateStatModifier,
  type Flaw,
  type CommonPower,
  type Perk,
  type ArchetypePower,
  type Cybernetic,
  type MagicSchool,
  type CharacterModel
} from './arkana/types';

export {
  loadAllData,
  flawsForRace,
  perksForRace,
  commonPowersForRace,
  archPowersForRaceArch,
  cyberneticsAll,
  canUseMagic,
  magicSchoolsAllGrouped,
  groupCyberneticsBySection,
  powerPointsSpentTotal,
  powerPointsTotal,
  getTechnomancySchoolId,
  getSchoolWeaves,
  getSchoolIdsForArcanist,
  getSchoolName,
  getWeaveName,
  getAllFlaws,
  getAllCommonPowers,
  getAllPerks,
  getAllArchPowers,
  getAllCybernetics,
  getAllMagicSchools
} from './arkana/dataLoader';

// Legacy compatibility functions
export function getArchetypesForRace(race: string): readonly string[] {
  return RACES[race as RaceName] || [];
}