import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";

/**
 * Convex app config — the component registry.
 *
 * This file did not exist until Better Auth was added; a project with no
 * components works without one. Its only job is `app.use(...)`, which is what
 * makes `components.betterAuth` available to `createClient()` in
 * ./betterAuth/auth.ts and creates the component's `user` / `session` /
 * `account` / `verification` / `jwks` tables.
 *
 * It is imported from `@convex-dev/better-auth/convex.config` rather than a
 * local `./betterAuth/convex.config.ts`. Both forms work — the local form is
 * for owning the component's schema and adapter in this repo — but nothing
 * here customises a Better Auth table yet, so the published component is one
 * less file that can drift from its upstream.
 */
const app = defineApp();

app.use(betterAuth);

export default app;
