import { useId } from "react";

const Blocks = ({ maskId }: { maskId: string }) => (
  <>
    <defs>
      <mask
        height="128"
        id={maskId}
        maskUnits="userSpaceOnUse"
        width="128"
        x="-10"
        y="-10"
      >
        <rect className="fill-white" height="128" width="128" x="-10" y="-10" />
        <rect
          className="fill-black"
          height="50"
          rx="9"
          width="50"
          x="58"
          y="0"
        />
      </mask>
    </defs>
    <rect
      className="fill-(--mq-logo-ink)"
      height="44"
      rx="6"
      width="44"
      x="0"
      y="12"
    />
    <rect
      className="fill-(--mq-logo-ink)"
      height="44"
      rx="6"
      width="44"
      x="0"
      y="64"
    />
    <rect
      className="fill-(--mq-logo-ink)"
      height="44"
      rx="6"
      width="44"
      x="52"
      y="64"
    />
    <g mask={`url(#${maskId})`}>
      <rect
        className="stroke-(--mq-logo-slot)"
        fill="none"
        height="41"
        rx="5"
        strokeDasharray="6 4.36"
        strokeWidth="3"
        width="41"
        x="53.5"
        y="13.5"
      />
    </g>
    <rect
      className="fill-(--mq-accent)"
      height="44"
      rx="6"
      width="44"
      x="61"
      y="3"
    />
    <polyline
      fill="none"
      className="stroke-white"
      points="68,11 83,24 98,11"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="4.5"
    />
  </>
);

/**
 * The quilt symbol on its own, for tight spaces such as a collapsed sidebar.
 * Paths from the official kit (svg/mailquilt-mark.svg); colours from CSS
 * variables in styles.css, so the same paths draw the light and dark kit.
 */
export const MailquiltMark = ({ className }: { className?: string }) => {
  const maskId = useId();

  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 108 108"
    >
      <Blocks maskId={maskId} />
    </svg>
  );
};

/**
 * The full logo, symbol and lowercase wordmark, from the official kit
 * (svg/mailquilt-logo.svg). Its accessible name is "Mailquilt".
 */
export const MailquiltLogo = ({ className }: { className?: string }) => {
  const maskId = useId();

  return (
    <svg
      aria-label="Mailquilt"
      className={className}
      role="img"
      viewBox="-6 -6 584.27 131.15"
    >
      <g transform="scale(1.07407)">
        <Blocks maskId={maskId} />
      </g>
      <path
        className="fill-(--mq-logo-ink)"
        d="M153.84 96.75V41.2H167.73V47.25H169.74Q171.2 44.45 174.56 42.38Q177.92 40.3 183.41 40.3Q189.34 40.3 192.93 42.6Q196.51 44.9 198.42 48.59H200.43Q202.34 45.01 205.81 42.66Q209.28 40.3 215.66 40.3Q220.82 40.3 225.02 42.49Q229.22 44.67 231.74 49.1Q234.26 53.52 234.26 60.24V96.75H220.14V61.25Q220.14 56.66 217.79 54.36Q215.44 52.06 211.18 52.06Q206.37 52.06 203.74 55.14Q201.1 58.22 201.1 63.94V96.75H186.99V61.25Q186.99 56.66 184.64 54.36Q182.29 52.06 178.03 52.06Q173.22 52.06 170.58 55.14Q167.95 58.22 167.95 63.94V96.75Z"
      />
      <path
        className="fill-(--mq-logo-ink)"
        d="M261.14 98.32Q255.2 98.32 250.5 96.25Q245.79 94.18 243.05 90.2Q240.3 86.22 240.3 80.51Q240.3 74.8 243.05 70.94Q245.79 67.07 250.66 65.11Q255.54 63.15 261.81 63.15H277.04V60.02Q277.04 56.1 274.58 53.58Q272.11 51.06 266.74 51.06Q261.47 51.06 258.9 53.46Q256.32 55.87 255.54 59.68L242.54 55.31Q243.89 51.06 246.86 47.53Q249.82 44 254.81 41.82Q259.79 39.63 266.96 39.63Q277.94 39.63 284.32 45.12Q290.7 50.61 290.7 61.02V81.74Q290.7 85.1 293.84 85.1H298.32V96.75H288.91Q284.77 96.75 282.08 94.74Q279.39 92.72 279.39 89.36V89.25H277.26Q276.82 90.59 275.25 92.78Q273.68 94.96 270.32 96.64Q266.96 98.32 261.14 98.32ZM263.6 86.9Q269.54 86.9 273.29 83.59Q277.04 80.29 277.04 74.8V73.68H262.82Q258.9 73.68 256.66 75.36Q254.42 77.04 254.42 80.06Q254.42 83.09 256.77 84.99Q259.12 86.9 263.6 86.9Z"
      />
      <path
        className="fill-(--mq-logo-ink)"
        d="M303.02 96.75V41.2H317.14V96.75ZM310.08 34.7Q306.27 34.7 303.64 32.24Q301.01 29.78 301.01 25.74Q301.01 21.71 303.64 19.25Q306.27 16.78 310.08 16.78Q314 16.78 316.58 19.25Q319.15 21.71 319.15 25.74Q319.15 29.78 316.58 32.24Q314 34.7 310.08 34.7Z"
      />
      <path
        className="fill-(--mq-logo-ink)"
        d="M327.22 96.75V18.35H341.33V96.75Z"
      />
      <path
        className="fill-(--mq-logo-grey)"
        d="M393.07 119.15V90.37H391.06Q389.94 92.27 387.81 94.12Q385.68 95.97 382.26 97.14Q378.85 98.32 373.81 98.32Q367.09 98.32 361.38 95.02Q355.66 91.71 352.19 85.33Q348.72 78.94 348.72 69.87V68.08Q348.72 59.01 352.19 52.62Q355.66 46.24 361.43 42.94Q367.2 39.63 373.81 39.63Q381.42 39.63 385.4 42.15Q389.38 44.67 391.28 47.92H393.3V41.2H407.18V119.15ZM378.06 86Q384.67 86 388.98 81.8Q393.3 77.6 393.3 69.54V68.42Q393.3 60.35 388.93 56.15Q384.56 51.95 378.06 51.95Q371.57 51.95 367.2 56.15Q362.83 60.35 362.83 68.42V69.54Q362.83 77.6 367.2 81.8Q371.57 86 378.06 86Z"
      />
      <path
        className="fill-(--mq-logo-grey)"
        d="M438.43 97.65Q431.94 97.65 427.06 94.68Q422.19 91.71 419.5 86.45Q416.82 81.18 416.82 74.35V41.2H430.93V73.23Q430.93 79.5 434.01 82.64Q437.09 85.78 442.8 85.78Q449.3 85.78 452.88 81.46Q456.46 77.15 456.46 69.42V41.2H470.58V96.75H456.69V89.47H454.67Q453.33 92.27 449.63 94.96Q445.94 97.65 438.43 97.65Z"
      />
      <path
        className="fill-(--mq-logo-grey)"
        d="M480.66 96.75V41.2H494.77V96.75Z"
      />
      <path
        className="fill-(--mq-logo-grey)"
        d="M504.85 96.75V18.35H518.96V96.75Z"
      />
      <path
        className="fill-(--mq-logo-grey)"
        d="M550.32 96.75Q544.83 96.75 541.42 93.34Q538 89.92 538 84.21V52.85H524.11V41.2H538V23.95H552.11V41.2H567.34V52.85H552.11V81.74Q552.11 85.1 555.25 85.1H566V96.75Z"
      />
      <rect
        className="fill-(--mq-accent)"
        height="18.37"
        rx="2.46"
        width="18.37"
        x="478.53"
        y="16.56"
      />
    </svg>
  );
};
