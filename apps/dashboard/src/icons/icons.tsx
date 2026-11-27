import {
  Add01Icon,
  Alert02Icon,
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowRightDoubleIcon,
  ArrowUp01Icon,
  Calendar03Icon,
  Cancel01Icon,
  ComputerIcon,
  Copy01Icon,
  Csv01Icon,
  Delete02Icon,
  FileImportIcon,
  Globe02Icon,
  Home03Icon,
  InformationCircleIcon,
  LeftToRightListBulletIcon,
  LinkSquare02Icon,
  Logout03Icon,
  MailBlock01Icon,
  Mail01Icon,
  Megaphone01Icon,
  Menu01Icon,
  MinusSignIcon,
  Moon02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  Refresh01Icon,
  Search01Icon,
  SentIcon,
  ServerStack01Icon,
  Settings02Icon,
  SidebarLeftIcon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  Sun03Icon,
  Tick02Icon,
  UnfoldMoreIcon,
  UserMultipleIcon,
  ViewIcon,
  ViewOffIcon,
  WebDesign01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import type { IconProps, IconWeight } from "@phosphor-icons/react";
import { createContext, forwardRef, useContext } from "react";

/** Phosphor's context for a default size, colour and weight; Kumo sets it. */
export const IconContext = createContext<IconProps>({});

const STROKE: Record<IconWeight, number> = {
  bold: 2,
  duotone: 1.5,
  fill: 2,
  light: 1.25,
  regular: 1.5,
  thin: 1,
};

// WARNING: a fill closes Hugeicons' open strokes into solid shapes; Kumo's Select arrow asks for one.
const STROKE_ONLY = /\bfill-current\b/gu;

const hugeicon = (icon: IconSvgElement, name: string) => {
  const Drawn = forwardRef<SVGSVGElement, IconProps>(
    (
      { alt, children, className, color, mirrored, size, weight, ...props },
      ref
    ) => {
      const {
        className: contextClassName,
        color: contextColor,
        mirrored: contextMirrored,
        size: contextSize,
        weight: contextWeight,
        ...contextProps
      } = useContext(IconContext);

      const classes = (className ?? contextClassName)
        ?.replaceAll(STROKE_ONLY, "")
        .trim();

      return (
        <HugeiconsIcon
          {...contextProps}
          {...props}
          aria-hidden={alt ? undefined : true}
          color={color ?? contextColor ?? "currentColor"}
          icon={icon}
          ref={ref}
          size={size ?? contextSize ?? "1em"}
          strokeWidth={STROKE[weight ?? contextWeight ?? "regular"]}
          className={
            mirrored || contextMirrored
              ? `${classes ?? ""} -scale-x-100`
              : classes
          }
        >
          {alt ? <title>{alt}</title> : null}
          {children}
        </HugeiconsIcon>
      );
    }
  );

  Drawn.displayName = name;

  return Drawn;
};

export const ArrowRightIcon = hugeicon(ArrowRight02Icon, "ArrowRightIcon");

export const ArrowSquareOutIcon = hugeicon(
  LinkSquare02Icon,
  "ArrowSquareOutIcon"
);

export const ArrowsClockwise = hugeicon(Refresh01Icon, "ArrowsClockwise");

export const CaretDoubleLeftIcon = hugeicon(
  ArrowLeftDoubleIcon,
  "CaretDoubleLeftIcon"
);

export const CaretDoubleRightIcon = hugeicon(
  ArrowRightDoubleIcon,
  "CaretDoubleRightIcon"
);

export const CalendarIcon = hugeicon(Calendar03Icon, "CalendarIcon");
export const CaretDownIcon = hugeicon(ArrowDown01Icon, "CaretDownIcon");
export const CaretLeftIcon = hugeicon(ArrowLeft01Icon, "CaretLeftIcon");
export const CaretRightIcon = hugeicon(ArrowRight01Icon, "CaretRightIcon");
export const CaretUpDownIcon = hugeicon(UnfoldMoreIcon, "CaretUpDownIcon");
export const CaretUpIcon = hugeicon(ArrowUp01Icon, "CaretUpIcon");
export const CheckIcon = hugeicon(Tick02Icon, "CheckIcon");
export const CopyIcon = hugeicon(Copy01Icon, "CopyIcon");
export const CopySimpleIcon = hugeicon(Copy01Icon, "CopySimpleIcon");
export const EyeIcon = hugeicon(ViewIcon, "EyeIcon");
export const EyeSlashIcon = hugeicon(ViewOffIcon, "EyeSlashIcon");

export const GlobeHemisphereWestIcon = hugeicon(
  Globe02Icon,
  "GlobeHemisphereWestIcon"
);

export const InfoIcon = hugeicon(InformationCircleIcon, "InfoIcon");

export const MagnifyingGlassIcon = hugeicon(
  Search01Icon,
  "MagnifyingGlassIcon"
);

export const MinusIcon = hugeicon(MinusSignIcon, "MinusIcon");
export const WarningCircleIcon = hugeicon(AlertCircleIcon, "WarningCircleIcon");
export const XIcon = hugeicon(Cancel01Icon, "XIcon");

export const Eye = EyeIcon;
export const EyeSlash = EyeSlashIcon;
export const Info = InfoIcon;
export const X = XIcon;

export const DotsThreeIcon = hugeicon(MoreHorizontalIcon, "DotsThreeIcon");
export const EnvelopeBlockIcon = hugeicon(MailBlock01Icon, "EnvelopeBlockIcon");
export const EnvelopeSimpleIcon = hugeicon(Mail01Icon, "EnvelopeSimpleIcon");
export const FileArrowUpIcon = hugeicon(FileImportIcon, "FileArrowUpIcon");
export const FileCsvIcon = hugeicon(Csv01Icon, "FileCsvIcon");
export const GearSixIcon = hugeicon(Settings02Icon, "GearSixIcon");
export const HardDrivesIcon = hugeicon(ServerStack01Icon, "HardDrivesIcon");
export const HouseIcon = hugeicon(Home03Icon, "HouseIcon");
export const LayoutIcon = hugeicon(WebDesign01Icon, "LayoutIcon");

export const ListBulletsIcon = hugeicon(
  LeftToRightListBulletIcon,
  "ListBulletsIcon"
);

export const ListIcon = hugeicon(Menu01Icon, "ListIcon");
export const LockSimpleIcon = hugeicon(SquareLock02Icon, "LockSimpleIcon");

export const LockSimpleOpenIcon = hugeicon(
  SquareUnlock02Icon,
  "LockSimpleOpenIcon"
);

export const MegaphoneIcon = hugeicon(Megaphone01Icon, "MegaphoneIcon");

export const MonitorIcon = hugeicon(ComputerIcon, "MonitorIcon");
export const MoonIcon = hugeicon(Moon02Icon, "MoonIcon");
export const PaperPlaneTiltIcon = hugeicon(SentIcon, "PaperPlaneTiltIcon");
export const PencilSimpleIcon = hugeicon(PencilEdit02Icon, "PencilSimpleIcon");
export const PlusIcon = hugeicon(Add01Icon, "PlusIcon");
export const SidebarSimpleIcon = hugeicon(SidebarLeftIcon, "SidebarSimpleIcon");
export const SignOutIcon = hugeicon(Logout03Icon, "SignOutIcon");
export const SunIcon = hugeicon(Sun03Icon, "SunIcon");
export const TrashIcon = hugeicon(Delete02Icon, "TrashIcon");
export const UsersIcon = hugeicon(UserMultipleIcon, "UsersIcon");
export const WarningIcon = hugeicon(Alert02Icon, "WarningIcon");
