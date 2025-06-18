from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
import pandas as pd
import joblib
import os
from io import BytesIO, StringIO
import logging
import json
import numpy as np
from typing import Dict, Any
from starlette.background import BackgroundTask 

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# IMPORTATIONS : Les chemins sont relatifs au paquet 'backend' qui sera maintenant la Root Directory sur Render
# Assurez-vous que ces lignes sont bien telles quelles dans votre backend/app.py
import utils.observation_generator as observation_generator
from utils.report_generator import generate_pdf_report 


app = FastAPI()

# Middleware CORS pour permettre les requêtes depuis le frontend
logging.info("DEBUG: Application du CORSMiddleware...")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permettre toutes les origines pour le développement/démo simple
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.info("DEBUG: CORSMiddleware appliqué.")


# Construire les chemins absolus pour les modèles et métriques
# BASE_DIR pointera désormais vers /opt/render/project/src/backend/
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) 

MODEL_CONSO_PATH = os.path.join(BASE_DIR, "models", "model_conso.pkl")
MODEL_IMMO_PATH = os.path.join(BASE_DIR, "models", "model_immo.pkl")
METRICS_PATH = os.path.join(BASE_DIR, "models", "metrics.json")


# Dictionnaire pour stocker les modèles chargés et les métriques
models: Dict[str, Any] = {}
model_performance_metrics: Dict[str, Any] = {}
# Nouvelle variable pour stocker les colonnes attendues globalement dans l'application
app_expected_columns_after_dummies: list = []
app_original_trained_features: list = []


# Dictionnaire pour stocker temporairement les chemins des rapports générés.
temp_reports_storage: Dict[str, str] = {}


@app.on_event("startup")
async def load_resources():
    """Charge les modèles de scoring et les métriques au démarrage de l'application."""
    logging.info("DEBUG: Exécution de l'événement de démarrage (startup event).")
    global app_expected_columns_after_dummies, app_original_trained_features, model_performance_metrics

    # Chargement des modèles
    try:
        logging.info(f"Chargement du modèle consommation depuis : {MODEL_CONSO_PATH}")
        models['conso'] = joblib.load(MODEL_CONSO_PATH)
        logging.info("Modèle consommation chargé avec succès.")
    except FileNotFoundError:
        logging.error(f"Erreur : Le fichier du modèle consommation est introuvable à {MODEL_CONSO_PATH}")
        raise HTTPException(status_code=500, detail=f"Modèle consommation introuvable : {MODEL_CONSO_PATH}. Exécutez train_model.py.")
    except Exception as e:
        logging.error(f"Erreur lors du chargement du modèle consommation : {e}")
        raise HTTPException(status_code=500, detail=f"Erreur de chargement du modèle consommation : {e}")

    try:
        logging.info(f"Chargement du modèle immobilier depuis : {MODEL_IMMO_PATH}")
        models['immo'] = joblib.load(MODEL_IMMO_PATH)
        logging.info("Modèle immobilier chargé avec succès.")
    except FileNotFoundError:
        logging.error(f"Erreur : Le fichier du modèle immobilier est introuvable à {MODEL_IMMO_PATH}")
        raise HTTPException(status_code=500, detail=f"Modèle immobilier introuvable : {MODEL_IMMO_PATH}. Exécutez train_model.py.")
    except Exception as e:
        logging.error(f"Erreur lors du chargement du modèle immobilier : {e}")
        raise HTTPException(status_code=500, detail=f"Erreur de chargement du modèle immobilier : {e}")

    # Chargement des métriques (incluant maintenant les feature importances)
    try:
        logging.info(f"Chargement des métriques depuis : {METRICS_PATH}")
        with open(METRICS_PATH, 'r') as f:
            model_performance_metrics = json.load(f)
        logging.info("Métriques chargées avec succès.")
    except FileNotFoundError:
        logging.warning(f"Avertissement : Le fichier de métriques est introuvable à {METRICS_PATH}. Les métriques ne seront pas affichées.")
        model_performance_metrics = {}
    except json.JSONDecodeError:
        logging.error(f"Erreur : Le fichier de métriques '{METRICS_PATH}' n'est pas un JSON valide.")
        model_performance_metrics = {}
    except Exception as e:
        logging.error(f"Erreur lors du chargement des métriques : {e}")
        model_performance_metrics = {}

    # IMPORTANT : Assurez-vous que les colonnes attendues sont chargées au démarrage
    # Elles sont maintenant chargées une seule fois et stockées dans des variables de l'application
    try:
        logging.info("DEBUG: Chargement des colonnes attendues via observation_generator._load_expected_columns_and_original_features_for_startup()...")
        # L'import est 'utils.observation_generator' car 'backend' est la nouvelle racine
        app_expected_columns_after_dummies, app_original_trained_features = observation_generator._load_expected_columns_and_original_features_for_startup()
        logging.info("DEBUG: Colonnes attendues chargées avec succès.")
    except Exception as e:
        logging.error(f"Erreur critique lors du pré-chargement des colonnes attendues : {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'initialisation des colonnes du modèle : {e}")


@app.get("/")
async def read_root():
    """Endpoint de test pour vérifier si le backend répond."""
    logging.info("DEBUG: Requête reçue sur l'endpoint /")
    return {"message": "Bienvenue sur l'API Datafindser ! Le backend fonctionne."}

def clean_nans_infs_recursive(obj):
    """
    Nettoie les valeurs NaN et Inf des objets Python (dictionnaires, listes, scalaires)
    en les convertissant en None pour la compatibilité JSON.
    Convertit également les types NumPy en types Python natifs.
    """
    if isinstance(obj, dict):
        return {k: clean_nans_infs_recursive(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nans_infs_recursive(elem) for elem in obj]
    elif isinstance(obj, (np.floating, np.integer, np.bool_)):
        if pd.isna(obj) or np.isinf(obj):
            return None
        return obj.item() # Convertit les types NumPy en types Python natifs
    elif pd.isna(obj) or (isinstance(obj, float) and np.isinf(obj)):
        return None
    return obj

# Modèle Pydantic pour la requête de connexion
class UserLogin(BaseModel):
    username: str
    password: str

@app.post("/login")
async def login(user: UserLogin):
    """
    Endpoint pour la connexion des utilisateurs.
    Pour une démo, les identifiants sont codés en dur.
    """
    # Pour une application réelle, vous vérifieriez ces identifiants contre une base de données.
    if user.username == "user" and user.password == "password123":
        return {"message": "Connexion réussie!"}
    raise HTTPException(status_code=401, detail="Nom d'utilisateur ou mot de passe incorrect.")


@app.post("/predict_aptitude/")
async def predict_aptitude(
    file: UploadFile = File(...),
    credit_type: str = "conso", # 'conso' ou 'immo' (type primaire pour l'affichage/insights)
    appetence_threshold: float = 0.5
):
    """
    Endpoint pour prédire l'appétence au crédit d'un client à partir d'un fichier Excel ou CSV.
    Calcule les scores pour les prêts à la consommation et immobiliers.
    Génère également une analyse du fichier et des rapports PDF, CSV, XLSX.

    Args:
        file (UploadFile): Le fichier Excel ou CSV contenant les données du client.
        credit_type (str): Le type de crédit primaire pour lequel la prédiction est demandée ('conso' ou 'immo').
                           Ce paramètre influence les métriques et les insights affichés.
        appetence_threshold (float): Seuil de probabilité au-delà duquel un client est considéré comme appétent.

    Returns:
        dict: Un dictionnaire contenant le message de succès, les prédictions,
              les métriques du modèle, l'analyse du fichier et les chemins des rapports.
    """
    logging.info(f"Requête reçue sur /predict_aptitude/ pour type de crédit primaire: {credit_type}")

    if credit_type not in models:
        logging.error(f"Type de crédit primaire '{credit_type}' non supporté. Types supportés : {list(models.keys())}")
        raise HTTPException(status_code=400, detail=f"Type de crédit primaire non valide. Choisissez 'conso' ou 'immo'.")

    file_extension = os.path.splitext(file.filename)[1].lower()
    df_original = None 
    try:
        contents = await file.read()
        if file_extension in ('.xlsx', '.xls'):
            df_original = pd.read_excel(BytesIO(contents))
            logging.info(f"Fichier Excel '{file.filename}' lu avec succès. Nombre de lignes : {len(df_original)}")
        elif file_extension == '.csv':
            df_original = pd.read_csv(StringIO(contents.decode('utf-8')))
            logging.info(f"Fichier CSV '{file.filename}' lu avec succès. Nombre de lignes : {len(df_original)}")
        else:
            logging.warning(f"Tentative de téléchargement d'un fichier non supporté : {file.filename}")
            raise HTTPException(status_code=400, detail="Seuls les fichiers Excel (.xlsx, .xls) et CSV (.csv) sont acceptés.")
    except Exception as e:
        logging.error(f"Erreur lors de la lecture du fichier '{file.filename}' : {e}")
        raise HTTPException(status_code=400, detail=f"Erreur lors de la lecture du fichier : {e}")

    # Ajouter une colonne 'client_identifier' si elle n'existe pas, basée sur l'index
    if 'client_identifier' not in df_original.columns:
        df_original['client_identifier'] = df_original.index + 1
        logging.info("Ajout d'une colonne 'client_identifier' basée sur l'index pour la cohérence.")

    # Initialiser l'analyse du fichier client
    file_analysis = {}
    if df_original is not None:
        file_analysis['nom_fichier'] = file.filename
        file_analysis['taille_fichier'] = f"{(file.size / 1024):.2f} KB"
        file_analysis['nombre_lignes'] = len(df_original)
        file_analysis['nombre_colonnes'] = len(df_original.columns)
        file_analysis['colonnes'] = df_original.columns.tolist()
        file_analysis['types_donnees'] = {col: str(df_original[col].dtype) for col in df_original.columns}
        # Convertir les NaN des valeurs manquantes en 0 pour la sérialisation JSON
        file_analysis['valeurs_manquantes'] = {k: v if pd.notna(v) else 0 for k, v in df_original.isnull().sum().to_dict().items()}
        # Remplacer inf/-inf/NaN par None pour la sérialisation JSON
        temp_describe = df_original.describe(include='all')
        file_analysis['resume_statistique'] = clean_nans_infs_recursive(temp_describe.to_dict())


    try:
        # Prétraitement du DataFrame original pour la prédiction
        # On passe explicitement les colonnes attendues et originales
        df_processed_for_prediction, used_client_cols, ignored_client_cols, missing_trained_cols = \
            observation_generator.generate_observations(
                df_original.copy(),
                app_expected_columns_after_dummies, # Pass the stored values
                app_original_trained_features       # Pass the stored values
            )
        logging.info(f"Données prétraitées pour la prédiction. Forme : {df_processed_for_prediction.shape}")
        
        file_analysis['critères_pris_en_charge'] = [
            observation_generator.get_original_feature_name(col, app_original_trained_features)
            for col in used_client_cols
        ]
        file_analysis['critères_non_pris_en_charge_a_ignorer'] = [
            col.replace('_', ' ').capitalize() 
            for col in ignored_client_cols
        ]
        file_analysis['critères_manquants_a_entrainer'] = [
            col.replace('_', ' ').capitalize() 
            for col in missing_trained_cols
        ]
        if 'nom_prenom' in ignored_client_cols:
            file_analysis['critères_non_pris_en_charge_a_ignorer'].append("Nom Prenom (identifiant client)")

    except Exception as e:
        logging.error(f"Erreur lors de la préparation des données pour prédiction : {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur lors de la préparation des données : {e}")

    # Commencer le DataFrame de résultats avec toutes les colonnes originales et l'identifiant client
    df_results = df_original.copy()

    # --- Prédiction pour crédit consommation (scoring_PC) ---
    try:
        model_conso = models['conso']
        if hasattr(model_conso, 'predict_proba') and len(model_conso.classes_) > 1:
            predictions_conso = model_conso.predict_proba(df_processed_for_prediction)[:, 1]
            df_results['scoring_PC'] = predictions_conso
            logging.info(f"Scores 'scoring_PC' générés pour {len(predictions_conso)} clients.")
        else:
            logging.warning("Le modèle consommation n'est pas entraîné pour predict_proba ou est mono-classe. 'scoring_PC' sera NaN.")
            df_results['scoring_PC'] = np.nan
    except Exception as e:
        logging.error(f"Erreur lors de la prédiction du scoring_PC : {e}", exc_info=True)
        df_results['scoring_PC'] = np.nan
        logging.warning("Impossible de générer 'scoring_PC'. Colonne remplie de NaN.")

    # --- Prédiction pour crédit immobilier (scoring_PI) ---
    try:
        model_immo = models['immo']
        if hasattr(model_immo, 'predict_proba') and len(model_immo.classes_) > 1:
            predictions_immo = model_immo.predict_proba(df_processed_for_prediction)[:, 1]
            df_results['scoring_PI'] = predictions_immo
            logging.info(f"Scores 'scoring_PI' générés pour {len(predictions_immo)} clients.")
        else:
            logging.warning("Le modèle immobilier n'est pas entraîné pour predict_proba ou est mono-classe. 'scoring_PI' sera NaN.")
            df_results['scoring_PI'] = np.nan
    except Exception as e:
        logging.error(f"Erreur lors de la prédiction du scoring_PI : {e}", exc_info=True)
        df_results['scoring_PI'] = np.nan
        logging.warning("Impossible de générer 'scoring_PI'. Colonne remplie de NaN.")


    # Déterminer la colonne de score primaire basée sur le paramètre credit_type
    primary_score_column = 'scoring_PC' if credit_type == 'conso' else 'scoring_PI'
    
    if primary_score_column in df_results.columns and not df_results[primary_score_column].isnull().all():
        df_results['score_appetence'] = df_results[primary_score_column]
    else:
        df_results['score_appetence'] = np.nan 
        logging.warning(f"La colonne de score primaire '{primary_score_column}' est manquante ou entièrement NaN. 'score_appetence' est défini à NaN.")


    num_appetent_clients = (df_results['score_appetence'] >= appetence_threshold).sum()
    file_analysis['nombre_clients_appetents'] = int(num_appetent_clients)
    file_analysis['seuil_appetence_utilise'] = appetence_threshold
    file_analysis['score_primaire_calcule'] = primary_score_column 

    # --- Appel de la fonction pour ajouter les insights client ---
    # On passe maintenant app_original_trained_features à add_client_insights_to_df
    df_results = observation_generator.add_client_insights_to_df(
        df_results=df_results,
        df_original=df_original, 
        model_feature_importances=model_performance_metrics.get(credit_type, {}).get('feature_importances', []),
        original_trained_features=app_original_trained_features 
    )

    base_filename = os.path.splitext(file.filename)[0].replace(' ', '_').lower()
    
    reports_dir = os.path.join(BASE_DIR, "reports")
    os.makedirs(reports_dir, exist_ok=True)

    report_paths = {}

    # --- Génération du rapport PDF ---
    pdf_filename = f"rapport_scoring_{base_filename}_{credit_type}.pdf"
    pdf_path = os.path.join(reports_dir, pdf_filename)
    try:
        generate_pdf_report(
            df_results, 
            pdf_path,
            credit_type, 
            model_performance_metrics.get(credit_type, {}),
            file_analysis,
            df_original, 
            app_original_trained_features 
        )
        logging.info(f"Rapport PDF généré : {pdf_path}")
        report_paths['pdf'] = pdf_filename
        temp_reports_storage[pdf_filename] = pdf_path
    except Exception as e:
        logging.error(f"Erreur lors de la génération du rapport PDF : {e}", exc_info=True)
        report_paths['pdf'] = None

    # --- Génération du rapport CSV ---
    csv_filename = f"resultats_scoring_{base_filename}_{credit_type}.csv"
    csv_path = os.path.join(reports_dir, csv_filename)
    try:
        df_results.to_csv(csv_path, index=False)
        logging.info(f"Rapport CSV généré : {csv_path}")
        report_paths['csv'] = csv_filename
        temp_reports_storage[csv_filename] = csv_path
    except Exception as e:
        logging.error(f"Erreur lors de la génération du rapport CSV : {e}", exc_info=True)
        report_paths['csv'] = None

    # --- Génération du rapport XLSX ---
    xlsx_filename = f"resultats_scoring_{base_filename}_{credit_type}.xlsx"
    xlsx_path = os.path.join(reports_dir, xlsx_filename)
    try:
        df_results.to_excel(xlsx_path, index=False)
        logging.info(f"Rapport XLSX généré : {xlsx_path}")
        report_paths['xlsx'] = xlsx_filename
        temp_reports_storage[xlsx_filename] = xlsx_path
    except Exception as e:
        logging.error(f"Erreur lors de la génération du rapport XLSX : {e}", exc_info=True)
        report_paths['xlsx'] = None

    # Préparer les données pour le tableau détaillé du frontend
    predictions_with_details = []
    num_clients_to_display = min(50, len(df_results)) 

    cols_to_display_in_frontend_original_data = df_original.columns.tolist()
    if 'score_appetence' in cols_to_display_in_frontend_original_data:
        cols_to_display_in_frontend_original_data.remove('score_appetence')

    for i in range(num_clients_to_display):
        client_row = df_results.iloc[i]
        original_data_for_client = {}
        for col in cols_to_to_display_in_frontend_original_data:
            val = client_row.get(col, None)
            original_data_for_client[col] = clean_nans_infs_recursive(val)

        scoring_pc = client_row.get('scoring_PC', np.nan)
        scoring_pi = client_row.get('scoring_PI', np.nan)
        score_appetence = client_row.get('score_appetence', np.nan)

        predictions_with_details.append({
            "original_data": original_data_for_client, 
            "scoring_PC": clean_nans_infs_recursive(scoring_pc),
            "scoring_PI": clean_nans_infs_recursive(scoring_pi),
            "score_appetence": clean_nans_infs_recursive(score_appetence),
            "observations_forces": client_row['observations_forces'],
            "observations_faiblesses": client_row['observations_faiblesses']
        })
    
    final_response_data = {
        "message": "Prédiction effectuée avec succès et rapports générés.",
        "predictions": clean_nans_infs_recursive(df_results[primary_score_column].tolist()),
        "predictions_with_details": predictions_with_details,
        "model_metrics": model_performance_metrics.get(credit_type, {}),
        "file_analysis": file_analysis,
        "report_paths": report_paths
    }
    
    return jsonable_encoder(clean_nans_infs_recursive(final_response_data))

# Endpoints de téléchargement des rapports temporaires
@app.get("/download_report/{report_filename:path}")
async def download_pdf_report(report_filename: str):
    file_path = temp_reports_storage.get(report_filename)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Rapport PDF '{report_filename}' non trouvé ou expiré. Veuillez relancer l'analyse.")
    
    return FileResponse(file_path, media_type="application/pdf", filename=report_filename, background=BackgroundTask(lambda: os.remove(file_path) if os.path.exists(file_path) else None))

@app.get("/download_csv/{filename:path}")
async def download_csv_report(filename: str):
    file_path = temp_reports_storage.get(filename)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Rapport CSV '{filename}' non trouvé ou expiré. Veuillez relancer l'analyse.")
    
    return FileResponse(file_path, media_type="text/csv", filename=filename, background=BackgroundTask(lambda: os.remove(file_path) if os.path.exists(file_path) else None))

@app.get("/download_xlsx/{filename:path}")
async def download_xlsx_report(filename: str):
    file_path = temp_reports_storage.get(filename)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Rapport XLSX '{filename}' non trouvé ou expiré. Veuillez relancer l'analyse.")
    
    return FileResponse(file_path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=filename, background=BackgroundTask(lambda: os.remove(file_path) if os.path.exists(file_path) else None))
