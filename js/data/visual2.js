/* ============================================================
   PLAYMONA — visual2.js
   More illustrations: sports and vehicles (Picture Puzzle).
   Attaches to FF.data.visual.
   Classic script, global window.FF, no modules/network.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';
  FF.data = FF.data || {};
  FF.data.visual = FF.data.visual || {};

  function svg(bg, inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="' + bg + '"/>' + inner + '</svg>';
  }

  /* A simple standing stick figure. */
  function person(color, pose) {
    var arms = 'M100 92 L78 112 M100 92 L122 112';
    if (pose === 'up') arms = 'M100 92 L78 70 M100 92 L122 70';
    if (pose === 'out') arms = 'M100 92 L66 92 M100 92 L134 92';
    return '<circle cx="100" cy="58" r="14" fill="' + color + '"/>' +
      '<path d="M100 72 L100 128 ' + arms + ' M100 128 L84 168 M100 128 L116 168" stroke="' + color + '" stroke-width="9" stroke-linecap="round" fill="none"/>';
  }

  var SPORTS = [
    ['Football', '#dcfce7', '<rect x="20" y="150" width="160" height="30" fill="#16a34a"/><circle cx="100" cy="90" r="46" fill="#ffffff" stroke="#111" stroke-width="4"/><path d="M100 90 l20 0 m-10 -17 l0 34 m-17 -10 l34 0 m-10 -17 l0 34" stroke="#111" stroke-width="4"/>'],
    ['Basketball', '#ffedd5', '<circle cx="100" cy="100" r="62" fill="#f97316" stroke="#111" stroke-width="4"/><path d="M100 38 v124 M42 68 h116 M38 100 h124 M42 132 h116" stroke="#111" stroke-width="4" fill="none"/>'],
    ['Tennis', '#ecfdf5', '<rect x="40" y="70" width="120" height="90" fill="#22c55e" stroke="#111" stroke-width="3"/><path d="M40 115 h120" stroke="#fff" stroke-width="4"/><circle cx="120" cy="40" r="12" fill="#fde047" stroke="#111" stroke-width="3"/>'],
    ['Cricket', '#dbeafe', '<rect x="150" y="40" width="16" height="90" rx="8" fill="#a16207"/><rect x="158" y="30" width="22" height="16" fill="#713f12"/><circle cx="80" cy="130" r="16" fill="#dc2626" stroke="#111" stroke-width="3"/>'],
    ['Rugby', '#d1fae5', '<ellipse cx="100" cy="100" rx="52" ry="70" fill="#8b5cf6" stroke="#111" stroke-width="4"/><path d="M52 78 l96 0 M52 122 l96 0" stroke="#fff" stroke-width="5"/>'],
    ['Swimming', '#e0f2fe', '<path d="M20 90 q30 -24 60 0 q30 24 60 0 q30 -24 40 0" stroke="#0ea5e9" stroke-width="10" fill="none" stroke-linecap="round"/>' + person('#0f172a', 'out')],
    ['Golf', '#f0fdf4', '<circle cx="120" cy="150" r="12" fill="#fff" stroke="#111" stroke-width="3"/><line x1="60" y1="40" x2="60" y2="150" stroke="#78716c" stroke-width="5"/><path d="M60 40 L110 60 L60 80 Z" fill="#dc2626"/>'],
    ['Volleyball', '#fef9c3', '<circle cx="100" cy="100" r="62" fill="#facc15" stroke="#111" stroke-width="4"/><path d="M42 70 q58 30 116 0 M42 130 q58 -30 116 0 M70 40 q30 60 0 120 M130 40 q-30 60 0 120" stroke="#111" stroke-width="4" fill="none"/>'],
    ['Boxing', '#fecaca', '<circle cx="70" cy="90" r="24" fill="#dc2626" stroke="#111" stroke-width="4"/><circle cx="140" cy="110" r="24" fill="#dc2626" stroke="#111" stroke-width="4"/>'],
    ['Cycling', '#e0f2fe', '<circle cx="70" cy="120" r="28" fill="none" stroke="#111" stroke-width="6"/><circle cx="140" cy="120" r="28" fill="none" stroke="#111" stroke-width="6"/><path d="M70 120 L105 120 L105 70 L140 120 M105 120 L140 70 L140 120" stroke="#111" stroke-width="5" fill="none"/><circle cx="105" cy="70" r="8" fill="#111"/>'],
    ['Hockey', '#eef2ff', '<path d="M30 150 L120 60" stroke="#a16207" stroke-width="8" stroke-linecap="round"/><path d="M120 60 q20 -10 40 0 q-6 16 -40 0" stroke="#111" stroke-width="5" fill="none"/><circle cx="150" cy="150" r="12" fill="#111"/>'],
    ['Athletics', '#fff7ed', '<rect x="20" y="140" width="160" height="12" fill="#ea580c"/><path d="M120 40 L180 40 L180 130 M20 60 L120 40" stroke="#111" stroke-width="4" fill="none"/>' + person('#0f172a', 'up')],
    ['Skiing', '#e0f2fe', '<path d="M40 170 L90 90 L150 30" stroke="#fff" stroke-width="26"/><path d="M60 150 L90 90 L140 130" stroke="#111" stroke-width="7" fill="none"/>' + person('#0f172a')],
    ['Baseball', '#fef9c3', '<circle cx="90" cy="120" r="26" fill="#fff" stroke="#111" stroke-width="4"/><path d="M70 104 q20 -8 40 0 M70 136 q20 8 40 0" stroke="#dc2626" stroke-width="4" fill="none"/><rect x="150" y="30" width="16" height="80" rx="8" fill="#a16207"/>'],
    ['Surfing', '#cffafe', '<path d="M20 110 q40 -30 80 0 q40 30 80 0" stroke="#0891b2" stroke-width="16" fill="none" stroke-linecap="round"/><rect x="80" y="120" width="80" height="12" rx="6" fill="#eab308"/>' + person('#0f172a')],
    ['Archery', '#f5f5f4', '<circle cx="150" cy="100" r="46" fill="none" stroke="#dc2626" stroke-width="6"/><circle cx="150" cy="100" r="30" fill="none" stroke="#3b82f6" stroke-width="6"/><circle cx="150" cy="100" r="14" fill="#facc15"/><path d="M30 100 Q90 60 150 100" stroke="#111" stroke-width="5" fill="none"/><line x1="30" y1="70" x2="30" y2="130" stroke="#111" stroke-width="5"/>']
  ];

  var VEHICLES = [
    ['Car', '<rect x="40" y="90" width="120" height="44" rx="12" fill="#3b82f6"/><path d="M60 90 L80 60 L140 60 L160 90 Z" fill="#60a5fa"/><circle cx="70" cy="140" r="18" fill="#111"/><circle cx="130" cy="140" r="18" fill="#111"/><circle cx="70" cy="140" r="7" fill="#fff"/><circle cx="130" cy="140" r="7" fill="#fff"/>'],
    ['Truck', '<rect x="20" y="60" width="70" height="60" rx="8" fill="#f97316"/><rect x="90" y="40" width="90" height="80" rx="6" fill="#cbd5e1"/><circle cx="50" cy="130" r="16" fill="#111"/><circle cx="140" cy="130" r="16" fill="#111"/><rect x="50" y="60" width="30" height="26" rx="4" fill="#bfdbfe"/>'],
    ['Bus', '<rect x="20" y="50" width="160" height="90" rx="12" fill="#eab308"/><rect x="30" y="60" width="30" height="26" rx="4" fill="#bfdbfe"/><rect x="70" y="60" width="30" height="26" rx="4" fill="#bfdbfe"/><rect x="110" y="60" width="30" height="26" rx="4" fill="#bfdbfe"/><circle cx="60" cy="140" r="16" fill="#111"/><circle cx="140" cy="140" r="16" fill="#111"/>'],
    ['Train', '<rect x="20" y="70" width="60" height="70" rx="8" fill="#dc2626"/><rect x="84" y="80" width="50" height="60" rx="8" fill="#fbbf24"/><rect x="138" y="80" width="42" height="60" rx="8" fill="#fbbf24"/><rect x="28" y="40" width="34" height="30" rx="6" fill="#dc2626"/><rect x="40" y="44" width="26" height="20" rx="4" fill="#bfdbfe"/><circle cx="52" cy="140" r="14" fill="#111"/><circle cx="120" cy="140" r="14" fill="#111"/><circle cx="160" cy="140" r="14" fill="#111"/>'],
    ['Airplane', '<path d="M100 30 L150 120 L100 100 L50 120 Z" fill="#64748b"/><path d="M60 120 L100 100 L100 170 Z" fill="#94a3b8"/><path d="M30 60 L120 40 L160 70 L120 70 Z" fill="#cbd5e1"/><circle cx="60" cy="70" r="8" fill="#0ea5e9"/>'],
    ['Helicopter', '<rect x="60" y="80" width="90" height="50" rx="18" fill="#ef4444"/><path d="M70 80 L60 40 L150 40 L140 80 Z" fill="#fca5a5"/><line x1="60" y1="42" x2="150" y2="42" stroke="#111" stroke-width="5"/><rect x="30" y="130" width="16" height="30" fill="#111"/><rect x="150" y="120" width="10" height="40" fill="#111"/><circle cx="105" cy="90" r="10" fill="#bfdbfe"/>'],
    ['Boat', '<path d="M40 120 L160 120 L130 160 L70 160 Z" fill="#a16207"/><line x1="100" y1="120" x2="100" y2="40" stroke="#713f12" stroke-width="6"/><path d="M100 40 L160 100 L100 100 Z" fill="#ffffff"/>'],
    ['Ship', '<path d="M20 120 L180 120 L150 160 L50 160 Z" fill="#475569"/><rect x="60" y="80" width="50" height="40" fill="#ef4444"/><rect x="120" y="70" width="30" height="50" fill="#fbbf24"/><rect x="60" y="60" width="50" height="16" fill="#111"/>'],
    ['Motorcycle', '<circle cx="60" cy="130" r="24" fill="none" stroke="#111" stroke-width="7"/><circle cx="145" cy="130" r="24" fill="none" stroke="#111" stroke-width="7"/><path d="M60 130 L100 130 L90 80 L60 80 L50 100 M90 80 L130 80 L145 106 M100 130 L130 130" stroke="#111" stroke-width="6" fill="none"/><rect x="90" y="70" width="30" height="16" rx="4" fill="#dc2626"/>'],
    ['Bicycle', '<circle cx="70" cy="120" r="28" fill="none" stroke="#111" stroke-width="6"/><circle cx="140" cy="120" r="28" fill="none" stroke="#111" stroke-width="6"/><path d="M70 120 L105 120 L105 70 L140 120 M105 120 L140 70 L140 120" stroke="#111" stroke-width="5" fill="none"/><circle cx="105" cy="70" r="8" fill="#111"/><rect x="90" y="120" width="30" height="8" rx="4" fill="#111"/>'],
    ['Scooter', '<rect x="60" y="90" width="70" height="14" rx="7" fill="#22c55e"/><line x1="95" y1="90" x2="95" y2="50" stroke="#111" stroke-width="5"/><line x1="95" y1="50" x2="130" y2="50" stroke="#111" stroke-width="5"/><circle cx="75" cy="120" r="16" fill="#111"/><circle cx="140" cy="120" r="16" fill="#111"/>'],
    ['Submarine', '<ellipse cx="100" cy="100" rx="70" ry="30" fill="#facc15"/><rect x="60" y="70" width="16" height="30" fill="#111"/><circle cx="120" cy="100" r="10" fill="#0ea5e9"/><path d="M30 60 q20 -20 40 0" stroke="#111" stroke-width="4" fill="none"/>'],
    ['Rocket', '<rect x="80" y="40" width="40" height="90" rx="18" fill="#e5e7eb"/><path d="M80 60 L60 30 L100 60 Z" fill="#ef4444"/><path d="M120 60 L140 30 L100 60 Z" fill="#ef4444"/><path d="M90 130 L90 160 L110 160 L110 130 Z" fill="#f97316"/><path d="M70 150 l30 20 l30 -20" fill="#fbbf24"/><circle cx="100" cy="80" r="10" fill="#0ea5e9"/>'],
    ['Fire engine', '<rect x="30" y="60" width="140" height="60" rx="8" fill="#dc2626"/><rect x="60" y="50" width="70" height="14" fill="#fbbf24"/><rect x="150" y="30" width="10" height="30" fill="#b91c1c"/><circle cx="60" cy="130" r="16" fill="#111"/><circle cx="140" cy="130" r="16" fill="#111"/><rect x="40" y="70" width="40" height="20" rx="4" fill="#bfdbfe"/>'],
    ['Police car', '<rect x="40" y="90" width="120" height="44" rx="12" fill="#111"/><path d="M60 90 L80 60 L140 60 L160 90 Z" fill="#334155"/><rect x="90" y="50" width="20" height="12" fill="#dc2626"/><rect x="95" y="48" width="10" height="14" rx="4" fill="#3b82f6"/><circle cx="70" cy="140" r="18" fill="#111"/><circle cx="130" cy="140" r="18" fill="#111"/><rect x="48" y="98" width="30" height="24" fill="#fff"/><text x="63" y="116" font-size="14" text-anchor="middle" fill="#111">POLICE</text>'],
    ['Ambulance', '<rect x="30" y="70" width="140" height="60" rx="8" fill="#ffffff"/><path d="M90 60 L120 40 L160 40 L160 70 Z" fill="#e5e7eb"/><rect x="70" y="80" width="20" height="26" fill="#dc2626"/><rect x="79" y="84" width="2" height="18" fill="#dc2626"/><rect x="88" y="92" width="18" height="2" fill="#dc2626"/><circle cx="60" cy="136" r="16" fill="#111"/><circle cx="140" cy="136" r="16" fill="#111"/>'],
    ['Tractor', '<rect x="50" y="60" width="50" height="50" rx="8" fill="#dc2626"/><rect x="100" y="60" width="60" height="30" rx="6" fill="#f97316"/><circle cx="70" cy="140" r="26" fill="#111"/><circle cx="70" cy="140" r="10" fill="#e5e7eb"/><circle cx="150" cy="150" r="14" fill="#111"/><rect x="60" y="30" width="30" height="30" fill="#b91c1c"/>'],
    ['Excavator', '<rect x="40" y="70" width="60" height="50" rx="8" fill="#eab308"/><rect x="50" y="50" width="40" height="24" fill="#fde047"/><path d="M90 60 L160 30 L170 60" stroke="#a16207" stroke-width="8" fill="none"/><path d="M150 40 L150 70 L170 70 L170 40 Z" fill="#713f12"/><rect x="30" y="120" width="120" height="14" rx="7" fill="#111"/><circle cx="60" cy="140" r="16" fill="#111"/><circle cx="120" cy="140" r="16" fill="#111"/>'],
    ['Hot air balloon', '<ellipse cx="100" cy="80" rx="60" ry="66" fill="#ef4444"/><path d="M40 80 L160 80 M100 14 L100 146" stroke="#f87171" stroke-width="6"/><rect x="85" y="146" width="30" height="30" rx="6" fill="#a16207"/>'],
    ['Tram', '<rect x="30" y="70" width="140" height="70" rx="10" fill="#dc2626"/><rect x="40" y="80" width="24" height="20" rx="3" fill="#bfdbfe"/><rect x="74" y="80" width="24" height="20" rx="3" fill="#bfdbfe"/><rect x="108" y="80" width="24" height="20" rx="3" fill="#bfdbfe"/><circle cx="70" cy="140" r="14" fill="#111"/><circle cx="130" cy="140" r="14" fill="#111"/><line x1="60" y1="40" x2="60" y2="70" stroke="#111" stroke-width="5"/><line x1="140" y1="40" x2="140" y2="70" stroke="#111" stroke-width="5"/>']
  ];

  FF.data.visual.sports = SPORTS.map(function (s) { return { name: s[0], svg: svg(s[1], s[2]) }; });
  FF.data.visual.vehicles = VEHICLES.map(function (v) { return { name: v[0], svg: svg('#f1f5f9', v[1]) }; });
})();
