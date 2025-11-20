import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gorCombatAttackSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { encodeForLSL } from '@/lib/stringUtils';
import {
  calculateAttack,
  validateAttackWeapon,
  formatAttackResultForLSL,
  type GorAttackType,
  type GorWeaponType
} from '@/lib/gor/combatUtils';
import {
  recalculateLiveStats,
  processEffectsTurn
} from '@/lib/gor/effectsUtils';
import type { ActiveEffect } from '@/lib/gor/types';

// POST /api/gor/combat/attack - Perform a combat attack
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { error, value } = gorCombatAttackSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const {
      attacker_uuid,
      target_uuid,
      attack_type,
      weapon_type,
      universe,
      timestamp,
      signature
    } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Cannot attack yourself
    if (attacker_uuid === target_uuid) {
      return NextResponse.json(
        { success: false, error: 'Cannot attack yourself' },
        { status: 400 }
      );
    }

    // Validate weapon/attack type combination
    const weaponValidation = validateAttackWeapon(
      attack_type as GorAttackType,
      weapon_type as GorWeaponType
    );
    if (!weaponValidation.valid) {
      return NextResponse.json(
        { success: false, error: weaponValidation.error },
        { status: 400 }
      );
    }

    // Load attacker with stats
    const attacker = await prisma.user.findFirst({
      where: {
        slUuid: attacker_uuid,
        universe: {
          equals: universe,
          mode: 'insensitive'
        }
      },
      include: {
        stats: true,
        goreanStats: true
      }
    });

    if (!attacker) {
      return NextResponse.json(
        { success: false, error: 'Attacker not found' },
        { status: 404 }
      );
    }

    if (!attacker.goreanStats || !attacker.goreanStats.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Attacker has not completed character registration' },
        { status: 400 }
      );
    }

    // Load target with stats
    const target = await prisma.user.findFirst({
      where: {
        slUuid: target_uuid,
        universe: {
          equals: universe,
          mode: 'insensitive'
        }
      },
      include: {
        stats: true,
        goreanStats: true
      }
    });

    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Target not found' },
        { status: 404 }
      );
    }

    if (!target.goreanStats || !target.goreanStats.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Target has not completed character registration' },
        { status: 400 }
      );
    }

    // Check if target is conscious (has health > 0)
    if (target.goreanStats.healthCurrent <= 0) {
      return NextResponse.json(
        { success: false, error: 'Target is unconscious' },
        { status: 400 }
      );
    }

    // Check if attacker has required RPG status
    if (attacker.stats && attacker.stats.status > 3) {
      return NextResponse.json(
        { success: false, error: 'Must be in Full, Survival, Combat or RP mode to attack' },
        { status: 400 }
      );
    }

    // Get live stats from active effects
    const attackerActiveEffects = (attacker.goreanStats.activeEffects as unknown as ActiveEffect[]) || [];
    const targetActiveEffects = (target.goreanStats.activeEffects as unknown as ActiveEffect[]) || [];

    const attackerLiveStats = await recalculateLiveStats(attackerActiveEffects);
    const targetLiveStats = await recalculateLiveStats(targetActiveEffects);

    // Check if attacker is stunned
    if (attackerLiveStats.stun) {
      return NextResponse.json(
        { success: false, error: 'Cannot attack while stunned' },
        { status: 400 }
      );
    }

    // Calculate attack
    const attackResult = await calculateAttack(
      attacker.goreanStats,
      target.goreanStats,
      {
        attackType: attack_type as GorAttackType,
        weaponType: weapon_type as GorWeaponType
      },
      attackerLiveStats,
      targetLiveStats,
      targetActiveEffects
    );

    // Prepend attacker and target names to message
    attackResult.message = `${attacker.goreanStats.characterName} → ${target.goreanStats.characterName}: ${attackResult.message}`;

    // Calculate new target health
    const newTargetHealth = Math.max(0, target.goreanStats.healthCurrent - attackResult.damage);

    // Update target's health in database
    await prisma.goreanStats.update({
      where: { userId: target.id },
      data: {
        healthCurrent: newTargetHealth,
        updatedAt: new Date()
      }
    });

    // Also update UserStats health for consistency
    if (target.stats) {
      await prisma.userStats.update({
        where: { userId: target.id },
        data: {
          health: newTargetHealth,
          lastUpdated: new Date()
        }
      });
    }

    // Process attacker's turn effects (decrement durations, apply HoT)
    const attackerTurnResult = await processEffectsTurn(
      attackerActiveEffects,
      attacker.goreanStats
    );

    // Update attacker's effects if changed
    if (JSON.stringify(attackerTurnResult.activeEffects) !== JSON.stringify(attackerActiveEffects)) {
      await prisma.goreanStats.update({
        where: { userId: attacker.id },
        data: {
          activeEffects: attackerTurnResult.activeEffects as unknown as object[],
          liveStats: attackerTurnResult.liveStats as unknown as object,
          updatedAt: new Date()
        }
      });

      // Apply HoT healing to attacker
      if (attackerTurnResult.healingApplied > 0) {
        const attackerNewHealth = Math.min(
          attacker.goreanStats.healthMax,
          attacker.goreanStats.healthCurrent + attackerTurnResult.healingApplied
        );
        await prisma.goreanStats.update({
          where: { userId: attacker.id },
          data: {
            healthCurrent: attackerNewHealth
          }
        });
        if (attacker.stats) {
          await prisma.userStats.update({
            where: { userId: attacker.id },
            data: { health: attackerNewHealth }
          });
        }
      }
    }

    // Update last active timestamps
    await prisma.user.updateMany({
      where: {
        id: { in: [attacker.id, target.id] }
      },
      data: { lastActive: new Date() }
    });

    // Create combat event
    await prisma.event.create({
      data: {
        userId: attacker.id,
        type: 'COMBAT_ATTACK',
        details: {
          attackType: attack_type,
          weaponType: weapon_type,
          targetId: target.id,
          targetUuid: target_uuid,
          hit: attackResult.hit,
          damage: attackResult.damage,
          roll: attackResult.roll,
          attackModifier: attackResult.attackModifier,
          targetNumber: attackResult.targetNumber,
          isCritical: attackResult.isCritical,
          targetHealthBefore: target.goreanStats.healthCurrent,
          targetHealthAfter: newTargetHealth
        }
      }
    });

    // Format LSL response
    const lslMessage = formatAttackResultForLSL(
      attackResult,
      attacker.goreanStats.characterName,
      target.goreanStats.characterName,
      newTargetHealth,
      target.goreanStats.healthMax
    );

    // Return response
    return NextResponse.json({
      success: true,
      data: {
        hit: attackResult.hit,
        damage: attackResult.damage,
        message: attackResult.message,
        lslMessage: encodeForLSL(lslMessage),
        attacker: {
          uuid: attacker_uuid,
          name: encodeForLSL(attacker.goreanStats.characterName),
          health: attacker.goreanStats.healthCurrent,
          maxHealth: attacker.goreanStats.healthMax,
          healingApplied: attackerTurnResult.healingApplied
        },
        target: {
          uuid: target_uuid,
          name: encodeForLSL(target.goreanStats.characterName),
          health: newTargetHealth,
          maxHealth: target.goreanStats.healthMax,
          unconscious: newTargetHealth <= 0
        },
        roll: {
          d20: attackResult.roll,
          modifier: attackResult.attackModifier,
          skillBonus: attackResult.skillBonus,
          total: attackResult.roll + attackResult.attackModifier,
          targetNumber: attackResult.targetNumber,
          defenseModifier: attackResult.defenseModifier
        },
        damageBreakdown: {
          baseDamage: attackResult.baseDamage,
          statBonus: attackResult.statDamageBonus,
          skillBonus: attackResult.skillBonus,
          damageReduction: attackResult.damageReduction,
          total: attackResult.damage
        },
        critical: {
          isCritical: attackResult.isCritical,
          isCriticalMiss: attackResult.isCriticalMiss
        }
      }
    });

  } catch (error: unknown) {
    console.error('Error in combat attack:', error);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
