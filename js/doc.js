/* PLAYMONA — doc.js. The reading pages (Privacy, Terms, Refunds) as their own pages. */
(function () {
  'use strict';

  // Back returns to the page the reader came from on PlayMona; otherwise it goes home.
  var back = document.querySelector('[data-back]');
  var fromHere = false;
  try { fromHere = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (e) {}
  if (back && fromHere && history.length > 1) {
    back.addEventListener('click', function (e) { e.preventDefault(); history.back(); });
  }

  // Opened from disk (file://): clean links like "terms" need the .html file name there.
  if (location.protocol !== 'file:') return;
  document.querySelectorAll('a[href]').forEach(function (a) {
    var h = a.getAttribute('href');
    if (/^(play|privacy|terms|refunds|admin)([?#]|$)/.test(h)) a.setAttribute('href', h.replace(/^(\w+)/, '$1.html'));
    else if (h === './') a.setAttribute('href', 'index.html');
  });
})();
