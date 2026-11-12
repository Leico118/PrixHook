/* PrixHook — chargement à la demande des bibliothèques (copie locale, sinon CDN) */
window.PH = window.PH || {};

PH.libs = (function () {
  const LIBS = {
    html2canvas: {
      test: () => window.html2canvas,
      local: 'vendor/html2canvas.min.js',
      cdn: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    },
    jspdf: {
      test: () => window.jspdf && window.jspdf.jsPDF,
      local: 'vendor/jspdf.umd.min.js',
      cdn: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    },
    pdfjs: {
      test: () => window.pdfjsLib,
      local: 'vendor/pdf.min.js',
      cdn: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      after(src) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = src.startsWith('http')
          ? 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
          : 'vendor/pdf.worker.min.js';
      }
    },
    tesseract: {
      test: () => window.Tesseract,
      local: 'vendor/tesseract.min.js',
      cdn: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
    }
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => { el.remove(); reject(new Error(src)); };
      document.head.appendChild(el);
    });
  }

  async function ensure(...names) {
    for (const name of names) {
      const lib = LIBS[name];
      if (lib.test()) continue;
      let used = null;
      for (const src of [lib.local, lib.cdn]) {
        try { await loadScript(src); } catch (e) { continue; }
        if (lib.test()) { used = src; break; }
      }
      if (!used) throw new Error('Module « ' + name + ' » introuvable : vérifie ta connexion internet.');
      if (lib.after) lib.after(used);
    }
  }

  return { ensure };
})();
