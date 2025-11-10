// Gorean Theme Provider and Shared UI Components
// Medieval/fantasy aesthetic with earthy tones and parchment textures
import React from 'react';

// ============================================================================
// COLOR PALETTE
// ============================================================================

export const GoreanColors = {
  // Base colors - earthy tones
  parchment: '#F4ECD8',
  parchmentDark: '#E8DCC4',
  leather: '#8B6F47',
  leatherDark: '#6B5736',
  bronze: '#CD7F32',
  bronzeDark: '#A86B28',
  gold: '#D4AF37',
  goldDark: '#B8941F',

  // Neutral colors
  charcoal: '#2C2416',
  stone: '#8B8378',
  stoneLight: '#B5ADA2',
  cream: '#FAF6F0',

  // Accent colors
  bloodRed: '#8B0000',
  forestGreen: '#228B22',
  deepBlue: '#00008B',

  // Caste colors (authentic from Gor books)
  casteWhite: '#FFFFFF',      // Initiates
  casteBlue: '#0047AB',        // Scribes
  casteYellow: '#FFD700',      // Builders
  casteGreen: '#228B22',       // Physicians
  casteScarlet: '#DC143C',     // Warriors

  // Status indicators
  success: '#228B22',
  warning: '#CD7F32',
  error: '#8B0000',
  info: '#00008B',
};

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const GoreanFonts = {
  heading: '"Cinzel", "Times New Roman", serif',
  body: '"Crimson Text", "Georgia", serif',
  decorative: '"Uncial Antiqua", "Times New Roman", serif',
  monospace: '"Courier New", monospace',
};

// ============================================================================
// REUSABLE UI COMPONENTS
// ============================================================================

interface GoreanButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'disabled';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export function GoreanButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button'
}: GoreanButtonProps) {
  const baseClasses = 'font-semibold rounded-md transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed';

  // Text color classes
  const variantTextClasses = {
    primary: 'text-charcoal',
    secondary: 'text-white',
    danger: 'text-white',
    success: 'text-white',
    disabled: 'text-gray-600'
  };

  // Background styles using explicit hex values
  const variantStyles = {
    primary: {
      backgroundImage: `linear-gradient(to bottom, ${GoreanColors.bronze}, ${GoreanColors.bronzeDark})`
    },
    secondary: {
      backgroundImage: `linear-gradient(to bottom, ${GoreanColors.charcoal}, ${GoreanColors.leatherDark})`
    },
    danger: {
      backgroundImage: `linear-gradient(to bottom, ${GoreanColors.bloodRed}, #8B0000)`
    },
    success: {
      backgroundImage: `linear-gradient(to bottom, ${GoreanColors.forestGreen}, #006400)`
    },
    disabled: {
      backgroundColor: '#9CA3AF'
    }
  };

  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  const finalVariant = disabled ? 'disabled' : variant;

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantTextClasses[finalVariant]} ${sizeClasses[size]} ${className}`}
      style={{
        fontFamily: GoreanFonts.body,
        ...variantStyles[finalVariant]
      }}
    >
      {children}
    </button>
  );
}

interface GoreanCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  hoverable?: boolean;
}

export function GoreanCard({ children, className = '', onClick, selected = false, hoverable = false }: GoreanCardProps) {
  const baseClasses = 'rounded-lg shadow-md overflow-hidden';
  const backgroundClasses = 'bg-gradient-to-br from-parchment to-parchmentDark';
  const borderClasses = selected
    ? 'border-4 border-bronze'
    : 'border-2 border-stone';
  const hoverClasses = hoverable
    ? 'hover:shadow-xl hover:border-bronze cursor-pointer transition-all duration-200'
    : '';
  const clickableClasses = onClick ? 'cursor-pointer' : '';

  return (
    <div
      onClick={onClick}
      className={`${baseClasses} ${backgroundClasses} ${borderClasses} ${hoverClasses} ${clickableClasses} ${className}`}
      style={{ fontFamily: GoreanFonts.body }}
    >
      {children}
    </div>
  );
}

interface GoreanHeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
  className?: string;
  decorative?: boolean;
}

export function GoreanHeading({ level, children, className = '', decorative = false }: GoreanHeadingProps) {
  const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;

  const sizeClasses = {
    1: 'text-4xl md:text-5xl',
    2: 'text-3xl md:text-4xl',
    3: 'text-2xl md:text-3xl',
    4: 'text-xl md:text-2xl',
    5: 'text-lg md:text-xl',
    6: 'text-base md:text-lg'
  };

  const fontFamily = decorative ? GoreanFonts.decorative : GoreanFonts.heading;

  return (
    <Tag
      className={`font-bold ${sizeClasses[level]} ${className}`}
      style={{
        fontFamily,
        color: GoreanColors.charcoal,
        textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
      }}
    >
      {children}
    </Tag>
  );
}

interface GoreanBadgeProps {
  children: React.ReactNode;
  color?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function GoreanBadge({ children, color = GoreanColors.bronze, className = '', size = 'md' }: GoreanBadgeProps) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base'
  };

  // Determine text color based on background luminance
  const isDark = color === GoreanColors.charcoal || color === GoreanColors.bloodRed || color === GoreanColors.deepBlue;
  const textColor = isDark ? 'text-white' : 'text-charcoal';

  return (
    <span
      className={`inline-block rounded-full font-semibold ${sizeClasses[size]} ${textColor} ${className}`}
      style={{
        backgroundColor: color,
        fontFamily: GoreanFonts.body,
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }}
    >
      {children}
    </span>
  );
}

interface GoreanDividerProps {
  className?: string;
  ornament?: boolean;
}

export function GoreanDivider({ className = '', ornament = false }: GoreanDividerProps) {
  if (ornament) {
    return (
      <div className={`flex items-center justify-center my-6 ${className}`}>
        <div className="flex-1 border-t-2 border-bronze"></div>
        <div className="px-4" style={{ fontFamily: GoreanFonts.decorative, color: GoreanColors.bronze }}>
          ⚔
        </div>
        <div className="flex-1 border-t-2 border-bronze"></div>
      </div>
    );
  }

  return <hr className={`border-t-2 border-bronze my-4 ${className}`} />;
}

interface GoreanScrollProps {
  children: React.ReactNode;
  className?: string;
}

export function GoreanScroll({ children, className = '' }: GoreanScrollProps) {
  return (
    <div className={`relative ${className}`}>
      {/* Scroll background */}
      <div
        className="rounded-lg p-6 shadow-2xl"
        style={{
          backgroundColor: GoreanColors.parchment,
          backgroundImage: `linear-gradient(to bottom, ${GoreanColors.parchment}, ${GoreanColors.parchmentDark})`,
          border: `3px solid ${GoreanColors.leather}`,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)'
        }}
      >
        {/* Inner content */}
        <div className="relative z-10">{children}</div>

        {/* Corner ornaments */}
        <div
          className="absolute top-2 left-2 w-6 h-6 rounded-full"
          style={{
            backgroundColor: GoreanColors.bronze,
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
          }}
        />
        <div
          className="absolute top-2 right-2 w-6 h-6 rounded-full"
          style={{
            backgroundColor: GoreanColors.bronze,
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
          }}
        />
        <div
          className="absolute bottom-2 left-2 w-6 h-6 rounded-full"
          style={{
            backgroundColor: GoreanColors.bronze,
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
          }}
        />
        <div
          className="absolute bottom-2 right-2 w-6 h-6 rounded-full"
          style={{
            backgroundColor: GoreanColors.bronze,
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// CASTE COLOR UTILITIES
// ============================================================================

export function getCasteColor(casteName: string): string {
  const name = casteName.toLowerCase();

  if (name.includes('initiate')) return GoreanColors.casteWhite;
  if (name.includes('scribe')) return GoreanColors.casteBlue;
  if (name.includes('builder')) return GoreanColors.casteYellow;
  if (name.includes('physician')) return GoreanColors.casteGreen;
  if (name.includes('warrior')) return GoreanColors.casteScarlet;

  // Default for low castes
  return GoreanColors.stone;
}

export function getCasteColorByRole(casteRole: string | undefined): string {
  if (!casteRole) return GoreanColors.stone;

  const role = casteRole.toLowerCase();

  if (role.includes('initiates')) return GoreanColors.casteWhite;
  if (role.includes('scribes')) return GoreanColors.casteBlue;
  if (role.includes('builders')) return GoreanColors.casteYellow;
  if (role.includes('physicians')) return GoreanColors.casteGreen;
  if (role.includes('warriors')) return GoreanColors.casteScarlet;

  return GoreanColors.stone;
}

// ============================================================================
// RARITY DISPLAY UTILITIES
// ============================================================================

export function getRarityColor(rarity: string): string {
  const rarityMap: Record<string, string> = {
    very_common: GoreanColors.stone,
    common: GoreanColors.forestGreen,
    uncommon: GoreanColors.deepBlue,
    rare: GoreanColors.gold,
    very_rare: GoreanColors.bronze,
    extremely_rare: GoreanColors.bloodRed
  };

  return rarityMap[rarity] || GoreanColors.stone;
}

export function getRarityDisplayName(rarity: string): string {
  const nameMap: Record<string, string> = {
    very_common: 'Very Common',
    common: 'Common',
    uncommon: 'Uncommon',
    rare: 'Rare',
    very_rare: 'Very Rare',
    extremely_rare: 'Extremely Rare'
  };

  return nameMap[rarity] || rarity;
}

// ============================================================================
// POPULARITY RATING DISPLAY
// ============================================================================

interface PopularityStarsProps {
  rating: number;
  maxRating?: number;
  className?: string;
}

export function PopularityStars({ rating, maxRating = 5, className = '' }: PopularityStarsProps) {
  const stars = [];

  for (let i = 1; i <= maxRating; i++) {
    stars.push(
      <span
        key={i}
        style={{ color: i <= rating ? GoreanColors.gold : GoreanColors.stoneLight }}
        className="text-lg"
      >
        ★
      </span>
    );
  }

  return <div className={`inline-flex ${className}`}>{stars}</div>;
}

// ============================================================================
// LOADING SPINNER
// ============================================================================

interface GoreanSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function GoreanSpinner({ size = 'md', className = '' }: GoreanSpinnerProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-20 h-20'
  };

  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div
        className={`${sizeClasses[size]} border-4 rounded-full animate-spin`}
        style={{
          borderColor: GoreanColors.bronze,
          borderTopColor: 'transparent'
        }}
      />
    </div>
  );
}

// ============================================================================
// ERROR MESSAGE
// ============================================================================

interface GoreanErrorProps {
  message: string;
  className?: string;
}

export function GoreanError({ message, className = '' }: GoreanErrorProps) {
  return (
    <div
      className={`p-4 rounded-lg border-2 ${className}`}
      style={{
        backgroundColor: '#FEE',
        borderColor: GoreanColors.bloodRed,
        color: GoreanColors.bloodRed,
        fontFamily: GoreanFonts.body
      }}
    >
      <div className="flex items-start">
        <span className="text-2xl mr-3">⚠</span>
        <div>
          <p className="font-semibold">Error</p>
          <p className="text-sm mt-1">{message}</p>
        </div>
      </div>
    </div>
  );
}
