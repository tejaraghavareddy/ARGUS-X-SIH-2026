import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";

// Convex components are registered on an app definition, one `.use()` per
// component. This file is the app's component manifest — it is what makes
// `components.betterAuth` exist in _generated/api, and therefore what gives
// the Better Auth tables (user / session / account / verification) their own
// namespace instead of colliding with this project's 16 app tables.
//
// The component owns its schema, so there is no migration command to run:
// `npx auth migrate` targets a SQL database and this project has none.
const app = defineApp();

app.use(betterAuth);

export default app;
