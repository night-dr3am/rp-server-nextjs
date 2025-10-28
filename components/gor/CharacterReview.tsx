// Character Review Component for Gorean Character Creation
import React from 'react';
import {
  GoreanCharacterModel,
  getSpeciesById,
  getCultureById,
  getStatusById,
  getCasteById,
  getTribalRoleById,
  getRegionById,
  calculateGoreanStatModifier,
  calculateHealthMax,
  calculateTotalSkillPoints
} from '@/lib/gorData';
import {
  GoreanHeading,
  GoreanBadge,
  GoreanButton,
  GoreanScroll,
  GoreanDivider,
  GoreanColors
} from './GoreanTheme';

interface CharacterReviewProps {
  characterModel: GoreanCharacterModel;
  onEdit: (step: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  className?: string;
}

export function CharacterReview({
  characterModel,
  onEdit,
  onSubmit,
  isSubmitting,
  className = ''
}: CharacterReviewProps) {
  const species = characterModel.species ? getSpeciesById(characterModel.species) : undefined;
  const culture = characterModel.culture ? getCultureById(characterModel.culture) : undefined;
  const status = characterModel.status ? getStatusById(characterModel.status) : undefined;

  // Get caste or tribal role info
  let casteRoleInfo: { name: string; color?: string } | undefined;
  if (characterModel.casteRole && culture) {
    if (culture.hasCastes) {
      const caste = getCasteById(characterModel.casteRole);
      if (caste) {
        casteRoleInfo = { name: caste.name, color: caste.color };
      }
    } else {
      const role = getTribalRoleById(culture.id, characterModel.casteRole);
      if (role) {
        casteRoleInfo = { name: role.name };
      }
    }
  }

  const region = characterModel.region ? getRegionById(characterModel.region) : undefined;
  const healthMax = calculateHealthMax(characterModel.stats.strength);
  const skillPointsSpent = calculateTotalSkillPoints(characterModel.skills);

  const getStatDisplay = (statName: string, value: number) => {
    const modifier = calculateGoreanStatModifier(value);
    const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
    return `${value} (${modifierStr})`;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="text-center">
        <GoreanHeading level={1} decorative>
          Character Review
        </GoreanHeading>
        <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
          Review your character before submitting. You can edit any section if needed.
        </p>
      </div>

      <GoreanScroll>
        {/* Identity Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <GoreanHeading level={3}>Identity</GoreanHeading>
            <GoreanButton onClick={() => onEdit(1)} size="sm" variant="secondary">
              Edit
            </GoreanButton>
          </div>
          <div className="space-y-2">
            <div>
              <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Character Name: </span>
              <span style={{ color: GoreanColors.charcoal }}>{characterModel.identity.characterName}</span>
            </div>
            <div>
              <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Agent Name: </span>
              <span style={{ color: GoreanColors.charcoal }}>{characterModel.identity.agentName}</span>
            </div>
            {characterModel.identity.title && (
              <div>
                <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Title: </span>
                <span style={{ color: GoreanColors.charcoal }}>{characterModel.identity.title}</span>
              </div>
            )}
            {characterModel.identity.background && (
              <div>
                <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Background: </span>
                <span style={{ color: GoreanColors.charcoal }}>{characterModel.identity.background}</span>
              </div>
            )}
          </div>
        </div>

        <GoreanDivider ornament />

        {/* Species Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <GoreanHeading level={3}>Species</GoreanHeading>
            <GoreanButton onClick={() => onEdit(2)} size="sm" variant="secondary">
              Edit
            </GoreanButton>
          </div>
          {species && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <GoreanHeading level={4}>{species.name}</GoreanHeading>
                <GoreanBadge size="sm" color={GoreanColors.stone}>
                  {species.category}
                </GoreanBadge>
              </div>
              <p className="text-sm" style={{ color: GoreanColors.charcoal }}>
                {species.description}
              </p>
              {characterModel.speciesVariant && (
                <div>
                  <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Variant: </span>
                  <span style={{ color: GoreanColors.charcoal }}>
                    {characterModel.speciesVariant.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <GoreanDivider ornament />

        {/* Culture & Origin Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <GoreanHeading level={3}>Culture & Origin</GoreanHeading>
            <GoreanButton onClick={() => onEdit(3)} size="sm" variant="secondary">
              Edit
            </GoreanButton>
          </div>
          {culture && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <GoreanHeading level={4}>{culture.name}</GoreanHeading>
                <GoreanBadge
                  size="sm"
                  color={culture.hasCastes ? GoreanColors.casteScarlet : GoreanColors.leather}
                >
                  {culture.hasCastes ? 'Caste System' : 'Tribal'}
                </GoreanBadge>
              </div>
              <p className="text-sm" style={{ color: GoreanColors.charcoal }}>
                {culture.description}
              </p>
            </div>
          )}
        </div>

        <GoreanDivider ornament />

        {/* Status Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <GoreanHeading level={3}>Status</GoreanHeading>
            <GoreanButton onClick={() => onEdit(4)} size="sm" variant="secondary">
              Edit
            </GoreanButton>
          </div>
          {status && (
            <div className="space-y-2">
              <GoreanHeading level={4}>{status.name}</GoreanHeading>
              <p className="text-sm" style={{ color: GoreanColors.charcoal }}>
                {status.description}
              </p>
              {characterModel.statusSubtype && (
                <div>
                  <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Subtype: </span>
                  <span style={{ color: GoreanColors.charcoal }}>
                    {characterModel.statusSubtype.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <GoreanDivider ornament />

        {/* Caste/Role Section */}
        {casteRoleInfo && (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <GoreanHeading level={3}>{culture?.hasCastes ? 'Caste' : 'Tribal Role'}</GoreanHeading>
                <GoreanButton onClick={() => onEdit(5)} size="sm" variant="secondary">
                  Edit
                </GoreanButton>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <GoreanHeading level={4}>{casteRoleInfo.name}</GoreanHeading>
                  {casteRoleInfo.color && (
                    <GoreanBadge size="sm" color={casteRoleInfo.color}>
                      {casteRoleInfo.name.split(' ')[0]} Caste
                    </GoreanBadge>
                  )}
                </div>
              </div>
            </div>
            <GoreanDivider ornament />
          </>
        )}

        {/* Region Section */}
        {region && (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <GoreanHeading level={3}>Region & Home Stone</GoreanHeading>
                <GoreanButton onClick={() => onEdit(6)} size="sm" variant="secondary">
                  Edit
                </GoreanButton>
              </div>
              <div className="space-y-2">
                <GoreanHeading level={4}>{region.name}</GoreanHeading>
                <p className="text-sm" style={{ color: GoreanColors.charcoal }}>
                  {region.description}
                </p>
                {characterModel.homeStoneName && (
                  <div>
                    <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Home Stone: </span>
                    <span style={{ color: GoreanColors.charcoal }}>{characterModel.homeStoneName}</span>
                  </div>
                )}
              </div>
            </div>
            <GoreanDivider ornament />
          </>
        )}

        {/* Stats Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <GoreanHeading level={3}>Stats & Health</GoreanHeading>
            <GoreanButton onClick={() => onEdit(7)} size="sm" variant="secondary">
              Edit
            </GoreanButton>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Strength:</span>
                <span style={{ color: GoreanColors.charcoal }}>
                  {getStatDisplay('Strength', characterModel.stats.strength)}
                </span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Agility:</span>
                <span style={{ color: GoreanColors.charcoal }}>
                  {getStatDisplay('Agility', characterModel.stats.agility)}
                </span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Intellect:</span>
                <span style={{ color: GoreanColors.charcoal }}>
                  {getStatDisplay('Intellect', characterModel.stats.intellect)}
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Perception:</span>
                <span style={{ color: GoreanColors.charcoal }}>
                  {getStatDisplay('Perception', characterModel.stats.perception)}
                </span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold" style={{ color: GoreanColors.bronze }}>Charisma:</span>
                <span style={{ color: GoreanColors.charcoal }}>
                  {getStatDisplay('Charisma', characterModel.stats.charisma)}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: GoreanColors.parchmentDark }}>
            <div className="flex items-center justify-between">
              <span className="font-semibold" style={{ color: GoreanColors.charcoal }}>Maximum Health:</span>
              <div className="flex items-center gap-2">
                <span className="text-xl">❤️</span>
                <span className="text-2xl font-bold" style={{ color: GoreanColors.bloodRed }}>
                  {healthMax}
                </span>
              </div>
            </div>
          </div>
        </div>

        <GoreanDivider ornament />

        {/* Skills Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <GoreanHeading level={3}>Skills</GoreanHeading>
            <GoreanButton onClick={() => onEdit(8)} size="sm" variant="secondary">
              Edit
            </GoreanButton>
          </div>
          {characterModel.skills.length === 0 ? (
            <p className="text-sm italic" style={{ color: GoreanColors.stone }}>
              No skills selected
            </p>
          ) : (
            <div className="space-y-2">
              {characterModel.skills.map(skill => (
                <div key={skill.skill_id} className="flex items-center justify-between">
                  <span className="font-semibold" style={{ color: GoreanColors.charcoal }}>
                    {skill.skill_name}
                  </span>
                  <GoreanBadge size="sm" color={GoreanColors.bronze}>
                    Level {skill.level}
                  </GoreanBadge>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t" style={{ borderColor: GoreanColors.stoneLight }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: GoreanColors.stone }}>Points Spent:</span>
                  <span className="font-semibold" style={{ color: GoreanColors.charcoal }}>
                    {skillPointsSpent} / {characterModel.skillsAllocatedPoints}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </GoreanScroll>

      {/* Submit Button */}
      <div className="text-center space-y-4">
        <GoreanButton
          onClick={onSubmit}
          disabled={isSubmitting}
          variant={isSubmitting ? 'disabled' : 'success'}
          size="lg"
          className="w-full md:w-auto px-12"
        >
          {isSubmitting ? 'Creating Character...' : '⚔ Finalize Character ⚔'}
        </GoreanButton>

        <p className="text-xs" style={{ color: GoreanColors.stone }}>
          By submitting, you confirm that all information is accurate and complete.
        </p>
      </div>
    </div>
  );
}
