from sqlalchemy import CheckConstraint, Column, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
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
    cases = relationship("Case", back_populates="location")


class Case(Base):
    __tablename__ = "cases"
    __table_args__ = (
        UniqueConstraint("location_id", "date", "disease", name="uq_case_observation"),
        CheckConstraint("case_count >= 0", name="case_count_nonnegative"),
        CheckConstraint("severity IN ('low', 'medium', 'high', 'critical')", name="case_severity"),
    )
    id = Column(Integer, primary_key=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False, index=True)
    date = Column(Date, index=True, nullable=False)
    disease = Column(String(120), index=True, nullable=False)
    case_count = Column(Integer, nullable=False)
    severity = Column(String(20), nullable=False)
    source = Column(String(300))
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
