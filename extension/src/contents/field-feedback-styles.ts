/**
 * Field Feedback Shadow DOM CSS
 *
 * Returns the full CSS string injected into each overlay's closed Shadow DOM.
 * All styles use :host() attribute selectors driven by the FieldOverlay class.
 *
 * Host attributes consumed:
 *   data-state="idle|listening|filled|copied|timeout"
 *   data-theme="dark"
 *   data-visible="false"
 *   data-compact="true"
 *   data-text-pos="above|below"
 *   data-focused="true"
 */

export const config = {
  matches: ["https://*/*", "http://*/*"],
}

import { FONT_FAMILY_UI } from '@/lib/design-tokens'

// InboxKey brand colors (per spec: primary, success, warning)
const PRIMARY = '0, 122, 255'    // rgb(0,122,255)  -- InboxKey primary
const SUCCESS = '16, 185, 129'   // rgb(16,185,129)  -- filled/copied
const WARNING = '245, 158, 11'   // rgb(245,158,11)  -- timeout (amber, not red)

/**
 * Generate the Shadow DOM CSS string.
 * Called once per overlay instance when the shadow root is created.
 */
export function generateShadowCSS(): string {
  return `
/* ================================================================
   HOST ELEMENT
   ================================================================ */

:host {
  all: initial;
  position: fixed;
  pointer-events: none;
  z-index: 2147483646;
  display: block;
}

/* ── Scroll visibility gating ── */
:host([data-visible="false"]) {
  opacity: 0 !important;
}

/* ── Entrance animation ── */
:host([data-state="idle"]) {
  opacity: 0;
  transform: scale(0.98);
}

:host(:not([data-state="idle"])) {
  opacity: 1;
  transform: scale(1);
  transition: opacity 0.3s ease, transform 0.3s ease;
}

/* ================================================================
   BORDER RING
   ================================================================ */

.border-ring {
  position: absolute;
  inset: calc(-1 * var(--border-width, 2.5px) - 0.5px);
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease, inset 0.2s ease;
}

.border-ring::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: var(--border-width, 2.5px);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  /* Default conic gradient (overridden per state) */
  background: conic-gradient(
    from var(--inboxkey-angle, 0deg),
    transparent 0%,
    rgba(${PRIMARY}, 0.3) 25%,
    rgba(${PRIMARY}, 0.5) 50%,
    rgba(${PRIMARY}, 0.3) 75%,
    transparent 100%
  );
}

/* ── Focus: expand inset for breathing room ── */
:host([data-focused="true"]) .border-ring {
  inset: -5px;
}

/* ── Compact: hide status pill on narrow inputs ── */
:host([data-compact="true"]) .status-text {
  display: none;
}

/* ================================================================
   IDLE STATE
   ================================================================ */

:host([data-state="idle"]) .border-ring {
  opacity: 0;
}

/* ================================================================
   LISTENING STATE
   30% arc, 4.5s rotation
   ================================================================ */

:host([data-state="listening"]) .border-ring {
  opacity: 1;
}

:host([data-state="listening"]) .border-ring::before {
  background: conic-gradient(
    from var(--inboxkey-angle, 0deg),
    transparent 0%,
    rgba(${PRIMARY}, 0.3) 15%,
    rgba(${PRIMARY}, 0.5) 30%,
    rgba(${PRIMARY}, 0.3) 45%,
    transparent 60%,
    transparent 100%
  );
  animation: shimmer-rotate 4.5s linear infinite;
  animation-delay: var(--stagger-delay, 0ms);
}

/* ================================================================
   FILLED STATE
   Complete sweep (colorblind motion cue: full ring)
   ================================================================ */

:host([data-state="filled"]) .border-ring {
  opacity: 1;
}

:host([data-state="filled"]) .border-ring::before {
  background: conic-gradient(
    from var(--inboxkey-angle, 0deg),
    transparent 0%,
    rgba(${SUCCESS}, 0.35) 30%,
    rgba(${SUCCESS}, 0.55) 50%,
    rgba(${SUCCESS}, 0.35) 70%,
    transparent 100%
  );
  animation: shimmer-sweep 1.8s ease-out 1 forwards;
  animation-delay: var(--stagger-delay, 0ms);
}

/* ================================================================
   COPIED STATE
   Dimmer green, fade ring
   ================================================================ */

:host([data-state="copied"]) .border-ring {
  opacity: 1;
}

:host([data-state="copied"]) .border-ring::before {
  background: rgba(${SUCCESS}, 0.25);
  animation: shimmer-fade-ring 0.6s ease forwards;
  animation-delay: var(--stagger-delay, 0ms);
}

/* ================================================================
   TIMEOUT STATE
   Amber (warning, not error) - pulse twice (colorblind cue)
   ================================================================ */

:host([data-state="timeout"]) .border-ring {
  opacity: 1;
}

:host([data-state="timeout"]) .border-ring::before {
  background: rgba(${WARNING}, 0.3);
  animation: shimmer-timeout-pulse 0.6s ease 2;
  animation-delay: var(--stagger-delay, 0ms);
}

/* ================================================================
   STATUS TEXT (frosted pill)
   ================================================================ */

.status-text {
  position: absolute;
  top: -22px;
  right: 0;
  display: inline-flex;
  align-items: center;
  font-family: ${FONT_FAMILY_UI};
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.3s ease, transform 0.3s ease;
  transform: translateY(4px);
  pointer-events: none;
  background: rgba(255, 255, 255, 0.92);
  padding: 2px 8px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Dark theme pill */
:host([data-theme="dark"]) .status-text {
  background: rgba(0, 0, 0, 0.85);
}

/* Flip status text below when near viewport top */
:host([data-text-pos="below"]) .status-text {
  top: auto;
  bottom: -22px;
}

.status-icon {
  margin-right: 4px;
  vertical-align: middle;
  flex-shrink: 0;
}

/* ── Per-state pill colors ── */

:host([data-state="listening"]) .status-text {
  opacity: 0.85;
  transform: translateY(0);
  color: rgba(${PRIMARY}, 0.95);
}

:host([data-state="filled"]) .status-text {
  opacity: 1;
  transform: translateY(0);
  color: rgba(${SUCCESS}, 0.95);
}

:host([data-state="copied"]) .status-text {
  opacity: 0.85;
  transform: translateY(0);
  color: rgba(${SUCCESS}, 0.75);
}

:host([data-state="timeout"]) .status-text {
  opacity: 1;
  transform: translateY(0);
  color: rgba(${WARNING}, 0.9);
}

/* ================================================================
   LISTENING DOTS ANIMATION
   ================================================================ */

.listening-dots::after {
  content: '';
  animation: dots-cycle 1.8s steps(4, end) infinite;
}

@keyframes dots-cycle {
  0%  { content: ''; }
  25% { content: '.'; }
  50% { content: '..'; }
  75% { content: '...'; }
}

/* ================================================================
   KEYFRAMES
   Fallback: rotate entire pseudo-element (browsers without @property)
   When @property is supported, enhanced keyframes override these
   to animate --inboxkey-angle directly for smooth gradient sweep.
   ================================================================ */

@keyframes shimmer-rotate {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes shimmer-sweep {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes shimmer-fade-ring {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes shimmer-timeout-pulse {
  0%   { opacity: 0.2; }
  50%  { opacity: 1; }
  100% { opacity: 0.2; }
}

/* ================================================================
   REDUCED MOTION
   Static border, no rotation. Subtle opacity pulse for listening.
   ================================================================ */

@media (prefers-reduced-motion: reduce) {
  .border-ring::before {
    animation: none !important;
  }

  .border-ring {
    transition: none !important;
  }

  .status-text {
    transition: opacity 0.1s ease !important;
    transform: none !important;
  }

  .listening-dots::after {
    animation: none !important;
    content: '...' !important;
  }
}

/* ================================================================
   FORCED COLORS (Windows High Contrast)
   System colors, no animation
   ================================================================ */

@media (forced-colors: active) {
  .border-ring::before {
    background: Highlight !important;
    animation: none !important;
  }

  .status-text {
    color: CanvasText !important;
    background: Canvas !important;
    border: 1px solid CanvasText;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
`
}

/**
 * Enhanced keyframes that animate --inboxkey-angle directly.
 * Only appended when CSS.registerProperty is available, giving smooth
 * conic-gradient rotation instead of the transform fallback.
 */
export function generateEnhancedKeyframes(): string {
  return `
@keyframes shimmer-rotate {
  from { --inboxkey-angle: 0deg; }
  to   { --inboxkey-angle: 360deg; }
}

@keyframes shimmer-sweep {
  from { --inboxkey-angle: 0deg; }
  to   { --inboxkey-angle: 360deg; }
}
`
}
