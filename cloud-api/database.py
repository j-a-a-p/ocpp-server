import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from constants import DATA_DIRECTORY, DB_FILE

# Ensure the directory exists
os.makedirs(DATA_DIRECTORY, exist_ok=True)

# Database connection URL
DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIRECTORY, DB_FILE)}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Create a session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Enable foreign key constraints for SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

# Define the declarative base for models
Base = declarative_base()

def get_db():
    """Dependency for retrieving the database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()