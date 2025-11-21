'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  GoreanHeading,
  GoreanCard,
  GoreanBadge,
  GoreanColors,
  GoreanSpinner,
  GoreanError,
  GoreanScroll,
  GoreanDivider,
  GoreanButton
} from '@/components/gor/GoreanTheme';
import { HealthBar, HungerBar, ThirstBar } from '@/components/gor/StatBar';
import UserGroupList, { GroupMember } from '@/components/gor/UserGroupList';
import UserSearchModal, { SearchUser } from '@/components/gor/UserSearchModal';
import skillsData from '@/lib/gor/skills.json';
import abilitiesData from '@/lib/gor/abilities.json';

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

interface CharacterSkill {
  skill_id: string;
  skill_name: string;
  level: number;
  xp: number;
}

interface SkillData {
  id: string;
  name: string;
  description: string;
  type: 'combat' | 'subterfuge' | 'social' | 'survival' | 'crafting' | 'mental';
  baseStat: string;
  maxLevel: number;
  maxInitialLevel: number;
  xpCost: number[];
  hpBonus: number;
  applicableSpecies: string[];
  applicableTo?: string[];
  restrictedTo?: string[];
  notes: string;
}

interface CharacterAbility {
  ability_id: string;
  ability_name: string;
  learned_at?: string;
  uses?: number;
}

interface AbilityData {
  id: string;
  orderNumber: number;
  name: string;
  desc: string;
  category: 'combat' | 'social' | 'survival' | 'mental' | 'special';
  cost: number;
  cooldown?: number;
  range?: number;
  targetType?: 'single' | 'area' | 'self';
  effects: {
    attack?: string[];
    ability?: string[];
    passive?: string[];
  };
  abilityType: ('attack' | 'ability')[];
  requirements?: {
    species?: string[];
    caste?: string[];
    status?: string[];
    skill?: {
      id: string;
      level: number;
    };
    minStat?: {
      stat: string;
      value: number;
    };
  };
  notes?: string;
  bookReferences?: string[];
}

interface GoreanStats {
  characterName: string;
  species: string;
  speciesVariant: string | null;
  culture: string | null;
  status: string;
  statusSubtype: string | null;
  slaveType: string | null;
  casteRole: string | null;
  maxHealth: number;
  maxHunger: number;
  maxThirst: number;
  strength: number;
  agility: number;
  intellect: number;
  perception: number;
  charisma: number;
  skills: CharacterSkill[];
  abilities: CharacterAbility[];
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
  goreanStats: GoreanStats | null;
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

export default function GoreanProfilePage() {
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

  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'social'>('dashboard');

  // Social groups state
  interface Groups {
    [groupName: string]: GroupMember[];
  }
  const [groups, setGroups] = useState<Groups>({ Allies: [], Enemies: [] });
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [activeGroupName, setActiveGroupName] = useState<string>('');

  const fetchProfileData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/gor/profile/data?sl_uuid=${uuid}&universe=${universe}&token=${token}&sessionId=${sessionId}&page=${eventsPage}&limit=${eventsLimit}`
      );
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

  // Social groups functions
  const fetchGroups = useCallback(async () => {
    if (!uuid || !token) return;

    setGroupsLoading(true);
    try {
      const response = await fetch(
        `/api/gor/social/groups?player_uuid=${uuid}&universe=gor&token=${token}&sessionId=${sessionId}`
      );
      const result = await response.json();

      if (result.success) {
        setGroups(result.data.groups || { Allies: [], Enemies: [] });
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    } finally {
      setGroupsLoading(false);
    }
  }, [uuid, token, sessionId]);

  const handleRemoveMember = async (groupName: string, goreanId: number) => {
    if (!uuid || !token) return;

    try {
      const response = await fetch('/api/gor/social/groups/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_uuid: uuid,
          universe: 'gor',
          group_name: groupName,
          target_gorean_id: goreanId,
          token,
          sessionId
        })
      });

      const result = await response.json();
      if (result.success) {
        await fetchGroups();
      }
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  const handleAddMember = async (goreanId: number) => {
    if (!uuid || !token || !activeGroupName) return;

    try {
      const response = await fetch('/api/gor/social/groups/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_uuid: uuid,
          universe: 'gor',
          group_name: activeGroupName,
          target_gorean_id: goreanId,
          token,
          sessionId
        })
      });

      const result = await response.json();
      if (result.success) {
        await fetchGroups();
      }
    } catch (error) {
      console.error('Failed to add member:', error);
    }
  };

  const handleSearchUsers = async (searchTerm: string, page: number): Promise<{
    users: SearchUser[];
    pagination: {
      page: number;
      totalPages: number;
      totalCount: number;
      hasMore: boolean;
    };
  }> => {
    if (!uuid || !token) {
      return { users: [], pagination: { page: 1, totalPages: 1, totalCount: 0, hasMore: false } };
    }

    const response = await fetch(
      `/api/gor/social/users/search?player_uuid=${uuid}&universe=gor&search=${encodeURIComponent(searchTerm)}&page=${page}&limit=20&token=${token}&sessionId=${sessionId}`
    );

    const result = await response.json();
    if (result.success) {
      return {
        users: result.data.users,
        pagination: result.data.pagination
      };
    }

    return { users: [], pagination: { page: 1, totalPages: 1, totalCount: 0, hasMore: false } };
  };

  const openAddModal = (groupName: string) => {
    setActiveGroupName(groupName);
    setSearchModalOpen(true);
  };

  // Fetch groups when Social tab is activated
  useEffect(() => {
    if (activeTab === 'social') {
      fetchGroups();
    }
  }, [activeTab, fetchGroups]);

  const formatCurrency = (gold: number, silver: number, copper: number) => {
    const parts = [];
    if (gold > 0) parts.push(`🪙 ${gold}`);
    if (silver > 0) parts.push(`💿 ${silver}`);
    if (copper > 0) parts.push(`🟤 ${copper}`);
    return parts.join('  ') || '🟤 0';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      freeMan: { label: 'Free Man', color: GoreanColors.casteBlue },
      freeWoman: { label: 'Free Woman', color: GoreanColors.casteBlue },
      kajira: { label: 'Kajira', color: GoreanColors.bloodRed },
      kajirus: { label: 'Kajirus', color: GoreanColors.bloodRed },
      outlaw: { label: 'Outlaw', color: GoreanColors.charcoal },
      captive: { label: 'Captive', color: GoreanColors.bronze },
      wild: { label: 'Wild', color: GoreanColors.forestGreen },
      domesticated: { label: 'Domesticated', color: GoreanColors.stone },
      companion: { label: 'Companion', color: GoreanColors.gold }
    };
    return statusMap[status] || { label: status, color: GoreanColors.stone };
  };

  const getRPGStatusInfo = (status: number): { label: string; color: string; description: string } => {
    const statusMap: Record<number, { label: string; color: string; description: string }> = {
      0: { label: 'Full Mode', color: GoreanColors.forestGreen, description: 'Default active gameplay mode' },
      1: { label: 'Survival Mode', color: GoreanColors.bronze, description: 'Survival-focused gameplay' },
      2: { label: 'Combat Mode', color: GoreanColors.bloodRed, description: 'Combat-focused gameplay' },
      3: { label: 'RP Mode', color: GoreanColors.gold, description: 'Pure roleplay mode' },
      4: { label: 'OOC Mode', color: GoreanColors.stone, description: 'Out of character' },
      5: { label: 'AFK Mode', color: GoreanColors.charcoal, description: 'Away from keyboard' }
    };
    return statusMap[status] || { label: 'Unknown Mode', color: GoreanColors.stone, description: 'Unknown status' };
  };

  const StatCell = ({ label, value }: { label: string; value: number }) => {
    return (
      <div
        className="p-3 rounded text-center"
        style={{
          backgroundColor: GoreanColors.parchmentDark,
          border: `1px solid ${GoreanColors.bronze}`
        }}
      >
        <p className="text-xs font-medium mb-1" style={{ color: GoreanColors.charcoal }}>
          {label}
        </p>
        <p className="text-2xl font-bold" style={{ color: GoreanColors.bronze }}>
          {value}
        </p>
      </div>
    );
  };

  const getSkillTypeColor = (skillType: string): string => {
    const colorMap: Record<string, string> = {
      combat: GoreanColors.bloodRed,
      subterfuge: GoreanColors.charcoal,
      social: GoreanColors.gold,
      survival: GoreanColors.forestGreen,
      crafting: GoreanColors.bronze,
      mental: GoreanColors.casteBlue
    };
    return colorMap[skillType] || GoreanColors.stone;
  };

  const getAbilityCategoryColor = (category: string): string => {
    const colorMap: Record<string, string> = {
      combat: GoreanColors.bloodRed,
      social: GoreanColors.gold,
      survival: GoreanColors.forestGreen,
      mental: GoreanColors.casteBlue,
      special: GoreanColors.bronze
    };
    return colorMap[category] || GoreanColors.stone;
  };

  const renderEventDetails = (event: EventData) => {
    try {
      if (typeof event.details === 'object' && event.details !== null) {
        return Object.entries(event.details).map(([key, value]) => (
          <span key={key} className="text-sm" style={{ color: GoreanColors.charcoal }}>
            {key}: {typeof value === 'string' ? value : JSON.stringify(value)}
          </span>
        ));
      }
      return (
        <span className="text-sm" style={{ color: GoreanColors.charcoal }}>
          {String(event.details)}
        </span>
      );
    } catch {
      return (
        <span className="text-sm" style={{ color: GoreanColors.charcoal }}>
          Invalid details
        </span>
      );
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: GoreanColors.parchment }}
      >
        <div className="text-center">
          <GoreanSpinner size="lg" />
          <p className="mt-4" style={{ color: GoreanColors.charcoal, fontFamily: 'Crimson Text, Georgia, serif' }}>
            Loading character profile...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: GoreanColors.parchment }}
      >
        <div className="max-w-md w-full">
          <GoreanError message={error} />
          <p className="text-center text-sm mt-4" style={{ color: GoreanColors.charcoal }}>
            Please request a new profile link from your HUD.
          </p>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: GoreanColors.parchment }}
      >
        <p style={{ color: GoreanColors.charcoal }}>No profile data available</p>
      </div>
    );
  }

  const { user, stats, goreanStats, inventory, events } = profileData;
  const statusInfo = goreanStats ? getStatusText(goreanStats.status) : null;

  return (
    <div
      className="min-h-screen py-8"
      style={{
        backgroundColor: GoreanColors.parchment,
        backgroundImage: `linear-gradient(to bottom, ${GoreanColors.parchment}, ${GoreanColors.parchmentDark})`
      }}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Main Title */}
        <div className="text-center mb-8">
          <GoreanHeading level={1} decorative>
            Character Profile
          </GoreanHeading>
          <GoreanDivider ornament className="my-4" />
        </div>

        {/* Tab Navigation */}
        <nav className="flex justify-center space-x-4 mb-6">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-6 py-2 font-semibold rounded-md transition-all ${
              activeTab === 'dashboard'
                ? 'shadow-md'
                : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: activeTab === 'dashboard' ? GoreanColors.bronze : GoreanColors.parchmentDark,
              color: activeTab === 'dashboard' ? GoreanColors.charcoal : GoreanColors.stone,
              border: `2px solid ${activeTab === 'dashboard' ? GoreanColors.bronzeDark : GoreanColors.stone}`
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('social')}
            className={`px-6 py-2 font-semibold rounded-md transition-all ${
              activeTab === 'social'
                ? 'shadow-md'
                : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: activeTab === 'social' ? GoreanColors.bronze : GoreanColors.parchmentDark,
              color: activeTab === 'social' ? GoreanColors.charcoal : GoreanColors.stone,
              border: `2px solid ${activeTab === 'social' ? GoreanColors.bronzeDark : GoreanColors.stone}`
            }}
          >
            Social
          </button>
        </nav>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
        <GoreanScroll>
          {/* Unified Character Overview Card */}
          <GoreanCard className="mb-6">
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* LEFT COLUMN: Character Identity */}
                <div className="flex items-start space-x-4">
                  {/* Avatar */}
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${GoreanColors.bronze}, ${GoreanColors.bronzeDark})`,
                      boxShadow: `0 4px 12px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.3)`
                    }}
                  >
                    <span className="text-3xl font-bold text-white">
                      {(goreanStats?.characterName || user.username).charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Character Details */}
                  <div className="flex-1">
                    <GoreanHeading level={2} className="mb-3">
                      {goreanStats?.characterName || user.username}
                    </GoreanHeading>

                    {goreanStats && (
                      <div className="space-y-1 text-sm">
                        <p style={{ color: GoreanColors.charcoal }}>
                          <span className="font-semibold">Species:</span> {goreanStats.species}
                          {goreanStats.speciesVariant && ` (${goreanStats.speciesVariant})`}
                        </p>

                        {statusInfo && (
                          <p style={{ color: GoreanColors.charcoal }}>
                            <span className="font-semibold">Status:</span>{' '}
                            <span style={{ color: statusInfo.color, fontWeight: 600 }}>
                              {statusInfo.label}
                              {goreanStats.statusSubtype && ` • ${goreanStats.statusSubtype}`}
                            </span>
                          </p>
                        )}

                        {goreanStats.culture && (
                          <p style={{ color: GoreanColors.charcoal }}>
                            <span className="font-semibold">Culture:</span> {goreanStats.culture}
                          </p>
                        )}

                        {goreanStats.casteRole && (
                          <p style={{ color: GoreanColors.charcoal }}>
                            <span className="font-semibold">Caste/Role:</span> {goreanStats.casteRole}
                          </p>
                        )}

                        {goreanStats.slaveType && (
                          <p style={{ color: GoreanColors.charcoal }}>
                            <span className="font-semibold">Slave Type:</span>{' '}
                            <span style={{ color: GoreanColors.bloodRed, fontWeight: 600 }}>
                              {goreanStats.slaveType}
                            </span>
                          </p>
                        )}
                      </div>
                    )}

                    <div
                      className="mt-4 pt-3 text-xs space-y-1"
                      style={{
                        color: GoreanColors.stone,
                        borderTop: `1px solid ${GoreanColors.bronze}30`
                      }}
                    >
                      <p>
                        <span className="font-semibold">Joined:</span> {formatDate(user.createdAt)}
                      </p>
                      <p>
                        <span className="font-semibold">Last Active:</span> {formatDate(user.lastActive)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Character Stats */}
                <div>
                  {stats && goreanStats ? (
                    <div className="space-y-4">
                      {/* RPG Status as text, not badge */}
                      <p className="text-sm font-medium" style={{ color: GoreanColors.charcoal }}>
                        <span className="font-semibold">Mode:</span>{' '}
                        <span style={{ color: getRPGStatusInfo(stats.status).color, fontWeight: 600 }}>
                          {getRPGStatusInfo(stats.status).label}
                        </span>
                      </p>

                      {/* Health/Hunger/Thirst Bars */}
                      <div className="space-y-2">
                        <HealthBar
                          current={stats.health}
                          max={goreanStats.maxHealth}
                        />
                        <HungerBar
                          current={stats.hunger}
                          max={goreanStats.maxHunger}
                        />
                        <ThirstBar
                          current={stats.thirst}
                          max={goreanStats.maxThirst}
                        />
                      </div>

                      {/* Core Stats Grid */}
                      <div
                        className="pt-4 mt-4"
                        style={{ borderTop: `2px solid ${GoreanColors.bronze}` }}
                      >
                        <p className="text-sm font-semibold mb-3" style={{ color: GoreanColors.charcoal }}>
                          Core Attributes:
                        </p>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <StatCell label="Strength" value={goreanStats.strength} />
                          <StatCell label="Agility" value={goreanStats.agility} />
                          <StatCell label="Intellect" value={goreanStats.intellect} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <StatCell label="Perception" value={goreanStats.perception} />
                          <StatCell label="Charisma" value={goreanStats.charisma} />
                        </div>
                      </div>

                      {/* Currency */}
                      <div
                        className="pt-4 mt-4"
                        style={{ borderTop: `2px solid ${GoreanColors.bronze}` }}
                      >
                        <p className="text-sm font-semibold mb-2" style={{ color: GoreanColors.charcoal }}>
                          Currency:
                        </p>
                        <p className="text-2xl font-bold" style={{ color: GoreanColors.gold }}>
                          {formatCurrency(stats.goldCoin, stats.silverCoin, stats.copperCoin)}
                        </p>
                      </div>

                      <p className="text-xs mt-3" style={{ color: GoreanColors.stone }}>
                        Last updated: {formatDate(stats.lastUpdated)}
                      </p>
                    </div>
                  ) : (
                    <p style={{ color: GoreanColors.stone }}>No stats available</p>
                  )}
                </div>

              </div>
            </div>
          </GoreanCard>

          {/* Skills Section */}
          {goreanStats && Array.isArray(goreanStats.skills) && goreanStats.skills.length > 0 && (
            <GoreanCard className="mb-6">
              <div className="p-6">
                <GoreanHeading level={3} className="mb-4">
                  Skills
                </GoreanHeading>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {goreanStats.skills.map((characterSkill, idx) => {
                    const skillDef = (skillsData as SkillData[]).find(s => s.id === characterSkill.skill_id);
                    return (
                      <div
                        key={idx}
                        className="border-2 rounded p-3"
                        style={{
                          borderColor: GoreanColors.leather,
                          backgroundColor: GoreanColors.cream
                        }}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="font-medium mb-1" style={{ color: GoreanColors.charcoal }}>
                              {characterSkill.skill_name}
                            </p>
                            {skillDef && (
                              <>
                                <GoreanBadge
                                  size="sm"
                                  color={getSkillTypeColor(skillDef.type)}
                                >
                                  {skillDef.type}
                                </GoreanBadge>
                                <p
                                  className="text-xs mt-2"
                                  style={{ color: GoreanColors.stone }}
                                >
                                  {skillDef.description}
                                </p>
                                {skillDef.hpBonus > 0 && (
                                  <p
                                    className="text-xs mt-1 font-semibold"
                                    style={{ color: GoreanColors.bloodRed }}
                                  >
                                    +{skillDef.hpBonus} HP per level
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                          <GoreanBadge color={GoreanColors.forestGreen} size="sm">
                            Lv {characterSkill.level}
                          </GoreanBadge>
                        </div>
                        {/* XP Progress */}
                        {skillDef && characterSkill.level < skillDef.maxLevel && (
                          <div className="mt-2">
                            <div
                              className="h-1.5 rounded-full overflow-hidden"
                              style={{ backgroundColor: GoreanColors.parchmentDark }}
                            >
                              <div
                                className="h-full transition-all duration-300"
                                style={{
                                  width: `${(characterSkill.xp / skillDef.xpCost[characterSkill.level]) * 100}%`,
                                  backgroundColor: GoreanColors.forestGreen
                                }}
                              />
                            </div>
                            <p className="text-xs mt-1 text-center" style={{ color: GoreanColors.stone }}>
                              {characterSkill.xp} / {skillDef.xpCost[characterSkill.level]} XP
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </GoreanCard>
          )}

          {/* Abilities Section */}
          {goreanStats && Array.isArray(goreanStats.abilities) && goreanStats.abilities.length > 0 && (
            <GoreanCard className="mb-6">
              <div className="p-6">
                <GoreanHeading level={3} className="mb-4">
                  Abilities
                </GoreanHeading>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {goreanStats.abilities.map((characterAbility, idx) => {
                    const abilityDef = (abilitiesData as AbilityData[]).find(a => a.id === characterAbility.ability_id);
                    return (
                      <div
                        key={idx}
                        className="border-2 rounded p-4"
                        style={{
                          borderColor: GoreanColors.leather,
                          backgroundColor: GoreanColors.cream
                        }}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <p className="font-bold text-lg mb-1" style={{ color: GoreanColors.charcoal }}>
                              {characterAbility.ability_name}
                            </p>
                            {abilityDef && (
                              <>
                                <div className="flex gap-2 mb-2 flex-wrap">
                                  <GoreanBadge
                                    size="sm"
                                    color={getAbilityCategoryColor(abilityDef.category)}
                                  >
                                    {abilityDef.category}
                                  </GoreanBadge>
                                  <GoreanBadge size="sm" color={GoreanColors.bronze}>
                                    Cost: {abilityDef.cost}
                                  </GoreanBadge>
                                  {abilityDef.cooldown && (
                                    <GoreanBadge size="sm" color={GoreanColors.stone}>
                                      Cooldown: {abilityDef.cooldown / 60}m
                                    </GoreanBadge>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          {characterAbility.uses !== undefined && (
                            <GoreanBadge color={GoreanColors.casteBlue} size="sm">
                              Used: {characterAbility.uses}x
                            </GoreanBadge>
                          )}
                        </div>

                        {abilityDef && (
                          <>
                            {/* Description */}
                            <p
                              className="text-sm mb-3"
                              style={{ color: GoreanColors.charcoal }}
                            >
                              {abilityDef.desc}
                            </p>

                            {/* Target Type and Range */}
                            <div className="flex gap-3 mb-2 text-xs">
                              {abilityDef.targetType && (
                                <div>
                                  <span className="font-semibold" style={{ color: GoreanColors.bronze }}>
                                    Target:
                                  </span>{' '}
                                  <span style={{ color: GoreanColors.stone }}>
                                    {abilityDef.targetType}
                                  </span>
                                </div>
                              )}
                              {abilityDef.range !== undefined && (
                                <div>
                                  <span className="font-semibold" style={{ color: GoreanColors.bronze }}>
                                    Range:
                                  </span>{' '}
                                  <span style={{ color: GoreanColors.stone }}>
                                    {abilityDef.range}m
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Requirements */}
                            {abilityDef.requirements && (
                              <div className="mt-2 text-xs">
                                <p className="font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                                  Requirements:
                                </p>
                                <ul className="list-disc list-inside" style={{ color: GoreanColors.stone }}>
                                  {abilityDef.requirements.minStat && (
                                    <li>
                                      {abilityDef.requirements.minStat.stat} {abilityDef.requirements.minStat.value}+
                                    </li>
                                  )}
                                  {abilityDef.requirements.skill && (
                                    <li>
                                      {abilityDef.requirements.skill.id} level {abilityDef.requirements.skill.level}+
                                    </li>
                                  )}
                                  {abilityDef.requirements.species && (
                                    <li>
                                      Species: {abilityDef.requirements.species.join(', ')}
                                    </li>
                                  )}
                                </ul>
                              </div>
                            )}

                            {/* Notes */}
                            {abilityDef.notes && (
                              <p
                                className="text-xs mt-2 italic"
                                style={{ color: GoreanColors.stone }}
                              >
                                {abilityDef.notes}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </GoreanCard>
          )}

          {/* Inventory Card */}
          <GoreanCard className="mb-6">
            <div className="p-6">
              <GoreanHeading level={3} className="mb-4">
                Inventory
              </GoreanHeading>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 rounded" style={{ backgroundColor: GoreanColors.parchmentDark }}>
                  <p className="text-3xl font-bold" style={{ color: GoreanColors.bronze }}>
                    {inventory.summary.totalItems}
                  </p>
                  <p className="text-sm" style={{ color: GoreanColors.charcoal }}>
                    Total Items
                  </p>
                </div>
                <div className="text-center p-3 rounded" style={{ backgroundColor: GoreanColors.parchmentDark }}>
                  <p className="text-3xl font-bold" style={{ color: GoreanColors.gold }}>
                    {inventory.summary.totalValue}c
                  </p>
                  <p className="text-sm" style={{ color: GoreanColors.charcoal }}>
                    Total Value
                  </p>
                </div>
              </div>

              {inventory.items.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3" style={{ color: GoreanColors.charcoal }}>
                    Recent Items (showing first 10):
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {inventory.items.map((item, index) => (
                      <div
                        key={index}
                        className="border-2 rounded p-2"
                        style={{
                          borderColor: GoreanColors.leather,
                          backgroundColor: GoreanColors.cream
                        }}
                      >
                        <p className="font-semibold text-sm" style={{ color: GoreanColors.charcoal }}>
                          {item.name}
                        </p>
                        <p className="text-xs" style={{ color: GoreanColors.stone }}>
                          Qty: {item.quantity} | {item.category}
                        </p>
                        <p className="text-xs" style={{ color: GoreanColors.gold }}>
                          {formatCurrency(item.priceGold, item.priceSilver, item.priceCopper)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </GoreanCard>

          {/* Events Card */}
          <GoreanCard>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <GoreanHeading level={3}>Recent Events</GoreanHeading>
                <select
                  value={eventsLimit}
                  onChange={(e) => {
                    setEventsLimit(parseInt(e.target.value));
                    setEventsPage(1);
                  }}
                  className="border-2 rounded px-3 py-1 text-sm"
                  style={{
                    borderColor: GoreanColors.leather,
                    backgroundColor: GoreanColors.cream,
                    color: GoreanColors.charcoal
                  }}
                >
                  <option value={10}>10 events</option>
                  <option value={20}>20 events</option>
                  <option value={50}>50 events</option>
                </select>
              </div>

              {events.data.length > 0 ? (
                <div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${GoreanColors.bronze}` }}>
                          <th className="px-4 py-2 text-left text-xs font-semibold" style={{ color: GoreanColors.charcoal }}>
                            Type
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold" style={{ color: GoreanColors.charcoal }}>
                            Details
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold" style={{ color: GoreanColors.charcoal }}>
                            Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.data.map((event, index) => (
                          <tr
                            key={event.id}
                            style={{
                              borderBottom: `1px solid ${GoreanColors.stoneLight}`,
                              backgroundColor: index % 2 === 0 ? GoreanColors.cream : 'transparent'
                            }}
                          >
                            <td className="px-4 py-3">
                              <GoreanBadge color={GoreanColors.bronze} size="sm">
                                {event.type}
                              </GoreanBadge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm">{renderEventDetails(event)}</div>
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: GoreanColors.stone }}>
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
                      <div className="text-sm" style={{ color: GoreanColors.charcoal }}>
                        Page {events.pagination.currentPage} of {events.pagination.totalPages} (
                        {events.pagination.totalEvents} total)
                      </div>
                      <div className="flex space-x-2">
                        <GoreanButton
                          onClick={() => setEventsPage(eventsPage - 1)}
                          disabled={!events.pagination.hasPrevPage}
                          variant="secondary"
                          size="sm"
                        >
                          Previous
                        </GoreanButton>
                        <GoreanButton
                          onClick={() => setEventsPage(eventsPage + 1)}
                          disabled={!events.pagination.hasNextPage}
                          variant="secondary"
                          size="sm"
                        >
                          Next
                        </GoreanButton>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: GoreanColors.stone }}>No events recorded</p>
              )}
            </div>
          </GoreanCard>
        </GoreanScroll>
        )}

        {/* Social Tab */}
        {activeTab === 'social' && (
          <div className="space-y-6">
            {groupsLoading ? (
              <div className="text-center py-8">
                <GoreanSpinner />
                <p className="mt-4" style={{ color: GoreanColors.charcoal }}>
                  Loading social groups...
                </p>
              </div>
            ) : (
              <>
                <UserGroupList
                  groupName="Allies"
                  members={groups.Allies || []}
                  onRemove={(goreanId) => handleRemoveMember('Allies', goreanId)}
                  onAddClick={() => openAddModal('Allies')}
                />
                <UserGroupList
                  groupName="Enemies"
                  members={groups.Enemies || []}
                  onRemove={(goreanId) => handleRemoveMember('Enemies', goreanId)}
                  onAddClick={() => openAddModal('Enemies')}
                />
              </>
            )}

            {/* Search Modal */}
            <UserSearchModal
              isOpen={searchModalOpen}
              groupName={activeGroupName}
              onClose={() => setSearchModalOpen(false)}
              onAdd={handleAddMember}
              onSearch={handleSearchUsers}
            />
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-sm mt-8" style={{ color: GoreanColors.stone }}>
          <p>Gorean RP Server - Character Profile System</p>
          <p>This secure link expires in 60 minutes</p>
        </footer>
      </div>
    </div>
  );
}
