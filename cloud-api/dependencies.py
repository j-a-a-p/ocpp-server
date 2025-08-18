from sqlalchemy.orm import Session
from database import get_db
from fastapi import Depends, HTTPException, Cookie
from invite import verify_auth_token
from models import Resident, ResidentStatus

def get_db_dependency():
    return get_db()

def get_authenticated_active_resident(
    db: Session = Depends(get_db_dependency),
    auth_token: str = Cookie(None)
) -> Resident:
    """Dependency that verifies authentication and active resident status."""
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    
    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        raise HTTPException(status_code=404, detail="Resident not found")
    
    if resident.status != ResidentStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Account is not active")
    
    return resident