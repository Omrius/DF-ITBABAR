import pandas as pd
import numpy as np

np.random.seed(42)  # Pour la reproductibilité

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
}

df = pd.DataFrame(data)

df.to_excel("train_clients_5000.xlsx", index=False)
print("Fichier 'train_clients_5000.xlsx' généré avec succès.")
