// Ability Selector Component for Gorean Character Creation
import React, { useState, useMemo } from 'react';
import {
  AbilityData,
  CharacterAbility,
  CharacterSkill,
  SpeciesData,
  getAbilitiesByCategory,
  getAbilityCategories,
  getAbilityCategoryDisplayName,
  calculateAbilityCost,
  calculateTotalAbilityPoints,
  isAbilityAvailable
} from '@/lib/gorData';
import { GoreanCharacterModel } from '@/lib/gor/types';
import {
  GoreanCard,
  GoreanHeading,
  GoreanBadge,
  GoreanColors
} from './GoreanTheme';

interface AbilitySelectorProps {
  abilities: CharacterAbility[];
  allocatedPoints: number;
  character: {
    species?: SpeciesData;
    caste?: string;
    status?: string;
    skills?: CharacterSkill[];
    stats?: GoreanCharacterModel['stats'];
  };
  onAbilitiesChange: (abilities: CharacterAbility[]) => void;
  className?: string;
}

export function AbilitySelector({
  abilities,
  allocatedPoints,
  character,
  onAbilitiesChange,
  className = ''
}: AbilitySelectorProps) {
  const [activeCategory, setActiveCategory] = useState<string>('combat');

  const abilityCategories = getAbilityCategories();
  const spentPoints = calculateTotalAbilityPoints(abilities);
  const remainingPoints = allocatedPoints - spentPoints;

  // Get abilities for active category
  const categoryAbilities = useMemo(() => {
    return getAbilitiesByCategory(activeCategory);
  }, [activeCategory]);

  // Check if ability is selected
  const isAbilitySelected = (abilityId: string): boolean => {
    return abilities.some(a => a.ability_id === abilityId);
  };

  // Handle ability toggle
  const handleAbilityToggle = (abilityData: AbilityData) => {
    const isSelected = isAbilitySelected(abilityData.id);
    const cost = calculateAbilityCost(abilityData.id);

    if (isSelected) {
      // Remove ability
      const newAbilities = abilities.filter(a => a.ability_id !== abilityData.id);
      onAbilitiesChange(newAbilities);
    } else {
      // Check if we have enough points
      if (cost > remainingPoints) {
        return; // Not enough points
      }

      // Add ability
      const newAbility: CharacterAbility = {
        ability_id: abilityData.id,
        ability_name: abilityData.name,
        uses: 0
      };

      onAbilitiesChange([...abilities, newAbility]);
    }
  };

  // Get ability category badge color
  const getAbilityCategoryBadgeColor = (category: string): string => {
    const colorMap: Record<string, string> = {
      combat: GoreanColors.bloodRed,
      social: GoreanColors.gold,
      survival: GoreanColors.forestGreen,
      mental: GoreanColors.casteBlue,
      special: GoreanColors.castePurple
    };
    return colorMap[category] || GoreanColors.stone;
  };

  // Get target type badge color
  const getTargetTypeBadgeColor = (targetType?: string): string => {
    const colorMap: Record<string, string> = {
      self: GoreanColors.casteBlue,
      single: GoreanColors.casteScarlet,
      area: GoreanColors.castePurple
    };
    return targetType ? (colorMap[targetType] || GoreanColors.stone) : GoreanColors.stone;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <GoreanHeading level={2}>Select Your Abilities</GoreanHeading>
        <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
          You have {allocatedPoints} ability points to spend. Each ability has a fixed cost (2-4 points).
        </p>
      </div>

      {/* Points Pool Display */}
      <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: GoreanColors.parchment }}>
        <div>
          <p className="text-lg font-bold" style={{ color: GoreanColors.charcoal }}>
            Ability Points Remaining
          </p>
          <p className="text-sm" style={{ color: GoreanColors.stone }}>
            {spentPoints} of {allocatedPoints} spent
          </p>
        </div>
        <div
          className="text-4xl font-bold px-6 py-3 rounded-lg"
          style={{
            backgroundColor: remainingPoints === 0 ? GoreanColors.forestGreen : GoreanColors.bronze,
            color: 'white'
          }}
        >
          {remainingPoints}
        </div>
      </div>

      {/* Ability Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {abilityCategories.map(category => {
          const categoryAbilitiesCount = getAbilitiesByCategory(category).length;
          const isActive = category === activeCategory;

          return (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                isActive ? 'shadow-lg' : 'shadow-md hover:shadow-lg'
              }`}
              style={{
                backgroundColor: isActive ? getAbilityCategoryBadgeColor(category) : GoreanColors.stone,
                color: 'white',
                transform: isActive ? 'scale(1.05)' : 'scale(1)'
              }}
            >
              {getAbilityCategoryDisplayName(category)}
              <span className="ml-2 text-xs opacity-75">({categoryAbilitiesCount})</span>
            </button>
          );
        })}
      </div>

      {/* Abilities Grid */}
      <div className="space-y-4">
        {categoryAbilities.map(ability => {
          const isSelected = isAbilitySelected(ability.id);
          const cost = calculateAbilityCost(ability.id);
          const availabilityCheck = isAbilityAvailable(ability, character);
          const canSelect = availabilityCheck.available && (isSelected || cost <= remainingPoints);
          const isDisabled = !canSelect && !isSelected;

          return (
            <GoreanCard
              key={ability.id}
              className={`p-4 ${isDisabled ? 'opacity-50' : ''}`}
              selected={isSelected}
            >
              {/* Ability Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <GoreanHeading level={5}>{ability.name}</GoreanHeading>
                    {isSelected && (
                      <GoreanBadge size="sm" color={GoreanColors.forestGreen}>
                        ✓ Selected
                      </GoreanBadge>
                    )}
                    {!availabilityCheck.available && (
                      <GoreanBadge size="sm" color={GoreanColors.bloodRed}>
                        🔒 {availabilityCheck.reason}
                      </GoreanBadge>
                    )}
                    {ability.cooldown && (
                      <GoreanBadge size="sm" color={GoreanColors.stoneLight}>
                        ⏱ {ability.cooldown / 60}min cooldown
                      </GoreanBadge>
                    )}
                  </div>
                  <p className="text-sm mb-2" style={{ color: GoreanColors.charcoal }}>
                    {ability.desc}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <GoreanBadge size="sm" color={getAbilityCategoryBadgeColor(ability.category)}>
                      {getAbilityCategoryDisplayName(ability.category)}
                    </GoreanBadge>
                    {ability.targetType && (
                      <GoreanBadge size="sm" color={getTargetTypeBadgeColor(ability.targetType)}>
                        {ability.targetType === 'self' ? 'Self' : ability.targetType === 'single' ? 'Single Target' : 'Area'}
                      </GoreanBadge>
                    )}
                    {ability.range !== undefined && (
                      <GoreanBadge size="sm" color={GoreanColors.stoneLight}>
                        {ability.range === 0 ? 'Melee' : `${ability.range}m`}
                      </GoreanBadge>
                    )}
                  </div>
                  {ability.notes && (
                    <p className="text-xs mt-2 italic" style={{ color: GoreanColors.stone }}>
                      {ability.notes}
                    </p>
                  )}
                  {ability.bookReferences && ability.bookReferences.length > 0 && (
                    <p className="text-xs mt-1 italic" style={{ color: GoreanColors.bronze }}>
                      📖 {ability.bookReferences.join(' • ')}
                    </p>
                  )}
                </div>
                <div className="ml-4 text-right">
                  <p className="text-3xl font-bold" style={{ color: GoreanColors.bronze }}>
                    {cost}
                  </p>
                  <p className="text-xs" style={{ color: GoreanColors.stone }}>
                    points
                  </p>
                </div>
              </div>

              {/* Requirements Display */}
              {ability.requirements && (
                <div className="mb-3 p-2 rounded" style={{ backgroundColor: GoreanColors.parchmentDark }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.charcoal }}>
                    Requirements:
                  </p>
                  <div className="flex flex-wrap gap-1 text-xs">
                    {ability.requirements.species && (
                      <span style={{ color: GoreanColors.stone }}>
                        Species: {ability.requirements.species.join(', ')}
                      </span>
                    )}
                    {ability.requirements.minStat && (
                      <span style={{ color: GoreanColors.stone }}>
                        • {ability.requirements.minStat.stat} {ability.requirements.minStat.value}+
                      </span>
                    )}
                    {ability.requirements.caste && (
                      <span style={{ color: GoreanColors.stone }}>
                        • Caste: {ability.requirements.caste.join(', ')}
                      </span>
                    )}
                    {ability.requirements.status && (
                      <span style={{ color: GoreanColors.stone }}>
                        • Status: {ability.requirements.status.join(', ')}
                      </span>
                    )}
                    {ability.requirements.skill && (
                      <span style={{ color: GoreanColors.stone }}>
                        • Skill: {ability.requirements.skill.id} Lv{ability.requirements.skill.level}+
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Toggle Button */}
              <button
                onClick={() => !isDisabled && handleAbilityToggle(ability)}
                disabled={isDisabled}
                className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
                  isDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:shadow-md'
                }`}
                style={{
                  backgroundColor: isSelected ? GoreanColors.bloodRed : canSelect ? GoreanColors.bronze : GoreanColors.stoneLight,
                  color: 'white',
                  border: `2px solid ${isSelected ? GoreanColors.bloodRedDark : !availabilityCheck.available ? GoreanColors.bloodRed : GoreanColors.bronzeDark}`
                }}
                title={!availabilityCheck.available ? availabilityCheck.reason : undefined}
              >
                {isSelected ? '✓ Selected - Click to Remove' : isDisabled ? '✗ Cannot Select' : '+ Select This Ability'}
              </button>
            </GoreanCard>
          );
        })}
      </div>

      {/* Selected Abilities Summary */}
      {abilities.length > 0 && (
        <div className="p-4 rounded-lg" style={{ backgroundColor: GoreanColors.parchment }}>
          <p className="font-semibold mb-3" style={{ color: GoreanColors.charcoal }}>
            Selected Abilities ({abilities.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {abilities.map(ability => (
              <div
                key={ability.ability_id}
                className="px-3 py-1 rounded-lg"
                style={{ backgroundColor: GoreanColors.bloodRed, color: 'white' }}
              >
                <span className="font-semibold">{ability.ability_name}</span>
                <span className="ml-2 opacity-75">({calculateAbilityCost(ability.ability_id)}pts)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="text-center text-sm" style={{ color: GoreanColors.stone }}>
        <p>Abilities are optional but provide powerful combat and roleplaying options.</p>
        <p className="text-xs mt-1">
          Tip: Check requirements carefully - some abilities require specific stats, skills, castes, or statuses.
        </p>
      </div>
    </div>
  );
}
