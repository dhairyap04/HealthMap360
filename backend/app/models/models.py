from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .base import Base


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (
        CheckConstraint("latitude >= -90 AND latitude <= 90", name="latitude_range"),
        CheckConstraint("longitude >= -180 AND longitude <= 180", name="longitude_range"),
        CheckConstraint("population IS NULL OR population >= 0", name="population_nonnegative"),
    )
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    name_key = Column(String(200), unique=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    population = Column(Integer)
    administrative_level = Column(String(100))
    country_code = Column(String(2))
    region_code = Column(String(6))

    @property
    def geographic_scope(self):
        from app.services.geography import scope_for

        return scope_for(self.administrative_level)

    cases = relationship("Case", back_populates="location")


class Case(Base):
    __tablename__ = "cases"
    __table_args__ = (
        UniqueConstraint("location_id", "date", "disease", name="uq_case_observation"),
        CheckConstraint("case_count >= 0", name="case_count_nonnegative"),
        CheckConstraint("reporting_period_days IN (1, 7)", name="case_reporting_period"),
        CheckConstraint("severity IN ('unassessed', 'low', 'medium', 'high', 'critical')", name="case_severity"),
    )
    id = Column(Integer, primary_key=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False, index=True)
    date = Column(Date, index=True, nullable=False)
    disease = Column(String(120), index=True, nullable=False)
    case_count = Column(Integer, nullable=False)
    severity = Column(String(20), nullable=False)
    source = Column(String(300))
    quality_status = Column(String(20), nullable=False, default="valid", server_default="valid")
    provenance = Column(String(20), nullable=False, default="unverified", server_default="unverified")
    version = Column(Integer, nullable=False, default=1, server_default="1")
    reporting_period_days = Column(Integer, nullable=False, default=1, server_default="1")
    outbreak_id = Column(Integer, ForeignKey("outbreaks.id", ondelete="SET NULL"), index=True)
    feed_id = Column(Integer, ForeignKey("feeds.id", ondelete="SET NULL"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    location = relationship("Location", back_populates="cases")


class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (CheckConstraint("quantity >= 0", name="resource_nonnegative"),)
    id = Column(Integer, primary_key=True)
    type = Column(String(120), nullable=False)
    quantity = Column(Integer, nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    allocated_date = Column(Date)
    location = relationship("Location")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('public', 'analyst', 'admin')", name="user_role"),)
    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, index=True, nullable=False)
    email = Column(String(254), unique=True, nullable=False)
    role = Column(String(20), nullable=False, default="public")
    hashed_password = Column(String, nullable=False)
    token_version = Column(Integer, nullable=False, default=0, server_default="0")
    mfa_secret = Column(Text)
    mfa_pending = Column(Text)
    mfa_last_step = Column(Integer, nullable=False, default=-1, server_default="-1")

    @property
    def mfa_enabled(self):
        return bool(self.mfa_secret)

    @property
    def mfa_required(self):
        from app.core.config import get_settings

        return self.role == "admin" and get_settings().require_admin_mfa and not self.mfa_secret

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ImportBatch(Base):
    __tablename__ = "imports"
    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    imported = Column(Integer, nullable=False)
    skipped = Column(Integer, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user = relationship("User")


outbreak_locations = Table(
    "outbreak_locations",
    Base.metadata,
    Column("outbreak_id", Integer, ForeignKey("outbreaks.id", ondelete="CASCADE"), primary_key=True),
    Column("location_id", Integer, ForeignKey("locations.id"), primary_key=True),
)


class Outbreak(Base):
    __tablename__ = "outbreaks"
    __table_args__ = (
        CheckConstraint("status IN ('investigating','active','contained','closed')", name="outbreak_status"),
        CheckConstraint("priority IN ('low','medium','high','critical')", name="outbreak_priority"),
        CheckConstraint("ended_on IS NULL OR ended_on >= started_on", name="outbreak_dates"),
    )
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    disease = Column(String(120), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="investigating")
    priority = Column(String(20), nullable=False, default="medium")
    started_on = Column(Date, nullable=False)
    ended_on = Column(Date)
    description = Column(Text, nullable=False, default="")
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    locations = relationship("Location", secondary=outbreak_locations)
    owner = relationship("User")


class OutbreakUpdate(Base):
    __tablename__ = "outbreak_updates"
    id = Column(Integer, primary_key=True)
    outbreak_id = Column(Integer, ForeignKey("outbreaks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    kind = Column(String(30), nullable=False, default="note")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user = relationship("User")


class AlertRule(Base):
    __tablename__ = "alert_rules"
    __table_args__ = (
        CheckConstraint("threshold >= 1", name="alert_threshold"),
        CheckConstraint("window_days BETWEEN 1 AND 90", name="alert_window"),
        CheckConstraint("severity IN ('low','medium','high','critical')", name="alert_severity"),
    )
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    disease = Column(String(120))
    location_id = Column(Integer, ForeignKey("locations.id"))
    threshold = Column(Integer, nullable=False)
    window_days = Column(Integer, nullable=False, default=7)
    severity = Column(String(20), nullable=False, default="medium")
    enabled = Column(Boolean, nullable=False, default=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    geographic_scope = Column(String(20), nullable=False, default="local", server_default="local")
    location = relationship("Location")


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (CheckConstraint("status IN ('open','acknowledged','resolved')", name="alert_status"),)
    id = Column(Integer, primary_key=True)
    outbreak_id = Column(Integer, ForeignKey("outbreaks.id"))
    is_historical = Column(Boolean, nullable=False, default=False, server_default="false")
    data_state = Column(String(30), nullable=False, default="unknown", server_default="unknown")
    latest_report_date = Column(Date)
    rule_id = Column(Integer, ForeignKey("alert_rules.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    disease = Column(String(120), nullable=False)
    rule_name = Column(String(160), nullable=False)
    severity = Column(String(20), nullable=False)
    value = Column(Integer, nullable=False)
    threshold = Column(Integer, nullable=False)
    window_start = Column(Date, nullable=False)
    window_end = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="open")
    resolution = Column(String(300))
    acknowledged_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    location = relationship("Location")


class Feed(Base):
    __tablename__ = "feeds"
    __table_args__ = (UniqueConstraint("provider", "country_code", name="uq_feed_country"),)
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    provider = Column(String(40), nullable=False)
    country_code = Column(String(2), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    severity = Column(String(20), nullable=False, default="unassessed")
    start_date = Column(Date, nullable=False)
    interval_minutes = Column(Integer, nullable=False, default=1440)
    enabled = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    next_sync_at = Column(DateTime(timezone=True))
    lease_until = Column(DateTime(timezone=True))
    last_synced_at = Column(DateTime(timezone=True))
    last_error = Column(String(600))
    location = relationship("Location")


class FeedRun(Base):
    __tablename__ = "feed_runs"
    id = Column(Integer, primary_key=True)
    feed_id = Column(Integer, ForeignKey("feeds.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False)
    imported = Column(Integer, nullable=False, default=0)
    updated = Column(Integer, nullable=False, default=0)
    skipped = Column(Integer, nullable=False, default=0)
    latest_report_date = Column(Date)
    message = Column(String(1000), nullable=False, default="")
    started_at = Column(DateTime(timezone=True), nullable=False)
    finished_at = Column(DateTime(timezone=True))


class CaseRevision(Base):
    __tablename__ = "case_revisions"
    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="SET NULL"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    feed_id = Column(Integer, ForeignKey("feeds.id"))
    action = Column(String(30), nullable=False)
    before = Column(JSON)
    after = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeat"
    id = Column(String(30), primary_key=True)
    last_tick_at = Column(DateTime(timezone=True), nullable=False)


class AlertEvaluation(Base):
    __tablename__ = "alert_evaluations"
    __table_args__ = (
        UniqueConstraint("rule_id", "location_id", "disease", "as_of", "is_historical", name="uq_signal_day"),
    )
    id = Column(Integer, primary_key=True)
    rule_id = Column(Integer, ForeignKey("alert_rules.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    disease = Column(String(120), nullable=False)
    as_of = Column(Date, nullable=False)
    is_historical = Column(Boolean, nullable=False)
    state = Column(String(30), nullable=False)
    value = Column(Integer)
    threshold = Column(Integer, nullable=False)
    window_start = Column(Date, nullable=False)
    latest_report_date = Column(Date)
    complete = Column(Boolean, nullable=False)
    periods = Column(JSON, nullable=False)
    incident_id = Column(Integer, ForeignKey("alerts.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Publication(Base):
    __tablename__ = "publications"
    id = Column(Integer, primary_key=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False, index=True)
    outbreak_id = Column(Integer, ForeignKey("outbreaks.id"))
    disease = Column(String(120), nullable=False)
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    title = Column(String(200), nullable=False)
    public_name = Column(String(200), nullable=False)
    summary = Column(Text, nullable=False)
    methodology = Column(Text, nullable=False)
    source_name = Column(String(200), nullable=False)
    source_url = Column(String(500), nullable=False)
    suppression_threshold = Column(Integer, nullable=False, default=5)
    payload = Column(JSON, nullable=False)
    fingerprint = Column(String(64), nullable=False)
    status = Column(String(20), nullable=False, default="draft")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    published_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    published_at = Column(DateTime(timezone=True))


class PublicationEvent(Base):
    __tablename__ = "publication_events"
    id = Column(Integer, primary_key=True)
    publication_id = Column(Integer, ForeignKey("publications.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(30), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RateBucket(Base):
    __tablename__ = "rate_buckets"
    id = Column(String(64), primary_key=True)
    count = Column(Integer, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)


class RecoveryToken(Base):
    __tablename__ = "recovery_tokens"
    digest = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, nullable=False, default=False)
