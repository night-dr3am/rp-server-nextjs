// Effect processing utilities for Gor
// Handles combat effects, buffs/debuffs, control effects

import { getEffectById } from './unifiedDataLoader';
import { calculateGoreanStatModifier } from './types';
import type { EffectData, ActiveEffect, GoreanStatName } from './types';
import type { GoreanStats } from '@prisma/client';

// Type for live stats storage
export interface GorLiveStats {
  // Roll bonuses (linear stacking)
  Strength_rollbonus?: number;
  Agility_rollbonus?: number;
  Intellect_rollbonus?: number;
  Perception_rollbonus?: number;
  Charisma_rollbonus?: number;
  // Control effects
  stun?: string;
  fear?: string;
  daze?: string;
  charm?: string;
  sleep?: string;
  // Generic key access
  [key: string]: number | string | undefined;
}

// Effect execution result
export interface EffectResult {
  success: boolean;
  effectDef: EffectData;
  rollInfo?: string;
  damage?: number;
  heal?: number;
  defenseStat?: GoreanStatName;
}

/**
 * Execute an effect and return the result
 * Handles check, damage, heal, stat_modifier, control effects
 */
export async function executeEffect(
  effectId: string,
  attacker: GoreanStats,
  target: GoreanStats,
  targetStatValue?: number,
  attackerLiveStats?: GorLiveStats | null,
  targetLiveStats?: GorLiveStats | null
): Promise<EffectResult | null> {
  const effectDef = await getEffectById(effectId);

  if (!effectDef) {
    console.warn(`[GorEffects] Effect definition not found: ${effectId}`);
    return null;
  }

  // Handle CHECK effects
  if (effectDef.category === 'check') {
    let attackerMod = 0;

    // Get attacker's stat modifier based on checkStat
    if (effectDef.checkStat) {
      const statName = effectDef.checkStat.toLowerCase() as GoreanStatName;
      attackerMod = getEffectiveStatModifier(attacker, attackerLiveStats, statName);
    }

    let targetNumber = 10;

    if (effectDef.checkVs === 'enemy_stat' && effectDef.checkVsStat) {
      // Check against enemy stat
      if (targetLiveStats) {
        const statName = effectDef.checkVsStat.toLowerCase() as GoreanStatName;
        targetNumber = 10 + getEffectiveStatModifier(target, targetLiveStats, statName);
      } else {
        targetNumber = 10 + calculateGoreanStatModifier(targetStatValue || 2);
      }
    } else if (effectDef.checkVs === 'tn' && effectDef.targetNumber) {
      // Fixed target number
      targetNumber = effectDef.targetNumber;
    }

    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + attackerMod;
    const success = total >= targetNumber;

    let defenseStat: GoreanStatName | undefined = undefined;
    if (effectDef.checkVs === 'enemy_stat' && effectDef.checkVsStat) {
      defenseStat = effectDef.checkVsStat.toLowerCase() as GoreanStatName;
    }

    return {
      success,
      effectDef,
      rollInfo: `Roll: ${d20}+${attackerMod}=${total} vs TN:${targetNumber}`,
      defenseStat
    };
  }

  // Handle DAMAGE effects
  if (effectDef.category === 'damage') {
    let damage = 0;

    if (effectDef.damageFormula) {
      const parts = effectDef.damageFormula.split('+').map(p => p.trim());
      damage = parseInt(parts[0]) || 0;

      if (parts[1]) {
        const statName = parts[1].toLowerCase() as GoreanStatName;
        damage += getEffectiveStatModifier(attacker, attackerLiveStats, statName);
      }
    }

    return { success: true, damage, effectDef };
  }

  // Handle HEAL effects
  if (effectDef.category === 'heal') {
    let heal = 0;

    if (effectDef.healFormula) {
      // Handle percentage-based healing
      if (effectDef.healFormula.includes('maxHP')) {
        // Parse "maxHP * 0.1" format
        const match = effectDef.healFormula.match(/maxHP\s*\*\s*([\d.]+)/);
        if (match) {
          const percentage = parseFloat(match[1]);
          heal = Math.floor(attacker.healthMax * percentage);
        }
      } else {
        // Parse "3" or "3 + Strength" format
        const parts = effectDef.healFormula.split('+').map(p => p.trim());
        heal = parseInt(parts[0]) || 0;

        if (parts[1]) {
          const statName = parts[1].toLowerCase() as GoreanStatName;
          heal += getEffectiveStatModifier(attacker, attackerLiveStats, statName);
        }
      }
    }

    return { success: true, heal, effectDef };
  }

  // Handle STAT_MODIFIER and CONTROL effects - just return the definition
  // These are stored as active effects and processed during combat/stat calculations
  return { success: true, effectDef };
}

/**
 * Apply or update an active effect on a target
 * If the effect already exists, only update if new duration is longer
 */
export function applyActiveEffect(
  currentEffects: ActiveEffect[],
  effectResult: EffectResult,
  casterName?: string,
  sourceInfo?: {
    sourceId: string;
    sourceName: string;
    sourceType: 'ability';
  }
): ActiveEffect[] {
  const { effectDef } = effectResult;

  // Don't store immediate effects
  if (effectDef.duration === 'immediate') {
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
    name: effectDef.description || effectDef.id,
    category: effectDef.category,
    turnsRemaining: turnsLeft,
    sceneEffect: effectDef.duration === 'scene',
    appliedBy: casterName,
    stat: effectDef.stat,
    modifier: effectDef.modifier,
    modifierType: effectDef.modifierType,
    controlType: effectDef.controlType,
    target: effectDef.target,
    duration: effectDef.duration,
    sourceAbilityId: sourceInfo?.sourceId,
    sourceAbilityName: sourceInfo?.sourceName
  };

  if (existingIndex >= 0) {
    // Only update if new duration is longer
    if (turnsLeft > currentEffects[existingIndex].turnsRemaining!) {
      currentEffects[existingIndex] = newEffect;
    }
    return currentEffects;
  }

  // Add new effect
  return [...currentEffects, newEffect];
}

/**
 * Recalculate live stats from active effects
 * For Gor, we only use roll_bonus type modifiers for simplicity
 */
export async function recalculateLiveStats(
  activeEffects: ActiveEffect[]
): Promise<GorLiveStats> {
  const liveStats: GorLiveStats = {};

  for (const effect of activeEffects) {
    const effectDef = await getEffectById(effect.effectId);
    if (!effectDef) continue;

    // Handle stat modifiers
    if (effectDef.category === 'stat_modifier' && effectDef.stat) {
      const modifier = effectDef.modifier || 0;

      if (effectDef.stat === 'all') {
        // Apply to all stats
        const allStats = ['Strength', 'Agility', 'Intellect', 'Perception', 'Charisma'];
        for (const stat of allStats) {
          const key = `${stat}_rollbonus`;
          liveStats[key] = (liveStats[key] as number || 0) + modifier;
        }
      } else {
        // Apply to specific stat
        const key = `${effectDef.stat}_rollbonus`;
        liveStats[key] = (liveStats[key] as number || 0) + modifier;
      }
    }

    // Handle control effects
    if (effectDef.category === 'control' && effectDef.controlType) {
      liveStats[effectDef.controlType] = effectDef.description || effectDef.id;
    }
  }

  // Remove zero-value roll bonuses
  for (const key of Object.keys(liveStats)) {
    if (key.endsWith('_rollbonus') && liveStats[key] === 0) {
      delete liveStats[key];
    }
  }

  return liveStats;
}

/**
 * Get effective stat modifier including buffs/debuffs
 * For Gor, uses roll_bonus (linear stacking after tier calculation)
 */
export function getEffectiveStatModifier(
  goreanStats: GoreanStats,
  liveStats: GorLiveStats | null | undefined,
  statName: GoreanStatName
): number {
  // Get base stat value
  const baseValue = goreanStats[statName] as number;

  // Calculate tier modifier from base stat
  const tierModifier = calculateGoreanStatModifier(baseValue);

  // Apply roll bonus if present
  let rollBonus = 0;
  if (liveStats) {
    const capitalizedName = statName.charAt(0).toUpperCase() + statName.slice(1);
    const rollBonusKey = `${capitalizedName}_rollbonus`;
    rollBonus = typeof liveStats[rollBonusKey] === 'number'
      ? (liveStats[rollBonusKey] as number)
      : 0;
  }

  return tierModifier + rollBonus;
}

/**
 * Result of detailed stat calculation for display
 */
export interface DetailedStatResult {
  baseValue: number;
  tierModifier: number;
  rollBonus: number;
  totalModifier: number;
  formattedString: string;
  statDisplayName: string;
}

/**
 * Get detailed stat calculation breakdown for combat messages
 * Returns formatted string like: Strength[3](+2) or Strength[3](+2)+Buff(1)
 */
export function getDetailedStatCalculation(
  goreanStats: GoreanStats,
  liveStats: GorLiveStats | null | undefined,
  statName: GoreanStatName
): DetailedStatResult {
  // Get base stat value
  const baseValue = goreanStats[statName] as number;

  // Calculate tier modifier from base stat
  const tierModifier = calculateGoreanStatModifier(baseValue);

  // Get roll bonus if present
  let rollBonus = 0;
  if (liveStats) {
    const capitalizedName = statName.charAt(0).toUpperCase() + statName.slice(1);
    const rollBonusKey = `${capitalizedName}_rollbonus`;
    rollBonus = typeof liveStats[rollBonusKey] === 'number'
      ? (liveStats[rollBonusKey] as number)
      : 0;
  }

  const totalModifier = tierModifier + rollBonus;

  // Format stat name for display (capitalize first letter)
  const statDisplayName = statName.charAt(0).toUpperCase() + statName.slice(1);

  // Build formatted string
  // Format: StatName[baseValue](tierMod) or StatName[baseValue](tierMod)+bonus if rollBonus exists
  const tierSign = tierModifier >= 0 ? '+' : '';
  let formattedString = `${statDisplayName}[${baseValue}](${tierSign}${tierModifier})`;

  if (rollBonus !== 0) {
    const bonusSign = rollBonus > 0 ? '+' : '';
    formattedString += `${bonusSign}${rollBonus}`;
  }

  return {
    baseValue,
    tierModifier,
    rollBonus,
    totalModifier,
    formattedString,
    statDisplayName
  };
}

/**
 * Process turn for effects: decrement turns, remove expired, recalculate live stats
 */
export async function processEffectsTurn(
  activeEffects: ActiveEffect[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _baseStats: GoreanStats
): Promise<{
  activeEffects: ActiveEffect[];
  liveStats: GorLiveStats;
  healingApplied: number;
  healEffectNames: string[];
}> {
  // Calculate healing from active heal effects BEFORE decrementing
  let totalHealing = 0;
  const healEffectNames: string[] = [];

  for (const effect of activeEffects) {
    const effectDef = await getEffectById(effect.effectId);

    if (effectDef && effectDef.category === 'heal' && effectDef.duration !== 'immediate') {
      let healAmount = 0;

      if (effectDef.healFormula) {
        const parts = effectDef.healFormula.split('+').map(p => p.trim());
        healAmount = parseInt(parts[0]) || 0;
      }

      if (healAmount > 0) {
        totalHealing += healAmount;
        healEffectNames.push(effect.name);
      }
    }
  }

  // Decrement turn-based effects; scene effects remain unchanged
  const updatedEffects = activeEffects
    .map(effect => {
      // Don't decrement scene effects
      if (effect.duration === 'scene') {
        return effect;
      }
      // Decrement turn-based effects
      return {
        ...effect,
        turnsRemaining: (effect.turnsRemaining || 0) - 1
      };
    })
    .filter(effect => (effect.turnsRemaining || 0) > 0);

  // Recalculate live stats with updated effects
  const liveStats = await recalculateLiveStats(updatedEffects);

  return {
    activeEffects: updatedEffects,
    liveStats,
    healingApplied: totalHealing,
    healEffectNames
  };
}

/**
 * Get total damage reduction from active effects
 * Note: Currently returns 0 as damage reduction effects are not yet implemented
 * TODO: Add 'defense' category to EffectCategory when implementing damage reduction
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getDamageReduction(_activeEffects: ActiveEffect[]): Promise<number> {
  // Damage reduction effects not yet implemented for Gor
  // When implemented, check for effects with damageReduction property
  return 0;
}

/**
 * Check if target has a specific control effect (stun, fear, etc.)
 */
export function hasControlEffect(
  liveStats: GorLiveStats | null | undefined,
  controlType: 'stun' | 'fear' | 'daze' | 'charm' | 'sleep'
): boolean {
  if (!liveStats) return false;
  return !!liveStats[controlType];
}

/**
 * Remove all scene-long effects (for scene end)
 */
export async function clearSceneEffects(
  activeEffects: ActiveEffect[]
): Promise<{
  activeEffects: ActiveEffect[];
  liveStats: GorLiveStats;
}> {
  const remainingEffects = activeEffects.filter(e => e.duration !== 'scene');
  const liveStats = await recalculateLiveStats(remainingEffects);

  return {
    activeEffects: remainingEffects,
    liveStats
  };
}
