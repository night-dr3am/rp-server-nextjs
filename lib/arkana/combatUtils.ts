/**
 * Shared combat utilities for Arkana power endpoints
 *
 * This module provides reusable functions for loading and validating
 * combat participants (attackers, casters, targets) to eliminate code
 * duplication between power-attack and power-activate endpoints.
 */

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

/**
 * Type representing a user with all combat-relevant data loaded
 */
export type UserWithStats = Prisma.UserGetPayload<{
  include: { arkanaStats: true; stats: true };
}> | null;

/**
 * Validation result for combat readiness checks
 */
export interface CombatReadinessResult {
  valid: boolean;
  error?: string;
  statusCode?: number; // HTTP status code: 404 for not found, 400 for invalid state
}

/**
 * Load and validate a combat target by UUID
 *
 * @param target_uuid - Target's SL UUID (optional for area-of-effect powers)
 * @param universe - Universe identifier ('arkana')
 * @returns User with stats, or null if not provided
 */
export async function loadCombatTarget(
  target_uuid: string | undefined,
  universe: string
): Promise<UserWithStats> {
  if (!target_uuid) {
    return null;
  }

  const target = await prisma.user.findFirst({
    where: { slUuid: target_uuid, universe },
    include: { arkanaStats: true, stats: true }
  });

  return target;
}

/**
 * Load nearby players for area-of-effect or multi-target powers
 *
 * Filters out:
 * - Unregistered players
 * - Players not in RP mode
 * - Unconscious players (health <= 0)
 * - Players in excludeUuids list
 *
 * @param nearby_uuids - Array of SL UUIDs for nearby players
 * @param universe - Universe identifier ('arkana')
 * @param excludeUuids - UUIDs to exclude (typically caster and primary target)
 * @returns Array of valid nearby players
 */
export async function loadNearbyPlayers(
  nearby_uuids: string[] | undefined,
  universe: string,
  excludeUuids: string[]
): Promise<NonNullable<UserWithStats>[]> {
  if (!nearby_uuids || !Array.isArray(nearby_uuids) || nearby_uuids.length === 0) {
    return [];
  }

  const nearbyUsers = await prisma.user.findMany({
    where: {
      slUuid: { in: nearby_uuids },
      universe
    },
    include: { arkanaStats: true, stats: true }
  });

  // Filter to registered, conscious users in RP mode (exclude specified UUIDs)
  const validNearby = nearbyUsers.filter((u): u is NonNullable<typeof u> =>
    u !== null &&
    u.arkanaStats?.registrationCompleted === true &&
    u.stats?.status === 0 &&
    u.stats.health > 0 &&
    !excludeUuids.includes(u.slUuid)
  );

  return validNearby;
}

/**
 * Build array of all potential targets for effect application
 *
 * Combines primary target (if provided) with nearby players.
 * Used by determineApplicableTargets() to select targets based on effect type.
 *
 * @param target - Primary target (may be null for area-only effects)
 * @param nearbyUsers - Array of nearby valid players
 * @returns Array of all potential targets (excludes nulls)
 */
export function buildPotentialTargets(
  target: UserWithStats,
  nearbyUsers: NonNullable<UserWithStats>[]
): NonNullable<UserWithStats>[] {
  const allTargets: NonNullable<UserWithStats>[] = [];

  if (target) {
    allTargets.push(target);
  }

  allTargets.push(...nearbyUsers);

  return allTargets;
}

/**
 * Validate combat readiness for a user
 *
 * Checks:
 * - User exists
 * - Arkana registration completed
 * - User stats exist
 * - (For targets) User is conscious (health > 0)
 * - User is in RP mode (status === 0)
 *
 * @param user - User to validate (may be null)
 * @param role - Role in combat ('attacker', 'caster', or 'target')
 * @returns Validation result with error message if invalid
 */
export function validateCombatReadiness(
  user: UserWithStats,
  role: 'attacker' | 'caster' | 'target'
): CombatReadinessResult {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  // 404 errors: Resource not found
  if (!user) {
    return {
      valid: false,
      error: `${roleLabel} not found`,
      statusCode: 404
    };
  }

  if (!user.arkanaStats?.registrationCompleted) {
    return {
      valid: false,
      error: `${roleLabel} not found or registration incomplete`,
      statusCode: 404
    };
  }

  if (!user.stats) {
    return {
      valid: false,
      error: `${roleLabel} stats not found`,
      statusCode: 404
    };
  }

  // 400 errors: Invalid state (resource exists but cannot be used)
  // For targets in attack endpoints, check consciousness
  if (role === 'target' && user.stats.health <= 0) {
    return {
      valid: false,
      error: 'Target is unconscious',
      statusCode: 400
    };
  }

  // Check RP mode (status === 0 means IC/RP mode)
  if (user.stats.status !== 0) {
    return {
      valid: false,
      error: `${roleLabel} is not in RP mode`,
      statusCode: 400
    };
  }

  return { valid: true };
}
