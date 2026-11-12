/**
 * DocDock Chrome Extension - Website Upload Assistant Content Script
 * Scans active webpage for file upload fields and securely assists in populating them
 * without ever automatically submitting forms.
 */

// Inject temporary styling for highlight badge
function injectHighlightStyles() {
  if (document.getElementById('docdock-highlight-styles')) return;
  const style = document.createElement('style');
  style.id = 'docdock-highlight-styles';
  style.textContent = `
    @keyframes docdock-pulse {
      0% { box-shadow: 0 0 0 0 rgba(229, 50, 45, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(229, 50, 45, 0); }
      100% { box-shadow: 0 0 0 0 rgba(229, 50, 45, 0); }
    }
    .docdock-highlighted-field {
      outline: 3px solid #e5322d !important;
      outline-offset: 3px !important;
      animation: docdock-pulse 1.5s infinite !important;
      transition: outline 0.3s ease !important;
    }
    .docdock-field-badge {
      position: absolute;
      background: #e5322d;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 3px 8px;
      border-radius: 4px;
      z-index: 999999;
      pointer-events: none;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 4px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Find nearby descriptive label text for an input element
 */
function findFieldLabel(input) {
  // 1. Check for explicit <label for="id">
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label && label.textContent.trim()) {
      return label.textContent.trim().replace(/\s+/g, ' ');
    }
  }

  // 2. Check for parent <label>
  const parentLabel = input.closest('label');
  if (parentLabel && parentLabel.textContent.trim()) {
    // Clone and remove the input text itself
    const clone = parentLabel.cloneNode(true);
    const innerInput = clone.querySelector('input');
    if (innerInput) innerInput.remove();
    const text = clone.textContent.trim().replace(/\s+/g, ' ');
    if (text) return text;
  }

  // 3. Check aria-label or placeholder
  if (input.getAttribute('aria-label')) {
    return input.getAttribute('aria-label').trim();
  }
  if (input.getAttribute('placeholder')) {
    return input.getAttribute('placeholder').trim();
  }
  if (input.getAttribute('title')) {
    return input.getAttribute('title').trim();
  }

  // 4. Check preceding heading or label text in parent container
  const container = input.closest('.form-group, .form-row, .field, .upload-container, .dropzone, div, section');
  if (container) {
    const headings = container.querySelectorAll('label, h1, h2, h3, h4, h5, h6, .label, .title, p');
    for (const h of headings) {
      if (h.textContent.trim() && !h.contains(input)) {
        return h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80);
      }
    }
  }

  return input.name || input.id || 'Upload Field';
}

/**
 * Scan webpage for all available file upload inputs
 */
function scanUploadFields() {
  injectHighlightStyles();
  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  const fields = [];

  fileInputs.forEach((input, index) => {
    const fieldId = `docdock-field-${index}`;
    input.dataset.docdockId = fieldId;

    const label = findFieldLabel(input);
    const accept = input.getAttribute('accept') || '';
    const multiple = input.hasAttribute('multiple');
    const isVisible = input.offsetWidth > 0 && input.offsetHeight > 0;
    const hasFiles = input.files && input.files.length > 0;

    fields.push({
      fieldId,
      index,
      label,
      name: input.name || '',
      id: input.id || '',
      accept,
      multiple,
      isVisible,
      hasFiles,
      currentFilesCount: input.files ? input.files.length : 0
    });
  });

  return fields;
}

/**
 * Fill a targeted file field using standard DataTransfer
 */
function fillUploadField(fieldId, fileData) {
  injectHighlightStyles();
  const input = document.querySelector(`input[data-docdock-id="${CSS.escape(fieldId)}"]`);
  if (!input) {
    return { success: false, error: 'Field element not found on page.' };
  }

  try {
    // Construct real File from raw ArrayBuffer
    const uint8Array = new Uint8Array(fileData.buffer);
    const file = new File([uint8Array], fileData.name, {
      type: fileData.type || 'application/pdf',
      lastModified: Date.now()
    });

    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;

    // Dispatch DOM events so client framework (React, Vue, Angular, native) notices the change
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Highlight target element or its visible container
    let highlightTarget = input;
    if (input.offsetWidth === 0 || input.offsetHeight === 0) {
      // Input is hidden, find its visible button/dropzone wrapper
      const wrapper = input.closest('label, .dropzone, .upload-area, div');
      if (wrapper) highlightTarget = wrapper;
    }

    highlightTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightTarget.classList.add('docdock-highlighted-field');

    // Remove highlight after 4 seconds
    setTimeout(() => {
      highlightTarget.classList.remove('docdock-highlighted-field');
    }, 4000);

    return {
      success: true,
      fileName: fileData.name,
      fieldId,
      label: findFieldLabel(input)
    };
  } catch (err) {
    console.error('DocDock fill error:', err);
    return { success: false, error: err.message, fallback: true };
  }
}

// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SCAN_FIELDS') {
    const fields = scanUploadFields();
    sendResponse({ success: true, fields, url: window.location.href, title: document.title });
    return true;
  }

  if (request.action === 'FILL_FIELD') {
    const result = fillUploadField(request.fieldId, request.fileData);
    sendResponse(result);
    return true;
  }

  return false;
});
