/* ============================================================
   HINGLISH SUBTITLE ENGINE - FRONTEND LOGIC
   Pure vanilla JS. No frameworks. No build step.
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────
const STATE = {
  backendUrl:    '',
  isConnected:   false,
  selectedFile:  null,
  currentJobId:  null,
  pollInterval:  null,
  pollCount:     0,
  maxPolls:      360,           // 30 min max (5s intervals)
  downloadUrl:   null,
  edlData:       null,
};

// ── DOM References ─────────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
  backendUrl:      $('backendUrl'),
  connectBtn:      $('connectBtn'),
  statusDot:       document.querySelector('.status-dot'),
  statusText:      document.querySelector('.status-text'),

  dropzone:        $('dropzone'),
  fileInput:       $('fileInput'),
  fileInfo:        $('fileInfo'),
  fileName:        $('fileName'),
  fileSize:        $('fileSize'),
  removeFile:      $('removeFile'),
  optionsRow:      $('optionsRow'),
  enableCuts:      $('enableCuts'),
  submitBtn:       $('submitBtn'),

  uploadSection:   $('uploadSection'),
  progressSection: $('progressSection'),
  resultSection:   $('resultSection'),
  errorSection:    $('errorSection'),

  jobBadge:        $('jobBadge'),
  modeBanner:      $('modeBanner'),
  modeIcon:        $('modeIcon'),
  modeTitle:       $('modeTitle'),
  modeDesc:        $('modeDesc'),
  progressFill:    $('progressFill'),
  progressPct:     $('progressPct'),
  progressNote:    $('progressNote'),
  cancelBtn:       $('cancelBtn'),

  statLang:        $('statLang'),
  statMode:        $('statMode'),
  statSegs:        $('statSegs'),
  statTime:        $('statTime'),
  previewBody:     $('previewBody'),
  downloadVideoBtn: $('downloadVideoBtn'),
  downloadEdlBtn:  $('downloadEdlBtn'),
  newJobBtn:       $('newJobBtn'),

  errorMessage:    $('errorMessage'),
  retryBtn:        $('retryBtn'),
};

// ── Utility Helpers ────────────────────────────────────────
const fmt = {
  bytes(n) {
    if (n < 1024)       return `${n} B`;
    if (n < 1048576)    return `${(n/1024).toFixed(1)} KB`;
    if (n < 1073741824) return `${(n/1048576).toFixed(1)} MB`;
    return `${(n/1073741824).toFixed(2)} GB`;
  },
  time(s) {
    if (!s && s !== 0) return '—';
    const ts = parseFloat(s);
    if (ts < 60) return `${ts.toFixed(1)}s`;
    return `${Math.floor(ts/60)}m ${Math.round(ts%60)}s`;
  },
  timestamp(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2,'0');
    const s = Math.floor(sec % 60).toString().padStart(2,'0');
    return `${m}:${s}`;
  },
  lang(code) {
    const map = {
      en:'English', hi:'Hindi', ur:'Urdu',
      mr:'Marathi', ne:'Nepali', sa:'Sanskrit',
      fr:'French',  de:'German', es:'Spanish',
    };
    return map[code] || code?.toUpperCase() || '—';
  },
};

function cleanUrl(raw) {
  let url = raw.trim().replace(/\/$/, '');
  if (url && !url.startsWith('http')) url = 'https://' + url;
  return url;
}

function showSection(name) {
  const sections = [
    'uploadSection','progressSection',
    'resultSection','errorSection'
  ];
  sections.forEach(id => {
    const el = $(id);
    if (el) el.hidden = (id !== name);
  });
}

// ── Connection Handling ────────────────────────────────────
function setConnectionStatus(state, text) {
  DOM.statusDot.className = `status-dot status-dot--${state}`;
  DOM.statusText.textContent = text;
  STATE.isConnected = (state === 'connected');
  updateSubmitBtn();
}

DOM.connectBtn.addEventListener('click', connectToBackend);
DOM.backendUrl.addEventListener('keydown', e => {
  if (e.key === 'Enter') connectToBackend();
});

async function connectToBackend() {
  const url = cleanUrl(DOM.backendUrl.value);
  if (!url) {
    alert('Please paste your ngrok URL first.');
    return;
  }

  STATE.backendUrl = url;
  setConnectionStatus('connecting', 'Connecting...');
  DOM.connectBtn.disabled = true;

  try {
    const res = await fetch(`${url}/health`, {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    setConnectionStatus(
      'connected',
      `Connected · Engine v${data.engine_version} · `
      + `Whisper: ${data.whisper_model || 'loaded'}`
    );
    DOM.connectBtn.textContent = 'Reconnect';

  } catch (err) {
    setConnectionStatus(
      'error',
      `Failed: ${err.message}. Check URL and Colab runtime.`
    );
  } finally {
    DOM.connectBtn.disabled = false;
  }
}

// ── File Handling ──────────────────────────────────────────
const ALLOWED_TYPES = new Set([
  'video/mp4','video/quicktime','video/x-msvideo',
  'video/x-matroska','video/webm',
]);
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

function handleFileSelect(file) {
  if (!file) return;

  if (!ALLOWED_TYPES.has(file.type)
      && !file.name.match(/\.(mp4|mov|avi|mkv|webm)$/i)) {
    alert(`Unsupported file type.\nAllowed: MP4, MOV, AVI, MKV, WEBM`);
    return;
  }
  if (file.size > MAX_SIZE_BYTES) {
    alert(`File too large (${fmt.bytes(file.size)}).\nMax: 500 MB`);
    return;
  }

  STATE.selectedFile = file;
  DOM.fileName.textContent = file.name;
  DOM.fileSize.textContent = fmt.bytes(file.size);
  DOM.fileInfo.hidden   = false;
  DOM.optionsRow.hidden = false;
  DOM.dropzone.hidden   = true;
  updateSubmitBtn();
}

// File input change
DOM.fileInput.addEventListener('change', e => {
  handleFileSelect(e.target.files[0]);
});

// Remove file
DOM.removeFile.addEventListener('click', () => {
  STATE.selectedFile = null;
  DOM.fileInput.value = '';
  DOM.fileInfo.hidden   = true;
  DOM.optionsRow.hidden = true;
  DOM.dropzone.hidden   = false;
  updateSubmitBtn();
});

// Drag & drop
DOM.dropzone.addEventListener('dragover', e => {
  e.preventDefault();
  DOM.dropzone.classList.add('drag-over');
});
DOM.dropzone.addEventListener('dragleave', () => {
  DOM.dropzone.classList.remove('drag-over');
});
DOM.dropzone.addEventListener('drop', e => {
  e.preventDefault();
  DOM.dropzone.classList.remove('drag-over');
  handleFileSelect(e.dataTransfer.files[0]);
});
DOM.dropzone.addEventListener('click', () => {
  DOM.fileInput.click();
});
DOM.dropzone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') DOM.fileInput.click();
});

function updateSubmitBtn() {
  DOM.submitBtn.disabled = !(STATE.isConnected && STATE.selectedFile);
}

// ── Job Submission ─────────────────────────────────────────
DOM.submitBtn.addEventListener('click', submitJob);

async function submitJob() {
  if (!STATE.selectedFile || !STATE.isConnected) return;

  const formData = new FormData();
  formData.append('file', STATE.selectedFile);
  formData.append('enable_cuts', DOM.enableCuts.checked);

  showSection('progressSection');
  setStage('ingest', 'active');
  setProgress(5);
  DOM.jobBadge.textContent = 'Uploading...';
  DOM.modeBanner.hidden = true;

  try {
    const res = await fetch(
      `${STATE.backendUrl}/jobs/submit`,
      {
        method: 'POST',
        body: formData,
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: AbortSignal.timeout(120000), // 2 min upload timeout
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Upload failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    STATE.currentJobId = data.job_id;
    DOM.jobBadge.textContent = `Job: ${data.job_id.slice(0,8)}`;

    setStage('ingest', 'done');
    setStage('stt', 'active');
    setProgress(20);
    startPolling(data.job_id);

  } catch (err) {
    showError(err.message);
  }
}

// ── Progress Polling ───────────────────────────────────────
function startPolling(jobId) {
  STATE.pollCount = 0;
  clearInterval(STATE.pollInterval);

  STATE.pollInterval = setInterval(
    () => pollJobStatus(jobId),
    5000   // Poll every 5 seconds
  );
}

async function pollJobStatus(jobId) {
  STATE.pollCount++;

  if (STATE.pollCount > STATE.maxPolls) {
    clearInterval(STATE.pollInterval);
    showError('Timeout: Processing took too long. Check Colab runtime.');
    return;
  }

  try {
    const res = await fetch(
      `${STATE.backendUrl}/jobs/${jobId}/status`,
      {
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
    const job = await res.json();

    handleJobStatus(job);

  } catch (err) {
    // Network blip - don't fail, just log and continue polling
    console.warn(`Poll ${STATE.pollCount}: ${err.message}`);
    DOM.progressNote.textContent =
      `Network blip, retrying... (attempt ${STATE.pollCount})`;
  }
}

function handleJobStatus(job) {
  const status = job.status;

  // Update mode banner when we have result data
  if (job.subtitle_mode && DOM.modeBanner.hidden) {
    showModeBanner(job.subtitle_mode, job.detected_language);
  }

  switch (status) {
    case 'queued':
      setProgress(10);
      DOM.progressNote.textContent = 'Job queued, waiting for Colab...';
      break;

    case 'processing':
      handleProcessingUpdate(job);
      break;

    case 'complete':
      clearInterval(STATE.pollInterval);
      handleJobComplete(job);
      break;

    case 'failed':
      clearInterval(STATE.pollInterval);
      showError(job.error || 'Unknown processing error');
      break;

    default:
      console.log('Unknown status:', status);
  }
}

function handleProcessingUpdate(job) {
  const pct = job.progress || 0;

  // Infer stage from progress percentage
  if (pct < 25) {
    setStage('ingest', 'done');
    setStage('stt', 'active');
    DOM.progressNote.textContent = 'Whisper is transcribing audio...';
  } else if (pct < 60) {
    setStage('stt', 'done');
    setStage('subtitle', 'active');
    DOM.progressNote.textContent = 'Generating subtitles...';
  } else if (pct < 90) {
    setStage('subtitle', 'done');
    setStage('render', 'active');
    DOM.progressNote.textContent = 'FFmpeg is burning subtitles into video...';
  }

  setProgress(pct || 35);
}

function handleJobComplete(job) {
  // Mark all stages done
  ['ingest','stt','subtitle','render'].forEach(s => {
    setStage(s, 'done');
  });
  setProgress(100);
  DOM.progressNote.textContent = 'Done!';

  // Store for downloads
  STATE.downloadUrl = `${STATE.backendUrl}/jobs/${job.job_id}/download`;
  STATE.edlData     = null;

  // Short delay for visual satisfaction
  setTimeout(() => {
    showSection('resultSection');
    populateResults(job);
  }, 600);
}

// ── Results Population ─────────────────────────────────────
function populateResults(job) {
  DOM.statLang.textContent = fmt.lang(job.detected_language);
  DOM.statMode.textContent = job.subtitle_mode === 'HINGLISH'
    ? '🟡 Hinglish' : '⚪ English';
  DOM.statSegs.textContent = job.total_segments ?? '—';
  DOM.statTime.textContent = fmt.time(job.processing_time_seconds);

  // Fetch EDL for preview table
  fetchEDLPreview(job.job_id);
}

async function fetchEDLPreview(jobId) {
  try {
    const res = await fetch(
      `${STATE.backendUrl}/jobs/${jobId}/edl`,
      { headers: { 'ngrok-skip-browser-warning': 'true' } }
    );
    if (!res.ok) return;
    STATE.edlData = await res.json();
    renderPreviewTable(STATE.edlData.captions || []);
  } catch (e) {
    console.warn('Could not load EDL preview:', e);
  }
}

function renderPreviewTable(captions) {
  const tbody = DOM.previewBody;
  tbody.innerHTML = '';

  const rows = captions.slice(0, 12);

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align:center;color:var(--text-muted)">
          No caption data available
        </td>
      </tr>`;
    return;
  }

  rows.forEach(cap => {
    const mode    = cap.subtitle_mode || 'ENGLISH';
    const tagCls  = mode === 'HINGLISH'
      ? 'mode-tag--hinglish' : 'mode-tag--english';
    const tagText = mode === 'HINGLISH' ? '🟡 Hinglish' : '⚪ English';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="time-cell">
        ${fmt.timestamp(cap.start)} → ${fmt.timestamp(cap.end)}
      </td>
      <td>${escHtml(cap.text)}</td>
      <td>
        <span class="mode-tag ${tagCls}">${tagText}</span>
      </td>`;
    tbody.appendChild(tr);
  });

  if (captions.length > 12) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="3"
          style="text-align:center;color:var(--text-muted);
                 font-size:12px;padding:10px">
        + ${captions.length - 12} more segments
      </td>`;
    tbody.appendChild(tr);
  }
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Downloads ──────────────────────────────────────────────
DOM.downloadVideoBtn.addEventListener('click', async () => {
  if (!STATE.downloadUrl) return;

  DOM.downloadVideoBtn.disabled = true;
  DOM.downloadVideoBtn.textContent = '⏳ Preparing download...';

  try {
    const res = await fetch(STATE.downloadUrl, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });

    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `hinglish_subtitled_${STATE.currentJobId?.slice(0,8)}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

  } catch (err) {
    alert(`Download error: ${err.message}`);
  } finally {
    DOM.downloadVideoBtn.disabled = false;
    DOM.downloadVideoBtn.textContent = '⬇️ Download Video with Subtitles';
  }
});

DOM.downloadEdlBtn.addEventListener('click', () => {
  if (!STATE.edlData) {
    alert('EDL data not loaded yet. Try again in a moment.');
    return;
  }
  const blob = new Blob(
    [JSON.stringify(STATE.edlData, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = `edl_${STATE.currentJobId?.slice(0,8)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ── UI Helper Functions ────────────────────────────────────
function setProgress(pct) {
  const val = Math.max(0, Math.min(100, pct));
  DOM.progressFill.style.width = `${val}%`;
  DOM.progressPct.textContent  = `${Math.round(val)}%`;
}

function setStage(name, state) {
  const el = $(`stage-${name}`);
  if (!el) return;
  el.className = `stage ${state}`;
}

function showModeBanner(mode, lang) {
  DOM.modeBanner.hidden = false;

  if (mode === 'HINGLISH') {
    DOM.modeBanner.className = 'mode-banner mode-banner--hinglish';
    DOM.modeIcon.textContent  = '🟡';
    DOM.modeTitle.textContent = 'Hinglish Mode';
    DOM.modeDesc.textContent  =
      `${fmt.lang(lang)} audio detected → Romanized Hinglish subtitles`;
  } else {
    DOM.modeBanner.className = 'mode-banner mode-banner--english';
    DOM.modeIcon.textContent  = '⚪';
    DOM.modeTitle.textContent = 'English Mode';
    DOM.modeDesc.textContent  =
      `${fmt.lang(lang)} audio detected → English subtitles`;
  }
}

function showError(message) {
  clearInterval(STATE.pollInterval);
  DOM.errorMessage.textContent = message;
  showSection('errorSection');
}

function resetToUpload() {
  clearInterval(STATE.pollInterval);
  STATE.selectedFile  = null;
  STATE.currentJobId  = null;
  STATE.pollCount     = 0;
  STATE.downloadUrl   = null;
  STATE.edlData       = null;

  DOM.fileInput.value = '';
  DOM.fileInfo.hidden   = true;
  DOM.optionsRow.hidden = true;
  DOM.dropzone.hidden   = false;
  DOM.enableCuts.checked = false;
  DOM.modeBanner.hidden = true;
  DOM.previewBody.innerHTML = '';

  ['ingest','stt','subtitle','render'].forEach(s => {
    setStage(s, '');
  });
  setProgress(0);

  updateSubmitBtn();
  showSection('uploadSection');
}

// ── Action Buttons ─────────────────────────────────────────
DOM.cancelBtn.addEventListener('click', resetToUpload);
DOM.newJobBtn.addEventListener('click', resetToUpload);
DOM.retryBtn.addEventListener('click', resetToUpload);

// ── CORS Helper: Update FastAPI in Colab ──────────────────
/*
  IMPORTANT: Add this to your Colab FastAPI app (Cell 9):

  from fastapi.middleware.cors import CORSMiddleware

  app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
  )
*/

console.log('[HinglishEngine] Frontend loaded. Paste your ngrok URL.');