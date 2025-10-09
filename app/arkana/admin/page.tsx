'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  type Flaw,
  type CommonPower,
  type Perk,
  type ArchetypePower,
  type Cybernetic,
  type MagicSchool,
  loadAllData,
  flawsForRace,
  perksForRace,
  commonPowersForRace,
  archPowersForRaceArch,
  cyberneticsAll,
  canUseMagic,
  magicSchoolsAllGrouped,
  groupCyberneticsBySection,
  getAllFlaws
} from '@/lib/arkanaData';

interface User {
  id: string;
  slUuid: string;
  username: string;
  role: string;
  characterName: string;
  agentName: string;
  race: string;
  archetype: string;
  currentHealth: number;
  maxHealth: number;
  status: number;
  physical: number;
  dexterity: number;
  mental: number;
  perception: number;
  credits: number;
  chips: number;
  xp: number;
  arkanaRole: string;
  registrationCompleted: boolean;
  createdAt: string;
  lastActive: string;
}

interface EditDataForm {
  characterName: string;
  agentName: string;
  aliasCallsign: string;
  faction: string;
  conceptRole: string;
  job: string;
  background: string;
  race: string;
  subrace: string;
  archetype: string;
  physical: number;
  dexterity: number;
  mental: number;
  perception: number;
  hitPoints: number;
  health: number;
  status: number;
  flaws: Set<string>;
  commonPowers: Set<string>;
  archetypePowers: Set<string>;
  perks: Set<string>;
  magicSchools: Set<string>;
  magicWeaves: Set<string>;
  cyberneticAugments: Set<string>;
  credits: number;
  chips: number;
  xp: number;
  arkanaRole: string;
}

interface ArkanaStatsData {
  characterName: string;
  agentName: string;
  aliasCallsign?: string | null;
  faction?: string | null;
  conceptRole?: string | null;
  job?: string | null;
  background?: string | null;
  race: string;
  subrace?: string | null;
  archetype?: string | null;
  physical: number;
  dexterity: number;
  mental: number;
  perception: number;
  hitPoints: number;
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
}

interface FullUserData {
  user: {
    id: string;
    slUuid: string;
    username: string;
    role: string;
    universe: string;
    createdAt: string;
    lastActive: string;
  };
  stats: {
    health: number;
    status: number;
    hunger: number;
    thirst: number;
    goldCoin: number;
    silverCoin: number;
    copperCoin: number;
    lastUpdated: string;
  } | null;
  arkanaStats: ArkanaStatsData;
}

function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token');

  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedUser, setSelectedUser] = useState<FullUserData | null>(null);
  const [editData, setEditData] = useState<Partial<EditDataForm>>({});
  const [saving, setSaving] = useState(false);

  // Arkana data state
  const [dataLoaded, setDataLoaded] = useState(false);
  const [availableFlaws, setAvailableFlaws] = useState<Flaw[]>([]);
  const [availablePerks, setAvailablePerks] = useState<Perk[]>([]);
  const [availableCommonPowers, setAvailableCommonPowers] = useState<CommonPower[]>([]);
  const [availableArchPowers, setAvailableArchPowers] = useState<ArchetypePower[]>([]);
  const [availableCybernetics, setAvailableCybernetics] = useState<Cybernetic[]>([]);
  const [availableMagicSchools, setAvailableMagicSchools] = useState<Record<string, MagicSchool[]>>({});

  // UI state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [currentTab, setCurrentTab] = useState<string>('flaws');

  // Verify admin access
  useEffect(() => {
    const verifyAdmin = async () => {
      if (!token) {
        setError('No admin token provided');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/arkana/admin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        const result = await response.json();

        if (result.success) {
          setIsVerified(true);
          await fetchUsers();
        } else {
          setError(result.error || 'Access denied');
        }
      } catch {
        setError('Failed to verify admin access');
      } finally {
        setLoading(false);
      }
    };

    verifyAdmin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load arkana data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        await loadAllData();
        setDataLoaded(true);
      } catch (err) {
        console.error('Failed to load arkana data:', err);
        setError('Failed to load character data');
      }
    };

    loadData();
  }, []);

  // Re-convert flaws when data loads (handles race condition)
  useEffect(() => {
    if (!dataLoaded || !selectedUser?.arkanaStats) return;

    if (process.env.NODE_ENV === 'development') {
      console.log('[CLIENT EFFECT] Re-converting flaws after data load');
      console.log('[CLIENT EFFECT] Flaws in selectedUser:', selectedUser.arkanaStats.flaws);
    }

    const race = selectedUser.arkanaStats.race;
    const archetype = selectedUser.arkanaStats.archetype || '';
    const flawsJson = selectedUser.arkanaStats.flaws;

    // Convert flaws from JSON to IDs
    const flawIds = new Set<string>();
    if (Array.isArray(flawsJson)) {
      const allFlawsList = getAllFlaws();
      if (process.env.NODE_ENV === 'development') {
        console.log('[CLIENT EFFECT] All flaws available:', allFlawsList.length);
      }
      (flawsJson as Array<{id?: string; name: string; cost: number}>).forEach((flawObj) => {
        // Use ID if available (new format), otherwise fall back to name matching (legacy format)
        if (flawObj.id) {
          flawIds.add(flawObj.id);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[CLIENT EFFECT] Matched flaw by ID: "${flawObj.name}" -> ID: ${flawObj.id}`);
          }
        } else {
          const flaw = allFlawsList.find(f => f.name === flawObj.name);
          if (flaw) {
            flawIds.add(flaw.id);
            if (process.env.NODE_ENV === 'development') {
              console.log(`[CLIENT EFFECT] Matched flaw by name: "${flawObj.name}" -> ID: ${flaw.id}`);
            }
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`[CLIENT EFFECT] Could not find flaw: "${flawObj.name}"`);
            }
          }
        }
      });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[CLIENT EFFECT] Final converted flaw IDs:', Array.from(flawIds));
    }

    // Update editData with converted flaws
    setEditData(prev => ({
      ...prev,
      flaws: flawIds
    }));

    // Update available options for this race/archetype
    setAvailableFlaws(flawsForRace(race, archetype));
    setAvailablePerks(perksForRace(race, archetype));
    setAvailableCommonPowers(commonPowersForRace(race));
    setAvailableArchPowers(archPowersForRaceArch(race, archetype));
    setAvailableCybernetics(cyberneticsAll());

    if (canUseMagic(race, archetype)) {
      const magicSchools = magicSchoolsAllGrouped(race, archetype);
      setAvailableMagicSchools(magicSchools);
      setExpandedSections(new Set(Object.keys(magicSchools)));
    }
  }, [dataLoaded, selectedUser]);

  const fetchUsers = async (page = 1, search = '') => {
    try {
      const response = await fetch(`/api/arkana/admin/users?token=${token}&search=${encodeURIComponent(search)}&page=${page}&limit=20`);
      const result = await response.json();

      if (result.success) {
        setUsers(result.data.users);
        setCurrentPage(result.data.pagination.currentPage);
        setTotalPages(result.data.pagination.totalPages);
      }
    } catch {
      setError('Failed to fetch users');
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchUsers(1, searchTerm);
  };

  const fetchUserDetails = async (userId: string) => {
    try {
      const response = await fetch(`/api/arkana/admin/user/${userId}?token=${token}`);
      const result = await response.json();

      if (result.success) {
        setSelectedUser(result.data);

        const race = result.data.arkanaStats.race;
        const archetype = result.data.arkanaStats.archetype || '';

        // DEV: Log what we received from API
        if (process.env.NODE_ENV === 'development') {
          console.log('[CLIENT LOAD] Flaws received from API:', result.data.arkanaStats.flaws);
          console.log('[CLIENT LOAD] Data loaded status:', dataLoaded);
        }

        // Convert flaws JSON to Set of IDs (only if data is loaded)
        const flawsJson = result.data.arkanaStats.flaws;
        const flawIds = new Set<string>();
        if (dataLoaded && flawsJson && Array.isArray(flawsJson)) {
          // flawsJson is [{id?: "...", name: "...", cost: ...}, ...]
          // We need to convert it to IDs, preferring the ID field if available
          const allFlawsList = getAllFlaws();
          if (process.env.NODE_ENV === 'development') {
            console.log('[CLIENT LOAD] All flaws available:', allFlawsList.length);
          }
          (flawsJson as Array<{id?: string; name: string; cost: number}>).forEach((flawObj) => {
            // Use ID if available (new format), otherwise fall back to name matching (legacy format)
            if (flawObj.id) {
              flawIds.add(flawObj.id);
              if (process.env.NODE_ENV === 'development') {
                console.log(`[CLIENT LOAD] Matched flaw by ID: "${flawObj.name}" -> ID: ${flawObj.id}`);
              }
            } else {
              const flaw = allFlawsList.find(f => f.name === flawObj.name);
              if (flaw) {
                flawIds.add(flaw.id);
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[CLIENT LOAD] Matched flaw by name: "${flawObj.name}" -> ID: ${flaw.id}`);
                }
              } else {
                if (process.env.NODE_ENV === 'development') {
                  console.warn(`[CLIENT LOAD] Could not find flaw: "${flawObj.name}"`);
                }
              }
            }
          });
        }

        if (process.env.NODE_ENV === 'development') {
          console.log('[CLIENT LOAD] Converted flaw IDs:', Array.from(flawIds));
        }

        // Convert arrays to Sets for easier toggling
        setEditData({
          // Identity
          characterName: result.data.arkanaStats.characterName,
          agentName: result.data.arkanaStats.agentName,
          aliasCallsign: result.data.arkanaStats.aliasCallsign || '',
          faction: result.data.arkanaStats.faction || '',
          conceptRole: result.data.arkanaStats.conceptRole || '',
          job: result.data.arkanaStats.job || '',
          background: result.data.arkanaStats.background || '',
          // Lineage
          race: race,
          subrace: result.data.arkanaStats.subrace || '',
          archetype: archetype,
          // Stats
          physical: result.data.arkanaStats.physical,
          dexterity: result.data.arkanaStats.dexterity,
          mental: result.data.arkanaStats.mental,
          perception: result.data.arkanaStats.perception,
          hitPoints: result.data.arkanaStats.hitPoints,
          // Current health
          health: result.data.stats?.health || result.data.arkanaStats.hitPoints,
          status: result.data.stats?.status || 0,
          // Flaws
          flaws: flawIds,
          // Powers (convert arrays to Sets)
          commonPowers: new Set(result.data.arkanaStats.commonPowers || []),
          archetypePowers: new Set(result.data.arkanaStats.archetypePowers || []),
          perks: new Set(result.data.arkanaStats.perks || []),
          // Magic
          magicSchools: new Set(result.data.arkanaStats.magicSchools || []),
          magicWeaves: new Set(result.data.arkanaStats.magicWeaves || []),
          // Cybernetics
          cyberneticAugments: new Set(result.data.arkanaStats.cyberneticAugments || []),
          // Economy
          credits: result.data.arkanaStats.credits,
          chips: result.data.arkanaStats.chips,
          xp: result.data.arkanaStats.xp,
          // Role
          arkanaRole: result.data.arkanaStats.arkanaRole
        });

        // Filter available options based on race/archetype
        if (dataLoaded && race) {
          setAvailableFlaws(flawsForRace(race, archetype));
          setAvailablePerks(perksForRace(race, archetype));
          setAvailableCommonPowers(commonPowersForRace(race));
          setAvailableArchPowers(archPowersForRaceArch(race, archetype));
          setAvailableCybernetics(cyberneticsAll());

          if (canUseMagic(race, archetype)) {
            const magicSchools = magicSchoolsAllGrouped(race, archetype);
            setAvailableMagicSchools(magicSchools);
            // Auto-expand all magic school sections
            setExpandedSections(new Set(Object.keys(magicSchools)));
          } else {
            setAvailableMagicSchools({});
            setExpandedSections(new Set());
          }
        }
      }
    } catch {
      setError('Failed to fetch user details');
    }
  };

  const handleSave = async () => {
    if (!selectedUser) return;

    setSaving(true);
    try {
      // Convert Sets back to Arrays for API submission
      const submissionData = {
        ...editData,
        flaws: Array.from(editData.flaws || []),
        commonPowers: Array.from(editData.commonPowers || []),
        archetypePowers: Array.from(editData.archetypePowers || []),
        perks: Array.from(editData.perks || []),
        magicSchools: Array.from(editData.magicSchools || []),
        magicWeaves: Array.from(editData.magicWeaves || []),
        cyberneticAugments: Array.from(editData.cyberneticAugments || [])
      };

      // DEV: Log what we're sending to API
      if (process.env.NODE_ENV === 'development') {
        console.log('[CLIENT SAVE] Flaws being sent to API:', submissionData.flaws);
        console.log('[CLIENT SAVE] Full submission data:', submissionData);
      }

      const response = await fetch(`/api/arkana/admin/user/${selectedUser.user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...submissionData })
      });

      const result = await response.json();

      if (result.success) {
        alert('User data updated successfully!');
        setSelectedUser(null);
        await fetchUsers(currentPage, searchTerm);
      } else {
        alert(`Failed to update user: ${result.error}`);
      }
    } catch {
      alert('Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const getHealthPercentage = (current: number, max: number) => {
    return max > 0 ? (current / max) * 100 : 0;
  };

  const getHealthColor = (percentage: number) => {
    if (percentage >= 75) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Helper functions for power selection
  const toggleFlaw = (id: string) => {
    const currentSet = new Set(editData.flaws || []);
    if (currentSet.has(id)) {
      currentSet.delete(id);
    } else {
      currentSet.add(id);
    }
    setEditData(prev => ({ ...prev, flaws: currentSet }));
  };

  const togglePower = (id: string, type: 'commonPowers' | 'archetypePowers' | 'perks' | 'cyberneticAugments') => {
    const currentSet = new Set(editData[type] || []);
    if (currentSet.has(id)) {
      currentSet.delete(id);
    } else {
      currentSet.add(id);
    }
    setEditData(prev => ({ ...prev, [type]: currentSet }));
  };

  const toggleMagicSchool = (id: string) => {
    const currentSet = new Set(editData.magicSchools || []);
    if (currentSet.has(id)) {
      currentSet.delete(id);
    } else {
      currentSet.add(id);
    }
    setEditData(prev => ({ ...prev, magicSchools: currentSet }));
  };

  const toggleMagicWeave = (id: string) => {
    const currentSet = new Set(editData.magicWeaves || []);
    if (currentSet.has(id)) {
      currentSet.delete(id);
    } else {
      currentSet.add(id);
    }
    setEditData(prev => ({ ...prev, magicWeaves: currentSet }));
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const resetPowersSelection = () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset all Powers & Abilities selections?\n\n' +
      'This will clear:\n' +
      '• All selected Flaws\n' +
      '• All selected Powers, Perks, and Archetype Powers\n' +
      '• All Magic Schools and Weaves\n' +
      '• All Cybernetic selections'
    );

    if (confirmed) {
      setEditData(prev => ({
        ...prev,
        flaws: new Set<string>(),
        commonPowers: new Set<string>(),
        archetypePowers: new Set<string>(),
        perks: new Set<string>(),
        magicSchools: new Set<string>(),
        magicWeaves: new Set<string>(),
        cyberneticAugments: new Set<string>()
      }));
    }
  };

  const renderPowersSection = () => {
    if (!dataLoaded) {
      return (
        <div className="bg-gray-800 border border-cyan-600 rounded p-4">
          <h3 className="text-lg font-bold text-cyan-400 mb-3">Powers & Abilities</h3>
          <p className="text-cyan-300">Loading character data...</p>
        </div>
      );
    }

    const tabs = [
      { id: 'flaws', name: 'Flaws' },
      { id: 'common', name: 'Common Powers' },
      { id: 'archetype', name: 'Archetype Powers' },
      { id: 'perks', name: 'Perks' },
      { id: 'cybernetics', name: 'Cybernetics' },
      { id: 'magic', name: 'Magic' }
    ];

    return (
      <div className="bg-gray-800 border border-cyan-600 rounded p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-cyan-400">Powers & Abilities</h3>
          {((editData.flaws?.size || 0) > 0 ||
            (editData.commonPowers?.size || 0) > 0 ||
            (editData.archetypePowers?.size || 0) > 0 ||
            (editData.perks?.size || 0) > 0 ||
            (editData.magicSchools?.size || 0) > 0 ||
            (editData.cyberneticAugments?.size || 0) > 0) && (
            <button
              onClick={resetPowersSelection}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
            >
              🔄 Reset All
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-900 p-1 rounded mb-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`px-4 py-2 rounded transition-colors ${
                currentTab === tab.id
                  ? 'bg-cyan-600 text-white'
                  : 'text-cyan-300 hover:bg-gray-700'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[300px]">
          {currentTab === 'flaws' && (
            <div className="space-y-3">
              <h4 className="text-md font-bold text-cyan-300">Flaws</h4>
              <p className="text-cyan-300 text-sm mb-3">
                Select flaws for this character. Flaws grant additional power points during character creation.
              </p>
              {availableFlaws.length > 0 ? (
                availableFlaws.map(flaw => (
                  <div key={flaw.id} className="p-3 bg-gray-900 border border-cyan-500 rounded">
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editData.flaws?.has(flaw.id) || false}
                        onChange={() => toggleFlaw(flaw.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-cyan-300">{flaw.name}</span>
                          <span className="px-2 py-1 bg-green-900 text-green-300 rounded text-xs">+{flaw.cost} pts</span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">{flaw.desc}</p>
                      </div>
                    </label>
                  </div>
                ))
              ) : (
                <p className="text-gray-400">No flaws available for this race/archetype.</p>
              )}
            </div>
          )}

          {currentTab === 'common' && (
            <div className="space-y-3">
              <h4 className="text-md font-bold text-cyan-300">Common Powers</h4>
              {availableCommonPowers.length > 0 ? (
                availableCommonPowers.map(power => (
                  <div key={power.id} className="p-3 bg-gray-900 border border-cyan-500 rounded">
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editData.commonPowers?.has(power.id) || false}
                        onChange={() => togglePower(power.id, 'commonPowers')}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-cyan-300">{power.name}</span>
                          <span className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-xs">{power.cost} pts</span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">{power.desc}</p>
                      </div>
                    </label>
                  </div>
                ))
              ) : (
                <p className="text-gray-400">No common powers available for this race.</p>
              )}
            </div>
          )}

          {currentTab === 'archetype' && (
            <div className="space-y-3">
              <h4 className="text-md font-bold text-cyan-300">Archetype Powers</h4>
              {availableArchPowers.length > 0 ? (
                availableArchPowers.map(power => (
                  <div key={power.id} className="p-3 bg-gray-900 border border-cyan-500 rounded">
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editData.archetypePowers?.has(power.id) || false}
                        onChange={() => togglePower(power.id, 'archetypePowers')}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-cyan-300">{power.name}</span>
                          <span className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-xs">{power.cost} pts</span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">{power.desc}</p>
                      </div>
                    </label>
                  </div>
                ))
              ) : (
                <p className="text-gray-400">No archetype powers available for this race/archetype.</p>
              )}
            </div>
          )}

          {currentTab === 'perks' && (
            <div className="space-y-3">
              <h4 className="text-md font-bold text-cyan-300">Perks</h4>
              {availablePerks.length > 0 ? (
                availablePerks.map(perk => (
                  <div key={perk.id} className="p-3 bg-gray-900 border border-cyan-500 rounded">
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editData.perks?.has(perk.id) || false}
                        onChange={() => togglePower(perk.id, 'perks')}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-cyan-300">{perk.name}</span>
                          <span className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-xs">{perk.cost} pts</span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">{perk.desc}</p>
                      </div>
                    </label>
                  </div>
                ))
              ) : (
                <p className="text-gray-400">No perks available for this race/archetype.</p>
              )}
            </div>
          )}

          {currentTab === 'cybernetics' && (
            <div className="space-y-4">
              <h4 className="text-md font-bold text-cyan-300">Cybernetics</h4>
              <p className="text-cyan-300 text-sm mb-3">
                Select cybernetic augmentations for this character. Admins can freely add/remove without slot restrictions.
              </p>

              {/* Cybernetic Modifications */}
              <div className="space-y-3">
                {Object.entries(groupCyberneticsBySection(availableCybernetics)).map(([section, cybers]) => (
                  cybers.length > 0 && (
                    <div key={section}>
                      <h5 className="text-sm font-semibold text-cyan-300 mb-2">{section}</h5>
                      {cybers.map(cyber => (
                        <div key={cyber.id} className="p-3 bg-gray-800 border border-gray-600 rounded mb-2">
                          <label className="flex items-start space-x-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editData.cyberneticAugments?.has(cyber.id) || false}
                              onChange={() => togglePower(cyber.id, 'cyberneticAugments')}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-cyan-300">{cyber.name}</span>
                                <span className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-xs">{cyber.cost} pts</span>
                              </div>
                              <p className="text-gray-400 text-sm mt-1">{cyber.desc}</p>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {currentTab === 'magic' && (
            <div className="space-y-4">
              <h4 className="text-md font-bold text-cyan-300">Magic Schools & Weaves</h4>

              {canUseMagic(editData.race || '', editData.archetype || '') ? (
                Object.keys(availableMagicSchools).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(availableMagicSchools).map(([section, schools]) => {
                      const schoolEntry = schools[0];
                      const weaves = schools.slice(1);
                      const schoolSelected = editData.magicSchools?.has(schoolEntry.id) || false;

                      return (
                        <div key={section}>
                          <button
                            onClick={() => toggleSection(section)}
                            className="w-full flex items-center justify-between text-md font-semibold text-cyan-300 mb-2 p-2 rounded hover:bg-gray-800 transition-colors"
                          >
                            <span>{section}</span>
                            <span
                              className={`transform transition-transform duration-200 ${
                                expandedSections.has(section) ? 'rotate-90' : 'rotate-0'
                              }`}
                            >
                              ▶
                            </span>
                          </button>

                          {expandedSections.has(section) && (
                            <div className="space-y-2">
                              {/* School Entry */}
                              <div className="p-3 bg-gray-900 border border-cyan-500 rounded">
                                <label className="flex items-start space-x-3 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={schoolSelected}
                                    onChange={() => toggleMagicSchool(schoolEntry.id)}
                                    className="mt-1"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-medium text-cyan-300">{schoolEntry.name}</span>
                                      <span className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-xs">{schoolEntry.cost} pts</span>
                                    </div>
                                    <p className="text-gray-400 text-sm mt-1">{schoolEntry.desc}</p>
                                  </div>
                                </label>
                              </div>

                              {/* Weaves */}
                              {weaves.map(weave => {
                                const weaveSelected = editData.magicWeaves?.has(weave.id) || false;

                                return (
                                  <div key={weave.id} className="ml-6 p-3 bg-gray-800 border border-gray-600 rounded">
                                    <label className="flex items-start space-x-3 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={weaveSelected}
                                        onChange={() => toggleMagicWeave(weave.id)}
                                        disabled={!schoolSelected}
                                        className="mt-1"
                                      />
                                      <div className="flex-1">
                                        <div className="flex items-center space-x-2">
                                          <span className="font-medium text-cyan-300">{weave.name}</span>
                                          <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">{weave.cost} pts</span>
                                        </div>
                                        <p className="text-gray-400 text-sm mt-1">{weave.desc}</p>
                                      </div>
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-400">No magic schools data available.</p>
                )
              ) : (
                <div className="p-4 bg-gray-900 border border-yellow-500 rounded">
                  <p className="text-yellow-300">
                    Magic is not available for the current race/archetype combination.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto"></div>
          <p className="mt-4 text-cyan-400">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (error || !isVerified) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900 border border-red-500 text-red-300 px-8 py-6 rounded max-w-md">
            <h2 className="font-bold mb-2 text-2xl">⛔ Access Denied</h2>
            <p className="mb-4">{error || 'You do not have administrator privileges'}</p>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-cyan-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-cyan-400 mb-2 text-center">
            ⚡ Arkana Administrator Dashboard
          </h1>
          <p className="text-cyan-300 text-center">User Management & Character Editor</p>
        </div>

        {!selectedUser ? (
          <>
            {/* Search Bar */}
            <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6 mb-6">
              <h2 className="text-xl font-bold text-cyan-400 mb-4">Search Users</h2>
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Search by character name, agent name, or UUID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1 px-4 py-2 bg-gray-800 border border-cyan-500 text-cyan-100 rounded focus:outline-none focus:border-cyan-300"
                />
                <button
                  onClick={handleSearch}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded font-medium"
                >
                  Search
                </button>
              </div>
            </div>

            {/* User List */}
            <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6">
              <h2 className="text-xl font-bold text-cyan-400 mb-4">Arkana Characters ({users.length})</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-cyan-700">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-cyan-400 uppercase">Character</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-cyan-400 uppercase">Agent</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-cyan-400 uppercase">Race/Archetype</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-cyan-400 uppercase">Health</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-cyan-400 uppercase">Credits</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-cyan-400 uppercase">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-cyan-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-900 divide-y divide-cyan-800">
                    {users.map((user) => {
                      const healthPct = getHealthPercentage(user.currentHealth, user.maxHealth);
                      return (
                        <tr key={user.id} className="hover:bg-gray-800">
                          <td className="px-4 py-3 text-sm">
                            <div className="font-medium text-cyan-300">{user.characterName}</div>
                            <div className="text-xs text-gray-400">{user.slUuid.substring(0, 8)}...</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-cyan-300">{user.agentName}</td>
                          <td className="px-4 py-3 text-sm text-cyan-300">{user.race} / {user.archetype}</td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-cyan-300 mb-1">{user.currentHealth}/{user.maxHealth}</div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                              <div className={`h-2 rounded-full ${getHealthColor(healthPct)}`} style={{width: `${healthPct}%`}}></div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-green-400">{user.credits}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded ${user.arkanaRole === 'admin' ? 'bg-purple-900 text-purple-300' : 'bg-gray-700 text-gray-300'}`}>
                              {user.arkanaRole}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => fetchUserDetails(user.id)}
                              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-cyan-300">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => fetchUsers(currentPage - 1, searchTerm)}
                      disabled={currentPage === 1}
                      className="px-3 py-2 border border-cyan-500 rounded text-sm text-cyan-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => fetchUsers(currentPage + 1, searchTerm)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 border border-cyan-500 rounded text-sm text-cyan-300 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          // User Editor
          <div className="bg-gray-900 border border-cyan-500 rounded-lg shadow-lg shadow-cyan-500/20 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-cyan-400">Edit Character: {editData.characterName || ''}</h2>
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
              >
                ← Back to List
              </button>
            </div>

            <div className="space-y-6">
              {/* Identity Section */}
              <div className="bg-gray-800 border border-cyan-600 rounded p-4">
                <h3 className="text-lg font-bold text-cyan-400 mb-3">Identity</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Character Name</label>
                    <input type="text" value={editData.characterName} onChange={(e) => setEditData({...editData, characterName: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Agent Name</label>
                    <input type="text" value={editData.agentName} onChange={(e) => setEditData({...editData, agentName: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Alias/Callsign</label>
                    <input type="text" value={editData.aliasCallsign} onChange={(e) => setEditData({...editData, aliasCallsign: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Faction</label>
                    <input type="text" value={editData.faction} onChange={(e) => setEditData({...editData, faction: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                </div>
              </div>

              {/* Stats Section */}
              <div className="bg-gray-800 border border-cyan-600 rounded p-4">
                <h3 className="text-lg font-bold text-cyan-400 mb-3">Stats & Health</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Physical</label>
                    <input type="number" min="1" max="10" value={editData.physical} onChange={(e) => setEditData({...editData, physical: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Dexterity</label>
                    <input type="number" min="1" max="10" value={editData.dexterity} onChange={(e) => setEditData({...editData, dexterity: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Mental</label>
                    <input type="number" min="1" max="10" value={editData.mental} onChange={(e) => setEditData({...editData, mental: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Perception</label>
                    <input type="number" min="1" max="10" value={editData.perception} onChange={(e) => setEditData({...editData, perception: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Current Health</label>
                    <input type="number" min="0" max={editData.hitPoints} value={editData.health} onChange={(e) => setEditData({...editData, health: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Max Health (HP)</label>
                    <input type="number" min="1" max="100" value={editData.hitPoints} onChange={(e) => setEditData({...editData, hitPoints: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-cyan-300 mb-1">Status</label>
                  <select
                    value={editData.status}
                    onChange={(e) => setEditData({...editData, status: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100"
                  >
                    <option value={0}>RP (Looking for roleplay)</option>
                    <option value={1}>OOC (Out of character)</option>
                    <option value={2}>AFK (Away)</option>
                  </select>
                </div>
              </div>

              {/* Economy Section */}
              <div className="bg-gray-800 border border-cyan-600 rounded p-4">
                <h3 className="text-lg font-bold text-cyan-400 mb-3">Economy</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Credits</label>
                    <input type="number" min="0" value={editData.credits} onChange={(e) => setEditData({...editData, credits: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Chips</label>
                    <input type="number" min="0" value={editData.chips} onChange={(e) => setEditData({...editData, chips: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">XP</label>
                    <input type="number" min="0" value={editData.xp} onChange={(e) => setEditData({...editData, xp: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                </div>
              </div>

              {/* Powers & Abilities Section - New Tabbed Interface */}
              {renderPowersSection()}

              {/* Admin Role */}
              <div className="bg-gray-800 border border-purple-600 rounded p-4">
                <h3 className="text-lg font-bold text-purple-400 mb-3">Administrator Privileges</h3>
                <div>
                  <label className="block text-sm font-medium text-purple-300 mb-1">Arkana Role</label>
                  <select value={editData.arkanaRole} onChange={(e) => setEditData({...editData, arkanaRole: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-purple-500 rounded text-cyan-100">
                    <option value="player">Player</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto"></div>
          <p className="mt-4 text-cyan-400">Loading...</p>
        </div>
      </div>
    }>
      <AdminDashboardContent />
    </Suspense>
  );
}
