document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM entièrement chargé. Démarrage de l'application.");

  // Éléments de l'écran de connexion
  const loginScreen = document.getElementById('login-screen');
  const passwordInput = document.getElementById('password-input');
  const loginButton = document.getElementById('login-button');
  const loginErrorMessage = document.getElementById('login-error-message');
  const appContent = document.getElementById('app-content');

  // Éléments du tableau de bord (renommés pour correspondre à index.html)
  const fileInput = document.getElementById('fileInput');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const confirmationDiv = document.getElementById('confirmation');
  const creditTypeSelect = document.getElementById('creditType');
  const downloadReportBtn = document.getElementById('downloadReportBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const downloadXlsxBtn = document.getElementById('downloadXlsxBtn');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const thresholdInput = document.getElementById('threshold-input'); // Ajouté pour le seuil

  // Nouvelle structure pour les sections de contenu principal
  const mainSections = document.querySelectorAll('.main-section');
  const sidebarItems = document.querySelectorAll('.sidebar-item');

  // Conteneurs des métriques et tableaux
  const iaMetricsContent = document.getElementById('iaMetricsContent');
  const fileMetricsContent = document.getElementById('fileMetricsContent');
  const clientScoringTableContainer = document.getElementById('clientScoringTableContainer');
  const rawPredictionsContent = document.getElementById('rawPredictionsContent');

  let currentReportPaths = {};
  let lastAnalysisData = null; // Stocke les données de la dernière analyse
  let currentPage = 0; // Page actuelle du tableau des clients
  let ITEMS_PER_PAGE_GLOBAL = 10; // Nombre d'éléments par page, peut être modifié par "Afficher tout"

  // --- Fonctions utilitaires pour les messages ---
  function showMessage(message, type = 'info') {
    console.log(`Message (${type}): ${message}`);
    confirmationDiv.textContent = message;
    confirmationDiv.className = `message ${type}`;
    confirmationDiv.style.opacity = '1';
    setTimeout(() => {
      confirmationDiv.style.opacity = '0';
    }, 5000);
  }

  function showLoading(show) {
    if (show) {
      loadingIndicator.classList.remove('hidden');
      console.log("Affichage de l'indicateur de chargement.");
    } else {
      loadingIndicator.classList.add('hidden');
      console.log("Masquage de l'indicateur de chargement.");
    }
  }

  // --- Logique de connexion ---
  loginButton.addEventListener('click', () => {
    const password = passwordInput.value;
    const correctPassword = 'admin'; // C'est un mot de passe simple pour le test. À sécuriser en production!

    if (password === correctPassword) {
      loginScreen.classList.add('hidden');
      appContent.classList.remove('hidden');
      console.log("Connexion réussie. Affichage du contenu de l'application.");
      
      // Afficher la première section du tableau de bord par défaut (upload-section)
      const uploadSection = document.getElementById('upload-section');
      if (uploadSection) {
          uploadSection.classList.remove('hidden');
          uploadSection.classList.add('fade-in'); // Appliquer l'animation de fondu
          console.log("Section 'upload-section' affichée après connexion.");
      } else {
          console.warn("Section 'upload-section' introuvable.");
      }

      // Définir le premier élément de la barre latérale comme actif
      const firstSidebarItem = document.querySelector('.sidebar-item[data-section="upload-section"]');
      if (firstSidebarItem) {
          firstSidebarItem.classList.add('active');
      } else {
          console.warn("L'élément de la barre latérale pour 'upload-section' n'a pas été trouvé.");
      }

    } else {
      loginErrorMessage.textContent = 'Mot de passe incorrect. Veuillez réessayer.';
      loginErrorMessage.classList.remove('hidden');
      console.log("Échec de connexion: mot de passe incorrect.");
      setTimeout(() => {
        loginErrorMessage.classList.add('hidden');
      }, 3000);
    }
  });

  // Gestion de la saisie du fichier pour activer le bouton d'analyse
  fileInput.addEventListener('change', () => {
    const fileName = fileInput.files[0] ? fileInput.files[0].name : 'Choisir un fichier';
    const fileLabel = document.querySelector('.file-label');
    if (fileLabel) {
      fileLabel.innerHTML = `<i class="fas fa-file-upload"></i> ${fileName}`;
    }
    checkAnalysisButtonState();
  });

  creditTypeSelect.addEventListener('change', checkAnalysisButtonState);
  thresholdInput.addEventListener('input', checkAnalysisButtonState);


  function checkAnalysisButtonState() {
    const fileSelected = fileInput.files.length > 0;
    const creditTypeSelected = creditTypeSelect.value !== '';
    const thresholdValid = thresholdInput.value >= 0.01 && thresholdInput.value <= 0.99;
    
    if (fileSelected && creditTypeSelected && thresholdValid) {
      analyzeBtn.disabled = false;
    } else {
      analyzeBtn.disabled = true;
    }
  }

  // --- Gestion de la navigation entre sections ---
  sidebarItems.forEach(item => {
    item.addEventListener('click', function(event) {
      event.preventDefault();
      const targetSectionId = this.dataset.section;
      console.log(`Clic sur l'élément de la barre latérale: ${targetSectionId}`);

      mainSections.forEach(section => {
        if (section.id === targetSectionId) {
          section.classList.remove('hidden');
          section.classList.add('fade-in'); // Appliquer l'animation de fondu
          console.log(`Affichage de la section: ${section.id}`);
        } else {
          section.classList.remove('fade-in'); // S'assurer que le fondu disparaît avant de cacher
          section.classList.add('hidden');
          console.log(`Masquage de la section: ${section.id}`);
        }
      });

      sidebarItems.forEach(sItem => sItem.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // --- Gestion du bouton d'analyse ---
  analyzeBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    const creditType = creditTypeSelect.value;
    const threshold = thresholdInput.value;
    console.log("Bouton d'analyse cliqué.");

    if (!file) {
      showMessage('Veuillez sélectionner un fichier à analyser.', 'error');
      return;
    }

    if (!creditType) {
      showMessage('Veuillez sélectionner un type de crédit.', 'error');
      return;
    }

    if (!(threshold >= 0.01 && threshold <= 0.99)) {
      showMessage('Veuillez entrer un seuil d\'appétence valide entre 0.01 et 0.99.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('credit_type', creditType);
    formData.append('threshold', threshold); // Ajouter le seuil au FormData

    showLoading(true);
    showMessage('Analyse en cours, veuillez patienter...', 'info');
    downloadReportBtn.disabled = true;
    downloadCsvBtn.disabled = true;
    downloadXlsxBtn.disabled = true;

    try {
      // Utilisation de chemins relatifs pour les requêtes API (adapté à Render)
      const response = await fetch('/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        // Tenter de lire le corps de l'erreur si disponible, sinon utiliser le statut
        let errorMessage = `Erreur HTTP: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.detail || JSON.stringify(errorData);
        } catch (jsonError) {
            // Si la réponse n'est pas du JSON valide, utiliser le texte brut si possible
            const textError = await response.text();
            errorMessage = `Erreur serveur: ${response.status} - ${textError.substring(0, 200)}...`; // Limiter pour éviter les longs messages
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      lastAnalysisData = data; // Stocke les données pour un usage ultérieur

      showMessage('Analyse terminée avec succès !', 'success');
      console.log('Données de réponse du backend:', data);

      // Affichage des résultats dans les sections appropriées
      displayIaPerformanceMetrics(data.ia_performance_metrics);
      displayFileAnalysisMetrics(data.file_analysis_metrics, data.critères_non_pris_en_charge_a_ignorer || []);
      displayRawPredictions(data.raw_predictions); // Afficher les prédictions brutes
      
      // Initialisation de la pagination pour le tableau client
      currentPage = 0; // Réinitialise la page à 0
      ITEMS_PER_PAGE_GLOBAL = 10; // Réinitialise la pagination par défaut
      displayClientScoringResults(data); // Affiche la première page ou tout
      
      // Gérer les boutons de téléchargement
      currentReportPaths = data.report_paths || {};
      console.log('Chemins de rapport reçus:', currentReportPaths);

      // Utilisation de window.location.origin pour les téléchargements (adapté à Render)
      if (currentReportPaths.pdf && currentReportPaths.pdf !== '') {
        downloadReportBtn.disabled = false;
        console.log('PDF path found, button enabled:', currentReportPaths.pdf);
      } else {
        downloadReportBtn.disabled = true;
        console.log('PDF path not found or empty, button disabled.');
      }

      if (currentReportPaths.csv && currentReportPaths.csv !== '') {
        downloadCsvBtn.disabled = false;
        console.log('CSV path found, button enabled:', currentReportPaths.csv);
      } else {
        downloadCsvBtn.disabled = true;
        console.log('CSV path not found or empty, button disabled.');
      }

      if (currentReportPaths.xlsx && currentReportPaths.xlsx !== '') {
        downloadXlsxBtn.disabled = false;
        console.log('XLSX path found, button enabled:', currentReportPaths.xlsx);
      } else {
        downloadXlsxBtn.disabled = true;
        console.log('XLSX path not found or empty, button disabled.');
      }

    } catch (error) {
      console.error('Erreur lors de l\'analyse:', error);
      showMessage(`Erreur: ${error.message}`, 'error');
    } finally {
      showLoading(false);
    }
  });

  // --- Affichage des métriques de performance de l'IA ---
  function displayIaPerformanceMetrics(metrics) {
    if (!metrics) {
      iaMetricsContent.innerHTML = `<p class="message info">Aucune métrique de performance de l'IA disponible.</p>`;
      return;
    }

    iaMetricsContent.innerHTML = `
      <div class="metric-grid">
        <div class="metric-card">
          <i class="fas fa-chart-line metric-icon"></i>
          <h3>Précision Globale</h3>
          <p class="metric-value">${(metrics.accuracy * 100).toFixed(2)}%</p>
          <span class="metric-description">La proportion de prédictions correctes.</span>
        </div>
        <div class="metric-card">
          <i class="fas fa-robot metric-icon"></i>
          <h3>Recall (Rappel)</h3>
          <p class="metric-value">${(metrics.recall * 100).toFixed(2)}%</p>
          <span class="metric-description">Capacité à identifier tous les positifs réels.</span>
        </div>
        <div class="metric-card">
          <i class="fas fa-bullseye metric-icon"></i>
          <h3>Précision (Precision)</h3>
          <p class="metric-value">${(metrics.precision * 100).toFixed(2)}%</p>
          <span class="metric-description">Proportion de prédictions positives qui étaient réellement positives.</span>
        </div>
        <div class="metric-card">
          <i class="fas fa-f chart-pie metric-icon"></i>
          <h3>Score F1</h3>
          <p class="metric-value">${(metrics.f1_score * 100).toFixed(2)}%</p>
          <span class="metric-description">Moyenne pondérée de la précision et du rappel.</span>
        </div>
        <div class="metric-card">
          <i class="fas fa-arrows-alt-h metric-icon"></i>
          <h3>Seuil de Classification</h3>
          <p class="metric-value">${(metrics.classification_threshold).toFixed(3)}</p>
          <span class="metric-description">Le seuil utilisé pour classer les prédictions.</span>
        </div>
        <div class="metric-card">
          <i class="fas fa-clock metric-icon"></i>
          <h3>Temps d'inférence moyen</h3>
          <p class="metric-value">${(metrics.average_inference_time * 1000).toFixed(2)} ms</p>
          <span class="metric-description">Temps moyen pour une seule prédiction.</span>
        </div>
      </div>
      <div class="confusion-matrix-container">
        <h3>Matrice de Confusion</h3>
        <table class="confusion-matrix">
          <thead>
            <tr>
              <th></th>
              <th>Prédit Négatif</th>
              <th>Prédit Positif</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Réel Négatif</th>
              <td class="true-negative">${metrics.confusion_matrix.tn}</td>
              <td class="false-positive">${metrics.confusion_matrix.fp}</td>
            </tr>
            <tr>
              <th>Réel Positif</th>
              <td class="false-negative">${metrics.confusion_matrix.fn}</td>
              <td class="true-positive">${metrics.confusion_matrix.tp}</td>
            </tr>
          </tbody>
        </table>
        <div class="matrix-description">
            <p><strong>Vrai Positif (TP):</strong> Cas où le modèle a correctement prédit un événement positif.</p>
            <p><strong>Vrai Négatif (TN):</strong> Cas où le modèle a correctement prédit un événement négatif.</p>
            <p><strong>Faux Positif (FP):</strong> Cas où le modèle a prédit un événement positif, mais c'était un négatif réel (erreur de type I).</p>
            <p><strong>Faux Négatif (FN):</strong> Cas où le modèle a prédit un événement négatif, mais c'était un positif réel (erreur de type II).</p>
        </div>
      </div>
    `;
  }

  // --- Affichage des métriques d'analyse de fichier ---
  function displayFileAnalysisMetrics(metrics, ignoredFeatures) {
    if (!metrics) {
      fileMetricsContent.innerHTML = `<p class="message info">Aucune métrique d'analyse de fichier disponible.</p>`;
      return;
    }

    let ignoredFeaturesHtml = '';
    if (ignoredFeatures && ignoredFeatures.length > 0) {
      // Filter out 'Nom client' from the ignored features for display,
      // as it's typically handled separately by mapping to client_identifier
      const displayIgnoredFeatures = ignoredFeatures.filter(feature => !feature.toLowerCase().includes('nom client'));

      if (displayIgnoredFeatures.length > 0) {
          ignoredFeaturesHtml = `
            <div class="metric-card full-width">
              <h3><i class="fas fa-exclamation-triangle metric-icon text-accent"></i> Critères ignorés</h3>
              <p class="metric-description">Ces colonnes n'ont pas été utilisées dans l'analyse car elles ne sont pas pertinentes ou posent des problèmes de données :</p>
              <ul>
                ${displayIgnoredFeatures.map(feature => `<li>${feature}</li>`).join('')}
              </ul>
            </div>
          `;
      }
    }

    fileMetricsContent.innerHTML = `
      <div class="metric-grid">
        <div class="metric-card">
          <i class="fas fa-database metric-icon"></i>
          <h3>Nombre Total de Lignes</h3>
          <p class="metric-value">${metrics.total_rows}</p>
          <span class="metric-description">Nombre total d'enregistrements dans le fichier.</span>
        </div>
        <div class="metric-card">
          <i class="fas fa-columns metric-icon"></i>
          <h3>Nombre de Colonnes</h3>
          <p class="metric-value">${metrics.num_columns}</p>
          <span class="metric-description">Nombre de caractéristiques par enregistrement.</span>
        </div>
        <div class="metric-card">
          <i class="fas fa-percent metric-icon"></i>
          <h3>Pourcentage de Données Manquantes</h3>
          <p class="metric-value">${(metrics.missing_data_percentage).toFixed(2)}%</p>
          <span class="metric-description">Proportion de valeurs manquantes dans l'ensemble du fichier.</span>
        </div>
        <div class="metric-card">
          <i class="fas fa-cube metric-icon"></i>
          <h3>Dimensions du Fichier</h3>
          <p class="metric-value">${metrics.file_dimensions}</p>
          <span class="metric-description">Format (lignes x colonnes) du fichier traité.</span>
        </div>
        <div class="metric-card">
          <i class="fas fa-check-circle metric-icon"></i>
          <h3>Colonnes Traitées</h3>
          <p class="metric-value">${metrics.processed_columns_count}</p>
          <span class="metric-description">Nombre de colonnes utilisées dans le modèle.</span>
        </div>
        <div class="metric-card">
          <i class="fas fa-times-circle metric-icon"></i>
          <h3>Colonnes Ignorées</h3>
          <p class="metric-value">${metrics.ignored_columns_count}</p>
          <span class="metric-description">Nombre de colonnes non utilisées (doublons, non pertinentes).</span>
        </div>
        ${ignoredFeaturesHtml}
      </div>
    `;
  }

  // --- Affichage des résultats de scoring détaillés par client avec pagination ---
  function displayClientScoringResults(data) {
    if (!data || !data.predictions_with_details || data.predictions_with_details.length === 0) {
      clientScoringTableContainer.innerHTML = `<p class="message info">Aucun résultat de scoring détaillé disponible.</p>`;
      return;
    }

    const totalClients = data.predictions_with_details.length;
    const startIndex = currentPage * ITEMS_PER_PAGE_GLOBAL;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE_GLOBAL, totalClients);
    const clientsToDisplay = data.predictions_with_details.slice(startIndex, endIndex);

    let tableHtml = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Score de Crédit</th>
              <th>Appétence</th>
              <th>Probabilité</th>
              <th>Seuil</th>
              <th>Forces</th>
              <th>Faiblesses</th>
              <th>Stratégie Recommandée</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
    `;

    clientsToDisplay.forEach((client, index) => {
      // Adjusted clientName logic: use client.client_identifier if not 'N/A' or empty, else fallback to 'Client N'
      const clientName = (client.client_identifier && client.client_identifier.toUpperCase() !== 'N/A' && client.client_identifier.trim() !== '') ? client.client_identifier : `Client ${startIndex + index + 1}`;
      
      const appetenceClass = client.appetence_prediction === 'Oui' ? 'appetence-oui' : 'appetence-non';
      const scoreClass = client.credit_score === 'Faible' ? 'score-faible' : client.credit_score === 'Moyen' ? 'score-moyen' : 'score-eleve';
      
      // Ensure forces and weaknesses are arrays before mapping
      const forcesHtml = Array.isArray(client.forces) && client.forces.length > 0
        ? `<ul class="list-forces">${client.forces.map(f => `<li>${f}</li>`).join('')}</ul>`
        : 'N/A';
      const weaknessesHtml = Array.isArray(client.weaknesses) && client.weaknesses.length > 0
        ? `<ul class="list-weaknesses">${client.weaknesses.map(w => `<li>${w}</li>`).join('')}</ul>`
        : 'N/A';

      tableHtml += `
        <tr>
          <td>${clientName}</td>
          <td class="${scoreClass}">${client.credit_score}</td>
          <td class="${appetenceClass}">${client.appetence_prediction}</td>
          <td>${(client.probability * 100).toFixed(2)}%</td>
          <td>${(client.threshold).toFixed(3)}</td>
          <td>${forcesHtml}</td>
          <td>${weaknessesHtml}</td>
          <td>${client.recommended_strategy || 'N/A'}</td>
          <td><button class="btn-details" data-client-id="${clientName}">Voir plus</button></td>
        </tr>
      `;
    });

    tableHtml += `
          </tbody>
        </table>
      </div>
      <div class="pagination-controls">
        <button id="prevPageBtn" class="btn-secondary" ${currentPage === 0 ? 'disabled' : ''}>Précédent</button>
        <span id="page-info">Page ${currentPage + 1} sur ${Math.ceil(totalClients / ITEMS_PER_PAGE_GLOBAL)}</span>
        <button id="nextPageBtn" class="btn-secondary" ${endIndex >= totalClients ? 'disabled' : ''}>Suivant</button>
        ${totalClients > ITEMS_PER_PAGE_GLOBAL ? `<button id="showAllBtn" class="btn-secondary">Afficher tout (${totalClients})</button>` : ''}
      </div>
    `;
    clientScoringTableContainer.innerHTML = tableHtml;

    // Attacher les écouteurs d'événements pour la pagination
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const showAllBtn = document.getElementById('showAllBtn');
    const pageInfoSpan = document.getElementById('page-info');

    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', () => {
        if (currentPage > 0) {
          currentPage--;
          displayClientScoringResults(data);
        }
      });
      // Montrer les boutons de pagination s'il y a plus d'une page
      if (Math.ceil(totalClients / ITEMS_PER_PAGE_GLOBAL) > 1 && ITEMS_PER_PAGE_GLOBAL !== totalClients) {
          prevPageBtn.classList.remove('hidden');
          nextPageBtn.classList.remove('hidden');
          pageInfoSpan.classList.remove('hidden');
      } else {
          prevPageBtn.classList.add('hidden');
          nextPageBtn.classList.add('hidden');
          pageInfoSpan.classList.add('hidden');
      }
    }

    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', () => {
        if (endIndex < totalClients) {
          currentPage++;
          displayClientScoringResults(data);
        }
      });
    }

    if (showAllBtn) {
        // Condition pour afficher le bouton "Afficher tout" seulement si toutes les données ne sont pas déjà affichées
        if (totalClients > ITEMS_PER_PAGE_GLOBAL || (ITEMS_PER_PAGE_GLOBAL === totalClients && totalClients > 10)) { // Si plus que le ITEMS_PER_PAGE par défaut ou si affichage tout est actif pour >10 éléments
            showAllBtn.classList.remove('hidden');
        } else {
            showAllBtn.classList.add('hidden');
        }

        showAllBtn.addEventListener('click', () => {
            console.log("Bouton 'Afficher tout' cliqué.");
            currentPage = 0; // Revenir à la première "page" pour l'affichage de tout
            ITEMS_PER_PAGE_GLOBAL = totalClients; // Ajuste la variable pour afficher tous les éléments
            displayClientScoringResults(data); // Rappelle la fonction avec le nouveau réglage
            // Après avoir affiché tout, masquez les boutons de pagination et le bouton "Afficher tout" lui-même
            const prev = document.getElementById('prevPageBtn');
            const next = document.getElementById('nextPageBtn');
            const info = document.getElementById('page-info');
            if(prev) prev.classList.add('hidden');
            if(next) next.classList.add('hidden');
            if(info) info.classList.add('hidden');
            showAllBtn.classList.add('hidden'); // Désactive ce bouton une fois cliqué
        });
    }

    // Gestion des boutons "Voir plus" (si une modale ou une autre section de détails existe)
    document.querySelectorAll('.btn-details').forEach(button => {
      button.addEventListener('click', (event) => {
        const clientId = event.target.dataset.clientId;
        showMessage(`Afficher les détails pour le client: ${clientId}`, 'info');
      });
    });
  }

  // --- Affichage des résultats bruts de prédiction ---
  function displayRawPredictions(rawPredictions) {
      if (!rawPredictions || rawPredictions.length === 0) {
          rawPredictionsContent.innerHTML = `<p class="message info">Aucun résultat brut de prédiction disponible.</p>`;
          return;
      }

      let rawHtml = `
          <div class="table-responsive">
              <table class="data-table">
                  <thead>
                      <tr>
                          <!-- Créer les entêtes de colonnes dynamiquement à partir du premier objet -->
                          ${Object.keys(rawPredictions[0]).map(key => `<th>${key}</th>`).join('')}
                      </tr>
                  </thead>
                  <tbody>
      `;

      rawPredictions.forEach(row => {
          rawHtml += `<tr>`;
          Object.values(row).forEach(value => {
              rawHtml += `<td>${value}</td>`;
          });
          rawHtml += `</tr>`;
      });

      rawHtml += `
                  </tbody>
              </table>
          </div>
      `;
      rawPredictionsContent.innerHTML = rawHtml;
  }

  // --- Gestion des boutons de téléchargement des rapports ---\
  downloadReportBtn.addEventListener('click', () => {
    if (currentReportPaths.pdf) {
      // Utilisation de window.location.origin pour construire l'URL complète
      window.open(`${window.location.origin}/download_report/${currentReportPaths.pdf}`, '_blank');
      console.log("Tentative de téléchargement du PDF:", `${window.location.origin}/download_report/${currentReportPaths.pdf}`);
    } else {
      showMessage('Aucun rapport PDF disponible pour le téléchargement.', 'error');
    }
  });

  downloadCsvBtn.addEventListener('click', () => {
    if (currentReportPaths.csv) {
      // Utilisation de window.location.origin pour construire l'URL complète
      window.open(`${window.location.origin}/download_csv/${currentReportPaths.csv}`, '_blank');
      console.log("Tentative de téléchargement du CSV:", `${window.location.origin}/download_csv/${currentReportPaths.csv}`);
    } else {
      showMessage('Aucun rapport CSV disponible pour le téléchargement.', 'error');
    }
  });

  downloadXlsxBtn.addEventListener('click', () => {
    if (currentReportPaths.xlsx) {
      // Utilisation de window.location.origin pour construire l'URL complète
      window.open(`${window.location.origin}/download_xlsx/${currentReportPaths.xlsx}`, '_blank');
      console.log("Tentative de téléchargement du XLSX:", `${window.location.origin}/download_xlsx/${currentReportPaths.xlsx}`);
    } else {
      showMessage('Aucun rapport XLSX disponible pour le téléchargement.', 'error');
    }
  });

  // Initialisation: Vérifier l'état initial du bouton d'analyse
  checkAnalysisButtonState();
}); // Cette accolade et parenthèse finale ferment le document.addEventListener('DOMContentLoaded', ...)

// Un simple log pour confirmer que le script a été entièrement analysé et exécuté
console.log("Le script app.js a été entièrement chargé et exécuté.");
