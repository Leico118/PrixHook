/* PrixHook — interface (saisie, liste, import, réglages, aperçu) */
(function () {
  const P = PH.pricing, R = PH.render, X = PH.exporter;
  const VERSION = '0.2.0';
  const KEY = 'prixhook.v2';
  const DEF = { cut: true };

  let state = { tags: [], settings: { ...DEF } };
  let editId = null;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);

  /* ---------- Stockage ---------- */
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.tags)) {
        state.tags = s.tags;
        state.settings = { ...DEF, ...(s.settings || {}) };
        return;
      }
    } catch (e) { /* stockage indisponible */ }
    state.tags = seed();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignoré */ }
  }

  function seed() {
    return [{
      id: uid(), name: "JBL Tune 735BT Noir 76h d'autonomie", sku: '15677945',
      oldPrice: 79.95, newPrice: 49.95, pct: 37,
      validity: 'Offre valable du 20.11 au 31.12.2026', copies: 1
    }];
  }

  /* ---------- Normalisation (formulaire + import JSON) ---------- */
  function normalize(o) {
    const pctRaw = o.pct ?? o.remise;
    const pct = pctRaw === '' || pctRaw === null || pctRaw === undefined
      ? null : parseInt(String(pctRaw).replace(/\D/g, ''), 10);
    return {
      id: o.id || uid(),
      name: String(o.name ?? o.nom ?? '').trim(),
      sku: String(o.sku ?? '').trim(),
      oldPrice: P.parse(o.oldPrice ?? o.prixBarre),
      newPrice: P.parse(o.newPrice ?? o.prixFinal),
      pct: isFinite(pct) ? pct : null,
      validity: String(o.validity ?? o.validite ?? '').trim(),
      copies: Math.max(1, Math.min(99, parseInt(o.copies ?? o.exemplaires, 10) || 1))
    };
  }

  function isValid(t) {
    if (!t.name) return 'Le nom du produit est obligatoire.';
    if (!(t.oldPrice > 0 && t.newPrice > 0)) return 'Prix barré et prix final obligatoires.';
    return '';
  }

  /* ---------- Formulaire ---------- */
  const form = () => $('#form');

  function readForm() {
    const o = Object.fromEntries(new FormData(form()).entries());
    if (editId) o.id = editId;
    return normalize(o);
  }

  function fillForm(t) {
    const f = form();
    f.reset();
    ['name', 'sku', 'oldPrice', 'newPrice', 'validity', 'copies'].forEach(k => { f[k].value = t[k] ?? ''; });
    f.pct.value = t.pct ?? '';
    updateCalc();
  }

  function resetForm() {
    editId = null;
    form().reset();
    $('#submitBtn').textContent = 'Ajouter le hook';
    $('#cancelEdit').hidden = true;
    $('#formMsg').textContent = '';
    updateCalc();
  }

  function updateCalc() {
    const f = form();
    const o = P.parse(f.oldPrice.value), n = P.parse(f.newPrice.value);
    $('#calcBf').innerHTML = o > 0 && n > 0
      ? `Remise calculée : <b>−${P.discountPct(o, n)} %</b> (économie ${P.fmt(o - n)})` : '';
  }

  function onSubmit(e) {
    e.preventDefault();
    const t = readForm();
    const err = isValid(t);
    if (err) { $('#formMsg').textContent = err; return; }
    if (editId) {
      const i = state.tags.findIndex(x => x.id === editId);
      if (i >= 0) state.tags[i] = t;
    } else {
      state.tags.push(t);
    }
    save();
    resetForm();
    renderAll();
  }

  /* ---------- Liste ---------- */
  function renderList() {
    const list = $('#list');
    $('#count').textContent = `(${state.tags.length} · ${R.expand(state.tags).length} ex.)`;
    if (!state.tags.length) {
      list.innerHTML = '<li class="empty-li">Aucun hook pour l\'instant.</li>';
      return;
    }
    list.innerHTML = state.tags.map(t => `<li data-id="${t.id}">
        <div class="li-main">
          <div class="li-name">${R.esc(t.name)}</div>
          <div class="li-info"><s>${P.fmt(t.oldPrice)}</s> → <b>${P.fmt(t.newPrice)}</b> · −${t.pct ?? P.discountPct(t.oldPrice, t.newPrice)} % · ×${t.copies}</div>
        </div>
        <div class="li-act">
          <button data-act="edit" title="Modifier">✎</button>
          <button data-act="dup" title="Dupliquer">⧉</button>
          <button data-act="del" title="Supprimer">✕</button>
        </div></li>`).join('');
  }

  function onListClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('li').dataset.id;
    const i = state.tags.findIndex(t => t.id === id);
    if (i < 0) return;
    const act = btn.dataset.act;
    if (act === 'edit') {
      editId = id;
      fillForm(state.tags[i]);
      $('#submitBtn').textContent = 'Mettre à jour';
      $('#cancelEdit').hidden = false;
      form().scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (act === 'dup') state.tags.splice(i + 1, 0, { ...state.tags[i], id: uid() });
    if (act === 'del') state.tags.splice(i, 1);
    save();
    renderAll();
  }

  /* ---------- Import / sauvegarde ---------- */
  function onImport() {
    const msg = $('#importMsg');
    let txt = $('#importText').value.trim();
    if (!txt) { msg.textContent = 'Colle d\'abord le JSON.'; return; }
    txt = txt.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    let data;
    try { data = JSON.parse(txt); } catch (e) { msg.textContent = 'JSON invalide.'; return; }
    if (data && Array.isArray(data.tags)) data = data.tags;
    if (!Array.isArray(data)) data = [data];
    let ok = 0, ko = 0;
    data.forEach(o => {
      const t = normalize({ ...o, id: undefined });
      if (isValid(t)) ko++; else { state.tags.push(t); ok++; }
    });
    save();
    renderAll();
    msg.textContent = `${ok} hook(s) importé(s)${ko ? `, ${ko} ignoré(s)` : ''}.`;
    if (ok) $('#importText').value = '';
  }

  async function onBackup() {
    const json = JSON.stringify(state.tags.map(({ id, ...t }) => t), null, 1);
    const msg = $('#importMsg');
    try {
      await navigator.clipboard.writeText(json);
      msg.textContent = 'Sauvegarde copiée dans le presse-papiers.';
    } catch (e) {
      $('#importText').value = json;
      $('#importText').select();
      msg.textContent = 'Sauvegarde affichée ci-dessus : copie-la.';
    }
  }

  /* ---------- Effacer tout (confirmation en deux appuis) ---------- */
  let clearArmed = null;
  function onClearAll() {
    const btn = $('#clearAll');
    if (!state.tags.length) return;
    if (!clearArmed) {
      btn.textContent = 'Confirmer ?';
      clearArmed = setTimeout(() => { clearArmed = null; btn.textContent = 'Tout effacer'; }, 3000);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = null;
    btn.textContent = 'Tout effacer';
    state.tags = [];
    save();
    renderAll();
  }

  /* ---------- Aperçu ---------- */
  let pagesCache = [];

  function renderPreview() {
    pagesCache = R.pages(state.tags, state.settings);
    $('#sheet').innerHTML = pagesCache.join('');
    $('#pageCount').textContent = `(${pagesCache.length})`;
    fitPreview();
  }

  function fitPreview() {
    const wrap = $('#previewWrap'), sheet = $('#sheet');
    if (!wrap.offsetWidth) return;
    const scale = Math.min(1, wrap.clientWidth / (210 * 96 / 25.4));
    sheet.style.transform = `scale(${scale})`;
    wrap.style.height = (sheet.scrollHeight * scale) + 'px';
  }

  function renderAll() {
    renderList();
    renderPreview();
  }

  function fileName() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `PrixHook-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.pdf`;
  }

  async function onPdf() {
    const msg = $('#pdfMsg'), btn = $('#pdfBtn');
    if (!state.tags.length) { msg.textContent = 'Aucun hook à exporter.'; return; }
    btn.disabled = true;
    try {
      await X.pdf(pagesCache, fileName(), (i, n) => { msg.textContent = `Génération de la page ${i}/${n}…`; });
      msg.textContent = 'PDF prêt.';
    } catch (e) {
      msg.textContent = 'Erreur : ' + (e && e.message ? e.message : e);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Onglets ---------- */
  function setTab(name) {
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    $$('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + name));
    if (name === 'preview') requestAnimationFrame(fitPreview);
  }

  /* ---------- Démarrage ---------- */
  function init() {
    load();
    $('#ver').textContent = 'v' + VERSION;
    $$('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    form().addEventListener('submit', onSubmit);
    form().addEventListener('input', updateCalc);
    $('#cancelEdit').addEventListener('click', resetForm);
    $('#list').addEventListener('click', onListClick);
    $('#clearAll').addEventListener('click', onClearAll);
    $('#importBtn').addEventListener('click', onImport);
    $('#exportJson').addEventListener('click', onBackup);
    $('#pdfBtn').addEventListener('click', onPdf);
    $('#printBtn').addEventListener('click', () => X.print(pagesCache));
    if (X.isNative()) $('#printBtn').hidden = true;
    $('#setCut').checked = state.settings.cut;
    $('#setCut').addEventListener('change', () => {
      state.settings.cut = $('#setCut').checked;
      save();
      renderPreview();
    });
    window.addEventListener('resize', fitPreview);
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
