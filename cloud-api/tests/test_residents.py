"""Managing residents: inviting, activating, roles, addresses and household members."""
from datetime import datetime, timedelta

import invite
from conftest import INVITE_URL
from models import Resident, ResidentStatus


def reload(db, resident_id) -> Resident:
    db.expire_all()
    return db.get(Resident, resident_id)


HOME = {"street_name": "Hoofdstraat", "house_number": "12", "zip_code": "1234 AB", "city": "Utrecht"}


def new_resident(email="dave@example.com", full_name="Dave Dee", roles=("resident",), **address) -> dict:
    """The body of an invitation. A resident gets the address of HOME unless another one is given."""
    body = {"full_name": full_name, "email": email, "roles": list(roles)}
    if "resident" in roles:
        body.update({**HOME, **address})
    return body


class TestAccess:
    def test_all_resident_endpoints_need_a_login(self, client):
        assert client.get("/residents/").status_code == 401
        assert client.get("/residents/1").status_code == 401
        assert client.post("/residents/", json=new_resident()).status_code == 401
        assert client.put("/residents/1", json={"full_name": "A", "roles": ["manager"]}).status_code == 401
        assert client.post("/residents/1/send-invitation").status_code == 401
        assert client.get("/residents/address-options").status_code == 401
        assert client.get("/residents/household-members").status_code == 401
        assert client.post("/residents/household-members", json={"full_name": "A", "email": "a@example.com"}).status_code == 401

    def test_managing_residents_is_for_managers(self, login_as, make_resident):
        only_resident = login_as(make_resident(email="ordinary@example.com", roles="resident"))

        assert only_resident.get("/residents/").status_code == 403
        assert only_resident.get("/residents/1").status_code == 403
        assert only_resident.post("/residents/", json=new_resident()).status_code == 403
        assert only_resident.put("/residents/1", json={"full_name": "A", "roles": ["manager"]}).status_code == 403
        assert only_resident.post("/residents/1/send-invitation").status_code == 403
        assert only_resident.get("/residents/address-options").status_code == 403

    def test_a_manager_who_is_not_a_resident_can_manage_residents(self, login_as, make_resident):
        manager = login_as(make_resident(email="boss@example.com", roles="manager"))

        assert manager.get("/residents/").status_code == 200

    def test_an_account_without_roles_can_do_nothing(self, login_as, make_resident):
        nobody = login_as(make_resident(email="nobody@example.com", roles=""))

        assert nobody.get("/residents/").status_code == 403
        assert nobody.get("/residents/household-members").status_code == 403


class TestListing:
    def test_lists_residents_with_their_status_roles_and_address(self, user, me, make_resident):
        make_resident(
            email="new@example.com", full_name="New One", status=ResidentStatus.INVITED, roles="resident",
            street_name="Kerkstraat", house_number="3", house_number_suffix="A",
        )

        residents = user.get("/residents/").json()

        by_email = {resident["email"]: resident for resident in residents}
        assert set(by_email) == {"me@example.com", "new@example.com"}
        assert by_email["new@example.com"]["status"] == "invited"
        assert by_email["me@example.com"]["status"] == "active"
        assert by_email["me@example.com"]["roles"] == ["manager", "resident"]
        assert by_email["new@example.com"]["roles"] == ["resident"]
        assert by_email["new@example.com"]["street_name"] == "Kerkstraat"
        assert by_email["new@example.com"]["house_number"] == "3"
        assert by_email["new@example.com"]["house_number_suffix"] == "A"
        assert by_email["new@example.com"]["zip_code"] is None
        assert by_email["new@example.com"]["city"] is None
        assert by_email["me@example.com"]["household_head_id"] is None

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
        response = user.post("/residents/", json=new_resident())

        assert response.status_code == 200
        assert response.json()["status"] == "invited"
        resident = db.query(Resident).filter_by(email="dave@example.com").one()
        assert resident.status == ResidentStatus.INVITED
        assert resident.invite_token
        assert len(outbox) == 1
        assert outbox[0]["recipient"] == "dave@example.com"
        assert f"{INVITE_URL}/activate?token={resident.invite_token}" in outbox[0]["body"]

    def test_the_invitation_has_a_styled_html_version_next_to_the_text(self, user, db, outbox):
        user.post("/residents/", json=new_resident())

        resident = db.query(Resident).filter_by(email="dave@example.com").one()
        html = outbox[0]["html"]
        assert f'href="{INVITE_URL}/activate?token={resident.invite_token}"' in html
        assert "Activate my account" in html and "#0d9488" in html

    def test_invitation_is_valid_for_30_days(self, user, db, outbox):
        user.post("/residents/", json=new_resident())

        expires = db.query(Resident).filter_by(email="dave@example.com").one().invite_expires_at
        assert timedelta(days=29) < expires - datetime.utcnow() <= timedelta(days=30)
        assert "This invitation expires in 30 days." in outbox[0]["body"]
        assert "This invitation expires in 30 days." in outbox[0]["html"]

    def test_email_must_be_unique(self, user, outbox):
        first = user.post("/residents/", json=new_resident(full_name="Dave"))
        second = user.post("/residents/", json=new_resident(full_name="Dave Again"))

        assert first.status_code == 200
        assert second.status_code == 400
        assert len(outbox) == 1

    def test_resident_is_created_even_when_the_mail_fails(self, user, db, monkeypatch):
        class BrokenSender:
            def send_email(self, **_):
                raise RuntimeError("SES is down")

        monkeypatch.setattr(invite, "SESEmailSender", BrokenSender)

        response = user.post("/residents/", json=new_resident())

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


class TestRolesAndAddressOfAnInvitation:
    def test_a_resident_is_invited_with_an_address(self, user, db):
        response = user.post("/residents/", json=new_resident(street_name="Hoofdstraat", house_number="12", house_number_suffix="A"))

        body = response.json()
        assert body["roles"] == ["resident"]
        assert (body["street_name"], body["house_number"], body["house_number_suffix"], body["zip_code"], body["city"]) == ("Hoofdstraat", "12", "A", "1234 AB", "Utrecht")
        stored = db.query(Resident).filter_by(email="dave@example.com").one()
        assert stored.roles == "resident"
        assert stored.household_head_id is None

    def test_the_suffix_is_optional(self, user):
        response = user.post("/residents/", json=new_resident())

        assert response.status_code == 200
        assert response.json()["house_number_suffix"] is None

    def test_an_empty_suffix_is_stored_as_nothing(self, user):
        response = user.post("/residents/", json={**new_resident(), "house_number_suffix": "  "})

        assert response.json()["house_number_suffix"] is None

    def test_a_resident_needs_a_street_a_number_a_zip_code_and_a_city(self, user, outbox):
        no_street = user.post("/residents/", json={"full_name": "A", "email": "a@example.com", "roles": ["resident"], "house_number": "1", "zip_code": "1234 AB", "city": "Utrecht"})
        no_zip = user.post("/residents/", json={"full_name": "A", "email": "a@example.com", "roles": ["resident"], "street_name": "Hoofdstraat", "house_number": "1", "city": "Utrecht"})
        no_city = user.post("/residents/", json={"full_name": "A", "email": "a@example.com", "roles": ["resident"], "street_name": "Hoofdstraat", "house_number": "1", "zip_code": "1234 AB"})
        blank = user.post("/residents/", json={"full_name": "A", "email": "a@example.com", "roles": ["resident"], "street_name": " ", "house_number": "1", "zip_code": "1234 AB", "city": " "})

        assert no_street.status_code == no_zip.status_code == no_city.status_code == blank.status_code == 422
        assert outbox == []

    def test_a_manager_who_is_not_a_resident_needs_no_address(self, user, db):
        response = user.post("/residents/", json=new_resident(email="boss@example.com", roles=("manager",)))

        assert response.status_code == 200
        assert response.json()["roles"] == ["manager"]
        assert response.json()["street_name"] is None

    def test_an_address_is_not_stored_for_an_account_that_is_not_a_resident(self, user):
        response = user.post("/residents/", json={**new_resident(email="boss@example.com", roles=("manager",)), **HOME})

        assert response.json()["street_name"] is None
        assert response.json()["house_number"] is None
        assert response.json()["zip_code"] is None
        assert response.json()["city"] is None

    def test_someone_can_be_manager_and_resident(self, user):
        response = user.post("/residents/", json=new_resident(roles=("resident", "manager")))

        assert response.json()["roles"] == ["manager", "resident"]

    def test_at_least_one_role_is_needed(self, user):
        assert user.post("/residents/", json={"full_name": "A", "email": "a@example.com", "roles": []}).status_code == 422
        assert user.post("/residents/", json={"full_name": "A", "email": "a@example.com"}).status_code == 422

    def test_an_unknown_role_is_refused(self, user):
        response = user.post("/residents/", json={**new_resident(), "roles": ["resident", "admin"]})

        assert response.status_code == 422

    def test_a_role_given_twice_is_stored_once(self, user, db):
        user.post("/residents/", json=new_resident(roles=("resident", "resident", "manager")))

        assert db.query(Resident).filter_by(email="dave@example.com").one().roles == "manager,resident"

    def test_the_spelling_of_an_existing_street_is_reused(self, user, make_resident):
        make_resident(email="anna@example.com", roles="resident", street_name="Hoofdstraat", house_number="12", house_number_suffix="A", zip_code="1234 AB", city="Utrecht")

        response = user.post("/residents/", json={**new_resident(), "street_name": "  hoofdstraat ", "house_number": "12", "house_number_suffix": "a", "zip_code": "1234 ab", "city": "utrecht"})

        body = response.json()
        assert (body["street_name"], body["house_number"], body["house_number_suffix"], body["zip_code"], body["city"]) == ("Hoofdstraat", "12", "A", "1234 AB", "Utrecht")

    def test_a_new_street_is_stored_as_typed_with_clean_spaces(self, user):
        response = user.post("/residents/", json={**new_resident(), "street_name": "  Nieuwe   Dorpsstraat "})

        assert response.json()["street_name"] == "Nieuwe Dorpsstraat"


class TestAddressOptions:
    def test_lists_each_address_once_in_order(self, user, make_resident):
        make_resident(email="a@example.com", roles="resident", street_name="Kerkstraat", house_number="3")
        make_resident(email="b@example.com", roles="resident", street_name="Hoofdstraat", house_number="12", house_number_suffix="A")
        make_resident(email="c@example.com", roles="resident", street_name="Hoofdstraat", house_number="12", household_head_id=2)
        make_resident(email="d@example.com", roles="resident", street_name="Hoofdstraat", house_number="12", household_head_id=2)
        make_resident(email="e@example.com", roles="manager")  # no address

        options = user.get("/residents/address-options").json()

        assert options == [
            {"street_name": "Hoofdstraat", "house_number": "12", "house_number_suffix": None, "zip_code": None, "city": None},
            {"street_name": "Hoofdstraat", "house_number": "12", "house_number_suffix": "A", "zip_code": None, "city": None},
            {"street_name": "Kerkstraat", "house_number": "3", "house_number_suffix": None, "zip_code": None, "city": None},
        ]

    def test_is_empty_without_addresses(self, user):
        assert user.get("/residents/address-options").json() == []


class TestEditing:
    def edit(self, client, resident, **changes):
        body = {
            "full_name": resident.full_name,
            "roles": resident.roles.split(","),
            "street_name": resident.street_name,
            "house_number": resident.house_number,
            "house_number_suffix": resident.house_number_suffix,
            "zip_code": resident.zip_code,
            "city": resident.city,
            **changes,
        }
        return client.put(f"/residents/{resident.id}", json=body)

    def test_changes_the_name_and_the_address(self, user, make_resident, db):
        anna = make_resident(email="anna@example.com", roles="resident", **HOME)

        response = self.edit(user, anna, full_name="Anna Anderson", street_name="Kerkstraat", house_number="3", house_number_suffix="B")

        assert response.status_code == 200
        stored = reload(db, anna.id)
        assert stored.full_name == "Anna Anderson"
        assert (stored.street_name, stored.house_number, stored.house_number_suffix) == ("Kerkstraat", "3", "B")

    def test_an_existing_account_can_get_an_address(self, user, me, db):
        response = self.edit(user, me, **HOME)

        assert response.status_code == 200
        assert reload(db, me.id).street_name == "Hoofdstraat"

    def test_the_email_cannot_be_changed(self, user, make_resident, db):
        anna = make_resident(email="anna@example.com", roles="resident", street_name="Hoofdstraat", house_number="12")

        self.edit(user, anna, email="other@example.com")

        assert reload(db, anna.id).email == "anna@example.com"

    def test_an_unknown_resident(self, user):
        assert user.put("/residents/9999", json={"full_name": "A", "roles": ["manager"]}).status_code == 404

    def test_becoming_a_resident_needs_an_address(self, user, make_resident):
        boss = make_resident(email="boss@example.com", roles="manager")

        response = user.put(f"/residents/{boss.id}", json={"full_name": "Boss", "roles": ["manager", "resident"]})

        assert response.status_code == 422

    def test_a_manager_can_become_a_resident(self, user, make_resident, db):
        boss = make_resident(email="boss@example.com", roles="manager")

        response = user.put(f"/residents/{boss.id}", json={"full_name": "Boss", "roles": ["manager", "resident"], **HOME})

        assert response.status_code == 200
        stored = reload(db, boss.id)
        assert stored.roles == "manager,resident"
        assert stored.street_name == "Hoofdstraat"

    def test_no_longer_a_resident_clears_the_address(self, user, make_resident, db):
        both = make_resident(email="both@example.com", roles="manager,resident", street_name="Hoofdstraat", house_number="12")

        response = user.put(f"/residents/{both.id}", json={"full_name": "Both", "roles": ["manager"]})

        assert response.status_code == 200
        stored = reload(db, both.id)
        assert stored.roles == "manager"
        assert stored.address_of() == (None, None, None, None, None)

    def test_a_new_address_moves_the_household_along(self, user, make_resident, db):
        head = make_resident(email="head@example.com", roles="resident", **HOME)
        member = make_resident(email="member@example.com", roles="resident", household_head_id=head.id, **HOME)

        self.edit(user, head, street_name="Kerkstraat", house_number="3", house_number_suffix="A", zip_code="5678 CD", city="Amersfoort")

        assert reload(db, member.id).address_of() == ("Kerkstraat", "3", "A", "5678 CD", "Amersfoort")

    def test_a_resident_with_household_members_stays_a_resident(self, user, make_resident, db):
        head = make_resident(email="head@example.com", roles="manager,resident", street_name="Hoofdstraat", house_number="12")
        make_resident(email="member@example.com", roles="resident", household_head_id=head.id, street_name="Hoofdstraat", house_number="12")

        response = self.edit(user, head, roles=["manager"])

        assert response.status_code == 409
        assert reload(db, head.id).roles == "manager,resident"

    def test_a_household_member_can_only_be_renamed(self, user, make_resident, db):
        head = make_resident(email="head@example.com", roles="resident", **HOME)
        member = make_resident(
            email="member@example.com", full_name="Old Name", roles="resident", household_head_id=head.id, **HOME,
        )

        renamed = self.edit(user, member, full_name="New Name", street_name="Elsewhere", house_number="99")
        promoted = self.edit(user, member, roles=["manager", "resident"])

        assert renamed.status_code == 200
        assert promoted.status_code == 400
        stored = reload(db, member.id)
        assert stored.full_name == "New Name"
        assert (stored.street_name, stored.house_number) == ("Hoofdstraat", "12")
        assert stored.roles == "resident"


class TestTheLastManager:
    """There must always be somebody who can manage."""

    def test_the_only_manager_cannot_remove_the_manager_role_from_themselves(self, user, me, db):
        response = user.put(f"/residents/{me.id}", json={"full_name": "Me", "roles": ["resident"], **HOME})

        assert response.status_code == 409
        assert "at least one manager" in response.json()["detail"]
        assert reload(db, me.id).roles == "manager,resident"

    def test_a_manager_can_step_down_when_another_active_manager_remains(self, user, me, make_resident, db):
        make_resident(email="other@example.com", roles="manager")

        response = user.put(f"/residents/{me.id}", json={"full_name": "Me", "roles": ["resident"], **HOME})

        assert response.status_code == 200
        assert reload(db, me.id).roles == "resident"

    def test_a_manager_who_has_not_activated_yet_does_not_count(self, user, me, make_resident, db):
        make_resident(email="invited@example.com", roles="manager", status=ResidentStatus.INVITED)

        response = user.put(f"/residents/{me.id}", json={"full_name": "Me", "roles": ["resident"], **HOME})

        assert response.status_code == 409
        assert reload(db, me.id).roles == "manager,resident"

    def test_the_last_manager_can_still_change_other_things(self, user, me, db):
        response = user.put(f"/residents/{me.id}", json={"full_name": "New Name", "roles": ["manager", "resident"], **HOME})

        assert response.status_code == 200
        assert reload(db, me.id).full_name == "New Name"

    def test_the_last_manager_who_is_not_a_resident_stays_a_manager(self, login_as, make_resident):
        boss = make_resident(email="boss@example.com", roles="manager")

        response = login_as(boss).put(f"/residents/{boss.id}", json={"full_name": "Boss", "roles": ["resident"], **HOME})

        assert response.status_code == 409

    def test_a_manager_can_take_the_role_from_another_manager_while_one_remains(self, user, me, make_resident, db):
        other = make_resident(email="other@example.com", roles="manager,resident", street_name="Hoofdstraat", house_number="12")

        response = user.put(f"/residents/{other.id}", json={"full_name": "Other", "roles": ["resident"], **HOME})

        assert response.status_code == 200
        assert reload(db, other.id).roles == "resident"


class TestHouseholdMembers:
    def head(self, make_resident, **extra):
        return make_resident(
            email="head@example.com", full_name="Head", roles="resident",
            **HOME, house_number_suffix="A", **extra,
        )

    def test_a_resident_invites_a_household_member_at_their_own_address(self, login_as, make_resident, db, outbox):
        head = self.head(make_resident)

        response = login_as(head).post("/residents/household-members", json={"full_name": "Bob", "email": "bob@example.com"})

        assert response.status_code == 200
        body = response.json()
        assert body["roles"] == ["resident"]
        assert body["household_head_id"] == head.id
        assert (body["street_name"], body["house_number"], body["house_number_suffix"], body["zip_code"], body["city"]) == ("Hoofdstraat", "12", "A", "1234 AB", "Utrecht")
        assert body["status"] == "invited"
        stored = db.query(Resident).filter_by(email="bob@example.com").one()
        assert stored.invite_token
        assert [mail["recipient"] for mail in outbox] == ["bob@example.com"]
        assert f"{INVITE_URL}/activate?token={stored.invite_token}" in outbox[0]["body"]

    def test_the_address_cannot_be_chosen_by_the_resident(self, login_as, make_resident):
        head = self.head(make_resident)

        response = login_as(head).post("/residents/household-members", json={
            "full_name": "Bob", "email": "bob@example.com", "street_name": "Elsewhere", "house_number": "99", "roles": ["manager"],
        })

        assert response.status_code == 200
        assert response.json()["street_name"] == "Hoofdstraat"
        assert response.json()["roles"] == ["resident"]

    def test_a_manager_who_is_also_a_resident_can_invite_their_household(self, user, me, db):
        me.street_name, me.house_number, me.zip_code, me.city = "Hoofdstraat", "12", "1234 AB", "Utrecht"
        db.commit()

        response = user.post("/residents/household-members", json={"full_name": "Bob", "email": "bob@example.com"})

        assert response.status_code == 200
        assert response.json()["household_head_id"] == me.id

    def test_a_manager_who_is_not_a_resident_has_no_household(self, login_as, make_resident):
        boss = login_as(make_resident(email="boss@example.com", roles="manager"))

        assert boss.post("/residents/household-members", json={"full_name": "Bob", "email": "bob@example.com"}).status_code == 403
        assert boss.get("/residents/household-members").status_code == 403

    def test_a_household_member_cannot_invite_others(self, login_as, make_resident, outbox):
        head = self.head(make_resident)
        member = make_resident(
            email="member@example.com", roles="resident", household_head_id=head.id,
            street_name="Hoofdstraat", house_number="12", house_number_suffix="A",
        )

        response = login_as(member).post("/residents/household-members", json={"full_name": "Eve", "email": "eve@example.com"})

        assert response.status_code == 403
        assert outbox == []

    def test_a_resident_without_a_known_address_cannot_invite_yet(self, login_as, make_resident, outbox):
        resident = login_as(make_resident(email="head@example.com", roles="resident"))

        response = resident.post("/residents/household-members", json={"full_name": "Bob", "email": "bob@example.com"})

        assert response.status_code == 400
        assert outbox == []

    def test_the_email_must_be_unique(self, login_as, make_resident, outbox):
        head = self.head(make_resident)
        make_resident(email="bob@example.com")

        response = login_as(head).post("/residents/household-members", json={"full_name": "Bob", "email": "bob@example.com"})

        assert response.status_code == 400
        assert outbox == []

    def test_the_member_is_created_even_when_the_mail_fails(self, login_as, make_resident, db, monkeypatch):
        head = self.head(make_resident)

        class BrokenSender:
            def send_email(self, **_):
                raise RuntimeError("SES is down")

        monkeypatch.setattr(invite, "SESEmailSender", BrokenSender)

        response = login_as(head).post("/residents/household-members", json={"full_name": "Bob", "email": "bob@example.com"})

        assert response.status_code == 200
        assert db.query(Resident).filter_by(email="bob@example.com").count() == 1

    def test_a_name_and_an_email_are_needed(self, login_as, make_resident):
        head = login_as(self.head(make_resident))

        assert head.post("/residents/household-members", json={"email": "bob@example.com"}).status_code == 422
        assert head.post("/residents/household-members", json={"full_name": "Bob"}).status_code == 422

    def test_a_resident_sees_only_their_own_household(self, login_as, make_resident):
        head = self.head(make_resident)
        other = make_resident(email="other@example.com", roles="resident", street_name="Kerkstraat", house_number="3")
        make_resident(email="bob@example.com", full_name="Bob", roles="resident", household_head_id=head.id, street_name="Hoofdstraat", house_number="12")
        make_resident(email="eve@example.com", full_name="Eve", roles="resident", household_head_id=other.id, street_name="Kerkstraat", house_number="3")

        members = login_as(head).get("/residents/household-members").json()

        assert [member["email"] for member in members] == ["bob@example.com"]

    def test_a_household_member_activates_like_anybody_and_can_then_charge(self, login_as, client, make_resident, db):
        head = self.head(make_resident)
        login_as(head).post("/residents/household-members", json={"full_name": "Bob", "email": "bob@example.com"})
        token = db.query(Resident).filter_by(email="bob@example.com").one().invite_token

        activated = client.post(f"/residents/activate/{token}")

        assert activated.status_code == 200
        assert reload(db, db.query(Resident).filter_by(email="bob@example.com").one().id).status == ResidentStatus.ACTIVE


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
