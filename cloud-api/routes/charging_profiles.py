from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import crud
from schemas import ChargingProfileResponse, ChargingProfileCreate, ChargingProfileUpdate
from models import ProfileType, ProfileStatus, Resident
from dependencies import get_db_dependency, get_authenticated_active_resident

router = APIRouter()

@router.get("/", response_model=List[ChargingProfileResponse])
def get_charging_profiles(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Get all charging profiles. Requires cookie-based authentication for management access."""
    profiles = crud.get_charging_profiles(db, skip=skip, limit=limit)
    return profiles

@router.get("/{profile_id}", response_model=ChargingProfileResponse)
def get_charging_profile(
    profile_id: int, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Get a specific charging profile by ID. Requires cookie-based authentication for management access."""
    profile = crud.get_charging_profile(db, profile_id=profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Charging profile not found")
    return profile

@router.post("/", response_model=ChargingProfileResponse)
def create_charging_profile(
    profile: ChargingProfileCreate, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Create a new charging profile. Requires cookie-based authentication for management access."""
    # Validate profile type
    try:
        ProfileType(profile.profile_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid profile type")
    
    # Validate required fields based on profile type
    if profile.profile_type == "max_current" and profile.max_current is None:
        raise HTTPException(status_code=400, detail="max_current is required for max_current profile type")
    
    return crud.create_charging_profile(db=db, profile=profile)

@router.put("/{profile_id}", response_model=ChargingProfileResponse)
def update_charging_profile(
    profile_id: int, 
    profile: ChargingProfileUpdate, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Update a charging profile. Requires cookie-based authentication for management access."""
    # Validate profile type if provided
    if profile.profile_type:
        try:
            ProfileType(profile.profile_type)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid profile type")
    
    # Validate status if provided
    if profile.status:
        try:
            ProfileStatus(profile.status)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status")
    
    updated_profile = crud.update_charging_profile(db=db, profile_id=profile_id, profile=profile)
    if updated_profile is None:
        raise HTTPException(status_code=404, detail="Charging profile not found")
    return updated_profile

@router.put("/{profile_id}/inactivate")
def inactivate_charging_profile(
    profile_id: int, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Inactivate a charging profile. Requires cookie-based authentication for management access."""
    profile = crud.inactivate_charging_profile(db=db, profile_id=profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Charging profile not found")
    return {"message": "Charging profile inactivated successfully", "profile": profile}

@router.put("/{profile_id}/reactivate")
def reactivate_charging_profile(
    profile_id: int, 
    db: Session = Depends(get_db_dependency),
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Reactivate a charging profile. Requires cookie-based authentication for management access."""
    profile = crud.reactivate_charging_profile(db=db, profile_id=profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Charging profile not found")
    return {"message": "Charging profile reactivated successfully", "profile": profile}

@router.get("/types/available")
def get_available_profile_types(
    _: Resident = Depends(get_authenticated_active_resident)
):
    """Get available profile types. Requires cookie-based authentication for management access."""
    return {
        "profile_types": [
            {
                "value": "max_current",
                "label": "Max Current",
                "description": "Limit the maximum current for charging",
                "fields": ["max_current"]
            }
        ]
    }
