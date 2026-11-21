import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { forwardRef } from "react";
import type { AnchorHTMLAttributes } from "react";

/**
 * Kumo's links and sidebar items, routed through TanStack Router so they
 * navigate without reloading the app. Kumo's `LinkProvider` requires a
 * `forwardRef` component.
 */
export const RouterLink = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement>
>(({ href, ...props }, ref) => (
  // SAFETY: Kumo passes the plain `href` it was given; every one in this app is a route path.
  <Link ref={ref} to={href as LinkProps["to"]} {...props} />
));

RouterLink.displayName = "RouterLink";
