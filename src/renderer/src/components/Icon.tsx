import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'remote'
  | 'apps'
  | 'setup'
  | 'phone'
  | 'sun'
  | 'moon'
  | 'command'
  | 'search'
  | 'refresh'
  | 'power'
  | 'home'
  | 'back'
  | 'menu'
  | 'grid'
  | 'play'
  | 'rewind'
  | 'forward'
  | 'previous'
  | 'next'
  | 'volumeUp'
  | 'volumeDown'
  | 'mute'
  | 'wake'
  | 'link'
  | 'star'
  | 'chevron'
  | 'close'
  | 'check'
  | 'alert'
  | 'screen'
  | 'package'
  | 'keyboard'
  | 'radar'
  | 'trash'
  | 'sleep'
  | 'plug'
  | 'copy'
  | 'up'
  | 'down'
  | 'left'
  | 'right'

const PATHS: Record<IconName, ReactNode> = {
  remote: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="4" />
      <circle cx="12" cy="8" r="1.6" />
      <path d="M10 14h4M10 17.5h4" />
    </>
  ),
  apps: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  setup: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M11 18.5h2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5z" />,
  command: <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-.9 5" />
      <path d="M20 4v7h-7" />
    </>
  ),
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M6.5 7a8 8 0 1 0 11 0" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  back: (
    <>
      <path d="M10 5 3 12l7 7" />
      <path d="M3 12h13a5 5 0 0 1 0 10h-3" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  play: <path d="M8 5v14M16 5v14" />,
  rewind: (
    <>
      <path d="M11 5v14L2 12z" />
      <path d="M22 5v14l-9-7z" />
    </>
  ),
  forward: (
    <>
      <path d="M13 5v14l9-7z" />
      <path d="M2 5v14l9-7z" />
    </>
  ),
  previous: (
    <>
      <path d="M18 5v14L8 12z" />
      <path d="M6 5v14" />
    </>
  ),
  next: (
    <>
      <path d="M6 5v14l10-7z" />
      <path d="M18 5v14" />
    </>
  ),
  volumeUp: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  volumeDown: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </>
  ),
  mute: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </>
  ),
  wake: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M12 18v3M5 12H2M22 12h-3" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 13 4 4 10-10" />,
  alert: (
    <>
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  screen: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2.5" />
      <path d="M8 21h8" />
    </>
  ),
  package: (
    <>
      <path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="3" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </>
  ),
  radar: (
    <>
      <path d="M5 12.5a7 7 0 1 1 7 7" />
      <path d="M8.5 12.5a3.5 3.5 0 1 1 3.5 3.5" />
      <circle cx="12" cy="19.5" r="1" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13" />
    </>
  ),
  sleep: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5z" />,
  plug: (
    <>
      <path d="M9 3v6M15 3v6" />
      <path d="M6 9h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 18v3" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  up: <path d="m5 15 7-7 7 7" />,
  down: <path d="m5 9 7 7 7-7" />,
  left: <path d="m15 5-7 7 7 7" />,
  right: <path d="m9 5 7 7-7 7" />
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {PATHS[name]}
    </svg>
  )
}

export const remoteCommandIcons = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  select: 'check',
  home: 'home',
  back: 'back',
  menu: 'menu',
  appSwitch: 'grid',
  playPause: 'play',
  rewind: 'rewind',
  fastForward: 'forward',
  next: 'next',
  previous: 'previous',
  power: 'power',
  sleep: 'sleep',
  volumeUp: 'volumeUp',
  volumeDown: 'volumeDown',
  mute: 'mute',
  enter: 'check',
  delete: 'close'
} as const satisfies Record<string, IconName>
