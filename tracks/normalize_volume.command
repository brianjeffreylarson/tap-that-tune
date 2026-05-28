#!/bin/bash
# Volume normalization for Brad Names Tunes practice library
# Normalizes every MP3 to -14 LUFS (Spotify standard) using ffmpeg loudnorm.
# Resumable: files already normalized are skipped automatically.
#
# Double-click this file in Finder, or run from Terminal.

set -e
cd "$(dirname "$0")"

# ---------- ffmpeg check ----------
# Look in: (1) this folder, (2) PATH, (3) common locations
if [ -x "./ffmpeg" ]; then
    export PATH="$(pwd):$PATH"
    echo "✓ Using ffmpeg from this folder: $(pwd)/ffmpeg"
elif command -v ffmpeg &> /dev/null; then
    echo "✓ Using system ffmpeg: $(which ffmpeg)"
elif [ -x "/opt/homebrew/bin/ffmpeg" ]; then
    export PATH="/opt/homebrew/bin:$PATH"
    echo "✓ Using ffmpeg from /opt/homebrew/bin"
elif [ -x "/usr/local/bin/ffmpeg" ]; then
    export PATH="/usr/local/bin:$PATH"
    echo "✓ Using ffmpeg from /usr/local/bin"
else
    echo "❌ ffmpeg is not installed."
    echo ""
    echo "EASIEST FIX: drop an ffmpeg binary into this folder ($(pwd))."
    echo "  Download from: https://evermeet.cx/ffmpeg/"
    echo "  - If you have an Apple Silicon Mac (M1/M2/M3/M4): get the ARM build"
    echo "  - If you have an Intel Mac: get the x86_64 build"
    echo "  Unzip, then drag the 'ffmpeg' file into this tracks folder."
    echo ""
    echo "Then double-click this .command file again."
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

# ---------- mutagen check ----------
if ! python3 -c "import mutagen" 2>/dev/null; then
    echo "Installing mutagen (for ID3 tag handling)..."
    python3 -m pip install --user mutagen --quiet || {
        echo "❌ Failed to install mutagen. Try: pip3 install mutagen"
        read -p "Press Enter to close..."
        exit 1
    }
fi

echo "🎚  Brad Names Tunes — Volume Normalization"
echo "=================================="
echo "Target: -14 LUFS (Spotify standard)"
echo "Folder: $(pwd)"
echo ""

# Run the Python worker
python3 <<'PYEOF'
import os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from mutagen.id3 import ID3, ID3NoHeaderError, TXXX

FOLDER = os.getcwd()
TARGET_LUFS = -14
MARKER_KEY = "LUFS_NORMALIZED"

def needs_normalize(path):
    try:
        tag = ID3(path)
        for k in tag.keys():
            if k.startswith('TXXX'):
                if tag[k].desc == MARKER_KEY:
                    return False
        return True
    except (ID3NoHeaderError, Exception):
        return True

def normalize_one(rel_path):
    src = os.path.join(FOLDER, rel_path)
    if not needs_normalize(src):
        return rel_path, 'skip', 0
    tmp = src + ".norm.mp3"
    cmd = [
        'ffmpeg','-y','-v','error',
        '-i', src,
        '-af', f'loudnorm=I={TARGET_LUFS}:TP=-1:LRA=11',
        '-c:a','libmp3lame','-b:a','192k',
        '-ar','44100','-ac','2',
        '-map_metadata','0',
        '-id3v2_version','3',
        tmp
    ]
    t0 = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except: pass
        return rel_path, 'fail', r.stderr[:120]
    try:
        try:
            orig_tag = ID3(src)
        except ID3NoHeaderError:
            orig_tag = ID3()
        try:
            new_tag = ID3(tmp)
        except ID3NoHeaderError:
            new_tag = ID3()
        for frame_key in ['TIT2','TPE1','TALB','TIT1','TCON','COMM']:
            new_tag.delall(frame_key)
            if frame_key in orig_tag:
                new_tag.add(orig_tag[frame_key])
        new_tag.delall('TXXX:'+MARKER_KEY)
        new_tag.add(TXXX(encoding=3, desc=MARKER_KEY, text=str(TARGET_LUFS)))
        new_tag.save(tmp)
    except Exception as e:
        return rel_path, 'tag_err', str(e)[:120]
    os.replace(tmp, src)
    return rel_path, 'ok', round(time.time() - t0, 1)

# Clean any leftover temp files from prior interrupted runs FIRST
import glob
removed_temps = 0
for pat in [os.path.join(FOLDER, sub, '*.norm.mp3') for sub in ['Easy','Medium','Hard']]:
    for f in glob.glob(pat):
        try:
            os.remove(f)
            removed_temps += 1
        except: pass
if removed_temps:
    print(f"🧹 Cleaned up {removed_temps} leftover temp files from prior run")

# Find all real MP3s in Easy/Medium/Hard (excluding any .norm.mp3 temp files)
files = []
for sub in ['Easy','Medium','Hard']:
    sub_path = os.path.join(FOLDER, sub)
    if not os.path.isdir(sub_path):
        continue
    for f in os.listdir(sub_path):
        if f.endswith('.mp3') and not f.endswith('.norm.mp3'):
            files.append(os.path.join(sub, f))

needs_work = [f for f in files if needs_normalize(os.path.join(FOLDER, f))]
total_done = len(files) - len(needs_work)
print(f"📊 Total MP3s:        {len(files)}")
print(f"   Already normalized: {total_done}")
print(f"   To process:         {len(needs_work)}")
print()
if not needs_work:
    print("✅ Everything is already normalized!")
    sys.exit(0)

# Choose worker count based on CPU count
import multiprocessing
workers = max(2, min(8, multiprocessing.cpu_count() - 1))
print(f"🚀 Starting with {workers} parallel workers...")
print()

results = {'ok': 0, 'fail': 0, 'tag_err': 0, 'skip': 0}
start = time.time()
done = 0
with ThreadPoolExecutor(max_workers=workers) as ex:
    futures = {ex.submit(normalize_one, f): f for f in needs_work}
    for fut in as_completed(futures):
        rel, status, info = fut.result()
        results[status] = results.get(status, 0) + 1
        done += 1
        if done % 10 == 0 or done == len(needs_work) or status in ('fail','tag_err'):
            elapsed = time.time() - start
            rate = done / elapsed if elapsed else 0
            eta = (len(needs_work) - done) / rate if rate else 0
            print(f"  [{done:>4}/{len(needs_work)}]  {status:7}  rate {rate:.1f}/s  ETA {eta:.0f}s  -  {rel}")

elapsed = time.time() - start
print()
print("=" * 40)
print(f"✅ DONE in {elapsed:.0f}s ({elapsed/60:.1f} min)")
print(f"   OK:         {results['ok']}")
print(f"   Failed:     {results.get('fail',0)}")
print(f"   Tag errors: {results.get('tag_err',0)}")
print()

# Refresh durations in songs.json
manifest_path = os.path.join(FOLDER, 'songs.json')
if os.path.exists(manifest_path):
    import json
    print("📝 Refreshing durations in songs.json...")
    with open(manifest_path) as f:
        data = json.load(f)
    for s in data['songs']:
        p = os.path.join(FOLDER, s['file'])
        if os.path.exists(p):
            r = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', p], capture_output=True, text=True)
            try: s['duration'] = round(float(r.stdout.strip()), 2)
            except: pass
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("   Done.")
print()
print("🎉 All songs normalized to -14 LUFS!")
PYEOF

echo ""
read -p "Press Enter to close..."
