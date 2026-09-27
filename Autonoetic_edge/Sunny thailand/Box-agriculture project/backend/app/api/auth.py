from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import create_access_token, verify_password
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    full_name: str
    role: str
    is_service_principal: bool


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.strip().lower()).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account has been deactivated"
        )

    token = create_access_token(
        {
            "sub": user.id,
            "email": user.email,
            "role": user.role.value,
            "is_service_principal": user.is_service_principal,
        }
    )

    response.set_cookie(
        key="access_token",
        value=token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.ENVIRONMENT.lower() not in {"development", "test"},
        samesite="lax",
        path="/",
    )

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        full_name=user.full_name,
        role=user.role.value,
        is_service_principal=user.is_service_principal,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(
        key="access_token",
        httponly=True,
        secure=settings.ENVIRONMENT.lower() not in {"development", "test"},
        samesite="lax",
        path="/",
    )


@router.get("/me")
def current_session(user: User = Depends(get_current_user)):
    return {
        "user_id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "is_service_principal": user.is_service_principal,
    }
