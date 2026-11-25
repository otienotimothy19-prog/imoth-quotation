def mask_email(email: str | None) -> str | None:
    """jo***@gmail.com -- enough for someone to recognise their own address
    without showing it in full."""
    if not email or "@" not in email:
        return None
    local, domain = email.split("@", 1)
    return f"{local[:2]}***@{domain}"
