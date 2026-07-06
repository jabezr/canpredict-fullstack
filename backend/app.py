from fastapi import FastAPI

app = FastAPI(title="CanPredict Backend")

@app.get("/")
def home():
    return {
        "message": "CanPredict Backend Running"
    }