"""Tests for openai-image-gen helpers."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from gen import request_images, write_gallery


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _tb):
        return False


def test_request_images_includes_stream_and_moderation_for_gpt_models():
    captured_body = {}

    def fake_urlopen(req, timeout=300):
        body = req.data.decode("utf-8")
        captured_body.update(json.loads(body))
        return _FakeResponse({"data": [{"url": "https://example.com/image.png"}]})

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        request_images(
            api_key="test-key",
            prompt="test prompt",
            model="gpt-image-1",
            size="1024x1024",
            quality="high",
            stream=True,
            moderation="low",
        )

    assert captured_body.get("stream") is True
    assert captured_body.get("moderation") == "low"


def test_request_images_omits_stream_and_moderation_for_dalle_models():
    captured_body = {}

    def fake_urlopen(req, timeout=300):
        body = req.data.decode("utf-8")
        captured_body.update(json.loads(body))
        return _FakeResponse({"data": [{"url": "https://example.com/image.png"}]})

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        request_images(
            api_key="test-key",
            prompt="test prompt",
            model="dall-e-3",
            size="1024x1024",
            quality="standard",
            stream=True,
            moderation="low",
        )

    assert "stream" not in captured_body
    assert "moderation" not in captured_body


def test_write_gallery_escapes_prompt_xss():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir)
        items = [{"prompt": '<script>alert("xss")</script>', "file": "001-test.png"}]
        write_gallery(out, items)
        html = (out / "index.html").read_text()
        assert "<script>" not in html
        assert "&lt;script&gt;" in html


def test_write_gallery_escapes_filename():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir)
        items = [{"prompt": "safe prompt", "file": '" onload="alert(1)'}]
        write_gallery(out, items)
        html = (out / "index.html").read_text()
        assert 'onload="alert(1)"' not in html
        assert "&quot;" in html


def test_write_gallery_escapes_ampersand():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir)
        items = [{"prompt": "cats & dogs <3", "file": "001-test.png"}]
        write_gallery(out, items)
        html = (out / "index.html").read_text()
        assert "cats &amp; dogs &lt;3" in html


def test_write_gallery_normal_output():
    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir)
        items = [
            {"prompt": "a lobster astronaut, golden hour", "file": "001-lobster.png"},
            {"prompt": "a cozy reading nook", "file": "002-nook.png"},
        ]
        write_gallery(out, items)
        html = (out / "index.html").read_text()
        assert "a lobster astronaut, golden hour" in html
        assert 'src="001-lobster.png"' in html
        assert "002-nook.png" in html

