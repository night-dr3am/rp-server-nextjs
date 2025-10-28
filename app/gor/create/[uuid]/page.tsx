'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  loadAllGoreanData,
  GoreanCharacterModel,
  SpeciesData,
  CultureData,
  StatusData,
  StatusSubtype,
  CasteData,
  TribalRole,
  RegionData,
  createInitialCharacterModel,
  calculateStatPointsSpent,
  DEFAULT_STAT_POINTS,
  MIN_STAT_VALUE,
  MAX_STAT_VALUE,
  getSpeciesById,
  getCultureById,
  validateCharacterModel
} from '@/lib/gorData';
import {
  GoreanHeading,
  GoreanButton,
  GoreanColors,
  GoreanSpinner,
  GoreanError,
  GoreanScroll
} from '@/components/gor/GoreanTheme';
import { SpeciesSelector } from '@/components/gor/SpeciesSelector';
import { CultureSelector } from '@/components/gor/CultureSelector';
import { StatusSelector } from '@/components/gor/StatusSelector';
import { CasteSelector } from '@/components/gor/CasteSelector';
import { StatAllocator } from '@/components/gor/StatAllocator';
import { SkillSelector } from '@/components/gor/SkillSelector';
import { CharacterReview } from '@/components/gor/CharacterReview';

export default function GoreanCharacterCreation() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const uuid = params?.uuid as string;
  const token = searchParams?.get('token');
  const universe = searchParams?.get('universe');

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidToken, setIsValidToken] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize character model
  const [characterModel, setCharacterModel] = useState<GoreanCharacterModel>(createInitialCharacterModel());

  // Load data and validate token on mount
  useEffect(() => {
    const initializeApp = async () => {
      if (!token || universe !== 'gor') {
        setError('Invalid or missing token');
        setLoading(false);
        return;
      }

      try {
        // Load Gorean data first
        await loadAllGoreanData();
        setDataLoaded(true);

        // Then validate token
        const encodedToken = encodeURIComponent(token);
        const response = await fetch(`/api/profile/validate?token=${encodedToken}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          setIsValidToken(true);
        } else {
          setError('Invalid or expired token');
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setError('Failed to load character creation data');
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, [token, universe]);

  // Helper functions for updating character model
  const updateIdentity = (field: keyof typeof characterModel.identity, value: string) => {
    setCharacterModel(prev => ({
      ...prev,
      identity: { ...prev.identity, [field]: value }
    }));
  };

  const updateSpecies = (species: SpeciesData) => {
    setCharacterModel(prev => ({
      ...prev,
      species: species.id,
      speciesCategory: species.category,
      // Reset culture-dependent selections
      culture: undefined,
      cultureType: undefined,
      status: undefined,
      statusSubtype: undefined,
      casteRole: undefined,
      casteRoleType: undefined
    }));
  };

  const updateCulture = (culture: CultureData) => {
    setCharacterModel(prev => ({
      ...prev,
      culture: culture.id,
      cultureType: culture.type,
      // Reset status and role selections when culture changes
      status: undefined,
      statusSubtype: undefined,
      casteRole: undefined,
      casteRoleType: undefined
    }));
  };

  const updateStatus = (status: StatusData, subtype?: string) => {
    setCharacterModel(prev => ({
      ...prev,
      status: status.id,
      statusSubtype: subtype, // Set subtype if provided
      // Reset role when status changes (status determines available roles)
      casteRole: undefined,
      casteRoleType: undefined
    }));
  };

  const updateCasteOrRole = (item: CasteData | TribalRole | StatusSubtype) => {
    // Determine if this is a caste (has 'color' or 'type'), tribal role (has 'responsibilities'), or status subtype
    const isCaste = 'color' in item || 'type' in item;
    const isStatusSubtype = 'desc' in item || ('description' in item && !('characteristics' in item));

    if (isStatusSubtype) {
      // This is a slave subtype - update statusSubtype instead of casteRole
      setCharacterModel(prev => ({
        ...prev,
        statusSubtype: item.id,
        casteRole: undefined,
        casteRoleType: undefined
      }));
    } else {
      // This is a caste or tribal role
      setCharacterModel(prev => ({
        ...prev,
        casteRole: item.id,
        casteRoleType: isCaste ? (item as CasteData).type : undefined
      }));
    }
  };

  const updateRegion = (region: RegionData) => {
    setCharacterModel(prev => ({
      ...prev,
      region: region.id
    }));
  };

  const updateHomeStoneName = (name: string) => {
    setCharacterModel(prev => ({
      ...prev,
      homeStoneName: name
    }));
  };

  const handleStatChange = (stat: keyof GoreanCharacterModel['stats'], delta: number) => {
    if (stat === 'pool' || stat === 'spent') return; // Don't allow direct pool/spent changes

    const newValue = characterModel.stats[stat] + delta;
    if (newValue >= MIN_STAT_VALUE && newValue <= MAX_STAT_VALUE) {
      const currentSpent = calculateStatPointsSpent(characterModel.stats);
      const currentStatCost = Math.max(0, characterModel.stats[stat] - 1);
      const newStatCost = Math.max(0, newValue - 1);
      const newSpent = currentSpent - currentStatCost + newStatCost;

      // Check if new allocation is within the available pool
      if (newSpent <= DEFAULT_STAT_POINTS) {
        setCharacterModel(prev => ({
          ...prev,
          stats: {
            ...prev.stats,
            [stat]: newValue,
            pool: DEFAULT_STAT_POINTS - newSpent,
            spent: newSpent
          }
        }));
      }
    }
  };

  const handleSkillsChange = (skills: GoreanCharacterModel['skills']) => {
    const spentPoints = skills.reduce((total, skill) => {
      const cost = (skill.level * (skill.level + 1)) / 2;
      return total + cost;
    }, 0);

    setCharacterModel(prev => ({
      ...prev,
      skills,
      skillsSpentPoints: spentPoints
    }));
  };

  // Step validation
  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 1: // Identity
        return !!(characterModel.identity.characterName && characterModel.identity.agentName);
      case 2: // Species
        return !!characterModel.species;
      case 3: // Culture
        return !!characterModel.culture;
      case 4: // Status
        return !!characterModel.status;
      case 5: // Caste/Role (optional)
        return true;
      case 6: // Region (optional)
        return true;
      case 7: // Stats
        return characterModel.stats.pool === 0;
      case 8: // Skills (optional)
        return true;
      case 9: // Review
        return true;
      default:
        return true;
    }
  };

  const goNext = () => {
    if (canGoNext() && currentStep < 9) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= 9) {
      setCurrentStep(step);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Submit character
  const handleSubmit = async () => {
    // Validate character model
    const validation = validateCharacterModel(characterModel);
    if (!validation.valid) {
      setError(`Validation errors:\n${validation.errors.join('\n')}`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Get species and culture details for submission
      const species = getSpeciesById(characterModel.species!);
      const culture = getCultureById(characterModel.culture!);

      // Prepare submission payload matching the API schema
      const payload = {
        // Identity
        characterName: characterModel.identity.characterName,
        agentName: characterModel.identity.agentName,
        title: characterModel.identity.title || '',
        background: characterModel.identity.background || '',

        // Species
        species: characterModel.species,
        speciesCategory: species?.category || '',
        speciesVariant: characterModel.speciesVariant || '',

        // Culture
        culture: characterModel.culture,
        cultureType: culture?.type || '',

        // Status
        status: characterModel.status,
        statusSubtype: characterModel.statusSubtype || '',

        // Caste/Role
        casteRole: characterModel.casteRole || '',
        casteRoleType: characterModel.casteRoleType || '',

        // Region
        region: characterModel.region || '',
        homeStoneName: characterModel.homeStoneName || '',

        // Stats
        strength: characterModel.stats.strength,
        agility: characterModel.stats.agility,
        intellect: characterModel.stats.intellect,
        perception: characterModel.stats.perception,
        charisma: characterModel.stats.charisma,

        // Skills
        skills: characterModel.skills,
        skillsAllocatedPoints: characterModel.skillsAllocatedPoints,
        skillsSpentPoints: characterModel.skillsSpentPoints,

        // Auth
        token,
        universe: 'gor'
      };

      const response = await fetch('/api/gor/character/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        // Redirect to profile page
        router.push(`/profile/${uuid}`);
      } else {
        setError(data.error || 'Failed to create character');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Failed to submit character:', error);
      setError('Failed to submit character. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Render step content
  const renderStep1 = () => (
    <GoreanScroll className="p-6">
      <GoreanHeading level={2} className="mb-6">Step 1: Identity</GoreanHeading>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: GoreanColors.bronze }}>
            Character Name * <span className="text-xs font-normal" style={{ color: GoreanColors.stone }}>(In-world name)</span>
          </label>
          <input
            type="text"
            value={characterModel.identity.characterName}
            onChange={(e) => updateIdentity('characterName', e.target.value)}
            placeholder="e.g., Tarl of Ko-ro-ba"
            className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none focus:ring-2"
            style={{
              borderColor: GoreanColors.stone,
              backgroundColor: GoreanColors.cream,
              color: GoreanColors.charcoal
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: GoreanColors.bronze }}>
            Agent Name * <span className="text-xs font-normal" style={{ color: GoreanColors.stone }}>(Display name)</span>
          </label>
          <input
            type="text"
            value={characterModel.identity.agentName}
            onChange={(e) => updateIdentity('agentName', e.target.value)}
            placeholder="e.g., Tarl, Warrior of the Scarlet"
            className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none focus:ring-2"
            style={{
              borderColor: GoreanColors.stone,
              backgroundColor: GoreanColors.cream,
              color: GoreanColors.charcoal
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: GoreanColors.bronze }}>
            Title <span className="text-xs font-normal" style={{ color: GoreanColors.stone }}>(Optional)</span>
          </label>
          <input
            type="text"
            value={characterModel.identity.title}
            onChange={(e) => updateIdentity('title', e.target.value)}
            placeholder="e.g., Captain of the Guard"
            className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none focus:ring-2"
            style={{
              borderColor: GoreanColors.stone,
              backgroundColor: GoreanColors.cream,
              color: GoreanColors.charcoal
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: GoreanColors.bronze }}>
            Background <span className="text-xs font-normal" style={{ color: GoreanColors.stone }}>(Optional)</span>
          </label>
          <textarea
            value={characterModel.identity.background}
            onChange={(e) => updateIdentity('background', e.target.value)}
            placeholder="Describe your character's history, origin, and backstory..."
            rows={4}
            className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none focus:ring-2 resize-none"
            style={{
              borderColor: GoreanColors.stone,
              backgroundColor: GoreanColors.cream,
              color: GoreanColors.charcoal
            }}
          />
        </div>
      </div>
    </GoreanScroll>
  );

  const renderStep2 = () => (
    <SpeciesSelector
      selectedSpecies={characterModel.species}
      onSelectSpecies={updateSpecies}
    />
  );

  const renderStep3 = () => (
    <CultureSelector
      selectedSpeciesId={characterModel.species}
      selectedCulture={characterModel.culture}
      onSelectCulture={updateCulture}
    />
  );

  const renderStep4 = () => (
    <StatusSelector
      selectedSpeciesId={characterModel.species}
      selectedStatus={characterModel.status}
      selectedStatusSubtype={characterModel.statusSubtype}
      onSelectStatus={updateStatus}
    />
  );

  const renderStep5 = () => (
    <CasteSelector
      selectedCultureId={characterModel.culture}
      selectedStatusId={characterModel.status}
      selectedCasteOrRole={characterModel.casteRole || characterModel.statusSubtype}
      onSelectCasteOrRole={updateCasteOrRole}
    />
  );

  const renderStep6 = () => (
    <GoreanScroll className="p-6">
      <GoreanHeading level={2} className="mb-6">Step 6: Region & Home Stone</GoreanHeading>
      <p className="text-sm mb-4" style={{ color: GoreanColors.stone }}>
        Choose your character&apos;s region of origin and home stone (optional).
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: GoreanColors.bronze }}>
            Region <span className="text-xs font-normal" style={{ color: GoreanColors.stone }}>(Optional)</span>
          </label>
          <select
            value={characterModel.region || ''}
            onChange={(e) => {
              if (e.target.value) {
                updateRegion({ id: e.target.value, name: e.target.value } as RegionData);
              }
            }}
            className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none focus:ring-2"
            style={{
              borderColor: GoreanColors.stone,
              backgroundColor: GoreanColors.cream,
              color: GoreanColors.charcoal
            }}
          >
            <option value="">Select Region...</option>
            <option value="ar">Ar Region</option>
            <option value="tahari">Tahari (Desert)</option>
            <option value="north">Northern Forests</option>
            <option value="vosk">Vosk River Region</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: GoreanColors.bronze }}>
            Home Stone Name <span className="text-xs font-normal" style={{ color: GoreanColors.stone }}>(Optional)</span>
          </label>
          <input
            type="text"
            value={characterModel.homeStoneName || ''}
            onChange={(e) => updateHomeStoneName(e.target.value)}
            placeholder="e.g., Ko-ro-ba, Ar, Torvaldsland"
            className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none focus:ring-2"
            style={{
              borderColor: GoreanColors.stone,
              backgroundColor: GoreanColors.cream,
              color: GoreanColors.charcoal
            }}
          />
        </div>
      </div>
    </GoreanScroll>
  );

  const renderStep7 = () => (
    <StatAllocator
      stats={characterModel.stats}
      onStatChange={handleStatChange}
    />
  );

  const renderStep8 = () => (
    <SkillSelector
      skills={characterModel.skills}
      allocatedPoints={characterModel.skillsAllocatedPoints}
      onSkillsChange={handleSkillsChange}
    />
  );

  const renderStep9 = () => (
    <CharacterReview
      characterModel={characterModel}
      onEdit={goToStep}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
    />
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      case 7: return renderStep7();
      case 8: return renderStep8();
      case 9: return renderStep9();
      default: return renderStep1();
    }
  };

  // Loading state (including data loading)
  if (loading || !dataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: GoreanColors.parchment }}>
        <div className="text-center">
          <GoreanSpinner size="lg" />
          <p className="mt-4 text-lg" style={{ color: GoreanColors.charcoal }}>
            Loading Gorean Character Creation...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: GoreanColors.parchment }}>
        <div className="max-w-md w-full">
          <GoreanError message={error || 'Invalid or expired token'} />
          <div className="text-center mt-4">
            <p className="text-sm" style={{ color: GoreanColors.stone }}>
              Please request a new character creation link from the in-world HUD.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main character creation UI
  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: GoreanColors.parchment }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <GoreanHeading level={1} decorative>
            Gorean Character Creation
          </GoreanHeading>
          <p className="mt-2" style={{ color: GoreanColors.stone }}>
            Create your character for the world of Gor
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold" style={{ color: GoreanColors.charcoal }}>
              Step {currentStep} of 9
            </span>
            <span className="text-sm" style={{ color: GoreanColors.stone }}>
              {Math.round((currentStep / 9) * 100)}% Complete
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: GoreanColors.parchmentDark }}>
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${(currentStep / 9) * 100}%`,
                backgroundColor: GoreanColors.bronze
              }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="mb-8">
          {renderCurrentStep()}
        </div>

        {/* Navigation Buttons */}
        {currentStep !== 9 && (
          <div className="flex gap-4 justify-between">
            <GoreanButton
              onClick={goBack}
              disabled={currentStep === 1}
              variant="secondary"
              size="lg"
            >
              ← Back
            </GoreanButton>
            <GoreanButton
              onClick={goNext}
              disabled={!canGoNext()}
              variant="primary"
              size="lg"
            >
              Next →
            </GoreanButton>
          </div>
        )}

        {/* Step Indicators */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {[
            'Identity',
            'Species',
            'Culture',
            'Status',
            'Caste/Role',
            'Region',
            'Stats',
            'Skills',
            'Review'
          ].map((stepName, index) => {
            const stepNumber = index + 1;
            const isActive = currentStep === stepNumber;
            const isComplete = currentStep > stepNumber;

            return (
              <button
                key={stepNumber}
                onClick={() => goToStep(stepNumber)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isActive ? 'shadow-lg' : 'shadow-sm hover:shadow-md'
                }`}
                style={{
                  backgroundColor: isActive
                    ? GoreanColors.bronze
                    : isComplete
                    ? GoreanColors.forestGreen
                    : GoreanColors.stone,
                  color: 'white',
                  opacity: isComplete || isActive ? 1 : 0.6
                }}
              >
                {stepNumber}. {stepName}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
