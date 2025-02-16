import subprocess
from fastapi import FastAPI
from routes import owners, references, cards

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
app.include_router(owners.router)
app.include_router(references.router)
app.include_router(cards.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
