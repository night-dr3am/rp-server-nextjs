'use client';

interface ShopCategoryTabsProps {
  activeCategory: 'cybernetics' | 'magic';
  onCategoryChange: (category: 'cybernetics' | 'magic') => void;
  counts: {
    cybernetics: number;
    magicWeaves: number;
  };
  currentXp: number;
  selectedTotalCost: number;
}

export default function ShopCategoryTabs({
  activeCategory,
  onCategoryChange,
  counts,
  currentXp,
  selectedTotalCost,
}: ShopCategoryTabsProps) {
  const remainingXp = currentXp - selectedTotalCost;

  return (
    <div className="space-y-4">
      {/* XP Display */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-lg p-4 border border-purple-500">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-purple-200">Current XP</p>
            <p className="text-3xl font-bold text-white">{currentXp}</p>
          </div>
          {selectedTotalCost > 0 && (
            <>
              <div className="text-center">
                <p className="text-sm text-purple-200">Selected Cost</p>
                <p className="text-2xl font-bold text-yellow-400">-{selectedTotalCost}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-purple-200">Remaining</p>
                <p className={`text-2xl font-bold ${remainingXp >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {remainingXp}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="border-b border-cyan-500">
        <nav className="flex space-x-4">
          {/* Cybernetics Tab */}
          <button
            onClick={() => onCategoryChange('cybernetics')}
            className={`pb-3 px-4 font-semibold transition-all ${
              activeCategory === 'cybernetics'
                ? 'border-b-2 border-cyan-400 text-cyan-400'
                : 'text-cyan-500 hover:text-cyan-400 hover:border-b-2 hover:border-cyan-600'
            }`}
          >
            Cybernetics
            {counts.cybernetics > 0 && (
              <span className="ml-2 px-2 py-1 bg-cyan-600 text-white text-xs rounded-full">
                {counts.cybernetics}
              </span>
            )}
          </button>

          {/* Magic Tab */}
          <button
            onClick={() => onCategoryChange('magic')}
            className={`pb-3 px-4 font-semibold transition-all ${
              activeCategory === 'magic'
                ? 'border-b-2 border-cyan-400 text-cyan-400'
                : 'text-cyan-500 hover:text-cyan-400 hover:border-b-2 hover:border-cyan-600'
            }`}
          >
            Magic
            {counts.magicWeaves > 0 && (
              <span className="ml-2 px-2 py-1 bg-purple-600 text-white text-xs rounded-full">
                {counts.magicWeaves}
              </span>
            )}
          </button>
        </nav>
      </div>
    </div>
  );
}
