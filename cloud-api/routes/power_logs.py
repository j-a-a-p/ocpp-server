from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from dependencies import get_db_dependency, get_authenticated_active_resident
from models import PowerLog, Resident
from power_log_analytics import calculate_analytics
from schemas import PowerLogAnalyticsResponse, PowerLogResponse

router = APIRouter(prefix="/power-logs", tags=["power-logs"])

@router.get("/", response_model=List[PowerLogResponse])
def get_power_logs(
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db_dependency),
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

@router.get("/analytics", response_model=PowerLogAnalyticsResponse)
def get_power_log_analytics(
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """
    The current year, the last twelve months and the energy per hour of the day of the last three years.
    Requires cookie-based authentication for management access.
    """
    return calculate_analytics(db)
