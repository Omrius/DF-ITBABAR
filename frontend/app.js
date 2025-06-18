// app.js
const BACKEND_BASE_URL = 'https://df-itbabar.onrender.com'; // Assurez-vous que cette URL est correcte

// --- Éléments de l'écran de connexion ---
const loginScreen = document.getElementById('login-screen');
const passwordInput = document.getElementById('password-input');
const loginButton = document.getElementById('login-button');
const loginErrorMessage = document.getElementById('login-error-message');
const appContent = document.getElementById('app-content');

// --- Éléments de l'application principale ---
const fileInput = document.getElementById('file-input');
const creditTypeSelect = document.getElementById('credit-type-select');
const thresholdInput = document.getElementById('threshold-input');
const predictButton = document.getElementById('predict-button');
const uploadStatus = document.getElementById('upload-status');
const resultsSection = document.querySelector('.results-section');
const predictionsTableBody = document.querySelector('#predictions-table tbody');
const showMoreButton = document.getElementById('show-more-button');
const noMoreClientsMessage = document.getElementById('no-more-clients');

// --- Éléments de résumé du fichier ---
const summaryFilename = document.getElementById('summary-filename');
const summaryFilesize = document.getElementById('summary-filesize');
const summaryNumClients = document.getElementById('summary-numclients');
const summaryAppetentClients = document.getElementById('summary-appetent-clients');
const summaryThreshold = document.getElementById('summary-threshold');
const summarySupportedFeatures = document.getElementById('summary-supported-features');
const summaryIgnoredFeatures = document.getElementById('summary-ignored-features');
const summaryMissingFeatures = document.getElementById('summary-missing-features');

// --- Éléments des métriques du modèle ---
const modelMetricsDisplay = document.getElementById('model-metrics-display');
const metricAccuracy = document.getElementById('metric-accuracy');
const metricRecall = document.getElementById('metric-recall');
const metricF1 = document.getElementById('metric-f1');
const metricAucRoc = document.getElementById('metric-auc-roc');
const featureImportanceChart = document.getElementById('feature-importance-chart');
const chartUnavailable = document.getElementById('chart-unavailable');

// --- Éléments des boutons de téléchargement ---
const downloadPdfButton = document.getElementById('download-pdf-button');
const downloadCsvButton = document.getElementById('download-csv-button');
const downloadXlsxButton = document.getElementById('download-xlsx-button');


let currentPredictionsData = [];
let currentPage = 0;
const ITEMS_PER_PAGE = 10; // Nombre de clients à afficher par clic sur "Afficher plus"

// --- Configuration du mot de passe (À CHANGER POUR LA PRODUCTION AVEC UN SYSTÈME SÉCURISÉ) ---
const CORRECT_PASSWORD = "passwordfitbabar062525"; // Assurez-vous que c'est le mot de passe que vous voulez

// --- LOGIQUE DE CONNEXION ---
loginButton.addEventListener('click', () => {
    const enteredPassword = passwordInput.value;
    if (enteredPassword === CORRECT_PASSWORD) {
        loginScreen.classList.add('hidden');
        appContent.classList.remove('hidden');
        loginErrorMessage.textContent = ''; // Clear any previous error
    } else {
        loginErrorMessage.textContent = 'Mot de passe incorrect. Veuillez réessayer.';
        passwordInput.value = ''; // Clear the input field
    }
});

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginButton.click(); // Trigger login button click on Enter key
    }
});


// --- LOGIQUE DE L'APPLICATION PRINCIPALE (active après connexion) ---

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        predictButton.disabled = false;
        uploadStatus.textContent = `Fichier sélectionné : ${fileInput.files[0].name}`;
        uploadStatus.style.color = '#333';
    } else {
        predictButton.disabled = true;
        uploadStatus.textContent = 'Aucun fichier sélectionné.';
        uploadStatus.style.color = 'red';
    }
});

predictButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    const creditType = creditTypeSelect.value;
    const appetenceThreshold = parseFloat(thresholdInput.value);

    if (!file) {
        uploadStatus.textContent = 'Veuillez sélectionner un fichier.';
        uploadStatus.style.color = 'red';
        return;
    }

    if (isNaN(appetenceThreshold) || appetenceThreshold <= 0 || appetenceThreshold >= 1) {
        uploadStatus.textContent = 'Le seuil d\'appétence doit être entre 0.01 et 0.99.';
        uploadStatus.style.color = 'red';
        return;
    }

    uploadStatus.textContent = 'Analyse en cours... Veuillez patienter.';
    uploadStatus.style.color = 'blue';
    predictButton.disabled = true;
    resultsSection.classList.add('hidden'); // Hide results until new ones are ready
    predictionsTableBody.innerHTML = ''; // Clear previous results
    currentPage = 0; // Reset pagination
    showMoreButton.classList.add('hidden');
    noMoreClientsMessage.classList.add('hidden');
    featureImportanceChart.classList.add('hidden');
    chartUnavailable.classList.add('hidden');

    // Désactiver les boutons de téléchargement précédents
    downloadPdfButton.disabled = true;
    downloadCsvButton.disabled = true;
    downloadXlsxButton.disabled = true;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('credit_type', creditType);
    formData.append('appetence_threshold', appetenceThreshold);

    try {
        const response = await fetch(`${BACKEND_BASE_URL}/predict_aptitude/`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        uploadStatus.textContent = data.message;
        uploadStatus.style.color = 'green';
        predictButton.disabled = false;
        resultsSection.classList.remove('hidden');

        currentPredictionsData = data.predictions_with_details;
        displayPredictions(); // Display initial set of predictions

        // Update file analysis summary
        summaryFilename.textContent = data.file_analysis.nom_fichier || 'N/A';
        summaryFilesize.textContent = data.file_analysis.taille_fichier || 'N/A';
        summaryNumClients.textContent = data.file_analysis.nombre_lignes || 'N/A';
        summaryAppetentClients.textContent = data.file_analysis.nombre_clients_appetents || 'N/A';
        summaryThreshold.textContent = data.file_analysis.seuil_appetence_utilise || 'N/A';
        summarySupportedFeatures.textContent = data.file_analysis.critères_pris_en_charge ? data.file_analysis.critères_pris_en_charge.join(', ') : 'N/A';
        summaryIgnoredFeatures.textContent = data.file_analysis.critères_non_pris_en_charge_a_ignorer ? data.file_analysis.critères_non_pris_en_charge_a_ignorer.join(', ') : 'Aucun';
        summaryMissingFeatures.textContent = data.file_analysis.critères_manquants_a_entrainer ? data.file_analysis.critères_manquants_a_entrainer.join(', ') : 'Aucun';

        // Update model metrics
        const metrics = data.model_metrics || {};
        metricAccuracy.textContent = metrics.accuracy ? metrics.accuracy.toFixed(2) : 'N/A';
        metricRecall.textContent = metrics.recall ? metrics.recall.toFixed(2) : 'N/A';
        metricF1.textContent = metrics.f1_score ? metrics.f1_score.toFixed(2) : 'N/A';
        metricAucRoc.textContent = metrics.roc_auc ? metrics.roc_auc.toFixed(2) : 'N/A';

        // Feature importance chart
        const featureImportanceImage = metrics.feature_importance_image;
        if (featureImportanceImage) {
            featureImportanceChart.src = `data:image/png;base64,${featureImportanceImage}`;
            featureImportanceChart.classList.remove('hidden');
            chartUnavailable.classList.add('hidden');
        } else {
            featureImportanceChart.classList.add('hidden');
            chartUnavailable.classList.remove('hidden');
        }

        // Activer les boutons de téléchargement si les chemins sont disponibles
        if (data.report_paths && data.report_paths.pdf) {
            downloadPdfButton.disabled = false;
            downloadPdfButton.dataset.filename = data.report_paths.pdf;
        } else {
            downloadPdfButton.disabled = true;
        }
        if (data.report_paths && data.report_paths.csv) {
            downloadCsvButton.disabled = false;
            downloadCsvButton.dataset.filename = data.report_paths.csv;
        } else {
            downloadCsvButton.disabled = true;
        }
        if (data.report_paths && data.report_paths.xlsx) {
            downloadXlsxButton.disabled = false;
            downloadXlsxButton.dataset.filename = data.report_paths.xlsx;
        } else {
            downloadXlsxButton.disabled = true;
        }

    } catch (error) {
        console.error('Détail de l\'erreur :', error);
        uploadStatus.textContent = `Erreur lors de l'analyse : ${error.message}`;
        uploadStatus.style.color = 'red';
        predictButton.disabled = false;
        resultsSection.classList.add('hidden'); // Hide results section on error
    }
});

showMoreButton.addEventListener('click', displayPredictions);

function displayPredictions() {
    const startIndex = currentPage * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const clientsToDisplay = currentPredictionsData.slice(startIndex, endIndex);

    if (clientsToDisplay.length === 0) {
        showMoreButton.classList.add('hidden');
        noMoreClientsMessage.classList.remove('hidden');
        return;
    }

    clientsToDisplay.forEach(client => {
        const row = predictionsTableBody.insertRow();
        
        // Ensure all expected columns are present, using 'N/A' for missing ones
        const originalData = client.original_data || {};
        const clientIdentifier = originalData.client_identifier !== undefined && originalData.client_identifier !== null ? originalData.client_identifier : 'N/A';
        const age = originalData.age !== undefined && originalData.age !== null ? originalData.age : 'N/A';
        const revenu = originalData.revenu !== undefined && originalData.revenu !== null ? originalData.revenu : 'N/A';
        const nbEnfants = originalData.nb_enfants !== undefined && originalData.nb_enfants !== null ? originalData.nb_enfants : 'N/A';
        const statutPro = originalData.statut_pro !== undefined && originalData.statut_pro !== null ? originalData.statut_pro : 'N/A';
        const ancienneteClientAnnees = originalData.anciennete_client_annees !== undefined && originalData.anciennete_client_annees !== null ? originalData.anciennete_client_annees : 'N/A';
        const creditExistantConso = originalData.credit_existant_conso !== undefined && originalData.credit_existant_conso !== null ? (originalData.credit_existant_conso ? 'Oui' : 'Non') : 'N/A';
        
        row.insertCell().textContent = clientIdentifier;
        row.insertCell().textContent = age;
        row.insertCell().textContent = revenu;
        row.insertCell().textContent = nbEnfants;
        row.insertCell().textContent = statutPro;
        row.insertCell().textContent = ancienneteClientAnnees;
        row.insertCell().textContent = creditExistantConso;
        row.insertCell().textContent = (client.score_appetence * 100).toFixed(2) + '%';
        
        // CORRECTION ICI : Vérifier si c'est un tableau avant d'utiliser .join()
        row.insertCell().textContent = Array.isArray(client.observations_forces) && client.observations_forces.length > 0 ? client.observations_forces.join(', ') : 'N/A';
        row.insertCell().textContent = Array.isArray(client.observations_faiblesses) && client.observations_faiblesses.length > 0 ? client.observations_faiblesses.join(', ') : 'N/A';
    });

    currentPage++;
    if (endIndex >= currentPredictionsData.length) {
        showMoreButton.classList.add('hidden');
        noMoreClientsMessage.classList.remove('hidden');
    } else {
        showMoreButton.classList.remove('hidden');
        noMoreClientsMessage.classList.add('hidden');
    }
}


// --- Fonctions de téléchargement des rapports ---
downloadPdfButton.addEventListener('click', () => downloadReport('pdf'));
downloadCsvButton.addEventListener('click', () => downloadReport('csv'));
downloadXlsxButton.addEventListener('click', () => downloadReport('xlsx'));

async function downloadReport(type) {
    const filename = event.target.dataset.filename;
    if (!filename) {
        alert('Nom de fichier non défini pour le téléchargement.');
        return;
    }
    const downloadURL = `${BACKEND_BASE_URL}/download_${type}/${filename}`;
    try {
        const response = await fetch(downloadURL);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erreur de téléchargement: ${response.status} - ${errorText}`);
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error(`Erreur lors du téléchargement du rapport ${type}:`, error);
        alert(`Échec du téléchargement du rapport ${type}. Veuillez réessayer. Détail: ${error.message}`);
    }
}
