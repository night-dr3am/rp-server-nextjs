import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerActivateSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import { executeEffect, applyActiveEffect, recalculateLiveStats, buildArkanaStatsUpdate, parseActiveEffects, processEffectsTurn } from '@/lib/arkana/effectsUtils';
import type { CommonPower, ArchetypePower, EffectResult } from '@/lib/arkana/types';

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
    let target = null;
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
    }

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
    const appliedEffects: EffectResult[] = [];
    let activationSuccess = true;
    let rollDescription = '';

    // First, execute check effects to determine success
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

        const result = executeEffect(effectId, caster.arkanaStats, caster.arkanaStats, targetStatValue);
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
            name: encodeForLSL(caster.arkanaStats.characterName),
            turnsRemaining: turnProcessed.activeEffects.length
          },
          message: encodeForLSL(`${caster.arkanaStats.characterName} attempts ${power.name} - FAILED! ${rollDescription}`)
        }
      });
    }

    // Activation succeeded - apply all non-check effects
    const targetRef = target || caster; // Use target if specified, otherwise self
    const targetArkanaStats = targetRef.arkanaStats || caster.arkanaStats; // Guaranteed to exist
    for (const effectId of activateEffects) {
      if (!effectId.startsWith('check_')) {
        const result = executeEffect(effectId, caster.arkanaStats, targetArkanaStats);
        if (result) {
          appliedEffects.push(result);
        }
      }
    }

    // Process activeEffects and liveStats for all affected users
    const targetEffects = appliedEffects.filter(e =>
      e.effectDef.target === 'enemy' || e.effectDef.target === 'single' || e.effectDef.target === 'ally'
    );
    const selfEffects = appliedEffects.filter(e =>
      e.effectDef.target === 'self'
    );

    // Update target's activeEffects and liveStats (if not self-targeted)
    if (target && target.arkanaStats && targetEffects.length > 0) {
      let targetActiveEffects = parseActiveEffects(target.arkanaStats.activeEffects);

      for (const effectResult of targetEffects) {
        targetActiveEffects = applyActiveEffect(targetActiveEffects, effectResult);
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

    // Update caster's activeEffects and liveStats
    let casterActiveEffects = parseActiveEffects(caster.arkanaStats.activeEffects);

    // Apply self-targeted effects first
    for (const effectResult of selfEffects) {
      casterActiveEffects = applyActiveEffect(casterActiveEffects, effectResult);
    }

    // If self-targeted, apply target effects to self
    if (!target && targetEffects.length > 0) {
      for (const effectResult of targetEffects) {
        casterActiveEffects = applyActiveEffect(casterActiveEffects, effectResult);
      }
    }

    // Process turn for caster (decrement all effects)
    const turnProcessed = processEffectsTurn(casterActiveEffects, caster.arkanaStats);

    await prisma.arkanaStats.update({
      where: { userId: caster.id },
      data: buildArkanaStatsUpdate({
        activeEffects: turnProcessed.activeEffects,
        liveStats: turnProcessed.liveStats
      })
    });

    // Build comprehensive message with effect details
    const casterName = caster.arkanaStats.characterName;
    const targetName = target?.arkanaStats?.characterName || casterName;

    let message = `${casterName} activates ${power.name}`;
    if (target) {
      message += ` on ${targetName}`;
    }
    message += ` - SUCCESS! ${rollDescription}`;

    // Add effect messages
    if (targetEffects.length > 0) {
      const msgs = targetEffects.map(buildEffectMessage);
      message += `. Target: ${msgs.join(', ')}`;
    }

    if (selfEffects.length > 0) {
      const msgs = selfEffects.map(buildEffectMessage);
      message += `. Caster: ${msgs.join(', ')}`;
    }

    return NextResponse.json({
      success: true,
      data: {
        activationSuccess: 'true',
        powerUsed: power.name,
        powerBaseStat: power.baseStat || 'Mental',
        rollInfo: rollDescription,
        affected: appliedEffects
          .filter(e => e.effectDef.target !== 'self')
          .map(e => ({
            uuid: target ? target.slUuid : caster.slUuid,
            name: encodeForLSL(targetName),
            effects: [buildEffectMessage(e)]
          })),
        caster: {
          uuid: caster.slUuid,
          name: encodeForLSL(casterName),
          turnsRemaining: turnProcessed.activeEffects.length
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
