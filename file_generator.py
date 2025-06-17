import pandas as pd
import numpy as np

def generate_dataset(num_clients=100, include_targets=False, filename="dataset.xlsx"):
    np.random.seed(42)
    df = pd.DataFrame({
        "client_id": range(1, num_clients+1),
        "age": np.random.randint(20, 70, size=num_clients),
        "revenu": np.random.randint(15000, 120000, size=num_clients),
        "situation_familiale": np.random.choice(["Célibataire", "Marié", "Divorcé"], size=num_clients),
        "nb_enfants": np.random.randint(0, 5, size=num_clients),
        "anciennete_emploi": np.random.randint(0, 30, size=num_clients),
        "score_credit": np.random.randint(300, 850, size=num_clients)
    })

    # Variables catégoriques en numérique simple (pour ML)
    df["situation_familiale"] = df["situation_familiale"].map({"Célibataire":0, "Marié":1, "Divorcé":2})

    if include_targets:
        df["appetence_conso"] = np.random.binomial(1, 0.6, size=num_clients)
        df["appetence_immo"] = np.random.binomial(1, 0.4, size=num_clients)

    df.to_excel(filename, index=False)
    print(f"Fichier généré : {filename}")

# Générer fichier test 100 clients (sans targets)
generate_dataset(100, include_targets=False, filename="test_clients_100.xlsx")

# Générer fichier entraînement 5000 clients (avec targets)
generate_dataset(5000, include_targets=True, filename="train_clients_5000.xlsx")
