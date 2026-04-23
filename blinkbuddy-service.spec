# blinkbuddy-service.spec
# -*- mode: python ; coding: utf-8 -*-

# PyInstaller executes this file as Python code at build time to
# learn what to include in the bundle.
import glob
from PyInstaller.utils.hooks import collect_all

# Run collect_all for both critical deps
mediapipe_datas, mediapipe_binaries, mediapipe_hiddenimports = collect_all('mediapipe')
numpy_datas, numpy_binaries, numpy_hiddenimports = collect_all('numpy')

# Find the pre-built cache file from scripts/build-python.mjs
# so first launch skips matplotlib's font scan.
mpl_cache_datas = [(p, 'matplotlib-cache') for p in glob.glob('build/.matplotlib-cache/fontlist-v*.json')]

# Analysis: the first pass - PyInstaller follows imports from the
# entry script and decides what needs to go in the bundle.
a = Analysis(
    # Entry point
    ['blinkbuddy_service.py'],
    pathex=['.'],

    # Native library files (.dylib, .so) that must ship alongside
    # the Python code.
    binaries=mediapipe_binaries + numpy_binaries,

    # Non-Python data files to bundle.
    datas=mediapipe_datas + numpy_datas + mpl_cache_datas + [
        ('python/models/face_landmarker_v2.task', 'models'),
    ],
    hiddenimports=mediapipe_hiddenimports + numpy_hiddenimports + [
        'mediapipe.tasks.python.vision.face_landmarker',
        'mediapipe.tasks.python.core.base_options',
        'mediapipe.tasks.python.vision.core.vision_task_running_mode',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],

    # Drop the legacy MediaPipe Solutions API because we only use
    # the newer Tasks API
    excludes=['mediapipe.python.solutions'],
    noarchive=False,
)

# PYZ: bundle all pure-Python modules into a single zipped archive
# inside the bundle.
pyz = PYZ(a.pure, a.zipped_data)

# EXE: define the executable itself (the launcher).
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='blinkbuddy-service',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch='arm64',   
    codesign_identity=None,
    entitlements_file=None,
)

# COLLECT: gather the launcher, binaries, and data files into the
# final blinkbuddy-service/ directory
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='blinkbuddy-service',
)