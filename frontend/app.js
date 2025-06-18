document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('fileInput');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const confirmationDiv = document.getElementById('confirmation');
  const resultsContent = document.getElementById('resultsContent');
  const creditTypeSelect = document.getElementById('creditType');
  const downloadReportBtn = document.getElementById('downloadReportBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const downloadXlsxBtn = document.getElementById('downloadXlsxBtn');
  const loadingIndicator = document.getElementById('loadingIndicator');

  // Nouvelle structure pour les sections de contenu principal
  const mainSections = document.querySelectorAll('.main-section');
  const sidebarItems = document.querySelectorAll('.sidebar-item');

  // Conteneurs des métriques et tableaux
  const iaMetricsContent = document.getElementById('iaMetricsContent');
  const fileMetricsContent = document.getElementById('fileMetricsContent');
  const clientScoringTableContainer = document.getElementById('clientScoringTableContainer');
  const rawPredictionsContent = document.getElementById('rawPredictionsContent'); // Ajout pour les résultats bruts

  let currentReportPaths = {};
  let lastAnalysisData = null; // Stocke les données de la dernière analyse
  let currentPage = 0; // Page actuelle du tableau des clients
  const ITEMS_PER_PAGE = 10; // Nombre d'éléments par page

  // --- Fonctions utilitaires pour les messages ---
  function showMessage(message, type = 'info') {
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
    } else {
      loadingIndicator.classList.add('hidden');
    }
  }

  // --- Gestion de la navigation entre sections ---
  sidebarItems.forEach(item => {
    item.addEventListener('click', function(event) {
      event.preventDefault();
      const targetSectionId = this.dataset.section;

      mainSections.forEach(section => {
        if (section.id === targetSectionId) {
          section.classList.remove('hidden');
          setTimeout(() => section.classList.add('fade-in'), 10); // Déclenche la transition
        } else {
          section.classList.remove('fade-in');
          section.classList.add('hidden');
        }
      });

      sidebarItems.forEach(sItem => sItem.classList.remove('active'));
      this.classList.add('active');

      // Si on revient à la section d'upload, réinitialiser si nécessaire
      if (targetSectionId === 'upload-section') {
        // Optionnel: Réinitialiser les résultats si on revient à l'upload
        // resultsContent.innerHTML = '';
        // showLoading(false);
      }
    });
  });

  // --- Gestion du bouton d'analyse ---
  analyzeBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    const creditType = creditTypeSelect.value;

    if (!file) {
      showMessage('Veuillez sélectionner un fichier à analyser.', 'error');
      return;
    }

    if (!creditType) {
      showMessage('Veuillez sélectionner un type de crédit.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('credit_type', creditType);

    showLoading(true);
    showMessage('Analyse en cours, veuillez patienter...', 'info');
    downloadReportBtn.disabled = true;
    downloadCsvBtn.disabled = true;
    downloadXlsxBtn.disabled = true;

    try {
      const response = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de l\'analyse du fichier.');
      }

      const data = await response.json();
      lastAnalysisData = data; // Stocke les données pour un usage ultérieur

      showMessage('Analyse terminée avec succès !', 'success');
      console.log('Données de réponse du backend:', data);

      // Affichage des résultats dans les sections appropriées
      displayIaPerformanceMetrics(data.ia_performance_metrics);
      displayFileAnalysisMetrics(data.file_analysis_metrics, data.critères_non_pris_en_charge_a_ignorer);
      displayRawPredictions(data.raw_predictions); // Afficher les prédictions brutes
      
      // Initialisation de la pagination pour le tableau client
      currentPage = 0; // Réinitialise la page à 0
      displayClientScoringResults(data); // Affiche la première page ou tout
      
      // Gérer les boutons de téléchargement
      currentReportPaths = data.report_paths || {};
      console.log('Chemins de rapport reçus:', currentReportPaths);

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
    const startIndex = currentPage * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalClients);
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
      const clientName = (client.client_identifier && client.client_identifier.toUpperCase() !== 'N/A') ? client.client_identifier : `Client ${startIndex + index + 1}`;
      
      const appetenceClass = client.appetence_prediction === 'Oui' ? 'appetence-oui' : 'appetence-non';
      const scoreClass = client.credit_score === 'Faible' ? 'score-faible' : client.credit_score === 'Moyen' ? 'score-moyen' : 'score-eleve';
      
      const forcesHtml = Array.isArray(client.forces) && client.forces.length > 0
        ? `<ul class="list-forces">${client.forces.map(f => `<li>${f}</li>`).join('')}</ul>`
        : 'N/A';
      const weaknessesHtml = Array.isArray(client.weaknesses) && client.weaknesses.length > 0
        ? `<ul class="list-weaknesses">${client.weaknesses.map(w => `<li>${w}</li>`).join('')}</ul>`
        : 'N/A';

      // Log pour le débogage des forces et faiblesses
      console.log(`Client ${clientName}: Forces - ${client.forces ? client.forces.join(', ') : 'N/A'} (Affiche: ${forcesHtml.replace(/<[^>]*>/g, '')})`);
      console.log(`Client ${clientName}: Faiblesses - ${client.weaknesses ? client.weaknesses.join(', ') : 'N/A'} (Affiche: ${weaknessesHtml.replace(/<[^>]*>/g, '')})`);

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
        <span>Page ${currentPage + 1} sur ${Math.ceil(totalClients / ITEMS_PER_PAGE)}</span>
        <button id="nextPageBtn" class="btn-secondary" ${endIndex >= totalClients ? 'disabled' : ''}>Suivant</button>
        ${totalClients > ITEMS_PER_PAGE ? `<button id="showAllBtn" class="btn-secondary">Afficher tout (${totalClients})</button>` : ''}
      </div>
    `;
    clientScoringTableContainer.innerHTML = tableHtml;

    // Attacher les écouteurs d'événements pour la pagination
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const showAllBtn = document.getElementById('showAllBtn');

    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', () => {
        if (currentPage > 0) {
          currentPage--;
          displayClientScoringResults(data);
        }
      });
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
        showAllBtn.addEventListener('click', () => {
            // Pour afficher tout, nous pouvons ajuster ITEMS_PER_PAGE temporairement
            // ou recréer le tableau sans pagination.
            // Une approche simple est de redéfinir la pagination pour inclure tous les éléments.
            currentPage = 0; // Revenir à la première "page"
            const originalItemsPerPage = ITEMS_PER_PAGE;
            // Temporairement, on change la constante pour afficher tout.
            // C'est une simplification, en production, on passerait une option.
            ITEMS_PER_PAGE_GLOBAL = totalClients; // Utilisez une variable globale ou repensez la fonction
            displayClientScoringResults(data);
            // Si on veut revenir à la pagination, il faudrait un bouton "Retour à la pagination"
        });
    }

    // Gestion des boutons "Voir plus" (si une modale ou une autre section de détails existe)
    document.querySelectorAll('.btn-details').forEach(button => {
      button.addEventListener('click', (event) => {
        const clientId = event.target.dataset.clientId;
        // Implémentez ici la logique pour afficher les détails complets du client
        showMessage(`Afficher les détails pour le client: ${clientId}`, 'info');
        // Exemple: trouver le client dans lastAnalysisData.predictions_with_details
        // et afficher une modale avec toutes ses infos brutes.
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

  // --- Gestion des boutons de téléchargement des rapports ---
  downloadReportBtn.addEventListener('click', () => {
    if (currentReportPaths.pdf) {
      window.open(`http://localhost:8000/download_report/${currentReportPaths.pdf}`, '_blank');
    } else {
      showMessage('Aucun rapport PDF disponible pour le téléchargement.', 'error');
    }
  });

  downloadCsvBtn.addEventListener('click', () => {
    if (currentReportPaths.csv) {
      window.open(`http://localhost:8000/download_csv/${currentReportPaths.csv}`, '_blank');
    } else {
      showMessage('Aucun rapport CSV disponible pour le téléchargement.', 'error');
    }
  });

  downloadXlsxBtn.addEventListener('click', () => {
    if (currentReportPaths.xlsx) {
      window.open(`http://localhost:8000/download_xlsx/${currentReportPaths.xlsx}`, '_blank');
    } else {
      showMessage('Aucun rapport XLSX disponible pour le téléchargement.', 'error');
    }
  });

  // Gérer l'affichage du nom du fichier sélectionné
  fileInput.addEventListener('change', () => {
    const fileName = fileInput.files[0] ? fileInput.files[0].name : 'Choisir un fichier';
    const fileLabel = document.querySelector('.file-label');
    if (fileLabel) {
      fileLabel.innerHTML = `<i class="fas fa-file-upload"></i> ${fileName}`;
    }
  });

  // Initialisation: Afficher la première section par défaut
  document.querySelector('.sidebar-item.active').click();
});
