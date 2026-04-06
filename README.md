# Tooth Strength & Periodontal Analysis Web Application

Welcome to the **Tooth Strength Detector** dashboard! This full-stack web application is built with a high-performance Python FastAPI backend and a beautiful, modern "Clinical Noir" frontend. It uses advanced Roboflow detection mapping and OpenCV algorithms to evaluate radiographic bone loss and estimate periodontal strength automatically.

## Prerequisites

Before running the application, make sure you have the following installed on your machine:
- **Python 3.8+**

## How to Install and Run

Follow these simple steps from your terminal/command prompt to run the web application.

1. **Open your Terminal/Command Prompt** and navigate to this folder:
   ```bash
   cd path/to/Tooth-strength-detector
   ```

2. **Set up a Virtual Environment (Recommended)**:
   It is best practice to run Python applications inside a virtual environment to avoid conflicts.
   - **For Windows**:
     ```bash
     python -m venv venv
     venv\Scripts\activate
     ```
   - **For Mac/Linux**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install the required libraries**:
   Run the following command to download everything the application needs (FastAPI, OpenCV, etc.):
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the Application Server**:
   Once installed, run this command to turn on the FastAPI server locally:
   ```bash
   uvicorn backend.app:app --reload --port 8000
   ```
   You should see: `Uvicorn running on http://127.0.0.1:8000`

5. **Open the App in your Web Browser**:
   Open Google Chrome, Edge or Firefox and go to:
   **[http://localhost:8000](http://localhost:8000)**

   > ⚠️ Do **NOT** open `http://0.0.0.0:8000` — that will not work. Always use `localhost:8000`.

---

## How to Use the Dashboard

Using the application is designed to be as simple as possible:

1. **Upload your X-rays**
   - On the homepage, simply drag and drop a **`.zip` file** (containing multiple images) or a **single image file** (`.jpg`, `.png`).
   - *Note:* Depending on how many images you upload, processing may take a few seconds as the engine calculates algorithms for each detected tooth.

2. **View the Dashboard Results**
   - Once processed, the interface will automatically transition to your analysis dashboard.
   - **Metrics Panels**: View overall statistics, Stage distribution charts, and Strength distribution charts.
   - **Visualizer**: Select between different images processed in the drop-down menu on the right. You will see colored bounding boxes with numerical scores overlaying the teeth.
   - **Details Table**: Review the itemized data breaking down Health Status, FDI numbering, and classification stage for each detected tooth.

3. **Exporting Reports**
   - At the top of your dashboard, click **"Download Full PDF Report"** to secure a generated PDF compiling your stage statistics.
   - Click **"Export CSV"** to download raw spreadsheet data of your metrics.
   - Click **"New Scan"** to securely wipe your current view and upload a new X-ray batch.

Enjoy seamless, instantaneous dental analytics!
