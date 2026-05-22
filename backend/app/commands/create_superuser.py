"""
Create a superuser from the command line.

Usage:
    python -m app.commands.create_superuser <username> <password>

Defaults:
    username = "admin"
    password = "admin"
"""

import sys
import os

# Ensure the backend directory is on the path when running outside Docker
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.database import SessionLocal
from app.models import User
from app.security import get_password_hash


def create_superuser(username: str = "admin", password: str = "admin") -> None:
    db = SessionLocal()
    try:
        email = f"{username}@dinacuamar.local"

        existing = db.query(User).filter(
            (User.username == username) | (User.email == email)
        ).first()

        if existing:
            print(f"User already exists: {existing.username} ({existing.email})")
            return

        user = User(
            username=username,
            email=email,
            hashed_password=get_password_hash(password),
            is_active=True,
            is_superuser=True,
        )
        db.add(user)
        db.commit()
        print(f"Superuser created: {user.username} ({user.email})")
    except Exception as exc:
        db.rollback()
        print(f"Error creating superuser: {exc}")
        raise
    finally:
        db.close()


def main():
    username = sys.argv[1] if len(sys.argv) > 1 else "admin"
    password = sys.argv[2] if len(sys.argv) > 2 else "admin"
    create_superuser(username, password)


if __name__ == "__main__":
    main()
