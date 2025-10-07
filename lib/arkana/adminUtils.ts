import { prisma } from '@/lib/prisma';
import { validateProfileToken, ProfileTokenValidationResult } from '@/lib/profileTokenUtils';

export interface AdminValidationResult {
  valid: boolean;
  user?: {
    id: string;
    slUuid: string;
    username: string;
    universe: string;
  };
  arkanaStats?: {
    arkanaRole: string;
  };
  error?: string;
}

/**
 * Validates that a token belongs to an Arkana admin user
 * Checks: valid token + universe === 'arkana' + arkanaRole === 'admin'
 */
export async function validateAdminToken(token: string): Promise<AdminValidationResult> {
  // First validate the token itself
  const tokenValidation: ProfileTokenValidationResult = await validateProfileToken(token);

  if (!tokenValidation.valid) {
    return {
      valid: false,
      error: tokenValidation.error || 'Invalid token'
    };
  }

  const user = tokenValidation.profileToken!.user;

  // Check universe
  if (user.universe !== 'arkana') {
    return {
      valid: false,
      error: 'Access denied: This feature is only available for Arkana universe'
    };
  }

  // Get arkana stats to check role
  const arkanaStats = await prisma.arkanaStats.findUnique({
    where: { userId: user.id },
    select: { arkanaRole: true }
  });

  if (!arkanaStats) {
    return {
      valid: false,
      error: 'Access denied: No Arkana character found'
    };
  }

  // Check admin role
  if (arkanaStats.arkanaRole !== 'admin') {
    return {
      valid: false,
      error: 'Access denied: Administrator privileges required'
    };
  }

  return {
    valid: true,
    user: {
      id: user.id,
      slUuid: user.slUuid,
      username: user.username,
      universe: user.universe
    },
    arkanaStats: {
      arkanaRole: arkanaStats.arkanaRole
    }
  };
}

/**
 * Checks if a user is an Arkana admin
 */
export function isArkanaAdmin(arkanaRole: string, universe: string): boolean {
  return universe === 'arkana' && arkanaRole === 'admin';
}

/**
 * Calculate health percentage for display
 */
export function calculateHealthPercentage(currentHealth: number, maxHealth: number): number {
  if (maxHealth <= 0) return 0;
  const percentage = (currentHealth / maxHealth) * 100;
  return Math.max(0, Math.min(100, percentage)); // Clamp between 0-100
}

/**
 * Get health bar color based on percentage
 * Returns Tailwind CSS class name
 */
export function getHealthColor(percentage: number): string {
  if (percentage >= 75) return 'bg-green-500';
  if (percentage >= 50) return 'bg-yellow-500';
  if (percentage >= 25) return 'bg-orange-500';
  return 'bg-red-500';
}

/**
 * Get health status text based on percentage
 */
export function getHealthStatus(percentage: number): string {
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 75) return 'Healthy';
  if (percentage >= 50) return 'Wounded';
  if (percentage >= 25) return 'Critical';
  if (percentage > 0) return 'Near Death';
  return 'Incapacitated';
}

/**
 * Validate that current health doesn't exceed max health
 */
export function validateHealthValues(currentHealth: number, maxHealth: number): { valid: boolean; error?: string } {
  if (currentHealth < 0) {
    return { valid: false, error: 'Current health cannot be negative' };
  }

  if (maxHealth <= 0) {
    return { valid: false, error: 'Maximum health must be greater than zero' };
  }

  if (currentHealth > maxHealth) {
    return { valid: false, error: 'Current health cannot exceed maximum health' };
  }

  return { valid: true };
}
