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

    // Determine which stat was used for defense (for detailed TN display)
    let defenseStat: 'physical' | 'dexterity' | 'mental' | 'perception' | undefined = undefined;
    if (effectDef.checkVs === 'enemy_stat' && effectDef.checkVsStat) {
      defenseStat = effectDef.checkVsStat.toLowerCase() as 'physical' | 'dexterity' | 'mental' | 'perception';
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
 * @param sourceInfo - Optional source tracking (power/perk/cybernetic/magic that caused this effect)
 */
export function applyActiveEffect(
  currentEffects: ActiveEffect[],
  effectResult: EffectResult,
  casterName?: string,
  sourceInfo?: {
    sourceId: string;
    sourceName: string;
    sourceType: 'power' | 'perk' | 'cybernetic' | 'magic';
  }
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
    casterName,  // Store caster name if provided
    // Include source info if provided
    ...(sourceInfo && {
      sourceId: sourceInfo.sourceId,
      sourceName: sourceInfo.sourceName,
      sourceType: sourceInfo.sourceType
    })
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

  // Apply stat modifiers - distinguish between stat_value and roll_bonus types
  for (const effectDef of effectDefs) {
    if (effectDef.category === 'stat_modifier' && effectDef.stat) {
      const statName = effectDef.stat;
      const modifier = effectDef.modifier || 0;
      const modifierType = effectDef.modifierType || 'stat_value'; // Default to stat_value for backward compatibility

      if (modifierType === 'stat_value') {
        // stat_value: Modifies base stat BEFORE tier calculation
        // Stored as: liveStats[StatName] = accumulated modifier
        // Example: liveStats.Physical = 3 (adds +3 to base Physical before calculating tier)
        if (liveStats[statName] === undefined) {
          liveStats[statName] = 0;
        }
        if (typeof liveStats[statName] === 'number') {
          liveStats[statName] = (liveStats[statName] as number) + modifier;
        }
      } else if (modifierType === 'roll_bonus') {
        // roll_bonus: Adds flat bonus AFTER base modifier is calculated
        // Stored as: liveStats[StatName_rollbonus] = accumulated bonus
        // Example: liveStats.Physical_rollbonus = 2 (adds +2 directly to roll after tier mod)
        const rollKey = `${statName}_rollbonus`;
        if (liveStats[rollKey] === undefined) {
          liveStats[rollKey] = 0;
        }
        if (typeof liveStats[rollKey] === 'number') {
          liveStats[rollKey] = (liveStats[rollKey] as number) + modifier;
        }
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

  // Apply healing to health (capped at maxHP from arkanaStats.hitPoints)
  const currentHP = user.stats?.health || 0;
  const maxHP = user.arkanaStats.hitPoints;
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
  // Now distinguish between stat_value and roll_bonus types in display
  for (const activeEffect of activeEffects) {
    const effectDef = getEffectDefinition(activeEffect.effectId);

    if (effectDef && effectDef.category === 'stat_modifier' && effectDef.stat) {
      const statName = effectDef.stat;
      const modifierType = effectDef.modifierType || 'stat_value';

      // Format duration string
      let durationStr = '';
      if (activeEffect.turnsLeft === 999) {
        durationStr = 'scene';
      } else if (activeEffect.turnsLeft === 1) {
        durationStr = '1 turn left';
      } else {
        durationStr = `${activeEffect.turnsLeft} turns left`;
      }

      // Format effect name with type indicator and source tracking
      const typeIndicator = modifierType === 'roll_bonus' ? '[roll]' : '[stat]';
      // Use source name if available, otherwise fall back to effect name
      const baseName = activeEffect.sourceName
        ? `${activeEffect.sourceName}[${activeEffect.sourceType}]`
        : activeEffect.name;
      const effectName = `${baseName}${typeIndicator}`;

      // Add to the appropriate stat group (including _rollbonus keys)
      const displayKey = modifierType === 'roll_bonus' ? `${statName}_rollbonus` : statName;
      if (effectsByStat[displayKey]) {
        effectsByStat[displayKey].effects.push({
          name: effectName,
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

    // Clean up display name (remove _rollbonus suffix for display)
    const displayStatName = statName.replace('_rollbonus', ' Roll Bonus');

    if (effectsList) {
      statLines.push(`${displayStatName} ${sign}${data.totalModifier} (${effectsList})`);
    } else {
      // If we have a modifier but no effect names (shouldn't happen, but handle it)
      statLines.push(`${displayStatName} ${sign}${data.totalModifier}`);
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
 *
 * Handles two types of modifiers:
 * 1. stat_value: Applied to base stat BEFORE tier calculation (non-linear)
 * 2. roll_bonus: Applied AFTER tier calculation (linear)
 *
 * Used in combat calculations to include buffs/debuffs
 * @param arkanaStats - Base character stats
 * @param liveStats - Current active effect modifiers
 * @param statName - Which stat to get (physical, dexterity, mental, perception)
 * @returns Final stat modifier for d20 rolls (includes both types of buffs/debuffs)
 */
export function getEffectiveStatModifier(
  arkanaStats: ArkanaStats,
  liveStats: LiveStats | null | undefined,
  statName: 'physical' | 'dexterity' | 'mental' | 'perception'
): number {
  const baseValue = arkanaStats[statName];
  const capitalizedName = statName.charAt(0).toUpperCase() + statName.slice(1);

  // Step 1: Apply stat_value modifiers (stored in liveStats[StatName])
  // These modify the base stat BEFORE calculating the tier modifier
  let effectiveValue = baseValue;
  if (liveStats) {
    const statValueModifier = typeof liveStats[capitalizedName] === 'number'
      ? (liveStats[capitalizedName] as number)
      : 0;
    effectiveValue = baseValue + statValueModifier;
  }

  // Step 2: Calculate tier modifier from effective stat value
  const tierModifier = calculateStatModifier(effectiveValue);

  // Step 3: Apply roll_bonus modifiers (stored in liveStats[StatName_rollbonus])
  // These are added AFTER the tier calculation (flat bonus)
  let rollBonus = 0;
  if (liveStats) {
    const rollBonusKey = `${capitalizedName}_rollbonus`;
    rollBonus = typeof liveStats[rollBonusKey] === 'number'
      ? (liveStats[rollBonusKey] as number)
      : 0;
  }

  // Step 4: Return final combined modifier
  return tierModifier + rollBonus;
}

/**
 * Get detailed stat calculation breakdown for displaying in user messages
 *
 * Returns complete breakdown showing:
 * - Base stat value
 * - All stat_value effects with names and values
 * - Effective stat after stat_value modifiers
 * - Tier modifier calculated from effective stat
 * - All roll_bonus effects with names and values
 * - Final combined modifier
 * - Formatted string ready for display
 *
 * Example format: "Physical[2 +Strength(3) =5](+2) +Targeting(1)"
 *
 * @param arkanaStats - Base character stats
 * @param liveStats - Current active effect modifiers
 * @param statName - Which stat to calculate (physical, dexterity, mental, perception)
 * @param activeEffects - Active effects for extracting effect names
 * @returns Detailed calculation breakdown object
 */
export function getDetailedStatCalculation(
  arkanaStats: ArkanaStats,
  liveStats: LiveStats | null | undefined,
  statName: 'physical' | 'dexterity' | 'mental' | 'perception',
  activeEffects: ActiveEffect[]
): {
  baseStat: number;
  statValueEffects: Array<{ name: string; modifier: number }>;
  effectiveStat: number;
  tierModifier: number;
  rollBonusEffects: Array<{ name: string; modifier: number }>;
  finalModifier: number;
  formattedString: string;
} {
  const baseValue = arkanaStats[statName];
  const capitalizedName = statName.charAt(0).toUpperCase() + statName.slice(1);

  // Collect stat_value effects
  const statValueEffects: Array<{ name: string; modifier: number }> = [];
  let statValueTotal = 0;

  if (liveStats) {
    for (const activeEffect of activeEffects) {
      const effectDef = getEffectDefinition(activeEffect.effectId);
      if (effectDef &&
          effectDef.category === 'stat_modifier' &&
          effectDef.stat === capitalizedName &&
          (effectDef.modifierType === 'stat_value' || !effectDef.modifierType)) {
        const modifier = effectDef.modifier || 0;
        // Use source name if available, otherwise fall back to effect name
        const displayName = activeEffect.sourceName
          ? `${activeEffect.sourceName}[${activeEffect.sourceType}]`
          : activeEffect.name;
        statValueEffects.push({ name: displayName, modifier });
        statValueTotal += modifier;
      }
    }
  }

  // Calculate effective stat and tier modifier
  const effectiveStat = baseValue + statValueTotal;
  const tierModifier = calculateStatModifier(effectiveStat);

  // Collect roll_bonus effects
  const rollBonusEffects: Array<{ name: string; modifier: number }> = [];
  let rollBonusTotal = 0;

  if (liveStats) {
    for (const activeEffect of activeEffects) {
      const effectDef = getEffectDefinition(activeEffect.effectId);
      if (effectDef &&
          effectDef.category === 'stat_modifier' &&
          effectDef.stat === capitalizedName &&
          effectDef.modifierType === 'roll_bonus') {
        const modifier = effectDef.modifier || 0;
        // Use source name if available, otherwise fall back to effect name
        const displayName = activeEffect.sourceName
          ? `${activeEffect.sourceName}[${activeEffect.sourceType}]`
          : activeEffect.name;
        rollBonusEffects.push({ name: displayName, modifier });
        rollBonusTotal += modifier;
      }
    }
  }

  // Calculate final modifier
  const finalModifier = tierModifier + rollBonusTotal;

  // Build formatted string
  let formattedString = '';

  // Start with stat name and brackets
  if (statValueEffects.length > 0) {
    // Has stat_value effects: "Physical[2 +Strength(3) +Buff(1) =6](+3)"
    const effectsStr = statValueEffects
      .map(e => {
        const sign = e.modifier >= 0 ? '+' : '';
        return `${sign}${e.name}(${e.modifier})`;
      })
      .join(' ');
    const tierSign = tierModifier >= 0 ? '+' : '';
    formattedString = `${capitalizedName}[${baseValue} ${effectsStr} =${effectiveStat}](${tierSign}${tierModifier})`;
  } else {
    // No stat_value effects: "Physical[2](+0)"
    const tierSign = tierModifier >= 0 ? '+' : '';
    formattedString = `${capitalizedName}[${baseValue}](${tierSign}${tierModifier})`;
  }

  // Add roll_bonus effects outside brackets
  if (rollBonusEffects.length > 0) {
    const bonusesStr = rollBonusEffects
      .map(e => {
        const sign = e.modifier >= 0 ? '+' : '';
        return `${sign}${e.name}(${e.modifier})`;
      })
      .join(' ');
    formattedString += ` ${bonusesStr}`;
  }

  return {
    baseStat: baseValue,
    statValueEffects,
    effectiveStat,
    tierModifier,
    rollBonusEffects,
    finalModifier,
    formattedString
  };
}

/**
 * Get detailed defense calculation breakdown for displaying target's TN in combat messages
 *
 * Returns complete breakdown showing:
 * - Base TN (always 10)
 * - Target's base stat value
 * - All stat_value effects with names and values
 * - Effective stat after stat_value modifiers
 * - Tier modifier calculated from effective stat
 * - All roll_bonus effects with names and values
 * - Final TN (10 + tier modifier + roll bonuses)
 * - Formatted string ready for display
 *
 * Example format: "10 + Dexterity[4 +Agility(1) =5](+2) +Combat Reflexes[perk](1) = 13"
 *
 * @param arkanaStats - Base character stats
 * @param liveStats - Current active effect modifiers
 * @param statName - Which stat to calculate (physical, dexterity, mental, perception)
 * @param activeEffects - Active effects for extracting effect names
 * @returns Detailed defense calculation breakdown object
 */
export function getDetailedDefenseCalculation(
  arkanaStats: ArkanaStats,
  liveStats: LiveStats | null | undefined,
  statName: 'physical' | 'dexterity' | 'mental' | 'perception',
  activeEffects: ActiveEffect[]
): {
  baseTN: number;
  baseStat: number;
  statValueEffects: Array<{ name: string; modifier: number }>;
  effectiveStat: number;
  tierModifier: number;
  rollBonusEffects: Array<{ name: string; modifier: number }>;
  finalTN: number;
  formattedString: string;
} {
  const baseValue = arkanaStats[statName];
  const capitalizedName = statName.charAt(0).toUpperCase() + statName.slice(1);
  const baseTN = 10;

  // Collect stat_value effects
  const statValueEffects: Array<{ name: string; modifier: number }> = [];
  let statValueTotal = 0;

  if (liveStats) {
    for (const activeEffect of activeEffects) {
      const effectDef = getEffectDefinition(activeEffect.effectId);
      if (effectDef &&
          effectDef.category === 'stat_modifier' &&
          effectDef.stat === capitalizedName &&
          (effectDef.modifierType === 'stat_value' || !effectDef.modifierType)) {
        const modifier = effectDef.modifier || 0;
        // Use source name if available, otherwise fall back to effect name
        const displayName = activeEffect.sourceName
          ? `${activeEffect.sourceName}[${activeEffect.sourceType}]`
          : activeEffect.name;
        statValueEffects.push({ name: displayName, modifier });
        statValueTotal += modifier;
      }
    }
  }

  // Calculate effective stat and tier modifier
  const effectiveStat = baseValue + statValueTotal;
  const tierModifier = calculateStatModifier(effectiveStat);

  // Collect roll_bonus effects
  const rollBonusEffects: Array<{ name: string; modifier: number }> = [];
  let rollBonusTotal = 0;

  if (liveStats) {
    for (const activeEffect of activeEffects) {
      const effectDef = getEffectDefinition(activeEffect.effectId);
      if (effectDef &&
          effectDef.category === 'stat_modifier' &&
          effectDef.stat === capitalizedName &&
          effectDef.modifierType === 'roll_bonus') {
        const modifier = effectDef.modifier || 0;
        // Use source name if available, otherwise fall back to effect name
        const displayName = activeEffect.sourceName
          ? `${activeEffect.sourceName}[${activeEffect.sourceType}]`
          : activeEffect.name;
        rollBonusEffects.push({ name: displayName, modifier });
        rollBonusTotal += modifier;
      }
    }
  }

  // Calculate final TN
  const finalTN = baseTN + tierModifier + rollBonusTotal;

  // Build formatted string
  let formattedString = '';

  // Start with "10 + StatName[...]"
  if (statValueEffects.length > 0) {
    // Has stat_value effects: "10 + Dexterity[4 +Agility(1) =5](+2)"
    const effectsStr = statValueEffects
      .map(e => {
        const sign = e.modifier >= 0 ? '+' : '';
        return `${sign}${e.name}(${e.modifier})`;
      })
      .join(' ');
    const tierSign = tierModifier >= 0 ? '+' : '';
    formattedString = `${baseTN} + ${capitalizedName}[${baseValue} ${effectsStr} =${effectiveStat}](${tierSign}${tierModifier})`;
  } else {
    // No stat_value effects: "10 + Dexterity[4](+2)"
    const tierSign = tierModifier >= 0 ? '+' : '';
    formattedString = `${baseTN} + ${capitalizedName}[${baseValue}](${tierSign}${tierModifier})`;
  }

  // Add roll_bonus effects
  if (rollBonusEffects.length > 0) {
    const bonusesStr = rollBonusEffects
      .map(e => {
        const sign = e.modifier >= 0 ? '+' : '';
        return `${sign}${e.name}(${e.modifier})`;
      })
      .join(' ');
    formattedString += ` ${bonusesStr}`;
  }

  // Add final TN at the end
  formattedString += ` = ${finalTN}`;

  return {
    baseTN,
    baseStat: baseValue,
    statValueEffects,
    effectiveStat,
    tierModifier,
    rollBonusEffects,
    finalTN,
    formattedString
  };
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
