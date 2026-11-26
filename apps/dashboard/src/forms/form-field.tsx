import { Input, InputArea, InputGroup } from "@cloudflare/kumo";
import { useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Option, Schema } from "effect";

const TEXT_SAFARI_WONT_ZOOM_INTO = "max-sm:text-lg pointer-coarse:text-lg";

const FieldIssue = Schema.Struct({ message: Schema.String });

const decodeFieldIssue = Schema.decodeUnknownOption(FieldIssue);

type InputProps = Omit<
  React.ComponentProps<typeof Input>,
  | "aria-invalid"
  | "description"
  | "error"
  | "label"
  | "name"
  | "onChange"
  | "value"
>;

/**
 * A text field bound to a TanStack form field, drawn with Kumo's own field
 * parts. Its first error replaces the description under it, is tied to the
 * input through `aria-describedby`, and is announced each time the form is
 * submitted, even when it says the same thing as last time. `addon` sits at
 * the end of the input, such as a button to show a password. With `rows`,
 * it's a text area of that many lines, for text that runs over several,
 * and `areaRef` reaches it.
 */
export const FormField = ({
  addon,
  areaRef,
  className,
  description,
  field,
  label,
  rows,
  size,
  ...inputProps
}: InputProps & {
  addon?: React.ReactNode;
  areaRef?: React.Ref<HTMLTextAreaElement>;
  description?: React.ReactNode;
  field: AnyFieldApi;
  label: string;
  rows?: number;
}) => {
  const submissions = useStore(
    field.form.store,
    (state) => state.submissionAttempts
  );

  const message = Option.getOrUndefined(
    Option.map(
      decodeFieldIssue(field.state.meta.errors.at(0)),
      (issue) => issue.message
    )
  );

  const invalid = message !== undefined;

  // WARNING: keyed by submission so a repeated error is a new alert, which screen readers announce again.
  const error = invalid
    ? {
        match: true,
        message: (
          <span key={submissions} role="alert">
            {message}
          </span>
        ),
      }
    : undefined;

  const control = {
    "aria-invalid": invalid,
    name: field.name,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
    value: String(field.state.value),
  };

  if (rows !== undefined) {
    return (
      <InputArea
        aria-invalid={invalid}
        autoComplete={inputProps.autoComplete}
        className={`${TEXT_SAFARI_WONT_ZOOM_INTO} ${className ?? ""}`}
        description={description}
        disabled={inputProps.disabled}
        error={error}
        id={inputProps.id}
        label={label}
        name={field.name}
        onChange={(event) => field.handleChange(event.target.value)}
        placeholder={inputProps.placeholder}
        ref={areaRef}
        required={inputProps.required}
        rows={rows}
        value={String(field.state.value)}
      />
    );
  }

  if (addon !== undefined) {
    return (
      <InputGroup
        description={description}
        error={error}
        label={label}
        size={size}
      >
        <InputGroup.Input
          {...inputProps}
          {...control}
          className={`${TEXT_SAFARI_WONT_ZOOM_INTO} ${className ?? ""}`}
        />
        <InputGroup.Addon align="end">{addon}</InputGroup.Addon>
      </InputGroup>
    );
  }

  return (
    <Input
      {...inputProps}
      {...control}
      className={`${TEXT_SAFARI_WONT_ZOOM_INTO} ${className ?? ""}`}
      description={description}
      error={error}
      label={label}
      size={size}
    />
  );
};
