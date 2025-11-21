import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { arkanaShopPurchaseSchema } from '@/lib/validation';
import { validateProfileTokenForUser } from '@/lib/profileTokenUtils';
import {
  validatePurchaseItem,
  getSchoolIdForWeave,
} from '@/lib/arkana/shopHelpers';
import { loadAllData } from '@/lib/arkana/dataLoader';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = arkanaShopPurchaseSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: error.details[0].message },
        { status: 400 }
      );
    }

    const { sl_uuid, universe, token, sessionId, purchases } = value;

    // Validate token for the specific user with session validation
    const validationResult = await validateProfileTokenForUser(
      token,
      sl_uuid,
      universe,
      sessionId
    );

    if (!validationResult.valid) {
      let status = 401;
      let userFriendlyError = validationResult.error;

      if (validationResult.error === 'Token expired') {
        userFriendlyError = 'This profile link has expired. Please request a new link from your HUD.';
      } else if (validationResult.error === 'Token does not match requested user') {
        status = 403;
        userFriendlyError = 'This profile link is not valid for the requested user.';
      } else if (validationResult.error === 'Token belongs to a different session') {
        status = 403;
        userFriendlyError = 'This profile link is being used in a different browser session.';
      }

      return NextResponse.json(
        { success: false, error: userFriendlyError },
        { status }
      );
    }

    // Load Arkana data (cybernetics and magic) for validation
    await loadAllData();

    // Start a database transaction for atomic purchase processing
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Find user with arkana stats
      const user = await tx.user.findFirst({
        where: { slUuid: sl_uuid, universe },
        include: {
          arkanaStats: true
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (!user.arkanaStats) {
        throw new Error('Arkana character not found. Please complete character creation first.');
      }

      const arkanaStats = user.arkanaStats;
      const race = arkanaStats.race || '';
      const archetype = arkanaStats.archetype || '';

      // Validate all purchases before processing
      const totalCost = purchases.reduce((sum: number, purchase: { itemType: string; itemId: string; xpCost: number }) => sum + purchase.xpCost, 0);

      // Calculate slots being purchased
      const slotPurchases = purchases.filter((p: { itemType: string; quantity?: number }) => p.itemType === 'cybernetic_slot');
      const totalSlotsToPurchase = slotPurchases.reduce((sum: number, p: { quantity?: number }) => sum + (p.quantity || 1), 0);

      // Count cybernetics being purchased
      const cyberneticsPurchased = purchases.filter((p: { itemType: string }) => p.itemType === 'cybernetic').length;

      // Validate slot limits
      const currentSlots = arkanaStats.cyberneticsSlots || 0;
      const usedSlots = arkanaStats.cyberneticAugments.length;
      const newTotalSlots = currentSlots + totalSlotsToPurchase;
      const newUsedSlots = usedSlots + cyberneticsPurchased;

      if (newTotalSlots > 20) {
        throw new Error(`Cannot purchase ${totalSlotsToPurchase} slots. Maximum is 20 slots total. You currently have ${currentSlots}.`);
      }

      // Validate cybernetics don't exceed available slots
      if (newUsedSlots > newTotalSlots) {
        const slotsNeeded = newUsedSlots - newTotalSlots;
        throw new Error(`Not enough cybernetic slots. You need ${slotsNeeded} more slot(s) to purchase these cybernetics.`);
      }

      // Check XP balance
      if (arkanaStats.xp < totalCost) {
        throw new Error(
          `Insufficient XP. You have ${arkanaStats.xp} XP, but this purchase costs ${totalCost} XP.`
        );
      }

      // Validate each purchase
      const validatedPurchases = [];
      // Track schools being purchased in this transaction
      const schoolsBeingPurchased: string[] = [];

      for (const purchase of purchases) {
        // Skip validation for slot purchases - they're validated above
        if (purchase.itemType === 'cybernetic_slot') {
          // Validate slot cost (1 XP per slot)
          const expectedCost = (purchase.quantity || 1) * 1;
          if (purchase.xpCost !== expectedCost) {
            throw new Error(`Invalid slot cost. Expected ${expectedCost} XP for ${purchase.quantity || 1} slot(s).`);
          }
          validatedPurchases.push({
            ...purchase,
            actualCost: purchase.xpCost
          });
          continue;
        }

        const validation = validatePurchaseItem(
          purchase.itemType,
          purchase.itemId,
          purchase.xpCost,
          race,
          archetype
        );

        if (!validation.valid) {
          throw new Error(validation.error || 'Invalid purchase');
        }

        // Check if item is already owned
        if (purchase.itemType === 'cybernetic') {
          if (arkanaStats.cyberneticAugments.includes(purchase.itemId)) {
            throw new Error(`You already own this cybernetic`);
          }
        } else if (purchase.itemType === 'magic_weave') {
          if (arkanaStats.magicWeaves.includes(purchase.itemId)) {
            throw new Error(`You already own this magic weave`);
          }
          // Validate that the required school is owned or being purchased
          const requiredSchoolId = getSchoolIdForWeave(purchase.itemId);
          if (requiredSchoolId &&
              !arkanaStats.magicSchools.includes(requiredSchoolId) &&
              !schoolsBeingPurchased.includes(requiredSchoolId)) {
            throw new Error(`You must purchase the required magic school before buying this weave`);
          }
        } else if (purchase.itemType === 'magic_school') {
          if (arkanaStats.magicSchools.includes(purchase.itemId)) {
            throw new Error(`You already own this magic school`);
          }
          schoolsBeingPurchased.push(purchase.itemId);
        } else if (purchase.itemType === 'common_power') {
          if (arkanaStats.commonPowers.includes(purchase.itemId)) {
            throw new Error(`You already own this common power`);
          }
        } else if (purchase.itemType === 'archetype_power') {
          if (arkanaStats.archetypePowers.includes(purchase.itemId)) {
            throw new Error(`You already own this archetype power`);
          }
        } else if (purchase.itemType === 'perk') {
          if (arkanaStats.perks.includes(purchase.itemId)) {
            throw new Error(`You already own this perk`);
          }
        }

        validatedPurchases.push({
          ...purchase,
          actualCost: validation.actualCost
        });
      }

      // Prepare arrays for updates
      const newCybernetics: string[] = [];
      const newMagicWeaves: string[] = [];
      const newMagicSchools: string[] = [];
      const newCommonPowers: string[] = [];
      const newArchetypePowers: string[] = [];
      const newPerks: string[] = [];

      // Process each purchase
      for (const purchase of validatedPurchases) {
        if (purchase.itemType === 'cybernetic') {
          newCybernetics.push(purchase.itemId);
        } else if (purchase.itemType === 'magic_weave') {
          newMagicWeaves.push(purchase.itemId);
        } else if (purchase.itemType === 'magic_school') {
          newMagicSchools.push(purchase.itemId);
        } else if (purchase.itemType === 'common_power') {
          newCommonPowers.push(purchase.itemId);
        } else if (purchase.itemType === 'archetype_power') {
          newArchetypePowers.push(purchase.itemId);
        } else if (purchase.itemType === 'perk') {
          newPerks.push(purchase.itemId);
        }
      }

      // Update arkana stats with new items and reduced XP
      const updateData: Record<string, unknown> = {
        xp: { decrement: totalCost },
        cyberneticAugments: {
          push: newCybernetics
        },
        magicWeaves: {
          push: newMagicWeaves
        },
        magicSchools: {
          push: newMagicSchools
        },
        commonPowers: {
          push: newCommonPowers
        },
        archetypePowers: {
          push: newArchetypePowers
        },
        perks: {
          push: newPerks
        }
      };

      // Add slot increment if slots were purchased
      if (totalSlotsToPurchase > 0) {
        updateData.cyberneticsSlots = { increment: totalSlotsToPurchase };
      }

      const updatedArkanaStats = await tx.arkanaStats.update({
        where: { userId: user.id },
        data: updateData
      });

      // Log the purchase event
      await tx.event.create({
        data: {
          userId: user.id,
          type: 'XP_SHOP_PURCHASE',
          details: {
            purchases: purchases.map((p: { itemType: string; itemId: string; xpCost: number; quantity?: number }) => ({
              itemType: p.itemType,
              itemId: p.itemId,
              xpCost: p.xpCost,
              quantity: p.quantity
            })),
            totalCost,
            xpBefore: arkanaStats.xp,
            xpAfter: updatedArkanaStats.xp,
            addedCybernetics: newCybernetics,
            addedMagicWeaves: newMagicWeaves,
            addedMagicSchools: newMagicSchools,
            addedCommonPowers: newCommonPowers,
            addedArchetypePowers: newArchetypePowers,
            addedPerks: newPerks,
            addedSlots: totalSlotsToPurchase
          }
        }
      });

      return {
        updatedXp: updatedArkanaStats.xp,
        addedCybernetics: newCybernetics,
        addedMagicWeaves: newMagicWeaves,
        addedMagicSchools: newMagicSchools,
        addedCommonPowers: newCommonPowers,
        addedArchetypePowers: newArchetypePowers,
        addedPerks: newPerks,
        addedSlots: totalSlotsToPurchase,
        totalCost
      };
    });

    // Return success response
    return NextResponse.json({
      success: true,
      data: result
    });

  } catch (error: unknown) {
    console.error('Error processing shop purchase:', error);

    // Return user-friendly error messages
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: error instanceof Error && errorMessage.includes('Insufficient') ? 400 : 500 }
    );
  }
}
