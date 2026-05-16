# GDGoC Hackathon Team 12 - Project Instructions

## Environment Setup
- **Python Virtual Environment**: Use the `.venv` directory. Activate it with `source .venv/bin/activate`.
- **Dependencies**: Managed via `requirements.txt`. Install with `pip install -r requirements.txt`.

## Workflow Conventions

- **Branching**: All work by Mayu should be done on the `cv/mayu` branch.
- **Pre-push Requirements**:
  - Always pull from `main` before pushing.
  - Check for crashes (build/runtime errors) after pulling and before pushing.
    - **Crash Check Command**: `python3 -m py_compile bodycv.py` (or other relevant scripts).
  - If a crash or conflict occurs, report it immediately and do not push until resolved.
