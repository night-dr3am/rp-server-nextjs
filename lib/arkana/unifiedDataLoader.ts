// Unified Data Loader for Arkana
// Loads data from database first, falls back to JSON files if database is empty
// Implements caching for performance optimization

import { prisma } from '@/lib/prisma';
import {
  Flaw,
  CommonPower,
  Perk,
  ArchetypePower,
  Cybernetic,
  MagicSchool,
  EffectDefinition,
  Skill
} from './types';

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Type definitions for the cache
interface CacheEntry<T> {
  data: T[];
  timestamp: number;
}

export type ArkanaDataType = 'flaw' | 'commonPower' | 'archetypePower' | 'perk' | 'magicSchool' | 'magicWave' | 'cybernetic' | 'skill' | 'effect';

// In-memory cache
const dataCache: Map<ArkanaDataType, CacheEntry<unknown>> = new Map();

// Determine if running in test mode
function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Check if data exists in database for a given type
 */
async function hasDataInDatabase(type: ArkanaDataType): Promise<boolean> {
  try {
    const count = await prisma.arkanaData.count({
      where: { arkanaDataType: type }
    });
    return count > 0;
  } catch (error) {
    console.error(`Error checking database for type ${type}:`, error);
    return false;
  }
}

/**
 * Load data from database
 */
async function loadFromDatabase<T>(type: ArkanaDataType): Promise<T[]> {
  try {
    const records = await prisma.arkanaData.findMany({
      where: { arkanaDataType: type },
      orderBy: { id: 'asc' }
    });

    // Reconstruct objects with id field (id is separated in database)
    return records.map(record => ({
      id: record.id,
      ...(record.jsonData as Record<string, unknown>)
    })) as T[];
  } catch (error) {
    console.error(`Error loading from database for type ${type}:`, error);
    throw error;
  }
}

/**
 * Load data from JSON files (fallback)
 */
async function loadFromJSON<T>(type: ArkanaDataType): Promise<T[]> {
  try {
    const testMode = isTestMode();
    const basePath = testMode ? './tests/' : './';
    const fileSuffix = testMode ? '.test.json' : '';

    let fileModule: { default: unknown };

    switch (type) {
      case 'flaw':
        fileModule = await import(`${basePath}flaws${testMode ? '' : '3'}${fileSuffix}`);
        break;
      case 'commonPower':
        fileModule = await import(`${basePath}common_powers${testMode ? '' : '2'}${fileSuffix}`);
        break;
      case 'archetypePower':
        fileModule = await import(`${basePath}archetype_powers${testMode ? '' : '4'}${fileSuffix}`);
        break;
      case 'perk':
        fileModule = await import(`${basePath}perks${testMode ? '' : '2'}${fileSuffix}`);
        break;
      case 'magicSchool':
      case 'magicWave':
        // Both school and wave come from same file
        fileModule = await import(`${basePath}magic_schools${testMode ? '' : '8'}${fileSuffix}`);
        // Filter by ID pattern: schools start with "school_", weaves don't
        const allMagic = fileModule.default as MagicSchool[];
        if (type === 'magicSchool') {
          return allMagic.filter(item => item.id.startsWith('school_')) as T[];
        } else {
          return allMagic.filter(item => !item.id.startsWith('school_')) as T[];
        }
      case 'cybernetic':
        fileModule = await import(`${basePath}cybernetics${testMode ? '' : '2'}${fileSuffix}`);
        break;
      case 'skill':
        fileModule = await import(`${basePath}skills${fileSuffix}`);
        break;
      case 'effect':
        fileModule = await import(`${basePath}effects${fileSuffix}`);
        break;
      default:
        throw new Error(`Unknown data type: ${type}`);
    }

    return fileModule.default as T[];
  } catch (error) {
    console.error(`Error loading from JSON for type ${type}:`, error);
    throw error;
  }
}

/**
 * Check if cache is valid (exists and not expired)
 */
function isCacheValid(type: ArkanaDataType): boolean {
  const cached = dataCache.get(type);
  if (!cached) return false;

  const age = Date.now() - cached.timestamp;
  return age < CACHE_TTL_MS;
}

/**
 * Get data from cache
 */
function getFromCache<T>(type: ArkanaDataType): T[] | null {
  if (!isCacheValid(type)) return null;

  const cached = dataCache.get(type);
  return cached ? cached.data as T[] : null;
}

/**
 * Save data to cache
 */
function saveToCache<T>(type: ArkanaDataType, data: T[]): void {
  dataCache.set(type, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Main unified data loader
 * 1. Check cache
 * 2. If not cached, check database
 * 3. If database is empty, load from JSON
 * 4. Cache the result
 * 5. Return data
 */
export async function loadArkanaData<T>(type: ArkanaDataType): Promise<T[]> {
  // Check cache first
  const cached = getFromCache<T>(type);
  if (cached) {
    return cached;
  }

  // Check if data exists in database
  const hasDB = await hasDataInDatabase(type);

  let data: T[];

  if (hasDB) {
    // Load from database
    data = await loadFromDatabase<T>(type);
    console.log(`[UnifiedLoader] Loaded ${data.length} items of type "${type}" from database`);
  } else {
    // Fallback to JSON
    data = await loadFromJSON<T>(type);
    console.log(`[UnifiedLoader] Loaded ${data.length} items of type "${type}" from JSON (database empty)`);
  }

  // Cache the result
  saveToCache<T>(type, data);

  return data;
}

/**
 * Invalidate cache for a specific type or all types
 */
export function invalidateCache(type?: ArkanaDataType): void {
  if (type) {
    dataCache.delete(type);
    console.log(`[UnifiedLoader] Cache invalidated for type "${type}"`);
  } else {
    dataCache.clear();
    console.log(`[UnifiedLoader] All cache cleared`);
  }
}

/**
 * Get single item by ID from a specific type
 */
export async function getArkanaDataById<T extends { id: string }>(type: ArkanaDataType, id: string): Promise<T | null> {
  const data = await loadArkanaData<T>(type);
  const item = data.find((item: T) => item.id === id);
  return item || null;
}

/**
 * Check if database has any data across all types
 */
export async function isDatabasePopulated(): Promise<boolean> {
  try {
    const count = await prisma.arkanaData.count();
    return count > 0;
  } catch (error) {
    console.error('Error checking if database is populated:', error);
    return false;
  }
}

/**
 * Get data source information for debugging/admin UI
 */
export async function getDataSourceInfo(): Promise<{
  type: ArkanaDataType;
  source: 'database' | 'json';
  count: number;
  cached: boolean;
}[]> {
  const types: ArkanaDataType[] = ['flaw', 'commonPower', 'archetypePower', 'perk', 'magicSchool', 'magicWave', 'cybernetic', 'skill', 'effect'];

  const info = await Promise.all(
    types.map(async (type) => {
      const hasDB = await hasDataInDatabase(type);
      const cached = isCacheValid(type);
      const data = await loadArkanaData(type);

      return {
        type,
        source: hasDB ? 'database' as const : 'json' as const,
        count: data.length,
        cached
      };
    })
  );

  return info;
}

// Type-specific loader functions for convenience and type safety
export async function loadFlaws(): Promise<Flaw[]> {
  return loadArkanaData<Flaw>('flaw');
}

export async function loadCommonPowers(): Promise<CommonPower[]> {
  return loadArkanaData<CommonPower>('commonPower');
}

export async function loadArchetypePowers(): Promise<ArchetypePower[]> {
  return loadArkanaData<ArchetypePower>('archetypePower');
}

export async function loadPerks(): Promise<Perk[]> {
  return loadArkanaData<Perk>('perk');
}

export async function loadMagicSchools(): Promise<MagicSchool[]> {
  return loadArkanaData<MagicSchool>('magicSchool');
}

export async function loadMagicWeaves(): Promise<MagicSchool[]> {
  return loadArkanaData<MagicSchool>('magicWave');
}

export async function loadCybernetics(): Promise<Cybernetic[]> {
  return loadArkanaData<Cybernetic>('cybernetic');
}

export async function loadSkills(): Promise<Skill[]> {
  return loadArkanaData<Skill>('skill');
}

export async function loadEffects(): Promise<EffectDefinition[]> {
  return loadArkanaData<EffectDefinition>('effect');
}

/**
 * Load all magic data (schools + weaves combined, matching legacy behavior)
 */
export async function loadAllMagic(): Promise<MagicSchool[]> {
  const [schools, weaves] = await Promise.all([
    loadMagicSchools(),
    loadMagicWeaves()
  ]);
  return [...schools, ...weaves];
}
