# Decisões do motor de regras

O motor usa as definições atuais de `src/constants.ts`, mas não usa títulos de cartas para decidir efeitos. O vínculo é feito pelo índice estável da definição de ação e validado ao montar o baralho.

- **Drift — arrasto:** afeta o jogador imediatamente anterior ao jogador que comprou a carta.
- **Peixe exótico:** afeta o jogador imediatamente seguinte ao jogador que comprou a carta.
- **Baralho de famílias vazio:** uma ação de pesca compra somente as cartas disponíveis e a partida continua. O esgotamento desse baralho não encerra uma partida de cinco rodadas.
- **Fim da partida:** acontece após o último turno da rodada máxima ou quando o baralho de ações acaba.
- **Desempate:** pontuações iguais preservam a ordem dos assentos; o menor `id` de assento fica à frente.
- **Aleatoriedade:** usa a seed e o `rngState` persistidos em `GameState`; o mesmo seed e os mesmos comandos produzem o mesmo resultado.
