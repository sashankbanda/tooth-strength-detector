from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import uuid

from backend.processor import ToothProcessor

app = FastAPI(title="Tooth Strength Detector API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup directories
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
OUTPUT_DIR = os.path.join(STATIC_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

processor = ToothProcessor(output_dir=OUTPUT_DIR)

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.zip', '.jpg', '.jpeg', '.png')):
        raise HTTPException(status_code=400, detail="Invalid file type. Upload a ZIP containing images or an image file (.jpg, .png).")
        
    temp_dir = os.path.join(OUTPUT_DIR, "temp_uploads")
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{file.filename}")
    
    # Save the uploaded file
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    is_zip = temp_file_path.lower().endswith('.zip')
    
    try:
        # Process the file via our script logic
        results = processor.process_file(temp_file_path, is_zip=is_zip)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error processing the file.")
    finally:
        # Clean up the original upload
        try:
            os.remove(temp_file_path)
        except:
            pass
            
    return JSONResponse(content={"status": "success", "data": results})

@app.get("/")
async def root():
    # The actual HTML is served through /static/index.html, but we can redirect / or serve it
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
