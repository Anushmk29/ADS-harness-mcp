from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Valid authentication is required",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = credentials.credentials if credentials else request.cookies.get("access_token")
    if not token:
        raise unauthorized
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise unauthorized
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise unauthorized
    return user


def require_roles(*roles: UserRole) -> Callable[..., User]:
    allowed = set(roles)
    allowed.add(UserRole.SYSTEM_ADMIN)
    allowed.add(UserRole.STAFF)

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role is not permitted to perform this operation",
            )
        return user

    return dependency


def require_human_roles(
    *roles: UserRole,
    detail: str = "A human user with an authorized role is required",
) -> Callable[..., User]:
    role_dependency = require_roles(*roles)

    def dependency(user: User = Depends(role_dependency)) -> User:
        if user.is_service_principal:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=detail,
            )
        return user

    return dependency
