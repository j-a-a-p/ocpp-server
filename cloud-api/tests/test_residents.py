"""Managing residents: inviting, activating and listing them."""
from datetime import datetime, timedelta

import invite
from conftest import INVITE_URL
from models import Resident, ResidentStatus


def reload(db, resident_id) -> Resident:
    db.expire_all()
    return db.get(Resident, resident_id)


class TestAccess:
    def test_all_resident_endpoints_need_a_login(self, client):
        assert client.get("/residents/").status_code == 401
        assert client.get("/residents/1").status_code == 401
        assert client.post("/residents/", json={"full_name": "A", "email": "a@example.com"}).status_code == 401
        assert client.post("/residents/1/send-invitation").status_code == 401

    def test_every_active_resident_can_manage_residents(self, login_as, make_resident):
        # There is no separate management role yet: a login link for the management portal
        # is available to any active resident. This test records that.
        ordinary = make_resident(email="ordinary@example.com")

        assert login_as(ordinary).get("/residents/").status_code == 200


class TestListing:
    def test_lists_residents_with_their_status(self, user, me, make_resident):
        make_resident(email="new@example.com", full_name="New One", status=ResidentStatus.INVITED)

        residents = user.get("/residents/").json()

        by_email = {resident["email"]: resident for resident in residents}
        assert set(by_email) == {"me@example.com", "new@example.com"}
        assert by_email["new@example.com"]["status"] == "invited"
        assert by_email["me@example.com"]["status"] == "active"

    def test_pagination(self, user, make_resident):
        for number in range(5):
            make_resident(email=f"r{number}@example.com")

        assert len(user.get("/residents/", params={"limit": 2}).json()) == 2
        assert len(user.get("/residents/", params={"skip": 4, "limit": 10}).json()) == 2

    def test_one_resident(self, user, me):
        assert user.get(f"/residents/{me.id}").json()["email"] == "me@example.com"

    def test_unknown_resident(self, user):
        assert user.get("/residents/9999").status_code == 404


class TestInviting:
    def test_new_resident_is_invited_and_gets_a_mail(self, user, db, outbox):
        response = user.post("/residents/", json={"full_name": "Dave Dee", "email": "dave@example.com"})

        assert response.status_code == 200
        assert response.json()["status"] == "invited"
        resident = db.query(Resident).filter_by(email="dave@example.com").one()
        assert resident.status == ResidentStatus.INVITED
        assert resident.invite_token
        assert len(outbox) == 1
        assert outbox[0]["recipient"] == "dave@example.com"
        assert f"{INVITE_URL}/activate?token={resident.invite_token}" in outbox[0]["body"]

    def test_the_invitation_has_a_styled_html_version_next_to_the_text(self, user, db, outbox):
        user.post("/residents/", json={"full_name": "Dave Dee", "email": "dave@example.com"})

        resident = db.query(Resident).filter_by(email="dave@example.com").one()
        html = outbox[0]["html"]
        assert f'href="{INVITE_URL}/activate?token={resident.invite_token}"' in html
        assert "Activate my account" in html and "#0d9488" in html

    def test_invitation_is_valid_for_30_days(self, user, db, outbox):
        user.post("/residents/", json={"full_name": "Dave Dee", "email": "dave@example.com"})

        expires = db.query(Resident).filter_by(email="dave@example.com").one().invite_expires_at
        assert timedelta(days=29) < expires - datetime.utcnow() <= timedelta(days=30)
        assert "This invitation expires in 30 days." in outbox[0]["body"]
        assert "This invitation expires in 30 days." in outbox[0]["html"]

    def test_email_must_be_unique(self, user, outbox):
        first = user.post("/residents/", json={"full_name": "Dave", "email": "dave@example.com"})
        second = user.post("/residents/", json={"full_name": "Dave Again", "email": "dave@example.com"})

        assert first.status_code == 200
        assert second.status_code == 400
        assert len(outbox) == 1

    def test_resident_is_created_even_when_the_mail_fails(self, user, db, monkeypatch):
        class BrokenSender:
            def send_email(self, **_):
                raise RuntimeError("SES is down")

        monkeypatch.setattr(invite, "SESEmailSender", BrokenSender)

        response = user.post("/residents/", json={"full_name": "Dave", "email": "dave@example.com"})

        assert response.status_code == 200
        assert db.query(Resident).filter_by(email="dave@example.com").count() == 1

    def test_resend_with_an_expired_invitation_makes_a_new_token(self, user, db, make_resident, outbox):
        resident = make_resident(
            email="dave@example.com", status=ResidentStatus.INVITED,
            invite_token="old", invite_expires_at=datetime.utcnow() - timedelta(days=1),
        )

        response = user.post(f"/residents/{resident.id}/send-invitation")

        assert response.status_code == 200
        assert reload(db, resident.id).invite_token != "old"
        assert len(outbox) == 1

    def test_no_second_invitation_while_one_is_valid(self, user, make_resident, outbox):
        resident = make_resident(
            email="dave@example.com", status=ResidentStatus.INVITED,
            invite_token="current", invite_expires_at=datetime.utcnow() + timedelta(days=1),
        )

        response = user.post(f"/residents/{resident.id}/send-invitation")

        assert response.status_code == 400
        assert outbox == []

    def test_invitation_for_an_unknown_resident(self, user):
        assert user.post("/residents/9999/send-invitation").status_code == 404


class TestActivation:
    def invited(self, make_resident, token="invite-token", expires=None):
        return make_resident(
            email="dave@example.com", status=ResidentStatus.INVITED,
            invite_token=token, invite_expires_at=expires or datetime.utcnow() + timedelta(days=1),
        )

    def test_activating_logs_the_resident_in(self, client, db, make_resident):
        resident = self.invited(make_resident)

        response = client.post("/residents/activate/invite-token")

        assert response.status_code == 200
        activated = reload(db, resident.id)
        assert activated.status == ResidentStatus.ACTIVE
        assert activated.invite_token is None
        cookie = response.headers["set-cookie"]
        assert "auth_token=" in cookie and "HttpOnly" in cookie and "Secure" in cookie

    def test_token_works_only_once(self, client, make_resident):
        self.invited(make_resident)

        assert client.post("/residents/activate/invite-token").status_code == 200
        assert client.post("/residents/activate/invite-token").status_code == 404

    def test_unknown_token(self, client):
        assert client.post("/residents/activate/nope").status_code == 404

    def test_expired_invitation(self, client, db, make_resident):
        resident = self.invited(make_resident, expires=datetime.utcnow() - timedelta(seconds=1))

        response = client.post("/residents/activate/invite-token")

        assert response.status_code == 400
        assert reload(db, resident.id).status == ResidentStatus.INVITED
