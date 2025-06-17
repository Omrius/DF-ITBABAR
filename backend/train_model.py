import pandas as pd
import joblib
import os
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
import json

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

# Création d'un dataset factice si le fichier n'existe pas (pour les tests)
if not os.path.exists(DATA_PATH):
    print(f"ATTENTION: Le fichier de données d'entraînement '{DATA_PATH}' est introuvable.")
    print("Création d'un dataset factice pour permettre l'exécution du script.")
    data = {
        'age': [25, 30, 35, 40, 45, 50, 28, 33, 38, 42, 55, 60],
        'revenu': [30000, 45000, 60000, 75000, 90000, 100000, 35000, 50000, 65000, 80000, 120000, 40000],
        'nb_enfants': [0, 2, 1, 3, 0, 1, 0, 2, 1, 0, 2, 1],
        'statut_pro': ['CDI', 'CDD', 'CDI', 'Auto-entrepreneur', 'CDI', 'CDI', 'CDD', 'CDI', 'Auto-entrepreneur', 'CDI', 'Retraite', 'CDI'],
        'anciennete_client_annees': [1, 5, 2, 8, 3, 10, 2, 6, 4, 9, 15, 3],
        'credit_existant_conso': [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
        'appetence_conso': [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
        'appetence_immo': [0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0]
    }
    df = pd.DataFrame(data)
    df.to_excel(DATA_PATH, index=False)
    print(f"Dataset factice créé à {DATA_PATH}")
else:
    print(f"DEBUG: Chargement du dataset depuis {DATA_PATH}") # DEBUG PRINT
    df = pd.read_excel(DATA_PATH)

if 'appetence_conso' not in df.columns:
    df['appetence_conso'] = 0
if 'appetence_immo' not in df.columns:
    df['appetence_immo'] = 0

target_columns = ['appetence_conso', 'appetence_immo']
# Stocker les noms des colonnes d'origine avant le one-hot encoding
original_feature_names = df.drop(columns=target_columns, errors='ignore').columns.tolist()

X = pd.get_dummies(df.drop(columns=target_columns, errors='ignore'))
y_conso = df['appetence_conso']
y_immo = df['appetence_immo']

# Stocker les noms des colonnes après le one-hot encoding (ces noms sont utilisés par le modèle)
feature_names_after_dummies = X.columns.tolist()

if len(X) > 1 and len(y_conso.unique()) > 1:
    X_train_conso, X_test_conso, y_train_conso, y_test_conso = train_test_split(X, y_conso, test_size=max(0.2, 1/len(X)), random_state=42, stratify=y_conso)
else:
    print("DEBUG: Pas assez de données pour stratifier, utilisation du même dataset pour train/test conso.") # DEBUG PRINT
    X_train_conso, X_test_conso, y_train_conso, y_test_conso = X, X, y_conso, y_conso

if len(X) > 1 and len(y_immo.unique()) > 1:
    X_train_immo, X_test_immo, y_train_immo, y_test_immo = train_test_split(X, y_immo, test_size=max(0.2, 1/len(X)), random_state=42, stratify=y_immo)
else:
    print("DEBUG: Pas assez de données pour stratifier, utilisation du même dataset pour train/test immo.") # DEBUG PRINT
    X_train_immo, X_test_immo, y_train_immo, y_test_immo = X, X, y_immo, y_immo


model_conso = RandomForestClassifier(n_estimators=100, random_state=42)
model_immo = RandomForestClassifier(n_estimators=100, random_state=42)

print("Entraînement des modèles...")
model_conso.fit(X_train_conso, y_train_conso)
model_immo.fit(X_train_immo, y_train_immo)

print("Évaluation des performances des modèles...")
y_pred_conso = model_conso.predict(X_test_conso)
y_pred_immo = model_immo.predict(X_test_immo)

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
        for i, importance in enumerate(importances):
            if i < len(feature_names):
                feature_importances[feature_names[i]] = importance
        
        sorted_features = sorted(feature_importances.items(), key=lambda item: item[1], reverse=True)
        metrics["feature_importances"] = sorted_features
    
    return metrics

all_metrics = {}
all_metrics["conso"] = calculate_model_performance(model_conso, X_test_conso, y_test_conso, feature_names_after_dummies)
all_metrics["immo"] = calculate_model_performance(model_immo, X_test_immo, y_test_immo, feature_names_after_dummies)

# Ajouter les noms des features originales et des features après dummy au JSON des métriques
all_metrics["original_trained_features"] = original_feature_names
all_metrics["full_trained_dummy_features"] = feature_names_after_dummies


print(f"Accuracy crédit conso : {all_metrics['conso']['accuracy']:.2f}")
print(f"Accuracy crédit immo : {all_metrics['immo']['accuracy']:.2f}")

joblib.dump(model_conso, MODEL_CONSO_PATH)
joblib.dump(model_immo, MODEL_IMMO_PATH)
print("Modèles sauvegardés.")

with open(METRICS_PATH, 'w') as f:
    json.dump(all_metrics, f, indent=4)
print(f"Métriques de performance sauvegardées à {METRICS_PATH}")

print("DEBUG: Fin du script train_model.py") # DEBUG PRINT
