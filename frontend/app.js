document.addEventListener('DOMContentLoaded', () => {
  // Récupération des éléments de l'écran de connexion
  const loginScreen = document.getElementById('login-screen');
  const appContent = document.getElementById('app-content');
  const passwordInput = document.getElementById('password-input');
  const loginButton = document.getElementById('login-button');
  const loginErrorMessage = document.getElementById('login-error-message');

  // --- Initialisation après connexion ---
  // Cette fonction sera appelée une fois que l'utilisateur est connecté.
  function initializeApp() {
    // Masquer l'écran de connexion et afficher le contenu de l'application
    if (loginScreen) loginScreen.classList.add('hidden');
    if (appContent) appContent.classList.remove('hidden');

    // Récupération de tous les éléments du DOM après que 'app-content' soit visible
    const fileInput = document.getElementById('fileInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const confirmationDiv = document.getElementById('confirmation');
    const creditTypeSelect = document.getElementById('creditType');
    const appetenceThresholdInput = document.getElementById('appetenceThreshold');
    const downloadReportBtn = document.getElementById('downloadReportBtn');
    const downloadCsvBtn = document.getElementById('downloadCsvBtn');
    const downloadXlsxBtn = document.getElementById('downloadXlsxBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');

    const mainSections = document.querySelectorAll('.main-section');
    const sidebarItems = document.querySelectorAll('.sidebar-item');

    const iaMetricsContent = document.getElementById('iaMetricsContent');
    const fileMetricsContent = document.getElementById('fileMetricsContent');
    const predictionsTable = document.getElementById('predictions-table'); // Correction: c'était clientScoringTableContainer
    const showMoreButton = document.getElementById('show-more-button');
    const noMoreClientsMessage = document.getElementById('no-more-clients');
    const rawPredictionsContent = document.getElementById('results-content'); // Correspond à <pre id="results-content">

    let currentReportPaths = {};
    let lastAnalysisData = null; // Stocke les données de la dernière analyse complète
    let currentPage = 0; // Page actuelle du tableau des clients
    const ITEMS_PER_PAGE = 10; // Nombre d'éléments affichés par "page" dans le tableau

    // --- Fonctions utilitaires pour les messages ---
    function showMessage(message, type = 'info') {
      if (confirmationDiv) {
        confirmationDiv.textContent = message;
        confirmationDiv.className = `message ${type}`;
        confirmationDiv.style.opacity = '1';
        confirmationDiv.classList.remove('hidden');
        // Masquer le message après quelques secondes
        setTimeout(() => {
          confirmationDiv.style.opacity = '0';
          confirmationDiv.classList.add('hidden');
        }, 5000);
      } else {
        console.warn("Element 'confirmation' not found for displaying messages.");
      }
    }

    function hideMessage() {
      if (confirmationDiv) {
        confirmationDiv.classList.add('hidden');
        confirmationDiv.style.opacity = '0';
      }
    }

    // --- Gestion de l'affichage des sections via la sidebar ---
    sidebarItems.forEach(item => {
      item.addEventListener('click', function(event) {
        event.preventDefault();
        const targetSectionId = this.dataset.section;

        sidebarItems.forEach(link => link.classList.remove('active'));
        this.classList.add('active');

        mainSections.forEach(section => {
          if (section.id === targetSectionId) {
            section.classList.remove('hidden');
            // Réappliquer la classe fade-in pour déclencher l'animation
            section.classList.remove('fade-in');
            void section.offsetWidth; // Force reflow
            section.classList.add('fade-in');
          } else {
            section.classList.add('hidden');
          }
        });
      });
    });

    // --- Fonction pour afficher le tableau des clients ---
    function displayClientScoringResults(data, page = 0) {
      if (!predictionsTable || !showMoreButton || !noMoreClientsMessage) {
        console.error("Un ou plusieurs éléments du tableau des clients sont manquants.");
        return;
      }

      const tbody = predictionsTable.querySelector('tbody');
      const theadRow = predictionsTable.querySelector('thead tr');

      if (page === 0) { // Pour la première page, effacer tout et recréer les en-têtes
        tbody.innerHTML = '';
        theadRow.innerHTML = '';

        // Création des en-têtes dynamiques
        if (data.predictions_with_details && data.predictions_with_details.length > 0) {
          const firstClient = data.predictions_with_details[0];
          // Colonnes à afficher : 'original_data' keys + 'score_appetence' + 'observations_forces' + 'observations_faiblesses'
          const headers = [
            ...Object.keys(firstClient.original_data),
            'score_appetence',
            'observations_forces',
            'observations_faiblesses'
          ];
          headers.forEach(header => {
            const th = document.createElement('th');
            // Traduction simple des en-têtes pour une meilleure lisibilité
            let displayHeader = header.replace(/_/g, ' ').replace('score appetence', 'Score Appétence').replace('observations forces', 'Forces').replace('observations faiblesses', 'Faiblesses').replace('original data', 'Données Client');
            th.textContent = displayHeader.charAt(0).toUpperCase() + displayHeader.slice(1);
            theadRow.appendChild(th);
          });
        }
      }

      const startIndex = page * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      const clientsToDisplay = data.predictions_with_details.slice(startIndex, endIndex);

      clientsToDisplay.forEach(client => {
        const row = tbody.insertRow();
        const clientData = {
          ...client.original_data,
          'score_appetence': `${(client.score_appetence * 100).toFixed(2)}%`,
          'observations_forces': client.observations_forces,
          'observations_faiblesses': client.observations_faiblesses
        };

        // Remplir les cellules de la ligne dans le même ordre que les en-têtes
        const headers = Array.from(theadRow.children).map(th => th.textContent.replace(/\s/g, '_').toLowerCase()); // Reconstruire les noms originaux des en-têtes

        headers.forEach(header => {
          const cell = row.insertCell();
          let cellValue;
          // Mapper les en-têtes traduits vers les clés de clientData
          if (header === 'score_appétence') {
            cellValue = clientData['score_appetence'];
          } else if (header === 'forces') {
            cellValue = clientData['observations_forces'];
          } else if (header === 'faiblesses') {
            cellValue = clientData['observations_faiblesses'];
          } else {
            // Pour les données originales, retrouver la clé exacte
            const originalKey = Object.keys(client.original_data).find(k => k.replace(/_/g, ' ').toLowerCase() === header);
            if (originalKey) {
                cellValue = clientData[originalKey];
            } else {
                cellValue = 'N/A'; // Fallback si la colonne n'est pas trouvée
            }
          }
          cell.textContent = cellValue === null ? 'N/A' : cellValue;
        });
      });

      currentPage++;

      // Gérer le bouton "Afficher plus"
      if (endIndex < data.predictions_with_details.length) {
        showMoreButton.classList.remove('hidden');
        noMoreClientsMessage.classList.add('hidden');
      } else {
        showMoreButton.classList.add('hidden');
        noMoreClientsMessage.classList.remove('hidden');
      }
    }

    // --- Fonction pour afficher les métriques de performance IA ---
    function displayIaMetrics(metrics) {
      if (!iaMetricsContent) {
        console.error("Element 'iaMetricsContent' not found.");
        return;
      }
      iaMetricsContent.innerHTML = ''; // Nettoyer le contenu précédent

      if (Object.keys(metrics).length === 0) {
        iaMetricsContent.innerHTML = '<p class="message info">Aucune métrique de performance disponible pour ce modèle.</p>';
        return;
      }

      let metricsHtml = '<div class="metric-grid">';
      for (const key in metrics) {
        if (key !== 'feature_importances' && metrics.hasOwnProperty(key)) {
          let value = metrics[key];
          let displayValue = typeof value === 'number' ? value.toFixed(2) : value;
          let displayName = key.replace(/_/g, ' ').replace('accuracy', 'Précision').replace('recall', 'Rappel').replace('f1 score', 'Score F1').replace('roc auc', 'AUC-ROC');
          metricsHtml += `
            <div class="metric-card">
              <span class="metric-label">${displayName.charAt(0).toUpperCase() + displayName.slice(1)}:</span>
              <span class="metric-value">${displayValue}</span>
            </div>
          `;
        }
      }
      metricsHtml += '</div>';

      // Affichage du graphique d'importance des caractéristiques (si disponible)
      if (metrics.feature_importances && metrics.feature_importances.length > 0) {
        metricsHtml += '<h3>Importance des Caractéristiques</h3><div id="featureImportanceChart" class="chart-container"></div>';
        // Le graphique sera généré séparément par une bibliothèque de graphiques si nécessaire
      } else {
        metricsHtml += '<p class="message info">Graphique d\'importance des caractéristiques non disponible.</p>';
      }

      iaMetricsContent.innerHTML = metricsHtml;

      // TODO: Si le backend renvoie une image base64 pour le graphique, l'afficher ici
    }


    // --- Fonction pour afficher l'analyse du fichier client ---
    function displayFileAnalysis(analysis) {
      if (!fileMetricsContent) {
        console.error("Element 'fileMetricsContent' not found.");
        return;
      }
      fileMetricsContent.innerHTML = ''; // Nettoyer le contenu précédent

      let analysisHtml = '<ul>';
      analysisHtml += `<li><strong>Nom du fichier:</strong> <span>${analysis.nom_fichier || 'N/A'}</span></li>`;
      analysisHtml += `<li><strong>Taille du fichier:</strong> <span>${analysis.taille_fichier || 'N/A'}</span></li>`;
      analysisHtml += `<li><strong>Nombre de lignes:</strong> <span>${analysis.nombre_lignes || 'N/A'}</span></li>`;
      analysisHtml += `<li><strong>Nombre de colonnes:</strong> <span>${analysis.nombre_colonnes || 'N/A'}</span></li>`;
      analysisHtml += `<li><strong>Clients appétents:</strong> <span>${analysis.nombre_clients_appetents || 0} (Seuil: ${(analysis.seuil_appetence_utilise * 100).toFixed(0)}%)</span></li>`;

      if (analysis.colonnes && analysis.colonnes.length > 0) {
        analysisHtml += `<li><strong>Colonnes détectées:</strong> <span>${analysis.colonnes.join(', ')}</span></li>`;
      }
      if (analysis.critères_pris_en_charge && analysis.critères_pris_en_charge.length > 0) {
        analysisHtml += `<li><strong>Critères pris en charge par le modèle:</strong> <span>${analysis.critères_pris_en_charge.join(', ')}</span></li>`;
      }
      if (analysis.critères_non_pris_en_charge_a_ignorer && analysis.critères_non_pris_en_charge_a_ignorer.length > 0) {
        analysisHtml += `<li><strong>Critères ignorés (non pris en charge):</strong> <span class="warning-text">${analysis.critères_non_pris_en_charge_a_ignorer.join(', ')}</span></li>`;
      }
      if (analysis.critères_manquants_a_entrainer && analysis.critères_manquants_a_entrainer.length > 0) {
        analysisHtml += `<li><strong>Critères manquants (utilisés par le modèle, valeurs par défaut):</strong> <span class="error-text">${analysis.critères_manquants_a_entrainer.join(', ')}</span></li>`;
      }

      analysisHtml += '</ul>';

      // Afficher un résumé statistique pour les colonnes numériques
      if (analysis.resume_statistique) {
        analysisHtml += '<h3>Résumé Statistique des Données Numériques</h3>';
        analysisHtml += '<div class="stats-grid">';
        for (const colName in analysis.resume_statistique) {
          if (analysis.resume_statistique.hasOwnProperty(colName) && analysis.resume_statistique[colName].count !== undefined) {
            analysisHtml += `
              <div class="stat-card">
                <h4>${colName.charAt(0).toUpperCase() + colName.slice(1).replace(/_/g, ' ')}</h4>
                <p><strong>Count:</strong> ${analysis.resume_statistique[colName].count}</p>
                <p><strong>Mean:</strong> ${analysis.resume_statistique[colName].mean !== null ? analysis.resume_statistique[colName].mean.toFixed(2) : 'N/A'}</p>
                <p><strong>Std:</strong> ${analysis.resume_statistique[colName].std !== null ? analysis.resume_statistique[colName].std.toFixed(2) : 'N/A'}</p>
                <p><strong>Min:</strong> ${analysis.resume_statistique[colName].min !== null ? analysis.resume_statistique[colName].min.toFixed(2) : 'N/A'}</p>
                <p><strong>Max:</strong> ${analysis.resume_statistique[colName].max !== null ? analysis.resume_statistique[colName].max.toFixed(2) : 'N/A'}</p>
              </div>
            `;
          }
        }
        analysisHtml += '</div>';
      }

      fileMetricsContent.innerHTML = analysisHtml;
    }

    // --- Fonction pour afficher les résultats bruts ---
    function displayRawPredictions(rawData) {
      if (rawPredictionsContent) {
        rawPredictionsContent.textContent = JSON.stringify(rawData, null, 2);
      } else {
        console.error("Element 'results-content' not found."); // Correction de l'ID ici
      }
    }

    // --- Gestion du bouton d'analyse ---
    if (analyzeBtn && fileInput && creditTypeSelect && appetenceThresholdInput && loadingIndicator) {
      analyzeBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        const creditType = creditTypeSelect.value;
        const appetenceThreshold = parseFloat(appetenceThresholdInput.value) / 100; // Convertir en décimal

        if (!file) {
          showMessage('Veuillez sélectionner un fichier avant d\'analyser.', 'error');
          return;
        }

        hideMessage();
        loadingIndicator.classList.remove('hidden'); // Afficher l'indicateur de chargement
        analyzeBtn.disabled = true; // Désactiver le bouton pendant l'analyse
        downloadReportBtn.disabled = true; // Désactiver les boutons de téléchargement
        downloadCsvBtn.disabled = true;
        downloadXlsxBtn.disabled = true;
        downloadReportBtn.classList.add('hidden'); // Cacher les boutons de téléchargement
        downloadCsvBtn.classList.add('hidden');
        downloadXlsxBtn.classList.add('hidden');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('credit_type', creditType);
        formData.append('appetence_threshold', appetenceThreshold);

        try {
          const response = await fetch('http://localhost:8000/predict_aptitude/', { // URL pour le backend local
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            let errorData = await response.json();
            throw new Error(errorData.detail || `Erreur HTTP: ${response.status}`);
          }

          const data = await response.json();
          lastAnalysisData = data; // Stocker les données de la dernière analyse

          showMessage('Analyse terminée avec succès !', 'success');

          // Réinitialiser la pagination et afficher les premiers clients
          currentPage = 0;
          displayClientScoringResults(lastAnalysisData, currentPage);

          // Afficher les autres sections avec les données
          displayIaMetrics(data.model_metrics);
          displayFileAnalysis(data.file_analysis);
          displayRawPredictions(data); // Affiche toutes les données brutes dans la section dédiée

          // Mettre à jour les chemins des rapports et activer les boutons de téléchargement
          currentReportPaths = data.report_paths;
          if (currentReportPaths.pdf) {
            downloadReportBtn.classList.remove('hidden');
            downloadReportBtn.disabled = false;
          }
          if (currentReportPaths.csv) {
            downloadCsvBtn.classList.remove('hidden');
            downloadCsvBtn.disabled = false;
          }
          if (currentReportPaths.xlsx) {
            downloadXlsxBtn.classList.remove('hidden');
            downloadXlsxBtn.disabled = false;
          }

        } catch (error) {
          console.error('Erreur lors de l\'analyse du fichier:', error);
          showMessage(`Échec de l'analyse: ${error.message}`, 'error');
          // Nettoyer les sections en cas d'erreur
          if (iaMetricsContent) iaMetricsContent.innerHTML = '';
          if (fileMetricsContent) fileMetricsContent.innerHTML = '';
          if (predictionsTable) predictionsTable.querySelector('tbody').innerHTML = '';
          if (predictionsTable) predictionsTable.querySelector('thead tr').innerHTML = '';
          if (rawPredictionsContent) rawPredictionsContent.textContent = '';
        } finally {
          loadingIndicator.classList.add('hidden'); // Cacher l'indicateur
          analyzeBtn.disabled = false; // Réactiver le bouton
        }
      });

      // Gestion du bouton "Afficher plus de clients"
      if (showMoreButton) {
        showMoreButton.addEventListener('click', () => {
          if (lastAnalysisData) {
            displayClientScoringResults(lastAnalysisData, currentPage);
          }
        });
      }

      // --- Gestion des boutons de téléchargement des rapports ---
      if (downloadReportBtn) {
        downloadReportBtn.addEventListener('click', () => {
          if (currentReportPaths.pdf) {
            // Assurez-vous que l'URL correspond à votre backend déployé si vous n'êtes pas en local
            window.open(`http://localhost:8000/download_report/${currentReportPaths.pdf}`, '_blank');
          } else {
            showMessage('Aucun rapport PDF disponible pour le téléchargement.', 'error');
          }
        });
      }

      if (downloadCsvBtn) {
        downloadCsvBtn.addEventListener('click', () => {
          if (currentReportPaths.csv) {
             // Assurez-vous que l'URL correspond à votre backend déployé si vous n'êtes pas en local
            window.open(`http://localhost:8000/download_csv/${currentReportPaths.csv}`, '_blank');
          } else {
            showMessage('Aucun rapport CSV disponible pour le téléchargement.', 'error');
          }
        });
      }

      if (downloadXlsxBtn) {
        downloadXlsxBtn.addEventListener('click', () => {
          if (currentReportPaths.xlsx) {
             // Assurez-vous que l'URL correspond à votre backend déployé si vous n'êtes pas en local
            window.open(`http://localhost:8000/download_xlsx/${currentReportPaths.xlsx}`, '_blank');
          } else {
            showMessage('Aucun rapport XLSX disponible pour le téléchargement.', 'error');
          }
        });
      }

      // Gérer l'affichage du nom du fichier sélectionné
      if (fileInput) {
        fileInput.addEventListener('change', () => {
          const fileName = fileInput.files[0] ? fileInput.files[0].name : 'Choisir un fichier';
          const fileLabel = document.querySelector('.file-label');
          if (fileLabel) {
            fileLabel.innerHTML = `<i class="fas fa-file-upload"></i> ${fileName}`;
          }
        });
      }
    } else {
      console.error("Certains éléments principaux de l'interface utilisateur n'ont pas été trouvés après la connexion. Vérifiez les IDs HTML.");
    }
  } // Fin de initializeApp()

  // --- Logique de connexion ---
  if (loginButton && passwordInput && loginErrorMessage) {
    loginButton.addEventListener('click', () => {
      const password = passwordInput.value;
      const correctPassword = 'datafindser2024'; // VOTRE MOT DE PASSE

      if (password === correctPassword) {
        loginErrorMessage.classList.add('hidden');
        initializeApp(); // Initialiser l'application principale
      } else {
        loginErrorMessage.textContent = 'Mot de passe incorrect.';
        loginErrorMessage.classList.remove('hidden');
      }
    });

    // Permettre la connexion avec la touche "Entrée"
    passwordInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        loginButton.click();
      }
    });
  } else {
    console.error("Certains éléments de l'écran de connexion n'ont pas été trouvés.");
  }
});
