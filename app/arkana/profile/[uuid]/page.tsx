'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  loadAllData,
  getAllCommonPowers,
  getAllPerks,
  getAllArchPowers,
  getAllCybernetics,
  getSchoolName,
  getWeaveName,
  type CommonPower,
  type Perk,
  type ArchetypePower,
  type Cybernetic
} from '@/lib/arkanaData';

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
  health: number; // Current health
  hunger: number;
  thirst: number;
  goldCoin: number;
  silverCoin: number;
  copperCoin: number;
  lastUpdated: string;
}

interface ArkanaStats {
  characterName: string;
  agentName: string;
  aliasCallsign: string | null;
  faction: string | null;
  conceptRole: string | null;
  job: string | null;
  background: string | null;
  race: string;
  subrace: string | null;
  archetype: string | null;
  physical: number;
  dexterity: number;
  mental: number;
  perception: number;
  hitPoints: number; // Maximum health
  inherentPowers: string[];
  weaknesses: string[];
  flaws: unknown;
  commonPowers: string[];
  archetypePowers: string[];
  perks: string[];
  magicSchools: string[];
  magicWeaves: string[];
  cybernetics: unknown;
  cyberneticAugments: string[];
  credits: number;
  chips: number;
  xp: number;
  arkanaRole: string;
  registrationCompleted: boolean;
  createdAt: string;
  updatedAt: string;
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
  arkanaStats: ArkanaStats;
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

export default function ArkanaProfilePage() {
  const router = useRouter();
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
  const [sessionId] = useState(() => crypto.randomUUID());

  // Arkana data state
  const [dataLoaded, setDataLoaded] = useState(false);
  const [commonPowersData, setCommonPowersData] = useState<CommonPower[]>([]);
  const [perksData, setPerksData] = useState<Perk[]>([]);
  const [archPowersData, setArchPowersData] = useState<ArchetypePower[]>([]);
  const [cyberneticsData, setCyberneticsData] = useState<Cybernetic[]>([]);

  const fetchProfileData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/arkana/profile/data?sl_uuid=${uuid}&universe=${universe}&token=${token}&sessionId=${sessionId}&page=${eventsPage}&limit=${eventsLimit}`);
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

  // Load arkana data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        await loadAllData();
        setCommonPowersData(getAllCommonPowers());
        setPerksData(getAllPerks());
        setArchPowersData(getAllArchPowers());
        setCyberneticsData(getAllCybernetics());
        setDataLoaded(true);
      } catch (err) {
        console.error('Failed to load arkana data:', err);
      }
    };

    loadData();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const capitalize = (str: string | null | undefined) => {
    if (!str || str.length === 0) return str || '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Helper functions to map IDs to user-friendly names
  const getCommonPowerName = (id: string): string => {
    if (!dataLoaded) return id;
    const power = commonPowersData.find(p => p.id === id);
    return power ? power.name : id;
  };

  const getArchPowerName = (id: string): string => {
    if (!dataLoaded) return id;
    const power = archPowersData.find(p => p.id === id);
    return power ? power.name : id;
  };

  const getPerkName = (id: string): string => {
    if (!dataLoaded) return id;
    const perk = perksData.find(p => p.id === id);
    return perk ? perk.name : id;
  };

  const getCyberneticName = (id: string): string => {
    if (!dataLoaded) return id;
    const cyber = cyberneticsData.find(c => c.id === id);
    return cyber ? cyber.name : id;
  };

  // Generic function to get power name (for inherent powers and weaknesses)
  const getPowerName = (id: string): string => {
    if (!dataLoaded) return id;
    // Try finding in common powers first
    let power = commonPowersData.find(p => p.id === id);
    if (power) return power.name;
    // Try archetype powers
    power = archPowersData.find(p => p.id === id);
    if (power) return power.name;
    // Try perks
    const perk = perksData.find(p => p.id === id);
    if (perk) return perk.name;
    // Fallback to ID
    return id;
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 0: return 'Looking for roleplay';
      case 1: return 'Out of character';
      case 2: return 'Away';
      default: return 'Looking for roleplay';
    }
  };

  const getHealthColor = (percentage: number) => {
    if (percentage >= 75) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const calculateStatModifier = (stat: number) => {
    if (stat === 0) return -3;
    if (stat === 1) return -2;
    if (stat === 2) return 0;
    if (stat === 3) return 2;
    if (stat === 4) return 4;
    if (stat === 5) return 6;
    return 0;
  };

  const renderEventDetails = (event: EventData) => {
    try {
      if (typeof event.details === 'object' && event.details !== null) {
        return Object.entries(event.details as Record<string, unknown>).map(([key, value]) => (
          <span key={key} className="text-sm text-cyan-300">
            {key}: {typeof value === 'string' ? value : JSON.stringify(value)}
          </span>
        ));
      }
      return <span className="text-sm text-cyan-300">{String(event.details)}</span>;
    } catch {
      return <span className="text-sm text-cyan-300">Invalid details</span>;
    }
  };

  const navigateToAdmin = () => {
    router.push(`/arkana/admin?token=${token}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto"></div>
          <p className="mt-4 text-cyan-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900 border border-red-500 text-red-300 px-4 py-3 rounded max-w-md">
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-cyan-400">No profile data available</p>
      </div>
    );
  }

  const { user, stats, arkanaStats, inventory, events } = profileData;
  const healthPercentage = stats ? (stats.health / arkanaStats.hitPoints) * 100 : 0;

  return (
    <div className="min-h-screen bg-black text-cyan-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-cyan-400 mb-2 text-center">
            Arkana Character Profile
          </h1>
          <p className="text-cyan-300 text-center">Supernatural Sci-Fi Roleplay</p>
        </div>

        {/* Admin Dashboard Button */}
        {arkanaStats.arkanaRole === 'admin' && (
          <div className="mb-6">
            <button
              onClick={navigateToAdmin}
              className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-bold transition-colors shadow-lg shadow-purple-500/50"
            >
              ⚡ Administrator Dashboard
            </button>
          </div>
        )}

        {/* Top Row - Character Info and Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Character Info Widget */}
          <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6">
            <div className="flex items-start space-x-4">
              <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/50">
                <span className="text-2xl font-bold text-black">
                  {arkanaStats.characterName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-cyan-400 mb-2">{arkanaStats.characterName}</h2>
                <div className="space-y-1 text-sm text-cyan-300">
                  <p><span className="font-medium text-cyan-400">Agent:</span> {arkanaStats.agentName}</p>
                  {arkanaStats.aliasCallsign && <p><span className="font-medium text-cyan-400">Alias:</span> {arkanaStats.aliasCallsign}</p>}
                  {arkanaStats.faction && <p><span className="font-medium text-cyan-400">Faction:</span> {arkanaStats.faction}</p>}
                  {arkanaStats.conceptRole && <p><span className="font-medium text-cyan-400">Concept:</span> {arkanaStats.conceptRole}</p>}
                  {arkanaStats.job && <p><span className="font-medium text-cyan-400">Job:</span> {arkanaStats.job}</p>}
                  <p><span className="font-medium text-cyan-400">UUID:</span> {user.slUuid}</p>
                  <p><span className="font-medium text-cyan-400">Joined:</span> {formatDate(user.createdAt)}</p>
                  <p><span className="font-medium text-cyan-400">Last Active:</span> {formatDate(user.lastActive)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Widget */}
          <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6">
            <h3 className="text-xl font-bold text-cyan-400 mb-4">Character Stats</h3>
            {stats ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-cyan-300 mb-2">Status: {getStatusText(stats.status)}</p>
                </div>

                {/* Health Bar */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-cyan-300 font-medium">Health</span>
                    <span className="text-cyan-100">{stats.health} / {arkanaStats.hitPoints} HP</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full ${getHealthColor(healthPercentage)} shadow-lg transition-all duration-300`}
                      style={{width: `${Math.max(0, Math.min(100, healthPercentage))}%`}}
                    ></div>
                  </div>
                  <p className="text-xs text-cyan-300 mt-1">{healthPercentage.toFixed(1)}%</p>
                </div>

                {/* Core Stats */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-cyan-700">
                  <div className="bg-gray-800 p-2 rounded">
                    <p className="text-xs text-cyan-400">Physical</p>
                    <p className="text-lg font-bold text-cyan-300">{arkanaStats.physical} <span className="text-sm text-gray-400">(+{calculateStatModifier(arkanaStats.physical)})</span></p>
                  </div>
                  <div className="bg-gray-800 p-2 rounded">
                    <p className="text-xs text-cyan-400">Dexterity</p>
                    <p className="text-lg font-bold text-cyan-300">{arkanaStats.dexterity} <span className="text-sm text-gray-400">(+{calculateStatModifier(arkanaStats.dexterity)})</span></p>
                  </div>
                  <div className="bg-gray-800 p-2 rounded">
                    <p className="text-xs text-cyan-400">Mental</p>
                    <p className="text-lg font-bold text-cyan-300">{arkanaStats.mental} <span className="text-sm text-gray-400">(+{calculateStatModifier(arkanaStats.mental)})</span></p>
                  </div>
                  <div className="bg-gray-800 p-2 rounded">
                    <p className="text-xs text-cyan-400">Perception</p>
                    <p className="text-lg font-bold text-cyan-300">{arkanaStats.perception} <span className="text-sm text-gray-400">(+{calculateStatModifier(arkanaStats.perception)})</span></p>
                  </div>
                </div>

                {/* Currency */}
                <div className="pt-3 border-t border-cyan-700">
                  <p className="text-sm font-medium text-cyan-400 mb-2">Currency:</p>
                  <div className="flex space-x-4">
                    <div>
                      <p className="text-xs text-cyan-300">Credits</p>
                      <p className="text-lg font-bold text-green-400">{arkanaStats.credits}</p>
                    </div>
                    <div>
                      <p className="text-xs text-cyan-300">Chips</p>
                      <p className="text-lg font-bold text-yellow-400">{arkanaStats.chips}</p>
                    </div>
                    <div>
                      <p className="text-xs text-cyan-300">XP</p>
                      <p className="text-lg font-bold text-purple-400">{arkanaStats.xp}</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-cyan-300">Last updated: {formatDate(stats.lastUpdated)}</p>
              </div>
            ) : (
              <p className="text-cyan-300">No stats available</p>
            )}
          </div>
        </div>

        {/* Lineage Row */}
        <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6 mb-8">
          <h3 className="text-xl font-bold text-cyan-400 mb-4">Lineage & Path</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-cyan-400 font-medium">Race</p>
              <p className="text-lg text-cyan-100">{capitalize(arkanaStats.race)}</p>
            </div>
            {arkanaStats.subrace && (
              <div>
                <p className="text-sm text-cyan-400 font-medium">Subrace</p>
                <p className="text-lg text-cyan-100">{capitalize(arkanaStats.subrace)}</p>
              </div>
            )}
            {arkanaStats.archetype && (
              <div>
                <p className="text-sm text-cyan-400 font-medium">Archetype</p>
                <p className="text-lg text-cyan-100">{capitalize(arkanaStats.archetype)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Powers & Abilities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Common Powers & Perks */}
          {(arkanaStats.commonPowers.length > 0 || arkanaStats.perks.length > 0 || arkanaStats.archetypePowers.length > 0 || arkanaStats.inherentPowers.length > 0) && (
            <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6">
              <h3 className="text-xl font-bold text-cyan-400 mb-4">Powers & Perks</h3>
              {arkanaStats.inherentPowers.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-cyan-400 font-medium mb-2">Inherent Powers:</p>
                  <div className="flex flex-wrap gap-2">
                    {arkanaStats.inherentPowers.map((powerId, idx) => (
                      <span key={idx} className="px-2 py-1 bg-blue-900 text-blue-300 rounded text-xs">{getPowerName(powerId)}</span>
                    ))}
                  </div>
                </div>
              )}
              {arkanaStats.commonPowers.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-cyan-400 font-medium mb-2">Common Powers:</p>
                  <div className="flex flex-wrap gap-2">
                    {arkanaStats.commonPowers.map((powerId, idx) => (
                      <span key={idx} className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-xs">{getCommonPowerName(powerId)}</span>
                    ))}
                  </div>
                </div>
              )}
              {arkanaStats.archetypePowers.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-cyan-400 font-medium mb-2">Archetype Powers:</p>
                  <div className="flex flex-wrap gap-2">
                    {arkanaStats.archetypePowers.map((powerId, idx) => (
                      <span key={idx} className="px-2 py-1 bg-purple-900 text-purple-300 rounded text-xs">{getArchPowerName(powerId)}</span>
                    ))}
                  </div>
                </div>
              )}
              {arkanaStats.perks.length > 0 && (
                <div>
                  <p className="text-sm text-cyan-400 font-medium mb-2">Perks:</p>
                  <div className="flex flex-wrap gap-2">
                    {arkanaStats.perks.map((perkId, idx) => (
                      <span key={idx} className="px-2 py-1 bg-green-900 text-green-300 rounded text-xs">{getPerkName(perkId)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Flaws & Weaknesses */}
          {((arkanaStats.flaws && (Array.isArray(arkanaStats.flaws) ? arkanaStats.flaws.length > 0 : true)) || arkanaStats.weaknesses.length > 0) && (
            <div className="bg-gray-900 border border-red-500 rounded-lg shadow-lg shadow-red-500/20 p-6">
              <h3 className="text-xl font-bold text-red-400 mb-4">Flaws & Weaknesses</h3>
              {arkanaStats.flaws !== null && arkanaStats.flaws !== undefined && (
                <div className="mb-4">
                  <p className="text-sm text-red-400 font-medium mb-2">Flaws:</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(arkanaStats.flaws) ? (
                      arkanaStats.flaws.length > 0 ? arkanaStats.flaws.map((flaw: unknown, idx: number) => (
                        <span key={idx} className="px-2 py-1 bg-red-900 text-red-300 rounded text-xs">
                          {typeof flaw === 'object' && flaw !== null && 'name' in flaw ? (flaw as { name: string }).name : String(flaw)}
                        </span>
                      )) : null
                    ) : (
                      <span className="text-red-300 text-sm">{JSON.stringify(arkanaStats.flaws)}</span>
                    )}
                  </div>
                </div>
              )}
              {arkanaStats.weaknesses.length > 0 && (
                <div>
                  <p className="text-sm text-red-400 font-medium mb-2">Weaknesses:</p>
                  <div className="flex flex-wrap gap-2">
                    {arkanaStats.weaknesses.map((weaknessId, idx) => (
                      <span key={idx} className="px-2 py-1 bg-orange-900 text-orange-300 rounded text-xs">{getPowerName(weaknessId)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Magic & Cybernetics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Magic Schools */}
          {arkanaStats.magicSchools.length > 0 && (
            <div className="bg-gray-900 border border-purple-500 rounded-lg shadow-lg shadow-purple-500/20 p-6">
              <h3 className="text-xl font-bold text-purple-400 mb-4">Magic Schools</h3>
              <div className="flex flex-wrap gap-2">
                {arkanaStats.magicSchools.map((schoolId, idx) => (
                  <span key={idx} className="px-3 py-1 bg-purple-900 text-purple-300 rounded">{getSchoolName(schoolId)}</span>
                ))}
              </div>
            </div>
          )}

          {/* Magic Weaves */}
          {arkanaStats.magicWeaves.length > 0 && (
            <div className="bg-gray-900 border border-purple-500 rounded-lg shadow-lg shadow-purple-500/20 p-6">
              <h3 className="text-xl font-bold text-purple-400 mb-4">Magic Weaves</h3>
              <div className="flex flex-wrap gap-2">
                {arkanaStats.magicWeaves.map((weaveId, idx) => (
                  <span key={idx} className="px-3 py-1 bg-purple-900 text-purple-300 rounded text-sm">{getWeaveName(weaveId)}</span>
                ))}
              </div>
            </div>
          )}

          {/* Cybernetics */}
          {(arkanaStats.cybernetics || arkanaStats.cyberneticAugments.length > 0) && (
            <div className="bg-gray-900 border border-orange-500 rounded-lg shadow-lg shadow-orange-500/20 p-6">
              <h3 className="text-xl font-bold text-orange-400 mb-4">Cybernetics</h3>
              <div className="flex flex-wrap gap-2">
                {arkanaStats.cyberneticAugments.map((cyberId, idx) => (
                  <span key={idx} className="px-3 py-1 bg-orange-900 text-orange-300 rounded text-sm">{getCyberneticName(cyberId)}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Background */}
        {arkanaStats.background && (
          <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6 mb-8">
            <h3 className="text-xl font-bold text-cyan-400 mb-4">Background</h3>
            <p className="text-cyan-100 whitespace-pre-wrap">{arkanaStats.background}</p>
          </div>
        )}

        {/* Events Widget */}
        <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-cyan-400">Recent Events</h3>
            <div className="flex items-center space-x-2">
              <select
                value={eventsLimit}
                onChange={(e) => {
                  setEventsLimit(parseInt(e.target.value));
                  setEventsPage(1);
                }}
                className="bg-gray-800 border border-cyan-500 text-cyan-300 rounded px-2 py-1 text-sm"
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
                <table className="min-w-full divide-y divide-cyan-700">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-cyan-400 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-cyan-400 uppercase tracking-wider">Details</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-cyan-400 uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-900 divide-y divide-cyan-800">
                    {events.data.map((event) => (
                      <tr key={event.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-cyan-900 text-cyan-300">
                            {event.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-cyan-100">
                            {renderEventDetails(event)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-cyan-300">
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
                  <div className="text-sm text-cyan-300">
                    Page {events.pagination.currentPage} of {events.pagination.totalPages}
                    ({events.pagination.totalEvents} total events)
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setEventsPage(eventsPage - 1)}
                      disabled={!events.pagination.hasPrevPage}
                      className="px-3 py-2 border border-cyan-500 rounded-md text-sm font-medium text-cyan-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setEventsPage(eventsPage + 1)}
                      disabled={!events.pagination.hasNextPage}
                      className="px-3 py-2 border border-cyan-500 rounded-md text-sm font-medium text-cyan-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-cyan-300">No events recorded</p>
          )}
        </div>

        {/* Inventory Summary */}
        <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6 mb-8">
          <h3 className="text-xl font-bold text-cyan-400 mb-4">Inventory Summary</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center p-4 bg-gray-800 rounded">
              <p className="text-3xl font-bold text-cyan-400">{inventory.summary.totalItems}</p>
              <p className="text-sm text-cyan-300">Total Items</p>
            </div>
            <div className="text-center p-4 bg-gray-800 rounded">
              <p className="text-3xl font-bold text-green-400">{inventory.summary.totalValue}c</p>
              <p className="text-sm text-cyan-300">Total Value</p>
            </div>
          </div>

          {inventory.items.length > 0 && (
            <div>
              <h4 className="font-medium text-cyan-400 mb-2">Recent Items:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {inventory.items.map((item, index) => (
                  <div key={index} className="border border-cyan-700 bg-gray-800 rounded p-2">
                    <p className="font-medium text-sm text-cyan-300">{item.name}</p>
                    <p className="text-xs text-cyan-400">Qty: {item.quantity} | {item.category}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="text-center text-cyan-400 text-sm mt-8">
          <p>Arkana RP Server - Character Profile System</p>
          <p className="text-cyan-500">This link is secure and expires in 60 minutes.</p>
        </footer>
      </div>
    </div>
  );
}
