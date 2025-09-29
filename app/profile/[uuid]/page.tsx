'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface User {
  id: string;
  slUuid: string;
  username: string;
  role: string;
  createdAt: string;
  lastActive: string;
}

interface Stats {
  status: number;
  health: number;
  hunger: number;
  thirst: number;
  goldCoin: number;
  silverCoin: number;
  copperCoin: number;
  lastUpdated: string;
}

interface EventData {
  id: string;
  type: string;
  details: unknown;
  timestamp: string;
}

interface ProfileData {
  user: User;
  stats: Stats | null;
  inventory: {
    summary: {
      totalItems: number;
      totalValue: number;
    };
    items: Array<{
      name: string;
      shortName: string;
      quantity: number;
      category: string;
      priceGold: number;
      priceSilver: number;
      priceCopper: number;
    }>;
  };
  events: {
    data: EventData[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalEvents: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };
}

export default function ProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const uuid = params?.uuid as string;
  const token = searchParams?.get('token');
  const universe = searchParams?.get('universe');

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsLimit, setEventsLimit] = useState(20);
  const [sessionId] = useState(() => crypto.randomUUID()); // Generate unique session ID

  const fetchProfileData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/profile/data?sl_uuid=${uuid}&universe=${universe}&token=${token}&sessionId=${sessionId}&page=${eventsPage}&limit=${eventsLimit}`);
      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Failed to load profile data');
        return;
      }

      setProfileData(result.data);
      setError(null);
    } catch {
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, [uuid, universe, token, sessionId, eventsPage, eventsLimit]);

  useEffect(() => {
    if (!uuid || !token || !universe) {
      setError('Missing required parameters');
      setLoading(false);
      return;
    }

    fetchProfileData();
  }, [uuid, universe, token, eventsPage, eventsLimit, fetchProfileData]);

  const formatCurrency = (gold: number, silver: number, copper: number) => {
    const parts = [];
    if (gold > 0) parts.push(`${gold}g`);
    if (silver > 0) parts.push(`${silver}s`);
    if (copper > 0) parts.push(`${copper}c`);
    return parts.join(' ') || '0c';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 0: return 'Healthy';
      case 1: return 'Injured';
      case 2: return 'Unconscious';
      case 3: return 'Dead';
      default: return 'Unknown';
    }
  };

  const getStatColor = (value: number) => {
    if (value >= 75) return 'bg-green-500';
    if (value >= 50) return 'bg-yellow-500';
    if (value >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const renderEventDetails = (event: EventData) => {
    try {
      if (typeof event.details === 'object' && event.details !== null) {
        return Object.entries(event.details).map(([key, value]) => (
          <span key={key} className="text-sm text-gray-600">
            {key}: {typeof value === 'string' ? value : JSON.stringify(value)}
          </span>
        ));
      }
      return <span className="text-sm text-gray-600">{String(event.details)}</span>;
    } catch {
      return <span className="text-sm text-gray-600">Invalid details</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
            <h2 className="font-bold mb-2">Error</h2>
            <p>{error}</p>
            <p className="text-sm mt-2">Please request a new profile link from your HUD.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">No profile data available</p>
      </div>
    );
  }

  const { user, stats, inventory, events } = profileData;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">
          Player Profile
        </h1>

        {/* Top Row - User Info and Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* User Info Widget */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-start space-x-4">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-white">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">{user.username}</h2>
                <div className="space-y-1 text-sm text-gray-600">
                  <p><span className="font-medium">Role:</span> <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">{user.role}</span></p>
                  <p><span className="font-medium">UUID:</span> {user.slUuid}</p>
                  <p><span className="font-medium">Joined:</span> {formatDate(user.createdAt)}</p>
                  <p><span className="font-medium">Last Active:</span> {formatDate(user.lastActive)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Widget */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Player Stats</h3>
            {stats ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Status: {getStatusText(stats.status)}</p>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm">
                      <span>Health</span>
                      <span>{stats.health}/100</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${getStatColor(stats.health)}`} style={{width: `${stats.health}%`}}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm">
                      <span>Hunger</span>
                      <span>{stats.hunger}/100</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${getStatColor(stats.hunger)}`} style={{width: `${stats.hunger}%`}}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm">
                      <span>Thirst</span>
                      <span>{stats.thirst}/100</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${getStatColor(stats.thirst)}`} style={{width: `${stats.thirst}%`}}></div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-gray-600 mb-2">Currency:</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatCurrency(stats.goldCoin, stats.silverCoin, stats.copperCoin)}
                  </p>
                </div>

                <p className="text-xs text-gray-500">Last updated: {formatDate(stats.lastUpdated)}</p>
              </div>
            ) : (
              <p className="text-gray-500">No stats available</p>
            )}
          </div>
        </div>

        {/* Events Widget */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800">Recent Events</h3>
            <div className="flex items-center space-x-2">
              <select
                value={eventsLimit}
                onChange={(e) => {
                  setEventsLimit(parseInt(e.target.value));
                  setEventsPage(1);
                }}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value={10}>10 events</option>
                <option value={20}>20 events</option>
                <option value={50}>50 events</option>
              </select>
            </div>
          </div>

          {events.data.length > 0 ? (
            <div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {events.data.map((event) => (
                      <tr key={event.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            {event.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {renderEventDetails(event)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(event.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {events.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-700">
                    Page {events.pagination.currentPage} of {events.pagination.totalPages} 
                    ({events.pagination.totalEvents} total events)
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setEventsPage(eventsPage - 1)}
                      disabled={!events.pagination.hasPrevPage}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setEventsPage(eventsPage + 1)}
                      disabled={!events.pagination.hasNextPage}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500">No events recorded</p>
          )}
        </div>

        {/* Inventory Summary */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Inventory Summary</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{inventory.summary.totalItems}</p>
              <p className="text-sm text-gray-600">Total Items</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{inventory.summary.totalValue}c</p>
              <p className="text-sm text-gray-600">Total Value (in copper)</p>
            </div>
          </div>
          
          {inventory.items.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Recent Items (showing first 10):</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {inventory.items.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded p-2">
                    <p className="font-medium text-sm">{item.name}</p>
                    <p className="text-xs text-gray-600">Qty: {item.quantity} | {item.category}</p>
                    <p className="text-xs text-green-600">
                      {formatCurrency(item.priceGold, item.priceSilver, item.priceCopper)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="text-center text-gray-500 text-sm mt-8">
          <p>Gorean RP Server - Player Profile System</p>
          <p>This link is secure and expires in 60 minutes.</p>
        </footer>
      </div>
    </div>
  );
}