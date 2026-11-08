from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.health import Severity


def disease_name(value):
    if value is None:
        return None
    value = " ".join(value.split()).lower()
    if not value or len(value) > 120:
        raise ValueError("Disease must contain 1 to 120 characters")
    return value


class OutbreakInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    disease: str = Field(min_length=1, max_length=120)
    status: Literal["investigating", "active", "contained", "closed"] = "investigating"
    priority: Severity = "medium"
    started_on: date
    ended_on: date | None = None
    description: str = Field(default="", max_length=10000)
    owner_id: int | None = Field(default=None, gt=0)
    location_ids: list[int] = Field(min_length=1, max_length=100)

    @field_validator("title")
    @classmethod
    def title_text(cls, value):
        if not value.strip():
            raise ValueError("Title is required")
        return value.strip()

    @field_validator("disease")
    @classmethod
    def normalize_disease(cls, value):
        return disease_name(value)

    @model_validator(mode="after")
    def valid_dates(self):
        if self.ended_on and self.ended_on < self.started_on:
            raise ValueError("End date must be on or after start date")
        if self.status == "closed" and not self.ended_on:
            raise ValueError("Closed outbreaks need an end date")
        if len(set(self.location_ids)) != len(self.location_ids) or any(i <= 0 for i in self.location_ids):
            raise ValueError("Choose distinct valid locations")
        return self


class OutbreakNote(BaseModel):
    body: str = Field(min_length=1, max_length=5000)

    @field_validator("body")
    @classmethod
    def meaningful(cls, value):
        if not value.strip():
            raise ValueError("Enter an update")
        return value.strip()


class CaseLinks(BaseModel):
    observation_ids: list[int] = Field(min_length=1, max_length=200)
    action: Literal["attach", "detach"]


class AlertRuleInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    disease: str | None = Field(default=None, max_length=120)
    location_id: int | None = Field(default=None, gt=0)
    threshold: int = Field(ge=1, le=2147483647)
    window_days: int = Field(default=7, ge=1, le=90)
    severity: Severity = "medium"
    enabled: bool = True

    @field_validator("disease")
    @classmethod
    def normalize_disease(cls, value):
        return disease_name(value)

    @field_validator("name")
    @classmethod
    def meaningful(cls, value):
        if not value.strip():
            raise ValueError("Rule name is required")
        return value.strip()


class AlertAction(BaseModel):
    action: Literal["acknowledge", "resolve"]


class FeedInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    provider: Literal["who_covid_weekly"] = "who_covid_weekly"
    country_code: str = Field(pattern=r"^[A-Z]{2}$")
    location_id: int = Field(gt=0)
    severity: Severity = "low"
    start_date: date
    interval_minutes: int = Field(default=1440, ge=60, le=10080)
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def meaningful(cls, value):
        if not value.strip():
            raise ValueError("Feed name is required")
        return value.strip()

    @model_validator(mode="after")
    def valid_date(self):
        if self.start_date > date.today():
            raise ValueError("Start date cannot be in the future")
        return self
