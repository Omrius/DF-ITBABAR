import pandas as pd
import os
import joblib
import numpy as np
import io # Pour lire les fichiers en mémoire

# Chemin local vers le fichier de données d'entraînement dans l'image Docker
# Assurez-vous que ce fichier est bien dans votre dépôt Git à backend/data/train_dataset.xlsx
DATA_PATH_FOR_COLUMNS = os.path.join(os.path.dirname(__file__), "../data/train_dataset.xlsx")

# Variables globales pour stocker les colonnes attendues
EXPECTED_COLUMNS = None
ORIGINAL_TRAINED_FEATURES = None

def _load_expected_columns():
    """
    Charge les colonnes attendues du DataFrame après l'encodage one-hot
    et les noms des features originales en se basant sur le jeu de données d'entraînement,
    depuis le système de fichiers local du conteneur.
    """
    global EXPECTED_COLUMNS, ORIGINAL_TRAINED_FEATURES
    if EXPECTED_COLUMNS is None or ORIGINAL_TRAINED_FEATURES is None:
        try:
            print(f"Chargement de {DATA_PATH_FOR_COLUMNS} pour déterminer les colonnes attendues...")
            df_train_full = pd.read_excel(DATA_PATH_FOR_COLUMNS)
            
            # Stocker les noms des colonnes originales avant tout traitement
            ORIGINAL_TRAINED_FEATURES = df_train_full.columns.tolist()

            # Retirer les colonnes cibles si elles sont présentes
            cols_to_drop = []
            if 'appetence_conso' in df_train_full.columns:
                cols_to_drop.append('appetence_conso')
            if 'appetence_immo' in df_train_full.columns:
                cols_to_drop.append('appetence_immo')
            
            # Appliquer get_dummies pour obtenir les colonnes attendues du modèle
            X_train_dummy = pd.get_dummies(df_train_full.drop(columns=cols_to_drop, errors='ignore'))
            EXPECTED_COLUMNS = X_train_dummy.columns.tolist()
            print(f"Colonnes attendues déterminées : {len(EXPECTED_COLUMNS)} colonnes.")
            print(f"Features originales d'entraînement stockées : {len(ORIGINAL_TRAINED_FEATURES)} colonnes.")

        except FileNotFoundError:
            print(f"Erreur: Fichier d'entraînement '{DATA_PATH_FOR_COLUMNS}' non trouvé.")
            print("Impossible de déterminer les colonnes attendues pour la prédiction.")
            raise FileNotFoundError(f"Fichier d'entraînement '{DATA_PATH_FOR_COLUMNS}' introuvable. Assurez-vous qu'il est dans le dossier backend/data de votre dépôt.")
        except Exception as e:
            print(f"Erreur lors du chargement des colonnes attendues à partir de '{DATA_PATH_FOR_COLUMNS}' : {e}")
            raise RuntimeError(f"Échec du chargement des colonnes attendues : {e}")

def get_original_feature_name(dummy_feature_name: str) -> str:
    """
    Tente de convertir un nom de caractéristique encodée (dummy) en un nom plus lisible.
    Utilise ORIGINAL_TRAINED_FEATURES global.
    """
    if ORIGINAL_TRAINED_FEATURES is None:
        _load_expected_columns() # S'assurer que les features originales sont chargées

    for orig_feat in ORIGINAL_TRAINED_FEATURES:
        if dummy_feature_name.startswith(f"{orig_feat}_"):
            category = dummy_feature_name.split(f"{orig_feat}_", 1)[1].replace('_', ' ').capitalize()
            return f"{orig_feat.replace('_', ' ').capitalize()}: {category}"
        elif dummy_feature_name == orig_feat:
            return orig_feat.replace('_', ' ').capitalize()
    return dummy_feat_name.replace('_', ' ').capitalize()


def generate_observations(df_client: pd.DataFrame) -> (pd.DataFrame, list, list, list):
    """
    Prépare les données brutes des clients pour la prédiction par le modèle.
    """
    if EXPECTED_COLUMNS is None or ORIGINAL_TRAINED_FEATURES is None:
        _load_expected_columns()

    if not EXPECTED_COLUMNS:
        raise ValueError("Les colonnes attendues pour la prédiction n'ont pas pu être chargées. Vérifiez le fichier d'entraînement.")

    df_processed = pd.get_dummies(df_client)

    used_client_cols = [col for col in df_processed.columns if col in EXPECTED_COLUMNS]
    ignored_client_cols = [col for col in df_processed.columns if col not in EXPECTED_COLUMNS]
    missing_trained_cols = [col for col in EXPECTED_COLUMNS if col not in df_processed.columns]

    final_df = df_processed.reindex(columns=EXPECTED_COLUMNS, fill_value=0)
    
    return final_df, used_client_cols, ignored_client_cols, missing_trained_cols


def add_client_insights_to_df(df_results: pd.DataFrame, df_original: pd.DataFrame, model_feature_importances: list) -> pd.DataFrame:
    """
    Ajoute les colonnes 'client_identifier', 'observations_forces', et 'observations_faiblesses'
    au DataFrame des résultats.
    """
    if ORIGINAL_TRAINED_FEATURES is None:
        _load_expected_columns()

    if 'nom' in df_original.columns:
        df_results['client_identifier'] = df_original['nom']
    elif 'id_client' in df_original.columns:
        df_results['client_identifier'] = df_original['id_client']
    else:
        df_results['client_identifier'] = [f"Client {i+1}" for i in range(len(df_original))]

    df_results['observations_forces'] = ""
    df_results['observations_faiblesses'] = ""
    
    top_dummy_features = [f[0] for f in model_feature_importances[:5]]
    
    for index, row in df_results.iterrows():
        forces = []
        faiblesses = []
        
        original_row_data = df_original.loc[index] 

        for feature_dummy_name in top_dummy_features:
            if feature_dummy_name in row.index:
                value_processed = row[feature_dummy_name]
                readable_name = get_original_feature_name(feature_dummy_name)
                
                original_col_name_cleaned = readable_name.split(':')[0].strip().replace(' ', '_').lower()

                if original_col_name_cleaned in original_row_data.index:
                    original_value = original_row_data[original_col_name_cleaned]

                    if pd.api.types.is_numeric_dtype(df_original[original_col_name_cleaned]) and pd.notna(original_value):
                        mean_val = df_original[original_col_name_cleaned].mean()
                        
                        if original_col_name_cleaned in ['revenu', 'age', 'anciennete_client_annees']:
                            if original_value > mean_val:
                                 forces.append(f"{readable_name} Élevé ({original_value:.0f})")
                            elif original_value < mean_val:
                                 faiblesses.append(f"{readable_name} Faible ({original_value:.0f})")
                        elif original_col_name_cleaned in ['taux_endettement', 'nb_credits', 'montant_credits']:
                            if original_value < mean_val:
                                 forces.append(f"{readable_name} Faible ({original_value:.0f})")
                            elif original_value > mean_val:
                                 faiblesses.append(f"{readable_name} Élevé ({original_value:.0f})")
                    elif value_processed == 1:
                        if "cdi" in readable_name.lower() or "retraite" in readable_name.lower() or "salari" in readable_name.lower():
                            forces.append(f"{readable_name} (Présent)")
                        elif "credit_existant" in feature_dummy_name.lower() and original_value == 1:
                            forces.append(f"{readable_name} (Oui)")
                        elif "chomage" in readable_name.lower() or "etudiant" in readable_name.lower():
                             faiblesses.append(f"{readable_name} (Présent)")

        df_results.at[index, 'observations_forces'] = "; ".join(forces) if forces else "N/A"
        df_results.at[index, 'observations_faiblesses'] = "; ".join(faiblesses) if faiblesses else "N/A"
    
    return df_results

