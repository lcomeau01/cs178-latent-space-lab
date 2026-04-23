const API_BASE = 'http://127.0.0.1:8000'

const el = id => document.getElementById(id)

let idA = null
let idB = null
const historyA = []
const historyB = []

async function postJSON(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(txt)
  }
  return res.json()
}

async function generate(target) {
  setMsg('')
  // any change to A or B invalidates existing filmstrip
  clearFilmstrip()
  try {
    const data = await postJSON('/generate', {})
    if (target === 'A') {
      idA = data.latent_id
      el('imgA').src = data.image
      historyA.push({ id: idA, image: data.image })
      // enable undo if we have previous entries
      if (historyA.length > 1) el('undoA').disabled = false
    } else {
      idB = data.latent_id
      el('imgB').src = data.image
      historyB.push({ id: idB, image: data.image })
      if (historyB.length > 1) el('undoB').disabled = false
    }
    updateButtons();
    return data
  } catch (e) {
    setMsg('Generation error: ' + e.message)
    throw e
  }
}

function clearFilmstrip(){
  const container = el('interpResults')
  if(!container) return
  container.innerHTML = ''
}

function setMsg(text){ el('msg').textContent = text }
function setInterpMsg(text){ el('interpMsg').textContent = text }
function setFormula(text){ const f = el('formula'); if(f) f.textContent = text }

async function doOp(op) {
  setMsg('')
  if (!idA || !idB) { setMsg('Generate both A and B first'); return }
  try {
    const payload = { id_a: idA, id_b: idB, operation: op }
    const data = await postJSON('/arithmetic', payload)
    el('imgOut').src = data.image
    if(op === 'add') setFormula('z_out = z_A + z_B')
    if(op === 'subtract_ab') setFormula('z_out = z_A - z_B')
    if(op === 'subtract_ba') setFormula('z_out = z_B - z_A')
  } catch (e) {
    setMsg('Operation error: ' + e.message)
  }
}

// Interpolation UI
function setWeightVal(v) { el('weightVal').textContent = Number(v).toFixed(2) }

async function doInterp() {
  setInterpMsg('')
  if (!idA || !idB) { setInterpMsg('Generate both A and B first'); return }
  // Show filmstrip preview of interpolations (default 7 steps)
  try {
    await getFilmstrip()
    setInterpMsg('')
  } catch (e) {
    setInterpMsg('Interpolation error: ' + e.message)
  }
}

// Filmstrip and continuous weight handling
let interpTimeout = null
async function getFilmstrip(){
  if (!idA || !idB) return
  try{
    const res = await postJSON('/interpolate', { id_a: idA, id_b: idB, steps: 7 })
    if (res && res.images){
      renderFilmstrip(res.images, res.alphas)
    }
  }catch(e){
    console.warn('Failed to load filmstrip', e)
  }
}

function renderFilmstrip(images, alphas){
  const container = el('interpResults')
  if(!container) return
  container.innerHTML = ''
  images.forEach((src, i)=>{
    const fig = document.createElement('figure')
    fig.className = 'interp-thumb'
    const img = document.createElement('img')
    img.src = src
    img.alt = `interp ${i}`
    img.dataset.alpha = alphas ? alphas[i] : ''
    img.dataset.index = String(i)
    img.addEventListener('click', ()=>{
      const a = Number(img.dataset.alpha || 0.5)
      el('weight').value = String(a)
      setWeightVal(a)
      triggerWeightedUpdate()
      highlightSelectedAlpha(a)
    })
    const cap = document.createElement('figcaption')
    cap.textContent = alphas ? `${alphas[i].toFixed(2)}` : ''
    fig.appendChild(img)
    fig.appendChild(cap)
    container.appendChild(fig)
  })
  // highlight current slider value if possible
  const cur = Number(el('weight').value)
  highlightSelectedAlpha(cur)
}

function highlightSelectedAlpha(weight){
  const container = el('interpResults')
  if(!container) return
  const figs = container.querySelectorAll('.interp-thumb')
  figs.forEach(f=>{
    const img = f.querySelector('img')
    const a = Number(img.dataset.alpha || 0)
    // consider equal within small epsilon
    if (Math.abs(a - weight) < 0.005) f.classList.add('selected')
    else f.classList.remove('selected')
  })
}

function triggerWeightedUpdate(){
  // debounce rapid slider events
  if (interpTimeout) clearTimeout(interpTimeout)
  interpTimeout = setTimeout(async ()=>{
    interpTimeout = null
    const w = Number(el('weight').value)
    if (!idA || !idB) return
    try{
      const res = await postJSON('/interpolate', { id_a: idA, id_b: idB, weight: w })
      if (res && res.image){
        el('imgOut').src = res.image
        setFormula(`z_out = ${w.toFixed(2)} * z_A + ${ (1-w).toFixed(2) } * z_B`)
        // update selection on filmstrip if visible
        highlightSelectedAlpha(w)
      }
    }catch(e){
      setInterpMsg('Interpolation error: ' + e.message)
    }
  }, 120)
}

function clearOut(){ el('imgOut').src = ''; setFormula('z_out = —') }

function updateButtons() {
  const enabled = idA && idB
  el('opAdd').disabled = !enabled
  el('opSubAB').disabled = !enabled
  el('opSubBA').disabled = !enabled
  el('doInterp').disabled = !enabled
  // undo buttons enabled when history length > 1
  if (el('undoA')) el('undoA').disabled = historyA.length <= 1
  if (el('undoB')) el('undoB').disabled = historyB.length <= 1
}

document.addEventListener('DOMContentLoaded', () => {
  el('genA').addEventListener('click', () => generate('A'))
  el('genB').addEventListener('click', () => generate('B'))
  el('undoA').addEventListener('click', ()=>{
    if (historyA.length <= 1) return
    // remove latest
    historyA.pop()
    const prev = historyA[historyA.length-1]
    idA = prev.id
    el('imgA').src = prev.image
    updateButtons();
  })
  el('undoB').addEventListener('click', ()=>{
    if (historyB.length <= 1) return
    historyB.pop()
    const prev = historyB[historyB.length-1]
    idB = prev.id
    el('imgB').src = prev.image
    updateButtons();
  })
  el('opAdd').addEventListener('click', () => doOp('add'))
  el('opSubAB').addEventListener('click', () => doOp('subtract_ab'))
  el('opSubBA').addEventListener('click', () => doOp('subtract_ba'))
  el('weight').addEventListener('input', (ev)=> { setWeightVal(ev.target.value); triggerWeightedUpdate() })
  el('doInterp').addEventListener('click', doInterp)
  el('clearOut').addEventListener('click', clearOut)
  // initialize
  setWeightVal(el('weight').value)
  setFormula('z_out = —')
  updateButtons();
  // Auto-generate initial images for A and B on first load
  (async ()=>{
    try{
      // temporarily hide errors
      setMsg('Generating initial images...')
      // disable action buttons while loading
      el('opAdd').disabled = true;
      el('opSubAB').disabled = true;
      el('opSubBA').disabled = true;
      el('doInterp').disabled = true;
      await generate('A')
      await generate('B')
      // load fixed filmstrip of 7 frames and compute initial interpolated result
      await getFilmstrip();
      triggerWeightedUpdate();
      setMsg('');
    }catch(err){
      setMsg('Initial generation failed: ' + (err.message || err));
    } finally{
      updateButtons();
    }
  })()
})

