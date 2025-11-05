import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerActivateSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers, getEffectDefinition } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import { executeEffect, applyActiveEffect, recalculateLiveStats, buildArkanaStatsUpdate, parseActiveEffects, processEffectsTurnAndApplyHealing, validateAndExecuteCheck, determineApplicableTargets, extractImmediateEffects, applyDamageAndHealing, buildEffectMessage, buildTargetEffectSummary, applyHealthBonusChanges } from '@/lib/arkana/effectsUtils';
import { getPassiveEffectsWithSource, passiveEffectsToActiveFormat, loadPerk, loadCybernetic, loadMagicWeave, ownsPerk, ownsCybernetic, ownsMagicWeave } from '@/lib/arkana/abilityUtils';
import { loadCombatTarget, loadNearbyPlayers, buildPotentialTargets, validateCombatReadiness } from '@/lib/arkana/combatUtils';
import type { CommonPower, ArchetypePower, Perk, Cybernetic, MagicSchool, EffectResult, LiveStats } from '@/lib/arkana/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { error, value } = arkanaPowerActivateSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { caster_uuid, power_id, power_name, target_uuid, universe, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get caster with stats
    const casterRaw = await prisma.user.findFirst({
      where: { slUuid: caster_uuid, universe: 'arkana' },
      include: { arkanaStats: true, stats: true }
    });

    // Validate caster
    const casterValidation = validateCombatReadiness(casterRaw, 'caster');
    if (!casterValidation.valid) {
      return NextResponse.json(
        { success: false, error: casterValidation.error },
        { status: casterValidation.statusCode || 404 }
      );
    }

    // Type assertion: caster is now guaranteed non-null by validation
    const caster = casterRaw as NonNullable<typeof casterRaw>;

    // Load target (may be null for self/area powers)
    const targetRaw = await loadCombatTarget(target_uuid, 'arkana');

    // CRITICAL FIX: If target_uuid was PROVIDED but target NOT FOUND, return error
    if (target_uuid && !targetRaw) {
      return NextResponse.json(
        { success: false, error: 'Target not found' },
        { status: 404 }
      );
    }

    // Validate target if provided (note: targets for abilities don't need consciousness check)
    let target: NonNullable<typeof targetRaw> | null = null;
    if (targetRaw) {
      // For power-activate, we allow unconscious targets (e.g., healing/resurrection)
      // So we only check registration and RP mode
      if (!targetRaw.arkanaStats?.registrationCompleted) {
        return NextResponse.json(
          { success: false, error: 'Target not found or registration incomplete' },
          { status: 404 }
        );
      }
      if (!targetRaw.stats || targetRaw.stats.status !== 0) {
        return NextResponse.json(
          { success: false, error: 'Target is not in RP mode' },
          { status: 400 }
        );
      }
      target = targetRaw as NonNullable<typeof targetRaw>;
    }

    // Load nearby users for area effects
    const excludeUuids = [caster.slUuid];
    if (target) excludeUuids.push(target.slUuid);

    const nearbyUsers = await loadNearbyPlayers(
      value.nearby_uuids,
      'arkana',
      excludeUuids
    );

    // Build allPotentialTargets array
    const allPotentialTargets = buildPotentialTargets(target, nearbyUsers);

    // Load arkana data (needed for passive effects from perks/cybernetics/magic)
    await loadAllData();
    const allCommonPowers = getAllCommonPowers();
    const allArchPowers = getAllArchPowers();

    // Calculate liveStats with active effects AND passive effects from perks/cybernetics/magic
    const casterActiveEffectsForLiveStats = parseActiveEffects(caster.arkanaStats!.activeEffects);

    // Get passive effects from perks/cybernetics/magic for caster WITH source tracking
    const casterPassiveEffectsWithSource = getPassiveEffectsWithSource(
      (caster.arkanaStats!.perks as string[]) || [],
      (caster.arkanaStats!.cybernetics as string[]) || [],
      (caster.arkanaStats!.magicWeaves as string[]) || []
    );

    // Convert passive effects to ActiveEffect format (with source info) and combine with active effects
    const casterPassiveAsActive = passiveEffectsToActiveFormat(casterPassiveEffectsWithSource);
    const casterCombinedEffects = [...casterActiveEffectsForLiveStats, ...casterPassiveAsActive];

    // Recalculate caster liveStats with both active and passive effects
    const casterLiveStats = recalculateLiveStats(caster.arkanaStats!, casterCombinedEffects);

    // Calculate target liveStats if target exists
    let targetLiveStats: LiveStats = {};
    let targetCombinedEffects: typeof casterCombinedEffects = [];
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

    // Find the ability (power, perk, cybernetic, or magic weave)
    // ability_type can be: commonPower, archetypePower, perk, cybernetic, magicWeave
    type Ability = CommonPower | ArchetypePower | Perk | Cybernetic | MagicSchool;
    let ability: Ability | undefined = undefined;
    let abilityTypeName = 'power'; // For error messages

    const requestedAbilityType = value.ability_type || 'auto'; // Default to auto-detect

    if (requestedAbilityType === 'perk' || requestedAbilityType === 'auto') {
      if (power_id) {
        ability = loadPerk(power_id) || undefined;
      }
      if (ability) abilityTypeName = 'perk';
    }

    if (!ability && (requestedAbilityType === 'cybernetic' || requestedAbilityType === 'auto')) {
      if (power_id) {
        ability = loadCybernetic(power_id) || undefined;
      }
      if (ability) abilityTypeName = 'cybernetic';
    }

    if (!ability && (requestedAbilityType === 'magicWeave' || requestedAbilityType === 'auto')) {
      if (power_id) {
        ability = loadMagicWeave(power_id) || undefined;
      }
      if (ability) abilityTypeName = 'magic weave';
    }

    if (!ability && (requestedAbilityType === 'commonPower' || requestedAbilityType === 'archetypePower' || requestedAbilityType === 'auto')) {
      if (power_id) {
        ability = allCommonPowers.find((p: CommonPower) => p.id === power_id) ||
                  allArchPowers.find((p: ArchetypePower) => p.id === power_id);
      } else if (power_name) {
        ability = allCommonPowers.find((p: CommonPower) => p.name.toLowerCase() === power_name.toLowerCase()) ||
                  allArchPowers.find((p: ArchetypePower) => p.name.toLowerCase() === power_name.toLowerCase());
      }
      if (ability) abilityTypeName = 'power';
    }

    if (!ability) {
      return NextResponse.json(
        { success: false, error: `Ability not found (searched: ${requestedAbilityType})` },
        { status: 404 }
      );
    }

    // Verify ownership based on ability type
    const userPerks = (caster.arkanaStats!.perks as string[]) || [];
    const userCybernetics = (caster.arkanaStats!.cybernetics as string[]) || [];
    const userMagicWeaves = (caster.arkanaStats!.magicWeaves as string[]) || [];
    const userCommonPowerIds = (caster.arkanaStats!.commonPowers as string[]) || [];
    const userArchPowerIds = (caster.arkanaStats!.archetypePowers as string[]) || [];

    const ownsAbility =
      ownsPerk(userPerks, ability.id) ||
      ownsCybernetic(userCybernetics, ability.id) ||
      ownsMagicWeave(userMagicWeaves, ability.id) ||
      userCommonPowerIds.includes(ability.id) ||
      userArchPowerIds.includes(ability.id);

    if (!ownsAbility) {
      return NextResponse.json(
        { success: false, error: `Caster does not own this ${abilityTypeName}` },
        { status: 403 }
      );
    }

    // Execute effects using ability effects (or attack effects for offensive abilities)
    // For power-activate, we prefer 'ability' effects, but some perks/cybernetics might have 'attack' effects
    let activateEffects: string[] = [];
    if (ability.effects?.ability && Array.isArray(ability.effects.ability)) {
      activateEffects = ability.effects.ability;
    } else if (ability.effects?.attack && Array.isArray(ability.effects.attack)) {
      // Some cybernetics/perks might have attack effects (e.g., offensive cybernetics)
      activateEffects = ability.effects.attack;
    }

    let activationSuccess = true;
    let rollDescription = '';

    // Determine if this ability has any check effects
    const hasCheckEffects = activateEffects.some((e: string) => e.startsWith('check_'));

    // Execute check effects using shared validation function (if any exist)
    if (hasCheckEffects) {
      const checkResult = validateAndExecuteCheck(
        activateEffects,
        ability,
        caster as typeof caster & { arkanaStats: NonNullable<typeof caster.arkanaStats> },
        casterLiveStats,
        casterCombinedEffects,
        target ? (target as typeof target & { arkanaStats: NonNullable<typeof target.arkanaStats> }) : null,
        targetLiveStats,
        targetCombinedEffects,
        false  // requireTargetForChecks - power-activate allows checks without targets (fixed TN checks)
      );

      // Handle validation errors (shouldn't happen with requireTargetForChecks=false, but check anyway)
      if (checkResult.error) {
        return NextResponse.json(
          { success: false, error: checkResult.error.message },
          { status: checkResult.error.statusCode }
        );
      }

      activationSuccess = checkResult.success;
      rollDescription = checkResult.rollDescription;
    }

    // If activation failed on check, still process turn and return failure
    if (!activationSuccess && activateEffects.some((e: string) => e.startsWith('check_'))) {
      // Process turn for caster (decrement all effects) and apply healing even on failure
      const casterActiveEffects = parseActiveEffects(caster.arkanaStats!.activeEffects);
      const turnProcessed = await processEffectsTurnAndApplyHealing(
        caster as typeof caster & { arkanaStats: NonNullable<typeof caster.arkanaStats> },
        casterActiveEffects,
        0  // No immediate healing on failure
      );

      // Update ArkanaStats with decremented effects and updated liveStats
      await prisma.arkanaStats.update({
        where: { userId: caster.id },
        data: buildArkanaStatsUpdate({
          activeEffects: turnProcessed.activeEffects,
          liveStats: turnProcessed.liveStats
        })
      });

      return NextResponse.json({
        success: true,
        data: {
          activationSuccess: 'false',
          powerUsed: ability.name,
          powerBaseStat: ability.baseStat || 'Mental',
          rollInfo: rollDescription,
          affected: [],
          caster: {
            uuid: caster.slUuid,
            name: encodeForLSL(caster.arkanaStats!.characterName)
          },
          message: encodeForLSL(`${caster.arkanaStats!.characterName} attempts ${ability.name} - FAILED! ${rollDescription}`)
        }
      });
    }

    // Activation succeeded - apply all non-check effects to applicable targets
    const appliedEffectsMap = new Map<string, EffectResult[]>(); // Track per user

    for (const effectId of activateEffects) {
      if (effectId.startsWith('check_')) continue;

      const effectDef = getEffectDefinition(effectId);
      if (!effectDef) continue;

      // Determine which users should receive this effect using centralized utility
      // This now supports social groups filtering for all_allies and all_enemies
      // Filter out nulls before passing to determineApplicableTargets
      const validPotentialTargets = allPotentialTargets.filter((u): u is NonNullable<typeof u> => u !== null);
      const applicableTargets = determineApplicableTargets(effectDef.target, caster, target, validPotentialTargets);

      // Apply effect to each applicable target
      for (const applicableTarget of applicableTargets) {
        if (!applicableTarget || !applicableTarget.arkanaStats) continue;

        const targetLiveStats = (applicableTarget.arkanaStats.liveStats as LiveStats) || {};
        const result = executeEffect(effectId, caster.arkanaStats!, applicableTarget.arkanaStats, undefined, casterLiveStats, targetLiveStats);

        if (result) {
          const userKey = applicableTarget.slUuid;
          if (!appliedEffectsMap.has(userKey)) {
            appliedEffectsMap.set(userKey, []);
          }
          appliedEffectsMap.get(userKey)!.push(result);
        }
      }
    }

    // Extract immediate healing and damage for caster from self-effects BEFORE turn processing
    const casterSelfEffects = appliedEffectsMap.get(caster.slUuid) || [];
    const { immediateDamage: casterImmediateDamage, immediateHealing: casterImmediateHealing } = extractImmediateEffects(casterSelfEffects);

    // ALWAYS process caster's turn first (decrement all PRE-EXISTING effects) and apply all healing
    // This happens regardless of whether the caster receives new effects from this power
    let casterActiveEffects = parseActiveEffects(caster.arkanaStats!.activeEffects);
    const casterTurnProcessed = await processEffectsTurnAndApplyHealing(
      caster as typeof caster & { arkanaStats: NonNullable<typeof caster.arkanaStats> },
      casterActiveEffects,
      casterImmediateHealing  // Apply immediate healing from self-effects
    );
    casterActiveEffects = casterTurnProcessed.activeEffects;

    // Apply damage to caster if they have self-damage effects (must happen after healing)
    // Now includes damage reduction from caster's own defensive effects
    let casterFinalHP = casterTurnProcessed.newHP;
    if (casterImmediateDamage > 0) {
      const casterDamageResult = applyDamageAndHealing(
        casterFinalHP,
        caster.arkanaStats!.maxHP,
        casterImmediateDamage,
        0,  // No additional healing (already applied above)
        casterActiveEffects,
        casterPassiveAsActive
      );
      casterFinalHP = casterDamageResult.newHP;

      // Update caster's health immediately if damage was applied
      await prisma.userStats.update({
        where: { userId: caster.id },
        data: { health: casterFinalHP }
      });
    }

    // Track which users have been updated (to avoid duplicate processing)
    const updatedUsers = new Set<string>();

    // Process activeEffects and liveStats for all affected users
    const affectedUsersData: Array<{
      uuid: string;
      name: string;
      effectResults: EffectResult[];
    }> = [];

    // Apply new effects to all affected users (including caster if they receive effects)
    for (const [userUuid, effectResults] of appliedEffectsMap.entries()) {
      const affectedUser = [caster, ...allPotentialTargets].find(u => u && u.slUuid === userUuid);
      if (!affectedUser?.arkanaStats) continue;

      let userActiveEffects: typeof casterActiveEffects;

      // Store old active effects (BEFORE applying new effects) for Health bonus calculation
      // IMPORTANT: Create a COPY to prevent mutation when we apply new effects to userActiveEffects
      const oldActiveEffects = [...parseActiveEffects(affectedUser.arkanaStats.activeEffects)];

      // If this is the caster, use the already-processed effects
      if (userUuid === caster.slUuid) {
        userActiveEffects = casterActiveEffects;
      } else {
        // For other users, parse their current effects (no turn processing)
        // Use the original parsed effects (not oldActiveEffects copy) as the base for new effects
        userActiveEffects = parseActiveEffects(affectedUser.arkanaStats.activeEffects);
      }

      // Apply all new effects for this user (pass caster name for display)
      for (const effectResult of effectResults) {
        userActiveEffects = applyActiveEffect(userActiveEffects, effectResult, caster.arkanaStats!.characterName);
      }

      // Recalculate liveStats
      const userLiveStats = recalculateLiveStats(affectedUser.arkanaStats, userActiveEffects);

      // Apply immediate healing and damage from effects
      let userNewHP = affectedUser.stats?.health || 0;

      // If this is the caster, healing AND damage were already applied above
      if (userUuid === caster.slUuid) {
        userNewHP = casterFinalHP;
      } else {
        // For non-casters, extract and apply immediate healing and damage with damage reduction
        const { immediateDamage, immediateHealing } = extractImmediateEffects(effectResults);

        // Get passive effects for this user to calculate damage reduction
        const userPassiveEffectsWithSource = getPassiveEffectsWithSource(
          (affectedUser.arkanaStats.perks as string[]) || [],
          (affectedUser.arkanaStats.cybernetics as string[]) || [],
          (affectedUser.arkanaStats.magicWeaves as string[]) || []
        );
        const userPassiveAsActive = passiveEffectsToActiveFormat(userPassiveEffectsWithSource);

        // Apply damage and healing with damage reduction and bounds checking
        const damageHealResult = applyDamageAndHealing(
          userNewHP,
          affectedUser.arkanaStats.maxHP,
          immediateDamage,
          immediateHealing,
          userActiveEffects,
          userPassiveAsActive
        );
        userNewHP = damageHealResult.newHP;
      }

      // Handle Health stat modifiers (temporary maxHP increase) using shared utility
      const healthBonusResult = applyHealthBonusChanges(
        oldActiveEffects,
        userLiveStats,
        userNewHP,
        affectedUser.arkanaStats.maxHP
      );

      const userNewMaxHP = healthBonusResult.newMaxHP;
      userNewHP = healthBonusResult.newHP;

      // Update database - update ArkanaStats for effects/liveStats/maxHP and UserStats for current health
      await prisma.arkanaStats.update({
        where: { userId: affectedUser.id },
        data: buildArkanaStatsUpdate({
          activeEffects: userActiveEffects,
          liveStats: userLiveStats,
          maxHP: userNewMaxHP
        })
      });

      // Update UserStats with new health value
      if (affectedUser.stats) {
        await prisma.userStats.update({
          where: { userId: affectedUser.id },
          data: { health: userNewHP }
        });
      }

      updatedUsers.add(userUuid);

      // Track for response (use raw name for message building, will encode later)
      affectedUsersData.push({
        uuid: userUuid,
        name: affectedUser.arkanaStats.characterName,
        effectResults: effectResults
      });
    }

    // If caster wasn't updated yet (no self-effects), update them now with turn processing results
    // Note: healing was already applied by processEffectsTurnAndApplyHealing
    if (!updatedUsers.has(caster.slUuid)) {
      await prisma.arkanaStats.update({
        where: { userId: caster.id },
        data: buildArkanaStatsUpdate({
          activeEffects: casterActiveEffects,
          liveStats: casterTurnProcessed.liveStats
        })
      });
    }

    // Build comprehensive message with effect details
    const casterName = caster.arkanaStats!.characterName;

    let message = `${casterName} activates ${ability.name}`;

    if (ability.targetType === 'area') {
      message += ` affecting ${affectedUsersData.length} ${affectedUsersData.length === 1 ? 'target' : 'targets'}`;
    } else if (ability.targetType === 'self') {
      message += ' on themselves';
    } else if (target?.arkanaStats) {
      message += ` on ${target.arkanaStats.characterName}`;
    }

    // Add roll description if check was performed
    if (rollDescription) {
      message += ` - SUCCESS! ${rollDescription}`;
    } else {
      message += ' - SUCCESS';
    }

    // Add effect summary using shared utility
    const effectSummaries = affectedUsersData
      .map(u => buildTargetEffectSummary(u.name, u.effectResults));
    if (effectSummaries.length > 0) {
      message += `. Effects: ${effectSummaries.join('; ')}`;
    }

    return NextResponse.json({
      success: true,
      data: {
        activationSuccess: 'true',
        powerUsed: ability.name,
        powerBaseStat: ability.baseStat || 'Mental',
        rollInfo: rollDescription,
        affected: affectedUsersData.map(u => ({
          uuid: u.uuid,
          name: encodeForLSL(u.name),
          effects: u.effectResults.map(buildEffectMessage)
        })),
        caster: {
          uuid: caster.slUuid,
          name: encodeForLSL(casterName)
        },
        message: encodeForLSL(message)
      }
    });

  } catch (error: unknown) {
    console.error('Error processing power activation:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
