"""Charging profiles that management can define."""


def create(user, name="Night limit", max_current=16.0):
    return user.post("/charging-profiles/", json={"name": name, "profile_type": "max_current", "max_current": max_current})


class TestAccess:
    def test_need_a_login(self, client):
        assert client.get("/charging-profiles/").status_code == 401
        assert client.post("/charging-profiles/", json={"name": "x", "profile_type": "max_current", "max_current": 1}).status_code == 401
        assert client.get("/charging-profiles/types/available").status_code == 401


class TestCreating:
    def test_a_new_profile_is_a_draft(self, user):
        response = create(user)

        assert response.status_code == 200, response.text
        profile = response.json()
        assert profile["name"] == "Night limit"
        assert profile["profile_type"] == "max_current"
        assert profile["max_current"] == 16.0
        assert profile["status"] == "Draft"

    def test_unknown_type_is_refused(self, user):
        response = user.post("/charging-profiles/", json={"name": "x", "profile_type": "teleport", "max_current": 1})

        assert response.status_code == 400

    def test_max_current_is_required_for_a_max_current_profile(self, user):
        response = user.post("/charging-profiles/", json={"name": "x", "profile_type": "max_current"})

        assert response.status_code == 400

    def test_profiles_get_their_own_id(self, user):
        first = create(user, "A").json()
        second = create(user, "B").json()

        assert isinstance(first["id"], int) and isinstance(second["id"], int)
        assert first["id"] != second["id"]


class TestReading:
    def test_list_and_get(self, user):
        created = create(user).json()

        assert [profile["name"] for profile in user.get("/charging-profiles/").json()] == ["Night limit"]
        assert user.get(f"/charging-profiles/{created['id']}").json()["name"] == "Night limit"

    def test_unknown_profile(self, user):
        assert user.get("/charging-profiles/9999").status_code == 404

    def test_available_types(self, user):
        types = user.get("/charging-profiles/types/available").json()["profile_types"]

        assert [(kind["value"], kind["fields"]) for kind in types] == [("max_current", ["max_current"])]


class TestChanging:
    def test_update_name_and_current(self, user):
        created = create(user).json()

        response = user.put(f"/charging-profiles/{created['id']}", json={"name": "Day limit", "max_current": 25.0})

        assert response.status_code == 200
        assert (response.json()["name"], response.json()["max_current"]) == ("Day limit", 25.0)
        assert response.json()["profile_type"] == "max_current"

    def test_update_with_an_unknown_status(self, user):
        created = create(user).json()

        assert user.put(f"/charging-profiles/{created['id']}", json={"status": "Paused"}).status_code == 400

    def test_update_of_an_unknown_profile(self, user):
        assert user.put("/charging-profiles/9999", json={"name": "x"}).status_code == 404

    def test_inactivate_and_reactivate(self, user):
        created = create(user).json()

        inactivated = user.put(f"/charging-profiles/{created['id']}/inactivate")
        assert inactivated.status_code == 200
        assert user.get(f"/charging-profiles/{created['id']}").json()["status"] == "Inactive"

        reactivated = user.put(f"/charging-profiles/{created['id']}/reactivate")
        assert reactivated.status_code == 200
        # Reactivating makes a profile a draft again, it does not make it active.
        assert user.get(f"/charging-profiles/{created['id']}").json()["status"] == "Draft"

    def test_inactivate_and_reactivate_unknown_profile(self, user):
        assert user.put("/charging-profiles/9999/inactivate").status_code == 404
        assert user.put("/charging-profiles/9999/reactivate").status_code == 404
