// Stat Allocator Component for Gorean Character Creation
import React from 'react';
import {
  GoreanCharacterModel,
  calculateGoreanStatModifier,
  calculateHealthMax,
  DEFAULT_STAT_POINTS,
  MIN_STAT_VALUE,
  MAX_STAT_VALUE
} from '@/lib/gorData';
import {
  GoreanHeading,
  GoreanButton,
  GoreanColors
} from './GoreanTheme';

interface StatAllocatorProps {
  stats: GoreanCharacterModel['stats'];
  onStatChange: (stat: keyof GoreanCharacterModel['stats'], delta: number) => void;
  className?: string;
}

export function StatAllocator({ stats, onStatChange, className = '' }: StatAllocatorProps) {
  const { strength, agility, intellect, perception, charisma, pool } = stats;

  const statsList = [
    {
      key: 'strength' as const,
      name: 'Strength',
      value: strength,
      description: 'Physical power and melee damage. Determines maximum health.',
      icon: '💪'
    },
    {
      key: 'agility' as const,
      name: 'Agility',
      value: agility,
      description: 'Speed, reflexes, and dodge ability. Affects initiative and evasion.',
      icon: '🏃'
    },
    {
      key: 'intellect' as const,
      name: 'Intellect',
      value: intellect,
      description: 'Intelligence and magical aptitude. Affects learning and knowledge.',
      icon: '🧠'
    },
    {
      key: 'perception' as const,
      name: 'Perception',
      value: perception,
      description: 'Awareness and ranged accuracy. Affects detection and aim.',
      icon: '👁️'
    },
    {
      key: 'charisma' as const,
      name: 'Charisma',
      value: charisma,
      description: 'Social influence and leadership. Affects persuasion and morale.',
      icon: '💬'
    }
  ];

  const healthMax = calculateHealthMax(strength);
  const pointsSpent = DEFAULT_STAT_POINTS - pool;

  const getModifierDisplay = (value: number): string => {
    const modifier = calculateGoreanStatModifier(value);
    return modifier >= 0 ? `+${modifier}` : `${modifier}`;
  };

  const getModifierColor = (value: number): string => {
    const modifier = calculateGoreanStatModifier(value);
    if (modifier <= -2) return GoreanColors.bloodRed;
    if (modifier === 0) return GoreanColors.stone;
    if (modifier <= 2) return GoreanColors.bronze;
    if (modifier <= 4) return GoreanColors.gold;
    return GoreanColors.forestGreen;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <GoreanHeading level={2}>Allocate Your Stats</GoreanHeading>
        <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
          You have {DEFAULT_STAT_POINTS} points to distribute across your 5 core stats (1-5 range).
        </p>
      </div>

      {/* Points Pool Display */}
      <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: GoreanColors.parchment }}>
        <div>
          <p className="text-lg font-bold" style={{ color: GoreanColors.charcoal }}>
            Points Remaining
          </p>
          <p className="text-sm" style={{ color: GoreanColors.stone }}>
            {pointsSpent} of {DEFAULT_STAT_POINTS} allocated
          </p>
        </div>
        <div
          className="text-4xl font-bold px-6 py-3 rounded-lg"
          style={{
            backgroundColor: pool === 0 ? GoreanColors.forestGreen : GoreanColors.bronze,
            color: 'white'
          }}
        >
          {pool}
        </div>
      </div>

      {/* Health Preview */}
      <div className="p-4 rounded-lg" style={{ backgroundColor: GoreanColors.parchmentDark }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: GoreanColors.charcoal }}>
              Maximum Health Points
            </p>
            <p className="text-xs" style={{ color: GoreanColors.stone }}>
              Strength × 5
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">❤️</span>
            <span className="text-3xl font-bold" style={{ color: GoreanColors.bloodRed }}>
              {healthMax}
            </span>
          </div>
        </div>
      </div>

      {/* Stat Sliders */}
      <div className="space-y-4">
        {statsList.map(stat => {
          const canDecrease = stat.value > MIN_STAT_VALUE;
          const canIncrease = stat.value < MAX_STAT_VALUE && pool > 0;
          const modifierColor = getModifierColor(stat.value);

          return (
            <div
              key={stat.key}
              className="p-4 rounded-lg border-2"
              style={{
                backgroundColor: GoreanColors.cream,
                borderColor: GoreanColors.stone
              }}
            >
              {/* Stat Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{stat.icon}</span>
                  <div>
                    <p className="font-bold text-lg" style={{ color: GoreanColors.charcoal }}>
                      {stat.name}
                    </p>
                    <p className="text-xs" style={{ color: GoreanColors.stone }}>
                      {stat.description}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold" style={{ color: GoreanColors.charcoal }}>
                    {stat.value}
                  </p>
                  <p className="text-sm font-semibold" style={{ color: modifierColor }}>
                    {getModifierDisplay(stat.value)}
                  </p>
                </div>
              </div>

              {/* Visual Slider */}
              <div className="mb-3">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(level => {
                    const isActive = level <= stat.value;
                    const levelModifier = calculateGoreanStatModifier(level);

                    return (
                      <div
                        key={level}
                        className="flex-1 h-8 rounded flex items-center justify-center font-semibold text-sm transition-all"
                        style={{
                          backgroundColor: isActive ? GoreanColors.bronze : GoreanColors.parchmentDark,
                          color: isActive ? 'white' : GoreanColors.stone,
                          border: `2px solid ${isActive ? GoreanColors.bronzeDark : GoreanColors.stoneLight}`
                        }}
                      >
                        {levelModifier >= 0 ? `+${levelModifier}` : levelModifier}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map(level => (
                    <div key={level} className="flex-1 text-center text-xs" style={{ color: GoreanColors.stone }}>
                      {level}
                    </div>
                  ))}
                </div>
              </div>

              {/* Increment/Decrement Buttons */}
              <div className="flex gap-2">
                <GoreanButton
                  onClick={() => onStatChange(stat.key, -1)}
                  disabled={!canDecrease}
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                >
                  ← Decrease
                </GoreanButton>
                <GoreanButton
                  onClick={() => onStatChange(stat.key, 1)}
                  disabled={!canIncrease}
                  variant="primary"
                  size="sm"
                  className="flex-1"
                >
                  Increase →
                </GoreanButton>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modifier Reference Table */}
      <div className="p-4 rounded-lg" style={{ backgroundColor: GoreanColors.parchment }}>
        <p className="font-semibold mb-2" style={{ color: GoreanColors.charcoal }}>
          Stat Modifier Reference
        </p>
        <div className="grid grid-cols-5 gap-2 text-center text-sm">
          {[
            { value: 1, mod: -2, color: GoreanColors.bloodRed },
            { value: 2, mod: 0, color: GoreanColors.stone },
            { value: 3, mod: 2, color: GoreanColors.bronze },
            { value: 4, mod: 4, color: GoreanColors.gold },
            { value: 5, mod: 6, color: GoreanColors.forestGreen }
          ].map(item => (
            <div key={item.value}>
              <div className="font-bold" style={{ color: GoreanColors.charcoal }}>
                {item.value}
              </div>
              <div className="font-semibold" style={{ color: item.color }}>
                {item.mod >= 0 ? `+${item.mod}` : item.mod}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Validation Message */}
      {pool > 0 && (
        <div className="text-center p-3 rounded-lg" style={{ backgroundColor: '#FFF3CD', color: '#856404' }}>
          <p className="font-semibold">⚠️ You still have {pool} unallocated point{pool !== 1 ? 's' : ''}</p>
          <p className="text-sm">Use all points before proceeding to the next step.</p>
        </div>
      )}

      {pool === 0 && (
        <div className="text-center p-3 rounded-lg" style={{ backgroundColor: '#D4EDDA', color: '#155724' }}>
          <p className="font-semibold">✓ All stat points allocated!</p>
          <p className="text-sm">You can continue to the next step.</p>
        </div>
      )}
    </div>
  );
}
