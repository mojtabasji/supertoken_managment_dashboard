import "server-only";

import supertokens from "supertokens-node";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import EmailVerification from "supertokens-node/recipe/emailverification";
import Passwordless from "supertokens-node/recipe/passwordless";
import Session from "supertokens-node/recipe/session";
import ThirdParty from "supertokens-node/recipe/thirdparty";
import UserMetadata from "supertokens-node/recipe/usermetadata";

import { getEnv } from "@/lib/config/env";

/**
 * Server-only SuperTokens integration.
 *
 * The portal is an administrative client of an existing SuperTokens Core: it
 * never serves SuperTokens auth endpoints and never authenticates end users.
 * The recipes below are initialized only so their server-side lookup wrappers
 * (getUserById, isEmailVerified, session revocation, metadata) are callable.
 *
 * API surface verified against supertokens-node@9.2.3 (this SDK predates
 * `listUsersByPagination`; listing uses getUsersOldestFirst/getUsersNewestFirst).
 */

let initialized = false;

/**
 * Per-module-instance init flag.
 *
 * The instrumentation hook and the app-server route handlers live in
 * separate Turbopack module graphs: each gets its own copy of this file and
 * of supertokens-node, and each copy's SDK must be initialised on its own
 * (`SuperTokens.instance` is a static on that copy's class, and the recipe
 * instances are statics on that copy's recipe classes). The guard must
 * therefore stay module-local — a shared globalThis flag would let one copy
 * mark itself "initialised" and leave the other copy's SDK uninitialized,
 * failing every Core call with "Initialisation not done". Re-running
 * `supertokens.init` on an already-initialised copy is a safe no-op (the SDK
 * checks its instance first), so an occasional re-entry after HMR is fine.
 */

export function initSuperTokens(): void {
  if (initialized) {
    return;
  }

  const env = getEnv();

  supertokens.init({
    supertokens: {
      connectionURI: env.supertokensConnectionUri,
      apiKey: env.supertokensApiKey,
    },
    // No HTTP framework is mounted for SuperTokens in this app; "express" is
    // the closest available Node id in SDK 9.2.3 and only affects unused API
    // handling paths.
    framework: "express",
    appInfo: {
      appName: "SuperTokens Admin Portal",
      apiDomain: env.appBaseUrl,
      websiteDomain: env.appBaseUrl,
    },
    recipeList: [
      Session.init(),
      EmailPassword.init(),
      // Required by EmailVerification.init: returns the primary email for any
      // user id regardless of owning recipe. Throws when the user has no email.
      EmailVerification.init({
        getEmailForUserId: async (userId: string): Promise<string> => {
          const emailUser = await EmailPassword.getUserById(userId);
          if (emailUser !== undefined) {
            return emailUser.email;
          }
          const thirdPartyUser = await ThirdParty.getUserById(userId);
          if (thirdPartyUser !== undefined) {
            return thirdPartyUser.email;
          }
          const passwordlessUser = await Passwordless.getUserById({ userId });
          if (passwordlessUser !== undefined && passwordlessUser.email !== undefined) {
            return passwordlessUser.email;
          }
          throw new Error("USER_HAS_NO_EMAIL");
        },
      }),
      // The SDK requires at least one provider, but this portal never
      // initiates third-party sign-in itself (it exposes no auth endpoints).
      // The preset entry is registered to satisfy the recipe's init-time
      // validation; its credentials are inert and never used for a flow.
      ThirdParty.init({
        signInAndUpFeature: {
          providers: [ThirdParty.Google({ clientId: "unused-by-portal", clientSecret: "unused-by-portal" })],
        },
      }),
      // The portal never sends OTPs; this sender must never run. It exists only
      // because the recipe type requires one.
      Passwordless.init({
        contactMethod: "EMAIL",
        flowType: "USER_INPUT_CODE",
        createAndSendCustomEmail: async (): Promise<void> => {
          throw new Error("The admin portal must never trigger OTP emails.");
        },
      }),
      UserMetadata.init(),
    ],
    telemetry: false,
  });

  initialized = true;
}

/** Test helper: allows re-init after `supertokens.reset()` in tests. */
export function resetSuperTokensInitFlagForTests(): void {
  initialized = false;
}
