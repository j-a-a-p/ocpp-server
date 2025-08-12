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
        logger.info(f"Received charging cost data: kwh_price={charging_cost.kwh_price} (type: {type(charging_cost.kwh_price)}), start_date={charging_cost.start_date}")
        
        if charging_cost.kwh_price <= 0:
            raise HTTPException(status_code=400, detail="kWh price must be positive")
        
        from datetime import date
        existing_costs = get_charging_costs(db, limit=100)  # Get more costs to find the last end_date
        if existing_costs:
            # Find the last known end_date (not the most recent record)
            last_known_end_date = None
            for cost in existing_costs:
                if cost.end_date:
                    if last_known_end_date is None or cost.end_date > last_known_end_date:
                        last_known_end_date = cost.end_date
            
            # Only validate if we found a last known end_date
            if last_known_end_date and charging_cost.start_date < last_known_end_date:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Start date cannot be earlier than the last known end date ({last_known_end_date.strftime('%Y-%m-%d')})"
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
