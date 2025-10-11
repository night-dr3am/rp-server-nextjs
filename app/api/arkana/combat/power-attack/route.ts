import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaPowerAttackSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getAllCommonPowers, getAllArchPowers } from '@/lib/arkana/dataLoader';
import { calculateStatModifier } from '@/lib/arkana/types';
import { encodeForLSL } from '@/lib/stringUtils';
import type { CommonPower, ArchetypePower } from '@/lib/arkana/types';
import type { ArkanaStats } from '@prisma/client';

// Effect interpreter function
function executeEffect(
  effect: string,
  attacker: ArkanaStats,
  target: ArkanaStats,
  targetsStat?: number
): { success: boolean; damage?: number; description?: string } {
  // Parse effect string (e.g., "check_mental_vs_mental", "damage_physical_3")
  const parts = effect.split('_');

  // Check effects (roll-based)
  if (parts[0] === 'check') {
    const attackStat = parts[1]; // physical, mental, dexterity, perception
    const defenseType = parts[3]; // mental, physical, tn10, etc.

    // Get attacker modifier based on stat
    let attackerMod = 0;
    if (attackStat === 'physical') attackerMod = calculateStatModifier(attacker.physical);
    else if (attackStat === 'mental') attackerMod = calculateStatModifier(attacker.mental);
    else if (attackStat === 'dexterity') attackerMod = calculateStatModifier(attacker.dexterity);
    else if (attackStat === 'perception') attackerMod = calculateStatModifier(attacker.perception);

    // Determine target number
    let targetNumber = 10;
    if (defenseType === 'mental') {
      targetNumber = 10 + calculateStatModifier(targetsStat || target?.mental || 2);
    } else if (defenseType === 'physical') {
      targetNumber = 10 + calculateStatModifier(targetsStat || target?.physical || 2);
    } else if (defenseType === 'dexterity') {
      targetNumber = 10 + calculateStatModifier(targetsStat || target?.dexterity || 2);
    } else if (defenseType === 'perception') {
      targetNumber = 10 + calculateStatModifier(targetsStat || target?.perception || 2);
    } else if (defenseType.startsWith('tn')) {
      targetNumber = parseInt(defenseType.substring(2)) || 10;
    }

    // Roll d20
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + attackerMod;
    const success = total >= targetNumber;

    return {
      success,
      description: `Roll: ${d20}+${attackerMod}=${total} vs TN:${targetNumber}`
    };
  }

  // Damage effects
  if (parts[0] === 'damage') {
    const damageType = parts[1]; // physical, mental, fire, necrotic, etc.
    const damageAmount = parseInt(parts[2]) || 1;

    return {
      success: true,
      damage: damageAmount,
      description: `${damageAmount} ${damageType} damage`
    };
  }

  // Debuff/buff effects (placeholder - can be expanded)
  if (parts[0] === 'debuff' || parts[0] === 'buff') {
    return {
      success: true,
      description: effect.replace(/_/g, ' ')
    };
  }

  // Control effects (placeholder)
  if (parts[0] === 'control') {
    return {
      success: true,
      description: effect.replace(/_/g, ' ')
    };
  }

  // Default: effect not yet implemented
  return {
    success: true,
    description: effect.replace(/_/g, ' ')
  };
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

    // Execute effects - handle undefined safely
    const attackEffects = (power.effects?.attack && Array.isArray(power.effects.attack))
      ? power.effects.attack
      : [];
    const affectedPlayers: Array<{ uuid: string; name: string; effects: string[] }> = [];
    let totalDamage = 0;
    let attackSuccess = false;
    let rollDescription = '';

    // First, execute check effects to determine success
    for (const effect of attackEffects) {
      if (effect.startsWith('check_')) {
        // Get target stat value safely
        const baseStatName = power.baseStat?.toLowerCase() || 'mental';
        let targetStatValue: number;
        if (baseStatName === 'physical') targetStatValue = target.arkanaStats.physical;
        else if (baseStatName === 'mental') targetStatValue = target.arkanaStats.mental;
        else if (baseStatName === 'dexterity') targetStatValue = target.arkanaStats.dexterity;
        else if (baseStatName === 'perception') targetStatValue = target.arkanaStats.perception;
        else targetStatValue = target.arkanaStats.mental;

        const result = executeEffect(effect, attacker.arkanaStats, target.arkanaStats, targetStatValue);
        attackSuccess = result.success;
        rollDescription = result.description || '';
        break; // Only one check effect per attack
      }
    }

    // If attack failed on check, don't apply damage effects
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
            healthAfter: target.stats.health, // No change on miss
            isUnconscious: (target.stats.health <= 0) ? 'true' : 'false'
          },
          message: encodeForLSL(`${attacker.arkanaStats.characterName} uses ${power.name} on ${target.arkanaStats.characterName} - MISS! ${rollDescription}`)
        }
      });
    }

    // Attack succeeded or no check required - apply damage effects
    for (const effect of attackEffects) {
      if (effect.startsWith('damage_')) {
        const result = executeEffect(effect, attacker.arkanaStats, target.arkanaStats);
        if (result.damage) {
          totalDamage += result.damage;
        }
      }
    }

    // Apply damage to target
    let newTargetHealth = target.stats.health;
    if (totalDamage > 0) {
      newTargetHealth = Math.max(0, target.stats.health - totalDamage);
      await prisma.userStats.update({
        where: { userId: target.id },
        data: {
          health: newTargetHealth,
          lastUpdated: new Date()
        }
      });

      affectedPlayers.push({
        uuid: target.slUuid,
        name: target.arkanaStats.characterName,
        effects: [`Took ${totalDamage} damage`]
      });
    }

    // Build result message
    const attackerName = attacker.arkanaStats.characterName;
    const targetName = target.arkanaStats.characterName;
    const resultMessage = attackSuccess
      ? `${attackerName} uses ${power.name} on ${targetName} - HIT! ${rollDescription} - ${totalDamage} damage dealt`
      : `${attackerName} uses ${power.name} on ${targetName} - ${totalDamage} damage dealt`;

    return NextResponse.json({
      success: true,
      data: {
        attackSuccess: attackSuccess ? 'true' : 'false',
        powerUsed: power.name,
        powerBaseStat: power.baseStat || 'Mental',
        rollInfo: rollDescription,
        totalDamage,
        affected: affectedPlayers.map(p => ({
          uuid: p.uuid,
          name: encodeForLSL(p.name),
          effects: p.effects
        })),
        target: {
          uuid: target.slUuid,
          name: encodeForLSL(targetName),
          healthBefore: target.stats.health,
          healthAfter: newTargetHealth,
          isUnconscious: (newTargetHealth <= 0) ? 'true' : 'false'
        },
        message: encodeForLSL(resultMessage)
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
