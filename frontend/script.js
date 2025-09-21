const BACKEND = "http://127.0.0.1:5000";

const FLOORS = 11;
const ROOMS_PER_FLOOR = 27;
const ROWS = 10;
const COLS = 10;

const floorSelect = document.getElementById('floor-select');
const roomSelect = document.getElementById('room-select');
const findPathBtn = document.getElementById('find-path');
const mapDiv = document.getElementById('map');
const infoDiv = document.getElementById('info');
const roomInput = document.getElementById('room-input');
const roomGoBtn = document.getElementById('room-go');
const popdownToggle = document.getElementById('popdown-toggle');
const popdownPanel = document.getElementById('popdown-panel');
const popFloor = document.getElementById('pop-floor');
const popRoom = document.getElementById('pop-room');
const popPick = document.getElementById('pop-pick');

let currentFloor = null;
let floorGrid = null;
let path = [];
let start = null;
let goal = null;

async function fetchFloors() {
  // backend optional
  let floors;
  try {
    const res = await fetch(`${BACKEND}/floors`);
    floors = await res.json();
  } catch {
    floors = Array.from({ length: FLOORS }, (_, i) => i + 1);
  }
  floorSelect.innerHTML = '';
  popFloor.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Choose a floor...';
  defaultOption.disabled = true;
  defaultOption.selected = true;
  floorSelect.appendChild(defaultOption);
  floors.forEach(f => {
    const o = document.createElement('option');
    o.value = f; o.textContent = `Floor ${f}`; floorSelect.appendChild(o);
    const po = document.createElement('option'); po.value = f; po.textContent = `Floor ${f}`; popFloor.appendChild(po);
  });
}

async function fetchRooms(floor) {
  let rooms;
  try {
    const res = await fetch(`${BACKEND}/rooms/${floor}`);
    rooms = await res.json();
  } catch {
    rooms = Array.from({ length: ROOMS_PER_FLOOR }, (_, i) => `R${floor}${(i + 1).toString().padStart(2, '0')}`);
  }
  roomSelect.innerHTML = '';
  popRoom.innerHTML = '';
  rooms.forEach(r => {
    const o = document.createElement('option'); o.value = r; o.textContent = r; roomSelect.appendChild(o);
    const po = document.createElement('option'); po.value = r; po.textContent = r; popRoom.appendChild(po);
  });
}

async function fetchFloorGrid(floor) {
  try {
    const res = await fetch(`${BACKEND}/floorgrid/${floor}`);
    if (res.ok) return await res.json();
  } catch {}
  return buildFloorGridLocally(floor);
}

function buildFloorGridLocally(floor) {
  // Create empty grid and outer walls
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 'CORRIDOR'));
  for (let r = 0; r < ROWS; r++) { grid[r][0] = 'X'; grid[r][COLS - 1] = 'X'; }
  for (let c = 0; c < COLS; c++) { grid[0][c] = 'X'; grid[ROWS - 1][c] = 'X'; }

  // Define hollow center 4x4 in the middle as HOLE (impassable)
  const holeStartR = 3, holeStartC = 3, holeSize = 4;
  for (let r = holeStartR; r < holeStartR + holeSize; r++) {
    for (let c = holeStartC; c < holeStartC + holeSize; c++) {
      grid[r][c] = 'HOLE';
    }
  }

  // Corridor ring around the hole (cells adjacent to the hole become CORRIDOR explicitly)
  for (let r = holeStartR - 1; r <= holeStartR + holeSize; r++) {
    for (let c = holeStartC - 1; c <= holeStartC + holeSize; c++) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] !== 'HOLE' && grid[r][c] !== 'X') {
        grid[r][c] = 'CORRIDOR';
      }
    }
  }

  // Place three lifts on three sides of the corridor ring (top, left, right)
  grid[holeStartR - 1][holeStartC + Math.floor(holeSize / 2)] = 'LIFT';
  grid[holeStartR + Math.floor(holeSize / 2)][holeStartC - 1] = 'LIFT';
  grid[holeStartR + Math.floor(holeSize / 2)][holeStartC + holeSize] = 'LIFT';

  // Place bathroom somewhere on left corridor
  grid[ROWS - 2][1] = 'BATH';

  // Place rooms around outer ring (skipping walls)
  let roomNo = 1;
  // Top inner row (r = 1)
  for (let c = 1; c < COLS - 1 && roomNo <= ROOMS_PER_FLOOR; c++) {
    if (grid[1][c] === 'CORRIDOR') { grid[1][c] = `R${floor}${roomNo.toString().padStart(2, '0')}`; roomNo++; }
  }
  // Right inner column
  for (let r = 2; r < ROWS - 1 && roomNo <= ROOMS_PER_FLOOR; r++) {
    if (grid[r][COLS - 2] === 'CORRIDOR') { grid[r][COLS - 2] = `R${floor}${roomNo.toString().padStart(2, '0')}`; roomNo++; }
  }
  // Bottom inner row
  for (let c = COLS - 3; c >= 1 && roomNo <= ROOMS_PER_FLOOR; c--) {
    if (grid[ROWS - 2][c] === 'CORRIDOR') { grid[ROWS - 2][c] = `R${floor}${roomNo.toString().padStart(2, '0')}`; roomNo++; }
  }
  // Left inner column
  for (let r = ROWS - 3; r >= 2 && roomNo <= ROOMS_PER_FLOOR; r--) {
    if (grid[r][1] === 'CORRIDOR') { grid[r][1] = `R${floor}${roomNo.toString().padStart(2, '0')}`; roomNo++; }
  }

  // If still rooms to place, fill remaining corridor cells (not hole/wall/lift/bath)
  for (let r = 2; r < ROWS - 2 && roomNo <= ROOMS_PER_FLOOR; r++) {
    for (let c = 2; c < COLS - 2 && roomNo <= ROOMS_PER_FLOOR; c++) {
      if (grid[r][c] === 'CORRIDOR') { grid[r][c] = `R${floor}${roomNo.toString().padStart(2, '0')}`; roomNo++; }
    }
  }

  return grid;
}

function drawMap(highlightPath = []) {
  mapDiv.innerHTML = '';
  path = highlightPath || [];
  start = null;
  goal = null;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      const val = floorGrid[r][c];

      if (val === 'X') { cell.classList.add('wall'); cell.textContent = ''; }
      else if (val === 'HOLE') { cell.classList.add('hole'); cell.textContent = ''; }
      else if (val === 'LIFT') { cell.classList.add('lift'); cell.textContent = 'LIFT'; }
      else if (val === 'BATH') { cell.classList.add('bathroom'); cell.textContent = 'BATH'; }
      else if (val && val.startsWith('R')) { cell.classList.add('room'); cell.textContent = val; }
      else if (val === 'CORRIDOR') { cell.classList.add('corridor'); cell.textContent = ''; }
      else { cell.classList.add('corridor'); cell.textContent = ''; }

      // path highlight
      if (path.some(p => p[0] === r && p[1] === c)) cell.classList.add('path');

      // if path present, highlight the starting cell specially
      if (path && path.length > 0 && r === path[0][0] && c === path[0][1]) {
        cell.classList.add('start-lift');
      }

      mapDiv.appendChild(cell);
    }
  }
}

function findEntrance(grid) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === 'LIFT') return [r, c];
    }
  }
  // fallback to entrance on edge if present
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === 'ENTRANCE') return [r, c];
    }
  }
  // last resort: any corridor next to wall
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] === 'CORRIDOR') return [r, c];
    }
  }
  return [1,1];
}

function computeLocalPath(startPos, destPos, grid) {
  // BFS shortest path; treat 'X' and 'HOLE' as blocked
  const q = [];
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const parent = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  q.push(startPos); visited[startPos[0]][startPos[1]] = true;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  while (q.length) {
    const [r,c] = q.shift();
    if (r === destPos[0] && c === destPos[1]) break;
    for (const [dr,dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr][nc]) continue;
      const v = grid[nr][nc];
      if (v === 'X' || v === 'HOLE') continue;
      visited[nr][nc] = true; parent[nr][nc] = [r,c]; q.push([nr,nc]);
    }
  }

  // reconstruct
  const dest = destPos;
  if (!visited[dest[0]][dest[1]]) return null;
  const out = [];
  let cur = dest;
  while (cur) { out.push(cur); cur = parent[cur[0]][cur[1]]; }
  return out.reverse();
}

// Find the nearest LIFT to `destPos` and return the path from that lift to dest (or null)
function findNearestLiftPath(destPos, grid) {
  // BFS from destination outwards until we hit a lift
  const q = [];
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const parent = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  q.push(destPos); visited[destPos[0]][destPos[1]] = true;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  while (q.length) {
    const [r,c] = q.shift();
    if (grid[r][c] === 'LIFT') {
      // reconstruct path from this lift -> dest using parent pointers
      const out = [];
      let cur = [r,c];
      while (cur) { out.push(cur); cur = parent[cur[0]][cur[1]]; }
      return out.reverse(); // lift -> ... -> dest
    }
    for (const [dr,dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr][nc]) continue;
      const v = grid[nr][nc];
      if (v === 'X' || v === 'HOLE') continue;
      visited[nr][nc] = true; parent[nr][nc] = [r,c]; q.push([nr,nc]);
    }
  }
  return null;
}

function openMapPopup(grid, pathCoords, startCoord, goalCoord) {
  const w = window.open('', '_blank', 'width=600,height=600');
  if (!w) { alert('Popup blocked - allow popups for this site'); return; }
  const style = `
    body{font-family:Arial,Helvetica,sans-serif;padding:12px;background:#fafafa}
    .map{display:grid;grid-template-columns:repeat(${COLS},30px);grid-gap:4px}
    .cell{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:9px}
    .wall{background:#444}
    .corridor{background:#f5f7fa}
    .room{background:#2d9cdb;color:#fff}
    .lift{background:#f1c40f}
    .bathroom{background:#9b59b6;color:#fff}
    .hole{background:#111}
    .path{outline:3px solid rgba(46,204,113,0.9)}
  `;
  const mapHtml = ['<div class="map">'];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = grid[r][c];
      let cls = 'cell ';
      if (v === 'X') cls += 'wall'; else if (v === 'HOLE') cls += 'hole'; else if (v === 'LIFT') cls += 'lift'; else if (v === 'BATH') cls += 'bathroom'; else if (v && v.startsWith('R')) cls += 'room'; else cls += 'corridor';
      const label = (v && v.startsWith('R')) ? v : (v === 'LIFT' ? 'L' : '');
      mapHtml.push(`<div class="${cls}" data-r="${r}" data-c="${c}">${label}</div>`);
    }
  }
  mapHtml.push('</div>');

  w.document.body.innerHTML = `<style>${style}</style><h3>Floor ${currentFloor} Map</h3>${mapHtml.join('')}<div id="info"></div>`;

  // animate path
  if (pathCoords && pathCoords.length) {
    let i = 0;
    const iv = setInterval(() => {
      if (i >= pathCoords.length) { clearInterval(iv); return; }
      const [r,c] = pathCoords[i];
      const el = w.document.querySelector(`[data-r='${r}'][data-c='${c}']`);
      if (el) el.classList.add('path');
      i++;
    }, 200);
  }
}

function normalizeRoomInput(input) {
  if (!input) return '';
  input = input.trim().toUpperCase();
  if (input.startsWith('R')) return input;
  // assume simple number like '05' or '5' -> R{currentFloor}{nn}
  const num = parseInt(input.replace(/^0+/, '') || input, 10);
  if (isNaN(num)) return '';
  return `R${currentFloor}${num.toString().padStart(2, '0')}`;
}

// wire events
floorSelect.addEventListener('change', async (e) => {
  if (!e.target.value) return;
  currentFloor = parseInt(e.target.value);
  await fetchRooms(currentFloor);
  floorGrid = await fetchFloorGrid(currentFloor);
  drawMap();
});

roomGoBtn.addEventListener('click', async () => {
  if (!currentFloor) { alert('Choose a floor first'); return; }
  const normalized = normalizeRoomInput(roomInput.value);
  if (!normalized) { alert('Enter a valid room'); return; }
  // find destination cell
  let dest = null;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (floorGrid[r][c] === normalized) dest = [r, c];
  if (!dest) { alert('Room not found on this floor'); return; }
  const p = findNearestLiftPath(dest, floorGrid);
  if (!p) { alert('No path found'); return; }
  drawMap(p);
  openMapPopup(floorGrid, p, p[0], dest);
});

findPathBtn.addEventListener('click', async () => {
  // prefer typed input if available
  let destination = '';
  if (roomInput.value && roomInput.value.trim()) {
    destination = normalizeRoomInput(roomInput.value);
  } else {
    destination = roomSelect.value;
  }
  if (!destination) { alert('Please select or enter a destination room.'); return; }

  // try backend first
  try {
    const resp = await fetch(`${BACKEND}/path`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ floor: currentFloor, destination }) });
    if (resp.ok) {
      const data = await resp.json();
      path = data.path; goal = path[path.length-1]; drawMap(path); openMapPopup(floorGrid, path, path[0], goal); infoDiv.textContent = `Path length ${path.length-1}`; return;
    }
  } catch(e) {
    // ignore and fallback to local
  }

  // local fallback
  const destCell = (() => { for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (floorGrid[r][c] === destination) return [r,c]; return null; })();
  if (!destCell) { alert('Destination not found on this floor'); return; }
  const p = findNearestLiftPath(destCell, floorGrid);
  if (!p) { alert('No path found'); return; }
  path = p; goal = p[p.length-1];
  drawMap(path);
  openMapPopup(floorGrid, path, p[0], destCell);
});

// quick popdown wiring
popdownToggle.addEventListener('click', () => { popdownPanel.style.display = popdownPanel.style.display === 'none' ? 'block' : 'none'; });
popPick.addEventListener('click', () => {
  const f = parseInt(popFloor.value); const r = popRoom.value;
  if (!f || !r) { alert('Pick floor and room'); return; }
  floorSelect.value = f; floorSelect.dispatchEvent(new Event('change'));
  setTimeout(() => { roomSelect.value = r; findPathBtn.click(); }, 120);
});

(async () => { await fetchFloors(); })();

