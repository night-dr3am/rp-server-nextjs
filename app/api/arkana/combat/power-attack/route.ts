import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerAttackSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers, getAllPerks, getAllCybernetics, getAllMagicSchools } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import { executeEffect, applyActiveEffect, recalculateLiveStats, buildArkanaStatsUpdate, parseActiveEffects, processEffectsTurn, calculateDamageReduction } from '@/lib/arkana/effectsUtils';
import { getPassiveEffects, passiveEffectsToActiveFormat } from '@/lib/arkana/abilityUtils';
import type { CommonPower, ArchetypePower, Perk, Cybernetic, MagicSchool, EffectResult } from '@/lib/arkana/types';

// Build human-readable effect message
function buildEffectMessage(result: EffectResult): string {
  const def = result.effectDef;

  if (def.category === 'damage' && result.damage) {
    return `${result.damage} ${def.damageType} damage`;
  }

  if (def.category === 'stat_modifier') {
    const sign = (def.modifier || 0) >= 0 ? '+' : '';
    let duration = '';
    if (def.duration?.startsWith('turns:')) {
      const turns = def.duration.split(':')[1];
      duration = ` (${turns} ${turns === '1' ? 'turn' : 'turns'})`;
    } else if (def.duration === 'scene') {
      duration = ' (scene)';
    }
    return `${sign}${def.modifier} ${def.stat}${duration}`;
  }

  if (def.category === 'control') {
    return `${def.controlType || 'control'} effect`;
  }

  if (def.category === 'heal' && result.heal) {
    return `Heals ${result.heal} HP`;
  }

  if (def.category === 'utility') {
    let duration = '';
    if (def.duration?.startsWith('turns:')) {
      const turns = def.duration.split(':')[1];
      duration = ` (${turns} ${turns === '1' ? 'turn' : 'turns'})`;
    } else if (def.duration === 'scene') {
      duration = ' (scene)';
    }
    return `${def.name}${duration}`;
  }

  if (def.category === 'defense') {
    let duration = '';
    if (def.duration?.startsWith('turns:')) {
      const turns = def.duration.split(':')[1];
      duration = ` (${turns} ${turns === '1' ? 'turn' : 'turns'})`;
    } else if (def.duration === 'scene') {
      duration = ' (scene)';
    }
    const reduction = def.damageReduction || 0;
    return `Damage Reduction -${reduction}${duration}`;
  }

  // Fallback: use effect name
  return def.name;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { error, value } = arkanaPowerAttackSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { attacker_uuid, power_id, power_name, target_uuid, universe, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get attacker and target with their stats
    const [attacker, target] = await Promise.all([
      prisma.user.findFirst({
        where: { slUuid: attacker_uuid, universe: 'arkana' },
        include: { arkanaStats: true, stats: true }
      }),
      prisma.user.findFirst({
        where: { slUuid: target_uuid, universe: 'arkana' },
        include: { arkanaStats: true, stats: true }
      })
    ]);

    // Validate both players exist
    if (!attacker?.arkanaStats?.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Attacker not found or registration incomplete' },
        { status: 404 }
      );
    }

    if (!target?.arkanaStats?.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Target not found or registration incomplete' },
        { status: 404 }
      );
    }

    // Check if target is conscious
    if (!target.stats || target.stats.health <= 0) {
      return NextResponse.json(
        { success: false, error: 'Target is unconscious' },
        { status: 400 }
      );
    }

    // Check if target is in RP mode (status === 0 means IC/RP mode)
    if (target.stats.status !== 0) {
      return NextResponse.json(
        { success: false, error: 'Target player is not in RP mode' },
        { status: 400 }
      );
    }

    // Load arkana data (needed for passive effects from perks/cybernetics/magic)
    await loadAllData();
    const allCommonPowers = getAllCommonPowers();
    const allArchPowers = getAllArchPowers();
    const allPerks = getAllPerks();
    const allCybernetics = getAllCybernetics();
    const allMagicSchools = getAllMagicSchools();

    // Calculate liveStats with active effects AND passive effects from perks/cybernetics/magic
    const attackerActiveEffects = parseActiveEffects(attacker.arkanaStats.activeEffects);
    const targetActiveEffects = parseActiveEffects(target.arkanaStats.activeEffects);

    // Get passive effects from perks/cybernetics/magic
    const attackerPassiveEffectIds = getPassiveEffects(
      (attacker.arkanaStats.perks as string[]) || [],
      (attacker.arkanaStats.cybernetics as string[]) || [],
      (attacker.arkanaStats.magicWeaves as string[]) || []
    );
    const targetPassiveEffectIds = getPassiveEffects(
      (target.arkanaStats.perks as string[]) || [],
      (target.arkanaStats.cybernetics as string[]) || [],
      (target.arkanaStats.magicWeaves as string[]) || []
    );

    // Convert passive effects to ActiveEffect format and combine with active effects
    const attackerPassiveAsActive = passiveEffectsToActiveFormat(attackerPassiveEffectIds);
    const targetPassiveAsActive = passiveEffectsToActiveFormat(targetPassiveEffectIds);

    const attackerCombinedEffects = [...attackerActiveEffects, ...attackerPassiveAsActive];
    const targetCombinedEffects = [...targetActiveEffects, ...targetPassiveAsActive];

    // Recalculate liveStats with both active and passive effects
    const attackerLiveStats = recalculateLiveStats(attacker.arkanaStats, attackerCombinedEffects);
    const targetLiveStats = recalculateLiveStats(target.arkanaStats, targetCombinedEffects);

    // Find the ability (search all 5 ability types: common powers, archetype powers, perks, cybernetics, magic weaves)
    let power: CommonPower | ArchetypePower | Perk | Cybernetic | MagicSchool | undefined = undefined;

    if (power_id) {
      // Search by ID in all ability types
      power = allCommonPowers.find((p: CommonPower) => p.id === power_id) ||
              allArchPowers.find((p: ArchetypePower) => p.id === power_id) ||
              allPerks.find((p: Perk) => p.id === power_id) ||
              allCybernetics.find((c: Cybernetic) => c.id === power_id) ||
              allMagicSchools.find((m: MagicSchool) => m.id === power_id);
    } else if (power_name) {
      // Search by name (case-insensitive) in all ability types
      power = allCommonPowers.find((p: CommonPower) => p.name.toLowerCase() === power_name.toLowerCase()) ||
              allArchPowers.find((p: ArchetypePower) => p.name.toLowerCase() === power_name.toLowerCase()) ||
              allPerks.find((p: Perk) => p.name.toLowerCase() === power_name.toLowerCase()) ||
              allCybernetics.find((c: Cybernetic) => c.name.toLowerCase() === power_name.toLowerCase()) ||
              allMagicSchools.find((m: MagicSchool) => m.name.toLowerCase() === power_name.toLowerCase());
    }

    if (!power) {
      return NextResponse.json(
        { success: false, error: 'Power not found' },
        { status: 404 }
      );
    }

    // Verify ownership across all ability types
    const userCommonPowerIds = (attacker.arkanaStats.commonPowers as string[]) || [];
    const userArchPowerIds = (attacker.arkanaStats.archetypePowers as string[]) || [];
    const userPerkIds = (attacker.arkanaStats.perks as string[]) || [];
    const userCyberneticIds = (attacker.arkanaStats.cybernetics as string[]) || [];
    const userMagicWeaveIds = (attacker.arkanaStats.magicWeaves as string[]) || [];

    const ownsPower = userCommonPowerIds.includes(power.id) ||
                      userArchPowerIds.includes(power.id) ||
                      userPerkIds.includes(power.id) ||
                      userCyberneticIds.includes(power.id) ||
                      userMagicWeaveIds.includes(power.id);

    if (!ownsPower) {
      return NextResponse.json(
        { success: false, error: 'Attacker does not own this power' },
        { status: 403 }
      );
    }

    // Execute effects using structured data
    const attackEffects = (power.effects?.attack && Array.isArray(power.effects.attack))
      ? power.effects.attack
      : [];
    const appliedEffects: EffectResult[] = [];
    let totalDamage = 0;
    let attackSuccess = false;
    let rollDescription = '';

    // First, execute check effects to determine success (using effective stats)
    for (const effectId of attackEffects) {
      if (effectId.startsWith('check_')) {
        const baseStatName = power.baseStat?.toLowerCase() || 'mental';
        let targetStatValue: number;
        if (baseStatName === 'physical') targetStatValue = target.arkanaStats.physical;
        else if (baseStatName === 'mental') targetStatValue = target.arkanaStats.mental;
        else if (baseStatName === 'dexterity') targetStatValue = target.arkanaStats.dexterity;
        else if (baseStatName === 'perception') targetStatValue = target.arkanaStats.perception;
        else targetStatValue = target.arkanaStats.mental;

        const result = executeEffect(effectId, attacker.arkanaStats, target.arkanaStats, targetStatValue, attackerLiveStats, targetLiveStats);
        if (result) {
          attackSuccess = result.success;
          rollDescription = result.rollInfo || '';
        }
        break;
      }
    }

    // If attack failed on check, process turn and return miss
    if (!attackSuccess && attackEffects.some((e: string) => e.startsWith('check_'))) {
      // Process turn for attacker (decrement all effects) even on failure
      // Note: attackerActiveEffects already defined above (without passive effects)
      const turnProcessed = processEffectsTurn(attackerActiveEffects, attacker.arkanaStats);

      await prisma.arkanaStats.update({
        where: { userId: attacker.id },
        data: buildArkanaStatsUpdate({
          activeEffects: turnProcessed.activeEffects,
          liveStats: turnProcessed.liveStats
        })
      });

      return NextResponse.json({
        success: true,
        data: {
          attackSuccess: 'false',
          powerUsed: power.name,
          powerBaseStat: power.baseStat || 'Mental',
          rollInfo: rollDescription,
          totalDamage: 0,
          affected: [],
          target: {
            uuid: target.slUuid,
            name: encodeForLSL(target.arkanaStats.characterName),
            healthBefore: target.stats.health,
            healthAfter: target.stats.health,
            isUnconscious: (target.stats.health <= 0) ? 'true' : 'false'
          },
          message: encodeForLSL(`${attacker.arkanaStats.characterName} uses ${power.name} on ${target.arkanaStats.characterName} - MISS! ${rollDescription}`)
        }
      });
    }

    // Attack succeeded - apply all non-check effects (using effective stats)
    for (const effectId of attackEffects) {
      if (!effectId.startsWith('check_')) {
        const result = executeEffect(effectId, attacker.arkanaStats, target.arkanaStats, undefined, attackerLiveStats, targetLiveStats);
        if (result) {
          appliedEffects.push(result);
          if (result.damage) totalDamage += result.damage;
        }
      }
    }

    // Calculate damage reduction from target's defense effects
    const damageReduction = calculateDamageReduction(targetCombinedEffects);
    const damageAfterReduction = Math.max(0, totalDamage - damageReduction);

    // Apply damage to target health
    let newTargetHealth = target.stats.health;
    if (damageAfterReduction > 0) {
      newTargetHealth = Math.max(0, target.stats.health - damageAfterReduction);
      await prisma.userStats.update({
        where: { userId: target.id },
        data: { health: newTargetHealth, lastUpdated: new Date() }
      });
    }

    // Process activeEffects and liveStats for target and attacker
    const targetEffects = appliedEffects.filter(e =>
      e.effectDef.target === 'enemy' || e.effectDef.target === 'single'
    );
    const selfEffects = appliedEffects.filter(e =>
      e.effectDef.target === 'self'
    );

    // Update target's activeEffects and liveStats
    if (targetEffects.length > 0) {
      let targetActiveEffects = parseActiveEffects(target.arkanaStats.activeEffects);

      for (const effectResult of targetEffects) {
        targetActiveEffects = applyActiveEffect(targetActiveEffects, effectResult, attacker.arkanaStats.characterName);
      }

      const targetLiveStats = recalculateLiveStats(target.arkanaStats, targetActiveEffects);

      await prisma.arkanaStats.update({
        where: { userId: target.id },
        data: buildArkanaStatsUpdate({
          activeEffects: targetActiveEffects,
          liveStats: targetLiveStats
        })
      });
    }

    // Update attacker's activeEffects and liveStats
    // Note: attackerActiveEffects already defined above (without passive effects)
    // We need a mutable copy for turn processing

    // Process turn for attacker FIRST (decrement all PRE-EXISTING effects by 1 turn)
    const turnProcessed = processEffectsTurn(attackerActiveEffects, attacker.arkanaStats);
    let processedAttackerActiveEffects = turnProcessed.activeEffects;

    // THEN apply new self-effects from this attack (these should start with full duration)
    if (selfEffects.length > 0) {
      for (const effectResult of selfEffects) {
        processedAttackerActiveEffects = applyActiveEffect(processedAttackerActiveEffects, effectResult, attacker.arkanaStats.characterName);
      }
    }

    // Recalculate liveStats with both decremented old effects AND new self-effects
    const finalLiveStats = recalculateLiveStats(attacker.arkanaStats, processedAttackerActiveEffects);

    await prisma.arkanaStats.update({
      where: { userId: attacker.id },
      data: buildArkanaStatsUpdate({
        activeEffects: processedAttackerActiveEffects,
        liveStats: finalLiveStats
      })
    });

    // Build comprehensive message with effect details
    const attackerName = attacker.arkanaStats.characterName;
    const targetName = target.arkanaStats.characterName;

    let message = `${attackerName} uses ${power.name} on ${targetName} - HIT! ${rollDescription}`;

    // Always show damage (even if 0), include damage reduction if present
    if (damageReduction > 0) {
      message += ` - ${damageAfterReduction} damage dealt (${damageReduction} blocked by defenses)`;
    } else {
      message += ` - ${totalDamage} damage dealt`;
    }

    // Add effect messages (targetEffects and selfEffects already filtered above)
    if (targetEffects.length > 0) {
      const msgs = targetEffects.map(buildEffectMessage);
      message += `. Target: ${msgs.join(', ')}`;
    }

    if (selfEffects.length > 0) {
      const msgs = selfEffects.map(buildEffectMessage);
      message += `. Attacker: ${msgs.join(', ')}`;
    }

    return NextResponse.json({
      success: true,
      data: {
        attackSuccess: 'true',
        powerUsed: power.name,
        powerBaseStat: power.baseStat || 'Mental',
        rollInfo: rollDescription,
        totalDamage: damageAfterReduction,  // Report damage after reduction
        affected: appliedEffects
          .filter(e => e.effectDef.target === 'enemy' || e.effectDef.target === 'single')
          .map(e => ({
            uuid: target.slUuid,
            name: encodeForLSL(targetName),
            effects: [buildEffectMessage(e)]
          })),
        target: {
          uuid: target.slUuid,
          name: encodeForLSL(targetName),
          healthBefore: target.stats.health,
          healthAfter: newTargetHealth,
          isUnconscious: (newTargetHealth <= 0) ? 'true' : 'false'
        },
        message: encodeForLSL(message)
      }
    });

  } catch (error: unknown) {
    console.error('Error processing power attack:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
