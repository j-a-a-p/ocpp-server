from fastapi import APIRouter, HTTPException, Cookie, Depends
from sqlalchemy.orm import Session
from schemas import ChargingCostResponse, ActiveChargingCostResponse, ChargingCostCreate
from crud import get_charging_costs, get_active_charging_cost, create_charging_cost
from dependencies import get_db_dependency, get_authenticated_active_resident, require_manager
from models import Resident
from tariff import tariff_at
from datetime import datetime, timezone
import logging

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/charging-costs", tags=["charging-costs"])

@router.get("/", response_model=list[ChargingCostResponse])
def read_charging_costs(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """Get all charging costs. Requires cookie-based authentication for management access."""
    return get_charging_costs(db, skip=skip, limit=limit)

@router.get("/active", response_model=ActiveChargingCostResponse)
def read_active_charging_cost(
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Get the currently active charging cost, with the tariff and price that apply right now.
    Requires cookie-based authentication for management access."""
    active_cost = get_active_charging_cost(db)
    if not active_cost:
        raise HTTPException(status_code=404, detail="No active charging cost found")
    now = datetime.now(timezone.utc)
    tariff = tariff_at(now)
    return ActiveChargingCostResponse(
        **ChargingCostResponse.model_validate(active_cost).model_dump(),
        current_tariff=tariff,
        current_kwh_price=float(active_cost.price_for_tariff(tariff)),
    )

@router.post("/", response_model=ChargingCostResponse)
def create_new_charging_cost(
    charging_cost: ChargingCostCreate, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(require_manager)
):
    """Create a new charging cost. Requires cookie-based authentication for management access."""
    try:
        logger.info(f"Received charging cost data: kwh_price={charging_cost.kwh_price}, kwh_price_dal={charging_cost.kwh_price_dal}, start_date={charging_cost.start_date}")
        
        if charging_cost.kwh_price <= 0:
            raise HTTPException(status_code=400, detail="kWh price must be positive")
        if charging_cost.kwh_price_dal is not None and charging_cost.kwh_price_dal <= 0:
            raise HTTPException(status_code=400, detail="kWh price for dal must be positive")
        
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
        
        new_cost = create_charging_cost(db, charging_cost.kwh_price, charging_cost.start_date, charging_cost.kwh_price_dal)
        
        if not new_cost:
            raise HTTPException(status_code=400, detail="Failed to create charging cost")
        
        logger.info(f"New charging cost created: normaal {new_cost.kwh_price}, dal {new_cost.kwh_price_dal} per kWh starting {charging_cost.start_date}")
        return new_cost
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error creating charging cost: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
