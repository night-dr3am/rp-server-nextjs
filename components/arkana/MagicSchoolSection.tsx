'use client';

import { useState } from 'react';
import ShopItemCard from './ShopItemCard';
import type { ShopMagicSchool } from '@/lib/arkana/shopHelpers';

interface MagicSchoolSectionProps {
  school: ShopMagicSchool;
  selectedWeaves: Set<string>;
  onWeaveToggle: (weaveId: string) => void;
  currentXp: number;
  selectedTotalCost: number;
}

export default function MagicSchoolSection({
  school,
  selectedWeaves,
  onWeaveToggle,
  currentXp,
  selectedTotalCost,
}: MagicSchoolSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Check if any weave is selected
  const hasSelectedWeaves = school.weaves.some(weave => selectedWeaves.has(weave.id));
  const ownedWeavesCount = school.weaves.filter(weave => weave.owned).length;
  const totalWeavesCount = school.weaves.length;

  // Check if school will be auto-unlocked
  const willUnlockSchool = !school.owned && hasSelectedWeaves;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* School Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full p-4 flex items-center justify-between transition-colors ${
          isExpanded ? 'bg-gradient-to-r from-purple-900 to-indigo-900' : 'bg-gray-800 hover:bg-gray-750'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {isExpanded ? '▼' : '▶'}
          </span>
          <div className="text-left">
            <h3 className="text-lg font-bold text-cyan-300">
              {school.schoolName}
              {school.owned && (
                <span className="ml-2 text-xs text-green-400">✓ UNLOCKED</span>
              )}
              {willUnlockSchool && (
                <span className="ml-2 text-xs text-yellow-400 animate-pulse">
                  🔓 Will Unlock
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-400">{school.schoolDesc}</p>
            {school.species && (
              <p className="text-xs text-purple-400 mt-1">
                Restricted to: {school.species}
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
              willUnlockSchool ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400'
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
      </button>

      {/* Weaves List */}
      {isExpanded && (
        <div className="p-4 bg-gray-900 space-y-3">
          {willUnlockSchool && (
            <div className="mb-4 p-3 bg-yellow-900 border border-yellow-600 rounded-lg">
              <p className="text-sm text-yellow-200">
                <strong>School Auto-Unlock:</strong> Purchasing your first weave from this school will automatically unlock the school at no additional cost.
              </p>
            </div>
          )}

          {school.weaves.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No weaves available for this school
            </p>
          ) : (
            school.weaves.map(weave => (
              <ShopItemCard
                key={weave.id}
                item={weave}
                isSelected={selectedWeaves.has(weave.id)}
                onToggle={onWeaveToggle}
                currentXp={currentXp}
                selectedTotalCost={selectedTotalCost}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
