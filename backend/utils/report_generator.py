# report_generator.py
import pandas as pd
from fpdf import FPDF
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import io
import base64
from datetime import datetime

# Correction: Utilisation d'un import relatif car observation_generator.py est dans le même dossier 'utils'
from .observation_generator import get_original_feature_name, ORIGINAL_TRAINED_FEATURES

# Définition du chemin du dataset d'entraînement pour observation_generator
# Cette variable doit être définie au début du module report_generator car il l'utilise
# Le chemin doit être relatif à la racine du dossier 'backend' pour Render
# DATA_PATH_FOR_COLUMNS = "data/train_dataset.xlsx" # Moved to observation_generator itself

class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'Rapport d\'Analyse de Crédit Datafindser', 0, 1, 'C')
        self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', 0, 0, 'C')

    def chapter_title(self, title):
        self.set_font('Arial', 'B', 12)
        self.cell(0, 10, title, 0, 1, 'L')
        self.ln(5)

    def chapter_body(self, body):
        self.set_font('Arial', '', 10)
        self.multi_cell(0, 5, body)
        self.ln(5)

    def add_table_from_df(self, df, title="", num_rows=10, show_index=False):
        if title:
            self.chapter_title(title)
        
        # Limiter le nombre de lignes affichées
        df_display = df.head(num_rows).copy()
        
        if show_index:
            df_display.reset_index(inplace=True)
            df_display.rename(columns={'index': 'Index Original'}, inplace=True)

        self.set_font('Arial', 'B', 8)
        self.set_fill_color(200, 220, 255)
        col_widths = [self.get_string_width(col) + 6 for col in df_display.columns]
        
        # Adjust column widths dynamically but ensure they don't exceed page width
        total_width = sum(col_widths)
        page_width = self.w - 2*self.l_margin
        
        if total_width > page_width:
            factor = page_width / total_width
            col_widths = [w * factor for w in col_widths]
        
        # Table header
        for i, col in enumerate(df_display.columns):
            self.cell(col_widths[i], 7, str(col), 1, 0, 'C', 1)
        self.ln()

        # Table rows
        self.set_font('Arial', '', 7)
        self.set_fill_color(240, 248, 255)
        for _, row in df_display.iterrows():
            for i, col_val in enumerate(row.values):
                # Ensure values are strings for FPDF
                cell_text = str(col_val) if pd.notna(col_val) else ""
                self.cell(col_widths[i], 6, cell_text, 1, 0, 'L', 0)
            self.ln()
        self.ln(5)


def generate_pdf_report(
    df_results: pd.DataFrame,
    output_path: str,
    credit_type: str,
    model_metrics: dict,
    file_analysis: dict,
    df_original: pd.DataFrame
):
    pdf = PDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    pdf.set_font('Arial', '', 10)
    pdf.cell(0, 10, f"Date du rapport: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", 0, 1, 'L')
    pdf.cell(0, 10, f"Type de crédit analysé: {credit_type.capitalize()}", 0, 1, 'L')
    pdf.ln(5)

    # Section 1: Résumé de l'analyse du fichier client
    pdf.chapter_title('1. Résumé de l\'Analyse du Fichier Client')
    pdf.chapter_body(f"Nom du fichier: {file_analysis.get('nom_fichier', 'N/A')}")
    pdf.chapter_body(f"Taille du fichier: {file_analysis.get('taille_fichier', 'N/A')}")
    pdf.chapter_body(f"Nombre de clients analysés: {file_analysis.get('nombre_lignes', 'N/A')}")
    pdf.chapter_body(f"Nombre de clients appétents (score >= {file_analysis.get('seuil_appetence_utilise', 0.5):.2f}): {file_analysis.get('nombre_clients_appetents', 'N/A')}")
    pdf.chapter_body(f"Critères pris en charge par le modèle: {', '.join(file_analysis.get('critères_pris_en_charge', ['N/A']))}")
    if file_analysis.get('critères_non_pris_en_charge_a_ignorer'):
        pdf.chapter_body(f"Critères non pris en charge (ignorés): {', '.join(file_analysis['critères_non_pris_en_charge_a_ignorer'])}")
    if file_analysis.get('critères_manquants_a_entrainer'):
        pdf.chapter_body(f"Critères manquants au dataset client (utilisés par le modèle, valeurs par défaut): {', '.join(file_analysis['critères_manquants_a_entrainer'])}")
    pdf.ln(5)

    # Section 2: Performance du Moteur IA (Métriques du modèle)
    pdf.chapter_title('2. Performance du Moteur IA')
    if model_metrics:
        pdf.chapter_body(f"Précision (Accuracy): {model_metrics.get('accuracy', 'N/A'):.2f}")
        pdf.chapter_body(f"Rappel (Recall): {model_metrics.get('recall', 'N/A'):.2f}")
        pdf.chapter_body(f"Score F1: {model_metrics.get('f1_score', 'N/A'):.2f}")
        pdf.chapter_body(f"AUC-ROC: {model_metrics.get('roc_auc', 'N/A'):.2f}")
        
        # Visualisation de l'importance des caractéristiques (Feature Importance)
        if 'feature_importances' in model_metrics and model_metrics['feature_importances']:
            feature_importances = pd.DataFrame(model_metrics['feature_importances']).set_index('feature')
            
            # Use get_original_feature_name for display
            feature_importances.index = feature_importances.index.map(get_original_feature_name)
            
            plt.figure(figsize=(10, 6))
            sns.barplot(x=feature_importances.index, y='importance', data=feature_importances, palette='viridis')
            plt.title('Importance des Caractéristiques (Top 10)')
            plt.xlabel('Caractéristique')
            plt.ylabel('Importance')
            plt.xticks(rotation=45, ha='right')
            plt.tight_layout()

            # Save plot to a BytesIO object
            img_buf = io.BytesIO()
            plt.savefig(img_buf, format='png')
            img_buf.seek(0)
            plt.close() # Close the plot to free memory

            # Add image to PDF
            pdf.add_page() # Add a new page for the plot
            pdf.image(img_buf, x=10, y=pdf.get_y(), w=pdf.w - 20)
            pdf.ln(pdf.h * 0.4) # Adjust Y position for next content
            pdf.ln(5)
    else:
        pdf.chapter_body("Aucune métrique de performance disponible pour ce modèle.")
    pdf.ln(5)

    # Section 3: Vue d'ensemble du Scoring (Exemple des 10 premiers clients)
    pdf.chapter_title('3. Vue d\'ensemble du Scoring (Exemple des 10 premiers clients)')
    cols_to_display = ['client_identifier', 'age', 'revenu', 'score_appetence', 'observations_forces', 'observations_faiblesses']
    
    # Check if 'client_identifier' exists in df_original, if not, use index
    if 'client_identifier' not in df_original.columns:
        df_original_temp = df_original.reset_index().rename(columns={'index': 'client_identifier'})
    else:
        df_original_temp = df_original.copy()

    # Ensure 'score_appetence' is formatted as percentage for display
    df_display_for_table = df_results[cols_to_display].copy()
    df_display_for_table['score_appetence'] = df_display_for_table['score_appetence'].apply(lambda x: f"{x:.2%}")

    # Explicitly convert 'client_identifier' if it's not string/int (e.g., float from index)
    if 'client_identifier' in df_display_for_table.columns:
        df_display_for_table['client_identifier'] = df_display_for_table['client_identifier'].apply(lambda x: f"Client {int(x)}" if pd.isna(x) else str(x))


    pdf.add_table_from_df(df_display_for_table, num_rows=10, show_index=False)
    pdf.ln(5)

    pdf.output(output_path)

