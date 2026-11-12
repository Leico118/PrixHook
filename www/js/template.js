/* PrixHook — lecture des affiches Fnac Black Friday par zones fixes (page A4 scannée ou image)
   Chaque info est lue dans sa zone : nom, prix barré, prix final, remise, SKU / validité. */
var PH = (typeof window !== 'undefined' ? (window.PH = window.PH || {}) : (globalThis.PH = globalThis.PH || {}));

PH.template = (function () {
  /* Zones en fraction de la page [x0, y0, x1, y1] */
  const Z = {
    name:   [0.04, 0.195, 0.96, 0.345],
    prices: [0.15, 0.355, 0.56, 0.54],
    pct:    [0.52, 0.37, 0.90, 0.48],
    foot:   [0.02, 0.835, 0.80, 0.885]
  };

  /* Découpe une zone ; k réduit la résolution (les gros textes se lisent mieux vers 150 dpi) */
  function cropCanvas(src, W, H, z, k) {
    k = k || 1;
    const x = Math.round(z[0] * W), y = Math.round(z[1] * H);
    const w = Math.round((z[2] - z[0]) * W), h = Math.round((z[3] - z[1]) * H);
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }

  /* Binarisation : 1 = encre. mode 'light' = texte clair sur fond sombre, 'dark' = texte sombre */
  function binarize(c, test) {
    const { width: w, height: h } = c;
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const b = new Uint8Array(w * h);
    for (let i = 0, p = 0; p < w * h; i += 4, p++) b[p] = test(d[i], d[i + 1], d[i + 2]) ? 1 : 0;
    return { w, h, b };
  }

  const lum = (r, g, bl) => 0.299 * r + 0.587 * g + 0.114 * bl;
  const isLight = (r, g, b) => lum(r, g, b) > 140 && Math.max(r, g, b) - Math.min(r, g, b) < 90;
  const isOrange = (r, g, b) => r > 170 && g > 70 && g < 200 && b < 110 && r - b > 110;

  /* Composantes connexes (8-voisinage) */
  function components(img, minPx) {
    const { w, h, b } = img;
    const lab = new Int32Array(w * h);
    const out = [];
    const stack = [];
    let id = 0;
    for (let p = 0; p < w * h; p++) {
      if (!b[p] || lab[p]) continue;
      id++;
      let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
      stack.push(p); lab[p] = id;
      while (stack.length) {
        const q = stack.pop();
        const x = q % w, y = (q / w) | 0;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const r = ny * w + nx;
          if (b[r] && !lab[r]) { lab[r] = id; stack.push(r); }
        }
      }
      if (n >= (minPx || 1)) out.push({ id, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
    }
    return { comps: out, lab };
  }

  function union(list) {
    return list.reduce((a, c) => ({
      x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1)
    }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  }

  /* Image noir sur blanc d'une boîte, mise à l'échelle (hauteur de texte ≈ targetH) avec marge */
  function render(img, box, targetH, keep) {
    const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
    const k = targetH / bh;
    const pad = Math.round(targetH * 0.5);
    const src = document.createElement('canvas');
    src.width = bw; src.height = bh;
    const sctx = src.getContext('2d');
    const id = sctx.createImageData(bw, bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const p = (box.y0 + y) * img.w + box.x0 + x;
      const ink = img.b[p] && (!keep || keep(p));
      const v = ink ? 0 : 255, o = (y * bw + x) * 4;
      id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255;
    }
    sctx.putImageData(id, 0, 0);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bw * k) + pad * 2);
    c.height = Math.max(1, Math.round(bh * k) + pad * 2);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, pad, pad, Math.round(bw * k), Math.round(bh * k));
    return c;
  }

  /* Efface le trait qui barre le prix : recherche de la droite la plus « encrée » (transformée de Hough),
     puis effacement d'une bande autour, en reconstituant les traits de chiffres qui la croisent */
  function removeStrike(img, box) {
    const { w, b } = img;
    const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
    if (bw < 20 || bh < 8) return;
    let best = { score: 0 };
    for (let a = -0.6; a <= 0.05; a += 0.01) {          /* pente (y monte vers la droite) */
      const acc = new Map();
      for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
        if (!b[y * w + x]) continue;
        const c = Math.round(y - a * (x - box.x0));
        acc.set(c, (acc.get(c) || 0) + 1);
      }
      acc.forEach((n, c) => {
        const sc = n + (acc.get(c - 1) || 0) * 0.5 + (acc.get(c + 1) || 0) * 0.5;
        if (sc > best.score) best = { score: sc, a, c };
      });
    }
    if (!best.a && best.a !== 0) return;
    /* la droite doit couvrir l'essentiel de la largeur */
    let covered = 0;
    const yAt = x => best.c + best.a * (x - box.x0);
    for (let x = box.x0; x <= box.x1; x++) {
      const y = Math.round(yAt(x));
      if ((y >= 0 && b[y * w + x]) || (y - 1 >= 0 && b[(y - 1) * w + x]) || (b[(y + 1) * w + x])) covered++;
    }
    if (covered < bw * 0.6) return;
    /* épaisseur : longueur médiane des segments verticaux d'encre centrés sur la droite */
    const runs = [];
    for (let x = box.x0; x <= box.x1; x += 2) {
      const y = Math.round(yAt(x));
      if (y < 0 || y >= img.h || !b[y * w + x]) continue;
      let u = y, d = y;
      while (u - 1 >= 0 && b[(u - 1) * w + x]) u--;
      while (d + 1 < img.h && b[(d + 1) * w + x]) d++;
      runs.push(d - u + 1);
    }
    if (!runs.length) return;
    runs.sort((p, q) => p - q);
    const half = runs[Math.floor(runs.length * 0.4)] / 2 + 1;
    for (let x = box.x0; x <= box.x1; x++) {
      const yc = yAt(x);
      const ya = Math.max(0, Math.floor(yc - half)), yb = Math.min(img.h - 1, Math.ceil(yc + half));
      const at = y => y >= 0 && y < img.h && b[y * w + x];
      const fill = (at(ya - 1) || at(ya - 2)) && (at(yb + 1) || at(yb + 2)) ? 1 : 0;
      for (let y = ya; y <= yb; y++) b[y * w + x] = fill;
    }
  }

  /* Sépare une ligne de prix en partie entière (grands chiffres) et centimes (petits, en haut à droite) */
  /* Regroupe les morceaux superposés horizontalement (un chiffre coupé en deux) en glyphes */
  function glyphs(comps) {
    const list = comps.slice().sort((a, b) => a.x0 - b.x0);
    const out = [];
    list.forEach(c => {
      const g = out.find(o => {
        const ov = Math.min(o.x1, c.x1) - Math.max(o.x0, c.x0);
        return ov > Math.min(o.x1 - o.x0, c.x1 - c.x0) * 0.5;
      });
      if (g) {
        g.parts.push(c.id);
        g.x0 = Math.min(g.x0, c.x0); g.x1 = Math.max(g.x1, c.x1);
        g.y0 = Math.min(g.y0, c.y0); g.y1 = Math.max(g.y1, c.y1);
        g.w = g.x1 - g.x0 + 1; g.h = g.y1 - g.y0 + 1;
      } else out.push({ ...c, parts: [c.id] });
    });
    return out.sort((a, b) => a.x0 - b.x0);
  }

  /* Dessine des glyphes espacés, noir sur blanc (aide la lecture chiffre par chiffre) */
  function renderGlyphs(img, lab, gl, targetH) {
    const top = Math.min(...gl.map(g => g.y0)), bot = Math.max(...gl.map(g => g.y1));
    const k = targetH / (bot - top + 1);
    const gap = Math.round(targetH * 0.35), pad = Math.round(targetH * 0.5);
    const width = gl.reduce((a, g) => a + Math.round(g.w * k), 0) + gap * (gl.length - 1) + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.max(1, width);
    c.height = Math.round((bot - top + 1) * k) + pad * 2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    let x = pad;
    gl.forEach(g => {
      const t = document.createElement('canvas');
      t.width = g.w; t.height = g.h;
      const tc = t.getContext('2d');
      const id = tc.createImageData(g.w, g.h);
      for (let yy = 0; yy < g.h; yy++) for (let xx = 0; xx < g.w; xx++) {
        const p = (g.y0 + yy) * img.w + g.x0 + xx;
        const ink = img.b[p] && g.parts.includes(lab[p]);
        const o = (yy * g.w + xx) * 4, v = ink ? 0 : 255;
        id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255;
      }
      tc.putImageData(id, 0, 0);
      const dw = Math.round(g.w * k), dh = Math.round(g.h * k);
      ctx.drawImage(t, x, pad + Math.round((g.y0 - top) * k), dw, dh);
      x += dw + gap;
    });
    return c;
  }

  /* Empreinte d'un glyphe : grille 24 × 24 (taux d'encre), hauteur normalisée, centrée */
  const G = 24;
  function feat(img, lab, g) {
    const s = Math.max(g.h, g.w) / G;
    const ox = (G - g.w / s) / 2, oy = (G - g.h / s) / 2;
    const f = new Array(G * G).fill(0);
    for (let ty = 0; ty < G; ty++) for (let tx = 0; tx < G; tx++) {
      const sx0 = (tx - ox) * s, sy0 = (ty - oy) * s;
      let ink = 0, n = 0;
      for (let yy = Math.floor(sy0); yy < Math.ceil(sy0 + s); yy++) for (let xx = Math.floor(sx0); xx < Math.ceil(sx0 + s); xx++) {
        if (xx < 0 || yy < 0 || xx >= g.w || yy >= g.h) { n++; continue; }
        const p = (g.y0 + yy) * img.w + g.x0 + xx;
        n++;
        if (img.b[p] && g.parts.includes(lab[p])) ink++;
      }
      f[ty * G + tx] = n ? ink / n : 0;
    }
    return f;
  }

  function splitPrice(img, region) {
    const { comps, lab } = components(img, 25);
    const inRegion = glyphs(comps.filter(c => c.y0 >= region.y0 - 2 && c.y1 <= region.y1 + 2));
    if (!inRegion.length) return null;
    const maxH = Math.max(...inRegion.map(c => c.h));
    const big = inRegion.filter(c => c.h >= maxH * 0.5);
    const base = Math.max(...big.map(c => c.y1));
    /* chiffres entiers : posés sur la ligne de base ; centimes : en exposant (bas nettement plus haut) */
    const ints = big.filter(c => c.y1 >= base - maxH * 0.18 && c.h >= maxH * 0.7);
    if (!ints.length) return null;
    const ib = union(ints);
    const rest = inRegion.filter(c => !ints.includes(c) && c.x0 >= ib.x1 - maxH * 0.15 &&
      c.y1 < base - maxH * 0.18 && c.y0 < ib.y0 + maxH * 0.5);
    let digits = rest.filter(c => c.h >= maxH * 0.3 && c.h > c.w * 0.6);
    if (digits.length) {
      const ch = Math.max(...digits.map(c => c.h));
      digits = digits.filter(c => c.h >= ch * 0.7).slice(0, 2);
    }
    const dash = rest.find(c => c.w > c.h * 1.6);
    return { lab, ints, cents: digits.length ? digits : null, dash: !!dash && !digits.length, h: maxH };
  }

  function rowsSplit(img) {
    const { w, h, b } = img;
    const prof = new Array(h).fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) prof[y] += b[y * w + x];
    /* plus longue bande vide entre 30 % et 65 % de la hauteur */
    let best = null, start = -1;
    for (let y = Math.floor(h * 0.3); y <= Math.floor(h * 0.65); y++) {
      if (prof[y] <= 1) { if (start < 0) start = y; }
      else if (start >= 0) { if (!best || y - start > best.len) best = { y: (start + y) >> 1, len: y - start }; start = -1; }
    }
    if (start >= 0) { const y = Math.floor(h * 0.65); if (!best || y - start > best.len) best = { y: (start + y) >> 1, len: y - start }; }
    if (best) return best.y;
    let m = Math.floor(h * 0.45);
    for (let y = Math.floor(h * 0.35); y <= Math.floor(h * 0.6); y++) if (prof[y] < prof[m]) m = y;
    return m;
  }

  /* Prépare toutes les images à lire pour une page */
  function prepare(src, W, H) {
    const out = {};
    const k = Math.min(1, 1300 / W);

    /* Nom */
    const nameImg = binarize(cropCanvas(src, W, H, Z.name, k), isLight);
    const ncr = components(nameImg, 12);
    const nc = ncr.comps;
    if (nc.length) {
      /* retire les étoiles (glyphes carrés, plus petits que les lettres) */
      const hs = nc.map(c => c.h).sort((a, b) => a - b);
      const capH = hs[Math.floor(hs.length * 0.75)];
      const stars = new Set(nc.filter(c => c.h > capH * 0.25 && c.h < capH * 0.7 && c.w / c.h > 0.7 && c.w / c.h < 1.4 && c.n > c.w * c.h * 0.3).map(c => c.id));
      const kept = nc.filter(c => !stars.has(c.id));
      if (kept.length) {
        const nb = union(kept);
        out.name = render(nameImg, nb, Math.max(20, Math.round((nb.y1 - nb.y0 + 1) * 40 / Math.max(capH, 1))),
          p => !stars.has(ncr.lab[p]));
      }
    }

    /* Prix */
    const prImg = binarize(cropCanvas(src, W, H, Z.prices, k), isLight);
    const split = rowsSplit(prImg);
    const oldRegion = { y0: 0, y1: split };
    const newRegion = { y0: split, y1: prImg.h - 1 };
    const oldComps = components(prImg, 25).comps.filter(c => c.y1 <= split + 2);
    if (oldComps.length) removeStrike(prImg, union(oldComps));
    const oldP = splitPrice(prImg, oldRegion);
    const newP = splitPrice(prImg, newRegion);
    out.f = {};
    if (newP) {
      out.f.newInt = newP.ints.map(g => feat(prImg, newP.lab, g));
      if (newP.cents) out.f.newCents = newP.cents.map(g => feat(prImg, newP.lab, g));
    }
    if (oldP) {
      out.f.oldInt = oldP.ints.map(g => feat(prImg, oldP.lab, g));
      if (oldP.cents) out.f.oldCents = oldP.cents.map(g => feat(prImg, oldP.lab, g));
    }
    if (newP) {
      out.newInt = renderGlyphs(prImg, newP.lab, newP.ints, 40);
      if (newP.cents) out.newCents = renderGlyphs(prImg, newP.lab, newP.cents, 40);
      out.newDash = newP.dash;
    }
    if (oldP) {
      out.oldInt = renderGlyphs(prImg, oldP.lab, oldP.ints, 40);
      if (oldP.cents) out.oldCents = renderGlyphs(prImg, oldP.lab, oldP.cents, 40);
      out.oldDash = oldP.dash;
    }

    /* Remise : texte sombre dans la tache orange */
    const pc = cropCanvas(src, W, H, Z.pct, k);
    const orange = binarize(pc, isOrange);
    const oc = components(orange, 200).comps.sort((a, b) => b.n - a.n)[0];
    if (oc) {
      const dark = binarize(pc, (r, g, b) => lum(r, g, b) < 110);
      const dc = components(dark, 30);
      const inside = dc.comps.filter(c =>
        c.x0 > oc.x0 + 2 && c.x1 < oc.x1 - 2 && c.y0 > oc.y0 + 1 && c.y1 < oc.y1 - 1);
      if (inside.length) {
        const mh = Math.max(...inside.map(c => c.h));
        const dg = glyphs(inside.filter(c => c.h >= mh * 0.7));
        if (dg.length) {
          out.pct = renderGlyphs(dark, dc.lab, dg, 40);
          out.f.pct = dg.map(g => feat(dark, dc.lab, g));
        }
      }
    }

    /* Pied : SKU + validité */
    const footImg = binarize(cropCanvas(src, W, H, Z.foot), isLight);
    const fc = components(footImg, 4).comps;
    if (fc.length) {
      const fb = union(fc);
      out.foot = render(footImg, fb, Math.round((fb.y1 - fb.y0 + 1) * 2.4));
    }
    return out;
  }

  /* Est-ce une affiche au format attendu ? (tache orange dans la zone remise) */
  function looksLikePoster(src, W, H) {
    const r = H / W;
    if (r < 1.3 || r > 1.5) return false;
    const orange = binarize(cropCanvas(src, W, H, Z.pct), isOrange);
    let n = 0;
    for (let i = 0; i < orange.b.length; i++) n += orange.b[i];
    return n > orange.b.length * 0.15;
  }

  /* ---------- Interprétation des textes lus ---------- */
  const NICE = ['95', '00', '90', '50', '99', '49', '45', '85', '80', '75'];
  const MONTHS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];

  const digits = s => String(s || '').replace(/\D/g, '');

  function cleanName(s) {
    return String(s || '')
      .replace(/[|\n]+/g, ' ')
      .replace(/[^A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF0-9,.'\u2019 ]+/g, ' ')
      .replace(/\u2019/g, "'")
      .split(/\s+/).filter(w => w && !/(.)\1{3,}/.test(w) && !(/[a-z]/.test(w) && /[A-Z]{2}/.test(String(s)) && w.length > 2 && w === w.toLowerCase())).join(' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,.']+|[\s,]+$/g, '')
      .trim();
  }

  function month(word) {
    const w = String(word || '').toLowerCase().replace(/rn/g, 'm').replace(/e/g, 'é').replace(/^de/, 'dé');
    const plain = w.replace(/é/g, 'e');
    if (/^juil/.test(plain)) return '07';
    if (/^juin/.test(plain)) return '06';
    for (let i = 0; i < MONTHS.length; i++) {
      const m = MONTHS[i].replace(/[éû]/g, c => (c === 'é' ? 'e' : 'u'));
      if (plain.startsWith(m.slice(0, 3))) return String(i + 1).padStart(2, '0');
    }
    return null;
  }

  function validity(foot) {
    const t = String(foot || '').replace(/\|/g, ' ').replace(/\s+/g, ' ');
    const m = t.match(/du\s+(\d{1,2})\s+([A-Za-z\u00C0-\u00FF]+)\s+(\S{4})\s+[a-z]{1,3}\s+(\d{1,2})\s+([A-Za-z\u00C0-\u00FF]+)\s+(\S{4})/i);
    if (!m) return '';
    const m1 = month(m[2]), m2 = month(m[5]);
    const y = m[6].replace(/[OoDQ]/g, '0').replace(/[Il]/g, '1').replace(/\D/g, '');
    if (!m1 || !m2) return '';
    return `Offre valable du ${m[1].padStart(2, '0')}.${m1} au ${m[4].padStart(2, '0')}.${m2}${y.length === 4 ? '.' + y : ''}`;
  }

  function consistent(oldP, newP, pct) {
    if (pct === null) return true;
    const c = (1 - newP / oldP) * 100;
    return Math.floor(c + 1e-9) === pct || Math.round(c) === pct;
  }

  /* r : textes lus par zone → hook */
  function resolve(r) {
    const warnings = [];
    let pct = parseInt(digits(r.pct), 10);
    pct = pct > 0 && pct < 100 ? pct : null;

    const nI = digits(r.newInt);
    let nC = digits(r.newCents).slice(0, 2);
    if (r.newDash || !nC) nC = '00';
    if (nC.length === 1) nC = nC + '0';
    const newPrice = nI ? +nI + (+nC) / 100 : NaN;

    const oI = digits(r.oldInt);
    let oC = digits(r.oldCents).slice(0, 2);
    if (r.oldDash) oC = '00';
    let oldPrice = NaN;
    if (oI && newPrice > 0) {
      const list = [];
      if (!oC) list.push('00');
      if (oC.length === 2 && NICE.includes(oC)) list.push(oC);
      NICE.forEach(c => { if (!list.includes(c)) list.push(c); });
      const pick = list.find(c => (+oI + (+c) / 100) > newPrice && consistent(+oI + (+c) / 100, newPrice, pct));
      if (pick) oldPrice = +oI + (+pick) / 100;
      else {
        oldPrice = +oI + (oC.length === 2 ? +oC : 0) / 100;
        warnings.push('prix barré incertain');
      }
    }
    if (!(newPrice > 0)) warnings.push('prix final non lu');
    if (!(oldPrice > 0)) warnings.push('prix barré non lu');
    if (oldPrice > 0 && newPrice > 0 && oldPrice <= newPrice) warnings.push('prix barré ≤ prix final');
    if (pct === null) warnings.push('remise non lue');

    const foot = String(r.foot || '');
    const skuM = foot.replace(/[Oo]/g, '0').match(/SKU\s*[:.;,]?\s*(\d{6,9})/i);
    const name = cleanName(r.name);
    if (!name) warnings.push('nom non lu');

    return { name, sku: skuM ? skuM[1] : '', oldPrice, newPrice, pct, validity: validity(foot), warnings };
  }

  /* ---------- Reconnaissance des chiffres par comparaison aux modèles ---------- */
  let MODEL = null;
  function model() {
    if (MODEL) return MODEL;
    const src = PH.digitModel || { b: '', l: '' };
    MODEL = {};
    for (const c of ['b', 'l']) {
      MODEL[c] = String(src[c] || '').split(',').filter(Boolean).map(t => ({
        d: t[0], v: Array.from(t.slice(1), h => parseInt(h, 16))
      }));
    }
    return MODEL;
  }

  function pool(v) {
    const o = [];
    for (let y = 0; y < G; y += 2) for (let x = 0; x < G; x += 2) {
      o.push(Math.round((v[y * G + x] + v[y * G + x + 1] + v[(y + 1) * G + x] + v[(y + 1) * G + x + 1]) / 4 * 15));
    }
    return o;
  }

  function digit(f, cls) {
    const v = pool(f);
    let best = Infinity, d = '';
    for (const t of model()[cls]) {
      let s = 0;
      for (let i = 0; i < v.length; i++) { const e = v[i] - t.v[i]; s += e * e; if (s >= best) break; }
      if (s < best) { best = s; d = t.d; }
    }
    return d;
  }

  function readDigits(list, cls) {
    return (list || []).map(f => digit(f, cls)).join('');
  }

  /* Lit les prix et la remise d'une page préparée (sans OCR) */
  function readNumbers(prep) {
    const f = prep.f || {};
    return {
      newInt: readDigits(f.newInt, 'b'), newCents: readDigits(f.newCents, 'b'), newDash: prep.newDash,
      oldInt: readDigits(f.oldInt, 'l'), oldCents: readDigits(f.oldCents, 'l'), oldDash: prep.oldDash,
      pct: readDigits(f.pct, 'b')
    };
  }

  return { prepare, looksLikePoster, resolve, readNumbers, cleanName, Z };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PH.template;
