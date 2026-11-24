"""
make_photo_lists.py
-------------------
Decides WHICH photos to download from each dataset, and writes the lists
used by download_zip_files.py.

Dataset 1 has 1,500 photos per letter: numbers 1-500, 501-1000, and
1001-1500 are three different people. We take every 7th photo from each
person (70 per person per letter), so all three people are represented.

Dataset 2 is frames from videos. We take 70 frames per letter from the main
recordings, 70 from the "controlled evaluation" videos, and 30 test photos,
spread evenly through each video.

Usage:
    python3 make_photo_lists.py <dataset2-file-listing.json>
(dataset 2's file names aren't predictable, so its listing is read from the zip first.)
"""

import json
import re
import sys

LETTERS = "A B C D E F G H I K L M N O P Q R S T U V W X Y".split()


def dataset1_list():
    """Every 7th photo inside each person's block of 500, for each letter."""
    names = []
    for letter in LETTERS:
        for block_start in (1, 501, 1001):
            for k in range(70):
                number = block_start + 3 + k * 7
                names.append(f"Root/Type_01_(Raw_Gesture)/{letter}/{letter}_{number}.jpg")
    return names


def dataset2_list(all_names):
    """Evenly spaced frames from each folder of dataset 2."""
    groups = {}
    for name in all_names:
        parts = name.split("/")
        if name.endswith("/") or name.startswith("__MACOSX") or not name.endswith(".jpg"):
            continue
        if parts[0] == "Dataset_Original" and parts[2] in LETTERS:
            groups.setdefault((parts[1], parts[2]), []).append(name)
        elif parts[0] == "Controlled Evaluation Dataset" and parts[1] in LETTERS:
            groups.setdefault(("Eval", parts[1]), []).append(name)
    wanted = []
    for (kind, _letter), files in groups.items():
        files.sort(key=lambda n: (n.split("/")[-1].split("-img-")[0], int(re.findall(r"(\d+)\.jpg$", n)[0])))
        count = {"Train": 70, "Eval": 70, "Test": 30}[kind]
        step = max(1, len(files) // count)
        wanted += files[::step][:count]
    return wanted


if __name__ == "__main__":
    json.dump(dataset1_list(), open("dataset1-wanted.json", "w"))
    if len(sys.argv) > 1:
        json.dump(dataset2_list(json.load(open(sys.argv[1]))), open("dataset2-wanted.json", "w"))
    print("Wrote the photo lists.")
