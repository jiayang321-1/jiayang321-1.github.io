import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/jsm/controls/OrbitControls.js';

const COLORS = {
  B2: 0xb9a7e0, B1: 0x9ec3ff, F1: 0xf2b8b0, F2: 0xa8dcb9, F3: 0xf5d9a0,
};
const WALL_OPACITY = 0.96;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);
scene.fog = new THREE.Fog(0x0e1116, 60, 160);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
camera.position.set(22, 16, 26);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(2, 2, 0);
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotateSpeed = 0.8;

// lights
scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x2a2620, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 1.35);
sun.position.set(30, 42, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.camera.far = 120;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x8fb4ff, 0.3);
fill.position.set(-25, 20, -30);
scene.add(fill);

// ground
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(45, 64),
  new THREE.MeshStandardMaterial({ color: 0x171c24, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -5.651;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(90, 90, 0x2c3646, 0x1c232e);
grid.position.y = -5.649;
scene.add(grid);

// clipping plane for dollhouse section
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 11.5);

// ---------- geometry helpers ----------
function quadStrip(points, z0, z1, positions, thick = 0) {
  // vertical quad per segment; thick>0 -> expand horizontally by thick (m) each side
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, , az] = points[i], [bx, , bz] = points[i + 1];
    let dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    dx /= len; dz /= len;
    const nx = -dz, nz = dx;
    const ox = nx * thick, oz = nz * thick;
    // two triangles: a0 b0 a1 / b0 b1 a1
    positions.push(
      ax - ox, z0, az - oz, bx - ox, z0, bz - oz, ax - ox, z1, az - oz,
      bx - ox, z0, bz - oz, bx - ox, z1, bz - oz, ax - ox, z1, az - oz,
      ax + ox, z0, az + oz, ax + ox, z1, az + oz, bx + ox, z0, bz + oz,
      bx + ox, z0, bz + oz, ax + ox, z1, az + oz, bx + ox, z1, az + oz,
    );
  }
}

function shapeFromPoints(points) {
  const sh = new THREE.Shape();
  sh.moveTo(points[0][0], -points[0][2]);
  for (let i = 1; i < points.length; i++) sh.lineTo(points[i][0], -points[i][2]);
  sh.closePath();
  return sh;
}

function makeLabel(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const g = c.getContext('2d');
  g.font = '600 40px "Microsoft YaHei", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 10;
  g.fillStyle = color;
  g.fillText(text, 128, 36);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(4.4, 1.24, 1);
  sp.renderOrder = 999;
  return sp;
}

function makeFlatLabel(text) {
  const c = document.createElement('canvas');
  const n = Math.min(text.length, 10);
  c.width = 96 * n; c.height = 128;
  const g = c.getContext('2d');
  g.font = '500 58px "Microsoft YaHei", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(24,30,40,0.92)';
  g.fillText(text, c.width / 2, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  const w = Math.max(1.2, n * 0.62);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, 0.83),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ---------- build model ----------
const model = await (await fetch('./model.json')).json();
const mep = await (await fetch('./mep.json')).json();
const circ = await (await fetch('./circuits.json')).json();

// overall bbox for camera framing
{
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const fl of model.floors) {
    x0 = Math.min(x0, fl.bbox[0]); x1 = Math.max(x1, fl.bbox[2]);
    z0 = Math.min(z0, -fl.bbox[3]); z1 = Math.max(z1, -fl.bbox[1]);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  controls.target.set(cx, 2, cz);
  const view = new URLSearchParams(location.search).get('view');
  if (view === 'top') {
    camera.position.set(cx, 46, cz + 0.02);
    controls.target.set(cx, 0, cz);
  } else if (view === 'iso') {
    camera.position.set(cx + 20, 15, cz + 32);
  } else {
    camera.position.set(cx + 20, 15, cz + 32);
  }
}
const floorGroups = {};
const slabMaterials = [];

for (const fl of model.floors) {
  const g = new THREE.Group();
  g.name = fl.key;
  const color = COLORS[fl.key] || 0xcccccc;
  const z0 = fl.slab, z1 = fl.slab + fl.wall_h;

  // wall face surfaces (open lines) — zero-thickness vertical quads
  {
    const pos = [];
    for (const line of fl.walls_open) quadStrip(line, z0, z1, pos, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: WALL_OPACITY,
      clippingPlanes: [clipPlane], clipShadows: true,
    }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }

  // solid wall cores (closed polygons)
  {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.82), roughness: 0.95,
      transparent: true, opacity: WALL_OPACITY, clippingPlanes: [clipPlane], clipShadows: true,
    });
    for (const poly of fl.walls_closed) {
      const sh = shapeFromPoints(poly);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: fl.wall_h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); // shape (x, cadY) extruded +z -> world (x, y=height, z=-cadY)
      geo.translate(0, z0, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
    }
  }

  // glass: 2-point window segments -> wide thin ribbons; closed polys -> solid glass
  {
    const pos = [];
    for (const seg of fl.windows) {
      if (seg.length === 2) {
        const [[ax, , az], [bx, , bz]] = seg;
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.25 || len > 12) continue;
        quadStrip(seg, z0 + fl.sill, Math.min(z1 - 0.15, z0 + 2.3), pos, 0.16);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x7ec8ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.45,
      side: THREE.DoubleSide, emissive: 0x1a3a55, clippingPlanes: [clipPlane],
    }));
    g.add(mesh);

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9fd8ff, roughness: 0.1, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, emissive: 0x16324a, clippingPlanes: [clipPlane],
    });
    for (const poly of fl.windows_closed) {
      const sh = shapeFromPoints(poly);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: fl.wall_h - 0.5, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, z0 + fl.sill, 0);
      g.add(new THREE.Mesh(geo, glassMat));
    }
  }

  // stairs: real steps
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9a26b, roughness: 0.8, clippingPlanes: [clipPlane], clipShadows: true });
    for (const [cx, cz, ang, len, depth, top] of (fl.stairs || [])) {
      const geo = new THREE.BoxGeometry(len, top, depth);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, z0 + top / 2, cz);
      mesh.rotation.y = ang;
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
    }
  }

  // elevator car
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.4, metalness: 0.6, transparent: true, opacity: 0.85, clippingPlanes: [clipPlane] });
    for (const [cx, cz, w, d] of (fl.elev || [])) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, fl.wall_h - 0.1, d), mat);
      mesh.position.set(cx, z0 + (fl.wall_h - 0.1) / 2, cz);
      mesh.castShadow = true;
      g.add(mesh);
    }
  }

  // floor slab (bbox plate)
  {
    const [x0, y0, x1, y1] = fl.bbox;
    const w = (x1 - x0) + 0.9, d = (y1 - y0) + 0.9;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8d929c, roughness: 0.85, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, clippingPlanes: [clipPlane],
    });
    slabMaterials.push(mat);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), mat);
    mesh.position.set((x0 + x1) / 2, z0 - 0.11, -(y0 + y1) / 2);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }

  // level label
  const label = makeLabel(fl.name, '#' + new THREE.Color(color).getHexString());
  label.position.set(fl.bbox[0] - 1.8, (z0 + z1) / 2, -(fl.bbox[1] + fl.bbox[3]) / 2);
  g.add(label);

  // room labels lying on the slab
  const roomGroup = new THREE.Group();
  roomGroup.name = fl.key + '_rooms';
  for (const [rx, ry, name] of (fl.rooms || [])) {
    const m = makeFlatLabel(name);
    m.position.set(rx, z0 + 0.06, -ry);
    roomGroup.add(m);
  }
  g.add(roomGroup);

  floorGroups[fl.key] = g;
  scene.add(g);
}

// ---------- MEP systems (lights / switches / HVAC / plumbing / electrical) ----------
const MEP_STYLE = {
  light:    { color: 0xffd24a, label: '灯具' },
  switch:   { color: 0xff5a5a, label: '开关' },
  hvac:     { color: 0x4aa8ff, label: '暖通/空调' },
  plumbing: { color: 0x35e0d0, label: '给排水点位' },
  elec:     { color: 0x7ee06a, label: '机电设备' },
  drain:    { color: 0x9a6b4f, label: '排水管路·推断' },
  circ_orig:{ color: 0xffc060, label: '点灯回路·原绘' },
  circ_inferred: { color: 0xffa040, label: '点灯回路·推断' },
};
const mepGroupsByCat = {};
{
  const sphereGeo = new THREE.SphereGeometry(0.1, 10, 8);
  const swGeo = new THREE.BoxGeometry(0.15, 0.22, 0.12);
  const hvacGeo = new THREE.BoxGeometry(0.8, 0.28, 0.8);
  const plumbGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12);
  const elecGeo = new THREE.OctahedronGeometry(0.13);

  for (const fl of model.floors) {
    const data = mep[fl.key];
    if (!data) continue;
    const z0 = fl.slab, zh = fl.wall_h;
    const cats = {};
    const mk = (cat, geo, y, extra = {}) => {
      const pts = data[cat];
      if (!pts || !pts.length) return;
      const mat = new THREE.MeshStandardMaterial({
        color: MEP_STYLE[cat].color, roughness: 0.5, emissive: MEP_STYLE[cat].color,
        emissiveIntensity: 0.45, clippingPlanes: [clipPlane], ...extra,
      });
      const grp = new THREE.Group();
      grp.name = `mep_${cat}`;
      for (const [x, y2] of pts) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, z0 + y, y2);
        grp.add(m);
      }
      cats[cat] = grp;
      floorGroups[fl.key].add(grp);
      (mepGroupsByCat[cat] = mepGroupsByCat[cat] || []).push(grp);
    };
    mk('light', sphereGeo, zh - 0.18);
    mk('switch', swGeo, 1.32);
    mk('hvac', hvacGeo, zh - 0.5);
    mk('plumbing', plumbGeo, 0.55);
    mk('elec', elecGeo, 2.1);
    if (data.wire && data.wire.length) {
      const pos = [];
      for (const [a, b, c, d] of data.wire) pos.push(a, z0 + 1.35, b, c, z0 + 1.35, d);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: MEP_STYLE.circ_orig.color, clippingPlanes: [clipPlane],
      }));
      line.name = 'mep_wire';
      floorGroups[fl.key].add(line);
      (mepGroupsByCat.wire = mepGroupsByCat.wire || []).push(line);
    }
  }
}

// ---------- drainage pipes (inferred) + lighting circuits ----------
{
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x9a6b4f, roughness: 0.55, clippingPlanes: [clipPlane], clipShadows: true });
  const pipeGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 8);
  const up = new THREE.Vector3(0, 1, 0);
  function addPipe(grp, x1, y1, z1, x2, y2, z2, r = 0.045) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return;
    const m = new THREE.Mesh(pipeGeo, pipeMat);
    m.scale.set(r / 0.045, len, r / 0.045);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.quaternion.setFromUnitVectors(up, new THREE.Vector3(dx / len, dy / len, dz / len));
    grp.add(m);
  }

  for (const fl of model.floors) {
    const z0 = fl.slab;
    const dd = circ.drains[fl.key];
    if (dd && (dd.pipes.length || dd.risers.length)) {
      const grp = new THREE.Group();
      grp.name = 'mep_drain';
      for (const [a, b, c, d2] of dd.pipes) addPipe(grp, a, z0 + 0.30, b, c, z0 + 0.30, d2);
      floorGroups[fl.key].add(grp);
      (mepGroupsByCat.drain = mepGroupsByCat.drain || []).push(grp);
    }

    const cc = circ.circuits[fl.key];
    if (!cc) continue;
    const yc = z0 + fl.wall_h - 0.22;
    if (cc.orig.length) {
      const pos = [];
      for (const pl of cc.orig) {
        for (let i = 0; i < pl.length - 1; i++) {
          pos.push(pl[i][0], yc, pl[i][1], pl[i + 1][0], yc, pl[i + 1][1]);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffc060, clippingPlanes: [clipPlane] }));
      line.name = 'mep_circ_orig';
      floorGroups[fl.key].add(line);
      (mepGroupsByCat.circ_orig = mepGroupsByCat.circ_orig || []).push(line);
    }
    if (cc.inferred.length) {
      const grp = new THREE.Group();
      grp.name = 'mep_circ_inferred';
      const mat = new THREE.LineDashedMaterial({ color: 0xffa040, dashSize: 0.35, gapSize: 0.2, clippingPlanes: [clipPlane] });
      for (let i = 0; i + 1 < cc.inferred.length; i += 2) {
        const s1 = cc.inferred[i], s2 = cc.inferred[i + 1];
        const p = [
          new THREE.Vector3(s1[0], z0 + 1.35, s1[1]),
          new THREE.Vector3(s1[0], yc, s1[1]),
          new THREE.Vector3(s1[2], yc, s1[3]),
          new THREE.Vector3(s2[2], yc, s2[3]),
        ];
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), mat);
        l.computeLineDistances();
        grp.add(l);
      }
      floorGroups[fl.key].add(grp);
      (mepGroupsByCat.circ_inferred = mepGroupsByCat.circ_inferred || []).push(grp);
    }
  }

  // 户内排水主立管: 从 B2 提升到 F3 贯通
  {
    const b2 = model.floors.find(f => f.key === 'B2');
    const f3 = model.floors.find(f => f.key === 'F3');
    const r0 = (circ.drains.B2 && circ.drains.B2.risers.length) ? circ.drains.B2.risers[0] : [0.52, -28.57];
    const grp = new THREE.Group();
    grp.name = 'mep_drain';
    addPipe(grp, r0[0], b2.slab + 0.30, r0[1], r0[0], f3.slab + f3.wall_h, r0[1], 0.07);
    scene.add(grp);
    mepGroupsByCat.drain.push(grp);
  }
}

// roof plate over F3
{
  const f3 = model.floors.find(f => f.key === 'F3');
  const [x0, y0, x1, y1] = f3.bbox;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry((x1 - x0) + 1.2, 0.25, (y1 - y0) + 1.2),
    new THREE.MeshStandardMaterial({ color: 0x6f7681, roughness: 0.9, transparent: true, opacity: 0.85, clippingPlanes: [clipPlane] })
  );
  roof.position.set((x0 + x1) / 2, model.roof - 0.125, -(y0 + y1) / 2);
  roof.castShadow = true; roof.receiveShadow = true;
  const roofGroup = new THREE.Group();
  roofGroup.add(roof);
  scene.add(roofGroup);
  floorGroups['ROOF'] = roofGroup;
  // roof checkbox
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<input type="checkbox" id="ck_ROOF" checked>
    <label for="ck_ROOF"><span class="sw" style="background:#8d929c"></span> 屋面顶盖 <span style="color:#6b7484">(+10.15m)</span></label>`;
  document.getElementById('floors').appendChild(row);
  row.querySelector('input').addEventListener('change', e => {
    roofGroup.visible = e.target.checked;
  });
  const q = new URLSearchParams(location.search);
  if (q.get('roof') === '0') {
    roofGroup.visible = false;
    row.querySelector('input').checked = false;
  }
  if (q.get('clip')) {
    clipPlane.constant = parseFloat(q.get('clip'));
    const slider = document.getElementById('clipH');
    slider.value = parseFloat(q.get('clip')) * 100;
  }
}

// ---------- UI ----------
const floorsBox = document.getElementById('floors');
for (const fl of model.floors) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<input type="checkbox" id="ck_${fl.key}" checked>
    <label for="ck_${fl.key}"><span class="sw" style="background:#${new THREE.Color(COLORS[fl.key]).getHexString()}"></span> ${fl.name} <span style="color:#6b7484">(${fl.slab.toFixed(1)}m)</span></label>`;
  floorsBox.appendChild(row);
  row.querySelector('input').addEventListener('change', e => {
    floorGroups[fl.key].visible = e.target.checked;
  });
}
document.getElementById('slabOp').addEventListener('input', e => {
  const v = e.target.value / 100;
  slabMaterials.forEach(m => m.opacity = v);
});
// room label visibility
{
  const allRooms = [];
  scene.traverse(o => { if (o.name.endsWith('_rooms')) allRooms.push(o); });
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<input type="checkbox" id="ck_rooms" checked><label for="ck_rooms">显示房间标注</label>`;
  floorsBox.appendChild(row);
  row.querySelector('input').addEventListener('change', e => {
    allRooms.forEach(g => g.visible = e.target.checked);
  });
}
document.getElementById('clipH').addEventListener('input', e => {
  clipPlane.constant = e.target.value / 100;
});

// MEP system toggles
{
  const box = document.getElementById('mepbox');
  const q = new URLSearchParams(location.search);
  const mepOff = q.get('mep') === '0';
  for (const [cat, style] of Object.entries(MEP_STYLE)) {
    const groups = mepGroupsByCat[cat];
    if (!groups || !groups.length) continue;
    let count = 0;
    for (const g of groups) count += g.children.length || 1;
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<input type="checkbox" id="ck_mep_${cat}" checked>
      <label for="ck_mep_${cat}"><span class="sw" style="background:#${new THREE.Color(style.color).getHexString()}"></span> ${style.label} <span style="color:#6b7484">(${count})</span></label>`;
    box.appendChild(row);
    const cb = row.querySelector('input');
    cb.addEventListener('change', e => {
      groups.forEach(g => g.visible = e.target.checked);
    });
    if (mepOff) { groups.forEach(g => g.visible = false); cb.checked = false; }
  }
  // "all on / all off" quick buttons
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<a href="javascript:void 0" id="mep_all_on" style="font-size:11px;color:#4f8cff">全部显示</a>
    <a href="javascript:void 0" id="mep_all_off" style="font-size:11px;color:#4f8cff">全部隐藏</a>`;
  box.appendChild(row);
  const setAll = v => {
    box.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = v; cb.dispatchEvent(new Event('change')); });
  };
  row.querySelector('#mep_all_on').addEventListener('click', () => setAll(true));
  row.querySelector('#mep_all_off').addEventListener('click', () => setAll(false));
}
let rotating = false;
document.getElementById('rotate').addEventListener('click', e => {
  rotating = !rotating;
  controls.autoRotate = rotating;
  e.target.style.background = rotating ? '#2b4a7a' : '#1d2634';
});
document.getElementById('topview').addEventListener('click', () => {
  camera.position.set(2, 42, 0.02);
  controls.target.set(2, 0, 0);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});