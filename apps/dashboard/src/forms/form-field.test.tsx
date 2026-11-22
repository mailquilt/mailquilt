import { useForm } from "@tanstack/react-form";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Schema } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { FormField } from "./form-field.tsx";
import { submitForm } from "./submit-form.ts";

const NICKNAME_MISSING = "Enter a nickname.";

const Nickname = Schema.Struct({
  nickname: Schema.String.check(
    Schema.isNonEmpty({ message: NICKNAME_MISSING })
  ),
});

const NicknameForm = () => {
  const form = useForm({
    defaultValues: { nickname: "" },
    validators: { onSubmit: Schema.toStandardSchemaV1(Nickname) },
  });

  return (
    <form noValidate onSubmit={(event) => submitForm(event, form)}>
      <form.Field name="nickname">
        {(field) => (
          <FormField
            description="What friends call you."
            field={field}
            label="Nickname"
          />
        )}
      </form.Field>
      <button type="submit">Save</button>
    </form>
  );
};

describe("form field", () => {
  afterEach(cleanup);

  it("ties a rejected value's error to its field and moves focus there", async () => {
    render(<NicknameForm />);
    const nickname = screen.getByLabelText("Nickname");

    expect(nickname.getAttribute("aria-invalid")).not.toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const error = await screen.findByRole("alert");
    expect(error.textContent).toBe(NICKNAME_MISSING);
    expect(nickname.getAttribute("aria-invalid")).toBe("true");
    expect(
      nickname
        .getAttribute("aria-describedby")
        ?.split(" ")
        .some((id) => document.querySelector(`[id="${id}"]`)?.contains(error))
    ).toBeTruthy();
    expect(document.activeElement).toBe(nickname);
  });

  it("announces the same error again when the form is submitted again", async () => {
    render(<NicknameForm />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const first = await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await expect.poll(() => screen.getByRole("alert") === first).toBeFalsy();
    expect(screen.getByRole("alert").textContent).toBe(NICKNAME_MISSING);
  });

  it("keeps the error when the person leaves the field without fixing it", async () => {
    render(<NicknameForm />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    fireEvent.focusOut(screen.getByLabelText("Nickname"));

    expect(screen.queryByRole("alert")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await expect(screen.findByRole("alert")).resolves.toBeDefined();
    expect(screen.getByLabelText("Nickname").getAttribute("aria-invalid")).toBe(
      "true"
    );
  });

  it("shows the error again when an edited value is still rejected", async () => {
    render(<NicknameForm />);
    const nickname = screen.getByLabelText("Nickname");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    fireEvent.change(nickname, { target: { value: "A" } });
    fireEvent.change(nickname, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await expect(screen.findByRole("alert")).resolves.toBeDefined();
  });
});
