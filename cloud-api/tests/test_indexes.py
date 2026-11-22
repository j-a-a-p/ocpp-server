"""The frequent queries use an index instead of reading the whole table (migrations V13 and V14)."""
import sqlite3

import pytest

from conftest import migration_files


@pytest.fixture
def connection(tmp_path):
    connection = sqlite3.connect(tmp_path / "cloud.db")
    for migration in migration_files():
        connection.executescript(migration.read_text())
    yield connection
    connection.close()


def plan(connection: sqlite3.Connection, query: str) -> str:
    return " | ".join(row[3] for row in connection.execute("EXPLAIN QUERY PLAN " + query))


@pytest.mark.parametrize("query, index", [
    ("SELECT * FROM power_logs ORDER BY created DESC LIMIT 100", "idx_power_logs_created"),
    ("SELECT * FROM power_logs WHERE charge_transaction_id IN (1, 2) ORDER BY charge_transaction_id, created", "idx_power_logs_transaction_created"),
    ("SELECT * FROM power_logs WHERE charge_transaction_id = 1 ORDER BY id DESC LIMIT 1", "idx_power_logs_transaction_created"),
    ("SELECT * FROM charge_transactions ORDER BY created DESC", "idx_charge_transactions_created"),
    ("SELECT * FROM cards WHERE resident_id = 1", "idx_cards_resident_id"),
    ("SELECT * FROM refused_cards WHERE station_id = 'CP1' ORDER BY created DESC LIMIT 1", "idx_refused_cards_station_created"),
    ("SELECT * FROM station_connections WHERE station_id = 'CP1' ORDER BY connected_at", "idx_station_connections_station_connected"),
])
def test_query_uses_index(connection, query, index):
    assert index in plan(connection, query)


def test_the_power_log_analytics_read_only_the_logs_of_the_period_by_index(connection):
    from power_log_analytics import LOGS_SINCE

    query_plan = plan(connection, LOGS_SINCE.text.replace(":since", "'2024-01-01 00:00:00'"))

    assert "idx_power_logs_created" in query_plan
    assert "idx_power_logs_transaction_created" in query_plan
