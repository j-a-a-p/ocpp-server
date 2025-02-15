from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from schemas import ReferenceResponse
from models import OwnerReference
from dependencies import get_db_dependency

router = APIRouter(prefix="/references", tags=["references"])

@router.get("/", response_model=list[ReferenceResponse])
def read_references(skip: int = 0, limit: int = 100, db: Session = get_db_dependency()):
    return db.query(OwnerReference).offset(skip).limit(limit).all()

@router.get("/{reference_id}", response_model=ReferenceResponse)
def read_reference(reference_id: int, db: Session = get_db_dependency()):
    reference = db.query(OwnerReference).filter(OwnerReference.id == reference_id).first()
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    return reference