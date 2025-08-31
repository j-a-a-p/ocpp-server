from database import engine
from models import Base
from sqlalchemy import inspect

def init_database():
    """Initialize the database by creating all tables if they don't exist."""
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    tables_to_create = []
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            tables_to_create.append(table.name)
            print(f"Creating table: {table.name}")
        else:
            print(f"Table {table.name} already exists, skipping...")
    
    if tables_to_create:
        Base.metadata.create_all(bind=engine)
        print(f"Created {len(tables_to_create)} new tables")
    else:
        print("All tables already exist, no changes needed")

if __name__ == "__main__":
    init_database()
    print("Database initialized successfully!") 