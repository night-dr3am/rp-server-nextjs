// Slave Type Selector Component for Gorean Character Creation
// Allows selection between cultural variants of slave status (e.g., Kajira vs Bondmaid)
import React from 'react';
import {
  SlaveType,
  getSlaveTypesForStatus,
  getStatusById
} from '@/lib/gorData';
import {
  GoreanCard,
  GoreanHeading,
  GoreanBadge,
  GoreanColors
} from './GoreanTheme';

interface SlaveTypeSelectorProps {
  selectedStatusId: string | undefined;
  selectedSlaveType: string | undefined;
  onSelectSlaveType: (slaveType: SlaveType) => void;
  className?: string;
}

export function SlaveTypeSelector({
  selectedStatusId,
  selectedSlaveType,
  onSelectSlaveType,
  className = ''
}: SlaveTypeSelectorProps) {
  // Get slave types for the selected status
  const slaveTypes = selectedStatusId ? getSlaveTypesForStatus(selectedStatusId) : [];
  const statusData = selectedStatusId ? getStatusById(selectedStatusId) : undefined;

  if (!selectedStatusId) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <p className="text-lg mb-2" style={{ color: GoreanColors.stone }}>
          Please select a status first
        </p>
        <p className="text-sm" style={{ color: GoreanColors.stoneLight }}>
          Slave type selection is available after choosing a slave status.
        </p>
      </div>
    );
  }

  if (slaveTypes.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <p className="text-lg mb-2" style={{ color: GoreanColors.stone }}>
          No slave types available
        </p>
        <p className="text-sm" style={{ color: GoreanColors.stoneLight }}>
          The selected status does not have cultural variants.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <GoreanHeading level={2}>Choose Your Slave Type</GoreanHeading>
        <p className="text-sm mt-2" style={{ color: GoreanColors.stone }}>
          Select the cultural term that best describes your {statusData?.name?.toLowerCase() || 'slave'} character.
          These terms vary by region and culture on Gor.
        </p>
      </div>

      {/* Slave Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {slaveTypes.map(slaveType => {
          const isSelected = selectedSlaveType === slaveType.id;

          return (
            <GoreanCard
              key={slaveType.id}
              selected={isSelected}
              hoverable
              onClick={() => onSelectSlaveType(slaveType)}
              className="p-5 relative"
            >
              {/* Header */}
              <div className="mb-4">
                <div className="flex items-start justify-between mb-3">
                  <GoreanHeading level={3} className="flex-1">
                    {slaveType.name}
                  </GoreanHeading>
                  {isSelected && (
                    <span className="text-2xl ml-2" style={{ color: GoreanColors.bronze }}>
                      ✓
                    </span>
                  )}
                </div>

                {/* Cultural Origin Badge */}
                <GoreanBadge
                  size="sm"
                  color={GoreanColors.leather}
                >
                  {slaveType.culturalOrigin}
                </GoreanBadge>
              </div>

              {/* Description */}
              <p className="text-sm" style={{ color: GoreanColors.charcoal }}>
                {slaveType.description}
              </p>

              {/* Additional Info */}
              <div className="mt-4 p-3 rounded" style={{ backgroundColor: GoreanColors.parchmentDark }}>
                <p className="text-xs italic" style={{ color: GoreanColors.bronze }}>
                  {slaveType.culturalOrigin === 'Southern Cities'
                    ? '🏛️ Used in most cities and urban areas of Counter-Earth.'
                    : slaveType.culturalOrigin === 'Torvaldsland (Northern)'
                      ? '⚔️ Used in the harsh northern lands, reflects Viking-like culture.'
                      : '🌍 Regional terminology reflecting local customs.'}
                </p>
              </div>
            </GoreanCard>
          );
        })}
      </div>

      {/* Help Text */}
      <div className="text-center text-sm" style={{ color: GoreanColors.stone }}>
        <p>
          Both terms refer to the same legal status with identical rights and restrictions.
          The difference is purely cultural and regional terminology.
        </p>
      </div>
    </div>
  );
}
