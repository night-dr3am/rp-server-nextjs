'use client';

import { useState } from 'react';
import ShopItemCard from './ShopItemCard';
import type { ShopMagicSchool } from '@/lib/arkana/shopHelpers';

interface MagicSchoolSectionProps {
  school: ShopMagicSchool;
  selectedWeaves: Set<string>;
  onWeaveToggle: (weaveId: string) => void;
  isSchoolSelected: boolean;
  onSchoolToggle: (schoolId: string) => void;
  currentXp: number;
  selectedTotalCost: number;
}

export default function MagicSchoolSection({
  school,
  selectedWeaves,
  onWeaveToggle,
  isSchoolSelected,
  onSchoolToggle,
  currentXp,
  selectedTotalCost,
}: MagicSchoolSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Check if any weave is selected
  const hasSelectedWeaves = school.weaves.some(weave => selectedWeaves.has(weave.id));
  const ownedWeavesCount = school.weaves.filter(weave => weave.owned).length;
  const totalWeavesCount = school.weaves.length;

  // Check if school is accessible (owned or selected for purchase)
  const isSchoolAccessible = school.owned || isSchoolSelected;

  // Check if user can afford the school
  const remainingXp = currentXp - selectedTotalCost;
  const canAffordSchool = isSchoolSelected ? true : (remainingXp >= school.schoolCost);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* School Header */}
      <div
        className={`w-full p-4 flex items-center justify-between transition-colors ${
          isExpanded ? 'bg-gradient-to-r from-purple-900 to-indigo-900' : 'bg-gray-800'
        }`}
      >
        <div className="flex items-center gap-3 flex-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-2xl hover:text-cyan-400 transition-colors"
          >
            {isExpanded ? '▼' : '▶'}
          </button>

          {/* School Purchase Checkbox (only if not owned) */}
          {!school.owned && school.schoolCost > 0 && (
            <input
              type="checkbox"
              checked={isSchoolSelected}
              onChange={() => onSchoolToggle(school.schoolId)}
              disabled={!canAffordSchool}
              className="w-5 h-5 cursor-pointer"
              title={canAffordSchool ? 'Select to purchase school' : 'Insufficient XP'}
            />
          )}

          <div className="text-left flex-1">
            <h3 className="text-lg font-bold text-cyan-300">
              {school.schoolName}
              {school.owned && (
                <span className="ml-2 text-xs text-green-400">✓ OWNED</span>
              )}
              {isSchoolSelected && (
                <span className="ml-2 text-xs text-purple-400 animate-pulse">
                  ✓ Selected
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-400">{school.schoolDesc}</p>
            {school.species && (
              <p className="text-xs text-purple-400 mt-1">
                Restricted to: {school.species}
              </p>
            )}
            {!school.owned && !isSchoolSelected && (
              <p className="text-xs text-yellow-400 mt-1">
                ⚠️ Purchase school to unlock weaves
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-400">Weaves</p>
            <p className="text-sm text-cyan-300">
              {ownedWeavesCount} / {totalWeavesCount}
            </p>
          </div>
          {school.schoolCost > 0 && !school.owned && (
            <div className={`px-3 py-1 rounded text-sm font-bold ${
              isSchoolSelected ? 'bg-purple-600 text-white' :
              canAffordSchool ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-500'
            }`}>
              {school.schoolCost} XP
            </div>
          )}
          {school.schoolCost === 0 && !school.owned && (
            <div className="px-3 py-1 rounded text-sm font-bold bg-green-700 text-white">
              FREE
            </div>
          )}
        </div>
      </div>

      {/* Weaves List */}
      {isExpanded && (
        <div className="p-4 bg-gray-900 space-y-3">
          {!isSchoolAccessible && (
            <div className="mb-4 p-3 bg-orange-900 border border-orange-600 rounded-lg">
              <p className="text-sm text-orange-200">
                <strong>School Required:</strong> You must purchase this school ({school.schoolCost} XP) before you can buy its weaves. Check the box above to add the school to your cart.
              </p>
            </div>
          )}

          {school.weaves.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No weaves available for this school
            </p>
          ) : (
            <div className={!isSchoolAccessible ? 'opacity-50 pointer-events-none' : ''}>
              {school.weaves.map(weave => (
                <ShopItemCard
                  key={weave.id}
                  item={weave}
                  isSelected={selectedWeaves.has(weave.id)}
                  onToggle={onWeaveToggle}
                  currentXp={currentXp}
                  selectedTotalCost={selectedTotalCost}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
