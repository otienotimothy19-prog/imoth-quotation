import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Client(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "clients"

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    id_or_passport: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    phone: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="client")


class Vehicle(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "vehicles"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    registration_no: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    year_of_manufacture: Mapped[int | None] = mapped_column(Integer, nullable=True)
    age_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    make: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    client: Mapped["Client"] = relationship(back_populates="vehicles")
