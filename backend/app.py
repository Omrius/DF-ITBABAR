from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.encoders import jsonable_encoder
import pandas as pd
import joblib
import os
from io import BytesIO, StringIO
import logging
import json
import numpy as np
import tempfile
import asyncio
from starlette.background import BackgroundTask # Import nécessaire pour BackgroundTask


# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Importation des utilitaires avec chemins ABSOLUS par rapport au Root Directory de Render ('backend/')
# Correct: Python va chercher 'utils' directement dans le chemin de l'application.
import utils.observation_generator as observation_generator
from utils.observation_generator import get_original_feature_name, add_client_insights_to_df 
from utils.report_generator import generate_pdf_report


app = FastAPI()

# Middleware CORS
logging.info("DEBUG: Application du CORSMiddleware...")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permettre toutes les origines pour le développement/démo simple
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.info("DEBUG: CORSMiddleware appliqué.")


# Construire les chemins absolus pour les modèles et métriques (locaux dans le conteneur)
# Render définit '/opt/render/project/src/' comme la racine de votre dépôt.
# Si votre Root Directory sur Render est 'backend/', alors les chemins sont relatifs à 'backend/'.
# Les fichiers sont donc dans 'models/' et 'data/' par rapport à 'backend/'
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) 
MODEL_CONSO_PATH = os.path.join(BASE_DIR, "models", "model_conso.pkl")
MODEL_IMMO_PATH = os.path.join(BASE_DIR, "models", "model_immo.pkl")
METRICS_PATH = os.path.join(BASE_DIR, "models", "metrics.json")


# Dictionnaire pour stocker les modèles chargés et les métriques
models = {}
model_performance_metrics = {}

@app.on_event("startup")
async def load_resources():
    """Charge les modèles de scoring et les métriques au démarrage de l'application depuis les fichiers locaux."""
    logging.info("DEBUG: Exécution de l'événement de démarrage (startup event).")
    
    global model_performance_metrics

    # Chargement des modèles
    try:
        logging.info(f"Chargement du modèle consommation depuis : {MODEL_CONSO_PATH}")
        models['conso'] = joblib.load(MODEL_CONSO_PATH)
        logging.info("Modèle consommation chargé avec succès.")
    except FileNotFoundError:
        logging.error(f"Erreur : Le fichier du modèle consommation est introuvable à {MODEL_CONSO_PATH}")
        raise HTTPException(status_code=500, detail=f"Modèle consommation introuvable : {MODEL_CONSO_PATH}. Assurez-vous qu'il est inclus dans l'image Docker.")
    except Exception as e:
        logging.error(f"Erreur lors du chargement du modèle consommation : {e}")
        raise HTTPException(status_code=500, detail=f"Erreur de chargement du modèle consommation : {e}")

    try:
        logging.info(f"Chargement du modèle immobilier depuis : {MODEL_IMMO_PATH}")
        models['immo'] = joblib.load(MODEL_IMMO_PATH)
        logging.info("Modèle immobilier chargé avec succès.")
    except FileNotFoundError:
        logging.error(f"Erreur : Le fichier du modèle immobilier est introuvable à {MODEL_IMMO_PATH}")
        raise HTTPException(status_code=500, detail=f"Modèle immobilier introuvable : {MODEL_IMMO_PATH}. Assurez-vous qu'il est inclus dans l'image Docker.")
    except Exception as e:
        logging.error(f"Erreur lors du chargement du modèle immobilier : {e}")
        raise HTTPException(status_code=500, detail=f"Erreur de chargement du modèle immobilier : {e}")

    # Chargement des métriques (incluant les feature importances)
    try:
        logging.info(f"Chargement des métriques depuis : {METRICS_PATH}")
        with open(METRICS_PATH, 'r') as f:
            model_performance_metrics = json.load(f)
        logging.info("Métriques loaded successfully.")
    except FileNotFoundError:
        logging.warning(f"Avertissement : Le fichier de métriques est introuvable à {METRICS_PATH}. Les métriques ne seront pas affichées.")
        model_performance_metrics = {}
    except json.JSONDecodeError:
        logging.error(f"Erreur : Le fichier de métriques '{METRICS_PATH}' n'est pas un JSON valide.")
        model_performance_metrics = {}
    except Exception as e:
        logging.error(f"Erreur lors du chargement des métriques : {e}")
        model_performance_metrics = {}

    # Initialisation de observation_generator pour charger les colonnes attendues (depuis local)
    try:
        logging.info("DEBUG: Chargement des colonnes attendues via observation_generator._load_expected_columns()...")
        observation_generator._load_expected_columns()
        logging.info("DEBUG: Colonnes attendues chargées avec succès.")
    except Exception as e:
        logging.error(f"Erreur critique lors du pré-chargement des colonnes attendues : {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'initialisation des colonnes du modèle : {e}")


@app.get("/")
async def read_root():
    """Endpoint de test pour vérifier si le backend répond."""
    logging.info("DEBUG: Requête reçue sur l'endpoint /")
    return {"message": "Bienvenue sur l'API Datafindser ! Le backend fonctionne."}


temp_reports_storage = {}

@app.post("/predict_aptitude/")
async def predict_aptitude(
    file: UploadFile = File(...),
    credit_type: str = "conso",
    appetence_threshold: float = 0.5
):
    """
    Endpoint pour prédire l'appétence au crédit d'un client à partir d'un fichier Excel ou CSV.
    Génère également une analyse du fichier et des rapports PDF, CSV, XLSX.
    Les rapports sont sauvegardés temporairement et accessibles via des liens de téléchargement immédiats.
    """
    logging.info(f"Requête reçue sur /predict_aptitude/ pour type de crédit: {credit_type}")

    if credit_type not in models:
        logging.error(f"Type de crédit '{credit_type}' non supporté. Types supportés : {list(models.keys())}")
        raise HTTPException(status_code=400, detail=f"Type de crédit non valide. Choisissez 'conso' ou 'immo'.")

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

    file_analysis = {}
    if df_original is not None:
        file_analysis['nom_fichier'] = file.filename
        file_analysis['taille_fichier'] = f"{(file.size / 1024):.2f} KB"
        file_analysis['nombre_lignes'] = len(df_original)
        file_analysis['nombre_colonnes'] = len(df_original.columns)
        file_analysis['colonnes'] = df_original.columns.tolist()
        file_analysis['types_donnees'] = {col: str(df_original[col].dtype) for col in df_original.columns}
        file_analysis['valeurs_manquantes'] = {k: v if pd.notna(v) else 0 for k, v in df_original.isnull().sum().to_dict().items()}
        file_analysis['resume_statistique'] = df_original.describe(include='all').replace([np.inf, -np.inf, np.nan], None).to_dict()


    try:
        df_processed, used_client_cols, ignored_client_cols, missing_trained_cols = observation_generator.generate_observations(df_original.copy())
        logging.info(f"Données traitées pour la prédiction. Forme : {df_processed.shape}")
        
        file_analysis['critères_pris_en_charge'] = [get_original_feature_name(col) for col in used_client_cols]
        file_analysis['critères_non_pris_en_charge_a_ignorer'] = [col.replace('_', ' ').capitalize() for col in ignored_client_cols]
        file_analysis['critères_manquants_a_entrainer'] = [get_original_feature_name(col) for col in missing_trained_cols]

    except Exception as e:
        logging.error(f"Erreur lors de la génération des observations : {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur lors de la préparation des données : {e}")

    model = models[credit_type]
    predictions = model.predict_proba(df_processed)[:, 1]
    logging.info(f"Prédictions générées pour {len(predictions)} clients.")

    df_results = df_original.copy()
    df_results['score_appetence'] = predictions

    num_appetent_clients = (df_results['score_appetence'] >= appetence_threshold).sum()
    file_analysis['nombre_clients_appetents'] = int(num_appetent_clients)
    file_analysis['seuil_appetence_utilise'] = appetence_threshold

    df_results = add_client_insights_to_df(
        df_results=df_results,
        df_original=df_original,
        model_feature_importances=model_performance_metrics.get(credit_type, {}).get('feature_importances', [])
    )

    base_filename = os.path.splitext(file.filename)[0].replace(' ', '_').lower()
    
    report_paths = {}

    # --- Génération et stockage temporaire du rapport PDF ---
    pdf_filename_base = f"rapport_scoring_{base_filename}_{credit_type}.pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf", dir="/tmp") as tmp_pdf_file:
        temp_pdf_path = tmp_pdf_file.name
    try:
        generate_pdf_report(
            df_results,
            temp_pdf_path,
            credit_type,
            model_performance_metrics.get(credit_type, {}),
            file_analysis,
            df_original
        )
        temp_reports_storage[pdf_filename_base] = temp_pdf_path
        report_paths['pdf'] = pdf_filename_base
        logging.info(f"Rapport PDF généré et stocké temporairement : {temp_pdf_path}")
    except Exception as e:
        logging.error(f"Erreur lors de la génération du rapport PDF : {e}", exc_info=True)
        report_paths['pdf'] = None
        if os.path.exists(temp_pdf_path): os.remove(temp_pdf_path)


    # --- Génération et stockage temporaire du rapport CSV ---
    csv_filename_base = f"resultats_scoring_{base_filename}_{credit_type}.csv"
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv", dir="/tmp") as tmp_csv_file:
        temp_csv_path = tmp_csv_file.name
    try:
        df_results.to_csv(temp_csv_path, index=False)
        temp_reports_storage[csv_filename_base] = temp_csv_path
        report_paths['csv'] = csv_filename_base
        logging.info(f"Rapport CSV généré et stocké temporairement : {temp_csv_path}")
    except Exception as e:
        logging.error(f"Erreur lors de la génération du rapport CSV : {e}", exc_info=True)
        report_paths['csv'] = None
        if os.path.exists(temp_csv_path): os.remove(temp_csv_path)

    # --- Génération et stockage temporaire du rapport XLSX ---
    xlsx_filename_base = f"resultats_scoring_{base_filename}_{credit_type}.xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", dir="/tmp") as tmp_xlsx_file:
        temp_xlsx_path = tmp_xlsx_file.name
    try:
        df_results.to_excel(temp_xlsx_path, index=False)
        temp_reports_storage[xlsx_filename_base] = temp_xlsx_path
        report_paths['xlsx'] = xlsx_filename_base
        logging.info(f"Rapport XLSX généré et stocké temporairement : {temp_xlsx_path}")
    except Exception as e:
        logging.error(f"Erreur lors de la génération du rapport XLSX : {e}", exc_info=True)
        report_paths['xlsx'] = None
        if os.path.exists(temp_xlsx_path): os.remove(temp_xlsx_path)

    predictions_with_details = []
    num_clients_to_display = min(50, len(df_results))
    
    original_cols_for_frontend = [col for col in ['client_identifier', 'age', 'revenu', 'nb_enfants', 'statut_pro', 'anciennete_client_annees', 'credit_existant_conso'] if col in df_results.columns]

    for i in range(num_clients_to_display):
        client_row = df_results.iloc[i]
        original_data_for_client = {}
        for col in original_cols_for_frontend:
            val = client_row.get(col, None)
            if pd.isna(val):
                original_data_for_client[col] = None
            elif isinstance(val, (np.integer, np.floating)):
                original_data_for_client[col] = val.item()
            else:
                original_data_for_client[col] = val

        predictions_with_details.append({
            "original_data": original_data_for_client,
            "score_appetence": client_row['score_appetence'],
            "observations_forces": client_row['observations_forces'],
            "observations_faiblesses": client_row['observations_faiblesses']
        })

    return jsonable_encoder({
        "message": "Prédiction effectuée avec succès et rapports générés.",
        "predictions": predictions.tolist(),
        "predictions_with_details": predictions_with_details,
        "model_metrics": model_performance_metrics.get(credit_type, {}),
        "file_analysis": file_analysis,
        "report_paths": report_paths
    })

# --- Endpoints de téléchargement local ---
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
