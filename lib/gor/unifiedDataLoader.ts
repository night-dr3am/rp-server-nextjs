// Unified Data Loader for Gor
// Loads data from database first, falls back to JSON files if database is empty
// Implements caching for performance optimization

import { prisma } from '@/lib/prisma';
import { EffectData, AbilityData } from './types';

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Type definitions for the cache
interface CacheEntry<T> {
  data: T[];
  timestamp: number;
}

export type GorDataType = 'effect' | 'ability';

// In-memory cache
const dataCache: Map<GorDataType, CacheEntry<unknown>> = new Map();

// Determine if running in test mode
function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Check if data exists in database for a given type
 */
async function hasDataInDatabase(type: GorDataType): Promise<boolean> {
  try {
    // Check if GoreanData table exists and has data
    // This will be enabled when GoreanData model is added to Prisma
    const count = await prisma.goreanData.count({
      where: { type }
    });
    return count > 0;
  } catch {
    // Table doesn't exist yet or other error - fall back to JSON
    return false;
  }
}

/**
 * Load data from database
 */
async function loadFromDatabase<T>(type: GorDataType): Promise<T[]> {
  try {
    const records = await prisma.goreanData.findMany({
      where: { type },
      orderBy: { id: 'asc' }
    });

    // Reconstruct objects with id field
    return records.map((record, index) => ({
      id: record.id,
      orderNumber: index,
      ...(record.jsonData as Record<string, unknown>)
    })) as T[];
  } catch (error) {
    console.error(`[GorLoader] Error loading from database for type ${type}:`, error);
    throw error;
  }
}

/**
 * Auto-assign orderNumber to items that don't have it
 */
function assignOrderNumbers<T>(items: T[]): T[] {
  return items.map((item, index) => {
    const itemWithOrder = item as T & { orderNumber?: number | null };
    return {
      ...item,
      orderNumber: (itemWithOrder.orderNumber !== undefined && itemWithOrder.orderNumber !== null)
        ? itemWithOrder.orderNumber
        : index
    };
  });
}

/**
 * Load data from JSON files (fallback)
 */
async function loadFromJSON<T>(type: GorDataType): Promise<T[]> {
  try {
    const testMode = isTestMode();
    const basePath = testMode ? './tests/' : './';
    const fileSuffix = testMode ? '.test.json' : '.json';

    let fileModule: { default: unknown };

    switch (type) {
      case 'effect':
        fileModule = await import(`${basePath}effects${fileSuffix}`);
        break;
      case 'ability':
        fileModule = await import(`${basePath}abilities${fileSuffix}`);
        break;
      default:
        throw new Error(`Unknown Gor data type: ${type}`);
    }

    // Auto-assign orderNumbers to loaded data
    const data = fileModule.default as Record<string, unknown>[];
    return assignOrderNumbers(data) as T[];
  } catch (error) {
    console.error(`[GorLoader] Error loading from JSON for type ${type}:`, error);
    throw error;
  }
}

/**
 * Check if cache is valid (exists and not expired)
 */
function isCacheValid(type: GorDataType): boolean {
  const cached = dataCache.get(type);
  if (!cached) return false;

  const age = Date.now() - cached.timestamp;
  return age < CACHE_TTL_MS;
}

/**
 * Get data from cache
 */
function getFromCache<T>(type: GorDataType): T[] | null {
  if (!isCacheValid(type)) return null;

  const cached = dataCache.get(type);
  return cached ? cached.data as T[] : null;
}

/**
 * Save data to cache
 */
function saveToCache<T>(type: GorDataType, data: T[]): void {
  dataCache.set(type, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Main unified data loader for Gor
 * 1. Check cache
 * 2. If not cached, check database
 * 3. If database is empty, load from JSON
 * 4. Cache the result
 * 5. Return data
 */
export async function loadGorData<T>(type: GorDataType): Promise<T[]> {
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
    console.log(`[GorLoader] Loaded ${data.length} items of type "${type}" from database`);
  } else {
    // Fallback to JSON
    data = await loadFromJSON<T>(type);
    console.log(`[GorLoader] Loaded ${data.length} items of type "${type}" from JSON`);
  }

  // Cache the result
  saveToCache<T>(type, data);

  return data;
}

/**
 * Invalidate cache for a specific type or all types
 */
export function invalidateGorCache(type?: GorDataType): void {
  if (type) {
    dataCache.delete(type);
    console.log(`[GorLoader] Cache invalidated for type "${type}"`);
  } else {
    dataCache.clear();
    console.log(`[GorLoader] All cache cleared`);
  }
}

/**
 * Get single item by ID from a specific type
 */
export async function getGorDataById<T extends { id: string }>(
  type: GorDataType,
  id: string
): Promise<T | null> {
  const data = await loadGorData<T>(type);
  const item = data.find((item: T) => item.id === id);
  return item || null;
}

/**
 * Check if database has any Gor data across all types
 */
export async function isGorDatabasePopulated(): Promise<boolean> {
  try {
    const count = await prisma.goreanData.count();
    return count > 0;
  } catch {
    // Table doesn't exist yet
    return false;
  }
}

/**
 * Get data source information for debugging/admin UI
 */
export async function getGorDataSourceInfo(): Promise<{
  type: GorDataType;
  source: 'database' | 'json';
  count: number;
  cached: boolean;
}[]> {
  const types: GorDataType[] = ['effect', 'ability'];

  const info = await Promise.all(
    types.map(async (type) => {
      const hasDB = await hasDataInDatabase(type);
      const cached = isCacheValid(type);
      const data = await loadGorData(type);

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

// ============================================================================
// Type-specific loader functions for convenience and type safety
// ============================================================================

/**
 * Load all Gor effects
 */
export async function loadEffects(): Promise<EffectData[]> {
  return loadGorData<EffectData>('effect');
}

/**
 * Load all Gor abilities
 */
export async function loadAbilities(): Promise<AbilityData[]> {
  return loadGorData<AbilityData>('ability');
}

/**
 * Get a specific effect by ID
 */
export async function getEffectById(id: string): Promise<EffectData | null> {
  return getGorDataById<EffectData>('effect', id);
}

/**
 * Get a specific ability by ID
 */
export async function getAbilityById(id: string): Promise<AbilityData | null> {
  return getGorDataById<AbilityData>('ability', id);
}

/**
 * Get multiple effects by their IDs
 */
export async function getEffectsByIds(ids: string[]): Promise<EffectData[]> {
  const allEffects = await loadEffects();
  return allEffects.filter(effect => ids.includes(effect.id));
}

/**
 * Get abilities by category
 */
export async function getAbilitiesByCategory(
  category: 'combat' | 'social' | 'survival' | 'mental' | 'special'
): Promise<AbilityData[]> {
  const abilities = await loadAbilities();
  return abilities.filter(ability => ability.category === category);
}
