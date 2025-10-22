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
  owner: uuidSchema.optional(),
  type: Joi.string().min(1).max(100).required(),
  state: Joi.string().min(1).max(100).default('default'),
  stats: Joi.object().optional().default({}),
  groups: Joi.array().optional().default([]),
  actions: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    label: Joi.string().required(),
    showState: Joi.string().required(),
    targetState: Joi.string().optional(),
    description: Joi.string().optional(),
    requiresStat: Joi.object().optional(),
    requiredGroup: Joi.string().optional(),
    requiredRole: Joi.string().optional()
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
  target_uuid: uuidSchema,
  nearby_uuids: Joi.array().items(Joi.string().uuid()).optional().default([]),
  universe: Joi.string().valid('arkana').required(),
  timestamp: timestampSchema,
  signature: signatureSchema
}).custom((value, helpers) => {
  // Ensure at least one of power_id or power_name is provided
  if (!value.power_id && !value.power_name) {
    return helpers.error('any.invalid', { message: 'Either power_id or power_name must be provided' });
  }
  // Ensure attacker and target are different
  if (value.attacker_uuid === value.target_uuid) {
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

export const arkanaAdminVerifySchema = Joi.object({
  token: Joi.string().required()
});

export const arkanaAdminUserSearchSchema = Joi.object({
  token: Joi.string().required(),
  search: Joi.string().min(1).max(255).optional().allow(''),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(5).max(100).optional().default(20)
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
  hitPoints: Joi.number().integer().min(1).max(100).optional(),

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

  // Economy
  credits: Joi.number().integer().min(0).optional(),
  chips: Joi.number().integer().min(0).optional(),
  xp: Joi.number().integer().min(0).optional(),

  // Admin role
  arkanaRole: Joi.string().valid('player', 'admin').optional()
}).custom((value, helpers) => {
  // Validate health doesn't exceed hitPoints if both are provided
  if (value.health !== undefined && value.hitPoints !== undefined) {
    if (value.health > value.hitPoints) {
      return helpers.message({ custom: 'Current health cannot exceed maximum health (hitPoints)' });
    }
  }
  return value;
});
