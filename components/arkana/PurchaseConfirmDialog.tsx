'use client';

interface ShopItem {
  id: string;
  name: string;
  xpCost: number;
  itemType: 'cybernetic' | 'magic_weave' | 'magic_school';
}

interface PurchaseConfirmDialogProps {
  selectedItems: ShopItem[];
  totalCost: number;
  currentXp: number;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
  error?: string | null;
}

export default function PurchaseConfirmDialog({
  selectedItems,
  totalCost,
  currentXp,
  onConfirm,
  onCancel,
  isProcessing = false,
  error = null,
}: PurchaseConfirmDialogProps) {
  const remainingXp = currentXp - totalCost;
  const canAfford = remainingXp >= 0;

  // Group items by type for display
  const cybernetics = selectedItems.filter(item => item.itemType === 'cybernetic');
  const magicSchools = selectedItems.filter(item => item.itemType === 'magic_school');
  const magicWeaves = selectedItems.filter(item => item.itemType === 'magic_weave');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-6 border-b border-cyan-500">
          <h2 className="text-2xl font-bold text-white">Confirm Purchase</h2>
          <p className="text-sm text-gray-300 mt-1">
            Review your selection before completing the purchase
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Cybernetics Section */}
          {cybernetics.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-cyan-400 mb-3">
                Cybernetics ({cybernetics.length})
              </h3>
              <div className="space-y-2">
                {cybernetics.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700"
                  >
                    <span className="text-gray-200">{item.name}</span>
                    <span className="text-purple-400 font-semibold">{item.xpCost} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Magic Schools Section */}
          {magicSchools.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-cyan-400 mb-3">
                Magic Schools ({magicSchools.length})
              </h3>
              <div className="space-y-2">
                {magicSchools.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700"
                  >
                    <span className="text-gray-200">{item.name}</span>
                    <span className="text-purple-400 font-semibold">{item.xpCost} XP</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 bg-purple-900 border border-purple-600 rounded">
                <p className="text-sm text-purple-200">
                  <strong>Note:</strong> You must purchase magic schools before you can buy their weaves.
                </p>
              </div>
            </div>
          )}

          {/* Magic Weaves Section */}
          {magicWeaves.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-cyan-400 mb-3">
                Magic Weaves ({magicWeaves.length})
              </h3>
              <div className="space-y-2">
                {magicWeaves.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700"
                  >
                    <span className="text-gray-200">{item.name}</span>
                    <span className="text-purple-400 font-semibold">{item.xpCost} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cost Summary */}
          <div className="border-t border-gray-700 pt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-gray-300">
                <span>Current XP:</span>
                <span className="font-semibold">{currentXp}</span>
              </div>
              <div className="flex items-center justify-between text-yellow-400">
                <span>Total Cost:</span>
                <span className="font-semibold">{totalCost} XP</span>
              </div>
              <div className={`flex items-center justify-between text-lg font-bold border-t border-gray-700 pt-2 ${
                canAfford ? 'text-green-400' : 'text-red-400'
              }`}>
                <span>Remaining XP:</span>
                <span>{remainingXp}</span>
              </div>
            </div>

            {!canAfford && (
              <div className="mt-4 p-3 bg-red-900 border border-red-600 rounded">
                <p className="text-sm text-red-200">
                  <strong>Insufficient XP:</strong> You need {Math.abs(remainingXp)} more XP to complete this purchase.
                </p>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-900 border border-red-600 rounded">
              <p className="text-sm text-red-200">
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-800 p-6 border-t border-gray-700 flex items-center justify-end gap-4">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="px-6 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canAfford || isProcessing}
            className={`px-6 py-2 rounded font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              canAfford && !isProcessing
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 shadow-lg'
                : 'bg-gray-600 text-gray-400'
            }`}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              `Confirm Purchase (${totalCost} XP)`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
