import type { AnyFieldApi } from "@tanstack/react-form";
import { useStore } from "@tanstack/react-form";
import { Option, Schema } from "effect";

const FieldIssue = Schema.Struct({ message: Schema.String });

const decodeFieldIssue = Schema.decodeUnknownOption(FieldIssue);

/**
 * A field's first error message, how many times the form was submitted, and
 * the error as Kumo's fields take it: an alert keyed by that count.
 */
export const useFieldError = (field: AnyFieldApi) => {
  const submissions = useStore(
    field.form.store,
    (state) => state.submissionAttempts
  );

  const message = Option.getOrUndefined(
    Option.map(
      decodeFieldIssue(field.state.meta.errors.at(0)),
      (found) => found.message
    )
  );

  return {
    message,
    submissions,
    // WARNING: keyed by submission so a repeated error is a new alert, which screen readers announce again.
    error:
      message === undefined
        ? undefined
        : {
            match: true as const,
            message: (
              <span key={submissions} role="alert">
                {message}
              </span>
            ),
          },
  };
};
