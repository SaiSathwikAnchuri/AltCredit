"""MySQL access helpers (PyMySQL, one connection per request/thread).

AltCredit's database is MySQL. This module is a thin, deliberately small shim so
the rest of the codebase — which was written against sqlite3's ``con.execute(sql,
params)`` / ``?`` placeholder / ``sqlite3.Row`` style — needed no changes beyond
this file and schema.sql: ``MySQLConnection.execute()`` translates ``?`` -> ``%s``
and every ``MySQLCursor`` fetch returns a ``Row`` that supports both positional
(``row[0]``) and mapping (``row["col"]`` / ``dict(row)``) access, same as
``sqlite3.Row``.
"""
from __future__ import annotations

import json
import re
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import pymysql
import pymysql.cursors

from app.config import settings

SCHEMA = Path(__file__).with_name("schema.sql")
_local = threading.local()

_PLACEHOLDER = re.compile(r"\?")
# SQLite -> MySQL statement rewrites that show up in this codebase's raw SQL.
_REWRITES = [
    (re.compile(r"\bINSERT OR REPLACE INTO\b", re.IGNORECASE), "REPLACE INTO"),
    (re.compile(r"\bINSERT OR IGNORE INTO\b", re.IGNORECASE), "INSERT IGNORE INTO"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _translate(sql: str) -> str:
    for pattern, repl in _REWRITES:
        sql = pattern.sub(repl, sql)
    return _PLACEHOLDER.sub("%s", sql)


class Row:
    """Mapping- and sequence-style row, matching sqlite3.Row's dual access."""
    __slots__ = ("_cols", "_vals")

    def __init__(self, cols: list[str], vals: tuple):
        self._cols = cols
        self._vals = vals

    def keys(self):
        return self._cols

    def __getitem__(self, key):
        if isinstance(key, (int, slice)):
            return self._vals[key]
        return self._vals[self._cols.index(key)]

    def __iter__(self):
        return iter(self._vals)

    def __len__(self):
        return len(self._vals)

    def __repr__(self):
        return f"Row({dict(self)!r})"


class MySQLCursor:
    """Wraps a pymysql cursor so fetches return Row objects (sqlite3.Row-like)."""

    def __init__(self, raw):
        self._raw = raw
        self._cols = [d[0] for d in raw.description] if raw.description else []

    @property
    def lastrowid(self):
        return self._raw.lastrowid

    @property
    def rowcount(self):
        return self._raw.rowcount

    def fetchone(self):
        r = self._raw.fetchone()
        return Row(self._cols, r) if r is not None else None

    def fetchall(self):
        return [Row(self._cols, r) for r in self._raw.fetchall()]

    @property
    def columns(self):
        return list(self._cols)


class MySQLConnection:
    """Drop-in replacement for the sqlite3.Connection surface this app uses."""

    def __init__(self, raw: pymysql.connections.Connection):
        self._raw = raw

    def execute(self, sql: str, params=()) -> MySQLCursor:
        cur = self._raw.cursor()
        cur.execute(_translate(sql), tuple(params) if params else None)
        return MySQLCursor(cur)

    def executemany(self, sql: str, seq_of_params) -> MySQLCursor:
        cur = self._raw.cursor()
        cur.executemany(_translate(sql), [tuple(p) for p in seq_of_params])
        return MySQLCursor(cur)

    def executescript(self, script: str):
        cur = self._raw.cursor()
        for stmt in _split_statements(script):
            try:
                cur.execute(stmt)
            except pymysql.err.OperationalError as e:
                # 1061 = duplicate key/index name: fine on a re-run of the schema.
                if e.args and e.args[0] == 1061:
                    continue
                raise

    def commit(self):
        self._raw.commit()

    def rollback(self):
        self._raw.rollback()

    def close(self):
        self._raw.close()


def _split_statements(script: str) -> list[str]:
    """Split schema.sql on statement-terminating ';' (no strings contain ';' here).

    Each chunk may have full-line '--' comments mixed in with the SQL (e.g. a
    comment line directly above a CREATE TABLE, both before the next ';'), so
    comment lines are stripped out line-by-line rather than only checking
    whether the whole chunk starts with '--' (which previously caused
    comment-prefixed statements, such as the scores table, to be skipped
    entirely).
    """
    out = []
    for chunk in script.split(";"):
        stmt = "\n".join(line for line in chunk.splitlines() if not line.strip().startswith("--")).strip()
        if stmt:
            out.append(stmt)
    return out


def connect() -> MySQLConnection:
    raw = pymysql.connect(
        host=settings.mysql_host, port=settings.mysql_port,
        user=settings.mysql_user, password=settings.mysql_password, database=settings.mysql_db,
        charset="utf8mb4", autocommit=False,
    )
    return MySQLConnection(raw)


def get_conn() -> MySQLConnection:
    """Thread-local connection for the API process."""
    con = getattr(_local, "con", None)
    if con is None:
        con = connect()
        _local.con = con
    else:
        try:
            con._raw.ping(reconnect=True)
        except Exception:
            con = connect()
            _local.con = con
    return con


def init_schema(con: MySQLConnection):
    con.executescript(SCHEMA.read_text())
    con.commit()


_ALL_TABLES = [
    "reveals", "audit_logs", "auth_accounts", "counterfactual_requests", "bank_applications", "offer_events",
    "offers", "campaigns", "ml_predictions", "score_factors", "scores", "simulator_events", "historical_offers",
    "historical_applications", "products", "lenders", "life_events", "card_statements", "credit_accounts",
    "obligations", "transactions", "residence_spells", "employment_spells", "contacts", "users",
    "ingestion_errors", "ingestion_runs",
]


def drop_all(con: MySQLConnection):
    """Drop every AltCredit table (the MySQL equivalent of deleting the old .db file
    for a from-scratch reseed). No-op for tables that don't exist yet."""
    cur = con._raw.cursor()
    cur.execute("SET FOREIGN_KEY_CHECKS=0")
    for t in _ALL_TABLES:
        cur.execute(f"DROP TABLE IF EXISTS `{t}`")
    cur.execute("SET FOREIGN_KEY_CHECKS=1")
    con.commit()


@contextmanager
def tx(con: MySQLConnection):
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise


def rows(con, sql, params=()) -> list[dict]:
    return [dict(r) for r in con.execute(sql, params).fetchall()]


def df(con, sql, params=()):
    """pandas.DataFrame for a query, without going through pandas.read_sql_query
    (which only special-cases sqlite3.Connection directly for a raw DB-API
    connection like ours; everything else needs an unnecessary SQLAlchemy hop)."""
    import pandas as pd
    cur = con.execute(sql, params)
    cols = cur.columns
    data = [list(r) for r in cur.fetchall()]
    return pd.DataFrame(data, columns=cols)


def one(con, sql, params=()) -> dict | None:
    r = con.execute(sql, params).fetchone()
    return dict(r) if r else None


def audit(con, action: str, actor: str | None = None, entity: str | None = None, entity_id: str | None = None,
          detail: dict | None = None, rule_version: str | None = None, model_version: str | None = None):
    con.execute("INSERT INTO audit_logs (ts, actor, action, entity, entity_id, rule_version, model_version, detail_json) VALUES (?,?,?,?,?,?,?,?)",
                (now_iso(), actor, action, entity, entity_id, rule_version, model_version, json.dumps(detail or {}, default=str)))
