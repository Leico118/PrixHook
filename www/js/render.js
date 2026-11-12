/* PrixHook — rendu des hooks Black Friday et de la grille A4 (2 colonnes × 6 lignes = 12 hooks) */
window.PH = window.PH || {};

PH.render = (function () {
  const P = PH.pricing;
  const PER_PAGE = 12;

  const BRUSH = `<svg class="brush-bg" viewBox="0 0 220 90" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="#F5B800" d="M16 16 C44 6 92 10 132 8 C168 6 200 4 212 14 C221 24 207 30 214 41 C222 53 207 59 213 70 C218 83 190 85 150 83 C110 81 62 87 30 83 C10 81 4 71 12 63 C2 57 8 47 3 39 C-1 29 6 21 16 16 Z"/>
  </svg>`;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function price(v) {
    const s = P.split(v);
    return `<span class="pr"><span class="pi">${s.int}</span><span class="pd">${s.cents}</span></span>`;
  }

  function nameClass(name) {
    const n = String(name || '').length;
    return n > 44 ? 'xl' : n > 30 ? 'l' : '';
  }

  function tag(t) {
    const oldP = P.parse(t.oldPrice);
    const newP = P.parse(t.newPrice);
    const pct = (t.pct !== null && t.pct !== undefined && t.pct !== '') ? t.pct : P.discountPct(oldP, newP);
    const foot = [t.sku ? `SKU : ${esc(t.sku)}` : '', esc(t.validity || '')].filter(Boolean).join(' · ');
    return `<div class="tag bf">
      <div class="bf-corner"></div>
      <div class="bf-logo"><span class="b">BLACK</span><span class="f">FRIDAY</span></div>
      <div class="bf-name ${nameClass(t.name)}">${esc(t.name)}</div>
      <div class="bf-prices">
        <div class="bf-old">${price(oldP)}</div>
        <div class="bf-new">${price(newP)}</div>
      </div>
      <div class="bf-badge">
        <div class="brush">${BRUSH}<span class="pct">−${esc(pct)}<sup>%</sup></span></div>
        <div class="bf-cap">DE REMISE<br>IMMÉDIATE</div>
      </div>
      <div class="bf-foot">${foot}</div>
    </div>`;
  }

  function expand(tags) {
    const out = [];
    tags.forEach(t => {
      const n = Math.max(1, Math.min(99, parseInt(t.copies, 10) || 1));
      for (let i = 0; i < n; i++) out.push(t);
    });
    return out;
  }

  function pages(tags, s) {
    const all = expand(tags.filter(valid));
    const list = [];
    for (let i = 0; i < all.length; i += PER_PAGE) list.push(all.slice(i, i + PER_PAGE));
    if (!list.length) list.push([]);
    return list.map(p =>
      `<div class="page${s.cut ? ' cut' : ''}">` +
      p.map(t => `<div class="cell">${tag(t)}</div>`).join('') +
      Array(PER_PAGE - p.length).fill('<div class="cell empty"></div>').join('') +
      `</div>`
    );
  }

  /* Réduit les prix d'un hook tant qu'ils débordent de leur zone (à appeler sur un élément affiché) */
  function fit(root) {
    root.querySelectorAll('.tag.bf').forEach(t => {
      const box = t.querySelector('.bf-prices');
      const nw = t.querySelector('.bf-new'), od = t.querySelector('.bf-old');
      if (!box || !box.clientWidth) return;
      nw.style.fontSize = ''; od.style.fontSize = '';
      const f1 = parseFloat(getComputedStyle(nw).fontSize), f2 = parseFloat(getComputedStyle(od).fontSize);
      let k = 1;
      for (let i = 0; i < 15 && (box.scrollWidth > box.clientWidth + 0.5 || box.scrollHeight > box.clientHeight + 0.5); i++) {
        k *= 0.94;
        nw.style.fontSize = (f1 * k) + 'px';
        od.style.fontSize = (f2 * k) + 'px';
      }
    });
  }

  function valid(t) {
    return P.parse(t.oldPrice) > 0 && P.parse(t.newPrice) > 0;
  }

  return { tag, pages, expand, esc, fit, valid, PER_PAGE };
})();
