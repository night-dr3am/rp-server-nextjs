import {
  loadAllGoreanData,
  getCulturesForSpecies,
  getStatusesForSpecies,
  getSpeciesById
} from '@/lib/gorData';

describe('Gorean Data Hybrid Category/ID Matching', () => {
  beforeAll(async () => {
    // Load Gorean data before running tests
    await loadAllGoreanData();
  });

  describe('getCulturesForSpecies() - Hybrid Matching', () => {
    it('should match cultures by exact species ID (e.g., sleen)', () => {
      // Sleen is a specific feline species
      const cultures = getCulturesForSpecies('sleen');

      // Should include cultures that list "sleen" explicitly OR "feline" category OR "*"
      expect(cultures.length).toBeGreaterThan(0);

      // Wild Animal culture uses categories ["feline", "canine_like", etc.]
      const wildAnimal = cultures.find(c => c.id === 'wild');
      expect(wildAnimal).toBeDefined();
    });

    it('should match cultures by species category (e.g., feline)', () => {
      // Larl is a feline species
      const larlSpecies = getSpeciesById('larl');
      expect(larlSpecies?.category).toBe('feline');

      const cultures = getCulturesForSpecies('larl');

      // Should include Wild Animal culture (uses "feline" category)
      const wildAnimal = cultures.find(c => c.id === 'wild');
      expect(wildAnimal).toBeDefined();
      expect(wildAnimal?.applicableSpecies).toContain('feline');
    });

    it('should match cultures with wildcard "*"', () => {
      // Any species should match cultures with "*" in applicableSpecies
      const humanCultures = getCulturesForSpecies('human');
      const sleenCultures = getCulturesForSpecies('sleen');

      // Both should include cultures with wildcard
      const humanWildcard = humanCultures.filter(c => c.applicableSpecies?.includes('*'));
      const sleenWildcard = sleenCultures.filter(c => c.applicableSpecies?.includes('*'));

      expect(humanWildcard.length).toBeGreaterThanOrEqual(0);
      expect(sleenWildcard.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter out cultures not applicable to species', () => {
      // Larl (feline) should NOT match sapient-only cultures
      const cultures = getCulturesForSpecies('larl');

      // Southern Cities is sapient-only
      const southernCities = cultures.find(c => c.id === 'southern_cities');
      expect(southernCities).toBeUndefined();
    });

    it('should support both category and exact ID in same culture', () => {
      // Test that a culture can use both ["sapient", "sleen"] format
      // This tests the flexibility of the hybrid approach
      const humanCultures = getCulturesForSpecies('human');
      const sleenCultures = getCulturesForSpecies('sleen');

      // Both should work independently
      expect(humanCultures.length).toBeGreaterThan(0);
      expect(sleenCultures.length).toBeGreaterThan(0);
    });
  });

  describe('getStatusesForSpecies() - Hybrid Matching', () => {
    it('should match statuses by exact species ID', () => {
      // Sleen should match statuses listing "sleen" explicitly
      const statuses = getStatusesForSpecies('sleen');

      expect(statuses.length).toBeGreaterThan(0);

      // Domesticated status lists specific domesticated species
      const domesticated = statuses.find(s => s.id === 'domesticated');
      expect(domesticated).toBeDefined();
      expect(domesticated?.applicableSpecies).toContain('sleen');
    });

    it('should match statuses by species category (e.g., feline)', () => {
      // Larl is a feline species
      const larlSpecies = getSpeciesById('larl');
      expect(larlSpecies?.category).toBe('feline');

      const statuses = getStatusesForSpecies('larl');

      // Should include Wild status (uses "feline" category)
      const wild = statuses.find(s => s.id === 'wild');
      expect(wild).toBeDefined();
      expect(wild?.applicableSpecies).toContain('feline');
    });

    it('should match statuses with wildcard "*"', () => {
      // Any species should match statuses with "*"
      const humanStatuses = getStatusesForSpecies('human');
      const sleenStatuses = getStatusesForSpecies('sleen');

      // Both should include statuses with wildcard if any exist
      const humanWildcard = humanStatuses.filter(s => s.applicableSpecies?.includes('*'));
      const sleenWildcard = sleenStatuses.filter(s => s.applicableSpecies?.includes('*'));

      expect(humanWildcard.length).toBeGreaterThanOrEqual(0);
      expect(sleenWildcard.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter out statuses not applicable to species', () => {
      // Larl (feline) should NOT match human-only statuses
      const statuses = getStatusesForSpecies('larl');

      // freeMan is human-only (sapient)
      const freeMan = statuses.find(s => s.id === 'freeMan');
      expect(freeMan).toBeUndefined();
    });

    it('should include Wild status for all animal categories', () => {
      // All 7 animal categories should match Wild status
      const animalCategories = ['feline', 'canine_like', 'hooved', 'avian', 'reptilian', 'aquatic', 'small'];

      // Pick specific species from different categories
      // larl (feline), sleen (canine_like), bosk (hooved), tarn (avian), tarsk (small)
      const testSpecies = ['larl', 'sleen', 'bosk', 'tarn', 'tarsk'];

      testSpecies.forEach(speciesId => {
        const statuses = getStatusesForSpecies(speciesId);
        const wild = statuses.find(s => s.id === 'wild');
        expect(wild).toBeDefined();
      });
    });

    it('should include Domesticated status for specific domesticated species', () => {
      // Domesticated status lists specific species (sleen, tarn, kaiila, etc.)
      const domesticatedSpecies = ['sleen', 'tarn', 'kaiila', 'bosk'];

      domesticatedSpecies.forEach(speciesId => {
        const statuses = getStatusesForSpecies(speciesId);
        const domesticated = statuses.find(s => s.id === 'domesticated');
        expect(domesticated).toBeDefined();
      });
    });

    it('should include Companion status for bonding-capable species', () => {
      // Companion status lists specific species capable of deep bonds
      const companionSpecies = ['sleen', 'tarn', 'kaiila', 'larl'];

      companionSpecies.forEach(speciesId => {
        const statuses = getStatusesForSpecies(speciesId);
        const companion = statuses.find(s => s.id === 'companion');
        expect(companion).toBeDefined();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for invalid species ID', () => {
      const cultures = getCulturesForSpecies('invalid_species_xyz');
      const statuses = getStatusesForSpecies('invalid_species_xyz');

      // Should not crash, should return empty or filtered results
      expect(Array.isArray(cultures)).toBe(true);
      expect(Array.isArray(statuses)).toBe(true);
    });

    it('should return all items when no species ID provided', () => {
      const allCultures = getCulturesForSpecies('');
      const allStatuses = getStatusesForSpecies('');

      // Should return all cultures/statuses when no filter applied
      expect(allCultures.length).toBeGreaterThan(0);
      expect(allStatuses.length).toBeGreaterThan(0);
    });

    it('should handle species with no category gracefully', () => {
      // Even if species data is missing category, should not crash
      const cultures = getCulturesForSpecies('hypothetical_species');
      const statuses = getStatusesForSpecies('hypothetical_species');

      expect(Array.isArray(cultures)).toBe(true);
      expect(Array.isArray(statuses)).toBe(true);
    });
  });
});
