# Feature: asaf-ui-implementation

## Description

I want each session to have ASAF view if applicable. The view will show the current ASAF sprint status, progress, summary etc.

## Context

The ASAF (Agile Sprint Automation Framework) system uses a folder structure at `asaf/<sprint-name>/` containing:
- `SUMMARY.md` - Human-readable sprint overview
- `.state.json` - Machine-readable sprint state
- `initial.md` - Feature description
- Additional files created during grooming, planning, implementation phases

The UI needs to:
1. Detect if the current project/session has an active ASAF sprint
2. Display sprint information in an accessible view within the session interface
3. Show real-time status, progress, and summary from ASAF files
4. Integrate seamlessly with existing Claude Code UI architecture (React + Tailwind)

## Requirements

- View should be session-specific (only show if ASAF sprint exists for current project)
- Display sprint metadata: name, phase, status, creation date
- Show progress indicators for sprint phases (grooming, planning, implementation, demo, retrospective)
- Render content from SUMMARY.md with markdown support
- Real-time updates when ASAF files change
- Mobile-responsive design consistent with existing UI patterns
- Integration with existing tab navigation system in MainContent.jsx

---

Created: 2025-10-29
Type: Full ASAF Sprint
