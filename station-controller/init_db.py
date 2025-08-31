import logging
from database import engine
from models import Base
from sqlalchemy import inspect

def init_database():
    """Initialize the database by checking if all required tables exist."""
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    missing_tables = []
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            missing_tables.append(table.name)
            logging.fatal(f"Required table '{table.name}' not found in database")
        else:
            logging.debug(f"Table '{table.name}' exists")
    
    if missing_tables:
        logging.fatal(f"Database initialization failed: {len(missing_tables)} required tables are missing: {', '.join(missing_tables)}")
        raise RuntimeError(f"Database initialization failed: Required tables are missing")
    else:
        logging.info("All required database tables exist")

if __name__ == "__main__":
    init_database()
    print("Database initialization completed successfully!") 