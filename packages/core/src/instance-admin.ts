import type { UserId } from "@repo/domain";
import { Context } from "effect";

/**
 * The signed-in instance admin. Only `asInstanceAdmin` provides it, after
 * checking, and every method that reads or changes the install's settings
 * requires it.
 */
export class InstanceAdmin extends Context.Service<
  InstanceAdmin,
  { readonly id: UserId }
>()("@repo/core/InstanceAdmin") {}
