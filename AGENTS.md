# Agent guidance for Doc-home

This repository is a time-boxed Sync Technologies take-home exercise. Read `docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md` for the authoritative current scope. `docs/PRODUCT_BLUEPRINT.md` is only a high-level future direction. Treat them as proposals that record scope and trade-offs; the original assessment brief and the user's latest instructions take precedence.

## Scope and honesty

- Keep the initial implementation focused on the photo-only slice in the scope plan: one project photo page, upload/list/view/delete, persistence, validation, targeted tests, and clear run instructions. Links, documents and videos are deferred.
- The blueprint describes future proposals. Do not present them as implemented, add inactive UI controls for them, or expand into them without a reason tied to the assessment.
- Update README and the delivery plan when the implementation changes. State what actually works, what was checked, and what remains incomplete. Do not invent metrics or test results.

## Structure and quality

- Use Node >=24 and pnpm 10 with one root lockfile. Use a simple pnpm-workspace monorepo: Next.js App Router/React/TypeScript in `apps/web`, NestJS/TypeScript REST API in `apps/api`, and PostgreSQL with TypeORM. Keep database and file storage behind the API.
- Use Panda CSS for frontend styling. Configure it inside `apps/web` with PostCSS and code generation; include the app and feature source files in Panda's scan paths. Use the existing semantic color roles and Button recipe; prefer the preset spacing/radius scale. Name responsive layouts `mobile`, `tablet` and `desktop` to match Figma. Keep the design and theme aligned; do not build a larger component library without a concrete need. Do not scaffold Tailwind CSS.
- Build one photo page. Small Client Components handle the list, upload, delete and feedback; requests reach NestJS through the same-origin rewrite. Do not duplicate the photo rules in Next.js Route Handlers.
- NestJS DTOs, global request validation and file validation describe and enforce the HTTP boundary; document the small HTTP interface in README at delivery. Avoid a shared contracts package until it solves observed duplication.
- Run web and API locally on ports 3000 and 3001. Docker Compose runs PostgreSQL and Adobe S3Mock for local object storage. Keep file bytes in the configured bucket, metadata/object keys in PostgreSQL, and S3 access behind the API. Keep ESLint as the only lint tool; preserve database and object data and document reset behaviour.
- Prefer a small, readable implementation over empty abstraction layers or extra infrastructure. Name things for their business role; write comments for non-obvious decisions and failure handling.
- Validate incoming data on the backend. Account for failures between file storage and database changes. Keep seed data repeatable without overwriting user-added records.
- Use TypeScript for application and test source. Use Jest for backend unit tests, with colocated `*.spec.ts` files and the existing TypeScript Jest config. The previous Node-runner cases have been migrated; do not add another test runner. React Testing Library and Playwright are the intended frontend component/browser tools when the UI is ready. Report only checks actually run.
- Keep one working branch and meaningful commits. Preserve existing user changes; inspect the working tree before editing.

## Collaboration and delivery

- Use `README.md` for actual setup, run, and test instructions; `docs/PRODUCT_BLUEPRINT.md` for full product design; and `docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md` for the submitted slice, work order and trade-offs.
- Do not contact the company or send messages on the user's behalf without explicit authorization. Do not add secrets, credentials, or local environment files to Git.
- The final PR should explain implemented scope, deliberate omissions, validation evidence, AI assistance, and what would be done next.
- The initial review commits are Docs, shared Setup, then frontend/backend Framework (including its matching lockfile). The user authorised this local regrouping; the original history is preserved on a backup branch. Do not rewrite remote history without explicit authorisation.
- Keep personal development/interview notes outside this repository. Put concise rationale in commit descriptions and actual verification evidence in the final README/PR; distinguish tool work from candidate review.
