import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerAttackSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers, getEffectDefinition } from '@/lib/arkana/dataLoader';
import { calculateStatModifier } from '@/lib/arkana/types';
import { encodeForLSL } from '@/lib/stringUtils';
import type { CommonPower, ArchetypePower, EffectResult } from '@/lib/arkana/types';
import type { ArkanaStats } from '@prisma/client';

// Effect interpreter function using structured data from effects.json
function executeEffect(
  effectId: string,
  attacker: ArkanaStats,
  target: ArkanaStats,
  targetStatValue?: number
): EffectResult | null {
  const effectDef = getEffectDefinition(effectId);

  if (!effectDef) {
    console.warn(`Effect definition not found: ${effectId}`);
    return null;
  }

  // Handle CHECK effects
  if (effectDef.category === 'check') {
    let attackerMod = 0;
    if (effectDef.checkStat === 'Physical') attackerMod = calculateStatModifier(attacker.physical);
    else if (effectDef.checkStat === 'Mental') attackerMod = calculateStatModifier(attacker.mental);
    else if (effectDef.checkStat === 'Dexterity') attackerMod = calculateStatModifier(attacker.dexterity);
    else if (effectDef.checkStat === 'Perception') attackerMod = calculateStatModifier(attacker.perception);

    let targetNumber = 10;
    if (effectDef.checkVs === 'enemy_stat' && effectDef.checkVsStat) {
      targetNumber = 10 + calculateStatModifier(targetStatValue || 2);
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
        if (statName === 'Physical') damage += calculateStatModifier(attacker.physical);
        else if (statName === 'Mental') damage += calculateStatModifier(attacker.mental);
        else if (statName === 'Dexterity') damage += calculateStatModifier(attacker.dexterity);
        else if (statName === 'Perception') damage += calculateStatModifier(attacker.perception);
      }
    }

    return { success: true, damage, effectDef };
  }

  // Handle STAT_MODIFIER, CONTROL, HEAL, etc. - just return the definition
  return { success: true, effectDef };
}

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
    const userCommonPowerIds = attacker.arkanaStats.commonPowers || [];
    const userArchPowerIds = attacker.arkanaStats.archetypePowers || [];
    const ownsPower = userCommonPowerIds.includes(power.id) || userArchPowerIds.includes(power.id);

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

    // First, execute check effects to determine success
    for (const effectId of attackEffects) {
      if (effectId.startsWith('check_')) {
        const baseStatName = power.baseStat?.toLowerCase() || 'mental';
        let targetStatValue: number;
        if (baseStatName === 'physical') targetStatValue = target.arkanaStats.physical;
        else if (baseStatName === 'mental') targetStatValue = target.arkanaStats.mental;
        else if (baseStatName === 'dexterity') targetStatValue = target.arkanaStats.dexterity;
        else if (baseStatName === 'perception') targetStatValue = target.arkanaStats.perception;
        else targetStatValue = target.arkanaStats.mental;

        const result = executeEffect(effectId, attacker.arkanaStats, target.arkanaStats, targetStatValue);
        if (result) {
          attackSuccess = result.success;
          rollDescription = result.rollInfo || '';
        }
        break;
      }
    }

    // If attack failed on check, return miss
    if (!attackSuccess && attackEffects.some((e: string) => e.startsWith('check_'))) {
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

    // Attack succeeded - apply all non-check effects
    for (const effectId of attackEffects) {
      if (!effectId.startsWith('check_')) {
        const result = executeEffect(effectId, attacker.arkanaStats, target.arkanaStats);
        if (result) {
          appliedEffects.push(result);
          if (result.damage) totalDamage += result.damage;
        }
      }
    }

    // Apply damage to target health
    let newTargetHealth = target.stats.health;
    if (totalDamage > 0) {
      newTargetHealth = Math.max(0, target.stats.health - totalDamage);
      await prisma.userStats.update({
        where: { userId: target.id },
        data: { health: newTargetHealth, lastUpdated: new Date() }
      });
    }

    // Build comprehensive message with effect details
    const attackerName = attacker.arkanaStats.characterName;
    const targetName = target.arkanaStats.characterName;

    let message = `${attackerName} uses ${power.name} on ${targetName} - HIT! ${rollDescription}`;

    // Always show damage (even if 0)
    message += ` - ${totalDamage} damage dealt`;

    // Group effects by target
    const targetEffects = appliedEffects.filter(e =>
      e.effectDef.target === 'enemy' || e.effectDef.target === 'single'
    );
    const selfEffects = appliedEffects.filter(e =>
      e.effectDef.target === 'self'
    );

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
        totalDamage,
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
