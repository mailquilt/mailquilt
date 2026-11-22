import { InputGroup } from "@cloudflare/kumo";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import type { AnyFieldApi } from "@tanstack/react-form";
import { useState } from "react";

import { FormField } from "../forms/form-field.tsx";

/**
 * A password field with a toggle to show what was typed. The toggle keeps
 * one name, "Show password", and reports its state as pressed or not.
 */
export const PasswordField = ({
  autoComplete,
  description,
  field,
}: {
  autoComplete: "current-password" | "new-password";
  description?: string;
  field: AnyFieldApi;
}) => {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeSlashIcon : EyeIcon;

  return (
    <FormField
      addon={
        <InputGroup.Button
          aria-label="Show password"
          aria-pressed={visible}
          onClick={() => setVisible((shown) => !shown)}
          size="sm"
          variant="ghost"
        >
          <Icon aria-hidden="true" className="size-4" />
        </InputGroup.Button>
      }
      autoComplete={autoComplete}
      description={description}
      field={field}
      label="Password"
      required
      type={visible ? "text" : "password"}
    />
  );
};
