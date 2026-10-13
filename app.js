// =============================================================================
//  HDL Compiler Studio - Client Application Logic (Reviews 1-4)
// =============================================================================

const SAMPLES = {
  sample1: `input a, b;
output y;
wire w1;
reg clk;

w1 = a and b;
y = w1 or clk;`,

  sample2: `input x, y, z;
output out1, out2;
wire w1, w2;
reg state;

w1 = x and y;
w2 = w1 or z;
out1 = w2 and not state;
out2 = state or w1;`,

  adder: `input a, b, cin;
output sum, cout;
wire s1, c1, c2;

s1 = a and b;
c1 = a or b;
c2 = s1 and cin;
cout = c1 or c2;
sum = s1 or cin;`,

  cse: `input a, b, c;
output out1, out2, out3;
wire w1, w2, w3;

w1 = a and b;
w2 = a and b;
w3 = w1 or c;
out1 = w2 or c;
out2 = w3;
out3 = a and b;`
};

let currentTokens = [];
let currentFilter = 'ALL';
let backendAvailable = false;

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  editor.value = SAMPLES.sample1;
  updateLN();
  editor.addEventListener('input', updateLN);
  editor.addEventListener('keydown', handleEditorKey);
  editor.addEventListener('scroll', syncScroll);

  checkBackendStatus();
  loadSample();
});

function handleEditorKey(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const ed = e.target;
    const start = ed.selectionStart;
    const end = ed.selectionEnd;
    ed.value = ed.value.substring(0, start) + '    ' + ed.value.substring(end);
    ed.selectionStart = ed.selectionEnd = start + 4;
    updateLN();
  }
}

function syncScroll() {
  const ed = document.getElementById('editor');
  const ln = document.getElementById('ln');
  if (ln && ed) ln.scrollTop = ed.scrollTop;
}

function updateLN() {
  const ed = document.getElementById('editor');
  const ln = document.getElementById('ln');
  const stats = document.getElementById('ed-stats');
  if (!ed || !ln) return;
  const lines = ed.value.split('\n').length;
  let nums = '';
  for (let i = 1; i <= lines; i++) nums += i + '\n';
  ln.textContent = nums;
  if (stats) stats.textContent = `Lines: ${lines} | Chars: ${ed.value.length}`;
}

function loadSample() {
  const sel = document.getElementById('sample-sel').value;
  const ed = document.getElementById('editor');
  if (SAMPLES[sel]) {
    ed.value = SAMPLES[sel];
    updateLN();
  }
}

async function checkBackendStatus() {
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  const alertBar = document.getElementById('alert-bar');
  try {
    const res = await fetch('/api/status', { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      backendAvailable = true;
      if (dot) dot.className = 'dot dot-ok';
      if (txt) txt.textContent = 'C Native Backend Ready';
      if (alertBar) alertBar.style.display = 'none';
      return;
    }
  } catch (err) {
    // server not running or static mode
  }
  backendAvailable = false;
  if (dot) dot.className = 'dot dot-warn';
  if (txt) txt.textContent = 'Standalone Mode';
  if (alertBar) alertBar.style.display = 'flex';
}

function switchStage(stage) {
  const tabs = ['lexer', 'parser', 'icg', 'opt'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    const pane = document.getElementById(`pane-${t}`);
    if (btn) btn.classList.toggle('active', t === stage);
    if (pane) pane.classList.toggle('active', t === stage);
  });

  const stepMap = { lexer: 1, parser: 2, icg: 3, opt: 4 };
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`pipe-${i}`);
    if (stepEl) {
      stepEl.classList.toggle('active', i === stepMap[stage]);
    }
  }
}

async function runPipeline() {
  const ed = document.getElementById('editor');
  const code = ed.value;
  if (!code.trim()) {
    alert('Please enter or select some HDL code first.');
    return;
  }

  const runBtn = document.getElementById('run-btn');
  const prevTxt = runBtn.textContent;
  runBtn.disabled = true;
  runBtn.textContent = '⏳ Compiling...';

  const t0 = performance.now();

  try {
    if (backendAvailable) {
      const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (res.ok) {
        const data = await res.json();
        renderAllStages(data.stages);
        const t1 = performance.now();
        document.getElementById('m-time').textContent = `${Math.round(t1 - t0)}ms (C native)`;
        return;
      }
    }
    // Fallback: Client-side Compiler Simulator
    const simStages = simulatePipeline(code);
    renderAllStages(simStages);
    const t1 = performance.now();
    document.getElementById('m-time').textContent = `${Math.round(t1 - t0)}ms (simulated)`;
  } catch (err) {
    console.error('Compilation error, falling back to simulator:', err);
    const simStages = simulatePipeline(code);
    renderAllStages(simStages);
    const t1 = performance.now();
    document.getElementById('m-time').textContent = `${Math.round(t1 - t0)}ms (fallback)`;
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = prevTxt;
    // Mark steps completed
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`pipe-${i}`);
      if (el) el.classList.add('done');
    }
  }
}

function renderAllStages(stages) {
  if (stages.lexer)  renderLexer(stages.lexer);
  if (stages.parser) renderParser(stages.parser);
  if (stages.icg)    renderICG(stages.icg);
  if (stages.opt)    renderOpt(stages.opt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Render Lexer
// ─────────────────────────────────────────────────────────────────────────────
function renderLexer(data) {
  currentTokens = data.tokens || [];
  document.getElementById('cnt-tokens').textContent = currentTokens.length;
  document.getElementById('m-tokens').textContent = currentTokens.length;

  filterTokens();

  const symBody = document.getElementById('sym-body');
  if (!data.symbols || data.symbols.length === 0) {
    symBody.innerHTML = `<tr><td colspan="5"><div class="empty">No symbols found.</div></td></tr>`;
    return;
  }

  symBody.innerHTML = data.symbols.map((s, idx) => {
    let catBadge = 'b-id';
    if (s.category === 'Input Port')   catBadge = 'b-in';
    if (s.category === 'Output Port')  catBadge = 'b-out';
    if (s.category === 'Internal Wire') catBadge = 'b-wire';
    if (s.category === 'Register')     catBadge = 'b-reg';

    return `
      <tr>
        <td class="mono">${idx + 1}</td>
        <td><strong class="mono" style="color:#58a6ff">${s.name}</strong></td>
        <td><span class="badge ${catBadge}">${s.category}</span></td>
        <td style="color:#8b949e">${s.scope || 'Module / Global'}</td>
        <td><span style="color:#3fb950">✓ ${s.status || 'Declared'}</span></td>
      </tr>
    `;
  }).join('');
}

function setFilter(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-bar .chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  filterTokens();
}

function filterTokens() {
  const search = (document.getElementById('tok-search').value || '').toLowerCase();
  const tokBody = document.getElementById('tok-body');

  const filtered = currentTokens.filter(t => {
    const matchCat = (currentFilter === 'ALL' || t.type === currentFilter);
    const matchSearch = (!search || t.lexeme.toLowerCase().includes(search) || t.type.toLowerCase().includes(search) || t.category.toLowerCase().includes(search));
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    tokBody.innerHTML = `<tr><td colspan="5"><div class="empty">No matching tokens.</div></td></tr>`;
    return;
  }

  tokBody.innerHTML = filtered.map((t, idx) => {
    let badgeClass = 'b-kw';
    if (t.type === 'GATE_OP')    badgeClass = 'b-gate';
    if (t.type === 'IDENTIFIER') badgeClass = 'b-id';
    if (t.type === 'OPERATOR')   badgeClass = 'b-op';
    if (t.type === 'PUNCT')      badgeClass = 'b-punct';
    if (t.type === 'NUMBER')     badgeClass = 'b-num';

    return `
      <tr>
        <td class="mono">${idx + 1}</td>
        <td><span class="badge ${badgeClass}">${t.type}</span></td>
        <td><strong class="mono">${escapeHtml(t.lexeme)}</strong></td>
        <td class="mono" style="color:#8b949e">L${t.line}</td>
        <td style="color:#c9d1d9">${t.category}</td>
      </tr>
    `;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2: Render Parser
// ─────────────────────────────────────────────────────────────────────────────
function renderParser(data) {
  const treeEl = document.getElementById('parse-tree');
  const verdictEl = document.getElementById('verdict-box');
  const mParse = document.getElementById('m-parse');
  const cntParse = document.getElementById('cnt-parse');

  const isPass = (data.status === 'PASS' || data.errors === 0);

  if (cntParse) cntParse.textContent = isPass ? 'PASS' : 'FAIL';
  if (mParse) {
    mParse.textContent = isPass ? 'PASS' : `FAIL (${data.errors} err)`;
    mParse.className = `m-val ${isPass ? 'm-pass' : 'm-fail'}`;
  }

  if (verdictEl) {
    if (isPass) {
      verdictEl.className = 'verdict-box verdict-pass';
      verdictEl.innerHTML = `<span>✓</span> <strong>Syntax Status: PASS</strong> &mdash; 0 syntax errors. Syntactically valid HDL program.`;
    } else {
      verdictEl.className = 'verdict-box verdict-fail';
      verdictEl.innerHTML = `<span>✕</span> <strong>Syntax Status: FAIL</strong> &mdash; ${data.errors || 1} syntax errors detected.`;
    }
  }

  if (treeEl) {
    let treeText = data.parseTree || 'No parse tree generated.';
    // Colorize error lines
    treeText = treeText.split('\n').map(l => {
      if (l.includes('[ERROR]')) return `<span class="parse-error">${escapeHtml(l)}</span>`;
      return escapeHtml(l);
    }).join('\n');
    treeEl.innerHTML = treeText;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3: Render ICG
// ─────────────────────────────────────────────────────────────────────────────
function renderICG(data) {
  const tacBody = document.getElementById('tac-body');
  const tempBody = document.getElementById('temp-body');
  const cntTac = document.getElementById('cnt-tac');
  const mTac = document.getElementById('m-tac');

  const tacList = data.tac || [];
  const tempList = data.temps || [];

  if (cntTac) cntTac.textContent = tacList.length;
  if (mTac) mTac.textContent = tacList.length;

  if (tacList.length === 0) {
    tacBody.innerHTML = `<tr><td colspan="5"><div class="empty">No TAC instructions generated.</div></td></tr>`;
  } else {
    tacBody.innerHTML = tacList.map(r => {
      let opBadge = 'b-kw';
      if (r.op === 'AND') opBadge = 'b-and';
      if (r.op === 'OR')  opBadge = 'b-or';
      if (r.op === 'NOT') opBadge = 'b-not';
      if (r.op === '=')   opBadge = 'b-mov';

      return `
        <tr>
          <td class="mono">${r.no}</td>
          <td><strong class="mono" style="color:#58a6ff">${r.result}</strong></td>
          <td><span class="badge ${opBadge}">${r.op}</span></td>
          <td class="mono">${r.arg1}</td>
          <td class="mono" style="color:${r.arg2 === '--' ? '#484f58' : 'inherit'}">${r.arg2}</td>
        </tr>
      `;
    }).join('');
  }

  if (tempList.length === 0) {
    tempBody.innerHTML = `<tr><td colspan="4"><div class="empty">No temporaries required (direct assignments).</div></td></tr>`;
  } else {
    tempBody.innerHTML = tempList.map(t => `
      <tr>
        <td><strong class="mono" style="color:#bc8cff">${t.temp}</strong></td>
        <td><span class="badge b-kw">${t.op}</span></td>
        <td class="mono">${t.arg1}</td>
        <td class="mono" style="color:${t.arg2 === '--' ? '#484f58' : 'inherit'}">${t.arg2}</td>
      </tr>
    `).join('');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4: Render Optimizer & Target Code
// ─────────────────────────────────────────────────────────────────────────────
function renderOpt(data) {
  document.getElementById('oc-cse').textContent = data.cseEliminated || '0';
  document.getElementById('oc-dce').textContent = data.dceRemoved || '0';
  document.getElementById('oc-before').textContent = data.beforeOpt || (data.unopt ? data.unopt.length : '0');
  document.getElementById('oc-after').textContent = data.afterOpt || (data.opt ? data.opt.length : '0');
  document.getElementById('oc-gain').textContent = data.gain || '0.0%';
  document.getElementById('oc-regs').textContent = data.regsUsed || '0';

  document.getElementById('cnt-opt').textContent = data.gain || '0%';
  document.getElementById('m-gain').textContent = data.gain || '0.0%';
  document.getElementById('m-gain').className = `m-val ${data.gain && !data.gain.startsWith('0') ? 'm-pass' : 'm-neutral'}`;
  document.getElementById('m-target').textContent = data.totalTarget || (data.target ? data.target.length : '0');

  // Before table
  const unoptBody = document.getElementById('unopt-body');
  if (!data.unopt || data.unopt.length === 0) {
    unoptBody.innerHTML = `<tr><td colspan="5"><div class="empty">Empty</div></td></tr>`;
  } else {
    unoptBody.innerHTML = data.unopt.map(r => `
      <tr>
        <td class="mono">${r.no}</td>
        <td class="mono" style="color:#58a6ff">${r.result}</td>
        <td><span class="badge b-kw">${r.op}</span></td>
        <td class="mono">${r.arg1}</td>
        <td class="mono" style="color:${r.arg2 === '--' ? '#484f58' : 'inherit'}">${r.arg2}</td>
      </tr>
    `).join('');
  }

  // After table
  const optBody = document.getElementById('opt-body');
  if (!data.opt || data.opt.length === 0) {
    optBody.innerHTML = `<tr><td colspan="5"><div class="empty">Empty</div></td></tr>`;
  } else {
    optBody.innerHTML = data.opt.map(r => `
      <tr>
        <td class="mono">${r.no}</td>
        <td class="mono" style="color:#3fb950">${r.result}</td>
        <td><span class="badge b-kw">${r.op}</span></td>
        <td class="mono">${r.arg1}</td>
        <td class="mono" style="color:${r.arg2 === '--' ? '#484f58' : 'inherit'}">${r.arg2}</td>
      </tr>
    `).join('');
  }

  // Target table
  const targetBody = document.getElementById('target-body');
  if (!data.target || data.target.length === 0) {
    targetBody.innerHTML = `<tr><td colspan="2"><div class="empty">No target instructions generated.</div></td></tr>`;
  } else {
    targetBody.innerHTML = data.target.map(t => {
      const parts = t.instr.split(/\s+/);
      const op = parts[0];
      let opBadge = 'b-load';
      if (op === 'STORE') opBadge = 'b-store';
      if (op === 'AND')   opBadge = 'b-and';
      if (op === 'OR')    opBadge = 'b-or';
      if (op === 'NOT')   opBadge = 'b-not';
      if (op === 'MOV')   opBadge = 'b-mov';

      return `
        <tr>
          <td class="mono" style="width:50px">${t.no}</td>
          <td>
            <span class="badge ${opBadge}" style="margin-right:8px">${op}</span>
            <span class="mono" style="color:#e6edf3">${parts.slice(1).join(' ')}</span>
          </td>
        </tr>
      `;
    }).join('');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side Fallback Simulator (Mirroring the C implementations)
// ─────────────────────────────────────────────────────────────────────────────
function simulatePipeline(source) {
  // Lexer
  const lines = source.split(/\r?\n/);
  const tokens = [];
  const symbols = [];
  const seenSyms = new Set();

  const kwMap = { input: 'Input Port', output: 'Output Port', wire: 'Internal Wire', reg: 'Register' };
  const gateMap = { and: 'AND Gate Operator', or: 'OR Gate Operator', not: 'NOT Gate Inverter', xor: 'XOR Gate Operator' };

  let currentDecl = null;

  lines.forEach((lineText, lineIdx) => {
    const lineNum = lineIdx + 1;
    let pos = 0;
    while (pos < lineText.length) {
      const ch = lineText[pos];
      if (/\s/.test(ch)) { pos++; continue; }

      // Comment
      if (ch === '/' && lineText[pos+1] === '/') break;

      // Word
      if (/[a-zA-Z_]/.test(ch)) {
        let w = '';
        while (pos < lineText.length && /[a-zA-Z0-9_]/.test(lineText[pos])) {
          w += lineText[pos++];
        }
        if (kwMap[w]) {
          tokens.push({ type: 'KEYWORD', lexeme: w, line: lineNum, category: 'Declaration Keyword' });
          currentDecl = kwMap[w];
        } else if (gateMap[w]) {
          tokens.push({ type: 'GATE_OP', lexeme: w, line: lineNum, category: gateMap[w] });
        } else {
          tokens.push({ type: 'IDENTIFIER', lexeme: w, line: lineNum, category: 'Signal / Register Identifier' });
          if (currentDecl && !seenSyms.has(w)) {
            seenSyms.add(w);
            symbols.push({ name: w, category: currentDecl, scope: 'Module / Global', status: 'Declared' });
          }
        }
        continue;
      }

      // Number
      if (/[0-9]/.test(ch)) {
        let num = '';
        while (pos < lineText.length && /[0-9]/.test(lineText[pos])) num += lineText[pos++];
        tokens.push({ type: 'NUMBER', lexeme: num, line: lineNum, category: 'Constant Value' });
        continue;
      }

      // Operators and punctuation
      if (ch === '=') {
        tokens.push({ type: 'OPERATOR', lexeme: '=', line: lineNum, category: 'Assignment Operator' });
        pos++;
      } else if (ch === ';') {
        tokens.push({ type: 'PUNCT', lexeme: ';', line: lineNum, category: 'Statement Terminator' });
        currentDecl = null;
        pos++;
      } else if (ch === ',') {
        tokens.push({ type: 'PUNCT', lexeme: ',', line: lineNum, category: 'Identifier Delimiter' });
        pos++;
      } else if (ch === '(' || ch === ')') {
        tokens.push({ type: 'PUNCT', lexeme: ch, line: lineNum, category: 'Grouping Parenthesis' });
        pos++;
      } else {
        pos++;
      }
    }
  });

  // Parser simulation
  let parseTree = "program\n";
  let errors = 0;
  lines.forEach((l) => {
    const trimmed = l.trim();
    if (!trimmed || trimmed.startsWith('//')) return;
    parseTree += `  statement\n`;
    if (/^(input|output|wire|reg)\b/.test(trimmed)) {
      const kw = trimmed.split(/\s+/)[0];
      parseTree += `    decl_stmt [${kw}]\n      keyword: ${kw}\n      ident_list\n`;
      const rest = trimmed.substring(kw.length).replace(';', '').split(',');
      rest.forEach(id => {
        if (id.trim()) parseTree += `        ident: ${id.trim()}\n`;
      });
      parseTree += `      ;\n`;
    } else if (trimmed.includes('=')) {
      const parts = trimmed.replace(';', '').split('=');
      const lhs = parts[0].trim();
      const rhs = parts[1].trim();
      parseTree += `    assign_stmt\n      lhs: ${lhs}\n      op: =\n      expr\n`;
      const terms = rhs.split(/\s+(and|or|xor)\s+/);
      terms.forEach((t) => {
        if (t === 'and' || t === 'or' || t === 'xor') {
          parseTree += `        gate_op: ${t}\n`;
        } else if (t.startsWith('not ')) {
          parseTree += `        term [NOT]\n          op: not\n          term [IDENT: ${t.substring(4).trim()}]\n`;
        } else {
          parseTree += `        term [IDENT: ${t.trim()}]\n`;
        }
      });
      parseTree += `      ;\n`;
    } else {
      errors++;
      parseTree += `    [ERROR] Unexpected statement: ${trimmed}\n`;
    }
  });

  // ICG Simulation
  const unopt = [];
  const temps = [];
  let tempCount = 1;
  lines.forEach(l => {
    const trimmed = l.trim();
    if (trimmed.includes('=') && !/^(input|output|wire|reg)\b/.test(trimmed)) {
      const parts = trimmed.replace(';', '').split('=');
      const lhs = parts[0].trim();
      const rhs = parts[1].trim();
      const tokensRhs = rhs.split(/\s+/);
      if (tokensRhs.length === 1) {
        unopt.push({ no: unopt.length + 1, result: lhs, op: '=', arg1: tokensRhs[0], arg2: '--' });
      } else if (tokensRhs[0] === 'not') {
        const tname = `t${tempCount++}`;
        temps.push({ temp: tname, op: 'NOT', arg1: tokensRhs[1], arg2: '--' });
        unopt.push({ no: unopt.length + 1, result: lhs, op: 'NOT', arg1: tokensRhs[1], arg2: '--' });
      } else if (tokensRhs.length >= 3) {
        const op = tokensRhs[1].toUpperCase();
        let arg1 = tokensRhs[0];
        let arg2 = tokensRhs[2];
        if (tokensRhs[2] === 'not' && tokensRhs[3]) {
          const tname = `t${tempCount++}`;
          temps.push({ temp: tname, op: 'NOT', arg1: tokensRhs[3], arg2: '--' });
          unopt.push({ no: unopt.length + 1, result: tname, op: 'NOT', arg1: tokensRhs[3], arg2: '--' });
          arg2 = tname;
        }
        unopt.push({ no: unopt.length + 1, result: lhs, op, arg1, arg2 });
      }
    }
  });

  // Optimizer (CSE)
  const opt = [];
  const exprMap = new Map();
  let cseCount = 0;

  unopt.forEach(item => {
    const key = `${item.op}:${item.arg1}:${item.arg2}`;
    if (item.op !== '=' && exprMap.has(key)) {
      cseCount++;
      const prevResult = exprMap.get(key);
      opt.push({ no: opt.length + 1, result: item.result, op: '=', arg1: prevResult, arg2: '--' });
    } else {
      if (item.op !== '=') exprMap.set(key, item.result);
      opt.push({ no: opt.length + 1, result: item.result, op: item.op, arg1: item.arg1, arg2: item.arg2 });
    }
  });

  // RTL Target Code
  const target = [];
  let regCount = 0;
  const regMap = new Map();
  function getReg(name) {
    if (!regMap.has(name)) regMap.set(name, `R${regCount++}`);
    return regMap.get(name);
  }

  opt.forEach(instr => {
    if (instr.op === '=') {
      const r1 = getReg(instr.arg1);
      const rDest = getReg(instr.result);
      target.push({ no: target.length + 1, instr: `LOAD  ${r1}       ${instr.arg1}` });
      target.push({ no: target.length + 1, instr: `MOV   ${rDest}       ${r1}` });
      target.push({ no: target.length + 1, instr: `STORE ${rDest}       ${instr.result}` });
    } else if (instr.op === 'NOT') {
      const r1 = getReg(instr.arg1);
      const rDest = getReg(instr.result);
      target.push({ no: target.length + 1, instr: `LOAD  ${r1}       ${instr.arg1}` });
      target.push({ no: target.length + 1, instr: `NOT   ${rDest}       ${r1}` });
      target.push({ no: target.length + 1, instr: `STORE ${rDest}       ${instr.result}` });
    } else {
      const r1 = getReg(instr.arg1);
      const r2 = getReg(instr.arg2);
      const rDest = getReg(instr.result);
      target.push({ no: target.length + 1, instr: `LOAD  ${r1}       ${instr.arg1}` });
      target.push({ no: target.length + 1, instr: `LOAD  ${r2}       ${instr.arg2}` });
      target.push({ no: target.length + 1, instr: `${instr.op.padEnd(5)} ${rDest}       ${r1}, ${r2}` });
      target.push({ no: target.length + 1, instr: `STORE ${rDest}       ${instr.result}` });
    }
  });

  const gain = unopt.length > 0 ? ((cseCount / unopt.length) * 100).toFixed(1) + '%' : '0.0%';

  return {
    lexer: { tokens, symbols },
    parser: { parseTree, status: errors === 0 ? 'PASS' : 'FAIL', errors, verdict: errors === 0 ? 'Valid' : 'Errors' },
    icg: { tac: unopt, temps, totalTac: unopt.length, totalTemps: temps.length },
    opt: {
      unopt, opt, target,
      cseEliminated: String(cseCount),
      dceRemoved: '0',
      beforeOpt: String(unopt.length),
      afterOpt: String(opt.length - cseCount),
      gain,
      totalTarget: String(target.length),
      regsUsed: String(regCount)
    }
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
