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
  className,
  description,
  field,
  size,
}: {
  autoComplete: "current-password" | "new-password";
  className?: string;
  description?: string;
  field: AnyFieldApi;
  size?: React.ComponentProps<typeof FormField>["size"];
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
      className={className}
      description={description}
      field={field}
      label="Password"
      required
      size={size}
      type={visible ? "text" : "password"}
    />
  );
};
