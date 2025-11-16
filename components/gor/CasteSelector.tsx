// Caste/Tribal Role Selector Component for Gorean Character Creation
import React, { useState, useMemo } from 'react';
import {
  CasteData,
  TribalRole,
  StatusSubtype,
  getCultureById,
  getStatusById,
  getCastesForStatus,
  getTribalRolesForStatus,
  getSlaveSubtypesAsRoles,
  getSlaveTypeById
} from '@/lib/gorData';
import {
  GoreanCard,
  GoreanHeading,
  GoreanBadge,
  GoreanButton,
  GoreanColors
} from './GoreanTheme';

interface CasteSelectorProps {
  selectedCultureId: string | undefined;
  selectedStatusId: string | undefined;
  selectedSlaveType?: string | undefined; // Cultural variant (kajira, bondmaid, etc.)
  selectedCasteOrRole: string | undefined;
  onSelectCasteOrRole: (casteOrRole: CasteData | TribalRole | StatusSubtype) => void;
  onChangeSlaveType?: () => void; // Callback to allow changing the selected slave type
  className?: string;
}

export function CasteSelector({
  selectedCultureId,
  selectedStatusId,
  selectedSlaveType,
  selectedCasteOrRole,
  onSelectCasteOrRole,
  onChangeSlaveType,
  className = ''
}: CasteSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showHighCastes, setShowHighCastes] = useState(true);
  const [showLowCastes, setShowLowCastes] = useState(true);

  const culture = selectedCultureId ? getCultureById(selectedCultureId) : undefined;
  const status = selectedStatusId ? getStatusById(selectedStatusId) : undefined;
  const usesCastes = culture?.hasCastes || false;

  // Determine if this is a slave status (should show subtypes instead of castes/roles)
  const isSlaveStatus = status?.category === 'slave';

  // Get available castes, tribal roles, or slave subtypes based on status
  const { highCastes, lowCastes, tribalRoles, slaveSubtypes } = useMemo(() => {
    // If slave status, return slave subtypes instead of castes/roles
    if (isSlaveStatus && selectedStatusId) {
      return {
        highCastes: [],
        lowCastes: [],
        tribalRoles: [],
        slaveSubtypes: getSlaveSubtypesAsRoles(selectedStatusId)
      };
    }

    if (!culture || !selectedStatusId) {
      return { highCastes: [], lowCastes: [], tribalRoles: [], slaveSubtypes: [] };
    }

    if (usesCastes) {
      // Use status-based filtering for castes
      const filteredCastes = getCastesForStatus(selectedStatusId);
      const high = filteredCastes.filter(c => c.type === 'high');
      const low = filteredCastes.filter(c => c.type === 'low' || !c.type);

      return {
        highCastes: high,
        lowCastes: low,
        tribalRoles: [],
        slaveSubtypes: []
      };
    } else {
      // Use status-based filtering for tribal roles
      return {
        highCastes: [],
        lowCastes: [],
        tribalRoles: getTribalRolesForStatus(selectedStatusId, selectedCultureId!),
        slaveSubtypes: []
      };
    }
  }, [culture, selectedCultureId, selectedStatusId, usesCastes, isSlaveStatus]);

  // Filter castes/roles by search query
  const filteredHighCastes = useMemo(() => {
    if (!searchQuery) return highCastes;
    const query = searchQuery.toLowerCase();
    return highCastes.filter(caste =>
      caste.name.toLowerCase().includes(query) ||
      caste.description.toLowerCase().includes(query)
    );
  }, [highCastes, searchQuery]);

  const filteredLowCastes = useMemo(() => {
    if (!searchQuery) return lowCastes;
    const query = searchQuery.toLowerCase();
    return lowCastes.filter(caste =>
      caste.name.toLowerCase().includes(query) ||
      caste.description.toLowerCase().includes(query)
    );
  }, [lowCastes, searchQuery]);

  const filteredTribalRoles = useMemo(() => {
    if (!searchQuery) return tribalRoles;
    const query = searchQuery.toLowerCase();
    return tribalRoles.filter(role =>
      role.name.toLowerCase().includes(query) ||
      role.description.toLowerCase().includes(query)
    );
  }, [tribalRoles, searchQuery]);

  const filteredSlaveSubtypes = useMemo(() => {
    if (!searchQuery) return slaveSubtypes;
    const query = searchQuery.toLowerCase();
    return slaveSubtypes.filter(subtype =>
      subtype.name.toLowerCase().includes(query) ||
      (subtype.description || subtype.desc || '').toLowerCase().includes(query)
    );
  }, [slaveSubtypes, searchQuery]);

  const handleCasteClick = (caste: CasteData) => {
    onSelectCasteOrRole(caste);
  };

  const handleRoleClick = (role: TribalRole) => {
    onSelectCasteOrRole(role);
  };

  const handleSubtypeClick = (subtype: StatusSubtype) => {
    onSelectCasteOrRole(subtype);
  };

  const toggleExpanded = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedItem(expandedItem === id ? null : id);
  };

  if (!selectedCultureId || !selectedStatusId) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <p className="text-lg mb-2" style={{ color: GoreanColors.stone }}>
          Please select a culture and status first
        </p>
        <p className="text-sm" style={{ color: GoreanColors.stoneLight }}>
          Your culture and status determine available castes, tribal roles, or slave subtypes.
        </p>
      </div>
    );
  }

  // If slave status, show slave subtype selection UI
  if (isSlaveStatus) {
    // Get the selected slave type name for display
    const slaveTypeData = selectedSlaveType && selectedStatusId
      ? getSlaveTypeById(selectedStatusId, selectedSlaveType)
      : undefined;
    const slaveTypeName = slaveTypeData?.name || 'slave';

    return (
      <div className={`space-y-6 ${className}`}>
        {/* Header */}
        <div>
          <GoreanHeading level={2}>Choose Your Slave Subtype</GoreanHeading>
          <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
            {selectedSlaveType ? (
              <>As a <strong style={{ color: GoreanColors.bronze }}>{slaveTypeName}</strong>, select your specialization, training, and primary duties.</>
            ) : (
              'Slave subtypes define your specialization, training, and primary duties.'
            )}
          </p>
        </div>

        {/* Change Slave Type Button */}
        {selectedSlaveType && onChangeSlaveType && (
          <div
            className="p-3 rounded-lg border-2 flex items-center justify-between"
            style={{
              borderColor: GoreanColors.bronze,
              backgroundColor: GoreanColors.parchmentDark
            }}
          >
            <div>
              <span className="text-sm font-semibold" style={{ color: GoreanColors.charcoal }}>
                Selected Slave Type:
              </span>
              <span className="ml-2 text-sm font-bold" style={{ color: GoreanColors.bronze }}>
                {slaveTypeName}
              </span>
            </div>
            <button
              onClick={onChangeSlaveType}
              className="px-3 py-1 rounded text-sm font-semibold hover:opacity-80 transition-opacity flex items-center gap-1"
              style={{
                backgroundColor: GoreanColors.leather,
                color: GoreanColors.cream
              }}
            >
              ⟳ Change Slave Type
            </button>
          </div>
        )}

        {/* Search Box */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search slave subtypes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none focus:ring-2"
            style={{
              borderColor: GoreanColors.stone,
              backgroundColor: GoreanColors.cream,
              color: GoreanColors.charcoal
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2"
              style={{ color: GoreanColors.stone }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Slave Subtypes Grid */}
        {filteredSlaveSubtypes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg" style={{ color: GoreanColors.stone }}>
              {searchQuery ? `No subtypes found matching "${searchQuery}"` : 'No slave subtypes available'}
            </p>
            {searchQuery && (
              <GoreanButton onClick={() => setSearchQuery('')} className="mt-4">
                Clear Search
              </GoreanButton>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSlaveSubtypes.map(subtype => {
              const isSelected = selectedCasteOrRole === subtype.id;
              const isExpanded = expandedItem === subtype.id;

              return (
                <GoreanCard
                  key={subtype.id}
                  selected={isSelected}
                  hoverable
                  onClick={() => handleSubtypeClick(subtype)}
                  className="p-4"
                >
                  {/* Header */}
                  <div className="mb-3">
                    <div className="flex items-start justify-between mb-2">
                      <GoreanHeading level={5} className="flex-1">
                        {subtype.name}
                      </GoreanHeading>
                      {isSelected && (
                        <span className="text-xl ml-2" style={{ color: GoreanColors.bronze }}>
                          ✓
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm mb-2" style={{ color: GoreanColors.charcoal }}>
                    {subtype.description || subtype.desc}
                  </p>

                  {/* Expandable Details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t-2 space-y-2" style={{ borderColor: GoreanColors.bronze }}>
                      {subtype.training && (
                        <div>
                          <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                            Training:
                          </p>
                          <p className="text-xs" style={{ color: GoreanColors.charcoal }}>
                            {subtype.training}
                          </p>
                        </div>
                      )}
                      {subtype.notes && (
                        <div>
                          <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                            Notes:
                          </p>
                          <p className="text-xs" style={{ color: GoreanColors.charcoal }}>
                            {subtype.notes}
                          </p>
                        </div>
                      )}
                      {subtype.examples && subtype.examples.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                            Examples:
                          </p>
                          <p className="text-xs italic" style={{ color: GoreanColors.stone }}>
                            {subtype.examples.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expand/Collapse Button */}
                  {(subtype.training || subtype.notes || (subtype.examples && subtype.examples.length > 0)) && (
                    <button
                      onClick={(e) => toggleExpanded(subtype.id, e)}
                      className="text-xs font-semibold mt-2 flex items-center gap-1 hover:underline"
                      style={{ color: GoreanColors.bronze }}
                    >
                      {isExpanded ? '▲ Less' : '▼ More'}
                    </button>
                  )}
                </GoreanCard>
              );
            })}
          </div>
        )}

        {/* Help Text */}
        <div className="text-center text-sm" style={{ color: GoreanColors.stone }}>
          <p>
            Slave subtypes determine your primary role and training as a slave in Gorean society.
          </p>
        </div>
      </div>
    );
  }

  // Render Caste System UI
  if (usesCastes) {
    return (
      <div className={`space-y-6 ${className}`}>
        {/* Header */}
        <div>
          <GoreanHeading level={2}>Choose Your Caste</GoreanHeading>
          <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
            The Caste System defines your profession and social standing in Gorean society.
          </p>
        </div>

        {/* Search Box */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search castes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none focus:ring-2"
            style={{
              borderColor: GoreanColors.stone,
              backgroundColor: GoreanColors.cream,
              color: GoreanColors.charcoal
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2"
              style={{ color: GoreanColors.stone }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Toggle Sections */}
        <div className="flex gap-4">
          <GoreanButton
            onClick={() => setShowHighCastes(!showHighCastes)}
            variant={showHighCastes ? 'primary' : 'secondary'}
            size="sm"
          >
            {showHighCastes ? '▼' : '▶'} High Castes ({filteredHighCastes.length})
          </GoreanButton>
          <GoreanButton
            onClick={() => setShowLowCastes(!showLowCastes)}
            variant={showLowCastes ? 'primary' : 'secondary'}
            size="sm"
          >
            {showLowCastes ? '▼' : '▶'} Low Castes ({filteredLowCastes.length})
          </GoreanButton>
        </div>

        {/* High Castes */}
        {showHighCastes && filteredHighCastes.length > 0 && (
          <div>
            <GoreanHeading level={3} className="mb-4">High Castes</GoreanHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredHighCastes.map(caste => {
                const isSelected = selectedCasteOrRole === caste.id;
                const isExpanded = expandedItem === caste.id;
                const casteColor = caste.color || GoreanColors.stone;

                return (
                  <GoreanCard
                    key={caste.id}
                    selected={isSelected}
                    hoverable
                    onClick={() => handleCasteClick(caste)}
                    className="p-4"
                  >
                    {/* Color Bar */}
                    <div
                      className="h-2 rounded-t-lg mb-3 -mx-4 -mt-4"
                      style={{ backgroundColor: casteColor }}
                    />

                    {/* Header */}
                    <div className="mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <GoreanHeading level={5} className="flex-1">
                          {caste.name}
                        </GoreanHeading>
                        {isSelected && (
                          <span className="text-xl ml-2" style={{ color: GoreanColors.bronze }}>
                            ✓
                          </span>
                        )}
                      </div>

                      {/* Color Badge */}
                      {caste.color && (
                        <GoreanBadge size="sm" color={casteColor}>
                          {caste.name.split(' ')[0]} Color
                        </GoreanBadge>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-sm mb-2" style={{ color: GoreanColors.charcoal }}>
                      {caste.description}
                    </p>

                    {/* Expandable Details */}
                    {isExpanded && caste.characteristics && caste.characteristics.length > 0 && (
                      <div className="mt-3 pt-3 border-t-2" style={{ borderColor: GoreanColors.bronze }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Characteristics:
                        </p>
                        <ul className="text-xs list-disc list-inside" style={{ color: GoreanColors.charcoal }}>
                          {caste.characteristics.map((char, i) => (
                            <li key={i}>{char}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Expand/Collapse Button */}
                    {caste.characteristics && caste.characteristics.length > 0 && (
                      <button
                        onClick={(e) => toggleExpanded(caste.id, e)}
                        className="text-xs font-semibold mt-2 flex items-center gap-1 hover:underline"
                        style={{ color: GoreanColors.bronze }}
                      >
                        {isExpanded ? '▲ Less' : '▼ More'}
                      </button>
                    )}
                  </GoreanCard>
                );
              })}
            </div>
          </div>
        )}

        {/* Low Castes */}
        {showLowCastes && filteredLowCastes.length > 0 && (
          <div>
            <GoreanHeading level={3} className="mb-4">Low Castes</GoreanHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLowCastes.map(caste => {
                const isSelected = selectedCasteOrRole === caste.id;
                const isExpanded = expandedItem === caste.id;

                return (
                  <GoreanCard
                    key={caste.id}
                    selected={isSelected}
                    hoverable
                    onClick={() => handleCasteClick(caste)}
                    className="p-4"
                  >
                    {/* Header */}
                    <div className="mb-3">
                      <div className="flex items-start justify-between">
                        <GoreanHeading level={5} className="flex-1">
                          {caste.name}
                        </GoreanHeading>
                        {isSelected && (
                          <span className="text-xl ml-2" style={{ color: GoreanColors.bronze }}>
                            ✓
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm mb-2" style={{ color: GoreanColors.charcoal }}>
                      {caste.description}
                    </p>

                    {/* Expandable Details */}
                    {isExpanded && caste.characteristics && caste.characteristics.length > 0 && (
                      <div className="mt-3 pt-3 border-t-2" style={{ borderColor: GoreanColors.bronze }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Characteristics:
                        </p>
                        <ul className="text-xs list-disc list-inside" style={{ color: GoreanColors.charcoal }}>
                          {caste.characteristics.map((char, i) => (
                            <li key={i}>{char}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Expand/Collapse Button */}
                    {caste.characteristics && caste.characteristics.length > 0 && (
                      <button
                        onClick={(e) => toggleExpanded(caste.id, e)}
                        className="text-xs font-semibold mt-2 flex items-center gap-1 hover:underline"
                        style={{ color: GoreanColors.bronze }}
                      >
                        {isExpanded ? '▲ Less' : '▼ More'}
                      </button>
                    )}
                  </GoreanCard>
                );
              })}
            </div>
          </div>
        )}

        {/* No Results */}
        {searchQuery && filteredHighCastes.length === 0 && filteredLowCastes.length === 0 && (
          <div className="text-center py-12">
            <p className="text-lg" style={{ color: GoreanColors.stone }}>
              No castes found matching &quot;{searchQuery}&quot;
            </p>
            <GoreanButton onClick={() => setSearchQuery('')} className="mt-4">
              Clear Search
            </GoreanButton>
          </div>
        )}
      </div>
    );
  }

  // Render Tribal Roles UI
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <GoreanHeading level={2}>Choose Your Tribal Role</GoreanHeading>
        <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
          Tribal roles define your position and duties within your tribe.
        </p>
      </div>

      {/* Search Box */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search tribal roles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none focus:ring-2"
          style={{
            borderColor: GoreanColors.stone,
            backgroundColor: GoreanColors.cream,
            color: GoreanColors.charcoal
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2"
            style={{ color: GoreanColors.stone }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Tribal Roles Grid */}
      {filteredTribalRoles.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg" style={{ color: GoreanColors.stone }}>
            {searchQuery ? `No roles found matching "${searchQuery}"` : 'No tribal roles available for this culture'}
          </p>
          {searchQuery && (
            <GoreanButton onClick={() => setSearchQuery('')} className="mt-4">
              Clear Search
            </GoreanButton>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTribalRoles.map(role => {
            const isSelected = selectedCasteOrRole === role.id;
            const isExpanded = expandedItem === role.id;

            return (
              <GoreanCard
                key={role.id}
                selected={isSelected}
                hoverable
                onClick={() => handleRoleClick(role)}
                className="p-4"
              >
                {/* Header */}
                <div className="mb-3">
                  <div className="flex items-start justify-between mb-2">
                    <GoreanHeading level={5} className="flex-1">
                      {role.name}
                    </GoreanHeading>
                    {isSelected && (
                      <span className="text-xl ml-2" style={{ color: GoreanColors.bronze }}>
                        ✓
                      </span>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2">
                    {role.gender && (
                      <GoreanBadge size="sm" color={GoreanColors.stoneLight}>
                        {role.gender}
                      </GoreanBadge>
                    )}
                    {role.prestige && (
                      <GoreanBadge size="sm" color={GoreanColors.gold}>
                        Prestige
                      </GoreanBadge>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm mb-2" style={{ color: GoreanColors.charcoal }}>
                  {role.description}
                </p>

                {/* Expandable Details */}
                {isExpanded && role.responsibilities && (
                  <div className="mt-3 pt-3 border-t-2" style={{ borderColor: GoreanColors.bronze }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                      Responsibilities:
                    </p>
                    <p className="text-xs" style={{ color: GoreanColors.charcoal }}>
                      {role.responsibilities}
                    </p>
                  </div>
                )}

                {/* Expand/Collapse Button */}
                {role.responsibilities && (
                  <button
                    onClick={(e) => toggleExpanded(role.id, e)}
                    className="text-xs font-semibold mt-2 flex items-center gap-1 hover:underline"
                    style={{ color: GoreanColors.bronze }}
                  >
                    {isExpanded ? '▲ Less' : '▼ More'}
                  </button>
                )}
              </GoreanCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
