"""Blender 4.5+: export the supplied rig as a posed mesh + a small hand-wave morph.
Run with --background --factory-startup --disable-autoexec --python this.py -- source.blend textures output
The source file is read only; embedded scripts are never enabled.
"""
import bpy, sys, os, json, math, struct
from mathutils import Matrix, Vector

source, textures, output = sys.argv[sys.argv.index('--') + 1:][:3]
output = os.path.abspath(output)
os.makedirs(output, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=source, use_scripts=False)
rig = bpy.data.objects['RIG_Freddy_ao']
obj = bpy.data.objects['RIG_Freddy_mo']
rig.animation_data_clear()
for bone in rig.pose.bones:
    bone.matrix_basis = Matrix.Identity(4)
for image in bpy.data.images:
    path = os.path.join(textures, image.name)
    if os.path.isfile(path):
        image.filepath = path
        image.reload()
bpy.context.view_layer.update()

def turn(name, degrees, axis='Y'):
    b = rig.pose.bones[name]
    p = b.head.copy()
    b.matrix = Matrix.Translation(p) @ Matrix.Rotation(math.radians(degrees), 4, axis) @ Matrix.Translation(-p) @ b.matrix
    bpy.context.view_layer.update()

# Free hand on the viewer's right; the microphone hand stays lowered.
turn('R_Shoulder_jnt', -112)
turn('L_Shoulder_jnt', -65)
turn('L_Elbow_jnt', -29)
turn('L_Wrist_jnt', -82, 'Z')
# Lean from the waist, keeping both feet grounded. The live renderer aims the head at the camera.
turn('Spine_jnt', 24)
turn('ExoJaw_jnt', 5, 'X')

# Convert Blender Z-up / -Y-forward to the room's Y-up / +Z-forward, at 3.4 metres tall.
k = 3.4 / 4.987485
convert = Matrix(((k,0,0,0),(0,0,k,0.003),(0,-k,0,0),(0,0,0,1)))
world = convert @ obj.matrix_world
normal = world.to_3x3().inverted().transposed()
head = rig.pose.bones['Head_jnt']
head_pivot = convert @ rig.matrix_world @ head.head
head_names = {head.name, *(b.name for b in head.children_recursive)}
head_groups = {g.index for g in obj.vertex_groups if g.name in head_names}
head_weights = [min(1, sum(g.weight for g in v.groups if g.group in head_groups)) for v in obj.data.vertices]
def evaluated():
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = ev.to_mesh(preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
    mesh.calc_loop_triangles()
    positions = [world @ v.co for v in mesh.vertices]
    normals = [(normal @ n.vector).normalized() for n in mesh.corner_normals]
    uv = [tuple(v.uv) for v in mesh.uv_layers.active.data]
    triangles = [(t.material_index, tuple(t.loops), tuple(t.vertices)) for t in mesh.loop_triangles]
    ev.to_mesh_clear()
    return positions, normals, uv, triangles

p0, n0, uv, triangles = evaluated()
turn('L_Wrist_jnt', -22, 'Y')
p1, n1, _, _ = evaluated()
vertices, indices, lookup, ranges = [], [], {}, []
for material in range(len(obj.data.materials)):
    first = len(indices)
    for mat, loops, ids in triangles:
        if mat != material: continue
        for loop, vid in zip(loops, ids):
            values = (*p0[vid], *n0[loop], uv[loop][0], 1-uv[loop][1], *(p1[vid]-p0[vid]), *(n1[loop]-n0[loop]), head_weights[vid])
            key = struct.pack('<15f', *values)
            if key not in lookup:
                lookup[key] = len(vertices)
                vertices.append(key)
            indices.append(lookup[key])
    ranges.append({'first':first,'count':len(indices)-first})
with open(os.path.join(output,'freddy.bin'),'wb') as f:
    f.write(b''.join(vertices))
    f.write(struct.pack('<%dI' % len(indices),*indices))
with open(os.path.join(output,'freddy.json'),'w') as f:
    json.dump({'version':2,'vertexCount':len(vertices),'indexCount':len(indices),'stride':60,'headPivot':list(head_pivot),'ranges':ranges,
               'materials':['body','endo','eye','microphone']},f,separators=(',',':'))
print('FREDDY:',len(vertices),'vertices,',len(indices)//3,'triangles')

if '--preview' in sys.argv:
    turn('L_Wrist_jnt', 11, 'Y')
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=16
    scene.render.resolution_x=750; scene.render.resolution_y=850; scene.render.resolution_percentage=100
    scene.world.color=(0.25,0.25,0.25)
    cam=bpy.data.objects['Camera']; cam.location=(0,-11,3)
    cam.rotation_euler=(Vector((0,0,2.6))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'; cam.data.ortho_scale=6.2;scene.camera=cam
    light=bpy.data.objects['Light']; light.data.type='AREA';light.data.energy=1700;light.data.shape='DISK';light.data.size=7
    light.location=(1,-6,7);light.rotation_euler=(Vector((0,0,3))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=os.path.join(output,'pose.png')
    bpy.ops.render.render(write_still=True)
