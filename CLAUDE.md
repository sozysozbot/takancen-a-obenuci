# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

A static web frontend for a searchable corpus of a fictitious language named **Takan-cen**, hosted on GitHub Pages. The language has Japanese-like grammar (simple noun declensions, complex verb conjugations) and a mixed writing system with logograms and syllabaries.

The dictionary and the corpus will be given in two separate JSON files. The frontend should display the sentences in the corpus based on the content of the dictionary.

## Architecture

- **Target**: GitHub Pages (static hosting — no server-side code)
- **Approach**: Pure frontend (HTML/CSS/JS)
- No backend; any search/filtering logic runs entirely in the browser

## About the User

- Native Japanese speaker, fluent English, working knowledge of Spanish/Chinese/French/Korean
- Strong background in TypeScript, Rust, ECMAScript spec details, and compiler implementation
- Limited experience with frontend libraries/frameworks (React, etc.) — prefers explicit, understandable code
- Prefers SVG for diagrams; constructs them with Inkscape or hand-written XML
- New to coding agents — prefers being shown what's happening rather than having things done silently
