# report_generator.py
import pandas as pd
from fpdf import FPDF
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import io
import base64
from datetime import datetime

# Correction: Ne pas importer ORIGINAL_TRAINED_FEATURES ici car ce n'est plus une globale.
# Seule la fonction get_original_feature_name est nécessaire, et elle recevra les features
# en argument depuis generate_pdf_report.
from .observation_generator import get_original_feature_name 


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
        self.set_fill_color(230, 230, 230)
        self.cell(0, 8, title, 0, 1, 'L', 1)
        self.ln(4)

    def chapter_body(self, body):
        self.set_font('Arial', '', 10)
        self.multi_cell(0, 5, body)
        self.ln()

    def add_table(self, df):
        # En-têtes
        self.set_font('Arial', 'B', 9)
        col_widths = self._calculate_col_widths(df) # Calculer les largeurs de colonnes
        
        # Dessiner les en-têtes
        for col_name, width in col_widths.items():
            self.cell(width, 7, str(col_name), 1, 0, 'C')
        self.ln() # Nouvelle ligne après les en-têtes

        # Données
        self.set_font('Arial', '', 8)
        for index, row in df.iterrows():
            # Avant de dessiner chaque ligne, trouver la hauteur maximale requise pour cette ligne
            row_height = 7 # Hauteur minimale par défaut pour les lignes
            current_x = self.get_x()
            current_y = self.get_y()

            for col_name, width in col_widths.items():
                cell_value = str(row[col_name])
                if 'observations' in col_name.lower():
                    # Utiliser get_string_width pour estimer la largeur du texte et compter les lignes
                    # Nous allons simuler multi_cell_lines car ce n'est pas une méthode FPDF standard
                    text_width = self.get_string_width(cell_value)
                    # Estimer le nombre de lignes. Ajouter un peu de marge de sécurité.
                    # 5 est la hauteur de ligne par défaut pour multi_cell dans notre contexte
                    num_lines = int(text_width / (width - 2)) + 1 # -2 pour le padding interne du multi_cell
                    estimated_cell_height = num_lines * 5
                    row_height = max(row_height, estimated_cell_height)
                # Note: Pour les cellules non-observations, leur hauteur sera généralement 7 (fixe)
                # ou ajustée si le contenu est trop grand, mais multi_cell gérera cela.
                # L'important est d'avoir une `row_height` qui englobe toutes les cellules.

            # Dessiner les cellules pour la ligne actuelle
            self.set_xy(current_x, current_y) # Revenir au début de la ligne
            for col_name, width in col_widths.items():
                cell_value = str(row[col_name])
                start_x_cell = self.get_x()
                start_y_cell = self.get_y()
                
                # Dessiner le cadre de la cellule pour toute la hauteur de la ligne
                self.rect(start_x_cell, start_y_cell, width, row_height)
                
                # Réinitialiser la position Y pour le texte à l'intérieur de la cellule
                # Puisque multi_cell avance la position Y, nous devons la gérer.
                self.set_xy(start_x_cell, start_y_cell)
                
                if 'observations' in col_name.lower():
                    # Pour les observations, utiliser multi_cell
                    self.multi_cell(width, 5, cell_value, 0, 'L', False) # 0 for no border, as rect draws it
                else:
                    # Pour les autres, utiliser cell (qui ne gère pas les retours à la ligne)
                    # Centre le texte verticalement dans la cellule de hauteur 'row_height'
                    self.cell(width, row_height, cell_value, 0, 0, 'C')
                
                # Positionner le curseur X pour la prochaine cellule, au même Y de départ
                self.set_xy(start_x_cell + width, start_y_cell)
            
            self.set_y(current_y + row_height) # Avancer le curseur Y pour la prochaine ligne
        self.ln(2)

    def _calculate_col_widths(self, df):
        # Largeurs par défaut et ajustements
        col_widths = {}
        for col in df.columns:
            # Min width, max width. Adjust as needed.
            max_content_width = max(self.get_string_width(str(s)) for s in df[col].astype(str).tolist() + [str(col)])
            
            # Larger width for observation columns
            if 'observations' in col.lower():
                width = 60 # Plus large pour les observations
            elif 'client_identifier' == col or 'age' == col:
                width = 20 # Plus petit pour les IDs et age
            elif 'score' in col.lower():
                width = 25 # Pour les scores formatés
            else:
                width = 30 # Largeur par défaut

            # Ajuster si le contenu est plus large que la largeur par défaut mais sans dépasser un maximum
            width = min(width, max_content_width + 6) # Ajouter un peu de padding
            col_widths[col] = width

        # Normaliser les largeurs pour qu'elles rentrent dans la page (210mm - 2*marge = 190mm)
        total_width = sum(col_widths.values())
        page_width = self.w - 2 * self.l_margin
        
        if total_width > page_width:
            scaling_factor = page_width / total_width
            for col in col_widths:
                col_widths[col] *= scaling_factor
        
        return col_widths


def generate_pdf_report(df_results, output_path, primary_credit_type, model_metrics, file_analysis, df_original, original_trained_features):
    """
    Génère un rapport PDF détaillé des résultats de scoring.

    Args:
        df_results (pd.DataFrame): DataFrame contenant les scores de prédiction et les observations.
        output_path (str): Chemin complet où le rapport PDF sera sauvegardé.
        primary_credit_type (str): Type de crédit principal (ex: 'conso', 'immo') pour le contexte.
        model_metrics (dict): Dictionnaire des métriques de performance du modèle.
        file_analysis (dict): Dictionnaire des métriques d'analyse du fichier client.
        df_original (pd.DataFrame): DataFrame original des données clients.
        original_trained_features (list): Liste des noms des features originales utilisées pour l'entraînement du modèle.
    """
    pdf = PDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Section Titre Principal
    pdf.set_font('Arial', 'B', 16)
    pdf.ln(10)
    pdf.cell(0, 10, f'Rapport de Scoring - Crédit {primary_credit_type.capitalize()}', 0, 1, 'C')
    pdf.ln(10)

    # Date de génération
    pdf.set_font('Arial', '', 10)
    pdf.cell(0, 10, f"Généré le: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", 0, 1, 'R')
    pdf.ln(5)

    # Section 1: Analyse du Fichier Client
    pdf.chapter_title('1. Analyse du Fichier Client')
    pdf.chapter_body(f"Nom du fichier: {file_analysis.get('nom_fichier', 'N/A')}")
    pdf.chapter_body(f"Taille du fichier: {file_analysis.get('taille_fichier', 'N/A')}")
    pdf.chapter_body(f"Nombre de lignes: {file_analysis.get('nombre_lignes', 'N/A')}")
    pdf.chapter_body(f"Nombre de colonnes: {file_analysis.get('nombre_colonnes', 'N/A')}")
    pdf.chapter_body("Types de données:")
    for col, dtype in file_analysis.get('types_donnees', {}).items():
        pdf.chapter_body(f"  - {col}: {dtype}")
    pdf.chapter_body("Valeurs manquantes par colonne:")
    for col, count in file_analysis.get('valeurs_manquantes', {}).items():
        pdf.chapter_body(f"  - {col}: {count}")
    
    pdf.chapter_body("Critères pris en charge pour l'analyse:")
    for critere in file_analysis.get('critères_pris_en_charge', []):
        pdf.chapter_body(f"  - {critere}")
    pdf.chapter_body("Critères non pris en charge (ignorés ou non-features):")
    for critere in file_analysis.get('critères_non_pris_en_charge_a_ignorer', []):
        pdf.chapter_body(f"  - {critere}")
    if file_analysis.get('critères_manquants_a_entrainer'):
        pdf.chapter_body("Critères manquants pour un entraînement complet du modèle:")
        for critere in file_analysis.get('critères_manquants_a_entrainer', []):
            pdf.chapter_body(f"  - {critere}")
    else:
        pdf.chapter_body("Aucun critère critique manquant pour l'entraînement.")

    pdf.ln(5)

    # Section 2: Performance du Moteur IA
    pdf.chapter_title('2. Performance du Moteur IA')
    metrics_data = model_metrics.get(primary_credit_type, {}) if isinstance(model_metrics, dict) else {}

    if metrics_data:
        pdf.chapter_body(f"Précision (Accuracy): {metrics_data.get('accuracy', 'N/A'):.2f}")
        pdf.chapter_body(f"Précision (Precision): {metrics_data.get('precision', 'N/A'):.2f}")
        pdf.chapter_body(f"Rappel (Recall): {metrics_data.get('recall', 'N/A'):.2f}")
        pdf.chapter_body(f"Score F1: {metrics_data.get('f1_score', 'N/A'):.2f}")
        
        feature_importances = metrics_data.get('feature_importances', [])
        if feature_importances:
            pdf.chapter_body("\nImportance des Features (Top 5):")
            for feature, importance in feature_importances[:5]:
                # Utiliser get_original_feature_name pour afficher le nom original
                # Il faut passer original_trained_features en argument
                original_name = get_original_feature_name(feature, original_trained_features)
                pdf.chapter_body(f"  - {original_name.replace('_', ' ').capitalize()}: {importance:.4f}")
        else:
            pdf.chapter_body("Aucune importance des features disponible.")
        pdf.ln(5)
    else:
        pdf.chapter_body("Aucune métrique de performance disponible pour ce modèle.")
    pdf.ln(5)

    # Section 3: Vue d'ensemble du Scoring (Exemple des 10 premiers clients)
    pdf.chapter_title('3. Vue d\'ensemble du Scoring (Exemple des 10 premiers clients)')
    
    # Colonnes à afficher dans le tableau du PDF
    # Inclure 'client_identifier' et 'nom_prenom' pour l'identification
    cols_to_display = []
    if 'client_identifier' in df_original.columns:
        cols_to_display.append('client_identifier')
    if 'nom_prenom' in df_original.columns:
        cols_to_display.append('nom_prenom')
    
    # Ajouter d'autres colonnes de données originales pertinentes pour le rapport
    # Ces colonnes doivent être présentes dans df_original et/ou df_results
    additional_display_cols = ['age', 'revenus', 'type_contrat'] 
    for col in additional_display_cols:
        if col in df_results.columns and col not in cols_to_display:
            cols_to_display.append(col)

    # Ajouter les scores et les observations
    if 'scoring_PC' in df_results.columns:
        cols_to_display.append('scoring_PC')
    if 'scoring_PI' in df_results.columns:
        cols_to_display.append('scoring_PI')
    cols_to_display.extend(['observations_forces', 'observations_faiblesses'])
    
    # Sélectionner les 10 premières lignes et les colonnes à afficher
    df_display_for_table = df_results[cols_to_display].head(10).copy()

    # Formatter les scores en pourcentage pour l'affichage
    for score_col in ['scoring_PC', 'scoring_PI']:
        if score_col in df_display_for_table.columns:
            df_display_for_table[score_col] = df_display_for_table[score_col].apply(
                lambda x: f"{x:.2%}" if pd.notna(x) else "N/A"
            )

    pdf.add_table(df_display_for_table)
    pdf.ln(5)

    # Section 4: Résultats Bruts de Prédiction
    pdf.chapter_title('4. Résultats Bruts de Prédiction (Tous les Clients)')
    pdf.chapter_body(f"Les résultats détaillés pour les {len(df_results)} clients sont disponibles dans les fichiers CSV et XLSX.")
    pdf.ln(5)

    pdf.output(output_path)
