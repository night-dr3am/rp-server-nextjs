// Client-safe utilities for Arkana character creation
// These functions are parameterized versions of dataLoader.ts functions
// that accept data as arguments instead of relying on module-level caches

import type {
  Flaw,
  CommonPower,
  Perk,
  ArchetypePower,
  Cybernetic,
  MagicSchool,
  CharacterModel
} from './types';

// Constants
export const CYBERNETIC_SLOT_COST = 1;

// Utility functions
function lc(s: string): string {
  return String(s || '').toLowerCase();
}

// Filtering functions (parameterized)
export function flawsForRace(race: string, arch: string, allFlaws: Flaw[]): Flaw[] {
  if (!race) return [];
  const r = lc(race);
  const a = arch ? lc(arch) : "";

  const humanSpeciesTypes: Record<string, string> = {
    "human (no powers)": "human_without_power",
    "arcanist": "arcanist",
    "synthral": "synthral",
    "psion": "psion"
  };

  if (r === "human") {
    const speciesTag = humanSpeciesTypes[a] || "human_without_power";
    return allFlaws.filter(flaw => {
      const tags = flaw.tags ? flaw.tags.map(lc) : [];
      return tags.indexOf("species:" + speciesTag) >= 0;
    });
  }

  return allFlaws.filter(flaw => {
    const tags = flaw.tags ? flaw.tags.map(lc) : [];
    if (r === "strigoi" && tags.indexOf("race:strigoi") >= 0) return true;
    if (r === "gaki" && tags.indexOf("race:gaki") >= 0) return true;
    if (tags.indexOf("race:" + r) >= 0) return true;
    if (a && (tags.indexOf("arch:" + a) >= 0 || tags.indexOf("spec:" + a) >= 0)) return true;
    return false;
  });
}

export function perksForRace(race: string, arch: string, allPerks: Perk[]): Perk[] {
  const r = lc(race || "");
  const a = lc(arch || "");
  return allPerks.filter(perk => {
    if (perk.species && lc(perk.species) !== r) return false;
    if (perk.arch && a && lc(perk.arch) !== a) return false;
    return true;
  });
}

export function commonPowersForRace(race: string, allCommonPowers: CommonPower[]): CommonPower[] {
  const r = lc(race || "");
  return allCommonPowers.filter(p => p.species && lc(p.species) === r);
}

export function archPowersForRaceArch(race: string, arch: string, allArchPowers: ArchetypePower[]): ArchetypePower[] {
  const r = lc(race || "");
  const a = lc(arch || "");
  return allArchPowers.filter(p => {
    if (p.species && lc(p.species) !== r) return false;
    if (p.arch && a && lc(p.arch) !== a) return false;
    return true;
  });
}

export function cyberneticsAll(allCybernetics: Cybernetic[]): Cybernetic[] {
  return allCybernetics;
}

export function canUseMagic(race: string, arch: string): boolean {
  if (lc(race) === "human" && lc(arch) === "human (no powers)") return false;
  if (lc(race) === "spliced") return false;
  return true;
}

export function groupMagicSchoolsBySection(arr: MagicSchool[], race: string, arch: string): Record<string, MagicSchool[]> {
  const isSynthral = lc(race) === "human" && lc(arch) === "synthral";
  const out: Record<string, MagicSchool[]> = {};

  arr.forEach(item => {
    const section = item.section || "Other";
    if (lc(section) === "technomancy" && !isSynthral) return;
    if (!out[section]) out[section] = [];
    out[section].push(item);
  });

  Object.keys(out).forEach(section => {
    out[section].sort((a, b) => {
      if (a.id.startsWith("school_")) return -1;
      if (b.id.startsWith("school_")) return 1;
      return 0;
    });
  });

  return out;
}

export function magicSchoolsAllGrouped(race: string, arch: string, allMagicSchools: MagicSchool[]): Record<string, MagicSchool[]> {
  return groupMagicSchoolsBySection(allMagicSchools, race, arch);
}

export function groupCyberneticsBySection(arr: Cybernetic[]): Record<string, Cybernetic[]> {
  const sectionLabels = [
    "Sensory Mods",
    "Combat/Utility Mods",
    "Augmented Strength/Durability",
    "Street-Level Popular Mods",
    "Stealth/Infiltration - Hacking",
    "Defensive/Countermeasures - Hacking",
    "Breaching/Intrusion Protocols - Hacking"
  ];

  const out: Record<string, Cybernetic[]> = {};
  sectionLabels.forEach(s => out[s] = []);

  arr.forEach(item => {
    const sec = item.section || "";
    if (out[sec]) out[sec].push(item);
  });

  return out;
}

// Power Point calculation functions
export function powerPointsSpentTotal(
  model: CharacterModel,
  allCommonPowers: CommonPower[],
  allArchPowers: ArchetypePower[],
  allPerks: Perk[],
  allCybernetics: Cybernetic[],
  allMagicSchools: MagicSchool[]
): number {
  let spentPowerPoints = 0;

  // Common Powers
  Array.from(model.commonPowers || []).forEach(id => {
    const found = allCommonPowers.find(x => x.id === id);
    if (found && typeof found.cost !== "undefined") spentPowerPoints += found.cost;
    else if (found) spentPowerPoints += 1;
  });

  // Archetype Powers
  Array.from(model.archetypePowers || []).forEach(id => {
    const found = allArchPowers.find(x => x.id === id);
    if (found && typeof found.cost !== "undefined") spentPowerPoints += found.cost;
    else if (found) spentPowerPoints += 1;
  });

  // Perks
  Array.from(model.perks || []).forEach(id => {
    const found = allPerks.find(x => x.id === id);
    if (found && typeof found.cost !== "undefined") spentPowerPoints += found.cost;
    else if (found) spentPowerPoints += 1;
  });

  // Cybernetic Augments
  Array.from(model.cyberneticAugments || []).forEach(id => {
    const found = allCybernetics.find(x => x.id === id);
    if (found && typeof found.cost !== "undefined") spentPowerPoints += found.cost;
    else if (found) spentPowerPoints += 1;
  });

  // Magic Schools
  const spentMagicSchools = Array.from(model.magicSchools || []).map(id => {
    if (id === model.freeMagicSchool || id === getTechnomancySchoolId(allMagicSchools)) return 0;
    const found = allMagicSchools.find(x => x.id === id);
    if (found && typeof found.cost !== "undefined") return found.cost;
    if (found) return 1;
    return 0;
  }).reduce((a, b) => a + b, 0);

  // Magic Weaves
  const spentMagicWeaves = Array.from(model.magicWeaves || []).map(id => {
    if (id === model.freeMagicWeave || id === model.synthralFreeWeave) return 0;
    const found = allMagicSchools.find(x => x.id === id);
    if (found && typeof found.cost !== "undefined") return found.cost;
    if (found) return 1;
    return 0;
  }).reduce((a, b) => a + b, 0);

  const cyberSlotCost = (model.cyberSlots || 0) * CYBERNETIC_SLOT_COST;

  return spentPowerPoints + spentMagicSchools + spentMagicWeaves + cyberSlotCost;
}

export function powerPointsTotal(model: CharacterModel, allFlaws: Flaw[]): number {
  // Base power points (15) + bonus from flaws
  const total = 15 + Array.from(model.flaws).reduce((s, fid) => {
    const f = allFlaws.find(x => x.id === fid);
    return s + (f ? f.cost : 0);
  }, 0);
  return total;
}

// Magic helper functions
export function getTechnomancySchoolId(allMagicSchools: MagicSchool[]): string {
  for (const sch of allMagicSchools) {
    if (lc(sch.section) === "technomancy" && sch.id.startsWith("school_")) return sch.id;
  }
  return "";
}

export function getSchoolWeaves(schoolId: string, allMagicSchools: MagicSchool[]): MagicSchool[] {
  const schoolEntry = allMagicSchools.find(x => x.id === schoolId);
  if (!schoolEntry) return [];
  const section = schoolEntry.section;
  return allMagicSchools.filter(x => {
    return x.section === section && !x.id.startsWith("school_");
  });
}

export function getSchoolIdsForArcanist(race: string, arch: string, allMagicSchools: MagicSchool[]): string[] {
  const grouped = magicSchoolsAllGrouped(race, arch, allMagicSchools);
  const ids: string[] = [];
  Object.keys(grouped).forEach(section => {
    if (grouped[section].length) {
      const school = grouped[section][0];
      if (school.id.startsWith("school_")) ids.push(school.id);
    }
  });
  return ids;
}

export function getSchoolName(id: string, allMagicSchools: MagicSchool[]): string {
  const sch = allMagicSchools.find(x => x.id === id);
  return sch ? sch.name : id;
}

export function getWeaveName(id: string, allMagicSchools: MagicSchool[]): string {
  const weave = allMagicSchools.find(x => x.id === id);
  return weave ? weave.name : id;
}
