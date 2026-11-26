import type { UserId } from "@repo/domain";
import { Context } from "effect";

/**
 * The signed-in instance admin. Only `asInstanceAdmin` provides it, after
 * checking, and every method that reads or changes the install's settings
 * requires it. `@repo/core` exports it as a type only, so another package can't
 * provide it without a cast or `Context.makeUnsafe`.
 */
export class InstanceAdmin extends Context.Service<
  InstanceAdmin,
  { readonly id: UserId }
>()("@repo/core/InstanceAdmin") {}
