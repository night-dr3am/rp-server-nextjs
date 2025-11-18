// StatBar Component - Gorean-themed stat display with current/max values
import React from 'react';
import { GoreanColors, GoreanFonts } from './GoreanTheme';

interface StatBarProps {
  label: string;
  current: number;
  max: number;
  icon?: string;
  className?: string;
}

export function StatBar({ label, current, max, icon, className = '' }: StatBarProps) {
  // Calculate percentage (clamped 0-100)
  const percentage = Math.max(0, Math.min(100, (current / max) * 100));

  // Determine color based on percentage
  const getBarColor = (pct: number): string => {
    if (pct >= 75) return GoreanColors.forestGreen;
    if (pct >= 50) return GoreanColors.gold;
    if (pct >= 25) return GoreanColors.bronze;
    return GoreanColors.bloodRed;
  };

  // Get shadow intensity based on percentage
  const getShadow = (pct: number): string => {
    if (pct >= 75) return '0 0 10px rgba(34, 139, 34, 0.5)';
    if (pct >= 50) return '0 0 10px rgba(212, 175, 55, 0.5)';
    if (pct >= 25) return '0 0 10px rgba(205, 127, 50, 0.4)';
    return '0 0 10px rgba(139, 0, 0, 0.5)';
  };

  const barColor = getBarColor(percentage);
  const shadowStyle = getShadow(percentage);

  return (
    <div className={`stat-bar-container ${className}`}>
      {/* Label and Value */}
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="text-xl" role="img" aria-label={label}>
              {icon}
            </span>
          )}
          <span
            className="text-sm font-semibold"
            style={{
              fontFamily: GoreanFonts.body,
              color: GoreanColors.charcoal
            }}
          >
            {label}
          </span>
        </div>
        <span
          className="text-sm font-bold"
          style={{
            fontFamily: GoreanFonts.monospace,
            color: barColor
          }}
        >
          {current} / {max}
        </span>
      </div>

      {/* Progress Bar */}
      <div
        className="relative w-full h-5 rounded-md overflow-hidden"
        style={{
          backgroundColor: GoreanColors.stoneLight,
          border: `2px solid ${GoreanColors.leather}`,
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
        }}
      >
        {/* Filled portion */}
        <div
          className="absolute top-0 left-0 h-full transition-all duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            backgroundColor: barColor,
            backgroundImage: `linear-gradient(to bottom, ${barColor}, ${barColor}dd)`,
            boxShadow: shadowStyle
          }}
        >
          {/* Inner shine effect */}
          <div
            className="absolute top-0 left-0 right-0 h-1/2"
            style={{
              background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)'
            }}
          />
        </div>

        {/* Percentage text overlay (centered) */}
        <div
          className="absolute inset-0 flex items-center justify-center text-xs font-bold"
          style={{
            color: percentage > 50 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
            textShadow:
              percentage > 50
                ? '0 1px 2px rgba(255,255,255,0.5)'
                : '0 1px 2px rgba(0,0,0,0.8)',
            fontFamily: GoreanFonts.monospace
          }}
        >
          {Math.round(percentage)}%
        </div>
      </div>
    </div>
  );
}

// Specialized stat bars with pre-configured icons
export function HealthBar({ current, max, className = '' }: Omit<StatBarProps, 'label' | 'icon'>) {
  return <StatBar label="Health" current={current} max={max} icon="⚔️" className={className} />;
}

export function HungerBar({ current, max, className = '' }: Omit<StatBarProps, 'label' | 'icon'>) {
  return <StatBar label="Hunger" current={current} max={max} icon="🍖" className={className} />;
}

export function ThirstBar({ current, max, className = '' }: Omit<StatBarProps, 'label' | 'icon'>) {
  return <StatBar label="Thirst" current={current} max={max} icon="💧" className={className} />;
}
