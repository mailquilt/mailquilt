import { useForm } from "@tanstack/react-form";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PasswordField } from "./password-field.tsx";

const PasswordForm = () => {
  const form = useForm({ defaultValues: { password: "" } });

  return (
    <form.Field name="password">
      {(field) => (
        <PasswordField autoComplete="current-password" field={field} />
      )}
    </form.Field>
  );
};

describe("password field", () => {
  afterEach(cleanup);

  it("shows what was typed while the toggle is pressed", () => {
    render(<PasswordForm />);

    const password = screen.getByLabelText<HTMLInputElement>("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });

    expect(password.type).toBe("password");

    fireEvent.click(toggle);

    expect(password.type).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });
});
