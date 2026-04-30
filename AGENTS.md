# AGENTS.md

## Visão Geral do Projeto

Jogo educacional de cartas em React 19 + Vite 6 sobre bioindicadores (macroinvertebrados) e impacto ambiental. Feito para deployment no AI Studio.

## Comandos

```bash
npm install          # Instalar dependências
npm run dev         # Rodar servidor de desenvolvimento (porta 3000)
npm run build       # Build para produção
npm run lint         # Apenas typechecking do TypeScript
```

## Ambiente Necessário

Criar `.env.local` com:
- `VITE_SUPABASE_URL` - URL do projeto Supabase
- `VITE_SUPABASE_ANON_KEY` - Chave anon do Supabase
- `GEMINI_API_KEY` - (opcional) Chave da API Gemini

## Arquitetura

- **Autenticação**: Supabase Auth via `src/contexts/AuthContext.tsx`
- **Cliente Supabase**: `src/lib/supabase.ts`
- **Dados do Jogo**: `src/constants.ts` (FAMILY_CARDS_DATA, ACTION_CARDS_DATA)
- **App Principal**: `src/App.tsx`
- **Componentes**: `src/components/AuthScreen.tsx`
- **Estilização**: Tailwind CSS v4 em `src/index.css`

## Peculiaridades Importantes

- Tailwind v4 usa config baseada em CSS (sem `tailwind.config.js`)
- Autenticação obrigatória - usuários não autenticados veem tela de login
- Jogo salva score automaticamente no Supabase ao terminar
- Nome do Jogador 1 é preenchido automaticamente pelo `full_name` do perfil Supabase
- Sem suite de testes - `npm run lint` faz apenas typechecking