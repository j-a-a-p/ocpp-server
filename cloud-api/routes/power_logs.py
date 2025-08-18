from fastapi import APIRouter, HTTPException, Cookie, Depends
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
from dependencies import get_db_dependency, get_authenticated_active_resident
from invite import verify_auth_token
from models import PowerLog, Resident
from schemas import PowerLogResponse

router = APIRouter(prefix="/power-logs", tags=["power-logs"])

@router.get("/", response_model=List[PowerLogResponse])
def get_power_logs(
    skip: int = 0,
    limit: int = 1000,
    db: Session = get_db_dependency(),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """
    Get PowerLog data with pagination.
    Requires cookie-based authentication for management access.
    """
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
