// Culture Selector Component for Gorean Character Creation
import React, { useState, useMemo } from 'react';
import {
  CultureData,
  getCulturesForSpecies,
  getCultureById
} from '@/lib/gorData';
import {
  GoreanCard,
  GoreanHeading,
  GoreanBadge,
  GoreanColors,
  PopularityStars
} from './GoreanTheme';

interface CultureSelectorProps {
  selectedSpeciesId: string | undefined;
  selectedCulture: string | undefined;
  onSelectCulture: (culture: CultureData) => void;
  className?: string;
}

export function CultureSelector({
  selectedSpeciesId,
  selectedCulture,
  onSelectCulture,
  className = ''
}: CultureSelectorProps) {
  const [expandedCulture, setExpandedCulture] = useState<string | null>(null);

  // Get cultures applicable to selected species
  const availableCultures = useMemo(() => {
    if (!selectedSpeciesId) return [];
    return getCulturesForSpecies(selectedSpeciesId);
  }, [selectedSpeciesId]);

  const handleCultureClick = (culture: CultureData) => {
    onSelectCulture(culture);
  };

  const toggleExpanded = (cultureId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCulture(expandedCulture === cultureId ? null : cultureId);
  };

  const getCultureTypeDisplayName = (type: string): string => {
    const typeNames: Record<string, string> = {
      cityState: 'City-State',
      northern: 'Northern',
      nomadic: 'Nomadic',
      marshForestJungle: 'Marsh/Forest/Jungle',
      special: 'Special',
      animal: 'Animal/Wild'
    };
    return typeNames[type] || type;
  };

  const getCultureTypeBadgeColor = (type: string): string => {
    const colorMap: Record<string, string> = {
      cityState: GoreanColors.bronze,
      northern: GoreanColors.deepBlue,
      nomadic: GoreanColors.leather,
      marshForestJungle: GoreanColors.forestGreen,
      special: GoreanColors.gold,
      animal: GoreanColors.stone
    };
    return colorMap[type] || GoreanColors.stone;
  };

  if (!selectedSpeciesId) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <p className="text-lg mb-2" style={{ color: GoreanColors.stone }}>
          Please select a species first
        </p>
        <p className="text-sm" style={{ color: GoreanColors.stoneLight }}>
          Different species have access to different cultures and origins.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <GoreanHeading level={2}>Choose Your Culture & Origin</GoreanHeading>
        <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
          Your culture determines your background, traditions, and social structure.
        </p>
      </div>

      {/* Cultures Grid */}
      {availableCultures.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg" style={{ color: GoreanColors.stone }}>
            No cultures available for selected species
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableCultures.map(culture => {
            const isSelected = selectedCulture === culture.id;
            const isExpanded = expandedCulture === culture.id;

            return (
              <GoreanCard
                key={culture.id}
                selected={isSelected}
                hoverable
                onClick={() => handleCultureClick(culture)}
                className="p-4 relative"
              >
                {/* Header */}
                <div className="mb-3">
                  <div className="flex items-start justify-between mb-2">
                    <GoreanHeading level={4} className="flex-1">
                      {culture.name}
                    </GoreanHeading>
                    {isSelected && (
                      <span className="text-2xl ml-2" style={{ color: GoreanColors.bronze }}>
                        ✓
                      </span>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    <GoreanBadge
                      size="sm"
                      color={getCultureTypeBadgeColor(culture.type)}
                    >
                      {getCultureTypeDisplayName(culture.type)}
                    </GoreanBadge>
                    <GoreanBadge
                      size="sm"
                      color={culture.hasCastes ? GoreanColors.casteScarlet : GoreanColors.leather}
                    >
                      {culture.hasCastes ? 'Caste System' : 'Tribal Roles'}
                    </GoreanBadge>
                  </div>

                  {/* Popularity */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: GoreanColors.stone }}>
                      Popularity:
                    </span>
                    <PopularityStars rating={culture.popularityRating} />
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm mb-3" style={{ color: GoreanColors.charcoal }}>
                  {culture.description}
                </p>

                {/* Expandable Details */}
                {isExpanded && (
                  <div className="space-y-3 mb-3 pt-3 border-t-2" style={{ borderColor: GoreanColors.bronze }}>
                    {/* Characteristics */}
                    {culture.characteristics && culture.characteristics.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Key Characteristics:
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          {culture.characteristics.map((char, idx) => (
                            <li key={idx} className="text-xs" style={{ color: GoreanColors.charcoal }}>
                              {char}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Examples (Cities or Tribes) */}
                    {culture.examples && culture.examples.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Examples:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {culture.examples.map((example, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: GoreanColors.parchmentDark,
                                color: GoreanColors.charcoal
                              }}
                            >
                              {example}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tribes (for tribal cultures) */}
                    {culture.tribes && culture.tribes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Major Tribes:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {culture.tribes.map((tribe, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: GoreanColors.parchmentDark,
                                color: GoreanColors.charcoal
                              }}
                            >
                              {tribe}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Roles (for tribal cultures) */}
                    {culture.roles && culture.roles.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Common Roles:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {culture.roles.map((role, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: GoreanColors.parchmentDark,
                                color: GoreanColors.charcoal
                              }}
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Gender Specific Info */}
                    {culture.gender && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Gender Note:
                        </p>
                        <p className="text-xs italic" style={{ color: GoreanColors.charcoal }}>
                          {culture.gender}
                        </p>
                      </div>
                    )}

                    {/* Book References */}
                    {culture.bookReferences && culture.bookReferences.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Book References:
                        </p>
                        <p className="text-xs italic" style={{ color: GoreanColors.stone }}>
                          {culture.bookReferences.join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Expand/Collapse Button */}
                <button
                  onClick={(e) => toggleExpanded(culture.id, e)}
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
          {availableCultures.some(c => c.hasCastes) && availableCultures.some(c => !c.hasCastes)
            ? 'City-State cultures use the Caste System. Tribal cultures have specific roles.'
            : availableCultures.some(c => c.hasCastes)
            ? 'These cultures use the traditional Gorean Caste System.'
            : 'These cultures use tribal role structures instead of castes.'}
        </p>
      </div>
    </div>
  );
}
