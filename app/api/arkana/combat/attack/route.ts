import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaCombatAttackSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input using our validation schema
    const { error, value } = arkanaCombatAttackSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { attacker_uuid, target_uuid, attack_type, universe, timestamp, signature } = value;

    // Validate signature for Arkana universe
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Validate that attacker and target are different
    if (attacker_uuid === target_uuid) {
      return NextResponse.json(
        { success: false, error: 'Cannot attack yourself' },
        { status: 400 }
      );
    }

    // Get both players with their arkanaStats and regular stats
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
    if (!attacker) {
      return NextResponse.json(
        { success: false, error: 'Attacker not found in Arkana universe' },
        { status: 404 }
      );
    }

    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Target not found in Arkana universe' },
        { status: 404 }
      );
    }

    // Validate both players have completed Arkana character registration
    if (!attacker.arkanaStats || !attacker.arkanaStats.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Attacker registration incomplete' },
        { status: 400 }
      );
    }

    if (!target.arkanaStats || !target.arkanaStats.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Target registration incomplete' },
        { status: 400 }
      );
    }

    // Check if target is conscious (health > 0)
    if (!target.stats || target.stats.health <= 0) {
      return NextResponse.json(
        { success: false, error: 'Target is unconscious' },
        { status: 400 }
      );
    }

    // Calculate stat modifiers (stat - 3)
    const getModifier = (stat: number): number => stat - 3;

    // Determine attack resolution based on attack type
    let attackerMod: number;
    let defenderMod: number;
    let attackStat: string;
    let defenseStat: string;

    switch (attack_type) {
      case 'physical':
        attackerMod = getModifier(attacker.arkanaStats.physical);
        defenderMod = getModifier(target.arkanaStats.dexterity);
        attackStat = 'Physical';
        defenseStat = 'Dexterity';
        break;
      case 'ranged':
        attackerMod = getModifier(attacker.arkanaStats.dexterity);
        defenderMod = getModifier(target.arkanaStats.dexterity);
        attackStat = 'Dexterity';
        defenseStat = 'Dexterity';
        break;
      case 'power':
        attackerMod = getModifier(attacker.arkanaStats.mental);
        defenderMod = getModifier(target.arkanaStats.mental);
        attackStat = 'Mental';
        defenseStat = 'Mental';
        break;
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid attack type' },
          { status: 400 }
        );
    }

    // Roll D20 + attacker modifier
    const d20Roll = Math.floor(Math.random() * 20) + 1;
    const attackRoll = d20Roll + attackerMod;
    const targetNumber = 10 + defenderMod;

    // Determine hit/miss
    const isHit = attackRoll >= targetNumber;

    // Calculate damage if hit (base damage = 1 for now, can be expanded)
    let damage = 0;
    let newTargetHealth = target.stats.health;

    if (isHit) {
      damage = 1; // Base damage, can add weapon modifiers later
      newTargetHealth = Math.max(0, target.stats.health - damage);

      // Update target's health
      await prisma.userStats.update({
        where: { userId: target.id },
        data: {
          health: newTargetHealth,
          lastUpdated: new Date()
        }
      });
    }

    // Create result message
    const attackerName = attacker.arkanaStats.characterName;
    const targetName = target.arkanaStats.characterName;
    const resultMessage = isHit
      ? `${attackerName} hits ${targetName} for ${damage} damage! (Roll: ${d20Roll}+${attackerMod}=${attackRoll} vs TN:${targetNumber})`
      : `${attackerName} misses ${targetName}! (Roll: ${d20Roll}+${attackerMod}=${attackRoll} vs TN:${targetNumber})`;

    // Return detailed result
    return NextResponse.json({
      success: true,
      data: {
        isHit,
        damage,
        attackRoll,
        targetNumber,
        d20Roll,
        attackerMod,
        defenderMod,
        attackStat,
        defenseStat,
        message: resultMessage,
        attacker: {
          uuid: attacker.slUuid,
          name: attackerName,
          stat: attacker.arkanaStats[attack_type === 'physical' ? 'physical' :
                                      attack_type === 'ranged' ? 'dexterity' : 'mental']
        },
        target: {
          uuid: target.slUuid,
          name: targetName,
          stat: target.arkanaStats[attack_type === 'power' ? 'mental' : 'dexterity'],
          healthBefore: target.stats.health,
          healthAfter: newTargetHealth,
          isUnconscious: newTargetHealth <= 0
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error processing combat attack:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}