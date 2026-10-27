# First Version Implementation Plan

**Goal:** Запускаемая на собственном сервере совместная музыкальная доска.

**Architecture:** Node.js HTTP server persists board objects in SQLite and streams per-board events to clients. The browser creates, edits and moves individual objects and sends transient cursors. A secret URL gives edit access.

**Tech stack:** Node.js 24, built-in SQLite, server-sent events, vanilla HTML/CSS/JS, Docker.

**Spec:** docs/superpowers/specs/2026-10-22-first-version-design.md

- [ ] Test board creation, object persistence, validation and event delivery against the running server.
- [ ] Implement durable board storage and isolated live event streams.
- [ ] Build a responsive canvas with drawing, notes, chords, cursor presence and connectivity feedback.
- [ ] Supply Docker and self-hosted deployment instructions.
- [ ] Run automated tests and inspect the application in a browser; disclose limitations.
