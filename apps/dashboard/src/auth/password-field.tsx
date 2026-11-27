import { InputGroup } from "@cloudflare/kumo";
import type { AnyFieldApi } from "@tanstack/react-form";
import { useState } from "react";

import { FormField } from "../forms/form-field.tsx";
import { EyeIcon, EyeSlashIcon } from "../icons/icons.tsx";

/**
 * A password field with a toggle to show what was typed. The toggle keeps
 * one name, "Show password", and reports its state as pressed or not.
 */
export const PasswordField = ({
  autoComplete,
  className,
  description,
  field,
  label = "Password",
  size,
}: {
  autoComplete: "current-password" | "new-password";
  className?: string;
  description?: string;
  field: AnyFieldApi;
  /** What the field is called, such as "Secret access key"; "Password" by default. */
  label?: string;
  size?: React.ComponentProps<typeof FormField>["size"];
}) => {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeSlashIcon : EyeIcon;

  return (
    <FormField
      addon={
        <InputGroup.Button
          aria-label={`Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((shown) => !shown)}
          size="sm"
          variant="ghost"
        >
          <Icon aria-hidden="true" className="size-4" />
        </InputGroup.Button>
      }
      autoComplete={autoComplete}
      className={className}
      description={description}
      field={field}
      label={label}
      required
      size={size}
      type={visible ? "text" : "password"}
    />
  );
};
