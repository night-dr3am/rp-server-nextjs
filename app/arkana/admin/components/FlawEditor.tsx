'use client';

import { useState, useEffect } from 'react';

// Flaw interface
interface Flaw {
  id: string;
  name: string;
  desc: string;
  cost: number;
  orderNumber?: number | null;
  tags?: string[];
}

interface FlawEditorProps {
  token: string;
  flaw?: Flaw | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function FlawEditor({ token, flaw, onSave, onCancel }: FlawEditorProps) {
  const [formData, setFormData] = useState<Flaw>({
    id: '',
    name: '',
    desc: '',
    cost: 0,
    orderNumber: null,
    tags: []
  });
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Load flaw data when editing
  useEffect(() => {
    if (flaw) {
      setFormData({
        id: flaw.id || '',
        name: flaw.name || '',
        desc: flaw.desc || '',
        cost: flaw.cost || 0,
        orderNumber: flaw.orderNumber ?? null,
        tags: flaw.tags || []
      });
    }
  }, [flaw]);

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

      const isNew = !flaw || !flaw.id;
      const url = isNew
        ? '/api/arkana/admin/arkana-data'
        : `/api/arkana/admin/arkana-data/${flaw.id}`;

      const method = isNew ? 'POST' : 'PUT';

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, orderNumber, ...jsonData } = formData;

      const body = isNew
        ? {
            token,
            id: formData.id,
            type: 'flaw',
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error('Failed to save flaw');
      }

      const result = await response.json();
      if (result.success) {
        alert(`Flaw ${isNew ? 'created' : 'updated'} successfully!`);
        onSave();
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } catch (err) {
      console.error('Error saving flaw:', err);
      setError(err instanceof Error ? err.message : 'Failed to save flaw');
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gray-800 border-b border-cyan-500 p-6 sticky top-0 z-10">
          <h2 className="text-2xl font-bold text-cyan-400">
            {flaw && flaw.id ? '✏️ Edit Flaw' : '➕ Create New Flaw'}
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
              disabled={!!(flaw && flaw.id)}
              className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300 disabled:opacity-50"
              placeholder="e.g., flaw_weak_constitution"
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
              placeholder="e.g., Weak Constitution"
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
              rows={4}
              className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
              placeholder="Detailed description of the flaw..."
            />
            {validationErrors.desc && (
              <p className="text-red-400 text-sm mt-1">{validationErrors.desc}</p>
            )}
          </div>

          {/* Cost Field */}
          <div>
            <label className="block text-sm font-medium text-cyan-300 mb-2">
              Cost <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: parseInt(e.target.value) || 0 })}
              className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
              placeholder="e.g., -2"
            />
            {validationErrors.cost && (
              <p className="text-red-400 text-sm mt-1">{validationErrors.cost}</p>
            )}
            <p className="text-gray-400 text-xs mt-1">
              Negative values give points back to the player. Positive values cost points.
            </p>
          </div>

          {/* Order Number Field */}
          <div>
            <label className="block text-sm font-medium text-cyan-300 mb-2">
              Order Number
            </label>
            <input
              type="number"
              value={formData.orderNumber ?? ''}
              onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
              placeholder="e.g., 10"
            />
            <p className="text-gray-400 text-xs mt-1">
              Optional sort order for JSON exports. Lower numbers appear first. Leave empty to sort at end.
            </p>
          </div>

          {/* Tags Field */}
          <div>
            <label className="block text-sm font-medium text-cyan-300 mb-2">
              Tags
            </label>

            {/* Tag input */}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                className="flex-1 px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
                placeholder="e.g., race:vampire or category:physical"
              />
              <button
                onClick={handleAddTag}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded font-medium"
              >
                Add
              </button>
            </div>

            {/* Tag chips */}
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

            <p className="text-gray-400 text-xs mt-2">
              Common formats: race:species, category:type. Press Enter or click Add.
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
            {saving ? 'Saving...' : '💾 Save Flaw'}
          </button>
        </div>
      </div>
    </div>
  );
}
