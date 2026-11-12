/* PrixHook — logique de prix */
window.PH = window.PH || {};

PH.pricing = {
  parse(v) {
    if (v === null || v === undefined || v === '') return NaN;
    if (typeof v === 'number') return v;
    return parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  },

  /* Remise arrondie à l'inférieur, comme sur les affiches (79.95 → 49.95 = -37 %) */
  discountPct(oldP, newP) {
    if (!(oldP > 0) || !(newP >= 0) || newP >= oldP) return 0;
    return Math.floor((1 - newP / oldP) * 100 + 1e-9);
  },

  /* 49.95 → { int: "49", cents: "95" } ; 500.00 → { int: "500", cents: "–" } */
  split(v) {
    const r = Math.round(v * 100);
    const i = Math.floor(r / 100);
    const c = r % 100;
    return {
      int: String(i).replace(/\B(?=(\d{3})+(?!\d))/g, "'"),
      cents: c === 0 ? '–' : String(c).padStart(2, '0')
    };
  },

  fmt(v) {
    if (!isFinite(v)) return '—';
    const s = PH.pricing.split(v);
    return s.int + '.' + s.cents;
  }
};
