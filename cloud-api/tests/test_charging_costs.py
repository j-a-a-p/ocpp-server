"""The price per kWh and its history."""
from datetime import date, timedelta

from models import ChargingCost

TODAY = date.today()


def prices(user):
    return {(cost["kwh_price"], cost["end_date"]) for cost in user.get("/charging-costs/").json()}


class TestReading:
    def test_needs_a_login(self, client):
        assert client.get("/charging-costs/").status_code == 401
        assert client.get("/charging-costs/active").status_code == 401
        assert client.post("/charging-costs/", json={"kwh_price": 0.4, "start_date": str(TODAY)}).status_code == 401

    def test_the_price_starts_at_thirty_cents(self, user):
        active = user.get("/charging-costs/active").json()

        assert active["kwh_price"] == 0.30
        assert active["end_date"] is None

    def test_no_active_price(self, user, db):
        db.query(ChargingCost).delete()
        db.commit()

        assert user.get("/charging-costs/active").status_code == 404


class TestChangingThePrice:
    def test_new_price_becomes_active_and_the_old_one_ends_the_day_before(self, user):
        start = TODAY + timedelta(days=10)

        response = user.post("/charging-costs/", json={"kwh_price": 0.45, "start_date": str(start)})

        assert response.status_code == 200
        assert response.json()["kwh_price"] == 0.45
        assert response.json()["end_date"] is None
        assert prices(user) == {(0.30, str(start - timedelta(days=1))), (0.45, None)}

    def test_price_that_starts_today_is_the_active_one(self, user):
        user.post("/charging-costs/", json={"kwh_price": 0.45, "start_date": str(TODAY)})

        assert user.get("/charging-costs/active").json()["kwh_price"] == 0.45

    def test_price_must_be_positive(self, user):
        for price in (0, -0.1):
            response = user.post("/charging-costs/", json={"kwh_price": price, "start_date": str(TODAY)})
            assert response.status_code == 400

        assert prices(user) == {(0.30, None)}

    def test_start_date_cannot_be_before_the_end_of_an_earlier_price(self, user):
        user.post("/charging-costs/", json={"kwh_price": 0.45, "start_date": str(TODAY)})

        response = user.post("/charging-costs/", json={"kwh_price": 0.50, "start_date": str(TODAY - timedelta(days=5))})

        assert response.status_code == 400
        assert "earlier than the last known end date" in response.json()["detail"]

    def test_invalid_input(self, user):
        assert user.post("/charging-costs/", json={"kwh_price": "cheap", "start_date": str(TODAY)}).status_code == 422
