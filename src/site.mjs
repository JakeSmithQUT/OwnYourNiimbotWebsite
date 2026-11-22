// Site settings, navigation, download files and printer pages.

export const SITE = {
  name: 'OwnYourNiimbot',
  url: 'https://ownyourniimbot.com',
  repo: 'JakeSmithQUT/OwnYourNiimbot',
  repoUrl: 'https://github.com/JakeSmithQUT/OwnYourNiimbot',
  websiteRepoUrl: 'https://github.com/JakeSmithQUT/OwnYourNiimbotWebsite',
  author: 'Jake Smith',
  description:
    'Free, open-source label designer for NIIMBOT label printers on Windows, macOS and Linux. Connect over Bluetooth or USB. No account, no cloud and no internet connection are needed.',
};

export const NAV = [
  { href: '/download/', label: 'Download' },
  { href: '/screenshots/', label: 'Screenshots' },
  { href: '/printers/', label: 'Printers' },
  { href: '/wiki/', label: 'Wiki' },
  { href: '/faq/', label: 'FAQ' },
];

/** Wiki sections in sidebar order. Each wiki page sets one of these in its front matter. */
export const WIKI_SECTIONS = ['Install and set up', 'Design labels', 'Data and batch printing', 'Printing', 'App and settings', 'Reference'];

/**
 * Release files that the download page offers. The pattern must match exactly
 * one file of the latest release. A required file that is missing stops the build.
 */
export const DOWNLOADS = [
  { id: 'windows-x64', os: 'windows', title: 'Windows installer', arch: 'x64', pattern: /^OwnYourNiimbot-[0-9.]+-windows-x64-setup\.exe$/, required: true, note: 'Windows 10 and 11 on Intel and AMD processors. Installs for your user and updates itself.' },
  { id: 'windows-arm64', os: 'windows', title: 'Windows installer', arch: 'Arm64', pattern: /^OwnYourNiimbot-[0-9.]+-windows-arm64-setup\.exe$/, note: 'Windows 11 on Arm, for example Snapdragon laptops.' },
  { id: 'windows-portable', os: 'windows', title: 'Windows portable', arch: 'x64', pattern: /^OwnYourNiimbot-[0-9.]+-windows-x64-portable\.exe$/, note: 'Runs without installation. Shows a link when a new version is available.' },
  { id: 'macos-arm64', os: 'macos', title: 'macOS disk image', arch: 'Apple silicon', pattern: /^OwnYourNiimbot-[0-9.]+-macos-arm64\.dmg$/, required: true, note: 'Macs with an M-series chip.' },
  { id: 'macos-x64', os: 'macos', title: 'macOS disk image', arch: 'Intel', pattern: /^OwnYourNiimbot-[0-9.]+-macos-x64\.dmg$/, note: 'Macs with an Intel processor.' },
  { id: 'linux-x64-appimage', os: 'linux', title: 'Linux AppImage', arch: 'x64', pattern: /^OwnYourNiimbot-[0-9.]+-linux-x86_64\.AppImage$/, required: true, note: 'Runs on most distributions and updates itself.' },
  { id: 'linux-x64-deb', os: 'linux', title: 'Debian and Ubuntu package', arch: 'x64', pattern: /^OwnYourNiimbot-[0-9.]+-linux-amd64\.deb$/, note: 'Installs with apt. Shows a link when a new version is available.' },
  { id: 'linux-arm64-appimage', os: 'linux', title: 'Linux AppImage', arch: 'Arm64', pattern: /^OwnYourNiimbot-[0-9.]+-linux-arm64\.AppImage$/, note: 'Linux on 64-bit Arm processors. Updates itself.' },
  { id: 'linux-arm64-deb', os: 'linux', title: 'Debian and Ubuntu package', arch: 'Arm64', pattern: /^OwnYourNiimbot-[0-9.]+-linux-arm64\.deb$/, note: 'Installs with apt.' },
];

export const OS_NAMES = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

/**
 * Printer pages. "models" are names from the model table in docs/supported-printers.md.
 * "rolls" are series names from src/printer/labels.json.
 */
export const PRINTER_PAGES = [
  { slug: 'd11', name: 'D11', models: ['D11', 'D11S', 'D11 H', 'D11 Pro'], rolls: ['D11'] },
  { slug: 'd110', name: 'D110', models: ['D110', 'D110 M', 'Hi-D110'], rolls: ['D110'] },
  { slug: 'd101', name: 'D101', models: ['D101'], rolls: ['D101'] },
  { slug: 'h1s', name: 'H1S', models: ['H1S', 'H1'], rolls: ['H1S'] },
  { slug: 'b18', name: 'B18', models: ['B18', 'B18S', 'N1'], rolls: ['B18 & N1', 'N1'] },
  { slug: 'b21', name: 'B21', models: ['B21', 'B21S', 'B21-C2B', 'B21-L2B', 'B21S-C2B', 'B21 Pro'], rolls: ['B21', 'B21 Pro'] },
  { slug: 'b1', name: 'B1', models: ['B1', 'B1 Pro', 'B1 SE'], rolls: ['B1', 'B1 Pro'] },
  { slug: 'b2', name: 'B2', models: ['B2', 'B2 Pro'], rolls: ['B2', 'B2 Pro'] },
  { slug: 'b3s', name: 'B3S', models: ['B3S', 'B3S A', 'B3S P'], rolls: ['B3S'] },
  { slug: 'b31', name: 'B31', models: ['B31'], rolls: ['B31'] },
  { slug: 'b4', name: 'B4', models: ['B4', 'B4 Pro'], rolls: ['B4'] },
  { slug: 'k3', name: 'K3', models: ['K3', 'K3 W', 'K3 ITD'], rolls: ['K3'] },
  { slug: 'm2', name: 'M2', models: ['M2 H'], rolls: ['M2'] },
  { slug: 'm3', name: 'M3', models: ['M3'], rolls: ['M3'] },
];

/** Label type numbers in labels.json and the printer protocol. */
export const LABEL_TYPES = {
  1: 'Gap (die-cut)',
  2: 'Black mark',
  3: 'Continuous',
  4: 'Perforated (hole)',
  5: 'Transparent',
  6: 'PVC tag',
  10: 'Black mark gap',
  11: 'Heat-shrink tube',
};
