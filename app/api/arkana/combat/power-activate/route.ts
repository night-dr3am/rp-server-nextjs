import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerActivateSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers, getEffectDefinition } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import { executeEffect, applyActiveEffect, recalculateLiveStats, buildArkanaStatsUpdate, parseActiveEffects, processEffectsTurn } from '@/lib/arkana/effectsUtils';
import type { CommonPower, ArchetypePower, EffectResult, LiveStats } from '@/lib/arkana/types';

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

  return def.name;
}

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
    const caster = await prisma.user.findFirst({
      where: { slUuid: caster_uuid, universe: 'arkana' },
      include: { arkanaStats: true, stats: true }
    });

    // Validate caster exists
    if (!caster?.arkanaStats?.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Caster not found or registration incomplete' },
        { status: 404 }
      );
    }

    // Check if caster is in RP mode (status === 0 means IC/RP mode)
    if (!caster.stats || caster.stats.status !== 0) {
      return NextResponse.json(
        { success: false, error: 'Caster is not in RP mode' },
        { status: 400 }
      );
    }

    // Get target if specified (for non-self powers)
    type UserWithStats = Awaited<ReturnType<typeof prisma.user.findFirst<{
      where: { slUuid: string; universe: string };
      include: { arkanaStats: true; stats: true };
    }>>>;

    let target: UserWithStats = null;
    const allPotentialTargets: UserWithStats[] = [];

    if (target_uuid) {
      target = await prisma.user.findFirst({
        where: { slUuid: target_uuid, universe: 'arkana' },
        include: { arkanaStats: true, stats: true }
      });

      if (!target?.arkanaStats?.registrationCompleted) {
        return NextResponse.json(
          { success: false, error: 'Target not found or registration incomplete' },
          { status: 404 }
        );
      }

      // Check if target is in RP mode (status === 0 means IC/RP mode)
      if (!target.stats || target.stats.status !== 0) {
        return NextResponse.json(
          { success: false, error: 'Target is not in RP mode' },
          { status: 400 }
        );
      }

      allPotentialTargets.push(target);
    }

    // Load nearby users for area effects
    if (value.nearby_uuids && Array.isArray(value.nearby_uuids) && value.nearby_uuids.length > 0) {
      const nearbyUsers = await prisma.user.findMany({
        where: {
          slUuid: { in: value.nearby_uuids },
          universe: 'arkana'
        },
        include: { arkanaStats: true, stats: true }
      });

      // Filter to only registered users in RP mode
      const validNearby = nearbyUsers.filter(u =>
        u?.arkanaStats?.registrationCompleted &&
        u.stats?.status === 0 &&
        u.slUuid !== caster.slUuid // Exclude caster from nearby list
      );

      allPotentialTargets.push(...validNearby);
    }

    // Parse liveStats for caster and target (if exists) to include active effect modifiers
    const casterLiveStats = (caster.arkanaStats.liveStats as LiveStats) || {};
    const targetLiveStats = target ? ((target.arkanaStats?.liveStats as LiveStats) || {}) : {};

    // Load arkana data
    await loadAllData();
    const allCommonPowers = getAllCommonPowers();
    const allArchPowers = getAllArchPowers();

    // Find the power
    let power: CommonPower | ArchetypePower | undefined = undefined;
    if (power_id) {
      power = allCommonPowers.find((p: CommonPower) => p.id === power_id) ||
              allArchPowers.find((p: ArchetypePower) => p.id === power_id);
    } else if (power_name) {
      power = allCommonPowers.find((p: CommonPower) => p.name.toLowerCase() === power_name.toLowerCase()) ||
              allArchPowers.find((p: ArchetypePower) => p.name.toLowerCase() === power_name.toLowerCase());
    }

    if (!power) {
      return NextResponse.json(
        { success: false, error: 'Power not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    const userCommonPowerIds = caster.arkanaStats.commonPowers || [];
    const userArchPowerIds = caster.arkanaStats.archetypePowers || [];
    const ownsPower = userCommonPowerIds.includes(power.id) || userArchPowerIds.includes(power.id);

    if (!ownsPower) {
      return NextResponse.json(
        { success: false, error: 'Caster does not own this power' },
        { status: 403 }
      );
    }

    // Execute effects using ability effects (not attack effects)
    const activateEffects = (power.effects?.ability && Array.isArray(power.effects.ability))
      ? power.effects.ability
      : [];
    let activationSuccess = true;
    let rollDescription = '';

    // First, execute check effects to determine success (using effective stats)
    for (const effectId of activateEffects) {
      if (effectId.startsWith('check_')) {
        const baseStatName = power.baseStat?.toLowerCase() || 'mental';
        let targetStatValue: number = 2;

        if (target && target.arkanaStats) {
          if (baseStatName === 'physical') targetStatValue = target.arkanaStats.physical;
          else if (baseStatName === 'mental') targetStatValue = target.arkanaStats.mental;
          else if (baseStatName === 'dexterity') targetStatValue = target.arkanaStats.dexterity;
          else if (baseStatName === 'perception') targetStatValue = target.arkanaStats.perception;
          else targetStatValue = target.arkanaStats.mental;
        }

        const result = executeEffect(effectId, caster.arkanaStats, target?.arkanaStats || caster.arkanaStats, targetStatValue, casterLiveStats, targetLiveStats);
        if (result) {
          activationSuccess = result.success;
          rollDescription = result.rollInfo || '';
        }
        break;
      }
    }

    // If activation failed on check, still process turn and return failure
    if (!activationSuccess && activateEffects.some((e: string) => e.startsWith('check_'))) {
      // Process turn for caster (decrement all effects) even on failure
      const casterActiveEffects = parseActiveEffects(caster.arkanaStats.activeEffects);
      const turnProcessed = processEffectsTurn(casterActiveEffects, caster.arkanaStats);

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
          powerUsed: power.name,
          powerBaseStat: power.baseStat || 'Mental',
          rollInfo: rollDescription,
          affected: [],
          caster: {
            uuid: caster.slUuid,
            name: encodeForLSL(caster.arkanaStats.characterName)
          },
          message: encodeForLSL(`${caster.arkanaStats.characterName} attempts ${power.name} - FAILED! ${rollDescription}`)
        }
      });
    }

    // Activation succeeded - apply all non-check effects to applicable targets
    const appliedEffectsMap = new Map<string, EffectResult[]>(); // Track per user

    for (const effectId of activateEffects) {
      if (effectId.startsWith('check_')) continue;

      const effectDef = getEffectDefinition(effectId);
      if (!effectDef) continue;

      // Determine which users should receive this effect
      const applicableTargets: typeof allPotentialTargets = [];

      if (effectDef.target === 'self') {
        // Self effects go to caster only
        applicableTargets.push({ ...caster, arkanaStats: caster.arkanaStats! });
      } else if (effectDef.target === 'all_allies' || effectDef.target === 'area') {
        // Area effects: caster + all nearby
        applicableTargets.push({ ...caster, arkanaStats: caster.arkanaStats! });
        applicableTargets.push(...allPotentialTargets);
      } else if (effectDef.target === 'all_enemies') {
        // Enemy area effects: all nearby (not caster)
        applicableTargets.push(...allPotentialTargets);
      } else if (effectDef.target === 'enemy' || effectDef.target === 'single' || effectDef.target === 'ally') {
        // Single target effects
        if (target) {
          applicableTargets.push(target);
        }
      }

      // Apply effect to each applicable target
      for (const applicableTarget of applicableTargets) {
        if (!applicableTarget || !applicableTarget.arkanaStats) continue;

        const targetLiveStats = (applicableTarget.arkanaStats.liveStats as LiveStats) || {};
        const result = executeEffect(effectId, caster.arkanaStats, applicableTarget.arkanaStats, undefined, casterLiveStats, targetLiveStats);

        if (result) {
          const userKey = applicableTarget.slUuid;
          if (!appliedEffectsMap.has(userKey)) {
            appliedEffectsMap.set(userKey, []);
          }
          appliedEffectsMap.get(userKey)!.push(result);
        }
      }
    }

    // ALWAYS process caster's turn first (decrement all PRE-EXISTING effects)
    // This happens regardless of whether the caster receives new effects from this power
    let casterActiveEffects = parseActiveEffects(caster.arkanaStats.activeEffects);
    const casterTurnProcessed = processEffectsTurn(casterActiveEffects, caster.arkanaStats);
    casterActiveEffects = casterTurnProcessed.activeEffects;

    // Track which users have been updated (to avoid duplicate processing)
    const updatedUsers = new Set<string>();

    // Process activeEffects and liveStats for all affected users
    const affectedUsersData: Array<{
      uuid: string;
      name: string;
      effects: string[];
    }> = [];

    // Apply new effects to all affected users (including caster if they receive effects)
    for (const [userUuid, effectResults] of appliedEffectsMap.entries()) {
      const affectedUser = [caster, ...allPotentialTargets].find(u => u && u.slUuid === userUuid);
      if (!affectedUser?.arkanaStats) continue;

      let userActiveEffects: typeof casterActiveEffects;

      // If this is the caster, use the already-processed effects
      if (userUuid === caster.slUuid) {
        userActiveEffects = casterActiveEffects;
      } else {
        // For other users, just parse their current effects (no turn processing)
        userActiveEffects = parseActiveEffects(affectedUser.arkanaStats.activeEffects);
      }

      // Apply all new effects for this user
      for (const effectResult of effectResults) {
        userActiveEffects = applyActiveEffect(userActiveEffects, effectResult);
      }

      // Recalculate liveStats
      const userLiveStats = recalculateLiveStats(affectedUser.arkanaStats, userActiveEffects);

      // Update database
      await prisma.arkanaStats.update({
        where: { userId: affectedUser.id },
        data: buildArkanaStatsUpdate({
          activeEffects: userActiveEffects,
          liveStats: userLiveStats
        })
      });

      updatedUsers.add(userUuid);

      // Track for response
      affectedUsersData.push({
        uuid: userUuid,
        name: encodeForLSL(affectedUser.arkanaStats.characterName),
        effects: effectResults.map(buildEffectMessage)
      });
    }

    // If caster wasn't updated yet (no self-effects), update them now with just turn processing
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
    const casterName = caster.arkanaStats.characterName;

    let message = `${casterName} activates ${power.name}`;

    if (power.targetType === 'area') {
      message += ` affecting ${affectedUsersData.length} ${affectedUsersData.length === 1 ? 'target' : 'targets'}`;
    } else if (power.targetType === 'self') {
      message += ' on themselves';
    } else if (target?.arkanaStats) {
      message += ` on ${target.arkanaStats.characterName}`;
    }

    message += ` - SUCCESS! ${rollDescription}`;

    // Add effect summary
    const effectSummary = affectedUsersData
      .map(u => `${u.name}: ${u.effects.join(', ')}`)
      .join('; ');
    if (effectSummary) {
      message += `. Effects: ${effectSummary}`;
    }

    return NextResponse.json({
      success: true,
      data: {
        activationSuccess: 'true',
        powerUsed: power.name,
        powerBaseStat: power.baseStat || 'Mental',
        rollInfo: rollDescription,
        affected: affectedUsersData,
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
