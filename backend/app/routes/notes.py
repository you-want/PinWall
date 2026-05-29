from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models import Note, User
from app.schemas import NoteCreate, NoteUpdate, NoteResponse
from app.dependencies import get_current_user
from app.utils.auth import generate_share_token

router = APIRouter()


@router.get("/", response_model=list[NoteResponse])
def get_notes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notes = db.query(Note).filter(Note.user_id == current_user.id).all()
    return notes


@router.post("/", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
def create_note(
    note: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_note = Note(
        user_id=current_user.id,
        content=note.content,
        color=note.color,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    
    return new_note


@router.get("/{note_id}", response_model=NoteResponse)
def get_note(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    return note


@router.put("/{note_id}", response_model=NoteResponse)
def update_note(
    note_id: str,
    updates: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    if updates.content is not None:
        note.content = updates.content
    if updates.is_checked is not None:
        note.is_checked = updates.is_checked
    if updates.color is not None:
        note.color = updates.color
    if updates.position_x is not None:
        note.position_x = updates.position_x
    if updates.position_y is not None:
        note.position_y = updates.position_y
    if updates.angle is not None:
        note.angle = updates.angle
    
    note.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(note)
    
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    db.delete(note)
    db.commit()


@router.post("/{note_id}/share", response_model=NoteResponse)
def toggle_share(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    note.is_public = not note.is_public
    if note.is_public and not note.share_token:
        note.share_token = generate_share_token()
    
    note.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(note)
    
    return note


@router.get("/share/{share_token}", response_model=NoteResponse)
def get_public_note(
    share_token: str,
    db: Session = Depends(get_db)
):
    note = db.query(Note).filter(
        Note.share_token == share_token,
        Note.is_public == True
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found or not public"
        )
    
    return note