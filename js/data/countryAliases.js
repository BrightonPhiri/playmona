/* ============================================================
   PLAYMONA — data/countryAliases.js
   The one list of other accepted names for countries, keyed by
   ISO code (the same codes as assets/flags). Any game that asks
   for a country by name (Guess the Country's Expert level today)
   accepts these as well as the country's own name.

   Leave out what FF.AnswerMatch already forgives: case, accents,
   spaces, hyphens, apostrophes, full stops ("U.S.A." is "USA"), a
   leading "the", "&" for "and" and "St" for "Saint".
   Never list a name here that belongs to another country too.

   FF.CountryNames (below) is the one way games read these: names(code)
   and checker(), a shared FF.AnswerMatch over every country's accepted
   names, used by Guess the Country, GeoSpin and the GeoSpin referee.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';
  FF.data = FF.data || {};

  FF.data.countryAliases = {
    us: ['USA', 'US', 'United States of America', 'America'],
    gb: ['UK', 'United Kingdom of Great Britain and Northern Ireland', 'Great Britain', 'Britain'],
    ae: ['UAE', 'Emirates'],
    cd: ['DRC', 'Democratic Republic of the Congo', 'Congo-Kinshasa'],
    cg: ['Congo', 'Congo-Brazzaville'],
    ci: ['Côte d’Ivoire'],
    cz: ['Czech Republic'],
    sz: ['Swaziland'],
    mm: ['Burma'],
    tl: ['East Timor'],
    cv: ['Cape Verde'],
    kr: ['Korea', 'Republic of Korea'],
    kp: ['DPRK'],
    nl: ['Holland', 'The Netherlands'],
    tr: ['Türkiye'],
    mk: ['Macedonia'],
    va: ['Vatican', 'Holy See'],
    ru: ['Russian Federation'],
    fm: ['Federated States of Micronesia'],
    ba: ['Bosnia'],
    cf: ['CAR'],
    bn: ['Brunei Darussalam'],
    pg: ['PNG'],
    sa: ['Saudi'],
    ag: ['Antigua'],
    tt: ['Trinidad'],
    st: ['Sao Tome'],
    kn: ['Saint Kitts'],
    vc: ['Saint Vincent'],
    la: ['Lao'],
    ir: ['Persia'],
    lk: ['Ceylon'],
    nz: ['Aotearoa'],
    ie: ['Eire']
  };

  /* ---- the shared country checker ---- */
  var cache = { list: null, checker: null };
  function countries() { return (FF.data.worldFlags && FF.data.worldFlags.countries) || []; }

  FF.CountryNames = {
    /* Other accepted names for a country. */
    aliases: function (code) { return FF.data.countryAliases[code] || []; },
    /* Every accepted name: the country's own name first. */
    names: function (code) {
      var c = countries().filter(function (x) { return x.code === code; })[0];
      return (c ? [c.name] : []).concat(FF.CountryNames.aliases(code));
    },
    /* FF.AnswerMatch over every country (or the list given), built once per list. */
    checker: function (list) {
      list = list || countries();
      if (cache.list !== list) {
        cache.list = list;
        cache.checker = FF.AnswerMatch.create({
          answers: list.map(function (c) { return { id: c.code, names: [c.name].concat(FF.CountryNames.aliases(c.code)) }; })
        });
      }
      return cache.checker;
    }
  };
})();
