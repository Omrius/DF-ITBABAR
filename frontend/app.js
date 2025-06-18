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
  const clientScoringTableContainer = document.getElementById('client-scoring-table-container'); // ID corrigé
  const rawPredictionsContent = document.getElementById('raw-predictions-content'); // Ajout pour les résultats bruts

  let currentReportPaths = {};
  let lastAnalysisData = null; // Stocke les données de la dernière analyse
  let currentPage = 0; // Page actuelle du tableau des clients
  const ITEMS_PER_PAGE = 10; // Nombre d'éléments par page

  // --- Fonctions utilitaires pour les messages ---
  function showMessage(message, type = 'info') {
    confirmationDiv.textContent = message;
    confirmationDiv.className = `message ${type}`;
    confirmationDiv.style.opacity = '1';
    confirmationDiv.style.display = 'block'; // S'assurer qu'il est visible
  }

  function hideMessage() {
    confirmationDiv.style.opacity = '0';
    confirmationDiv.style.display = 'none'; // Masquer après l'animation
  }

  // --- Fonctions utilitaires pour l'indicateur de chargement ---
  function showLoadingIndicator() {
    loadingIndicator.classList.remove('hidden');
  }

  function hideLoadingIndicator() {
    loadingIndicator.classList.add('hidden');
  }

  // --- Gestion de l'affichage des sections (Sidebar Navigation) ---
  function showSection(sectionId) {
    mainSections.forEach(section => {
      if (section.id === sectionId) {
        section.classList.remove('hidden');
        section.classList.add('fade-in');
        // console.log(`Section '${sectionId}' affichée et animation 'fade-in' appliquée.`);
      } else {
        section.classList.add('hidden');
        section.classList.remove('fade-in');
        // console.log(`Section '${section.id}' masquée.`);
      }
    });
    sidebarItems.forEach(item => {
      if (item.dataset.section === sectionId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // Initialisation : Afficher la section d'upload par défaut
  showSection('upload-section');

  sidebarItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault(); // Empêche le comportement par défaut du lien
      const sectionId = item.dataset.section;
      showSection(sectionId);
    });
  });

  // --- Fonction pour afficher les métriques de l'IA ---
  function displayIAMetrics(metrics) {
    if (!iaMetricsContent) return;

    iaMetricsContent.innerHTML = `
        <div class="metric-grid">
            <div class="metric-card">
                <i class="fas fa-percent metric-icon"></i>
                <h3>Précision Globale</h3>
                <p class="metric-value">${(metrics.overall_accuracy * 100).toFixed(2)}%</p>
                <p class="metric-description">Taux de prédictions correctes du modèle.</p>
            </div>
            <div class="metric-card">
                <i class="fas fa-check-circle metric-icon"></i>
                <h3>Taux de Vrais Positifs (Recall)</h3>
                <p class="metric-value">${(metrics.recall * 100).toFixed(2)}%</p>
                <p class="metric-description">Capacité du modèle à identifier correctement les cas positifs.</p>
            </div>
            <div class="metric-card">
                <i class="fas fa-bullseye metric-icon"></i>
                <h3>Précision des Prédictions</h3>
                <p class="metric-value">${(metrics.precision * 100).toFixed(2)}%</p>
                <p class="metric-description">Proportion de vrais positifs parmi toutes les prédictions positives.</p>
            </div>
            <div class="metric-card">
                <i class="fas fa-balance-scale metric-icon"></i>
                <h3>F1-Score</h3>
                <p class="metric-value">${(metrics.f1_score * 100).toFixed(2)}%</p>
                <p class="metric-description">Moyenne harmonique de la précision et du rappel.</p>
            </div>
        </div>

        <div class="confusion-matrix-container">
            <h3>Matrice de Confusion</h3>
            <table class="confusion-matrix">
                <thead>
                    <tr>
                        <th></th>
                        <th>Prédit Positif</th>
                        <th>Prédit Négatif</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th>Réel Positif</th>
                        <td class="true-positive">${metrics.confusion_matrix.true_positive} (VP)</td>
                        <td class="false-negative">${metrics.confusion_matrix.false_negative} (FN)</td>
                    </tr>
                    <tr>
                        <th>Réel Négatif</th>
                        <td class="false-positive">${metrics.confusion_matrix.false_positive} (FP)</td>
                        <td class="true-negative">${metrics.confusion_matrix.true_negative} (VN)</td>
                    </tr>
                </tbody>
            </table>
            <div class="matrix-description">
                <p><strong>VP (Vrai Positif) :</strong> Cas positifs correctement identifiés.</p>
                <p><strong>FN (Faux Négatif) :</strong> Cas positifs manqués par le modèle.</p>
                <p><strong>FP (Faux Positif) :</strong> Cas négatifs incorrectement identifiés comme positifs.</p>
                <p><strong>VN (Vrai Négatif) :</strong> Cas négatifs correctement identifiés.</p>
            </div>
        </div>
    `;
  }

  // --- Fonction pour afficher l'analyse du fichier client ---
  function displayFileAnalysis(fileAnalysis) {
    if (!fileMetricsContent) return;

    let htmlContent = `
        <div class="metric-grid">
            <div class="metric-card full-width">
                <h3><i class="fas fa-info-circle"></i> Aperçu du Fichier Importé</h3>
                <ul>
                    <li><strong>Nom du Fichier :</strong> <span>${fileAnalysis.file_name}</span></li>
                    <li><strong>Nombre Total de Lignes :</strong> <span>${fileAnalysis.total_rows}</span></li>
                    <li><strong>Nombre de Colonnes :</strong> <span>${fileAnalysis.num_columns}</span></li>
                </ul>
            </div>
    `;

    if (fileAnalysis.missing_values_summary && Object.keys(fileAnalysis.missing_values_summary).length > 0) {
        htmlContent += `
            <div class="metric-card full-width">
                <h3><i class="fas fa-exclamation-triangle"></i> Valeurs Manquantes par Colonne</h3>
                <ul>`;
        for (const [col, count] of Object.entries(fileAnalysis.missing_values_summary)) {
            htmlContent += `<li><strong>${col} :</strong> <span>${count}</span></li>`;
        }
        htmlContent += `
                </ul>
            </div>
        `;
    }

    if (fileAnalysis.data_types_summary && Object.keys(fileAnalysis.data_types_summary).length > 0) {
        htmlContent += `
            <div class="metric-card full-width">
                <h3><i class="fas fa-tag"></i> Types de Données par Colonne</h3>
                <ul>`;
        for (const [col, type] of Object.entries(fileAnalysis.data_types_summary)) {
            htmlContent += `<li><strong>${col} :</strong> <span>${type}</span></li>`;
        }
        htmlContent += `
                </ul>
            </div>
        `;
    }

    if (fileAnalysis.feature_importance && Object.keys(fileAnalysis.feature_importance).length > 0) {
        htmlContent += `
            <div class="metric-card full-width">
                <h3><i class="fas fa-chart-bar"></i> Importance des Caractéristiques (Top 5)</h3>
                <ul class="list-forces">`;
        // Tri des caractéristiques par importance (décroissant) et prise des 5 premières
        const sortedFeatures = Object.entries(fileAnalysis.feature_importance)
                                .sort(([, a], [, b]) => b - a)
                                .slice(0, 5);
        sortedFeatures.forEach(([feature, importance]) => {
            htmlContent += `<li><strong>${feature} :</strong> <span>${(importance * 100).toFixed(2)}%</span></li>`;
        });
        htmlContent += `
                </ul>
            </div>
        `;
    }

    htmlContent += `</div>`; // Fermeture de metric-grid
    fileMetricsContent.innerHTML = htmlContent;
  }

  // --- Fonction pour afficher les résultats de scoring des clients ---
  function displayClientScoringTable(clientsData) {
    const tableContainer = clientScoringTableContainer; // Assurez-vous que l'ID est correct dans index.html
    if (!tableContainer || !clientsData || clientsData.length === 0) {
      tableContainer.innerHTML = '<p class="message info">Aucune donnée de scoring client disponible.</p>';
      return;
    }

    // Réinitialiser la pagination et l'affichage
    currentPage = 0;
    const showMoreButton = document.getElementById('show-more-button');
    const noMoreClientsMessage = document.getElementById('no-more-clients');
    const predictionsTable = document.getElementById('predictions-table');
    if (!predictionsTable) {
        tableContainer.innerHTML = '<p class="message error">Erreur : Table des prédictions introuvable.</p>';
        return;
    }

    // Effacer le contenu précédent du tableau
    predictionsTable.innerHTML = '';

    // Créer les en-têtes du tableau
    const thead = predictionsTable.createTHead();
    const headerRow = thead.insertRow();
    // Utiliser les clés du premier objet comme en-têtes
    Object.keys(clientsData[0]).forEach(key => {
      const th = document.createElement('th');
      th.textContent = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); // Formatage des noms de colonnes
      headerRow.appendChild(th);
    });

    // Ajouter une colonne pour les détails si nécessaire
    const detailsTh = document.createElement('th');
    detailsTh.textContent = 'Détails';
    headerRow.appendChild(detailsTh);

    // Remplir le corps du tableau avec les données initiales
    const tbody = predictionsTable.createTBody();
    function renderTableRows(start, end) {
      for (let i = start; i < end && i < clientsData.length; i++) {
        const client = clientsData[i];
        const row = tbody.insertRow();
        Object.values(client).forEach(value => {
          const cell = row.insertCell();
          // Appliquer des classes de style basées sur les valeurs
          if (typeof value === 'boolean') {
              cell.textContent = value ? 'Oui' : 'Non';
              cell.classList.add(value ? 'appetence-oui' : 'appetence-non');
          } else if (typeof value === 'string' && value.includes('Faible')) {
              cell.textContent = value;
              cell.classList.add('score-faible');
          } else if (typeof value === 'string' && value.includes('Moyen')) {
              cell.textContent = value;
              cell.classList.add('score-moyen');
          } else if (typeof value === 'string' && value.includes('Élevé')) {
              cell.textContent = value;
              cell.classList.add('score-eleve');
          } else {
              cell.textContent = value;
          }
        });

        // Cellule pour le bouton "Détails"
        const detailsCell = row.insertCell();
        const detailsButton = document.createElement('button');
        detailsButton.textContent = 'Détails';
        detailsButton.classList.add('btn-details');
        detailsButton.addEventListener('click', () => showClientDetailsModal(client));
        detailsCell.appendChild(detailsButton);
      }
    }

    renderTableRows(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

    // Gestion du bouton "Afficher plus"
    if (clientsData.length > ITEMS_PER_PAGE) {
      showMoreButton.classList.remove('hidden');
      showMoreButton.onclick = () => {
        currentPage++;
        const startIndex = currentPage * ITEMS_PER_PAGE;
        const endIndex = (currentPage + 1) * ITEMS_PER_PAGE;
        renderTableRows(startIndex, endIndex);

        if ((currentPage + 1) * ITEMS_PER_PAGE >= clientsData.length) {
          showMoreButton.classList.add('hidden');
          noMoreClientsMessage.classList.remove('hidden');
        }
      };
    } else {
      showMoreButton.classList.add('hidden');
      noMoreClientsMessage.classList.add('hidden'); // S'assurer qu'il est masqué si tout tient sur une page
    }
  }

  // Fonction pour afficher le modal de détails du client (exemple simple)
  function showClientDetailsModal(client) {
    let detailsHtml = '<h3>Détails du Client</h3><ul>';
    for (const key in client) {
        detailsHtml += `<li><strong>${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> ${client[key]}</li>`;
    }
    detailsHtml += '</ul>';

    // Pour l'instant, utilisons un simple message, vous pourriez créer une modale dédiée
    showMessage(detailsHtml, 'info'); // Afficher les détails dans la div de message temporairement
    // Idéalement, ici vous ouvririez une vraie fenêtre modale avec plus de style et un bouton de fermeture.
  }

  // --- Fonction pour afficher les résultats bruts de prédiction ---
  function displayRawPredictions(rawData) {
    if (!rawPredictionsContent) return; // Assurez-vous que l'ID est correct dans index.html
    // Affiche le JSON brut formaté
    rawPredictionsContent.textContent = JSON.stringify(rawData, null, 2);
  }

  // --- Gestion du bouton d'analyse ---
  analyzeBtn.addEventListener('click', async () => {
    // console.log('Bouton d\'analyse cliqué.');
    hideMessage();
    showLoadingIndicator();
    downloadReportBtn.disabled = true;
    downloadCsvBtn.disabled = true;
    downloadXlsxBtn.disabled = true;
    currentReportPaths = {}; // Réinitialiser les chemins des rapports

    const file = fileInput.files[0];
    const creditType = creditTypeSelect.value;
    const threshold = document.getElementById('threshold-input').value; // Récupérer la valeur du seuil

    if (!file) {
      showMessage('Veuillez sélectionner un fichier à analyser.', 'error');
      hideLoadingIndicator();
      return;
    }
    if (!creditType) {
      showMessage('Veuillez sélectionner un type de crédit.', 'error');
      hideLoadingIndicator();
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('credit_type', creditType);
    formData.append('threshold', threshold); // Ajouter le seuil au FormData

    try {
      const response = await fetch('/analyze', {
        method: 'POST',
        body: formData,
      });

      // Vérifier si la réponse est OK (status 200-299)
      if (!response.ok) {
        let errorText = await response.text(); // Lire la réponse comme texte simple pour le débogage
        // Tenter de parser comme JSON si le Content-Type l'indique, sinon afficher le texte brut
        if (response.headers.get('Content-type')?.includes('application/json')) {
            try {
                const errorJson = JSON.parse(errorText);
                errorText = errorJson.error || errorJson.message || errorText;
            } catch (e) {
                // Si ce n'est pas un JSON valide, utiliser le texte brut
            }
        }
        throw new Error(`Erreur HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      // Vérifier le Content-Type avant de tenter de lire en JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json(); // Tenter de parser en JSON
        lastAnalysisData = data; // Stocke les données pour la pagination et les rapports

        showMessage('Analyse terminée avec succès!', 'success');
        
        // Afficher les métriques de l'IA
        if (data.ia_metrics) {
            displayIAMetrics(data.ia_metrics);
            showSection('ia-performance-section'); // Afficher la section IA après analyse
        } else {
            showMessage('Aucune métrique IA disponible.', 'info');
        }

        // Afficher l'analyse du fichier client
        if (data.file_analysis) {
            displayFileAnalysis(data.file_analysis);
        }

        // Afficher les résultats de scoring détaillés
        if (data.predictions && data.predictions.length > 0) {
            displayClientScoringTable(data.predictions);
        } else {
            showMessage('Aucun résultat de prédiction client disponible.', 'info');
        }

        // Afficher les résultats bruts
        if (data.raw_predictions) {
            displayRawPredictions(data.raw_predictions);
        } else {
             // console.log("Aucun résultat brut de prédiction disponible.");
             rawPredictionsContent.textContent = "Aucun résultat brut de prédiction disponible.";
        }


        // Activer les boutons de téléchargement si les chemins sont présents
        if (data.report_paths) {
          currentReportPaths = data.report_paths;
          if (currentReportPaths.pdf) downloadReportBtn.disabled = false;
          if (currentReportPaths.csv) downloadCsvBtn.disabled = false;
          if (currentReportPaths.xlsx) downloadXlsxBtn.disabled = false;
        }

      } else {
        // La réponse n'est pas du JSON, lire comme texte et afficher une erreur
        const textResponse = await response.text();
        throw new Error(`Réponse inattendue du serveur. Type: ${contentType || 'non spécifié'}. Contenu: "${textResponse.substring(0, 200)}..."`);
      }

    } catch (error) {
      console.error('Erreur lors de l\'analyse:', error);
      showMessage(`Erreur: ${error.message}`, 'error');
    } finally {
      hideLoadingIndicator();
    }
  });

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

  // --- Gestion de la connexion ---
  const loginScreen = document.getElementById('login-screen');
  const appContent = document.getElementById('app-content');
  const passwordInput = document.getElementById('password-input');
  const loginButton = document.getElementById('login-button');
  const loginErrorMessage = document.getElementById('login-error-message');

  const correctPassword = 'admin'; // Remplacez par votre mot de passe réel

  loginButton.addEventListener('click', () => {
    const enteredPassword = passwordInput.value;
    if (enteredPassword === correctPassword) {
      loginScreen.classList.add('hidden');
      appContent.classList.remove('hidden');
      // console.log('Connexion réussie. Affichage du contenu de l\'application.');
      loginErrorMessage.classList.add('hidden'); // Masquer le message d'erreur si la connexion réussit
    } else {
      loginErrorMessage.textContent = 'Mot de passe incorrect. Veuillez réessayer.';
      loginErrorMessage.classList.remove('hidden');
    }
  });

  // Permettre la connexion avec la touche Entrée
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginButton.click();
    }
  });

  // Au chargement initial, s'assurer que l'écran de connexion est visible
  loginScreen.classList.remove('hidden');
  appContent.classList.add('hidden');

  // Ajustement pour les IDs des conteneurs après vos mises à jour (si nécessaire)
  // Assurez-vous que clientScoringTableContainer dans app.js correspond à l'ID dans index.html
  // et rawPredictionsContent correspond aussi.

  // Vérifier et ajuster les IDs si vous avez changé 'clientScoringTableContainer' en 'client-scoring-table-container'
  // et 'resultsContent' en 'raw-predictions-content' dans index.html
  // Le JS doit refléter ces IDs mis à jour. Je les ai mis à jour dans ce code.
});
