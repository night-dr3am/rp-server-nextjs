'use client';

import { useState, useEffect } from 'react';
import type { ArkanaDataType } from '@/lib/arkana/unifiedDataLoader';
import EffectBrowser from './EffectBrowser';
import EffectBuilder from './EffectBuilder';

// Power interface
interface Power {
  id: string;
  name: string;
  desc: string;
  cost: number;
  orderNumber?: number | null;
  abilityType?: string[];
  species?: string | string[];
  arch?: string | string[];
  section?: string;
  tags?: string[];
  baseStat?: string;
  targetType?: string;
  range?: number;
  effects?: Record<string, string[]>;
  usesPerScene?: number;
  prerequisites?: string[];
}

interface PowerAbilityEditorProps {
  token: string;
  dataType: ArkanaDataType;
  power?: Power | null;
  onSave: () => void;
  onCancel: () => void;
}

const ABILITY_TYPES = ['attack', 'ability', 'passive'];
const STATS = ['Physical', 'Dexterity', 'Mental', 'Perception', 'Stealth'];
const TARGET_TYPES = ['single', 'self', 'area', 'cone', 'line', 'all', 'all_enemies', 'all_allies'];
const SPECIES_LIST = ['human', 'strigoi', 'gaki', 'spliced', 'veilborn', 'synthral'];

// Effect contexts
const EFFECT_CONTEXTS = [
  { key: 'passive', label: 'Passive', desc: 'Always active' },
  { key: 'active', label: 'Active', desc: 'When activated as ability' },
  { key: 'attack', label: 'Attack', desc: 'When used as attack' },
  { key: 'ability', label: 'Ability', desc: 'When activated as ability (alt)' },
  { key: 'onHit', label: 'On Hit', desc: 'When attack hits target' },
  { key: 'onMiss', label: 'On Miss', desc: 'When attack misses' },
  { key: 'onDefense', label: 'On Defense', desc: 'When user is attacked' },
  { key: 'success', label: 'Success', desc: 'On successful check' },
  { key: 'failure', label: 'Failure', desc: 'On failed check' }
];

export default function PowerAbilityEditor({ token, dataType, power, onSave, onCancel }: PowerAbilityEditorProps) {
  const [formData, setFormData] = useState<Power>({
    id: '',
    name: '',
    desc: '',
    cost: 0,
    orderNumber: null,
    abilityType: [],
    species: [],
    arch: [],
    section: '',
    tags: [],
    baseStat: 'Physical',
    targetType: 'single',
    range: 0,
    effects: {},
    usesPerScene: undefined,
    prerequisites: []
  });
  const [activeContext, setActiveContext] = useState('passive');
  const [showEffectBrowser, setShowEffectBrowser] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Load power data when editing
  useEffect(() => {
    if (power) {
      setFormData({
        ...power,
        effects: power.effects || {}
      });
    }
  }, [power]);

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

    if (formData.cost === undefined || formData.cost === null) {
      errors.cost = 'Cost is required';
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

      const isNew = !power || !power.id;
      const url = isNew
        ? '/api/arkana/admin/arkana-data'
        : `/api/arkana/admin/arkana-data/${power.id}`;

      const method = isNew ? 'POST' : 'PUT';

      const { id: _id, orderNumber, ...jsonData } = formData;

      const body = isNew
        ? {
            token,
            id: formData.id,
            type: dataType,
            orderNumber,
            jsonData
          }
        : {
            token,
            orderNumber,
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
        throw new Error('Failed to save power');
      }

      const result = await response.json();
      if (result.success) {
        alert(`Power ${isNew ? 'created' : 'updated'} successfully!`);
        onSave();
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } catch (err) {
      console.error('Error saving power:', err);
      setError(err instanceof Error ? err.message : 'Failed to save power');
    } finally {
      setSaving(false);
    }
  };

  // Effect management
  const getContextEffects = (context: string): string[] => {
    return formData.effects?.[context] || [];
  };

  const addEffectsToContext = (context: string, effectIds: string[]) => {
    const currentEffects = getContextEffects(context);
    const newEffects = [...currentEffects, ...effectIds.filter(id => !currentEffects.includes(id))];
    setFormData({
      ...formData,
      effects: {
        ...formData.effects,
        [context]: newEffects
      }
    });
  };

  const removeEffectFromContext = (context: string, effectId: string) => {
    const currentEffects = getContextEffects(context);
    setFormData({
      ...formData,
      effects: {
        ...formData.effects,
        [context]: currentEffects.filter(id => id !== effectId)
      }
    });
  };

  const moveEffectUp = (context: string, index: number) => {
    if (index === 0) return;
    const currentEffects = [...getContextEffects(context)];
    [currentEffects[index - 1], currentEffects[index]] = [currentEffects[index], currentEffects[index - 1]];
    setFormData({
      ...formData,
      effects: {
        ...formData.effects,
        [context]: currentEffects
      }
    });
  };

  const moveEffectDown = (context: string, index: number) => {
    const currentEffects = [...getContextEffects(context)];
    if (index === currentEffects.length - 1) return;
    [currentEffects[index], currentEffects[index + 1]] = [currentEffects[index + 1], currentEffects[index]];
    setFormData({
      ...formData,
      effects: {
        ...formData.effects,
        [context]: currentEffects
      }
    });
  };

  // Tag management
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

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter(tag => tag !== tagToRemove) || []
    });
  };

  // Toggle functions
  const toggleAbilityType = (type: string) => {
    const current = formData.abilityType || [];
    setFormData({
      ...formData,
      abilityType: current.includes(type) ? current.filter(t => t !== type) : [...current, type]
    });
  };

  const toggleSpecies = (species: string) => {
    const current = Array.isArray(formData.species) ? formData.species : (formData.species ? [formData.species] : []);
    setFormData({
      ...formData,
      species: current.includes(species) ? current.filter(s => s !== species) : [...current, species]
    });
  };

  const getTitle = () => {
    const typeLabels: Record<string, string> = {
      commonPower: 'Common Power',
      archetypePower: 'Archetype Power',
      perk: 'Perk',
      cybernetic: 'Cybernetic',
      magicSchool: 'Magic School',
      magicWave: 'Magic Weave'
    };
    return typeLabels[dataType] || 'Power';
  };

  // Get total effects count
  const getTotalEffectsCount = () => {
    return Object.values(formData.effects || {}).reduce((sum, arr) => sum + arr.length, 0);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg shadow-2xl w-full max-w-7xl my-8">
          {/* Header */}
          <div className="bg-gray-800 border-b border-cyan-500 p-6 sticky top-0 z-10">
            <h2 className="text-2xl font-bold text-cyan-400">
              {power && power.id ? `✏️ Edit ${getTitle()}` : `➕ Create New ${getTitle()}`}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {getTotalEffectsCount()} effect{getTotalEffectsCount() !== 1 ? 's' : ''} configured across {Object.keys(formData.effects || {}).length} context{Object.keys(formData.effects || {}).length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Form */}
          <div className="p-6 space-y-6 max-h-[calc(90vh-200px)] overflow-y-auto">
            {error && (
              <div className="bg-red-900/20 border border-red-500 rounded p-4">
                <p className="text-red-300">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Basic Info */}
              <div className="space-y-4">
                <h3 className="text-cyan-400 font-bold text-lg border-b border-cyan-600 pb-2">Basic Info</h3>

                {/* ID */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    ID <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value.toLowerCase() })}
                    disabled={!!(power && power.id)}
                    className="w-full px-3 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300 disabled:opacity-50 text-sm"
                    placeholder="power_blood_drain"
                  />
                  {validationErrors.id && (
                    <p className="text-red-400 text-xs mt-1">{validationErrors.id}</p>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300 text-sm"
                    placeholder="Blood Drain"
                  />
                  {validationErrors.name && (
                    <p className="text-red-400 text-xs mt-1">{validationErrors.name}</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Description <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={formData.desc}
                    onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300 text-sm"
                    placeholder="Detailed description..."
                  />
                  {validationErrors.desc && (
                    <p className="text-red-400 text-xs mt-1">{validationErrors.desc}</p>
                  )}
                </div>

                {/* Cost */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Cost <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300 text-sm"
                  />
                </div>

                {/* Order Number */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Order Number
                  </label>
                  <input
                    type="number"
                    value={formData.orderNumber ?? ''}
                    onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300 text-sm"
                    placeholder="e.g., 10"
                  />
                  <p className="text-gray-400 text-xs mt-1">
                    Optional sort order for JSON exports. Lower numbers appear first.
                  </p>
                </div>

                {/* Ability Types */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Ability Type
                  </label>
                  <div className="space-y-2">
                    {ABILITY_TYPES.map((type) => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.abilityType?.includes(type)}
                          onChange={() => toggleAbilityType(type)}
                          className="w-4 h-4"
                        />
                        <span className="text-cyan-300 text-sm">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Stats & Combat */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-cyan-300 mb-1">
                      Base Stat
                    </label>
                    <select
                      value={formData.baseStat || 'Physical'}
                      onChange={(e) => setFormData({ ...formData, baseStat: e.target.value })}
                      className="w-full px-2 py-1 bg-gray-800 border border-cyan-500 text-cyan-100 rounded text-xs"
                    >
                      {STATS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-cyan-300 mb-1">
                      Range
                    </label>
                    <input
                      type="number"
                      value={formData.range || 0}
                      onChange={(e) => setFormData({ ...formData, range: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1 bg-gray-800 border border-cyan-500 text-cyan-100 rounded text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Target Type
                  </label>
                  <select
                    value={formData.targetType || 'single'}
                    onChange={(e) => setFormData({ ...formData, targetType: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded text-sm"
                  >
                    {TARGET_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                {/* Uses Per Scene */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Uses / Scene
                  </label>
                  <input
                    type="number"
                    value={formData.usesPerScene || ''}
                    onChange={(e) => setFormData({ ...formData, usesPerScene: parseInt(e.target.value) || undefined })}
                    className="w-full px-3 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded text-sm"
                    placeholder="Unlimited"
                  />
                </div>

                {/* Section */}
                {(dataType === 'cybernetic' || dataType === 'magicSchool' || dataType === 'magicWave') && (
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Section / School
                    </label>
                    <input
                      type="text"
                      value={formData.section || ''}
                      onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded text-sm"
                      placeholder="Neural, Mentalism"
                    />
                  </div>
                )}

                {/* Species Restrictions */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Species (leave empty for all)
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {SPECIES_LIST.map((species) => (
                      <label key={species} className="flex items-center gap-1 text-xs cursor-pointer p-1 bg-gray-800 rounded hover:bg-gray-750">
                        <input
                          type="checkbox"
                          checked={Array.isArray(formData.species) ? formData.species.includes(species) : formData.species === species}
                          onChange={() => toggleSpecies(species)}
                          className="w-3 h-3"
                        />
                        <span className="text-cyan-300">{species}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Tags
                  </label>
                  <div className="flex gap-1 mb-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      className="flex-1 px-2 py-1 bg-gray-800 border border-cyan-500 text-cyan-100 rounded text-xs"
                      placeholder="damage, buff"
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-2 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-xs"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {formData.tags?.map((tag, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1 px-2 py-0.5 bg-gray-800 border border-cyan-500 rounded text-cyan-300 text-xs"
                      >
                        <span>{tag}</span>
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="text-red-400 hover:text-red-300"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column - Effect Management */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-cyan-400 font-bold text-lg border-b border-cyan-600 pb-2">Effect Contexts</h3>

                {/* Context Tabs */}
                <div className="flex gap-1 overflow-x-auto pb-2">
                  {EFFECT_CONTEXTS.map((ctx) => {
                    const count = getContextEffects(ctx.key).length;
                    return (
                      <button
                        key={ctx.key}
                        onClick={() => setActiveContext(ctx.key)}
                        className={`px-3 py-2 rounded text-sm font-medium whitespace-nowrap ${
                          activeContext === ctx.key
                            ? 'bg-cyan-600 text-white'
                            : 'bg-gray-800 text-cyan-300 hover:bg-gray-700'
                        }`}
                      >
                        {ctx.label} {count > 0 && `(${count})`}
                      </button>
                    );
                  })}
                </div>

                {/* Active Context Info */}
                <div className="bg-gray-800 border border-cyan-600 rounded p-3">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="text-cyan-300 font-bold">
                        {EFFECT_CONTEXTS.find(c => c.key === activeContext)?.label}
                      </h4>
                      <p className="text-gray-400 text-xs">
                        {EFFECT_CONTEXTS.find(c => c.key === activeContext)?.desc}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowQuickCreate(true)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium whitespace-nowrap"
                      >
                        ➕ Quick Create
                      </button>
                      <button
                        onClick={() => setShowEffectBrowser(true)}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-xs font-medium whitespace-nowrap"
                      >
                        🔍 Browse Effects
                      </button>
                    </div>
                  </div>

                  {/* Effect Chips */}
                  <div className="space-y-2 min-h-[300px] max-h-[500px] overflow-y-auto">
                    {getContextEffects(activeContext).length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        No effects in this context. Click &quot;Browse Effects&quot; to add some.
                      </div>
                    ) : (
                      getContextEffects(activeContext).map((effectId, index) => (
                        <div
                          key={`${effectId}-${index}`}
                          className="flex items-center gap-2 p-2 bg-gray-900 border border-cyan-600 rounded"
                        >
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => moveEffectUp(activeContext, index)}
                              disabled={index === 0}
                              className="px-1 py-0 bg-gray-700 hover:bg-gray-600 text-cyan-300 rounded text-xs disabled:opacity-30"
                              title="Move up"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveEffectDown(activeContext, index)}
                              disabled={index === getContextEffects(activeContext).length - 1}
                              className="px-1 py-0 bg-gray-700 hover:bg-gray-600 text-cyan-300 rounded text-xs disabled:opacity-30"
                              title="Move down"
                            >
                              ▼
                            </button>
                          </div>
                          <code className="flex-1 text-cyan-300 text-sm font-mono">{effectId}</code>
                          <button
                            onClick={() => removeEffectFromContext(activeContext, effectId)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Effect Chain Visualization */}
                <div className="bg-gray-800 border border-cyan-600 rounded p-3">
                  <h4 className="text-cyan-300 font-bold mb-2 text-sm">Effect Chain Overview</h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {EFFECT_CONTEXTS.map((ctx) => {
                      const count = getContextEffects(ctx.key).length;
                      return (
                        <div
                          key={ctx.key}
                          className={`p-2 rounded ${count > 0 ? 'bg-cyan-900/30 border border-cyan-600' : 'bg-gray-900 border border-gray-700'}`}
                        >
                          <div className="text-cyan-300 font-medium">{ctx.label}</div>
                          <div className="text-gray-400">{count} effect{count !== 1 ? 's' : ''}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-800 border-t border-cyan-500 p-4 flex justify-end gap-4 sticky bottom-0">
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
              {saving ? 'Saving...' : `💾 Save ${getTitle()}`}
            </button>
          </div>
        </div>
      </div>

      {/* Effect Browser Modal */}
      {showEffectBrowser && (
        <EffectBrowser
          token={token}
          selectedEffects={getContextEffects(activeContext)}
          onSelect={(effectIds) => addEffectsToContext(activeContext, effectIds)}
          onClose={() => setShowEffectBrowser(false)}
          onQuickCreate={() => {
            setShowEffectBrowser(false);
            setShowQuickCreate(true);
          }}
        />
      )}

      {/* Quick Create Effect Modal */}
      {showQuickCreate && (
        <EffectBuilder
          token={token}
          effect={null}
          onSave={() => {
            setShowQuickCreate(false);
            // Refresh would happen here in production
            alert('Effect created! Refresh the browser to see it in the effect list.');
          }}
          onCancel={() => setShowQuickCreate(false)}
        />
      )}
    </>
  );
}
