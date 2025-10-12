import { getEffectDefinition } from '@/lib/arkana/dataLoader';
import { calculateStatModifier } from '@/lib/arkana/types';
import type { EffectDefinition, EffectResult, ActiveEffect, LiveStats } from '@/lib/arkana/types';
import type { ArkanaStats } from '@prisma/client';
import liveStatsConfig from './liveStatsConfig.json';

/**
 * Execute an effect and return the result
 * Handles check, damage, stat_modifier, control, heal effects
 */
export function executeEffect(
  effectId: string,
  attacker: ArkanaStats,
  target: ArkanaStats,
  targetStatValue?: number
): EffectResult | null {
  const effectDef = getEffectDefinition(effectId);

  if (!effectDef) {
    console.warn(`Effect definition not found: ${effectId}`);
    return null;
  }

  // Handle CHECK effects
  if (effectDef.category === 'check') {
    let attackerMod = 0;
    if (effectDef.checkStat === 'Physical') attackerMod = calculateStatModifier(attacker.physical);
    else if (effectDef.checkStat === 'Mental') attackerMod = calculateStatModifier(attacker.mental);
    else if (effectDef.checkStat === 'Dexterity') attackerMod = calculateStatModifier(attacker.dexterity);
    else if (effectDef.checkStat === 'Perception') attackerMod = calculateStatModifier(attacker.perception);

    let targetNumber = 10;
    if (effectDef.checkVs === 'enemy_stat' && effectDef.checkVsStat) {
      targetNumber = 10 + calculateStatModifier(targetStatValue || 2);
    } else if (effectDef.checkVs === 'fixed' && effectDef.checkTN) {
      targetNumber = effectDef.checkTN;
    }

    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + attackerMod;
    const success = total >= targetNumber;

    return {
      success,
      effectDef,
      rollInfo: `Roll: ${d20}+${attackerMod}=${total} vs TN:${targetNumber}`
    };
  }

  // Handle DAMAGE effects
  if (effectDef.category === 'damage') {
    let damage = effectDef.damageFixed || 0;

    if (effectDef.damageFormula) {
      const parts = effectDef.damageFormula.split('+').map(p => p.trim());
      damage = parseInt(parts[0]) || 0;

      if (parts[1]) {
        const statName = parts[1];
        if (statName === 'Physical') damage += calculateStatModifier(attacker.physical);
        else if (statName === 'Mental') damage += calculateStatModifier(attacker.mental);
        else if (statName === 'Dexterity') damage += calculateStatModifier(attacker.dexterity);
        else if (statName === 'Perception') damage += calculateStatModifier(attacker.perception);
      }
    }

    return { success: true, damage, effectDef };
  }

  // Handle STAT_MODIFIER, CONTROL, HEAL, etc. - just return the definition
  return { success: true, effectDef };
}

/**
 * Apply or update an active effect on a target
 * If the effect already exists, only update if new duration is longer
 */
export function applyActiveEffect(
  currentEffects: ActiveEffect[],
  effectResult: EffectResult
): ActiveEffect[] {
  const { effectDef } = effectResult;

  // Don't store immediate or permanent effects
  if (effectDef.duration === 'immediate' || effectDef.duration === 'permanent') {
    return currentEffects;
  }

  // Parse duration to get turnsLeft
  let turnsLeft = 0;
  if (effectDef.duration?.startsWith('turns:')) {
    turnsLeft = parseInt(effectDef.duration.split(':')[1]) || 0;
  } else if (effectDef.duration === 'scene') {
    turnsLeft = 999; // Large number for scene-long effects
  }

  if (turnsLeft <= 0) {
    return currentEffects;
  }

  // Check if effect already exists
  const existingIndex = currentEffects.findIndex(e => e.effectId === effectDef.id);

  const newEffect: ActiveEffect = {
    effectId: effectDef.id,
    name: effectDef.name,
    duration: effectDef.duration || 'scene',
    turnsLeft,
    appliedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    // Only update if new duration is longer
    if (turnsLeft > currentEffects[existingIndex].turnsLeft) {
      currentEffects[existingIndex] = newEffect;
    }
  } else {
    // Add new effect
    currentEffects.push(newEffect);
  }

  return currentEffects;
}

/**
 * Recalculate live stats from base stats and active effects
 * Removes stats that match their reset values in liveStatsConfig
 */
export function recalculateLiveStats(
  baseStats: ArkanaStats,
  activeEffects: ActiveEffect[]
): LiveStats {
  const liveStats: LiveStats = {};

  // Get all effect definitions for active effects
  const effectDefs = activeEffects
    .map(ae => getEffectDefinition(ae.effectId))
    .filter(def => def !== null) as EffectDefinition[];

  // Apply stat modifiers
  for (const effectDef of effectDefs) {
    if (effectDef.category === 'stat_modifier' && effectDef.stat) {
      const statName = effectDef.stat;
      const modifier = effectDef.modifier || 0;

      // Initialize stat if not present
      if (liveStats[statName] === undefined) {
        liveStats[statName] = 0;
      }

      // Apply modifier (accumulate if multiple effects on same stat)
      if (typeof liveStats[statName] === 'number') {
        liveStats[statName] = (liveStats[statName] as number) + modifier;
      }
    }

    // Handle control effects that might set string values
    if (effectDef.category === 'control') {
      // Example: paralyzed, silenced, feared, etc.
      if (effectDef.controlType) {
        liveStats[effectDef.controlType] = effectDef.name;
      }
    }

    // Handle special effects that might set string values
    if (effectDef.category === 'special') {
      if (effectDef.type) {
        liveStats[effectDef.type] = effectDef.name;
      }
    }
  }

  // Remove stats that match their reset values
  const resetValues = liveStatsConfig as Record<string, number | string>;
  for (const [statName, resetValue] of Object.entries(resetValues)) {
    if (liveStats[statName] === resetValue) {
      delete liveStats[statName];
    }
  }

  return liveStats;
}

/**
 * Process turn for effects: decrement turns, remove expired, recalculate live stats
 */
export function processEffectsTurn(
  activeEffects: ActiveEffect[],
  baseStats: ArkanaStats
): { activeEffects: ActiveEffect[]; liveStats: LiveStats } {
  // Decrement all effects and remove expired ones
  const updatedEffects = activeEffects
    .map(effect => ({
      ...effect,
      turnsLeft: effect.turnsLeft - 1
    }))
    .filter(effect => effect.turnsLeft > 0);

  // Recalculate live stats with updated effects
  const liveStats = recalculateLiveStats(baseStats, updatedEffects);

  return {
    activeEffects: updatedEffects,
    liveStats
  };
}

/**
 * Filter effects by target type
 */
export function getEffectsByTarget(
  effects: EffectResult[],
  targetType: 'self' | 'enemy' | 'ally' | 'area' | 'all_enemies' | 'all_allies' | 'single'
): EffectResult[] {
  return effects.filter(e => e.effectDef.target === targetType);
}

/**
 * Build Prisma update data for arkanaStats with activeEffects and liveStats
 * Uses Record<string, unknown> to avoid type casting issues with JSON fields
 */
export function buildArkanaStatsUpdate(updates: {
  activeEffects?: ActiveEffect[];
  liveStats?: LiveStats;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (updates.activeEffects !== undefined) {
    data.activeEffects = updates.activeEffects;
  }
  if (updates.liveStats !== undefined) {
    data.liveStats = updates.liveStats;
  }

  return data;
}

/**
 * Safely parse activeEffects from JSON data retrieved from database
 * Returns empty array if data is null, undefined, or not an array
 */
export function parseActiveEffects(jsonData: unknown): ActiveEffect[] {
  if (!jsonData || !Array.isArray(jsonData)) {
    return [];
  }
  return jsonData as ActiveEffect[];
}
