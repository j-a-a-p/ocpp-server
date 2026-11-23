from sqlalchemy.orm import Session
from database import get_db
from fastapi import Depends, HTTPException, Cookie
from invite import verify_auth_token
from models import Resident, ResidentStatus, Role

get_db_dependency = get_db

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


def require_role(role: Role):
    """Dependency factory: the logged in account must have this role, otherwise 403."""
    def dependency(resident: Resident = Depends(get_authenticated_active_resident)) -> Resident:
        if not resident.has_role(role):
            raise HTTPException(status_code=403, detail=f"This requires the {role.value} role")
        return resident

    return dependency


require_manager = require_role(Role.MANAGER)
require_resident = require_role(Role.RESIDENT)
