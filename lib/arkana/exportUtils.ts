// Export Utilities for Arkana Data
// Converts database data back to production JSON file format

import { loadArkanaData } from './unifiedDataLoader';

type ArkanaDataType = 'flaw' | 'commonPower' | 'archetypePower' | 'perk' | 'magicSchool' | 'magicWave' | 'cybernetic' | 'skill' | 'effect';

/**
 * Map data type to production JSON filename
 */
export function getProductionFilename(type: ArkanaDataType): string {
  const filenameMap: Record<ArkanaDataType, string> = {
    flaw: 'flaws3.json',
    commonPower: 'common_powers2.json',
    archetypePower: 'archetype_powers4.json',
    perk: 'perks2.json',
    magicSchool: 'magic_schools8.json', // Combined with magicWave
    magicWave: 'magic_schools8.json',   // Combined with magicSchool
    cybernetic: 'cybernetics2.json',
    skill: 'skills.json',
    effect: 'effects.json'
  };

  return filenameMap[type];
}

/**
 * Reconstruct original JSON structure (id becomes part of object)
 */
function reconstructOriginalStructure<T extends { id: string }>(items: T[]): Record<string, unknown>[] {
  return items.map(item => {
    // Create a clean copy with id as first field (for consistency)
    const { id, ...rest } = item;
    return { id, ...rest };
  });
}

/**
 * Export data for a specific type to JSON string
 */
export async function exportToJSON(type: ArkanaDataType): Promise<string> {
  // Special handling for magic: combine schools and weaves
  if (type === 'magicSchool' || type === 'magicWave') {
    return exportMagicToJSON();
  }

  // Load data from unified loader (DB or JSON)
  const data = await loadArkanaData<{ id: string }>(type);

  // Reconstruct original structure
  const exportData = reconstructOriginalStructure(data);

  // Pretty-print JSON with 2-space indentation
  return JSON.stringify(exportData, null, 2);
}

/**
 * Export magic data (schools + weaves combined)
 * Special case: Both types go into same file with schools first
 */
async function exportMagicToJSON(): Promise<string> {
  const [schools, weaves] = await Promise.all([
    loadArkanaData<{ id: string }>('magicSchool'),
    loadArkanaData<{ id: string }>('magicWave')
  ]);

  // Combine with schools first, then weaves
  const combined = [
    ...reconstructOriginalStructure(schools),
    ...reconstructOriginalStructure(weaves)
  ];

  return JSON.stringify(combined, null, 2);
}

/**
 * Export all types to their respective JSON files
 * Returns a map of filename → JSON content
 */
export async function exportAllToJSON(): Promise<Record<string, string>> {
  const types: ArkanaDataType[] = [
    'flaw',
    'commonPower',
    'archetypePower',
    'perk',
    'magicSchool', // Will export combined magic file
    'cybernetic',
    'skill',
    'effect'
  ];

  const result: Record<string, string> = {};

  for (const type of types) {
    const filename = getProductionFilename(type);

    // Skip if already exported (e.g., magic combined file)
    if (result[filename]) {
      continue;
    }

    const jsonContent = await exportToJSON(type);
    result[filename] = jsonContent;
  }

  return result;
}

/**
 * Get export statistics
 */
export async function getExportStats(type?: ArkanaDataType): Promise<{
  type: string;
  filename: string;
  itemCount: number;
  sizeBytes: number;
}[]> {
  const types: ArkanaDataType[] = type
    ? [type]
    : ['flaw', 'commonPower', 'archetypePower', 'perk', 'magicSchool', 'cybernetic', 'skill', 'effect'];

  const stats: Array<{
    type: string;
    filename: string;
    itemCount: number;
    sizeBytes: number;
  }> = [];

  const processedFiles = new Set<string>();

  for (const t of types) {
    const filename = getProductionFilename(t);

    // Skip if already processed (for combined magic file)
    if (processedFiles.has(filename)) {
      continue;
    }

    processedFiles.add(filename);

    const jsonContent = await exportToJSON(t);
    const parsed = JSON.parse(jsonContent);

    stats.push({
      type: t,
      filename,
      itemCount: Array.isArray(parsed) ? parsed.length : 0,
      sizeBytes: Buffer.byteLength(jsonContent, 'utf8')
    });
  }

  return stats;
}

/**
 * Validate JSON structure before export
 * Returns array of validation errors (empty if valid)
 */
export async function validateExportData(type: ArkanaDataType): Promise<string[]> {
  const errors: string[] = [];

  try {
    const data = await loadArkanaData<Record<string, unknown> & { id: string }>(type);

    if (!Array.isArray(data)) {
      errors.push('Data is not an array');
      return errors;
    }

    // Empty arrays are valid - just export an empty JSON array
    // No validation errors for empty data

    // Validate each item has required fields
    for (let i = 0; i < data.length; i++) {
      const item = data[i];

      if (!item.id) {
        errors.push(`Item at index ${i} missing required field: id`);
      }

      if (!item.name && type !== 'effect') {
        errors.push(`Item at index ${i} (${item.id}) missing recommended field: name`);
      }

      // Type-specific validations
      if (type === 'flaw' || type === 'commonPower' || type === 'archetypePower' || type === 'perk') {
        if (item.cost === undefined) {
          errors.push(`Item ${item.id} missing cost field`);
        }
      }

      if (type === 'skill') {
        if (!item.type) {
          errors.push(`Skill ${item.id} missing type field`);
        }
      }

      if (type === 'effect') {
        if (!item.category) {
          errors.push(`Effect ${item.id} missing category field`);
        }
      }
    }

    // Check for duplicate IDs
    const ids = data.map((item) => item.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      const duplicates = ids.filter((id: string, index: number) => ids.indexOf(id) !== index);
      errors.push(`Duplicate IDs found: ${[...new Set(duplicates)].join(', ')}`);
    }
  } catch (error) {
    errors.push(`Failed to validate: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return errors;
}
