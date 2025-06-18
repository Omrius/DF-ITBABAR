import pandas as pd
import os
import numpy as np
import io # Pour lire les fichiers en mémoire
import json # Pour lire le fichier metrics.json

# Chemin local vers le fichier de données d'entraînement dans l'image Docker
DATA_PATH_FOR_COLUMNS = os.path.join(os.path.dirname(__file__), "../data/train_dataset.xlsx")
METRICS_PATH_FOR_FEATURES = os.path.join(os.path.dirname(__file__), "../models/metrics.json")


# Définir explicitement toutes les catégories possibles pour les colonnes catégorielles
# Ceci est CRUCIAL pour assurer la cohérence des colonnes après pd.get_dummies
# Ces valeurs doivent correspondre aux valeurs attendues dans votre dataset d'entraînement
CATEGORICAL_FEATURES_WITH_VALUES = {
    'situation_familiale': ['1', '2', '3'], # 1 = marié, 2 = célibataire, 3 = divorcé (converties en string)
    'credit_simt': ['0', '1'],             # 0 = non, 1 = oui (converties en string)
    'type_contrat': ['CDI', 'CDD', 'etudiant', 'sans'],
    # Ajoutez d'autres colonnes catégorielles si nécessaire
}

def _load_expected_columns_and_original_features_for_startup():
    """
    Charge les colonnes attendues du DataFrame après l'encodage one-hot
    et les noms des features originales en se basant sur le jeu de données d'entraînement,
    depuis metrics.json. Cette fonction est appelée UNIQUEMENT au démarrage de l'application FastAPI
    et retourne les valeurs.
    """
    
    expected_columns_after_dummies = None
    original_trained_features = None

    try:
        print(f"DEBUG: _load_expected_columns_and_original_features_for_startup - Chargement de {DATA_PATH_FOR_COLUMNS} pour déterminer les colonnes originales et leur type...")
        df_train_full = pd.read_excel(DATA_PATH_FOR_COLUMNS)
        
        TARGET_CONSO = 'credit_conso' 
        TARGET_IMMO = 'credit_imo'
        COLS_TO_IGNORE_TRAINING = ['nom_prenom'] 
        
        original_trained_features = [
            col for col in df_train_full.columns 
            if col not in [TARGET_CONSO, TARGET_IMMO] and col not in COLS_TO_IGNORE_TRAINING
        ]
        print(f"DEBUG: _load_expected_columns_and_original_features_for_startup - ORIGINAL_TRAINED_FEATURES chargées: {len(original_trained_features)} colonnes.")

        if os.path.exists(METRICS_PATH_FOR_FEATURES):
            with open(METRICS_PATH_FOR_FEATURES, 'r') as f:
                metrics = json.load(f)
                expected_columns_after_dummies = metrics.get('full_trained_dummy_features')
                if expected_columns_after_dummies is None:
                    print("AVERTISSEMENT: 'full_trained_dummy_features' non trouvé dans metrics.json. Recalcul en fallback.")
                    expected_columns_after_dummies = _recalculate_expected_columns_for_startup(df_train_full)
        else:
            print(f"AVERTISSEMENT: Fichier de métriques '{METRICS_PATH_FOR_FEATURES}' introuvable. Recalcul des colonnes attendues.")
            expected_columns_after_dummies = _recalculate_expected_columns_for_startup(df_train_full)

        if expected_columns_after_dummies is None:
            raise ValueError("Impossible de déterminer EXPECTED_COLUMNS_AFTER_DUMMIES. Vérifiez metrics.json ou train_dataset.xlsx.")
        print(f"DEBUG: _load_expected_columns_and_original_features_for_startup - EXPECTED_COLUMNS_AFTER_DUMMIES chargées: {len(expected_columns_after_dummies)} colonnes.")

    except FileNotFoundError as e:
        print(f"ERREUR: Fichier de données ou métriques introuvable lors du chargement des colonnes attendues : {e}")
        raise
    except Exception as e:
        print(f"ERREUR in _load_expected_columns_and_original_features_for_startup : {e}")
        raise
    
    return expected_columns_after_dummies, original_trained_features

def _recalculate_expected_columns_for_startup(df_train_full):
    """
    Recalcule les colonnes attendues à partir du DataFrame d'entraînement
    si elles ne peuvent pas être chargées depuis metrics.json.
    Cette fonction doit répliquer *exactement* la logique de sélection
    et de prétraitement des features de train_model.py.
    """
    print("DEBUG: _recalculate_expected_columns_for_startup - Recalcul des colonnes attendues à partir du dataset d'entraînement...")
    
    TARGET_CONSO = 'credit_conso' 
    TARGET_IMMO = 'credit_imo'
    COLS_TO_IGNORE_TRAINING = ['nom_prenom'] 

    feature_cols_for_dummies = [
        col for col in df_train_full.columns 
        if col not in [TARGET_CONSO, TARGET_IMMO] + COLS_TO_IGNORE_TRAINING
    ]
    X_temp = df_train_full[feature_cols_for_dummies].copy()

    # Appliquer le CategoricalDtype avec les catégories complètes avant get_dummies
    for col, categories in CATEGORICAL_FEATURES_WITH_VALUES.items():
        if col in X_temp.columns:
            # Convertir en string d'abord pour gérer les ints ou floats qui représentent des catégories
            X_temp[col] = X_temp[col].astype(str)
            X_temp[col] = pd.Categorical(X_temp[col], categories=categories)
            
    X_temp = pd.get_dummies(X_temp, drop_first=True)
    expected_columns_after_dummies = sorted(X_temp.columns.tolist())
    print(f"DEBUG: _recalculate_expected_columns_for_startup - Colonnes attendues recalculées : {len(expected_columns_after_dummies)} colonnes.")
    return expected_columns_after_dummies


def get_original_feature_name(dummy_feature_name, original_trained_features):
    """
    Convertit un nom de feature dummy (ex: 'type_contrat_CDI') en son nom original (ex: 'type_contrat').
    """
    for original_col in original_trained_features:
        if dummy_feature_name.startswith(original_col + '_') or dummy_feature_name == original_col:
            return original_col
    return dummy_feature_name # Retourne l'original si pas de correspondance (ex: déjà numérique)


def generate_observations(df_client, expected_columns_after_dummies, original_trained_features):
    """
    Prétraite les données du client, s'assure que les colonnes correspondent à celles du modèle entraîné,
    et identifie les colonnes utilisées, ignorées ou manquantes.

    Args:
        df_client (pd.DataFrame): Le DataFrame contenant les données du ou des clients à prédire.
        expected_columns_after_dummies (list): Liste des noms de colonnes attendus après l'encodage one-hot.
        original_trained_features (list): Liste des noms des features originales utilisées pour l'entraînement.

    Returns:
        tuple: (df_aligned, used_client_cols, ignored_client_cols, missing_trained_cols)
            - df_aligned (pd.DataFrame): DataFrame client prétraité et aligné.
            - used_client_cols (list): Liste des colonnes originales du client utilisées comme features.
            - ignored_client_cols (list): Liste des colonnes originales du client non utilisées comme features.
            - missing_trained_cols (list): Liste des colonnes du modèle qui sont manquantes chez le client.
    """
    print(f"DEBUG: generate_observations - Initial df_client columns: {df_client.columns.tolist()}")

    TARGET_CONSO = 'credit_conso' 
    TARGET_IMMO = 'credit_imo'
    KNOWN_NON_FEATURES = ['nom_prenom', 'client_identifier'] 
    
    df_client_copy = df_client.copy() 

    df_temp_for_dummies = df_client_copy[[
        col for col in df_client_copy.columns 
        if col in original_trained_features 
    ]].copy()
    print(f"DEBUG: generate_observations - df_temp_for_dummies columns before categorical conversion: {df_temp_for_dummies.columns.tolist()}")

    # Appliquer le CategoricalDtype avec les catégories complètes avant get_dummies
    for col, categories in CATEGORICAL_FEATURES_WITH_VALUES.items():
        if col in df_temp_for_dummies.columns:
            # Convertir en string d'abord pour gérer les ints ou floats qui représentent des catégories
            df_temp_for_dummies[col] = df_temp_for_dummies[col].astype(str)
            # Utiliser pd.Categorical pour forcer les catégories, même si elles ne sont pas toutes présentes dans ce df
            df_temp_for_dummies[col] = pd.Categorical(df_temp_for_dummies[col], categories=categories)
            
    print(f"DEBUG: generate_observations - df_temp_for_dummies columns after categorical conversion: {df_temp_for_dummies.columns.tolist()}")


    df_processed_dummies = pd.get_dummies(df_temp_for_dummies, drop_first=True)
    
    df_aligned = df_processed_dummies.reindex(columns=expected_columns_after_dummies, fill_value=0)
    
    df_aligned.index = df_client_copy.index

    df_aligned = df_aligned.fillna(0) 

    print(f"DEBUG: generate_observations - Final df_aligned shape: {df_aligned.shape}")
    print(f"DEBUG: generate_observations - Final df_aligned columns (first 5): {df_aligned.columns.tolist()[:5]}...")


    used_client_cols = [
        col for col in df_client.columns 
        if col in original_trained_features 
    ]
    print(f"DEBUG: generate_observations - used_client_cols (original): {used_client_cols}")


    ignored_client_cols = [
        col for col in df_client.columns 
        if col not in used_client_cols 
        and col not in [TARGET_CONSO, TARGET_IMMO] 
        and col not in ['client_identifier'] 
    ]
    print(f"DEBUG: generate_observations - ignored_client_cols (original): {ignored_client_cols}")


    missing_trained_cols = [
        get_original_feature_name(col, original_trained_features) 
        for col in expected_columns_after_dummies 
        if df_aligned[col].sum() == 0 and col not in df_processed_dummies.columns 
        and not col.startswith('nom_prenom_')
    ]
    missing_trained_cols = list(set(missing_trained_cols))
    print(f"DEBUG: generate_observations - missing_trained_cols (original, from dummy): {missing_trained_cols}")


    return df_aligned, used_client_cols, ignored_client_cols, missing_trained_cols


def add_client_insights_to_df(df_results, df_original, model_feature_importances, original_trained_features): 
    """
    Ajoute des colonnes d'observations (forces et faiblesses) à df_results
    en se basant sur le score d'appétence, les données originales et les importances des features.

    Args:
        df_results (pd.DataFrame): DataFrame contenant les scores et les données traitées.
        df_original (pd.DataFrame): DataFrame original du client avant prétraitement.
        model_feature_importances (list): Liste des tuples (feature_name, importance) du modèle.
        original_trained_features (list): Liste des noms des features originales utilisées pour l'entraînement du modèle. 
    Returns:
        pd.DataFrame: df_results avec les colonnes 'observations_forces' et 'observations_faiblesses' ajoutées.
    """
    
    # Prendre les 5 meilleures features, en s'assurant qu'il y en a si l'importance est > 0
    top_features_with_importance = [f for f in model_feature_importances if f[1] > 0][:5] 
    top_feature_names = [f[0] for f in top_features_with_importance]

    # Mock means should ideally come from statistical analysis of the training data
    mock_training_means = {
        'age': 45,
        'revenus': 5000,
        'mvt_crediteur': 3000,
        'mvt_debiteur': 2000,
        'solde_moy': 1500,
        'nb_credits': 3,
        'montant_credits': 50000,
        'taux_endettement': 0.3,
        'duree_anciennete': 10,
        'anciennete_emploi': 5,
        'anciente_compte': 7
    }

    df_results['observations_forces'] = ""
    df_results['observations_faiblesses'] = ""

    for index, row in df_results.iterrows():
        forces = []
        faiblesses = []
        
        # 1. Observation de haut niveau basée sur le score d'appétence global
        score_appetence_client = row.get('score_appetence', np.nan)
        if pd.notna(score_appetence_client):
            if score_appetence_client < 0.4: # Seuil pour score faible
                faiblesses.append(f"Score d'appétence globalement faible ({score_appetence_client:.2%})")
            elif score_appetence_client > 0.6: # Seuil pour score élevé
                forces.append(f"Score d'appétence globalement élevé ({score_appetence_client:.2%})")
            else: # Score modéré
                forces.append(f"Score d'appétence modéré ({score_appetence_client:.2%})")

        # 2. Itérer sur les caractéristiques les plus importantes pour les observations spécifiques
        for feature_dummy_name in top_feature_names:
            original_col_name_cleaned = get_original_feature_name(feature_dummy_name, original_trained_features) 

            original_value = df_original.at[index, original_col_name_cleaned] if original_col_name_cleaned in df_original.columns else None

            if original_value is None or pd.isna(original_value):
                continue

            readable_name = original_col_name_cleaned.replace('_', ' ').capitalize()

            # Gestion des caractéristiques numériques
            if isinstance(original_value, (int, float)):
                mean_val = mock_training_means.get(original_col_name_cleaned)
                if mean_val is not None:
                    # Définition des seuils relatifs à la moyenne
                    high_threshold = mean_val * 1.15 
                    low_threshold = mean_val * 0.85  
                    
                    if original_col_name_cleaned in ['revenus', 'mvt_crediteur', 'solde_moy', 'anciente_compte', 'anciennete_emploi', 'duree_anciennete']:
                        if original_value > high_threshold:
                            forces.append(f"{readable_name} très élevé ({original_value:.0f})")
                        elif original_value < low_threshold:
                            faiblesses.append(f"{readable_name} très faible ({original_value:.0f})")
                        # Si la valeur est entre low_threshold et high_threshold (c'est-à-dire "moyenne"),
                        # elle n'est ni une force ni une faiblesse *significative* pour expliquer le score.
                        # Elle n'est donc pas ajoutée aux listes ici.
                    elif original_col_name_cleaned in ['taux_endettement', 'nb_credits', 'mvt_debiteur', 'mt_plv_simt']:
                        if original_value < low_threshold:
                            forces.append(f"{readable_name} très faible ({original_value:.0f})")
                        elif original_value > high_threshold:
                            faiblesses.append(f"{readable_name} très élevé ({original_value:.0f})")
                        # Idem, pas d'ajout si "moyenne".

                    elif original_col_name_cleaned == 'age':
                        if original_value >= 30 and original_value <= 55: 
                            forces.append(f"{readable_name} Optimal ({original_value:.0f})")
                        else:
                            faiblesses.append(f"{readable_name} Non optimal ({original_value:.0f})")
                    elif original_col_name_cleaned == 'nbre_enfants':
                        if original_value > 0: 
                            forces.append(f"Nombre d'enfants ({original_value:.0f})")
                        # Pas d'observation si 0 enfants, ce n'est pas forcément une faiblesse.
                # else:
                #     # Si numérique mais pas de mock_training_means, juste indiquer la valeur
                #     # Ce cas devrait être rare si mock_training_means est complet pour les top features.
                #     forces.append(f"{readable_name}: {original_value:.0f}")

            # Gestion des caractéristiques catégorielles
            else: 
                str_original_value = str(original_value) 

                if original_col_name_cleaned == 'type_contrat':
                    if str_original_value == 'CDI':
                        forces.append("Type de contrat (CDI - Stable)")
                    elif str_original_value in ['CDD', 'etudiant', 'sans']:
                        faiblesses.append(f"Type de contrat ({str_original_value} - Moins stable)")
                    # Pas de else pour les catégories inconnues si on veut être strict sur forces/faiblesses
                elif original_col_name_cleaned == 'situation_familiale':
                    if str_original_value == '1': # Marié
                        forces.append("Situation familiale (Marié - Stable)")
                    elif str_original_value == '3': # Divorcé
                        faiblesses.append("Situation familiale (Divorcé - Facteur de risque)")
                    elif str_original_value == '2': # Célibataire
                        # Célibataire peut être neutre ou légèrement positif, selon l'analyse métier.
                        # Si ce n'est pas une force claire ou une faiblesse claire, on ne l'ajoute pas ici.
                        pass 
                elif original_col_name_cleaned == 'credit_simt':
                    if str_original_value == '0': # Pas de crédit confrère
                        forces.append("Crédit confrère (Non - Bon signe)")
                    elif str_original_value == '1': # Crédit confrère
                        faiblesses.append("Crédit confrère (Oui - Facteur de risque)")
                # else:
                #     # Générique pour toute autre caractéristique catégorielle non explicitement gérée
                #     # Pas d'ajout par défaut si on veut être strict.
                #     forces.append(f"{readable_name}: {str_original_value}")
            
        df_results.at[index, 'observations_forces'] = "; ".join(forces) if forces else "Aucune force majeure spécifique identifiée."
        df_results.at[index, 'observations_faiblesses'] = "; ".join(faiblesses) if faiblesses else "Aucune faiblesse majeure spécifique identifiée."

    return df_results
