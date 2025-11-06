'use client';

import { useState, useEffect } from 'react';
import type { ArkanaDataType } from '@/lib/arkana/unifiedDataLoader';

// Generic item interface
interface ArkanaDataItem {
  id: string;
  type: ArkanaDataType;
  name?: string;
  cost?: number;
  tags?: string[];
  species?: string[];
  arch?: string[];
  createdAt?: string;
  updatedAt?: string;
  _uniqueId?: string; // Composite key for React rendering (type:id)
  [key: string]: unknown;
}

interface ArkanaDataGridProps {
  token: string;
  dataType: ArkanaDataType;
  searchTerm: string;
  onEdit?: (item: ArkanaDataItem) => void;
  onRefresh?: () => void;
}

type SortField = 'id' | 'name' | 'cost' | 'updatedAt';
type SortOrder = 'asc' | 'desc';

export default function ArkanaDataGrid({
  token,
  dataType,
  searchTerm,
  onEdit,
  onRefresh
}: ArkanaDataGridProps) {
  const [items, setItems] = useState<ArkanaDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [deleting, setDeleting] = useState<string | null>(null);

  const itemsPerPage = 50;

  // Fetch items from API
  const fetchItems = async (page: number = 1) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        type: dataType,
        page: page.toString(),
        limit: itemsPerPage.toString(),
        sortBy: sortField,
        sortOrder: sortOrder,
        token: token
      });

      if (searchTerm) {
        params.append('search', searchTerm);
      }

      const response = await fetch(`/api/arkana/admin/arkana-data?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch items');
      }

      const result = await response.json();
      if (result.success) {
        setItems(result.data.items || []);
        setTotalItems(result.data.total || 0);
        setTotalPages(Math.ceil((result.data.total || 0) / itemsPerPage));
        setCurrentPage(page);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Error fetching items:', err);
      setError(err instanceof Error ? err.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  // Load items when dataType, searchTerm, or sort changes
  useEffect(() => {
    fetchItems(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataType, searchTerm, sortField, sortOrder]);

  // Handle sort change
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Handle delete
  const handleDelete = async (item: ArkanaDataItem) => {
    if (!confirm(`Delete "${item.name || item.id}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeleting(item.id);
      const response = await fetch(`/api/arkana/admin/arkana-data/${item.id}?token=${token}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete item');
      }

      const result = await response.json();
      if (result.success) {
        // Refresh grid
        await fetchItems(currentPage);
        if (onRefresh) onRefresh();
        alert('Item deleted successfully!');
      } else {
        throw new Error(result.error || 'Delete failed');
      }
    } catch (err) {
      console.error('Error deleting item:', err);
      alert(`Failed to delete item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeleting(null);
    }
  };

  // Handle duplicate
  const handleDuplicate = async (item: ArkanaDataItem) => {
    const newId = prompt('Enter ID for duplicated item:', `${item.id}_copy`);
    if (!newId) return;

    try {
      setLoading(true);

      // Remove id, createdAt, updatedAt from item data
      const { id, type, createdAt, updatedAt, ...jsonData } = item;

      const response = await fetch('/api/arkana/admin/arkana-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          id: newId,
          type: dataType,
          jsonData
        })
      });

      if (!response.ok) {
        throw new Error('Failed to duplicate item');
      }

      const result = await response.json();
      if (result.success) {
        await fetchItems(currentPage);
        if (onRefresh) onRefresh();
        alert('Item duplicated successfully!');
      } else {
        throw new Error(result.error || 'Duplicate failed');
      }
    } catch (err) {
      console.error('Error duplicating item:', err);
      alert(`Failed to duplicate item: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Get sort indicator
  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Get contextual field value
  const getContextualField = (item: ArkanaDataItem): string => {
    if (item.tags && Array.isArray(item.tags)) {
      return item.tags.slice(0, 3).join(', ');
    }
    if (item.species && Array.isArray(item.species)) {
      return item.species.slice(0, 3).join(', ');
    }
    if (item.arch && Array.isArray(item.arch)) {
      return item.arch.slice(0, 3).join(', ');
    }
    return '-';
  };

  // Get contextual field label
  const getContextualLabel = (): string => {
    if (dataType === 'flaw') return 'Tags';
    if (dataType === 'commonPower' || dataType === 'perk') return 'Species';
    if (dataType === 'archetypePower') return 'Archetypes';
    if (dataType === 'magicSchool' || dataType === 'magicWave') return 'Type';
    return 'Info';
  };

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
        <h3 className="text-red-400 font-bold mb-2">Error Loading Data</h3>
        <p className="text-red-300">{error}</p>
        <button
          onClick={() => fetchItems(1)}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with item count and add button */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Showing {items.length} of {totalItems} items
        </div>
        <button
          onClick={() => onEdit && onEdit({ id: '', type: dataType } as ArkanaDataItem)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded font-medium"
        >
          ➕ Add New
        </button>
      </div>

      {/* Data table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-800 border-b-2 border-cyan-500">
              <th
                onClick={() => handleSort('id')}
                className="px-4 py-3 text-left text-cyan-300 font-medium cursor-pointer hover:bg-gray-700"
              >
                ID {getSortIndicator('id')}
              </th>
              <th
                onClick={() => handleSort('name')}
                className="px-4 py-3 text-left text-cyan-300 font-medium cursor-pointer hover:bg-gray-700"
              >
                Name {getSortIndicator('name')}
              </th>
              <th
                onClick={() => handleSort('cost')}
                className="px-4 py-3 text-left text-cyan-300 font-medium cursor-pointer hover:bg-gray-700"
              >
                Cost {getSortIndicator('cost')}
              </th>
              <th className="px-4 py-3 text-left text-cyan-300 font-medium">
                {getContextualLabel()}
              </th>
              <th
                onClick={() => handleSort('updatedAt')}
                className="px-4 py-3 text-left text-cyan-300 font-medium cursor-pointer hover:bg-gray-700"
              >
                Updated {getSortIndicator('updatedAt')}
              </th>
              <th className="px-4 py-3 text-center text-cyan-300 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-2"></div>
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No items found. {searchTerm && `Try a different search term.`}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item._uniqueId || `${item.type}:${item.id}` || item.id}
                  className="border-b border-gray-700 hover:bg-gray-800 transition-colors"
                >
                  <td className="px-4 py-3 text-cyan-100 font-mono text-sm">
                    {item.id}
                  </td>
                  <td className="px-4 py-3 text-cyan-200">
                    {item.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-cyan-300">
                    {item.cost !== undefined ? item.cost : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {getContextualField(item)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {formatDate(item.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => onEdit && onEdit(item)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                        title="Edit"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDuplicate(item)}
                        disabled={loading}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded disabled:opacity-50"
                        title="Duplicate"
                      >
                        📋 Copy
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deleting === item.id}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded disabled:opacity-50"
                        title="Delete"
                      >
                        {deleting === item.id ? '...' : '🗑️ Del'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-400">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchItems(1)}
              disabled={currentPage === 1 || loading}
              className="px-3 py-2 border border-cyan-500 rounded text-sm text-cyan-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              « First
            </button>
            <button
              onClick={() => fetchItems(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="px-3 py-2 border border-cyan-500 rounded text-sm text-cyan-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ‹ Previous
            </button>
            <button
              onClick={() => fetchItems(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className="px-3 py-2 border border-cyan-500 rounded text-sm text-cyan-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next ›
            </button>
            <button
              onClick={() => fetchItems(totalPages)}
              disabled={currentPage === totalPages || loading}
              className="px-3 py-2 border border-cyan-500 rounded text-sm text-cyan-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Last »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
