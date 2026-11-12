/* PrixHook — export PDF A4 (html2canvas + jsPDF), impression, partage sur Android (Capacitor) */
window.PH = window.PH || {};

PH.exporter = (function () {
  function isNative() {
    const c = window.Capacitor;
    return !!(c && c.isNativePlatform && c.isNativePlatform());
  }

  /* pagesHtml : tableau de chaînes HTML (pages déjà ajustées), une par page A4 */
  async function pdf(pagesHtml, filename, onProgress) {
    await PH.libs.ensure('html2canvas', 'jspdf');
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
        PH.render.fit(page);
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
