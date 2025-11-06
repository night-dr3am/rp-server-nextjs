'use client';

import { useState, useEffect } from 'react';

// Effect interface
interface Effect {
  id: string;
  name: string;
  desc: string;
  category: 'check' | 'damage' | 'stat_modifier' | 'control' | 'defense' | 'heal' | 'utility' | 'resource' | 'special';
  type?: string;
  target?: string;
  duration?: string;
  tags?: string[];
  // Check fields
  checkStat?: string;
  checkVs?: string;
  checkTN?: number;
  checkVsStat?: string;
  // Damage fields
  damageType?: string;
  damageFormula?: string;
  damageFixed?: number;
  // Stat modifier fields
  stat?: string;
  modifier?: number;
  modifierType?: 'stat_value' | 'roll_bonus';
  // Control fields
  controlType?: string;
  resistType?: string;
  // Utility fields
  utilityType?: string;
}

interface EffectBuilderProps {
  token: string;
  effect?: Effect | null;
  onSave: () => void;
  onCancel: () => void;
}

// Constants
const CATEGORIES = [
  { value: 'check', label: 'Check' },
  { value: 'damage', label: 'Damage' },
  { value: 'stat_modifier', label: 'Stat Modifier' },
  { value: 'control', label: 'Control' },
  { value: 'defense', label: 'Defense' },
  { value: 'heal', label: 'Heal' },
  { value: 'utility', label: 'Utility' },
  { value: 'resource', label: 'Resource' },
  { value: 'special', label: 'Special' }
];

const STATS = ['Physical', 'Dexterity', 'Mental', 'Perception', 'Stealth'];
const TARGETS = ['self', 'enemy', 'ally', 'area', 'all_enemies', 'all_allies', 'area_and_self', 'all_enemies_and_self', 'all_allies_and_self'];
const DURATIONS = ['immediate', 'attack', 'turns:1', 'turns:2', 'turns:3', 'turns:5', 'turns:6', 'scene', 'permanent'];
const DAMAGE_TYPES = ['physical', 'mental', 'fire', 'ice', 'lightning', 'necrotic', 'force', 'poison', 'energy', 'elemental', 'breach'];
const CONTROL_TYPES = ['stun', 'paralyze', 'sleep', 'confusion', 'fear', 'bind', 'silence', 'charm', 'domination', 'knockdown', 'grapple', 'push', 'suggestion', 'seal'];
const UTILITY_TYPES = ['stealth', 'perception', 'initiative', 'movement', 'sensory', 'social'];

export default function EffectBuilder({ token, effect, onSave, onCancel }: EffectBuilderProps) {
  const [formData, setFormData] = useState<Effect>({
    id: '',
    name: '',
    desc: '',
    category: 'check',
    target: 'enemy',
    duration: 'immediate',
    tags: []
  });
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Load effect data when editing
  useEffect(() => {
    if (effect) {
      setFormData({ ...effect });
    }
  }, [effect]);

  // Validate form
  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.id.trim()) {
      errors.id = 'ID is required';
    } else if (!/^[a-z0-9_]+$/.test(formData.id)) {
      errors.id = 'ID must be lowercase letters, numbers, and underscores only';
    }

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.desc.trim()) {
      errors.desc = 'Description is required';
    }

    // Category-specific validation
    if (formData.category === 'check') {
      if (!formData.checkStat) errors.checkStat = 'Check stat is required';
      if (!formData.checkVs) errors.checkVs = 'Check vs is required';
      if (formData.checkVs === 'fixed' && !formData.checkTN) errors.checkTN = 'Target number is required';
      if (formData.checkVs === 'enemy_stat' && !formData.checkVsStat) errors.checkVsStat = 'Enemy stat is required';
    }

    if (formData.category === 'damage') {
      if (!formData.damageType) errors.damageType = 'Damage type is required';
      if (!formData.damageFormula && !formData.damageFixed) {
        errors.damageFormula = 'Damage formula or fixed damage is required';
      }
    }

    if (formData.category === 'stat_modifier') {
      if (!formData.stat) errors.stat = 'Stat is required';
      if (formData.modifier === undefined || formData.modifier === null) errors.modifier = 'Modifier is required';
      if (!formData.modifierType) errors.modifierType = 'Modifier type is required';
    }

    if (formData.category === 'control') {
      if (!formData.controlType) errors.controlType = 'Control type is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle save
  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const isNew = !effect || !effect.id;
      const url = isNew
        ? '/api/arkana/admin/arkana-data'
        : `/api/arkana/admin/arkana-data/${effect.id}`;

      const method = isNew ? 'POST' : 'PUT';

      const { id, ...jsonData } = formData;

      const body = isNew
        ? {
            token,
            id: formData.id,
            type: 'effect',
            jsonData
          }
        : {
            token,
            jsonData
          };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error('Failed to save effect');
      }

      const result = await response.json();
      if (result.success) {
        alert(`Effect ${isNew ? 'created' : 'updated'} successfully!`);
        onSave();
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } catch (err) {
      console.error('Error saving effect:', err);
      setError(err instanceof Error ? err.message : 'Failed to save effect');
    } finally {
      setSaving(false);
    }
  };

  // Handle add tag
  const handleAddTag = () => {
    if (!newTag.trim()) return;
    const tag = newTag.trim();
    if (!formData.tags?.includes(tag)) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tag]
      });
    }
    setNewTag('');
  };

  // Handle remove tag
  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter(tag => tag !== tagToRemove) || []
    });
  };

  // Generate JSON preview
  const getJsonPreview = () => {
    return JSON.stringify(formData, null, 2);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg shadow-2xl w-full max-w-6xl my-8">
        {/* Header */}
        <div className="bg-gray-800 border-b border-cyan-500 p-6 sticky top-0 z-10">
          <h2 className="text-2xl font-bold text-cyan-400">
            {effect && effect.id ? '✏️ Edit Effect' : '➕ Create New Effect'}
          </h2>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="bg-red-900/20 border border-red-500 rounded p-4">
              <p className="text-red-300">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Form Fields */}
            <div className="space-y-6">
              {/* ID Field */}
              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-2">
                  ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value.toLowerCase() })}
                  disabled={!!(effect && effect.id)}
                  className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300 disabled:opacity-50"
                  placeholder="e.g., buff_physical_stat_3"
                />
                {validationErrors.id && (
                  <p className="text-red-400 text-sm mt-1">{validationErrors.id}</p>
                )}
              </div>

              {/* Name Field */}
              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-2">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
                  placeholder="e.g., Strength Buff"
                />
                {validationErrors.name && (
                  <p className="text-red-400 text-sm mt-1">{validationErrors.name}</p>
                )}
              </div>

              {/* Description Field */}
              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-2">
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={formData.desc}
                  onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
                  placeholder="Detailed description of the effect..."
                />
                {validationErrors.desc && (
                  <p className="text-red-400 text-sm mt-1">{validationErrors.desc}</p>
                )}
              </div>

              {/* Category Selector */}
              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-2">
                  Category <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as Effect['category'] })}
                  className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Common Fields - Target and Duration */}
              {formData.category !== 'check' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Target
                    </label>
                    <select
                      value={formData.target || 'enemy'}
                      onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
                    >
                      {TARGETS.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Duration
                    </label>
                    <select
                      value={formData.duration || 'immediate'}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
                    >
                      {DURATIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Category-Specific Fields */}
              {formData.category === 'check' && (
                <div className="space-y-4 p-4 bg-gray-800 rounded border border-cyan-600">
                  <h3 className="text-cyan-400 font-bold">Check Configuration</h3>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Check Stat <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={formData.checkStat || ''}
                      onChange={(e) => setFormData({ ...formData, checkStat: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                    >
                      <option value="">Select stat...</option>
                      {STATS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    {validationErrors.checkStat && (
                      <p className="text-red-400 text-sm mt-1">{validationErrors.checkStat}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Check vs <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={formData.checkVs || ''}
                      onChange={(e) => setFormData({ ...formData, checkVs: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                    >
                      <option value="">Select...</option>
                      <option value="fixed">Fixed TN</option>
                      <option value="enemy_stat">Enemy Stat</option>
                    </select>
                    {validationErrors.checkVs && (
                      <p className="text-red-400 text-sm mt-1">{validationErrors.checkVs}</p>
                    )}
                  </div>

                  {formData.checkVs === 'fixed' && (
                    <div>
                      <label className="block text-sm font-medium text-cyan-300 mb-2">
                        Target Number <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="number"
                        value={formData.checkTN || ''}
                        onChange={(e) => setFormData({ ...formData, checkTN: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                        placeholder="e.g., 10"
                      />
                      {validationErrors.checkTN && (
                        <p className="text-red-400 text-sm mt-1">{validationErrors.checkTN}</p>
                      )}
                    </div>
                  )}

                  {formData.checkVs === 'enemy_stat' && (
                    <div>
                      <label className="block text-sm font-medium text-cyan-300 mb-2">
                        Enemy Stat <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={formData.checkVsStat || ''}
                        onChange={(e) => setFormData({ ...formData, checkVsStat: e.target.value })}
                        className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                      >
                        <option value="">Select stat...</option>
                        {STATS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {validationErrors.checkVsStat && (
                        <p className="text-red-400 text-sm mt-1">{validationErrors.checkVsStat}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {formData.category === 'damage' && (
                <div className="space-y-4 p-4 bg-gray-800 rounded border border-cyan-600">
                  <h3 className="text-cyan-400 font-bold">Damage Configuration</h3>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Damage Type <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={formData.damageType || ''}
                      onChange={(e) => setFormData({ ...formData, damageType: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                    >
                      <option value="">Select type...</option>
                      {DAMAGE_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {validationErrors.damageType && (
                      <p className="text-red-400 text-sm mt-1">{validationErrors.damageType}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Damage Formula
                    </label>
                    <input
                      type="text"
                      value={formData.damageFormula || ''}
                      onChange={(e) => setFormData({ ...formData, damageFormula: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                      placeholder="e.g., 6 + Mental"
                    />
                    {validationErrors.damageFormula && (
                      <p className="text-red-400 text-sm mt-1">{validationErrors.damageFormula}</p>
                    )}
                    <p className="text-gray-400 text-xs mt-1">
                      Format: &quot;number + StatName&quot; (e.g., &quot;6 + Mental&quot;)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Fixed Damage (optional)
                    </label>
                    <input
                      type="number"
                      value={formData.damageFixed || ''}
                      onChange={(e) => setFormData({ ...formData, damageFixed: parseInt(e.target.value) || undefined })}
                      className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                      placeholder="e.g., 10"
                    />
                    <p className="text-gray-400 text-xs mt-1">
                      Use for fixed damage instead of formula
                    </p>
                  </div>
                </div>
              )}

              {formData.category === 'stat_modifier' && (
                <div className="space-y-4 p-4 bg-gray-800 rounded border border-cyan-600">
                  <h3 className="text-cyan-400 font-bold">Stat Modifier Configuration</h3>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Stat <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={formData.stat || ''}
                      onChange={(e) => setFormData({ ...formData, stat: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                    >
                      <option value="">Select stat...</option>
                      {STATS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    {validationErrors.stat && (
                      <p className="text-red-400 text-sm mt-1">{validationErrors.stat}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Modifier <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.modifier || ''}
                      onChange={(e) => setFormData({ ...formData, modifier: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                      placeholder="e.g., 3"
                    />
                    {validationErrors.modifier && (
                      <p className="text-red-400 text-sm mt-1">{validationErrors.modifier}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Modifier Type <span className="text-red-400">*</span>
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 p-3 bg-gray-900 rounded border border-cyan-500 cursor-pointer hover:bg-gray-850">
                        <input
                          type="radio"
                          name="modifierType"
                          value="stat_value"
                          checked={formData.modifierType === 'stat_value'}
                          onChange={(e) => setFormData({ ...formData, modifierType: e.target.value as 'stat_value' | 'roll_bonus' })}
                          className="mt-1"
                        />
                        <div>
                          <div className="text-cyan-300 font-medium">stat_value (Non-Linear)</div>
                          <div className="text-gray-400 text-xs">
                            Modifies base stat before tier calculation. Stacks non-linearly. Best for long-duration buffs.
                          </div>
                        </div>
                      </label>
                      <label className="flex items-start gap-2 p-3 bg-gray-900 rounded border border-cyan-500 cursor-pointer hover:bg-gray-850">
                        <input
                          type="radio"
                          name="modifierType"
                          value="roll_bonus"
                          checked={formData.modifierType === 'roll_bonus'}
                          onChange={(e) => setFormData({ ...formData, modifierType: e.target.value as 'stat_value' | 'roll_bonus' })}
                          className="mt-1"
                        />
                        <div>
                          <div className="text-cyan-300 font-medium">roll_bonus (Linear)</div>
                          <div className="text-gray-400 text-xs">
                            Adds flat bonus after tier calculation. Stacks linearly. Best for tactical bonuses.
                          </div>
                        </div>
                      </label>
                    </div>
                    {validationErrors.modifierType && (
                      <p className="text-red-400 text-sm mt-1">{validationErrors.modifierType}</p>
                    )}
                  </div>
                </div>
              )}

              {formData.category === 'control' && (
                <div className="space-y-4 p-4 bg-gray-800 rounded border border-cyan-600">
                  <h3 className="text-cyan-400 font-bold">Control Configuration</h3>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Control Type <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={formData.controlType || ''}
                      onChange={(e) => setFormData({ ...formData, controlType: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                    >
                      <option value="">Select type...</option>
                      {CONTROL_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {validationErrors.controlType && (
                      <p className="text-red-400 text-sm mt-1">{validationErrors.controlType}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Resist Type
                    </label>
                    <select
                      value={formData.resistType || 'Mental'}
                      onChange={(e) => setFormData({ ...formData, resistType: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                    >
                      <option value="none">None</option>
                      {STATS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {(formData.category === 'defense' || formData.category === 'heal' || formData.category === 'utility' || formData.category === 'resource' || formData.category === 'special') && (
                <div className="space-y-4 p-4 bg-gray-800 rounded border border-cyan-600">
                  <h3 className="text-cyan-400 font-bold">{formData.category.charAt(0).toUpperCase() + formData.category.slice(1)} Configuration</h3>

                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Type
                    </label>
                    <input
                      type="text"
                      value={formData.type || ''}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                      placeholder="e.g., shapeshift, resistance"
                    />
                  </div>

                  {formData.category === 'utility' && (
                    <div>
                      <label className="block text-sm font-medium text-cyan-300 mb-2">
                        Utility Type
                      </label>
                      <select
                        value={formData.utilityType || ''}
                        onChange={(e) => setFormData({ ...formData, utilityType: e.target.value })}
                        className="w-full px-4 py-2 bg-gray-900 border border-cyan-500 text-cyan-100 rounded"
                      >
                        <option value="">Select type...</option>
                        {UTILITY_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Tags Field */}
              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-2">
                  Tags
                </label>

                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                    className="flex-1 px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
                    placeholder="e.g., damage, buff"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded font-medium"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {formData.tags && formData.tags.length > 0 ? (
                    formData.tags.map((tag, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 px-3 py-1 bg-gray-800 border border-cyan-500 rounded-full text-cyan-300 text-sm"
                      >
                        <span>{tag}</span>
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="text-red-400 hover:text-red-300"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No tags added</p>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - JSON Preview */}
            <div>
              <h3 className="text-cyan-400 font-bold mb-2">JSON Preview</h3>
              <pre className="bg-black border border-cyan-600 rounded p-4 text-cyan-200 text-xs overflow-auto max-h-[600px] font-mono">
                {getJsonPreview()}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-800 border-t border-cyan-500 p-6 flex justify-end gap-4 sticky bottom-0">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : '💾 Save Effect'}
          </button>
        </div>
      </div>
    </div>
  );
}
