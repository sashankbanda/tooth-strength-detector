document.addEventListener('DOMContentLoaded', () => {
    
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    // Core Layout Sections
    const sectionUpload = document.getElementById('upload-section');
    const stateLoading = document.getElementById('loading-state');
    const sectionDashboard = document.getElementById('dashboard-section');
    
    // UI Binding
    const btnReset = document.getElementById('reset-btn');
    const imageSelect = document.getElementById('image-select');
    const btnPrev = document.getElementById('prev-btn');
    const btnNext = document.getElementById('next-btn');
    const imageCounter = document.getElementById('image-counter');
    
    // Prevention of defaults
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Drag highlights
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) { dropZone.classList.add('dragover'); }
    function unhighlight(e) { dropZone.classList.remove('dragover'); }

    // Drop Execution
    dropZone.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFileSelect, false);

    function handleDrop(e) {
        let dt = e.dataTransfer;
        let files = dt.files;
        handleFiles(files);
    }
    
    function handleFileSelect(e) {
        let files = e.target.files;
        handleFiles(files);
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        
        let file = files[0];
        // Ensure its valid
        const validNames = file.name.match(/\.(zip|jpg|jpeg|png)$/i);
        if(!validNames) {
            alert('Invalid file format. Please upload a ZIP or image file.');
            return;
        }

        startFileUpload(file);
    }

    function startFileUpload(file) {
        // Transition to loader
        dropZone.classList.add('hidden');
        document.querySelector('.hero-text').classList.add('hidden');
        stateLoading.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);

        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if(!response.ok) throw new Error('Upload Failed');
            return response.json();
        })
        .then(result => {
            if(result.status === "success") {
                renderDashboard(result.data);
            } else {
                throw new Error('Processing Error');
            }
        })
        .catch(err => {
            alert('An error occurred: ' + err.message);
            resetView();
        });
    }

    let currentImages = [];
    let currentIndex = 0;

    function navigateTo(index) {
        if (index < 0 || index >= currentImages.length) return;
        currentIndex = index;
        imageSelect.value = currentIndex;
        setVisualImage(currentImages[currentIndex].url);
        imageCounter.textContent = `${currentIndex + 1} / ${currentImages.length}`;
        btnPrev.disabled = currentIndex === 0;
        btnNext.disabled = currentIndex === currentImages.length - 1;
        lucide.createIcons();
    }

    btnPrev.addEventListener('click', () => navigateTo(currentIndex - 1));
    btnNext.addEventListener('click', () => navigateTo(currentIndex + 1));

    // Keyboard arrow key navigation
    document.addEventListener('keydown', (e) => {
        if (sectionDashboard.classList.contains('hidden')) return;
        if (e.key === 'ArrowLeft') navigateTo(currentIndex - 1);
        if (e.key === 'ArrowRight') navigateTo(currentIndex + 1);
    });

    function renderDashboard(data) {
        sectionUpload.classList.add('hidden');
        sectionDashboard.classList.remove('hidden');
        
        // Headers
        document.getElementById('job-id-display').innerText = `Job ID: ${data.job_id.substring(0,8)}`;
        document.getElementById('download-pdf-btn').href = data.pdf_url;
        document.getElementById('download-csv-btn').href = data.csv_url;
        
        // Main Stats
        document.getElementById('tot-images').innerText = data.summary.total_images;
        document.getElementById('tot-teeth').innerText = data.summary.total_teeth;
        
        // Plots (Fallback to empty string if not found but backend returns them)
        document.getElementById('plot-stage-dist').src = `/static/output/${data.job_id}/report_plots/stage_distribution.png`;
        document.getElementById('plot-strength-dist').src = `/static/output/${data.job_id}/report_plots/strength_distribution.png`;

        // Images Setup
        currentImages = data.images;
        currentIndex = 0;
        imageSelect.innerHTML = '';
        currentImages.forEach((imgObj, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.innerText = imgObj.filename;
            imageSelect.appendChild(opt);
        });

        imageSelect.addEventListener('change', (e) => {
            navigateTo(parseInt(e.target.value));
        });

        if(currentImages.length > 0) {
            navigateTo(0);
        }

        // Output Table
        const tbody = document.getElementById('results-tbody');
        tbody.innerHTML = '';
        
        data.reports.forEach(row => {
            const tr = document.createElement('tr');
            
            // Badge style derived from strength
            let badgeClass = 'healthy';
            if(row.strength < 50) badgeClass = 'danger';
            else if(row.strength < 75) badgeClass = 'warning';

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
        sectionUpload.classList.remove('hidden');
        
        stateLoading.classList.add('hidden');
        dropZone.classList.remove('hidden');
        document.querySelector('.hero-text').classList.remove('hidden');
        fileInput.value = '';
    }

    btnReset.addEventListener('click', resetView);
});
