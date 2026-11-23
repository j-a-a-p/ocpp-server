from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from dependencies import get_db_dependency, require_manager
from models import Resident
from schemas import StationOverviewResponse
from station_status import calculate_station_overview

router = APIRouter(prefix="/stations", tags=["stations"])

# A day is the default, a month is the longest: the page shows it as a timeline.
MAX_WINDOW_HOURS = 24 * 31

@router.get("/", response_model=StationOverviewResponse)
def get_stations(
    hours: int = Query(24, ge=1, le=MAX_WINDOW_HOURS, description="The length of the window to show, in hours"),
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """
    The charging stations that ever connected: whether they are online now, and when they were online
    in the last `hours` hours. Requires cookie-based authentication for management access.
    """
    return calculate_station_overview(db, hours)
