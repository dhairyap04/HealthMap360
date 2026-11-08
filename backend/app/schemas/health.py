from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Severity = Literal["low", "medium", "high", "critical"]
Assessment = Literal["unassessed", "low", "medium", "high", "critical"]


class LocationInput(BaseModel):
    name: Text
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    population: int | None = Field(default=None, ge=0, le=2147483647)
    administrative_level: str | None = Field(default=None, max_length=100)
    country_code: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    region_code: str | None = Field(default=None, pattern=r"^[A-Z]{2}-[A-Z0-9]{1,3}$")

    @model_validator(mode="after")
    def region_matches_country(self):
        if self.region_code and self.country_code and not self.region_code.startswith(self.country_code + "-"):
            raise ValueError("Region identifier must belong to the selected country")
        return self

    @field_validator("name")
    @classmethod
    def normalized_name(cls, value):
        value = " ".join(value.split())
        if not value or len(value.casefold()) > 200:
            raise ValueError("Location must be 200 characters or fewer after normalization")
        return value


class LocationOut(LocationInput):
    geographic_scope: str
    model_config = ConfigDict(from_attributes=True)
    id: int


class CaseInput(BaseModel):
    metric: Literal["reported_cases"] = Field(default="reported_cases", exclude=True)
    location_id: int = Field(gt=0)
    date: date
    disease: str = Field(min_length=1, max_length=120)
    case_count: int = Field(ge=0, le=2147483647)
    severity: Assessment = "unassessed"
    source: str | None = Field(default=None, max_length=300)
    reporting_period_days: Literal[1, 7] = 1

    @field_validator("disease")
    @classmethod
    def normalize_disease(cls, value):
        value = " ".join(value.split()).lower()
        if not value or len(value) > 120:
            raise ValueError("Disease is required and must be 120 characters or fewer after normalization")
        return value


class CaseOut(CaseInput):
    model_config = ConfigDict(from_attributes=True)
    id: int
    quality_status: str
    provenance: str
    version: int
    location: LocationOut
    outbreak_id: int | None = None
    feed_id: int | None = None


class ResourceInput(BaseModel):
    type: str = Field(min_length=1, max_length=120)
    quantity: int = Field(ge=0, le=2147483647)
    location_id: int | None = Field(default=None, gt=0)
    allocated_date: date | None = None

    @field_validator("type")
    @classmethod
    def resource_type(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Resource type is required")
        return value


class ResourceOut(ResourceInput):
    model_config = ConfigDict(from_attributes=True)
    id: int
    location: LocationOut | None
