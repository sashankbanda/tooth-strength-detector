from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import create_access_token, get_current_user, verify_google_credential
from backend.database import get_db
from backend.models import User


router = APIRouter(prefix="/api/auth", tags=["auth"])


class GoogleAuthRequest(BaseModel):
    credential: str


@router.post("/google")
def sign_in_with_google(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    token_data = verify_google_credential(payload.credential)

    google_sub = token_data.get("sub")
    email = token_data.get("email")
    name = token_data.get("name") or email
    picture = token_data.get("picture")

    if not google_sub or not email:
        raise HTTPException(status_code=401, detail="Google token did not include required profile fields.")

    user = db.scalar(select(User).where(User.google_sub == google_sub))
    if user is None:
        user = User(
            google_sub=google_sub,
            email=email,
            full_name=name,
            picture_url=picture,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.email = email
        user.full_name = name
        user.picture_url = picture
        db.commit()
        db.refresh(user)

    access_token = create_access_token(user.id, user.email)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.full_name,
            "picture": user.picture_url,
        },
    }


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.full_name,
        "picture": current_user.picture_url,
    }
