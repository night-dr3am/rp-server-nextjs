import Joi from 'joi';

// Timestamp validation for ISO 8601 format (supports up to 6 decimal places for Second Life)
const timestampSchema = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/).required();


// Signature validation (SHA256 hex string)
const signatureSchema = Joi.string().pattern(/^[a-f0-9]{64}$/).required();

// Valid Second Life UUID format
const uuidSchema = Joi.string().uuid().required();

// Valid universe names
const universeSchema = Joi.string().min(1).max(50).required();

// Valid roles for the RP server
const roleSchema = Joi.string().valid('Free', 'Slave', 'Jarl', 'Bondmaid', 'Panther', 'Outlaw').required();

// Currency validation (allow negative for debts)
const currencySchema = Joi.number().integer().optional();

export const registerUserSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  username: Joi.string().min(2).max(50).required(),
  role: roleSchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const checkUserSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const updateStatsSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  status: Joi.number().integer().optional(), // Allow any value for clamping
  health: Joi.number().integer().optional(), // Allow any value for clamping
  hunger: Joi.number().integer().optional(), // Allow any value for clamping
  thirst: Joi.number().integer().optional(), // Allow any value for clamping
  goldCoin: currencySchema,
  silverCoin: currencySchema,
  copperCoin: currencySchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const getStatsSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

// LSL color vector validation
const lslVectorSchema = Joi.string().pattern(/^<\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*>$/).custom((value, helpers) => {
  // Validate vector format and range (0.0 to 1.0 for each component)
  const match = value.match(/^<\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*>$/);
  if (!match) {
    return helpers.error('any.invalid', { message: 'Invalid LSL vector format' });
  }
  
  const [, x, y, z] = match.map((v: string) => parseFloat(v));
  if (isNaN(x) || isNaN(y) || isNaN(z)) {
    return helpers.error('any.invalid', { message: 'Invalid vector components' });
  }
  
  if (x < 0 || x > 1 || y < 0 || y > 1 || z < 0 || z > 1) {
    return helpers.error('any.invalid', { message: 'Vector components must be between 0 and 1' });
  }
  
  // Return normalized format
  return `<${x}, ${y}, ${z}>`;
}, 'LSL vector validation');

export const updateProfileSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  update_type: Joi.string().valid('name', 'role', 'title', 'titleColor').required(),
  update_value: Joi.when('update_type', [
    {
      is: 'name',
      then: Joi.string().min(2).max(50).required()
    },
    {
      is: 'title', 
      then: Joi.string().max(512).allow('').optional()
    },
    {
      is: 'titleColor',
      then: lslVectorSchema
    },
    {
      is: 'role',
      then: Joi.string().required().custom((value, helpers) => {
        // Convert to proper case for validation
        const normalizedValue = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        const validRoles = ['Free', 'Slave', 'Jarl', 'Bondmaid', 'Panther', 'Outlaw'];
        
        // Check if normalized value is valid
        if (validRoles.includes(normalizedValue)) {
          return normalizedValue; // Return the properly cased value
        }
        
        // If not valid even after normalization, check uppercase
        const upperValue = value.toUpperCase();
        const roleMap: { [key: string]: string } = {
          'FREE': 'Free',
          'SLAVE': 'Slave',
          'JARL': 'Jarl',
          'BONDMAID': 'Bondmaid',
          'PANTHER': 'Panther',
          'OUTLAW': 'Outlaw'
        };
        
        if (roleMap[upperValue]) {
          return roleMap[upperValue];
        }
        
        return helpers.error('any.only', { valids: validRoles });
      }, 'case-insensitive role validation')
    }
  ]),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const createEventSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  type: Joi.string().max(100).required(),
  details: Joi.object().required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const paymentSchema = Joi.object({
  sender_uuid: uuidSchema,
  recipient_uuid: uuidSchema,
  universe: universeSchema,
  goldCoin: Joi.number().integer().min(0).required(),
  silverCoin: Joi.number().integer().min(0).required(),
  copperCoin: Joi.number().integer().min(0).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const itemPurchaseSchema = Joi.object({
  buyer_uuid: uuidSchema,
  seller_uuid: uuidSchema,
  universe: universeSchema,
  itemName: Joi.string().min(1).max(255).required(),
  goldCoin: Joi.number().integer().min(0).required(),
  silverCoin: Joi.number().integer().min(0).required(),
  copperCoin: Joi.number().integer().min(0).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
}).custom((val, helpers) => {
  if ((val.goldCoin + val.silverCoin + val.copperCoin) === 0) {
    return helpers.error('any.invalid');
  }
  if (val.buyer_uuid === val.seller_uuid) {
    return helpers.error('any.invalid');
  }
  return val;
}, 'Non-zero payment and distinct users');

export const rpItemUpsertSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  shortName: Joi.string().min(1).max(24).required(),
  universe: universeSchema,
  isShortNameDifferent: Joi.boolean().required(),
  category: Joi.string().valid('Food','Drinks','Minerals','Items','Poisons','Crops','Spices').required(),
  tags: Joi.string().allow('').max(500).optional().default(""),
  hungerValue: Joi.number().integer().min(-200).max(200).required(),
  thirstValue: Joi.number().integer().min(-200).max(200).required(),
  healthValue: Joi.number().integer().min(-200).max(200).required(),
  edible: Joi.boolean().required(),
  drinkable: Joi.boolean().required(),
  useCount: Joi.number().integer().min(0).optional(),
  priceGold: Joi.number().integer().min(0).required(),
  priceSilver: Joi.number().integer().min(0).required(),
  priceCopper: Joi.number().integer().min(0).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const inventoryAdjustSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  shortName: Joi.string().min(1).max(48).required(),
  quantity: Joi.number().integer().min(1).required(),
  useCount: Joi.number().integer().min(0).optional(),
  priceGold: Joi.number().integer().min(0).optional(),
  priceSilver: Joi.number().integer().min(0).optional(),
  priceCopper: Joi.number().integer().min(0).optional(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const inventoryTransferSchema = Joi.object({
  from_uuid: uuidSchema,
  to_uuid: uuidSchema,
  universe: universeSchema,
  shortName: Joi.string().min(1).max(24).required(),
  quantity: Joi.number().integer().min(1).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
}).custom((val, helpers) => {
  if (val.from_uuid === val.to_uuid) return helpers.error('any.invalid');
  return val;
}, 'Distinct users');

export const payoutSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  copperCoin: Joi.number().integer().min(1).required(),
  jobName: Joi.string().min(1).max(100).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const currencyExchangeSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  pay_amount: Joi.string().pattern(/^(?:\d+g)?(?:\d+s)?(?:\d+c)?$/).required().custom((value, helpers) => {
    // Ensure at least one currency is specified
    if (!value.match(/\d/)) {
      return helpers.error('any.invalid', { message: 'At least one currency amount must be specified' });
    }
    return value;
  }),
  receive_amount: Joi.string().pattern(/^(?:\d+g)?(?:\d+s)?(?:\d+c)?$/).required().custom((value, helpers) => {
    // Ensure at least one currency is specified
    if (!value.match(/\d/)) {
      return helpers.error('any.invalid', { message: 'At least one currency amount must be specified' });
    }
    return value;
  }),
  timestamp: timestampSchema,
  signature: signatureSchema
});

// Profile validation schemas
export const generateProfileLinkSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const validateProfileTokenSchema = Joi.object({
  token: Joi.string().required()
});

export const profileDataSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  token: Joi.string().required(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(5).max(100).optional().default(20)
});

// Estate validation schemas
export const estateRegistrationSchema = Joi.object({
  estateId: Joi.string().min(1).max(255).required(),
  universe: universeSchema,
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional(),
  rentPricePerDay: Joi.number().integer().min(1).required(),
  location: Joi.string().max(255).optional(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const estateRentSchema = Joi.object({
  estateId: Joi.string().min(1).max(255).required(),
  renterUuid: uuidSchema,
  universe: universeSchema,
  days: Joi.number().integer().min(1).max(365).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const estateExtendSchema = Joi.object({
  estateId: Joi.string().min(1).max(255).required(),
  renterUuid: uuidSchema,
  universe: universeSchema,
  additionalDays: Joi.number().integer().min(1).max(365).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const estateInfoSchema = Joi.object({
  estateId: Joi.string().min(1).max(255).required(),
  universe: universeSchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

// World Object validation schemas
export const worldObjectUpsertSchema = Joi.object({
  objectId: Joi.string().min(1).max(255).required(),
  universe: Joi.string().valid('arkana').default('arkana'),
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional(),
  location: Joi.string().max(255).optional(),
  owners: Joi.array().items(uuidSchema).optional().default([]),
  type: Joi.string().min(1).max(100).required(),
  state: Joi.string().min(1).max(100).optional().default('default'),
  newState: Joi.string().min(1).max(100).optional(),
  stats: Joi.object().optional().default({}),
  groups: Joi.array().optional().default([]),
  actions: Joi.array().items(Joi.object({
    action: Joi.string().required(),                      // Action name/label
    showStates: Joi.string().required(),                  // Comma-delimited states
    skills: Joi.string().optional(),                      // Pipe-delimited OR skill requirements
    checks: Joi.string().optional(),                      // Check ID from worldObjectChecks.json
    successScript: Joi.string().optional(),               // Success script ID from worldObjectSuccessScripts.json
    successState: Joi.string().required(),                // State on success
    notify: Joi.string().optional()                       // Notification mode ("private", "local", or empty)
  })).min(1).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const worldObjectActionsSchema = Joi.object({
  objectId: Joi.string().min(1).max(255).required(),
  playerUuid: uuidSchema.required(),
  universe: Joi.string().valid('arkana').default('arkana'),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const worldObjectPerformActionSchema = Joi.object({
  playerUuid: uuidSchema.required(),
  objectId: Joi.string().min(1).max(255).required(),
  actionId: Joi.string().min(1).max(100).required(),
  universe: Joi.string().valid('arkana').default('arkana'),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const worldObjectSyncSchema = Joi.object({
  objectId: Joi.string().min(1).max(255).required(),
  universe: Joi.string().valid('arkana').default('arkana'),
  timestamp: timestampSchema,
  signature: signatureSchema
});

// Arkana character creation validation schemas
export const arkanaRegisterSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaCheckUserSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaStatsSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaUpdateStatsSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  status: Joi.number().integer().optional(), // Allow any value for clamping (Arkana uses: 0=RP, 1=OOC, 2=AFK)
  health: Joi.number().integer().optional(), // Allow any value for clamping
  hunger: Joi.number().integer().optional(), // Allow any value for clamping
  thirst: Joi.number().integer().optional(), // Allow any value for clamping
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaCharacterCreateSchema = Joi.object({
  // Identity
  characterName: Joi.string().min(1).max(255).required(),
  agentName: Joi.string().min(1).max(255).required(),
  aliasCallsign: Joi.string().max(255).allow('').optional(),
  faction: Joi.string().max(255).allow('').optional(),
  conceptRole: Joi.string().max(512).allow('').optional(),
  job: Joi.string().max(256).allow('').optional(),
  background: Joi.string().allow('').optional(),

  // Lineage
  race: Joi.string()
    .lowercase()
    .valid('human', 'strigoi', 'gaki', 'spliced', 'veilborn')
    .required(),
  subrace: Joi.string().max(255).allow('').optional(),
  archetype: Joi.string().max(255).allow('').optional(),

  // Stats (1-5 range)
  physical: Joi.number().integer().min(1).max(5).required(),
  dexterity: Joi.number().integer().min(1).max(5).required(),
  mental: Joi.number().integer().min(1).max(5).required(),
  perception: Joi.number().integer().min(1).max(5).required(),

  // Skills System
  skills: Joi.array().items(
    Joi.object({
      skill_id: Joi.string().required(),
      skill_name: Joi.string().required(),
      level: Joi.number().integer().min(0).max(3).required()
    })
  ).default([]),
  skillsAllocatedPoints: Joi.number().integer().min(0).max(20).default(5),
  skillsSpentPoints: Joi.number().integer().min(0).max(20).default(0),

  // Powers and choices
  inherentPowers: Joi.array().items(Joi.string()).default([]),
  weaknesses: Joi.array().items(Joi.string()).default([]),
  flaws: Joi.array().items(Joi.string()).default([]),
  commonPowers: Joi.array().items(Joi.string()).default([]),
  archetypePowers: Joi.array().items(Joi.string()).default([]),
  perks: Joi.array().items(Joi.string()).default([]),
  magicSchools: Joi.array().items(Joi.string()).default([]),
  magicWeaves: Joi.array().items(Joi.string()).default([]),
  cybernetics: Joi.array().items(Joi.string()).default([]),
  cyberneticAugments: Joi.array().items(Joi.string()).default([]),

  // New arkana-data-main fields (handled in API, not stored directly in DB)
  picks: Joi.array().items(Joi.string()).default([]), // Will be merged with perks
  cyberSlots: Joi.number().integer().min(0).max(10).default(0), // Used for UI logic only
  freeMagicSchool: Joi.string().allow('').optional(), // Used for UI logic only
  freeMagicWeave: Joi.string().allow('').optional(), // Used for UI logic only
  synthralFreeWeave: Joi.string().allow('').optional(), // Used for UI logic only

  // JWT token for authentication
  token: Joi.string().required(),
  universe: Joi.string().valid('arkana').required()
}).custom((value, helpers) => {
  // Validate stat point allocation
  const baseStats = 4; // 1 point each in 4 stats
  const allocated = value.physical + value.dexterity + value.mental + value.perception;
  const pointsUsed = allocated - baseStats;

  // Spliced race gets 2 free stat points (Physical +1, Dexterity +1)
  const expectedPoints = value.race?.toLowerCase() === 'spliced' ? 8 : 6;

  if (pointsUsed !== expectedPoints) {
    const raceNote = value.race?.toLowerCase() === 'spliced'
      ? ' (Spliced gets +2 free points: 8 total)'
      : ' (each stat 1-5, total allocation = 6 + 4 base = 10)';
    return helpers.error('any.custom', {
      message: `Stats must use exactly ${expectedPoints} points${raceNote}`
    });
  }

  return value;
}, 'Stat point validation');

// Gorean character creation validation schemas
export const goreanRegisterSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().lowercase().valid('gor').required(), // Normalize to lowercase for case-insensitive matching
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const goreanCheckUserSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().lowercase().valid('gor').required(), // Normalize to lowercase for case-insensitive matching
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const goreanStatsSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().lowercase().valid('gor').required(), // Normalize to lowercase for case-insensitive matching
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const goreanUpdateStatsSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().lowercase().valid('gor').required(), // Normalize to lowercase for case-insensitive matching
  status: Joi.number().integer().optional(), // RPG status: 0=Full, 1=Survival, 2=Combat, 3=RP, 4=OOC (allow any value for clamping)
  healthCurrent: Joi.number().integer().optional(), // Allow any value for clamping
  hungerCurrent: Joi.number().integer().optional(), // Allow any value for clamping
  thirstCurrent: Joi.number().integer().optional(), // Allow any value for clamping
  goldCoin: currencySchema,
  silverCoin: currencySchema,
  copperCoin: currencySchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const goreanCharacterCreateSchema = Joi.object({
  // Identity
  characterName: Joi.string().min(1).max(255).required(),
  agentName: Joi.string().min(1).max(255).required(),
  title: Joi.string().max(512).allow('').optional(),
  background: Joi.string().allow('').optional(),

  // Species (35+ species including animals!)
  species: Joi.string().required(),
  speciesCategory: Joi.string()
    .valid('sapient', 'feline', 'canine_like', 'hooved', 'avian', 'reptilian', 'aquatic', 'small')
    .required(),
  speciesVariant: Joi.string().max(255).allow('').optional(),

  // Culture/Origin
  culture: Joi.string().required(),
  cultureType: Joi.string()
    .valid('cityState', 'northern', 'nomadic', 'marshForestJungle', 'special', 'animal')
    .required(),

  // Social Status
  socialStatus: Joi.string().required(),
  slaveType: Joi.string().max(100).allow('').optional(), // Cultural variant (kajira, bondmaid, kajirus, thrall)
  statusSubtype: Joi.string().max(255).allow('').optional(),

  // Caste/Role (optional - depends on culture)
  casteRole: Joi.string().max(255).allow('').optional(),
  casteRoleType: Joi.string().max(100).allow('').optional(),

  // Region
  region: Joi.string().max(255).allow('').optional(),
  homeStoneName: Joi.string().max(255).allow('').optional(),

  // Base Stats (1-5 range, 5 stats for Gor)
  strength: Joi.number().integer().min(1).max(5).required(),
  agility: Joi.number().integer().min(1).max(5).required(),
  intellect: Joi.number().integer().min(1).max(5).required(),
  perception: Joi.number().integer().min(1).max(5).required(),
  charisma: Joi.number().integer().min(1).max(5).required(),

  // Skills System (15 core skills, 5 levels each, linear cost: 1 point per level)
  skills: Joi.array().items(
    Joi.object({
      skill_id: Joi.string().required(),
      skill_name: Joi.string().required(),
      level: Joi.number().integer().min(0).max(5).required(),
      xp: Joi.number().integer().min(0).default(0)  // XP progress towards next level
    })
  ).default([]),
  skillsAllocatedPoints: Joi.number().integer().min(0).max(20).default(5),
  skillsSpentPoints: Joi.number().integer().min(0).max(20).default(0),

  // Abilities System (starting abilities with fixed costs: 2-4 points each)
  abilities: Joi.array().items(
    Joi.object({
      ability_id: Joi.string().required(),
      ability_name: Joi.string().required(),
      learned_at: Joi.date().optional(),
      uses: Joi.number().integer().min(0).optional().default(0)
    })
  ).default([]),
  abilitiesAllocatedPoints: Joi.number().integer().min(0).max(15).default(7),
  abilitiesSpentPoints: Joi.number().integer().min(0).max(15).default(0),

  // JWT token for authentication
  token: Joi.string().required(),
  universe: Joi.string().lowercase().valid('gor').required() // Normalize to lowercase for case-insensitive matching
}).custom((value, helpers) => {
  // Validate stat point allocation for Gorean stats (5 stats, 10 points total)
  const baseStats = 5; // 1 point each in 5 stats
  const allocated = value.strength + value.agility + value.intellect + value.perception + value.charisma;
  const pointsUsed = allocated - baseStats;
  const expectedPoints = 10; // Gorean characters get 10 stat points

  if (pointsUsed !== expectedPoints) {
    return helpers.message({ custom: `Stats must use exactly 10 points (each stat 1-5, total allocation = 10 + 5 base = 15). Currently using ${pointsUsed} points.` });
  }

  // Validate skills point spending (linear costs: 1 point per level)
  if (value.skills && value.skills.length > 0) {
    let skillPointsSpent = 0;
    for (const skill of value.skills) {
      // Linear cost: Level 1=1pt, Level 2=2pts, Level 3=3pts, Level 4=4pts, Level 5=5pts
      const levelCost = skill.level;
      skillPointsSpent += levelCost;
    }

    if (skillPointsSpent !== value.skillsSpentPoints) {
      return helpers.message({ custom: `Skill points calculation mismatch. Expected ${skillPointsSpent} but got ${value.skillsSpentPoints}` });
    }

    if (value.skillsSpentPoints > value.skillsAllocatedPoints) {
      return helpers.message({ custom: `Cannot spend more skill points (${value.skillsSpentPoints}) than allocated (${value.skillsAllocatedPoints})` });
    }
  }

  // Validate ability point spending (abilities have fixed costs that will be verified by API)
  if (value.abilities && value.abilities.length > 0) {
    // Basic validation: ensure spent doesn't exceed allocated
    // Detailed cost verification happens in API route with abilities.json loaded
    if (value.abilitiesSpentPoints > value.abilitiesAllocatedPoints) {
      return helpers.message({ custom: `Cannot spend more ability points (${value.abilitiesSpentPoints}) than allocated (${value.abilitiesAllocatedPoints})` });
    }
  }

  return value;
}, 'Gorean stat, skill, and ability point validation');

// Gorean combat attack schema
export const gorCombatAttackSchema = Joi.object({
  attacker_uuid: uuidSchema,
  target_uuid: uuidSchema,
  attack_type: Joi.string().valid('melee_unarmed', 'melee_weapon', 'ranged').required(),
  weapon_type: Joi.string().valid('unarmed', 'light_weapon', 'medium_weapon', 'heavy_weapon', 'bow', 'crossbow').optional().default('unarmed'),
  universe: Joi.string().lowercase().valid('gor').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

// Gorean ability system schemas
export const gorUserAbilitiesSchema = Joi.object({
  player_uuid: uuidSchema,
  type: Joi.string().valid('attack', 'ability').optional(),  // Filter by ability type
  universe: Joi.string().lowercase().valid('gor').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const gorAbilityInfoSchema = Joi.object({
  player_uuid: uuidSchema,
  ability_id: Joi.string().min(1).max(255).optional(),
  ability_name: Joi.string().min(1).max(255).optional(),
  use_mode: Joi.string().valid('attack', 'ability', 'all').optional().default('all'),
  universe: Joi.string().lowercase().valid('gor').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
}).or('ability_id', 'ability_name');  // Require at least one

export const gorUseAbilitySchema = Joi.object({
  caster_uuid: uuidSchema,
  ability_id: Joi.string().min(1).max(255).optional(),
  ability_name: Joi.string().min(1).max(255).optional(),
  target_uuid: Joi.string().guid({ version: 'uuidv4' }).allow('').optional(),  // Optional for self/area, allow empty for self-targeting
  nearby_uuids: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })).optional(),  // For area effects
  universe: Joi.string().lowercase().valid('gor').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
}).or('ability_id', 'ability_name');  // Require at least one

// NPC validation schemas
export const npcRegistrationSchema = Joi.object({
  npcId: Joi.string().min(1).max(255).required(),
  universe: universeSchema,
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(2000).allow('').optional(),
  location: Joi.string().max(255).allow('').optional(),
  maxDailyTasks: Joi.number().integer().min(1).max(10).optional().default(3),
  taskInterval: Joi.number().integer().min(60).max(86400).optional().default(300),
  resetHour: Joi.number().integer().min(0).max(23).optional().default(6),
  minRewardMult: Joi.number().integer().min(1).max(10).optional().default(3),
  maxRewardMult: Joi.number().integer().min(1).max(20).optional().default(7),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const npcTaskAssignSchema = Joi.object({
  npcId: Joi.string().min(1).max(255).required(),
  playerUuid: uuidSchema,
  universe: universeSchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const npcTaskCheckSchema = Joi.object({
  npcId: Joi.string().min(1).max(255).required(),
  playerUuid: uuidSchema,
  universe: universeSchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const npcTaskCompleteSchema = Joi.object({
  taskId: Joi.number().integer().required(),
  playerUuid: uuidSchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const npcInfoSchema = Joi.object({
  npcId: Joi.string().min(1).max(255).required(),
  universe: universeSchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

// Arkana payment validation schema
export const arkanaPaymentSchema = Joi.object({
  sender_uuid: uuidSchema,
  recipient_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  currency: Joi.string().valid('credits', 'chips').required(),
  amount: Joi.number().integer().min(1).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

// Arkana combat validation schema (physical and ranged only - power attacks use power-attack endpoint)
export const arkanaCombatAttackSchema = Joi.object({
  attacker_uuid: uuidSchema,
  target_uuid: uuidSchema,
  attack_type: Joi.string().valid('physical', 'ranged').required(),
  weapon_type: Joi.string().valid('hand_to_hand', 'weapon').optional().default('hand_to_hand'),
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaPowerCheckSchema = Joi.object({
  player_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaFeatStatCheckSchema = Joi.object({
  player_uuid: uuidSchema,
  stat_type: Joi.string().valid('physical', 'dexterity', 'mental', 'perception').required(),
  target_number: Joi.number().integer().min(1).max(30).required(),
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaFirstAidSchema = Joi.object({
  healer_uuid: uuidSchema,
  target_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

// Arkana power-based combat validation schemas
export const arkanaUserPowersSchema = Joi.object({
  player_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  type: Joi.string().valid('attack', 'ability').optional().default('attack'),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaPowerInfoSchema = Joi.object({
  player_uuid: uuidSchema,
  power_id: Joi.string().min(1).max(255).optional(),
  power_name: Joi.string().min(1).max(255).optional(),
  use_mode: Joi.string().valid('attack', 'ability', 'all').optional().default('all'),
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
}).custom((value, helpers) => {
  // Ensure at least one of power_id or power_name is provided
  if (!value.power_id && !value.power_name) {
    return helpers.error('any.invalid', { message: 'Either power_id or power_name must be provided' });
  }
  return value;
}, 'Power identifier validation');

export const arkanaPowerAttackSchema = Joi.object({
  attacker_uuid: uuidSchema,
  power_id: Joi.string().min(1).max(255).optional(),
  power_name: Joi.string().min(1).max(255).optional(),
  target_uuid: Joi.string().uuid().allow('').optional(), // Optional for area-of-effect powers, allow empty string
  nearby_uuids: Joi.array().items(Joi.string().uuid()).optional().default([]),
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
}).custom((value, helpers) => {
  // Ensure at least one of power_id or power_name is provided
  if (!value.power_id && !value.power_name) {
    return helpers.error('any.invalid', { message: 'Either power_id or power_name must be provided' });
  }
  // Ensure attacker and target are different (only if target is provided)
  if (value.target_uuid && value.attacker_uuid === value.target_uuid) {
    return helpers.error('any.invalid', { message: 'Cannot attack yourself' });
  }
  return value;
}, 'Power attack validation');

export const arkanaPowerActivateSchema = Joi.object({
  caster_uuid: uuidSchema,
  power_id: Joi.string().min(1).max(255).optional(),
  power_name: Joi.string().min(1).max(255).optional(),
  ability_type: Joi.string().valid('commonPower', 'archetypePower', 'perk', 'cybernetic', 'magicWeave', 'auto').optional().default('auto'),
  target_uuid: Joi.string().uuid().allow('').optional(), // Optional for self/area powers, allow empty string
  nearby_uuids: Joi.array().items(Joi.string().uuid()).optional().default([]),
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
}).custom((value, helpers) => {
  // Ensure at least one of power_id or power_name is provided
  if (!value.power_id && !value.power_name) {
    return helpers.error('any.invalid', { message: 'Either power_id or power_name must be provided' });
  }
  return value;
}, 'Power activate validation');

// Arkana turn management validation schemas
export const arkanaEndTurnSchema = Joi.object({
  player_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaEndSceneSchema = Joi.object({
  player_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaUserActiveEffectsSchema = Joi.object({
  player_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaDeactivateActiveEffectSchema = Joi.object({
  player_uuid: uuidSchema,
  effect_id: Joi.string().min(1).max(255).required(),
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

// Crafting system validation schemas
export const recipeUpsertSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  shortName: Joi.string().min(1).max(100).required(),
  universe: universeSchema,
  craftingStationType: Joi.string().min(1).max(100).required(),
  ingredients: Joi.array().items(
    Joi.object({
      quantity: Joi.number().integer().min(1).required(),
      rpItemShortName: Joi.string().min(1).max(100).required()
    })
  ).min(1).required(),
  craftingTime: Joi.number().integer().min(1).max(86400).required(), // 1 second to 24 hours
  outputItemShortName: Joi.string().min(1).max(100).required(),
  outputItemQuantity: Joi.number().integer().min(1).default(1),
  knowledge: Joi.string().max(255).allow('').optional(),
  tool: Joi.string().max(255).allow('').optional(),
  license: Joi.string().max(255).allow('').optional(),
  category: Joi.string().min(1).max(100).required(),
  tags: Joi.string().max(500).allow('').default(''),
  exp: Joi.number().integer().min(0).default(0),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const recipesListSchema = Joi.object({
  craftingStationType: Joi.string().min(1).max(100).required(),
  category: Joi.string().min(1).max(100).required(),
  sl_uuid: uuidSchema,
  universe: universeSchema,
  shortNamesOnly: Joi.boolean().optional(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const craftingStartSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  stationId: Joi.string().min(1).max(100).required(),
  recipeShortName: Joi.string().min(1).max(100).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const craftingCompleteSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: universeSchema,
  stationId: Joi.string().min(1).max(100).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const craftingStationUpsertSchema = Joi.object({
  stationId: Joi.string().min(1).max(100).required(),
  universe: universeSchema,
  name: Joi.string().min(1).max(255).required(),
  type: Joi.string().min(1).max(100).required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const craftingCategoriesSchema = Joi.object({
  craftingStationType: Joi.string().min(1).max(100).required(),
  universe: universeSchema,
  timestamp: timestampSchema,
  signature: signatureSchema
});

// Arkana profile and admin validation schemas
export const arkanaProfileDataSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  token: Joi.string().required(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(5).max(100).optional().default(20)
});

export const arkanaMetadataSchema = Joi.object({
  token: Joi.string().required(),
  sl_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  sessionId: Joi.string().uuid().optional()
});

export const arkanaAdminVerifySchema = Joi.object({
  token: Joi.string().required()
});

export const arkanaAdminUserSearchSchema = Joi.object({
  token: Joi.string().required(),
  search: Joi.string().min(1).max(255).optional().allow(''),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(5).max(100).optional().default(20)
});

export const arkanaAdminObjectSearchSchema = Joi.object({
  token: Joi.string().required(),
  search: Joi.string().min(1).max(255).optional().allow(''),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(5).max(100).optional().default(20)
});

export const arkanaAdminObjectUpdateStateSchema = Joi.object({
  token: Joi.string().required(),
  objectId: Joi.string().min(1).max(255).required(),
  state: Joi.string().min(1).max(100).required()
});

export const arkanaAdminUserUpdateSchema = Joi.object({
  token: Joi.string().required(),

  // Identity fields
  characterName: Joi.string().min(1).max(255).optional(),
  agentName: Joi.string().min(1).max(255).optional(),
  aliasCallsign: Joi.string().max(255).allow('').optional(),
  faction: Joi.string().max(255).allow('').optional(),
  conceptRole: Joi.string().max(512).allow('').optional(),
  job: Joi.string().max(256).allow('').optional(),
  background: Joi.string().allow('').optional(),

  // Lineage
  race: Joi.string().max(100).optional(),
  subrace: Joi.string().max(100).allow('').optional(),
  archetype: Joi.string().max(100).allow('').optional(),

  // Stats (1-10 range for admin flexibility, though normal is 1-5)
  physical: Joi.number().integer().min(1).max(10).optional(),
  dexterity: Joi.number().integer().min(1).max(10).optional(),
  mental: Joi.number().integer().min(1).max(10).optional(),
  perception: Joi.number().integer().min(1).max(10).optional(),
  maxHP: Joi.number().integer().min(1).max(100).optional(),
  hitPoints: Joi.number().integer().min(1).max(100).optional(), // DEPRECATED: Use maxHP (kept for backward compatibility)

  // Current health from userStats
  health: Joi.number().integer().min(0).max(100).optional(),
  status: Joi.number().integer().min(0).max(2).optional(), // Arkana: 0=RP, 1=OOC, 2=AFK

  // Skills System
  skills: Joi.array().items(
    Joi.object({
      skill_id: Joi.string().required(),
      skill_name: Joi.string().required(),
      level: Joi.number().integer().min(0).max(3).required()
    })
  ).optional(),
  skillsAllocatedPoints: Joi.number().integer().min(0).max(20).optional(),
  skillsSpentPoints: Joi.number().integer().min(0).max(20).optional(),

  // Powers and abilities
  inherentPowers: Joi.array().items(Joi.string()).optional(),
  weaknesses: Joi.array().items(Joi.string()).optional(),
  flaws: Joi.alternatives().try(Joi.array(), Joi.object()).optional(),
  commonPowers: Joi.array().items(Joi.string()).optional(),
  archetypePowers: Joi.array().items(Joi.string()).optional(),
  perks: Joi.array().items(Joi.string()).optional(),

  // Magic
  magicSchools: Joi.array().items(Joi.string()).optional(),
  magicWeaves: Joi.array().items(Joi.string()).optional(),

  // Cybernetics
  cybernetics: Joi.alternatives().try(Joi.array(), Joi.object()).optional(),
  cyberneticAugments: Joi.array().items(Joi.string()).optional(),
  cyberneticsSlots: Joi.number().integer().min(0).max(20).optional(),

  // Economy
  credits: Joi.number().integer().min(0).optional(),
  chips: Joi.number().integer().min(0).optional(),
  xp: Joi.number().integer().min(0).optional(),

  // Admin role
  arkanaRole: Joi.string().valid('player', 'admin').optional()
}).custom((value, helpers) => {
  // Validate health doesn't exceed maxHP/hitPoints if both are provided
  const maxHealth = value.maxHP !== undefined ? value.maxHP : value.hitPoints;
  if (value.health !== undefined && maxHealth !== undefined) {
    if (value.health > maxHealth) {
      return helpers.message({ custom: 'Current health cannot exceed maximum health (maxHP)' });
    }
  }
  return value;
});

// Arkana Data Management - Admin endpoints for dynamic content system
const arkanaDataTypes = ['flaw', 'commonPower', 'archetypePower', 'perk', 'magicSchool', 'magicWave', 'cybernetic', 'skill', 'effect'];

export const arkanaAdminDataListSchema = Joi.object({
  token: Joi.string().required(),
  type: Joi.string().valid(...arkanaDataTypes).optional(),
  search: Joi.string().max(255).optional().allow(''),
  page: Joi.string().pattern(/^\d+$/).optional().default('1'),
  limit: Joi.string().pattern(/^\d+$/).optional().default('50'),
  sortBy: Joi.string().valid('id', 'arkanaDataType', 'orderNumber', 'createdAt', 'updatedAt').optional().default('id'),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('asc')
});

export const arkanaAdminDataGetSchema = Joi.object({
  token: Joi.string().required(),
  id: Joi.string().required()
});

export const arkanaAdminDataCreateSchema = Joi.object({
  token: Joi.string().required(),
  id: Joi.string().min(1).max(255).required(),
  type: Joi.string().valid(...arkanaDataTypes).required(),
  orderNumber: Joi.number().integer().min(0).optional().allow(null),
  jsonData: Joi.object().required() // Validated separately per type in endpoint
});

export const arkanaAdminDataUpdateSchema = Joi.object({
  token: Joi.string().required(),
  id: Joi.string().min(1).max(255).required(),
  orderNumber: Joi.number().integer().min(0).optional().allow(null),
  jsonData: Joi.object().required()
});

export const arkanaAdminDataDeleteSchema = Joi.object({
  token: Joi.string().required(),
  id: Joi.string().required()
});

export const arkanaAdminDataBulkSaveSchema = Joi.object({
  token: Joi.string().required(),
  data: Joi.array().items(
    Joi.object({
      id: Joi.string().min(1).max(255).required(),
      type: Joi.string().valid(...arkanaDataTypes).required(),
      orderNumber: Joi.number().integer().min(0).optional().allow(null),
      jsonData: Joi.object().required()
    })
  ).min(1).required()
});

export const arkanaAdminDataExportSchema = Joi.object({
  token: Joi.string().required(),
  type: Joi.string().valid(...arkanaDataTypes).required()
});

// Export schema for POST requests (token in body like other admin POST endpoints)
export const arkanaAdminDataExportBodySchema = Joi.object({
  token: Joi.string().required(),
  type: Joi.string().valid(...arkanaDataTypes).required()
});

// Export schema for GET requests (type only, token from query params)
export const arkanaAdminDataExportTypeSchema = Joi.object({
  type: Joi.string().valid(...arkanaDataTypes).required()
});

// Arkana social groups validation schemas
export const arkanaGetGroupsSchema = Joi.object({
  player_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaAddToGroupSchema = Joi.object({
  player_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  group_name: Joi.string().min(1).max(50).required(),
  target_arkana_id: Joi.number().integer().positive().required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaRemoveFromGroupSchema = Joi.object({
  player_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  group_name: Joi.string().min(1).max(50).required(),
  target_arkana_id: Joi.number().integer().positive().required(),
  timestamp: timestampSchema,
  signature: signatureSchema
});

export const arkanaSearchUsersSchema = Joi.object({
  player_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  search: Joi.string().max(100).optional().allow(''),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  timestamp: timestampSchema,
  signature: signatureSchema
});

// ========================================
// Arkana XP Shop Validation Schemas
// ========================================

// GET /api/arkana/shop/items - Query parameters
export const arkanaShopItemsRequestSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  token: Joi.string().required(),
  sessionId: Joi.string().required()
});

// POST /api/arkana/shop/purchase - Purchase request
export const arkanaShopPurchaseSchema = Joi.object({
  sl_uuid: uuidSchema,
  universe: Joi.string().valid('arkana').required(),
  token: Joi.string().required(),
  sessionId: Joi.string().required(),
  purchases: Joi.array().items(
    Joi.object({
      itemType: Joi.string().valid('cybernetic', 'magic_weave', 'magic_school', 'cybernetic_slot', 'common_power', 'archetype_power', 'perk').required(),
      itemId: Joi.string().required(),
      xpCost: Joi.number().integer().min(0).required(),
      quantity: Joi.number().integer().min(1).max(20).optional() // For slot purchases
    })
  ).min(1).required()
});
