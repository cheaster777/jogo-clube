-- Acelera login e buscas por email, que comparam lower(u.email) e hoje só
-- contam com o índice único da coluna simples (0001). O CHECK users_email_lower
-- garante emails já armazenados em minúsculas, então o índice único não
-- encontra duplicatas case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));
