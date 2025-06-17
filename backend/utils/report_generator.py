from fpdf import FPDF
import pandas as pd
import os
import matplotlib.pyplot as plt
import seaborn as sns
import io

# Importer la fonction get_original_feature_name depuis observation_generator
from backend.utils.observation_generator import get_original_feature_name, ORIGINAL_TRAINED_FEATURES

def generate_pdf_report(
    df_results: pd.DataFrame,
    output_path: str, # Le chemin complet où le fichier sera sauvegardé localement (/tmp/...)
    credit_type: str,
    model_metrics: dict,
    file_analysis: dict,
    df_original: pd.DataFrame
):
    """
    Génère un rapport PDF et le sauvegarde localement (dans /tmp).

    Args:
        df_results (pd.DataFrame): DataFrame contenant les données des clients
                                   et la colonne 'score_appetence', 'client_identifier', forces/faiblesses.
        output_path (str): Chemin complet du fichier PDF à générer (ex: '/tmp/rapport_scoring_monfichier_conso.pdf').
        credit_type (str): Le type de crédit (ex: 'conso', 'immo') pour le titre du rapport.
        model_metrics (dict): Dictionnaire des métriques de performance du modèle (inclut feature_importances).
        file_analysis (dict): Dictionnaire de l'analyse descriptive du fichier client.
        df_original (pd.DataFrame): Le DataFrame original du client tel qu'il a été lu.
    """
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", "B", 16)

    pdf.cell(200, 10, txt=f"Rapport de Scoring d'Appétence - Crédit {credit_type.capitalize()}", ln=True, align="C")
    pdf.ln(10)

    pdf.set_font("Arial", "", 12)

    # --- Section Analyse du Fichier Client Uploadé ---
    pdf.set_font("Arial", "B", 14)
    pdf.cell(200, 10, txt="1. Analyse du Fichier Client Téléchargé", ln=True, align="L")
    pdf.ln(5)

    pdf.set_font("Arial", "", 10)
    pdf.multi_cell(0, 6, f"Nom du fichier : {file_analysis.get('nom_fichier', 'N/A')}")
    pdf.multi_cell(0, 6, f"Taille du fichier : {file_analysis.get('taille_fichier', 'N/A')}")
    pdf.multi_cell(0, 6, f"Nombre de lignes : {file_analysis.get('nombre_lignes', 'N/A')}")
    pdf.multi_cell(0, 6, f"Nombre de colonnes : {file_analysis.get('nombre_colonnes', 'N/A')}")
    pdf.multi_cell(0, 6, f"Colonnes originales du fichier : {', '.join(file_analysis.get('colonnes', ['N/A']))}")
    
    pdf.ln(2)
    pdf.set_font("Arial", "B", 10)
    pdf.multi_cell(0, 6, "Types de données :")
    pdf.set_font("Arial", "", 10)
    for col, dtype in file_analysis.get('types_donnees', {}).items():
        pdf.multi_cell(0, 6, f"  - {col}: {dtype}")
    
    pdf.ln(2)
    pdf.set_font("Arial", "B", 10)
    pdf.multi_cell(0, 6, "Valeurs manquantes (par colonne) :")
    pdf.set_font("Arial", "", 10)
    for col, count in file_analysis.get('valeurs_manquantes', {}).items():
        pdf.multi_cell(0, 6, f"  - {col}: {count}")

    pdf.ln(2)
    pdf.set_font("Arial", "B", 10)
    pdf.multi_cell(0, 6, f"Nombre de clients appétents (seuil > {file_analysis.get('seuil_appetence_utilise', 0.5)}) : {file_analysis.get('nombre_clients_appetents', 'N/A')}")
    pdf.ln(5)

    # --- Section Critères traités par le modèle ---
    pdf.set_font("Arial", "B", 14)
    pdf.cell(200, 10, txt="2. Critères Traités par le Modèle", ln=True, align="L")
    pdf.ln(5)

    pdf.set_font("Arial", "", 10)
    pdf.multi_cell(0, 6, "Le modèle utilise un ensemble spécifique de critères sur lesquels il a été entraîné. Voici la ventilation des critères de votre fichier par rapport à ces critères d'entraînement :")
    pdf.ln(2)

    pdf.set_font("Arial", "B", 11)
    pdf.multi_cell(0, 6, "Critères Pris en Charge (Utilisés par le modèle pour la prédiction) :")
    pdf.set_font("Arial", "", 10)
    if file_analysis.get('critères_pris_en_charge'):
        for critere in file_analysis['critères_pris_en_charge']:
            pdf.multi_cell(0, 6, f"  - {critere}")
    else:
        pdf.multi_cell(0, 6, "Aucun critère pris en charge. Vérifiez la correspondance des colonnes.")
    pdf.ln(2)

    pdf.set_font("Arial", "B", 11)
    pdf.multi_cell(0, 6, "Critères Non Pris en Charge (Ignorés par le modèle, à entraîner si pertinents) :")
    pdf.set_font("Arial", "", 10)
    if file_analysis.get('critères_non_pris_en_charge_a_ignorer'):
        for critere in file_analysis['critères_non_pris_en_charge_a_ignorer']:
            pdf.multi_cell(0, 6, f"  - {critere}")
    else:
        pdf.multi_cell(0, 6, "Aucun critère non pris en charge.")
    pdf.ln(2)

    pdf.set_font("Arial", "B", 11)
    pdf.multi_cell(0, 6, "Critères Manquants (Attendus par le modèle mais absents de votre fichier) :")
    pdf.set_font("Arial", "", 10)
    if file_analysis.get('critères_manquants_a_entrainer'):
        for critere in file_analysis['critères_manquants_a_entrainer']:
            pdf.multi_cell(0, 6, f"  - {critere}")
    else:
        pdf.multi_cell(0, 6, "Aucun critère manquant.")
    pdf.ln(5)


    # --- Section Performance du Moteur IA ---
    pdf.set_font("Arial", "B", 14)
    pdf.cell(200, 10, txt=f"3. Performance du Moteur IA ({credit_type.capitalize()})", ln=True, align="L")
    pdf.ln(5)

    pdf.set_font("Arial", "", 10)
    if model_metrics:
        pdf.multi_cell(0, 6, f"Accuracy : {model_metrics.get('accuracy', 0):.4f}")
        pdf.multi_cell(0, 6, f"Precision : {model_metrics.get('precision', 0):.4f}")
        pdf.multi_cell(0, 6, f"Recall : {model_metrics.get('recall', 0):.4f}")
        pdf.multi_cell(0, 6, f"F1-Score : {model_metrics.get('f1_score', 0):.4f}")
        pdf.ln(2)

        # Définitions des métriques
        pdf.set_font("Arial", "I", 9)
        pdf.multi_cell(0, 5, "Définitions des métriques :")
        pdf.multi_cell(0, 5, "  - Recall (Rappel) : Mesure la capacité du modèle à trouver toutes les instances positives réelles. C'est la proportion de vrais positifs parmi tous les positifs réels. Formule : VP / (VP + FN)")
        pdf.multi_cell(0, 5, "  - F1-Score : Moyenne harmonique de la précision et du rappel. Il atteint sa meilleure valeur à 1 et sa pire à 0. Il est particulièrement utile lorsque la distribution des classes est inégale. Formule : 2 * (Précision * Rappel) / (Précision + Rappel)")
        pdf.ln(5)

        # Importances des caractéristiques
        feature_importances = model_metrics.get('feature_importances', [])
        if feature_importances:
            pdf.set_font("Arial", "B", 11)
            pdf.multi_cell(0, 6, "Caractéristiques les plus influentes :")
            pdf.set_font("Arial", "", 10)
            for feature, importance in feature_importances[:5]: 
                display_feature_name = get_original_feature_name(feature)
                pdf.multi_cell(0, 6, f"  - {display_feature_name}: {importance:.4f}")
            
            if len(feature_importances) > 5:
                pdf.ln(2)
                pdf.set_font("Arial", "B", 11)
                pdf.multi_cell(0, 6, "Caractéristiques les moins influentes (ex: peut indiquer peu de pertinence ou redondance) :")
                pdf.set_font("Arial", "", 10)
                for feature, importance in feature_importances[-5:]:
                    display_feature_name = get_original_feature_name(feature)
                    pdf.multi_cell(0, 6, f"  - {display_feature_name}: {importance:.4f}")
        else:
            pdf.multi_cell(0, 6, "Importances des caractéristiques non disponibles.")
    else:
        pdf.multi_cell(0, 6, "Métriques de performance non disponibles ou non chargées.")
    pdf.ln(5)


    # --- Section Résultats de Scoring des Clients ---
    pdf.set_font("Arial", "B", 14)
    pdf.cell(200, 10, txt="4. Résultats de Scoring Détaillés des Clients", ln=True, align="L")
    pdf.ln(5)
    pdf.set_font("Arial", "", 10)
    pdf.multi_cell(0, 6, "Ce tableau présente les scores d'appétence au crédit pour les clients analysés du fichier soumis, incluant des observations sur leurs forces et faiblesses par rapport au modèle.")
    pdf.ln(5)

    pdf.set_font("Arial", "B", 8)
    
    final_display_cols = [
        'client_identifier', 
        'age', 'revenu', 'nb_enfants', 'statut_pro', 'anciennete_client_annees', 
        'score_appetence', 'observations_forces', 'observations_faiblesses'
    ]
    final_display_cols = [col for col in final_display_cols if col in df_results.columns]

    col_widths = []
    total_width = 0
    for col in final_display_cols:
        width = 0
        if col == 'client_identifier':
            width = 25
        elif col == 'score_appetence':
            width = 20
        elif col in ['observations_forces', 'observations_faiblesses']:
            width = 45
        elif col in ['age', 'nb_enfants']:
            width = 12
        elif col == 'revenu':
            width = 18
        else:
            width = 18
        col_widths.append(width)
        total_width += width
    
    page_usable_width = pdf.w - 2 * pdf.l_margin
    if total_width > page_usable_width:
        ratio = page_usable_width / total_width
        col_widths = [w * ratio for w in col_widths]


    # En-têtes de tableau
    for i, col in enumerate(final_display_cols):
        display_header = 'Client' if col == 'client_identifier' else col.replace('_', ' ').capitalize()
        pdf.cell(col_widths[i], 8, display_header, 1, 0, 'C')
    pdf.ln()

    pdf.set_font("Arial", "", 7)
    
    df_to_display = df_results[final_display_cols].head(15)

    for index, row in df_to_display.iterrows(): 
        x_start_row = pdf.get_x()
        y_start_row = pdf.get_y()
        max_height_for_row = 6

        for i, col in enumerate(final_display_cols):
            value = str(row.get(col, 'N/A'))
            if col in ['observations_forces', 'observations_faiblesses']:
                line_height = 3.5
                text_width_in_cell = col_widths[i] - 2
                num_lines = pdf.get_string_width(value) / text_width_in_cell
                actual_height = max(line_height, num_lines * line_height)
                max_height_for_row = max(max_height_for_row, actual_height + 2)
        
        current_x = x_start_row
        for i, col in enumerate(final_display_cols):
            value = str(row.get(col, 'N/A'))
            if col == 'score_appetence':
                value = f"{float(value):.4f}"
            
            pdf.set_xy(current_x, y_start_row)
            if col in ['observations_forces', 'observations_faiblesses']:
                pdf.rect(current_x, y_start_row, col_widths[i], max_height_for_row)
                pdf.multi_cell(col_widths[i], max_height_for_row / (value.count('\n') + 1), value, 0, 'C', 0)
            else:
                pdf.cell(col_widths[i], max_height_for_row, value, 1, 0, 'C')
            current_x += col_widths[i]

        pdf.ln(max_height_for_row)
    
    pdf.ln(10)

    # --- Section Visualisation des Scores ---
    pdf.set_font("Arial", "B", 14)
    pdf.cell(200, 10, txt="5. Distribution des Scores d'Appétence", ln=True, align="L")
    pdf.ln(5)

    temp_img_path = "/tmp/score_distribution.png" # Chemin temporaire sur le système de fichiers du conteneur
    try:
        plt.figure(figsize=(8, 6))
        sns.histplot(df_results['score_appetence'], kde=True, bins=20, color='skyblue')
        plt.title(f"Distribution des Scores d'Appétence - Crédit {credit_type.capitalize()}", fontsize=14)
        plt.xlabel("Score d'Appétence", fontsize=12)
        plt.ylabel("Nombre de Clients", fontsize=12)
        plt.grid(axis='y', alpha=0.75)
        
        plt.savefig(temp_img_path, format='png', bbox_inches='tight')
        plt.close()

        img_width = 150
        page_width = pdf.w
        x_pos = (page_width - img_width) / 2
        
        pdf.image(temp_img_path, x=x_pos, y=pdf.get_y(), w=img_width, type='png')
        pdf.ln(100 + 5)

    except Exception as e:
        pdf.set_font("Arial", "", 10)
        pdf.multi_cell(0, 10, f"Impossible de générer le graphique de distribution des scores : {e}")
        print(f"Erreur lors de la génération du graphique : {e}")

    # --- Sauvegarde du PDF localement dans /tmp ---
    try:
        pdf.output(output_path)
        print(f"Rapport PDF généré localement : {output_path}")

    except Exception as e:
        print(f"Erreur lors de l'enregistrement du rapport PDF : {e}")
        raise
    finally:
        # Nettoyage des fichiers temporaires (très important dans un environnement serverless)
        if os.path.exists(temp_img_path):
            os.remove(temp_img_path)

