/* ============================================================
   PLAYMONA — icons-custom.js
   Hand-drawn, on-brand SVG icon set (the DEFAULT icon style).

   Every icon is a 24×24 monochrome line glyph that uses
   `currentColor`, so it automatically inherits the selected
   accent colour (or whatever colour the surrounding CSS sets).

   This file EXTENDS js/icons.js. It does not delete the bundled
   Phosphor set — that stays as a second option users can pick in
   Settings → Appearance → Icon style.

   To replace these with new artwork, drop the new SVGs into the
   FF.Icons.custom map below (keep the same keys).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  // Wrap path data in a consistent 24×24 stroke-style SVG shell.
  function ico(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  FF.Icons.custom = {
    'arrows-left-right': ico('<path d="M8 7l-5 5 5 5"/><path d="M3 12h18"/><path d="M16 7l5 5-5 5"/>'),
    'arrows-out': ico('<path d="M15 3h6v6"/><path d="M21 3l-7 7"/><path d="M9 3H3v6"/><path d="M3 3l7 7"/><path d="M15 21h6v-6"/><path d="M21 21l-7-7"/><path d="M9 21H3v-6"/><path d="M3 21l7-7"/>'),
    'binoculars': ico('<circle cx="7" cy="9" r="4"/><circle cx="17" cy="9" r="4"/><path d="M7 13v3a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3"/><path d="M2 9h1M21 9h1M10 9h4"/>'),
    'brain': ico('<path d="M12 4a2.5 2.5 0 0 0-2.5 2.5A3.5 3.5 0 0 0 6 10a3 3 0 0 0 0 6 3.5 3.5 0 0 0 3.5 3 2.5 2.5 0 0 0 5 0 3.5 3.5 0 0 0 3.5-3 3 3 0 0 0 0-6 3.5 3.5 0 0 0-3.5-3.5A2.5 2.5 0 0 0 12 4Z"/><path d="M9.5 10c-.5 1-.5 2 0 3M14.5 10c.5 1 .5 2 0 3"/>'),
    'buildings': ico('<rect x="4" y="4" width="7" height="16" rx="1"/><rect x="13" y="4" width="7" height="12" rx="1"/><path d="M6 8h3M6 12h3M6 16h3M15 8h3M15 12h3M2 20h20"/>'),
    'calculator': ico('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>'),
    'car': ico('<path d="M5 13l1.4-4.2A2 2 0 0 1 8.3 7.5h7.4a2 2 0 0 1 1.9 1.3L19 13"/><path d="M5 13h14a1 1 0 0 1 1 1v3h-1.5a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2H4v-3a1 1 0 0 1 1-1Z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>'),
    'cards': ico('<rect x="3" y="8" width="14" height="12" rx="2"/><path d="M7 5h11a2 2 0 0 1 2 2v11"/><path d="M7 12h6M7 15h4"/>'),
    'chalkboard': ico('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 20h8M12 17v3"/><path d="M9 6l6 5M15 6l-6 5"/>'),
    'chart-line': ico('<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>'),
    'check': ico('<path d="M5 12l5 5L20 7"/>'),
    'city': ico('<path d="M3 21h18"/><path d="M5 21V9l4 2.5V9l4 2.5V9l4 2.5V21"/><path d="M8 21v-3h2v3M13 21v-3h2v3"/>'),
    'confetti': ico('<path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"/><path d="M4 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/><path d="M20 14l.8 1.8 1.8.8-1.8.8L20 19.2l-.8-1.8-1.8-.8 1.8-.8Z"/><path d="M5 4h.01M18 20h.01"/>'),
    'cube': ico('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
    'detective': ico('<circle cx="9" cy="9" r="6"/><path d="M13.5 13.5L20 20"/><path d="M7.5 9a1.8 1.8 0 0 1 3.4 0c0 1.2-1 1.8-1 2.8"/><path d="M9.9 14.6h.01"/>'),
    'drop': ico('<path d="M12 3c3 4 6 7 6 10a6 6 0 1 1-12 0c0-3 3-6 6-10Z"/>'),
    'eye': ico('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
    'eye-slash': ico('<path d="M2 12s3.5-7 10-7c2 0 3.8.6 5.3 1.6M22 12s-3.5 7-10 7c-2 0-3.8-.6-5.3-1.6"/><path d="M4 4l16 16"/>'),
    'fire': ico('<path d="M12 3c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.3-2-.8-3C18.5 8.5 20 11 20 14a8 8 0 1 1-16 0c0-4 3-7 6-9 0 2 1 3 2 3Z"/>'),
    'flag': ico('<path d="M5 21V4"/><path d="M5 4c5-3 9 2 14 0v10c-5 2-9-3-14 0"/>'),
    'fork-knife': ico('<path d="M6 3v18"/><path d="M6 3v7a2 2 0 0 0 4 0V3"/><path d="M6 5h4"/><path d="M17 3v18"/><path d="M17 3c2.5 2.5 2.5 5.5 0 8"/>'),
    'game-controller': ico('<rect x="3" y="7" width="18" height="10" rx="5"/><path d="M8 10v4M6 12h4"/><circle cx="15" cy="11" r="1"/><circle cx="18" cy="13" r="1"/>'),
    'gear': ico('<circle cx="12" cy="12" r="3.1"/><path d="M12 4.2V6M12 18v1.8M4.2 12H6M18 12h1.8M6.4 6.4l1.3 1.3M16.3 16.3l1.3 1.3M6.4 17.6l1.3-1.3M16.3 7.7l1.3-1.3"/><path d="M9.2 4.6l.55 1.7M14.8 4.6l-.55 1.7M19.4 9.2l-1.7.55M19.4 14.8l-1.7-.55M14.8 19.4l-.55-1.7M9.2 19.4l.55-1.7M4.6 14.8l1.7-.55M4.6 9.2l1.7.55"/>'),
    'globe': ico('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>'),
    'globe-hemisphere-west': ico('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 2.5 3 15.5 0 18M12 3c-3 2.5-3 15.5 0 18"/>'),
    'hand-tap': ico('<path d="M7 11V4.5A1.5 1.5 0 0 1 10 4.5V10"/><path d="M10 10V3.5A1.5 1.5 0 0 1 13 3.5V10"/><path d="M13 10V5a1.5 1.5 0 0 1 3 0v5"/><path d="M16 10V7a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1.5A6 6 0 0 1 7.6 17.9L4 14.3a1.5 1.5 0 0 1 2.1-2.1L8 14"/>'),
    'hash': ico('<path d="M9 3L7 21M17 3l-2 18M4 9h16M3 15h16"/>'),
    'heart': ico('<path d="M12 20C7 16 3 12.5 3 8.5A4.5 4.5 0 0 1 7.5 4c1.7 0 3.2.9 4.5 2.5C13.3 4.9 14.8 4 16.5 4A4.5 4.5 0 0 1 21 8.5C21 12.5 17 16 12 20Z"/>'),
    'house': ico('<path d="M3 12L12 3.5 21 12"/><path d="M6 10.8V21h12V10.8"/><path d="M9.5 21v-6.2h5V21"/><path d="M16.2 4v3.4"/><path d="M8 13.2h2.2v2.2H8z"/>'),
    'image': ico('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M3 17l5-5 3 3 4-4 6 6"/>'),
    'image-square': ico('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="M3 16l5-5 3 3 4-4 6 6"/>'),
    'images': ico('<rect x="4" y="4" width="13" height="13" rx="2"/><path d="M7 7h7M7 12l2.5-2.5L12 12l3-3"/><path d="M7 20h13a1 1 0 0 0 1-1V6"/>'),
    'info': ico('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>'),
    'keyboard': ico('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01"/><path d="M7 14h10"/>'),
    'lightning': ico('<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8Z"/>'),
    'link': ico('<path d="M9 15l6-6"/><path d="M11 6l1-1a4 4 0 0 1 5.7 5.7l-1 1"/><path d="M13 18l-1 1a4 4 0 0 1-5.7-5.7l1-1"/>'),
    'list-numbers': ico('<path d="M5 6h15M5 12h15M5 18h15"/><path d="M8 4L5 6l3 2M8 14l-3 2 3 2"/>'),
    'magnifying-glass': ico('<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21"/>'),
    'map-pin': ico('<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
    'map-trifold': ico('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2Z"/><path d="M9 4v14M15 6v14"/>'),
    'medal': ico('<circle cx="12" cy="15" r="5"/><path d="M10 15l1.5 1.5L15 13.5"/><path d="M9 6h6"/><path d="M10 6l2 3M14 6l-2 3"/>'),
    'monitor': ico('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
    'moon': ico('<path d="M19.5 14.2A7.5 7.5 0 1 1 9.8 4.5 6 6 0 0 0 19.5 14.2Z"/>'),
    'paint-brush': ico('<path d="M18.5 4.5L10 13a3 3 0 0 0 0 4.2 3 3 0 0 0 4.2 0L19.5 5.5"/><path d="M14 3l2 2"/><path d="M5 20c1-1.5 2-2.5 3.5-3.5"/>'),
    'paw-print': ico('<ellipse cx="8" cy="8" rx="2" ry="2.5"/><ellipse cx="16" cy="8" rx="2" ry="2.5"/><ellipse cx="12" cy="5" rx="2" ry="2.5"/><path d="M12 11c-3 0-5 2-5 4.5 0 2 1.5 3.5 3 3.5 1.5 0 2-1 2-1s.5 1 2 1c1.5 0 3-1.5 3-3.5 0-2.5-2-4.5-5-4.5Z"/>'),
    'pencil': ico('<path d="M4 20l4-1L20.5 6.5a2 2 0 0 0-3-3L5 15l-1 5Z"/>'),
    'person-arms-spread': ico('<circle cx="12" cy="5" r="2"/><path d="M12 8v4M5 14c0-2 3-3 7-3s7 1 7 3M5 16l-2 3M19 16l2 3"/>'),
    'play': ico('<path d="M7 4.5v15l12-7.5L7 4.5Z"/>'),
    'puzzle-piece': ico('<path d="M9 3a3 3 0 0 1 6 0h3a2 2 0 0 1 2 2v3a3 3 0 0 1 0 6v3a2 2 0 0 1-2 2h-3v-1a3 3 0 0 1-6 0v1H6a2 2 0 0 1-2-2v-3a3 3 0 0 1 0-6V7a2 2 0 0 1 2-2h3a3 3 0 0 1 0-2Z"/>'),
    'question': ico('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 .5c0 1.5-2 2-2 3.5"/><path d="M12 16.5h.01"/>'),
    'scales': ico('<path d="M12 3v18M8 21h8"/><path d="M5 7h14"/><path d="M5 7l-2.5 6a3 3 0 0 0 5 0L5 7Z"/><path d="M19 7l-2.5 6a3 3 0 0 0 5 0L19 7Z"/>'),
    'shuffle': ico('<path d="M3 7h3l4 5 4-5h7"/><path d="M3 17h3l4-5 4 5h7"/><path d="M17 4l3 3-3 3"/><path d="M17 14l3 3-3 3"/>'),
    'sparkle': ico('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>'),
    'split-horizontal': ico('<path d="M12 3v18"/><path d="M8 8L4 12l4 4M16 8l4 4-4 4"/>'),
    'squares-four': ico('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
    'stack': ico('<path d="M12 3l9 5-9 5-9-5 9-5Z"/><path d="M3 13l9 5 9-5"/><path d="M3 18l9 5 9-5"/>'),
    'star': ico('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.7-5.2 2.7 1-5.9L3.5 9.2l5.9-.9L12 3Z"/>'),
    'sun': ico('<circle cx="12" cy="12" r="4.2"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.4 5.4l1.3 1.3M17.3 17.3l1.3 1.3M5.4 18.6l1.3-1.3M17.3 6.7l1.3-1.3"/>'),
    'target': ico('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
    'text-aa': ico('<path d="M4 19V6l4 7 4-7v13M4 13h8"/><circle cx="18" cy="14" r="3.5"/><path d="M21.5 14v5"/>'),
    'timer': ico('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M10 2h4M12 2v3"/>'),
    'trophy': ico('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/>'),
    'users-three': ico('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5"/><circle cx="18" cy="9" r="2.5"/><path d="M16 15c3 0 5 2 5 5"/>'),
    'x': ico('<path d="M6 6l12 12M18 6L6 18"/>'),
    'x-circle': ico('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
    'sliders': ico('<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2.15"/><circle cx="16" cy="12" r="2.15"/><circle cx="10" cy="17" r="2.15"/>'),
    'speaker': ico('<path d="M4 9h3.2L12 5v14l-4.8-4H4V9z"/><path d="M16 9.2a3.4 3.4 0 0 1 0 5.6"/><path d="M18.4 7a6 6 0 0 1 0 10"/>')
  };

  /* ---------- Interface icons (shell, dialogs, game chrome) ----------
     Semantic names used by the redesigned UI. Only drawn in the custom
     style; the Phosphor style falls back to these automatically. */
  var extra = {
    'close': '<path d="M6 6l12 12M18 6L6 18"/>',
    'download': '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    'calendar': '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h3v3H8z"/>',
    'swords': '<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M14.5 6.5L18 3h3v3l-3.5 3.5"/><path d="M5 14l4 4"/><path d="M7 17l-3 3"/><path d="M3 19l2 2"/>',
    'chat': '<path d="M4 12a8 8 0 1 1 3.3 6.5L4 20l1.3-3.6A8 8 0 0 1 4 12Z"/><path d="M9 11h6M9 14h4"/>',
    'sign-out': '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/>',
    'pause': '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    'restart': '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>',
    'arrow-left': '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    'arrow-up': '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
    'arrow-down': '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
    'search': '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    'filter': '<path d="M4 6h16M7 12h10M10 18h4"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'minus': '<path d="M5 12h14"/>',
    'trash': '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    'book-open': '<path d="M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5V5.5Z"/><path d="M12 6v13.5"/>',
    'scroll': '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4"/><path d="M16 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10"/><path d="M7 4a2 2 0 0 0-2 2v11"/><path d="M9 9h4M9 13h4"/>',
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5"/>',
    'users': '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15c3 0 5 2 5 5"/>',
    'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
    'mic-off': '<path d="M15 10V6a3 3 0 0 0-5.7-1.3"/><path d="M9 9v2a3 3 0 0 0 4.6 2.5"/><path d="M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.8"/><path d="M12 18v3"/><path d="M3 3l18 18"/>',
    'copy': '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    'share': '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    'crown': '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z"/>',
    'lightbulb': '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    'alert': '<path d="M12 3l9.5 17h-19L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
    'sort': '<path d="M7 4v16M4 17l3 3 3-3"/><path d="M17 20V4M14 7l3-3 3 3"/>',
    'tv': '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    'palette': '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    'text-size': '<path d="M4 18L8.5 6 13 18M5.5 14h6"/><path d="M15 18l3-8 3 8M16 15.5h4"/>',
    'shield': '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3Z"/><path d="M9 12l2 2 4-4"/>',
    'wifi': '<path d="M2 9a15 15 0 0 1 20 0"/><path d="M5.5 12.5a10 10 0 0 1 13 0"/><path d="M9 16a5 5 0 0 1 6 0"/><path d="M12 19.5h.01"/>',
    'dice': '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="12" cy="12" r="1"/>',
    'heart-fill': '<path d="M12 20C7 16 3 12.5 3 8.5A4.5 4.5 0 0 1 7.5 4c1.7 0 3.2.9 4.5 2.5C13.3 4.9 14.8 4 16.5 4A4.5 4.5 0 0 1 21 8.5C21 12.5 17 16 12 20Z" fill="currentColor"/>',
    'star-fill': '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.7-5.2 2.7 1-5.9L3.5 9.2l5.9-.9L12 3Z" fill="currentColor"/>',
    'flame': '<path d="M12 3c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.3-2-.8-3C18.5 8.5 20 11 20 14a8 8 0 1 1-16 0c0-4 3-7 6-9 0 2 1 3 2 3Z"/>',
    'lock': '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2"/>',
    'power': '<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
    'megaphone': '<path d="M3 10v4a1 1 0 0 0 1 1h3l7 4V5L7 9H4a1 1 0 0 0-1 1Z"/><path d="M18 9a4 4 0 0 1 0 6"/><path d="M7 15l1.5 5h3L10 16"/>',
    'download': '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M4 20h16"/>'
  };
  Object.keys(extra).forEach(function (k) {
    if (FF.Icons.custom[k] == null) FF.Icons.custom[k] = ico(extra[k]);
  });

  // Category and game icons that the generated Phosphor maps lack.
  FF.Icons.category.bible = 'book-open';
  FF.Icons.game.bibleQuiz = 'book-open';
  FF.Icons.game.bibleWhoAmI = 'detective';
  FF.Icons.game.bibleVerseRush = 'scroll';
  FF.Icons.game.bibleBooks = 'list-numbers';
  FF.Icons.game.brainBattle = FF.Icons.game.brainBattle || 'lightning';

  /* ---------- Icon style (custom vs. bundled Phosphor) ---------- */
  FF.Icons.getStyle = function () { return FF.Storage.get('iconStyle', 'custom'); };
  FF.Icons.setStyle = function (s) { if (s !== 'phosphor') s = 'custom'; FF.Storage.set('iconStyle', s); };
  FF.Icons.activeSet = function () { return this.getStyle() === 'phosphor' ? this.set : this.custom; };

  // Override the icon lookup so it honours the active style while keeping
  // a safe fallback to the other set (never lose an icon to a missing key).
  FF.Icons.svg = function (key) {
    const active = this.activeSet();
    if (active[key] != null) return active[key];
    return this.set[key] || this.custom[key] || '';
  };

  FF.Icons.icon = function (key, fallback, extraCls) {
    const span = document.createElement('span');
    span.className = 'icon-svg' + (extraCls ? ' ' + extraCls : '');
    span.setAttribute('aria-hidden', 'true');
    const active = this.activeSet();
    let markup = active[key] != null ? active[key] : (this.set[key] || this.custom[key]);
    if (markup) span.innerHTML = markup;
    else if (fallback) span.textContent = fallback;
    return span;
  };
})();
