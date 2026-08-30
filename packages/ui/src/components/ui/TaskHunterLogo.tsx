import React, { useMemo } from 'react';
import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { useI18n } from '@/lib/i18n';

interface TaskHunterLogoProps {
  className?: string;
  width?: number;
  height?: number;
  isAnimated?: boolean;
}

export const TaskHunterLogo: React.FC<TaskHunterLogoProps> = ({
  className = '',
  width = 70,
  height = 70,
  isAnimated = false,
}) => {
  const { t } = useI18n();
  const themeContext = useOptionalThemeSystem();

  let isDark = true;
  if (themeContext) {
    isDark = themeContext.currentTheme.metadata.variant !== 'light';
  } else if (typeof window !== 'undefined') {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  const strokeColor = useMemo(() => {
    if (themeContext) {
      return themeContext.currentTheme.colors.surface.foreground;
    }
    if (typeof window !== 'undefined') {
      const fromVars = getComputedStyle(document.documentElement).getPropertyValue('--splash-stroke').trim();
      if (fromVars) {
        return fromVars;
      }
    }
    return isDark ? 'white' : 'black';
  }, [themeContext, isDark]);

  const supportsColorMix = useMemo(() => {
    if (typeof window === 'undefined' || typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
      return false;
    }
    return CSS.supports('color', 'color-mix(in srgb, white 50%, transparent)');
  }, []);

  const fillColor = useMemo(() => {
    if (themeContext) {
      if (supportsColorMix) {
        return `color-mix(in srgb, ${strokeColor} 15%, transparent)`;
      }
      return isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
    }
    if (typeof window !== 'undefined') {
      const fromVars = getComputedStyle(document.documentElement).getPropertyValue('--splash-face-fill').trim();
      if (fromVars) {
        return fromVars;
      }
    }
    return isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  }, [themeContext, supportsColorMix, strokeColor, isDark]);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={t('taskHunterLogo.aria.logo')}
    >
      {isAnimated ? (
        <style>{`@keyframes th-logo-glow{0%,100%{filter:drop-shadow(0 0 0 transparent)}50%{filter:drop-shadow(0 0 4px var(--th-glow-color))}}.th-logo-glow{animation:th-logo-glow 1.8s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.th-logo-glow{animation:none}}`}</style>
      ) : null}
      <g
        className={isAnimated ? 'th-logo-glow' : undefined}
        // SAFETY: CSS custom properties are only valid at runtime, not in the CSSProperties type.
        style={isAnimated ? ({ '--th-glow-color': strokeColor } as React.CSSProperties) : undefined}
      >
        {/* Target ring */}
        <circle
          cx="50"
          cy="50"
          r="38"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="4"
        />
        {/* Crosshair ticks */}
        <path
          d="M50 4 V18 M50 82 V96 M4 50 H18 M82 50 H96"
          stroke={strokeColor}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Task checkmark (same weight as the ring, butt caps like the master SVG) */}
        <path
          d="M36 51 L46 61 L65 39"
          stroke={strokeColor}
          strokeWidth="4"
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
      </g>
    </svg>
  );
};
