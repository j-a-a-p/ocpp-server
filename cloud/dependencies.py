from fastapi import Depends
from database import get_db

def get_db_dependency():
    return Depends(get_db)