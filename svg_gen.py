colors = {
    'b': 'var(--text-main)',          # outline / sunglasses
    'w': 'var(--glass-bg)',           # main body
    'g': 'rgba(150, 150, 150, 0.4)',  # grey stripes
    'r': 'white',                     # reflection
}

grid = [
    "        bb   bb          ",
    "       bwwb bwwb         ",
    "      bwwwwbwwwwb        ",
    "   bb bbbbbbbbbbb bb     ",
    "   b  bbbbbbbbbbb  b     ",
    "  bb  bbbbbrbbbbb  bb    ",
    "      bwwwwbbbbbwwb      ",
    "      bwwwwwwwwwwwb      ",
    "      bwwgwgwwwwwwb      ",
    "      bwwgwgwgwwwwb      ",
    "  bb  bwwgwgwgwwgwb      ",
    "  bwb bwgwwwwwwwggb  bbb ",
    "  bwbbbwgwwwwwwwgwb  bwb ",
    "   bbbwwbbgwwbbwwbbbbbwb ",
    "      b b  b  b  b b  bb ",
    "       bb   bb   bb      "
]

paths = {c: [] for c in colors}
for y, line in enumerate(grid):
    for x, char in enumerate(line):
        if char in colors:
            paths[char].append(f"M{x*2},{y*2} h2 v2 h-2 z")

svg = f'<svg viewBox="0 0 55 32" width="110" height="64" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">\n'
for char, path_list in paths.items():
    if path_list:
        svg += f'  <path fill="{colors[char]}" d="{" ".join(path_list)}" />\n'
svg += '</svg>'

with open('cat_output.txt', 'w') as f:
    f.write(svg)
