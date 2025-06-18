// app.js
const BACKEND_BASE_URL = 'https://df-itbabar.onrender.com'; // Ensure this URL is correct

// --- Login screen elements ---
const loginScreen = document.getElementById('login-screen');
const passwordInput = document.getElementById('password-input');
const loginButton = document.getElementById('login-button');
const loginErrorMessage = document.getElementById('login-error-message');
const appContent = document.getElementById('app-content');

// --- Main application elements ---
const fileInput = document.getElementById('file-input');
const creditTypeSelect = document.getElementById('credit-type-select');
const thresholdInput = document.getElementById('threshold-input');
const predictButton = document.getElementById('predict-button');
const uploadStatus = document.getElementById('upload-status');
const resultsContent = document.getElementById('results-content'); // For raw predictions
const predictionsTableBody = document.querySelector('#predictions-table tbody');
const showMoreButton = document.getElementById('show-more-button');
const noMoreClientsMessage = document.getElementById('no-more-clients');

// --- File Summary elements ---
const summaryFilename = document.getElementById('summary-filename');
const summaryFilesize = document.getElementById('summary-filesize');
const summaryNumClients = document.getElementById('summary-numclients');
const summaryAppetentClients = document.getElementById('summary-appetent-clients');
const summaryThreshold = document.getElementById('summary-threshold');
const summarySupportedFeatures = document.getElementById('summary-supported-features');
const summaryIgnoredFeatures = document.getElementById('summary-ignored-features');
const summaryMissingFeatures = document.getElementById('summary-missing-features');

// --- Model Metrics elements ---
const metricAccuracy = document.getElementById('metric-accuracy');
const metricRecall = document.getElementById('metric-recall');
const metricF1 = document.getElementById('metric-f1');
const metricAucRoc = document.getElementById('metric-auc-roc');
const featureImportanceChart = document.getElementById('feature-importance-chart');
const chartUnavailable = document.getElementById('chart-unavailable');

// --- Download buttons elements ---
const downloadPdfButton = document.getElementById('download-pdf-button');
const downloadCsvButton = document.getElementById('download-csv-button');
const downloadXlsxButton = document.getElementById('download-xlsx-button');

// --- Main sections and sidebar items ---
const mainSections = document.querySelectorAll('.main-section');
const sidebarItems = document.querySelectorAll('.sidebar-item');

let currentPredictionsData = [];
let currentPage = 0;
const ITEMS_PER_PAGE = 10; // Number of clients to display per "Show more" click

// Store the full analysis data from the last successful prediction
let lastAnalysisData = null;

// --- Password configuration (CHANGE FOR PRODUCTION WITH A SECURE SYSTEM) ---
const CORRECT_PASSWORD = "passwordfitbabar062525"; // Ensure this is the correct password

// --- LOGIN LOGIC ---
loginButton.addEventListener('click', () => {
    const enteredPassword = passwordInput.value;
    if (enteredPassword === CORRECT_PASSWORD) {
        loginScreen.classList.add('hidden');
        appContent.classList.remove('hidden');
        loginErrorMessage.textContent = ''; // Clear any previous error
        // Automatically show the upload section after login
        showSection('upload-section');
    } else {
        showMessage('Mot de passe incorrect. Veuillez réessayer.', 'error', loginErrorMessage);
        passwordInput.value = ''; // Clear the input field
    }
});

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginButton.click(); // Trigger login button click on Enter key
    }
});


// --- UTILITY FUNCTIONS FOR MESSAGES AND LOADING ---
function showMessage(message, type = 'info', element = uploadStatus) {
    element.textContent = message;
    element.className = `message ${type}`;
    element.style.opacity = '0';
    // Small delay to ensure CSS transition applies
    setTimeout(() => {
      element.style.transition = 'opacity 0.5s ease-in-out';
      element.style.opacity = '1';
    }, 10);
}

function clearMessages(element = uploadStatus) {
    element.textContent = '';
    element.className = 'message';
    element.style.opacity = '0';
    element.style.transition = 'none';
}

function showLoading(show) {
    const loadingIndicator = document.getElementById('loading-indicator'); // Make sure this element exists
    if (show) {
        loadingIndicator.classList.remove('hidden');
        predictButton.disabled = true;
        downloadPdfButton.disabled = true;
        downloadCsvButton.disabled = true;
        downloadXlsxButton.disabled = true;
        // Hide all results sections while loading
        mainSections.forEach(section => section.classList.add('hidden'));
        // Clear previous data in tables/content areas
        predictionsTableBody.innerHTML = '';
        resultsContent.textContent = '';
        featureImportanceChart.classList.add('hidden');
        chartUnavailable.classList.add('hidden');
        // Keep only the upload section visible
        document.getElementById('upload-section').classList.remove('hidden');
        // Deactivate sidebar items
        sidebarItems.forEach(item => item.classList.remove('active'));
    } else {
        loadingIndicator.classList.add('hidden');
        predictButton.disabled = false;
    }
}

// --- FUNCTION TO MANAGE MAIN SECTION DISPLAY ---
function showSection(sectionId) {
    mainSections.forEach(section => {
        if (section.id === sectionId) {
            section.classList.remove('hidden');
            section.classList.add('active-section'); // Add active class for specific styles if needed
        } else {
            section.classList.add('hidden');
            section.classList.remove('active-section');
        }
    });

    sidebarItems.forEach(item => {
        if (item.dataset.section === sectionId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Re-render specific content if data is available and section is being shown
    if (lastAnalysisData) {
        if (sectionId === 'ia-performance-section') {
            updateIaMetrics(lastAnalysisData.model_metrics);
        } else if (sectionId === 'file-analysis-section') {
            updateFileAnalysis(lastAnalysisData.file_analysis);
        } else if (sectionId === 'client-scoring-results') {
            updateClientScoringTable(lastAnalysisData.predictions_with_details);
        } else if (sectionId === 'raw-predictions-section') {
            resultsContent.textContent = JSON.stringify(lastAnalysisData.predictions, null, 2);
        }
    }
}


// --- MAIN APPLICATION LOGIC (active after login) ---

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        predictButton.disabled = false;
        document.querySelector('.file-label').innerHTML = `<i class="fas fa-file-upload"></i> ${fileInput.files[0].name}`;
        clearMessages(); // Clear any previous status messages
    } else {
        predictButton.disabled = true;
        document.querySelector('.file-label').innerHTML = `<i class="fas fa-file-upload"></i> Choisir un fichier`;
        // No error message here, just reset label
    }
});

predictButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    const creditType = creditTypeSelect.value;
    const appetenceThreshold = parseFloat(thresholdInput.value);

    if (!file) {
        showMessage('Veuillez sélectionner un fichier.', 'error');
        return;
    }

    if (isNaN(appetenceThreshold) || appetenceThreshold <= 0 || appetenceThreshold >= 1) {
        showMessage('Le seuil d\'appétence doit être entre 0.01 et 0.99.', 'error');
        return;
    }

    showMessage('Analyse en cours... Veuillez patienter.', 'info');
    showLoading(true);

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
        console.log("Données de réponse du backend:", data); // Log the full response for debugging
        lastAnalysisData = data; // Store the data for displaying in other sections

        showMessage('Fichier analysé avec succès. Rapports générés.', 'success');
        
        // Update and display relevant results sections
        updateFileAnalysis(data.file_analysis);
        updateIaMetrics(data.model_metrics);
        updateClientScoringTable(data.predictions_with_details);
        resultsContent.textContent = JSON.stringify(data.predictions, null, 2); // Update raw content

        // --- Débogage pour les chemins de rapport ---
        console.log("Chemins de rapport reçus:", data.report_paths);
        
        // Enable download buttons if paths are available
        if (data.report_paths) {
            if (data.report_paths.pdf) {
                downloadPdfButton.disabled = false;
                downloadPdfButton.dataset.filename = data.report_paths.pdf;
                console.log("PDF path found, button enabled:", data.report_paths.pdf);
            } else {
                downloadPdfButton.disabled = true;
                console.log("PDF path not found or empty, button disabled.");
            }
            if (data.report_paths.csv) {
                downloadCsvButton.disabled = false;
                downloadCsvButton.dataset.filename = data.report_paths.csv;
                console.log("CSV path found, button enabled:", data.report_paths.csv);
            } else {
                downloadCsvButton.disabled = true;
            }
            if (data.report_paths.xlsx) {
                downloadXlsxButton.disabled = false;
                downloadXlsxButton.dataset.filename = data.report_paths.xlsx;
                console.log("XLSX path found, button enabled:", data.report_paths.xlsx);
            } else {
                downloadXlsxButton.disabled = true;
            }
        } else {
             downloadPdfButton.disabled = true;
             downloadCsvButton.disabled = true;
             downloadXlsxButton.disabled = true;
             console.log("No report_paths object received, all download buttons disabled.");
        }

        // After successful analysis, automatically show client results
        showSection('client-scoring-results');

    } catch (error) {
        console.error('Détail de l\'erreur :', error);
        showMessage(`❌ Erreur lors de l'analyse : ${error.message}`, 'error');
        resultsContent.textContent = error.toString();
    } finally {
        showLoading(false);
    }
});

showMoreButton.addEventListener('click', () => displayPredictions(
    Array.from(document.querySelectorAll('#predictions-table thead th')).slice(0, -3).map(th => th.dataset.originalKey || th.textContent)
)); // Pass current keys for table, excluding last 3 fixed headers


// Map common backend keys to more user-friendly French names for display
const COLUMN_DISPLAY_NAMES = {
    'client_identifier': 'Client',
    'age': 'Âge',
    'revenu': 'Revenu',
    'nb_enfants': 'Nb Enfants',
    'statut_pro': 'Statut Pro',
    'anciennete_client_annees': 'Ancienneté Client (Années)',
    'credit_existant_conso': 'Crédit Conso Existant',
    'situation_familiale': 'Situation familiale',
    'anciennete_emploi': 'Ancienneté Emploi',
    'duree_credit': 'Durée Crédit',
    'montant_credit': 'Montant Crédit',
    'score_banque': 'Score Banque',
    'historique_paiement': 'Historique Paiement',
    // Ajoutez d'autres mappings ici si nécessaire
};

function updateClientScoringTable(predictionsWithDetails) {
    currentPredictionsData = predictionsWithDetails;
    currentPage = 0; // Reset pagination
    predictionsTableBody.innerHTML = ''; // Clear existing table rows

    const tableHeaderRow = document.querySelector('#predictions-table thead tr');
    tableHeaderRow.innerHTML = ''; // Clear existing headers

    if (!predictionsWithDetails || predictionsWithDetails.length === 0) {
        tableHeaderRow.innerHTML = `<th>Client</th><th>Score d'Appétence</th><th>Forces</th><th>Faiblesses</th>`; // Default minimal headers
        predictionsTableBody.innerHTML = '<tr><td colspan="4">Aucun résultat de scoring détaillé disponible.</td></tr>';
        showMoreButton.classList.add('hidden');
        noMoreClientsMessage.classList.remove('hidden');
        return;
    }

    // Get all unique keys from original_data of ALL predictions for comprehensive headers
    let allOriginalDataKeys = new Set();
    predictionsWithDetails.forEach(client => {
        if (client.original_data) {
            Object.keys(client.original_data).forEach(key => allOriginalDataKeys.add(key));
        }
    });

    // Convert Set to Array and sort for consistent order
    let sortedKeys = Array.from(allOriginalDataKeys).sort();

    // Prioritize certain columns to appear first, then others alphabetically
    const prioritizedKeys = [
        'client_identifier', 'age', 'revenu', 'nb_enfants', 'statut_pro',
        'anciennete_client_annees', 'credit_existant_conso', 'situation_familiale',
        'anciennete_emploi', 'duree_credit', 'montant_credit', 'score_banque', 'historique_paiement'
    ];
    
    // Create a final ordered list of keys for the table header
    let finalOrderedKeys = [];
    prioritizedKeys.forEach(key => {
        if (sortedKeys.includes(key)) {
            finalOrderedKeys.push(key);
            sortedKeys = sortedKeys.filter(k => k !== key); // Remove from sortedKeys to avoid duplication
        }
    });
    finalOrderedKeys = finalOrderedKeys.concat(sortedKeys); // Add remaining keys alphabetically

    // Add original data headers
    finalOrderedKeys.forEach(key => {
        const displayHeader = COLUMN_DISPLAY_NAMES[key] || key.replace(/_/g, ' ').capitalize();
        const th = document.createElement('th');
        th.textContent = displayHeader;
        th.dataset.originalKey = key; // Store original key for dynamic lookup
        tableHeaderRow.appendChild(th);
    });

    // Add prediction-specific headers (always at the end)
    const fixedHeaders = ["Score d'Appétence", "Forces", "Faiblesses"];
    fixedHeaders.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        tableHeaderRow.appendChild(th);
    });

    displayPredictions(finalOrderedKeys); // Pass the final ordered keys to displayPredictions
}


function displayPredictions(columnKeys) { // Receive the ordered list of column keys
    const startIndex = currentPage * ITEMS_PER_PAGE;
    let endIndex = startIndex + ITEMS_PER_PAGE;

    if (endIndex > currentPredictionsData.length) {
        endIndex = currentPredictionsData.length;
    }

    const clientsToDisplay = currentPredictionsData.slice(startIndex, endIndex);

    // Clear only if it's the first page
    if (currentPage === 0) {
        predictionsTableBody.innerHTML = '';
    }

    if (clientsToDisplay.length === 0 && currentPage === 0) {
        predictionsTableBody.innerHTML = `<tr><td colspan="${columnKeys.length + 3}">Aucun résultat de scoring détaillé disponible.</td></tr>`;
        showMoreButton.classList.add('hidden');
        noMoreClientsMessage.classList.remove('hidden');
        return;
    } else if (clientsToDisplay.length === 0 && currentPage > 0) {
        showMoreButton.classList.add('hidden');
        noMoreClientsMessage.classList.remove('hidden');
        return;
    }

    clientsToDisplay.forEach(client => {
        const row = predictionsTableBody.insertRow();
        const originalData = client.original_data || {};

        // Populate cells dynamically based on the ordered columnKeys
        columnKeys.forEach(key => {
            let value = originalData[key];
            if (value === undefined || value === null) {
                value = 'N/A';
            } else if (typeof value === 'boolean') {
                value = value ? 'Oui' : 'Non';
            }
            const cell = row.insertCell();
            cell.textContent = value;
            cell.setAttribute('data-label', COLUMN_DISPLAY_NAMES[key] || key.replace(/_/g, ' ').capitalize()); // For responsive table
        });
        
        const scoreCell = row.insertCell();
        scoreCell.textContent = client.score_appetence ? (client.score_appetence * 100).toFixed(2) + '%' : 'N/A';
        scoreCell.setAttribute('data-label', "Score d'Appétence");

        // --- Correction pour Forces et Faiblesses ---
        const forcesCell = row.insertCell();
        // Vérifie si c'est une chaîne non vide ou un tableau non vide
        let forcesText = 'N/A';
        if (typeof client.observations_forces === 'string' && client.observations_forces.trim() !== '') {
            forcesText = client.observations_forces;
        } else if (Array.isArray(client.observations_forces) && client.observations_forces.length > 0) {
            forcesText = client.observations_forces.join(', ');
        }
        forcesCell.textContent = forcesText;
        forcesCell.setAttribute('data-label', "Forces");
        console.log(`Client ${client.client_identifier || 'N/A'}: Forces -`, client.observations_forces, `(Affiche: ${forcesText})`);


        const weaknessesCell = row.insertCell();
        // Vérifie si c'est une chaîne non vide ou un tableau non vide
        let weaknessesText = 'N/A';
        if (typeof client.observations_faiblesses === 'string' && client.observations_faiblesses.trim() !== '') {
            weaknessesText = client.observations_faiblesses;
        } else if (Array.isArray(client.observations_faiblesses) && client.observations_faiblesses.length > 0) {
            weaknessesText = client.observations_faiblesses.join(', ');
        }
        weaknessesCell.textContent = weaknessesText;
        weaknessesCell.setAttribute('data-label', "Faiblesses");
        console.log(`Client ${client.client_identifier || 'N/A'}: Faiblesses -`, client.observations_faiblesses, `(Affiche: ${weaknessesText})`);
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


// --- Functions to update metric contents ---
function updateIaMetrics(metrics) {
    if (!metrics || Object.keys(metrics).length === 0) {
        document.getElementById('ia-performance-section').querySelector('.metric-content').innerHTML = '<p>Métriques de performance non disponibles ou non chargées.</p>';
        featureImportanceChart.classList.add('hidden');
        chartUnavailable.classList.remove('hidden');
        return;
    }

    let html = `
        <h3>Métriques Clés</h3>
        <ul>
            <li><strong>Accuracy:</strong> <span>${metrics.accuracy ? metrics.accuracy.toFixed(4) : 'N/A'}</span></li>
            <li><strong>Precision:</strong> <span>${metrics.precision ? metrics.precision.toFixed(4) : 'N/A'}</span></li>
            <li><strong>Recall:</strong> <span>${metrics.recall ? metrics.recall.toFixed(4) : 'N/A'}</span></li>
            <li><strong>F1-Score:</strong> <span>${metrics.f1_score ? metrics.f1_score.toFixed(4) : 'N/A'}</span></li>
            <li><strong>ROC AUC:</strong> <span>${metrics.roc_auc ? metrics.roc_auc.toFixed(4) : 'N/A'}</span></li>
        </ul>
        <h3>Définitions des métriques:</h3>
        <p>
          <strong>Recall (Rappel):</strong> Mesure la capacité du modèle à identifier toutes les instances positives réelles. C'est la proportion de vrais positifs parmi tous les positifs réels.<br>
          <em>Formule: VP / (VP + FN)</em>
        </p>
        <p>
          <strong>F1-Score:</strong> Moyenne harmonique de la précision et du rappel. Il atteint sa meilleure valeur à 1 et sa pire à 0, utile pour les classes déséquilibrées.<br>
          <em>Formule: 2 * (Précision * Rappel) / (Précision + Rappel)</em>
        </p>
    `;

    // Display feature importances
    const featureImportances = metrics.feature_importances;
    if (featureImportances && featureImportances.length > 0) {
      html += `<h3>Caractéristiques influentes:</h3>`;
      html += `<div class="feature-importances-list">`;
      
      // Top 5 features
      html += `<h4>Top 5 des caractéristiques les plus influentes:</h4>`;
      for (let i = 0; i < Math.min(5, featureImportances.length); i++) {
        const [feature, importance] = featureImportances[i];
        const displayFeatureName = feature.replace(/_/g, ' ').capitalize();
        html += `<div class="feature-item">
                   <span>${displayFeatureName}</span>
                   <div class="feature-bar-container">
                     <div class="feature-bar" style="width: ${(importance * 100).toFixed(2)}%;"></div>
                   </div>
                   <span class="importance-value">${importance.toFixed(4)}</span>
                 </div>`;
      }

      // Flop 5 features (if more than 5 total features)
      if (featureImportances.length > 5) {
        html += `<h4>Top 5 des caractéristiques les moins influentes:</h4>`;
        for (let i = Math.max(0, featureImportances.length - 5); i < featureImportances.length; i++) {
          const [feature, importance] = featureImportances[i];
          const displayFeatureName = feature.replace(/_/g, ' ').capitalize();
          html += `<div class="feature-item">
                     <span>${displayFeatureName}</span>
                     <div class="feature-bar-container">
                       <div class="feature-bar" style="width: ${(importance * 100).toFixed(2)}%;"></div>
                     </div>
                     <span class="importance-value">${importance.toFixed(4)}</span>
                   </div>`;
        }
      }
      html += `</div>`;
    } else {
        html += '<p>Importances des caractéristiques non disponibles.</p>';
    }

    document.getElementById('ia-performance-section').querySelector('.metric-content').innerHTML = html;

    // Handle feature importance chart image
    const featureImportanceImage = metrics.feature_importance_image;
    if (featureImportanceImage) {
        featureImportanceChart.src = `data:image/png;base64,${featureImportanceImage}`;
        featureImportanceChart.classList.remove('hidden');
        chartUnavailable.classList.add('hidden');
    } else {
        featureImportanceChart.classList.add('hidden');
        chartUnavailable.classList.remove('hidden');
    }
}

function updateFileAnalysis(analysis) {
    if (!analysis || Object.keys(analysis).length === 0) {
        document.getElementById('file-analysis-section').querySelector('.metric-content').innerHTML = '<p>Analyse du fichier non disponible.</p>';
        return;
    }

    summaryFilename.textContent = analysis.nom_fichier || 'N/A';
    summaryFilesize.textContent = analysis.taille_fichier || 'N/A';
    summaryNumClients.textContent = analysis.nombre_lignes || 'N/A';
    summaryAppetentClients.textContent = analysis.nombre_clients_appetents !== undefined ? analysis.nombre_clients_appetents : '0';
    summaryThreshold.textContent = analysis.seuil_appetence_utilise !== undefined ? analysis.seuil_appetence_utilise : '0.5';

    summarySupportedFeatures.textContent = (analysis.critères_pris_en_charge && analysis.critères_pris_en_charge.join(', ')) || 'Aucun';
    summaryIgnoredFeatures.textContent = (analysis.critères_non_pris_en_charge_a_ignorer && analysis.critères_non_pris_en_charge_a_ignorer.join(', ')) || 'Aucun';
    summaryMissingFeatures.textContent = (analysis.critères_manquants_a_entrainer && analysis.critères_manquants_a_entrainer.join(', ')) || 'Aucun';
}


// --- Sidebar navigation logic ---
sidebarItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = item.dataset.section;
        if (sectionId) {
            showSection(sectionId);
        }
    });
});

// --- Download report functions ---
downloadPdfButton.addEventListener('click', (event) => downloadReport('pdf', event));
downloadCsvButton.addEventListener('click', (event) => downloadReport('csv', event));
downloadXlsxButton.addEventListener('click', (event) => downloadReport('xlsx', event));

async function downloadReport(type, event) {
    const filename = event.target.dataset.filename;
    if (!filename) {
        showMessage(`Nom de fichier non défini pour le téléchargement ${type}.`, 'error');
        return;
    }
    const downloadURL = `${BACKEND_BASE_URL}/download_${type}/${filename}`;
    console.log(`Tentative de téléchargement de : ${downloadURL}`);
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
        showMessage(`Rapport ${type.toUpperCase()} téléchargé avec succès !`, 'success');
    } catch (error) {
        console.error(`Erreur lors du téléchargement du rapport ${type}:`, error);
        showMessage(`Échec du téléchargement du rapport ${type}. Veuillez réessayer. Détail : ${error.message}`, 'error');
    }
}

// Helper function for capitalizing first letter of each word (for display)
String.prototype.capitalize = function() {
    return this.replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
};
