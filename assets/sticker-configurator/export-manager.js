/* ===========================================
   ExportManager — PDF export via dynamic jsPDF import
   =========================================== */

class ExportManager {
  constructor(core) {
    this.core = core;
    this._libraryPromise = null;
  }

  ensureLibrary() {
    var core = this.core;
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (this._libraryPromise) return this._libraryPromise;

    this._libraryPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = core.dataset.jspdfUrl;
      script.async = true;
      script.onload = function () {
        if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
        else reject(new Error('PDF library did not initialize.'));
      };
      script.onerror = function () { reject(new Error('Could not load the PDF library.')); };
      document.body.appendChild(script);
    });
    return this._libraryPromise;
  }

  async buildPdfBlob() {
    var core = this.core;
    var jsPDF = await this.ensureLibrary();
    var widthMm = core.CANVAS_W;
    var heightMm = core.CANVAS_H;
    var dpi = Math.max(150, Math.min(300, Number(core.dataset.exportDpi) || 300));
    var doc = new jsPDF({
      orientation: widthMm >= heightMm ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [widthMm, heightMm],
      compress: true
    });
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var requestedRatio = widthMm / heightMm;
    var pageRatio = pageWidth / pageHeight;
    if (Math.abs(requestedRatio - pageRatio) > 0.001) {
      throw new Error('The PDF page dimensions do not match the workspace.');
    }

    // A uniformly scaled pixel budget prevents very tall sheets from exhausting
    // browser memory. Both axes always use the same scale, so artwork is never
    // stretched or compressed as the workspace height grows.
    var canvas = core.canvasRenderer.renderToCanvas({
      dpi: dpi,
      maxPixels: 45000000
    });
    if (!canvas) throw new Error('Production canvas could not be created.');
    var canvasRatio = canvas.width / canvas.height;
    if (Math.abs(requestedRatio - canvasRatio) > 0.002) {
      throw new Error('The production image dimensions do not match the workspace.');
    }
    var imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    return doc.output('blob');
  }

  async onExportPDF() {
    var core = this.core;
    core.dispatchExportEvent();
    try {
      var blob = await this.buildPdfBlob();
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'sticker-sheet-' + (core.state.projectId || 'design') + '.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (err) {
      core.modalManager.showErrorModal('Could not generate PDF. Error: ' + err.message);
    }
  }
}
