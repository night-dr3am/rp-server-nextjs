'use client';

import { useState, useEffect } from 'react';
import type { ArkanaDataType } from '@/lib/arkana/unifiedDataLoader';
import ArkanaDataGrid from './ArkanaDataGrid';
import FlawEditor from './FlawEditor';
import SkillEditor from './SkillEditor';
import EffectBuilder from './EffectBuilder';
import PowerAbilityEditor from './PowerAbilityEditor';

// Type definitions
interface DataSourceInfo {
  type: ArkanaDataType;
  source: 'database' | 'json';
  count: number;
  cached: boolean;
}

interface ArkanaDataTabProps {
  token: string;
}

// Type labels for display
const TYPE_LABELS: Record<ArkanaDataType, string> = {
  flaw: 'Flaws',
  commonPower: 'Common Powers',
  archetypePower: 'Archetype Powers',
  perk: 'Perks',
  magicSchool: 'Magic Schools',
  magicWave: 'Magic Weaves',
  cybernetic: 'Cybernetics',
  skill: 'Skills',
  effect: 'Effects'
};

export default function ArkanaDataTab({ token }: ArkanaDataTabProps) {
  const [activeDataType, setActiveDataType] = useState<ArkanaDataType>('flaw');
  const [searchTerm, setSearchTerm] = useState('');
  const [dataSourceInfo, setDataSourceInfo] = useState<DataSourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load data source information
  useEffect(() => {
    const loadDataSourceInfo = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/arkana/admin/data-source-info', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to load data source information');
        }

        const result = await response.json();
        if (result.success) {
          setDataSourceInfo(result.data);
        } else {
          throw new Error(result.error || 'Unknown error');
        }
      } catch (err) {
        console.error('Error loading data source info:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadDataSourceInfo();
  }, [token]);

  // Get count for a specific type
  const getTypeCount = (type: ArkanaDataType): number => {
    const info = dataSourceInfo.find(item => item.type === type);
    return info?.count || 0;
  };

  // Get data source for display (DB/JSON indicator)
  const getDataSource = (): string => {
    const info = dataSourceInfo.find(item => item.type === activeDataType);
    if (!info) return 'Unknown';
    return info.source === 'database' ? '🗄️ Database' : '📄 JSON Files';
  };

  // Handle save all to database
  const handleSaveAllToDatabase = async () => {
    if (!confirm('Save all JSON data to database? This will overwrite existing database entries.')) {
      return;
    }

    try {
      setLoading(true);
      // TODO: Implement bulk save endpoint
      alert('Save to database functionality coming soon!');
    } catch (err) {
      console.error('Error saving to database:', err);
      alert('Failed to save to database');
    } finally {
      setLoading(false);
    }
  };

  // Handle export to JSON
  const handleExportToJSON = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/arkana/admin/arkana-data/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: activeDataType })
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeDataType}_export.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error exporting:', err);
      alert('Failed to export data');
    } finally {
      setLoading(false);
    }
  };

  if (loading && dataSourceInfo.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto"></div>
          <p className="mt-4 text-cyan-400">Loading data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
        <h3 className="text-red-400 font-bold mb-2">Error</h3>
        <p className="text-red-300">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with search and actions */}
      <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-cyan-400">📊 Arkana Data Management</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">Data Source:</span>
            <span className="text-cyan-300 font-medium">{getDataSource()}</span>
          </div>
        </div>

        {/* Search and action buttons */}
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search across all fields..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
          />
          <button
            onClick={handleSaveAllToDatabase}
            disabled={loading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:opacity-50 whitespace-nowrap"
          >
            💾 Save All to Database
          </button>
          <button
            onClick={handleExportToJSON}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50 whitespace-nowrap"
          >
            📥 Export JSON
          </button>
        </div>
      </div>

      {/* Data type tabs */}
      <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {(Object.keys(TYPE_LABELS) as ArkanaDataType[]).map((type) => (
            <button
              key={type}
              onClick={() => setActiveDataType(type)}
              className={`px-4 py-3 rounded font-medium transition-colors ${
                activeDataType === type
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800 text-cyan-300 hover:bg-gray-700'
              }`}
            >
              <div className="text-sm">{TYPE_LABELS[type]}</div>
              <div className="text-xs opacity-75 mt-1">({getTypeCount(type)})</div>
            </button>
          ))}
        </div>
      </div>

      {/* Content area - data grid */}
      <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6">
        <h3 className="text-xl font-bold text-cyan-400 mb-4">{TYPE_LABELS[activeDataType]}</h3>
        <ArkanaDataGrid
          key={refreshKey}
          token={token}
          dataType={activeDataType}
          searchTerm={searchTerm}
          onEdit={(item) => {
            setSelectedItem(item);
            setShowEditor(true);
          }}
          onRefresh={() => {
            setRefreshKey(prev => prev + 1);
          }}
        />
      </div>

      {/* Editor Modals */}
      {showEditor && activeDataType === 'flaw' && (
        <FlawEditor
          token={token}
          flaw={selectedItem?.id ? selectedItem as Record<string, unknown> & { id: string; name: string; desc: string; cost: number } : null}
          onSave={() => {
            setShowEditor(false);
            setSelectedItem(null);
            setRefreshKey(prev => prev + 1);
          }}
          onCancel={() => {
            setShowEditor(false);
            setSelectedItem(null);
          }}
        />
      )}

      {showEditor && activeDataType === 'skill' && (
        <SkillEditor
          token={token}
          skill={selectedItem?.id ? selectedItem as Record<string, unknown> & { id: string; name: string; desc: string; type: 'combat' | 'situational' | 'social' | 'crafting' | 'knowledge'; maxLevel: number } : null}
          onSave={() => {
            setShowEditor(false);
            setSelectedItem(null);
            setRefreshKey(prev => prev + 1);
          }}
          onCancel={() => {
            setShowEditor(false);
            setSelectedItem(null);
          }}
        />
      )}

      {showEditor && activeDataType === 'effect' && (
        <EffectBuilder
          token={token}
          effect={selectedItem?.id ? selectedItem as unknown as Parameters<typeof EffectBuilder>[0]['effect'] : null}
          onSave={() => {
            setShowEditor(false);
            setSelectedItem(null);
            setRefreshKey(prev => prev + 1);
          }}
          onCancel={() => {
            setShowEditor(false);
            setSelectedItem(null);
          }}
        />
      )}

      {/* PowerAbilityEditor for all power types */}
      {showEditor && ['commonPower', 'archetypePower', 'perk', 'cybernetic', 'magicSchool', 'magicWave'].includes(activeDataType) && (
        <PowerAbilityEditor
          token={token}
          dataType={activeDataType as 'commonPower' | 'archetypePower' | 'perk' | 'cybernetic' | 'magicSchool' | 'magicWave'}
          power={selectedItem?.id ? selectedItem as unknown as Parameters<typeof PowerAbilityEditor>[0]['power'] : null}
          onSave={() => {
            setShowEditor(false);
            setSelectedItem(null);
            setRefreshKey(prev => prev + 1);
          }}
          onCancel={() => {
            setShowEditor(false);
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
}
