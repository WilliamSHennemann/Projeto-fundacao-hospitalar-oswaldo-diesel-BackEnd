CREATE UNIQUE INDEX IF NOT EXISTS usuario_email_lower_uidx
  ON usuario (LOWER(email));
