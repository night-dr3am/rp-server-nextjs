'use client';

import { useState, useEffect } from 'react';

// Skill interface
interface Skill {
  id: string;
  name: string;
  desc: string;
  type: 'combat' | 'situational' | 'social' | 'crafting' | 'knowledge';
  maxLevel: number;
  mechanic?: string;
}

interface SkillEditorProps {
  token: string;
  skill?: Skill | null;
  onSave: () => void;
  onCancel: () => void;
}

const SKILL_TYPES = [
  { value: 'combat', label: 'Combat' },
  { value: 'situational', label: 'Situational' },
  { value: 'social', label: 'Social' },
  { value: 'crafting', label: 'Crafting' },
  { value: 'knowledge', label: 'Knowledge' }
];

export default function SkillEditor({ token, skill, onSave, onCancel }: SkillEditorProps) {
  const [formData, setFormData] = useState<Skill>({
    id: '',
    name: '',
    desc: '',
    type: 'combat',
    maxLevel: 3,
    mechanic: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Load skill data when editing
  useEffect(() => {
    if (skill) {
      setFormData({
        id: skill.id || '',
        name: skill.name || '',
        desc: skill.desc || '',
        type: skill.type || 'combat',
        maxLevel: skill.maxLevel || 3,
        mechanic: skill.mechanic || ''
      });
    }
  }, [skill]);

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

    if (!formData.type) {
      errors.type = 'Type is required';
    }

    if (!formData.maxLevel || formData.maxLevel < 1 || formData.maxLevel > 5) {
      errors.maxLevel = 'Max Level must be between 1 and 5';
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

      const isNew = !skill || !skill.id;
      const url = isNew
        ? '/api/arkana/admin/arkana-data'
        : `/api/arkana/admin/arkana-data/${skill.id}`;

      const method = isNew ? 'POST' : 'PUT';

      const { id, ...jsonData } = formData;

      const body = isNew
        ? {
            token,
            id: formData.id,
            type: 'skill',
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
        throw new Error('Failed to save skill');
      }

      const result = await response.json();
      if (result.success) {
        alert(`Skill ${isNew ? 'created' : 'updated'} successfully!`);
        onSave();
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } catch (err) {
      console.error('Error saving skill:', err);
      setError(err instanceof Error ? err.message : 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gray-800 border-b border-cyan-500 p-6 sticky top-0 z-10">
          <h2 className="text-2xl font-bold text-cyan-400">
            {skill && skill.id ? '✏️ Edit Skill' : '➕ Create New Skill'}
          </h2>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-900/20 border border-red-500 rounded p-4">
              <p className="text-red-300">{error}</p>
            </div>
          )}

          {/* ID Field */}
          <div>
            <label className="block text-sm font-medium text-cyan-300 mb-2">
              ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value.toLowerCase() })}
              disabled={!!(skill && skill.id)}
              className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300 disabled:opacity-50"
              placeholder="e.g., skill_melee_combat"
            />
            {validationErrors.id && (
              <p className="text-red-400 text-sm mt-1">{validationErrors.id}</p>
            )}
            <p className="text-gray-400 text-xs mt-1">
              Lowercase letters, numbers, and underscores only. Cannot be changed after creation.
            </p>
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
              placeholder="e.g., Melee Combat"
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
              placeholder="Brief description of what this skill represents..."
            />
            {validationErrors.desc && (
              <p className="text-red-400 text-sm mt-1">{validationErrors.desc}</p>
            )}
          </div>

          {/* Type Dropdown */}
          <div>
            <label className="block text-sm font-medium text-cyan-300 mb-2">
              Type <span className="text-red-400">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as Skill['type'] })}
              className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
            >
              {SKILL_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {validationErrors.type && (
              <p className="text-red-400 text-sm mt-1">{validationErrors.type}</p>
            )}
          </div>

          {/* Max Level Field */}
          <div>
            <label className="block text-sm font-medium text-cyan-300 mb-2">
              Max Level <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min="1"
              max="5"
              value={formData.maxLevel}
              onChange={(e) => setFormData({ ...formData, maxLevel: parseInt(e.target.value) || 1 })}
              className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
            />
            {validationErrors.maxLevel && (
              <p className="text-red-400 text-sm mt-1">{validationErrors.maxLevel}</p>
            )}
            <p className="text-gray-400 text-xs mt-1">
              Maximum level players can achieve in this skill (1-5).
            </p>
          </div>

          {/* Mechanic Field */}
          <div>
            <label className="block text-sm font-medium text-cyan-300 mb-2">
              Mechanic <span className="text-gray-500">(Optional)</span>
            </label>
            <textarea
              value={formData.mechanic}
              onChange={(e) => setFormData({ ...formData, mechanic: e.target.value })}
              rows={5}
              className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
              placeholder="Detailed game mechanics for each level...&#10;Level 1: Basic proficiency&#10;Level 2: Improved ability&#10;..."
            />
            <p className="text-gray-400 text-xs mt-1">
              Describe the mechanical benefits at each skill level.
            </p>
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
            {saving ? 'Saving...' : '💾 Save Skill'}
          </button>
        </div>
      </div>
    </div>
  );
}
