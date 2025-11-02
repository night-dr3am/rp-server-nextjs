import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerAttackSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers, getAllPerks, getAllCybernetics, getAllMagicSchools, getEffectDefinition } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import { executeEffect, applyActiveEffect, recalculateLiveStats, buildArkanaStatsUpdate, parseActiveEffects, processEffectsTurnAndApplyHealing, calculateDamageReduction, getDetailedStatCalculation, getDetailedDefenseCalculation, determineApplicableTargets } from '@/lib/arkana/effectsUtils';
import { getPassiveEffectsWithSource, passiveEffectsToActiveFormat } from '@/lib/arkana/abilityUtils';
import type { CommonPower, ArchetypePower, Perk, Cybernetic, MagicSchool, EffectResult, LiveStats } from '@/lib/arkana/types';

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

    // Build allPotentialTargets array for multi-target attacks
    type UserWithStats = typeof attacker;
    const allPotentialTargets: UserWithStats[] = [target];

    // Load nearby users for multi-target attacks (same pattern as power-activate)
    if (value.nearby_uuids && Array.isArray(value.nearby_uuids) && value.nearby_uuids.length > 0) {
      const nearbyUsers = await prisma.user.findMany({
        where: {
          slUuid: { in: value.nearby_uuids },
          universe: 'arkana'
        },
        include: { arkanaStats: true, stats: true }
      });

      // Filter to registered, conscious users in RP mode (exclude attacker)
      const validNearby = nearbyUsers.filter(u =>
        u?.arkanaStats?.registrationCompleted &&
        u.stats?.status === 0 &&
        u.stats.health > 0 &&  // Must be conscious for attacks
        u.slUuid !== attacker.slUuid &&
        u.slUuid !== target.slUuid  // Don't duplicate target
      );

      allPotentialTargets.push(...validNearby);
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

    // Get passive effects from perks/cybernetics/magic WITH source tracking
    const attackerPassiveEffectsWithSource = getPassiveEffectsWithSource(
      (attacker.arkanaStats.perks as string[]) || [],
      (attacker.arkanaStats.cybernetics as string[]) || [],
      (attacker.arkanaStats.magicWeaves as string[]) || []
    );
    const targetPassiveEffectsWithSource = getPassiveEffectsWithSource(
      (target.arkanaStats.perks as string[]) || [],
      (target.arkanaStats.cybernetics as string[]) || [],
      (target.arkanaStats.magicWeaves as string[]) || []
    );

    // Convert passive effects to ActiveEffect format (with source info) and combine with active effects
    const attackerPassiveAsActive = passiveEffectsToActiveFormat(attackerPassiveEffectsWithSource);
    const targetPassiveAsActive = passiveEffectsToActiveFormat(targetPassiveEffectsWithSource);

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

    // Verify ownership across all ability types and determine source type
    const userCommonPowerIds = (attacker.arkanaStats.commonPowers as string[]) || [];
    const userArchPowerIds = (attacker.arkanaStats.archetypePowers as string[]) || [];
    const userPerkIds = (attacker.arkanaStats.perks as string[]) || [];
    const userCyberneticIds = (attacker.arkanaStats.cybernetics as string[]) || [];
    const userMagicWeaveIds = (attacker.arkanaStats.magicWeaves as string[]) || [];

    let powerSourceType: 'power' | 'perk' | 'cybernetic' | 'magic' = 'power';
    let ownsPower = false;

    if (userCommonPowerIds.includes(power.id) || userArchPowerIds.includes(power.id)) {
      ownsPower = true;
      powerSourceType = 'power';
    } else if (userPerkIds.includes(power.id)) {
      ownsPower = true;
      powerSourceType = 'perk';
    } else if (userCyberneticIds.includes(power.id)) {
      ownsPower = true;
      powerSourceType = 'cybernetic';
    } else if (userMagicWeaveIds.includes(power.id)) {
      ownsPower = true;
      powerSourceType = 'magic';
    }

    if (!ownsPower) {
      return NextResponse.json(
        { success: false, error: 'Attacker does not own this power' },
        { status: 403 }
      );
    }

    // Create source info for effects tracking
    const sourceInfo = {
      sourceId: power.id,
      sourceName: power.name,
      sourceType: powerSourceType
    };

    // Execute effects using structured data
    const attackEffects = (power.effects?.attack && Array.isArray(power.effects.attack))
      ? power.effects.attack
      : [];
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
          // Get detailed calculation breakdown for the message
          const baseStat = (power.baseStat?.toLowerCase() || 'mental') as 'physical' | 'dexterity' | 'mental' | 'perception';
          const attackerCalc = getDetailedStatCalculation(
            attacker.arkanaStats,
            attackerLiveStats,
            baseStat,
            attackerCombinedEffects
          );

          // Get target's detailed defense calculation
          // Use the defenseStat from result if available, otherwise default to baseStat
          const defenseStat = result.defenseStat || baseStat;
          const targetCalc = getDetailedDefenseCalculation(
            target.arkanaStats,
            targetLiveStats,
            defenseStat,
            targetCombinedEffects
          );

          // Extract d20 roll and total from the old rollInfo format
          const rollMatch = (result.rollInfo || '').match(/Roll: (\d+)\+(-?\d+)=(-?\d+) vs TN:(\d+)/);
          if (rollMatch) {
            const [, d20, , total] = rollMatch;
            rollDescription = `Roll: d20(${d20}) + ${attackerCalc.formattedString} = ${total} vs TN: ${targetCalc.formattedString}`;
          } else {
            rollDescription = result.rollInfo || '';
          }
        }
        break;
      }
    }

    // If attack failed on check, process turn and return miss
    if (!attackSuccess && attackEffects.some((e: string) => e.startsWith('check_'))) {
      // Process turn for attacker (decrement all effects) even on failure
      // Note: attackerActiveEffects already defined above (without passive effects)
      const turnProcessed = await processEffectsTurnAndApplyHealing(
        attacker as typeof attacker & { arkanaStats: NonNullable<typeof attacker.arkanaStats> },
        attackerActiveEffects,
        0  // No immediate healing on miss
      );

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

    // Attack succeeded - apply all non-check effects to applicable targets (multi-target support)
    // Map to track effects and damage per target
    const appliedEffectsMap = new Map<string, { effects: EffectResult[], damage: number }>();

    for (const effectId of attackEffects) {
      if (effectId.startsWith('check_')) continue;

      const effectDef = getEffectDefinition(effectId);
      if (!effectDef) continue;

      // Determine applicable targets using centralized utility (supports social groups)
      const applicableTargets = determineApplicableTargets(effectDef.target, attacker, target, allPotentialTargets);

      // Execute effect for each applicable target
      for (const applicableTarget of applicableTargets) {
        if (!applicableTarget?.arkanaStats) continue;

        // Calculate or reuse liveStats for this target
        let currentTargetLiveStats: LiveStats = {};
        if (applicableTarget.slUuid === target.slUuid) {
          currentTargetLiveStats = targetLiveStats; // Reuse primary target's already-calculated stats
        } else if (applicableTarget.slUuid === attacker.slUuid) {
          currentTargetLiveStats = attackerLiveStats; // Reuse attacker's stats for self-effects
        } else {
          // Calculate fresh liveStats for other nearby targets
          const activeEffects = parseActiveEffects(applicableTarget.arkanaStats.activeEffects);
          const passiveEffects = getPassiveEffectsWithSource(
            (applicableTarget.arkanaStats.perks as string[]) || [],
            (applicableTarget.arkanaStats.cybernetics as string[]) || [],
            (applicableTarget.arkanaStats.magicWeaves as string[]) || []
          );
          const combined = [...activeEffects, ...passiveEffectsToActiveFormat(passiveEffects)];
          currentTargetLiveStats = recalculateLiveStats(applicableTarget.arkanaStats, combined);
        }

        // Execute effect on this target
        const result = executeEffect(effectId, attacker.arkanaStats, applicableTarget.arkanaStats, undefined, attackerLiveStats, currentTargetLiveStats);

        if (result) {
          const key = applicableTarget.slUuid;
          if (!appliedEffectsMap.has(key)) {
            appliedEffectsMap.set(key, { effects: [], damage: 0 });
          }
          const entry = appliedEffectsMap.get(key)!;
          entry.effects.push(result);
          if (result.damage) entry.damage += result.damage;
        }
      }
    }

    // Process ALL targets in appliedEffectsMap (damage + effects application)
    // Track which users need database updates
    const affectedTargets: Array<{
      user: UserWithStats;
      effectsForUser: EffectResult[];
      damageDealt: number;
      damageReduction: number;
      healthBefore: number;
      healthAfter: number;
    }> = [];

    for (const [uuid, entry] of appliedEffectsMap.entries()) {
      const affectedUser = [attacker, ...allPotentialTargets].find(u => u.slUuid === uuid);
      if (!affectedUser?.arkanaStats) continue;

      // Get combined effects for damage reduction calculation
      const userActiveEffects = parseActiveEffects(affectedUser.arkanaStats.activeEffects);
      const userPassiveEffects = getPassiveEffectsWithSource(
        (affectedUser.arkanaStats.perks as string[]) || [],
        (affectedUser.arkanaStats.cybernetics as string[]) || [],
        (affectedUser.arkanaStats.magicWeaves as string[]) || []
      );
      const userCombinedEffects = [...userActiveEffects, ...passiveEffectsToActiveFormat(userPassiveEffects)];

      // Calculate damage reduction and apply damage
      const damageReduction = calculateDamageReduction(userCombinedEffects);
      const damageAfterReduction = Math.max(0, entry.damage - damageReduction);
      const healthBefore = affectedUser.stats?.health || 0;
      let healthAfter = healthBefore;

      // Apply damage to health (only if user has stats and damage > 0)
      if (affectedUser.stats && damageAfterReduction > 0) {
        healthAfter = Math.max(0, healthBefore - damageAfterReduction);
        await prisma.userStats.update({
          where: { userId: affectedUser.id },
          data: { health: healthAfter, lastUpdated: new Date() }
        });
      }

      // Apply non-damage effects to activeEffects
      const nonSelfEffects = entry.effects.filter(e =>
        e.effectDef.target !== 'self' && e.effectDef.category !== 'damage'
      );

      if (nonSelfEffects.length > 0) {
        let updatedActiveEffects = userActiveEffects;

        for (const effectResult of nonSelfEffects) {
          updatedActiveEffects = applyActiveEffect(updatedActiveEffects, effectResult, attacker.arkanaStats.characterName, sourceInfo);
        }

        const updatedLiveStats = recalculateLiveStats(affectedUser.arkanaStats, updatedActiveEffects);

        await prisma.arkanaStats.update({
          where: { userId: affectedUser.id },
          data: buildArkanaStatsUpdate({
            activeEffects: updatedActiveEffects,
            liveStats: updatedLiveStats
          })
        });
      }

      // Track this affected target for response
      affectedTargets.push({
        user: affectedUser,
        effectsForUser: entry.effects,
        damageDealt: damageAfterReduction,
        damageReduction,
        healthBefore,
        healthAfter
      });
    }

    // Extract legacy variables for backward compatibility with attacker processing below
    const primaryTargetData = affectedTargets.find(t => t.user.slUuid === target.slUuid);
    const totalDamage = primaryTargetData?.damageDealt || 0;
    const newTargetHealth = primaryTargetData?.healthAfter || target.stats.health;

    // Collect self-effects for attacker processing
    const appliedEffects: EffectResult[] = [];
    for (const entry of appliedEffectsMap.values()) {
      appliedEffects.push(...entry.effects);
    }
    const selfEffects = appliedEffects.filter(e => e.effectDef.target === 'self');

    // Update attacker's activeEffects and liveStats
    // Note: attackerActiveEffects already defined above (without passive effects)
    // We need a mutable copy for turn processing

    // Calculate immediate healing from self-effects (e.g., Drain, Life Tap) BEFORE processing turn
    let immediateHealing = 0;
    for (const effectResult of selfEffects) {
      if (effectResult.effectDef.category === 'heal' && effectResult.heal) {
        immediateHealing += effectResult.heal;
      }
    }

    // Process turn for attacker FIRST (decrement all PRE-EXISTING effects by 1 turn) and apply healing
    const turnProcessed = await processEffectsTurnAndApplyHealing(
      attacker as typeof attacker & { arkanaStats: NonNullable<typeof attacker.arkanaStats> },
      attackerActiveEffects,
      immediateHealing
    );
    let processedAttackerActiveEffects = turnProcessed.activeEffects;

    // THEN apply new self-effects from this attack (these should start with full duration)
    if (selfEffects.length > 0) {
      for (const effectResult of selfEffects) {
        processedAttackerActiveEffects = applyActiveEffect(processedAttackerActiveEffects, effectResult, attacker.arkanaStats!.characterName, sourceInfo);
      }
    }

    // Recalculate liveStats with both decremented old effects AND new self-effects
    const finalLiveStats = recalculateLiveStats(attacker.arkanaStats!, processedAttackerActiveEffects);

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

    // Always show damage for primary target (even if 0), include damage reduction if present
    const primaryDamageReduction = primaryTargetData?.damageReduction || 0;
    if (primaryDamageReduction > 0) {
      message += ` - ${totalDamage} damage dealt (${primaryDamageReduction} blocked by defenses)`;
    } else {
      message += ` - ${totalDamage} damage dealt`;
    }

    // Add effect messages for primary target
    const primaryTargetEffects = primaryTargetData?.effectsForUser.filter(e => e.effectDef.target !== 'self') || [];
    if (primaryTargetEffects.length > 0) {
      const msgs = primaryTargetEffects.map(buildEffectMessage);
      message += `. Target: ${msgs.join(', ')}`;
    }

    // Add self-effects message
    if (selfEffects.length > 0) {
      const msgs = selfEffects.map(buildEffectMessage);
      message += `. Attacker: ${msgs.join(', ')}`;
    }

    // Add multi-target summary if there are additional affected targets
    const additionalTargets = affectedTargets.filter(t => t.user.slUuid !== target.slUuid && t.user.slUuid !== attacker.slUuid);
    if (additionalTargets.length > 0) {
      const names = additionalTargets.map(t => t.user.arkanaStats?.characterName || 'Unknown').join(', ');
      message += `. Also affects: ${names}`;
    }

    return NextResponse.json({
      success: true,
      data: {
        attackSuccess: 'true',
        powerUsed: power.name,
        powerBaseStat: power.baseStat || 'Mental',
        rollInfo: rollDescription,
        totalDamage,  // Primary target damage after reduction
        affected: affectedTargets
          .filter(t => t.user.slUuid !== attacker.slUuid)  // Exclude attacker from affected list
          .map(t => ({
            uuid: t.user.slUuid,
            name: encodeForLSL(t.user.arkanaStats?.characterName || 'Unknown'),
            damage: t.damageDealt,
            healthBefore: t.healthBefore,
            healthAfter: t.healthAfter,
            isUnconscious: (t.healthAfter <= 0) ? 'true' : 'false',
            effects: t.effectsForUser
              .filter(e => e.effectDef.target !== 'self')
              .map(buildEffectMessage)
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
