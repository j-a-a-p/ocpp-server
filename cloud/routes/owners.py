from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from schemas import OwnerResponse, OwnerBase
from crud import get_owners, get_owner, create_owner
from dependencies import get_db_dependency

router = APIRouter(prefix="/owners", tags=["owners"])

@router.get("/", response_model=list[OwnerResponse])
def read_owners(skip: int = 0, limit: int = 100, db: Session = get_db_dependency()):
    return get_owners(db, skip=skip, limit=limit)

@router.get("/{owner_id}", response_model=OwnerResponse)
def read_owner(owner_id: int, db: Session = get_db_dependency()):
    owner = get_owner(db, owner_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Owner not found")
    return owner

@router.post("/", response_model=OwnerResponse)
def create_new_owner(owner: OwnerBase, db: Session = get_db_dependency()):
    new_owner = create_owner(db, owner)
    if not new_owner:
        raise HTTPException(status_code=400, detail="Reference does not exist")
    return new_owner