# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience of the public site: the school community of Colégio Theodoro de Bona, meaning students, families, teachers, and visitors of science fairs. They arrive to learn what the club studied and move on to the game. The game itself serves students and teachers playing in class or at home.

## Product Purpose

Clube de Ciências Bona popularizes science and environmental education. The public site explains macroinvertebrates as water quality bioindicators, records the club's field study, and sends visitors to the game. The game turns those same concepts into a playable card experience. Success on the site is a visitor who understands the idea and starts the game.

## Positioning

The content comes from the club's own field work: students collected samples at the Parque Ambiental Anibal Khury, identified them under the microscope, and built a game from what they learned.

## Operating Context

Visitors reach the site from phones, often through a link shared at school or at a fair. The game is at https://jogo.clubedecienciasbona.com.br, and the site is at https://clubedecienciasbona.com.br.

## Capabilities and Constraints

- The site is static HTML and CSS with no build step and no JavaScript. It lives in `site/public` and has its own container.
- The game's design system in `src/index.css` is the visual authority. The site follows it and does not define a separate identity.
- Do not publish text placeholders. The name of the identification guide used in the study is unknown and stays out of the copy.

## Brand Commitments

Name: Clube de Ciências Bona. The logo is `public/assets/images/Logo.png`. Page text is in Brazilian Portuguese.

## Evidence on Hand

Real field and lab photos are in `site/public/img/fotos`. The school has image authorization for the students shown, as confirmed by the project owner on 2026-11-02. Organism art comes from the game cards. There are no testimonials, awards, or study metrics on hand, so do not invent them.

## Product Principles

1. Real field work comes first, and every claim traces back to the club's study.
2. The site and the game must read as one product.
3. Science stays accurate and understandable for students.
4. The site must stay fast and readable on a phone.

## Accessibility & Inclusion

Students and families read on phones. Keep text at or above WCAG AA contrast, keep tap targets at 44px, and respect reduced motion.
