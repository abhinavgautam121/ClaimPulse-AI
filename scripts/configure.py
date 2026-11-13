"""Create untracked local settings with unique secrets. Does not overwrite existing settings."""

from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
path = root / ".env"
if path.exists():
    print(".env already exists; preserved existing configuration.")
else:
    text = (root / ".env.example").read_text()
    password = secrets.token_urlsafe(30)
    text = (
        text.replace("POSTGRES_PASSWORD=\n", "POSTGRES_PASSWORD=" + password + "\n")
        .replace("REPLACE_LOCALLY", password)
        .replace("JWT_SECRET=\n", "JWT_SECRET=" + secrets.token_urlsafe(48) + "\n")
    )
    path.write_text(text)
    path.chmod(0o600)
    print(
        "Created .env with generated secrets. Values were not printed. Do not commit this file."
    )
