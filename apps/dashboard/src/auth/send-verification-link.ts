import { useMutation } from "@tanstack/react-query";

import { authClient, EMAIL_VERIFIED_PATH } from "./auth-client.ts";

/** The one name every screen uses for this action. */
export const SEND_LINK_LABEL = "Send a new link";

export const LINK_SENT_MESSAGE = (email: string) =>
  `We sent a new link to ${email}.`;

export const LINK_NOT_SENT_MESSAGE =
  "The link couldn’t be sent. Wait a minute, then try again.";

const sendVerificationLink = async (email: string) => {
  const { error } = await authClient.sendVerificationEmail({
    callbackURL: EMAIL_VERIFIED_PATH,
    email,
  });

  if (error) {
    throw new Error(error.message ?? LINK_NOT_SENT_MESSAGE);
  }

  return email;
};

/**
 * Sends a fresh verification link. A rejection, whether Better Auth refused
 * or the network failed, surfaces as the mutation's error.
 */
export const useSendVerificationLink = (options?: {
  onSent?: (email: string) => void;
}) =>
  useMutation({
    mutationFn: sendVerificationLink,
    onSuccess: (email) => options?.onSent?.(email),
  });
