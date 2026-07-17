/* ===========================================
   ExportManager — PDF export via dynamic jsPDF import
   =========================================== */

class ExportManager {
  constructor(core) {
    this.core = core;
  }

  onExportPDF() {
    var core = this.core;
    core.dispatchExportEvent();

    // Dynamic script injection for jsPDF
    if (typeof window.jspdf === 'undefined') {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.async = true;
      script.onload = function () { core.exportManager.renderPDF(); };
      script.onerror = function () {
        core.modalManager.showErrorModal('Could not load PDF library. Check internet connection.');
      };
      document.body.appendChild(script);
    } else {
      this.renderPDF();
    }
  }

  renderPDF() {
    var core = this.core;
    try {
      var { jsPDF } = window.jspdf;
      var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [600, 400] });
      var canvas = core.canvasRenderer.renderToCanvas();
      if (canvas) {
        var imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 0, 0, 600, 400);
      }
      doc.save('sticker-sheet.pdf');
    } catch (err) {
      core.modalManager.showErrorModal('Could not generate PDF. Error: ' + err.message);
    }
  }
}
