"""Unit tests for config loading."""

import json
import os
import sys

import pytest

# Add project root to path so we can import python.config
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from python.config import DEFAULTS, load_config


class TestLoadConfigDefaults:
    """Loads defaults when no config file exists."""

    # Ensures that when the config file does not exist,
    # load_config returns all values from DEFAULTS
    def test_returns_all_default_keys(self, tmp_path):
        missing = tmp_path / "nonexistent.json"
        config = load_config(str(missing))
        for key, value in DEFAULTS.items():
            assert config[key] == value

    # Ensures the returned config dictionary is a new copy
    # and not the same object as the DEFAULTS dictionary
    def test_returns_new_dict(self, tmp_path):
        missing = tmp_path / "nonexistent.json"
        config = load_config(str(missing))
        assert config is not DEFAULTS


class TestLoadConfigCustomValues:
    """Loads custom values from a valid config file."""

    # Checks that values defined in the JSON file override the defaults
    def test_overrides_defaults(self, tmp_path):
        config_file = tmp_path / "detection_config.json"
        config_file.write_text(json.dumps({"EAR_THRESHOLD": 0.25, "CONSEC_FRAMES": 3}))
        config = load_config(str(config_file))
        assert config["EAR_THRESHOLD"] == 0.25
        assert config["CONSEC_FRAMES"] == 3

    # Checks that unspecified parameters remain at their default values.
    def test_preserves_unset_defaults(self, tmp_path):
        config_file = tmp_path / "detection_config.json"
        config_file.write_text(json.dumps({"EAR_THRESHOLD": 0.25}))
        config = load_config(str(config_file))
        assert config["COOLDOWN_MS"] == DEFAULTS["COOLDOWN_MS"]
        assert config["TRACKING_QUALITY_THRESHOLD"] == DEFAULTS["TRACKING_QUALITY_THRESHOLD"]

    # Verifies that extra keys not present in DEFAULTS are still accepted and passed through into the returned configuration.
    def test_accepts_extra_keys(self, tmp_path):
        config_file = tmp_path / "detection_config.json"
        config_file.write_text(json.dumps({"PARTIAL_BLINK_THRESHOLD": 0.26}))
        config = load_config(str(config_file))
        assert config["PARTIAL_BLINK_THRESHOLD"] == 0.26


class TestLoadConfigPartialFile:
    """Falls back to defaults for missing keys in a partial config file."""

    # Ensures that when only some parameters are provided,
    # the remaining ones are filled in from DEFAULTS.
    def test_partial_config_fills_missing(self, tmp_path):
        config_file = tmp_path / "detection_config.json"
        config_file.write_text(json.dumps({"CONSEC_FRAMES": 4}))
        config = load_config(str(config_file))
        assert config["CONSEC_FRAMES"] == 4
        assert config["EAR_THRESHOLD"] == DEFAULTS["EAR_THRESHOLD"]
        assert config["COOLDOWN_MS"] == DEFAULTS["COOLDOWN_MS"]
        assert config["TRACKING_QUALITY_THRESHOLD"] == DEFAULTS["TRACKING_QUALITY_THRESHOLD"]


class TestLoadConfigCorrupted:
    """Handles corrupted config file gracefully."""

    # Ensures that invalid JSON does not crash the loader
    # and that default values are returned instead.
    def test_invalid_json_returns_defaults(self, tmp_path):
        config_file = tmp_path / "detection_config.json"
        config_file.write_text("{not valid json!!!")
        config = load_config(str(config_file))
        for key, value in DEFAULTS.items():
            assert config[key] == value

    # Confirms that a warning message is printed to stderr when the config file contains invalid JSON.
    def test_invalid_json_prints_warning(self, tmp_path, capsys):
        config_file = tmp_path / "detection_config.json"
        config_file.write_text("{bad json")
        load_config(str(config_file))
        captured = capsys.readouterr()
        assert "Warning" in captured.err or "could not load" in captured.err