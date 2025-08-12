from fastapi import APIRouter, HTTPException, Cookie
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
from dependencies import get_db_dependency
from invite import verify_auth_token
from models import PowerLog
from schemas import PowerLogResponse

router = APIRouter(prefix="/power-logs", tags=["power-logs"])

@router.get("/", response_model=List[PowerLogResponse])
def get_power_logs(
    skip: int = 0,
    limit: int = 1000,
    db: Session = get_db_dependency(),
    auth_token: str = Cookie(None)
):
    """
    Get PowerLog data with pagination.
    Requires cookie-based authentication for management access.
    """
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    
    try:
        power_logs = (
            db.query(PowerLog)
            .order_by(PowerLog.created.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        
        return power_logs
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving PowerLog data: {str(e)}")
