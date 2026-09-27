from fastapi.testclient import TestClient
from app.main import app


def test_list_order_templates():
    client = TestClient(app)
    response = client.get("/api/v3/orders/templates")
    assert response.status_code == 200
    templates = response.json()
    assert isinstance(templates, list)
    assert len(templates) >= 2

    ids = [t["id"] for t in templates]
    assert "group-matrix" in ids
    assert "single-customer" in ids

    for t in templates:
        assert "name" in t
        assert "filename" in t
        assert t["filename"].endswith(".xlsx")
        assert "download_url" in t
        assert t["file_size_bytes"] > 0


def test_download_group_matrix_template():
    client = TestClient(app)
    response = client.get("/api/v3/orders/templates/group-matrix")
    assert response.status_code == 200
    assert "spreadsheetml.sheet" in response.headers.get("content-type", "")
    assert 'filename="Group_Order_Matrix_Template.xlsx"' in response.headers.get("content-disposition", "")
    assert len(response.content) > 10000


def test_download_single_customer_template():
    client = TestClient(app)
    response = client.get("/api/v3/orders/templates/single-customer")
    assert response.status_code == 200
    assert "spreadsheetml.sheet" in response.headers.get("content-type", "")
    assert 'filename="Single_Customer_Order_Template.xlsx"' in response.headers.get("content-disposition", "")
    assert len(response.content) > 10000


def test_download_nonexistent_template_404():
    client = TestClient(app)
    response = client.get("/api/v3/orders/templates/unknown-template-xyz")
    assert response.status_code == 404
