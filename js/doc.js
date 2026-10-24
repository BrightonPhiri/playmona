/* PLAYMONA — doc.js. Reading pages opened from disk (file://): clean links like "terms"
   need the .html file name there. On the website nothing changes. */
(function () {
  'use strict';
  if (location.protocol !== 'file:') return;
  document.querySelectorAll('a[href]').forEach(function (a) {
    var h = a.getAttribute('href');
    if (/^(play|privacy|terms|refunds|admin)([?#]|$)/.test(h)) a.setAttribute('href', h.replace(/^(\w+)/, '$1.html'));
    else if (h === './') a.setAttribute('href', 'index.html');
  });
})();
