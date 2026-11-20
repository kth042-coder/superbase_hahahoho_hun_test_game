import type { SVGProps } from "react";

/** 선 굵기 2px 라인 아이콘 (PRD 9.5) */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const LeafIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z" />
    <path d="M5 19l8-8" />
  </Icon>
);
export const SproutIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 21v-9" />
    <path d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6z" />
    <path d="M12 10c0-4 3-6 7-6 0 4-3 6-7 6z" />
  </Icon>
);
export const TrophyIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
    <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
    <path d="M12 13v4M8 20h8M10 17h4" />
  </Icon>
);
export const MessageIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 5h16v11H9l-5 4V5z" />
  </Icon>
);
export const VolumeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 10v4h4l5 4V6L8 10H4z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
  </Icon>
);
export const MuteIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 10v4h4l5 4V6L8 10H4z" />
    <path d="M17 10l4 4M21 10l-4 4" />
  </Icon>
);
export const PatternIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M4 12h16M12 4v16" />
  </Icon>
);
export const PauseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 5v14M15 5v14" />
  </Icon>
);
export const PlayIcon = (p: P) => (
  <Icon {...p}>
    <path d="M7 5l12 7-12 7V5z" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const ArrowLeftIcon = (p: P) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
export const ArrowRightIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);
export const ArrowDownIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 9l7 7 7-7" />
  </Icon>
);
export const HardDropIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 5l6 6 6-6M6 11l6 6 6-6M5 20h14" />
  </Icon>
);
export const RotateCwIcon = (p: P) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    <path d="M20 4v5h-5" />
  </Icon>
);
export const RotateCcwIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 12a8 8 0 1 0 2.3-5.7" />
    <path d="M4 4v5h5" />
  </Icon>
);
export const HoldIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="7" width="16" height="13" rx="2" />
    <path d="M8 7V4h8v3M9 13h6" />
  </Icon>
);
