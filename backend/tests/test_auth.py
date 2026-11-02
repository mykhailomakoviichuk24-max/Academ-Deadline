from tests.conftest import register


async def test_register_login_me(client):
    headers = await register(client)
    me = await client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "student@example.com"
    assert me.json()["telegram_linked"] is False

    login = await client.post(
        "/api/auth/login", json={"email": "student@example.com", "password": "secret123"}
    )
    assert login.status_code == 200
    assert login.json()["token_type"] == "bearer"


async def test_duplicate_email_and_bad_password(client):
    await register(client)
    dup = await client.post(
        "/api/auth/register",
        json={"email": "student@example.com", "password": "secret123", "full_name": "X"},
    )
    assert dup.status_code == 409
    bad = await client.post(
        "/api/auth/login", json={"email": "student@example.com", "password": "wrong-pass"}
    )
    assert bad.status_code == 401


async def test_protected_requires_token(client):
    assert (await client.get("/api/tasks")).status_code == 401
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer junk"})).status_code == 401


async def test_refresh_token(client):
    r = await client.post(
        "/api/auth/register",
        json={"email": "a@b.com", "password": "secret123", "full_name": "A"},
    )
    refresh = r.json()["refresh_token"]
    new = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert new.status_code == 200
    # access token must not be accepted as refresh token
    bad = await client.post("/api/auth/refresh", json={"refresh_token": r.json()["access_token"]})
    assert bad.status_code == 401
