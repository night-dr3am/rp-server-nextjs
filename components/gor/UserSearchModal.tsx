import React, { useState, useEffect, useCallback } from 'react';
import { GoreanButton, GoreanColors, GoreanFonts } from './GoreanTheme';

export interface SearchUser {
  goreanId: number;
  characterName: string;
  slUuid: string;
  species: string;
  status: string;
  casteOrRole: string;
  lastActive: string;
}

interface UserSearchModalProps {
  isOpen: boolean;
  groupName: string;
  onClose: () => void;
  onAdd: (goreanId: number) => Promise<void>;
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
    setAddingId(user.goreanId);
    try {
      await onAdd(user.goreanId);
      // Remove from search results after successful add
      setSearchResults(prev => prev.filter(u => u.goreanId !== user.goreanId));
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

  // Format status for display
  const formatStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      'freeMan': 'Free Man',
      'freeWoman': 'Free Woman',
      'kajira': 'Kajira',
      'kajirus': 'Kajirus',
      'outlaw': 'Outlaw',
      'captive': 'Captive'
    };
    return statusMap[status] || status;
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
      <div
        className="relative rounded-lg shadow-2xl p-6 max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col"
        style={{
          backgroundColor: GoreanColors.parchment,
          border: `3px solid ${GoreanColors.leather}`,
          fontFamily: GoreanFonts.body
        }}
      >
        {/* Header */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <h3
              className="text-xl font-bold"
              style={{
                color: GoreanColors.bronze,
                fontFamily: GoreanFonts.heading
              }}
            >
              Add Member to {groupName}
            </h3>
            <button
              onClick={onClose}
              className="transition-colors hover:opacity-70"
              style={{ color: GoreanColors.charcoal }}
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
              placeholder="Search by character name, UUID, or species..."
              className="w-full px-4 py-2 rounded-md focus:outline-none focus:ring-2"
              style={{
                backgroundColor: GoreanColors.parchmentDark,
                border: `2px solid ${GoreanColors.leather}`,
                color: GoreanColors.charcoal
              }}
            />
            {isSearching && (
              <div className="absolute right-3 top-3">
                <div
                  className="animate-spin rounded-full h-5 w-5 border-b-2"
                  style={{ borderColor: GoreanColors.bronze }}
                ></div>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="mb-4 px-4 py-2 rounded"
            style={{
              backgroundColor: '#FEE',
              border: `2px solid ${GoreanColors.bloodRed}`,
              color: GoreanColors.bloodRed
            }}
          >
            {error}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto mb-4">
          {searchResults.length === 0 ? (
            <div
              className="text-center py-8"
              style={{ color: GoreanColors.stone }}
            >
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
                  key={user.goreanId}
                  className="flex items-center justify-between rounded-lg p-4 transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: GoreanColors.parchmentDark,
                    border: `2px solid ${GoreanColors.stone}`
                  }}
                >
                  {/* User Info */}
                  <div className="flex-1">
                    <p
                      className="font-medium"
                      style={{ color: GoreanColors.charcoal }}
                    >
                      {user.characterName}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs mt-1">
                      <span
                        className="px-2 py-1 rounded"
                        style={{
                          backgroundColor: GoreanColors.forestGreen,
                          color: 'white'
                        }}
                      >
                        {user.species}
                      </span>
                      {user.status && (
                        <span
                          className="px-2 py-1 rounded"
                          style={{
                            backgroundColor: GoreanColors.leather,
                            color: 'white'
                          }}
                        >
                          {formatStatus(user.status)}
                        </span>
                      )}
                      {user.casteOrRole && (
                        <span
                          className="px-2 py-1 rounded"
                          style={{
                            backgroundColor: GoreanColors.bronze,
                            color: GoreanColors.charcoal
                          }}
                        >
                          {user.casteOrRole}
                        </span>
                      )}
                      <span style={{ color: GoreanColors.stone }}>
                        ID: {user.goreanId}
                      </span>
                      <span style={{ color: GoreanColors.stone }}>
                        Last active: {formatDate(user.lastActive)}
                      </span>
                    </div>
                    <p
                      className="text-xs mt-1"
                      style={{ color: GoreanColors.stone }}
                    >
                      {user.slUuid}
                    </p>
                  </div>

                  {/* Add Button */}
                  <GoreanButton
                    variant="primary"
                    size="sm"
                    onClick={() => handleAdd(user)}
                    disabled={addingId === user.goreanId}
                    className="ml-4"
                  >
                    {addingId === user.goreanId ? 'Adding...' : 'Add'}
                  </GoreanButton>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between pt-3"
            style={{ borderTop: `2px solid ${GoreanColors.leather}` }}
          >
            <div
              className="text-sm"
              style={{ color: GoreanColors.stone }}
            >
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex space-x-2">
              <GoreanButton
                variant="secondary"
                size="sm"
                onClick={handlePrevPage}
                disabled={currentPage === 1 || isSearching}
              >
                Previous
              </GoreanButton>
              <GoreanButton
                variant="secondary"
                size="sm"
                onClick={handleNextPage}
                disabled={!hasMore || isSearching}
              >
                Next
              </GoreanButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
