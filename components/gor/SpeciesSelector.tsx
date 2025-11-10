// Species Selector Component for Gorean Character Creation
import React, { useState, useMemo } from 'react';
import {
  SpeciesData,
  SpeciesCategory,
  getSpeciesByCategory,
  getSpeciesCategoryDisplayName,
  getSpeciesCategories
} from '@/lib/gorData';
import {
  GoreanCard,
  GoreanHeading,
  GoreanBadge,
  GoreanButton,
  GoreanColors,
  PopularityStars,
  getRarityColor,
  getRarityDisplayName
} from './GoreanTheme';

interface SpeciesSelectorProps {
  selectedSpecies: string | undefined;
  onSelectSpecies: (species: SpeciesData) => void;
  className?: string;
}

export function SpeciesSelector({ selectedSpecies, onSelectSpecies, className = '' }: SpeciesSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<SpeciesCategory>('sapient');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSpecies, setExpandedSpecies] = useState<string | null>(null);

  const categories = getSpeciesCategories();

  // Get species for active category
  const categorySpecies = useMemo(() => {
    return getSpeciesByCategory(activeCategory);
  }, [activeCategory]);

  // Filter species by search query
  const filteredSpecies = useMemo(() => {
    if (!searchQuery) return categorySpecies;

    const query = searchQuery.toLowerCase();
    return categorySpecies.filter(species =>
      species.name.toLowerCase().includes(query) ||
      species.description.toLowerCase().includes(query) ||
      species.id.toLowerCase().includes(query)
    );
  }, [categorySpecies, searchQuery]);

  const handleSpeciesClick = (species: SpeciesData) => {
    onSelectSpecies(species);
  };

  const toggleExpanded = (speciesId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSpecies(expandedSpecies === speciesId ? null : speciesId);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <GoreanHeading level={2}>Choose Your Species</GoreanHeading>
        <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
          Select the species for your character. Each species has unique traits and roleplay opportunities.
        </p>
      </div>

      {/* Search Box */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search species..."
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
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-stone hover:text-charcoal"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map(category => {
          const speciesCount = getSpeciesByCategory(category).length;
          const isActive = category === activeCategory;

          return (
            <button
              key={category}
              onClick={() => {
                setActiveCategory(category);
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                isActive ? 'shadow-lg' : 'shadow-md hover:shadow-lg'
              }`}
              style={{
                backgroundColor: isActive ? GoreanColors.bronze : GoreanColors.stone,
                color: GoreanColors.charcoal,
                transform: isActive ? 'scale(1.05)' : 'scale(1)'
              }}
            >
              {getSpeciesCategoryDisplayName(category)}
              <span className="ml-2 text-xs opacity-75">({speciesCount})</span>
            </button>
          );
        })}
      </div>

      {/* Species Grid */}
      {filteredSpecies.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg" style={{ color: GoreanColors.stone }}>
            No species found matching &quot;{searchQuery}&quot;
          </p>
          <GoreanButton onClick={() => setSearchQuery('')} className="mt-4">
            Clear Search
          </GoreanButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSpecies.map(species => {
            const isSelected = selectedSpecies === species.id;
            const isExpanded = expandedSpecies === species.id;

            return (
              <GoreanCard
                key={species.id}
                selected={isSelected}
                hoverable
                onClick={() => handleSpeciesClick(species)}
                className="p-4 relative"
              >
                {/* Header */}
                <div className="mb-3">
                  <div className="flex items-start justify-between mb-2">
                    <GoreanHeading level={4} className="flex-1">
                      {species.name}
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
                      color={getRarityColor(species.rarity)}
                    >
                      {getRarityDisplayName(species.rarity)}
                    </GoreanBadge>
                    <GoreanBadge size="sm" color={GoreanColors.stoneLight}>
                      {species.size}
                    </GoreanBadge>
                  </div>

                  {/* Popularity */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: GoreanColors.stone }}>
                      Popularity:
                    </span>
                    <PopularityStars rating={species.popularityRating} />
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm mb-3" style={{ color: GoreanColors.charcoal }}>
                  {species.description}
                </p>

                {/* Expandable Details */}
                {isExpanded && (
                  <div className="space-y-3 mb-3 pt-3 border-t-2" style={{ borderColor: GoreanColors.bronze }}>
                    {/* Physical Description */}
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                        Physical Description:
                      </p>
                      <p className="text-xs" style={{ color: GoreanColors.charcoal }}>
                        {species.physicalDesc}
                      </p>
                    </div>

                    {/* Playability Notes */}
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                        Roleplay Notes:
                      </p>
                      <p className="text-xs" style={{ color: GoreanColors.charcoal }}>
                        {species.playabilityNotes}
                      </p>
                    </div>

                    {/* Mechanical Notes */}
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                        Stat Modifiers:
                      </p>
                      <p className="text-xs" style={{ color: GoreanColors.charcoal }}>
                        {species.mechanicalNotes}
                      </p>
                    </div>

                    {/* Habitat */}
                    {species.habitat && species.habitat.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Habitat:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {species.habitat.map((h, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: GoreanColors.parchmentDark,
                                color: GoreanColors.charcoal
                              }}
                            >
                              {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Variants */}
                    {species.variants && species.variants.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Variants:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {species.variants.map((v, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: GoreanColors.parchmentDark,
                                color: GoreanColors.charcoal
                              }}
                            >
                              {v.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Book References */}
                    {species.bookReferences && species.bookReferences.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: GoreanColors.bronze }}>
                          Book References:
                        </p>
                        <p className="text-xs italic" style={{ color: GoreanColors.stone }}>
                          {species.bookReferences.join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Expand/Collapse Button */}
                <button
                  onClick={(e) => toggleExpanded(species.id, e)}
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
        <p>Need help choosing? Consider your desired roleplay style and character concept.</p>
        <p className="text-xs mt-1">
          Tip: &quot;Sapient&quot; species can use full caste system. Animal species have unique wild/feral roleplay.
        </p>
      </div>
    </div>
  );
}
