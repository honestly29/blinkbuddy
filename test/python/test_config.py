"""Unit tests for the detection-parameter defaults."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from python.config import DEFAULTS, get_config


class TestGetConfig:
    """get_config() returns the detection-parameter defaults."""

    def test_returns_all_default_keys(self):
        config = get_config()
        for key, value in DEFAULTS.items():
            assert config[key] == value

    def test_returns_a_copy(self):
        config = get_config()
        assert config is not DEFAULTS
        config["EAR_THRESHOLD"] = 999
        assert DEFAULTS["EAR_THRESHOLD"] == 0.21