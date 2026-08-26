"""Populate a fresh database with the legacy insurer/rate configuration and
bootstrap the first SUPER_ADMIN user. Idempotent -- safe to re-run; existing
rows (matched by insurer code / motor-class code / user email) are left
untouched rather than duplicated.

Usage:
    python -m app.seed.seed_data
"""
import sys

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.insurer_rate import Insurer, MotorClass, RateBand, RateVersion
from app.models.user import User
from app.models.enums import UserRole
from app.seed.insurers_data import INSURERS
from app.services.rate_config import rate_version_snapshot


def _create_rate_bands(db: Session, motor_class: MotorClass, bands: list[dict], variant: str) -> None:
    for i, b in enumerate(bands):
        db.add(
            RateBand(
                motor_class_id=motor_class.id,
                variant=variant,
                sort_order=i,
                min_si=b["min_si"],
                max_si=b["max_si"],
                rate=b["rate"],
                min_premium=b["min_premium"],
                ep_included=b["ep_included"],
                ep_not_offered=b["ep_not_offered"],
                ep_rate=b["ep_rate"],
                ep_min=b["ep_min"],
                pvt_included=b["pvt_included"],
                pvt_not_offered=b["pvt_not_offered"],
                pvt_rate=b["pvt_rate"],
                pvt_min=b["pvt_min"],
            )
        )


def seed_insurers(db: Session) -> None:
    for insurer_code, insurer_data in INSURERS.items():
        insurer = db.query(Insurer).filter_by(code=insurer_code).one_or_none()
        if insurer is None:
            insurer = Insurer(
                code=insurer_code,
                name=insurer_data["name"],
                disclaimer=insurer_data.get("disclaimer"),
                note=insurer_data.get("note"),
                active=True,
            )
            db.add(insurer)
            db.flush()
            print(f"  + insurer {insurer_code}")
        else:
            print(f"  = insurer {insurer_code} already exists, skipping insurer-level fields")

        for class_code, class_data in insurer_data["classes"].items():
            motor_class = (
                db.query(MotorClass).filter_by(insurer_id=insurer.id, code=class_code).one_or_none()
            )
            if motor_class is not None:
                print(f"    = class {insurer_code}/{class_code} already exists, skipping")
                continue

            motor_class = MotorClass(
                insurer_id=insurer.id,
                code=class_code,
                label=class_data["label"],
                category=class_data["category"],
                max_age=class_data.get("max_age"),
                min_si=class_data.get("min_si", 0),
                max_si=class_data.get("max_si"),
                has_lr_toggle=class_data.get("has_lr_toggle", False),
                pll_per_seat=class_data.get("pll_per_seat"),
                pll_options=class_data.get("pll_options"),
                flat_only=class_data.get("flat_only"),
                excess=class_data.get("excess", []),
                benefits=class_data.get("benefits", []),
                limits=class_data.get("limits", []),
                active=True,
            )
            db.add(motor_class)
            db.flush()

            if not class_data.get("flat_only"):
                _create_rate_bands(db, motor_class, class_data.get("bands", []), "standard")
                if class_data.get("bands_alt"):
                    _create_rate_bands(db, motor_class, class_data["bands_alt"], "alt")
            db.flush()

            # Re-load with rate_bands populated so rate_version_snapshot sees them.
            db.refresh(motor_class)
            snapshot = rate_version_snapshot(motor_class)
            db.add(RateVersion(motor_class_id=motor_class.id, version_no=1, data=snapshot, change_reason="Initial seed from legacy rate cards"))
            print(f"    + class {insurer_code}/{class_code}")

    db.commit()


def seed_bootstrap_admin(db: Session) -> None:
    existing = db.query(User).filter_by(email=settings.BOOTSTRAP_ADMIN_EMAIL).one_or_none()
    if existing:
        print(f"  = admin user {settings.BOOTSTRAP_ADMIN_EMAIL} already exists, skipping")
        return
    user = User(
        email=settings.BOOTSTRAP_ADMIN_EMAIL,
        password_hash=hash_password(settings.BOOTSTRAP_ADMIN_PASSWORD),
        full_name="Imoth Super Admin",
        role=UserRole.SUPER_ADMIN,
        is_active=True,
    )
    db.add(user)
    db.commit()
    print(f"  + bootstrap admin {settings.BOOTSTRAP_ADMIN_EMAIL}")


def main() -> None:
    db = SessionLocal()
    try:
        print("Seeding insurers / motor classes / rate bands...")
        seed_insurers(db)
        print("Seeding bootstrap admin user...")
        seed_bootstrap_admin(db)
        print("Done.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main() or 0)
