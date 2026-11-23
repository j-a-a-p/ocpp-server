"""Cards: registering, renaming, and the refused-card flow behind "add as my card"."""
from datetime import timedelta

import constants
from models import Card, RefusedCard, ResidentStatus


class TestAccess:
    def test_card_endpoints_need_a_login(self, client):
        assert client.get("/cards/").status_code == 401
        assert client.get("/cards/my_cards").status_code == 401
        assert client.get("/cards/refused").status_code == 401
        assert client.post("/cards/add_card/CP1").status_code == 401
        assert client.put("/cards/04AABBCC/name", json={"name": "x"}).status_code == 401


class TestRoles:
    """Managing cards is for managers. Only a resident can charge, so only a resident has cards of their own."""

    def test_listing_and_registering_cards_is_for_managers(self, login_as, make_resident):
        only_resident = login_as(make_resident(email="anna@example.com", roles="resident"))

        assert only_resident.get("/cards/").status_code == 403
        assert only_resident.post("/cards/", json={"rfid": "04AABBCC", "name": "x", "resident_id": 1}).status_code == 403

    def test_a_manager_who_is_not_a_resident_cannot_add_a_card_or_rename_one(self, login_as, make_resident, make_refused_card):
        boss = login_as(make_resident(email="boss@example.com", roles="manager"))
        make_refused_card("AAAA0001", station_id="CP1")

        assert boss.post("/cards/add_card/CP1").status_code == 403
        assert boss.put("/cards/AAAA0001/name", json={"name": "x"}).status_code == 403

    def test_a_manager_who_is_not_a_resident_has_no_cards(self, login_as, make_resident):
        boss = login_as(make_resident(email="boss@example.com", roles="manager"))

        assert boss.get("/cards/my_cards").json() == {"cards": []}

    def test_a_resident_who_is_not_a_manager_adds_and_renames_their_own_cards(self, login_as, make_resident, make_refused_card):
        anna = login_as(make_resident(email="anna@example.com", roles="resident"))
        make_refused_card("AAAA0001", station_id="CP1")

        assert anna.post("/cards/add_card/CP1").status_code == 200
        assert anna.put("/cards/AAAA0001/name", json={"name": "Tesla"}).status_code == 200
        assert anna.get("/cards/my_cards").json()["cards"][0]["name"] == "Tesla"


class TestRegistering:
    def test_register_a_card(self, user, me, db):
        response = user.post("/cards/", json={"rfid": "04AABBCC", "name": "Tesla", "resident_id": me.id})

        assert response.status_code == 200
        assert response.json() == {"rfid": "04AABBCC", "name": "Tesla", "resident_id": me.id}
        assert db.get(Card, "04AABBCC").name == "Tesla"

    def test_list_cards(self, user, me, make_card, make_resident):
        make_card(me, "04AABBCC")
        make_card(make_resident(email="other@example.com"), "04DDEEFF")

        assert {card["rfid"] for card in user.get("/cards/").json()} == {"04AABBCC", "04DDEEFF"}

    def test_my_cards_are_only_mine(self, user, me, make_card, make_resident):
        make_card(me, "04AABBCC", "Tesla")
        make_card(make_resident(email="other@example.com"), "04DDEEFF")

        cards = user.get("/cards/my_cards").json()["cards"]

        assert [(card["rfid"], card["name"]) for card in cards] == [("04AABBCC", "Tesla")]


class TestRenaming:
    def test_rename_own_card(self, user, me, make_card, db):
        make_card(me, "04AABBCC", "Old")

        response = user.put("/cards/04AABBCC/name", json={"name": "Nissan Leaf"})

        assert response.status_code == 200
        assert response.json()["name"] == "Nissan Leaf"
        db.expire_all()
        assert db.get(Card, "04AABBCC").name == "Nissan Leaf"

    def test_cannot_rename_the_card_of_someone_else(self, user, make_card, make_resident, db):
        make_card(make_resident(email="other@example.com"), "04DDEEFF", "Theirs")

        response = user.put("/cards/04DDEEFF/name", json={"name": "Mine now"})

        assert response.status_code == 404
        assert db.get(Card, "04DDEEFF").name == "Theirs"

    def test_unknown_card(self, user):
        assert user.put("/cards/NOPE/name", json={"name": "x"}).status_code == 404


class TestRefusedCards:
    def test_none_refused_is_a_404(self, user):
        assert user.get("/cards/refused").status_code == 404

    def test_lists_recent_refusals_newest_first(self, user, make_refused_card):
        make_refused_card("AAAA0001", age=timedelta(minutes=3))
        make_refused_card("AAAA0002", age=timedelta(minutes=1))

        refused = user.get("/cards/refused").json()["refused_cards"]

        assert [item["rfid"] for item in refused] == ["AAAA0002", "AAAA0001"]
        assert set(refused[0]) == {"id", "rfid", "station_id", "created"}

    def test_refusals_older_than_five_minutes_are_not_listed(self, user, make_refused_card):
        make_refused_card("OLD00001", age=timedelta(minutes=6))

        assert user.get("/cards/refused").status_code == 404

    def test_the_same_card_tried_twice_is_listed_twice(self, user, make_refused_card):
        # The resident UI removes these duplicates itself.
        make_refused_card("AAAA0001", age=timedelta(seconds=30))
        make_refused_card("AAAA0001", age=timedelta(seconds=10))

        assert len(user.get("/cards/refused").json()["refused_cards"]) == 2

    def test_add_the_last_refused_card_of_a_station_as_my_card(self, user, me, db, make_refused_card):
        make_refused_card("OTHERSTN", station_id="CP2")
        make_refused_card("AAAA0001", station_id="CP1", age=timedelta(minutes=2))
        refused_id = make_refused_card("AAAA0002", station_id="CP1", age=timedelta(minutes=1)).id

        response = user.post("/cards/add_card/CP1")

        assert response.status_code == 200
        assert response.json() == {"rfid": "AAAA0002", "name": "AAAA0002", "resident_id": me.id}
        db.expire_all()
        assert db.get(Card, "AAAA0002").resident_id == me.id
        assert db.get(RefusedCard, refused_id) is None
        assert db.query(RefusedCard).filter_by(rfid="AAAA0001").count() == 1

    def test_nothing_to_add_without_a_refusal_at_that_station(self, user, make_refused_card):
        make_refused_card("AAAA0001", station_id="CP2")

        assert user.post("/cards/add_card/CP1").status_code == 404


class TestStationAuthentication:
    """What the station asks the API: is this card known?"""

    def test_known_card(self, client, api_key_headers, me, make_card):
        make_card(me, "04AABBCC")

        response = client.get("/cards/authenticate/04AABBCC", params={"station_id": "CP1"}, headers=api_key_headers)

        assert response.status_code == 200
        assert response.json() == {"resident_id": me.id}

    def test_the_card_of_a_manager_who_is_not_a_resident_is_refused(self, client, api_key_headers, make_resident, make_card, db):
        make_card(make_resident(email="boss@example.com", roles="manager"), "04AABBCC")

        response = client.get("/cards/authenticate/04AABBCC", params={"station_id": "CP1"}, headers=api_key_headers)

        assert response.status_code == 404
        assert db.query(RefusedCard).count() == 0  # the card is known, so it cannot be claimed as new

    def test_the_card_of_a_resident_who_has_not_activated_yet_is_refused(self, client, api_key_headers, make_resident, make_card):
        invited = make_resident(email="new@example.com", roles="resident", status=ResidentStatus.INVITED)
        make_card(invited, "04AABBCC")

        response = client.get("/cards/authenticate/04AABBCC", params={"station_id": "CP1"}, headers=api_key_headers)

        assert response.status_code == 404

    def test_the_card_of_a_household_member_is_accepted(self, client, api_key_headers, me, make_resident, make_card):
        member = make_resident(email="member@example.com", roles="resident", household_head_id=me.id)
        make_card(member, "04AABBCC")

        response = client.get("/cards/authenticate/04AABBCC", params={"station_id": "CP1"}, headers=api_key_headers)

        assert response.json() == {"resident_id": member.id}

    def test_unknown_card_is_refused_and_remembered(self, client, api_key_headers, db):
        response = client.get("/cards/authenticate/DEADBEEF", params={"station_id": "CP1"}, headers=api_key_headers)

        assert response.status_code == 404
        refused = db.query(RefusedCard).one()
        assert (refused.rfid, refused.station_id) == ("DEADBEEF", "CP1")

    def test_needs_the_api_key(self, client):
        assert client.get("/cards/authenticate/04AABBCC", params={"station_id": "CP1"}).status_code == 403
        wrong = client.get("/cards/authenticate/04AABBCC", params={"station_id": "CP1"}, headers={"X-API-Key": "wrong"})
        assert wrong.status_code == 403

    def test_refuses_everybody_when_no_key_is_configured(self, client, monkeypatch, api_key_headers):
        monkeypatch.setattr(constants, "API_KEY", None)

        assert client.get("/cards/authenticate/04AABBCC", params={"station_id": "CP1"}, headers=api_key_headers).status_code == 403
        assert client.get("/cards/authenticate/04AABBCC", params={"station_id": "CP1"}, headers={"X-API-Key": ""}).status_code == 403

    def test_the_old_published_key_does_not_work(self, client):
        response = client.get("/cards/authenticate/04AABBCC", params={"station_id": "CP1"}, headers={"X-API-Key": "your-secure-api-key"})

        assert response.status_code == 403
