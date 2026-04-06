import base64
import numpy as np
import cv2
import pandas as pd
import os
import shutil
import zipfile
import uuid
import matplotlib.pyplot as plt
import seaborn as sns
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from inference_sdk import InferenceHTTPClient
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class ToothProcessor:
    def __init__(self, output_dir="static/output"):
        api_key = os.getenv("ROBOFLOW_API_KEY")
        if not api_key:
            raise ValueError("ROBOFLOW_API_KEY not found. Please set it in your .env file.")
        self.client = InferenceHTTPClient(
            api_url="https://serverless.roboflow.com",
            api_key=api_key
        )
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        
    def process_file(self, file_path, is_zip=False):
        """Processes a single image file or a zip file"""
        # Create a unique job directory
        job_id = str(uuid.uuid4())
        job_dir = os.path.join(self.output_dir, job_id)
        os.makedirs(job_dir, exist_ok=True)
        
        extracted_images_dir = os.path.join(job_dir, 'extracted_images')
        output_viz_dir = os.path.join(job_dir, 'output_visualizations')
        output_plots_dir = os.path.join(job_dir, 'report_plots')
        
        os.makedirs(extracted_images_dir, exist_ok=True)
        os.makedirs(output_viz_dir, exist_ok=True)
        os.makedirs(output_plots_dir, exist_ok=True)

        image_paths = []

        if is_zip:
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                zip_ref.extractall(extracted_images_dir)
            valid_image_extensions = ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp')
            for root, _, filenames in os.walk(extracted_images_dir):
                for filename in filenames:
                    if filename.lower().endswith(valid_image_extensions):
                        image_paths.append(os.path.join(root, filename))
        else:
            # It's an image file, move it to extracted_images
            filename = os.path.basename(file_path)
            new_path = os.path.join(extracted_images_dir, filename)
            shutil.copy(file_path, new_path)
            image_paths.append(new_path)
            
        all_tooth_reports = []
        visualized_images = []

        # Process Each Image
        for path in image_paths:
            try:
                workflow_result = self.client.run_workflow(
                    workspace_name="shank-b",
                    workflow_id="detect-and-classify-2",
                    images={"image": path}
                )
            except Exception as e:
                print(f"Error running workflow: {e}")
                continue
                
            if not workflow_result or "output_image" not in workflow_result[0] or "detection_predictions" not in workflow_result[0]:
                continue
                
            output_base64 = workflow_result[0]["output_image"]
            image_bytes = base64.b64decode(output_base64)
            np_arr = np.frombuffer(image_bytes, np.uint8)
            img_decoded = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if img_decoded is None:
                continue
                
            canvas = img_decoded.copy()
            current_image_reports = []
            
            preds = workflow_result[0]["detection_predictions"]["predictions"]
            teeth = []
            for det in preds:
                x, y, w, h = int(det['x']), int(det['y']), int(det['width']), int(det['height'])
                x1 = max(0, int(x - w / 2))
                y1 = max(0, int(y - h / 2))
                x2 = min(img_decoded.shape[1], int(x + w / 2))
                y2 = min(img_decoded.shape[0], int(y + h / 2))
                if x2 <= x1 or y2 <= y1:
                    continue
                crop = img_decoded[y1:y2, x1:x2]
                teeth.append((crop, (x1, y1, x2, y2)))
                
            upper_teeth = []
            lower_teeth = []
            for (crop, bbox) in teeth:
                x1, y1, x2, y2 = bbox
                center_y = (y1 + y2) // 2
                if center_y < img_decoded.shape[0] // 2:
                    upper_teeth.append((crop, bbox))
                else:
                    lower_teeth.append((crop, bbox))
            
            upper_teeth = sorted(upper_teeth, key=lambda t: t[1][0])
            lower_teeth = sorted(lower_teeth, key=lambda t: t[1][0])
            
            fdi_upper = list(range(18, 10, -1)) + list(range(21, 29))
            fdi_lower = list(range(48, 40, -1)) + list(range(31, 39))
            
            all_teeth_combined = upper_teeth + lower_teeth
            all_fdi_combined = fdi_upper + fdi_lower
            
            for i, (crop, bbox) in enumerate(all_teeth_combined):
                x1, y1, x2, y2 = bbox
                if i >= len(all_fdi_combined):
                    break
                fdi = all_fdi_combined[i]
                
                try:
                    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                    edges = cv2.Canny(gray, 50, 150)
                    row_sum = edges.sum(axis=1)
                    if np.max(row_sum) == 0: continue
                    bone_y = np.argmax(row_sum)
                    root_y = len(row_sum) - np.argmax(row_sum[::-1])
                    crown_y = np.argmax(row_sum > 0)
                    root_length = root_y - crown_y
                    bone_loss = bone_y - crown_y
                    if root_length <= 0: continue
                    
                    rbl = (bone_loss / root_length) * 100
                    strength = 100 - rbl
                    strength = max(0, min(100, strength))
                    
                    if rbl < 15: stage = "Stage I"
                    elif rbl >= 15 and rbl <= 33: stage = "Stage II"
                    else: stage = "Stage III/IV"
                except Exception:
                    continue
                    
                if strength >= 75: color = (0, 255, 0)
                elif strength >= 50: color = (0, 255, 255)
                elif strength >= 25: color = (0, 165, 255)
                else: color = (0, 0, 255)
                
                label = f"{round(strength, 1)}"
                font_scale = 0.8
                thickness = 2
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
                x_text = x1 + (x2 - x1 - tw) // 2
                y_text = y2 - 5
                
                x_text = max(0, x_text)
                y_text = max(th + 2, y_text)
                x_text = min(canvas.shape[1] - tw - 2, x_text)
                y_text = min(canvas.shape[0] - 2, y_text)
                
                cv2.rectangle(canvas, (x_text - 2, y_text - th - 2), (x_text + tw + 2, y_text + 2), color, -1)
                cv2.putText(canvas, label, (x_text, y_text), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), thickness)
                
                current_image_reports.append({
                    "image_filename": os.path.basename(path),
                    "FDI": fdi,
                    "strength": round(strength, 2),
                    "stage": stage
                })
            
            all_tooth_reports.append(current_image_reports)
            filename = os.path.basename(path)
            cv2.imwrite(os.path.join(output_viz_dir, filename), canvas)
            visualized_images.append({
                "filename": filename,
                "url": f"/static/output/{job_id}/output_visualizations/{filename}"
            })

        # Compile CSV and Reports
        consolidated_reports = []
        for ir in all_tooth_reports:
            consolidated_reports.extend(ir)
            
        csv_path = None
        pdf_path = None
        plot_urls = []
        
        if consolidated_reports:
            df_reports = pd.DataFrame(consolidated_reports)
            csv_path_abs = os.path.join(job_dir, 'tooth_strength_report.csv')
            df_reports.to_csv(csv_path_abs, index=False)
            csv_path = f"/static/output/{job_id}/tooth_strength_report.csv"
            
            # Generate metrics text
            desc_stats = df_reports['strength'].describe().to_string()
            stage_counts = df_reports['stage'].value_counts().to_string()
            stage_pcts = (df_reports['stage'].value_counts(normalize=True) * 100).to_string(float_format="%.2f%%")
            avg_strength = df_reports.groupby('stage')['strength'].mean()
            avg_strength_str = avg_strength.to_string()
            
            descriptive_stats_text = f"""
1. Descriptive Statistics for Tooth Strength:
{desc_stats}

2. Count of Teeth per Periodontal Stage:
{stage_counts}

3. Percentage of Teeth per Periodontal Stage:
{stage_pcts}

4. Average Strength per Periodontal Stage:
{avg_strength_str}
            """
            
            # Generate plots
            plt.figure(figsize=(10, 6))
            sns.countplot(x='stage', data=df_reports, order=df_reports['stage'].value_counts().index, palette='viridis', hue='stage', legend=False)
            plt.title('Distribution of Periodontal Stages')
            plt.xlabel('Periodontal Stage')
            plt.ylabel('Number of Teeth')
            stage_dist_path = os.path.join(output_plots_dir, 'stage_distribution.png')
            plt.savefig(stage_dist_path)
            plt.close()
            plot_urls.append(f"/static/output/{job_id}/report_plots/stage_distribution.png")
            
            plt.figure(figsize=(10, 6))
            sns.histplot(df_reports['strength'], kde=True, bins=20, color='skyblue')
            plt.title('Distribution of Tooth Strength')
            plt.xlabel('Tooth Strength (%)')
            plt.ylabel('Frequency')
            strength_dist_path = os.path.join(output_plots_dir, 'strength_distribution.png')
            plt.savefig(strength_dist_path)
            plt.close()
            plot_urls.append(f"/static/output/{job_id}/report_plots/strength_distribution.png")
            
            # Generate PDF Document
            pdf_path_abs = os.path.join(job_dir, 'tooth_strength_report.pdf')
            doc = SimpleDocTemplate(pdf_path_abs, pagesize=letter)
            styles = getSampleStyleSheet()
            flowables = []
            
            flowables.append(Paragraph("<h1>Tooth Strength Analysis Report</h1>", styles['h1']))
            flowables.append(Spacer(1, 0.2 * inch))
            flowables.append(Paragraph("<h2>Descriptive Metrics Analysis</h2>", styles['h2']))
            flowables.append(Paragraph(descriptive_stats_text.replace('\n', '<br/>'), styles['Code']))
            flowables.append(Spacer(1, 0.2 * inch))
            flowables.append(Paragraph("<h2>Visualizations</h2>", styles['h2']))
            flowables.append(Spacer(1, 0.2 * inch))
            
            for plot_name in ['stage_distribution.png', 'strength_distribution.png']:
                img = RLImage(os.path.join(output_plots_dir, plot_name))
                img.drawWidth = 6 * inch
                img.drawHeight = 3.5 * inch
                flowables.append(img)
                flowables.append(Spacer(1, 0.2 * inch))
                
            doc.build(flowables)
            pdf_path = f"/static/output/{job_id}/tooth_strength_report.pdf"

        # Construct final return data
        return {
            "job_id": job_id,
            "reports": consolidated_reports,
            "images": visualized_images,
            "csv_url": csv_path,
            "pdf_url": pdf_path,
            "summary": {
                "total_images": len(visualized_images),
                "total_teeth": len(consolidated_reports)
            }
        }
