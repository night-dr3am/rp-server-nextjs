// Status Selector Component for Gorean Character Creation
import React, { useState, useMemo } from 'react';
import {
  StatusData,
  getStatusesForSpecies,
  getStatusById
} from '@/lib/gorData';
import {
  GoreanCard,
  GoreanHeading,
  GoreanBadge,
  GoreanColors,
  PopularityStars
} from './GoreanTheme';

interface StatusSelectorProps {
  selectedSpeciesId: string | undefined;
  selectedStatus: string | undefined;
  selectedStatusSubtype: string | undefined;
  onSelectStatus: (status: StatusData, subtype?: string) => void;
  className?: string;
}

export function StatusSelector({
  selectedSpeciesId,
  selectedStatus,
  selectedStatusSubtype,
  onSelectStatus,
  className = ''
}: StatusSelectorProps) {
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);
  const [selectedSubtypeTemp, setSelectedSubtypeTemp] = useState<string | undefined>(undefined);

  // Get statuses applicable to selected species
  const availableStatuses = useMemo(() => {
    if (!selectedSpeciesId) return [];
    return getStatusesForSpecies(selectedSpeciesId);
  }, [selectedSpeciesId]);

  const handleStatusClick = (status: StatusData) => {
    // If status has subtypes, expand it to show subtype selection
    if (status.subtypes && status.subtypes.length > 0) {
      setExpandedStatus(expandedStatus === status.id ? null : status.id);
      // Don't select yet - wait for subtype selection
    } else {
      // No subtypes, select directly
      onSelectStatus(status);
      setSelectedSubtypeTemp(undefined);
    }
  };

  const handleSubtypeClick = (status: StatusData, subtypeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectStatus(status, subtypeId);
    setSelectedSubtypeTemp(subtypeId);
  };

  const toggleExpanded = (statusId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedStatus(expandedStatus === statusId ? null : statusId);
  };

  const getStatusCategoryDisplayName = (category: string): string => {
    const categoryNames: Record<string, string> = {
      free: 'Free',
      slave: 'Slave',
      special: 'Special',
      animal: 'Animal'
    };
    return categoryNames[category] || category;
  };

  const getStatusCategoryBadgeColor = (category: string): string => {
    const colorMap: Record<string, string> = {
      free: GoreanColors.bronze,
      slave: GoreanColors.casteScarlet,
      special: GoreanColors.gold,
      animal: GoreanColors.stone
    };
    return colorMap[category] || GoreanColors.stone;
  };

  if (!selectedSpeciesId) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <p className="text-lg mb-2" style={{ color: GoreanColors.stone }}>
          Please select a species first
        </p>
        <p className="text-sm" style={{ color: GoreanColors.stoneLight }}>
          Different species have access to different legal and social statuses.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <GoreanHeading level={2}>Choose Your Legal & Social Status</GoreanHeading>
        <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
          Your status determines your rights, restrictions, and role options in Gorean society.
        </p>
      </div>

      {/* Statuses Grid */}
      {availableStatuses.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg" style={{ color: GoreanColors.stone }}>
            No statuses available for selected species
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableStatuses.map(status => {
            const isSelected = selectedStatus === status.id;
            const isExpanded = expandedStatus === status.id;
            const hasSubtypes = status.subtypes && status.subtypes.length > 0;

            return (
              <GoreanCard
                key={status.id}
                selected={isSelected}
                hoverable
                onClick={() => handleStatusClick(status)}
                className="p-4 relative"
              >
                {/* Header */}
                <div className="mb-3">
                  <div className="flex items-start justify-between mb-2">
                    <GoreanHeading level={4} className="flex-1">
                      {status.name}
                    </GoreanHeading>
                    {isSelected && !hasSubtypes && (
                      <span className="text-2xl ml-2" style={{ color: GoreanColors.bronze }}>
                        ✓
                      </span>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    <GoreanBadge
                      size="sm"
                      color={getStatusCategoryBadgeColor(status.category)}
                    >
                      {getStatusCategoryDisplayName(status.category)}
                    </GoreanBadge>
                    {hasSubtypes && (
                      <GoreanBadge
                        size="sm"
                        color={GoreanColors.leather}
                      >
                        {status.subtypes!.length} Subtypes
                      </GoreanBadge>
                    )}
                  </div>

                  {/* Popularity */}
                  {status.popularityRating && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: GoreanColors.stone }}>
                        Popularity:
                      </span>
                      <PopularityStars rating={status.popularityRating} />
                    </div>
                  )}
                </div>

                {/* Description */}
                <p className="text-sm mb-3" style={{ color: GoreanColors.charcoal }}>
                  {status.description}
                </p>

                {/* Subtypes Selection (if status has subtypes) */}
                {hasSubtypes && isExpanded && (
                  <div className="space-y-2 mb-3 pt-3 border-t-2" style={{ borderColor: GoreanColors.bronze }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: GoreanColors.bronze }}>
                      Select Subtype:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {status.subtypes!.map(subtype => {
                        const isSubtypeSelected = isSelected && selectedStatusSubtype === subtype.id;
                        return (
                          <div
                            key={subtype.id}
                            onClick={(e) => handleSubtypeClick(status, subtype.id, e)}
                            className="p-2 rounded border-2 cursor-pointer hover:shadow-md transition-all"
                            style={{
                              borderColor: isSubtypeSelected ? GoreanColors.bronze : GoreanColors.parchmentDark,
                              backgroundColor: isSubtypeSelected ? GoreanColors.parchmentDark : GoreanColors.parchment
                            }}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-sm font-semibold mb-1" style={{ color: GoreanColors.charcoal }}>
                                  {subtype.name}
                                </p>
                                <p className="text-xs" style={{ color: GoreanColors.stone }}>
                                  {subtype.description || subtype.desc}
                                </p>
                              </div>
                              {isSubtypeSelected && (
                                <span className="text-lg ml-2" style={{ color: GoreanColors.bronze }}>
                                  ✓
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expandable Details */}
                {isExpanded && (
                  <div className="space-y-3 mb-3 pt-3 border-t-2" style={{ borderColor: GoreanColors.bronze }}>
                    {/* Rights */}
                    {status.rights && status.rights.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Rights:
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          {status.rights.map((right, idx) => (
                            <li key={idx} className="text-xs" style={{ color: GoreanColors.charcoal }}>
                              {right}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Restrictions */}
                    {status.restrictions && status.restrictions.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.casteScarlet }}>
                          Restrictions:
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          {status.restrictions.map((restriction, idx) => (
                            <li key={idx} className="text-xs" style={{ color: GoreanColors.charcoal }}>
                              {restriction}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Characteristics */}
                    {status.characteristics && status.characteristics.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Key Characteristics:
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          {status.characteristics.map((char, idx) => (
                            <li key={idx} className="text-xs" style={{ color: GoreanColors.charcoal }}>
                              {char}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Notes */}
                    {status.notes && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Notes:
                        </p>
                        <p className="text-xs italic" style={{ color: GoreanColors.charcoal }}>
                          {status.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Expand/Collapse Button */}
                <button
                  onClick={(e) => toggleExpanded(status.id, e)}
                  className="text-xs font-semibold mt-2 flex items-center gap-1 hover:underline"
                  style={{ color: GoreanColors.bronze }}
                >
                  {isExpanded ? '▲ Less Info' : '▼ More Info'}
                </button>
              </GoreanCard>
            );
          })}
        </div>
      )}

      {/* Help Text */}
      <div className="text-center text-sm" style={{ color: GoreanColors.stone }}>
        <p>
          {availableStatuses.some(s => s.subtypes && s.subtypes.length > 0)
            ? 'Some statuses have subtypes. Click to expand and select a specific subtype.'
            : 'Select the status that best fits your character concept.'}
        </p>
      </div>
    </div>
  );
}
