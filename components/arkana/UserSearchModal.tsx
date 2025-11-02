import React, { useState, useEffect, useCallback } from 'react';

export interface SearchUser {
  arkanaId: number;
  characterName: string;
  slUuid: string;
  race: string;
  archetype: string;
  lastActive: string;
}

interface UserSearchModalProps {
  isOpen: boolean;
  groupName: string;
  onClose: () => void;
  onAdd: (arkanaId: number) => Promise<void>;
  onSearch: (searchTerm: string, page: number) => Promise<{
    users: SearchUser[];
    pagination: {
      page: number;
      totalPages: number;
      totalCount: number;
      hasMore: boolean;
    };
  }>;
}

export default function UserSearchModal({
  isOpen,
  groupName,
  onClose,
  onAdd,
  onSearch
}: UserSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const performSearch = useCallback(async (term: string, page: number) => {
    setIsSearching(true);
    setError(null);
    try {
      const result = await onSearch(term, page);
      setSearchResults(result.users);
      setCurrentPage(result.pagination.page);
      setTotalPages(result.pagination.totalPages);
      setHasMore(result.pagination.hasMore);
    } catch (err) {
      setError('Failed to search users. Please try again.');
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [onSearch]);

  // Initial search when modal opens
  useEffect(() => {
    if (isOpen) {
      performSearch('', 1);
    }
  }, [isOpen, performSearch]);

  // Search on term change (debounced)
  useEffect(() => {
    if (!isOpen) return;

    const debounce = setTimeout(() => {
      performSearch(searchTerm, 1);
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchTerm, isOpen, performSearch]);

  const handleAdd = async (user: SearchUser) => {
    setAddingId(user.arkanaId);
    try {
      await onAdd(user.arkanaId);
      // Remove from search results after successful add
      setSearchResults(prev => prev.filter(u => u.arkanaId !== user.arkanaId));
    } catch (error) {
      console.error('Failed to add member:', error);
    } finally {
      setAddingId(null);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      performSearch(searchTerm, currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      performSearch(searchTerm, currentPage + 1);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-75"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="relative bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/30 p-6 max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xl font-bold text-cyan-400">
              Add Member to {groupName}
            </h3>
            <button
              onClick={onClose}
              className="text-cyan-300 hover:text-cyan-100 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by character name, UUID, or race..."
              className="w-full px-4 py-2 bg-gray-800 border border-cyan-500 rounded-md text-cyan-100 placeholder-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            {isSearching && (
              <div className="absolute right-3 top-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-400"></div>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 bg-red-900 border border-red-500 text-red-300 px-4 py-2 rounded">
            {error}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto mb-4">
          {searchResults.length === 0 ? (
            <div className="text-center py-8 text-cyan-300">
              {isSearching ? (
                <p>Searching...</p>
              ) : (
                <p>No users found matching your search.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map((user) => (
                <div
                  key={user.arkanaId}
                  className="flex items-center justify-between bg-gray-800 border border-cyan-600 rounded-lg p-4 hover:bg-gray-750 transition-colors"
                >
                  {/* User Info */}
                  <div className="flex-1">
                    <p className="font-medium text-cyan-300">{user.characterName}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-cyan-400 mt-1">
                      <span className="px-2 py-1 bg-purple-900 text-purple-300 rounded">{user.race}</span>
                      {user.archetype && (
                        <span className="px-2 py-1 bg-blue-900 text-blue-300 rounded">{user.archetype}</span>
                      )}
                      <span>ID: {user.arkanaId}</span>
                      <span>Last active: {formatDate(user.lastActive)}</span>
                    </div>
                    <p className="text-xs text-cyan-500 mt-1">{user.slUuid}</p>
                  </div>

                  {/* Add Button */}
                  <button
                    onClick={() => handleAdd(user)}
                    disabled={addingId === user.arkanaId}
                    className="ml-4 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-cyan-500/30"
                  >
                    {addingId === user.arkanaId ? 'Adding...' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-cyan-700">
            <div className="text-sm text-cyan-300">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1 || isSearching}
                className="px-3 py-2 border border-cyan-500 rounded-md text-sm font-medium text-cyan-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={handleNextPage}
                disabled={!hasMore || isSearching}
                className="px-3 py-2 border border-cyan-500 rounded-md text-sm font-medium text-cyan-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
