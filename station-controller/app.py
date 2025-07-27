from fastapi import FastAPI
from database import engine
from models import Base

# Create FastAPI app instance
app = FastAPI(title="OCPP Station Controller", version="1.0.0")

# Create database tables on startup
@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)

# No routes exposed as requested - this is just for ORM setup 