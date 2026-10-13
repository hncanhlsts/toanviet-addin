// ToanViet – add-in Word / PowerPoint: soạn công thức, chèn thành ảnh nét cao, mở lại để sửa
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  MathfieldElement.fontsDirectory = null; // phông nhúng sẵn trong fonts-inline.css
  MathfieldElement.soundsDirectory = null;

  // Dấu đồng dạng kiểu SGK Việt Nam + sửa lệch mũ góc/cung + chữ tiếng Việt trong \text
  const SIM_D = 'M300 370C200 430 75 360 75 245C75 130 200 70 300 135C390 190 390 310 480 365C580 430 705 370 705 255C705 140 580 70 480 130';
  const SIM_TEX = '\\mathrel{\\class{tv-sim}{\\sim}}';
  const simMask = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 45 720 410"><path transform="translate(0 500) scale(1 -1)" d="' + SIM_D + '" fill="none" stroke="#000" stroke-width="44" stroke-linecap="round"/></svg>') + '")';
  const FIX_CSS = '.tv-sim{position:relative;display:inline-block;min-width:.92em;text-align:center;-webkit-text-fill-color:transparent}' +
    '.tv-sim::after{content:"";position:absolute;left:50%;top:50%;width:.9em;height:.5em;transform:translate(-50%,-50%);background:currentColor;-webkit-mask:' + simMask + ' center/100% 100% no-repeat;mask:' + simMask + ' center/100% 100% no-repeat}' +
    '.ML__center:has(.ML__stretchy){margin-left:0!important}' +
    '.ML__text{font-family:"Times New Roman",Cambria,serif!important}';
  const addCss = (node) => { const st = document.createElement('style'); st.textContent = FIX_CSS; node.appendChild(st); };
  addCss(document.head);
  const expandSim = (l) => String(l).replace(/\\dongdang(?![a-zA-Z])/g, SIM_TEX);
  const collapseSim = (l) => String(l).replace(/\\mathrel\{\\class\{tv-sim\}\{\\sim\}\}/g, '\\dongdang ');
  const markup = (latex) => MathLive.convertLatexToMarkup(expandSim(latex), { defaultMode: 'math' });

  let STATIC_CSS = '', FONTS_CSS = '';
  const cssReady = Promise.all([fetch('mathlive-static.css').then((r) => r.text()), fetch('fonts-inline.css').then((r) => r.text())])
    .then(([a, b]) => { STATIC_CSS = a; FONTS_CSS = b; });

  function status(t, err) { const el = $('#status'); el.textContent = t; el.classList.toggle('err', !!err); }

  // ---------- Ô soạn công thức ----------
  const mf = new MathfieldElement();
  $('#mfwrap').replaceWith(mf);
  mf.mathVirtualKeyboardPolicy = 'manual';
  mf.macros = Object.assign({}, mf.macros, { dongdang: SIM_TEX });
  mf.inlineShortcuts = Object.assign({}, mf.inlineShortcuts, { dongdang: '\\dongdang' });
  setTimeout(() => { if (mf.shadowRoot) addCss(mf.shadowRoot); }, 0);
  const tex = $('#tex');
  const value = () => collapseSim(mf.getValue('latex-expanded')).trim();
  mf.addEventListener('input', () => { tex.value = value(); });
  tex.addEventListener('input', () => mf.setValue(tex.value, { silenceNotifications: true }));
  function newLine() {
    const v = mf.getValue('latex-expanded');
    if (!/^\s*\\begin\{array\}/.test(v)) {
      mf.setValue('\\begin{array}{l}' + v + '\\end{array}', { silenceNotifications: true });
      mf.executeCommand('moveToMathfieldEnd');
      mf.executeCommand('moveToPreviousChar');
    }
    mf.executeCommand('addRowAfter');
    tex.value = value();
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.ctrlKey || e.target === tex) { e.preventDefault(); e.stopPropagation(); insert(); }
    else if (e.target === mf) { e.preventDefault(); e.stopPropagation(); newLine(); }
  }, true);

  const grp = $('#grp'), pal = $('#palette');
  PALETTE.forEach((t, i) => { const op = document.createElement('option'); op.value = i; op.textContent = t.name; grp.appendChild(op); });
  function buildPalette() {
    pal.innerHTML = '';
    PALETTE[+grp.value].items.forEach((item) => {
      const code = Array.isArray(item) ? item[1] : item, shown = Array.isArray(item) ? item[0] : item;
      const b = document.createElement('button');
      b.innerHTML = MathLive.convertLatexToMarkup(expandSim(shown.replace(/#@|#\?/g, '\\square ')), { defaultMode: 'inline-math' });
      b.title = code.replace(/#@|#\?/g, '□');
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => { mf.insert(code, { focus: true, selectionMode: 'placeholder', format: 'latex' }); tex.value = value(); mf.focus(); };
      pal.appendChild(b);
    });
  }
  grp.onchange = buildPalette;
  grp.value = 1; // mở sẵn nhóm Góc – Cung – Đồng dạng
  buildPalette();
  $('#clear').onclick = () => { mf.setValue(''); tex.value = ''; mf.focus(); };

  // ---------- Dựng ảnh PNG từ công thức (không cần máy chủ) ----------
  async function renderPng(latex, size, color, scale) {
    await cssReady;
    const meas = $('#meas');
    meas.style.fontSize = size + 'px';
    meas.innerHTML = markup(latex);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const r = meas.getBoundingClientRect();
    const w = Math.ceil(r.width) + 2, h = Math.ceil(r.height) + 2;
    const box = document.createElement('div');
    box.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    box.setAttribute('style', `font-size:${size}px;color:${color};white-space:nowrap;line-height:1.2;padding:4px;display:inline-block`);
    box.innerHTML = '<style>' + FONTS_CSS + STATIC_CSS + FIX_CSS + '</style>' + meas.innerHTML;
    const xhtml = new XMLSerializer().serializeToString(box);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}"><foreignObject width="${w}" height="${h}">${xhtml}</foreignObject></svg>`;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const draw = async () => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = w * scale; cv.height = h * scale;
      cv.getContext('2d').drawImage(img, 0, 0);
      return cv.toDataURL('image/png');
    };
    await draw(); // lần đầu để trình duyệt nạp phông nhúng
    await new Promise((res) => setTimeout(res, 60));
    const dataUrl = await draw();
    return { b64: dataUrl.split(',')[1], dataUrl, w, h };
  }

  const enc = (obj) => { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); }); return 'TVS1:' + btoa(bin); };
  const dec = (s) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.slice(5)), (c) => c.charCodeAt(0))));

  // ---------- Word ----------
  async function wordInsert(img, data) {
    await Word.run(async (ctx) => {
      const pic = ctx.document.getSelection().insertInlinePictureFromBase64(img.b64, 'Replace');
      pic.lockAspectRatio = false;
      pic.width = img.w * 0.75; pic.height = img.h * 0.75;
      pic.lockAspectRatio = true;
      pic.altTextTitle = 'ToanViet';
      pic.altTextDescription = data;
      await ctx.sync();
      try { pic.getRange('After').select(); await ctx.sync(); } catch (e) { /* bản Word cũ */ }
    });
  }
  function wordRead() {
    return Word.run(async (ctx) => {
      const pics = ctx.document.getSelection().inlinePictures;
      pics.load('items/altTextDescription');
      await ctx.sync();
      const p = pics.items.find((t) => (t.altTextDescription || '').startsWith('TVS1:'));
      return p ? p.altTextDescription : null;
    });
  }

  // ---------- PowerPoint ----------
  function pptSelected(remove) {
    return PowerPoint.run(async (ctx) => {
      const sh = ctx.presentation.getSelectedShapes();
      sh.load('items');
      await ctx.sync();
      if (sh.items.length !== 1) return null;
      const s = sh.items[0];
      const t = s.tags.getItemOrNullObject('TVS');
      t.load('value'); s.load('left,top');
      await ctx.sync();
      if (t.isNullObject) return null;
      const r = { data: t.value, left: s.left, top: s.top };
      if (remove) { s.delete(); await ctx.sync(); }
      return r;
    }).catch(() => null);
  }
  async function pptInsert(img, data) {
    const old = await pptSelected(true);
    const opt = { coercionType: Office.CoercionType.Image, imageWidth: img.w * 1.5, imageHeight: img.h * 1.5 };
    if (old) { opt.imageLeft = old.left; opt.imageTop = old.top; }
    await new Promise((res, rej) => Office.context.document.setSelectedDataAsync(img.b64, opt, (r) => (r.status === Office.AsyncResultStatus.Succeeded ? res() : rej(new Error(r.error.message)))));
    try {
      await PowerPoint.run(async (ctx) => {
        const sh = ctx.presentation.getSelectedShapes();
        sh.load('items');
        await ctx.sync();
        if (!sh.items.length) return;
        sh.items[0].tags.add('TVS', data);
        sh.items[0].name = 'ToanViet';
        await ctx.sync();
      });
    } catch (e) { return false; }
    return true;
  }

  // ---------- Lệnh ----------
  let host = null;
  async function insert() {
    const latex = value();
    if (!latex) return status('Chưa có công thức để chèn', true);
    const size = Math.max(8, Math.min(96, +$('#size').value || 18)), color = $('#color').value;
    try {
      status('Đang chèn…');
      const img = await renderPng(latex, size, color, 4);
      const data = enc({ type: 'formula', x: 60, y: 50, latex, size, color });
      if (host === 'Word') { await wordInsert(img, data); status('Đã chèn vào Word. Muốn sửa: nhấp vào công thức rồi bấm "Sửa công thức đang chọn".'); }
      else if (host === 'PowerPoint') {
        const tagged = await pptInsert(img, data);
        status(tagged ? 'Đã chèn vào trang chiếu.' : 'Đã chèn vào trang chiếu (bản PowerPoint này không lưu được dữ liệu để sửa lại).');
      } else { const pv = $('#preview'); pv.src = img.dataUrl; pv.style.display = 'block'; pv.style.width = img.w + 'px'; status('Xem thử (trang đang mở ngoài Word/PowerPoint nên chỉ hiện ảnh).'); }
      $('#edit').classList.remove('hot');
    } catch (e) { status('Lỗi: ' + e.message, true); }
  }
  async function editSelected() {
    try {
      let raw = null;
      if (host === 'Word') raw = await wordRead();
      else if (host === 'PowerPoint') { const r = await pptSelected(false); raw = r && r.data; }
      if (!raw) return status('Hãy nhấp chọn một công thức ToanViet trong tài liệu trước.', true);
      const o = dec(raw);
      if (o.type !== 'formula') return status('Hình này được tạo bằng phần mềm ToanViet Studio — hãy dùng nút "Lấy về sửa" trong phần mềm.', true);
      mf.setValue(o.latex, { silenceNotifications: true }); tex.value = o.latex;
      if (o.size) $('#size').value = o.size;
      if (o.color) $('#color').value = o.color;
      mf.focus();
      status('Đã mở công thức. Sửa xong bấm "Chèn vào tài liệu" để thay cho công thức đang chọn.');
    } catch (e) { status('Lỗi: ' + e.message, true); }
  }
  $('#insert').onclick = insert;
  $('#edit').onclick = editSelected;
  window.__tvTest = { renderPng, insert, value };

  if (window.Office && Office.onReady) {
    Office.onReady((info) => {
      host = info && info.host ? String(info.host) : null;
      if (!host) return status('Trang đang mở ngoài Word/PowerPoint: chỉ xem thử được.');
      status('Sẵn sàng (' + host + '). Enter: xuống dòng · Ctrl+Enter: chèn');
      // báo hiệu khi người dùng nhấp vào một công thức ToanViet
      try {
        Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, async () => {
          let raw = null;
          try { if (host === 'Word') raw = await wordRead(); else if (host === 'PowerPoint') { const r = await pptSelected(false); raw = r && r.data; } } catch (e) { /* bỏ qua */ }
          $('#edit').classList.toggle('hot', !!raw);
        });
      } catch (e) { /* không hỗ trợ */ }
    });
  }
})();
