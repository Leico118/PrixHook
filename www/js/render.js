/* PrixHook — dessin des hooks Black Friday (90 × 40 mm) et des pages A4 (2 × 6 = 12 hooks)
   Tout est dessiné sur un canvas en millimètres : l'aperçu, le PDF et l'impression sont identiques. */
window.PH = window.PH || {};

PH.render = (function () {
  const P = PH.pricing;
  const PER_PAGE = 12;
  const A4 = { w: 210, h: 297 };
  const HOOK = { w: 90, h: 40 };
  const COLS = 2, ROWS = 6;
  const ORIGIN = { x: (A4.w - COLS * HOOK.w) / 2, y: (A4.h - ROWS * HOOK.h) / 2 };

  const C = { bg: '#262626', fg: '#ffffff', mute: '#bdbdbd', price: '#ececec', yellow: '#F5B800', dark: '#262626' };
  const F_HEAD = '"Archivo Black", "Arial Black", "Roboto", sans-serif';
  const F_BODY = 'Poppins, "Roboto", "Helvetica Neue", Arial, sans-serif';
  const BRUSH = new Path2D('M16 16 C44 6 92 10 132 8 C168 6 200 4 212 14 C221 24 207 30 214 41 C222 53 207 59 213 70 C218 83 190 85 150 83 C110 81 62 87 30 83 C10 81 4 71 12 63 C2 57 8 47 3 39 C-1 29 6 21 16 16 Z');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function valid(t) {
    return P.parse(t.oldPrice) > 0 && P.parse(t.newPrice) > 0;
  }

  function expand(tags) {
    const out = [];
    tags.forEach(t => {
      const n = Math.max(1, Math.min(99, parseInt(t.copies, 10) || 1));
      for (let i = 0; i < n; i++) out.push(t);
    });
    return out;
  }

  /* Découpe la liste en pages de 12 hooks */
  function paginate(tags) {
    const all = expand(tags.filter(valid));
    const pages = [];
    for (let i = 0; i < all.length; i += PER_PAGE) pages.push(all.slice(i, i + PER_PAGE));
    return pages.length ? pages : [[]];
  }

  /* ---------- Outils de dessin (unités : mm) ---------- */
  /* Archivo Black n'existe qu'en 400 ; si elle n'est pas chargée, la police de secours passe en 900 */
  let headWeight = 400;
  function font(ctx, weight, sizeMm, family) {
    const w = family === F_HEAD ? headWeight : weight;
    ctx.font = `${w} ${sizeMm}px ${family}`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Prix « entier + centimes en exposant » : mesure */
  function measurePrice(ctx, v, size) {
    const s = P.split(v);
    font(ctx, 800, size, F_BODY);
    const mi = ctx.measureText(s.int);
    font(ctx, 800, size * 0.46, F_BODY);
    const mc = ctx.measureText(s.cents);
    const gap = size * 0.05;
    return { s, size, wInt: mi.width, wC: mc.width, gap, w: mi.width + gap + mc.width,
             asc: mi.actualBoundingBoxAscent || size * 0.7, ascC: mc.actualBoundingBoxAscent || size * 0.46 * 0.7 };
  }

  /* Dessine un prix mesuré ; (x, base) = coin gauche sur la ligne de base */
  function drawPrice(ctx, m, x, base, color) {
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    font(ctx, 800, m.size, F_BODY);
    ctx.fillText(m.s.int, x, base);
    font(ctx, 800, m.size * 0.46, F_BODY);
    const cb = base - m.asc + m.ascC;
    ctx.fillText(m.s.cents, x + m.wInt + m.gap, cb);
  }

  /* Coupe le nom en lignes, réduit la police jusqu'à tenir dans la zone */
  function fitLines(ctx, text, maxW, maxH, maxLines, startSize, minSize) {
    const words = String(text || '').toUpperCase().split(/\s+/).filter(Boolean);
    for (let size = startSize; size >= minSize; size -= 0.1) {
      font(ctx, 800, size, F_BODY);
      const lines = [];
      let cur = '';
      let ok = true;
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width <= maxW) cur = test;
        else {
          if (!cur || ctx.measureText(w).width > maxW) { ok = false; break; }
          lines.push(cur);
          cur = w;
        }
      }
      if (cur) lines.push(cur);
      const lh = size * 1.12;
      if (ok && lines.length <= maxLines && lines.length * lh <= maxH + 0.01) return { size, lines, lh };
    }
    font(ctx, 800, minSize, F_BODY);
    return { size: minSize, lines: [words.join(' ')], lh: minSize * 1.12 };
  }

  /* ---------- Un hook 90 × 40 mm, coin haut-gauche en (x, y) ---------- */
  function drawHook(ctx, t, x, y) {
    const W = HOOK.w, H = HOOK.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    /* fond + filet blanc */
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.fg;
    ctx.lineWidth = 0.35;
    ctx.strokeRect(0.7, 0.7, W - 1.4, H - 1.4);

    /* équerre jaune */
    ctx.fillStyle = C.yellow;
    ctx.fillRect(0, 0, 8, 1.6);
    ctx.fillRect(0, 0, 1.6, 6);

    /* logo BLACK FRIDAY centré dans sa pastille blanche */
    const logoH = 5, logoY = 2.1, logoSize = 3.5;
    font(ctx, 400, logoSize, F_HEAD);
    const wB = ctx.measureText('BLACK').width, wF = ctx.measureText('FRIDAY').width, sp = logoSize * 0.35;
    const mL = ctx.measureText('BLACK FRIDAY');
    const pillW = wB + sp + wF + 4.4;
    const px = (W - pillW) / 2;
    ctx.fillStyle = C.fg;
    roundRect(ctx, px, logoY, pillW, logoH, 1.2);
    ctx.fill();
    const asc = mL.actualBoundingBoxAscent || logoSize * 0.72, desc = mL.actualBoundingBoxDescent || 0;
    const lb = logoY + logoH / 2 + (asc - desc) / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.dark;
    ctx.fillText('BLACK', px + 2.2, lb);
    ctx.fillStyle = C.yellow;
    ctx.fillText('FRIDAY', px + 2.2 + wB + sp, lb);

    /* nom du produit : 2 lignes max, centré */
    const nameTop = 7.9, nameH = 7.4;
    const fit = fitLines(ctx, t.name, W - 8, nameH, 2, 3.6, 2.2);
    ctx.fillStyle = C.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    font(ctx, 800, fit.size, F_BODY);
    const blockH = fit.lines.length * fit.lh;
    fit.lines.forEach((ln, i) => {
      ctx.fillText(ln, W / 2, nameTop + (nameH - blockH) / 2 + fit.lh * (i + 0.5));
    });

    /* prix : barré à gauche, prix final à droite, centrés dans la zone gauche */
    const oldP = P.parse(t.oldPrice), newP = P.parse(t.newPrice);
    const zone = { x: 2.5, w: 52, top: 16.2, h: 19.5 };
    let sNew = 12.8, sOld = 6.2;
    let mo, mn, gap;
    for (let i = 0; i < 20; i++) {
      mo = measurePrice(ctx, oldP, sOld);
      mn = measurePrice(ctx, newP, sNew);
      gap = sNew * 0.2;
      if (mo.w + gap + mn.w <= zone.w) break;
      sNew *= 0.95; sOld *= 0.95;
    }
    const total = mo.w + gap + mn.w;
    const gx = zone.x + (zone.w - total) / 2;
    const newBase = zone.top + zone.h / 2 + mn.asc / 2;
    const oldBase = zone.top + zone.h / 2 + mo.asc / 2;
    drawPrice(ctx, mo, gx, oldBase, C.mute);
    /* trait qui barre */
    ctx.strokeStyle = C.fg;
    ctx.lineWidth = 0.45;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx - 0.4, oldBase - mo.asc * 0.12);
    ctx.lineTo(gx + mo.w + 0.4, oldBase - mo.asc * 0.9);
    ctx.stroke();
    drawPrice(ctx, mn, gx + mo.w + gap, newBase, C.price);

    /* remise dans la tache jaune */
    const pct = (t.pct !== null && t.pct !== undefined && t.pct !== '') ? t.pct : P.discountPct(oldP, newP);
    const bx = 56, by = 17.2, bw = 31, bh = 12;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(bw / 220, bh / 90);
    ctx.fillStyle = C.yellow;
    ctx.fill(BRUSH);
    ctx.restore();
    const pSize = 7.2;
    font(ctx, 400, pSize, F_HEAD);
    const txt = '−' + pct;
    const mp = ctx.measureText(txt);
    font(ctx, 400, pSize * 0.5, F_HEAD);
    const mPct = ctx.measureText('%');
    const pw = mp.width + 0.3 + mPct.width;
    const pAsc = mp.actualBoundingBoxAscent || pSize * 0.72;
    const pBase = by + bh / 2 + pAsc / 2 - 0.9;          /* remonté dans la tache */
    const px0 = bx + (bw - pw) / 2;
    ctx.fillStyle = C.dark;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    font(ctx, 400, pSize, F_HEAD);
    ctx.fillText(txt, px0, pBase);
    font(ctx, 400, pSize * 0.5, F_HEAD);
    ctx.fillText('%', px0 + mp.width + 0.3, pBase - pAsc + (mPct.actualBoundingBoxAscent || pSize * 0.36));

    ctx.fillStyle = C.fg;
    ctx.textAlign = 'center';
    font(ctx, 600, 2.1, F_BODY);
    ctx.fillText('DE REMISE', bx + bw / 2, by + bh + 2.6);
    ctx.fillText('IMMÉDIATE', bx + bw / 2, by + bh + 4.9);

    /* pied : SKU + validité */
    const foot = [t.sku ? `SKU : ${t.sku}` : '', t.validity || ''].filter(Boolean).join(' · ');
    if (foot) {
      ctx.fillStyle = C.mute;
      ctx.textAlign = 'left';
      font(ctx, 400, 1.75, F_BODY);
      let f = foot;
      while (f.length > 4 && ctx.measureText(f).width > W - 6) f = f.slice(0, -2);
      if (f !== foot) f = f.replace(/\s*\S?$/, '…');
      ctx.fillText(f, 3, H - 1.9);
    }
    ctx.restore();
  }

  /* ---------- Une page A4 sur un canvas (pxPerMm = résolution) ---------- */
  function drawPage(hooks, pxPerMm, cut) {
    const c = document.createElement('canvas');
    c.width = Math.round(A4.w * pxPerMm);
    c.height = Math.round(A4.h * pxPerMm);
    const ctx = c.getContext('2d');
    ctx.scale(pxPerMm, pxPerMm);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, A4.w, A4.h);
    for (let i = 0; i < PER_PAGE; i++) {
      const x = ORIGIN.x + (i % COLS) * HOOK.w;
      const y = ORIGIN.y + Math.floor(i / COLS) * HOOK.h;
      if (hooks[i]) drawHook(ctx, hooks[i], x, y);
      if (cut) {
        ctx.strokeStyle = '#9a9a9a';
        ctx.lineWidth = 0.15;
        ctx.setLineDash([1, 0.8]);
        ctx.strokeRect(x, y, HOOK.w, HOOK.h);
        ctx.setLineDash([]);
      }
    }
    return c;
  }

  async function fontsReady() {
    if (!document.fonts) return;
    try {
      await Promise.all([
        document.fonts.load('400 20px "Archivo Black"'),
        document.fonts.load('800 20px Poppins'),
        document.fonts.load('600 20px Poppins'),
        document.fonts.load('400 20px Poppins')
      ]);
    } catch (e) { /* polices de secours */ }
    try { headWeight = document.fonts.check('20px "Archivo Black"') ? 400 : 900; } catch (e) { headWeight = 900; }
  }

  return { paginate, drawPage, drawHook, fontsReady, expand, valid, esc, PER_PAGE, HOOK };
})();
