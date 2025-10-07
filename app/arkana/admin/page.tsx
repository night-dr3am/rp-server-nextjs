'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

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
  commonPowers: string[];
  archetypePowers: string[];
  perks: string[];
  magicSchools: string[];
  cyberneticAugments: string[];
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
          race: result.data.arkanaStats.race,
          subrace: result.data.arkanaStats.subrace || '',
          archetype: result.data.arkanaStats.archetype || '',
          // Stats
          physical: result.data.arkanaStats.physical,
          dexterity: result.data.arkanaStats.dexterity,
          mental: result.data.arkanaStats.mental,
          perception: result.data.arkanaStats.perception,
          hitPoints: result.data.arkanaStats.hitPoints,
          // Current health
          health: result.data.stats?.health || result.data.arkanaStats.hitPoints,
          status: result.data.stats?.status || 0,
          // Powers
          commonPowers: result.data.arkanaStats.commonPowers || [],
          archetypePowers: result.data.arkanaStats.archetypePowers || [],
          perks: result.data.arkanaStats.perks || [],
          // Magic
          magicSchools: result.data.arkanaStats.magicSchools || [],
          // Cybernetics
          cyberneticAugments: result.data.arkanaStats.cyberneticAugments || [],
          // Economy
          credits: result.data.arkanaStats.credits,
          chips: result.data.arkanaStats.chips,
          xp: result.data.arkanaStats.xp,
          // Role
          arkanaRole: result.data.arkanaStats.arkanaRole
        });
      }
    } catch {
      setError('Failed to fetch user details');
    }
  };

  const handleSave = async () => {
    if (!selectedUser) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/arkana/admin/user/${selectedUser.user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...editData })
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

              {/* Powers Section */}
              <div className="bg-gray-800 border border-cyan-600 rounded p-4">
                <h3 className="text-lg font-bold text-cyan-400 mb-3">Powers & Abilities</h3>
                <p className="text-sm text-cyan-300 mb-4">Note: Use comma-separated values for lists (e.g., &quot;Power1, Power2, Power3&quot;)</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Common Powers</label>
                    <input type="text" value={(editData.commonPowers || []).join(', ')} onChange={(e) => setEditData({...editData, commonPowers: e.target.value.split(',').map((s: string) => s.trim()).filter((s: string) => s)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Archetype Powers</label>
                    <input type="text" value={(editData.archetypePowers || []).join(', ')} onChange={(e) => setEditData({...editData, archetypePowers: e.target.value.split(',').map((s: string) => s.trim()).filter((s: string) => s)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Perks</label>
                    <input type="text" value={(editData.perks || []).join(', ')} onChange={(e) => setEditData({...editData, perks: e.target.value.split(',').map((s: string) => s.trim()).filter((s: string) => s)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Magic Schools</label>
                    <input type="text" value={(editData.magicSchools || []).join(', ')} onChange={(e) => setEditData({...editData, magicSchools: e.target.value.split(',').map((s: string) => s.trim()).filter((s: string) => s)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-1">Cybernetic Augments</label>
                    <input type="text" value={(editData.cyberneticAugments || []).join(', ')} onChange={(e) => setEditData({...editData, cyberneticAugments: e.target.value.split(',').map((s: string) => s.trim()).filter((s: string) => s)})} className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100" />
                  </div>
                </div>
              </div>

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
