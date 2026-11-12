/* PrixHook — lecture d'une affiche Black Friday à partir des textes positionnés
   (texte d'un PDF ou mots reconnus par OCR).
   Entrée : [{ s: texte, x, y (haut), w, h (hauteur ≈ taille de police) }] en coordonnées « haut → bas ». */
(function (root) {
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const STOP = /^(black|friday|blackfriday|de|remise|imm[ée]diate|compl[ée]tez|vos|achats|sku|offre|%|chf|fnac|\.?ch)$/i;

  function norm(s) {
    return String(s || '').replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim();
  }

  function monthNum(m) {
    const t = m.toLowerCase().replace('fevrier', 'février').replace('aout', 'août').replace('decembre', 'décembre');
    const i = MONTHS.indexOf(t);
    return i < 0 ? null : String(i + 1).padStart(2, '0');
  }

  function parseDate(str) {
    let m = str.match(/(\d{1,2})(?:er)?\s+([a-zéèêûô]+)\s*(\d{4})?/i);
    if (m && monthNum(m[2])) return { d: m[1].padStart(2, '0'), m: monthNum(m[2]), y: m[3] || '' };
    m = str.match(/(\d{1,2})\.(\d{1,2})\.?(\d{4})?/);
    if (m) return { d: m[1].padStart(2, '0'), m: m[2].padStart(2, '0'), y: m[3] || '' };
    return null;
  }

  function validity(full) {
    const i = full.search(/offre\s+valable/i);
    if (i < 0) return '';
    const seg = full.slice(i, i + 160);
    const m = seg.match(/du\s+(.+?)\s+au\s+(.+?)(?:\s+dans|\.\s|$)/i);
    if (!m) return '';
    const a = parseDate(m[1]), b = parseDate(m[2]);
    if (!a || !b) return '';
    return `Offre valable du ${a.d}.${a.m} au ${b.d}.${b.m}${b.y ? '.' + b.y : ''}`;
  }

  function toNumber(intPart, cents) {
    const i = parseInt(String(intPart).replace(/['’ ]/g, ''), 10);
    const c = /^\d{2}$/.test(cents || '') ? parseInt(cents, 10) : 0;
    return i + c / 100;
  }

  function lines(items) {
    const sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const out = [];
    sorted.forEach(it => {
      const cy = it.y + it.h / 2;
      const line = out.find(l => Math.abs(l.cy - cy) < Math.max(l.h, it.h) * 0.5);
      if (line) { line.items.push(it); line.h = Math.max(line.h, it.h); }
      else out.push({ cy, h: it.h, y: it.y, items: [it] });
    });
    out.forEach(l => l.items.sort((a, b) => a.x - b.x));
    return out.sort((a, b) => a.cy - b.cy);
  }

  function parse(raw) {
    const items = raw
      .map(i => ({ ...i, s: norm(i.s) }))
      .filter(i => i.s && i.h > 0);
    const warnings = [];
    const full = lines(items).map(l => l.items.map(i => i.s).join(' ')).join(' \n ');

    /* Zone utile : tout ce qui est au-dessus du bloc « Complétez vos achats / Mastercard » */
    const cut = items.filter(i => /compl[ée]tez|mastercard|mensualit|int[ée]r[êe]ts/i.test(i.s))
                     .reduce((m, i) => Math.min(m, i.y), Infinity);
    const zone = items.filter(i => i.y < cut);

    /* SKU + validité */
    const skuM = full.match(/SKU\s*[:.]?\s*(\d{5,})/i);
    const sku = skuM ? skuM[1] : '';
    const valid = validity(full);

    /* Remise % : le plus grand nombre suivi d'un « % » */
    let pct = null, pctItems = [];
    zone.forEach((it, idx) => {
      let m = it.s.match(/^-?\s*(\d{1,2})\s*%/);
      let used = [it];
      if (!m && /^-?\s*\d{1,2}$/.test(it.s)) {
        const pc = zone.find(o => o !== it && /^%/.test(o.s) &&
          o.x >= it.x + it.w - it.h * 0.4 && o.x <= it.x + it.w + it.h * 0.8 &&
          Math.abs(o.y - it.y) < it.h * 0.8);
        if (pc) { m = it.s.match(/(\d{1,2})/); used = [it, pc]; }
      }
      if (m && +m[1] > 0 && (!pctItems.length || it.h > pctItems[0].h)) { pct = +m[1]; pctItems = used; }
    });
    if (pct === null) {
      const m = full.match(/-\s*(\d{1,2})\s*%/);
      if (m) pct = +m[1];
    }

    /* Prix : entiers + centimes en exposant */
    const pctSet = new Set(pctItems);
    const used = new Set();
    const ints = zone.filter(i => !pctSet.has(i) && /^\d{1,2}(?:['’]?\d{3})?$|^\d{1,4}$/.test(i.s) && !/^(19|20)\d{2}$/.test(i.s));
    const full1 = zone.filter(i => !pctSet.has(i) && /^\d{1,4}(?:['’]\d{3})?\s*[.,]\s*(\d{2}|-{1,2})$|^\d{1,4}\s\d{2}$/.test(i.s));
    const cands = [];
    full1.forEach(i => {
      const m = i.s.match(/^([\d'’]+)\s*(?:[.,]\s*|\s)(\d{2}|-+)$/);
      if (m) { cands.push({ v: toNumber(m[1], m[2]), h: i.h, y: i.y, x: i.x }); used.add(i); }
    });
    const maxH = Math.max(0, ...ints.map(i => i.h), ...cands.map(c => c.h));
    ints.filter(i => i.h >= maxH * 0.25).sort((a, b) => b.h - a.h).forEach(i => {
      if (used.has(i)) return;
      const ex = i.x + i.w, ey = i.y;
      const c = zone.filter(o => !used.has(o) && o !== i && !pctSet.has(o) && /^[.,]?\s*(\d{2}|-+)$/.test(o.s) &&
        o.h < i.h * 0.85 && o.h > i.h * 0.2 &&
        o.x >= ex - i.h * 0.35 && o.x <= ex + i.h * 0.9 &&
        o.y >= ey - i.h * 0.3 && o.y <= ey + i.h * 0.6)
        .sort((a, b) => (Math.abs(a.x - ex) + Math.abs(a.y - ey)) - (Math.abs(b.x - ex) + Math.abs(b.y - ey)))[0];
      used.add(i);
      if (c) used.add(c);
      const cents = c ? c.s.replace(/^[.,]\s*/, '') : '';
      cands.push({ v: toNumber(i.s, cents), h: i.h, y: i.y, x: i.x });
    });
    cands.sort((a, b) => b.h - a.h);

    let newPrice = cands[0] ? cands[0].v : NaN;
    let oldPrice = cands[1] ? cands[1].v : NaN;
    if (oldPrice < newPrice) [oldPrice, newPrice] = [newPrice, oldPrice];
    if (!(newPrice > 0)) warnings.push('prix final non trouvé');
    if (!(oldPrice > 0)) warnings.push('prix barré non trouvé');
    if (newPrice > 0 && oldPrice > 0 && pct !== null) {
      const calc = (1 - newPrice / oldPrice) * 100;
      if (Math.abs(calc - pct) > 2) warnings.push(`remise ${pct} % ≠ ${Math.floor(calc)} % calculée`);
    }

    /* Nom : textes en lettres les plus grands, au-dessus des prix */
    const priceTop = cands.length ? Math.min(...cands.slice(0, 2).map(c => c.y)) : cut;
    const textItems = zone.filter(i => i.y < priceTop && /[a-zà-ÿ]{2,}|\d+[a-z]+/i.test(i.s) &&
      !i.s.split(/\s+/).every(w => STOP.test(w)) && !/^sku/i.test(i.s));
    let name = '';
    if (textItems.length) {
      const top = Math.max(...textItems.map(i => i.h));
      const sel = textItems.filter(i => i.h >= top * 0.7);
      name = lines(sel).map(l => l.items.map(i => i.s).join(' ')).join(' ')
        .split(' ').filter(w => !/^(black|friday)$/i.test(w)).join(' ').trim();
    }
    if (!name) warnings.push('nom non trouvé');

    return { name, sku, oldPrice, newPrice, pct, validity: valid, warnings };
  }

  const api = { parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PH = root.PH || {}; root.PH.parser = api; }
})(typeof window !== 'undefined' ? window : globalThis);
