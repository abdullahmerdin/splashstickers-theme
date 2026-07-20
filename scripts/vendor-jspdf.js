const fs = require('node:fs');
const path = require('node:path');

const source = require.resolve('jspdf/dist/jspdf.umd.min.js');
const destination = path.resolve(__dirname, '..', 'assets', 'jspdf.umd.min.js');

fs.copyFileSync(source, destination);
console.log(`Vendored jsPDF to ${destination}`);
