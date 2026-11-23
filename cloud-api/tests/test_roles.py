"""Who may use what: the management endpoints need the manager role, what a resident uses does not."""
import pytest

from models import Role, format_roles, parse_roles

MANAGEMENT_ENDPOINTS = [
    ("GET", "/residents/"),
    ("GET", "/residents/address-options"),
    ("GET", "/cards/"),
    ("GET", "/charge-transactions/all"),
    ("GET", "/power-logs/"),
    ("GET", "/power-logs/analytics"),
    ("GET", "/stations/"),
    ("GET", "/charging-costs/"),
    ("POST", "/charging-costs/"),
    ("GET", "/charging-profiles/"),
    ("GET", "/charging-profiles/types/available"),
    ("POST", "/charging-profiles/"),
    ("PUT", "/charging-profiles/1"),
    ("PUT", "/charging-profiles/1/inactivate"),
    ("PUT", "/charging-profiles/1/reactivate"),
]

# What the resident portal calls. Not for managers only: a resident who is not a manager uses them.
RESIDENT_ENDPOINTS = [
    ("GET", "/auth/validate"),
    ("GET", "/cards/my_cards"),
    ("GET", "/cards/refused"),
    ("GET", "/charge-transactions/my-transactions"),
    ("GET", "/charging-costs/active"),
]


@pytest.mark.parametrize("method,path", MANAGEMENT_ENDPOINTS)
def test_management_endpoints_refuse_a_resident_who_is_not_a_manager(login_as, make_resident, method, path):
    resident = login_as(make_resident(email="anna@example.com", roles="resident"))

    response = resident.request(method, path, json={})

    assert response.status_code == 403, f"{method} {path}"


@pytest.mark.parametrize("method,path", MANAGEMENT_ENDPOINTS)
def test_management_endpoints_refuse_an_account_without_roles(login_as, make_resident, method, path):
    nobody = login_as(make_resident(email="nobody@example.com", roles=""))

    assert nobody.request(method, path, json={}).status_code == 403, f"{method} {path}"


@pytest.mark.parametrize("method,path", MANAGEMENT_ENDPOINTS)
def test_management_endpoints_let_a_manager_in(login_as, make_resident, method, path):
    manager = login_as(make_resident(email="boss@example.com", roles="manager"))

    # Whatever the endpoint answers (not found, invalid body), the role is not what stops the request.
    assert manager.request(method, path, json={}).status_code != 403, f"{method} {path}"


@pytest.mark.parametrize("method,path", RESIDENT_ENDPOINTS)
@pytest.mark.parametrize("roles", ["resident", "manager", "manager,resident"])
def test_the_endpoints_of_the_resident_portal_work_for_every_role(login_as, make_resident, method, path, roles):
    account = login_as(make_resident(email="anna@example.com", roles=roles))

    assert account.request(method, path).status_code != 403, f"{method} {path}"


class TestRoleStorage:
    def test_roles_are_stored_validated_sorted_and_without_duplicates(self):
        assert format_roles(["resident", "manager", "resident"]) == "manager,resident"
        assert format_roles([Role.RESIDENT]) == "resident"
        assert format_roles([]) == ""

    def test_an_unknown_role_is_not_stored(self):
        with pytest.raises(ValueError):
            format_roles(["resident", "admin"])

    def test_reading_a_stored_value(self):
        assert parse_roles("manager,resident") == ["manager", "resident"]
        assert parse_roles("") == []
        assert parse_roles(None) == []

    def test_a_role_is_matched_as_a_whole_name_in_a_query(self, db, make_resident):
        from models import Resident

        make_resident(email="a@example.com", roles="manager,resident")
        make_resident(email="b@example.com", roles="non_resident")  # contains "resident", is not it
        make_resident(email="c@example.com", roles="resident")
        make_resident(email="d@example.com", roles="")

        found = {resident.email for resident in db.query(Resident).filter(Resident.has_role_sql(Role.RESIDENT))}

        assert found == {"a@example.com", "c@example.com"}
