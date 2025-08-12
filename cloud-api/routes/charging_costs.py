from fastapi import APIRouter, HTTPException, Cookie
from sqlalchemy.orm import Session
from schemas import ChargingCostResponse, ChargingCostCreate
from crud import get_charging_costs, get_active_charging_cost, create_charging_cost
from dependencies import get_db_dependency
from invite import verify_auth_token
import logging

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/charging-costs", tags=["charging-costs"])

@router.get("/", response_model=list[ChargingCostResponse])
def read_charging_costs(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = get_db_dependency(),
    auth_token: str = Cookie(None)
):
    """Get all charging costs. Requires cookie-based authentication for management access."""
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    
    return get_charging_costs(db, skip=skip, limit=limit)

@router.get("/active", response_model=ChargingCostResponse)
def read_active_charging_cost(
    db: Session = get_db_dependency(),
    auth_token: str = Cookie(None)
):
    """Get the currently active charging cost. Requires cookie-based authentication for management access."""
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    
    active_cost = get_active_charging_cost(db)
    if not active_cost:
        raise HTTPException(status_code=404, detail="No active charging cost found")
    return active_cost

@router.post("/", response_model=ChargingCostResponse)
def create_new_charging_cost(
    charging_cost: ChargingCostCreate, 
    db: Session = get_db_dependency(),
    auth_token: str = Cookie(None)
):
    """Create a new charging cost. Requires cookie-based authentication for management access."""
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    
    resident_id = verify_auth_token(auth_token)
    if not resident_id:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    
    try:
        # Validate kwh_price is positive
        if charging_cost.kwh_price <= 0:
            raise HTTPException(status_code=400, detail="kWh price must be positive")
        
        # Get the most recent charging cost to validate start_date
        from datetime import date
        existing_costs = get_charging_costs(db, limit=1)
        if existing_costs:
            most_recent_cost = existing_costs[0]
            # If the most recent cost has an end_date, use that as the minimum start_date
            # If it doesn't have an end_date (is active), use its created date
            if most_recent_cost.end_date:
                min_start_date = most_recent_cost.end_date
            else:
                min_start_date = most_recent_cost.created.date()
            
            if charging_cost.start_date < min_start_date:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Start date cannot be earlier than {min_start_date.strftime('%Y-%m-%d')}"
                )
        
        new_cost = create_charging_cost(db, charging_cost.kwh_price, charging_cost.start_date)
        
        if not new_cost:
            raise HTTPException(status_code=400, detail="Failed to create charging cost")
        
        logger.info(f"New charging cost created: {new_cost.kwh_price} per kWh starting {charging_cost.start_date}")
        return new_cost
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error creating charging cost: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
