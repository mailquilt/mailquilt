import { PlusIcon } from "../icons/icons.tsx";

const PATCH_FILLS = [
  "bg-(--mq-patch-ink)",
  "bg-(--mq-patch-grey)",
  "bg-(--mq-patch-pale)",
] as const;

const CELLS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

const hashOf = (text: string) => {
  let hash = 7;

  for (const character of text) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 2_147_483_647;
  }

  return hash;
};

const fillsFor = (organizationId: string) => {
  const hash = hashOf(organizationId);

  const fills = CELLS.map(
    (_, cell) =>
      Math.floor(hash / PATCH_FILLS.length ** cell) % PATCH_FILLS.length
  );

  if (fills.every((fill) => fill === fills[0])) {
    fills[CELLS.length - 1] = ((fills[0] ?? 0) + 1) % PATCH_FILLS.length;
  }

  return fills.map((fill) => PATCH_FILLS[fill]);
};

/**
 * An Organization's quilt patch: four blocks in the logo's ink and greys,
 * arranged by its ID, so each Organization is recognisable at a glance and
 * keeps its patch when renamed. Decorative: its name is always beside it.
 */
export const OrganizationPatch = ({
  className,
  organizationId,
}: {
  className: string;
  organizationId: string;
}) => (
  <span
    aria-hidden="true"
    className={`grid shrink-0 grid-cols-2 gap-quilt-seam ${className}`}
  >
    {fillsFor(organizationId).map((fill, cell) => (
      <span className={`rounded-quilt ${fill}`} key={CELLS[cell]} />
    ))}
  </span>
);

/**
 * The logo's dashed slot with a plus: a patch that isn't there yet. Marks
 * "New organization".
 */
export const NewPatchSlot = ({ className }: { className: string }) => (
  <span
    aria-hidden="true"
    className={`flex shrink-0 items-center justify-center rounded-quilt-slot border-2 border-dashed border-(--mq-logo-slot) text-kumo-subtle ${className}`}
  >
    <PlusIcon className="size-3.5" weight="bold" />
  </span>
);
