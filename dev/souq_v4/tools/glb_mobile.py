"""Make a phone copy of a street GLB: same geometry (Draco buffers untouched), smaller textures.

iPhone Safari drops the WebGL context (the game then shows "توقف عرض اللعبة") when GPU memory runs out.
The desktop street textures take about 410 MB of GPU memory with mipmaps; these copies take about 25 MB.

usage: python3 glb_mobile.py in.glb out.glb
"""
import io, json, struct, sys
from PIL import Image

LIMITS = {'col': 1024, 'nrm': 512, 'orm': 256}   # longest side per map kind, by image name suffix
QUALITY = {'col': 82, 'nrm': 88, 'orm': 85}


def kind(name):
    for k in LIMITS:
        if name.endswith('_' + k): return k
    return 'col'


def rewrite(src, dst):
    b = open(src, 'rb').read()
    assert b[:4] == b'glTF'
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bin_hdr = 20 + jl
    bl = struct.unpack('<I', b[bin_hdr:bin_hdr + 4])[0]
    binb = b[bin_hdr + 8:bin_hdr + 8 + bl]
    views = j['bufferViews']
    data = [binb[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]
    for im in j.get('images', []):
        k = kind(im.get('name', ''))
        I = Image.open(io.BytesIO(data[im['bufferView']]))
        I.load()
        w, h = I.size
        s = min(1.0, LIMITS[k] / max(w, h))
        if s < 1:
            I = I.convert('RGB').resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
        out = io.BytesIO()
        I.convert('RGB').save(out, 'JPEG', quality=QUALITY[k], optimize=True)
        data[im['bufferView']] = out.getvalue()
        im['mimeType'] = 'image/jpeg'
    nb = bytearray()
    for v, d in zip(views, data):
        while len(nb) % 4: nb.append(0)
        v['byteOffset'] = len(nb)
        v['byteLength'] = len(d)
        nb += d
    while len(nb) % 4: nb.append(0)
    j['buffers'][0]['byteLength'] = len(nb)
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(nb)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(nb), b'BIN\x00')); f.write(nb)
    return total


if __name__ == '__main__':
    print(rewrite(sys.argv[1], sys.argv[2]))
