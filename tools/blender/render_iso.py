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

    # the built-in procedurally animated creatures (stance, run, swing, hit, die in 8 directions):
    python tools/blender/render_iso.py --size 384 builtin wolf
    python tools/blender/render_iso.py --size 384 builtin rat

    # sanity check of directions and lighting with a probe object:
    python tools/blender/render_iso.py test-dirs

`props` writes assets/extra/<name>.png plus assets/extra/tiles.json; `creature` writes
assets/extra/<name>.png, <name>.json and adds the name to assets/extra/sprites.json.
The game picks these up automatically (see js/game/assets.js).
"""
import argparse
import functools
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


def setup_lights(scene, cam, key_az=-60, fill_az=120, fill_energy=0.9):
    """Sun plus a softer fill. `key_az` / `fill_az` are azimuths relative to the camera: the default key
    comes from the lower left of the screen, a little in front of the camera."""
    sun_data = bpy.data.lights.new('Sun', 'SUN')
    sun_data.energy = 3.0
    sun_data.angle = math.radians(5)
    sun = bpy.data.objects.new('Sun', sun_data)
    scene.collection.objects.link(sun)
    az = cam.rotation_euler.z + math.radians(key_az)
    sun.rotation_euler = (math.radians(45), 0, az)
    fill_data = bpy.data.lights.new('Fill', 'SUN')
    fill_data.energy = fill_energy
    fill = bpy.data.objects.new('Fill', fill_data)
    scene.collection.objects.link(fill)
    fill.rotation_euler = (math.radians(55), 0, cam.rotation_euler.z + math.radians(fill_az))
    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.45, 0.47, 0.55, 1)
    bg.inputs[1].default_value = 0.35
    scene.world = world


# ---------------------------------------------------------------- materials
def material(name, color, roughness=0.8, noise=None, wave=None, bump=None, wave_axis='Z', flat_axis=''):
    """Principled material; `noise` = (scale, dark_color) mixes a noise pattern, `wave` = (scale, dark_color)
    adds horizontal bands (logs, planks). `flat_axis` lists object axes ('X', 'Y', 'XY', ...) along which the
    textures stay constant, so a piece that is repeated along that axis tiles without a seam."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = roughness
    color = (*color, 1)

    def coords():
        coord = nodes.new('ShaderNodeTexCoord')
        if not flat_axis:
            return coord.outputs['Object']
        sep = nodes.new('ShaderNodeSeparateXYZ')
        comb = nodes.new('ShaderNodeCombineXYZ')
        links.new(coord.outputs['Object'], sep.inputs[0])
        for ax in 'XYZ':
            if ax in flat_axis:
                comb.inputs[ax].default_value = 0
            else:
                links.new(sep.outputs[ax], comb.inputs[ax])
        return comb.outputs[0]

    if noise or wave:
        mix = nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.inputs[6].default_value = color
        mix.inputs[7].default_value = (*(noise or wave)[1], 1)
        if noise:
            tex = nodes.new('ShaderNodeTexNoise')
            tex.inputs['Scale'].default_value = noise[0]
            tex.inputs['Detail'].default_value = 4
            links.new(coords(), tex.inputs['Vector'])
            links.new(tex.outputs['Fac'], mix.inputs[0])
        else:
            tex = nodes.new('ShaderNodeTexWave')
            tex.wave_type = 'BANDS'
            tex.bands_direction = wave_axis
            tex.wave_profile = 'SAW'
            tex.inputs['Scale'].default_value = wave[0]
            tex.inputs['Distortion'].default_value = 0.6
            tex.inputs['Detail'].default_value = 2
            links.new(coords(), tex.inputs['Vector'])
            links.new(tex.outputs['Fac'], mix.inputs[0])
        links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = color
    if bump:
        btex = nodes.new('ShaderNodeTexNoise')
        btex.inputs['Scale'].default_value = bump[0]
        btex.inputs['Detail'].default_value = 6
        btex.inputs['Roughness'].default_value = 0.7
        bnode = nodes.new('ShaderNodeBump')
        bnode.inputs['Strength'].default_value = bump[1]
        links.new(coords(), btex.inputs['Vector'])
        links.new(btex.outputs['Fac'], bnode.inputs['Height'])
        links.new(bnode.outputs['Normal'], bsdf.inputs['Normal'])
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


def build_planks():
    """A flat floor of wooden planks covering one tile, for bridges and tavern floors."""
    wood = material('planks', (0.21, 0.13, 0.06), wave=(22, (0.09, 0.05, 0.02)), bump=(40, 0.25), wave_axis='Y')
    beam = material('beam', (0.14, 0.09, 0.04), wave=(14, (0.07, 0.04, 0.02)), wave_axis='X')
    n = 7
    for i in range(n):
        x = -0.5 + (i + 0.5) / n
        cube((x, 0, 0.035 + 0.004 * (i % 2)), (0.86 / n, 1.0, 0.05), wood, f'plank{i}')
    cube((0, -0.47, 0.02), (1.0, 0.07, 0.06), beam, 'beam_a')
    cube((0, 0.47, 0.02), (1.0, 0.07, 0.06), beam, 'beam_b')


# ---------------------------------------------------------------- log houses
# Town buildings are assembled per tile by Renderer.drawBuilding from these pieces: a wall segment for
# each open SW / SE side (a doorway variant for 'd' tiles), a corner post, a roof cap (colour variants
# picked per building) and a rim beam along the roof's hidden NW / NE edges. Map x is Blender Y and map y
# is Blender X, so the SW face (normal +map y) is the +X face running along Y and the SE face is the +Y
# face running along X. Every piece stays inside its tile's 1x1 column so the renderer's x+y depth sort
# stays valid, and everything repeated along a wall is constant along that axis so segments join seamlessly.
LOG_RADII = [0.105, 0.095, 0.10, 0.095, 0.105, 0.10, 0.095, 0.10]
FOUNDATION = 0.08
WALL_H = FOUNDATION + 2 * sum(LOG_RADII)         # 1.67 tiles
DOOR_H = FOUNDATION + 2 * sum(LOG_RADII[:6])     # the two top courses run over the doorway
DOOR_HALF = 0.35                                 # half width of the doorway along the wall
FASCIA = 0.10                                    # board under the roof, flush with the walls
COURSES = 4                                      # shingle courses per tile, stepping down towards the SE edge
COURSE_T = 0.05                                  # thickness of a course
COURSE_RISE = 0.05                               # how much a course climbs over the one in front of it
ROOF_TOP = WALL_H + FASCIA + COURSE_T + COURSE_RISE
POST = 0.2
ROOF_COLORS = [(0.16, 0.095, 0.05), (0.19, 0.08, 0.055), (0.11, 0.125, 0.075)]   # brown, weathered red, mossy
# The house set is lit from the left of the screen (key) with a low fill from the front right: the shingle
# courses then throw a shadow onto the course in front of them, which a key from the lower left cannot do.
HOUSE_LIGHTS = {'key_az': -90, 'fill_az': 60, 'fill_energy': 0.9}
HOUSE_PROPS = ('logwall_sw', 'logwall_se', 'logdoor_sw', 'logdoor_se', 'logpost_s', 'logpost_w', 'logpost_e',
               'roof', 'roof_rim_nw', 'roof_rim_ne')


def wall_pt(face, along, across, z):
    """Point on a wall: `along` runs down the wall, `across` is the face-normal axis (face plane at +0.5)."""
    return (across, along, z) if face == 'sw' else (along, across, z)


def build_logwall(face, door=False):
    """Three tiles of horizontal log wall (the middle one is cropped out, see crop_strip)."""
    along = 'Y' if face == 'sw' else 'X'
    # dark, saturated wood so the walls sit with the Flare props (sign post, crates) rather than above them
    logs = material('logs', (0.18, 0.108, 0.048), noise=(9, (0.085, 0.048, 0.02)), bump=(28, 0.25), flat_axis=along)
    chink = material('chinking', (0.07, 0.058, 0.046), noise=(12, (0.035, 0.028, 0.024)), flat_axis=along)
    stone = material('footing', (0.17, 0.16, 0.15), noise=(10, (0.09, 0.08, 0.075)), flat_axis=along)
    frame = material('frame', (0.085, 0.052, 0.024), noise=(10, (0.05, 0.03, 0.014)), flat_axis='Z')
    dark = material('interior', (0.012, 0.009, 0.006), roughness=1.0)
    sill = material('sill', (0.03, 0.026, 0.022), roughness=1.0)
    rot = (math.radians(90), 0, 0) if face == 'sw' else (0, math.radians(90), 0)
    half = DOOR_HALF
    spans = [(-1.5, -half), (half, 1.5)] if door else [(-1.5, 1.5)]
    z = FOUNDATION
    for i, r in enumerate(LOG_RADII):
        z += r
        for a0, a1 in (spans if z - r < DOOR_H else [(-1.5, 1.5)]):
            cylinder(wall_pt(face, (a0 + a1) / 2, 0.5 - r, z), r, a1 - a0, logs, f'log{i}', rot=rot, verts=20)
        z += r
    for a0, a1 in spans:
        cube(wall_pt(face, (a0 + a1) / 2, 0.33, WALL_H / 2), wall_pt(face, a1 - a0, 0.22, WALL_H), chink, 'chinking')
        cube(wall_pt(face, (a0 + a1) / 2, 0.40, FOUNDATION / 2), wall_pt(face, a1 - a0, 0.20, FOUNDATION), stone, 'footing')
    if door:
        # the frame sits inside the chinking depth, behind the log crests, so no lit sliver of it pokes
        # out beside the opening and the wall next to the doorway matches the plain segment
        for s in (-1, 1):
            cube(wall_pt(face, s * (half - 0.035), 0.39, DOOR_H / 2), wall_pt(face, 0.07, 0.10, DOOR_H), frame, 'jamb')
        cube(wall_pt(face, 0, 0.39, DOOR_H - 0.04), wall_pt(face, 2 * half, 0.10, 0.08), frame, 'lintel')
        # the dark interior sits right behind the frame and a dark sill fills the opening down to the
        # ground and a little in front of the face, so no floor shows through the lower half of the doorway
        cube(wall_pt(face, 0, 0.27, WALL_H / 2), wall_pt(face, 1.0, 0.05, WALL_H), dark, 'interior')
        cube(wall_pt(face, 0, 0.39, FOUNDATION / 2 - 0.005), wall_pt(face, 2 * half + 0.04, 0.30, FOUNDATION - 0.01), sill, 'sill')


def build_logpost(corner):
    """Square corner post: 's' at the south corner (both faces open), 'w' / 'e' where a face ends."""
    wood = material('post', (0.135, 0.08, 0.036), noise=(12, (0.07, 0.04, 0.018)), bump=(40, 0.2), flat_axis='Z')
    h = 0.5 - POST / 2
    cx, cy = {'s': (h, h), 'w': (h, -h), 'e': (-h, h)}[corner]
    cube((cx, cy, WALL_H / 2), (POST, POST, WALL_H), wood, 'post')


def slab(name, x0, x1, y0, y1, z0, z1, mat):
    """A course of shingles: a box from y0 to y1 whose underside and top climb from z0 at y0 to z1 at y1,
    with vertical ends (the SE end is the exposed edge of the course)."""
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z1), (x0, y1, z1),
         (x0, y0, z0 + COURSE_T), (x1, y0, z0 + COURSE_T), (x1, y1, z1 + COURSE_T), (x0, y1, z1 + COURSE_T)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(v, [], f)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def roof_courses(mats, ty, tx, visible):
    """Shingle courses of the roof tile at (map x = ty, map y = tx) in tile units: COURSES rows running along
    Blender X (map y), each climbing towards the SE so its exposed edge stands above the next row, split into
    staggered shingles along the row. The layout repeats exactly per tile, so caps join without a seam."""
    base = WALL_H + FASCIA
    p, per, gap = 1 / COURSES, 5, 0.03
    ln = 1 / per
    for j in range(COURSES):
        y0 = ty - 0.5 + j * p
        off = (j % 2) * ln / 2
        grid = [tx - 0.5 + off + k * ln for k in range(per + 1)]
        edges = sorted({tx - 0.5, tx + 0.5} | {g for g in grid if tx - 0.5 <= g <= tx + 0.5})
        on_grid = lambda a: any(abs(a - g) < 1e-6 for g in grid)
        for a0, a1 in zip(edges, edges[1:]):
            if a1 - a0 < 1e-6:
                continue
            key = int(math.floor(((a0 + a1) / 2 - off - tx + 0.5) / ln + 1e-6)) % per   # the two cut halves of a shingle match
            b0, b1 = a0 + (gap / 2 if on_grid(a0) else 0), a1 - (gap / 2 if on_grid(a1) else 0)
            jitter = 0.004 * ((j * 7 + key * 3) % 3)
            o = slab(f'course{j}_{key}', b0, b1, y0, y0 + p, base + jitter, base + COURSE_RISE + jitter,
                     mats[(j * 3 + key * 2 + (j * key) % 3) % len(mats)])
            if not visible:
                o.visible_camera = False


def build_roof(variant):
    """Shingle roof cap for one tile on top of the fascia board; tiles seamlessly with itself. The
    neighbouring tiles' courses are in the scene as shadow casters only, so the shadow a course throws
    onto the tile in front of it is baked into every tile alike."""
    fascia = material('fascia', (0.13, 0.08, 0.038), noise=(10, (0.07, 0.042, 0.02)), flat_axis='XY')
    cube((0, 0, WALL_H + FASCIA / 2), (1, 1, FASCIA), fascia, 'fascia')
    base = ROOF_COLORS[variant]
    mats = [material(f'shingle{i}', tuple(c * f for c in base), noise=(30, tuple(c * f * 0.55 for c in base)), roughness=0.9)
            for i, f in enumerate((1.0, 0.8, 1.18, 0.9, 1.1))]
    for ty in (-1, 0, 1):
        for tx in (-1, 0, 1):
            roof_courses(mats, ty, tx, visible=(ty == 0 and tx == 0))


def build_roof_rim(edge):
    """Beam along the roof's NW ('nw', map x = x0) or NE ('ne', map y = y0) edge, standing above the courses."""
    beam = material('rim', (0.12, 0.075, 0.036), noise=(10, (0.065, 0.04, 0.02)), flat_axis='XY')
    z0 = WALL_H + FASCIA + 0.03
    z = (z0 + ROOF_TOP + 0.05) / 2
    if edge == 'nw':
        cube((0, -0.46, z), (1.0, 0.08, ROOF_TOP + 0.05 - z0), beam, 'rim')
    else:
        cube((-0.46, 0, z), (0.08, 1.0, ROOF_TOP + 0.05 - z0), beam, 'rim')


def periodic_average(img, dx, dy):
    """Average every pixel with its images under the screen translation (dx, dy). For a wall that is
    constant along its length that translation maps the render onto itself (1/24 tile along the wall is
    exactly (2, 1) screen pixels), so this removes the render noise and makes the strip exactly periodic:
    repeated segments then match at the cut instead of showing a faint seam."""
    h, w = img.shape[:2]
    acc = np.zeros_like(img)
    cnt = np.zeros((h, w, 1), dtype=np.float32)
    for k in range(-(w // abs(dx)), w // abs(dx) + 1):
        sx, sy = k * dx, k * dy
        y0, y1, x0, x1 = max(0, -sy), min(h, h - sy), max(0, -sx), min(w, w - sx)
        if y1 <= y0 or x1 <= x0:
            continue
        acc[y0:y1, x0:x1] += img[y0 + sy:y1 + sy, x0 + sx:x1 + sx]
        cnt[y0:y1, x0:x1] += 1
    return acc / cnt


PLAIN_STRIPS = {}


def crop_strip(face, door=False):
    """Cut the middle tile's face out of a 3-tile wall render: the 48 screen columns between the tile's
    left and bottom corner ('sw') or bottom and right corner ('se'), everything above the fascia's top
    edge cleared (the roof cap is drawn over that band). Plain segments are made exactly periodic, and a
    doorway segment borrows the plain columns outside its frame from the plain segment rendered before
    it, so adjacent segments abut pixel-exactly."""
    def f(arr, origin, ctx):
        scene, cam, size = ctx
        ox, oy = int(round(origin[0])), int(round(origin[1]))
        x0, x1 = (ox - 48, ox) if face == 'sw' else (ox, ox + 48)

        def edge_rows(z):
            """First row at or below the face's horizontal edge at height z, per strip column."""
            pa, pb = (Vector((0.5, -0.5, z)), Vector((0.5, 0.5, z))) if face == 'sw' else (Vector((0.5, 0.5, z)), Vector((-0.5, 0.5, z)))
            ax, ay = project(scene, cam, pa, size)
            bx, by = project(scene, cam, pb, size)
            return [max(0, int(math.ceil(ay + (by - ay) * (x0 + col + 0.5 - ax) / (bx - ax) - 0.5))) for col in range(x1 - x0)]

        sub = arr[:, x0:x1].copy()
        clip = edge_rows(WALL_H + FASCIA)
        for col in range(x1 - x0):
            sub[:clip[col], col] = 0
        rows = np.where((sub[:, :, 3] > 0.02).any(axis=1))[0]
        y0, y1 = max(0, int(rows.min()) - 1), min(sub.shape[0], int(rows.max()) + 2)
        strip, org = sub[y0:y1], (ox - x0, oy - y0)
        if not door:
            strip = periodic_average(strip, 2 if face == 'sw' else -2, 1)
            PLAIN_STRIPS[face] = (strip, org)
        elif face in PLAIN_STRIPS and PLAIN_STRIPS[face][0].shape == strip.shape and PLAIN_STRIPS[face][1] == org:
            plain = PLAIN_STRIPS[face][0]
            # blend from the plain segment at the tile edge into the doorway render over the columns
            # beside the opening (they only differ by a little bounce light from the frame), so the
            # neighbouring segments join without a step
            n = strip.shape[1]
            left, right = int(math.floor(n * (0.5 - DOOR_HALF))), int(math.ceil(n * (0.5 + DOOR_HALF)))
            w = np.zeros(n, dtype=np.float32)
            w[:left] = 1 - np.arange(left) / max(1, left)
            w[right:] = (np.arange(right, n) - right + 1) / max(1, n - right)
            strip = strip * (1 - w)[None, :, None] + plain * w[None, :, None]
            print(f'  doorway {face}: columns [0,{left}) and [{right},{n}) blended into the wall segment')
        else:
            why = 'no plain segment rendered in this run' if face not in PLAIN_STRIPS else \
                f'plain segment {PLAIN_STRIPS[face][0].shape[1]}x{PLAIN_STRIPS[face][0].shape[0]} origin {PLAIN_STRIPS[face][1]} != doorway {strip.shape[1]}x{strip.shape[0]} origin {org}'
            print(f'WARNING: logdoor_{face} was NOT blended into logwall_{face} ({why}); the tile-edge columns will not '
                  f'match the plain wall and every doorway will show a seam. Render logwall_{face} in the same run.', file=sys.stderr)
        return strip, org
    return f


def crop_default(arr, origin, ctx):
    return crop(arr, origin)


PROPS = {'well': build_well, 'logblock': build_logblock, 'palisade': build_palisade, 'planks': build_planks,
         'logwall_sw': functools.partial(build_logwall, 'sw'), 'logwall_se': functools.partial(build_logwall, 'se'),
         'logdoor_sw': functools.partial(build_logwall, 'sw', True), 'logdoor_se': functools.partial(build_logwall, 'se', True),
         'logpost_s': functools.partial(build_logpost, 's'), 'logpost_w': functools.partial(build_logpost, 'w'), 'logpost_e': functools.partial(build_logpost, 'e'),
         'roof': [functools.partial(build_roof, i) for i in range(len(ROOF_COLORS))],
         'roof_rim_nw': functools.partial(build_roof_rim, 'nw'), 'roof_rim_ne': functools.partial(build_roof_rim, 'ne')}
CROPS = {'logwall_sw': crop_strip('sw'), 'logwall_se': crop_strip('se'), 'logdoor_sw': crop_strip('sw', True), 'logdoor_se': crop_strip('se', True)}


# ---------------------------------------------------------------- built-in creature: wolf
def sphere(loc, scale, mat, name, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    o.name = name
    o.data.materials.append(mat)
    o.parent = parent
    bpy.ops.object.shade_smooth()
    return o


def pivot(name, loc, parent):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.parent = parent
    bpy.context.scene.collection.objects.link(e)
    return e


def build_wolf():
    """A grey wolf facing -Y, a little over one tile long. Returns (root, pose) where pose(anim, t)
    sets the procedural animation for normalized time t in [0, 1]."""
    fur = material('fur', (0.16, 0.145, 0.13), noise=(14, (0.06, 0.055, 0.05)), bump=(60, 0.35))
    fur_light = material('fur_light', (0.36, 0.33, 0.29), noise=(14, (0.20, 0.18, 0.16)), bump=(60, 0.3))
    fur_dark = material('fur_dark', (0.07, 0.065, 0.06), noise=(14, (0.03, 0.03, 0.03)), bump=(60, 0.35))
    dark = material('dark', (0.02, 0.02, 0.02), roughness=0.35)
    eye = material('eye', (0.85, 0.65, 0.12), roughness=0.3)
    root = pivot('Wolf', (0, 0, 0), None)
    body = pivot('pose', (0, 0, 0), root)
    # torso masses
    sphere((0, 0.03, 0.47), (0.18, 0.50, 0.20), fur, 'torso', body)
    sphere((0, -0.28, 0.49), (0.21, 0.25, 0.235), fur, 'chest', body)
    sphere((0, 0.37, 0.48), (0.175, 0.21, 0.20), fur, 'hips', body)
    sphere((0, 0.02, 0.62), (0.10, 0.48, 0.07), fur_dark, 'saddle', body)
    sphere((0, 0.0, 0.37), (0.135, 0.42, 0.12), fur_light, 'belly', body)
    for sx in (-1, 1):
        sphere((sx * 0.125, -0.30, 0.42), (0.095, 0.11, 0.11), fur, f'shoulder{sx}', body)
        sphere((sx * 0.115, 0.36, 0.41), (0.10, 0.135, 0.125), fur, f'haunch{sx}', body)
    # neck, ruff and head
    neck = pivot('neck', (0, -0.47, 0.57), body)
    sphere((0, -0.03, -0.01), (0.16, 0.18, 0.16), fur, 'ruff', neck)
    sphere((0, -0.10, 0.04), (0.11, 0.15, 0.11), fur, 'neck_mesh', neck)
    head = pivot('head', (0, -0.21, 0.09), neck)
    sphere((0, 0, 0), (0.125, 0.145, 0.115), fur, 'skull', head)
    sphere((0, -0.03, 0.06), (0.09, 0.11, 0.06), fur_dark, 'brow', head)
    sphere((0, -0.17, -0.025), (0.068, 0.15, 0.058), fur_light, 'muzzle', head)
    sphere((0, -0.12, 0.0), (0.075, 0.10, 0.06), fur, 'muzzle_top', head)
    sphere((0, -0.305, -0.015), (0.03, 0.03, 0.026), dark, 'nose', head)
    jaw = pivot('jaw', (0, -0.09, -0.06), head)
    sphere((0, -0.11, -0.005), (0.05, 0.13, 0.03), fur_light, 'jaw_mesh', jaw)
    for sx in (-1, 1):
        sphere((sx * 0.06, -0.10, 0.045), (0.024, 0.02, 0.02), eye, f'eye{sx}', head)
        sphere((sx * 0.066, -0.118, 0.047), (0.011, 0.01, 0.011), dark, f'pupil{sx}', head)
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.05, radius2=0.008, depth=0.15, location=(sx * 0.085, 0.03, 0.135))
        ear = bpy.context.active_object
        ear.name = f'ear{sx}'
        ear.rotation_euler = (math.radians(-18), math.radians(sx * 22), 0)
        ear.data.materials.append(fur)
        ear.parent = head
    # jointed legs
    legs, knees = {}, {}
    for name, (x, y) in {'fl': (-0.12, -0.30), 'fr': (0.12, -0.30), 'bl': (-0.11, 0.36), 'br': (0.11, 0.36)}.items():
        hip = pivot('leg_' + name, (x, y, 0.42), body)
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.055, depth=0.23, location=(0, 0, -0.11))
        upper = bpy.context.active_object
        upper.name = 'upper_' + name
        upper.data.materials.append(fur)
        upper.parent = hip
        knee = pivot('knee_' + name, (0, 0, -0.22), hip)
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.038, depth=0.22, location=(0, 0, -0.10))
        lower = bpy.context.active_object
        lower.name = 'lower_' + name
        lower.data.materials.append(fur)
        lower.parent = knee
        sphere((0, -0.025, -0.205), (0.055, 0.08, 0.035), fur_dark, 'paw_' + name, knee)
        legs[name], knees[name] = hip, knee
    tail = pivot('tail', (0, 0.53, 0.50), body)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=(0, 0.15, -0.10))
    t = bpy.context.active_object
    t.name = 'tail_mesh'
    t.scale = (0.055, 0.21, 0.065)
    t.rotation_euler = (math.radians(-35), 0, 0)
    t.data.materials.append(fur)
    t.parent = tail
    bpy.ops.object.shade_smooth()
    sphere((0, 0.31, -0.22), (0.045, 0.06, 0.045), fur_dark, 'tail_tip', tail)
    bpy.context.view_layer.update()

    def pose(anim, t):
        w = 2 * math.pi * t
        body.location = (0, 0, 0)
        body.rotation_euler = (0, 0, 0)
        neck.rotation_euler = (0, 0, 0)
        head.rotation_euler = (0, 0, 0)
        jaw.rotation_euler = (0, 0, 0)
        tail.rotation_euler = (0, 0, 0)
        for p in list(legs.values()) + list(knees.values()):
            p.rotation_euler = (0, 0, 0)
        if anim == 'stance':
            body.location = (0, 0, 0.012 * math.sin(w))
            head.rotation_euler = (math.radians(4 * math.sin(w)), 0, math.radians(6 * math.sin(w / 2)))
            tail.rotation_euler = (0, 0, math.radians(14 * math.sin(w)))
        elif anim == 'run':
            swing = math.radians(40)
            for name, phase in (('fl', 0), ('br', 0), ('fr', math.pi), ('bl', math.pi)):
                sw = math.sin(w + phase)
                legs[name].rotation_euler.x = swing * sw
                # knee bends when the leg swings forward
                knees[name].rotation_euler.x = math.radians(-35 * max(0.0, math.sin(w + phase + math.pi / 2)))
            body.location = (0, 0, 0.035 * abs(math.sin(w)))
            body.rotation_euler.x = math.radians(4 * math.sin(w))
            neck.rotation_euler.x = math.radians(-10)
            tail.rotation_euler.x = math.radians(18)
        elif anim == 'swing':
            k = math.sin(math.pi * t)
            body.location = (0, -0.18 * k, 0.04 * k)
            body.rotation_euler.x = math.radians(-8 * k)
            neck.rotation_euler.x = math.radians(18 * k)
            head.rotation_euler.x = math.radians(22 * k)
            jaw.rotation_euler.x = math.radians(32 * k)
            legs['fl'].rotation_euler.x = math.radians(-45 * k)
            legs['fr'].rotation_euler.x = math.radians(-45 * k)
            knees['fl'].rotation_euler.x = math.radians(-20 * k)
            knees['fr'].rotation_euler.x = math.radians(-20 * k)
        elif anim == 'hit':
            k = math.sin(math.pi * t)
            body.location = (0, 0.08 * k, 0)
            body.rotation_euler.x = math.radians(10 * k)
            head.rotation_euler.x = math.radians(-20 * k)
            jaw.rotation_euler.x = math.radians(15 * k)
        elif anim == 'die':
            k = min(1, t * 1.25)
            e = 1 - (1 - k) ** 2
            body.rotation_euler = (math.radians(-6 * e), math.radians(88 * e), 0)
            body.location = (0.05 * e, 0, -0.31 * e)
            neck.rotation_euler.x = math.radians(20 * e)
            jaw.rotation_euler.x = math.radians(18 * e)
            for p in legs.values():
                p.rotation_euler.x = math.radians(25 * e)
            for p in knees.values():
                p.rotation_euler.x = math.radians(-20 * e)
    return root, pose


def build_rat():
    """A giant rat facing -Y, about two thirds of a tile long."""
    fur = material('rat_fur', (0.24, 0.19, 0.15), noise=(18, (0.10, 0.08, 0.06)), bump=(70, 0.35))
    fur_light = material('rat_belly', (0.42, 0.36, 0.30), noise=(18, (0.26, 0.22, 0.18)), bump=(70, 0.3))
    skin = material('rat_skin', (0.55, 0.36, 0.34), roughness=0.6)
    dark = material('rat_dark', (0.02, 0.02, 0.02), roughness=0.35)
    root = pivot('Rat', (0, 0, 0), None)
    body = pivot('pose', (0, 0, 0), root)
    sphere((0, 0.02, 0.16), (0.15, 0.30, 0.14), fur, 'torso', body)
    sphere((0, 0.14, 0.16), (0.15, 0.17, 0.15), fur, 'haunches', body)
    sphere((0, -0.14, 0.15), (0.13, 0.15, 0.12), fur, 'chest', body)
    sphere((0, 0.0, 0.10), (0.11, 0.26, 0.08), fur_light, 'belly', body)
    head = pivot('head', (0, -0.30, 0.17), body)
    sphere((0, -0.03, 0), (0.09, 0.14, 0.085), fur, 'skull', head)
    sphere((0, -0.16, -0.02), (0.05, 0.10, 0.045), fur_light, 'snout', head)
    sphere((0, -0.26, -0.025), (0.018, 0.02, 0.016), skin, 'nose', head)
    for sx in (-1, 1):
        sphere((sx * 0.055, -0.09, 0.02), (0.016, 0.014, 0.016), dark, f'eye{sx}', head)
        sphere((sx * 0.07, 0.02, 0.08), (0.05, 0.018, 0.05), skin, f'ear{sx}', head)
        sphere((sx * 0.07, 0.03, 0.08), (0.055, 0.012, 0.055), fur, f'ear_back{sx}', head)
    legs = {}
    for name, (x, y) in {'fl': (-0.10, -0.17), 'fr': (0.10, -0.17), 'bl': (-0.11, 0.16), 'br': (0.11, 0.16)}.items():
        p = pivot('leg_' + name, (x, y, 0.13), body)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.028, depth=0.14, location=(0, 0, -0.06))
        leg = bpy.context.active_object
        leg.name = 'legmesh_' + name
        leg.data.materials.append(fur)
        leg.parent = p
        sphere((0, -0.015, -0.13), (0.035, 0.05, 0.02), skin, 'paw_' + name, p)
        legs[name] = p
    tail = pivot('tail', (0, 0.30, 0.13), body)
    for i, (y, z, r, ln, rx) in enumerate([(0.12, -0.03, 0.022, 0.26, -75), (0.34, -0.09, 0.015, 0.24, -95), (0.53, -0.10, 0.009, 0.18, -100)]):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=r, depth=ln, location=(0, y, z), rotation=(math.radians(rx), 0, 0))
        seg = bpy.context.active_object
        seg.name = f'tail{i}'
        seg.data.materials.append(skin)
        seg.parent = tail
    bpy.context.view_layer.update()

    def pose(anim, t):
        w = 2 * math.pi * t
        body.location = (0, 0, 0)
        body.rotation_euler = (0, 0, 0)
        head.rotation_euler = (0, 0, 0)
        tail.rotation_euler = (0, 0, 0)
        for p in legs.values():
            p.rotation_euler = (0, 0, 0)
        if anim == 'stance':
            body.location = (0, 0, 0.006 * math.sin(w))
            head.rotation_euler = (math.radians(7 * math.sin(w)), 0, math.radians(8 * math.sin(w / 2)))
            tail.rotation_euler = (0, 0, math.radians(10 * math.sin(w)))
        elif anim == 'run':
            swing = math.radians(42)
            for name, phase in (('fl', 0), ('br', 0), ('fr', math.pi), ('bl', math.pi)):
                legs[name].rotation_euler.x = swing * math.sin(w + phase)
            body.location = (0, 0, 0.02 * abs(math.sin(w)))
            body.rotation_euler.x = math.radians(3 * math.sin(w))
            tail.rotation_euler = (0, 0, math.radians(12 * math.sin(w)))
        elif anim == 'swing':
            k = math.sin(math.pi * t)
            body.location = (0, -0.14 * k, 0.03 * k)
            body.rotation_euler.x = math.radians(-8 * k)
            head.rotation_euler.x = math.radians(24 * k)
            legs['fl'].rotation_euler.x = math.radians(-45 * k)
            legs['fr'].rotation_euler.x = math.radians(-45 * k)
        elif anim == 'hit':
            k = math.sin(math.pi * t)
            body.location = (0, 0.06 * k, 0)
            body.rotation_euler.x = math.radians(12 * k)
            head.rotation_euler.x = math.radians(-18 * k)
        elif anim == 'die':
            k = min(1, t * 1.25)
            e = 1 - (1 - k) ** 2
            body.rotation_euler = (math.radians(-5 * e), math.radians(86 * e), 0)
            body.location = (0.03 * e, 0, -0.11 * e)
            head.rotation_euler.x = math.radians(15 * e)
            for p in legs.values():
                p.rotation_euler.x = math.radians(30 * e)
    return root, pose


CREATURES = {'wolf': build_wolf, 'rat': build_rat}



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
    names = list(args.names or PROPS)
    # a doorway strip borrows its tile-edge columns from the plain wall rendered earlier in the same run
    # (crop_strip), so the plain wall of that face always goes first, whatever the order on the command line
    for face in ('sw', 'se'):
        door, wall = f'logdoor_{face}', f'logwall_{face}'
        if door in names and (wall not in names or names.index(wall) > names.index(door)):
            if wall in names:
                names.remove(wall)
            names.insert(names.index(door), wall)
            print(f'{wall} is rendered before {door} so the doorway can be blended into the plain wall')
    with tempfile.TemporaryDirectory() as tmp:
        for name in names:
            builders = PROPS[name] if isinstance(PROPS[name], list) else [PROPS[name]]
            entries = []
            for i, build in enumerate(builders):
                clear_scene()
                scene = setup_render(args.engine, args.size)
                if args.engine == 'CYCLES':
                    scene.cycles.samples = args.samples
                cam = setup_camera(scene, args.size)
                setup_lights(scene, cam, **(HOUSE_LIGHTS if name in HOUSE_PROPS else {}))
                build()
                origin = project(scene, cam, Vector((0, 0, 0)), args.size)
                arr = render_frame(scene, os.path.join(tmp, name + '.png'))
                cropped, (ox, oy) = CROPS.get(name, crop_default)(arr, origin, (scene, cam, args.size))
                file = name + ('.png' if i == 0 else f'_{i}.png')
                save_image(cropped, os.path.join(args.out, file))
                entries.append({'img': file, 'w': cropped.shape[1], 'h': cropped.shape[0], 'ox': ox, 'oy': oy, 'frames': [[0, 0, 0]]})
                print(f'{file}: {cropped.shape[1]}x{cropped.shape[0]} origin ({ox},{oy})')
            catalog['tiles'][name] = entries
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


def cmd_builtin(args):
    """Render a built-in procedurally animated creature."""
    os.makedirs(args.out, exist_ok=True)
    clear_scene()
    scene = setup_render(args.engine, args.size)
    if args.engine == 'CYCLES':
        scene.cycles.samples = args.samples
    cam = setup_camera(scene, args.size)
    setup_lights(scene, cam)
    root, pose = CREATURES[args.name]()
    root.scale = (args.scale, args.scale, args.scale)
    counts = {'stance': 4, 'run': 8, 'swing': 4, 'hit': 2, 'die': 6}
    anims = {}
    for anim, n in counts.items():
        looped = ANIM_TYPES[anim] == 'looped'

        def frames_cb(anim=anim, n=n, looped=looped):
            for i in range(n):
                pose(anim, i / (n if looped else max(1, n - 1)))
                yield i
        anims[anim] = render_directions(scene, cam, root, '-Y', frames_cb, args.size)
        print(f'rendered {anim} ({n} frames x 8 directions)')
    write_sprite(args.out, args.name, anims, ANIM_DURATIONS, ANIM_TYPES, args.webp)


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
    p.add_argument('--samples', type=int, default=64, help='Cycles samples per pixel')
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
    b = sub.add_parser('builtin', help=f'render a built-in animated creature: {", ".join(CREATURES)}')
    b.add_argument('name', choices=list(CREATURES))
    b.add_argument('--scale', type=float, default=1.0)
    b.add_argument('--samples', type=int, default=32)
    b.add_argument('--webp', action='store_true')
    args = ap.parse_args(argv)
    args.out = os.path.abspath(args.out)
    {'props': cmd_props, 'test-dirs': cmd_test_dirs, 'creature': cmd_creature, 'builtin': cmd_builtin}[args.cmd](args)


if __name__ == '__main__':
    main()
