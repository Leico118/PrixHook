# PrixHook

Générateur de balises de prix « hook » A4 (2 colonnes × 6 = 12 balises par page), hooks Black Friday, export PDF.

```
PrixHook/
├── .github/workflows/build.yml   # compilation APK (GitHub Actions + Capacitor)
├── capacitor.config.json
├── package.json                  # version = nom du fichier APK
└── www/
    ├── index.html
    ├── css/app.css               # interface
    ├── css/tags.css              # balises + page A4
    └── js/
        ├── pricing.js            # remise % auto
        ├── render.js             # hooks Black Friday + grille A4
        ├── export.js             # PDF (html2canvas + jsPDF), impression, partage Android
        └── app.js                # saisie, liste, import JSON, réglages, aperçu
```

Format d'import JSON :
```json
[{"name":"JBL Tune 735BT Noir 76h d'autonomie","sku":"15677945","oldPrice":79.95,"newPrice":49.95,"validity":"Offre valable du 20.11 au 31.12.2026","copies":1}]
```
