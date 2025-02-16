import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from constants import DATA_DIRECTORY, DB_FILE

# Ensure the directory exists
os.makedirs(DATA_DIRECTORY, exist_ok=True)

# Database connection URL
DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIRECTORY, DB_FILE)}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Create a session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Define the declarative base for models
Base = declarative_base()

def get_db():
    """Dependency for retrieving the database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()