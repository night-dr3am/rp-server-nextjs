import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerAttackSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers, getAllPerks, getAllCybernetics, getAllMagicSchools, getEffectDefinition } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import { executeEffect, applyActiveEffect, recalculateLiveStats, buildArkanaStatsUpdate, parseActiveEffects, processEffectsTurnAndApplyHealing, validateAndExecuteCheck, determineApplicableTargets, applyDamageAndHealing, buildEffectMessage, buildTargetEffectSummary, applyHealthBonusChanges } from '@/lib/arkana/effectsUtils';
import { getPassiveEffectsWithSource, passiveEffectsToActiveFormat } from '@/lib/arkana/abilityUtils';
import { loadCombatTarget, loadNearbyPlayers, buildPotentialTargets, validateCombatReadiness, type UserWithStats } from '@/lib/arkana/combatUtils';
import type { CommonPower, ArchetypePower, Perk, Cybernetic, MagicSchool, EffectResult, LiveStats } from '@/lib/arkana/types';

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

    // Get attacker with stats
    const attackerRaw = await prisma.user.findFirst({
      where: { slUuid: attacker_uuid, universe: 'arkana' },
      include: { arkanaStats: true, stats: true }
    });

    // Validate attacker
    const attackerValidation = validateCombatReadiness(attackerRaw, 'attacker');
    if (!attackerValidation.valid) {
      return NextResponse.json(
        { success: false, error: attackerValidation.error },
        { status: attackerValidation.statusCode || 404 }
      );
    }

    // Type assertion: attacker is now guaranteed non-null by validation
    const attacker = attackerRaw as NonNullable<typeof attackerRaw>;

    // Load target (may be null for area-of-effect powers)
    const targetRaw = await loadCombatTarget(target_uuid, 'arkana');

    // If target_uuid was PROVIDED but target NOT FOUND, return error
    if (target_uuid && !targetRaw) {
      return NextResponse.json(
        { success: false, error: 'Target not found' },
        { status: 404 }
      );
    }

    // Validate target if provided
    let target: NonNullable<typeof targetRaw> | null = null;
    if (targetRaw) {
      const targetValidation = validateCombatReadiness(targetRaw, 'target');
      if (!targetValidation.valid) {
        return NextResponse.json(
          { success: false, error: targetValidation.error },
          { status: targetValidation.statusCode || 400 }
        );
      }
      // Type assertion: target is now guaranteed valid by validation
      target = targetRaw as NonNullable<typeof targetRaw>;
    }

    // Load nearby users for multi-target/area attacks
    const excludeUuids = [attacker.slUuid];
    if (target) excludeUuids.push(target.slUuid);

    const nearbyUsers = await loadNearbyPlayers(
      value.nearby_uuids,
      'arkana',
      excludeUuids
    );

    // Build allPotentialTargets array for effect application
    const allPotentialTargets = buildPotentialTargets(target, nearbyUsers);

    // For area-of-effect powers without primary target, ensure we have at least nearby targets
    if (!target && allPotentialTargets.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid targets in area' },
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
    const attackerActiveEffects = parseActiveEffects(attacker.arkanaStats!.activeEffects);

    // Get passive effects from perks/cybernetics/magic WITH source tracking
    const attackerPassiveEffectsWithSource = getPassiveEffectsWithSource(
      (attacker.arkanaStats!.perks as string[]) || [],
      (attacker.arkanaStats!.cybernetics as string[]) || [],
      (attacker.arkanaStats!.magicWeaves as string[]) || []
    );

    // Convert passive effects to ActiveEffect format (with source info) and combine with active effects
    const attackerPassiveAsActive = passiveEffectsToActiveFormat(attackerPassiveEffectsWithSource);
    const attackerCombinedEffects = [...attackerActiveEffects, ...attackerPassiveAsActive];

    // Recalculate liveStats with both active and passive effects
    const attackerLiveStats = recalculateLiveStats(attacker.arkanaStats!, attackerCombinedEffects);

    // Calculate target liveStats if target exists (for single-target or targeted area attacks)
    let targetLiveStats: LiveStats = {};
    let targetCombinedEffects: typeof attackerCombinedEffects = [];
    if (target?.arkanaStats) {
      const targetActiveEffects = parseActiveEffects(target.arkanaStats.activeEffects);
      const targetPassiveEffectsWithSource = getPassiveEffectsWithSource(
        (target.arkanaStats.perks as string[]) || [],
        (target.arkanaStats.cybernetics as string[]) || [],
        (target.arkanaStats.magicWeaves as string[]) || []
      );
      const targetPassiveAsActive = passiveEffectsToActiveFormat(targetPassiveEffectsWithSource);
      targetCombinedEffects = [...targetActiveEffects, ...targetPassiveAsActive];
      targetLiveStats = recalculateLiveStats(target.arkanaStats, targetCombinedEffects);
    }

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
    const userCommonPowerIds = (attacker.arkanaStats!.commonPowers as string[]) || [];
    const userArchPowerIds = (attacker.arkanaStats!.archetypePowers as string[]) || [];
    const userPerkIds = (attacker.arkanaStats!.perks as string[]) || [];
    const userCyberneticIds = (attacker.arkanaStats!.cybernetics as string[]) || [];
    const userMagicWeaveIds = (attacker.arkanaStats!.magicWeaves as string[]) || [];

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

    // Determine if this power has any check effects
    const hasCheckEffects = attackEffects.some((e: string) => e.startsWith('check_'));

    // Powers without check effects automatically succeed
    if (!hasCheckEffects) {
      attackSuccess = true;
      rollDescription = 'Auto-success (no check required)';
    } else {
      // Execute check effects using shared validation function
      const checkResult = validateAndExecuteCheck(
        attackEffects,
        power,
        attacker as typeof attacker & { arkanaStats: NonNullable<typeof attacker.arkanaStats> },
        attackerLiveStats,
        attackerCombinedEffects,
        target ? (target as typeof target & { arkanaStats: NonNullable<typeof target.arkanaStats> }) : null,
        targetLiveStats,
        targetCombinedEffects,
        true  // requireTargetForChecks - validates that enemy_stat checks have a target
      );

      // Handle validation errors (e.g., enemy_stat check without target)
      if (checkResult.error) {
        return NextResponse.json(
          { success: false, error: checkResult.error.message },
          { status: checkResult.error.statusCode }
        );
      }

      attackSuccess = checkResult.success;
      rollDescription = checkResult.rollDescription;
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

      // For fixed TN checks, target may be null (area attacks)
      const attackerName = attacker.arkanaStats!.characterName;
      const missMessage = target
        ? `${attackerName} uses ${power.name} on ${target.arkanaStats!.characterName} - MISS! ${rollDescription}`
        : `${attackerName} uses ${power.name} - MISS! ${rollDescription}`;

      const responseData: {
        attackSuccess: string;
        powerUsed: string;
        powerBaseStat: string;
        rollInfo: string;
        totalDamage: number;
        affected: never[];
        message: string;
        target?: {
          uuid: string;
          name: string;
          healthBefore: number;
          healthAfter: number;
          isUnconscious: string;
        };
      } = {
        attackSuccess: 'false',
        powerUsed: power.name,
        powerBaseStat: power.baseStat || 'Mental',
        rollInfo: rollDescription,
        totalDamage: 0,
        affected: [],
        message: encodeForLSL(missMessage)
      };

      // Only include target info if target exists
      if (target) {
        responseData.target = {
          uuid: target.slUuid,
          name: encodeForLSL(target.arkanaStats!.characterName),
          healthBefore: target.stats!.health,
          healthAfter: target.stats!.health,
          isUnconscious: (target.stats!.health <= 0) ? 'true' : 'false'
        };
      }

      return NextResponse.json({
        success: true,
        data: responseData
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
        if (target && applicableTarget.slUuid === target.slUuid) {
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
        const result = executeEffect(effectId, attacker.arkanaStats!, applicableTarget.arkanaStats, undefined, attackerLiveStats, currentTargetLiveStats);

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
      const userPassiveAsActive = passiveEffectsToActiveFormat(userPassiveEffects);

      // Apply damage and healing with damage reduction and bounds checking using utility
      const healthBefore = affectedUser.stats?.health || 0;
      const damageHealResult = applyDamageAndHealing(
        healthBefore,
        affectedUser.arkanaStats.maxHP,
        entry.damage,
        0,  // No healing in power-attack (healing is handled separately via self-effects)
        userActiveEffects,
        userPassiveAsActive
      );
      const healthAfter = damageHealResult.newHP;
      const damageReduction = damageHealResult.damageReduction;
      const damageAfterReduction = damageHealResult.damageDealt;

      // Update health in database if damage was dealt
      if (affectedUser.stats && damageAfterReduction > 0) {
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
        // Store old active effects (BEFORE applying new effects) for Health bonus calculation
        // IMPORTANT: Create a COPY to prevent mutation
        const oldActiveEffects = [...userActiveEffects];

        let updatedActiveEffects = userActiveEffects;

        for (const effectResult of nonSelfEffects) {
          updatedActiveEffects = applyActiveEffect(updatedActiveEffects, effectResult, attacker.arkanaStats!.characterName, sourceInfo);
        }

        const updatedLiveStats = recalculateLiveStats(affectedUser.arkanaStats, updatedActiveEffects);

        // Handle Health stat modifiers (temporary maxHP increase) using shared utility
        const healthBonusResult = applyHealthBonusChanges(
          oldActiveEffects,
          updatedLiveStats,
          healthAfter,  // Current HP after damage was applied
          affectedUser.arkanaStats.maxHP
        );

        // Update arkanaStats with new maxHP and effects/liveStats
        await prisma.arkanaStats.update({
          where: { userId: affectedUser.id },
          data: buildArkanaStatsUpdate({
            activeEffects: updatedActiveEffects,
            liveStats: updatedLiveStats,
            maxHP: healthBonusResult.newMaxHP
          })
        });

        // Update current HP if Health bonus changed it (Option A behavior)
        if (healthBonusResult.newHP !== healthAfter && affectedUser.stats) {
          await prisma.userStats.update({
            where: { userId: affectedUser.id },
            data: { health: healthBonusResult.newHP, lastUpdated: new Date() }
          });
        }
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
    const primaryTargetData = target ? affectedTargets.find(t => t.user?.slUuid === target.slUuid) : null;
    const totalDamage = primaryTargetData?.damageDealt || 0;
    const newTargetHealth = primaryTargetData?.healthAfter || (target?.stats?.health ?? 0);

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

    // Store old active effects for Health bonus calculation (BEFORE turn processing and new effects)
    // IMPORTANT: Create a COPY to prevent mutation
    const oldAttackerActiveEffects = [...attackerActiveEffects];

    // Process turn for attacker FIRST (decrement all PRE-EXISTING effects by 1 turn) and apply healing
    const turnProcessed = await processEffectsTurnAndApplyHealing(
      attacker as typeof attacker & { arkanaStats: NonNullable<typeof attacker.arkanaStats> },
      attackerActiveEffects,
      immediateHealing
    );
    let processedAttackerActiveEffects = turnProcessed.activeEffects;
    const attackerNewHP = turnProcessed.newHP;

    // THEN apply new self-effects from this attack (these should start with full duration)
    if (selfEffects.length > 0) {
      for (const effectResult of selfEffects) {
        processedAttackerActiveEffects = applyActiveEffect(processedAttackerActiveEffects, effectResult, attacker.arkanaStats!.characterName, sourceInfo);
      }
    }

    // Recalculate liveStats with both decremented old effects AND new self-effects
    const finalLiveStats = recalculateLiveStats(attacker.arkanaStats!, processedAttackerActiveEffects);

    // Handle Health stat modifiers (temporary maxHP increase) for attacker
    const attackerHealthBonusResult = applyHealthBonusChanges(
      oldAttackerActiveEffects,
      finalLiveStats,
      attackerNewHP,
      attacker.arkanaStats!.maxHP
    );

    await prisma.arkanaStats.update({
      where: { userId: attacker.id },
      data: buildArkanaStatsUpdate({
        activeEffects: processedAttackerActiveEffects,
        liveStats: finalLiveStats,
        maxHP: attackerHealthBonusResult.newMaxHP
      })
    });

    // Update attacker's current HP if Health bonus changed it (Option A behavior)
    if (attackerHealthBonusResult.newHP !== attackerNewHP && attacker.stats) {
      await prisma.userStats.update({
        where: { userId: attacker.id },
        data: { health: attackerHealthBonusResult.newHP, lastUpdated: new Date() }
      });
    }

    // Build comprehensive message with effect details
    const attackerName = attacker.arkanaStats!.characterName;
    const targetName = target?.arkanaStats?.characterName;

    // Message format varies based on whether there's a primary target
    let message: string;
    if (target && targetName) {
      message = `${attackerName} uses ${power.name} on ${targetName} - HIT! ${rollDescription}`;

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
    } else {
      // Area attack without primary target
      message = `${attackerName} uses ${power.name} affecting ${affectedTargets.length} ${affectedTargets.length === 1 ? 'target' : 'targets'}`;

      // Add roll description if check was performed
      if (rollDescription) {
        message += ` - ${rollDescription}`;
      }
    }

    // Add self-effects message
    if (selfEffects.length > 0) {
      const msgs = selfEffects.map(buildEffectMessage);
      message += `. Attacker: ${msgs.join(', ')}`;
    }

    // Add multi-target summary if there are additional affected targets beyond primary
    const additionalTargets = affectedTargets.filter(t =>
      t.user?.slUuid !== target?.slUuid && t.user?.slUuid !== attacker.slUuid
    );
    if (additionalTargets.length > 0) {
      const summaries = additionalTargets.map(t =>
        buildTargetEffectSummary(
          t.user?.arkanaStats?.characterName || 'Unknown',
          t.effectsForUser
        )
      );
      message += `. Also affects: ${summaries.join(', ')}`;
    }

    // Build response data with optional target field
    const affectedData = affectedTargets
      .filter(t => t.user?.slUuid !== attacker.slUuid)  // Exclude attacker from affected list
      .map(t => ({
        uuid: t.user?.slUuid || '',
        name: encodeForLSL(t.user?.arkanaStats?.characterName || 'Unknown'),
        damage: t.damageDealt,
        healthBefore: t.healthBefore,
        healthAfter: t.healthAfter,
        isUnconscious: (t.healthAfter <= 0) ? 'true' : 'false',
        effects: t.effectsForUser
          .filter(e => e.effectDef.target !== 'self')
          .map(buildEffectMessage)
      }));

    const baseResponseData = {
      attackSuccess: 'true' as const,
      powerUsed: power.name,
      powerBaseStat: power.baseStat || 'Mental',
      rollInfo: rollDescription,
      totalDamage,  // Primary target damage after reduction (0 if no primary target)
      affected: affectedData,
      message: encodeForLSL(message)
    };

    // Only include target field if there was a primary target
    if (target) {
      return NextResponse.json({
        success: true,
        data: {
          ...baseResponseData,
          target: {
            uuid: target.slUuid,
            name: encodeForLSL(targetName || ''),
            healthBefore: target.stats?.health || 0,
            healthAfter: newTargetHealth,
            isUnconscious: (newTargetHealth <= 0) ? 'true' : 'false'
          }
        }
      });
    } else {
      return NextResponse.json({
        success: true,
        data: baseResponseData
      });
    }

  } catch (error: unknown) {
    console.error('Error processing power attack:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
