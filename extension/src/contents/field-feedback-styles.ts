/**
 * Field Feedback CSS Generator
 *
 * Generates the full CSS string for shimmer borders, tooltips, and inline text
 * injected by the content script into host pages. All selectors are prefixed
 * with `inboxkey-` to avoid collisions.
 */

import {
  SHIMMER_BLUE,
  SHIMMER_GREEN,
  SHIMMER_RED,
  FONT_FAMILY_UI,
  DURATION_NORMAL
} from '@/lib/design-tokens'

export function generateFieldFeedbackCSS(theme: 'light' | 'dark'): string {
  const blue = SHIMMER_BLUE[theme]
  const green = SHIMMER_GREEN[theme]
  const red = SHIMMER_RED[theme]

  return `
/* --- @property for animatable conic-gradient angle --- */
@property --inboxkey-shimmer-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

/* --- Keyframes --- */
@keyframes inboxkey-shimmer-rotate {
  0%   { --inboxkey-shimmer-angle: 0deg; }
  100% { --inboxkey-shimmer-angle: 360deg; }
}

@keyframes inboxkey-shimmer-sweep {
  0%   { --inboxkey-shimmer-angle: 0deg; }
  100% { --inboxkey-shimmer-angle: 360deg; }
}

/* --- Shimmer Wrap (field wrapper) --- */
.inboxkey-shimmer-wrap {
  position: relative;
  display: inline-block;
  border-radius: inherit;
}

/* Shared pseudo-element base for all states */
.inboxkey-shimmer-wrap--listening::before,
.inboxkey-shimmer-wrap--filled::before,
.inboxkey-shimmer-wrap--copied::before,
.inboxkey-shimmer-wrap--timeout::before {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  pointer-events: none;
  z-index: 1;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  padding: 2px;
}

/* Listening: rotating blue conic-gradient, 3s loop */
.inboxkey-shimmer-wrap--listening::before {
  background: conic-gradient(
    from var(--inboxkey-shimmer-angle),
    transparent 0%,
    rgba(${blue}, 0.6) 25%,
    rgba(${blue}, 0.9) 50%,
    rgba(${blue}, 0.6) 75%,
    transparent 100%
  );
  animation: inboxkey-shimmer-rotate 3s linear infinite;
}

/* Filled: one-shot green sweep */
.inboxkey-shimmer-wrap--filled::before {
  background: conic-gradient(
    from var(--inboxkey-shimmer-angle),
    transparent 0%,
    rgba(${green}, 0.7) 50%,
    transparent 100%
  );
  animation: inboxkey-shimmer-sweep 2s ease-out 1 forwards;
}

/* Copied: slightly dimmer green sweep */
.inboxkey-shimmer-wrap--copied::before {
  background: conic-gradient(
    from var(--inboxkey-shimmer-angle),
    transparent 0%,
    rgba(${green}, 0.5) 50%,
    transparent 100%
  );
  animation: inboxkey-shimmer-sweep 2s ease-out 1 forwards;
}

/* Timeout: one-shot red sweep */
.inboxkey-shimmer-wrap--timeout::before {
  background: conic-gradient(
    from var(--inboxkey-shimmer-angle),
    transparent 0%,
    rgba(${red}, 0.7) 50%,
    transparent 100%
  );
  animation: inboxkey-shimmer-sweep 1.5s ease-out 1 forwards;
}

/* --- State border colors on wrapped input --- */
.inboxkey-shimmer-wrap--listening > input { border-color: rgba(${blue}, 0.4); }
.inboxkey-shimmer-wrap--filled > input    { border-color: rgba(${green}, 0.4); }
.inboxkey-shimmer-wrap--copied > input    { border-color: rgba(${green}, 0.3); }
.inboxkey-shimmer-wrap--timeout > input   { border-color: rgba(${red}, 0.4); }

/* --- Tooltip --- */
.inboxkey-field-tooltip {
  position: absolute;
  top: -8px;
  right: 0;
  transform: translateY(-100%) scale(0.95);
  opacity: 0;
  pointer-events: none;
  z-index: 2147483647;
  padding: 6px 10px;
  border-radius: 6px;
  font-family: ${FONT_FAMILY_UI};
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  color: #fff;
  background: rgba(${blue}, 0.9);
  transition: opacity ${DURATION_NORMAL}ms ease, transform ${DURATION_NORMAL}ms ease;
}

/* Arrow pseudo-element */
.inboxkey-field-tooltip::after {
  content: "";
  position: absolute;
  bottom: -4px;
  right: 12px;
  width: 8px;
  height: 8px;
  background: inherit;
  transform: rotate(45deg);
  border-radius: 1px;
}

/* Show on hover */
.inboxkey-shimmer-wrap:hover .inboxkey-field-tooltip {
  opacity: 1;
  transform: translateY(-100%) scale(1);
  pointer-events: auto;
}

/* State-specific tooltip backgrounds */
.inboxkey-shimmer-wrap--filled .inboxkey-field-tooltip    { background: rgba(${green}, 0.9); }
.inboxkey-shimmer-wrap--copied .inboxkey-field-tooltip    { background: rgba(${green}, 0.85); }
.inboxkey-shimmer-wrap--timeout .inboxkey-field-tooltip   { background: rgba(${red}, 0.9); }

/* --- Dismiss button --- */
.inboxkey-field-tooltip-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 6px;
  padding: 0;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  vertical-align: middle;
}

.inboxkey-field-tooltip-dismiss:hover {
  opacity: 1;
}

/* Hide dismiss in non-listening states */
.inboxkey-shimmer-wrap--filled .inboxkey-field-tooltip-dismiss,
.inboxkey-shimmer-wrap--copied .inboxkey-field-tooltip-dismiss,
.inboxkey-shimmer-wrap--timeout .inboxkey-field-tooltip-dismiss {
  display: none;
}

/* --- Inline text --- */
.inboxkey-inline-text {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-family: ${FONT_FAMILY_UI};
  font-size: 11px;
  line-height: 1;
  pointer-events: none;
  opacity: 0;
  transition: opacity ${DURATION_NORMAL}ms ease;
  color: rgba(${blue}, 0.8);
}

.inboxkey-shimmer-wrap--listening .inboxkey-inline-text  { color: rgba(${blue}, 0.8); opacity: 0.8; }
.inboxkey-shimmer-wrap--filled .inboxkey-inline-text     { color: rgba(${green}, 0.8); opacity: 1; }
.inboxkey-shimmer-wrap--copied .inboxkey-inline-text     { color: rgba(${green}, 0.7); opacity: 1; }
.inboxkey-shimmer-wrap--timeout .inboxkey-inline-text    { color: rgba(${red}, 0.8); opacity: 1; }

/* --- @supports fallback for browsers without @property --- */
@supports not (syntax: "<angle>") {
  .inboxkey-shimmer-wrap--listening::before {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(${blue}, 0.6) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: inboxkey-shimmer-slide 3s linear infinite;
  }

  @keyframes inboxkey-shimmer-slide {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
}

/* --- Reduced motion --- */
@media (prefers-reduced-motion: reduce) {
  .inboxkey-shimmer-wrap--listening::before,
  .inboxkey-shimmer-wrap--filled::before,
  .inboxkey-shimmer-wrap--copied::before,
  .inboxkey-shimmer-wrap--timeout::before {
    animation: none;
  }

  .inboxkey-shimmer-wrap--listening::before { background: rgba(${blue}, 0.4); }
  .inboxkey-shimmer-wrap--filled::before    { background: rgba(${green}, 0.4); }
  .inboxkey-shimmer-wrap--copied::before    { background: rgba(${green}, 0.3); }
  .inboxkey-shimmer-wrap--timeout::before   { background: rgba(${red}, 0.4); }
}
`
}
