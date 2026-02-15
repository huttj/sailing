import { Application, Container } from 'pixi.js';
import { OceanRenderer } from './ocean/OceanRenderer.js';
import { Camera } from './camera/Camera.js';
import { Ship } from './ship/Ship.js';
import { ShipControls } from './ship/ShipControls.js';
import { loadData } from './data/DataLoader.js';
import { PointCloud, VISITED_FAR } from './points/PointCloud.js';
import { PointQuadtree } from './points/PointQuadtree.js';
import { LODManager } from './points/LODManager.js';
import { IslandLabels } from './points/IslandLabels.js';
import { DiveMode } from './DiveMode.js';
import { Sidebar } from './ui/Sidebar.js';
import { Minimap } from './ui/Minimap.js';
import { VoyageLog } from './ui/VoyageLog.js';
import { Theme } from './ui/Theme.js';

const DIVE_THRESHOLD = 150;

// ── Tunable zoom/visibility settings ─────────────────────────────────
const settings = {
  zoomOutMin: 0.20,     // zoom when far from everything (see constellations)
  zoomInMax: 2.0,       // zoom when right next to a dot (readable labels)
  farThreshold: 600,    // distance beyond which you're fully zoomed out
  closeThreshold: 40,   // distance within which you're fully zoomed in
  diveZoom: 2.0,        // zoom level when diving
  autodive: false,      // auto-dive on contact with a dot
};

function initSettings() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  const toggle = document.getElementById('settings-toggle');
  const content = document.getElementById('settings-content');

  if (toggle && content) {
    toggle.addEventListener('click', () => {
      content.classList.toggle('settings-open');
      toggle.textContent = content.classList.contains('settings-open') ? 'Settings \u25B2' : 'Settings \u25BC';
    });
  }

  // Create sliders
  const sliders = [
    { key: 'zoomOutMin', label: 'Zoom Out (far away)', min: 0.03, max: 0.5, step: 0.01 },
    { key: 'zoomInMax', label: 'Zoom In (near dot)', min: 1.0, max: 8.0, step: 0.1 },
    { key: 'farThreshold', label: 'Far Distance', min: 500, max: 5000, step: 100 },
    { key: 'closeThreshold', label: 'Close Distance', min: 20, max: 500, step: 10 },
    { key: 'diveZoom', label: 'Dive Zoom', min: 2.0, max: 10.0, step: 0.5 },
  ];

  if (!content) return;

  // Autodive checkbox
  {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'autodive-checkbox';
    checkbox.checked = settings.autodive;
    checkbox.style.accentColor = 'var(--accent)';

    const labelEl = document.createElement('label');
    labelEl.textContent = 'Autodive on contact';
    labelEl.htmlFor = 'autodive-checkbox';
    labelEl.style.cursor = 'pointer';

    checkbox.addEventListener('change', () => {
      settings.autodive = checkbox.checked;
    });

    row.appendChild(checkbox);
    row.appendChild(labelEl);
    content.appendChild(row);
  }

  // Show visited nodes checkbox
  {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'show-visited-checkbox';
    checkbox.checked = true;
    checkbox.style.accentColor = 'var(--accent)';

    const labelEl = document.createElement('label');
    labelEl.textContent = 'Show visited nodes';
    labelEl.htmlFor = 'show-visited-checkbox';
    labelEl.style.cursor = 'pointer';

    checkbox.addEventListener('change', () => {
      settings._hideVisited = !checkbox.checked;
    });

    row.appendChild(checkbox);
    row.appendChild(labelEl);
    content.appendChild(row);
  }

  for (const s of sliders) {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const labelEl = document.createElement('label');
    labelEl.textContent = s.label;

    const valEl = document.createElement('span');
    valEl.className = 'settings-value';
    valEl.textContent = settings[s.key];

    const input = document.createElement('input');
    input.type = 'range';
    input.min = s.min;
    input.max = s.max;
    input.step = s.step;
    input.value = settings[s.key];

    input.addEventListener('input', () => {
      settings[s.key] = parseFloat(input.value);
      valEl.textContent = settings[s.key];
    });

    row.appendChild(labelEl);
    row.appendChild(input);
    row.appendChild(valEl);
    content.appendChild(row);
  }
}

async function main() {
  // Theme
  const theme = new Theme();
  theme.applyInitial();

  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundColor: theme.palette.appBg,
    antialias: true,
  });
  document.getElementById('canvas-container').appendChild(app.canvas);

  initSettings();

  // Theme toggle button
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.textContent = theme.isLight ? 'Dark Mode' : 'Light Mode';
  }

  // World container — everything that moves with the camera
  const worldContainer = new Container();
  app.stage.addChild(worldContainer);

  // Ocean background — in world-space, at bottom of z-order
  const ocean = new OceanRenderer(theme);
  worldContainer.addChild(ocean.container);

  // Camera
  const camera = new Camera(app.screen.width, app.screen.height);

  // Ship
  const ship = new Ship(theme);
  let shipGfx = ship.getGraphics();

  // Ship controls
  const controls = new ShipControls();

  // Camera follows ship
  camera.follow(ship);

  // Data-dependent objects
  let ideas = [];
  let posts = {};
  let topics = [];
  let pointCloud = null;
  let quadtree = null;
  let lodManager = null;
  let islandLabels = null;
  let sidebar = null;
  let minimap = null;
  let diveMode = null;
  let lastNearby = [];
  const voyageLog = new VoyageLog();

  try {
    const data = await loadData();
    ideas = data.ideas;
    posts = data.posts;
    topics = data.topics;

    // Build quadtree
    quadtree = new PointQuadtree({
      x: -6000, y: -6000, width: 12000, height: 12000,
    });
    for (const idea of ideas) {
      quadtree.insert({ x: idea.x, y: idea.y, data: idea });
    }

    // Point cloud (build first so we can use its topic color map)
    pointCloud = new PointCloud(worldContainer, ideas, voyageLog, theme);

    // Island labels — added BEFORE dots in z-order
    // We insert the label container behind the dot layer
    islandLabels = new IslandLabels(worldContainer, topics, pointCloud.topicIndexMap);
    worldContainer.setChildIndex(islandLabels.container, 1);

    // Ship graphics on top of dots
    worldContainer.addChild(shipGfx);

    // LOD manager
    lodManager = new LODManager(ideas, pointCloud, quadtree);

    // Dive mode
    diveMode = new DiveMode();

    // Sidebar
    sidebar = new Sidebar(document.getElementById('sidebar'), voyageLog);

    sidebar.setIdeas(ideas);

    // Wire sidebar callbacks
    sidebar.onNavigate((idea) => {
      ship.x = idea.x;
      ship.y = idea.y;
      ship.vx = 0;
      ship.vy = 0;
      if (diveMode.active) {
        diveMode.targetIdea = idea;
        sidebar.updateHighlight(idea);
      }
    });

    sidebar.onHighlightMinimap((idea) => {
      if (minimap) {
        if (idea) {
          minimap.highlightIdea(idea);
        } else {
          minimap.clearHighlight();
        }
      }
    });

    sidebar.onCloseRequest(() => {
      if (diveMode && diveMode.active) {
        diveMode.exit();
      }
      sidebar.hide();
    });

    // Dive mode switch callback — update sidebar highlight
    diveMode.onSwitch((idea) => {
      const post = posts[idea.post_id];
      if (post) {
        if (sidebar._currentPost === post) {
          sidebar.updateHighlight(idea);
        } else {
          const siblings = ideas.filter(i => i.post_id === idea.post_id);
          sidebar.show(idea, post, siblings);
        }
      }
    });

    // Minimap
    minimap = new Minimap(
      document.getElementById('minimap-canvas'),
      ideas,
      voyageLog,
      theme,
    );
    minimap.init();

    // Voyage log
    voyageLog.setIdeas(ideas);
    voyageLog.initPanel();
    voyageLog.onNavigate((idea) => {
      ship.x = idea.x;
      ship.y = idea.y;
      ship.vx = 0;
      ship.vy = 0;
      // Auto-dive into the idea
      const post = posts[idea.post_id];
      if (post && diveMode) {
        diveMode.enter(idea);
        controls.resetArrowUndive();
        const siblings = ideas.filter(i => i.post_id === idea.post_id);
        sidebar.show(idea, post, siblings);
      }
    });
  } catch (e) {
    console.warn('Data not loaded (run npm run pipeline first):', e.message);
    worldContainer.addChild(shipGfx);
  }

  // ── Theme toggle wiring ─────────────────────────────────────────────
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      theme.toggle();
      themeToggle.textContent = theme.isLight ? 'Dark Mode' : 'Light Mode';
    });
  }

  theme.onChange((palette) => {
    // Pixi app background
    app.renderer.background.color = palette.appBg;

    // Ocean
    ocean.onThemeChange();

    // PointCloud
    if (pointCloud) pointCloud.rebuildForTheme();

    // Minimap — rebuild background canvas
    if (minimap) minimap.init();

    // Ship
    shipGfx = ship.rebuildGraphics();
  });

  // Handle resize
  window.addEventListener('resize', () => {
    camera.resize(app.screen.width, app.screen.height);
  });

  // Escape key exits dive
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (diveMode && diveMode.active) {
        diveMode.exit();
        if (sidebar) sidebar.hide();
      }
    }
  });

  // Game loop
  let frameCount = 0;
  let elapsed = 0;

  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;
    elapsed += dt / 60;
    frameCount++;

    // Spacebar dive/undive
    if (controls.consumeSpace()) {
      if (diveMode && diveMode.active) {
        diveMode.exit();
        if (sidebar) sidebar.hide();
      } else if (diveMode && lastNearby.length > 0 && lastNearby[0].distance < DIVE_THRESHOLD) {
        const nearest = lastNearby[0].idea;
        const post = posts[nearest.post_id];
        if (post) {
          diveMode.enter(nearest);
          controls.resetArrowUndive();
          const siblings = ideas.filter(i => i.post_id === nearest.post_id);
          sidebar.show(nearest, post, siblings);
        }
      }
    }

    // Arrow-key hold undive (1.5s hold, requires fresh press)
    if (diveMode && diveMode.active && controls.consumeArrowUndive(1500)) {
      diveMode.exit();
      if (sidebar) sidebar.hide();
    }

    // Autodive on contact
    if (settings.autodive && diveMode && !diveMode.active &&
        lastNearby.length > 0 && lastNearby[0].distance < DIVE_THRESHOLD) {
      const nearest = lastNearby[0].idea;
      const post = posts[nearest.post_id];
      if (post) {
        diveMode.enter(nearest);
        controls.resetArrowUndive();
        const siblings = ideas.filter(i => i.post_id === nearest.post_id);
        sidebar.show(nearest, post, siblings);
      }
    }

    // Update controls + ship physics
    // Scale speed inversely with zoom so apparent on-screen speed stays constant
    const speedScale = 1 / Math.max(camera.zoom, 0.05);
    ship.maxSpeed = 8 * speedScale;

    controls.update(ship, speedScale);

    // Apply dive magnet force
    if (diveMode && diveMode.active) {
      diveMode.updateShipMagnet(ship);
    }

    ship.update(dt);

    // Clamp ship to world bounds
    const WORLD_BOUND = 6500;
    if (ship.x < -WORLD_BOUND) { ship.x = -WORLD_BOUND; ship.vx = 0; }
    if (ship.x > WORLD_BOUND) { ship.x = WORLD_BOUND; ship.vx = 0; }
    if (ship.y < -WORLD_BOUND) { ship.y = -WORLD_BOUND; ship.vy = 0; }
    if (ship.y > WORLD_BOUND) { ship.y = WORLD_BOUND; ship.vy = 0; }

    // Auto-zoom: proximity-driven, but movement-aware.
    // Moving → bias toward zoomed out. Slowing/stopped → settle to proximity zoom.
    if (lodManager) {
      if (diveMode && diveMode.active) {
        camera.setTargetZoom(settings.diveZoom);
      } else {
        // 1. Compute proximity-based target zoom
        //    Filter out visited-and-dimmed nodes — they shouldn't pull the camera in
        let nearestDist = Infinity;
        for (const entry of lastNearby) {
          const isVisitedDimmed = voyageLog.getVisited(entry.idea.id) && entry.distance > VISITED_FAR;
          if (!isVisitedDimmed) {
            nearestDist = entry.distance;
            break;
          }
        }

        const clamped = Math.max(settings.closeThreshold, Math.min(settings.farThreshold, nearestDist));
        const rawT = 1 - (clamped - settings.closeThreshold) / (settings.farThreshold - settings.closeThreshold);
        const t = rawT * rawT;
        const proximityZoom = settings.zoomOutMin + t * (settings.zoomInMax - settings.zoomOutMin);

        // 2. Blend with movement: moving fast → stay zoomed out, stopped → proximity zoom
        const speed = ship.speed * camera.zoom; // screen-space speed
        const moveThreshold = 2.0;  // below this screen-speed, consider "stopped"
        const moveCap = 5.0;        // above this, fully "cruising"
        const moveFactor = Math.min(1, Math.max(0, (speed - moveThreshold) / (moveCap - moveThreshold)));

        // When moving, don't zoom in past a comfortable cruising level
        const cruisingZoom = settings.zoomOutMin * 1.5;
        const targetZoom = proximityZoom + moveFactor * (cruisingZoom - proximityZoom);

        camera.setTargetZoom(targetZoom);
      }
    }

    // Update camera
    camera.update(dt);

    // Apply camera transform + zoom to world container
    // Offset center to account for sidebar width so the view stays
    // centered in the remaining visible area
    const zoom = camera.zoom;
    const sidebarW = sidebar ? sidebar.element.offsetWidth : 0;
    const centerX = (camera.screenWidth - sidebarW) / 2;
    worldContainer.scale.set(zoom);
    worldContainer.x = -camera.x * zoom + centerX;
    worldContainer.y = -camera.y * zoom + camera.screenHeight / 2;

    // Sync ship graphics to world position
    shipGfx.x = ship.x;
    shipGfx.y = ship.y;

    // Compute actual visible world-space viewport accounting for sidebar offset
    const vpLeft = camera.x - centerX / zoom;
    const vpRight = camera.x + (camera.screenWidth - centerX) / zoom;
    const vpTop = camera.y - camera.screenHeight / (2 * zoom);
    const vpBottom = camera.y + camera.screenHeight / (2 * zoom);

    // Update ocean background
    ocean.update(elapsed, { left: vpLeft, right: vpRight, top: vpTop, bottom: vpBottom }, zoom);

    // Update island labels
    if (islandLabels) {
      islandLabels.update(camera.zoom);
    }

    // Update points + LOD
    if (lodManager && pointCloud) {
      const nearby = lodManager.update(ship.x, ship.y, frameCount);
      if (nearby !== null) {
        lastNearby = nearby;
      }

      pointCloud.hideVisited = !!settings._hideVisited;
      pointCloud.update(ship.x, ship.y, camera);

      // Check proximity switch in dive mode
      if (diveMode && diveMode.active && frameCount % 3 === 0) {
        diveMode.checkProximitySwitch(lastNearby);
      }

      // Update minimap
      if (minimap) {
        const vp = camera.getViewport();
        minimap.update(ship.x, ship.y, vp);
      }
    }
  });
}

main().catch(console.error);
