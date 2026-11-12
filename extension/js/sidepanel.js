/**
 * DocDock Chrome Extension - Side Panel Application Controller
 * Fully CSP-compliant (No inline event handlers)
 * Reuses DocDock design system, IndexedDB local storage, in-browser engine, and Upload Assistant.
 */

// Application State
const appState = {
  currentTab: 'docs',
  allDocs: [],
  img2pdf: {
    files: [], // Array of { id, file, name, size, url, rotation }
    orientation: 'portrait',
    pageSize: 'fit',
    margin: 0,
    merge: true
  },
  compress: {
    file: null, // { file, name, size, buffer }
    level: 'recommended'
  },
  imgtools: {
    files: [] // Array of { id, file, name, size, url }
  },
  assistant: {
    currentTabId: null,
    fields: [],
    selectedFieldId: null
  }
};

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupDocsTab();
  setupImg2PdfTab();
  setupCompressTab();
  setupImgToolsTab();
  setupAssistantTab();
  await refreshDocsList();
});

// ================= TAB NAVIGATION =================
function setupNavigation() {
  const nav = document.getElementById('main-nav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav__btn');
      if (btn && btn.dataset.tab) {
        switchTab(btn.dataset.tab);
      }
    });
  }
}

function switchTab(tabId) {
  appState.currentTab = tabId;

  document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));
  document.querySelectorAll('.nav__btn').forEach((btn) => btn.classList.remove('active'));

  const activePane = document.getElementById(`tab-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);

  if (activePane) activePane.classList.add('active');
  if (activeBtn) activeBtn.classList.add('active');

  if (tabId === 'docs') {
    refreshDocsList();
  } else if (tabId === 'assistant') {
    scanActiveTabForUploads();
  }
}

// ================= TAB 1: MY DOCUMENTS (INDEXEDDB) =================
function setupDocsTab() {
  const dropzone = document.getElementById('docs-import-dropzone');
  const input = document.getElementById('docs-import-input');
  const browseBtn = document.getElementById('btn-browse-docs');
  const searchInput = document.getElementById('docs-search-input');
  const categoryFilter = document.getElementById('docs-category-filter');
  const clearAllBtn = document.getElementById('btn-clear-all-docs');
  const docsContainer = document.getElementById('docs-items-container');

  if (browseBtn && input) {
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.click();
    });
  }

  if (dropzone && input) {
    ['dragenter', 'dragover'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files) {
        importFilesToLibrary(e.dataTransfer.files);
      }
    });

    dropzone.addEventListener('click', () => {
      input.click();
    });

    input.addEventListener('change', (e) => {
      if (e.target.files) {
        importFilesToLibrary(e.target.files);
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => filterDocuments());
  }

  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => filterDocuments());
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => confirmClearAllDocs());
  }

  // Event delegation for document items
  if (docsContainer) {
    docsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const name = btn.dataset.name;

      if (action === 'download') {
        downloadDocument(id);
      } else if (action === 'rename') {
        renameDocumentPrompt(id, name);
      } else if (action === 'delete') {
        deleteDocumentItem(id);
      }
    });
  }
}

async function importFilesToLibrary(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;

  const targetCategory = document.getElementById('import-target-category').value || 'General';
  showOverlay('Importing documents...', 'Saving files to secure on-device IndexedDB storage');

  try {
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      let thumbnail = '';
      if (file.type.startsWith('image/')) {
        thumbnail = await window.DocDockEngine.generateThumbnail(file, file.type);
      }

      await window.DocDockDB.addDocument({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: buffer,
        category: targetCategory,
        thumbnail
      });
    }

    hideOverlay();
    showToast(`Successfully imported ${files.length} document(s) to My Docs!`);
    await refreshDocsList();
  } catch (err) {
    hideOverlay();
    console.error('Import error:', err);
    showToast('Failed to import: ' + err.message);
  }
}

async function refreshDocsList() {
  try {
    appState.allDocs = await window.DocDockDB.getAllDocuments();
    filterDocuments();
  } catch (err) {
    console.error('Failed to load documents:', err);
  }
}

function filterDocuments() {
  const query = (document.getElementById('docs-search-input')?.value || '').toLowerCase().trim();
  const category = document.getElementById('docs-category-filter')?.value || 'ALL';

  const filtered = appState.allDocs.filter((doc) => {
    const matchesQuery = !query || doc.name.toLowerCase().includes(query);
    const matchesCategory = category === 'ALL' || doc.category === category;
    return matchesQuery && matchesCategory;
  });

  renderDocsList(filtered);
}

function renderDocsList(docs) {
  const container = document.getElementById('docs-items-container');
  const countLabel = document.getElementById('docs-count-label');
  if (countLabel) {
    countLabel.textContent = `${docs.length} document${docs.length === 1 ? '' : 's'} stored`;
  }

  if (!container) return;

  if (docs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        No documents found. Drag & drop PDF or image files above to securely store them locally.
      </div>
    `;
    return;
  }

  container.innerHTML = docs
    .map(
      (doc) => `
    <div class="doc-item" id="doc-${doc.id}">
      <div class="doc-item__icon">
        ${
          doc.thumbnail
            ? `<img src="${doc.thumbnail}" alt="Thumbnail">`
            : doc.type.includes('pdf')
            ? 'PDF'
            : 'IMG'
        }
      </div>
      <div class="doc-item__info">
        <div class="doc-item__name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</div>
        <div class="doc-item__meta">
          <span class="category-tag category-tag--${escapeHtml(doc.category)}">${escapeHtml(doc.category)}</span>
          <span>${formatBytes(doc.size)}</span>
          <span>•</span>
          <span>${new Date(doc.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div class="doc-item__actions">
        <button type="button" class="icon-btn" data-action="download" data-id="${doc.id}" title="Download file">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
        <button type="button" class="icon-btn" data-action="rename" data-id="${doc.id}" data-name="${escapeAttr(doc.name)}" title="Rename">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button type="button" class="icon-btn icon-btn--delete" data-action="delete" data-id="${doc.id}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  `
    )
    .join('');
}

async function downloadDocument(id) {
  try {
    const doc = await window.DocDockDB.getDocument(id);
    if (!doc || !doc.data) return showToast('Document data unavailable');

    const blob = new Blob([doc.data], { type: doc.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${doc.name}`);
  } catch (err) {
    showToast('Download error: ' + err.message);
  }
}

async function renameDocumentPrompt(id, currentName) {
  const newName = prompt('Enter new document name:', currentName);
  if (newName && newName.trim() && newName !== currentName) {
    await window.DocDockDB.updateDocument(id, { name: newName.trim() });
    showToast('Document renamed.');
    await refreshDocsList();
  }
}

async function deleteDocumentItem(id) {
  if (confirm('Delete this document from local storage?')) {
    await window.DocDockDB.deleteDocument(id);
    showToast('Document deleted.');
    await refreshDocsList();
  }
}

async function confirmClearAllDocs() {
  if (confirm('Are you sure you want to delete ALL documents stored in DocDock? This cannot be undone.')) {
    await window.DocDockDB.clearAllDocuments();
    showToast('All documents cleared.');
    await refreshDocsList();
  }
}

// ================= TAB 2: JPG TO PDF =================
function setupImg2PdfTab() {
  const dropzone = document.getElementById('img2pdf-dropzone');
  const input = document.getElementById('img2pdf-file-input');
  const selectBtn = document.getElementById('btn-select-img');
  const addMoreInput = document.getElementById('img2pdf-add-more');
  const addMoreBtn = document.getElementById('btn-add-more-img');
  const clearBtn = document.getElementById('btn-clear-img');
  const convertBtn = document.getElementById('btn-convert-img2pdf');
  const grid = document.getElementById('img2pdf-grid');
  const orientationBox = document.getElementById('orientation-cards');
  const marginBox = document.getElementById('margin-cards');

  if (selectBtn && input) {
    selectBtn.addEventListener('click', () => input.click());
  }

  if (addMoreBtn && addMoreInput) {
    addMoreBtn.addEventListener('click', () => addMoreInput.click());
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => clearToolImages());
  }

  if (convertBtn) {
    convertBtn.addEventListener('click', () => executeImageToPdf());
  }

  if (dropzone && input) {
    ['dragenter', 'dragover'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files) {
        handleToolImages(e.dataTransfer.files);
      }
    });

    input.addEventListener('change', (e) => {
      if (e.target.files) handleToolImages(e.target.files);
    });

    if (addMoreInput) {
      addMoreInput.addEventListener('change', (e) => {
        if (e.target.files) handleToolImages(e.target.files);
      });
    }
  }

  // Orientation selector
  if (orientationBox) {
    orientationBox.addEventListener('click', (e) => {
      const card = e.target.closest('[data-orientation]');
      if (card) {
        setToolOrientation(card.dataset.orientation);
      }
    });
  }

  // Margin selector
  if (marginBox) {
    marginBox.addEventListener('click', (e) => {
      const card = e.target.closest('[data-margin]');
      if (card) {
        setToolMargin(Number(card.dataset.margin));
      }
    });
  }

  // Grid actions (rotate, remove)
  if (grid) {
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'rotate') {
        rotateToolImage(id);
      } else if (action === 'remove') {
        removeToolImage(id);
      }
    });
  }
}

function handleToolImages(fileList) {
  const images = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
  if (images.length === 0) return alert('Please select valid image files (JPG, PNG, WebP).');

  images.forEach((file) => {
    appState.img2pdf.files.push({
      id: 'img_' + Math.random().toString(36).substr(2, 8),
      file,
      name: file.name,
      size: formatBytes(file.size),
      url: URL.createObjectURL(file),
      rotation: 0
    });
  });

  renderToolImages();
  document.getElementById('img2pdf-hero').style.display = 'none';
  document.getElementById('img2pdf-workspace').style.display = 'flex';
}

function renderToolImages() {
  const grid = document.getElementById('img2pdf-grid');
  const countSpan = document.getElementById('img2pdf-count');
  const files = appState.img2pdf.files;
  if (countSpan) countSpan.textContent = `${files.length} image(s)`;

  if (files.length === 0) {
    document.getElementById('img2pdf-hero').style.display = 'block';
    document.getElementById('img2pdf-workspace').style.display = 'none';
    return;
  }

  if (grid) {
    grid.innerHTML = files
      .map(
        (item) => `
      <div class="img-card">
        <div class="img-card__preview">
          <img id="img-thumb-${item.id}" src="${item.url}" alt="${escapeHtml(item.name)}" style="transform: rotate(${item.rotation}deg);">
        </div>
        <div class="img-card__name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="img-card__actions">
          <button type="button" class="btn btn--secondary btn--xs" data-action="rotate" data-id="${item.id}">↻ 90°</button>
          <button type="button" class="btn btn--ghost btn--xs" data-action="remove" data-id="${item.id}">✕</button>
        </div>
      </div>
    `
      )
      .join('');
  }
}

function rotateToolImage(id) {
  const item = appState.img2pdf.files.find((f) => f.id === id);
  if (!item) return;
  item.rotation = (item.rotation + 90) % 360;
  const el = document.getElementById(`img-thumb-${id}`);
  if (el) el.style.transform = `rotate(${item.rotation}deg)`;
}

function removeToolImage(id) {
  const idx = appState.img2pdf.files.findIndex((f) => f.id === id);
  if (idx !== -1) {
    URL.revokeObjectURL(appState.img2pdf.files[idx].url);
    appState.img2pdf.files.splice(idx, 1);
    renderToolImages();
  }
}

function clearToolImages() {
  appState.img2pdf.files.forEach((f) => URL.revokeObjectURL(f.url));
  appState.img2pdf.files = [];
  renderToolImages();
}

function setToolOrientation(orientation) {
  appState.img2pdf.orientation = orientation;
  document.querySelectorAll('#orientation-cards [data-orientation]').forEach((el) => {
    el.classList.toggle('active', el.dataset.orientation === orientation);
  });
}

function setToolMargin(margin) {
  appState.img2pdf.margin = margin;
  document.querySelectorAll('#margin-cards [data-margin]').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.margin) === margin);
  });
}

async function executeImageToPdf() {
  const files = appState.img2pdf.files;
  if (files.length === 0) return;

  const pageSize = document.getElementById('tool-pagesize').value;
  const merge = document.getElementById('tool-merge').checked;
  const saveToLibrary = document.getElementById('tool-save-to-library').checked;

  showOverlay('Converting to PDF...', 'Rendering pages and embedding images locally');

  try {
    const result = await window.DocDockEngine.clientConvertImagesToPdf(files, {
      orientation: appState.img2pdf.orientation,
      pageSize,
      margin: appState.img2pdf.margin,
      merge
    });

    hideOverlay();

    if (merge && result.mergedBuffer) {
      const filename = `docdock_images_${Date.now()}.pdf`;
      const blob = new Blob([result.mergedBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      if (saveToLibrary) {
        await window.DocDockDB.addDocument({
          name: filename,
          type: 'application/pdf',
          size: result.mergedBuffer.byteLength,
          data: result.mergedBuffer,
          category: 'General'
        });
        showToast('PDF created, downloaded, and saved to My Docs!');
      } else {
        showToast('PDF successfully created and downloaded!');
      }
    } else if (result.files) {
      for (const f of result.files) {
        const blob = new Blob([f.buffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(url);

        if (saveToLibrary) {
          await window.DocDockDB.addDocument({
            name: f.name,
            type: 'application/pdf',
            size: f.buffer.byteLength,
            data: f.buffer,
            category: 'General'
          });
        }
      }
      showToast(`Created and downloaded ${result.files.length} PDFs!`);
    }
  } catch (err) {
    hideOverlay();
    alert('Conversion error: ' + err.message);
  }
}

// ================= TAB 3: COMPRESS PDF =================
function setupCompressTab() {
  const dropzone = document.getElementById('compress-dropzone');
  const input = document.getElementById('compress-file-input');
  const selectBtn = document.getElementById('btn-select-pdf');
  const clearBtn = document.getElementById('btn-clear-compress-file');
  const compressBtn = document.getElementById('btn-compress-pdf');
  const tiersContainer = document.getElementById('compression-tiers');

  if (selectBtn && input) {
    selectBtn.addEventListener('click', () => input.click());
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => clearToolCompress());
  }

  if (compressBtn) {
    compressBtn.addEventListener('click', () => executeCompressPdf());
  }

  if (dropzone && input) {
    ['dragenter', 'dragover'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleCompressPdfFile(e.dataTransfer.files[0]);
      }
    });

    input.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleCompressPdfFile(e.target.files[0]);
      }
    });
  }

  if (tiersContainer) {
    tiersContainer.addEventListener('click', (e) => {
      const card = e.target.closest('[data-tier]');
      if (card) {
        setCompressionTier(card.dataset.tier);
      }
    });
  }
}

async function handleCompressPdfFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    return alert('Please select a valid PDF file.');
  }

  const buffer = await file.arrayBuffer();
  appState.compress.file = {
    file,
    name: file.name,
    size: file.size,
    buffer
  };

  document.getElementById('compress-name').textContent = file.name;
  document.getElementById('compress-size').textContent = formatBytes(file.size);

  document.getElementById('compress-hero').style.display = 'none';
  document.getElementById('compress-workspace').style.display = 'flex';
}

function clearToolCompress() {
  appState.compress.file = null;
  document.getElementById('compress-hero').style.display = 'block';
  document.getElementById('compress-workspace').style.display = 'none';
}

function setCompressionTier(tier) {
  appState.compress.level = tier;
  document.querySelectorAll('#compression-tiers .radio-card').forEach((card) => {
    const input = card.querySelector('input');
    const isTarget = card.dataset.tier === tier;
    card.classList.toggle('active', isTarget);
    if (input) input.checked = isTarget;
  });
}

async function executeCompressPdf() {
  if (!appState.compress.file) return;

  const saveToLibrary = document.getElementById('compress-save-to-library').checked;
  showOverlay('Compressing PDF...', 'Downsampling embedded images and deflating streams');

  try {
    const result = await window.DocDockEngine.clientCompressPdf(
      appState.compress.file.buffer,
      appState.compress.level
    );

    hideOverlay();

    const filename = `${appState.compress.file.name.replace(/\.pdf$/i, '')}_compressed.pdf`;
    const blob = new Blob([result.compressedBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    if (saveToLibrary) {
      await window.DocDockDB.addDocument({
        name: filename,
        type: 'application/pdf',
        size: result.compressedBuffer.byteLength,
        data: result.compressedBuffer,
        category: 'General'
      });
    }

    showToast(
      `Compressed by ${result.savingsPercent}%! (Saved ${formatBytes(result.savedBytes)})`
    );
  } catch (err) {
    hideOverlay();
    alert('Compression error: ' + err.message);
  }
}

// ================= TAB 4: IMAGE TOOLS (COMPRESS & CONVERT) =================
function setupImgToolsTab() {
  const dropzone = document.getElementById('imgtools-dropzone');
  const input = document.getElementById('imgtools-file-input');
  const selectBtn = document.getElementById('btn-select-imgtools');
  const addMoreInput = document.getElementById('imgtools-add-more');
  const addMoreBtn = document.getElementById('btn-add-more-imgtools');
  const clearBtn = document.getElementById('btn-clear-imgtools');
  const processBtn = document.getElementById('btn-process-imgtools');
  const grid = document.getElementById('imgtools-grid');

  if (selectBtn && input) {
    selectBtn.addEventListener('click', () => input.click());
  }

  if (addMoreBtn && addMoreInput) {
    addMoreBtn.addEventListener('click', () => addMoreInput.click());
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => clearToolImgTools());
  }

  if (processBtn) {
    processBtn.addEventListener('click', () => executeProcessImgTools());
  }

  if (dropzone && input) {
    ['dragenter', 'dragover'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files) {
        handleToolImgToolsFiles(e.dataTransfer.files);
      }
    });

    input.addEventListener('change', (e) => {
      if (e.target.files) handleToolImgToolsFiles(e.target.files);
    });

    if (addMoreInput) {
      addMoreInput.addEventListener('change', (e) => {
        if (e.target.files) handleToolImgToolsFiles(e.target.files);
      });
    }
  }

  if (grid) {
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="remove"]');
      if (btn && btn.dataset.id) {
        removeToolImgTools(btn.dataset.id);
      }
    });
  }
}

function handleToolImgToolsFiles(fileList) {
  const images = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
  if (images.length === 0) return alert('Please select valid image files.');

  images.forEach((file) => {
    appState.imgtools.files.push({
      id: 'imgtool_' + Math.random().toString(36).substr(2, 8),
      file,
      name: file.name,
      size: formatBytes(file.size),
      url: URL.createObjectURL(file)
    });
  });

  renderToolImgTools();
  document.getElementById('imgtools-hero').style.display = 'none';
  document.getElementById('imgtools-workspace').style.display = 'flex';
}

function renderToolImgTools() {
  const grid = document.getElementById('imgtools-grid');
  const countSpan = document.getElementById('imgtools-count');
  const files = appState.imgtools.files;
  if (countSpan) countSpan.textContent = `${files.length} image(s) selected`;

  if (files.length === 0) {
    document.getElementById('imgtools-hero').style.display = 'block';
    document.getElementById('imgtools-workspace').style.display = 'none';
    return;
  }

  if (grid) {
    grid.innerHTML = files
      .map(
        (item) => `
      <div class="img-card">
        <div class="img-card__preview">
          <img src="${item.url}" alt="${escapeHtml(item.name)}">
        </div>
        <div class="img-card__name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div style="font-size: 10px; color: var(--text-muted);">${item.size}</div>
        <div class="img-card__actions">
          <span style="font-size: 10px; font-weight: 600; color: var(--primary); text-transform: uppercase;">Ready</span>
          <button type="button" class="btn btn--ghost btn--xs" data-action="remove" data-id="${item.id}">✕</button>
        </div>
      </div>
    `
      )
      .join('');
  }
}

function removeToolImgTools(id) {
  const idx = appState.imgtools.files.findIndex((f) => f.id === id);
  if (idx !== -1) {
    URL.revokeObjectURL(appState.imgtools.files[idx].url);
    appState.imgtools.files.splice(idx, 1);
    renderToolImgTools();
  }
}

function clearToolImgTools() {
  appState.imgtools.files.forEach((f) => URL.revokeObjectURL(f.url));
  appState.imgtools.files = [];
  renderToolImgTools();
}

async function executeProcessImgTools() {
  const files = appState.imgtools.files;
  if (files.length === 0) return;

  const format = document.getElementById('imgtools-format')?.value || 'jpeg';
  const quality = parseFloat(document.getElementById('imgtools-quality')?.value || '0.70');
  const resizeVal = document.getElementById('imgtools-resize')?.value || 'original';
  const maxDimension = resizeVal === 'original' ? null : parseInt(resizeVal, 10);
  const saveToLibrary = document.getElementById('imgtools-save-to-library')?.checked;

  showOverlay('Processing images...', 'Compressing and converting formats locally in browser');

  let totalOriginal = 0;
  let totalNew = 0;

  try {
    for (const item of files) {
      const result = await window.DocDockEngine.clientCompressAndConvertImage(item.file, {
        format,
        quality,
        maxDimension
      });

      totalOriginal += result.originalSize;
      totalNew += result.newSize;

      // Download converted/compressed image
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);

      if (saveToLibrary) {
        await window.DocDockDB.addDocument({
          name: result.filename,
          type: result.mimeType,
          size: result.newSize,
          data: result.buffer,
          category: 'General'
        });
      }
    }

    hideOverlay();
    const overallSaved = Math.max(0, totalOriginal - totalNew);
    const overallPercent = totalOriginal > 0 ? Math.round((overallSaved / totalOriginal) * 1000) / 10 : 0;

    showToast(
      `Converted & compressed ${files.length} image(s)! Reduced by ${overallPercent}% (${formatBytes(overallSaved)} saved).`
    );
  } catch (err) {
    hideOverlay();
    alert('Image processing error: ' + err.message);
  }
}

// ================= TAB 5: WEBSITE UPLOAD ASSISTANT =================
function setupAssistantTab() {
  const scanBtn = document.getElementById('btn-scan-uploads');
  const fieldsContainer = document.getElementById('detected-fields-list');
  const closeBtn = document.getElementById('btn-close-picker');
  const cancelBtn = document.getElementById('btn-cancel-picker');
  const backdrop = document.getElementById('picker-backdrop');
  const pickerList = document.getElementById('picker-docs-list');

  if (scanBtn) {
    scanBtn.addEventListener('click', () => scanActiveTabForUploads());
  }

  [closeBtn, cancelBtn, backdrop].forEach((el) => {
    if (el) {
      el.addEventListener('click', () => closePickerModal());
    }
  });

  if (fieldsContainer) {
    fieldsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="open-picker"]');
      if (btn) {
        openPickerModal(btn.dataset.fieldId, btn.dataset.label);
      }
    });
  }

  if (pickerList) {
    pickerList.addEventListener('click', (e) => {
      const item = e.target.closest('[data-action="select-doc"]');
      if (item) {
        selectDocForUpload(item.dataset.docId);
      }
    });
  }
}

async function scanActiveTabForUploads() {
  const container = document.getElementById('detected-fields-list');
  const targetInfo = document.getElementById('assistant-target-info');
  if (!container) return;

  container.innerHTML = '<div class="empty-state">Scanning active tab for upload fields...</div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      container.innerHTML = '<div class="empty-state">No active browser tab found.</div>';
      return;
    }

    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('https://chromewebstore.google.com'))) {
      container.innerHTML = `
        <div class="empty-state">
          Upload assistant cannot run on protected browser internal pages. Navigate to any website to scan for upload fields.
        </div>
      `;
      if (targetInfo) targetInfo.style.display = 'none';
      return;
    }

    appState.assistant.currentTabId = tab.id;
    if (targetInfo) targetInfo.style.display = 'block';
    document.getElementById('target-page-title').textContent = tab.title || 'Active Webpage';
    document.getElementById('target-page-url').textContent = tab.url || '';

    let response = null;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_FIELDS' });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content_script.js']
      });
      response = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_FIELDS' });
    }

    if (!response || !response.fields) {
      container.innerHTML = '<div class="empty-state">No response from page.</div>';
      return;
    }

    appState.assistant.fields = response.fields;
    renderDetectedFields(response.fields);
  } catch (err) {
    console.error('Scan error:', err);
    container.innerHTML = `
      <div class="empty-state">
        Could not inspect current tab: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

function renderDetectedFields(fields) {
  const container = document.getElementById('detected-fields-list');
  if (!container) return;

  if (fields.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        No &lt;input type="file"&gt; fields detected on this page.<br>
        Navigate to a page with an upload form or refresh and scan again.
      </div>
    `;
    return;
  }

  container.innerHTML = fields
    .map(
      (f) => `
    <div class="field-card">
      <div class="field-card__header">
        <div class="field-card__label">${escapeHtml(f.label)}</div>
        <span class="field-badge ${f.accept ? 'field-badge--accept' : ''}">
          ${f.accept ? escapeHtml(f.accept) : 'Any format'}
        </span>
      </div>
      <div class="field-card__details">
        <span>Field: <code>${escapeHtml(f.name || f.id || 'input[file]')}</code></span>
        ${f.hasFiles ? `<span>• (Contains ${f.currentFilesCount} file)</span>` : ''}
      </div>
      <div class="field-card__actions">
        <button type="button" class="btn btn--primary btn--sm btn--full" data-action="open-picker" data-field-id="${f.fieldId}" data-label="${escapeAttr(f.label)}">
          Fill with DocDock Doc &rarr;
        </button>
      </div>
    </div>
  `
    )
    .join('');
}

async function openPickerModal(fieldId, fieldLabel) {
  appState.assistant.selectedFieldId = fieldId;
  const labelEl = document.getElementById('picker-field-label');
  if (labelEl) labelEl.textContent = `Target: ${fieldLabel}`;

  const listEl = document.getElementById('picker-docs-list');
  const docs = await window.DocDockDB.getAllDocuments();

  if (!listEl) return;

  if (docs.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        No documents in DocDock library.<br>
        Please add files under <strong>My Docs</strong> first.
      </div>
    `;
  } else {
    listEl.innerHTML = docs
      .map(
        (doc) => `
      <div class="picker-item" data-action="select-doc" data-doc-id="${doc.id}">
        <div>
          <div class="picker-item__name">${escapeHtml(doc.name)}</div>
          <div class="picker-item__meta">${escapeHtml(doc.category)} • ${formatBytes(doc.size)}</div>
        </div>
        <button type="button" class="btn btn--secondary btn--xs">Select</button>
      </div>
    `
      )
      .join('');
  }

  document.getElementById('picker-modal').style.display = 'flex';
}

function closePickerModal() {
  const modal = document.getElementById('picker-modal');
  if (modal) modal.style.display = 'none';
}

async function selectDocForUpload(docId) {
  closePickerModal();
  const fieldId = appState.assistant.selectedFieldId;
  const tabId = appState.assistant.currentTabId;

  if (!fieldId || !tabId) return showToast('Upload target missing.');

  showOverlay('Filling field...', 'Transmitting file securely to website upload input');

  try {
    const doc = await window.DocDockDB.getDocument(docId);
    if (!doc || !doc.data) throw new Error('Document binary data unavailable');

    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'FILL_FIELD',
      fieldId,
      fileData: {
        name: doc.name,
        type: doc.type,
        buffer: doc.data
      }
    });

    hideOverlay();

    if (response && response.success) {
      showToast(`Field successfully filled with "${doc.name}"!`);
      scanActiveTabForUploads();
    } else {
      showToast('Automated fill restricted by page. Downloaded file for manual selection.');
      downloadDocument(docId);
    }
  } catch (err) {
    hideOverlay();
    console.error('Fill field error:', err);
    showToast('Fill error: ' + err.message);
  }
}

// ================= UTILITIES =================
function showOverlay(title, desc) {
  const titleEl = document.getElementById('overlay-title');
  const descEl = document.getElementById('overlay-desc');
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideOverlay() {
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.style.display = 'none';
}

function showToast(message, duration = 3500) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  if (!toast || !toastMsg) return;
  toastMsg.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
