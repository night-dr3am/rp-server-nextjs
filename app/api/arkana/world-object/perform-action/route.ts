import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { worldObjectPerformActionSchema } from '@/lib/validation';
import { validateSignature } from '@/lib/signature';
import { loadAllData, getWorldObjectCheck, getSkillById } from '@/lib/arkana/dataLoader';
import { encodeForLSL } from '@/lib/stringUtils';
import { executeEffect, parseActiveEffects, processEffectsTurn, recalculateLiveStats, buildArkanaStatsUpdate } from '@/lib/arkana/effectsUtils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const { error, value } = worldObjectPerformActionSchema.validate(body);
    if (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.details },
        { status: 400 }
      );
    }

    const { playerUuid, objectId, actionId, universe, timestamp, signature } = value;

    // Validate signature
    const signatureValidation = validateSignature(timestamp, signature, universe);
    if (!signatureValidation.valid) {
      return NextResponse.json(
        { success: false, error: signatureValidation.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Load data for checks
    await loadAllData();

    // Get player with stats
    const player = await prisma.user.findFirst({
      where: { slUuid: playerUuid, universe: 'arkana' },
      include: { arkanaStats: true, stats: true }
    });

    // Validate player exists and registration complete
    if (!player?.arkanaStats?.registrationCompleted) {
      return NextResponse.json(
        { success: false, error: 'Player not found or registration incomplete' },
        { status: 404 }
      );
    }

    // Check if player is in RP mode (status === 0)
    if (!player.stats || player.stats.status !== 0) {
      return NextResponse.json(
        { success: false, error: 'Player is not in RP mode' },
        { status: 400 }
      );
    }

    // Get WorldObject
    const worldObject = await prisma.worldObject.findUnique({
      where: {
        objectId_universe: {
          objectId,
          universe
        }
      }
    });

    if (!worldObject) {
      return NextResponse.json(
        { success: false, error: 'World object not found' },
        { status: 404 }
      );
    }

    // Find action in object's actions array
    type WorldObjectAction = {
      action: string;
      showStates: string;
      skills?: string;
      checks?: string;
      successState: string;
    };
    const actions = worldObject.actions as WorldObjectAction[];
    const action = actions.find((a: WorldObjectAction) => a.action === actionId);

    if (!action) {
      return NextResponse.json(
        { success: false, error: `Action "${actionId}" not found for this object` },
        { status: 404 }
      );
    }

    // Parse player's skills
    type PlayerSkill = {
      skill_id: string;
      skill_name: string;
      level: number;
    };
    const playerSkills = (player.arkanaStats.skills as PlayerSkill[]) || [];

    // Validate skill requirements if defined
    if (action.skills) {
      const skillRequirements = action.skills.split(' OR ').map((s: string) => s.trim());
      let hasRequiredSkill = false;
      const missingSkills: string[] = [];

      for (const requirement of skillRequirements) {
        const [skillId, requiredLevelStr] = requirement.split(',').map((s: string) => s.trim());
        const requiredLevel = parseInt(requiredLevelStr) || 1;

        const playerSkill = playerSkills.find((ps: PlayerSkill) => ps.skill_id === skillId);

        if (playerSkill && playerSkill.level >= requiredLevel) {
          hasRequiredSkill = true;
          break;
        } else {
          // Use user-friendly skill name instead of technical ID
          const skillDef = getSkillById(skillId);
          const skillName = skillDef ? skillDef.name : skillId;
          missingSkills.push(`${skillName} (level ${requiredLevel})`);
        }
      }

      if (!hasRequiredSkill) {
        const playerName = player.arkanaStats.characterName || player.username;
        const skillsList = missingSkills.join(' OR ');

        const message = encodeForLSL(
          `${playerName} cannot ${actionId.toLowerCase()} the ${worldObject.name}. ` +
          `Missing required skills: ${skillsList}.`
        );

        return NextResponse.json({
          success: true,
          data: {
            actionSuccess: 'false',
            actionName: actionId,
            objectName: worldObject.name,
            objectState: worldObject.state,
            message,
            skillsMissing: missingSkills
          }
        });
      }
    }

    // Execute checks if defined
    let checkSuccess = true;
    let rollInfo = '';

    if (action.checks) {
      const checkDef = getWorldObjectCheck(action.checks);

      if (!checkDef) {
        return NextResponse.json(
          { success: false, error: `Check definition "${action.checks}" not found` },
          { status: 500 }
        );
      }

      // Handle ownership check
      if (checkDef.category === 'ownership' && checkDef.requiresOwnership) {
        if (worldObject.owner !== playerUuid) {
          const playerName = player.arkanaStats.characterName || player.username;
          const message = encodeForLSL(
            `${playerName} cannot ${actionId.toLowerCase()} the ${worldObject.name}. ` +
            `Only the owner can perform this action.`
          );

          return NextResponse.json({
            success: true,
            data: {
              actionSuccess: 'false',
              actionName: actionId,
              objectName: worldObject.name,
              objectState: worldObject.state,
              message
            }
          });
        }
      }

      // Handle stat checks
      if (checkDef.category === 'check') {
        // Parse active effects and calculate live stats
        const activeEffects = parseActiveEffects(player.arkanaStats.activeEffects);
        const liveStats = recalculateLiveStats(player.arkanaStats, activeEffects);

        // Execute check with liveStats
        const checkResult = executeEffect(
          checkDef.id,
          player.arkanaStats,
          player.arkanaStats, // Self check
          undefined,
          liveStats,
          liveStats
        );

        if (checkResult) {
          checkSuccess = checkResult.success;
          rollInfo = checkResult.rollInfo || '';
        } else {
          checkSuccess = false;
        }
      }
    }

    // Process player's turn (decrement active effects) - happens regardless of success
    const activeEffects = parseActiveEffects(player.arkanaStats.activeEffects);
    const turnProcessed = processEffectsTurn(activeEffects, player.arkanaStats);

    await prisma.arkanaStats.update({
      where: { id: player.arkanaStats.id },
      data: buildArkanaStatsUpdate({
        activeEffects: turnProcessed.activeEffects,
        liveStats: turnProcessed.liveStats
      })
    });

    // Build result message
    const playerName = player.arkanaStats.characterName || player.username;
    let message: string;
    let newState = worldObject.state;

    if (checkSuccess) {
      // Update object state on success
      newState = action.successState;

      await prisma.worldObject.update({
        where: { id: worldObject.id },
        data: { state: newState }
      });

      if (rollInfo) {
        message = encodeForLSL(
          `${playerName} successfully performs ${actionId} on the ${worldObject.name}! ` +
          `${rollInfo}. The ${worldObject.name} is now ${newState}.`
        );
      } else {
        message = encodeForLSL(
          `${playerName} successfully performs ${actionId} on the ${worldObject.name}. ` +
          `The ${worldObject.name} is now ${newState}.`
        );
      }
    } else {
      if (rollInfo) {
        message = encodeForLSL(
          `${playerName} attempts to ${actionId.toLowerCase()} the ${worldObject.name} - FAILED! ${rollInfo}.`
        );
      } else {
        message = encodeForLSL(
          `${playerName} attempts to ${actionId.toLowerCase()} the ${worldObject.name} - FAILED!`
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        actionSuccess: checkSuccess ? 'true' : 'false',
        actionName: actionId,
        objectName: worldObject.name,
        objectState: newState,
        ...(rollInfo && { rollInfo }), // Only include rollInfo if it's not empty
        message
      }
    });

  } catch (error) {
    console.error('World object perform action error:', error);

    let errorMessage = 'Action execution failed';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
