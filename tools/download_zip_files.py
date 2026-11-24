"""
download_zip_files.py
---------------------
Downloads only SOME photos out of a huge online .zip file, without
downloading the whole thing.

The two datasets we used are each about 3.5 GB. We only needed about 5,000
photos from each, so instead of downloading 3.5 GB we use "HTTP range
requests": a .zip file keeps a table of contents at its end, so we read that
first, find where each photo we want is stored, and download just those bytes.

Usage:
    python3 download_zip_files.py <zip-url> <output-folder> <wanted-files.json>

<wanted-files.json> is a list of paths inside the zip (see make_photo_lists.py).
"""

import concurrent.futures
import io
import json
import os
import struct
import sys
import time
import urllib.request
import zipfile

HEADERS = {"User-Agent": "Mozilla/5.0 (asl-coach dataset tool)"}


class RemoteFile(io.RawIOBase):
    """Pretends a file on the internet is a local file, downloading only the bytes that are read."""

    def __init__(self, url):
        # Some servers refuse HEAD requests, so ask for the first byte to learn the size.
        request = urllib.request.Request(url, headers={**HEADERS, "Range": "bytes=0-0"})
        with urllib.request.urlopen(request) as response:
            self.url = response.geturl()
            self.size = int(response.headers["Content-Range"].split("/")[-1])
        self.position = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        if whence == 0:
            self.position = offset
        elif whence == 1:
            self.position += offset
        else:
            self.position = self.size + offset
        return self.position

    def readinto(self, buffer):
        if self.position >= self.size:
            return 0
        end = min(self.size, self.position + len(buffer)) - 1
        data = fetch_range(self.url, self.position, end)
        buffer[: len(data)] = data
        self.position += len(data)
        return len(data)


def fetch_range(url, start, end):
    """Downloads bytes start..end of a URL, retrying a few times if the connection drops."""
    request = urllib.request.Request(url, headers={**HEADERS, "Range": f"bytes={start}-{end}"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Could not download bytes {start}-{end}")


def download_one(url, info, output_folder):
    """Downloads and unpacks one file from the zip, using its exact byte position."""
    out_path = os.path.join(output_folder, info.filename.replace("/", "__").replace(" ", "_"))
    if os.path.exists(out_path):
        return
    start = info.header_offset
    end = start + 30 + len(info.filename.encode()) + 4096 + info.compress_size
    blob = fetch_range(url, start, end)
    # Each stored file starts with a 30-byte header, then its name, then an "extra" field.
    name_length, extra_length = struct.unpack("<HH", blob[26:30])
    data_start = 30 + name_length + extra_length
    data = blob[data_start : data_start + info.compress_size]
    if info.compress_type == zipfile.ZIP_DEFLATED:
        import zlib
        data = zlib.decompress(data, -15)
    with open(out_path, "wb") as out_file:
        out_file.write(data)


def main():
    url, output_folder, wanted_path = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(output_folder, exist_ok=True)
    remote = RemoteFile(url)
    archive = zipfile.ZipFile(io.BufferedReader(remote, buffer_size=1 << 16))
    wanted = set(json.load(open(wanted_path)))
    infos = [info for info in archive.infolist() if info.filename in wanted]
    print(f"Downloading {len(infos)} files...")
    # 6 at a time: more than that and the server starts dropping connections.
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(lambda info: download_one(remote.url, info, output_folder), infos))
    print("Done.")


if __name__ == "__main__":
    main()
