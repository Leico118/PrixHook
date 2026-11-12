/* PrixHook — export PDF A4 (pages dessinées à 300 dpi + jsPDF), impression, partage sur Android */
window.PH = window.PH || {};

PH.exporter = (function () {
  const DPI300 = 300 / 25.4;

  function isNative() {
    const c = window.Capacitor;
    return !!(c && c.isNativePlatform && c.isNativePlatform());
  }

  /* pages : tableaux de hooks (12 max par page) */
  async function pdf(pages, cut, filename, onProgress) {
    await PH.libs.ensure('jspdf');
    await PH.render.fontsReady();
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    for (let i = 0; i < pages.length; i++) {
      if (onProgress) onProgress(i + 1, pages.length);
      const c = PH.render.drawPage(pages[i], DPI300, cut);
      if (i > 0) doc.addPage();
      doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
      c.width = 0; c.height = 0;
      await new Promise(r => setTimeout(r, 0));
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

  async function print(pages, cut) {
    await PH.render.fontsReady();
    const area = document.getElementById('printArea');
    area.innerHTML = '';
    pages.forEach(hooks => {
      const img = new Image();
      img.className = 'print-page';
      img.src = PH.render.drawPage(hooks, DPI300, cut).toDataURL('image/jpeg', 0.92);
      area.appendChild(img);
    });
    setTimeout(() => window.print(), 300);
  }

  return { pdf, print, isNative };
})();
