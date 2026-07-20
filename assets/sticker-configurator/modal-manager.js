/* ===========================================
   ModalManager — All custom modals, focus trapping
   =========================================== */

class ModalManager {
  constructor(core) {
    this.core = core;
  }

  showAddDesignModal() {
    var core = this.core;
    core.state.modalFile = null;
    var modalW = core.querySelector('#modal-w-' + core.sid);
    var modalH = core.querySelector('#modal-h-' + core.sid);
    var modalQty = core.querySelector('#modal-qty-' + core.sid);
    var modalAddBtn = core.querySelector('#modal-add-' + core.sid);
    var modalFname = core.querySelector('#modal-fname-' + core.sid);
    var modalZone = core.querySelector('#modal-zone-' + core.sid);
    if (modalW) modalW.value = 50;
    if (modalH) modalH.value = 50;
    if (modalQty) modalQty.value = 3;
    if (modalAddBtn) modalAddBtn.disabled = true;
    if (modalFname) { modalFname.style.display = 'none'; }
    if (modalZone) {
      var textEl = modalZone.querySelector('.cfg-modal-text');
      var iconEl = modalZone.querySelector('.cfg-modal-icon');
      if (textEl) textEl.textContent = 'Choose a file or drop it here';
      if (iconEl) {
        iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>';
      }
    }
    this.openModal(core.modalEl);
    if (core.fileInput) core.fileInput.value = '';
    this.trapFocus(core.modalEl);
  }

  openModal(modal) {
    if (!modal) return;
    if (typeof modal.showModal === 'function') {
      if (!modal.open) modal.showModal();
    } else {
      modal.style.display = 'flex';
    }
  }

  closeModal(modal) {
    if (!modal) return;
    if (typeof modal.close === 'function') {
      if (modal.open) modal.close();
    } else {
      modal.style.display = 'none';
    }
  }

  showEditTextModal(item, callback) {
    var curText = item.text || '';
    var curSize = item.fontSize || 16;
    var curColor = item.color || '#2D3436';
    var curBg = item.bgColor || '#ffffff';
    var curWeight = item.fontWeight || '';
    var curStyle = item.fontStyle || '';
    var curAlign = item.textAlign || 'center';

    // SECURITY FIX (V08): Use document.createElement + textContent instead of innerHTML
    var modal = this.createModal('');

    var box = document.createElement('div');
    box.className = 'cfg-modal-box';

    var titleRow = document.createElement('div');
    titleRow.className = 'cfg-modal-title-row';

    var title = document.createElement('h3');
    title.className = 'cfg-modal-title';
    title.textContent = 'Edit Text';
    titleRow.appendChild(title);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'cfg-modal-close';
    closeBtn.dataset.action = 'close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00D7';
    titleRow.appendChild(closeBtn);
    box.appendChild(titleRow);

    var textarea = document.createElement('textarea');
    textarea.className = 'cfg-et-text';
    textarea.dataset.field = 'text';
    textarea.value = curText;
    box.appendChild(textarea);

    var row1 = document.createElement('div');
    row1.className = 'cfg-et-row';

    // SIZE field
    var sizeField = this._createField('SIZE');
    var sizeInput = document.createElement('input');
    sizeInput.className = 'cfg-et-input';
    sizeInput.dataset.field = 'size';
    sizeInput.type = 'number';
    sizeInput.value = curSize;
    sizeInput.min = 8;
    sizeInput.max = 120;
    sizeField.appendChild(sizeInput);
    row1.appendChild(sizeField);

    // COLOR field
    var colorField = this._createField('COLOR');
    var colorInput = document.createElement('input');
    colorInput.className = 'cfg-et-input cfg-et-color';
    colorInput.dataset.field = 'color';
    colorInput.type = 'color';
    colorInput.value = curColor;
    colorField.appendChild(colorInput);
    row1.appendChild(colorField);

    // BG field
    var bgField = this._createField('BG');
    var bgInput = document.createElement('input');
    bgInput.className = 'cfg-et-input cfg-et-color';
    bgInput.dataset.field = 'bg';
    bgInput.type = 'color';
    bgInput.value = curBg;
    bgField.appendChild(bgInput);
    row1.appendChild(bgField);

    box.appendChild(row1);

    // Style toolbar
    var etToolbar = document.createElement('div');
    etToolbar.className = 'cfg-et-toolbar';

    var boldBtn = document.createElement('button');
    boldBtn.className = 'cfg-et-style-btn' + (curWeight === 'bold' ? ' active' : '');
    boldBtn.dataset.style = 'bold';
    boldBtn.setAttribute('aria-label', 'Bold');
    boldBtn.textContent = 'B';
    etToolbar.appendChild(boldBtn);

    var italicBtn = document.createElement('button');
    italicBtn.className = 'cfg-et-style-btn' + (curStyle === 'italic' ? ' active' : '');
    italicBtn.dataset.style = 'italic';
    italicBtn.setAttribute('aria-label', 'Italic');
    italicBtn.textContent = 'I';
    etToolbar.appendChild(italicBtn);

    var div = document.createElement('span');
    div.className = 'cfg-et-divider';
    etToolbar.appendChild(div);

    // Align buttons
    var aligns = ['left', 'center', 'right'];
    ['Align left', 'Align center', 'Align right'].forEach(function (label, i) {
      var alignBtn = document.createElement('button');
      alignBtn.className = 'cfg-et-align-btn' + (curAlign === aligns[i] ? ' active' : '');
      alignBtn.dataset.align = aligns[i];
      alignBtn.setAttribute('aria-label', label);
      // Simple text labels instead of inline SVG
      alignBtn.textContent = aligns[i] === 'left' ? '\u2261' : aligns[i] === 'center' ? '\u2261' : '\u2261';
      etToolbar.appendChild(alignBtn);
    });

    box.appendChild(etToolbar);

    // Actions
    var actions = document.createElement('div');
    actions.className = 'cfg-modal-actions';

    var cancelBtn2 = document.createElement('button');
    cancelBtn2.className = 'cfg-btn-sec';
    cancelBtn2.dataset.action = 'cancel';
    cancelBtn2.textContent = 'Cancel';
    actions.appendChild(cancelBtn2);

    var saveBtn = document.createElement('button');
    saveBtn.className = 'cfg-btn-pry';
    saveBtn.dataset.action = 'save';
    saveBtn.textContent = 'Save';
    actions.appendChild(saveBtn);

    box.appendChild(actions);
    modal.appendChild(box);

    // Event binding
    textarea.focus();
    textarea.select();

    boldBtn.addEventListener('click', function () {
      this.classList.toggle('active');
    });

    italicBtn.addEventListener('click', function () {
      this.classList.toggle('active');
    });

    // Close handlers
    closeBtn.addEventListener('click', function () { modal.remove(); });
    cancelBtn2.addEventListener('click', function () { modal.remove(); });

    saveBtn.addEventListener('click', function () {
      var data = {
        text: textarea.value.trim(),
        fontSize: parseInt(sizeInput.value) || 16,
        color: colorInput.value,
        bgColor: bgInput.value,
        fontWeight: boldBtn.classList.contains('active') ? 'bold' : '',
        fontStyle: italicBtn.classList.contains('active') ? 'italic' : '',
        textAlign: (function () {
          var ab = modal.querySelector('[data-align].active');
          return ab ? ab.dataset.align : 'center';
        })()
      };
      if (data.text) {
        callback(data);
        modal.remove();
      }
    });

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveBtn.click();
      }
      if (e.key === 'Escape') modal.remove();
    });

    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });

    this.trapFocus(modal);
  }

  _createField(labelText) {
    var field = document.createElement('div');
    field.className = 'cfg-et-field';
    var label = document.createElement('label');
    label.className = 'cfg-et-label';
    label.textContent = labelText;
    field.appendChild(label);
    return field;
  }

  showConfirmModal(msg, callback) {
    var modal = this.createModal('');

    var box = document.createElement('div');
    box.className = 'cfg-modal-box cfg-confirm-box';

    var p = document.createElement('p');
    p.className = 'cfg-confirm-text';
    p.textContent = msg;
    box.appendChild(p);

    var actions = document.createElement('div');
    actions.className = 'cfg-modal-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'cfg-btn-sec';
    cancelBtn.textContent = 'Cancel';
    actions.appendChild(cancelBtn);

    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'cfg-btn-danger';
    confirmBtn.textContent = 'OK';
    actions.appendChild(confirmBtn);

    box.appendChild(actions);
    modal.appendChild(box);

    cancelBtn.addEventListener('click', function () { modal.remove(); });
    confirmBtn.addEventListener('click', function () {
      callback();
      modal.remove();
    });

    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });

    this.trapFocus(modal);
  }

  showErrorModal(msg) {
    var modal = this.createModal('');

    var box = document.createElement('div');
    box.className = 'cfg-modal-box cfg-error-box';

    var p = document.createElement('p');
    p.className = 'cfg-error-text';
    p.textContent = msg;
    box.appendChild(p);

    var actions = document.createElement('div');
    actions.className = 'cfg-modal-actions';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'cfg-btn-pry';
    closeBtn.textContent = 'OK';
    actions.appendChild(closeBtn);

    box.appendChild(actions);
    modal.appendChild(box);

    closeBtn.addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });

    this.trapFocus(modal);
  }

  createModal(htmlStructure) {
    var modal = document.createElement('dialog');
    modal.className = 'cfg-modal';
    modal.dataset.dynamicModal = 'true';
    if (htmlStructure) {
      modal.innerHTML = htmlStructure;
    }
    document.body.appendChild(modal);
    this.openModal(modal);
    return modal;
  }

  trapFocus(container) {
    if (!container) return;
    var focusable = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    first.focus();
    if (container.dataset.focusTrapBound === 'true') return;
    container.dataset.focusTrapBound = 'true';

    var handler = function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (container === this.core.modalEl) {
          this.closeModal(container);
        } else {
          this.closeModal(container);
          container.remove();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handler.bind(this), { signal: this.core.abortController.signal });
  }
}
