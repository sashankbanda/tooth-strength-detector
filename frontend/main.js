document.addEventListener('DOMContentLoaded', () => {
    const AUTH_TOKEN_KEY = 'odonto_access_token';

    let authToken = localStorage.getItem(AUTH_TOKEN_KEY);
    let currentUser = null;
    let appConfig = {};

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    const sectionAuth = document.getElementById('auth-section');
    const sectionUpload = document.getElementById('upload-section');
    const sectionDashboard = document.getElementById('dashboard-section');
    const sectionHistory = document.getElementById('history-section');
    const stateLoading = document.getElementById('loading-state');

    const btnGuest = document.getElementById('continue-guest-btn');
    const googleSigninContainer = document.getElementById('google-signin-container');
    const authMessage = document.getElementById('auth-message');
    const btnLogout = document.getElementById('logout-btn');
    const btnRefreshHistory = document.getElementById('refresh-history-btn');
    const historyList = document.getElementById('history-list');
    const historyEmpty = document.getElementById('history-empty');
    const btnPreviewPdf = document.getElementById('preview-pdf-btn');
    const btnPreviewCsv = document.getElementById('preview-csv-btn');
    const btnDownloadPdf = document.getElementById('download-pdf-btn');
    const btnDownloadCsv = document.getElementById('download-csv-btn');
    const plotStageCard = document.getElementById('plot-stage-card');
    const plotStrengthCard = document.getElementById('plot-strength-card');
    const plotStageImage = document.getElementById('plot-stage-dist');
    const plotStrengthImage = document.getElementById('plot-strength-dist');
    const assetPreviewModal = document.getElementById('asset-preview-modal');
    const assetPreviewBody = document.getElementById('asset-preview-body');
    const assetPreviewTitle = document.getElementById('asset-preview-title');
    const assetPreviewEyebrow = document.getElementById('asset-preview-eyebrow');
    const assetPreviewDescription = document.getElementById('asset-preview-description');
    const assetPreviewDownload = document.getElementById('asset-preview-download');
    const assetPreviewClose = document.getElementById('asset-preview-close');
    const btnInfoMethodology = document.getElementById('info-methodology-btn');


    const userChip = document.getElementById('user-chip');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const userEmail = document.getElementById('user-email');

    const btnReset = document.getElementById('reset-btn');
    const imageSelect = document.getElementById('image-select');
    const btnPrev = document.getElementById('prev-btn');
    const btnNext = document.getElementById('next-btn');
    const imageCounter = document.getElementById('image-counter');
    const homeLogo = document.getElementById('home-logo');
    const imageViewerCard = document.querySelector('.image-viewer-card');
    const imageDisplayContainer = document.getElementById('image-display-container');
    const imageStageSurface = document.getElementById('image-stage-surface');
    const visualImageDisplay = document.getElementById('visual-image-display');
    const btnZoomOut = document.getElementById('zoom-out-btn');
    const btnZoomReset = document.getElementById('zoom-reset-btn');
    const btnZoomIn = document.getElementById('zoom-in-btn');
    const btnMaximize = document.getElementById('maximize-btn');
    const lensToggle = document.getElementById('lens-toggle');
    const magnifierLens = document.getElementById('magnifier-lens');

    let currentImages = [];
    let currentIndex = 0;
    let reportsByImage = {};
    let currentArtifacts = {
        stagePlotUrl: '',
        strengthPlotUrl: '',
        pdfUrl: '',
        csvUrl: '',
    };
    const viewerState = {
        scale: 1,
        minScale: 1,
        maxScale: 5,
        zoomStep: 0.25,
        panX: 0,
        panY: 0,
        baseLeft: 0,
        baseTop: 0,
        baseWidth: 0,
        baseHeight: 0,
        naturalWidth: 0,
        naturalHeight: 0,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        lensEnabled: false,
        lensZoom: 2.6,
        pointerX: 0,
        pointerY: 0,
        maximized: false,
        syncFrame: null,
    };
    const previewState = {
        open: false,
        type: '',
        url: '',
        title: '',
        requestId: 0,
    };

    let timerInterval = null;
    let timerStart = 0;

    function startTimer() {
        const timerEl = document.getElementById('process-timer');
        if (!timerEl) return;
        
        timerStart = Date.now();
        timerEl.textContent = '0.000s';
        
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const elapsed = (Date.now() - timerStart) / 1000;
            timerEl.textContent = elapsed.toFixed(3) + 's';
        }, 37);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function getContainerCenter() {
        return {
            x: imageDisplayContainer.clientWidth / 2,
            y: imageDisplayContainer.clientHeight / 2,
        };
    }

    function getTransformedStageRect() {
        const width = viewerState.baseWidth * viewerState.scale;
        const height = viewerState.baseHeight * viewerState.scale;
        return {
            left: viewerState.baseLeft + viewerState.panX - ((width - viewerState.baseWidth) / 2),
            top: viewerState.baseTop + viewerState.panY - ((height - viewerState.baseHeight) / 2),
            width,
            height,
        };
    }

    function isPointOnImage(x, y) {
        if (!viewerState.baseWidth || !viewerState.baseHeight) {
            return false;
        }

        const rect = getTransformedStageRect();
        return (
            x >= rect.left &&
            x <= rect.left + rect.width &&
            y >= rect.top &&
            y <= rect.top + rect.height
        );
    }

    function hideMagnifier() {
        magnifierLens.classList.add('hidden');
        imageDisplayContainer.classList.remove('lens-active');
    }

    function clampPanOffsets() {
        if (viewerState.scale <= 1.001 || !viewerState.baseWidth || !viewerState.baseHeight) {
            viewerState.panX = 0;
            viewerState.panY = 0;
            return;
        }

        const containerWidth = imageDisplayContainer.clientWidth;
        const containerHeight = imageDisplayContainer.clientHeight;
        const maxPanX = Math.max(0, ((viewerState.baseWidth * viewerState.scale) - containerWidth) / 2);
        const maxPanY = Math.max(0, ((viewerState.baseHeight * viewerState.scale) - containerHeight) / 2);

        viewerState.panX = clamp(viewerState.panX, -maxPanX, maxPanX);
        viewerState.panY = clamp(viewerState.panY, -maxPanY, maxPanY);
    }

    function updateViewerCursorState() {
        imageDisplayContainer.classList.toggle(
            'is-zoomable',
            viewerState.scale > 1.001 && !viewerState.isDragging && !viewerState.lensEnabled
        );
        imageDisplayContainer.classList.toggle('is-dragging', viewerState.isDragging);
        imageDisplayContainer.classList.toggle(
            'lens-active',
            viewerState.lensEnabled && !viewerState.isDragging && !magnifierLens.classList.contains('hidden')
        );
    }

    function updateViewerButtons() {
        btnZoomReset.textContent = `${Math.round(viewerState.scale * 100)}%`;
        btnZoomOut.disabled = viewerState.scale <= viewerState.minScale;
        btnZoomIn.disabled = viewerState.scale >= viewerState.maxScale;
        updateViewerCursorState();
    }

    function updateStageTransform() {
        clampPanOffsets();
        imageStageSurface.style.transform = `translate3d(${viewerState.panX}px, ${viewerState.panY}px, 0) scale(${viewerState.scale})`;
        updateViewerButtons();

        if (viewerState.lensEnabled && !viewerState.isDragging && !magnifierLens.classList.contains('hidden')) {
            updateMagnifier(viewerState.pointerX, viewerState.pointerY);
        }
    }

    function syncStageGeometry() {
        if (!visualImageDisplay.complete || !visualImageDisplay.naturalWidth) {
            return;
        }

        const containerWidth = imageDisplayContainer.clientWidth;
        const containerHeight = imageDisplayContainer.clientHeight;

        if (!containerWidth || !containerHeight) {
            return;
        }

        const naturalWidth = visualImageDisplay.naturalWidth;
        const naturalHeight = visualImageDisplay.naturalHeight;
        const imageRatio = naturalWidth / naturalHeight;
        const containerRatio = containerWidth / containerHeight;

        let fittedWidth = containerWidth;
        let fittedHeight = containerHeight;

        if (imageRatio > containerRatio) {
            fittedHeight = fittedWidth / imageRatio;
        } else {
            fittedWidth = fittedHeight * imageRatio;
        }

        viewerState.baseWidth = fittedWidth;
        viewerState.baseHeight = fittedHeight;
        viewerState.baseLeft = (containerWidth - fittedWidth) / 2;
        viewerState.baseTop = (containerHeight - fittedHeight) / 2;
        viewerState.naturalWidth = naturalWidth;
        viewerState.naturalHeight = naturalHeight;

        imageStageSurface.style.left = `${viewerState.baseLeft}px`;
        imageStageSurface.style.top = `${viewerState.baseTop}px`;
        imageStageSurface.style.width = `${viewerState.baseWidth}px`;
        imageStageSurface.style.height = `${viewerState.baseHeight}px`;
        magnifierLens.style.backgroundImage = `url("${visualImageDisplay.currentSrc || visualImageDisplay.src}")`;

        updateStageTransform();
    }

    function scheduleStageSync() {
        if (viewerState.syncFrame) {
            cancelAnimationFrame(viewerState.syncFrame);
        }

        viewerState.syncFrame = requestAnimationFrame(() => {
            viewerState.syncFrame = null;
            syncStageGeometry();
        });
    }

    function resetViewerTransforms() {
        viewerState.scale = 1;
        viewerState.panX = 0;
        viewerState.panY = 0;
        viewerState.isDragging = false;
        hideMagnifier();
        updateViewerButtons();
    }

    function setZoom(nextScale, anchorX = null, anchorY = null) {
        const targetScale = clamp(nextScale, viewerState.minScale, viewerState.maxScale);

        if (!viewerState.baseWidth || !viewerState.baseHeight) {
            viewerState.scale = targetScale;
            updateViewerButtons();
            return;
        }

        const center = getContainerCenter();
        const focusX = anchorX ?? center.x;
        const focusY = anchorY ?? center.y;
        const currentRect = getTransformedStageRect();

        if (!currentRect.width || !currentRect.height) {
            viewerState.scale = targetScale;
            updateStageTransform();
            return;
        }

        const relativeX = clamp((focusX - currentRect.left) / currentRect.width, 0, 1);
        const relativeY = clamp((focusY - currentRect.top) / currentRect.height, 0, 1);

        viewerState.scale = targetScale;

        if (targetScale <= 1.001) {
            viewerState.panX = 0;
            viewerState.panY = 0;
        } else {
            const newWidth = viewerState.baseWidth * targetScale;
            const newHeight = viewerState.baseHeight * targetScale;
            const newLeft = focusX - (relativeX * newWidth);
            const newTop = focusY - (relativeY * newHeight);

            viewerState.panX = newLeft - viewerState.baseLeft + ((newWidth - viewerState.baseWidth) / 2);
            viewerState.panY = newTop - viewerState.baseTop + ((newHeight - viewerState.baseHeight) / 2);
        }

        updateStageTransform();
    }

    function updateMagnifier(containerX, containerY) {
        viewerState.pointerX = containerX;
        viewerState.pointerY = containerY;

        if (!viewerState.lensEnabled || viewerState.isDragging || !isPointOnImage(containerX, containerY)) {
            hideMagnifier();
            updateViewerCursorState();
            return;
        }

        const rect = getTransformedStageRect();
        const lensSize = magnifierLens.offsetWidth || 170;
        const lensRadius = lensSize / 2;
        const relativeX = (containerX - rect.left) / rect.width;
        const relativeY = (containerY - rect.top) / rect.height;
        const backgroundWidth = rect.width * viewerState.lensZoom;
        const backgroundHeight = rect.height * viewerState.lensZoom;
        const backgroundX = relativeX * backgroundWidth;
        const backgroundY = relativeY * backgroundHeight;
        const left = clamp(containerX - lensRadius, 12, imageDisplayContainer.clientWidth - lensSize - 12);
        const top = clamp(containerY - lensRadius, 12, imageDisplayContainer.clientHeight - lensSize - 12);

        magnifierLens.style.left = `${left}px`;
        magnifierLens.style.top = `${top}px`;
        magnifierLens.style.backgroundSize = `${backgroundWidth}px ${backgroundHeight}px`;
        magnifierLens.style.backgroundPosition = `${lensRadius - backgroundX}px ${lensRadius - backgroundY}px`;
        magnifierLens.classList.remove('hidden');
        updateViewerCursorState();
    }

    function setMagnifierEnabled(enabled) {
        viewerState.lensEnabled = enabled;

        if (!enabled) {
            hideMagnifier();
        } else {
            updateMagnifier(viewerState.pointerX, viewerState.pointerY);
        }

        updateViewerCursorState();
    }

    function setMaximized(enabled) {
        viewerState.maximized = enabled;
        imageViewerCard.classList.toggle('is-maximized', enabled);
        document.body.classList.toggle('viewer-maximized', enabled);
        btnMaximize.setAttribute('aria-pressed', String(enabled));
        btnMaximize.innerHTML = enabled
            ? '<i data-lucide="minimize-2"></i><span>Restore</span>'
            : '<i data-lucide="maximize-2"></i><span>Maximize</span>';
        hideMagnifier();
        lucide.createIcons();
        scheduleStageSync();
    }

    function setPreviewButtonState(button, enabled) {
        button.disabled = !enabled;
        button.setAttribute('aria-disabled', String(!enabled));
    }

    function setDownloadLinkState(link, enabled) {
        link.classList.toggle('is-disabled', !enabled);
        link.setAttribute('aria-disabled', String(!enabled));
        if (!enabled) {
            link.setAttribute('href', '#');
        }
    }

    function clearPreviewBody() {
        assetPreviewBody.innerHTML = '';
    }

    function closeAssetPreview() {
        previewState.open = false;
        previewState.type = '';
        previewState.url = '';
        previewState.title = '';
        assetPreviewModal.classList.add('hidden');
        assetPreviewModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('asset-preview-open');
        assetPreviewDownload.classList.remove('hidden'); // Ensure it's visible again
        clearPreviewBody();
    }


    function renderImagePreview(url, title) {
        assetPreviewBody.innerHTML = `
            <div class="asset-preview-frame image">
                <img src="${url}" alt="${title}" />
            </div>
        `;
    }

    function renderPdfPreview(url) {
        assetPreviewBody.innerHTML = `
            <div class="asset-preview-frame pdf">
                <iframe src="${url}#view=FitH" title="PDF report preview"></iframe>
            </div>
        `;
    }

    function parseCsvRows(csvText) {
        const rows = [];
        let row = [];
        let value = '';
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i += 1) {
            const char = csvText[i];
            const next = csvText[i + 1];

            if (char === '"') {
                if (inQuotes && next === '"') {
                    value += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (char === ',' && !inQuotes) {
                row.push(value);
                value = '';
                continue;
            }

            if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && next === '\n') {
                    i += 1;
                }
                row.push(value);
                if (row.some((cell) => cell.length > 0)) {
                    rows.push(row);
                }
                row = [];
                value = '';
                continue;
            }

            value += char;
        }

        if (value.length > 0 || row.length > 0) {
            row.push(value);
            if (row.some((cell) => cell.length > 0)) {
                rows.push(row);
            }
        }

        return rows;
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    async function renderCsvPreview(url, requestId) {
        assetPreviewBody.innerHTML = `
            <div class="asset-preview-loading">
                <div class="spinner compact"></div>
                <p>Loading CSV preview...</p>
            </div>
        `;

        try {
            const response = await fetch(url, {
                headers: { Accept: 'text/csv' },
            });

            if (!response.ok) {
                throw new Error('Failed to load CSV preview.');
            }

            const csvText = await response.text();
            if (!previewState.open || previewState.requestId !== requestId || previewState.type !== 'csv' || previewState.url !== url) {
                return;
            }
            const rows = parseCsvRows(csvText);

            if (!rows.length) {
                assetPreviewBody.innerHTML = '<div class="asset-preview-empty">CSV file is empty.</div>';
                return;
            }

            const headers = rows[0];
            const dataRows = rows.slice(1);
            const limitedRows = dataRows.slice(0, 200);
            const tableHead = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
            const tableBody = limitedRows.map((row) => {
                const cells = headers.map((_, index) => `<td>${escapeHtml(row[index] ?? '')}</td>`).join('');
                return `<tr>${cells}</tr>`;
            }).join('');

            assetPreviewBody.innerHTML = `
                <div class="asset-preview-frame csv">
                    <div class="asset-preview-meta">
                        <span>${dataRows.length} rows</span>
                        <span>${headers.length} columns</span>
                        ${dataRows.length > limitedRows.length ? `<span>Showing first ${limitedRows.length}</span>` : ''}
                    </div>
                    <div class="asset-preview-table-wrap">
                        <table class="asset-preview-table">
                            <thead>
                                <tr>${tableHead}</tr>
                            </thead>
                            <tbody>
                                ${tableBody}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (error) {
            if (!previewState.open || previewState.requestId !== requestId || previewState.type !== 'csv' || previewState.url !== url) {
                return;
            }
            assetPreviewBody.innerHTML = `
                <div class="asset-preview-empty">
                    ${escapeHtml(error.message || 'Unable to preview this CSV file.')}
                </div>
            `;
        }
    }

    async function openAssetPreview({ type, url, title, description = '' }) {
        if (!url) {
            alert('This asset is not available yet.');
            return;
        }

        previewState.open = true;
        previewState.type = type;
        previewState.url = url;
        previewState.title = title;
        previewState.requestId += 1;
        const requestId = previewState.requestId;

        assetPreviewEyebrow.textContent = type === 'plot' ? 'Visualization Preview' : 'Report Preview';
        assetPreviewTitle.textContent = title;
        assetPreviewDescription.textContent = description;
        assetPreviewDownload.href = url;
        assetPreviewDownload.setAttribute('download', '');

        assetPreviewModal.classList.remove('hidden');
        assetPreviewModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('asset-preview-open');
        clearPreviewBody();

        if (type === 'plot') {
            renderImagePreview(url, title);
        } else if (type === 'pdf') {
            renderPdfPreview(url);
        } else if (type === 'csv') {
            await renderCsvPreview(url, requestId);
        }

        lucide.createIcons();
    }

    function showMethodologyModal() {
        previewState.open = true;
        previewState.type = 'methodology';
        previewState.requestId += 1;

        assetPreviewEyebrow.textContent = 'Methodology & Benchmarks';
        assetPreviewTitle.textContent = 'Diagnostic Framework';
        assetPreviewDescription.textContent = 'Understanding the periodontal classification system and underlying calculations.';
        
        // Hide download button for methodology
        assetPreviewDownload.classList.add('hidden');
        
        assetPreviewModal.classList.remove('hidden');
        assetPreviewModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('asset-preview-open');

        assetPreviewBody.innerHTML = `
            <div class="methodology-content">
                <div class="methodology-section">
                    <h4>Primary Formulas</h4>
                    <div class="formula-grid">
                        <div class="formula-card">
                            <span class="label">Radiographic Bone Loss (RBL)</span>
                            <div class="expr">RBL = (BL / RL) × 100</div>
                            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem;">Where BL is bone loss and RL is root length.</p>
                        </div>
                        <div class="formula-card">
                            <span class="label">Tooth Strength Index</span>
                            <div class="expr">Strength = 100 - RBL</div>
                            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem;">Normalized scale where 100% is optimal health.</p>
                        </div>
                    </div>
                </div>

                <div class="methodology-section">
                    <h4>Periodontal Staging Benchmarks</h4>
                    <table class="benchmark-table">
                        <thead>
                            <tr>
                                <th>Stage</th>
                                <th>RBL Metric</th>
                                <th>Clinical Implication</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>Stage I</strong></td>
                                <td>&lt; 15%</td>
                                <td>Initial periodontitis; early interdental bone loss.</td>
                            </tr>
                            <tr>
                                <td><strong>Stage II</strong></td>
                                <td>15% - 33%</td>
                                <td>Moderate periodontitis; established attachment loss.</td>
                            </tr>
                            <tr>
                                <td><strong>Stage III/IV</strong></td>
                                <td>&gt; 33%</td>
                                <td>Severe periodontitis; significant risk of tooth loss.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="methodology-section">
                    <h4>Health Status Indicators</h4>
                    <div class="formula-grid">
                        <div class="formula-card">
                            <span class="badge healthy" style="margin-bottom:0.5rem;">Optimal</span>
                            <p style="font-size:0.85rem;">Strength ≥ 75%. Indicates strong structural support and minimal bone loss.</p>
                        </div>
                        <div class="formula-card">
                            <span class="badge warning" style="margin-bottom:0.5rem;">Monitor</span>
                            <p style="font-size:0.85rem;">Strength 50% - 74%. Moderate bone loss detected; intervention may be required.</p>
                        </div>
                        <div class="formula-card">
                            <span class="badge danger" style="margin-bottom:0.5rem;">Critical</span>
                            <p style="font-size:0.85rem;">Strength &lt; 50%. Severe bone loss; high risk of periodontal instability.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        lucide.createIcons();
    }


    function setAuthMessage(message, isError = false) {
        authMessage.textContent = message || '';
        authMessage.classList.toggle('auth-error', Boolean(message && isError));
    }

    function setCurrentUser(user) {
        currentUser = user;
        if (!currentUser) {
            userChip.classList.add('hidden');
            btnLogout.classList.add('hidden');
            return;
        }

        userChip.classList.remove('hidden');
        btnLogout.classList.remove('hidden');
        userName.textContent = currentUser.name || 'Signed in user';
        userEmail.textContent = currentUser.email || '';
        userAvatar.src = currentUser.picture || 'https://ui-avatars.com/api/?name=User';
    }

    function clearSession() {
        authToken = null;
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setCurrentUser(null);
    }

    function getAuthHeaders() {
        if (!authToken) {
            return {};
        }
        return { Authorization: `Bearer ${authToken}` };
    }

    async function fetchPublicConfig() {
        const res = await fetch('/api/config');
        if (!res.ok) {
            throw new Error('Failed to load app config.');
        }
        appConfig = await res.json();
    }

    async function restoreSession() {
        if (!authToken) {
            return false;
        }
        try {
            const res = await fetch('/api/auth/me', {
                headers: getAuthHeaders(),
            });
            
            if (res.status === 401) {
                clearSession();
                return false;
            }

            if (!res.ok) {
                // Server error or other issue, but don't force logout
                return false;
            }

            const me = await res.json();
            setCurrentUser(me);
            return true;
        } catch (err) {
            console.error('Failed to restore session:', err);
            return false;
        }
    }

    async function waitForGoogleIdentity(timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            if (window.google && window.google.accounts && window.google.accounts.id) {
                resolve();
                return;
            }

            const started = Date.now();
            const timer = setInterval(() => {
                if (window.google && window.google.accounts && window.google.accounts.id) {
                    clearInterval(timer);
                    resolve();
                    return;
                }

                if (Date.now() - started > timeoutMs) {
                    clearInterval(timer);
                    reject(new Error('Google Sign-In library did not load.'));
                }
            }, 100);
        });
    }

    async function initializeGoogleSignIn() {
        if (!appConfig.google_client_id) {
            setAuthMessage('Google sign-in is not configured on the server.', true);
            return;
        }

        try {
            await waitForGoogleIdentity();
            window.google.accounts.id.initialize({
                client_id: appConfig.google_client_id,
                callback: handleGoogleCredential,
            });
            googleSigninContainer.innerHTML = '';
            window.google.accounts.id.renderButton(googleSigninContainer, {
                theme: 'outline',
                size: 'large',
                shape: 'pill',
                text: 'signin_with',
            });
        } catch (err) {
            setAuthMessage(err.message || 'Failed to initialize Google Sign-In.', true);
        }
    }

    async function handleGoogleCredential(response) {
        if (!response || !response.credential) {
            setAuthMessage('Google did not return a credential.', true);
            return;
        }

        setAuthMessage('Signing in...');

        try {
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential }),
            });
            const payload = await res.json();
            if (!res.ok) {
                throw new Error(payload.detail || 'Google sign-in failed.');
            }

            authToken = payload.access_token;
            localStorage.setItem(AUTH_TOKEN_KEY, authToken);
            setCurrentUser(payload.user);
            setAuthMessage('Signed in successfully.');
            showAppEntry();
            await loadHistory();
        } catch (err) {
            setAuthMessage(err.message || 'Unable to complete Google sign-in.', true);
        }
    }

    function showAuthGate() {
        sectionAuth.classList.remove('hidden');
        sectionUpload.classList.add('hidden');
        sectionDashboard.classList.add('hidden');
        sectionHistory.classList.add('hidden');
        
        const settingsBar = document.querySelector('.settings-bar');
        if (settingsBar) settingsBar.classList.add('hidden');
    }

    function showAppEntry() {
        sectionAuth.classList.add('hidden');
        sectionUpload.classList.remove('hidden');
        sectionHistory.classList.toggle('hidden', !currentUser);
        
        const settingsBar = document.querySelector('.settings-bar');
        if (settingsBar) settingsBar.classList.remove('hidden');
    }

    async function loadHistory() {
        if (!authToken || !currentUser) {
            sectionHistory.classList.add('hidden');
            return;
        }

        const res = await fetch('/api/history', {
            headers: getAuthHeaders(),
        });
        await updateStorageStats();

        if (res.status === 401) {
            clearSession();
            setAuthMessage('Session expired. Please sign in again.', true);
            showAuthGate();
            return;
        }

        if (!res.ok) {
            throw new Error('Failed to fetch history.');
        }

        const payload = await res.json();
        renderHistory(payload.items || []);
        sectionHistory.classList.remove('hidden');
    }

    async function openHistorySession(jobId) {
        const res = await fetch(`/api/history/${encodeURIComponent(jobId)}`, {
            headers: getAuthHeaders(),
        });

        if (res.status === 401) {
            clearSession();
            setAuthMessage('Session expired. Please sign in again.', true);
            showAuthGate();
            return;
        }

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(payload.detail || 'Unable to open saved analysis.');
        }

        renderDashboard(payload);
        await updateStorageStats();
        sectionDashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function updateStorageStats() {
        try {
            const res = await fetch('/api/history/storage/stats', {
                headers: getAuthHeaders(),
            });
            if (!res.ok) return;
            const stats = await res.json();
            const indicator = document.getElementById('global-storage-indicator');
            const text = document.getElementById('storage-text');
            const fill = document.getElementById('storage-bar-fill');

            if (text) text.textContent = `Storage: ${stats.used_mb} / ${stats.quota_mb} MB`;
            if (fill) fill.style.width = `${stats.percent}%`;
            
            if (indicator) {
                indicator.classList.remove('hidden', 'warning', 'danger');
                if (stats.percent > 90) {
                    indicator.classList.add('danger');
                } else if (stats.percent > 70) {
                    indicator.classList.add('warning');
                }
            }
        } catch (err) {
            console.error('Failed to update storage stats', err);
        }
    }

    async function deleteHistoryItem(jobId, event) {
        if (event) event.stopPropagation();
        
        const confirmed = confirm('Are you sure you want to delete this analysis? All associated images and reports will be permanently removed.');
        if (!confirmed) return;

        try {
            const res = await fetch(`/api/history/${encodeURIComponent(jobId)}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || 'Failed to delete session.');
            }

            await loadHistory();
            await updateStorageStats();
            
            const jobDisplay = document.getElementById('job-id-display');
            if (jobDisplay && jobDisplay.innerText.includes(jobId.substring(0, 8))) {
                resetView();
            }
        } catch (err) {
            alert(err.message || 'An error occurred during deletion.');
        }
    }

    function renderHistory(items) {
        historyList.innerHTML = '';

        if (!items.length) {
            historyEmpty.classList.remove('hidden');
            return;
        }

        historyEmpty.classList.add('hidden');
        items.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'history-item';

            const createdAt = item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown date';

            li.innerHTML = `
                <div class="history-item-content">
                    <h4>${item.source_filename}</h4>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <p>${createdAt}</p>
                        <span class="file-hint" style="margin:0; font-size:0.7rem; padding: 0.1rem 0.5rem;">${item.size_mb} MB</span>
                    </div>
                </div>
                <div class="history-metrics">
                    <span>${item.total_images} images</span>
                    <span>${item.total_teeth} teeth</span>
                    ${item.processing_time_ms ? `<span title="Processing duration"><i data-lucide="timer" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"></i>${(item.processing_time_ms / 1000).toFixed(2)}s</span>` : ''}
                    ${item.csv_url ? `<a href="${item.csv_url}" target="_blank" title="Download CSV"><i data-lucide="download"></i></a>` : ''}
                    ${item.pdf_url ? `<a href="${item.pdf_url}" target="_blank" title="Download PDF"><i data-lucide="file-text"></i></a>` : ''}
                </div>
                <div class="history-item-actions">
                    <button class="btn-delete-history" title="Delete from history">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;

            const deleteBtn = li.querySelector('.btn-delete-history');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => deleteHistoryItem(item.job_id, e));
            }

            li.addEventListener('click', async (event) => {
                if (event.target.closest('a')) {
                    return;
                }
                try {
                    await openHistorySession(item.job_id);
                } catch (err) {
                    alert(err.message || 'Failed to load saved analysis.');
                }
            });

            li.addEventListener('keydown', async (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }
                event.preventDefault();
                try {
                    await openHistorySession(item.job_id);
                } catch (err) {
                    alert(err.message || 'Failed to load saved analysis.');
                }
            });

            li.tabIndex = 0;
            li.setAttribute('role', 'button');
            li.setAttribute('aria-label', `Open saved analysis ${item.source_filename}`);
            historyList.appendChild(li);
        });
    }

    async function refreshHistory() {
        try {
            await loadHistory();
        } catch (err) {
            alert(err.message || 'Failed to refresh history.');
        }
    }

    // Prevention of defaults
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach((eventName) => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    ['dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropZone.classList.add('dragover');
    }

    function unhighlight() {
        dropZone.classList.remove('dragover');
    }

    dropZone.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFileSelect, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    function handleFileSelect(e) {
        const files = e.target.files;
        handleFiles(files);
    }

    function handleFiles(files) {
        if (!files || files.length === 0) {
            return;
        }

        const file = files[0];
        const validNames = file.name.match(/\.(zip|jpg|jpeg|png)$/i);
        if (!validNames) {
            alert('Invalid file format. Please upload a ZIP or image file.');
            return;
        }

        startFileUpload(file);
    }

    function startFileUpload(file) {
        const preprocessToggle = document.getElementById('preprocess-toggle');
        const preprocessEnabled = preprocessToggle ? preprocessToggle.checked : true;
        const settingsBar = document.querySelector('.settings-bar');

        dropZone.classList.add('hidden');
        if (settingsBar) settingsBar.classList.add('hidden');
        document.querySelector('.hero-text').classList.add('hidden');
        stateLoading.classList.remove('hidden');
        startTimer();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('preprocess', preprocessEnabled);

        fetch('/upload', {
            method: 'POST',
            body: formData,
            headers: getAuthHeaders(),
        })
            .then(async (response) => {
                if (response.status === 401) {
                    clearSession();
                    showAuthGate();
                    throw new Error('Session expired. Please sign in again.');
                }
                if (response.status === 403) {
                    const data = await response.json().catch(() => ({}));
                    showQuotaError(data.detail);
                    throw new Error('quota_exceeded');
                }
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.detail || 'Upload failed');
                }
                return response.json();
            })
            .then((result) => {
                if (result.status === 'success') {
                    stopTimer();
                    renderDashboard(result.data);
                    if (currentUser) {
                        refreshHistory();
                    }
                } else {
                    throw new Error('Processing error');
                }
            })
            .catch((err) => {
                stopTimer();
                if (err.message === 'quota_exceeded') return;
                alert('An error occurred: ' + err.message);
                resetView();
            });
    }

    async function handleReprocess() {
        if (!currentArtifacts.jobId) {
            alert('No active session to re-analyze.');
            return;
        }

        const preprocessToggle = document.getElementById('preprocess-toggle');
        const preprocessEnabled = preprocessToggle ? preprocessToggle.checked : true;
        const settingsBar = document.querySelector('.settings-bar');

        sectionDashboard.classList.add('hidden');
        if (settingsBar) settingsBar.classList.add('hidden');
        stateLoading.classList.remove('hidden');
        startTimer();

        const formData = new FormData();
        formData.append('preprocess', preprocessEnabled);

        try {
            const res = await fetch(`/api/reprocess/${encodeURIComponent(currentArtifacts.jobId)}`, {
                method: 'POST',
                body: formData,
                headers: getAuthHeaders(),
            });

            if (res.status === 401) {
                clearSession();
                showAuthGate();
                throw new Error('Session expired. Please sign in again.');
            }

            const result = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(result.detail || 'Reprocessing failed.');
            }

            stopTimer();
            if (result.status === 'success') {
                renderDashboard(result.data);
                if (currentUser) {
                    refreshHistory();
                }
            } else {
                throw new Error('Processing error during re-analysis.');
            }
        } catch (err) {
            stopTimer();
            alert('An error occurred during re-analysis: ' + err.message);
            sectionDashboard.classList.remove('hidden');
            stateLoading.classList.add('hidden');
        }
    }

    function showQuotaError(message) {
        stateLoading.classList.add('hidden');
        dropZone.classList.remove('hidden');
        document.querySelector('.hero-text').classList.remove('hidden');
        
        const existing = document.querySelector('.quota-error-alert');
        if (existing) existing.remove();

        const alertContainer = document.createElement('div');
        alertContainer.className = 'quota-error-alert';
        alertContainer.innerHTML = `
            <i data-lucide="alert-triangle" style="color:var(--health-danger);width:32px;height:32px;margin-bottom:1rem;"></i>
            <h3>Storage Quota Exceeded</h3>
            <p>${message || 'You have reached the maximum storage limit.'}</p>
            <div style="display:flex;gap:1rem;justify-content:center;">
                <button class="btn secondary-btn" id="manage-storage-shortcut">Manage Storage</button>
                <button class="btn outline-btn" id="dismiss-quota-error">Dismiss</button>
            </div>
        `;
        
        sectionUpload.prepend(alertContainer);
        lucide.createIcons();
        
        document.getElementById('manage-storage-shortcut').addEventListener('click', () => {
            sectionHistory.scrollIntoView({ behavior: 'smooth' });
        });
        document.getElementById('dismiss-quota-error').addEventListener('click', () => {
            alertContainer.remove();
        });
        
        alertContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function navigateTo(index) {
        if (index < 0 || index >= currentImages.length) {
            return;
        }
        currentIndex = index;
        imageSelect.value = currentIndex;
        setVisualImage(currentImages[currentIndex].url);
        imageCounter.textContent = `${currentIndex + 1} / ${currentImages.length}`;
        btnPrev.disabled = currentIndex === 0;
        btnNext.disabled = currentIndex === currentImages.length - 1;
        renderTableForImage(currentImages[currentIndex].filename);
        lucide.createIcons();
    }

    btnPrev.addEventListener('click', () => navigateTo(currentIndex - 1));
    btnNext.addEventListener('click', () => navigateTo(currentIndex + 1));
    imageSelect.addEventListener('change', (e) => {
        navigateTo(parseInt(e.target.value, 10));
    });
    btnZoomOut.addEventListener('click', () => {
        setZoom(viewerState.scale - viewerState.zoomStep);
    });
    btnZoomIn.addEventListener('click', () => {
        setZoom(viewerState.scale + viewerState.zoomStep);
    });
    btnZoomReset.addEventListener('click', () => {
        setZoom(1);
    });
    btnMaximize.addEventListener('click', () => {
        setMaximized(!viewerState.maximized);
    });
    lensToggle.addEventListener('change', (event) => {
        setMagnifierEnabled(event.target.checked);
    });
    visualImageDisplay.addEventListener('load', () => {
        resetViewerTransforms();
        scheduleStageSync();
    });
    window.addEventListener('resize', scheduleStageSync);
    btnPreviewPdf.addEventListener('click', () => {
        openAssetPreview({
            type: 'pdf',
            url: currentArtifacts.pdfUrl,
            title: 'Full PDF Report',
            description: 'Review the generated report in-app, then download when ready.',
        });
    });
    btnPreviewCsv.addEventListener('click', () => {
        openAssetPreview({
            type: 'csv',
            url: currentArtifacts.csvUrl,
            title: 'CSV Export Preview',
            description: 'Inspect the generated records table before downloading the export.',
        });
    });
    plotStageCard.addEventListener('click', () => {
        openAssetPreview({
            type: 'plot',
            url: currentArtifacts.stagePlotUrl,
            title: 'Stage Distribution',
            description: 'Expanded view of the periodontal stage distribution chart.',
        });
    });
    plotStrengthCard.addEventListener('click', () => {
        openAssetPreview({
            type: 'plot',
            url: currentArtifacts.strengthPlotUrl,
            title: 'Strength Distribution',
            description: 'Expanded view of the tooth strength distribution chart.',
        });
    });
    btnInfoMethodology.addEventListener('click', showMethodologyModal);
    assetPreviewClose.addEventListener('click', closeAssetPreview);


    assetPreviewModal.addEventListener('click', (event) => {
        if (event.target instanceof HTMLElement && event.target.dataset.closePreview === 'true') {
            closeAssetPreview();
        }
    });
    [btnDownloadPdf, btnDownloadCsv, assetPreviewDownload].forEach((link) => {
        link.addEventListener('click', (event) => {
            if (link.getAttribute('href') === '#') {
                event.preventDefault();
            }
        });
    });

    imageDisplayContainer.addEventListener('wheel', (event) => {
        if (!viewerState.baseWidth) {
            return;
        }

        event.preventDefault();
        const rect = imageDisplayContainer.getBoundingClientRect();
        const anchorX = event.clientX - rect.left;
        const anchorY = event.clientY - rect.top;
        const delta = event.deltaY < 0 ? viewerState.zoomStep : -viewerState.zoomStep;

        setZoom(viewerState.scale + delta, anchorX, anchorY);
    }, { passive: false });

    imageDisplayContainer.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        const rect = imageDisplayContainer.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;

        viewerState.pointerX = pointerX;
        viewerState.pointerY = pointerY;

        if (viewerState.scale <= 1.001 || !isPointOnImage(pointerX, pointerY)) {
            updateMagnifier(pointerX, pointerY);
            return;
        }

        viewerState.isDragging = true;
        viewerState.dragStartX = event.clientX - viewerState.panX;
        viewerState.dragStartY = event.clientY - viewerState.panY;
        imageDisplayContainer.setPointerCapture(event.pointerId);
        hideMagnifier();
        updateViewerCursorState();
    });

    imageDisplayContainer.addEventListener('pointermove', (event) => {
        const rect = imageDisplayContainer.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;

        viewerState.pointerX = pointerX;
        viewerState.pointerY = pointerY;

        if (viewerState.isDragging) {
            viewerState.panX = event.clientX - viewerState.dragStartX;
            viewerState.panY = event.clientY - viewerState.dragStartY;
            updateStageTransform();
            return;
        }

        updateMagnifier(pointerX, pointerY);
    });

    function finishPointerInteraction(event) {
        if (!viewerState.isDragging) {
            return;
        }

        viewerState.isDragging = false;

        if (imageDisplayContainer.hasPointerCapture(event.pointerId)) {
            imageDisplayContainer.releasePointerCapture(event.pointerId);
        }

        updateViewerCursorState();

        const rect = imageDisplayContainer.getBoundingClientRect();
        const pointerX = typeof event.clientX === 'number' ? event.clientX - rect.left : viewerState.pointerX;
        const pointerY = typeof event.clientY === 'number' ? event.clientY - rect.top : viewerState.pointerY;
        updateMagnifier(pointerX, pointerY);
    }

    imageDisplayContainer.addEventListener('pointerup', finishPointerInteraction);
    imageDisplayContainer.addEventListener('pointercancel', finishPointerInteraction);
    imageDisplayContainer.addEventListener('pointerleave', () => {
        if (!viewerState.isDragging) {
            hideMagnifier();
            updateViewerCursorState();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (sectionDashboard.classList.contains('hidden')) {
            return;
        }
        if (e.key === 'Escape' && previewState.open) {
            closeAssetPreview();
            return;
        }
        if (e.key === 'ArrowLeft') {
            navigateTo(currentIndex - 1);
        }
        if (e.key === 'ArrowRight') {
            navigateTo(currentIndex + 1);
        }
        if (e.key === '+' || e.key === '=') {
            setZoom(viewerState.scale + viewerState.zoomStep);
        }
        if (e.key === '-' || e.key === '_') {
            setZoom(viewerState.scale - viewerState.zoomStep);
        }
        if (e.key === '0') {
            setZoom(1);
        }
        if (e.key === 'Escape' && viewerState.maximized) {
            setMaximized(false);
        }
    });

    function renderDashboard(data) {
        sectionUpload.classList.add('hidden');
        sectionDashboard.classList.remove('hidden');

        const saveNote = data.history_saved ? 'Saved to history' : (currentUser ? 'History save skipped' : 'Guest mode');
        currentArtifacts = {
            jobId: data.job_id,
            stagePlotUrl: data.job_id && data.summary.total_teeth ? `/output/${data.job_id}/report_plots/stage_distribution.png` : '',
            strengthPlotUrl: data.job_id && data.summary.total_teeth ? `/output/${data.job_id}/report_plots/strength_distribution.png` : '',
            pdfUrl: data.pdf_url || '',
            csvUrl: data.csv_url || '',
        };

        const settingsBar = document.querySelector('.settings-bar');
        if (settingsBar) settingsBar.classList.remove('hidden');

        const timeStr = data.processing_time_ms ? ` processed in ${(data.processing_time_ms / 1000).toFixed(2)}s` : '';
        document.getElementById('job-id-display').innerText = `Job ID: ${data.job_id.substring(0, 8)}${timeStr} - ${saveNote}`;
        btnDownloadPdf.href = currentArtifacts.pdfUrl || '#';
        btnDownloadCsv.href = currentArtifacts.csvUrl || '#';
        setPreviewButtonState(btnPreviewPdf, Boolean(currentArtifacts.pdfUrl));
        setPreviewButtonState(btnPreviewCsv, Boolean(currentArtifacts.csvUrl));
        setDownloadLinkState(btnDownloadPdf, Boolean(currentArtifacts.pdfUrl));
        setDownloadLinkState(btnDownloadCsv, Boolean(currentArtifacts.csvUrl));
        setPreviewButtonState(plotStageCard, Boolean(currentArtifacts.stagePlotUrl));
        setPreviewButtonState(plotStrengthCard, Boolean(currentArtifacts.strengthPlotUrl));

        document.getElementById('tot-images').innerText = data.summary.total_images;
        document.getElementById('tot-teeth').innerText = data.summary.total_teeth;

        if (currentArtifacts.stagePlotUrl) {
            plotStageImage.src = currentArtifacts.stagePlotUrl;
        } else {
            plotStageImage.removeAttribute('src');
        }

        if (currentArtifacts.strengthPlotUrl) {
            plotStrengthImage.src = currentArtifacts.strengthPlotUrl;
        } else {
            plotStrengthImage.removeAttribute('src');
        }

        currentImages = data.images || [];
        currentIndex = 0;
        imageSelect.innerHTML = '';
        currentImages.forEach((imgObj, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.innerText = imgObj.filename;
            imageSelect.appendChild(opt);
        });

        reportsByImage = {};
        (data.reports || []).forEach((row) => {
            const fname = row.image_filename;
            if (!reportsByImage[fname]) {
                reportsByImage[fname] = [];
            }
            reportsByImage[fname].push(row);
        });

        if (currentImages.length > 0) {
            navigateTo(0);
        } else {
            imageCounter.textContent = '0 / 0';
            setVisualImage('');
        }
    }

    function renderTableForImage(filename) {
        const tbody = document.getElementById('results-tbody');
        tbody.innerHTML = '';

        const rows = reportsByImage[filename] || [];

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem;">No tooth data for this image.</td></tr>';
            return;
        }

        rows.forEach((row) => {
            const tr = document.createElement('tr');
            let badgeClass = 'healthy';
            if (row.strength < 50) {
                badgeClass = 'danger';
            } else if (row.strength < 75) {
                badgeClass = 'warning';
            }
            tr.innerHTML = `
                <td><strong>${row.FDI}</strong></td>
                <td>${row.strength}%</td>
                <td>${row.stage}</td>
                <td><span class="badge ${badgeClass}">${row.strength >= 75 ? 'Optimal' : (row.strength >= 50 ? 'Monitor' : 'Critical')}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function setVisualImage(url) {
        hideMagnifier();

        if (!url) {
            visualImageDisplay.removeAttribute('src');
            viewerState.baseWidth = 0;
            viewerState.baseHeight = 0;
            viewerState.baseLeft = 0;
            viewerState.baseTop = 0;
            resetViewerTransforms();
            return;
        }

        if (visualImageDisplay.getAttribute('src') === url && visualImageDisplay.complete) {
            resetViewerTransforms();
            scheduleStageSync();
            return;
        }

        visualImageDisplay.src = url;
    }

    function resetView() {
        closeAssetPreview();

        if (viewerState.maximized) {
            setMaximized(false);
        }

        resetViewerTransforms();
        sectionDashboard.classList.add('hidden');

        stateLoading.classList.add('hidden');
        dropZone.classList.remove('hidden');
        const settingsBar = document.querySelector('.settings-bar');
        if (settingsBar) settingsBar.classList.remove('hidden');
        document.querySelector('.hero-text').classList.remove('hidden');
        fileInput.value = '';

        if (currentUser || sectionAuth.classList.contains('hidden')) {
            sectionUpload.classList.remove('hidden');
        } else {
            sectionUpload.classList.add('hidden');
            sectionAuth.classList.remove('hidden');
        }

        sectionUpload.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    btnReset.addEventListener('click', resetView);
    document.getElementById('reprocess-btn').addEventListener('click', handleReprocess);
    btnGuest.addEventListener('click', () => {
        clearSession();
        setAuthMessage('You are continuing as a guest.');
        showAppEntry();
    });
    btnLogout.addEventListener('click', () => {
        clearSession();
        setAuthMessage('Signed out. Sign in again to access saved history.');
        resetView();
        showAuthGate();
    });
    btnRefreshHistory.addEventListener('click', refreshHistory);
    homeLogo.addEventListener('click', () => {
        resetView();
    });

    async function bootstrap() {
        try {
            await fetchPublicConfig();
            const restored = await restoreSession();
            await initializeGoogleSignIn();

            if (restored) {
                showAppEntry();
                await loadHistory();
            } else {
                showAuthGate();
            }

            lucide.createIcons();
        } catch (err) {
            setAuthMessage(err.message || 'Failed to initialize application.', true);
            showAuthGate();
        }
    }

    setMagnifierEnabled(lensToggle.checked);
    updateViewerButtons();
    setPreviewButtonState(btnPreviewPdf, false);
    setPreviewButtonState(btnPreviewCsv, false);
    setPreviewButtonState(plotStageCard, false);
    setPreviewButtonState(plotStrengthCard, false);
    setDownloadLinkState(btnDownloadPdf, false);
    setDownloadLinkState(btnDownloadCsv, false);
    bootstrap();
});
