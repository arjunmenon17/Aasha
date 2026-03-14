import logging
import operator as _op
import uuid as _uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

logger = logging.getLogger(__name__)

# --- SQLAlchemy setup (used when DATABASE_URL is set) ---

db_url = settings.DATABASE_URL if hasattr(settings, "DATABASE_URL") else ""
if db_url:
    if db_url.startswith("postgresql://") and not db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    engine = create_async_engine(db_url, echo=False, pool_size=5, max_overflow=10)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
else:
    engine = None
    async_session = None


class Base(DeclarativeBase):
    pass


# --- Supabase REST helpers ---

def _supa_headers() -> dict:
    key = settings.SUPABASE_PUBLISHABLE_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _supa_base() -> str:
    return settings.SUPABASE_URL.rstrip("/") + "/rest/v1"


def _serialize_val(val):
    if val is None:
        return None
    if isinstance(val, _uuid.UUID):
        return str(val)
    if isinstance(val, datetime):
        return val.isoformat()
    return val


def _instance_to_dict(instance) -> dict:
    """Extract column values from a SQLAlchemy ORM instance for REST POST."""
    from sqlalchemy import inspect as sa_inspect
    mapper = sa_inspect(type(instance))
    result = {}
    for ca in mapper.column_attrs:
        col = ca.columns[0]
        val = getattr(instance, ca.key, None)
        # Apply Python-side callable defaults (e.g. datetime.utcnow, gen_uuid)
        if val is None and col.default is not None:
            try:
                arg = col.default.arg
                if callable(arg):
                    val = arg()
                else:
                    val = arg
            except Exception:
                pass
        s = _serialize_val(val)
        if s is not None:
            result[ca.key] = s
    return result


def _coerce_row(model_class, row: dict) -> dict:
    """Coerce Supabase REST string values to proper Python types."""
    from sqlalchemy import inspect as sa_inspect
    try:
        mapper = sa_inspect(model_class)
        col_types = {ca.key: type(ca.columns[0].type).__name__ for ca in mapper.column_attrs}
    except Exception:
        return row

    out = {}
    for k, v in row.items():
        if v is None:
            out[k] = None
            continue
        t = col_types.get(k, "")
        if "UUID" in t and isinstance(v, str):
            try:
                out[k] = _uuid.UUID(v)
            except ValueError:
                out[k] = v
        elif ("DateTime" in t or "TIMESTAMP" in t.upper()) and isinstance(v, str):
            try:
                out[k] = datetime.fromisoformat(v.replace("Z", "+00:00"))
            except ValueError:
                out[k] = v
        else:
            out[k] = v
    return out


def _parse_where(clause) -> dict:
    """Convert a SQLAlchemy WHERE clause to PostgREST query params."""
    params = {}
    if clause is None:
        return params

    # AND/OR clause list
    if hasattr(clause, "clauses"):
        for sub in clause.clauses:
            params.update(_parse_where(sub))
        return params

    # BinaryExpression: col <op> value
    try:
        col_key = clause.left.key
    except AttributeError:
        return params

    right = clause.right
    value = getattr(right, "value", getattr(right, "effective_value", None))
    op = clause.operator
    op_name = getattr(op, "__name__", "") or ""

    if op is _op.eq or op_name == "eq":
        if value is None:
            params[col_key] = "is.null"
        elif isinstance(value, bool):
            params[col_key] = f"eq.{str(value).lower()}"
        else:
            params[col_key] = f"eq.{value}"
    elif op is _op.ne or op_name == "ne":
        params[col_key] = f"neq.{value}"
    elif op_name in ("ge", "gte"):
        params[col_key] = f"gte.{value}"
    elif op_name in ("le", "lte"):
        params[col_key] = f"lte.{value}"

    return params


def _parse_order(order_clauses) -> str:
    """Convert SQLAlchemy ORDER BY clauses to PostgREST order param."""
    parts = []
    for ob in order_clauses:
        try:
            if hasattr(ob, "element"):
                col_key = ob.element.key
                compiled = str(ob.compile(compile_kwargs={"literal_binds": True}))
                is_desc = "DESC" in compiled.upper()
                parts.append(f"{col_key}.{'desc' if is_desc else 'asc'}")
            else:
                parts.append(f"{ob.key}.asc")
        except Exception:
            pass
    return ",".join(parts)


# --- Loaded row proxy ---

class _Row:
    """
    Proxy for a database row loaded via Supabase REST.
    Behaves like a plain Python object with settable attributes.
    Tracks modifications for PATCH on commit.
    """
    __slots__ = ("_sb_table", "_sb_original", "_sb_data")

    def __init__(self, table_name: str, data: dict):
        object.__setattr__(self, "_sb_table", table_name)
        object.__setattr__(self, "_sb_original", dict(data))
        object.__setattr__(self, "_sb_data", dict(data))

    def __getattr__(self, name: str):
        data = object.__getattribute__(self, "_sb_data")
        try:
            return data[name]
        except KeyError:
            raise AttributeError(name)

    def __setattr__(self, name: str, value):
        data = object.__getattribute__(self, "_sb_data")
        data[name] = value

    @property
    def __tablename__(self):
        return object.__getattribute__(self, "_sb_table")


# --- Query result wrappers ---

class _Scalars:
    def __init__(self, instances):
        self._instances = instances

    def all(self):
        return self._instances


class _QueryResult:
    def __init__(self, instances):
        self._instances = instances

    def scalar_one_or_none(self):
        return self._instances[0] if self._instances else None

    def scalars(self):
        return _Scalars(self._instances)


# --- Model registry (lazy to avoid circular imports) ---

_MODEL_REGISTRY: dict = {}


def _get_registry() -> dict:
    global _MODEL_REGISTRY
    if not _MODEL_REGISTRY:
        from app.models.models import (
            Patient, ConversationState, SymptomLog, ClinicalAssessment,
            EscalationEvent, SmsLog, CheckInSchedule, CommunityHealthWorker,
            HealthFacility, HealthZone,
        )
        _MODEL_REGISTRY = {
            "patients": Patient,
            "conversation_state": ConversationState,
            "symptom_logs": SymptomLog,
            "clinical_assessments": ClinicalAssessment,
            "escalation_events": EscalationEvent,
            "sms_log": SmsLog,
            "check_in_schedules": CheckInSchedule,
            "community_health_workers": CommunityHealthWorker,
            "health_facilities": HealthFacility,
            "health_zones": HealthZone,
        }
    return _MODEL_REGISTRY


# --- SupabaseSession ---

class SupabaseSession:
    """
    Drop-in replacement for SQLAlchemy AsyncSession using Supabase REST API.
    Supports SELECT, INSERT (via add+flush), and UPDATE (diff-based PATCH on commit).
    """

    def __init__(self):
        self._pending: list = []   # new ORM instances queued for INSERT
        self._loaded: list = []    # _Row objects loaded from REST, tracked for PATCH

    async def execute(self, stmt):
        froms = list(stmt.froms)
        if not froms:
            return _QueryResult([])

        table_name = froms[0].name
        model_class = _get_registry().get(table_name)

        params: dict = {"select": "*"}

        # WHERE
        where = getattr(stmt, "whereclause", None)
        params.update(_parse_where(where))

        # ORDER BY
        order_str = _parse_order(getattr(stmt, "_order_by_clauses", []))
        if order_str:
            params["order"] = order_str

        # LIMIT
        limit_clause = getattr(stmt, "_limit_clause", None)
        if limit_clause is not None:
            try:
                params["limit"] = str(limit_clause.value)
            except Exception:
                pass

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{_supa_base()}/{table_name}",
                headers=_supa_headers(),
                params=params,
            )
            resp.raise_for_status()
            rows = resp.json()

        instances = []
        for row in rows:
            coerced = _coerce_row(model_class, row) if model_class else row
            r = _Row(table_name, coerced)
            self._loaded.append(r)
            instances.append(r)

        return _QueryResult(instances)

    def add(self, instance):
        """Queue an ORM model instance for INSERT."""
        if getattr(instance, "id", None) is None:
            try:
                instance.id = _uuid.uuid4()
            except Exception:
                pass
        self._pending.append(instance)

    async def flush(self):
        """POST all pending inserts to Supabase REST."""
        for instance in list(self._pending):
            table_name = getattr(type(instance), "__tablename__", None)
            if not table_name:
                continue
            data = _instance_to_dict(instance)
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    f"{_supa_base()}/{table_name}",
                    headers=_supa_headers(),
                    json=data,
                )
                if not resp.is_success:
                    logger.error(f"INSERT {table_name} failed {resp.status_code}: {resp.text}")
                    resp.raise_for_status()
        self._pending.clear()

    async def commit(self):
        """Flush pending inserts, then PATCH any modified loaded rows."""
        await self.flush()

        for row in self._loaded:
            original = object.__getattribute__(row, "_sb_original")
            current = object.__getattribute__(row, "_sb_data")

            diff = {
                k: _serialize_val(v)
                for k, v in current.items()
                if _serialize_val(v) != _serialize_val(original.get(k))
            }

            if diff:
                row_id = current.get("id")
                table_name = object.__getattribute__(row, "_sb_table")
                if row_id:
                    async with httpx.AsyncClient(timeout=20) as client:
                        resp = await client.patch(
                            f"{_supa_base()}/{table_name}",
                            headers={**_supa_headers(), "Prefer": "return=minimal"},
                            params={"id": f"eq.{row_id}"},
                            json=diff,
                        )
                        if not resp.is_success:
                            logger.warning(f"PATCH {table_name}/{row_id} failed: {resp.text}")

        self._loaded.clear()

    async def rollback(self):
        self._pending.clear()
        self._loaded.clear()

    async def close(self):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            await self.rollback()
        else:
            await self.commit()
        await self.close()


# --- Session factory used by escalation_followup ---

class _SupabaseSessionFactory:
    def __call__(self):
        return SupabaseSession()


# --- get_db dependency ---

async def get_db():
    if engine is not None:
        # Direct PostgreSQL via SQLAlchemy
        sa_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with sa_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()
    elif settings.SUPABASE_URL and settings.SUPABASE_PUBLISHABLE_KEY:
        # Supabase REST mode
        session = SupabaseSession()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
    else:
        raise RuntimeError(
            "No database configured. Set DATABASE_URL or SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY."
        )


# Patch async_session for escalation_followup which uses: async with async_session() as db
if async_session is None and settings.SUPABASE_URL and settings.SUPABASE_PUBLISHABLE_KEY:
    async_session = _SupabaseSessionFactory()
