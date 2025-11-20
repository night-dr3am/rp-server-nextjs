// Combat utilities for Gor
// Handles attack calculations, damage, and skill bonuses

import { getEffectiveStatModifier, GorLiveStats, getDamageReduction } from './effectsUtils';
import type { GoreanStatName, CharacterSkill, ActiveEffect } from './types';
import type { GoreanStats } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export type GorAttackType = 'melee_unarmed' | 'melee_weapon' | 'ranged';

export type GorWeaponType = 'unarmed' | 'light_weapon' | 'medium_weapon' | 'heavy_weapon' | 'bow' | 'crossbow';

export interface AttackConfig {
  attackType: GorAttackType;
  weaponType: GorWeaponType;
}

export interface AttackResult {
  hit: boolean;
  damage: number;
  roll: number;
  attackModifier: number;
  skillBonus: number;
  targetNumber: number;
  defenseModifier: number;
  damageReduction: number;
  baseDamage: number;
  statDamageBonus: number;
  message: string;
  isCritical?: boolean;
  isCriticalMiss?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Base damage for weapon types (scaled for Gor HP ranges 60-200+)
export const WEAPON_BASE_DAMAGE: Record<GorWeaponType, number> = {
  unarmed: 2,
  light_weapon: 3,
  medium_weapon: 4,
  heavy_weapon: 5,
  bow: 4,
  crossbow: 5
};

// Attack stat mapping
export const ATTACK_STAT: Record<GorAttackType, GoreanStatName> = {
  melee_unarmed: 'strength',
  melee_weapon: 'strength',
  ranged: 'perception'
};

// Defense stat mapping
export const DEFENSE_STAT: Record<GorAttackType, GoreanStatName> = {
  melee_unarmed: 'agility',
  melee_weapon: 'agility',
  ranged: 'agility'
};

// Skill mapping for attack types
export const ATTACK_SKILL: Record<GorAttackType, string> = {
  melee_unarmed: 'unarmed_combat',
  melee_weapon: 'swordplay',
  ranged: 'archery'
};

// Damage stat mapping (stat that adds to damage)
export const DAMAGE_STAT: Record<GorAttackType, GoreanStatName> = {
  melee_unarmed: 'strength',
  melee_weapon: 'strength',
  ranged: 'perception'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Roll a d20
 */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Get base damage for a weapon type
 */
export function getWeaponBaseDamage(weaponType: GorWeaponType): number {
  return WEAPON_BASE_DAMAGE[weaponType] || 2;
}

/**
 * Get skill bonus from character's skills
 * Returns +1 per skill level
 */
export function getSkillBonus(skills: CharacterSkill[], skillId: string): number {
  const skill = skills.find(s => s.skill_id === skillId);
  return skill ? skill.level : 0;
}

/**
 * Get attack stat for an attack type
 */
export function getAttackStat(attackType: GorAttackType): GoreanStatName {
  return ATTACK_STAT[attackType];
}

/**
 * Get defense stat for an attack type
 */
export function getDefenseStat(attackType: GorAttackType): GoreanStatName {
  return DEFENSE_STAT[attackType];
}

/**
 * Get the skill ID used for an attack type
 */
export function getAttackSkillId(attackType: GorAttackType): string {
  return ATTACK_SKILL[attackType];
}

/**
 * Get the stat used for damage bonus
 */
export function getDamageStat(attackType: GorAttackType): GoreanStatName {
  return DAMAGE_STAT[attackType];
}

// ============================================================================
// MAIN COMBAT FUNCTIONS
// ============================================================================

/**
 * Calculate a complete attack
 *
 * Attack Roll: d20 + attackStatMod + skillBonus
 * Target Number: 10 + defenseStatMod
 * Damage: baseDamage + damageStatMod + skillBonus - damageReduction
 */
export async function calculateAttack(
  attacker: GoreanStats,
  target: GoreanStats,
  config: AttackConfig,
  attackerLiveStats?: GorLiveStats | null,
  targetLiveStats?: GorLiveStats | null,
  targetActiveEffects?: ActiveEffect[]
): Promise<AttackResult> {
  const { attackType, weaponType } = config;

  // Get stat names for this attack type
  const attackStatName = getAttackStat(attackType);
  const defenseStatName = getDefenseStat(attackType);
  const damageStatName = getDamageStat(attackType);
  const skillId = getAttackSkillId(attackType);

  // Calculate attack modifier (stat + skill)
  const attackStatMod = getEffectiveStatModifier(attacker, attackerLiveStats, attackStatName);
  const skills = (attacker.skills as unknown as CharacterSkill[]) || [];
  const skillBonus = getSkillBonus(skills, skillId);
  const attackModifier = attackStatMod + skillBonus;

  // Calculate defense (target number)
  const defenseModifier = getEffectiveStatModifier(target, targetLiveStats, defenseStatName);
  const targetNumber = 10 + defenseModifier;

  // Roll attack
  const roll = rollD20();
  const total = roll + attackModifier;
  const hit = total >= targetNumber;

  // Check for critical hit/miss
  const isCritical = roll === 20;
  const isCriticalMiss = roll === 1;

  // Calculate damage if hit
  let damage = 0;
  let baseDamage = 0;
  let statDamageBonus = 0;
  let damageReduction = 0;

  if (hit && !isCriticalMiss) {
    baseDamage = getWeaponBaseDamage(weaponType);
    statDamageBonus = getEffectiveStatModifier(attacker, attackerLiveStats, damageStatName);

    // Calculate total damage
    damage = baseDamage + statDamageBonus + skillBonus;

    // Apply damage reduction from defense effects
    if (targetActiveEffects) {
      damageReduction = await getDamageReduction(targetActiveEffects);
      damage = Math.max(1, damage - damageReduction); // Minimum 1 damage on hit
    }

    // Critical hit doubles damage
    if (isCritical) {
      damage = damage * 2;
    }
  }

  // Build message
  let message = '';
  if (isCriticalMiss) {
    message = `Critical Miss! ${attacker.characterName} fumbles their attack!`;
  } else if (isCritical && hit) {
    message = `CRITICAL HIT! Roll: ${roll}+${attackModifier}=${total} vs TN ${targetNumber}. ` +
      `Damage: (${baseDamage}+${statDamageBonus}+${skillBonus})×2 = ${damage}`;
  } else if (hit) {
    message = `Hit! Roll: ${roll}+${attackModifier}=${total} vs TN ${targetNumber}. ` +
      `Damage: ${baseDamage}+${statDamageBonus}+${skillBonus}`;
    if (damageReduction > 0) {
      message += `-${damageReduction}`;
    }
    message += ` = ${damage}`;
  } else {
    message = `Miss! Roll: ${roll}+${attackModifier}=${total} vs TN ${targetNumber}`;
  }

  return {
    hit: hit && !isCriticalMiss, // Critical miss is always a miss
    damage,
    roll,
    attackModifier,
    skillBonus,
    targetNumber,
    defenseModifier,
    damageReduction,
    baseDamage,
    statDamageBonus,
    message,
    isCritical,
    isCriticalMiss
  };
}

/**
 * Format attack result for LSL display
 * Returns a pipe-separated string for HUD display
 */
export function formatAttackResultForLSL(
  result: AttackResult,
  attackerName: string,
  targetName: string,
  targetNewHealth: number,
  targetMaxHealth: number
): string {
  const hitStatus = result.hit ? 'HIT' : 'MISS';
  const critStatus = result.isCritical ? 'CRITICAL' : result.isCriticalMiss ? 'FUMBLE' : '';

  // Format: ATTACK|status|attacker|target|roll|mod|tn|damage|newHP|maxHP|crit
  const parts = [
    'ATTACK',
    hitStatus,
    attackerName,
    targetName,
    result.roll.toString(),
    result.attackModifier.toString(),
    result.targetNumber.toString(),
    result.damage.toString(),
    targetNewHealth.toString(),
    targetMaxHealth.toString(),
    critStatus
  ];

  return parts.join('|');
}

/**
 * Calculate damage without attack roll (for abilities that auto-hit)
 */
export function calculateDirectDamage(
  attacker: GoreanStats,
  baseDamage: number,
  statName?: GoreanStatName,
  attackerLiveStats?: GorLiveStats | null
): number {
  let damage = baseDamage;

  if (statName) {
    damage += getEffectiveStatModifier(attacker, attackerLiveStats, statName);
  }

  return Math.max(1, damage);
}

/**
 * Check if attacker can perform the attack type with their weapon
 */
export function validateAttackWeapon(
  attackType: GorAttackType,
  weaponType: GorWeaponType
): { valid: boolean; error?: string } {
  // Melee unarmed only works with unarmed
  if (attackType === 'melee_unarmed' && weaponType !== 'unarmed') {
    return { valid: false, error: 'Unarmed attacks cannot use weapons' };
  }

  // Melee weapon requires actual weapon
  if (attackType === 'melee_weapon' && weaponType === 'unarmed') {
    return { valid: false, error: 'Weapon attacks require a weapon' };
  }

  // Ranged requires bow or crossbow
  if (attackType === 'ranged' && !['bow', 'crossbow'].includes(weaponType)) {
    return { valid: false, error: 'Ranged attacks require a bow or crossbow' };
  }

  // Melee weapon cannot use ranged weapons
  if (attackType === 'melee_weapon' && ['bow', 'crossbow'].includes(weaponType)) {
    return { valid: false, error: 'Cannot use ranged weapons for melee attacks' };
  }

  return { valid: true };
}
