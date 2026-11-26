import { assert, describe, it } from "@effect/vitest";
import * as Core from "@repo/core";

describe("scope tags", () => {
  it("leaves only @repo/core able to provide the Organization and instance-admin scopes", () => {
    // @ts-expect-error `CurrentOrganization` is exported as a type only, so a handler can't skip `asMemberOf`.
    assert.isUndefined(Core.CurrentOrganization);
    // @ts-expect-error `CurrentMembership` is exported as a type only, so a handler can't skip `asMemberOf`.
    assert.isUndefined(Core.CurrentMembership);
    // @ts-expect-error `InstanceAdmin` is exported as a type only, so a handler can't skip `asInstanceAdmin`.
    assert.isUndefined(Core.InstanceAdmin);
  });
});
