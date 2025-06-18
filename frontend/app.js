document.addEventListener('DOMContentLoaded', () => {
  // --- DÉBUT DU CODE POUR LA PROTECTION PAR MOT DE PASSE ---
  // Remplacez "votre_mot_de_passe_secret" par le mot de passe que vous souhaitez utiliser.
  // ATTENTION: Ce mot de passe est visible dans le code source de la page (frontend).
  // N'utilisez PAS cette méthode pour des informations sensibles ou une sécurité robuste.
  const MOT_DE_PASSE_CORRECT = "votre_mot_de_passe_secret"; 

  /**
   * Demande un mot de passe à l'utilisateur et vérifie sa validité.
   * Affiche le contenu de la page si le mot de passe est correct.
   * Redemande ou refuse l'accès si incorrect/annulé.
   * @returns {boolean} True si l'accès est autorisé, false sinon.
   */
  function demanderMotDePas(attemptCount = 0) {
    if (attemptCount >= 3) { // Limite de 3 tentatives pour éviter une boucle infinie
      alert("Trop de tentatives infructueuses. Accès refusé. Veuillez rafraîchir la page pour réessayer.");
      document.body.style.display = 'none'; // Cache tout le contenu
      return false;
    }

    let motDePasse = prompt("Veuillez entrer le mot de passe pour accéder au dashboard :");

    if (motDePasse === null) { // L'utilisateur a cliqué sur "Annuler"
      alert("Accès refusé. Veuillez rafraîchir la page pour réessayer.");
      document.body.style.display = 'none'; // Cache tout le contenu
      return false;
    } else if (motDePasse === MOT_DE_PASSE_CORRECT) {
      document.body.style.display = ''; // Affiche le contenu de la page
      return true;
    } else {
      alert("Mot de passe incorrect. Veuillez réessayer.");
      return demanderMotDePas(attemptCount + 1); // Rappelle la fonction pour un nouvel essai
    }
  }

  // Cache le corps de la page dès le chargement, avant la vérification du mot de passe.
  // Cela empêche le contenu de s'afficher momentanément avant la demande de mot de passe.
  document.body.style.display = 'none';

  // Lance le processus de demande de mot de passe.
  // Si l'accès n'est pas autorisé (mot de passe incorrect après tentatives ou annulé),
  // le reste du script ne s'exécutera pas.
  const accesAutorise = demanderMotDePas();
  if (!accesAutorise) {
    return; // Arrête l'exécution du reste du code si l'accès n'est pas autorisé
  }
  // --- FIN DU CODE POUR LA PROTECTION PAR MOT DE PASSE ---


  // --- DÉBUT DU CODE EXISTANT DE app.js ---
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

  let currentReportPaths = {};
  let lastAnalysisData = null; // Stocke les données de la dernière analyse

  // --- Fonctions utilitaires pour les messages ---
  function showMessage(message, type = 'info') {
    confirmationDiv.textContent = message;
    confirmationDiv.className = `message ${type}`;
    confirmationDiv.style.opacity = '0';
    setTimeout(() => {
      confirmationDiv.style.transition = 'opacity 0.5s ease-in-out';
      confirmationDiv.style.opacity = '1';
    }, 10);
  }

  function clearMessages() {
    confirmationDiv.textContent = '';
    confirmationDiv.className = 'message';
    confirmationDiv.style.opacity = '0';
    confirmationDiv.style.transition = 'none';
  }

  function showLoading(show) {
    if (show) {
      loadingIndicator.classList.remove('hidden');
      analyzeBtn.disabled = true;
      downloadReportBtn.disabled = true;
      downloadCsvBtn.disabled = true;
      downloadXlsxBtn.disabled = true;
      // Nettoyer et cacher toutes les sections de résultats
      mainSections.forEach(section => section.classList.add('hidden'));
      iaMetricsContent.innerHTML = '';
      fileMetricsContent.innerHTML = '';
      clientScoringTableContainer.innerHTML = '';
      resultsContent.textContent = '';
      // Activer seulement la section d'upload pendant l'analyse
      document.getElementById('upload-section').classList.remove('hidden');
      // Enlever 'active' des sidebar items, l'ajoutera après si succès
      sidebarItems.forEach(item => item.classList.remove('active'));

    } else {
      loadingIndicator.classList.add('hidden');
      analyzeBtn.disabled = false;
    }
  }

  // --- Fonction pour gérer l'affichage des sections principales ---
  function showSection(sectionId) {
    mainSections.forEach(section => {
      if (section.id === sectionId) {
        section.classList.remove('hidden');
        section.classList.add('active'); // Pour des styles spécifiques à la section active si besoin
      } else {
        section.classList.add('hidden');
        section.classList.remove('active');
      }
    });

    sidebarItems.forEach(item => {
      if (item.dataset.section === sectionId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Assurez-vous que les données sont rechargées si la section est affichée après avoir été cachée
    if (lastAnalysisData) {
      if (sectionId === 'ia-performance-section') {
        updateIaMetrics(lastAnalysisData.model_metrics);
      } else if (sectionId === 'file-analysis-section') {
        updateFileAnalysis(lastAnalysisData.file_analysis);
      } else if (sectionId === 'client-scoring-results') {
        updateClientScoringTable(lastAnalysisData.predictions_with_details, lastAnalysisData.file_analysis.colonnes);
      } else if (sectionId === 'raw-predictions-section') {
        resultsContent.textContent = JSON.stringify(lastAnalysisData.predictions, null, 2);
      }
    }
  }

  // Initialisation: Afficher la section d'upload au chargement
  showSection('upload-section');


  // --- Gestion du bouton d'analyse ---
  analyzeBtn.addEventListener('click', async () => {
    clearMessages();
    
    downloadReportBtn.classList.add('hidden');
    downloadCsvBtn.classList.add('hidden');
    downloadXlsxBtn.classList.add('hidden');
    currentReportPaths = {};

    if (fileInput.files.length === 0) {
      showMessage('Veuillez sélectionner un fichier.', 'error');
      return;
    }

    const file = fileInput.files[0];
    const creditType = creditTypeSelect.value;
    const formData = new FormData();
    formData.append('file', file);

    showMessage('Traitement en cours... Veuillez patienter.', 'info');
    showLoading(true);

    try {
      // Assurez-vous que l'URL pointe vers votre backend sur Render
      // Remplacez 'https://df-itbabar-1.onrender.com' par 'https://df-itbabar.onrender.com'
      const response = await fetch(`https://df-itbabar.onrender.com/predict_aptitude/?credit_type=${creditType}`, { // Utiliser creditTypeSelect.value ici
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Erreur HTTP ${response.status}: ${errorData.detail || response.statusText}`);
      }

      const data = await response.json();
      lastAnalysisData = data; // Stocke les données pour les autres sections

      showMessage('Fichier analysé avec succès. Rapports générés.', 'success');
      
      // Mettre à jour et afficher les sections de résultats pertinentes
      updateIaMetrics(data.model_metrics); // Toujours mettre à jour les données même si la section est cachée
      updateFileAnalysis(data.file_analysis);
      updateClientScoringTable(data.predictions_with_details, data.file_analysis.colonnes);
      resultsContent.textContent = JSON.stringify(data.predictions, null, 2); // Met à jour le contenu brut

      currentReportPaths = data.report_paths;

      // Afficher les boutons de téléchargement si les chemins sont disponibles
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

      // Après une analyse réussie, affiche automatiquement les résultats clients
      showSection('client-scoring-results');

    } catch (error) {
      showMessage(`❌ Erreur lors de l’analyse : ${error.message}`, 'error');
      resultsContent.textContent = error.toString();
      console.error("Détail de l'erreur :", error);
    } finally {
      showLoading(false);
    }
  });

  // --- Fonctions pour mettre à jour les contenus des métriques ---
  function updateIaMetrics(metrics) {
    if (!metrics || Object.keys(metrics).length === 0) {
      iaMetricsContent.innerHTML = '<p>Métriques de performance non disponibles ou non chargées.</p>';
      return;
    }

    let html = '<ul>';
    html += `<li><strong>Accuracy:</strong> <span>${metrics.accuracy ? metrics.accuracy.toFixed(4) : 'N/A'}</span></li>`;
    html += `<li><strong>Precision:</strong> <span>${metrics.precision ? metrics.precision.toFixed(4) : 'N/A'}</span></li>`;
    html += `<li><strong>Recall:</strong> <span>${metrics.recall ? metrics.recall.toFixed(4) : 'N/A'}</span></li>`;
    html += `<li><strong>F1-Score:</strong> <span>${metrics.f1_score ? metrics.f1_score.toFixed(4) : 'N/A'}</span></li>`;
    html += '</ul>';

    html += `
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

    // Affichage des importances des caractéristiques
    const featureImportances = metrics.feature_importances;
    if (featureImportances && featureImportances.length > 0) {
      html += `<h3>Caractéristiques influentes:</h3>`;
      html += `<div class="feature-importances-list">`;
      
      // Top 5 features
      html += `<h4>Top 5 des caractéristiques les plus influentes:</h4>`;
      for (let i = 0; i < Math.min(5, featureImportances.length); i++) {
        const [feature, importance] = featureImportances[i];
        // Nettoyage et capitalisation du nom de la feature pour l'affichage
        const displayFeatureName = feature.replace(/_/g, ' ').capitalize();
        html += `<div class="feature-item">
                   <span>${displayFeatureName}</span>
                   <div class="feature-bar-container">
                     <div class="feature-bar" style="width: ${(importance * 100).toFixed(2)}%;"></div>
                   </div>
                   <span class="importance-value">${importance.toFixed(4)}</span>
                 </div>`;
      }

      // Flop 5 features (si plus de 5 features au total)
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

    iaMetricsContent.innerHTML = html;
  }

  function updateFileAnalysis(analysis) {
    if (!analysis || Object.keys(analysis).length === 0) {
      fileMetricsContent.innerHTML = '<p>Analyse du fichier non disponible.</p>';
      return;
    }
    let html = `
      <ul>
        <li><strong>Nom du fichier:</strong> <span>${analysis.nom_fichier || 'N/A'}</span></li>
        <li><strong>Taille du fichier:</strong> <span>${analysis.taille_fichier || 'N/A'}</span></li>
        <li><strong>Nombre de lignes:</strong> <span>${analysis.nombre_lignes || 'N/A'}</span></li>
        <li><strong>Nombre de colonnes:</strong> <span>${analysis.nombre_colonnes || 'N/A'}</span></li>
        <li><strong>Colonnes originales:</strong> <span>${(analysis.colonnes && analysis.colonnes.join(', ')) || 'N/A'}</span></li>
        <li><strong>Clients appétents:</strong> <span>${analysis.nombre_clients_appetents !== undefined ? analysis.nombre_clients_appetents : '0'} (seuil > ${analysis.seuil_appetence_utilise !== undefined ? analysis.seuil_appetence_utilise : '0.5'})</span></li>
      </ul>
      <h3>Critères traités par le modèle:</h3>
      <ul>
        <li><strong>Pris en charge:</strong> <span>${(analysis.critères_pris_en_charge && analysis.critères_pris_en_charge.join(', ')) || 'Aucun'}</span></li>
        <li><strong>Non pris en charge (ignorés):</strong> <span>${(analysis.critères_non_pris_en_charge_a_ignorer && analysis.critères_non_pris_en_charge_a_ignorer.join(', ')) || 'Aucun'}</span></li>
        <li><strong>Manquants (à entraîner):</strong> <span>${(analysis.critères_manquants_a_entrainer && analysis.critères_manquants_a_entrainer.join(', ')) || 'Aucun'}</span></li>
      </ul>
      <h3>Types de données:</h3>
      <ul>
    `;
    for (const col in analysis.types_donnees) {
      html += `<li><strong>${col}:</strong> <span>${analysis.types_donnees[col]}</span></li>`;
    }
    html += `</ul>
      <h3>Valeurs manquantes (par colonne):</h3>
      <ul>
    `;
    for (const col in analysis.valeurs_manquantes) {
      html += `<li><strong>${col}:</strong> <span>${analysis.valeurs_manquantes[col]}</span></li>`;
    }
    html += `</ul>
      <h3>Résumé statistique:</h3>
      <pre>${JSON.stringify(analysis.resume_statistique, null, 2) || 'N/A'}</pre>
    `;
    fileMetricsContent.innerHTML = html;
  }

  function updateClientScoringTable(predictionsWithDetails, originalColumns) {
    if (!predictionsWithDetails || predictionsWithDetails.length === 0) {
      clientScoringTableContainer.innerHTML = '<p>Aucun résultat de scoring détaillé disponible.</p>';
      return;
    }

    let tableHtml = '<table><thead><tr>';
    // Ajout de 'client_identifier' au début des colonnes à afficher
    const displayOriginalCols = ['client_identifier', 'age', 'revenu', 'nb_enfants', 'statut_pro', 'anciennete_client_annees', 'credit_existant_conso'];
    let headerCols = [];
    
    if (predictionsWithDetails.length > 0) {
        const firstClient = predictionsWithDetails[0];
        for (const col of displayOriginalCols) {
            if (firstClient.original_data && firstClient.original_data[col] !== undefined) {
                headerCols.push(col);
                const displayHeader = col === 'client_identifier' ? 'Client' : col.replace(/_/g, ' ').capitalize();
                tableHtml += `<th data-label="${displayHeader}">${displayHeader}</th>`;
            }
        }
    }

    tableHtml += `
      <th data-label="Score d'Appétence">Score d'Appétence</th>
      <th data-label="Forces">Forces</th>
      <th data-label="Faiblesses">Faiblesses</th>
    </tr></thead><tbody>`;

    predictionsWithDetails.forEach((client, index) => {
      tableHtml += '<tr>';
      for (const col of headerCols) {
          let value = client.original_data[col] !== undefined ? client.original_data[col] : 'N/A';
          if (typeof value === 'boolean') {
              value = value ? 'Oui' : 'Non';
          }
          tableHtml += `<td data-label="${col.replace(/_/g, ' ').capitalize()}">${value}</td>`;
      }

      tableHtml += `<td data-label="Score d'Appétence">${client.score_appetence ? client.score_appetence.toFixed(4) : 'N/A'}</td>`;
      tableHtml += `<td data-label="Forces">${client.observations_forces || 'N/A'}</td>`;
      tableHtml += `<td data-label="Faiblesses">${client.observations_faiblesses || 'N/A'}</td>`;
      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';
    clientScoringTableContainer.innerHTML = tableHtml;
  }


  // --- Logique de navigation de la barre latérale ---
  sidebarItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = item.dataset.section;
      if (sectionId) {
        showSection(sectionId);
      }
    });
  });

  // --- Gestion du téléchargement des rapports ---
  downloadReportBtn.addEventListener('click', () => {
    if (currentReportPaths.pdf) {
      // Assurez-vous que l'URL pointe vers votre backend sur Render
      // Remplacez 'http://localhost:8000' par 'https://df-itbabar.onrender.com'
      window.open(`https://df-itbabar.onrender.com/download_report/${currentReportPaths.pdf}`, '_blank');
    } else {
      showMessage('Aucun rapport PDF disponible pour le téléchargement.', 'error');
    }
  });

  downloadCsvBtn.addEventListener('click', () => {
    if (currentReportPaths.csv) {
      // Assurez-vous que l'URL pointe vers votre backend sur Render
      // Remplacez 'http://localhost:8000' par 'https://df-itbabar.onrender.com'
      window.open(`https://df-itbabar.onrender.com/download_csv/${currentReportPaths.csv}`, '_blank');
    } else {
      showMessage('Aucun rapport CSV disponible pour le téléchargement.', 'error');
    }
  });

  downloadXlsxBtn.addEventListener('click', () => {
    if (currentReportPaths.xlsx) {
      // Assurez-vous que l'URL pointe vers votre backend sur Render
      // Remplacez 'http://localhost:8000' par 'https://df-itbabar.onrender.com'
      window.open(`https://df-itbabar.onrender.com/download_xlsx/${currentReportPaths.xlsx}`, '_blank');
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

  // Helper function for capitalizing first letter of each word (for display)
  String.prototype.capitalize = function() {
    return this.replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };
  // --- FIN DU CODE EXISTANT DE app.js ---
});
