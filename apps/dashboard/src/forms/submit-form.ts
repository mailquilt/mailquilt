import type { AnyFormApi } from "@tanstack/react-form";

/**
 * Submits a TanStack form from its `<form>` element instead of letting the
 * browser do it. When a value is rejected, focus moves to the first field,
 * in page order, that shows an error.
 */
export const submitForm = async (
  event: React.FormEvent<HTMLFormElement>,
  form: AnyFormApi
) => {
  event.preventDefault();
  const { elements } = event.currentTarget;

  await form.handleSubmit();

  for (const control of elements) {
    if (
      control instanceof HTMLInputElement &&
      (form.getFieldMeta(control.name)?.errors.length ?? 0) > 0
    ) {
      control.focus();

      return;
    }
  }
};
