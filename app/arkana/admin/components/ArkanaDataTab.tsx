'use client';

import { useState, useEffect } from 'react';
import type { ArkanaDataType } from '@/lib/arkana/unifiedDataLoader';
import { getProductionFilename } from '@/lib/arkana/exportUtils';
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
  const [isDatabaseEmpty, setIsDatabaseEmpty] = useState<boolean>(false);
  const [checkingDatabase, setCheckingDatabase] = useState<boolean>(true);

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

  // Check if database is empty (for migration button visibility)
  useEffect(() => {
    const checkDatabaseStatus = async () => {
      try {
        setCheckingDatabase(true);

        // Use data-source-info endpoint to check if database has any data
        const response = await fetch('/api/arkana/admin/data-source-info', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            // Check if ALL types are from JSON (database completely empty)
            const allFromJson = result.data.every((item: DataSourceInfo) => item.source === 'json');
            setIsDatabaseEmpty(allFromJson);
          }
        }
      } catch (err) {
        console.error('Error checking database status:', err);
      } finally {
        setCheckingDatabase(false);
      }
    };

    checkDatabaseStatus();
  }, [token, refreshKey]); // Re-check when data refreshes

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

  // Handle JSON-to-Database migration (one-time operation)
  const handleSaveAllToDatabase = async () => {
    // Confirmation dialog
    const confirmed = confirm(
      'Import all JSON data to database?\n\n' +
      'This will create database entries for all static JSON data.\n' +
      'After this, all edits will be automatically saved to the database.\n\n' +
      'This is a one-time migration operation. Continue?'
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      setError(null);

      // All Arkana data types
      const types: ArkanaDataType[] = [
        'flaw', 'commonPower', 'archetypePower', 'perk',
        'magicSchool', 'magicWave', 'cybernetic', 'skill', 'effect'
      ];

      const bulkData: Array<{ id: string; type: string; jsonData: Record<string, unknown> }> = [];

      console.log('Starting JSON to database migration...');

      // Fetch data from JSON files (via unified loader fallback)
      for (const type of types) {
        console.log(`Fetching ${type} data...`);

        const response = await fetch(
          `/api/arkana/admin/arkana-data?type=${type}&limit=10000&token=${token}`,
          { headers: { 'Content-Type': 'application/json' } }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch ${type} data: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success && result.data.items && result.data.items.length > 0) {
          console.log(`Found ${result.data.items.length} ${type} items`);

          // Transform items for bulk save (remove metadata fields only)
          for (const item of result.data.items) {
            // Extract only metadata fields, keep everything else including data's 'type' field
            // IMPORTANT: Extract 'arkanaDataType', NOT 'type' - Skills/Effects have their own 'type' field!
            const { id, createdAt: _createdAt, updatedAt: _updatedAt, _uniqueId, _dbMeta, arkanaDataType: _arkanaDataType, ...jsonData } = item;

            bulkData.push({
              id: String(id),
              type: type, // Use loop variable for arkanaDataType category (always correct)
              jsonData: jsonData as Record<string, unknown> // Preserves all data fields including type
            });
          }
        } else {
          console.log(`No ${type} items found`);
        }
      }

      console.log(`Prepared ${bulkData.length} total items for bulk import`);

      if (bulkData.length === 0) {
        alert('No data found to import. JSON files may be empty.');
        return;
      }

      // Call bulk-save endpoint
      const saveResponse = await fetch('/api/arkana/admin/arkana-data/bulk-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          token: token,
          data: bulkData
        })
      });

      if (!saveResponse.ok) {
        // Try to extract detailed error message from response
        const errorData = await saveResponse.json().catch(() => ({
          error: 'Failed to parse error response'
        }));

        console.error('Bulk save error details:', {
          status: saveResponse.status,
          statusText: saveResponse.statusText,
          errorData
        });

        const errorMessage = errorData.error ||
                           errorData.message ||
                           errorData.details ||
                           `Bulk save failed with status ${saveResponse.status}`;

        throw new Error(errorMessage);
      }

      const saveResult = await saveResponse.json();

      if (saveResult.success) {
        const { created, updated, failed } = saveResult.data;

        console.log('Migration completed:', { created, updated, failed });

        alert(
          `✅ JSON to Database Migration Completed!\n\n` +
          `Created: ${created} new database entries\n` +
          `Updated: ${updated} existing entries\n` +
          `Failed: ${failed} entries\n\n` +
          `All data is now in the database.\n` +
          `Future edits will be automatically saved.`
        );

        // Refresh UI to show database data and hide migration button
        setRefreshKey(prev => prev + 1);
        setIsDatabaseEmpty(false);
      } else {
        throw new Error(saveResult.error || 'Bulk save returned failure status');
      }
    } catch (err) {
      console.error('Migration error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Migration failed: ${errorMsg}`);
      alert(
        `❌ Migration Failed\n\n` +
        `Error: ${errorMsg}\n\n` +
        `Please check the console for details and try again.`
      );
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

      // Trigger download with production filename
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getProductionFilename(activeDataType);  // Use production naming
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

          {/* One-time JSON-to-Database migration button (only shown when database is empty) */}
          {isDatabaseEmpty && !checkingDatabase && (
            <button
              onClick={handleSaveAllToDatabase}
              disabled={loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded font-medium transition-colors whitespace-nowrap"
              title="Import all JSON data into database (one-time operation)"
            >
              {loading ? 'Migrating...' : '💾 Save all JSON static data to the database'}
            </button>
          )}

          {checkingDatabase && (
            <span className="text-sm text-gray-400 px-4 py-2">
              Checking database status...
            </span>
          )}

          {!isDatabaseEmpty && !checkingDatabase && (
            <span className="text-sm text-green-400 px-4 py-2 bg-green-900/20 rounded border border-green-500/30">
              ✓ Data in database - items auto-saved on edit
            </span>
          )}

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
