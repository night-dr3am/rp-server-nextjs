'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  RACES,
  STAT_NAMES,
  STAT_DESCRIPTIONS,
  calculateStatModifier,
  type RaceName,
  type CharacterModel,
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
  powerPointsSpentTotal,
  powerPointsTotal,
  getTechnomancySchoolId,
  getSchoolWeaves,
  getSchoolIdsForArcanist,
  getSchoolName,
  getWeaveName
} from '@/lib/arkanaData';

export default function ArkanaCharacterCreation() {
  const params = useParams();
  const searchParams = useSearchParams();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const uuid = params?.uuid as string; // Reserved for future validation
  const token = searchParams?.get('token');
  const universe = searchParams?.get('universe');

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidToken, setIsValidToken] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Use the CharacterModel structure from arkana-data-main
  const [characterModel, setCharacterModel] = useState<CharacterModel>({
    page: 1,
    identity: {
      characterName: '',
      agentName: '',
      aliasCallsign: '',
      faction: '',
      conceptRole: '',
      job: '',
      background: ''
    },
    race: '',
    arch: '',
    stats: {
      phys: 1,
      dex: 1,
      mental: 1,
      perc: 1,
      pool: 6
    },
    cyberSlots: 0,
    flaws: new Set<string>(),
    picks: new Set<string>(),
    magicSchools: new Set<string>(),
    page5tab: 'common',
    freeMagicSchool: '',
    freeMagicWeave: '',
    synthralFreeWeave: ''
  });

  // Data caches
  const [availableFlaws, setAvailableFlaws] = useState<Flaw[]>([]);
  const [availablePerks, setAvailablePerks] = useState<Perk[]>([]);
  const [availableCommonPowers, setAvailableCommonPowers] = useState<CommonPower[]>([]);
  const [availableArchPowers, setAvailableArchPowers] = useState<ArchetypePower[]>([]);
  const [availableCybernetics, setAvailableCybernetics] = useState<Cybernetic[]>([]);
  const [availableMagicSchools, setAvailableMagicSchools] = useState<Record<string, MagicSchool[]>>({});

  // UI state for collapsible sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Initialize all magic school sections as expanded when data loads
  useEffect(() => {
    if (Object.keys(availableMagicSchools).length > 0) {
      setExpandedSections(new Set(Object.keys(availableMagicSchools)));
    }
  }, [availableMagicSchools]);

  // Load data and validate token on mount
  useEffect(() => {
    const initializeApp = async () => {
      if (!token || universe !== 'arkana') {
        setError('Invalid or missing token');
        setLoading(false);
        return;
      }

      try {
        // Load arkana data first
        await loadAllData();
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

  // Update available options when race/archetype changes
  useEffect(() => {
    if (!dataLoaded || !characterModel.race) return;

    const updateAvailableOptions = () => {
      setAvailableFlaws(flawsForRace(characterModel.race, characterModel.arch));
      setAvailablePerks(perksForRace(characterModel.race, characterModel.arch));
      setAvailableCommonPowers(commonPowersForRace(characterModel.race));
      setAvailableArchPowers(archPowersForRaceArch(characterModel.race, characterModel.arch));
      setAvailableCybernetics(cyberneticsAll());

      if (canUseMagic(characterModel.race, characterModel.arch)) {
        setAvailableMagicSchools(magicSchoolsAllGrouped(characterModel.race, characterModel.arch));
      } else {
        setAvailableMagicSchools({});
      }
    };

    updateAvailableOptions();
  }, [dataLoaded, characterModel.race, characterModel.arch]);

  // Helper functions for updating character model
  const updateIdentity = (field: keyof typeof characterModel.identity, value: string) => {
    setCharacterModel(prev => ({
      ...prev,
      identity: { ...prev.identity, [field]: value }
    }));
  };

  const updateRace = (race: string) => {
    // Spliced race gets 2 free stat points (first point in Physical and Dexterity)
    // Normal races: 10 total - 4 (for starting at 1 each) = 6 pool
    // Spliced race: 10 total - 4 + 2 free = 8 pool
    const isSpliced = race.toLowerCase() === 'spliced';
    const initialPool = isSpliced ? 8 : 6;

    setCharacterModel(prev => ({
      ...prev,
      race,
      arch: '', // Reset archetype when race changes

      // Reset stats to base values (all start at 1, but pool differs by race)
      stats: { phys: 1, dex: 1, mental: 1, perc: 1, pool: initialPool },

      // Reset flaws (page 4)
      flaws: new Set<string>(),

      // Reset page 5 choices
      picks: new Set<string>(),
      magicSchools: new Set<string>(),
      cyberSlots: 0,

      // Reset free selections
      freeMagicSchool: '',
      freeMagicWeave: '',
      synthralFreeWeave: ''
    }));
  };

  const updateArchetype = (arch: string) => {
    setCharacterModel(prev => ({
      ...prev,
      arch,
      picks: new Set<string>(),
      magicSchools: new Set<string>(),
      freeMagicSchool: '',
      freeMagicWeave: '',
      synthralFreeWeave: ''
    }));
  };

  // Helper function to get initial pool for race (Spliced gets 8, others get 6)
  const getInitialPoolForRace = (race: string = characterModel.race): number => {
    return race.toLowerCase() === 'spliced' ? 8 : 6;
  };

  // Helper function to check if race is Spliced
  const isSplicedRace = (race: string = characterModel.race): boolean => {
    return race.toLowerCase() === 'spliced';
  };

  // Helper function to calculate raw stat points spent (no bonus adjustments)
  const calculateStatPointsSpent = (stats = characterModel.stats): number => {
    return Math.max(0, stats.phys - 1) +
           Math.max(0, stats.dex - 1) +
           Math.max(0, stats.mental - 1) +
           Math.max(0, stats.perc - 1);
  };

  const handleStatChange = (stat: keyof typeof characterModel.stats, delta: number) => {
    if (stat === 'pool') return; // Don't allow direct pool changes

    const newValue = characterModel.stats[stat] + delta;
    if (newValue >= 1 && newValue <= 5) {
      // Calculate raw spent points (no bonus adjustments)
      const currentSpent = calculateStatPointsSpent();
      const currentStatCost = Math.max(0, characterModel.stats[stat] - 1);
      const newStatCost = Math.max(0, newValue - 1);
      const newSpent = currentSpent - currentStatCost + newStatCost;

      const initialPool = getInitialPoolForRace();

      // Check if new allocation is within the available pool
      if (newSpent <= initialPool) {
        setCharacterModel(prev => ({
          ...prev,
          stats: {
            ...prev.stats,
            [stat]: newValue,
            pool: initialPool - newSpent
          }
        }));
      }
    }
  };

  // Power Point calculation functions (separate from stat points)
  const getPowerPointsTotal = () => powerPointsTotal(characterModel);
  const getPowerPointsSpent = () => powerPointsSpentTotal(characterModel);
  const getPowerPointsRemaining = () => getPowerPointsTotal() - getPowerPointsSpent();

  // Discord webhook URL from the sample
  const DISCORD_WEBHOOK_URL = "https://discordapp.com/api/webhooks/1419119617573388348/MDsOewugKvquE0Sowp3LHSO6e_Tngue5lO6Z8ucFhwj6ZbQPn6RLD7L69rPOpYVwFSXW";

  // Format character data for Discord webhook
  const formatCharacterForDiscord = () => {
    // Power points system
    const totalPowerPoints = getPowerPointsTotal();
    const spentPowerPoints = getPowerPointsSpent();
    const remainingPowerPoints = getPowerPointsRemaining();
    const flawPointsGained = totalPowerPoints - 15;

    // Stat points system
    const statPointsSpent = calculateStatPointsSpent();

    // Breakdown of power points spent
    const cyberSlotPts = (characterModel.cyberSlots || 0) * 2;
    const powersPts = spentPowerPoints - cyberSlotPts;

    const flawsSummary = Array.from(characterModel.flaws).map(flawId =>
      availableFlaws.find(f => f.id === flawId)?.name || flawId
    ).filter(Boolean);

    const powersSummary = Array.from(characterModel.picks).map(pickId => {
      const power = availableCommonPowers.find(p => p.id === pickId)?.name ||
                   availablePerks.find(p => p.id === pickId)?.name ||
                   availableArchPowers.find(p => p.id === pickId)?.name ||
                   availableCybernetics.find(p => p.id === pickId)?.name;
      return power;
    }).filter(Boolean);

    const magicSchoolsSummary = Array.from(characterModel.magicSchools).map(schoolId => {
      const schools = Object.values(availableMagicSchools).flat();
      return schools.find(s => s.id === schoolId)?.name || schoolId;
    }).filter(Boolean);

    const freeMagicSchoolName = characterModel.freeMagicSchool ? getSchoolName(characterModel.freeMagicSchool) : '';
    const freeMagicWeaveName = characterModel.freeMagicWeave ? getWeaveName(characterModel.freeMagicWeave) : '';
    const synthralFreeWeaveName = characterModel.synthralFreeWeave ? getWeaveName(characterModel.synthralFreeWeave) : '';

    let message =
      `**Arkana Character Submission**\n` +
      `**Character Name:** ${characterModel.identity.characterName || '-'}\n` +
      `**Second Life Name:** ${characterModel.identity.agentName || '-'}\n` +
      `**Alias / Callsign:** ${characterModel.identity.aliasCallsign || '-'}\n` +
      `**Faction / Allegiance:** ${characterModel.identity.faction || '-'}\n` +
      `**Concept / Role:** ${characterModel.identity.conceptRole || '-'}\n` +
      `**Job:** ${characterModel.identity.job || '-'}\n` +
      `**Race / Archetype:** ${characterModel.race || '-'} / ${characterModel.arch || '-'}\n` +
      `**Stats:** Phys ${characterModel.stats.phys} (HP ${characterModel.stats.phys * 5}), Dex ${characterModel.stats.dex}, Mental ${characterModel.stats.mental}, Perc ${characterModel.stats.perc} (Stat Points spent: ${statPointsSpent})\n` +
      `**Flaws:** ${flawsSummary.length ? flawsSummary.join(', ') : 'None'} (Power Points gained: ${flawPointsGained})\n` +
      `**Common Powers/Perks/Arch/Cyber:** ${powersSummary.length ? powersSummary.join(', ') : 'None'} (Power Points spent: ${powersPts})\n` +
      `**Cybernetic Slots:** ${characterModel.cyberSlots || 0} (Power Points spent: ${cyberSlotPts})\n` +
      `**Magic Schools:** ${magicSchoolsSummary.length ? magicSchoolsSummary.join(', ') : 'None'}\n` +
      `**Power Points Budget:** ${totalPowerPoints} total • ${spentPowerPoints} spent • ${remainingPowerPoints} remaining\n`;

    if (freeMagicSchoolName) message += `**Free Magic School:** ${freeMagicSchoolName}\n`;
    if (freeMagicWeaveName) message += `**Free Magic Weave:** ${freeMagicWeaveName}\n`;
    if (synthralFreeWeaveName) message += `**Synthral Free Weave:** ${synthralFreeWeaveName}\n`;

    message += `**Background:** ${characterModel.identity.background || '-'}\n`;

    return message;
  };

  // Send character data to Discord webhook
  const sendToDiscord = async () => {
    try {
      const content = formatCharacterForDiscord();
      await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ content })
      });
      console.log('Character data sent to Discord successfully');
    } catch (error) {
      console.error('Failed to send to Discord:', error);
      // Don't block character creation if Discord fails
    }
  };

  const submitCharacter = async () => {
    try {
      setLoading(true);

      // Send to Discord webhook first (non-blocking)
      await sendToDiscord();

      // Convert character model to submission format
      const submissionData = {
        // Identity fields
        characterName: characterModel.identity.characterName || '',
        agentName: characterModel.identity.agentName || '',
        aliasCallsign: characterModel.identity.aliasCallsign || '',
        faction: characterModel.identity.faction || '',
        conceptRole: characterModel.identity.conceptRole || '',
        job: characterModel.identity.job || '',
        background: characterModel.identity.background || '',

        // Lineage
        race: characterModel.race,
        archetype: characterModel.arch,

        // Stats (convert to old naming for API compatibility)
        physical: characterModel.stats.phys,
        dexterity: characterModel.stats.dex,
        mental: characterModel.stats.mental,
        perception: characterModel.stats.perc,

        // Convert Sets to Arrays for submission
        flaws: Array.from(characterModel.flaws),
        picks: Array.from(characterModel.picks),
        magicSchools: Array.from(characterModel.magicSchools),

        // Additional arkana-data-main specific fields
        cyberSlots: characterModel.cyberSlots,
        freeMagicSchool: characterModel.freeMagicSchool,
        freeMagicWeave: characterModel.freeMagicWeave,
        synthralFreeWeave: characterModel.synthralFreeWeave,

        // System fields
        token,
        universe: 'arkana'
      };

      const response = await fetch('/api/arkana/character/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData)
      });

      if (response.ok) {
        await response.json();
        alert('Your Arkana Character is created successfully! Please go back to the game and touch your Arkana HUD to refresh your stats.');
        // Close the page after user confirms the alert
        window.close();
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to create character');
      }
    } catch {
      setError('Failed to create character');
    } finally {
      setLoading(false);
    }
  };

  if (loading || !dataLoaded) {
    return (
      <div className="min-h-screen bg-black text-cyan-400 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-xl">
            {!dataLoaded ? 'Loading Character Data...' : 'Initializing Character Creation...'}
          </p>
        </div>
      </div>
    );
  }

  if (error || !isValidToken) {
    return (
      <div className="min-h-screen bg-black text-red-400 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Access Denied</h1>
          <p className="text-xl">{error || 'Invalid token'}</p>
        </div>
      </div>
    );
  }

  const stepTitles = [
    'Identity',
    'Race & Archetype',
    'Stats Allocation',
    'Optional Flaws',
    'Powers, Perks, Augmentations, Magic, and Hacking',
    'Summary'
  ];

  const renderStepIndicator = () => (
    <div className="flex justify-center mb-8">
      {stepTitles.map((title, index) => (
        <div
          key={index}
          className={`flex items-center ${index > 0 ? 'ml-4' : ''}`}
        >
          <div
            onClick={() => {
              if (canNavigateToStep(index + 1)) {
                setCurrentStep(index + 1);
              }
            }}
            className={`w-10 h-10 rounded-full flex items-center justify-center border-2
              ${currentStep === index + 1
                ? 'bg-cyan-400 text-black border-cyan-400'
                : currentStep > index + 1
                ? 'bg-green-500 text-black border-green-500'
                : 'bg-transparent text-cyan-400 border-cyan-400'}
              ${canNavigateToStep(index + 1)
                ? 'cursor-pointer hover:bg-cyan-600 hover:border-cyan-600 transition-colors'
                : 'cursor-not-allowed opacity-50'}`}
          >
            {index + 1}
          </div>
          {index < stepTitles.length - 1 && (
            <div className={`w-8 h-0.5 ${currentStep > index + 1 ? 'bg-green-500' : 'bg-gray-600'}`} />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-cyan-400 mb-6">Character Identity</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-cyan-300 mb-2">Character Name *</label>
          <input
            type="text"
            value={characterModel.identity.characterName || ''}
            onChange={(e) => updateIdentity('characterName', e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100 focus:outline-none focus:border-cyan-300"
            placeholder="Enter character name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cyan-300 mb-2">Second Life Name *</label>
          <input
            type="text"
            value={characterModel.identity.agentName || ''}
            onChange={(e) => updateIdentity('agentName', e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100 focus:outline-none focus:border-cyan-300"
            placeholder="Your SL avatar name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cyan-300 mb-2">Alias / Callsign</label>
          <input
            type="text"
            value={characterModel.identity.aliasCallsign || ''}
            onChange={(e) => updateIdentity('aliasCallsign', e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100 focus:outline-none focus:border-cyan-300"
            placeholder="Optional alias or callsign"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cyan-300 mb-2">Faction / Allegiance</label>
          <input
            type="text"
            value={characterModel.identity.faction || ''}
            onChange={(e) => updateIdentity('faction', e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100 focus:outline-none focus:border-cyan-300"
            placeholder="Optional faction"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cyan-300 mb-2">Concept / Role</label>
          <input
            type="text"
            value={characterModel.identity.conceptRole || ''}
            onChange={(e) => updateIdentity('conceptRole', e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100 focus:outline-none focus:border-cyan-300"
            placeholder="Brief character concept"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cyan-300 mb-2">Job</label>
          <input
            type="text"
            value={characterModel.identity.job || ''}
            onChange={(e) => updateIdentity('job', e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100 focus:outline-none focus:border-cyan-300"
            placeholder="Character's occupation"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-cyan-300 mb-2">Background</label>
        <textarea
          value={characterModel.identity.background || ''}
          onChange={(e) => updateIdentity('background', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100 focus:outline-none focus:border-cyan-300"
          placeholder="Character's background story..."
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-cyan-400 mb-6">Race & Archetype</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-cyan-300 mb-2">Race *</label>
          <select
            value={characterModel.race}
            onChange={(e) => updateRace(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100 focus:outline-none focus:border-cyan-300"
          >
            <option value="">— Choose Race —</option>
            {Object.keys(RACES).map(race => (
              <option key={race} value={race}>{race.charAt(0).toUpperCase() + race.slice(1)}</option>
            ))}
          </select>
        </div>

        {characterModel.race && (
          <div>
            <label className="block text-sm font-medium text-cyan-300 mb-2">
              Archetype / Path / Court *
            </label>
            <select
              value={characterModel.arch}
              onChange={(e) => updateArchetype(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-cyan-500 rounded text-cyan-100 focus:outline-none focus:border-cyan-300"
            >
              <option value="">— Choose Archetype —</option>
              {characterModel.race && RACES[characterModel.race as RaceName]?.map(archetype => (
                <option key={archetype} value={archetype}>{archetype}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );

  const renderStep3 = () => {
    const isSpliced = isSplicedRace();

    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-cyan-400 mb-6">Stats Allocation</h2>
        <div className="mb-4">
          <p className="text-cyan-300 mb-2">
            Allocate {isSpliced ? '8' : '6'} points across your stats (each stat ranges 1-5)
            {isSpliced && <span className="text-green-400 ml-2">(+2 free for Spliced: Physical & Dexterity)</span>}
          </p>
          <div className="text-xl font-bold text-cyan-400">
            Points Remaining: {characterModel.stats.pool}
          </div>
        </div>

        <div className="space-y-4">
          {(Object.keys(STAT_NAMES) as Array<keyof typeof STAT_NAMES>).map(stat => {
            const hasBonus = isSpliced && (stat === 'phys' || stat === 'dex');

            return (
              <div key={stat} className="flex items-center space-x-4 p-4 bg-gray-900 border border-cyan-500 rounded">
                <div className="flex-1">
                  <div className="font-medium text-cyan-300">
                    {STAT_NAMES[stat]}
                    {hasBonus && <span className="ml-2 text-green-400 text-sm">(+1 free for Spliced)</span>}
                  </div>
                  <div className="text-sm text-gray-400">{STAT_DESCRIPTIONS[stat]}</div>
                </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleStatChange(stat, -1)}
                  disabled={characterModel.stats[stat] <= 1}
                  className="w-8 h-8 bg-red-600 text-white rounded disabled:bg-gray-600 disabled:text-gray-400"
                >
                  −
                </button>
                <span className="w-8 text-center text-xl font-bold text-cyan-400">
                  {characterModel.stats[stat]}
                </span>
                <button
                  onClick={() => handleStatChange(stat, 1)}
                  disabled={characterModel.stats[stat] >= 5 || characterModel.stats.pool <= 0}
                  className="w-8 h-8 bg-green-600 text-white rounded disabled:bg-gray-600 disabled:text-gray-400"
                >
                  +
                </button>
                <span className="ml-2 px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-sm">
                  mod: {calculateStatModifier(characterModel.stats[stat]) >= 0 ? '+' : ''}{calculateStatModifier(characterModel.stats[stat])}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-gray-900 border border-green-500 rounded">
        <p className="text-green-300">
          <strong>Hit Points:</strong> {characterModel.stats.phys * 5} (Physical × 5)
        </p>
      </div>
    </div>
    );
  };

  const renderStep4 = () => {
    const flawPointsGained = Array.from(characterModel.flaws).reduce((sum, flawId) => {
      const flaw = availableFlaws.find(f => f.id === flawId);
      return sum + (flaw ? flaw.cost : 0);
    }, 0);

    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-cyan-400 mb-6">Optional Flaws</h2>
        <div className="mb-4">
          <p className="text-cyan-300 mb-2">Select flaws to gain additional power points</p>
          <div className="text-xl font-bold text-cyan-400">
            Points from Flaws: {flawPointsGained}
          </div>
        </div>

        <div className="space-y-3">
          {availableFlaws.map(flaw => (
            <div key={flaw.id} className="p-4 bg-gray-900 border border-cyan-500 rounded">
              <label className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  checked={characterModel.flaws.has(flaw.id)}
                  onChange={(e) => {
                    const newFlaws = new Set(characterModel.flaws);
                    if (e.target.checked) {
                      newFlaws.add(flaw.id);
                    } else {
                      newFlaws.delete(flaw.id);
                    }
                    setCharacterModel(prev => ({ ...prev, flaws: newFlaws }));
                  }}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-cyan-300">{flaw.name}</span>
                    <span className="px-2 py-1 bg-green-900 text-green-300 rounded text-sm">+{flaw.cost}</span>
                  </div>
                  <p className="text-gray-400 text-sm mt-1">{flaw.desc}</p>
                </div>
              </label>
            </div>
          ))}
        </div>

        {availableFlaws.length === 0 && characterModel.race && (
          <div className="p-4 bg-gray-900 border border-yellow-500 rounded">
            <p className="text-yellow-300">No flaws available for your current race/archetype combination.</p>
          </div>
        )}
      </div>
    );
  };

  // Toggle function for collapsible sections
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

  const renderStep5 = () => {
    const totalBudget = getPowerPointsTotal();
    const spentPoints = getPowerPointsSpent();
    const remainingPoints = getPowerPointsRemaining();

    // Helper function to toggle picks
    const togglePick = (id: string) => {
      const newPicks = new Set(characterModel.picks);
      if (newPicks.has(id)) {
        newPicks.delete(id);
      } else {
        newPicks.add(id);
      }
      setCharacterModel(prev => ({ ...prev, picks: newPicks }));
    };

    // Helper function to toggle magic schools
    const toggleMagicSchool = (id: string) => {
      const newMagicSchools = new Set(characterModel.magicSchools);
      if (newMagicSchools.has(id)) {
        newMagicSchools.delete(id);
      } else {
        newMagicSchools.add(id);
      }
      setCharacterModel(prev => ({ ...prev, magicSchools: newMagicSchools }));
    };

    // Cybernetic slot management
    const updateCyberSlots = (delta: number) => {
      const newSlots = Math.max(0, characterModel.cyberSlots + delta);
      // Calculate if this change would exceed point budget
      const currentCyberCost = characterModel.cyberSlots * 2;
      const newCyberCost = newSlots * 2;
      const costDifference = newCyberCost - currentCyberCost;

      if (spentPoints + costDifference <= totalBudget) {
        setCharacterModel(prev => {
          const updatedModel = { ...prev, cyberSlots: newSlots };

          // If reducing slots, remove excess selected cybernetics
          if (newSlots < prev.cyberSlots) {
            const selectedCybers = Array.from(prev.picks).filter(id =>
              availableCybernetics.find(c => c.id === id)
            );

            // If too many cybernetics selected, remove excess
            if (selectedCybers.length > newSlots) {
              const cybersToRemove = selectedCybers.slice(newSlots);

              // Remove excess from picks
              const newPicks = new Set(prev.picks);
              cybersToRemove.forEach(id => newPicks.delete(id));
              updatedModel.picks = newPicks;
            }
          }

          return updatedModel;
        });
      }
    };

    // Free picks management for Synthrals and Arcanists
    const updateSynthralFreeWeave = (weaveId: string) => {
      setCharacterModel(prev => {
        const newMagicSchools = new Set(prev.magicSchools);
        const techSchoolId = getTechnomancySchoolId();

        // Remove previous free weave if it exists
        if (prev.synthralFreeWeave && newMagicSchools.has(prev.synthralFreeWeave)) {
          newMagicSchools.delete(prev.synthralFreeWeave);
        }

        // Auto-add Technomancy school if not already added
        if (techSchoolId && !newMagicSchools.has(techSchoolId)) {
          newMagicSchools.add(techSchoolId);
        }

        // Add the new free weave if selected
        if (weaveId) {
          newMagicSchools.add(weaveId);
        }

        return {
          ...prev,
          synthralFreeWeave: weaveId,
          magicSchools: newMagicSchools
        };
      });
    };

    const updateArcanistFreeSchool = (schoolId: string) => {
      setCharacterModel(prev => {
        const newMagicSchools = new Set(prev.magicSchools);

        // Add the selected school
        if (schoolId && !newMagicSchools.has(schoolId)) {
          newMagicSchools.add(schoolId);
        }

        return {
          ...prev,
          freeMagicSchool: schoolId,
          freeMagicWeave: '', // Reset weave selection when school changes
          magicSchools: newMagicSchools
        };
      });
    };

    const updateArcanistFreeWeave = (weaveId: string) => {
      setCharacterModel(prev => {
        const newMagicSchools = new Set(prev.magicSchools);

        // Remove previous free weave if it exists
        if (prev.freeMagicWeave && newMagicSchools.has(prev.freeMagicWeave)) {
          newMagicSchools.delete(prev.freeMagicWeave);
        }

        // Add the new free weave if selected
        if (weaveId) {
          newMagicSchools.add(weaveId);
        }

        return {
          ...prev,
          freeMagicWeave: weaveId,
          magicSchools: newMagicSchools
        };
      });
    };

    const tabs = [
      { id: 'common', name: 'Common Powers', data: availableCommonPowers },
      { id: 'archetype', name: 'Archetype Powers', data: availableArchPowers },
      { id: 'perks', name: 'Perks', data: availablePerks },
      { id: 'cybernetics', name: 'Cybernetics', data: [] }, // Special handling
      { id: 'magic', name: 'Magic', data: [] } // Special handling
    ];

    // Determine if character qualifies for free picks
    const isSynthral = characterModel.race.toLowerCase() === 'human' && characterModel.arch.toLowerCase() === 'synthral';
    const isArcanist = characterModel.race.toLowerCase() === 'human' && characterModel.arch.toLowerCase() === 'arcanist';

    // Get data for free picks
    const techSchoolId = getTechnomancySchoolId();
    const techWeaves = dataLoaded ? getSchoolWeaves(techSchoolId) : [];
    const arcanistSchoolIds = dataLoaded ? getSchoolIdsForArcanist(characterModel.race, characterModel.arch) : [];
    const arcanistSchoolWeaves = characterModel.freeMagicSchool ? getSchoolWeaves(characterModel.freeMagicSchool) : [];

    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold text-cyan-400 mb-6">Powers, Perks, Augmentations, Magic, and Hacking</h2>

        <p className="text-green-400 text-lg mb-4">
          Select from the tabs below: Common Powers, Archetype Powers, Perks, Cybernetics and Magic to spend your points.
        </p>

        {/* Point Budget Display */}
        <div className="mb-4 p-4 bg-gray-900 border border-cyan-500 rounded">
          <div className="text-xl font-bold text-cyan-400">
            Power Points: {totalBudget} • Spent: {spentPoints} • Remaining: {remainingPoints}
          </div>
          <p className="text-cyan-300 text-sm mt-1">
            Base 15 points + {totalBudget - 15} from flaws
          </p>
        </div>

        {/* Free Picks Section */}
        {(isSynthral || isArcanist) && (
          <div className="mb-6 p-4 bg-blue-900 border border-blue-500 rounded">
            {isSynthral && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-blue-300">Synthral: Free Technomancy School & Weave</h3>
                <p className="text-blue-200 text-sm">
                  You automatically receive the Technomancy school for free, and may select one weave below for free:
                </p>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-blue-300">
                    Select Free Technomancy Weave:
                  </label>
                  <select
                    value={characterModel.synthralFreeWeave}
                    onChange={(e) => updateSynthralFreeWeave(e.target.value)}
                    className="w-full p-2 bg-gray-800 border border-blue-500 text-blue-300 rounded"
                  >
                    <option value="">— select a Technomancy weave —</option>
                    {techWeaves.map(weave => (
                      <option key={weave.id} value={weave.id}>
                        {weave.name}
                      </option>
                    ))}
                  </select>
                  {characterModel.synthralFreeWeave && (
                    <p className="text-blue-200 text-sm">
                      Free weave selected: <strong>{getWeaveName(characterModel.synthralFreeWeave)}</strong>
                    </p>
                  )}
                </div>
              </div>
            )}

            {isArcanist && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-blue-300">Arcanist: Free Magic School & Weave</h3>
                <p className="text-blue-200 text-sm">
                  Select one school below for free, then one weave from that school for free:
                </p>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-blue-300">
                    Select Free Magic School:
                  </label>
                  <select
                    value={characterModel.freeMagicSchool}
                    onChange={(e) => updateArcanistFreeSchool(e.target.value)}
                    className="w-full p-2 bg-gray-800 border border-blue-500 text-blue-300 rounded"
                  >
                    <option value="">— select a school —</option>
                    {arcanistSchoolIds.map(schoolId => (
                      <option key={schoolId} value={schoolId}>
                        {getSchoolName(schoolId)}
                      </option>
                    ))}
                  </select>

                  {characterModel.freeMagicSchool && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-blue-300">
                        Select Free Weave:
                      </label>
                      <select
                        value={characterModel.freeMagicWeave}
                        onChange={(e) => updateArcanistFreeWeave(e.target.value)}
                        className="w-full p-2 bg-gray-800 border border-blue-500 text-blue-300 rounded"
                      >
                        <option value="">— select a weave —</option>
                        {arcanistSchoolWeaves.map(weave => (
                          <option key={weave.id} value={weave.id}>
                            {weave.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {characterModel.freeMagicSchool && characterModel.freeMagicWeave && (
                    <p className="text-blue-200 text-sm">
                      Free school: <strong>{getSchoolName(characterModel.freeMagicSchool)}</strong>,
                      Free weave: <strong>{getWeaveName(characterModel.freeMagicWeave)}</strong>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-900 p-1 rounded">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setCharacterModel(prev => ({ ...prev, page5tab: tab.id }))}
              className={`px-4 py-2 rounded transition-colors ${
                characterModel.page5tab === tab.id
                  ? 'bg-cyan-600 text-white'
                  : 'text-cyan-300 hover:bg-gray-700'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {characterModel.page5tab === 'common' && (
            <div className="space-y-3">
              <h3 className="text-xl font-bold text-cyan-300">Common Powers</h3>
              {availableCommonPowers.map(power => (
                <div key={power.id} className="p-4 bg-gray-900 border border-cyan-500 rounded">
                  <label className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={characterModel.picks.has(power.id)}
                      onChange={() => togglePick(power.id)}
                      disabled={!characterModel.picks.has(power.id) && remainingPoints < power.cost}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-cyan-300">{power.name}</span>
                        <span className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-sm">{power.cost} pts</span>
                      </div>
                      <p className="text-gray-400 text-sm mt-1">{power.desc}</p>
                    </div>
                  </label>
                </div>
              ))}
              {availableCommonPowers.length === 0 && (
                <p className="text-gray-400">No common powers available for your race.</p>
              )}
            </div>
          )}

          {characterModel.page5tab === 'perks' && (
            <div className="space-y-3">
              <h3 className="text-xl font-bold text-cyan-300">Perks</h3>
              {availablePerks.map(perk => (
                <div key={perk.id} className="p-4 bg-gray-900 border border-cyan-500 rounded">
                  <label className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={characterModel.picks.has(perk.id)}
                      onChange={() => togglePick(perk.id)}
                      disabled={!characterModel.picks.has(perk.id) && remainingPoints < perk.cost}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-cyan-300">{perk.name}</span>
                        <span className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-sm">{perk.cost} pts</span>
                      </div>
                      <p className="text-gray-400 text-sm mt-1">{perk.desc}</p>
                    </div>
                  </label>
                </div>
              ))}
              {availablePerks.length === 0 && (
                <p className="text-gray-400">No perks available for your race/archetype.</p>
              )}
            </div>
          )}

          {characterModel.page5tab === 'archetype' && (
            <div className="space-y-3">
              <h3 className="text-xl font-bold text-cyan-300">Archetype Powers</h3>
              {availableArchPowers.map(power => (
                <div key={power.id} className="p-4 bg-gray-900 border border-cyan-500 rounded">
                  <label className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={characterModel.picks.has(power.id)}
                      onChange={() => togglePick(power.id)}
                      disabled={!characterModel.picks.has(power.id) && remainingPoints < power.cost}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-cyan-300">{power.name}</span>
                        <span className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-sm">{power.cost} pts</span>
                      </div>
                      <p className="text-gray-400 text-sm mt-1">{power.desc}</p>
                    </div>
                  </label>
                </div>
              ))}
              {availableArchPowers.length === 0 && characterModel.arch && (
                <p className="text-gray-400">No archetype powers available for your current selection.</p>
              )}
              {!characterModel.arch && (
                <p className="text-gray-400">Select an archetype to see available powers.</p>
              )}
            </div>
          )}

          {characterModel.page5tab === 'cybernetics' && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-cyan-300">Cybernetics</h3>

              {/* Cybernetic Slots */}
              <div className="p-4 bg-gray-900 border border-cyan-500 rounded">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-cyan-300">Cybernetic Slots</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => updateCyberSlots(-1)}
                      disabled={characterModel.cyberSlots <= 0}
                      className="w-8 h-8 bg-red-600 text-white rounded disabled:bg-gray-600"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-xl font-bold text-cyan-400">
                      {characterModel.cyberSlots}
                    </span>
                    <button
                      onClick={() => updateCyberSlots(1)}
                      disabled={remainingPoints < 2}
                      className="w-8 h-8 bg-green-600 text-white rounded disabled:bg-gray-600"
                    >
                      +
                    </button>
                    <span className="ml-2 px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-sm">
                      2 pts each
                    </span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm">
                  Each slot costs 2 points and allows you to select one cybernetic modification.
                </p>
              </div>

              {/* Cybernetic Modifications */}
              {characterModel.cyberSlots > 0 && (
                <div className="space-y-3">
                  {Object.entries(groupCyberneticsBySection(availableCybernetics)).map(([section, cybers]) => (
                    cybers.length > 0 && (
                      <div key={section}>
                        <h4 className="text-lg font-semibold text-cyan-300 mb-2">{section}</h4>
                        {cybers.map(cyber => (
                          <div key={cyber.id} className="p-4 bg-gray-800 border border-gray-600 rounded">
                            <label className="flex items-start space-x-3">
                              <input
                                type="checkbox"
                                checked={characterModel.picks.has(cyber.id)}
                                onChange={() => togglePick(cyber.id)}
                                disabled={!characterModel.picks.has(cyber.id) &&
                                  (Array.from(characterModel.picks).filter(id =>
                                    availableCybernetics.find(c => c.id === id)
                                  ).length >= characterModel.cyberSlots || remainingPoints < cyber.cost)}
                                className="mt-1"
                              />
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium text-cyan-300">{cyber.name}</span>
                                  <span className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-sm">{cyber.cost} pts</span>
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
              )}
            </div>
          )}

          {characterModel.page5tab === 'magic' && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-cyan-300">Magic Schools & Weaves</h3>

              {canUseMagic(characterModel.race, characterModel.arch) ? (
                <div className="space-y-4">
                  {Object.entries(availableMagicSchools).map(([section, schools]) => {
                    const schoolEntry = schools[0]; // First item is always the school
                    const weaves = schools.slice(1); // Rest are weaves

                    // Determine if this school is free
                    const isFreeSchool = (isSynthral && schoolEntry.id === techSchoolId) ||
                                       (isArcanist && schoolEntry.id === characterModel.freeMagicSchool);

                    // Check if the school is selected (either manually or as free)
                    const schoolSelected = characterModel.magicSchools.has(schoolEntry.id);

                    return (
                      <div key={section}>
                        <button
                          onClick={() => toggleSection(section)}
                          className="w-full flex items-center justify-between text-lg font-semibold text-cyan-300 mb-2 p-2 rounded hover:bg-gray-800 transition-colors"
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
                          <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                            {/* School Entry */}
                        <div className="p-4 bg-gray-900 border border-cyan-500 rounded">
                          <label className="flex items-start space-x-3">
                            <input
                              type="checkbox"
                              checked={schoolSelected}
                              onChange={() => !isFreeSchool && toggleMagicSchool(schoolEntry.id)}
                              disabled={isFreeSchool || (!schoolSelected && remainingPoints < schoolEntry.cost)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-cyan-300">{schoolEntry.name}</span>
                                {isFreeSchool ? (
                                  <span className="px-2 py-1 bg-blue-600 text-white rounded text-sm">FREE</span>
                                ) : (
                                  <span className="px-2 py-1 bg-cyan-900 text-cyan-300 rounded text-sm">{schoolEntry.cost} pts</span>
                                )}
                              </div>
                              <p className="text-gray-400 text-sm mt-1">{schoolEntry.desc}</p>
                              {isFreeSchool && (
                                <p className="text-blue-300 text-sm mt-1">(This school is free for your archetype)</p>
                              )}
                            </div>
                          </label>
                        </div>

                        {/* Weaves */}
                        {weaves.map(weave => {
                          const isFreeWeave = (isSynthral && weave.id === characterModel.synthralFreeWeave) ||
                                            (isArcanist && weave.id === characterModel.freeMagicWeave);
                          const weaveSelected = characterModel.magicSchools.has(weave.id);

                          return (
                            <div key={weave.id} className="ml-6 p-3 bg-gray-800 border border-gray-600 rounded">
                              <label className="flex items-start space-x-3">
                                <input
                                  type="checkbox"
                                  checked={weaveSelected}
                                  onChange={() => !isFreeWeave && toggleMagicSchool(weave.id)}
                                  disabled={
                                    isFreeWeave || // Free weaves are disabled
                                    !schoolSelected || // Can't select weaves without school
                                    (!weaveSelected && remainingPoints < weave.cost) // Can't afford
                                  }
                                  className="mt-1"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-medium text-cyan-300">{weave.name}</span>
                                    {isFreeWeave ? (
                                      <span className="px-2 py-1 bg-blue-600 text-white rounded text-sm">FREE</span>
                                    ) : (
                                      <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-sm">{weave.cost} pts</span>
                                    )}
                                  </div>
                                  <p className="text-gray-400 text-sm mt-1">{weave.desc}</p>
                                  {isFreeWeave && (
                                    <p className="text-blue-300 text-sm mt-1">(This weave is free for your archetype)</p>
                                  )}
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
                <div className="p-4 bg-gray-900 border border-yellow-500 rounded">
                  <p className="text-yellow-300">
                    Magic is not available for your current race/archetype combination.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStep6 = () => {
    // Power points system
    const totalPowerPoints = getPowerPointsTotal();
    const spentPowerPoints = getPowerPointsSpent();
    const remainingPowerPoints = getPowerPointsRemaining();
    const flawPointsGained = totalPowerPoints - 15;

    // Stat points system
    const statPointsSpent = calculateStatPointsSpent();

    // Get summary data for powers/perks/etc
    const flawsSummary = Array.from(characterModel.flaws).map(flawId =>
      availableFlaws.find(f => f.id === flawId)?.name || flawId
    ).filter(Boolean);

    const powersSummary = Array.from(characterModel.picks).map(pickId => {
      const power = availableCommonPowers.find(p => p.id === pickId)?.name ||
                   availablePerks.find(p => p.id === pickId)?.name ||
                   availableArchPowers.find(p => p.id === pickId)?.name ||
                   availableCybernetics.find(p => p.id === pickId)?.name;
      return power;
    }).filter(Boolean);

    const magicSchoolsSummary = Array.from(characterModel.magicSchools).map(schoolId => {
      const schools = Object.values(availableMagicSchools).flat();
      return schools.find(s => s.id === schoolId)?.name || schoolId;
    }).filter(Boolean);

    // Breakdown of power points spent
    const cyberSlotPts = (characterModel.cyberSlots || 0) * 2;
    const powersPts = spentPowerPoints - cyberSlotPts;

    const freeMagicSchoolName = characterModel.freeMagicSchool ? getSchoolName(characterModel.freeMagicSchool) : '';
    const freeMagicWeaveName = characterModel.freeMagicWeave ? getWeaveName(characterModel.freeMagicWeave) : '';
    const synthralFreeWeaveName = characterModel.synthralFreeWeave ? getWeaveName(characterModel.synthralFreeWeave) : '';

    // Generate copyable character summary
    const generateCharacterSummary = () => {
      const lines = [
        `Character Name: ${characterModel.identity.characterName || '-'}`,
        `Second Life Name: ${characterModel.identity.agentName || '-'}`,
        `Alias / Callsign: ${characterModel.identity.aliasCallsign || '-'}`,
        `Faction / Allegiance: ${characterModel.identity.faction || '-'}`,
        `Concept / Role: ${characterModel.identity.conceptRole || '-'}`,
        `Job: ${characterModel.identity.job || '-'}`,
        `Race: ${characterModel.race || '-'} / ${characterModel.arch || '—'}`,
        `Stats: Phys ${characterModel.stats.phys} (HP ${characterModel.stats.phys * 5}), Dex ${characterModel.stats.dex}, Mental ${characterModel.stats.mental}, Perc ${characterModel.stats.perc} (Stat Points spent: ${statPointsSpent})`,
        `Flaws: ${flawsSummary.length ? flawsSummary.join(', ') : 'None'} (Power Points gained: ${flawPointsGained})`,
        `Common Powers/Perks/Arch/Cyber: ${powersSummary.length ? powersSummary.join(', ') : 'None'} (Power Points spent: ${powersPts})`,
        `Cybernetic Slots: ${characterModel.cyberSlots || 0} (Power Points spent: ${cyberSlotPts})`,
        `Magic Schools: ${magicSchoolsSummary.length ? magicSchoolsSummary.join(', ') : 'None'}`
      ];

      if (freeMagicSchoolName) lines.push(`Free Magic School: ${freeMagicSchoolName}`);
      if (freeMagicWeaveName) lines.push(`Free Magic Weave: ${freeMagicWeaveName}`);
      if (synthralFreeWeaveName) lines.push(`Synthral Free Weave: ${synthralFreeWeaveName}`);

      lines.push(`Background: ${characterModel.identity.background || '-'}`);
      lines.push(`Power Points: ${totalPowerPoints} total • ${spentPowerPoints} spent • ${remainingPowerPoints} remaining`);

      return lines.join('\n');
    };

    const copyToClipboard = async () => {
      try {
        await navigator.clipboard.writeText(generateCharacterSummary());
        // Show brief feedback
        alert('Character sheet copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        alert('Failed to copy to clipboard. Please select and copy manually.');
      }
    };

    return (
      <div className="space-y-6">
        {/* Submit Message */}
        <div className="p-4 rounded-lg border" style={{ background: '#f3f7ee', borderColor: '#ccd', color: '#333' }}>
          <p className="font-bold mb-2">
            When you are happy with your character, click SUBMIT CHARACTER to submit your character sheet to the admin team.
          </p>
          <p className="text-sm">
            Copy your character sheet for your records and paste it in your Second Life picks. Due to Second Life text restrictions, you may need to remove your character background or fields not applicable to your character.
          </p>
        </div>

        <h2 className="text-3xl font-bold text-cyan-400 mb-6">Summary</h2>

        {/* Character Summary */}
        <div className="p-6 bg-gray-900 border border-cyan-500 rounded relative">
          <button
            onClick={copyToClipboard}
            className="absolute top-4 right-4 p-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors"
            title="Copy character sheet to clipboard"
          >
            📋 Copy
          </button>

          <div className="space-y-3 text-cyan-100 pr-20">
            <div><strong className="text-cyan-300">Character Name:</strong> {characterModel.identity.characterName || '-'}</div>
            <div><strong className="text-cyan-300">Second Life Name:</strong> {characterModel.identity.agentName || '-'}</div>
            <div><strong className="text-cyan-300">Alias / Callsign:</strong> {characterModel.identity.aliasCallsign || '-'}</div>
            <div><strong className="text-cyan-300">Faction / Allegiance:</strong> {characterModel.identity.faction || '-'}</div>
            <div><strong className="text-cyan-300">Concept / Role:</strong> {characterModel.identity.conceptRole || '-'}</div>
            <div><strong className="text-cyan-300">Job:</strong> {characterModel.identity.job || '-'}</div>
            <div><strong className="text-cyan-300">Race:</strong> {characterModel.race || '-'} <span className="text-gray-400">/ {characterModel.arch || '—'}</span></div>
            <div><strong className="text-cyan-300">Stats:</strong> Phys {characterModel.stats.phys} (HP {characterModel.stats.phys * 5}), Dex {characterModel.stats.dex}, Mental {characterModel.stats.mental}, Perc {characterModel.stats.perc} <span className="text-gray-400">(Stat Points spent: {statPointsSpent})</span></div>
            <div><strong className="text-cyan-300">Flaws:</strong> {flawsSummary.length ? flawsSummary.join(', ') : 'None'} <span className="text-gray-400">(Power Points gained: {flawPointsGained})</span></div>
            <div><strong className="text-cyan-300">Common Powers/Perks/Arch/Cyber:</strong> {powersSummary.length ? powersSummary.join(', ') : 'None'} <span className="text-gray-400">(Power Points spent: {powersPts})</span></div>
            <div><strong className="text-cyan-300">Cybernetic Slots:</strong> {characterModel.cyberSlots || 0} <span className="text-gray-400">(Power Points spent: {cyberSlotPts})</span></div>
            <div><strong className="text-cyan-300">Magic Schools:</strong> {magicSchoolsSummary.length ? magicSchoolsSummary.join(', ') : 'None'}</div>
            {freeMagicSchoolName && <div><strong className="text-cyan-300">Free Magic School:</strong> {freeMagicSchoolName}</div>}
            {freeMagicWeaveName && <div><strong className="text-cyan-300">Free Magic Weave:</strong> {freeMagicWeaveName}</div>}
            {synthralFreeWeaveName && <div><strong className="text-cyan-300">Synthral Free Weave:</strong> {synthralFreeWeaveName}</div>}
            <div><strong className="text-cyan-300">Background:</strong> {characterModel.identity.background || '-'}</div>
            <div className="pt-2 border-t border-gray-700">
              <strong className="text-cyan-300">Power Points:</strong> {totalPowerPoints} total • <strong className="text-cyan-300">Spent</strong> {spentPowerPoints} • <strong className="text-cyan-300">Remaining</strong> {remainingPowerPoints}
            </div>
          </div>
        </div>

        {/* Warning Message for Negative Points */}
        {remainingPowerPoints < 0 && (
          <div className="mt-4 p-4 bg-red-900 border-2 border-red-500 rounded-lg">
            <div className="flex items-start space-x-3">
              <span className="text-red-400 text-2xl">⚠️</span>
              <div className="flex-1">
                <p className="text-red-300 font-bold text-lg mb-2">
                  Power Point Allocation Exceeded
                </p>
                <p className="text-red-200 mb-3">
                  You have allocated {Math.abs(remainingPowerPoints)} more power {Math.abs(remainingPowerPoints) === 1 ? 'point' : 'points'} than available.
                  Your character cannot be submitted until you balance your power point allocation.
                </p>
                <div className="bg-red-800 bg-opacity-50 p-3 rounded mb-3">
                  <p className="text-red-100 font-semibold mb-1">Current Power Point Allocation:</p>
                  <ul className="text-red-200 text-sm space-y-1">
                    <li>• Total Available Power Points: <strong>{totalPowerPoints}</strong></li>
                    <li>• Power Points Spent: <strong>{spentPowerPoints}</strong></li>
                    <li>• Power Points Over Budget: <strong className="text-red-300">{Math.abs(remainingPowerPoints)}</strong></li>
                  </ul>
                </div>
                <p className="text-red-200 mb-2">
                  <strong>To fix this issue:</strong>
                </p>
                <ol className="text-red-200 text-sm space-y-1 list-decimal list-inside">
                  <li>Click &ldquo;Previous&rdquo; to go back to Step 5 (Powers, Perks, Augmentations, Magic, and Hacking)</li>
                  <li>Review your current selections and their point costs</li>
                  <li>Remove or adjust selections to reduce your spent power points by {Math.abs(remainingPowerPoints)} {Math.abs(remainingPowerPoints) === 1 ? 'point' : 'points'}</li>
                  <li>Consider removing expensive powers or reducing cybernetic slots (2 points each)</li>
                  <li>Return to this summary page once your remaining power points are 0 or positive</li>
                </ol>
                <p className="text-red-300 text-sm mt-3 italic">
                  Note: You can gain additional points by selecting flaws in Step 4, but each flaw comes with
                  roleplay consequences for your character.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <button
            onClick={submitCharacter}
            disabled={loading || !characterModel.identity.characterName || !characterModel.identity.agentName || !characterModel.race || remainingPowerPoints < 0}
            className="w-full text-white py-3 px-6 rounded font-bold cursor-pointer border-none"
            style={{
              fontSize: '1.2em',
              padding: '10px 28px',
              backgroundColor: '#336633',
              borderRadius: '8px',
              opacity: (loading || !characterModel.identity.characterName || !characterModel.identity.agentName || !characterModel.race || remainingPowerPoints < 0) ? 0.6 : 1
            }}
          >
            {loading ? 'Submitting...' :
             remainingPowerPoints < 0 ? `CANNOT SUBMIT (${Math.abs(remainingPowerPoints)} power points over)` :
             'SUBMIT CHARACTER'}
          </button>
        </div>
      </div>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      default: return renderStep1();
    }
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 1: return characterModel.identity.characterName && characterModel.identity.agentName;
      case 2: return characterModel.race && characterModel.arch;
      case 3: return characterModel.stats.pool === 0;
      default: return true;
    }
  };

  const canNavigateToStep = (targetStep: number): boolean => {
    if (targetStep === 1) return true; // Always can go back to identity
    if (targetStep === 2) return !!(characterModel.identity.characterName && characterModel.identity.agentName);
    if (targetStep === 3) return canNavigateToStep(2) && !!(characterModel.race && characterModel.arch);
    if (targetStep >= 4) return canNavigateToStep(3); // Once race/arch selected, can navigate freely to 4-6
    return false;
  };

  return (
    <div className="min-h-screen bg-black text-cyan-100">
      {/* Header */}
      <div className="bg-gray-900 border-b border-cyan-500 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-cyan-400 mb-2">Arkana Character Creator</h1>
          <p className="text-cyan-300">Supernatural Sci-Fi Roleplay</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-6">
        {renderStepIndicator()}

        <div className="mb-8">
          {renderCurrentStep()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
          >
            ← Back
          </button>

          {currentStep < 6 ? (
            <button
              onClick={() => setCurrentStep(Math.min(6, currentStep + 1))}
              disabled={!canGoNext()}
              className="px-6 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:bg-gray-600 disabled:text-gray-400"
            >
              Next →
            </button>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-900 border border-red-500 text-red-300 p-4 rounded">
          {error}
        </div>
      )}
    </div>
  );
}