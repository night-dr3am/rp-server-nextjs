'use client';

import { useState } from 'react';
import { Cybernetic, MagicSchool, CommonPower, ArchetypePower, Perk } from '@/lib/arkana/types';

interface ShopItemCardProps {
  item: (Cybernetic | MagicSchool | CommonPower | ArchetypePower | Perk) & {
    owned: boolean;
    eligible: boolean;
    xpCost: number;
  };
  isSelected: boolean;
  onToggle: (id: string) => void;
  currentXp: number;
  selectedTotalCost: number;
  noSlotsAvailable?: boolean; // True when no cybernetic slots are available
}

export default function ShopItemCard({
  item,
  isSelected,
  onToggle,
  currentXp,
  selectedTotalCost,
  noSlotsAvailable = false,
}: ShopItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate if item is affordable
  const remainingXp = currentXp - selectedTotalCost;
  const canAfford = isSelected ? true : (remainingXp >= item.xpCost);

  // Determine if checkbox should be disabled
  // Allow deselection (isSelected) even when no slots available
  const isDisabled = item.owned || !item.eligible || !canAfford || (!isSelected && noSlotsAvailable);

  // Determine visual state
  const getCardClasses = () => {
    if (item.owned) {
      return 'bg-gray-800 border-gray-600 opacity-60';
    }
    if (!item.eligible) {
      return 'bg-gray-800 border-red-500 opacity-60';
    }
    if (!isSelected && noSlotsAvailable) {
      return 'bg-gray-800 border-orange-600 opacity-70';
    }
    if (!canAfford) {
      return 'bg-gray-800 border-yellow-600 opacity-70';
    }
    if (isSelected) {
      return 'bg-cyan-900 border-cyan-400 shadow-lg shadow-cyan-500/50';
    }
    return 'bg-gray-800 border-gray-600 hover:border-cyan-500';
  };

  const getTooltipText = () => {
    if (item.owned) return 'You already own this item';
    if (!item.eligible) return 'Not eligible for your character';
    if (!isSelected && noSlotsAvailable) return 'No free slots available - purchase more slots first';
    if (!canAfford) return `Need ${item.xpCost - remainingXp} more XP`;
    return '';
  };

  return (
    <div className={`border-2 rounded-lg p-4 transition-all ${getCardClasses()}`}>
      {/* Header with checkbox and name */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-1">
          <input
            type="checkbox"
            checked={item.owned || isSelected}
            onChange={() => !isDisabled && onToggle(item.id)}
            disabled={isDisabled}
            className="w-5 h-5 rounded border-gray-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-gray-900 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            title={getTooltipText()}
          />
        </div>

        <div className="flex-1">
          {/* Name and XP cost */}
          <div className="flex items-start justify-between gap-2">
            <h4 className={`font-semibold ${item.owned ? 'text-gray-400' : 'text-cyan-300'}`}>
              {item.name}
              {item.owned && <span className="ml-2 text-xs text-green-400">✓ OWNED</span>}
              {!item.eligible && <span className="ml-2 text-xs text-red-400">🔒 LOCKED</span>}
            </h4>
            <span className={`flex-shrink-0 px-2 py-1 rounded text-sm font-bold ${
              item.owned ? 'bg-green-900 text-green-300' :
              isSelected ? 'bg-purple-600 text-white' :
              canAfford ? 'bg-purple-700 text-purple-200' :
              'bg-gray-700 text-gray-400'
            }`}>
              {item.xpCost} XP
            </span>
          </div>

          {/* Description */}
          <p className={`mt-2 text-sm ${item.owned ? 'text-gray-500' : 'text-gray-300'}`}>
            {item.desc}
          </p>

          {/* Expand button for details */}
          {(item.abilityType || item.effects) && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              {isExpanded ? '▼' : '▶'} {isExpanded ? 'Hide' : 'Show'} Details
            </button>
          )}

          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-3 p-3 bg-gray-900 rounded border border-gray-700 space-y-2">
              {/* Ability Type */}
              {item.abilityType && item.abilityType.length > 0 && (
                <div>
                  <span className="text-xs text-gray-400">Type: </span>
                  <span className="text-xs text-cyan-300">
                    {item.abilityType.join(', ')}
                  </span>
                </div>
              )}

              {/* Base Stat (for magic/active abilities) */}
              {'baseStat' in item && item.baseStat && (
                <div>
                  <span className="text-xs text-gray-400">Base Stat: </span>
                  <span className="text-xs text-cyan-300">{item.baseStat}</span>
                </div>
              )}

              {/* Target Type */}
              {'targetType' in item && item.targetType && (
                <div>
                  <span className="text-xs text-gray-400">Target: </span>
                  <span className="text-xs text-cyan-300">{item.targetType}</span>
                </div>
              )}

              {/* Range */}
              {'range' in item && item.range !== undefined && (
                <div>
                  <span className="text-xs text-gray-400">Range: </span>
                  <span className="text-xs text-cyan-300">{item.range}m</span>
                </div>
              )}

              {/* Effects */}
              {item.effects && Object.keys(item.effects).length > 0 && (
                <div>
                  <span className="text-xs text-gray-400">Effects:</span>
                  <div className="mt-1 space-y-1">
                    {Object.entries(item.effects).map(([type, effectIds]) => (
                      <div key={type} className="ml-2">
                        <span className="text-xs text-purple-400">{type}: </span>
                        <span className="text-xs text-gray-300">
                          {Array.isArray(effectIds) ? effectIds.join(', ') : effectIds}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Warning message for no slots */}
          {!item.owned && !isSelected && noSlotsAvailable && (
            <p className="mt-2 text-xs text-orange-400">
              🔒 No free slots - purchase slots first
            </p>
          )}

          {/* Warning message for unaffordable items */}
          {!item.owned && !noSlotsAvailable && !canAfford && (
            <p className="mt-2 text-xs text-yellow-400">
              ⚠ Need {item.xpCost - remainingXp} more XP to afford this item
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
