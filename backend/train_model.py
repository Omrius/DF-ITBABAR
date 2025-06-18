import pandas as pd
import joblib
import os
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
import json
import numpy as np # Assurez-vous que numpy est importé

print("DEBUG: Démarrage du script train_model.py") # DEBUG PRINT

# Construire les chemins absolus pour data et models
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) # Répertoire du script train_model.py (backend/)

DATA_PATH = os.path.join(BASE_DIR, "data", "train_dataset.xlsx")
MODEL_CONSO_PATH = os.path.join(BASE_DIR, "models", "model_conso.pkl")
MODEL_IMMO_PATH = os.path.join(BASE_DIR, "models", "model_immo.pkl")
METRICS_PATH = os.path.join(BASE_DIR, "models", "metrics.json")

# Créer les dossiers s'ils n'existent pas
os.makedirs(os.path.join(BASE_DIR, "models"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)

# Définir explicitement toutes les catégories possibles pour les colonnes catégorielles
# Ceci doit être IDENTIQUE à CATEGORICAL_FEATURES_WITH_VALUES dans observation_generator.py
CATEGORICAL_FEATURES_WITH_VALUES = {
    'situation_familiale': ['1', '2', '3'], # 1 = marié, 2 = célibataire, 3 = divorcé (converties en string)
    'credit_simt': ['0', '1'],             # 0 = non, 1 = oui (converties en string)
    'type_contrat': ['CDI', 'CDD', 'etudiant', 'sans'],
}


# Création d'un dataset factice si le fichier n'existe pas (pour les tests)
if not os.path.exists(DATA_PATH):
    print(f"ATTENTION: Le fichier de données d'entraînement '{DATA_PATH}' est introuvable.")
    print("Génération d'un jeu de données factice pour l'entraînement.")
    # Générer le dataset factice ici (votre code original de generate_train_data.py)
    n = 5000
    data = {
        "age": np.random.randint(18, 70, size=n),
        "revenus": np.random.randint(1000, 10000, size=n),
        "credit_conso": np.random.randint(0, 2, size=n),  # 0 = pas de crédit, 1 = crédit conso
        "credit_immo": np.random.randint(0, 2, size=n),  # 0 = pas de crédit, 1 = crédit immo
        "historique": np.random.choice(["A", "I"], size=n, p=[0.85, 0.15]),  # A = bon client, I = incident
        "duree_anciennete": np.random.randint(0, 30, size=n),
        "nb_credits": np.random.randint(0, 10, size=n),
        "montant_credits": np.random.randint(0, 200000, size=n),
        "taux_endettement": np.random.uniform(0, 1, size=n),
        "appetence_conso": np.random.randint(0, 2, size=n),
        "appetence_immo": np.random.randint(0, 2, size=n),
        # Ajout des nouvelles colonnes pour le test
        "nom_prenom": [f"Client_{i}" for i in range(n)],
        "situation_familiale": np.random.choice([1, 2, 3], size=n), # 1: Marié, 2: Célib, 3: Divorcé
        "anciennete_emploi": np.random.randint(0, 20, size=n),
        "type_contrat": np.random.choice(["CDI", "CDD", "etudiant", "sans"], size=n, p=[0.7, 0.15, 0.1, 0.05]),
        "anciente_compte": np.random.randint(1, 25, size=n),
        "solde_moy": np.random.randint(500, 15000, size=n),
        "mvt_crediteur": np.random.randint(100, 5000, size=n),
        "mvt_debiteur": np.random.randint(50, 3000, size=n),
        "credit_simt": np.random.choice([0, 1], size=n, p=[0.9, 0.1]),
        "mt_plv_simt": np.random.randint(0, 50000, size=n)
    }
    df_train = pd.DataFrame(data)
    df_train.to_excel(DATA_PATH, index=False)
    print(f"Jeu de données factice créé et sauvegardé à {DATA_PATH}")
else:
    print(f"DEBUG: Chargement du jeu de données d'entraînement depuis {DATA_PATH}")
    df_train = pd.read_excel(DATA_PATH)
    print(f"DEBUG: Jeu de données d'entraînement chargé. Forme : {df_train.shape}")

# Vérification des colonnes et types de données avant le traitement
print("DEBUG: Colonnes du DataFrame d'entraînement avant prétraitement:")
print(df_train.info())

# Définir les colonnes cibles
TARGET_CONSO = 'credit_conso' 
TARGET_IMMO = 'credit_imo'

# Colonnes à ignorer pour l'entraînement (par exemple, identifiants ou colonnes non-features)
COLS_TO_IGNORE_TRAINING = ['nom_prenom'] 

# Enregistrer les noms des features originales avant tout traitement pour les métriques
original_feature_names = [
    col for col in df_train.columns 
    if col not in [TARGET_CONSO, TARGET_IMMO] and col not in COLS_TO_IGNORE_TRAINING
]

# Préparer les données pour l'entraînement
# Sélectionner toutes les colonnes sauf les cibles et celles à ignorer
feature_cols = [col for col in df_train.columns if col not in [TARGET_CONSO, TARGET_IMMO] + COLS_TO_IGNORE_TRAINING]
X = df_train[feature_cols].copy()

# Appliquer le CategoricalDtype avec les catégories complètes avant get_dummies
# Ceci est la partie CRUCIALE pour la cohérence
for col, categories in CATEGORICAL_FEATURES_WITH_VALUES.items():
    if col in X.columns:
        X[col] = X[col].astype(str) # Assurez-vous que la colonne est de type string
        X[col] = pd.Categorical(X[col], categories=categories)
        print(f"DEBUG: Colonne '{col}' convertie en type catégoriel avec catégories définies.")


# Appliquer l'encodage One-Hot
# drop_first=True est important pour éviter la multicolinéarité et doit être cohérent
X = pd.get_dummies(X, drop_first=True)
print(f"DEBUG: Forme de X après one-hot encoding : {X.shape}")

# Assurez-vous que l'ordre des colonnes est trié alphabétiquement pour une cohérence maximale
feature_names_after_dummies = sorted(X.columns.tolist())
X = X[feature_names_after_dummies] # Réindexer X avec l'ordre trié
print(f"DEBUG: Colonnes de X après tri alphabétique (premières 5) : {X.columns.tolist()[:5]}...")


# Diviser les données en ensembles d'entraînement et de test
# Pour le modèle de consommation
y_conso = df_train[TARGET_CONSO]
X_train_conso, X_test_conso, y_train_conso, y_test_conso = train_test_split(
    X, y_conso, test_size=0.2, random_state=42, stratify=y_conso
)

# Pour le modèle immobilier (si différent, sinon peut réutiliser X et X_train/test)
y_immo = df_train[TARGET_IMMO]
X_train_immo, X_test_immo, y_train_immo, y_test_immo = train_test_split(
    X, y_immo, test_size=0.2, random_state=42, stratify=y_immo
)

# Entraîner les modèles
print("DEBUG: Entraînement du modèle de consommation...")
model_conso = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced')
model_conso.fit(X_train_conso, y_train_conso)
print("DEBUG: Modèle de consommation entraîné.")

print("DEBUG: Entraînement du modèle immobilier...")
model_immo = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced')
model_immo.fit(X_train_immo, y_train_immo)
print("DEBUG: Modèle immobilier entraîné.")


# Calculer les métriques de performance
def calculate_model_performance(model, X_test, y_test, feature_names):
    y_pred = model.predict(X_test)
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1_score": f1_score(y_test, y_pred, zero_division=0)
    }

    feature_importances = {}
    if hasattr(model, 'feature_importances_'):
        importances = model.feature_importances_
        # Assurez-vous que les noms de features correspondent aux importances
        for i, importance in enumerate(importances):
            if i < len(feature_names): # Vérification de borne
                feature_importances[feature_names[i]] = importance
        
        sorted_features = sorted(feature_importances.items(), key=lambda item: item[1], reverse=True)
        metrics["feature_importances"] = sorted_features
    
    return metrics

all_metrics = {}
# Utiliser feature_names_after_dummies qui est trié et complet
all_metrics["conso"] = calculate_model_performance(model_conso, X_test_conso, y_test_conso, feature_names_after_dummies)
all_metrics["immo"] = calculate_model_performance(model_immo, X_test_immo, y_test_immo, feature_names_after_dummies)

# Ajouter les noms des features originales et des features après dummy au JSON des métriques
all_metrics["original_trained_features"] = original_feature_names
all_metrics["full_trained_dummy_features"] = feature_names_after_dummies # Cette liste est CRUCIALE pour la cohérence

print(f"Accuracy crédit conso : {all_metrics['conso']['accuracy']:.2f}")
print(f"Accuracy crédit immo : {all_metrics['immo']['accuracy']:.2f}")

# Sauvegarder les modèles
joblib.dump(model_conso, MODEL_CONSO_PATH)
print(f"Modèle consommation sauvegardé à {MODEL_CONSO_PATH}")
joblib.dump(model_immo, MODEL_IMMO_PATH)
print(f"Modèle immobilier sauvegardé à {MODEL_IMMO_PATH}")

# Sauvegarder les métriques dans un fichier JSON
with open(METRICS_PATH, 'w') as f:
    json.dump(all_metrics, f, indent=4)
print(f"Métriques sauvegardées à {METRICS_PATH}")

print("DEBUG: Script train_model.py terminé.")
