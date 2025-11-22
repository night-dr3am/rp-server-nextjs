// POST /api/gor/combat/use-ability - Use an ability in combat
// Handles checks, damage, healing, buffs/debuffs, and control effects

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSignature } from '@/lib/signature';
import { gorUseAbilitySchema } from '@/lib/validation';
import { encodeForLSL } from '@/lib/stringUtils';
import { loadAbilities, getEffectById } from '@/lib/gor/unifiedDataLoader';
import {
  executeEffect,
  applyActiveEffect,
  recalculateLiveStats,
  processEffectsTurn,
  getDetailedStatCalculation,
  formatGorEffectsForLSL,
  canPerformCombatAction,
  type GorLiveStats
} from '@/lib/gor/effectsUtils';
import type {
  AbilityData,
  CharacterAbility,
  ActiveEffect,
  GoreanStatName,
  EffectTarget
} from '@/lib/gor/types';

// Helper to get user with goreanStats, stats, and groups
async function getUser(uuid: string, universe: string) {
  return prisma.user.findFirst({
    where: {
      slUuid: uuid,
      universe: {
        equals: universe,
        mode: 'insensitive'
      }
    },
    include: {
      goreanStats: true,
      stats: true
    }
  });
}

// Filter users by social group membership
function filterUsersByGroup<T extends { goreanStats: { id: number } | null }>(
  casterGroups: unknown,
  users: T[],
  groupType: 'Allies' | 'Enemies'
): T[] {
  // Safely parse groups JSON
  let groups: Record<string, number[]> = {};
  try {
    if (casterGroups && typeof casterGroups === 'object') {
      groups = casterGroups as Record<string, number[]>;
    }
  } catch (e) {
    console.warn('Failed to parse caster groups:', e);
    return [];
  }

  // Get gorean IDs for the specified group
  const groupMembers = groups[groupType] || [];
  if (groupMembers.length === 0) return [];

  // Filter users whose goreanStats.id is in the group
  return users.filter(user =>
    user.goreanStats && groupMembers.includes(user.goreanStats.id)
  );
}


// Type for nearby user with goreanStats for group filtering
type NearbyUser = {
  slUuid: string;
  goreanStats: { id: number } | null;
};

// Determine which targets should receive an effect based on target type
// Now supports social group filtering for all_allies/all_enemies target types
function getEffectTargets(
  effectTarget: EffectTarget | undefined,
  casterUuid: string,
  targetUuid: string | undefined,
  nearbyUuids: string[],
  casterGroups?: unknown,
  nearbyUsers?: NearbyUser[]
): string[] {
  if (!effectTarget) return [];

  switch (effectTarget) {
    case 'self':
      return [casterUuid];
    case 'enemy':
      return targetUuid ? [targetUuid] : [];
    case 'ally':
      return targetUuid ? [targetUuid] : [];
    case 'all_enemies':
      // Filter by Enemies social group if available
      if (casterGroups && nearbyUsers) {
        const enemies = filterUsersByGroup(casterGroups, nearbyUsers, 'Enemies');
        return enemies.map(u => u.slUuid);
      }
      return nearbyUuids.filter(uuid => uuid !== casterUuid);
    case 'all_allies':
      // Filter by Allies social group if available
      if (casterGroups && nearbyUsers) {
        const allies = filterUsersByGroup(casterGroups, nearbyUsers, 'Allies');
        return allies.map(u => u.slUuid);
      }
      return nearbyUuids.filter(uuid => uuid !== casterUuid);
    case 'all_enemies_and_self':
      // Include self + filter by Enemies social group
      if (casterGroups && nearbyUsers) {
        const enemies = filterUsersByGroup(casterGroups, nearbyUsers, 'Enemies');
        return [casterUuid, ...enemies.map(u => u.slUuid)];
      }
      return nearbyUuids;
    case 'all_allies_and_self':
      // Include self + filter by Allies social group
      if (casterGroups && nearbyUsers) {
        const allies = filterUsersByGroup(casterGroups, nearbyUsers, 'Allies');
        return [casterUuid, ...allies.map(u => u.slUuid)];
      }
      return nearbyUuids;
    case 'area':
      return nearbyUuids;
    default:
      return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const { error, value } = gorUseAbilitySchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const {
      caster_uuid,
      ability_id,
      ability_name,
      target_uuid,
      nearby_uuids,
      universe,
      timestamp,
      signature
    } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error },
        { status: 401 }
      );
    }

    // Get caster
    const caster = await getUser(caster_uuid, universe);
    if (!caster) {
      return NextResponse.json(
        { success: false, error: 'Caster not found' },
        { status: 404 }
      );
    }

    if (!caster.goreanStats) {
      return NextResponse.json(
        { success: false, error: 'Caster character not found' },
        { status: 404 }
      );
    }

    // Check caster is conscious
    if (caster.goreanStats.healthCurrent <= 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot use abilities while unconscious' },
        { status: 400 }
      );
    }

    // Check combat mode (status 0-3 only)
    if (caster.stats && caster.stats.status > 3) {
      return NextResponse.json(
        { success: false, error: 'Must be in Full, Survival, Combat or RP mode to use abilities' },
        { status: 400 }
      );
    }

    // Load all abilities
    const allAbilities = await loadAbilities();

    // Find ability by ID or name
    let ability: AbilityData | undefined;
    if (ability_id) {
      ability = allAbilities.find((a: AbilityData) => a.id === ability_id);
    } else if (ability_name) {
      ability = allAbilities.find((a: AbilityData) =>
        a.name.toLowerCase() === ability_name.toLowerCase()
      );
    }

    if (!ability) {
      return NextResponse.json(
        { success: false, error: 'Ability not found' },
        { status: 404 }
      );
    }

    // Check caster has this ability
    const characterAbilities = (caster.goreanStats.abilities as unknown as CharacterAbility[]) || [];
    const hasAbility = characterAbilities.some(a => a.ability_id === ability!.id);

    if (!hasAbility) {
      return NextResponse.json(
        { success: false, error: 'You do not have this ability' },
        { status: 400 }
      );
    }

    // Check cooldown if ability has one
    if (ability.cooldown && ability.cooldown > 0) {
      const cooldownSeconds = ability.cooldown;
      const cooldownMs = cooldownSeconds * 1000;
      const cutoffTime = new Date(Date.now() - cooldownMs);

      const recentUse = await prisma.event.findFirst({
        where: {
          userId: caster.id,
          type: 'ABILITY_USE',
          details: {
            path: ['abilityId'],
            equals: ability.id
          },
          timestamp: {
            gte: cutoffTime
          }
        },
        orderBy: {
          timestamp: 'desc'
        }
      });

      if (recentUse) {
        const nextAvailable = new Date(recentUse.timestamp.getTime() + cooldownMs);
        const remainingSeconds = Math.ceil((nextAvailable.getTime() - Date.now()) / 1000);
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;

        return NextResponse.json(
          {
            success: false,
            error: `Ability on cooldown. Available in ${minutes}m ${seconds}s`
          },
          { status: 400 }
        );
      }
    }

    // Get live stats and check if caster can act
    const casterActiveEffects = (caster.goreanStats.activeEffects as unknown as ActiveEffect[]) || [];
    const casterLiveStats = await recalculateLiveStats(casterActiveEffects);

    const actionCheck = canPerformCombatAction(casterLiveStats);
    if (!actionCheck.can) {
      return NextResponse.json(
        { success: false, error: actionCheck.reason },
        { status: 400 }
      );
    }

    // Get target if specified
    let target: Awaited<ReturnType<typeof getUser>> | null = null;
    let targetLiveStats: GorLiveStats | null = null;
    let targetActiveEffects: ActiveEffect[] = [];

    if (target_uuid) {
      target = await getUser(target_uuid, universe);
      if (!target || !target.goreanStats) {
        return NextResponse.json(
          { success: false, error: 'Target not found' },
          { status: 404 }
        );
      }

      if (target.goreanStats.healthCurrent <= 0) {
        return NextResponse.json(
          { success: false, error: 'Target is unconscious' },
          { status: 400 }
        );
      }

      targetActiveEffects = (target.goreanStats.activeEffects as unknown as ActiveEffect[]) || [];
      targetLiveStats = await recalculateLiveStats(targetActiveEffects);
    }

    // Determine which effects to use (prefer 'ability' effects)
    const effectIds: string[] = ability.effects.ability || ability.effects.attack || [];

    if (effectIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Ability has no effects defined' },
        { status: 400 }
      );
    }

    // Build targets list including nearby players
    const allNearbyUuids = nearby_uuids || [];
    if (target_uuid && !allNearbyUuids.includes(target_uuid)) {
      allNearbyUuids.push(target_uuid);
    }
    if (!allNearbyUuids.includes(caster_uuid)) {
      allNearbyUuids.push(caster_uuid);
    }

    // Fetch nearby users for social group filtering (needed for all_allies/all_enemies)
    const nearbyUsers = await prisma.user.findMany({
      where: {
        slUuid: { in: allNearbyUuids },
        universe: { equals: universe, mode: 'insensitive' }
      },
      select: {
        slUuid: true,
        goreanStats: {
          select: { id: true }
        }
      }
    });

    // Track results
    let activationSuccess = true;
    let rollInfo = '';
    const affectedPlayers: Map<string, {
      uuid: string;
      name: string;
      effects: string[];
      damageDealt: number;
      healingReceived: number;
      newActiveEffects: ActiveEffect[];
    }> = new Map();

    // Initialize caster in affected map
    affectedPlayers.set(caster_uuid, {
      uuid: caster_uuid,
      name: caster.goreanStats.characterName,
      effects: [],
      damageDealt: 0,
      healingReceived: 0,
      newActiveEffects: [...casterActiveEffects]
    });

    // Process effects in order
    for (const effectId of effectIds) {
      const effectDef = await getEffectById(effectId);
      if (!effectDef) continue;

      // Handle CHECK effects first (determine success)
      if (effectDef.category === 'check') {
        // Get appropriate target stat value for contested check
        let targetStatValue: number | undefined;
        if (effectDef.checkVs === 'enemy_stat' && effectDef.checkVsStat && target?.goreanStats) {
          const statName = effectDef.checkVsStat.toLowerCase() as GoreanStatName;
          targetStatValue = target.goreanStats[statName] as number;
        }

        const result = await executeEffect(
          effectId,
          caster.goreanStats,
          target?.goreanStats || caster.goreanStats,
          targetStatValue,
          casterLiveStats,
          targetLiveStats
        );

        if (result) {
          activationSuccess = result.success;

          // Build roll info with detailed breakdown
          if (effectDef.checkStat) {
            const statName = effectDef.checkStat.toLowerCase() as GoreanStatName;
            const casterStatDetails = getDetailedStatCalculation(
              caster.goreanStats,
              casterLiveStats,
              statName
            );

            if (effectDef.checkVs === 'tn') {
              rollInfo = `${effectDef.checkStat} check: ${result.rollInfo}`;
            } else if (effectDef.checkVsStat && result.defenseStat) {
              const targetStatDetails = target?.goreanStats
                ? getDetailedStatCalculation(
                    target.goreanStats,
                    targetLiveStats,
                    result.defenseStat
                  )
                : null;

              rollInfo = `${casterStatDetails.statDisplayName} vs ${targetStatDetails?.statDisplayName || effectDef.checkVsStat}: ${result.rollInfo}`;
            }
          } else {
            rollInfo = result.rollInfo || '';
          }

          // If check failed, stop processing further effects
          if (!activationSuccess) {
            break;
          }
        }
        continue;
      }

      // Determine targets for this effect (with social group filtering)
      const effectTargets = getEffectTargets(
        effectDef.target,
        caster_uuid,
        target_uuid,
        allNearbyUuids,
        caster.groups,
        nearbyUsers
      );

      // Process effect for each target
      for (const targetUuid of effectTargets) {
        // Get or load target data
        let effectTarget = target;
        let effectTargetLiveStats = targetLiveStats;
        let effectTargetActiveEffects = targetActiveEffects;

        if (targetUuid === caster_uuid) {
          effectTarget = caster;
          effectTargetLiveStats = casterLiveStats;
          effectTargetActiveEffects = affectedPlayers.get(caster_uuid)!.newActiveEffects;
        } else if (targetUuid !== target_uuid) {
          // Load nearby player
          effectTarget = await getUser(targetUuid, universe);
          if (!effectTarget?.goreanStats) continue;

          effectTargetActiveEffects = (effectTarget.goreanStats.activeEffects as unknown as ActiveEffect[]) || [];
          effectTargetLiveStats = await recalculateLiveStats(effectTargetActiveEffects);
        }

        if (!effectTarget?.goreanStats) continue;

        // Initialize in affected map if not present
        if (!affectedPlayers.has(targetUuid)) {
          affectedPlayers.set(targetUuid, {
            uuid: targetUuid,
            name: effectTarget.goreanStats.characterName,
            effects: [],
            damageDealt: 0,
            healingReceived: 0,
            newActiveEffects: [...effectTargetActiveEffects]
          });
        }

        const affected = affectedPlayers.get(targetUuid)!;

        // Execute effect
        const result = await executeEffect(
          effectId,
          caster.goreanStats,
          effectTarget.goreanStats,
          undefined,
          casterLiveStats,
          effectTargetLiveStats
        );

        if (!result) continue;

        // Apply based on effect category
        if (result.damage && result.damage > 0) {
          affected.damageDealt += result.damage;
          affected.effects.push(`-${result.damage} HP`);
        }

        if (result.heal && result.heal > 0) {
          affected.healingReceived += result.heal;
          affected.effects.push(`+${result.heal} HP`);
        }

        if (effectDef.category === 'stat_modifier' || effectDef.category === 'control') {
          // Apply as active effect
          affected.newActiveEffects = applyActiveEffect(
            affected.newActiveEffects,
            result,
            caster.goreanStats.characterName,
            {
              sourceId: ability.id,
              sourceName: ability.name,
              sourceType: 'ability'
            }
          );

          // Add effect description
          if (effectDef.category === 'stat_modifier') {
            const sign = (effectDef.modifier || 0) >= 0 ? '+' : '';
            if (effectDef.stat === 'all') {
              affected.effects.push(`All stats ${sign}${effectDef.modifier}`);
            } else {
              affected.effects.push(`${effectDef.stat} ${sign}${effectDef.modifier}`);
            }
          } else if (effectDef.category === 'control') {
            affected.effects.push(effectDef.controlType || 'Control');
          }
        }
      }
    }

    // Process caster's turn (decrement effects, apply HoT)
    const casterTurnResult = await processEffectsTurn(
      affectedPlayers.get(caster_uuid)!.newActiveEffects,
      caster.goreanStats
    );

    // Apply turn healing to caster
    const casterHealingFromTurn = casterTurnResult.healingApplied;
    const casterNewEffects = casterTurnResult.activeEffects;
    const casterNewLiveStats = casterTurnResult.liveStats;

    // Update database for all affected players
    const dbUpdates: Promise<unknown>[] = [];

    for (const [uuid, affected] of affectedPlayers) {
      // Calculate new health
      let newHealth: number;
      let goreanStatsId: number;

      if (uuid === caster_uuid) {
        newHealth = caster.goreanStats.healthCurrent - affected.damageDealt + affected.healingReceived + casterHealingFromTurn;
        newHealth = Math.max(0, Math.min(caster.goreanStats.healthMax, newHealth));
        goreanStatsId = caster.goreanStats.id;

        // Update goreanStats
        dbUpdates.push(
          prisma.goreanStats.update({
            where: { id: goreanStatsId },
            data: {
              healthCurrent: newHealth,
              activeEffects: casterNewEffects as unknown as object[],
              liveStats: casterNewLiveStats as unknown as object,
              updatedAt: new Date()
            }
          })
        );

        // Update userStats health
        if (caster.stats) {
          dbUpdates.push(
            prisma.userStats.update({
              where: { userId: caster.id },
              data: { health: newHealth }
            })
          );
        }
      } else {
        // Get the target's data
        const targetUser = uuid === target_uuid ? target : await getUser(uuid, universe);
        if (!targetUser?.goreanStats) continue;

        newHealth = targetUser.goreanStats.healthCurrent - affected.damageDealt + affected.healingReceived;
        newHealth = Math.max(0, Math.min(targetUser.goreanStats.healthMax, newHealth));
        goreanStatsId = targetUser.goreanStats.id;

        // Recalculate live stats for new effects
        const newLiveStats = await recalculateLiveStats(affected.newActiveEffects);

        // Update goreanStats
        dbUpdates.push(
          prisma.goreanStats.update({
            where: { id: goreanStatsId },
            data: {
              healthCurrent: newHealth,
              activeEffects: affected.newActiveEffects as unknown as object[],
              liveStats: newLiveStats as unknown as object,
              updatedAt: new Date()
            }
          })
        );

        // Update userStats health
        if (targetUser.stats) {
          dbUpdates.push(
            prisma.userStats.update({
              where: { userId: targetUser.id },
              data: { health: newHealth }
            })
          );
        }
      }
    }

    // Execute all database updates
    await Promise.all(dbUpdates);

    // Log ability use event
    await prisma.event.create({
      data: {
        userId: caster.id,
        type: 'ABILITY_USE',
        details: {
          abilityId: ability.id,
          abilityName: ability.name,
          success: activationSuccess,
          targetUuid: target_uuid,
          affectedCount: affectedPlayers.size,
          rollInfo
        }
      }
    });

    // Build message
    let message = '';
    if (activationSuccess) {
      message = `${caster.goreanStats.characterName} uses ${ability.name}`;
      if (rollInfo) {
        message += ` - ${rollInfo}`;
      }
      message += ' → Success!';

      // Add effect summaries
      const effectSummaries: string[] = [];
      for (const [uuid, affected] of affectedPlayers) {
        if (affected.effects.length > 0) {
          if (uuid === caster_uuid) {
            effectSummaries.push(`Self: ${affected.effects.join(', ')}`);
          } else {
            effectSummaries.push(`${affected.name}: ${affected.effects.join(', ')}`);
          }
        }
      }

      if (effectSummaries.length > 0) {
        message += ` [${effectSummaries.join('; ')}]`;
      }
    } else {
      message = `${caster.goreanStats.characterName} uses ${ability.name}`;
      if (rollInfo) {
        message += ` - ${rollInfo}`;
      }
      message += ' → Failed!';
    }

    // Build response - only include players who were actually affected
    const affected = Array.from(affectedPlayers.values())
      .filter(p => p.effects.length > 0 || p.damageDealt > 0 || p.healingReceived > 0)
      .map(p => ({
        uuid: p.uuid,
        name: encodeForLSL(p.name),
        effects: p.effects
      }));

    const casterData = affectedPlayers.get(caster_uuid)!;
    const casterNewHealth = Math.max(0, Math.min(
      caster.goreanStats.healthMax,
      caster.goreanStats.healthCurrent - casterData.damageDealt + casterData.healingReceived + casterHealingFromTurn
    ));

    return NextResponse.json({
      success: true,
      data: {
        activationSuccess,
        abilityUsed: ability.name,
        rollInfo,
        affected,
        caster: {
          uuid: caster_uuid,
          name: encodeForLSL(caster.goreanStats.characterName),
          health: casterNewHealth,
          maxHealth: caster.goreanStats.healthMax,
          healingApplied: casterHealingFromTurn,
          effectsDisplay: encodeForLSL(formatGorEffectsForLSL(casterData.newActiveEffects))
        },
        message: encodeForLSL(message)
      }
    });

  } catch (error) {
    console.error('[UseAbility] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
