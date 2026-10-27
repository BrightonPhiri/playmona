/* Sample Word Imposter pairs for dev rooms only (js/imposters/dev.js). Not deployed: tools/ is
   excluded. The real list is server-only, in api/lib/ImposterWords.php. */
window.FF = window.FF || {};
FF.ImpostersDevPairs = {
  easy: [
    { id: 'dev-water-car', a: 'Water', b: 'Car', hintsA: ['wet', 'drink'], hintsB: ['drive', 'road'], shared: ['wash'] },
    { id: 'dev-moon-shoe', a: 'Moon', b: 'Shoe', hintsA: ['night', 'space'], hintsB: ['foot', 'laces'], shared: ['pair'] }
  ],
  normal: [
    { id: 'dev-bus-train', a: 'Bus', b: 'Train', hintsA: ['stop', 'driver'], hintsB: ['rails', 'station'], shared: ['ticket'] },
    { id: 'dev-cat-dog', a: 'Cat', b: 'Dog', hintsA: ['meow', 'purr'], hintsB: ['bark', 'fetch'], shared: ['pet'] }
  ],
  hard: [
    { id: 'dev-coffee-tea', a: 'Coffee', b: 'Tea', hintsA: ['beans', 'espresso'], hintsB: ['leaves', 'kettle'], shared: ['cup'] },
    { id: 'dev-river-lake', a: 'River', b: 'Lake', hintsA: ['flow', 'current'], hintsB: ['still', 'shore'], shared: ['swim'] }
  ]
};
