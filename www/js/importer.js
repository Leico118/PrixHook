/* PrixHook — import d'affiches : PDF (1 page A4 = 1 hook) ou images
   1. PDF numérique avec vrai texte → lecture directe du texte
   2. Affiche scannée / photo à plat au format Fnac → lecture par zones (chiffres reconnus par modèle, nom et pied par OCR)
   3. Autre image → OCR général (à vérifier) */
window.PH = window.PH || {};

PH.importer = (function () {
  let ocrWorker = null;
  let mode = null;

  async function getOcr(psm) {
    await PH.libs.ensure('tesseract');
    if (!ocrWorker) ocrWorker = await window.Tesseract.createWorker('fra');
    if (mode !== psm) {
      await ocrWorker.setParameters({ tessedit_pageseg_mode: String(psm) });
      mode = psm;
    }
    return ocrWorker;
  }

  async function ocrText(canvas) {
    if (!canvas) return '';
    const w = await getOcr(6);
    const { data } = await w.recognize(canvas);
    return (data.text || '').trim().replace(/\n+/g, ' | ');
  }

  function scaled(source, w, h, k) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  }

  function overlap(a, b) {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix * iy > 0.4 * Math.min(a.w * a.h, b.w * b.h);
  }

  /* OCR général à deux échelles (dernier recours) */
  async function ocrItems(source, w, h) {
    const worker = await getOcr(11);
    const base = Math.min(1, 1800 / Math.max(w, h));
    const words = [];
    for (const k of [base * 0.5, base]) {
      const { data } = await worker.recognize(scaled(source, w, h, k));
      (data.words || []).forEach(wd => {
        if (wd.confidence < 40 || !wd.text.trim()) return;
        words.push({
          s: wd.text, c: wd.confidence,
          x: wd.bbox.x0 / k, y: wd.bbox.y0 / k,
          w: (wd.bbox.x1 - wd.bbox.x0) / k, h: (wd.bbox.y1 - wd.bbox.y0) / k
        });
      });
    }
    const out = [];
    words.sort((a, b) => b.c - a.c).forEach(wd => { if (!out.some(o => overlap(o, wd))) out.push(wd); });
    return out;
  }

  /* Lecture d'une affiche au format Fnac par zones */
  async function readPoster(canvas) {
    const T = PH.template;
    const prep = T.prepare(canvas, canvas.width, canvas.height);
    const nums = T.readNumbers(prep);
    const name = await ocrText(prep.name);
    const foot = await ocrText(prep.foot);
    return T.resolve({ ...nums, name, foot });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image illisible'));
      img.src = url;
    });
  }

  function release(c) {
    if (c) { c.width = 0; c.height = 0; }
  }

  async function fromPdf(file, report) {
    await PH.libs.ensure('pdfjs');
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const results = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      report(`${file.name} : page ${p}/${pdf.numPages}…`);
      const source = `${file.name} p.${p}`;
      try {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1 });

        /* 1. Vrai texte (PDF numérique) */
        const tc = await page.getTextContent();
        const items = tc.items.filter(i => i.str && i.str.trim()).map(i => {
          const h = Math.hypot(i.transform[2], i.transform[3]);
          return { s: i.str, x: i.transform[4], y: vp.height - i.transform[5] - h, w: i.width, h };
        });
        if (/SKU/i.test(items.map(i => i.s).join(' '))) {
          const r = PH.parser.parse(items);
          if (r.oldPrice > 0 && r.newPrice > 0 && r.name) { results.push({ ...r, source }); continue; }
        }

        /* 2. Page scannée : rendu à 300 dpi puis lecture par zones */
        const k = 300 / 72;
        const v2 = page.getViewport({ scale: k });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(v2.width);
        canvas.height = Math.round(v2.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: v2 }).promise;
        page.cleanup();
        if (PH.template.looksLikePoster(canvas, canvas.width, canvas.height)) {
          results.push({ ...await readPoster(canvas), source });
        } else {
          results.push({ ...PH.parser.parse(await ocrItems(canvas, canvas.width, canvas.height)), source, ocr: true });
        }
        release(canvas);
      } catch (e) {
        results.push({ source, error: e && e.message ? e.message : String(e) });
      }
    }
    return results;
  }

  async function fromImage(file, report) {
    report(`${file.name} : lecture…`);
    const img = await loadImage(file);
    const W = img.naturalWidth, H = img.naturalHeight;
    URL.revokeObjectURL(img.src);
    const canvas = scaled(img, W, H, Math.min(1, 3508 / Math.max(W, H)));
    try {
      if (PH.template.looksLikePoster(canvas, canvas.width, canvas.height)) {
        return [{ ...await readPoster(canvas), source: file.name }];
      }
      return [{ ...PH.parser.parse(await ocrItems(canvas, canvas.width, canvas.height)), source: file.name, ocr: true }];
    } finally {
      release(canvas);
    }
  }

  async function importFiles(files, report) {
    const out = [];
    for (const f of files) {
      try {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) out.push(...await fromPdf(f, report));
        else if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name)) out.push(...await fromImage(f, report));
        else out.push({ source: f.name, error: 'format non pris en charge' });
      } catch (e) {
        out.push({ source: f.name, error: e && e.message ? e.message : String(e) });
      }
    }
    return out;
  }

  return { importFiles };
})();
