/* Línea de tiempo interactiva del aprendizaje por refuerzo.
   Abrir linea-de-tiempo-rl.html (three.min.js debe estar en esta carpeta). */
(function () {
  const errBox = document.getElementById("boot-error");
  function showError(message) {
    if (!errBox) return;
    errBox.hidden = false;
    errBox.textContent = message;
  }
  if (!window.THREE) {
    showError("No se encontró three.min.js junto a esta página.");
    return;
  }

  const THREE = window.THREE;
  const jobs = [];
  const pickables = [];
  const edgeMats = [];
  const nodes = [];
  const clock = { t: 0, dt: 0 };
  function onFrame(fn) { jobs.push(fn); }

  const XS = [-21, -7, 7, 21];
  const DX = [-3.05, 3.05];

  let haloTex = null;
  let shadowTex = null;

  function getHalo() {
    if (haloTex) return haloTex;
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(0.22, "rgba(255,255,255,0.32)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    haloTex = new THREE.CanvasTexture(c);
    return haloTex;
  }

  function makeText(text, opt) {
    const o = opt || {};
    const size = o.size || 48;
    const weight = o.weight || 650;
    const color = o.color || "#e8f1ff";
    const font = weight + " " + size + 'px "Segoe UI", system-ui, sans-serif';
    if (!makeText.probe) makeText.probe = document.createElement("canvas").getContext("2d");
    const probe = makeText.probe;
    probe.font = font;
    const lines = String(text).split("\n");
    let maxW = 8;
    lines.forEach(function (ln) { maxW = Math.max(maxW, probe.measureText(ln).width); });
    const width = Math.ceil(maxW + size * 0.7);
    const lineH = size * 1.22;
    const height = Math.ceil(lineH * lines.length + size * 0.4);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    g.font = font;
    g.fillStyle = color;
    g.textAlign = "center";
    g.textBaseline = "middle";
    lines.forEach(function (ln, i) {
      g.fillText(ln, width / 2, size * 0.32 + lineH * (i + 0.5));
    });
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    const sprite = new THREE.Sprite(mat);
    const worldH = o.worldH == null ? 0.22 : o.worldH;
    sprite.scale.set(worldH * (width / height), worldH, 1);
    sprite.renderOrder = 6;
    return sprite;
  }

  function basicMat(color, extra) {
    return new THREE.MeshBasicMaterial(Object.assign({ color: color, toneMapped: false }, extra || {}));
  }
  function solidMat(color, emit) {
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.48,
      metalness: 0.08,
      emissive: new THREE.Color(color),
      emissiveIntensity: emit == null ? 0.16 : emit
    });
  }
  function lineMat(color, opacity) {
    const o = opacity == null ? 1 : opacity;
    return new THREE.LineBasicMaterial({ color: color, transparent: o < 1, opacity: o, toneMapped: false });
  }

  function makePlate(w, h, accent, goIndex) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x0c1222,
        roughness: 0.56,
        metalness: 0.16,
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.06
      })
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(body.geometry),
      new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.38, toneMapped: false })
    );
    edgeMats.push(edges.material);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getHalo(),
      color: accent,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    halo.scale.set(w * 1.12, h * 1.18, 1);
    halo.position.z = -0.3;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.028, 0.02), basicMat(accent));
    bar.position.set(-w / 2 + 0.36, h / 2 - 0.09, 0.04);
    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.z = 0.4;
    hit.userData.go = goIndex;
    pickables.push(hit);
    group.add(halo, body, edges, bar, hit);
    return group;
  }

  function ribbon(pts, halfW, colorOrColors) {
    const useColors = Array.isArray(colorOrColors);
    const positions = [];
    const cols = [];
    const up = new THREE.Vector3(0, 0, 1);
    const side = new THREE.Vector3();
    const tan = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(pts.length - 1, i + 1);
      tan.subVectors(pts[i1], pts[i0]);
      if (tan.lengthSq() < 1e-8) tan.set(1, 0, 0);
      tan.normalize();
      side.crossVectors(tan, up);
      if (side.lengthSq() < 1e-8) side.set(0, 1, 0);
      side.normalize().multiplyScalar(halfW);
      const p = pts[i];
      positions.push(p.x + side.x, p.y + side.y, p.z, p.x - side.x, p.y - side.y, p.z);
      if (useColors) {
        const c = colorOrColors[i];
        cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (useColors) geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const idx = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color: useColors ? 0xffffff : colorOrColors,
      vertexColors: useColors,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.segs = pts.length - 1;
    return mesh;
  }

  function band(upper, lower, color, opacity) {
    const shape = new THREE.Shape();
    shape.moveTo(upper[0].x, upper[0].y);
    for (let i = 1; i < upper.length; i++) shape.lineTo(upper[i].x, upper[i].y);
    for (let i = lower.length - 1; i >= 0; i--) shape.lineTo(lower[i].x, lower[i].y);
    return new THREE.Mesh(new THREE.ShapeGeometry(shape), basicMat(color, {
      transparent: true, opacity: opacity, side: THREE.DoubleSide, depthWrite: false
    }));
  }

  function chartFrame(w, h, xLabel, yLabel) {
    const g = new THREE.Group();
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, 0, 0)
    ]), lineMat(0xd5e2f4, 0.85)));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0)
    ]), lineMat(0xd5e2f4, 0.85)));
    for (let i = 1; i <= 4; i++) {
      const y = (h * i) / 4;
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, y, 0), new THREE.Vector3(w, y, 0)
      ]), lineMat(0x9fb0c8, 0.16)));
    }
    const xl = makeText(xLabel, { size: 34, color: "#d5e2f4", worldH: 0.13 });
    xl.position.set(w / 2, -0.2, 0);
    const yl = makeText(yLabel, { size: 34, color: "#d5e2f4", worldH: 0.13 });
    yl.position.set(w * 0.5, h + 0.16, 0);
    g.add(xl, yl);
    return g;
  }

  function curveArrow(p0, p1, lift, color, label) {
    const g = new THREE.Group();
    const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
    mid.y += lift;
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 28, 0.016, 6, false),
      basicMat(color)
    );
    g.add(tube);
    const tan = curve.getTangent(1).normalize();
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.046, 0.12, 10), basicMat(color));
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    tip.position.copy(curve.getPoint(1)).addScaledVector(tan, -0.02);
    g.add(tip);
    const dots = [];
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), basicMat("#ffffff"));
      g.add(d);
      dots.push(d);
    }
    onFrame(function () {
      dots.forEach(function (d, i) {
        d.position.copy(curve.getPoint((clock.t * 0.22 + i / 3) % 1));
      });
    });
    if (label) {
      const lab = makeText(label, { size: 36, color: "#f4f7ff", worldH: 0.15 });
      const at = curve.getPoint(0.5);
      lab.position.set(at.x, at.y + (lift > 0 ? 0.22 : -0.22), at.z);
      g.add(lab);
    }
    return g;
  }

  function flatArrow(x0, x1, y, z, color) {
    const g = new THREE.Group();
    const len = Math.max(0.08, x1 - x0);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, len - 0.12), 0.022, 0.022), basicMat(color));
    shaft.position.set((x0 + x1) / 2 - 0.04, y, z);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.13, 10), basicMat(color));
    head.rotation.z = -Math.PI / 2;
    head.position.set(x1, y, z);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), basicMat("#ffffff"));
    g.add(shaft, head, dot);
    onFrame(function () {
      const u = (clock.t * 0.4) % 1;
      dot.position.set(x0 + (x1 - x0) * u, y, z + 0.02);
    });
    return g;
  }

  function makeQuad(hex, scale) {
    const root = new THREE.Group();
    const bob = new THREE.Group();
    root.add(bob);
    const mat = solidMat(hex, 0.22);
    const joint = solidMat(0x242a33, 0.04);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.18, 0.32), mat);
    body.position.y = 0.48;
    bob.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22), mat);
    head.position.set(0.46, 0.56, 0);
    bob.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.16), basicMat(0xbff7ff));
    visor.position.set(0.58, 0.57, 0);
    bob.add(visor);
    const legs = [];
    [[0.26, 0.13], [0.26, -0.13], [-0.28, 0.13], [-0.28, -0.13]].forEach(function (m, i) {
      const hip = new THREE.Group();
      hip.position.set(m[0], 0.42, m[1]);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), mat);
      upper.position.y = -0.1;
      const knee = new THREE.Group();
      knee.position.y = -0.2;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.055), joint);
      lower.position.y = -0.09;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.055), joint);
      foot.position.set(0.02, -0.19, 0);
      knee.add(lower, foot);
      hip.add(upper, knee);
      bob.add(hip);
      legs.push({ hip: hip, knee: knee, diag: (i === 0 || i === 3) ? 0 : Math.PI });
    });
    onFrame(function () {
      const t = clock.t * 5.2;
      legs.forEach(function (L) {
        const s = Math.sin(t + L.diag);
        L.hip.rotation.z = s * 0.42;
        L.knee.rotation.z = -0.4 + (s + 1) * 0.12;
      });
      bob.position.y = Math.abs(Math.sin(t)) * 0.018;
    });
    root.scale.setScalar(scale || 1);
    return root;
  }

  function makeRover(hex) {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), solidMat(hex, 0.28));
    body.position.y = 0.22;
    root.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.2), solidMat(0xd7e6f8, 0.06));
    cab.position.set(0.04, 0.34, 0);
    root.add(cab);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.12), basicMat(0xd8fbff));
    eye.position.set(0.16, 0.35, 0);
    root.add(eye);
    [[0.16, 0.13], [0.16, -0.13], [-0.16, 0.13], [-0.16, -0.13]].forEach(function (p) {
      const spinner = new THREE.Group();
      spinner.position.set(p[0], 0.08, p[1]);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 12), solidMat(0x222831, 0.02));
      w.rotation.x = Math.PI / 2;
      spinner.add(w);
      root.add(spinner);
      onFrame(function () { spinner.rotation.z = clock.t * 3.2; });
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), basicMat(hex, { transparent: true, opacity: 1 }));
    bulb.position.set(-0.16, 0.46, 0);
    root.add(bulb);
    onFrame(function () { bulb.material.opacity = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(clock.t * 4)); });
    return root;
  }

  function gear(r, hex) {
    const g = new THREE.Group();
    const mat = solidMat(hex, 0.15);
    g.add(new THREE.Mesh(new THREE.CircleGeometry(r, 22), mat));
    g.add(new THREE.Mesh(new THREE.RingGeometry(r * 0.42, r * 0.68, 18), basicMat(0x10151f, { side: THREE.DoubleSide })));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(r * 0.22, r * 0.28, 0.04), mat);
      tooth.position.set(Math.cos(a) * (r * 0.92), Math.sin(a) * (r * 0.92), 0);
      tooth.rotation.z = a;
      g.add(tooth);
    }
    return g;
  }

  function shadowDisc(r) {
    if (!shadowTex) {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const g = c.getContext("2d");
      const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
      grd.addColorStop(0, "rgba(0,0,0,0.5)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      shadowTex = new THREE.CanvasTexture(c);
    }
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(r, 20),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.015;
    return mesh;
  }

  function terrainTexture(seed, hex) {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 72;
    const g = canvas.getContext("2d");
    const base = new THREE.Color(hex);
    const img = g.createImageData(96, 72);
    for (let y = 0; y < 72; y++) {
      for (let x = 0; x < 96; x++) {
        const n = 0.62 + 0.38 * Math.sin(x * 0.17 + seed) * Math.cos(y * 0.21 + seed);
        const i = (y * 96 + x) * 4;
        img.data[i] = Math.max(0, Math.min(255, base.r * 255 * n));
        img.data[i + 1] = Math.max(0, Math.min(255, base.g * 255 * n));
        img.data[i + 2] = Math.max(0, Math.min(255, base.b * 255 * n));
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = "rgba(255,255,255,0.32)";
    g.lineWidth = 1;
    for (let y = 8; y < 72; y += 12) {
      g.beginPath();
      for (let x = 0; x <= 96; x += 4) {
        const yy = y + Math.sin(x * 0.18 + y + seed) * 2.2;
        if (x === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeGround(w, d, hex, freq, amp) {
    const geo = new THREE.PlaneGeometry(w, d, 18, 14);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = Math.sin(x * freq) * amp + Math.cos(z * freq * 1.25) * amp * 0.65;
      pos.setY(i, Math.max(0, y));
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.94, metalness: 0 }));
  }

  function icon(kind, hex) {
    const g = new THREE.Group();
    const m = basicMat(hex);
    function add(geo, x, y, rz) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, 0);
      if (rz) mesh.rotation.z = rz;
      g.add(mesh);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), basicMat(0x101828, { transparent: true, opacity: 0.9 }));
    disc.position.z = -0.03;
    g.add(disc);
    if (kind === "maze") {
      add(new THREE.BoxGeometry(0.28, 0.035, 0.03), 0, 0.1);
      add(new THREE.BoxGeometry(0.035, 0.22, 0.03), -0.08, -0.02);
      add(new THREE.BoxGeometry(0.16, 0.035, 0.03), 0.04, -0.02);
      add(new THREE.BoxGeometry(0.035, 0.14, 0.03), 0.1, -0.1);
    } else if (kind === "tictac") {
      add(new THREE.BoxGeometry(0.28, 0.02, 0.02), 0, 0.06);
      add(new THREE.BoxGeometry(0.28, 0.02, 0.02), 0, -0.06);
      add(new THREE.BoxGeometry(0.02, 0.28, 0.02), -0.06, 0);
      add(new THREE.BoxGeometry(0.02, 0.28, 0.02), 0.06, 0);
    } else if (kind === "table") {
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) add(new THREE.BoxGeometry(0.07, 0.05, 0.02), (c - 1) * 0.09, (r - 0.5) * 0.08);
      }
    } else if (kind === "pad") {
      add(new THREE.BoxGeometry(0.26, 0.16, 0.03), 0, 0);
      add(new THREE.BoxGeometry(0.09, 0.025, 0.02), -0.05, 0);
      add(new THREE.BoxGeometry(0.025, 0.09, 0.02), -0.05, 0);
      add(new THREE.SphereGeometry(0.025, 8, 8), 0.08, 0.03);
      add(new THREE.SphereGeometry(0.02, 8, 8), 0.08, -0.035);
    } else if (kind === "arm") {
      add(new THREE.BoxGeometry(0.16, 0.035, 0.03), -0.04, 0.06, -0.6);
      add(new THREE.BoxGeometry(0.14, 0.032, 0.03), 0.08, -0.02, 0.5);
      add(new THREE.SphereGeometry(0.03, 8, 8), -0.12, 0.1);
    } else {
      add(new THREE.SphereGeometry(0.09, 14, 12), 0, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 24), m);
      ring.rotation.x = 1.1;
      g.add(ring);
    }
    return g;
  }

  function iconRow(items, x, y, hex) {
    const g = new THREE.Group();
    items.forEach(function (it, i) {
      const node = new THREE.Group();
      node.position.x = (i - 1) * 0.58;
      const ic = icon(it[0], hex);
      node.add(ic);
      const lab = makeText(it[1], { size: 32, color: "#d7e6ff", worldH: 0.11 });
      lab.position.y = -0.34;
      node.add(lab);
      g.add(node);
    });
    g.position.set(x, y, 0.12);
    return g;
  }

  function radar(values, labels, radius, color) {
    const g = new THREE.Group();
    const n = values.length;
    function ang(i) { return -Math.PI / 2 + (i / n) * Math.PI * 2; }
    [0.35, 0.67, 1].forEach(function (f) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = ang(i % n);
        pts.push(new THREE.Vector3(Math.cos(a) * radius * f, Math.sin(a) * radius * f, 0));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0x9eb0c8, 0.4)));
    });
    for (let i = 0; i < n; i++) {
      const a = ang(i);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0)
      ]), lineMat(0x9eb0c8, 0.4)));
      const lab = makeText(labels[i], { size: 30, color: "#e7f1ff", worldH: 0.12 });
      lab.position.set(Math.cos(a) * (radius + 0.34), Math.sin(a) * (radius + 0.32), 0);
      g.add(lab);
    }
    const shape = new THREE.Shape();
    values.forEach(function (v, i) {
      const a = ang(i);
      const x = Math.cos(a) * radius * v;
      const y = Math.sin(a) * radius * v;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), basicMat(color, {
      transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false
    }));
    const outlinePts = values.map(function (v, i) {
      const a = ang(i);
      return new THREE.Vector3(Math.cos(a) * radius * v, Math.sin(a) * radius * v, 0.02);
    });
    outlinePts.push(outlinePts[0].clone());
    const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePts), lineMat(color, 1));
    g.add(mesh, outline);
    onFrame(function () {
      const s = 1 + Math.sin(clock.t * 1.3) * 0.03;
      mesh.scale.set(s, s, 1);
      outline.scale.set(s, s, 1);
    });
    return g;
  }

  function titleOf(parent, text, y) {
    const s = makeText(text, { size: 44, weight: 700, color: "#f5f8ff", worldH: 0.22 });
    s.position.set(0, y, 0.12);
    parent.add(s);
    return s;
  }

  function buildMDP(spec, accent, goIndex) {
    const plate = makePlate(spec.plateW, spec.plateH, accent, goIndex);
    titleOf(plate, "Bucle agente–entorno", spec.plateH / 2 - 0.28);
    const agent = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.46, 0.14), solidMat(0x2f6fed, 0.28));
    agent.position.set(-0.78, 0.42, 0.06);
    const env = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.46, 0.14), solidMat(0x12998a, 0.28));
    env.position.set(0.82, 0.42, 0.06);
    plate.add(agent, env);
    const aLab = makeText("AGENTE", { size: 42, weight: 700, color: "#ffffff", worldH: 0.16 });
    aLab.position.set(-0.78, 0.42, 0.15);
    const eLab = makeText("ENTORNO\nMDP", { size: 36, weight: 700, color: "#ffffff", worldH: 0.28 });
    eLab.position.set(0.82, 0.42, 0.15);
    plate.add(aLab, eLab);
    const z = 0.12;
    plate.add(curveArrow(
      new THREE.Vector3(-0.16, 0.62, z),
      new THREE.Vector3(0.18, 0.62, z),
      0.34, 0x4c8dff, "Acción  a(t)"
    ));
    plate.add(curveArrow(
      new THREE.Vector3(0.18, 0.28, z),
      new THREE.Vector3(-0.16, 0.32, z),
      -0.28, 0xff9f43, "Estado  s(t)"
    ));
    plate.add(curveArrow(
      new THREE.Vector3(0.2, 0.16, z),
      new THREE.Vector3(-0.16, 0.12, z),
      -0.42, 0xf2c14e, "Recompensa  r(t)"
    ));

    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const rows = [
      ["s\u2081", ["0.8", "\u22120.5", "1.2"], 2],
      ["s\u2082", ["\u22120.5", "\u22120.1", "2.3"], 2],
      ["s\u2083", ["1.2", "\u22120.5", "0.2"], 0]
    ];
    function drawQ(scan) {
      ctx.clearRect(0, 0, 960, 400);
      ctx.fillStyle = "#122033";
      roundRect(ctx, 8, 8, 944, 384, 24);
      ctx.fill();
      ctx.fillStyle = "#d5e6ff";
      ctx.font = "700 32px Segoe UI, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Tabla de valores  estado–acción", 40, 52);
      ctx.font = "600 28px Segoe UI, sans-serif";
      ctx.fillStyle = "#8fb4ff";
      ctx.textAlign = "center";
      ["a\u2081", "a\u2082", "a\u2083"].forEach(function (h, i) { ctx.fillText(h, 300 + i * 210, 112); });
      rows.forEach(function (row, r) {
        const y = 175 + r * 70;
        ctx.textAlign = "center";
        ctx.fillStyle = "#d5e6ff";
        ctx.font = "700 28px Segoe UI, sans-serif";
        ctx.fillText(row[0], 90, y);
        row[1].forEach(function (val, c) {
          const x = 300 + c * 210;
          const best = c === row[2];
          const on = scan === r * 3 + c;
          ctx.fillStyle = best ? "rgba(48,168,120,0.45)" : "rgba(255,255,255,0.04)";
          roundRect(ctx, x - 78, y - 28, 156, 48, 8);
          ctx.fill();
          if (on) {
            ctx.strokeStyle = "#ffd36a";
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          ctx.fillStyle = best ? "#b6ffdf" : "#f2f6ff";
          ctx.font = "650 30px Segoe UI, sans-serif";
          ctx.fillText(val, x, y + 4);
        });
      });
      ctx.font = "500 22px Segoe UI, sans-serif";
      ctx.fillStyle = "#b7c8e4";
      ctx.textAlign = "left";
      ctx.fillText("Q  \u2190  Q + \u03b1 [ r + \u03b3 max Q(s', a') \u2212 Q ]", 40, 368);
    }
    drawQ(-1);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 1.06), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, toneMapped: false
    }));
    table.position.set(0.05, -0.95, 0.1);
    plate.add(table);
    let last = -2;
    onFrame(function () {
      const cell = Math.floor(clock.t * 0.7) % 9;
      if (cell === last) return;
      last = cell;
      drawQ(cell);
      tex.needsUpdate = true;
    });
    return plate;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function buildGrid(spec, accent, goIndex) {
    const plate = makePlate(spec.plateW, spec.plateH, accent, goIndex);
    titleOf(plate, "Convergencia en la cuadrícula", spec.plateH / 2 - 0.26);
    const stride = 0.4;
    const cell = 0.34;
    const gridX = -1.05;
    const gridY = -0.08;
    function center(c, r) {
      return new THREE.Vector3(gridX + (c - 1.5) * stride, gridY + (r - 1) * stride, 0.1);
    }
    const tiles = [
      { c: 0, r: 2, bg: "#f4f1e8", fg: "#1c2430", label: "", arrow: "right" },
      { c: 1, r: 2, bg: "#f4f1e8", fg: "#1c2430", label: "", arrow: "right" },
      { c: 2, r: 2, bg: "#f4f1e8", fg: "#1c2430", label: "", arrow: "right" },
      { c: 3, r: 2, bg: "#1f8a4c", fg: "#ffffff", label: "META\n+1", arrow: "" },
      { c: 0, r: 1, bg: "#f4f1e8", fg: "#1c2430", label: "", arrow: "up" },
      { c: 1, r: 1, bg: "#2a2e33", fg: "#ffffff", label: "OBSTÁCULO", arrow: "" },
      { c: 2, r: 1, bg: "#f4f1e8", fg: "#1c2430", label: "", arrow: "up" },
      { c: 3, r: 1, bg: "#c45b66", fg: "#ffffff", label: "PENAL\n−1", arrow: "" },
      { c: 0, r: 0, bg: "#3a7fbf", fg: "#ffffff", label: "INICIO", arrow: "up" },
      { c: 1, r: 0, bg: "#f4f1e8", fg: "#1c2430", label: "", arrow: "left" },
      { c: 2, r: 0, bg: "#f4f1e8", fg: "#1c2430", label: "", arrow: "left" },
      { c: 3, r: 0, bg: "#f4f1e8", fg: "#1c2430", label: "", arrow: "left" }
    ];
    tiles.forEach(function (t) {
      const tex = tileTexture(t);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cell, cell), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      mesh.position.copy(center(t.c, t.r));
      plate.add(mesh);
    });
    const path = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2]].map(function (p) { return center(p[0], p[1]); });
    const token = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), basicMat(0xffe08a));
    plate.add(token);
    const segDur = 0.48;
    const travel = (path.length - 1) * segDur;
    onFrame(function () {
      const u = clock.t % (travel + 0.85);
      if (u >= travel) token.position.copy(path[path.length - 1]);
      else {
        const f = Math.max(0, u) / segDur;
        const i = Math.max(0, Math.min(path.length - 2, Math.floor(f)));
        token.position.lerpVectors(path[i], path[i + 1], Math.min(1, f - i));
      }
      token.position.z = 0.2;
      token.position.y += Math.sin(clock.t * 7) * 0.015;
    });

    const W = 1.7;
    const H = 1.35;
    const chart = chartFrame(W, H, "Episodios  \u2192", "Retorno");
    chart.position.set(0.2, -0.78, 0.1);
    plate.add(chart);
    const N = 80;
    const pts = [];
    const hi = [];
    const lo = [];
    function yOf(v) { return ((v + 1) / 2) * H; }
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const mean = -0.55 + 1.48 * (1 - Math.exp(-3.2 * t));
      const amp = 0.36 * Math.exp(-3.0 * t);
      const noise = Math.sin(t * 46) * amp + Math.sin(t * 18 + 1.1) * amp * 0.4;
      pts.push(new THREE.Vector3(t * W, yOf(mean + noise), 0));
      hi.push(new THREE.Vector3(t * W, yOf(mean + amp), 0));
      lo.push(new THREE.Vector3(t * W, yOf(mean - amp), 0));
    }
    const area = band(hi, lo, 0x7ec8ff, 0.18);
    area.position.z = 0.01;
    const line = ribbon(pts, 0.014, 0x8fd4ff);
    line.position.z = 0.03;
    chart.add(area, line);
    const maxY = yOf(0.92);
    const maxGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, maxY, 0.02), new THREE.Vector3(W, maxY, 0.02)
    ]);
    const maxLine = new THREE.Line(maxGeo, new THREE.LineDashedMaterial({
      color: 0xfff6d8, dashSize: 0.05, gapSize: 0.035, toneMapped: false, transparent: true, opacity: 0.8
    }));
    maxLine.computeLineDistances();
    chart.add(maxLine);
    const maxLab = makeText("máximo esperado", { size: 28, color: "#fff1c9", worldH: 0.11 });
    maxLab.position.set(W * 0.72, maxY + 0.1, 0.04);
    chart.add(maxLab);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), basicMat(0xffffff));
    head.position.z = 0.05;
    chart.add(head);
    const cCanvas = document.createElement("canvas");
    cCanvas.width = 420;
    cCanvas.height = 72;
    const cg = cCanvas.getContext("2d");
    const cTex = new THREE.CanvasTexture(cCanvas);
    if (THREE.SRGBColorSpace) cTex.colorSpace = THREE.SRGBColorSpace;
    const counter = new THREE.Sprite(new THREE.SpriteMaterial({ map: cTex, transparent: true, depthWrite: false, toneMapped: false }));
    counter.scale.set(0.78, 0.14, 1);
    counter.position.set(W * 0.32, -0.42, 0.04);
    chart.add(counter);
    let lastEp = -1;
    onFrame(function () {
      const u = (clock.t % 9) / 9;
      const segs = Math.max(1, Math.floor(u * line.userData.segs));
      line.geometry.setDrawRange(0, segs * 6);
      const idx = Math.min(pts.length - 1, segs);
      head.position.set(pts[idx].x, pts[idx].y, 0.05);
      area.material.opacity = 0.05 + 0.2 * u;
      const ep = Math.min(500, Math.floor(u * 520));
      const bucket = Math.floor(ep / 8);
      if (bucket !== lastEp) {
        lastEp = bucket;
        cg.clearRect(0, 0, 420, 72);
        cg.font = "650 34px Segoe UI, sans-serif";
        cg.fillStyle = "#d7e8ff";
        cg.textAlign = "center";
        cg.textBaseline = "middle";
        cg.fillText("episodio " + ep, 210, 36);
        cTex.needsUpdate = true;
      }
    });
    const note = makeText("la política evita obstáculo y penalización", { size: 28, color: "#c9d8ee", worldH: 0.11 });
    note.position.set(gridX, gridY - 0.85, 0.12);
    plate.add(note);
    return plate;
  }

  function tileTexture(t) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = t.bg;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(20,24,32,0.25)";
    g.lineWidth = 8;
    g.strokeRect(6, 6, 244, 244);
    if (t.label) {
      g.fillStyle = t.fg;
      g.font = "700 34px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      const lines = t.label.split("\n");
      lines.forEach(function (ln, i) {
        g.fillText(ln, 128, 118 + (i - (lines.length - 1) / 2) * 38);
      });
    }
    if (t.arrow) {
      g.save();
      g.translate(128, t.label ? 196 : 128);
      const rot = { right: 0, up: -Math.PI / 2, left: Math.PI, down: Math.PI / 2 }[t.arrow];
      g.rotate(rot);
      g.fillStyle = t.bg === "#f4f1e8" ? "rgba(20,28,40,0.78)" : "rgba(255,255,255,0.9)";
      g.beginPath();
      g.moveTo(62, 0);
      g.lineTo(18, 26);
      g.lineTo(18, 10);
      g.lineTo(-62, 10);
      g.lineTo(-62, -10);
      g.lineTo(18, -10);
      g.lineTo(18, -26);
      g.closePath();
      g.fill();
      g.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function gameTexture() {
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 96;
    const g = c.getContext("2d");
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    const colors = ["#ff5d6c", "#ffd166", "#7ae1ff", "#c9a0ff"];
    onFrame(function () {
      const t = clock.t;
      g.fillStyle = "#14233f";
      g.fillRect(0, 0, 96, 96);
      g.fillStyle = "#2c6a4e";
      g.fillRect(0, 74, 96, 22);
      for (let r = 0; r < 3; r++) {
        for (let col = 0; col < 6; col++) {
          g.fillStyle = colors[(r + col) % 4];
          g.fillRect(8 + col * 14, 10 + r * 12, 12, 8);
        }
      }
      const px = 28 + Math.sin(t * 1.5) * 24;
      g.fillStyle = "#e9fbff";
      g.fillRect(px, 66, 24, 4);
      g.beginPath();
      g.arc(48 + Math.sin(t * 1.8) * 30, 42 + Math.cos(t * 2.2) * 12, 3.5, 0, Math.PI * 2);
      g.fill();
      tex.needsUpdate = true;
    });
    return tex;
  }

  function buildNet(spec, accent, goIndex) {
    const plate = makePlate(spec.plateW, spec.plateH, accent, goIndex);
    titleOf(plate, "Red neuronal y política", spec.plateH / 2 - 0.26);
    const sub = makeText("DQN  ·  PPO", { size: 32, color: "#c9b6ff", worldH: 0.14 });
    sub.position.set(0, spec.plateH / 2 - 0.52, 0.12);
    plate.add(sub);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), new THREE.MeshBasicMaterial({
      map: gameTexture(), toneMapped: false
    }));
    screen.position.set(-1.5, 0.18, 0.1);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.82, 0.04), solidMat(0x141c2e, 0.05));
    bezel.position.set(-1.5, 0.18, 0.06);
    plate.add(bezel, screen);
    const cap = makeText("fotograma", { size: 28, color: "#d5e4ff", worldH: 0.11 });
    cap.position.set(-1.5, -0.34, 0.12);
    plate.add(cap);

    const cubes = [];
    function layer(n, spread, size, x, y0, hex) {
      const off = (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size * 0.7), solidMat(hex, 0.35));
          m.position.set(x, y0 + (i - off) * spread, 0.08 + (j - off) * 0.02);
          plate.add(m);
          cubes.push(m);
        }
      }
    }
    layer(4, 0.16, 0.1, -0.78, 0.22, 0x67d0ff);
    layer(3, 0.18, 0.12, -0.22, 0.22, 0x9a7dff);
    const dense = [];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), solidMat(0xc49bff, 0.4));
      s.position.set(0.32, 0.22 + (i - 2) * 0.2, 0.1);
      plate.add(s);
      dense.push(s);
    }
    onFrame(function () {
      cubes.forEach(function (m, i) {
        const s = 1 + Math.sin(clock.t * 2.1 + i * 0.4) * 0.1;
        m.scale.setScalar(s);
      });
      dense.forEach(function (m, i) {
        m.scale.setScalar(1 + Math.sin(clock.t * 2.4 + i) * 0.08);
      });
    });
    [[-1.5, 0.18, -0.78, 0.22], [-0.78, 0.22, -0.22, 0.22], [-0.22, 0.22, 0.32, 0.22], [0.32, 0.22, 0.95, 0.15]].forEach(function (ln) {
      plate.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ln[0], ln[1], 0.08),
        new THREE.Vector3(ln[2], ln[3], 0.08)
      ]), lineMat(0xc9b6ff, 0.35)));
    });
    const flow = curveArrow(
      new THREE.Vector3(-1.15, 0.18, 0.12),
      new THREE.Vector3(0.85, 0.2, 0.12),
      0.15, 0x3dffa8, ""
    );
    plate.add(flow);

    const names = ["no-op", "izq.", "der.", "saltar"];
    const bars = [];
    names.forEach(function (name, i) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.05), basicMat(0x5c6d88));
      bar.position.set(0.95 + i * 0.22, 0.05, 0.1);
      plate.add(bar);
      bars.push(bar);
      const lab = makeText(name, { size: 26, color: "#d5e4ff", worldH: 0.1 });
      lab.position.set(bar.position.x, -0.42, 0.12);
      plate.add(lab);
    });
    const pi = makeText("\u03c0(a|s)", { size: 32, color: "#d8ffe9", worldH: 0.13 });
    pi.position.set(1.28, 0.62, 0.12);
    plate.add(pi);
    onFrame(function () {
      const phase = Math.floor(clock.t / 2.6) % 4;
      const logits = [0, 1, 2, 3].map(function (i) {
        return (i === phase ? 2.1 : 0.25) + 0.12 * Math.sin(clock.t * 2 + i);
      });
      const m = Math.max.apply(null, logits);
      const ex = logits.map(function (v) { return Math.exp(v - m); });
      const sum = ex.reduce(function (a, b) { return a + b; }, 0);
      bars.forEach(function (bar, i) {
        const p = ex[i] / sum;
        bar.scale.y = 0.25 + p * 1.6;
        bar.position.y = -0.15 + bar.scale.y * 0.35;
        bar.material.color.set(i === phase ? 0x3dffa8 : 0x5c6d88);
      });
    });

    const W = 1.55;
    const H = 0.48;
    const chart = chartFrame(W, H, "", "");
    chart.position.set(-0.35, -1.15, 0.1);
    const mean = [];
    const base = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      mean.push(new THREE.Vector3(t * W, (0.12 + 0.78 * (1 - Math.exp(-3 * t))) * H, 0));
      base.push(new THREE.Vector3(t * W, 0.2 * H, 0));
    }
    const meanLine = ribbon(mean, 0.012, 0x3dffa8);
    const baseLine = ribbon(base, 0.008, 0x8ea0b8);
    meanLine.position.z = 0.03;
    baseLine.position.z = 0.02;
    chart.add(meanLine, baseLine);
    plate.add(chart);
    const ylab = makeText("recompensa media", { size: 26, color: "#d7e8ff", worldH: 0.11 });
    ylab.position.set(-1.15, -0.92, 0.12);
    const leg = makeText("política", { size: 26, color: "#b8ffd9", worldH: 0.1 });
    leg.position.set(0.85, -0.78, 0.12);
    const leg2 = makeText("baseline", { size: 26, color: "#b7c3d6", worldH: 0.1 });
    leg2.position.set(0.85, -1.22, 0.12);
    plate.add(ylab, leg, leg2);
    onFrame(function () {
      const u = (clock.t % 7) / 7;
      meanLine.geometry.setDrawRange(0, Math.max(1, Math.floor(u * meanLine.userData.segs)) * 6);
    });
    return plate;
  }

  function buildStates(spec, accent, goIndex) {
    const plate = makePlate(spec.plateW, spec.plateH, accent, goIndex);
    titleOf(plate, "Espacio de estados", spec.plateH / 2 - 0.26);
    const leftT = makeText("Problemas tabulares", { size: 34, color: "#bfefff", worldH: 0.15 });
    leftT.position.set(-1.0, 0.95, 0.12);
    const rightT = makeText("Deep RL", { size: 34, color: "#ffd0a1", worldH: 0.15 });
    rightT.position.set(1.0, 0.95, 0.12);
    plate.add(leftT, rightT);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.63, 40), basicMat(0x7fd0ff, { side: THREE.DoubleSide }));
    ring.position.set(-1.0, 0.28, 0.08);
    plate.add(ring);
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), basicMat(0x9aefff));
        s.position.set(-1.0 + (i - 2) * 0.16, 0.28 + (j - 2) * 0.16, 0.12);
        plate.add(s);
      }
    }
    const finite = makeText("Pequeño y finito", { size: 30, color: "#d6f4ff", worldH: 0.13 });
    finite.position.set(-1.0, -0.48, 0.12);
    const n1 = makeText("10\u00b3  –  10\u2075\nestados", { size: 40, color: "#e9fbff", worldH: 0.28 });
    n1.position.set(-1.0, -0.78, 0.12);
    plate.add(finite, n1);

    const cloud = new THREE.Group();
    cloud.position.set(1.05, 0.25, 0.1);
    const nodePos = [];
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.12 + Math.sqrt(Math.random()) * 0.62;
      nodePos.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.86, (Math.random() - 0.5) * 0.2));
    }
    const segPts = [];
    for (let i = 0; i < nodePos.length; i++) {
      for (let j = i + 1; j < nodePos.length; j++) {
        if (nodePos[i].distanceTo(nodePos[j]) < 0.34) segPts.push(nodePos[i], nodePos[j]);
      }
    }
    cloud.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segPts), lineMat(0xffb2e6, 0.35)));
    nodePos.forEach(function (p, i) {
      const col = new THREE.Color().setHSL(0.78 - (p.length() / 0.8) * 0.45, 0.8, 0.62);
      const s = new THREE.Mesh(new THREE.SphereGeometry(i % 7 === 0 ? 0.045 : 0.028, 10, 8), basicMat(col));
      s.position.copy(p);
      cloud.add(s);
    });
    plate.add(cloud);
    onFrame(function () {
      cloud.rotation.y = Math.sin(clock.t * 0.35) * 0.28;
    });
    const boom = makeText("Expansión exponencial", { size: 30, color: "#ffc48a", worldH: 0.13 });
    boom.position.set(1.05, -0.48, 0.12);
    const n2 = makeText("> 10\u2078\u2070   o   infinitos", { size: 36, color: "#ffe7c8", worldH: 0.16 });
    n2.position.set(1.05, -0.72, 0.12);
    plate.add(boom, n2);
    plate.add(iconRow([["maze", "Laberinto"], ["tictac", "Tablero"], ["table", "Matrices"]], -1.0, -1.18, 0x8fe7ff));
    plate.add(iconRow([["pad", "Juegos"], ["arm", "Control"], ["sim", "Simulación"]], 1.05, -1.18, 0xffc48a));
    return plate;
  }

  function buildPipe(spec, accent, goIndex) {
    const plate = makePlate(spec.plateW, spec.plateH, accent, goIndex);
    titleOf(plate, "Simulación  →  robot real", spec.plateH / 2 - 0.24);
    const monitors = [
      { x: -1.55, y: 0.42, seed: 1, hex: 0x6d6256, label: "Terreno", mu: "0.4" },
      { x: -0.78, y: 0.42, seed: 2, hex: 0x8d7a55, label: "Fricción", mu: "0.8" },
      { x: -1.55, y: -0.28, seed: 3, hex: 0x3f6b45, label: "Relieve", mu: "1.1" },
      { x: -0.78, y: -0.28, seed: 4, hex: 0x87a96b, label: "Dominio", mu: "0.3" }
    ];
    monitors.forEach(function (m) {
      const g = new THREE.Group();
      g.position.set(m.x, m.y, 0.08);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.5, 0.04), solidMat(0x101828, 0.04)));
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.38),
        new THREE.MeshBasicMaterial({ map: terrainTexture(m.seed, m.hex), toneMapped: false })
      );
      screen.position.z = 0.03;
      g.add(screen);
      const bot = makeQuad(m.hex, 0.15);
      bot.position.set(0, -0.08, 0.1);
      g.add(bot);
      const lab = makeText(m.label + "  \u00b5=" + m.mu, { size: 26, color: "#d7e6ff", worldH: 0.09 });
      lab.position.set(0, -0.32, 0.06);
      g.add(lab);
      plate.add(g);
    });
    const s1 = makeText("1  Simulación paralela", { size: 28, color: "#d7e6ff", worldH: 0.12 });
    s1.position.set(-1.16, -0.78, 0.12);
    plate.add(s1);

    plate.add(flatArrow(-0.4, -0.05, 0.05, 0.14, 0xffb020));

    const block = new THREE.Group();
    block.position.set(0.42, 0.05, 0.08);
    block.add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.35, 0.06), solidMat(0x162033, 0.06)));
    block.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.95, 1.35, 0.06)),
      lineMat(accent, 0.7)
    ));
    const netPts = [[-0.18, 0.42], [0.18, 0.42], [-0.26, 0.16], [0, 0.16], [0.26, 0.16], [0, -0.06]];
    netPts.forEach(function (p) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), basicMat(0x8af0c8));
      s.position.set(p[0], p[1], 0.06);
      block.add(s);
    });
    [[0, 2], [0, 3], [1, 3], [1, 4], [2, 5], [3, 5], [4, 5]].forEach(function (e) {
      block.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(netPts[e[0]][0], netPts[e[0]][1], 0.05),
        new THREE.Vector3(netPts[e[1]][0], netPts[e[1]][1], 0.05)
      ]), lineMat(0x8af0c8, 0.45)));
    });
    const g1 = gear(0.16, 0xd0d7e2);
    const g2 = gear(0.12, 0xffb020);
    g1.position.set(-0.16, -0.42, 0.07);
    g2.position.set(0.16, -0.38, 0.07);
    block.add(g1, g2);
    onFrame(function () {
      g1.rotation.z = clock.t * 0.7;
      g2.rotation.z = -clock.t * 0.9;
    });
    const pLab = makeText("Política RL", { size: 26, color: "#e7fff4", worldH: 0.11 });
    pLab.position.set(0, 0.58, 0.08);
    const aLab = makeText("Actuadores", { size: 26, color: "#ffe3b5", worldH: 0.11 });
    aLab.position.set(0, -0.62, 0.08);
    block.add(pLab, aLab);
    plate.add(block);
    const s2 = makeText("2  Política y control", { size: 28, color: "#d7e6ff", worldH: 0.12 });
    s2.position.set(0.42, -0.78, 0.12);
    plate.add(s2);
    plate.add(flatArrow(0.98, 1.28, -0.15, 0.16, 0x3ddc97));

    const pad = new THREE.Group();
    pad.position.set(1.55, -0.95, 0.45);
    pad.add(makeGround(1.15, 0.85, 0x6e5a3e, 3.2, 0.045));
    pad.add(shadowDisc(0.28));
    const hero = makeQuad(0xdfe7ef, 0.62);
    hero.position.y = 0.02;
    pad.add(hero);
    for (let i = 0; i < 8; i++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.1, 4), solidMat(0x3f8f4e, 0.05));
      const a = (i / 8) * Math.PI * 2;
      blade.position.set(Math.cos(a) * 0.42, 0.05, Math.sin(a) * 0.3);
      pad.add(blade);
    }
    plate.add(pad);
    const s3 = makeText("3  Mundo real", { size: 28, color: "#d7e6ff", worldH: 0.12 });
    s3.position.set(1.55, -0.42, 0.2);
    plate.add(s3);

    const gw = 1.25;
    const gh = 0.55;
    const gap = chartFrame(gw, gh, "entrenamiento", "error");
    gap.position.set(1.15, 0.55, 0.12);
    const sim = [];
    const real = [];
    for (let i = 0; i <= 36; i++) {
      const t = i / 36;
      sim.push(new THREE.Vector3(t * gw, (0.12 + 0.8 * Math.exp(-2.7 * t)) * gh, 0));
      real.push(new THREE.Vector3(t * gw, (0.1 + 0.02 * Math.sin(t * 9)) * gh, 0));
    }
    const simLine = ribbon(sim, 0.012, 0xffb020);
    const realLine = ribbon(real, 0.01, 0x3ddc97);
    simLine.position.z = 0.03;
    realLine.position.z = 0.03;
    gap.add(simLine, realLine);
    const gapLab = makeText("brecha de realidad", { size: 26, color: "#ffe7c2", worldH: 0.11 });
    gapLab.position.set(gw * 0.55, gh + 0.34, 0);
    gap.add(gapLab);
    plate.add(gap);
    onFrame(function () {
      const u = (clock.t % 8) / 8;
      simLine.geometry.setDrawRange(0, Math.max(1, Math.floor(u * simLine.userData.segs)) * 6);
    });
    return plate;
  }

  function buildCurriculum(spec, accent, goIndex) {
    const plate = makePlate(spec.plateW, spec.plateH, accent, goIndex);
    titleOf(plate, "Currículo de rigidez", spec.plateH / 2 - 0.26);
    const W = 3.05;
    const H = 1.7;
    const chart = chartFrame(W, H, "Longitud de episodios  \u2192", "Rigidez  ·  margen de recuperación");
    chart.position.set(-1.55, -0.95, 0.1);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.42, H), basicMat(0x3ec8ff, {
      transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide
    }));
    left.position.set(W * 0.21, H / 2, 0);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.28, H), basicMat(0xffb020, {
      transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide
    }));
    right.position.set(W * 0.86, H / 2, 0);
    chart.add(left, right);
    const pts = [];
    const cols = [];
    const c0 = new THREE.Color("#3ec8ff");
    const c1 = new THREE.Color("#ffb020");
    const N = 70;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = 0.1 + 0.82 * Math.exp(-2.5 * t);
      pts.push(new THREE.Vector3(t * W, y * H, 0));
      cols.push(c0.clone().lerp(c1, t));
    }
    for (let s = 0; s < 5; s++) {
      const t0 = s / 5;
      const t1 = (s + 1) / 5;
      const y = (0.12 + 0.8 * Math.exp(-2.5 * (t0 + 0.05))) * H;
      const seg = new THREE.Mesh(new THREE.BoxGeometry((t1 - t0) * W * 0.9, 0.012, 0.01), basicMat(0xd5deea, { transparent: true, opacity: 0.55 }));
      seg.position.set(((t0 + t1) / 2) * W, y, 0.01);
      chart.add(seg);
    }
    const line = ribbon(pts, 0.018, cols);
    line.position.z = 0.04;
    chart.add(line);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), basicMat(0xffffff));
    dot.position.z = 0.06;
    const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0.05), new THREE.Vector3(0, 1, 0.05)
    ]), lineMat(0xffffff, 0.35));
    chart.add(dot, guide);
    const early = makeText("Alta rigidez\nmargen amplio", { size: 30, color: "#d7f4ff", worldH: 0.24 });
    early.position.set(W * 0.22, H * 0.72, 0.06);
    const late = makeText("Viabilidad estrecha\nrigidez ajustada", { size: 30, color: "#ffe0b8", worldH: 0.24 });
    late.position.set(W * 0.78, H * 0.28, 0.06);
    chart.add(early, late);
    plate.add(chart);
    onFrame(function () {
      const u = (clock.t * 0.09) % 1;
      const i = Math.min(pts.length - 1, Math.floor(u * (pts.length - 1)));
      dot.position.set(pts[i].x, pts[i].y, 0.07);
      guide.position.set(pts[i].x, 0, 0);
      guide.scale.y = Math.max(0.05, pts[i].y);
      const fadeOut = 1 - smooth(u, 0.32, 0.62);
      const fadeIn = smooth(u, 0.4, 0.75);
      early.material.opacity = fadeOut;
      late.material.opacity = fadeIn;
    });
    return plate;
  }

  function smooth(t, a, b) {
    if (t <= a) return 0;
    if (t >= b) return 1;
    const x = (t - a) / (b - a);
    return x * x * (3 - 2 * x);
  }

  function buildMulti(spec, accent, goIndex) {
    const plate = makePlate(spec.plateW, spec.plateH, accent, goIndex);
    titleOf(plate, "Coordinación Dec-POMDP", spec.plateH / 2 - 0.24);
    const arena = new THREE.Group();
    arena.position.set(-0.7, -1.02, 0.35);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.9), solidMat(0x10182a, 0.02));
    floor.rotation.x = -Math.PI / 2;
    arena.add(floor);
    const grid = new THREE.GridHelper(2.5, 10, 0x3ec8ff, 0x244058);
    const gm = Array.isArray(grid.material) ? grid.material : [grid.material];
    gm.forEach(function (m) { m.transparent = true; m.opacity = 0.35; m.toneMapped = false; });
    grid.position.y = 0.02;
    arena.add(grid);
    const spots = [
      { x: -0.85, z: 0.05, yaw: 0.55, color: 0x3ec8ff, name: "Agente 1", tag: "o1 · a1" },
      { x: 0.05, z: 0.62, yaw: -0.35, color: 0xffb020, name: "Agente 2", tag: "o2 · a2" },
      { x: 0.72, z: -0.08, yaw: 2.5, color: 0xff6ea8, name: "Agente 3", tag: "o3 · a3" }
    ];
    const rovers = [];
    spots.forEach(function (s, idx) {
      const rv = makeRover(s.color);
      rv.position.set(s.x, 0, s.z);
      rv.rotation.y = s.yaw;
      const fov = new THREE.Group();
      fov.position.set(0.02, 0, 0.22);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.62, 20, 1, true), basicMat(s.color, {
        transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
      }));
      cone.position.y = 0.32;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.32, 24), basicMat(s.color, {
        transparent: true, opacity: 0.8, side: THREE.DoubleSide
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      fov.add(cone, ring);
      rv.add(fov);
      const nm = makeText(s.name, { size: 30, color: "#f4f8ff", worldH: 0.12 });
      nm.position.set(0, 0.72, 0);
      const tg = makeText(s.tag, { size: 26, color: "#d5e6ff", worldH: 0.1 });
      tg.position.set(0.15, 0.56, 0.2);
      rv.add(nm, tg);
      const yaw = new THREE.Group();
      yaw.position.set(0.32, 0.1, 0);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 8), basicMat(s.color));
      arrow.rotation.z = -Math.PI / 2;
      yaw.add(arrow);
      rv.add(yaw);
      onFrame(function () {
        yaw.rotation.y = Math.sin(clock.t * 0.8 + idx) * 0.6;
        cone.material.opacity = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(clock.t * 1.5 + idx));
      });
      arena.add(rv);
      rovers.push(rv);
    });
    const heads = rovers.map(function (rv) {
      rv.updateMatrix();
      return new THREE.Vector3(0, 0.5, 0).applyMatrix4(rv.matrix);
    });
    for (let i = 0; i < heads.length; i++) {
      const j = (i + 1) % heads.length;
      const geo = new THREE.BufferGeometry().setFromPoints([heads[i], heads[j]]);
      const mat = new THREE.LineDashedMaterial({
        color: 0xbfefff, dashSize: 0.07, gapSize: 0.045, transparent: true, opacity: 0.85, toneMapped: false
      });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      arena.add(line);
      onFrame(function () { mat.dashOffset = -clock.t * 0.28; });
    }
    const shared = makeText("Entorno compartido", { size: 28, color: "#d5e6ff", worldH: 0.12 });
    shared.position.set(0, 0.08, 1.05);
    arena.add(shared);
    plate.add(arena);

    const panel = new THREE.Group();
    panel.position.set(1.45, 0.02, 0.12);
    panel.add(new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.15, 0.05), solidMat(0x10192c, 0.05)));
    const pt = makeText("Balance ilustrativo", { size: 30, color: "#f4f8ff", worldH: 0.14 });
    pt.position.set(0, 0.9, 0.05);
    panel.add(pt);
    addBar(panel, 0.5, "Coordinación", 0.8, 0x3ec8ff, "~80%");
    addBar(panel, 0.02, "Recompensa", 0.9, 0x3ddc97, "~90%");
    const waveLabel = makeText("No estacionariedad", { size: 26, color: "#ffd0b8", worldH: 0.11 });
    waveLabel.position.set(0, -0.38, 0.06);
    const wavePct = makeText("~40%  contenida", { size: 26, color: "#ffb088", worldH: 0.11 });
    wavePct.position.set(0, -0.78, 0.06);
    const wavePts = [];
    for (let i = 0; i <= 32; i++) wavePts.push(new THREE.Vector3());
    const waveGeo = new THREE.BufferGeometry().setFromPoints(wavePts);
    const wave = new THREE.Line(waveGeo, lineMat(0xff8b4a, 1));
    panel.add(waveLabel, wave, wavePct);
    onFrame(function () {
      const a = waveGeo.attributes.position;
      for (let i = 0; i <= 32; i++) {
        const u = i / 32;
        a.setXYZ(i, -0.62 + u * 1.24, -0.58 + Math.sin(u * Math.PI * 5 + clock.t * 2.5) * 0.07, 0.07);
      }
      a.needsUpdate = true;
    });
    plate.add(panel);
    return plate;
  }

  function addBar(parent, y, label, frac, color, pct) {
    const row = new THREE.Group();
    row.position.y = y;
    const name = makeText(label, { size: 26, color: "#e7f0ff", worldH: 0.11 });
    name.position.set(-0.15, 0.2, 0.06);
    const track = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.02), basicMat(0x1c283c));
    track.position.set(-0.05, 0, 0.04);
    const fill = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.03), basicMat(color));
    const tag = makeText(pct, { size: 26, color: color, worldH: 0.11 });
    tag.position.set(0.15, -0.16, 0.06);
    row.add(name, track, fill, tag);
    parent.add(row);
    onFrame(function () {
      const w = frac * (0.94 + 0.06 * Math.sin(clock.t * 1.4 + y));
      fill.scale.x = Math.max(0.04, w);
      fill.position.set(-0.05 - 1.15 / 2 + (1.15 * fill.scale.x) / 2, 0, 0.06);
    });
  }

  function buildHybrid(spec, accent, goIndex) {
    const plate = makePlate(spec.plateW, spec.plateH, accent, goIndex);
    titleOf(plate, "Percepción, modelo y control", spec.plateH / 2 - 0.24);
    const layers = [
      { y: -0.84, h: 0.4, w: 1.85, color: 0x5ce1ff, name: "Entrada multimodal" },
      { y: -0.12, h: 0.46, w: 1.85, color: 0xb388ff, name: "Modelo de comportamiento" },
      { y: 0.58, h: 0.4, w: 1.85, color: 0x3ddc97, name: "Política de locomoción" }
    ];
    layers.forEach(function (L) {
      const g = new THREE.Group();
      g.position.set(-0.95, L.y, 0.08);
      const body = new THREE.Mesh(new THREE.BoxGeometry(L.w, L.h, 0.05), solidMat(0x121a2c, 0.08));
      g.add(body);
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), lineMat(L.color, 0.85)));
      const lab = makeText(L.name, { size: 28, color: "#f3f7ff", worldH: 0.12 });
      lab.position.set(0, L.h / 2 + 0.11, 0.12);
      g.add(lab);
      plate.add(g);
    });
    const pix = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshBasicMaterial({
      map: gameTexture(), toneMapped: false
    }));
    pix.position.set(-1.45, -0.84, 0.14);
    plate.add(pix);
    const wavePts = [];
    for (let i = 0; i <= 28; i++) wavePts.push(new THREE.Vector3());
    const waveGeo = new THREE.BufferGeometry().setFromPoints(wavePts);
    const wave = new THREE.Line(waveGeo, lineMat(0x5ce1ff, 1));
    plate.add(wave);
    onFrame(function () {
      const a = waveGeo.attributes.position;
      for (let i = 0; i <= 28; i++) {
        const u = i / 28;
        a.setXYZ(i, -0.85 + u * 0.85, -0.84 + Math.sin(u * 12 + clock.t * 3) * 0.06, 0.14);
      }
      a.needsUpdate = true;
    });
    const mid = new THREE.Group();
    mid.position.set(-0.95, -0.12, 0.14);
    const mpos = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      mpos.push(new THREE.Vector3(Math.cos(a) * 0.4, Math.sin(a) * 0.1, 0));
    }
    mpos.forEach(function (p, i) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), basicMat(i === 0 ? 0xfff2c4 : 0xd4c2ff));
      s.position.copy(p);
      mid.add(s);
      const q = mpos[(i + 1) % mpos.length];
      mid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, q]), lineMat(0xd4c2ff, 0.55)));
    });
    plate.add(mid);
    onFrame(function () { mid.rotation.z = Math.sin(clock.t * 0.6) * 0.08; });
    const mini = makeQuad(0xdfe7ef, 0.28);
    mini.position.set(-0.95, 0.42, 0.16);
    plate.add(mini);
    [-0.48, 0.24].forEach(function (y) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 8), basicMat(accent));
      c.position.set(-1.72, y, 0.16);
      plate.add(c);
    });
    const dots = [];
    const seeds = [];
    for (let i = 0; i < 18; i++) {
      seeds.push({ x: -0.95 + (Math.random() - 0.5) * 1.4, o: Math.random() });
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), basicMat(0xd8fff4));
      plate.add(d);
      dots.push(d);
    }
    onFrame(function () {
      seeds.forEach(function (s, i) {
        const u = (clock.t * 0.16 + s.o) % 1;
        dots[i].position.set(s.x, -1.05 + u * 2.05, 0.04);
        dots[i].scale.setScalar(0.5 + Math.sin(u * Math.PI));
      });
    });
    const rad = radar(
      [0.9, 0.84, 0.76, 0.86],
      ["Adaptar", "Generalizar", "Seguridad", "Escalar"],
      0.62,
      0x5ce1ff
    );
    rad.position.set(1.15, 0.02, 0.12);
    plate.add(rad);
    const qual = makeText("perfil cualitativo", { size: 26, color: "#cfe4f8", worldH: 0.11 });
    qual.position.set(1.15, -1.05, 0.12);
    plate.add(qual);
    return plate;
  }

  const HITO = [
    {
      hex: "#3ec8ff",
      era: "Hito 1  ·  Finales de los 80 – 1990s",
      title: "Fundamentos matemáticos y RL clásico",
      years: "1980s – 1990s",
      gap: ["1980–90", "Tabular"],
      diagrams: [
        {
          chip: "Bucle MDP",
          title: "Bucle agente–entorno (MDP)",
          plateW: 3.8, plateH: 3.15, above: 0.2, lookY: 0.02,
          image: "Diagrama_de_bucle_agente_entorno_7171ece1_2K.jpg",
          html: "En cada instante el agente envía una acción <em>a</em><sub>t</sub>. El entorno, formulado como un proceso de decisión de Markov, responde con el estado <em>s</em><sub>t</sub> y una recompensa <em>r</em><sub>t</sub>. La tabla Q guarda el valor aprendido de cada par estado–acción. El recuadro recorre las celdas; en verde queda la acción de mayor valor de cada estado.",
          build: buildMDP
        },
        {
          chip: "Cuadrícula",
          title: "Convergencia tabular en la cuadrícula",
          plateW: 4.05, plateH: 2.95, above: 0.18, lookY: 0.0,
          image: "Gr\u00e1fico_de_convergencia_tabular_189ce229_2K.jpg",
          html: "La política evita el obstáculo y la casilla de penalización y lleva el agente hasta la meta. El retorno acumulado oscila en los primeros episodios y se acerca al máximo esperado cerca del episodio 250. La curva muestra ese patrón de Q-learning; no es el registro de una corrida concreta.",
          build: buildGrid
        }
      ]
    },
    {
      hex: "#c49bff",
      era: "Hito 2  ·  2013 – 2017",
      title: "Auge del aprendizaje por refuerzo profundo",
      years: "2013 – 2017",
      gap: ["2013–17", "Deep RL"],
      diagrams: [
        {
          chip: "Red y política",
          title: "Red neuronal y política",
          plateW: 4.15, plateH: 3.0, above: 0.25, lookY: 0.0,
          image: "",
          html: "Cuando el estado es un fotograma, una red convolucional y capas densas aproximan la función de valor o la política. DQN y, más adelante, PPO convierten esa salida en una distribución sobre acciones. Abajo, la recompensa media de la política sube frente a un baseline que no aprende. Las dos curvas son esquemáticas.",
          build: buildNet
        },
        {
          chip: "Estados",
          title: "Espacio de estados",
          plateW: 4.15, plateH: 3.05, above: 0.2, lookY: 0.0,
          image: "Comparativa_visual_espacio_estados_10960b86_2K.jpg",
          html: "Un laberinto, un tablero o una matriz caben entre unos miles y unos cientos de miles de estados, y una tabla puede guardarlos. Un videojuego, el control de un robot o una simulación continua saltan a un espacio del orden de 10<sup>80</sup> estados, o a un continuo. La nube no está a escala lineal: marca el cambio de régimen.",
          build: buildStates
        }
      ]
    },
    {
      hex: "#ffb020",
      era: "Hito 3  ·  2018 – 2024",
      title: "De la simulación al robot físico",
      years: "2018 – 2024",
      gap: ["2018–24", "Sim-to-real"],
      diagrams: [
        {
          chip: "Sim-to-real",
          title: "De la simulación al robot",
          plateW: 4.4, plateH: 3.1, above: 1.85, lookY: -0.05,
          image: "Pipeline_simulaci\u00f3n_paralela_rob\u2026_0d11caa0 (1).jpg",
          html: "Varios entornos corren a la vez con distinto terreno y distinta fricción: es la aleatorización de dominio. Esos datos ajustan la política y la dinámica de los actuadores. Al pasar el cuadrúpedo al mundo físico, la brecha entre simulación y realidad se reduce. La gráfica pequeña ilustra esa reducción; no es una medición de un robot concreto.",
          build: buildPipe
        },
        {
          chip: "Currículo",
          title: "Currículo de rigidez",
          plateW: 4.05, plateH: 2.95, above: 0.18, lookY: 0.0,
          image: "Gr\u00e1fico_de_estabilidad_y_rigidez_9bd2460d_2K.jpg",
          html: "El margen de recuperación empieza alto: así el robot puede volver desde más estados. Cuando los episodios ya se completan y duran más, el currículo baja la rigidez hasta las tareas de viabilidad estrecha. La curva y los escalones muestran ese ajuste. El punto recorre el currículo.",
          build: buildCurriculum
        }
      ]
    },
    {
      hex: "#5ce1ff",
      era: "Hito 4  ·  2025 – 2026",
      title: "Sistemas multi-agente y modelos de comportamiento",
      years: "2025 – 2026",
      gap: ["2025–26", "Multi-agente"],
      diagrams: [
        {
          chip: "Dec-POMDP",
          title: "Coordinación multi-agente (Dec-POMDP)",
          plateW: 4.45, plateH: 3.1, above: 2.05, lookY: -0.08,
          image: "Esquema_de_coordinaci\u00f3n_multi-ag\u2026_4602578d_2K.jpg",
          html: "Cada agente solo ve una observación parcial <em>o</em><sub>i</sub> y ejecuta una acción local <em>a</em><sub>i</sub> en un entorno compartido. Las líneas punteadas son comunicación entre pares: no hay un controlador único. Las cifras de la derecha (~80%, ~90%, ~40%) son un esquema del balance que se busca —coordinación, recompensa colectiva y no estacionariedad contenida—, no una medición.",
          build: buildMulti
        },
        {
          chip: "Modelo híbrido",
          title: "Percepción, modelo y control",
          plateW: 4.25, plateH: 3.05, above: 0.22, lookY: 0.02,
          image: "",
          html: "Señales visuales y de otro tipo alimentan un modelo de comportamiento a gran escala, y ese modelo orienta las políticas de locomoción. El radar compara, solo de forma cualitativa, adaptabilidad, generalización, seguridad y escalabilidad. Cierra la tendencia; no es el resultado de un benchmark.",
          build: buildHybrid
        }
      ]
    }
  ];

  const view = { index: 0 };
  let auto = false;
  let autoT = 0;
  const AUTO_SEC = [7, 11, 11, 11, 11, 12, 11, 12, 12];

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  if (!renderer.getContext()) {
    showError("Este navegador no pudo crear un contexto WebGL.");
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  if ("useLegacyLights" in renderer) renderer.useLegacyLights = true;
  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.zIndex = "0";
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b14);
  scene.fog = new THREE.Fog(0x070b14, 30, 120);
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 220);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  scene.add(new THREE.HemisphereLight(0xc5d7ff, 0x1a120c, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(8, 12, 10);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff1dc, 0.45);
  fill.position.set(-6, 4, 8);
  scene.add(fill);
  const follow = new THREE.PointLight(0x9fd4ff, 1.4, 16, 2);
  scene.add(follow);

  const grid = new THREE.GridHelper(90, 90, 0x1a3148, 0x121a28);
  grid.position.y = -1.72;
  (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(function (m) {
    m.transparent = true;
    m.opacity = 0.28;
    m.toneMapped = false;
  });
  scene.add(grid);

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(58, 0.018, 0.018),
    basicMat(0x7adfff, { transparent: true, opacity: 0.9 })
  );
  rail.position.y = -1.62;
  scene.add(rail);

  const dustGeo = new THREE.BufferGeometry();
  const dustArr = new Float32Array(360 * 3);
  for (let i = 0; i < 360; i++) {
    dustArr[i * 3] = (Math.random() - 0.5) * 58;
    dustArr[i * 3 + 1] = Math.random() * 7 - 1.2;
    dustArr[i * 3 + 2] = (Math.random() - 0.5) * 8 - 1;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustArr, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xb9d4ff, size: 0.028, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false
  }));
  scene.add(dust);
  onFrame(function () {
    const a = dustGeo.attributes.position;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) + clock.dt * 0.04;
      if (y > 6.2) y = -1.5;
      a.setY(i, y);
    }
    a.needsUpdate = true;
  });

  HITO.forEach(function (hito, hi) {
    const station = new THREE.Group();
    station.position.x = XS[hi];
    const y1 = makeText(hito.gap[0], { size: 60, weight: 700, color: hito.hex, worldH: 0.34 });
    y1.position.set(0, 0.28, 0.05);
    const y2 = makeText(hito.gap[1], { size: 40, weight: 600, color: "#d5e4f8", worldH: 0.18 });
    y2.position.set(0, -0.08, 0.05);
    station.add(y1, y2);
    station.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -1.5, 0), new THREE.Vector3(0, -0.32, 0)
    ]), lineMat(hito.hex, 0.45)));
    const node = new THREE.Group();
    node.position.set(0, -1.62, 0);
    node.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 16), basicMat(hito.hex)));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 28), basicMat(hito.hex, { transparent: true, opacity: 0.85 }));
    ring.rotation.x = Math.PI / 2;
    node.add(ring);
    const nh = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getHalo(), color: hito.hex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false
    }));
    nh.scale.set(0.9, 0.9, 1);
    node.add(nh);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), basicMat(0xffffff, { transparent: true, opacity: 0, depthWrite: false }));
    hit.userData.go = 1 + hi * 2;
    pickables.push(hit);
    node.add(hit);
    onFrame(function () { ring.rotation.z = clock.t * 0.6; });
    nodes.push(node);
    station.add(node);
    const light = new THREE.PointLight(hito.hex, 0.6, 8, 2);
    light.position.set(0, 0.8, 1.2);
    station.add(light);
    hito.diagrams.forEach(function (d, di) {
      let group;
      try {
        group = d.build(d, hito.hex, 1 + hi * 2 + di);
      } catch (err) {
        console.error(d.title, err);
        group = new THREE.Group();
        const t = makeText(err.message, { color: "#ffb4b4", worldH: 0.2, size: 28 });
        group.add(t);
        showError(d.title + ": " + err.message);
      }
      group.position.x = DX[di];
      station.add(group);
    });
    scene.add(station);
  });

  const mouseN = new THREE.Vector2();
  const desiredPos = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const look = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const spotGoal = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function hdOf(index) {
    if (index <= 0) return null;
    const i = index - 1;
    return { h: Math.floor(i / 2), d: i % 2 };
  }
  function hFov() {
    const aspect = Math.max(window.innerWidth / Math.max(window.innerHeight, 1), 0.65);
    const v = THREE.MathUtils.degToRad(camera.fov);
    return 2 * Math.atan(Math.tan(v / 2) * aspect);
  }
  function distForWidth(plateW) {
    const fill = window.innerWidth < 860 ? 0.86 : 0.6;
    return (plateW / fill) / (2 * Math.tan(hFov() / 2));
  }
  function shiftX(dist) {
    if (window.innerWidth < 860) return 0;
    const panel = 410;
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const visibleW = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect;
    return (panel * 0.5 / window.innerWidth) * visibleW;
  }
  function overviewDist() {
    const aspect = Math.max(window.innerWidth / Math.max(window.innerHeight, 1), 0.75);
    const half = window.innerWidth < 860 ? 30 : 28;
    return half / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect);
  }
  function computeDesired() {
    const hd = hdOf(view.index);
    if (!hd) {
      const dist = overviewDist();
      const shift = shiftX(dist) * 1.35;
      desiredPos.set(-shift, 1.35, dist * 0.92);
      desiredTarget.set(-shift, 0.45, 0);
      return dist;
    }
    const spec = HITO[hd.h].diagrams[hd.d];
    const above = spec.above || 0.2;
    let dist = Math.max(distForWidth(spec.plateW), above + 2.4);
    const z = Math.sqrt(Math.max(dist * dist - above * above, 4));
    const x = XS[hd.h] + DX[hd.d];
    const shift = shiftX(dist);
    desiredTarget.set(x - shift, spec.lookY || 0, 0);
    desiredPos.set(x - shift, (spec.lookY || 0) + above, z);
    return dist;
  }

  const eraEl = document.getElementById("era");
  const titleEl = document.getElementById("title");
  const yearsEl = document.getElementById("years");
  const nameEl = document.getElementById("diagram-name");
  const copyEl = document.getElementById("copy");
  const chipsEl = document.getElementById("chips");
  const figBtn = document.getElementById("fig");
  const autoBtn = document.getElementById("auto");
  const barEl = document.getElementById("progress-bar");
  const lightbox = document.getElementById("lightbox");
  const lightImg = document.getElementById("light-img");
  const lightCap = document.getElementById("light-cap");

  function syncUI() {
    const hd = hdOf(view.index);
    const accent = hd ? HITO[hd.h].hex : "#8fd0ff";
    document.documentElement.style.setProperty("--accent", accent);
    barEl.style.width = (view.index / 8) * 100 + "%";
    document.querySelectorAll("#nav button").forEach(function (btn) {
      btn.classList.toggle("on", !!hd && hd.h === Number(btn.dataset.hito));
    });
    if (!hd) {
      eraEl.textContent = "Línea de tiempo interactiva";
      titleEl.textContent = "Aprendizaje por refuerzo";
      yearsEl.textContent = "1980s — 2026";
      nameEl.textContent = "De la tabla de valores a los sistemas multi-agente";
      copyEl.innerHTML = "Ocho diagramas en cuatro hitos: el proceso de decisión de Markov, las redes profundas, el salto de la simulación al robot físico y la coordinación entre varios agentes. Avanza con la rueda, las flechas o elige una estación.";
      chipsEl.innerHTML = "";
      figBtn.hidden = true;
    } else {
      const hito = HITO[hd.h];
      const d = hito.diagrams[hd.d];
      eraEl.textContent = hito.era;
      titleEl.textContent = hito.title;
      yearsEl.textContent = hito.years;
      nameEl.textContent = d.title;
      copyEl.innerHTML = d.html;
      chipsEl.innerHTML = "";
      hito.diagrams.forEach(function (item, j) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = item.chip;
        if (j === hd.d) b.className = "on";
        b.addEventListener("click", function () { go(1 + hd.h * 2 + j); });
        chipsEl.appendChild(b);
      });
      figBtn.hidden = !d.image;
      figBtn.onclick = function () { openLight(d.image, d.title); };
    }
    autoBtn.textContent = auto ? "Pausar" : "Presentar";
    try { history.replaceState(null, "", "?paso=" + view.index); } catch (e) { /* file:// */ }
  }

  function go(index, fromAuto) {
    const n = 9;
    view.index = ((index % n) + n) % n;
    if (!fromAuto) { auto = false; autoT = 0; }
    syncUI();
  }
  function step(dir) { go(view.index + dir); }

  function openLight(name, title) {
    lightImg.alt = title;
    lightImg.src = encodeURI(name);
    lightCap.textContent = title + " · figura de referencia";
    lightbox.hidden = false;
  }
  function closeLight() { lightbox.hidden = true; lightImg.src = ""; }

  document.getElementById("home").addEventListener("click", function () { go(0); });
  document.getElementById("prev").addEventListener("click", function () { step(-1); });
  document.getElementById("next").addEventListener("click", function () { step(1); });
  document.querySelectorAll("#nav button").forEach(function (btn) {
    btn.addEventListener("click", function () { go(1 + Number(btn.dataset.hito) * 2); });
  });
  autoBtn.addEventListener("click", function () {
    auto = !auto;
    autoT = 0;
    syncUI();
  });
  document.getElementById("close-light").addEventListener("click", closeLight);
  lightbox.addEventListener("click", function (e) { if (e.target === lightbox) closeLight(); });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!lightbox.hidden) { closeLight(); return; }
      go(0);
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") step(1);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") step(-1);
    if (e.key === "Home") go(0);
    if (e.key === "p" || e.key === "P") {
      auto = !auto;
      autoT = 0;
      syncUI();
    }
  });

  let wheelLock = 0;
  window.addEventListener("wheel", function (e) {
    if (e.target.closest && e.target.closest("#card, #nav, #dock, #lightbox")) return;
    e.preventDefault();
    if (performance.now() < wheelLock) return;
    const dir = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? Math.sign(e.deltaX) : Math.sign(e.deltaY);
    if (!dir) return;
    wheelLock = performance.now() + 650;
    step(dir);
  }, { passive: false });

  let p0 = null;
  renderer.domElement.addEventListener("pointerdown", function (e) {
    p0 = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  renderer.domElement.addEventListener("pointerup", function (e) {
    if (!p0) return;
    const dx = e.clientX - p0.x;
    const dy = e.clientY - p0.y;
    const dt = performance.now() - p0.t;
    p0 = null;
    if (Math.hypot(dx, dy) < 8) {
      ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(pickables, false);
      if (hits.length && hits[0].object.userData.go != null) go(hits[0].object.userData.go);
      return;
    }
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) && dt < 800) step(dx < 0 ? 1 : -1);
  });
  window.addEventListener("pointermove", function (e) {
    mouseN.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseN.y = -(e.clientY / window.innerHeight) * 2 + 1;
    if (e.target !== renderer.domElement) {
      renderer.domElement.style.cursor = "default";
      return;
    }
    ndc.copy(mouseN);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    renderer.domElement.style.cursor = hit ? "pointer" : "default";
  });

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const params = new URLSearchParams(location.search);
  const requested = Number(params.get("paso"));
  if (Number.isFinite(requested)) view.index = Math.max(0, Math.min(8, requested));
  syncUI();
  computeDesired();
  camera.position.copy(desiredPos);
  look.copy(desiredTarget);
  if (view.index === 0) {
    camera.position.z += 18;
    camera.position.y += 4;
  }

  let failed = false;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (failed) return;
    try {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      clock.t += dt;
      clock.dt = dt;
      if (auto && lightbox.hidden) {
        autoT += dt;
        if (autoT > AUTO_SEC[view.index]) {
          autoT = 0;
          go(view.index + 1, true);
        }
      }
      const dist = computeDesired();
      const parallax = hdOf(view.index) ? 0.12 : 0.35;
      goal.copy(desiredPos);
      goal.x += mouseN.x * parallax;
      goal.y += mouseN.y * parallax * 0.45;
      const k = 1 - Math.pow(0.0015, dt);
      camera.position.lerp(goal, k);
      look.lerp(desiredTarget, k);
      camera.lookAt(look);
      const hd = hdOf(view.index);
      const sx = hd ? XS[hd.h] + DX[hd.d] : 0;
      spotGoal.set(sx, 1.3, 1.6);
      follow.position.lerp(spotGoal, 0.08);
      follow.color.set(hd ? HITO[hd.h].hex : "#9fd4ff");
      nodes.forEach(function (n, i) {
        const on = hd && hd.h === i;
        const s = on ? 1.45 + Math.sin(clock.t * 3) * 0.08 : 1;
        n.scale.setScalar(s);
      });
      edgeMats.forEach(function (m, i) {
        const on = view.index === i + 1;
        m.opacity = on ? 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(clock.t * 2.4)) : 0.28;
      });
      for (let i = 0; i < jobs.length; i++) {
        try {
          jobs[i]();
        } catch (jobErr) {
          throw new Error("Job " + i + " / " + jobs.length + ": " + (jobErr && jobErr.stack ? jobErr.stack : jobErr));
        }
      }
      renderer.render(scene, camera);
      void dist;
    } catch (err) {
      failed = true;
      console.error(err);
      showError("La escena se detuvo: " + err.message);
    }
  }
  requestAnimationFrame(frame);
})();
