// DocDock State Management
const state = {
  activeTool: 'img2pdf',
  img2pdf: {
    files: [], // Array of { id, file, name, size, url, rotation }
    orientation: 'portrait',
    pageSize: 'fit',
    margin: 0,
    merge: true
  },
  compress: {
    file: null, // { file, name, size }
    level: 'recommended'
  },
  imgtools: {
    files: [] // Array of { id, file, name, size, url }
  }
};

// ================= TOOL SWITCHING =================
function switchTool(tool) {
  state.activeTool = tool;

  document.querySelectorAll('.tool-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav__btn').forEach(btn => btn.classList.remove('active'));

  if (tool === 'img2pdf') {
    document.getElementById('section-img2pdf').classList.add('active');
    document.getElementById('nav-img2pdf').classList.add('active');
  } else if (tool === 'compress') {
    document.getElementById('section-compress').classList.add('active');
    document.getElementById('nav-compress').classList.add('active');
  } else if (tool === 'imgtools') {
    document.getElementById('section-imgtools').classList.add('active');
    document.getElementById('nav-imgtools').classList.add('active');
  }
}

// ================= IMAGE TO PDF WORKFLOW =================
const imgInput = document.getElementById('img2pdf-file-input');
const imgAddMore = document.getElementById('img2pdf-add-more');
const imgDropzone = document.getElementById('img2pdf-dropzone');
const imgHero = document.getElementById('img2pdf-hero');
const imgWorkspace = document.getElementById('img2pdf-workspace');
const imgGrid = document.getElementById('img2pdf-grid');
const imgCountInfo = document.getElementById('img2pdf-count-info');

// Drag and drop listeners for hero dropzone
['dragenter', 'dragover'].forEach(eventName => {
  imgDropzone.addEventListener(eventName, e => {
    e.preventDefault();
    imgDropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  imgDropzone.addEventListener(eventName, e => {
    e.preventDefault();
    imgDropzone.classList.remove('dragover');
  });
});

imgDropzone.addEventListener('drop', e => {
  const dt = e.dataTransfer;
  if (dt.files && dt.files.length) {
    handleImageFiles(dt.files);
  }
});

imgInput.addEventListener('change', e => {
  if (e.target.files && e.target.files.length) {
    handleImageFiles(e.target.files);
  }
});

imgAddMore.addEventListener('change', e => {
  if (e.target.files && e.target.files.length) {
    handleImageFiles(e.target.files);
  }
});

function handleImageFiles(fileList) {
  const newFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (newFiles.length === 0) {
    alert('Please select valid image files (JPG, PNG, WebP, etc.).');
    return;
  }

  newFiles.forEach(file => {
    state.img2pdf.files.push({
      id: 'img_' + Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: formatBytes(file.size),
      url: URL.createObjectURL(file),
      rotation: 0
    });
  });

  renderImageCards();
  imgHero.style.display = 'none';
  imgWorkspace.style.display = 'flex';
}

function renderImageCards() {
  imgGrid.innerHTML = '';
  imgCountInfo.textContent = `${state.img2pdf.files.length} image(s) selected`;

  if (state.img2pdf.files.length === 0) {
    imgHero.style.display = 'flex';
    imgWorkspace.style.display = 'none';
    return;
  }

  state.img2pdf.files.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'img-card';
    card.innerHTML = `
      <div class="img-card__preview-wrap">
        <img class="img-card__img" id="img-el-${item.id}" src="${item.url}" alt="${item.name}" style="transform: rotate(${item.rotation}deg);">
      </div>
      <div class="img-card__meta">
        <div class="img-card__name" title="${item.name}">${index + 1}. ${item.name}</div>
        <div class="img-card__size">${item.size}</div>
      </div>
      <div class="img-card__actions">
        <button class="card-btn" onclick="rotateImage('${item.id}')" title="Rotate 90°">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          Rotate
        </button>
        <button class="card-btn card-btn--delete" onclick="removeImage('${item.id}')" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Delete
        </button>
      </div>
    `;
    imgGrid.appendChild(card);
  });
}

function rotateImage(id) {
  const item = state.img2pdf.files.find(f => f.id === id);
  if (!item) return;

  item.rotation = (item.rotation + 90) % 360;
  const imgEl = document.getElementById(`img-el-${id}`);
  if (imgEl) {
    imgEl.style.transform = `rotate(${item.rotation}deg)`;
  }
}

function removeImage(id) {
  const index = state.img2pdf.files.findIndex(f => f.id === id);
  if (index !== -1) {
    URL.revokeObjectURL(state.img2pdf.files[index].url);
    state.img2pdf.files.splice(index, 1);
    renderImageCards();
  }
}

function clearImages() {
  state.img2pdf.files.forEach(f => URL.revokeObjectURL(f.url));
  state.img2pdf.files = [];
  renderImageCards();
}

function setOrientation(orientation) {
  state.img2pdf.orientation = orientation;
  document.querySelectorAll('[data-orientation]').forEach(el => {
    el.classList.toggle('active', el.dataset.orientation === orientation);
  });
}

function setMargin(margin) {
  state.img2pdf.margin = margin;
  document.querySelectorAll('[data-margin]').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.margin) === margin);
  });
}

function updatePreviewLayout() {
  state.img2pdf.pageSize = document.getElementById('select-pagesize').value;
}

// Convert action
async function processImagesToPdf() {
  if (state.img2pdf.files.length === 0) return;

  showOverlay('Converting images to PDF...', 'Structuring pages and compiling document');

  const formData = new FormData();
  state.img2pdf.files.forEach(f => {
    formData.append('images', f.file, f.name);
  });

  const rotations = state.img2pdf.files.map(f => f.rotation);
  formData.append('rotations', JSON.stringify(rotations));
  formData.append('orientation', state.img2pdf.orientation);
  formData.append('pagesize', document.getElementById('select-pagesize').value);
  formData.append('margin', state.img2pdf.margin);
  formData.append('merge_after', document.getElementById('check-merge').checked);

  try {
    const res = await fetch('/api/image-to-pdf', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Conversion failed' }));
      throw new Error(err.error || 'Server error');
    }

    const isZip = !document.getElementById('check-merge').checked;
    const blob = await res.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const filename = isZip ? 'docdock_images.zip' : 'docdock_converted.pdf';

    hideOverlay();
    showResultModal({
      title: 'PDF successfully created!',
      desc: isZip ? 'Your individual PDF files are packaged into a ZIP archive.' : `Your PDF is ready with ${state.img2pdf.files.length} page(s).`,
      downloadUrl,
      filename,
      showStats: false
    });
  } catch (err) {
    hideOverlay();
    alert('Failed to convert: ' + err.message);
  }
}

// ================= PDF COMPRESSOR WORKFLOW =================
const compInput = document.getElementById('compress-file-input');
const compDropzone = document.getElementById('compress-dropzone');
const compHero = document.getElementById('compress-hero');
const compWorkspace = document.getElementById('compress-workspace');

['dragenter', 'dragover'].forEach(eventName => {
  compDropzone.addEventListener(eventName, e => {
    e.preventDefault();
    compDropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  compDropzone.addEventListener(eventName, e => {
    e.preventDefault();
    compDropzone.classList.remove('dragover');
  });
});

compDropzone.addEventListener('drop', e => {
  const dt = e.dataTransfer;
  if (dt.files && dt.files.length) {
    handleCompressFile(dt.files[0]);
  }
});

compInput.addEventListener('change', e => {
  if (e.target.files && e.target.files.length) {
    handleCompressFile(e.target.files[0]);
  }
});

function handleCompressFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    alert('Please select a valid PDF file.');
    return;
  }

  state.compress.file = file;
  document.getElementById('compress-file-name').textContent = file.name;
  document.getElementById('compress-file-size').textContent = formatBytes(file.size);

  compHero.style.display = 'none';
  compWorkspace.style.display = 'flex';
}

function clearCompressPdf() {
  state.compress.file = null;
  compInput.value = '';
  compHero.style.display = 'flex';
  compWorkspace.style.display = 'none';
}

function setCompressionLevel(level) {
  state.compress.level = level;
  document.querySelectorAll('.radio-card').forEach(card => {
    const input = card.querySelector('input');
    card.classList.toggle('active', input.value === level);
    input.checked = input.value === level;
  });
}

// Compress action
async function processCompressPdf() {
  if (!state.compress.file) return;

  showOverlay('Compressing PDF...', 'Downsampling embedded images and deflating streams');

  const formData = new FormData();
  formData.append('file', state.compress.file);
  formData.append('compression_level', state.compress.level);

  try {
    const res = await fetch('/api/compress-pdf', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Compression failed' }));
      throw new Error(err.error || 'Server error');
    }

    const origSize = Number(res.headers.get('X-Original-Size')) || state.compress.file.size;
    const compSize = Number(res.headers.get('X-Compressed-Size')) || 0;
    const savingsPercent = Number(res.headers.get('X-Savings-Percent')) || 0;

    const blob = await res.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const filename = `${state.compress.file.name.replace(/\.pdf$/i, '')}_compressed.pdf`;

    hideOverlay();
    showResultModal({
      title: 'PDF successfully compressed!',
      desc: savingsPercent > 0 
        ? `Your PDF file size was reduced by ${savingsPercent}%!` 
        : 'Your PDF has been optimized and deflated.',
      downloadUrl,
      filename,
      showStats: true,
      origSize: formatBytes(origSize),
      compSize: formatBytes(compSize || blob.size),
      savings: `-${savingsPercent}%`
    });
  } catch (err) {
    hideOverlay();
    alert('Failed to compress: ' + err.message);
  }
}

// ================= IMAGE COMPRESSOR & CONVERTER WORKFLOW =================
const imgToolsInput = document.getElementById('imgtools-file-input');
const imgToolsAddMore = document.getElementById('imgtools-add-more');
const imgToolsDropzone = document.getElementById('imgtools-dropzone');
const imgToolsHero = document.getElementById('imgtools-hero');
const imgToolsWorkspace = document.getElementById('imgtools-workspace');
const imgToolsGrid = document.getElementById('imgtools-grid');
const imgToolsCountInfo = document.getElementById('imgtools-count-info');

if (imgToolsDropzone) {
  ['dragenter', 'dragover'].forEach(eventName => {
    imgToolsDropzone.addEventListener(eventName, e => {
      e.preventDefault();
      imgToolsDropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    imgToolsDropzone.addEventListener(eventName, e => {
      e.preventDefault();
      imgToolsDropzone.classList.remove('dragover');
    });
  });

  imgToolsDropzone.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length) {
      handleImgToolsFiles(dt.files);
    }
  });
}

if (imgToolsInput) {
  imgToolsInput.addEventListener('change', e => {
    if (e.target.files && e.target.files.length) {
      handleImgToolsFiles(e.target.files);
    }
  });
}

if (imgToolsAddMore) {
  imgToolsAddMore.addEventListener('change', e => {
    if (e.target.files && e.target.files.length) {
      handleImgToolsFiles(e.target.files);
    }
  });
}

function handleImgToolsFiles(fileList) {
  const newFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (newFiles.length === 0) {
    alert('Please select valid image files (JPG, PNG, WebP, etc.).');
    return;
  }

  newFiles.forEach(file => {
    state.imgtools.files.push({
      id: 'imgtool_' + Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: formatBytes(file.size),
      url: URL.createObjectURL(file)
    });
  });

  renderImgToolsCards();
  imgToolsHero.style.display = 'none';
  imgToolsWorkspace.style.display = 'flex';
}

function renderImgToolsCards() {
  imgToolsGrid.innerHTML = '';
  imgToolsCountInfo.textContent = `${state.imgtools.files.length} image(s) selected`;

  if (state.imgtools.files.length === 0) {
    imgToolsHero.style.display = 'flex';
    imgToolsWorkspace.style.display = 'none';
    return;
  }

  state.imgtools.files.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'img-card';
    card.innerHTML = `
      <div class="img-card__preview-wrap">
        <img class="img-card__img" src="${item.url}" alt="${item.name}">
      </div>
      <div class="img-card__meta">
        <div class="img-card__name" title="${item.name}">${index + 1}. ${item.name}</div>
        <div class="img-card__size">${item.size}</div>
      </div>
      <div class="img-card__actions">
        <span style="font-size: 11px; font-weight: 600; color: var(--primary);">Ready</span>
        <button class="card-btn card-btn--delete" onclick="removeImgToolsImage('${item.id}')" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Delete
        </button>
      </div>
    `;
    imgToolsGrid.appendChild(card);
  });
}

function removeImgToolsImage(id) {
  const index = state.imgtools.files.findIndex(f => f.id === id);
  if (index !== -1) {
    URL.revokeObjectURL(state.imgtools.files[index].url);
    state.imgtools.files.splice(index, 1);
    renderImgToolsCards();
  }
}

function clearImgToolsImages() {
  state.imgtools.files.forEach(f => URL.revokeObjectURL(f.url));
  state.imgtools.files = [];
  renderImgToolsCards();
}

async function processImgToolsImages() {
  if (state.imgtools.files.length === 0) return;

  const format = document.getElementById('select-imgtools-format').value;
  const quality = document.getElementById('select-imgtools-quality').value;
  const resize = document.getElementById('select-imgtools-resize').value;

  showOverlay('Processing images...', 'Compressing and converting format');

  const formData = new FormData();
  state.imgtools.files.forEach(f => {
    formData.append('images', f.file, f.name);
  });

  formData.append('format', format);
  formData.append('quality', quality);
  if (resize !== 'original') {
    formData.append('max_dimension', resize);
  }

  try {
    const res = await fetch('/api/image-process', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Processing failed' }));
      throw new Error(err.error || 'Server error');
    }

    const isMultiple = state.imgtools.files.length > 1;
    const origSize = Number(res.headers.get('X-Original-Size')) || 0;
    const newSize = Number(res.headers.get('X-New-Size')) || 0;
    const savingsPercent = Number(res.headers.get('X-Savings-Percent')) || 0;

    const blob = await res.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const ext = format === 'jpeg' ? 'jpg' : format;
    const filename = isMultiple
      ? `docdock_converted_images_${Date.now()}.zip`
      : `${state.imgtools.files[0].name.replace(/\.[^/.]+$/, '')}_converted.${ext}`;

    hideOverlay();
    showResultModal({
      title: 'Images successfully processed!',
      desc: isMultiple
        ? `Processed ${state.imgtools.files.length} images into a ZIP archive.`
        : `Your image is now in ${format.toUpperCase()} format with optimized compression.`,
      downloadUrl,
      filename,
      showStats: !isMultiple && origSize > 0,
      origSize: formatBytes(origSize),
      compSize: formatBytes(newSize || blob.size),
      savings: `-${savingsPercent}%`
    });
  } catch (err) {
    hideOverlay();
    alert('Processing error: ' + err.message);
  }
}

// ================= MODAL & OVERLAY HELPERS =================
function showOverlay(title, desc) {
  document.getElementById('overlay-status-title').textContent = title;
  document.getElementById('overlay-status-desc').textContent = desc;
  document.getElementById('processing-overlay').style.display = 'flex';
}

function hideOverlay() {
  document.getElementById('processing-overlay').style.display = 'none';
}

function showResultModal(info) {
  document.getElementById('result-title').textContent = info.title;
  document.getElementById('result-desc').textContent = info.desc;

  const downloadBtn = document.getElementById('result-download-btn');
  downloadBtn.href = info.downloadUrl;
  downloadBtn.download = info.filename;

  const statsBox = document.getElementById('result-stats');
  if (info.showStats) {
    statsBox.style.display = 'grid';
    document.getElementById('stat-orig-size').textContent = info.origSize;
    document.getElementById('stat-comp-size').textContent = info.compSize;
    document.getElementById('stat-savings').textContent = info.savings;
  } else {
    statsBox.style.display = 'none';
  }

  document.getElementById('result-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('result-modal').style.display = 'none';
}

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
