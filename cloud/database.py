import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from constants import DATA_DIRECTORY, DB_FILE

# Ensure the directory exists
os.makedirs(DATA_DIRECTORY, exist_ok=True)

# Create the database engine
DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIRECTORY, DB_FILE)}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Import models to register them with SQLAlchemy before table creation
import models  # Ensure this imports all defined models

# Create tables if they do not exist
Base.metadata.create_all(bind=engine)