// Data loading and filtering functions for Arkana character creation
import {
  Flaw,
  CommonPower,
  Perk,
  ArchetypePower,
  Cybernetic,
  MagicSchool,
  CharacterModel
} from './types';

// Data caches
let flaws: Flaw[] = [];
let commonPowers: CommonPower[] = [];
let perks: Perk[] = [];
let archPowers: ArchetypePower[] = [];
let cybernetics: Cybernetic[] = [];
let magicSchools: MagicSchool[] = [];

// Load all data function
export async function loadAllData(): Promise<void> {
  try {
    const [flawsData, commonData, perksData, archData, cyberData, magicData] = await Promise.all([
      import('./flaws3.json').then(m => m.default),
      import('./common_powers2.json').then(m => m.default),
      import('./perks2.json').then(m => m.default),
      import('./archetype_powers4.json').then(m => m.default),
      import('./cybernetics2.json').then(m => m.default),
      import('./magic_schools8.json').then(m => m.default)
    ]);

    flaws = flawsData;
    commonPowers = commonData;
    perks = perksData;
    archPowers = archData;
    cybernetics = cyberData;
    magicSchools = magicData;
  } catch (error) {
    console.error('Failed to load Arkana data:', error);
    throw error;
  }
}

// Utility functions
function lc(s: string): string {
  return String(s || '').toLowerCase();
}

// Filtering functions
export function flawsForRace(race: string, arch: string): Flaw[] {
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
    return flaws.filter(flaw => {
      const tags = flaw.tags ? flaw.tags.map(lc) : [];
      return tags.indexOf("species:" + speciesTag) >= 0;
    });
  }

  return flaws.filter(flaw => {
    const tags = flaw.tags ? flaw.tags.map(lc) : [];
    if (r === "strigoi" && tags.indexOf("race:strigoi") >= 0) return true;
    if (r === "gaki" && tags.indexOf("race:gaki") >= 0) return true;
    if (tags.indexOf("race:" + r) >= 0) return true;
    if (a && (tags.indexOf("arch:" + a) >= 0 || tags.indexOf("spec:" + a) >= 0)) return true;
    return false;
  });
}

export function perksForRace(race: string, arch: string): Perk[] {
  const r = lc(race || "");
  const a = lc(arch || "");
  return perks.filter(perk => {
    if (perk.species && lc(perk.species) !== r) return false;
    if (perk.arch && a && lc(perk.arch) !== a) return false;
    return true;
  });
}

export function commonPowersForRace(race: string): CommonPower[] {
  const r = lc(race || "");
  return commonPowers.filter(p => p.species && lc(p.species) === r);
}

export function archPowersForRaceArch(race: string, arch: string): ArchetypePower[] {
  const r = lc(race || "");
  const a = lc(arch || "");
  return archPowers.filter(p => {
    if (p.species && lc(p.species) !== r) return false;
    if (p.arch && a && lc(p.arch) !== a) return false;
    return true;
  });
}

export function cyberneticsAll(): Cybernetic[] {
  return cybernetics;
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

export function magicSchoolsAllGrouped(race: string, arch: string): Record<string, MagicSchool[]> {
  return groupMagicSchoolsBySection(magicSchools, race, arch);
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

// Point calculation functions
export function pointsSpentTotal(model: CharacterModel): number {
  const allPicks = Array.from(model.picks);
  const spentPicks = allPicks.map(pid => {
    if (pid === model.freeMagicWeave || pid === model.synthralFreeWeave) return 0;

    const arrs = [commonPowers, perks, archPowers, cybernetics];
    for (const arr of arrs) {
      const found = arr.find(x => x.id === pid);
      if (found && typeof found.cost !== "undefined") return found.cost;
      if (found) return 1;
    }
    return 0;
  }).reduce((a, b) => a + b, 0);

  const spentMagic = Array.from(model.magicSchools).map(id => {
    if (id === model.freeMagicSchool || id === getTechnomancySchoolId()) return 0;
    const found = magicSchools.find(x => x.id === id);
    if (found && typeof found.cost !== "undefined") return found.cost;
    if (found) return 1;
    return 0;
  }).reduce((a, b) => a + b, 0);

  const cyberSlotCost = (model.cyberSlots || 0) * 2;
  return spentPicks + spentMagic + cyberSlotCost;
}

export function pointsTotal(model: CharacterModel): number {
  const total = 15 + Array.from(model.flaws).reduce((s, fid) => {
    const f = flaws.find(x => x.id === fid);
    return s + (f ? f.cost : 0);
  }, 0);
  return total;
}

// Magic helper functions
export function getTechnomancySchoolId(): string {
  for (const sch of magicSchools) {
    if (lc(sch.section) === "technomancy" && sch.id.startsWith("school_")) return sch.id;
  }
  return "";
}

export function getSchoolWeaves(schoolId: string): MagicSchool[] {
  const schoolEntry = magicSchools.find(x => x.id === schoolId);
  if (!schoolEntry) return [];
  const section = schoolEntry.section;
  return magicSchools.filter(x => {
    return x.section === section && !x.id.startsWith("school_");
  });
}

export function getSchoolIdsForArcanist(race: string, arch: string): string[] {
  const grouped = magicSchoolsAllGrouped(race, arch);
  const ids: string[] = [];
  Object.keys(grouped).forEach(section => {
    if (grouped[section].length) {
      const school = grouped[section][0];
      if (school.id.startsWith("school_")) ids.push(school.id);
    }
  });
  return ids;
}

export function getSchoolName(id: string): string {
  const sch = magicSchools.find(x => x.id === id);
  return sch ? sch.name : id;
}

export function getWeaveName(id: string): string {
  const weave = magicSchools.find(x => x.id === id);
  return weave ? weave.name : id;
}

// Get data functions
export function getAllFlaws(): Flaw[] { return flaws; }
export function getAllCommonPowers(): CommonPower[] { return commonPowers; }
export function getAllPerks(): Perk[] { return perks; }
export function getAllArchPowers(): ArchetypePower[] { return archPowers; }
export function getAllCybernetics(): Cybernetic[] { return cybernetics; }
export function getAllMagicSchools(): MagicSchool[] { return magicSchools; }