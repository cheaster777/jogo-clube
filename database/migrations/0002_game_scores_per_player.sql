-- Corrige game_scores para permitir um registro por participante humano de
-- cada partida, não só pelo criador. O modelo anterior (match_id UNIQUE)
-- descartava silenciosamente o resultado de todo mundo além de quem criou
-- a sala em partidas online de 2-4 jogadores.
ALTER TABLE game_scores DROP CONSTRAINT game_scores_match_id_key;
ALTER TABLE game_scores ADD CONSTRAINT game_scores_match_id_user_id_key UNIQUE (match_id, user_id);
