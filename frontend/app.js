document.addEventListener('DOMContentLoaded', () => {
  // Récupérer les éléments de la page de connexion
  const loginSection = document.getElementById('login-section');
  const loginForm = document.getElementById('login-form');
  const loginMessageDiv = document.getElementById('login-message');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  // Récupérer les éléments du tableau de bord principal
  const mainDashboardContent = document.getElementById('main-dashboard-content');
  const fileInput = document.getElementById('fileInput');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const confirmationDiv = document.getElementById('confirmation');
  // const resultsContent = document.getElementById('resultsContent'); // Ancienne référence, probablement non utilisée
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
  const rawPredictionsContent = document.getElementById('rawPredictionsContent');

  let currentReportPaths = {};
  let lastAnalysisData = null; // Stocke les données de la dernière analyse

  // --- Fonctions utilitaires pour les messages ---
  function showMessage(message, type = 'info') {
    confirmationDiv.textContent = message;
    confirmationDiv.className = `message ${type}`;
    confirmationDiv.classList.add('visible'); // Rendre visible avec animation
    setTimeout(() => {
      confirmationDiv.classList.remove('visible');
    }, 5000); // Masquer après 5 secondes
  }

  function showLoginMessage(message, type = 'info') {
    loginMessageDiv.textContent = message;
    loginMessageDiv.className = `message ${type}`;
    loginMessageDiv.classList.add('visible');
    setTimeout(() => {
      loginMessageDiv.classList.remove('visible');
    }, 5000);
  }

  function showLoading(show) {
    if (show) {
      loadingIndicator.classList.remove('hidden');
      analyzeBtn.disabled = true;
      fileInput.disabled = true;
      creditTypeSelect.disabled = true;
      // Désactiver les boutons de téléchargement pendant le chargement
      downloadReportBtn.disabled = true;
      downloadCsvBtn.disabled = true;
      downloadXlsxBtn.disabled = true;
    } else {
      loadingIndicator.classList.add('hidden');
      analyzeBtn.disabled = false;
      fileInput.disabled = false;
      creditTypeSelect.disabled = false;
      // Les boutons de téléchargement sont réactivés après le succès de l'analyse
      // mais leur état spécifique dépendra de 'currentReportPaths' dans le succès.
    }
  }

  // --- Fonctions de navigation Sidebar ---
  function showSection(sectionId) {
    console.log(`DEBUG: Affichage de la section: ${sectionId}`); // DEBUG
    mainSections.forEach(section => {
      section.classList.remove('active');
    });
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
      targetSection.classList.add('active');
    }
  }

  sidebarItems.forEach(item => {
    item.addEventListener('click', function(e) {
      e.preventDefault();
      const sectionId = this.getAttribute('data-section');

      // Gérer la classe 'active' pour les éléments de la sidebar
      sidebarItems.forEach(link => link.classList.remove('active'));
      this.classList.add('active');

      // Afficher la section correspondante
      showSection(sectionId);

      // Si c'est la section d'analyse de fichier et qu'il y a des données, rafraîchir
      if (sectionId === 'upload-section' && lastAnalysisData) {
        // Optionnel: Ré-afficher un message ou un aperçu si pertinent
      } else if (sectionId === 'ia-performance-section' && lastAnalysisData) {
        displayIaMetrics(lastAnalysisData.model_metrics);
      } else if (sectionId === 'file-analysis-section' && lastAnalysisData) {
        displayFileAnalysis(lastAnalysisData.file_analysis);
      } else if (sectionId === 'client-scoring-results' && lastAnalysisData) {
        displayClientScoringResults(lastAnalysisData.predictions_with_details);
      } else if (sectionId === 'raw-predictions-section' && lastAnalysisData) {
        displayRawPredictions(lastAnalysisData);
      }
    });
  });

  // Afficher la section de téléchargement par défaut au démarrage
  showSection('upload-section');

  // --- Logique d'analyse de fichier ---
  analyzeBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    const creditType = creditTypeSelect.value;

    if (!file) {
      showMessage('Veuillez sélectionner un fichier à analyser.', 'error');
      return;
    }

    showLoading(true); // Afficher l'indicateur de chargement

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`http://localhost:8000/predict_aptitude/?credit_type=${creditType}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de l\'analyse du fichier.');
      }

      const data = await response.json();
      console.log('DEBUG: Données reçues du backend:', data); // DEBUG: Log des données complètes
      lastAnalysisData = data; // Stocker les données de la dernière analyse
      showMessage(data.message, 'success'); // Afficher le message de succès

      // Mettre à jour les chemins des rapports pour les boutons de téléchargement
      currentReportPaths = data.report_paths;
      downloadReportBtn.disabled = !currentReportPaths.pdf;
      downloadCsvBtn.disabled = !currentReportPaths.csv;
      downloadXlsxBtn.disabled = !currentReportPaths.xlsx;

      // Afficher les résultats dans les sections correspondantes
      displayIaMetrics(data.model_metrics);
      displayFileAnalysis(data.file_analysis);
      displayClientScoringResults(data.predictions_with_details);
      displayRawPredictions(data); // Afficher les résultats bruts

      // Définir la section 'Performance Moteur IA' comme active après l'analyse
      showSection('ia-performance-section'); 
      // Mettre à jour l'élément actif de la sidebar pour correspondre
      sidebarItems.forEach(link => {
        if (link.getAttribute('data-section') === 'ia-performance-section') {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
      showMessage("Analyse terminée ! La section 'Performance Moteur IA' est affichée. Consultez les autres sections via la barre latérale pour plus de détails.", "success");


    } catch (error) {
      console.error('Erreur:', error);
      showMessage(`Erreur: ${error.message}`, 'error');
      // En cas d'erreur, s'assurer que les boutons de téléchargement sont désactivés
      downloadReportBtn.disabled = true;
      downloadCsvBtn.disabled = true;
      downloadXlsxBtn.disabled = true;
      currentReportPaths = {}; // Réinitialiser les chemins
    } finally {
      showLoading(false); // Cacher l'indicateur de chargement
    }
  });

  // --- Fonctions d'affichage des résultats ---
  function displayIaMetrics(metrics) {
    console.log('DEBUG: displayIaMetrics appelé avec:', JSON.stringify(metrics, null, 2)); // DEBUG: Affiche le contenu

    if (!metrics || Object.keys(metrics).length === 0) {
      iaMetricsContent.innerHTML = '<p>Aucune métrique de performance du modèle disponible.</p>';
      console.log('DEBUG: iaMetricsContent après absence de données:', iaMetricsContent.innerHTML); // DEBUG
      return;
    }

    let html = '<ul>';
    html += `<li><strong>Précision (Accuracy):</strong> <span>${(metrics.accuracy * 100).toFixed(2)}%</span></li>`;
    html += `<li><strong>Précision (Precision):</strong> <span>${(metrics.precision * 100).toFixed(2)}%</span></li>`;
    html += `<li><strong>Rappel (Recall):</strong> <span>${(metrics.recall * 100).toFixed(2)}%</span></li>`;
    html += `<li><strong>Score F1:</strong> <span>${(metrics.f1_score * 100).toFixed(2)}%</span></li>`;

    if (metrics.feature_importances && metrics.feature_importances.length > 0) {
        html += '<li><strong>Importance des Features (Top 5):</strong><ul>';
        metrics.feature_importances.slice(0, 5).forEach(feature => {
            // feature[0] est le nom de la feature, feature[1] est l'importance
            // Nettoyage simplifié des noms de features pour l'affichage
            let cleanedFeatureName = feature[0]
                .replace(/^(conso|immo|simt|cdd|cdi|etudiant|sans|celibataire|divorce|marie|oui|non)[_ ]/i, '') // Supprime les préfixes de catégories ou de modèles
                .replace(/_/g, ' ') // Remplace les underscores par des espaces
                .trim() // Supprime les espaces superflus
                .toUpperCase(); // Met en majuscules

            html += `<li><span>${cleanedFeatureName}: ${(feature[1] * 100).toFixed(2)}%</span></li>`;
        });
        html += '</ul></li>';
    } else {
        html += '<li><span>Aucune importance des features disponible.</span></li>';
    }
    html += '</ul>';
    iaMetricsContent.innerHTML = html;
    console.log('DEBUG: iaMetricsContent après population des données:', iaMetricsContent.innerHTML); // DEBUG
  }

  function displayFileAnalysis(analysis) {
    console.log('DEBUG: displayFileAnalysis appelé avec:', JSON.stringify(analysis, null, 2)); // DEBUG: Affiche le contenu

    if (!analysis || Object.keys(analysis).length === 0) {
      fileMetricsContent.innerHTML = '<p>Aucune analyse de fichier disponible.</p>';
      console.log('DEBUG: fileMetricsContent après absence de données:', fileMetricsContent.innerHTML); // DEBUG
      return;
    }

    let html = '<ul>';
    html += `<li><strong>Nom du fichier:</strong> <span>${analysis.nom_fichier || 'N/A'}</span></li>`;
    html += `<li><strong>Taille du fichier:</strong> <span>${analysis.taille_fichier || 'N/A'}</span></li>`;
    html += `<li><strong>Nombre de lignes:</strong> <span>${analysis.nombre_lignes || 'N/A'}</span></li>`;
    html += `<li><strong>Nombre de colonnes:</strong> <span>${analysis.nombre_colonnes || 'N/A'}</span></li>`;
    
    // Affichage des types de données
    if (analysis.types_donnees && Object.keys(analysis.types_donnees).length > 0) {
      html += '<li><strong>Types de données par colonne:</strong><ul>';
      for (const col in analysis.types_donnees) {
        html += `<li><span>${col}: ${analysis.types_donnees[col]}</span></li>`;
      }
      html += '</ul></li>';
    }

    // Affichage des valeurs manquantes
    if (analysis.valeurs_manquantes && Object.keys(analysis.valeurs_manquantes).length > 0) {
        html += '<li><strong>Valeurs manquantes par colonne:</strong><ul>';
        for (const col in analysis.valeurs_manquantes) {
            html += `<li><span>${col}: ${analysis.valeurs_manquantes[col]}</span></li>`;
        }
        html += '</ul></li>';
    }

    // Critères pris en charge
    if (analysis.critères_pris_en_charge && analysis.critères_pris_en_charge.length > 0) {
        html += '<li><strong>Critères pris en charge pour l\'analyse:</strong><ul>';
        analysis.critères_pris_en_charge.forEach(critere => {
            html += `<li><span>${critere}</span></li>`;
        });
        html += '</ul></li>';
    }

    // Critères non pris en charge
    if (analysis.critères_non_pris_en_charge_a_ignorer && analysis.critères_non_pris_en_charge_a_ignorer.length > 0) {
        html += '<li><strong>Critères non pris en charge (ignorés ou non-features):</strong><ul>';
        analysis.critères_non_pris_en_charge_a_ignorer.forEach(critere => {
            html += `<li><span>${critere}</span></li>`;
        });
        html += '</ul></li>';
    }

    // Critères manquants à entraîner
    if (analysis.critères_manquants_a_entrainer && analysis.critères_manquants_a_entrainer.length > 0) {
        html += '<li><strong>Critères manquants pour un entraînement complet du modèle:</strong><ul>';
        analysis.critères_manquants_a_entrainer.forEach(critere => {
            html += `<li><span>${critere}</span></li>`;
        });
        html += '</ul></li>';
    } else {
        html += '<li><span>Aucun critère critique manquant pour l\'entraînement.</span></li>';
    }

    html += `<li><strong>Nombre de clients appétents (seuil ${analysis.seuil_appetence_utilise * 100}%):</strong> <span>${analysis.nombre_clients_appetents || 'N/A'}</span></li>`;
    html += `<li><strong>Score primaire calculé:</strong> <span>${analysis.score_primaire_calcule || 'N/A'}</span></li>`;


    // Affichage du résumé statistique
    if (analysis.resume_statistique) {
        html += '<li><strong>Résumé statistique:</strong><pre class="raw-data-display">';
        html += JSON.stringify(analysis.resume_statistique, null, 2);
        html += '</pre></li>';
    }

    html += '</ul>';
    fileMetricsContent.innerHTML = html;
    console.log('DEBUG: fileMetricsContent après population des données:', fileMetricsContent.innerHTML); // DEBUG
  }

  function displayClientScoringResults(predictionsWithDetails) {
    console.log('DEBUG: displayClientScoringResults appelé avec:', predictionsWithDetails); // DEBUG
    if (!predictionsWithDetails || predictionsWithDetails.length === 0) {
      clientScoringTableContainer.innerHTML = '<p>Aucun résultat de scoring détaillé disponible.</p>';
      return;
    }

    let tableHtml = `
      <table>
        <thead>
          <tr>
            <th>ID Client</th>
            <th>Nom & Prénom</th>
            <th>Scoring PC</th>
            <th>Scoring PI</th>
            <th>Appétence</th>
            <th>Forces</th>
            <th>Faiblesses</th>
          </tr>
        </thead>
        <tbody>
    `;

    predictionsWithDetails.forEach((client, index) => {
      console.log(`DEBUG: Traitement du client ${index}:`, client); // DEBUG: Log chaque client
      const clientName = client.original_data.nom_prenom && client.original_data.nom_prenom !== null && client.original_data.nom_prenom !== '' ? client.original_data.nom_prenom : `Client ${client.original_data.client_identifier || index + 1}`;
      
      tableHtml += `
        <tr>
          <td>${client.original_data.client_identifier || index + 1}</td>
          <td>${clientName}</td>
          <td>${(client.scoring_PC !== null && client.scoring_PC !== undefined) ? (client.scoring_PC * 100).toFixed(2) + '%' : 'N/A'}</td>
          <td>${(client.scoring_PI !== null && client.scoring_PI !== undefined) ? (client.scoring_PI * 100).toFixed(2) + '%' : 'N/A'}</td>
          <td>${(client.score_appetence !== null && client.score_appetence !== undefined) ? (client.score_appetence * 100).toFixed(2) + '%' : 'N/A'}</td>
          <td class="table-content-overflow">${client.observations_forces || 'N/A'}</td>
          <td class="table-content-overflow">${client.observations_faiblesses || 'N/A'}</td>
        </tr>
      `;
    });

    tableHtml += `
        </tbody>
      </table>
    `;
    clientScoringTableContainer.innerHTML = tableHtml;
  }

  function displayRawPredictions(data) {
    console.log('DEBUG: displayRawPredictions appelé avec:', data); // DEBUG
    rawPredictionsContent.textContent = JSON.stringify(data, null, 2);
  }

  // --- Gestion des téléchargements de rapports ---
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

  // --- Logique de Connexion ---
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Empêcher le rechargement de la page
    console.log("DEBUG: Formulaire de connexion soumis. Comportement par défaut empêché."); // DEBUG: Log pour confirmer l'écouteur d'événement

    const username = usernameInput.value;
    const password = passwordInput.value;

    // Masquer le message précédent
    showLoginMessage('', 'hidden');

    try {
      const response = await fetch('http://localhost:8000/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur de connexion.');
      }

      const data = await response.json();
      showLoginMessage(data.message, 'success');
      console.log('DEBUG: Connexion réussie, données:', data); // DEBUG

      // Si la connexion est réussie, cacher la section de connexion et afficher le tableau de bord
      loginSection.classList.add('hidden');
      mainDashboardContent.classList.remove('hidden');
      // Optionnel: stocker un état de connexion (par ex., dans sessionStorage)
      sessionStorage.setItem('isLoggedIn', 'true');

    } catch (error) {
      console.error('Erreur de connexion:', error);
      showLoginMessage(`Échec de la connexion: ${error.message}`, 'error');
    }
  });

  // Vérifier l'état de connexion au chargement de la page
  function checkLoginStatus() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    console.log('DEBUG: Statut de connexion vérifié au chargement:', isLoggedIn); // DEBUG
    if (isLoggedIn === 'true') {
      loginSection.classList.add('hidden');
      mainDashboardContent.classList.remove('hidden');
    } else {
      loginSection.classList.remove('hidden');
      mainDashboardContent.classList.add('hidden');
    }
  }

  // Appeler la vérification de l'état de connexion au démarrage
  checkLoginStatus();

});
