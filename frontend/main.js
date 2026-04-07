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

    function ensureCanonicalLocalhost() {
        if (window.location.hostname !== '127.0.0.1') {
            return false;
        }

        const redirectUrl = `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ''}${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(redirectUrl);
        return true;
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
        const res = await fetch('/api/auth/me', {
            headers: getAuthHeaders(),
        });
        if (!res.ok) {
            clearSession();
            return false;
        }
        const me = await res.json();
        setCurrentUser(me);
        return true;
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
    }

    function showAppEntry() {
        sectionAuth.classList.add('hidden');
        sectionUpload.classList.remove('hidden');
        sectionHistory.classList.toggle('hidden', !currentUser);
    }

    async function loadHistory() {
        if (!authToken || !currentUser) {
            sectionHistory.classList.add('hidden');
            return;
        }

        const res = await fetch('/api/history', {
            headers: getAuthHeaders(),
        });

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
        sectionDashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                <div>
                    <h4>${item.source_filename}</h4>
                    <p>${createdAt}</p>
                </div>
                <div class="history-metrics">
                    <span>${item.total_images} images</span>
                    <span>${item.total_teeth} teeth</span>
                    <span>${item.records_count} records</span>
                    ${item.csv_url ? `<a href="${item.csv_url}" target="_blank">CSV</a>` : ''}
                    ${item.pdf_url ? `<a href="${item.pdf_url}" target="_blank">PDF</a>` : ''}
                </div>
            `;

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
        dropZone.classList.add('hidden');
        document.querySelector('.hero-text').classList.add('hidden');
        stateLoading.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);

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
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.detail || 'Upload failed');
                }
                return response.json();
            })
            .then((result) => {
                if (result.status === 'success') {
                    renderDashboard(result.data);
                    if (currentUser) {
                        refreshHistory();
                    }
                } else {
                    throw new Error('Processing error');
                }
            })
            .catch((err) => {
                alert('An error occurred: ' + err.message);
                resetView();
            });
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
        document.getElementById('job-id-display').innerText = `Job ID: ${data.job_id.substring(0, 8)} - ${saveNote}`;
        document.getElementById('download-pdf-btn').href = data.pdf_url || '#';
        document.getElementById('download-csv-btn').href = data.csv_url || '#';

        document.getElementById('tot-images').innerText = data.summary.total_images;
        document.getElementById('tot-teeth').innerText = data.summary.total_teeth;

        document.getElementById('plot-stage-dist').src = `/static/output/${data.job_id}/report_plots/stage_distribution.png`;
        document.getElementById('plot-strength-dist').src = `/static/output/${data.job_id}/report_plots/strength_distribution.png`;

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
        if (viewerState.maximized) {
            setMaximized(false);
        }

        resetViewerTransforms();
        sectionDashboard.classList.add('hidden');

        stateLoading.classList.add('hidden');
        dropZone.classList.remove('hidden');
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
            if (ensureCanonicalLocalhost()) {
                return;
            }

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
    bootstrap();
});
