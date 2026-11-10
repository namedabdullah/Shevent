import httpx
import pandas as pd

from shevent_ml.images.download import download

MEDIA = pd.DataFrame(
    {
        "media_id": ["M-1", "M-2", "M-3", "M-4"],
        "vendor_id": ["PHO-001", "PHO-001", "DEC-002", "DEC-002"],
        "file_name": ["PHO-001_01.jpg", "PHO-001_02.jpg", "DEC-002_01.webp", "DEC-002_02.webp"],
        "source_url": [
            "https://cdn.test/a.jpg",
            "https://cdn.test/missing.jpg",
            "https://cdn.test/page.html",
            "https://cdn.test/b.webp",
        ],
    }
)


def fake_host(request):
    if request.url.path == "/a.jpg":
        return httpx.Response(200, content=b"jpeg bytes", headers={"content-type": "image/jpeg"})
    if request.url.path == "/b.webp":  # a WebP the host labels as a generic file
        return httpx.Response(
            200, content=b"RIFF\x00\x00\x00\x00WEBPVP8 ", headers={"content-type": "application/octet-stream"}
        )
    if request.url.path == "/page.html":
        return httpx.Response(200, content=b"<html>", headers={"content-type": "text/html"})
    return httpx.Response(404)


def test_images_are_saved_per_vendor_and_failures_leave_no_file(tmp_path):
    client = httpx.Client(transport=httpx.MockTransport(fake_host))
    saved, skipped, failures = download(MEDIA, tmp_path, delay=0, client=client, log=lambda _: None)
    assert (saved, skipped) == (2, 0)
    assert (tmp_path / "PHO-001" / "PHO-001_01.jpg").read_bytes() == b"jpeg bytes"
    assert [media_id for media_id, _ in failures] == ["M-2", "M-3"]  # a 404 and a page that isn't an image
    assert sorted(p.name for p in tmp_path.rglob("*") if p.is_file()) == ["DEC-002_02.webp", "PHO-001_01.jpg"]


def test_a_second_run_skips_what_is_already_saved(tmp_path):
    client = httpx.Client(transport=httpx.MockTransport(fake_host))
    download(MEDIA.head(1), tmp_path, delay=0, client=client, log=lambda _: None)
    assert download(MEDIA.head(1), tmp_path, delay=0, client=client, log=lambda _: None)[:2] == (0, 1)
