"""Login by emailed link, and the cookie that keeps a resident logged in."""
from datetime import datetime, timedelta

import jwt

import invite
from conftest import INVITE_URL, JWT_SECRET
from models import Resident, ResidentStatus


def stored_login_token(db, resident) -> str | None:
    db.expire_all()
    return db.get(Resident, resident.id).login_token


class TestRequestAccess:
    def test_active_resident_gets_a_resident_portal_link(self, client, db, make_resident, outbox):
        resident = make_resident(email="anna@example.com")

        response = client.post("/auth/request-access", params={"email": "anna@example.com"})

        assert response.status_code == 200
        assert response.json()["success"] is True
        token = stored_login_token(db, resident)
        assert token
        assert len(outbox) == 1
        assert outbox[0]["recipient"] == "anna@example.com"
        assert f"{INVITE_URL}/login?token={token}" in outbox[0]["body"]

    def test_management_flow_links_to_the_management_portal(self, client, db, make_resident, outbox):
        resident = make_resident(email="anna@example.com")

        client.post("/auth/request-access", params={"email": "anna@example.com", "flow": "management"})

        token = stored_login_token(db, resident)
        assert "https://charge.example.test/management-ui/login?token=" + token in outbox[0]["body"]
        assert "Management" in outbox[0]["subject"]

    def test_the_mail_has_a_styled_html_version_next_to_the_text(self, client, db, make_resident, outbox):
        resident = make_resident(email="anna@example.com")

        client.post("/auth/request-access", params={"email": "anna@example.com"})

        token = stored_login_token(db, resident)
        html = outbox[0]["html"]
        assert f'href="{INVITE_URL}/login?token={token}"' in html
        assert "#0d9488" in html and "Inter" in html
        assert "Sign in" in html and "expires in 1 hour" in html

    def test_the_link_is_valid_for_one_hour(self, client, db, make_resident):
        resident = make_resident()

        client.post("/auth/request-access", params={"email": resident.email})

        db.expire_all()
        expires = db.get(Resident, resident.id).login_expires_at
        assert timedelta(minutes=59) < expires - datetime.utcnow() <= timedelta(hours=1)

    def test_asking_again_right_away_sends_no_second_mail(self, client, db, make_resident, outbox):
        resident = make_resident(email="anna@example.com")

        first = client.post("/auth/request-access", params={"email": "anna@example.com"})
        token = stored_login_token(db, resident)
        again = client.post("/auth/request-access", params={"email": "anna@example.com"})

        assert again.status_code == 200
        assert again.json() == first.json()
        assert len(outbox) == 1
        assert stored_login_token(db, resident) == token

    def test_asking_again_after_a_minute_sends_a_new_mail(self, client, db, make_resident, outbox):
        resident = make_resident(email="anna@example.com")
        client.post("/auth/request-access", params={"email": "anna@example.com"})
        db.expire_all()
        db.get(Resident, resident.id).login_expires_at = datetime.utcnow() + timedelta(minutes=58)
        db.commit()

        client.post("/auth/request-access", params={"email": "anna@example.com"})

        assert len(outbox) == 2

    def test_unknown_email_gets_the_same_answer_and_no_mail(self, client, outbox):
        known = client.post("/auth/request-access", params={"email": "nobody@example.com"})

        assert known.status_code == 200
        assert known.json()["message"] == "If your email is registered, you will receive a login link shortly."
        assert outbox == []

    def test_invited_resident_gets_no_mail(self, client, make_resident, outbox):
        make_resident(email="new@example.com", status=ResidentStatus.INVITED)

        response = client.post("/auth/request-access", params={"email": "new@example.com"})

        assert response.status_code == 200
        assert outbox == []

    def test_unknown_flow_is_rejected(self, client, make_resident, outbox):
        make_resident(email="anna@example.com")

        response = client.post("/auth/request-access", params={"email": "anna@example.com", "flow": "admin"})

        assert response.status_code == 400
        assert outbox == []

    def test_mail_failure_is_reported(self, client, make_resident, monkeypatch):
        make_resident(email="anna@example.com")

        class BrokenSender:
            def send_email(self, **_):
                raise RuntimeError("SES is down")

        monkeypatch.setattr(invite, "SESEmailSender", BrokenSender)

        response = client.post("/auth/request-access", params={"email": "anna@example.com"})

        assert response.status_code == 500


class TestLogin:
    def request_link(self, client, db, resident) -> str:
        client.post("/auth/request-access", params={"email": resident.email})
        return stored_login_token(db, resident)

    def test_link_logs_the_resident_in(self, client, db, make_resident):
        resident = make_resident()
        token = self.request_link(client, db, resident)

        response = client.post(f"/auth/login/{token}")

        assert response.status_code == 200
        cookie = response.headers["set-cookie"]
        assert "auth_token=" in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()
        payload = jwt.decode(response.cookies["auth_token"], JWT_SECRET, algorithms=["HS256"])
        assert payload["resident_id"] == resident.id
        validated = client.get("/auth/validate")
        assert validated.status_code == 200
        assert validated.json() == {
            "resident_id": resident.id, "email": resident.email,
            "full_name": resident.full_name, "status": "active",
        }

    def test_the_cookie_is_secure_when_the_browser_used_https(self, client, db, make_resident):
        token = self.request_link(client, db, make_resident())

        response = client.post(f"/auth/login/{token}", headers={"X-Forwarded-Proto": "https"})

        assert "secure" in response.headers["set-cookie"].lower()

    def test_link_works_only_once(self, client, db, make_resident):
        token = self.request_link(client, db, make_resident())

        assert client.post(f"/auth/login/{token}").status_code == 200
        assert client.post(f"/auth/login/{token}").status_code == 404

    def test_unknown_token_is_refused(self, client):
        assert client.post("/auth/login/not-a-token").status_code == 404

    def test_expired_link_is_refused(self, client, db, make_resident):
        resident = make_resident()
        token = self.request_link(client, db, resident)
        db.get(Resident, resident.id).login_expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()

        response = client.post(f"/auth/login/{token}")

        assert response.status_code == 400
        assert "expired" in response.json()["detail"]

    def test_resident_who_is_no_longer_active_cannot_log_in(self, client, db, make_resident):
        resident = make_resident(
            status=ResidentStatus.INVITED, login_token="stale", login_expires_at=datetime.utcnow() + timedelta(hours=1),
        )

        assert client.post("/auth/login/stale").status_code == 400


class TestLogout:
    def test_logging_out_ends_the_session(self, client, db, make_resident):
        resident = make_resident()
        client.post("/auth/request-access", params={"email": resident.email})
        client.post(f"/auth/login/{stored_login_token(db, resident)}")
        assert client.get("/auth/validate").status_code == 200

        response = client.post("/auth/logout")

        assert response.status_code == 200
        cookie = response.headers["set-cookie"].lower()
        assert "auth_token=" in cookie and "max-age=0" in cookie and "httponly" in cookie
        assert client.get("/auth/validate").status_code == 401

    def test_logging_out_without_a_session_is_fine(self, client):
        assert client.post("/auth/logout").status_code == 200

    def test_the_cookie_is_removed_with_the_same_security_flags_it_was_set_with(self, client):
        response = client.post("/auth/logout", headers={"X-Forwarded-Proto": "https"})

        assert "secure" in response.headers["set-cookie"].lower()


class TestValidate:
    def test_without_cookie(self, client):
        response = client.get("/auth/validate")

        assert response.status_code == 401
        assert response.json()["detail"] == "Missing auth token"

    def test_garbage_cookie(self, client):
        client.cookies.set("auth_token", "garbage")

        assert client.get("/auth/validate").json()["detail"] == "Invalid auth token"

    def test_cookie_signed_with_another_secret(self, client, me):
        client.cookies.set("auth_token", jwt.encode({"resident_id": me.id}, "another-secret-another-secret-123456", algorithm="HS256"))

        assert client.get("/auth/validate").status_code == 401

    def test_expired_cookie(self, client, me):
        client.cookies.set("auth_token", jwt.encode(
            {"resident_id": me.id, "exp": datetime.utcnow() - timedelta(seconds=5)}, JWT_SECRET, algorithm="HS256"))

        assert client.get("/auth/validate").status_code == 401

    def test_cookie_of_a_resident_that_does_not_exist(self, client, outbox):
        client.cookies.set("auth_token", invite.generate_auth_token(9999))

        assert client.get("/auth/validate").status_code == 404

    def test_cookie_of_a_resident_that_is_not_active(self, login_as, make_resident):
        invited = make_resident(email="new@example.com", status=ResidentStatus.INVITED)

        response = login_as(invited).get("/auth/validate")

        assert response.status_code == 401
        assert response.json()["detail"] == "Account is not active"
