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

    let currentImages = [];
    let currentIndex = 0;
    let reportsByImage = {};

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
    });

    function renderDashboard(data) {
        sectionUpload.classList.add('hidden');
        sectionDashboard.classList.remove('hidden');

        const saveNote = data.history_saved ? 'Saved to history' : (currentUser ? 'History save skipped' : 'Guest mode');
        document.getElementById('job-id-display').innerText = `Job ID: ${data.job_id.substring(0, 8)} · ${saveNote}`;
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
        document.getElementById('visual-image-display').src = url;
    }

    function resetView() {
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

    bootstrap();
});
