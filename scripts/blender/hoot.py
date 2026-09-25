"""Build Hoot, the Owl Fund mascot, from an empty Blender scene and render his sprite set.

Run inside Blender (tested on 5.2):
  - from the Blender MCP addon: exec(open("scripts/blender/hoot.py").read())
  - headless: Blender -b -P scripts/blender/hoot.py -- --render <png dir> --glb public/hoot/hoot.glb
    then convert the PNGs with scripts/blender/hoot-sprites.mjs
  - the loading screen's wave loop: Blender -b -P scripts/blender/hoot.py -- --wave <png dir>
    then pack it with scripts/blender/hoot-wave.mjs

The scene is built from code so Hoot can be tweaked and re-rendered instead of hand-edited.
Front of the owl faces -Y; the body is a unit sphere centred at C.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Vector

C = Vector((0.0, 0.0, 1.0))

PALETTE = {
    "body": "#1F1F24",
    "wing": "#2B2B33",
    "face": "#F3EBDD",
    "sclera": "#FFFFFF",
    "pupil": "#141418",
    "beak": "#6E1216",
    "blush": "#E7A59C",
    "feet": "#E3CFAF",
    "line": "#26262C",
}

# Face-projected (x, z) centres of the eyes on the unit sphere.
EYES = {"L": (-0.33, 0.12), "R": (0.33, 0.12)}
SCLERA_R = 0.27
PUPIL_R = 0.165

OPEN_POSES = ["idle", "thinking", "alert", "wave", "concerned"]
CLOSED_POSES = ["happy", "sleepy"]


def hex_rgba(h):
    h = h.lstrip("#")
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def material(name, color, rough=0.5, coat=0.0, emit=0.0, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hex_rgba(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.08
    b.inputs["Sheen Weight"].default_value = sheen
    if emit:
        b.inputs["Emission Color"].default_value = hex_rgba(color)
        b.inputs["Emission Strength"].default_value = emit
    return m


def on_sphere(x, z, r):
    """Point on a sphere of radius r around C, seen straight-on from the front at face coords (x, z)."""
    y = -math.sqrt(max(r * r - x * x - z * z, 1e-6))
    return C + Vector((x, y, z))


def normal_at(x, z):
    return (on_sphere(x, z, 1.0) - C).normalized()


def link(obj, parent, mat=None, smooth=True):
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    if smooth and obj.type == "MESH":
        for p in obj.data.polygons:
            p.use_smooth = True
    # Keep the object where it was built: parent without moving it.
    bpy.context.view_layer.update()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def ellipsoid(name, loc, scale, rot=None, segs=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    if rot is not None:
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = rot
    return o


def subsurf(o, levels=2):
    m = o.modifiers.new("Subsurf", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    return o


# ---------------------------------------------------------------- face disc


def face_outline(n=120):
    """Heart-shaped facial disc: smooth union of two eye circles and a chin ellipse, sampled radially."""

    def sdf(x, z):
        def circ(cx, cz, r):
            return math.hypot(x - cx, z - cz) - r

        def smin(a, b, k=0.12):
            h = max(k - abs(a - b), 0.0) / k
            return min(a, b) - h * h * k * 0.25

        d = smin(circ(-0.34, 0.14, 0.40), circ(0.34, 0.14, 0.40), 0.10)
        chin = math.hypot(x / 0.42, (z + 0.14) / 0.50) - 1.0
        return smin(d, chin * 0.45, 0.2)

    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        lo, hi = 0.0, 0.95
        for _ in range(40):
            mid = (lo + hi) / 2
            if sdf(mid * math.cos(t), -0.02 + mid * math.sin(t)) < 0:
                lo = mid
            else:
                hi = mid
        pts.append((lo * math.cos(t), -0.02 + lo * math.sin(t)))
    return pts


def build_face(root, mat):
    outline = face_outline()
    rings = 9
    bm = bmesh.new()
    centre = bm.verts.new(on_sphere(0, -0.02, 1.012))
    grid = []
    for k in range(1, rings + 1):
        f = k / rings
        ring = [bm.verts.new(on_sphere(x * f, -0.02 + (z + 0.02) * f, 1.012)) for (x, z) in outline]
        grid.append(ring)
    n = len(outline)
    for i in range(n):
        bm.faces.new((centre, grid[0][i], grid[0][(i + 1) % n]))
    for k in range(rings - 1):
        a, b = grid[k], grid[k + 1]
        for i in range(n):
            bm.faces.new((a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]))
    me = bpy.data.meshes.new("Face")
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("Face", me)
    bpy.context.collection.objects.link(o)
    # Normals must point out of the body for solidify to grow outward.
    if me.polygons[0].normal.dot(me.vertices[0].co - C) < 0:
        me.flip_normals()
    sol = o.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.03
    sol.offset = 1.0
    sol.use_even_offset = True
    bev = o.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.012
    bev.segments = 3
    bev.limit_method = "ANGLE"
    return link(o, root, mat)


# ---------------------------------------------------------------- eye lines (closed eyes, brows)


def arc_curve(name, cx, cz, radius, a0, a1, r_surf, depth, parent, mat, dz=0.0):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = depth
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    steps = 24
    sp.points.add(steps)
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        x, z = cx + radius * math.cos(a), cz + dz + radius * math.sin(a)
        p = on_sphere(x, z, r_surf)
        sp.points[i].co = (p.x, p.y, p.z, 1.0)
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    o.parent = parent
    return o


# ---------------------------------------------------------------- scene


def reset_scene():
    # select_all skips hidden objects, so remove every object directly.
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def build():
    reset_scene()
    mats = {
        "body": material("Hoot Body", PALETTE["body"], rough=0.7, sheen=0.15),
        "wing": material("Hoot Wing", PALETTE["wing"], rough=0.7, sheen=0.15),
        "face": material("Hoot Face", PALETTE["face"], rough=0.6),
        "sclera": material("Hoot Sclera", PALETTE["sclera"], rough=0.25, coat=0.6),
        "pupil": material("Hoot Pupil", PALETTE["pupil"], rough=0.15, coat=1.0),
        "glint": material("Hoot Glint", "#FFFFFF", rough=0.2, emit=6.0),
        "beak": material("Hoot Beak", PALETTE["beak"], rough=0.35, coat=0.4),
        "blush": material("Hoot Blush", PALETTE["blush"], rough=0.7),
        "feet": material("Hoot Feet", PALETTE["feet"], rough=0.6),
        "line": material("Hoot Line", PALETTE["line"], rough=0.4),
    }

    root = bpy.data.objects.new("Hoot", None)
    bpy.context.collection.objects.link(root)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1, location=C)
    body = bpy.context.active_object
    body.name = "Body"
    link(body, root, mats["body"])

    build_face(root, mats["face"])

    # Ear tufts: rounded cones leaning outward.
    for side, sx in (("L", -1), ("R", 1)):
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.3, radius2=0.07, depth=0.52, location=C + Vector((sx * 0.52, 0.08, 0.78)))
        t = bpy.context.active_object
        t.name = f"Tuft{side}"
        t.rotation_euler = Euler((0, math.radians(sx * 28), 0))
        subsurf(t, 2)
        link(t, root, mats["body"])

    # Wings hang from shoulder pivots so poses can rotate them.
    for side, sx in (("L", -1), ("R", 1)):
        pivot = bpy.data.objects.new(f"WingPivot{side}", None)
        bpy.context.collection.objects.link(pivot)
        pivot.location = C + Vector((sx * 0.8, 0.05, 0.2))
        pivot.parent = root
        w = ellipsoid(f"Wing{side}", pivot.location + Vector((sx * 0.14, 0.0, -0.4)), (0.17, 0.36, 0.45))
        w.rotation_euler = Euler((0, math.radians(-sx * 12), 0))
        link(w, pivot, mats["wing"])

    # Feet.
    for side, sx in (("L", -1), ("R", 1)):
        f = ellipsoid(f"Foot{side}", C + Vector((sx * 0.3, -0.42, -0.94)), (0.17, 0.22, 0.09))
        link(f, root, mats["feet"])

    # Beak: small rounded maroon cone pointing down and forward.
    beak_n = normal_at(0, -0.12)
    beak = ellipsoid("Beak", C + beak_n * 1.05, (0.075, 0.115, 0.06), rot=beak_n.to_track_quat("Z", "Y"))
    # Taper the bottom into a soft point.
    for v in beak.data.vertices:
        if v.co.y < 0:
            v.co.x *= 1 + v.co.y * 0.6
            v.co.y *= 1.25
    link(beak, root, mats["beak"])

    # Blush.
    for side, sx in (("L", -1), ("R", 1)):
        n = normal_at(sx * 0.56, -0.2)
        b = ellipsoid(f"Blush{side}", C + n * 1.04, (0.1, 0.07, 0.015), rot=n.to_track_quat("Z", "Y"))
        link(b, root, mats["blush"])

    # Eyes: glossy sclera dome, pupil, glints. Pupils sit under EyePivot empties so poses can aim them.
    for side, (ex, ez) in EYES.items():
        n = normal_at(ex, ez)
        q = n.to_track_quat("Z", "Y")
        s = ellipsoid(f"Sclera{side}", C + n * 1.03, (SCLERA_R, SCLERA_R, 0.08), rot=q)
        link(s, root, mats["sclera"])
        pivot = bpy.data.objects.new(f"EyePivot{side}", None)
        bpy.context.collection.objects.link(pivot)
        pivot.location = C
        pivot.parent = root
        p = ellipsoid(f"Pupil{side}", C + n * 1.085, (PUPIL_R, PUPIL_R, 0.05), rot=q)
        link(p, pivot, mats["pupil"])
        up = q @ Vector((0, 1, 0))
        right = q @ Vector((1, 0, 0))
        for gname, off, r in (("GlintA", (-0.05, 0.055), 0.05), ("GlintB", (0.06, -0.055), 0.024)):
            g = ellipsoid(f"{gname}{side}", C + n * 1.13 + right * off[0] + up * off[1], (r, r, r * 0.4), rot=q, segs=16)
            link(g, pivot, mats["glint"])

        # Closed eyes: "u" for blink/sleep, "n" for happy.
        arc_curve(f"Closed{side}", ex, ez, 0.16, 200, 340, 1.05, 0.03, root, mats["line"], dz=0.1)
        arc_curve(f"Happy{side}", ex, ez, 0.16, 20, 160, 1.05, 0.03, root, mats["line"], dz=-0.1)
        # Brows (alert / concerned), tilted per pose by rebuilding.
    build_brows(root, mats["line"], "flat")

    setup_render()
    pose("idle")
    return root


def build_brows(root, mat, kind):
    for side in ("L", "R"):
        old = bpy.data.objects.get(f"Brow{side}")
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
    if kind == "none":
        return
    for side, (ex, ez) in EYES.items():
        sx = -1 if side == "L" else 1
        if kind == "concerned":
            # Inner ends raised: centre of the arc shifted inward and tilted.
            a0, a1 = (60, 120)
            o = arc_curve(f"Brow{side}", ex - sx * 0.02, ez + 0.2, 0.2, a0 - sx * 34, a1 - sx * 34, 1.05, 0.024, root, mat, dz=0.02)
        else:
            lift = 0.36 if kind == "alert" else 0.3
            o = arc_curve(f"Brow{side}", ex, ez + lift - 0.2, 0.2, 60, 120, 1.05, 0.022, root, mat)
        o.hide_render = kind == "flat"
        o.hide_viewport = kind == "flat"


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.eevee.taa_render_samples = 64

    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.9, 0.9, 0.92, 1)
    bg.inputs["Strength"].default_value = 0.3

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 72
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = C + Vector((0.6, -7.2, 1.0))
    direction = (C + Vector((0, 0, 0.02))) - cam.location
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = direction.to_track_quat("-Z", "Y")
    scene.camera = cam

    def area(name, loc, energy, size, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy
        ld.size = size
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        bpy.context.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_mode = "QUATERNION"
        lo.rotation_quaternion = (C - Vector(loc)).to_track_quat("-Z", "Y")

    area("Key", (-3.5, -4.5, 4.5), 900, 4.0, (1.0, 0.97, 0.93))
    area("Fill", (4.5, -3.5, 1.8), 280, 5.0, (0.92, 0.95, 1.0))
    area("Rim", (1.5, 4.5, 4.0), 900, 3.0)
    area("RimL", (-3.0, 4.0, 2.0), 500, 3.0)


# ---------------------------------------------------------------- poses


def obj(name):
    return bpy.data.objects[name]


def show(name, visible):
    o = obj(name)
    o.hide_render = not visible
    o.hide_viewport = not visible


def set_eyes(state):
    """state: open | closed | happy"""
    for side in ("L", "R"):
        show(f"Sclera{side}", state == "open")
        show(f"Pupil{side}", state == "open")
        show(f"GlintA{side}", state == "open")
        show(f"GlintB{side}", state == "open")
        show(f"Closed{side}", state == "closed")
        show(f"Happy{side}", state == "happy")


def pose(name, eyes=None):
    root = obj("Hoot")
    root.rotation_euler = Euler((0, 0, 0))
    root.scale = (1, 1, 1)
    root.location = (0, 0, 0)
    for side in ("L", "R"):
        obj(f"WingPivot{side}").rotation_euler = Euler((0, 0, 0))
        obj(f"EyePivot{side}").rotation_euler = Euler((0, 0, 0))
    for side, sx in (("L", -1), ("R", 1)):
        obj(f"Tuft{side}").rotation_euler = Euler((0, math.radians(sx * 28), 0))
    brows = "flat"
    state = "open"

    if name == "thinking":
        root.rotation_euler = Euler((0, math.radians(10), 0))
        # Right wing lifted forward, like a hand to the chin.
        obj("WingPivotR").rotation_euler = Euler((math.radians(-55), math.radians(-20), math.radians(-25)))
    elif name == "alert":
        brows = "alert"
        for side, sx in (("L", -1), ("R", 1)):
            obj(f"Tuft{side}").rotation_euler = Euler((0, math.radians(sx * 14), 0))
            obj(f"WingPivot{side}").rotation_euler = Euler((0, math.radians(-sx * 25), 0))
    elif name == "wave":
        root.rotation_euler = Euler((0, math.radians(-6), 0))
        obj("WingPivotR").rotation_euler = Euler((math.radians(-20), math.radians(-105), 0))
    elif name == "concerned":
        brows = "concerned"
        root.rotation_euler = Euler((0, math.radians(-5), 0))
        for side, sx in (("L", -1), ("R", 1)):
            obj(f"Tuft{side}").rotation_euler = Euler((0, math.radians(sx * 40), 0))
    elif name == "happy":
        state = "happy"
        root.rotation_euler = Euler((0, math.radians(-8), 0))
        for side, sx in (("L", -1), ("R", 1)):
            obj(f"WingPivot{side}").rotation_euler = Euler((0, math.radians(-sx * 40), 0))
    elif name == "sleepy":
        state = "closed"
        root.rotation_euler = Euler((0, math.radians(9), 0))
        root.scale = (1.02, 1.02, 0.97)
        for side, sx in (("L", -1), ("R", 1)):
            obj(f"Tuft{side}").rotation_euler = Euler((0, math.radians(sx * 50), 0))

    build_brows(root, bpy.data.materials["Hoot Line"], brows)
    set_eyes(eyes or state)
    bpy.context.view_layer.update()


# ---------------------------------------------------------------- rendering


def project(p):
    scene = bpy.context.scene
    v = world_to_camera_view(scene, scene.camera, p)
    return (round(v.x, 4), round(1 - v.y, 4))


def eye_geometry():
    """Normalised image coords of each sclera centre, plus how far a pupil may travel inside it."""
    scene = bpy.context.scene
    cam_right = scene.camera.matrix_world.to_quaternion() @ Vector((1, 0, 0))
    out = {}
    for side in ("L", "R"):
        s = obj(f"Sclera{side}")
        centre = s.matrix_world.translation
        cx, cy = project(centre)
        ex, _ = project(centre + cam_right * (SCLERA_R - PUPIL_R - 0.015))
        out[side] = {"x": cx, "y": cy, "travel": round(abs(ex - cx), 4)}
    return out


def only_visible(names):
    hidden = []
    for o in bpy.data.objects:
        if o.type in ("MESH", "CURVE") and o.name not in names and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    return hidden


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def render_all(outdir):
    os.makedirs(outdir, exist_ok=True)
    meta = {"size": 768, "poses": {}}
    for name in OPEN_POSES:
        # Base: everything but the pupils (they're a separate layer the page moves).
        pose(name)
        meta["poses"][name] = {"eyes": eye_geometry(), "closed": False}
        pupil_parts = [f"{k}{s}" for k in ("Pupil", "GlintA", "GlintB") for s in ("L", "R")]
        for n in pupil_parts:
            obj(n).hide_render = True
        render_to(os.path.join(outdir, f"{name}.png"))
        # Pupils alone. The rest of Hoot is held out so the layer lines up exactly.
        pose(name)
        hidden = only_visible(set(pupil_parts))
        render_to(os.path.join(outdir, f"{name}-pupils.png"))
        for o in hidden:
            o.hide_render = False
        # Blink variant.
        pose(name, eyes="closed")
        render_to(os.path.join(outdir, f"{name}-blink.png"))
    for name in CLOSED_POSES:
        pose(name)
        meta["poses"][name] = {"closed": True}
        render_to(os.path.join(outdir, f"{name}.png"))
    pose("idle")
    with open(os.path.join(outdir, "eyes.json"), "w") as f:
        json.dump(meta, f, indent=2)
    return meta


def render_sheet(outdir):
    """Full-colour preview of every pose (pupils included) for review."""
    os.makedirs(outdir, exist_ok=True)
    for name in OPEN_POSES + CLOSED_POSES:
        pose(name)
        render_to(os.path.join(outdir, f"sheet-{name}.png"))
    pose("idle")


def render_wave(outdir, frames=12):
    """One loop of Hoot waving hello (full colour, looking at you) for the app's loading screen.
    Frames are wave-00.png ... ; scripts/blender/hoot-wave.mjs packs them into a strip."""
    os.makedirs(outdir, exist_ok=True)
    for i in range(frames):
        t = 2 * math.pi * i / frames
        pose("wave")
        # Wing swings out and back around the wave pose; the body sways a beat behind it and bobs on each swing.
        obj("WingPivotR").rotation_euler = Euler((math.radians(-20), math.radians(-120 + 26 * math.sin(t)), 0))
        root = obj("Hoot")
        root.rotation_euler = Euler((0, math.radians(-6 + 4 * math.sin(t - 0.9)), 0))
        root.location = (0, 0, 0.03 * abs(math.sin(t)))
        bpy.context.view_layer.update()
        render_to(os.path.join(outdir, f"wave-{i:02d}.png"))
    pose("idle")


def export_glb(path):
    """Idle Hoot as glTF for the live 3D hero. Named nodes (Hoot, EyePivotL/R, ScleraL/R, WingPivotL/R, ClosedL/R,
    HappyL/R) are driven in three.js; the closed and happy eye lines ship too and the page hides them until needed."""
    pose("idle")
    for side in ("L", "R"):
        show(f"Closed{side}", True)
        show(f"Happy{side}", True)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_visible=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_texcoords=False,
    )
    pose("idle")


if __name__ == "__main__" and "--" in sys.argv:
    args = sys.argv[sys.argv.index("--") + 1 :]
    build()
    if "--render" in args:
        render_all(args[args.index("--render") + 1])
    if "--glb" in args:
        export_glb(args[args.index("--glb") + 1])
    if "--wave" in args:
        render_wave(args[args.index("--wave") + 1])
    if "--sheet" in args:
        render_sheet(args[args.index("--sheet") + 1])
