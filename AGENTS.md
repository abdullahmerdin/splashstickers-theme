# Project delivery directive

- When the user requests a project change, publish the task's intended files directly to `origin/master` without asking for a separate push confirmation.
- Preserve unrelated working-tree changes and stage only files belonging to the requested change.
- Run the relevant validation before pushing and report the commit and push result.
