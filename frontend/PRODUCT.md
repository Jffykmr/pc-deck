# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A person at their desk with a tablet docked next to the monitor, touched all day while they work in heavy desktop apps (CAD, 3D, video editing). Visitors see it too, so it also has to look good from two metres away.

## Product Purpose

Touch deck on a docked tablet (Android or iPad) that controls this PC: launch or focus apps, per-app command tiles (e.g. AutoCAD, Blender, Revit), window switcher, volume and media, live system stats, lock/sleep/shutdown, spacedesk start. Success: the user reaches any command in one touch without leaving the keyboard flow, and the screen never stutters.

## Positioning

A deck built around one person's real toolchain: it takes the colour and commands of the app in the foreground. A generic macro pad cannot know what is on this desk.

## Operating Context

Tablets: low-end Android (e.g. Android 10, 1280x800, weak GPU, Chrome) and iPad Safari, over plain HTTP on the local network. Always on, viewed from arm's length and from across the room. Windows 11 host serves the UI from `frontend/dist`. Screens: Deck, Finestre, Sistema, Imposta. Idle showcase ("vetrina") after N minutes: giant clock, track, live screen.

## Capabilities and Constraints

- UI language: Italian. Config (apps, command profiles) is edited on the tablet.
- Performance is a hard constraint: no backdrop-filter, no animated blur/shadow/text-shadow, no full-page transitions. The previous version flickered on this tablet until those were removed (`host-agent/diag.log`).
- Touch only: large targets, no hover.
- Live screen preview is low-rate (about 1 frame per 2 s, 880 px) because of tablet Wi-Fi.
- Stack: React 18, Tailwind 3, Vite, motion, Phosphor icons, Geist fonts. Existing API and store stay untouched.

## Evidence on Hand

Real app icons extracted from Windows, per-app brand colours in `data/config.json`. No photographs or brand assets of the studio provided; none to be invented.

## Product Principles

- Glanceable first: the state of the PC and the active app read in one look.
- One touch to act; destructive actions need a deliberate hold.
- The tablet's weak GPU is a design constraint, not an afterthought.
- It should look like a made object on a desk, not a dashboard template.
