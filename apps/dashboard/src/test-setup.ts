import { cleanStores } from "nanostores";
import { afterAll } from "vitest";

import { authClient } from "./auth/auth-client.ts";

// WARNING: the session store runs Better Auth's cleanup on a real one-second timer after its last listener leaves, which can land after the test window is gone; run it now, while the window exists.
afterAll(() => cleanStores(authClient.$store.atoms.session));
