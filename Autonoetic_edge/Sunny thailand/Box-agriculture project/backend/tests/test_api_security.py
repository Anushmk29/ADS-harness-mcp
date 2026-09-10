from fastapi.testclient import TestClient
from jose import jwt

from app.core.database import get_db
from app.core.security import decode_access_token, hash_password
from app.main import app
from app.models.user import User, UserRole


def client_for(db_session):
    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def test_login_returns_standard_signed_jwt(db_session):
    user = User(
        email="manager@example.com",
        password_hash=hash_password("correct horse battery staple"),
        full_name="Operations Manager",
        role=UserRole.OPERATIONS_MANAGER,
    )
    db_session.add(user)
    db_session.commit()
    client = client_for(db_session)

    response = client.post(
        "/api/v3/auth/login",
        json={"email": user.email, "password": "correct horse battery staple"},
    )

    assert response.status_code == 200
    token = response.json()["access_token"]
    assert len(token.split(".")) == 3
    assert jwt.get_unverified_header(token)["alg"] == "HS256"
    assert decode_access_token(token)["sub"] == user.id
    app.dependency_overrides.clear()


def test_procurement_confirmation_requires_authentication(db_session):
    client = client_for(db_session)

    response = client.put(
        "/api/v3/procurement/batches/not-found/confirm",
        json={"items": []},
    )

    assert response.status_code == 401
    app.dependency_overrides.clear()


def test_phase_one_and_three_routes_require_authentication(db_session):
    client = client_for(db_session)

    consolidate = client.post("/api/v3/procurement/not-found/consolidate")
    packing_list = client.get("/api/v3/packing/orders/not-found/packing-list")
    invoice = client.get("/api/v3/invoicing/not-found")

    assert consolidate.status_code == 401
    assert packing_list.status_code == 401
    assert invoice.status_code == 401
    app.dependency_overrides.clear()
