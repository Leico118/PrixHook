/* PrixHook — export PDF A4 (html2canvas + jsPDF), impression, partage sur Android (Capacitor) */
window.PH = window.PH || {};

PH.exporter = (function () {
  const LIBS = [
    { test: () => window.html2canvas, local: 'vendor/html2canvas.min.js',
      cdn: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js' },
    { test: () => window.jspdf && window.jspdf.jsPDF, local: 'vendor/jspdf.umd.min.js',
      cdn: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' }
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => { el.remove(); reject(new Error(src)); };
      document.head.appendChild(el);
    });
  }

  async function ensureLibs() {
    for (const lib of LIBS) {
      if (lib.test()) continue;
      try { await loadScript(lib.local); } catch (e) { /* pas de copie locale : CDN */ }
      if (!lib.test()) {
        try { await loadScript(lib.cdn); } catch (e) { /* géré plus bas */ }
      }
      if (!lib.test()) throw new Error('Module PDF introuvable : vérifie ta connexion internet.');
    }
  }

  function isNative() {
    const c = window.Capacitor;
    return !!(c && c.isNativePlatform && c.isNativePlatform());
  }

  /* pagesHtml : tableau de chaînes HTML, une par page A4 */
  async function pdf(pagesHtml, filename, onProgress) {
    await ensureLibs();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const host = document.createElement('div');
    host.className = 'export-host';
    document.body.appendChild(host);

    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    try {
      for (let i = 0; i < pagesHtml.length; i++) {
        if (onProgress) onProgress(i + 1, pagesHtml.length);
        host.innerHTML = pagesHtml[i];
        const page = host.firstElementChild;
        const canvas = await window.html2canvas(page, {
          scale: 3, backgroundColor: '#ffffff', useCORS: true,
          scrollX: 0, scrollY: 0, windowWidth: page.scrollWidth, windowHeight: page.scrollHeight
        });
        if (i > 0) doc.addPage();
        doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      }
    } finally {
      host.remove();
    }

    if (isNative()) {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      const b64 = doc.output('datauristring').split(',')[1];
      const res = await Filesystem.writeFile({ path: filename, data: b64, directory: 'CACHE' });
      await Share.share({ title: filename, url: res.uri, dialogTitle: 'Imprimer / partager le PDF' });
    } else {
      doc.save(filename);
    }
  }

  function print(pagesHtml) {
    const area = document.getElementById('printArea');
    area.innerHTML = pagesHtml.join('');
    setTimeout(() => window.print(), 50);
  }

  return { pdf, print, isNative };
})();
