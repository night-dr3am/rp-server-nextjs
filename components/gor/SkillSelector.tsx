// Skill Selector Component for Gorean Character Creation
import React, { useState, useMemo } from 'react';
import {
  SkillData,
  CharacterSkill,
  getSkillsByType,
  getSkillTypes,
  getSkillTypeDisplayName,
  calculateSkillCost,
  calculateTotalSkillPoints
} from '@/lib/gorData';
import {
  GoreanCard,
  GoreanHeading,
  GoreanBadge,
  GoreanButton,
  GoreanColors
} from './GoreanTheme';

interface SkillSelectorProps {
  skills: CharacterSkill[];
  allocatedPoints: number;
  onSkillsChange: (skills: CharacterSkill[]) => void;
  className?: string;
}

export function SkillSelector({
  skills,
  allocatedPoints,
  onSkillsChange,
  className = ''
}: SkillSelectorProps) {
  const [activeType, setActiveType] = useState<string>('combat');
  const [searchQuery, setSearchQuery] = useState('');

  const skillTypes = getSkillTypes();
  const spentPoints = calculateTotalSkillPoints(skills);
  const remainingPoints = allocatedPoints - spentPoints;

  // Get skills for active type
  const typeSkills = useMemo(() => {
    return getSkillsByType(activeType);
  }, [activeType]);

  // Filter skills by search query
  const filteredSkills = useMemo(() => {
    if (!searchQuery) return typeSkills;

    const query = searchQuery.toLowerCase();
    return typeSkills.filter(skill =>
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query)
    );
  }, [typeSkills, searchQuery]);

  // Get current level for a skill
  const getSkillLevel = (skillId: string): number => {
    const skill = skills.find(s => s.skill_id === skillId);
    return skill?.level || 0;
  };

  // Handle skill level change
  const handleSkillChange = (skillData: SkillData, newLevel: number) => {
    const currentLevel = getSkillLevel(skillData.id);

    // Calculate cost difference
    const currentCost = calculateSkillCost(currentLevel);
    const newCost = calculateSkillCost(newLevel);
    const costDifference = newCost - currentCost;

    // Check if we have enough points
    if (costDifference > remainingPoints) {
      return; // Not enough points
    }

    // Update skills array
    const newSkills = [...skills];
    const existingIndex = newSkills.findIndex(s => s.skill_id === skillData.id);

    if (newLevel === 0) {
      // Remove skill if level is 0
      if (existingIndex !== -1) {
        newSkills.splice(existingIndex, 1);
      }
    } else {
      // Add or update skill
      const skillEntry: CharacterSkill = {
        skill_id: skillData.id,
        skill_name: skillData.name,
        level: newLevel
      };

      if (existingIndex !== -1) {
        newSkills[existingIndex] = skillEntry;
      } else {
        newSkills.push(skillEntry);
      }
    }

    onSkillsChange(newSkills);
  };

  // Get skill type badge color
  const getSkillTypeBadgeColor = (type: string): string => {
    const colorMap: Record<string, string> = {
      combat: GoreanColors.casteScarlet,
      survival: GoreanColors.forestGreen,
      mental: GoreanColors.casteBlue,
      social: GoreanColors.gold,
      special: GoreanColors.bronze
    };
    return colorMap[type] || GoreanColors.stone;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <GoreanHeading level={2}>Select Your Skills</GoreanHeading>
        <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
          You have {allocatedPoints} skill points to spend. Higher levels cost more points (triangular).
        </p>
      </div>

      {/* Points Pool Display */}
      <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: GoreanColors.parchment }}>
        <div>
          <p className="text-lg font-bold" style={{ color: GoreanColors.charcoal }}>
            Skill Points Remaining
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

      {/* Triangular Cost Reference */}
      <div className="p-4 rounded-lg" style={{ backgroundColor: GoreanColors.parchmentDark }}>
        <p className="font-semibold mb-2" style={{ color: GoreanColors.charcoal }}>
          Skill Level Costs (Triangular)
        </p>
        <div className="grid grid-cols-5 gap-2 text-center text-sm">
          {[
            { level: 1, cost: 1 },
            { level: 2, cost: 3 },
            { level: 3, cost: 6 },
            { level: 4, cost: 10 },
            { level: 5, cost: 15 }
          ].map(item => (
            <div key={item.level} className="p-2 rounded" style={{ backgroundColor: GoreanColors.cream }}>
              <div className="font-bold" style={{ color: GoreanColors.charcoal }}>
                Level {item.level}
              </div>
              <div className="font-semibold" style={{ color: GoreanColors.bronze }}>
                {item.cost} pts
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Search Box */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none focus:ring-2"
          style={{
            borderColor: GoreanColors.stone,
            backgroundColor: GoreanColors.cream,
            color: GoreanColors.charcoal
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2"
            style={{ color: GoreanColors.stone }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Skill Type Tabs */}
      <div className="flex flex-wrap gap-2">
        {skillTypes.map(type => {
          const typeSkillsCount = getSkillsByType(type).length;
          const isActive = type === activeType;

          return (
            <button
              key={type}
              onClick={() => {
                setActiveType(type);
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                isActive ? 'shadow-lg' : 'shadow-md hover:shadow-lg'
              }`}
              style={{
                backgroundColor: isActive ? getSkillTypeBadgeColor(type) : GoreanColors.stone,
                color: 'white',
                transform: isActive ? 'scale(1.05)' : 'scale(1)'
              }}
            >
              {getSkillTypeDisplayName(type)}
              <span className="ml-2 text-xs opacity-75">({typeSkillsCount})</span>
            </button>
          );
        })}
      </div>

      {/* Skills Grid */}
      {filteredSkills.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg" style={{ color: GoreanColors.stone }}>
            No skills found matching &quot;{searchQuery}&quot;
          </p>
          <GoreanButton onClick={() => setSearchQuery('')} className="mt-4">
            Clear Search
          </GoreanButton>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSkills.map(skill => {
            const currentLevel = getSkillLevel(skill.id);
            const currentCost = calculateSkillCost(currentLevel);

            return (
              <GoreanCard
                key={skill.id}
                className="p-4"
                selected={currentLevel > 0}
              >
                {/* Skill Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <GoreanHeading level={5}>{skill.name}</GoreanHeading>
                      {currentLevel > 0 && (
                        <GoreanBadge size="sm" color={GoreanColors.bronze}>
                          Level {currentLevel}
                        </GoreanBadge>
                      )}
                    </div>
                    <p className="text-sm mb-2" style={{ color: GoreanColors.charcoal }}>
                      {skill.description}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <GoreanBadge size="sm" color={getSkillTypeBadgeColor(skill.type)}>
                        {getSkillTypeDisplayName(skill.type)}
                      </GoreanBadge>
                      <GoreanBadge size="sm" color={GoreanColors.stoneLight}>
                        Base: {skill.baseStat.toUpperCase()}
                      </GoreanBadge>
                    </div>
                  </div>
                  {currentLevel > 0 && (
                    <div className="ml-4 text-right">
                      <p className="text-2xl font-bold" style={{ color: GoreanColors.bronze }}>
                        {currentCost}
                      </p>
                      <p className="text-xs" style={{ color: GoreanColors.stone }}>
                        points
                      </p>
                    </div>
                  )}
                </div>

                {/* Level Selector */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold" style={{ color: GoreanColors.charcoal }}>
                    Select Level:
                  </p>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 4, 5].map(level => {
                      const cost = calculateSkillCost(level);
                      const costDifference = cost - currentCost;
                      const canAfford = level === 0 || costDifference <= remainingPoints;
                      const isSelected = level === currentLevel;

                      return (
                        <button
                          key={level}
                          onClick={() => canAfford && handleSkillChange(skill, level)}
                          disabled={!canAfford}
                          className={`flex-1 py-2 px-3 rounded-lg font-semibold transition-all ${
                            !canAfford && level !== currentLevel ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'
                          }`}
                          style={{
                            backgroundColor: isSelected ? GoreanColors.bronze : canAfford ? GoreanColors.parchment : GoreanColors.stoneLight,
                            color: isSelected ? 'white' : GoreanColors.charcoal,
                            border: `2px solid ${isSelected ? GoreanColors.bronzeDark : GoreanColors.stone}`
                          }}
                        >
                          <div className="text-lg">{level}</div>
                          {level > 0 && (
                            <div className="text-xs" style={{ color: isSelected ? 'white' : GoreanColors.stone }}>
                              {cost}pt
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Restrictions */}
                {skill.restrictedTo && skill.restrictedTo.length > 0 && (
                  <div className="mt-3 p-2 rounded" style={{ backgroundColor: '#FFF3CD' }}>
                    <p className="text-xs font-semibold" style={{ color: '#856404' }}>
                      ⚠️ Restricted to: {skill.restrictedTo.join(', ')}
                    </p>
                  </div>
                )}
              </GoreanCard>
            );
          })}
        </div>
      )}

      {/* Selected Skills Summary */}
      {skills.length > 0 && (
        <div className="p-4 rounded-lg" style={{ backgroundColor: GoreanColors.parchment }}>
          <p className="font-semibold mb-3" style={{ color: GoreanColors.charcoal }}>
            Selected Skills ({skills.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {skills.map(skill => (
              <div
                key={skill.skill_id}
                className="px-3 py-1 rounded-lg"
                style={{ backgroundColor: GoreanColors.bronze, color: 'white' }}
              >
                <span className="font-semibold">{skill.skill_name}</span>
                <span className="ml-2 opacity-75">Lv{skill.level}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="text-center text-sm" style={{ color: GoreanColors.stone }}>
        <p>Skills are optional. You can save points for later or spend them all now.</p>
        <p className="text-xs mt-1">Tip: Balance your skills across types for versatility, or specialize for focused builds.</p>
      </div>
    </div>
  );
}
