import { Button, Input } from "@cloudflare/kumo";

import {
  LINK_NOT_SENT_MESSAGE,
  SEND_LINK_LABEL,
  useSendVerificationLink,
} from "./send-verification-link.ts";

/** Asks for the address and sends a fresh verification link to it. */
export const SendLinkForm = ({
  onSent,
}: {
  onSent: (email: string) => void;
}) => {
  const send = useSendVerificationLink({ onSent });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        send.mutate(
          String(new FormData(event.currentTarget).get("email") ?? "")
        );
      }}
    >
      <Input
        autoComplete="email"
        label="Email"
        name="email"
        onChange={() => {
          if (send.isError) {
            send.reset();
          }
        }}
        required
        size="lg"
        type="email"
      />
      {send.isError ? (
        <p className="text-base text-kumo-danger" role="alert">
          {LINK_NOT_SENT_MESSAGE}
        </p>
      ) : null}
      <Button
        className="w-full justify-center"
        loading={send.isPending}
        size="lg"
        type="submit"
        variant="primary"
      >
        {SEND_LINK_LABEL}
      </Button>
    </form>
  );
};
