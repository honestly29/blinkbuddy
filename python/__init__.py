"""Marks `python/` as a Python package. Intentionally empty.

An `__init__.py` file tells Python that the folder is a package, so that imports like `from python.main import ...` work. We need that import to work in two places:

  1. Local development, when we run `python -m python.main`.
  2. The packaged app, where `blinkbuddy_service.py` (at the repo root)
     is the entry point and imports from this package.
"""