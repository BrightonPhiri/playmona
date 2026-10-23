/* ============================================================
   PLAYMONA — flagcodes.js
   Maps each country id (slug in js/data/countries.js) to its
   ISO 3166-1 alpha-2 code so the game can load the real,
   file-based SVG flags from assets/flags/<code>.svg.

   The bundled flag files are real-world vector flags (flag-icons
   style). js/flagrenderer.js uses this map to prefer the file and
   falls back to the inline SVG/spec artwork already in countries.js.
   Classic script, global window.FF, no modules/network.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';
  FF.data = FF.data || {};

  FF.data.flagCodes = {
    // Africa
    zimbabwe: 'zw',
    'south-africa': 'za',
    nigeria: 'ng',
    ghana: 'gh',
    kenya: 'ke',
    ethiopia: 'et',
    egypt: 'eg',
    morocco: 'ma',
    algeria: 'dz',
    tunisia: 'tn',
    senegal: 'sn',
    cameroon: 'cm',
    'ivory-coast': 'ci',
    mali: 'ml',
    mozambique: 'mz',
    angola: 'ao',
    zambia: 'zm',
    botswana: 'bw',
    namibia: 'na',
    madagascar: 'mg',
    'dr-congo': 'cd',
    tanzania: 'tz',
    uganda: 'ug',
    sudan: 'sd',
    somalia: 'so',
    rwanda: 'rw',
    // North America
    usa: 'us',
    canada: 'ca',
    mexico: 'mx',
    cuba: 'cu',
    jamaica: 'jm',
    // South America
    brazil: 'br',
    argentina: 'ar',
    colombia: 'co',
    peru: 'pe',
    // Europe
    'united-kingdom': 'gb',
    france: 'fr',
    germany: 'de',
    italy: 'it',
    spain: 'es',
    portugal: 'pt',
    netherlands: 'nl',
    belgium: 'be',
    switzerland: 'ch',
    sweden: 'se',
    norway: 'no',
    denmark: 'dk',
    greece: 'gr',
    russia: 'ru',
    ukraine: 'ua',
    // Asia
    japan: 'jp',
    china: 'cn',
    india: 'in',
    pakistan: 'pk',
    bangladesh: 'bd',
    'south-korea': 'kr',
    thailand: 'th',
    vietnam: 'vn',
    indonesia: 'id',
    philippines: 'ph',
    'saudi-arabia': 'sa',
    turkey: 'tr',
    israel: 'il',
    // Oceania
    australia: 'au',
    'new-zealand': 'nz'
  };
})();
