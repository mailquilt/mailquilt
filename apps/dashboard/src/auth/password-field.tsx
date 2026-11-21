import { InputGroup } from "@cloudflare/kumo";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";

/**
 * A password input with a toggle to show what was typed. The toggle keeps
 * one name, "Show password", and reports its state as pressed or not.
 */
export const PasswordField = ({
  autoComplete,
  description,
  minLength,
}: {
  autoComplete: "current-password" | "new-password";
  description?: string;
  minLength?: number;
}) => {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeSlashIcon : EyeIcon;

  return (
    <InputGroup
      label="Password"
      size="lg"
      {...(description === undefined ? {} : { description })}
    >
      <InputGroup.Input
        autoComplete={autoComplete}
        name="password"
        required
        type={visible ? "text" : "password"}
        {...(minLength === undefined ? {} : { minLength })}
      />
      <InputGroup.Addon align="end">
        <InputGroup.Button
          aria-label="Show password"
          aria-pressed={visible}
          onClick={() => setVisible((shown) => !shown)}
          size="sm"
          variant="ghost"
        >
          <Icon aria-hidden="true" className="size-4" />
        </InputGroup.Button>
      </InputGroup.Addon>
    </InputGroup>
  );
};
