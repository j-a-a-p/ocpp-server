import subprocess
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import residents, cards

def run_flyway():
    """Run Flyway migrations before starting the app."""
    print("Running Flyway migrations...")
    result = subprocess.run(["flyway", "migrate"], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print("Flyway migration failed:", result.stderr)
        exit(1)

# Run Flyway before starting FastAPI
run_flyway()

app = FastAPI()
app.include_router(residents.router)
app.include_router(cards.router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Change to "*" to allow all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],  # Allow all headers
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
