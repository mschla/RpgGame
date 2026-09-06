"""Render isometric sprites and tiles for Shadows of Bramblewick with Blender.

The camera matches the Flare art the game already uses: 2:1 dimetric, one Blender unit is one map
tile (96x48 px on screen), and the sprite origin is the projection of the world origin (a creature's
feet). Map x runs screen right-down and map y screen left-down; in Blender those are the Y and X
axes respectively (the game's tile frame is a mirror of Blender's), which only matters for facing.

Run inside Blender or with the pip `bpy` module:

    blender -b -P tools/blender/render_iso.py -- props [--out assets/extra] [--engine CYCLES|EEVEE]
    python  tools/blender/render_iso.py props

    # an animated creature from your own .blend (an armature or mesh named --object):
    blender -b -P tools/blender/render_iso.py -- creature --blend wolf.blend --object Wolf --name wolf \
        --actions stance=Idle,run=Run,swing=Bite,hit=Hit,die=Death [--frames 8] [--scale 1.0] [--forward -Y]

    # sanity check of directions and lighting with a probe object:
    python tools/blender/render_iso.py test-dirs

`props` writes assets/extra/<name>.png plus assets/extra/tiles.json; `creature` writes
assets/extra/<name>.png, <name>.json and adds the name to assets/extra/sprites.json.
The game picks these up automatically (see js/game/assets.js).
"""
import argparse
import json
import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

TILE_W = 96                      # pixels across one map tile diamond
PX_PER_UNIT = TILE_W / math.sqrt(2)   # horizontal pixels per world unit along a tile edge
RENDER_PX = 640                  # render size (square); larger objects can raise this with --size
# Flare direction index -> facing vector in map (world XY) space. 0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW on screen.
DIR_VECTORS = [(-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1)]


# ---------------------------------------------------------------- scene
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_render(engine, size=RENDER_PX):
    scene = bpy.context.scene
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    engines = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
    if engine == 'EEVEE':
        engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    scene.render.engine = engine
    if engine == 'CYCLES':
        scene.cycles.samples = 64
        scene.cycles.use_denoising = True
        scene.cycles.device = 'CPU'
    return scene


def setup_camera(scene, size=RENDER_PX):
    """Orthographic camera at 30 degrees elevation. The azimuth is chosen so that world +X projects
    to screen right-down and +Y to screen left-down, matching the game's tile axes."""
    cam_data = bpy.data.cameras.new('IsoCam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = size / PX_PER_UNIT
    cam_data.clip_end = 500
    cam = bpy.data.objects.new('IsoCam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    for az in (45, 135, 225, 315):
        cam.rotation_euler = (math.radians(60), 0, math.radians(az))
        view = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
        cam.location = -view * 60
        bpy.context.view_layer.update()
        ox, oy = project(scene, cam, Vector((0, 0, 0)), size)
        xx, xy = project(scene, cam, Vector((1, 0, 0)), size)
        yx, yy = project(scene, cam, Vector((0, 1, 0)), size)
        # map x = Blender Y (screen right-down), map y = Blender X (screen left-down); the game's
        # tile frame is a mirror of Blender's, so the axes are swapped rather than the image flipped
        if yx > ox and yy > oy and xx < ox and xy > oy:
            return cam
    raise RuntimeError('could not orient camera')


def project(scene, cam, point, size):
    """World point -> pixel coordinates (x right, y down)."""
    co = world_to_camera_view(scene, cam, point)
    return co.x * size, (1 - co.y) * size


def setup_lights(scene, cam):
    sun_data = bpy.data.lights.new('Sun', 'SUN')
    sun_data.energy = 3.0
    sun_data.angle = math.radians(5)
    sun = bpy.data.objects.new('Sun', sun_data)
    scene.collection.objects.link(sun)
    # light from the upper left of the screen, a little in front of the camera
    az = cam.rotation_euler.z - math.radians(60)
    sun.rotation_euler = (math.radians(45), 0, az)
    fill_data = bpy.data.lights.new('Fill', 'SUN')
    fill_data.energy = 0.9
    fill = bpy.data.objects.new('Fill', fill_data)
    scene.collection.objects.link(fill)
    fill.rotation_euler = (math.radians(55), 0, cam.rotation_euler.z + math.radians(120))
    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.45, 0.47, 0.55, 1)
    bg.inputs[1].default_value = 0.35
    scene.world = world


# ---------------------------------------------------------------- materials
def material(name, color, roughness=0.8, noise=None, wave=None):
    """Principled material; `noise` = (scale, dark_color) mixes a noise pattern, `wave` = (scale, dark_color)
    adds horizontal bands (logs, planks)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = roughness
    color = (*color, 1)
    if noise or wave:
        mix = nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.inputs[6].default_value = color
        mix.inputs[7].default_value = (*(noise or wave)[1], 1)
        coord = nodes.new('ShaderNodeTexCoord')
        if noise:
            tex = nodes.new('ShaderNodeTexNoise')
            tex.inputs['Scale'].default_value = noise[0]
            tex.inputs['Detail'].default_value = 4
            links.new(coord.outputs['Object'], tex.inputs['Vector'])
            links.new(tex.outputs['Fac'], mix.inputs[0])
        else:
            tex = nodes.new('ShaderNodeTexWave')
            tex.wave_type = 'BANDS'
            tex.bands_direction = 'Z'
            tex.wave_profile = 'SAW'
            tex.inputs['Scale'].default_value = wave[0]
            tex.inputs['Distortion'].default_value = 0.6
            tex.inputs['Detail'].default_value = 2
            links.new(coord.outputs['Object'], tex.inputs['Vector'])
            links.new(tex.outputs['Fac'], mix.inputs[0])
        links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = color
    return m


def add(obj, mat, name=None):
    o = bpy.context.active_object if obj is None else obj
    if name:
        o.name = name
    if mat:
        o.data.materials.append(mat)
    return o


def cube(loc, dims, mat, name=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = dims
    return add(o, mat, name)


def cylinder(loc, radius, depth, mat, name=None, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    return add(None, mat, name)


def cone(loc, radius, depth, mat, name=None):
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=radius, radius2=0, depth=depth, location=loc)
    return add(None, mat, name)


def prism(name, x0, x1, y_half, z0, z1, mat):
    """A gabled roof: triangular prism along X with ridge at z1."""
    verts = [(x0, -y_half, z0), (x1, -y_half, z0), (x1, y_half, z0), (x0, y_half, z0), (x0, 0, z1), (x1, 0, z1)]
    faces = [(0, 1, 5, 4), (3, 2, 5, 4), (0, 3, 4), (1, 2, 5), (0, 1, 2, 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


# ---------------------------------------------------------------- built-in props
def build_well():
    stone = material('stone', (0.40, 0.38, 0.36), noise=(6, (0.18, 0.17, 0.16)))
    wood = material('wood', (0.32, 0.20, 0.09), wave=(14, (0.16, 0.09, 0.04)))
    water = material('water', (0.03, 0.07, 0.14), roughness=0.1)
    tiles = material('shingle', (0.45, 0.13, 0.1), noise=(20, (0.25, 0.07, 0.06)))
    cylinder((0, 0, 0.24), 0.42, 0.48, stone, 'well_base', verts=16)
    cylinder((0, 0, 0.30), 0.30, 0.44, water, 'well_water', verts=16)
    cube((-0.38, 0, 0.9), (0.08, 0.08, 1.0), wood, 'post_l')
    cube((0.38, 0, 0.9), (0.08, 0.08, 1.0), wood, 'post_r')
    cylinder((0, 0, 1.28), 0.035, 0.9, wood, 'axle', rot=(0, math.radians(90), 0))
    cube((0.34, 0, 1.0), (0.05, 0.14, 0.02), wood, 'crank')
    prism('roof', -0.55, 0.55, 0.42, 1.36, 1.75, tiles)


def build_logblock():
    logs = material('logs', (0.34, 0.21, 0.10), wave=(6, (0.13, 0.07, 0.03)))
    shingle = material('shingles', (0.26, 0.17, 0.10), noise=(26, (0.12, 0.08, 0.05)))
    cube((0, 0, 0.9), (1.0, 1.0, 1.8), logs, 'wall')
    cube((0, 0, 1.86), (1.06, 1.06, 0.12), shingle, 'cap')


def build_palisade():
    wood = material('stakes', (0.40, 0.26, 0.12), wave=(12, (0.18, 0.10, 0.04)))
    n = 0
    for i in range(3):
        for j in range(3):
            x, y = -0.32 + i * 0.32, -0.32 + j * 0.32
            h = 1.35 + ((i * 7 + j * 3) % 4) * 0.08
            cylinder((x, y, h / 2), 0.15, h, wood, f'stake{n}', verts=10)
            cone((x, y, h + 0.12), 0.15, 0.24, wood, f'tip{n}')
            n += 1
    cube((0, 0, 0.9), (0.98, 0.06, 0.08), wood, 'brace_x')
    cube((0, 0, 0.9), (0.06, 0.98, 0.08), wood, 'brace_y')


def build_probe():
    """An asymmetric object for checking directions: a box with a long nose along -Y (its front)."""
    body = material('probe', (0.7, 0.2, 0.2))
    nose = material('nose', (0.9, 0.85, 0.2))
    cube((0, 0, 0.5), (0.5, 0.6, 1.0), body, 'body')
    cube((0, -0.55, 0.7), (0.2, 0.5, 0.2), nose, 'nose')


PROPS = {'well': build_well, 'logblock': build_logblock, 'palisade': build_palisade}


# ---------------------------------------------------------------- rendering helpers
def render_frame(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    w, h = img.size
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(img)
    return arr


def crop(arr, origin, margin=2):
    alpha = arr[:, :, 3] > 0.02
    ys, xs = np.where(alpha)
    if len(xs) == 0:
        return arr[:1, :1], (0, 0)
    x0, x1 = max(0, xs.min() - margin), min(arr.shape[1], xs.max() + margin + 1)
    y0, y1 = max(0, ys.min() - margin), min(arr.shape[0], ys.max() + margin + 1)
    ox, oy = origin[0] - x0, origin[1] - y0
    return arr[y0:y1, x0:x1], (int(round(ox)), int(round(oy)))


def pack(frames, max_w=2048):
    """Shelf-pack RGBA arrays. Returns (sheet, [(x, y)...])."""
    order = sorted(range(len(frames)), key=lambda i: -frames[i].shape[0])
    x = y = row_h = 0
    pos = [None] * len(frames)
    for i in order:
        h, w = frames[i].shape[:2]
        if x + w > max_w:
            x, y, row_h = 0, y + row_h, 0
        pos[i] = (x, y)
        x += w
        row_h = max(row_h, h)
    sheet = np.zeros((y + row_h, max(f.shape[1] for f in frames) if x == 0 and y == 0 else max_w if y > 0 else x, 4), dtype=np.float32)
    sheet = np.zeros((y + row_h, max(px + frames[i].shape[1] for i, (px, py) in enumerate(pos)), 4), dtype=np.float32)
    for i, (px, py) in enumerate(pos):
        h, w = frames[i].shape[:2]
        sheet[py:py + h, px:px + w] = frames[i]
    return sheet, pos


def save_image(arr, path, webp=False):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), width=w, height=h, alpha=True)
    img.pixels = arr[::-1].ravel().tolist()
    img.filepath_raw = path
    img.file_format = 'WEBP' if webp else 'PNG'
    img.save()
    bpy.data.images.remove(img)


def load_json(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f)


# ---------------------------------------------------------------- commands
def cmd_props(args):
    os.makedirs(args.out, exist_ok=True)
    tiles_path = os.path.join(args.out, 'tiles.json')
    catalog = load_json(tiles_path, {'tiles': {}})
    names = args.names or list(PROPS)
    with tempfile.TemporaryDirectory() as tmp:
        for name in names:
            clear_scene()
            scene = setup_render(args.engine, args.size)
            cam = setup_camera(scene, args.size)
            setup_lights(scene, cam)
            PROPS[name]()
            origin = project(scene, cam, Vector((0, 0, 0)), args.size)
            arr = render_frame(scene, os.path.join(tmp, name + '.png'))
            cropped, (ox, oy) = crop(arr, origin)
            file = name + '.png'
            save_image(cropped, os.path.join(args.out, file))
            catalog['tiles'][name] = [{'img': file, 'w': cropped.shape[1], 'h': cropped.shape[0], 'ox': ox, 'oy': oy, 'frames': [[0, 0, 0]]}]
            print(f'{name}: {cropped.shape[1]}x{cropped.shape[0]} origin ({ox},{oy})')
    save_json(tiles_path, catalog)
    print('wrote', tiles_path)


def facing_rotation(dir_index, forward):
    fx, fy = DIR_VECTORS[dir_index]
    target = math.atan2(fx, fy)   # map (x, y) -> Blender (y, x)
    fwd = {'-Y': (0, -1), '+Y': (0, 1), '+X': (1, 0), '-X': (-1, 0)}[forward]
    return target - math.atan2(fwd[1], fwd[0])


def render_directions(scene, cam, root, forward, frames_cb, size):
    """frames_cb(frame_index) -> None sets the pose. Returns rects[dir][frame] and cropped frames."""
    origin = project(scene, cam, Vector((0, 0, 0)), size)
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        for d in range(8):
            root.rotation_euler.z = facing_rotation(d, forward)
            row = []
            for f in frames_cb():
                bpy.context.view_layer.update()
                arr = render_frame(scene, os.path.join(tmp, f'd{d}f{f}.png'))
                row.append(crop(arr, origin))
            out.append(row)
    return out


def write_sprite(out_dir, name, anims_frames, durations, types, webp):
    """anims_frames: {anim: [dir][frame] -> (array, (ox, oy))}. Writes <name>.png/.webp and <name>.json."""
    flat, index = [], {}
    for an, dirs in anims_frames.items():
        for d, row in enumerate(dirs):
            for f, (arr, _) in enumerate(row):
                index[(an, d, f)] = len(flat)
                flat.append(arr)
    sheet, pos = pack(flat)
    img_file = f'{name}.webp' if webp else f'{name}.png'
    save_image(sheet, os.path.join(out_dir, img_file), webp)
    data = {'image': img_file, 'w': sheet.shape[1], 'h': sheet.shape[0], 'anims': {}}
    for an, dirs in anims_frames.items():
        rects = []
        for d, row in enumerate(dirs):
            rr = []
            for f, (arr, (ox, oy)) in enumerate(row):
                x, y = pos[index[(an, d, f)]]
                rr.append([x, y, arr.shape[1], arr.shape[0], ox, oy])
            rects.append(rr)
        data['anims'][an] = {'frames': len(dirs[0]), 'duration': durations.get(an, 600), 'type': types.get(an, 'looped'), 'rects': rects}
    save_json(os.path.join(out_dir, name + '.json'), data)
    lst_path = os.path.join(out_dir, 'sprites.json')
    lst = load_json(lst_path, [])
    if name not in lst:
        lst.append(name)
    save_json(lst_path, lst)
    print(f'wrote {img_file} ({sheet.shape[1]}x{sheet.shape[0]}) and {name}.json')


def cmd_test_dirs(args):
    os.makedirs(args.out, exist_ok=True)
    clear_scene()
    scene = setup_render(args.engine, args.size)
    cam = setup_camera(scene, args.size)
    setup_lights(scene, cam)
    build_probe()
    root = bpy.data.objects.new('root', None)
    scene.collection.objects.link(root)
    for o in list(scene.collection.objects):
        if o.type == 'MESH':
            o.parent = root
    frames = render_directions(scene, cam, root, '-Y', lambda: [0], args.size)
    write_sprite(args.out, 'probe', {'stance': frames}, {}, {}, False)


ANIM_TYPES = {'stance': 'back_forth', 'run': 'looped', 'swing': 'play_once', 'shoot': 'play_once', 'cast': 'play_once', 'hit': 'play_once', 'die': 'play_once'}
ANIM_DURATIONS = {'stance': 800, 'run': 533, 'swing': 400, 'shoot': 400, 'cast': 400, 'hit': 200, 'die': 800}


def cmd_creature(args):
    os.makedirs(args.out, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.blend))
    scene = setup_render(args.engine, args.size)
    root = bpy.data.objects[args.object]
    root.scale = (args.scale, args.scale, args.scale)
    cam = setup_camera(scene, args.size)
    setup_lights(scene, cam)
    for o in scene.objects:
        if o.type == 'LIGHT' and o.name not in ('Sun', 'Fill'):
            o.hide_render = True
    anims = {}
    for pair in args.actions.split(','):
        anim, action_name = pair.split('=')
        action = bpy.data.actions[action_name]
        if root.animation_data is None:
            root.animation_data_create()
        root.animation_data.action = action
        f0, f1 = action.frame_range
        n = args.frames if anim != 'stance' or args.frames < 4 else 4

        def frames_cb(f0=f0, f1=f1, n=n):
            for i in range(n):
                scene.frame_set(int(round(f0 + (f1 - f0) * i / max(1, n - 1 if ANIM_TYPES.get(anim) != 'looped' else n))))
                yield i
        anims[anim] = render_directions(scene, cam, root, args.forward, frames_cb, args.size)
        print(f'rendered {anim} ({n} frames x 8 directions)')
    write_sprite(args.out, args.name, anims, ANIM_DURATIONS, ANIM_TYPES, args.webp)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'extra'))
    ap.add_argument('--engine', default='CYCLES', help='CYCLES (works headless) or EEVEE (faster, needs a GPU)')
    ap.add_argument('--size', type=int, default=RENDER_PX, help='render canvas in pixels; raise for large objects')
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('props', help='render the built-in props')
    p.add_argument('names', nargs='*', help=f'subset of {", ".join(PROPS)}')
    sub.add_parser('test-dirs', help='render a probe object in 8 directions')
    c = sub.add_parser('creature', help='render an animated model from a .blend')
    c.add_argument('--blend', required=True)
    c.add_argument('--object', required=True, help='root object to rotate (armature or mesh)')
    c.add_argument('--name', required=True)
    c.add_argument('--actions', required=True, help='anim=Action pairs, e.g. stance=Idle,run=Walk,swing=Attack,hit=Hit,die=Death')
    c.add_argument('--frames', type=int, default=8)
    c.add_argument('--scale', type=float, default=1.0, help='model scale so that 1 unit = 1 map tile')
    c.add_argument('--forward', default='-Y', choices=['-Y', '+Y', '+X', '-X'], help="the model's forward axis")
    c.add_argument('--webp', action='store_true')
    args = ap.parse_args(argv)
    args.out = os.path.abspath(args.out)
    {'props': cmd_props, 'test-dirs': cmd_test_dirs, 'creature': cmd_creature}[args.cmd](args)


if __name__ == '__main__':
    main()
