"""Rebuild original vector-style icons. Development only: Python 3 and Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / 'com.fafnyir.meldfade.sdPlugin' / 'images'
root.mkdir(parents=True, exist_ok=True)

def icon(name, size, active=True, monochrome=False):
    scale = 4
    image = Image.new('RGBA', (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    def points(coords):
        return [(int(x * size * scale / 72), int(y * size * scale / 72)) for x, y in coords]
    if not monochrome:
        draw.rounded_rectangle((0, 0, size*scale-1, size*scale-1), radius=size*scale*.18, fill='#191a24')
    for shift, color in [(15, '#51466f'), (8, '#8170bb'), (0, '#b8a5ff' if active else '#606472')]:
        if monochrome: color = '#ffffff'
        polygon = [(16, 22+shift), (36, 11+shift), (56, 22+shift), (36, 33+shift)]
        if active or monochrome:
            draw.polygon(points(polygon), fill=color)
        else:
            draw.line(points(polygon+[polygon[0]]), fill=color, width=2*scale)
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f'{name}.png')

for name, size, on, mono in [('plugin', 256, True, False), ('category', 28, True, True), ('action', 20, True, True), ('on', 72, True, False), ('off', 72, False, False)]:
    icon(name, size, on, mono)
    icon(name+'@2x', size*2, on, mono)
print('Icons generated.')
