/* Local-only prototype. IndexedDB stores demo media on this device, never on a server. */
(() => {
  const input = document.querySelector('#walkthrough-files'), room = document.querySelector('#walkthrough-room');
  const preview = document.querySelector('#walkthrough-preview'), message = document.querySelector('#walkthrough-message');
  const notes = document.querySelector('#walkthrough-notes'), save = document.querySelector('#save-walkthrough');
  const booking = journey?.demo ? journey : null;
  const storageKey = booking ? JSON.stringify([booking.email, booking.date, booking.scope, booking.care]) : 'sample-booking';
  const bedrooms = [1,1,0,1,2,3,4,6][booking?.scopeId ?? 3];
  const bathrooms = [1,1,1,1,2,2,3,3][booking?.scopeId ?? 3];
  const standardRooms = ['Living room', 'Kitchen', ...Array.from({length: bedrooms}, (_,i) => bedrooms === 1 ? 'Bedroom' : 'Bedroom ' + (i+1)), ...Array.from({length: bathrooms}, (_,i) => bathrooms === 1 ? 'Bathroom' : 'Bathroom ' + (i+1))];
  if (bedrooms === 0) standardRooms.push('Living / sleeping area');
  const roomNames = booking?.scopeId < 2 ? [booking.scopeId === 0 ? 'King bedroom' : 'Queen bedroom', 'Bathroom'] : Array.from(new Set([...standardRooms, ...(booking?.roomFocus || [])]));
  roomNames.push('Whole space / walkthrough');
  roomNames.forEach(name => { const option = document.createElement('option'); option.textContent = name; room.append(option); });
  let files = [], urls = [], db = null, saved = false, generation = 0;
  function notify(text) { message.textContent = text; }
  function state() {
    document.querySelector('#walkthrough-badge').textContent = files.length ? (saved ? 'Saved on this device · Demo' : 'Unsaved preview') : 'Photos / videos needed';
    document.querySelector('#price-review-status').textContent = files.length ? 'Awaiting company review · Not sent in demo' : 'Awaiting walkthrough · Demo';
  }
  function renderFiles() {
    urls.forEach(URL.revokeObjectURL); urls = []; preview.replaceChildren();
    files.forEach((item, index) => {
      const card = document.createElement('article'), media = document.createElement(item.blob.type.startsWith('image/') ? 'img' : 'video');
      const url = URL.createObjectURL(item.blob); urls.push(url); media.src = url;
      if (media.tagName === 'VIDEO') { media.controls = true; media.preload = 'metadata'; media.playsInline = true; } else media.alt = 'Local preview: ' + item.room;
      const title = document.createElement('p'); title.textContent = item.name + ' · ' + (item.blob.size / 1024 / 1024).toFixed(1) + ' MB';
      const label = document.createElement('label'); label.textContent = 'Room';
      const select = document.createElement('select'); select.setAttribute('aria-label', 'Room for ' + item.name);
      roomNames.forEach(name => { const o = document.createElement('option'); o.textContent = name; select.append(o); }); select.value = item.room;
      select.onchange = () => { item.room = select.value; saved = false; state(); }; label.append(select);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'textbtn'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', 'Remove ' + item.name);
      remove.onclick = () => { files.splice(index, 1); saved = false; renderFiles(); };
      media.onerror = () => { title.textContent = item.name + ' · Preview unavailable in this browser; you can remove or replace this file.'; };
      card.append(media, title, label, remove); preview.append(card);
    }); state();
  }
  const ready = new Promise(resolve => {
    const request = indexedDB.open('p31-local-walkthrough-demo', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('walkthroughs');
    request.onerror = () => { notify('Local storage is unavailable. You can preview files, but they will not be saved.'); resolve(); };
    request.onsuccess = () => { db = request.result; const read = db.transaction('walkthroughs').objectStore('walkthroughs').get(storageKey); read.onsuccess = () => { if (read.result) { files = read.result.files || []; notes.value = read.result.notes || ''; saved = true; renderFiles(); notify('Restored demo files from this device. Nothing has been uploaded.'); } resolve(); }; read.onerror = () => resolve(); };
    request.onblocked = () => { notify('Close another open demo tab to enable local saving. Preview remains available.'); resolve(); };
  }).catch(() => { notify('Local storage is unavailable. File previews will not be saved.'); });
  input.disabled = true; save.disabled = true;
  ready.finally(() => { input.disabled = false; save.disabled = false; });
  input.onchange = () => {
    const accepted = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']);
    const errors = []; let added = 0;
    for (const file of input.files) {
      if (!accepted.has(file.type)) { errors.push(file.name + ': unsupported file type'); continue; }
      if (!file.size || file.size > 20 * 1024 * 1024) { errors.push(file.name + ': file must be between 1 byte and 20 MB'); continue; }
      if (files.length >= 6 || files.reduce((sum, item) => sum + item.blob.size, 0) + file.size > 80 * 1024 * 1024) { errors.push(file.name + ': demo storage limit reached'); continue; }
      files.push({ name: file.name, room: room.value, blob: file }); added++;
    }
    input.value = ''; saved = false; renderFiles(); notify((added ? added + ' file(s) added to your local preview. Save to keep them on this device. ' : '') + errors.join('. '));
  };
  notes.oninput = () => { saved = false; state(); };
  save.onclick = async () => {
    await ready;
    if (!files.length) { notify('Add at least one room photo or video before saving.'); input.focus(); return; }
    if (!db) { notify('Local storage is unavailable. These previews will be lost when you leave this page.'); return; }
    save.disabled = true; const token = generation;
    const tx = db.transaction('walkthroughs', 'readwrite'); tx.objectStore('walkthroughs').put({ files, notes: notes.value }, storageKey);
    tx.oncomplete = () => { save.disabled = false; if (token !== generation) return; saved = true; state(); notify('Walkthrough saved on this device only. No files were sent; company review and final pricing are not active yet.'); };
    tx.onerror = () => { save.disabled = false; notify('Unable to save: local storage may be full or unavailable. Your current previews remain visible.'); };
  };
  document.querySelector('#clear-walkthrough').onclick = async () => {
    await ready; generation++;
    if (db) { const tx = db.transaction('walkthroughs', 'readwrite'); tx.objectStore('walkthroughs').delete(storageKey); tx.onerror = () => notify('Previews cleared, but saved files could not be deleted. Try clearing again.'); }
    files = []; notes.value = ''; saved = false; renderFiles(); notify('Walkthrough previews cleared. No files have been sent to the company.');
  };
  window.addEventListener('pagehide', () => urls.forEach(URL.revokeObjectURL));
  state();
})();
