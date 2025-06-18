document.addEventListener('DOMContentLoaded', () => {
  // --- DÉBUT DU CODE POUR LA PROTECTION PAR MOT DE PASSE (DÉSACTIVÉ POUR DÉPLOIEMENT RENDER) ---
  /*
  const MOT_DE_PASSE_CORRECT = "votre_mot_de_passe_secret"; // Remplacez par votre mot de passe

  function demanderMotDePas(attemptCount = 0) {
    if (attemptCount >= 3) {
      // Utilisez une modal ou un message sur la page au lieu d'alert()
      console.error("Trop de tentatives infructueuses. Accès refusé.");
      document.body.style.display = 'none';
      return false;
    }

    let motDePasse = prompt("Veuillez entrer le mot de passe pour accéder au dashboard :");

    if (motDePasse === null) {
      console.error("Accès refusé. L'utilisateur a annulé.");
      document.body.style.display = 'none';
      return false;
    } else if (motDePasse === MOT_DE_PASSE_CORRECT) {
      document.body.style.display = '';
      return true;
    } else {
      console.warn("Mot de passe incorrect. Réessayez.");
      // Affichez un message à l'utilisateur ici au lieu d'alert()
      return demanderMotDePas(attemptCount + 1);
    }
  }

  // NOTE: La fonction prompt() et alert() ne sont pas recommandées dans un environnement iFrame.
  // Pour une meilleure expérience utilisateur, remplacez-les par une interface utilisateur modale personnalisée.
  document.body.style.display = 'none';
  const accesAutorise = demanderMotDePas();
  if (!accesAutorise) {
    return;
  }
  */
  // --- FIN DU CODE POUR LA PROTECTION PAR MOT DE PASSE ---


  // --- DÉBUT DU CODE EXISTANT DE app.js ---
  // Rendre le contenu principal visible par défaut puisque le prompt est désactivé
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('main-dashboard-content').classList.remove('hidden');


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
        // Passer toutes les données pertinentes, y compris le score primaire
        updateClientScoringTable(lastAnalysisData.predictions_with_details, lastAnalysisData.file_analysis.colonnes);
      } else if (sectionId === 'raw-predictions-section') {
        resultsContent.textContent = JSON.stringify(lastAnalysisData.predictions_with_details, null, 2); // Afficher les détails complets ici
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
    formData.append('credit_type', creditType); // S'assurer que le type de crédit est envoyé

    showMessage('Traitement en cours... Veuillez patienter.', 'info');
    showLoading(true);

    try {
      // REMPLACEZ CETTE URL par celle de votre service BACKEND déployé sur Render
      // Exemple : https://df-itbabar.onrender.com
      const backendUrl = "https://df-itbabar.onrender.com"; 

      // Le credit_type est passé dans le corps de la requête via formData
      const response = await fetch(`${backendUrl}/predict_aptitude/`, {
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
      // Passer le data.predictions_with_details qui contient maintenant les deux scores
      updateClientScoringTable(data.predictions_with_details, data.file_analysis.colonnes);
      resultsContent.textContent = JSON.stringify(data.predictions_with_details, null, 2); // Met à jour le contenu brut avec les détails

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
    html += `<li><strong>Accuracy:</strong> <span>${metrics.accuracy !== undefined ? metrics.accuracy.toFixed(4) : 'N/A'}</span></li>`;
    html += `<li><strong>Precision:</strong> <span>${metrics.precision !== undefined ? metrics.precision.toFixed(4) : 'N/A'}</span></li>`;
    html += `<li><strong>Recall:</strong> <span>${metrics.recall !== undefined ? metrics.recall.toFixed(4) : 'N/A'}</span></li>`;
    html += `<li><strong>F1-Score:</strong> <span>${metrics.f1_score !== undefined ? metrics.f1_score.toFixed(4) : 'N/A'}</span></li>`;
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
        <li><strong>Score Primaire Calculé:</strong> <span>${analysis.score_primaire_calcule || 'N/A'}</span></li>
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

  function updateClientScoringTable(predictionsWithDetails) { // Removed originalColumns param
    if (!predictionsWithDetails || predictionsWithDetails.length === 0) {
      clientScoringTableContainer.innerHTML = '<p>Aucun résultat de scoring détaillé disponible.</p>';
      return;
    }

    let tableHtml = '<table><thead><tr>';
    // Dynamiquement obtenir les en-têtes basés sur la première entrée
    // Inclure client_identifier, puis toutes les colonnes de original_data, puis les scores et observations
    const firstClient = predictionsWithDetails[0];
    const headerSet = new Set();

    // Ajouter les colonnes de original_data
    if (firstClient.original_data) {
        Object.keys(firstClient.original_data).forEach(col => {
            headerSet.add(col.replace(/_/g, ' ').capitalize());
        });
    }

    // Ajouter les colonnes de scoring et d'observations
    headerSet.add('Score Conso');
    headerSet.add('Score Immo');
    headerSet.add('Score Appétence (Principal)'); // Pour le score principal sélectionné
    headerSet.add('Forces');
    headerSet.add('Faiblesses');

    const orderedHeaders = Array.from(headerSet); // Convertir en tableau

    // Trier les en-têtes pour mettre l'ID et les scores en premier pour une meilleure lisibilité
    const specificOrder = [
        'Client Identifier', 'Age', 'Revenu', 'Nbre Enfants', 'Situation Familiale',
        'Anciennete Emploi', 'Anciente Compte', 'Mvt Crediteur', 'Mvt Debiteur',
        'Credit Simt', 'Mt Plv Simt', 'Type Contrat', 'Solde Moy', 'Credit Imo', 'Credit Conso',
        'Score Conso', 'Score Immo', 'Score Appétence (Principal)', 'Forces', 'Faiblesses'
    ];

    orderedHeaders.sort((a, b) => {
        const indexA = specificOrder.indexOf(a);
        const indexB = specificOrder.indexOf(b);
        if (indexA === -1 && indexB === -1) return a.localeCompare(b); // Alphabétique si non spécifié
        if (indexA === -1) return 1; // B vient avant A si A n'est pas dans l'ordre spécifique
        if (indexB === -1) return -1; // A vient avant B si B n'est pas dans l'ordre spécifique
        return indexA - indexB;
    });


    orderedHeaders.forEach(header => {
        tableHtml += `<th data-label="${header}">${header}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    predictionsWithDetails.forEach((client) => {
        tableHtml += '<tr>';
        
        // Afficher les données originales
        for (const header of orderedHeaders) {
            let cellValue = 'N/A';
            let originalKey = header.replace(/ /g, '_').toLowerCase(); // Convertir l'en-tête affiché en clé originale
            if (originalKey === 'client_identifier') originalKey = 'client_identifier'; // Cas spécifique pour l'ID

            if (client.original_data && client.original_data[originalKey] !== undefined) {
                cellValue = client.original_data[originalKey];
                // Formater les booléens
                if (typeof cellValue === 'boolean') {
                    cellValue = cellValue ? 'Oui' : 'Non';
                }
            } else if (header === 'Score Conso') {
                cellValue = client.scoring_PC !== null ? client.scoring_PC.toFixed(4) : 'N/A';
            } else if (header === 'Score Immo') {
                cellValue = client.scoring_PI !== null ? client.scoring_PI.toFixed(4) : 'N/A';
            } else if (header === 'Score Appétence (Principal)') {
                cellValue = client.score_appetence !== null ? client.score_appetence.toFixed(4) : 'N/A';
            } else if (header === 'Forces') {
                cellValue = client.observations_forces || 'N/A';
            } else if (header === 'Faiblesses') {
                cellValue = client.observations_faiblesses || 'N/A';
            }
            
            tableHtml += `<td data-label="${header}">${cellValue}</td>`;
        }
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
    // REMPLACEZ CETTE URL par celle de votre service BACKEND déployé sur Render
    // Exemple : https://df-itbabar.onrender.com
    const backendUrl = "https://df-itbabar.onrender.com"; 
    if (currentReportPaths.pdf) {
      window.open(`${backendUrl}/download_report/${currentReportPaths.pdf}`, '_blank');
    } else {
      showMessage('Aucun rapport PDF disponible pour le téléchargement.', 'error');
    }
  });

  downloadCsvBtn.addEventListener('click', () => {
    // REMPLACEZ CETTE URL par celle de votre service BACKEND déployé sur Render
    // Exemple : https://df-itbabar.onrender.com
    const backendUrl = "https://df-itbabar.onrender.com"; 
    if (currentReportPaths.csv) {
      window.open(`${backendUrl}/download_csv/${currentReportPaths.csv}`, '_blank');
    } else {
      showMessage('Aucun rapport CSV disponible pour le téléchargement.', 'error');
    }
  });

  downloadXlsxBtn.addEventListener('click', () => {
    // REMPLACEZ CETTE URL par celle de votre service BACKEND déployé sur Render
    // Exemple : https://df-itbabar.onrender.com
    const backendUrl = "https://df-itbabar.onrender.com"; 
    if (currentReportPaths.xlsx) {
      window.open(`${backendUrl}/download_xlsx/${currentReportPaths.xlsx}`, '_blank');
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
