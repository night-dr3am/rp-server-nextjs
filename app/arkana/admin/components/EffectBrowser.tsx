'use client';

import { useState, useEffect } from 'react';

interface Effect {
  id: string;
  name: string;
  desc?: string;  // Optional to handle missing data from database
  category: string;
  orderNumber?: number;  // Added by auto-assignment
  arkanaDataType?: string;  // Added by API
  _uniqueId?: string;  // Added by API
}

interface EffectBrowserProps {
  token: string;
  selectedEffects: string[];
  onSelect: (effectIds: string[]) => void;
  onClose: () => void;
  onQuickCreate?: () => void;
}

export default function EffectBrowser({ token, selectedEffects, onSelect, onClose, onQuickCreate }: EffectBrowserProps) {
  const [effects, setEffects] = useState<Effect[]>([]);
  const [filteredEffects, setFilteredEffects] = useState<Effect[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedEffects));

  const categories = ['all', 'check', 'damage', 'stat_modifier', 'control', 'defense', 'heal', 'utility', 'resource', 'special'];

  // Load effects
  useEffect(() => {
    const loadEffects = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/arkana/admin/arkana-data?type=effect&limit=1000&token=${token}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.success) {
          setEffects(result.data.items || []);
          setFilteredEffects(result.data.items || []);
        } else {
          throw new Error(result.error || 'Failed to load effects');
        }
      } catch (err) {
        console.error('Error loading effects:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEffects();
  }, [token]);

  // Filter effects
  useEffect(() => {
    let filtered = effects;

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(e => e.category === categoryFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.id.toLowerCase().includes(term) ||
        e.name.toLowerCase().includes(term) ||
        (e.desc && e.desc.toLowerCase().includes(term))  // Safe null check
      );
    }

    setFilteredEffects(filtered);
  }, [effects, searchTerm, categoryFilter]);

  // Toggle effect selection
  const toggleEffect = (effectId: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(effectId)) {
      newSelected.delete(effectId);
    } else {
      newSelected.add(effectId);
    }
    setSelected(newSelected);
  };

  // Handle confirm
  const handleConfirm = () => {
    onSelect(Array.from(selected));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 border-b border-cyan-500 p-6">
          <h2 className="text-2xl font-bold text-cyan-400">Effect Browser</h2>
          <p className="text-gray-400 text-sm mt-1">
            Select effects to add. {selected.size} effect{selected.size !== 1 ? 's' : ''} selected.
          </p>
        </div>

        {/* Search and Filters */}
        <div className="p-4 border-b border-gray-700 space-y-3">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Search effects by ID, name, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
            />
            {onQuickCreate && (
              <button
                onClick={onQuickCreate}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium whitespace-nowrap"
              >
                ➕ Quick Create
              </button>
            )}
          </div>

          {/* Category Filter Tabs */}
          <div className="flex gap-2 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${
                  categoryFilter === cat
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-800 text-cyan-300 hover:bg-gray-700'
                }`}
              >
                {cat === 'all' ? 'All' : cat.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Effects List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
              <span className="ml-3 text-cyan-300">Loading effects...</span>
            </div>
          ) : filteredEffects.length === 0 ? (
            <div className="text-center p-8 text-gray-400">
              No effects found. {searchTerm && 'Try a different search term.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEffects.map((effect) => (
                <label
                  key={effect.id}
                  className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                    selected.has(effect.id)
                      ? 'bg-cyan-900/30 border-cyan-500'
                      : 'bg-gray-800 border-gray-700 hover:border-cyan-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(effect.id)}
                    onChange={() => toggleEffect(effect.id)}
                    className="mt-1 w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-cyan-300 font-medium">{effect.name}</span>
                        <span className="text-gray-500 text-sm ml-2">({effect.category})</span>
                      </div>
                      <code className="text-xs text-gray-400 font-mono">{effect.id}</code>
                    </div>
                    <p className="text-gray-400 text-sm mt-1">{effect.desc || 'No description'}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-800 border-t border-cyan-500 p-4 flex justify-between items-center">
          <div className="text-sm text-gray-400">
            Showing {filteredEffects.length} of {effects.length} effects
          </div>
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded font-medium"
            >
              Add Selected ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
