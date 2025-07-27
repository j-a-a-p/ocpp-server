from database import engine
from models import Base

def init_database():
    """Initialize the database by creating all tables."""
    # Print the SQL that will be executed
    for table in Base.metadata.sorted_tables:
        print(f"Creating table: {table.name}")
        print(table.compile(engine))
        print()
    
    Base.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_database()
    print("Database initialized successfully!") 