import { getEffectDefinition } from '@/lib/arkana/dataLoader';
import { calculateStatModifier } from '@/lib/arkana/types';
import type { EffectDefinition, EffectResult, ActiveEffect, LiveStats, CommonPower, ArchetypePower, Perk, Cybernetic, MagicSchool } from '@/lib/arkana/types';
import type { ArkanaStats } from '@prisma/client';
import liveStatsConfig from './liveStatsConfig.json';

/**
 * Execute an effect and return the result
 * Handles check, damage, stat_modifier, control, heal effects
 * @param effectId - The effect ID to execute
 * @param attacker - Attacker's base stats
 * @param target - Target's base stats
 * @param targetStatValue - Optional target stat value for checks
 * @param attackerLiveStats - Optional attacker's liveStats for effective stat calculations
 * @param targetLiveStats - Optional target's liveStats for effective stat calculations
 */
export function executeEffect(
  effectId: string,
  attacker: ArkanaStats,
  target: ArkanaStats,
  targetStatValue?: number,
  attackerLiveStats?: LiveStats | null,
  targetLiveStats?: LiveStats | null
): EffectResult | null {
  const effectDef = getEffectDefinition(effectId);

  if (!effectDef) {
    console.warn(`Effect definition not found: ${effectId}`);
    return null;
  }

  // Handle CHECK effects
  if (effectDef.category === 'check') {
    let attackerMod = 0;
    // Use effective stats if liveStats provided, otherwise use base stats
    if (effectDef.checkStat === 'Physical') {
      attackerMod = attackerLiveStats
        ? getEffectiveStatModifier(attacker, attackerLiveStats, 'physical')
        : calculateStatModifier(attacker.physical);
    } else if (effectDef.checkStat === 'Mental') {
      attackerMod = attackerLiveStats
        ? getEffectiveStatModifier(attacker, attackerLiveStats, 'mental')
        : calculateStatModifier(attacker.mental);
    } else if (effectDef.checkStat === 'Dexterity') {
      attackerMod = attackerLiveStats
        ? getEffectiveStatModifier(attacker, attackerLiveStats, 'dexterity')
        : calculateStatModifier(attacker.dexterity);
    } else if (effectDef.checkStat === 'Perception') {
      attackerMod = attackerLiveStats
        ? getEffectiveStatModifier(attacker, attackerLiveStats, 'perception')
        : calculateStatModifier(attacker.perception);
    }

    let targetNumber = 10;
    if (effectDef.checkVs === 'enemy_stat' && effectDef.checkVsStat) {
      // Use effective target stat if liveStats provided
      if (targetLiveStats && effectDef.checkVsStat) {
        const statName = effectDef.checkVsStat.toLowerCase() as 'physical' | 'dexterity' | 'mental' | 'perception';
        targetNumber = 10 + getEffectiveStatModifier(target, targetLiveStats, statName);
      } else {
        targetNumber = 10 + calculateStatModifier(targetStatValue || 2);
      }
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
        // Use effective stats if liveStats provided, otherwise use base stats
        if (statName === 'Physical') {
          damage += attackerLiveStats
            ? getEffectiveStatModifier(attacker, attackerLiveStats, 'physical')
            : calculateStatModifier(attacker.physical);
        } else if (statName === 'Mental') {
          damage += attackerLiveStats
            ? getEffectiveStatModifier(attacker, attackerLiveStats, 'mental')
            : calculateStatModifier(attacker.mental);
        } else if (statName === 'Dexterity') {
          damage += attackerLiveStats
            ? getEffectiveStatModifier(attacker, attackerLiveStats, 'dexterity')
            : calculateStatModifier(attacker.dexterity);
        } else if (statName === 'Perception') {
          damage += attackerLiveStats
            ? getEffectiveStatModifier(attacker, attackerLiveStats, 'perception')
            : calculateStatModifier(attacker.perception);
        }
      }
    }

    return { success: true, damage, effectDef };
  }

  // Handle HEAL effects
  if (effectDef.category === 'heal') {
    let heal = 0;

    if (effectDef.healFormula) {
      const parts = effectDef.healFormula.split('+').map(p => p.trim());
      heal = parseInt(parts[0]) || 0;

      if (parts[1]) {
        const statName = parts[1];
        // Use effective stats if liveStats provided, otherwise use base stats
        if (statName === 'Physical') {
          heal += attackerLiveStats
            ? getEffectiveStatModifier(attacker, attackerLiveStats, 'physical')
            : calculateStatModifier(attacker.physical);
        } else if (statName === 'Mental') {
          heal += attackerLiveStats
            ? getEffectiveStatModifier(attacker, attackerLiveStats, 'mental')
            : calculateStatModifier(attacker.mental);
        } else if (statName === 'Dexterity') {
          heal += attackerLiveStats
            ? getEffectiveStatModifier(attacker, attackerLiveStats, 'dexterity')
            : calculateStatModifier(attacker.dexterity);
        } else if (statName === 'Perception') {
          heal += attackerLiveStats
            ? getEffectiveStatModifier(attacker, attackerLiveStats, 'perception')
            : calculateStatModifier(attacker.perception);
        }
      }
    }

    return { success: true, heal, effectDef };
  }

  // Handle STAT_MODIFIER, CONTROL, etc. - just return the definition
  return { success: true, effectDef };
}

/**
 * Apply or update an active effect on a target
 * If the effect already exists, only update if new duration is longer
 * @param currentEffects - Current active effects on the target
 * @param effectResult - The effect result to apply
 * @param casterName - Optional character name of who cast this effect (for display purposes)
 */
export function applyActiveEffect(
  currentEffects: ActiveEffect[],
  effectResult: EffectResult,
  casterName?: string
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
    appliedAt: new Date().toISOString(),
    casterName  // Store caster name if provided
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
 * Process turn for effects: decrement turns, remove expired, recalculate live stats, apply healing
 * Scene effects are NOT decremented - they remain at turnsLeft: 999 until scene ends
 * Only turn-based effects (duration starts with "turns:") are decremented
 * Heal effects with duration apply healing each turn BEFORE decrementing
 */
export function processEffectsTurn(
  activeEffects: ActiveEffect[],
  baseStats: ArkanaStats
): { activeEffects: ActiveEffect[]; liveStats: LiveStats; healingApplied: number; healEffectNames: string[] } {
  // Calculate healing from active heal effects BEFORE decrementing
  let totalHealing = 0;
  const healEffectNames: string[] = [];

  for (const effect of activeEffects) {
    const effectDef = getEffectDefinition(effect.effectId);

    if (effectDef && effectDef.category === 'heal' && effectDef.duration !== 'immediate') {
      // Parse healFormula (similar to damage formula)
      let healAmount = 0;

      if (effectDef.healFormula) {
        const parts = effectDef.healFormula.split('+').map(p => p.trim());
        healAmount = parseInt(parts[0]) || 0;

        // Note: For heal-over-time effects, we use base stats without modifiers
        // since the effect definition already contains the heal amount
        // If we want to add stat bonuses to healing, we can enhance this later
      }

      if (healAmount > 0) {
        totalHealing += healAmount;
        healEffectNames.push(effect.name);
      }
    }
  }

  // Decrement turn-based effects only; scene effects remain unchanged
  const updatedEffects = activeEffects
    .map(effect => {
      // Don't decrement scene effects - they stay at turnsLeft: 999
      if (effect.duration === 'scene') {
        return effect;
      }
      // Decrement turn-based effects
      return {
        ...effect,
        turnsLeft: effect.turnsLeft - 1
      };
    })
    .filter(effect => effect.turnsLeft > 0);

  // Recalculate live stats with updated effects
  const liveStats = recalculateLiveStats(baseStats, updatedEffects);

  return {
    activeEffects: updatedEffects,
    liveStats,
    healingApplied: totalHealing,
    healEffectNames
  };
}

/**
 * Process turn effects AND apply all healing to user's health in one atomic operation
 * Combines turn-based healing (HoT) + immediate healing, then updates UserStats.health
 * This keeps all effect processing and healing logic together in one place
 *
 * @param user - User object with stats and arkanaStats
 * @param activeEffects - Current active effects to process
 * @param immediateHealing - Optional immediate healing from new effects (default: 0)
 * @returns Updated effects, liveStats, total healing applied, heal effect names, and new HP value
 */
export async function processEffectsTurnAndApplyHealing(
  user: {
    id: string;
    stats: { health: number; userId: string } | null;
    arkanaStats: ArkanaStats;
  },
  activeEffects: ActiveEffect[],
  immediateHealing: number = 0
): Promise<{
  activeEffects: ActiveEffect[];
  liveStats: LiveStats;
  healingApplied: number;
  healEffectNames: string[];
  newHP: number;
}> {
  const { prisma } = await import('@/lib/prisma');

  // Process turn effects (decrement, calculate HoT healing)
  const turnResult = processEffectsTurn(activeEffects, user.arkanaStats);

  // Calculate total healing (turn-based + immediate)
  const totalHealing = turnResult.healingApplied + immediateHealing;

  // Apply healing to health (capped at maxHP = Physical × 5)
  const currentHP = user.stats?.health || 0;
  const maxHP = user.arkanaStats.physical * 5;
  const newHP = Math.min(currentHP + totalHealing, maxHP);

  // Update UserStats.health if user has stats (regardless of healing amount)
  // This ensures the database always reflects the current state
  if (user.stats) {
    await prisma.userStats.update({
      where: { userId: user.id },
      data: { health: newHP }
    });
  }

  return {
    activeEffects: turnResult.activeEffects,
    liveStats: turnResult.liveStats,
    healingApplied: totalHealing,
    healEffectNames: turnResult.healEffectNames,
    newHP
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
 * Build Prisma update data for arkanaStats with activeEffects, liveStats, and optional hitPoints
 * Uses Record<string, unknown> to avoid type casting issues with JSON fields
 */
export function buildArkanaStatsUpdate(updates: {
  activeEffects?: ActiveEffect[];
  liveStats?: LiveStats;
  hitPoints?: number;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (updates.activeEffects !== undefined) {
    data.activeEffects = updates.activeEffects;
  }
  if (updates.liveStats !== undefined) {
    data.liveStats = updates.liveStats;
  }
  // Only include hitPoints if it's a valid number
  if (typeof updates.hitPoints === 'number' && !isNaN(updates.hitPoints)) {
    data.hitPoints = updates.hitPoints;
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

/**
 * Format LiveStats and ActiveEffects into ready-to-display LSL string
 * Groups effects by category and shows effect names with durations and caster info
 *
 * Format:
 *   "🔮 Effects: StatName Modifier(Effect1(duration), Effect2(duration))\n..."
 *   "🔧 Utilities: UtilityName by CasterName(duration), ..."
 *   "✨ Special: SpecialName by CasterName(duration), ..."
 *   "🛡️ Defense: Damage Reduction -X (EffectName(duration), ...)"
 *
 * Examples:
 *   "🔮 Effects: Mental -1 (Entropy Pulse(1 turn left), Emotional Thief(2 turns left))"
 *   "🔮 Effects: Physical +2 (Buff Strength(scene))\n🔧 Utilities: Remote Eavesdropping by Night Corvus(scene)\n✨ Special: Shadowform by Alice(scene)\n🛡️ Defense: Damage Reduction -5 (Hardened Carapace(2 turns left))"
 *
 * @param liveStats - Calculated stat modifiers
 * @param activeEffects - Active effects with durations and caster info
 * @returns URL-encoded string ready for LSL (only needs llUnescapeURL)
 */
export function formatLiveStatsForLSL(liveStats: LiveStats, activeEffects: ActiveEffect[]): string {
  const outputSections: string[] = [];

  // === SECTION 1: Stat Modifiers ===

  // Group effects by the stats they modify
  const effectsByStat: { [statName: string]: { effects: Array<{ name: string; duration: string }>, totalModifier: number } } = {};

  // First, identify all numeric stats in liveStats (these are stat modifiers)
  for (const [statName, value] of Object.entries(liveStats)) {
    if (typeof value === 'number') {
      effectsByStat[statName] = {
        effects: [],
        totalModifier: value
      };
    }
  }

  // Match stat_modifier activeEffects to their stats
  for (const activeEffect of activeEffects) {
    const effectDef = getEffectDefinition(activeEffect.effectId);

    if (effectDef && effectDef.category === 'stat_modifier' && effectDef.stat) {
      const statName = effectDef.stat;

      // Format duration string
      let durationStr = '';
      if (activeEffect.turnsLeft === 999) {
        durationStr = 'scene';
      } else if (activeEffect.turnsLeft === 1) {
        durationStr = '1 turn left';
      } else {
        durationStr = `${activeEffect.turnsLeft} turns left`;
      }

      // Add to the appropriate stat group
      if (effectsByStat[statName]) {
        effectsByStat[statName].effects.push({
          name: activeEffect.name,
          duration: durationStr
        });
      }
    }
  }

  // Build stat modifier lines
  const statLines: string[] = [];
  for (const [statName, data] of Object.entries(effectsByStat)) {
    const sign = data.totalModifier >= 0 ? '+' : '';
    const effectsList = data.effects.map(e => `${e.name}(${e.duration})`).join(', ');

    if (effectsList) {
      statLines.push(`${statName} ${sign}${data.totalModifier} (${effectsList})`);
    } else {
      // If we have a modifier but no effect names (shouldn't happen, but handle it)
      statLines.push(`${statName} ${sign}${data.totalModifier}`);
    }
  }

  if (statLines.length > 0) {
    outputSections.push('🔮 Effects: ' + statLines.join('\n'));
  }

  // === SECTION 2: Utility Effects ===

  const utilityEffects: Array<{ name: string; caster: string; duration: string }> = [];

  for (const activeEffect of activeEffects) {
    const effectDef = getEffectDefinition(activeEffect.effectId);

    if (effectDef && effectDef.category === 'utility') {
      // Format duration string
      let durationStr = '';
      if (activeEffect.turnsLeft === 999) {
        durationStr = 'scene';
      } else if (activeEffect.turnsLeft === 1) {
        durationStr = '1 turn left';
      } else {
        durationStr = `${activeEffect.turnsLeft} turns left`;
      }

      utilityEffects.push({
        name: activeEffect.name,
        caster: activeEffect.casterName || 'Unknown',
        duration: durationStr
      });
    }
  }

  if (utilityEffects.length > 0) {
    const utilityList = utilityEffects
      .map(u => `${u.name} by ${u.caster}(${u.duration})`)
      .join(', ');
    outputSections.push('🔧 Utilities: ' + utilityList);
  }

  // === SECTION 3: Special Effects ===

  const specialEffects: Array<{ name: string; caster: string; duration: string }> = [];

  for (const activeEffect of activeEffects) {
    const effectDef = getEffectDefinition(activeEffect.effectId);

    if (effectDef && effectDef.category === 'special') {
      // Format duration string
      let durationStr = '';
      if (activeEffect.turnsLeft === 999) {
        durationStr = 'scene';
      } else if (activeEffect.turnsLeft === 1) {
        durationStr = '1 turn left';
      } else {
        durationStr = `${activeEffect.turnsLeft} turns left`;
      }

      specialEffects.push({
        name: activeEffect.name,
        caster: activeEffect.casterName || 'Unknown',
        duration: durationStr
      });
    }
  }

  if (specialEffects.length > 0) {
    const specialList = specialEffects
      .map(s => `${s.name} by ${s.caster}(${s.duration})`)
      .join(', ');
    outputSections.push('✨ Special: ' + specialList);
  }

  // === SECTION 4: Defense Effects ===

  const defenseEffects: Array<{ name: string; reduction: number; duration: string }> = [];
  let totalDamageReduction = 0;

  for (const activeEffect of activeEffects) {
    const effectDef = getEffectDefinition(activeEffect.effectId);

    if (effectDef && effectDef.category === 'defense' && effectDef.type === 'reduction') {
      // Format duration string
      let durationStr = '';
      if (activeEffect.turnsLeft === 999) {
        durationStr = 'scene';
      } else if (activeEffect.turnsLeft === 1) {
        durationStr = '1 turn left';
      } else {
        durationStr = `${activeEffect.turnsLeft} turns left`;
      }

      const reduction = effectDef.damageReduction || 0;
      totalDamageReduction += reduction;

      defenseEffects.push({
        name: activeEffect.name,
        reduction: reduction,
        duration: durationStr
      });
    }
  }

  if (defenseEffects.length > 0) {
    const effectsList = defenseEffects
      .map(d => `${d.name}(${d.duration})`)
      .join(', ');
    outputSections.push(`🛡️ Defense: Damage Reduction -${totalDamageReduction} (${effectsList})`);
  }

  // === SECTION 5: Heal Effects ===

  const healEffects: Array<{ name: string; healPerTurn: number; duration: string }> = [];
  let totalHealingPerTurn = 0;

  for (const activeEffect of activeEffects) {
    const effectDef = getEffectDefinition(activeEffect.effectId);

    if (effectDef && effectDef.category === 'heal' && effectDef.duration !== 'immediate') {
      // Format duration string
      let durationStr = '';
      if (activeEffect.turnsLeft === 999) {
        durationStr = 'scene';
      } else if (activeEffect.turnsLeft === 1) {
        durationStr = '1 turn left';
      } else {
        durationStr = `${activeEffect.turnsLeft} turns left`;
      }

      // Calculate heal per turn from healFormula
      let healPerTurn = 0;
      if (effectDef.healFormula) {
        const parts = effectDef.healFormula.split('+').map(p => p.trim());
        healPerTurn = parseInt(parts[0]) || 0;
      }

      if (healPerTurn > 0) {
        totalHealingPerTurn += healPerTurn;
        healEffects.push({
          name: activeEffect.name,
          healPerTurn,
          duration: durationStr
        });
      }
    }
  }

  if (healEffects.length > 0) {
    const effectsList = healEffects
      .map(h => `${h.name}(${h.duration})`)
      .join(', ');
    outputSections.push(`💚 Healing: +${totalHealingPerTurn} HP/turn (${effectsList})`);
  }

  // === SECTION 6: Control Effects ===

  const controlEffects: Array<{ name: string; caster: string; duration: string }> = [];

  for (const activeEffect of activeEffects) {
    const effectDef = getEffectDefinition(activeEffect.effectId);

    if (effectDef && effectDef.category === 'control') {
      // Format duration string
      let durationStr = '';
      if (activeEffect.turnsLeft === 999) {
        durationStr = 'scene';
      } else if (activeEffect.turnsLeft === 1) {
        durationStr = '1 turn left';
      } else {
        durationStr = `${activeEffect.turnsLeft} turns left`;
      }

      controlEffects.push({
        name: activeEffect.name,
        caster: activeEffect.casterName || 'Unknown',
        duration: durationStr
      });
    }
  }

  if (controlEffects.length > 0) {
    const controlList = controlEffects
      .map(c => `${c.name} by ${c.caster}(${c.duration})`)
      .join(', ');
    outputSections.push('⛓️ Control: ' + controlList);
  }

  // If no effects at all, return empty string
  if (outputSections.length === 0) {
    return '';
  }

  // Join all sections with newlines
  const formattedString = outputSections.join('\n');

  // URL-encode for LSL transmission (use encodeURIComponent for proper encoding)
  return encodeURIComponent(formattedString);
}

/**
 * Get effective stat modifier by applying liveStats modifiers to base arkanaStats
 * and calculating the final modifier for combat rolls
 * Used in combat calculations to include buffs/debuffs
 * @param arkanaStats - Base character stats
 * @param liveStats - Current active effect modifiers
 * @param statName - Which stat to get (physical, dexterity, mental, perception)
 * @returns Final stat modifier for d20 rolls (includes buffs/debuffs)
 */
export function getEffectiveStatModifier(
  arkanaStats: ArkanaStats,
  liveStats: LiveStats | null | undefined,
  statName: 'physical' | 'dexterity' | 'mental' | 'perception'
): number {
  const baseValue = arkanaStats[statName];

  // Apply liveStats modifier if present
  let effectiveValue = baseValue;
  if (liveStats) {
    // LiveStats uses capitalized stat names (Physical, Dexterity, Mental, Perception)
    const capitalizedName = statName.charAt(0).toUpperCase() + statName.slice(1);
    const liveModifier = typeof liveStats[capitalizedName] === 'number'
      ? (liveStats[capitalizedName] as number)
      : 0;
    effectiveValue = baseValue + liveModifier;
  }

  // Calculate and return the final modifier for d20 rolls
  return calculateStatModifier(effectiveValue);
}

/**
 * Calculate total damage reduction from active defense effects
 * Sums all damage reduction values from defense/reduction type effects
 * @param activeEffects - Current active effects on the character
 * @returns Total damage reduction amount (minimum 0)
 */
export function calculateDamageReduction(activeEffects: ActiveEffect[]): number {
  let totalReduction = 0;

  for (const activeEffect of activeEffects) {
    const effectDef = getEffectDefinition(activeEffect.effectId);

    // Check if this is a defense effect with reduction type
    if (effectDef && effectDef.category === 'defense' && effectDef.type === 'reduction') {
      const reduction = effectDef.damageReduction || 0;
      totalReduction += reduction;
    }
  }

  return Math.max(0, totalReduction);
}

/**
 * Clear all turn-based and scene-based effects
 * Keeps only permanent effects
 * @param activeEffects - Current active effects
 * @param baseStats - Base character stats
 * @returns Updated activeEffects and liveStats with only permanent effects
 */
export function clearSceneEffects(
  activeEffects: ActiveEffect[],
  baseStats: ArkanaStats
): { activeEffects: ActiveEffect[]; liveStats: LiveStats } {
  // Filter to keep only permanent effects
  const remainingEffects = activeEffects.filter(effect => {
    const effectDef = getEffectDefinition(effect.effectId);
    return effectDef?.duration === 'permanent';
  });

  const liveStats = recalculateLiveStats(baseStats, remainingEffects);

  return {
    activeEffects: remainingEffects,
    liveStats
  };
}

/**
 * Format power details for LSL display in dialogs
 * Creates human-readable power description with effects breakdown
 * @param power - The power/ability/perk/cybernetic/magic object
 * @param mode - 'detailed' for target selection, 'brief' for confirmation
 * @returns URL-encoded formatted string ready for LSL display
 */
export function formatPowerDetailsForLSL(
  power: CommonPower | ArchetypePower | Perk | Cybernetic | MagicSchool,
  mode: 'detailed' | 'brief'
): string {
  // Helper function to format target label
  const formatTargetLabel = (target?: string): string => {
    if (!target) return '';

    // Map target values to display labels
    const targetMap: Record<string, string> = {
      'enemy': 'Enemy',
      'self': 'Self',
      'ally': 'Ally',
      'area': 'Area',
      'all_enemies': 'All Enemies',
      'all_allies': 'All Allies',
      'single': 'Single'
    };

    const label = targetMap[target] || target;
    return ` [${label}]`;
  };

  // Helper function to format a single effect description
  const formatEffect = (effectId: string): string => {
    const effectDef = getEffectDefinition(effectId);
    if (!effectDef) return effectId;

    // Build effect description based on category
    if (effectDef.category === 'damage') {
      const dmgType = effectDef.damageType || 'damage';
      const formula = effectDef.damageFormula || '';
      const targetLabel = formatTargetLabel(effectDef.target);
      return `${formula} ${dmgType} damage${targetLabel}`;
    }

    if (effectDef.category === 'stat_modifier') {
      const sign = (effectDef.modifier || 0) >= 0 ? '+' : '';
      const stat = effectDef.stat || '';
      let duration = '';
      if (effectDef.duration?.startsWith('turns:')) {
        const turns = effectDef.duration.split(':')[1];
        duration = ` (${turns} ${turns === '1' ? 'turn' : 'turns'})`;
      } else if (effectDef.duration === 'scene') {
        duration = ' (scene)';
      }
      const targetLabel = formatTargetLabel(effectDef.target);
      return `${sign}${effectDef.modifier} ${stat}${duration}${targetLabel}`;
    }

    if (effectDef.category === 'control') {
      const controlType = effectDef.controlType || 'control';
      let duration = '';
      if (effectDef.duration?.startsWith('turns:')) {
        const turns = effectDef.duration.split(':')[1];
        duration = ` (${turns} ${turns === '1' ? 'turn' : 'turns'})`;
      } else if (effectDef.duration === 'scene') {
        duration = ' (scene)';
      }
      const targetLabel = formatTargetLabel(effectDef.target);
      return `${controlType}${duration}${targetLabel}`;
    }

    if (effectDef.category === 'heal') {
      const healFormula = effectDef.healFormula || 'heals';
      const targetLabel = formatTargetLabel(effectDef.target);
      return `Heals ${healFormula} HP${targetLabel}`;
    }

    if (effectDef.category === 'utility') {
      let duration = '';
      if (effectDef.duration?.startsWith('turns:')) {
        const turns = effectDef.duration.split(':')[1];
        duration = ` (${turns} ${turns === '1' ? 'turn' : 'turns'})`;
      } else if (effectDef.duration === 'scene') {
        duration = ' (scene)';
      }
      const targetLabel = formatTargetLabel(effectDef.target);
      return `${effectDef.name}${duration}${targetLabel}`;
    }

    if (effectDef.category === 'special') {
      let duration = '';
      if (effectDef.duration?.startsWith('turns:')) {
        const turns = effectDef.duration.split(':')[1];
        duration = ` (${turns} ${turns === '1' ? 'turn' : 'turns'})`;
      } else if (effectDef.duration === 'scene') {
        duration = ' (scene)';
      }
      const targetLabel = formatTargetLabel(effectDef.target);
      return `${effectDef.name}${duration}${targetLabel}`;
    }

    if (effectDef.category === 'defense') {
      const reduction = effectDef.damageReduction || 0;
      let duration = '';
      if (effectDef.duration?.startsWith('turns:')) {
        const turns = effectDef.duration.split(':')[1];
        duration = ` (${turns} ${turns === '1' ? 'turn' : 'turns'})`;
      } else if (effectDef.duration === 'scene') {
        duration = ' (scene)';
      }
      const targetLabel = formatTargetLabel(effectDef.target);
      return `Damage Reduction -${reduction}${duration}${targetLabel}`;
    }

    // Fallback: return effect name
    const targetLabel = formatTargetLabel(effectDef.target);
    return effectDef.name + targetLabel;
  };

  // Collect all effects from the power
  const effects = power.effects || {};
  const allEffectIds: string[] = [];

  // Combine all effect types (attack, ability, passive, onHit, onDefense)
  if (effects.attack) allEffectIds.push(...effects.attack);
  if (effects.ability) allEffectIds.push(...effects.ability);
  if (effects.passive) allEffectIds.push(...effects.passive);
  if (effects.onHit) allEffectIds.push(...effects.onHit);
  if (effects.onDefense) allEffectIds.push(...effects.onDefense);

  // Remove duplicates
  const uniqueEffectIds = Array.from(new Set(allEffectIds));

  // Format effect descriptions
  const effectDescriptions = uniqueEffectIds
    .map(formatEffect)
    .filter(desc => desc.length > 0);

  // Build message based on mode
  let message = '';

  if (mode === 'detailed') {
    // Detailed format for target selection dialog
    message = `⚡ ${power.name}\n`;
    message += `${power.desc}\n\n`;

    // Add power metadata (without cost)
    const rangeStr = power.range !== undefined ? `Range: ${power.range}m` : '';
    const targetStr = power.targetType ? `Target: ${power.targetType}` : '';
    const metadataParts = [rangeStr, targetStr].filter(s => s.length > 0);
    if (metadataParts.length > 0) {
      message += metadataParts.join(' | ') + '\n';
    }

    // Add effects section
    if (effectDescriptions.length > 0) {
      message += '\nEffects:\n';
      effectDescriptions.forEach(desc => {
        message += `• ${desc}\n`;
      });
    }
  } else {
    // Brief format for confirmation dialog
    const costStr = power.cost !== undefined ? ` (Cost: ${power.cost})` : '';
    message = `⚡ ${power.name}${costStr}`;

    if (effectDescriptions.length > 0) {
      message += `\n${effectDescriptions.join(', ')}`;
    }
  }

  // URL-encode for LSL transmission
  return encodeURIComponent(message.trim());
}
