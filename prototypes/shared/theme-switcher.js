/**
 * Prototype Theme Switcher & Decisions Panel
 *
 * Shared JS for all InboxKey prototypes.
 * - Toggles light/dark theme via data-theme attribute on <html>
 * - Renders decisions panel from embedded JSON
 */

(function () {
  'use strict';

  // Theme toggle
  const root = document.documentElement;
  const lightBtn = document.querySelector('[data-theme-btn="light"]');
  const darkBtn = document.querySelector('[data-theme-btn="dark"]');

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    if (lightBtn) lightBtn.setAttribute('aria-pressed', theme === 'light');
    if (darkBtn) darkBtn.setAttribute('aria-pressed', theme === 'dark');
    localStorage.setItem('proto-theme', theme);
  }

  // Restore saved theme
  const saved = localStorage.getItem('proto-theme');
  if (saved) setTheme(saved);

  if (lightBtn) lightBtn.addEventListener('click', () => setTheme('light'));
  if (darkBtn) darkBtn.addEventListener('click', () => setTheme('dark'));

  // Decisions panel
  const decisionsEl = document.getElementById('decisions');
  const decisionsToggle = document.querySelector('.proto-decisions-toggle');
  const decisionsPanel = document.querySelector('.proto-decisions-panel');
  const decisionsClose = document.querySelector('.proto-decisions-close');

  if (decisionsEl && decisionsToggle && decisionsPanel) {
    try {
      const decisions = JSON.parse(decisionsEl.textContent);
      const list = decisionsPanel.querySelector('ol');
      if (list && Array.isArray(decisions)) {
        list.innerHTML = decisions.map(function (d) {
          const parts = d.split(' - ');
          if (parts.length > 1) {
            return '<li><strong>' + parts[0] + '</strong> - ' + parts.slice(1).join(' - ') + '</li>';
          }
          return '<li>' + d + '</li>';
        }).join('');

        // Update toggle button text with count
        decisionsToggle.textContent = 'Decisions (' + decisions.length + ')';
      }
    } catch (e) {
      console.warn('Failed to parse decisions JSON:', e);
    }

    decisionsToggle.addEventListener('click', function () {
      decisionsPanel.classList.toggle('open');
    });

    if (decisionsClose) {
      decisionsClose.addEventListener('click', function () {
        decisionsPanel.classList.remove('open');
      });
    }

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && decisionsPanel.classList.contains('open')) {
        decisionsPanel.classList.remove('open');
      }
    });
  }
})();
