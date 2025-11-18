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
  skills: unknown;
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

        <GoreanScroll>
          {/* Character Info Card */}
          <GoreanCard className="mb-6">
            <div className="p-6">
              <div className="flex items-start space-x-6">
                {/* Avatar */}
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${GoreanColors.bronze}, ${GoreanColors.bronzeDark})`,
                    boxShadow: `0 4px 12px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.3)`
                  }}
                >
                  <span className="text-4xl font-bold text-white">
                    {(goreanStats?.characterName || user.username).charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Character Details */}
                <div className="flex-1">
                  <GoreanHeading level={2} className="mb-3">
                    {goreanStats?.characterName || user.username}
                  </GoreanHeading>

                  {goreanStats && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2 items-center">
                        <GoreanBadge color={GoreanColors.leather} size="md">
                          {goreanStats.species}
                          {goreanStats.speciesVariant && ` • ${goreanStats.speciesVariant}`}
                        </GoreanBadge>

                        {statusInfo && (
                          <GoreanBadge color={statusInfo.color} size="md">
                            {statusInfo.label}
                            {goreanStats.statusSubtype && ` • ${goreanStats.statusSubtype}`}
                          </GoreanBadge>
                        )}

                        {goreanStats.casteRole && (
                          <GoreanBadge color={GoreanColors.bronze} size="md">
                            {goreanStats.casteRole}
                          </GoreanBadge>
                        )}

                        {goreanStats.slaveType && (
                          <GoreanBadge color={GoreanColors.bloodRed} size="md">
                            {goreanStats.slaveType}
                          </GoreanBadge>
                        )}
                      </div>

                      {goreanStats.culture && (
                        <p className="text-sm" style={{ color: GoreanColors.charcoal }}>
                          <span className="font-semibold">Culture:</span> {goreanStats.culture}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-4 text-xs space-y-1" style={{ color: GoreanColors.stone }}>
                    <p>
                      <span className="font-semibold">Player Role:</span> {user.role}
                    </p>
                    <p>
                      <span className="font-semibold">Joined:</span> {formatDate(user.createdAt)}
                    </p>
                    <p>
                      <span className="font-semibold">Last Active:</span> {formatDate(user.lastActive)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </GoreanCard>

          {/* Stats Card */}
          <GoreanCard className="mb-6">
            <div className="p-6">
              <GoreanHeading level={3} className="mb-4">
                Character Statistics
              </GoreanHeading>

              {stats && goreanStats ? (
                <div className="space-y-4">
                  {/* Stat Bars */}
                  <HealthBar
                    current={stats.health}
                    max={goreanStats.maxHealth}
                    className="mb-3"
                  />
                  <HungerBar
                    current={stats.hunger}
                    max={goreanStats.maxHunger}
                    className="mb-3"
                  />
                  <ThirstBar
                    current={stats.thirst}
                    max={goreanStats.maxThirst}
                    className="mb-3"
                  />

                  {/* Currency */}
                  <div className="pt-3 mt-3" style={{ borderTop: `2px solid ${GoreanColors.bronze}` }}>
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
          </GoreanCard>

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

        {/* Footer */}
        <footer className="text-center text-sm mt-8" style={{ color: GoreanColors.stone }}>
          <p>Gorean RP Server - Character Profile System</p>
          <p>This secure link expires in 60 minutes</p>
        </footer>
      </div>
    </div>
  );
}
