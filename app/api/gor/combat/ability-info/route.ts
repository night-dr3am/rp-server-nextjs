// GET/POST /api/gor/combat/ability-info - Get detailed ability information
// Returns ability details optimized for LSL dialog display

import { NextRequest, NextResponse } from 'next/server';
import { validateSignature } from '@/lib/signature';
import { gorAbilityInfoSchema } from '@/lib/validation';
import { encodeForLSL } from '@/lib/stringUtils';
import { loadAbilities, getEffectsByIds } from '@/lib/gor/unifiedDataLoader';
import type { AbilityData, EffectData } from '@/lib/gor/types';

/**
 * Build a human-readable effect summary for display
 */
function buildEffectSummary(effects: EffectData[]): string {
  const summaries: string[] = [];

  for (const effect of effects) {
    let summary = '';

    switch (effect.category) {
      case 'check':
        if (effect.checkVs === 'tn') {
          summary = `Check vs TN ${effect.targetNumber}`;
        } else if (effect.checkVsStat) {
          summary = `${effect.checkStat || 'Stat'} vs ${effect.checkVsStat}`;
        }
        break;

      case 'damage':
        summary = `Damage: ${effect.damageFormula}`;
        if (effect.damageType === 'mental') {
          summary += ' (mental)';
        }
        break;

      case 'heal':
        if (effect.healFormula?.includes('maxHP')) {
          summary = `Heal: ${effect.healFormula.replace('maxHP * ', '').replace('0.', '')}0% HP`;
        } else {
          summary = `Heal: ${effect.healFormula}`;
        }
        break;

      case 'stat_modifier':
        const sign = (effect.modifier || 0) >= 0 ? '+' : '';
        if (effect.stat === 'all') {
          summary = `All stats ${sign}${effect.modifier}`;
        } else {
          summary = `${effect.stat} ${sign}${effect.modifier}`;
        }
        if (effect.duration?.startsWith('turns:')) {
          summary += ` (${effect.duration.split(':')[1]}t)`;
        }
        break;

      case 'control':
        summary = `${effect.controlType?.charAt(0).toUpperCase()}${effect.controlType?.slice(1)}`;
        if (effect.duration?.startsWith('turns:')) {
          summary += ` ${effect.duration.split(':')[1]}t`;
        }
        break;
    }

    if (summary) {
      summaries.push(summary);
    }
  }

  return summaries.join(', ');
}

/**
 * Build confirmation message for LSL dialog
 */
function buildConfirmMessage(ability: AbilityData, effectSummary: string): string {
  let msg = `${ability.name}\n`;
  msg += `${ability.desc}\n\n`;

  if (ability.range !== undefined && ability.range > 0) {
    msg += `Range: ${ability.range}m\n`;
  }

  if (ability.targetType) {
    msg += `Target: ${ability.targetType}\n`;
  }

  if (ability.cooldown) {
    const minutes = Math.floor(ability.cooldown / 60);
    msg += `Cooldown: ${minutes}min\n`;
  }

  if (effectSummary) {
    msg += `\nEffects: ${effectSummary}`;
  }

  return msg;
}

async function handleRequest(body: Record<string, unknown>) {
  // Validate request
  const { error, value } = gorAbilityInfoSchema.validate(body);
  if (error) {
    return NextResponse.json(
      { success: false, error: error.details[0].message },
      { status: 400 }
    );
  }

  const { ability_id, ability_name, use_mode, universe, timestamp, signature } = value;

  // Validate signature
  const signatureValidation = validateSignature(timestamp, signature, universe);
  if (!signatureValidation.valid) {
    return NextResponse.json(
      { success: false, error: signatureValidation.error },
      { status: 401 }
    );
  }

  // Load all abilities
  const allAbilities = await loadAbilities();

  // Find ability by ID or name
  let ability: AbilityData | undefined;

  if (ability_id) {
    ability = allAbilities.find((a: AbilityData) => a.id === ability_id);
  } else if (ability_name) {
    ability = allAbilities.find((a: AbilityData) =>
      a.name.toLowerCase() === ability_name.toLowerCase()
    );
  }

  if (!ability) {
    return NextResponse.json(
      { success: false, error: 'Ability not found' },
      { status: 404 }
    );
  }

  // Get effect IDs based on use_mode
  let effectIds: string[] = [];

  if (use_mode === 'attack' && ability.effects.attack) {
    effectIds = ability.effects.attack;
  } else if (use_mode === 'ability' && ability.effects.ability) {
    effectIds = ability.effects.ability;
  } else {
    // 'all' mode - combine both
    effectIds = [
      ...(ability.effects.attack || []),
      ...(ability.effects.ability || [])
    ];
    // Remove duplicates
    effectIds = [...new Set(effectIds)];
  }

  // Load effect definitions
  const effects = await getEffectsByIds(effectIds);

  // Build effect summary
  const effectSummary = buildEffectSummary(effects);

  // Build confirm message for dialog
  const confirmMessage = buildConfirmMessage(ability, effectSummary);

  // Determine base stat from first check effect
  let baseStat = '';
  const checkEffect = effects.find(e => e.category === 'check');
  if (checkEffect?.checkStat) {
    baseStat = checkEffect.checkStat;
  }

  return NextResponse.json({
    success: true,
    data: {
      id: ability.id,
      name: encodeForLSL(ability.name),
      description: encodeForLSL(ability.desc),
      targetType: ability.targetType || 'self',
      baseStat,
      range: ability.range || 0,
      cooldown: ability.cooldown || 0,
      effects: ability.effects,
      abilityType: ability.abilityType,
      requirements: ability.requirements,
      detailedMessage: encodeForLSL(effectSummary),
      confirmMessage: encodeForLSL(confirmMessage)
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const body: Record<string, unknown> = {};

    // Extract query parameters
    for (const [key, value] of searchParams.entries()) {
      body[key] = value;
    }

    return handleRequest(body);
  } catch (error) {
    console.error('[AbilityInfo] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return handleRequest(body);
  } catch (error) {
    console.error('[AbilityInfo] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
