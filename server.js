// =============================================================================
//  HDL Compiler Studio - Full Pipeline Backend Server
//  Compiler Design Lab - Reviews 1-4 (Complete Compiler Pipeline)
//
//  Stages:
//    Stage 1 (Lexical)     -> hdl_lexer.exe   (C/Flex)
//    Stage 2 (Syntax)      -> c_stages/hdl_parser.exe (C Recursive Descent)
//    Stage 3 (ICG)         -> c_stages/hdl_icg.exe    (C TAC Generator)
//    Stage 4 (Opt+Target)  -> c_stages/hdl_opt.exe    (C Optimizer + RTL)
// =============================================================================

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os   = require('os');

const PORT     = process.env.PORT || 3000;
const BASE_DIR = __dirname;

// ── Binary Paths ──────────────────────────────────────────────────────────────
function bin(name) {
    const localExe  = path.join(BASE_DIR, name + '.exe');
    const localPlain = path.join(BASE_DIR, name);
    if (fs.existsSync(localExe))   return localExe;
    if (fs.existsSync(localPlain)) return localPlain;
    return localExe; // will fail gracefully
}

function stageBin(name) {
    const p = path.join(BASE_DIR, 'c_stages', name);
    const pExe = p + '.exe';
    if (fs.existsSync(pExe)) return pExe;
    if (fs.existsSync(p))    return p;
    return pExe;
}

// ── Stage 1 - Lexer Output Parser ──────────────────────────────────────────
function getCategoryForType(type) {
    const map = {
        'KEYWORD':    'Declaration Keyword',
        'GATE_OP':    'Logic Gate Operator',
        'IDENTIFIER': 'Signal / Register Identifier',
        'NUMBER':     'Numeric Constant / Bit-Width',
        'OPERATOR':   'Assignment Operator',
        'PUNCT':      'Delimiter / Punctuation',
        'UNKNOWN':    'Unrecognized / Error'
    };
    return map[type] || 'Token';
}

function parseLexerOutput(stdout, sourceCode) {
    const lines      = stdout.split(/\r?\n/);
    const tokens     = [];
    const symbols    = [];
    let section      = null;
    let tokenIndex   = 1;
    const srcLines   = sourceCode.split(/\r?\n/);
    let curLine      = 1, curCol = 0;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.includes('TOKEN STREAM'))  { section = 'tokens';  continue; }
        if (line.includes('SYMBOL TABLE'))  { section = 'symbols'; continue; }
        if (/^(===|---|Name|Total)/.test(line)) continue;

        if (section === 'tokens' && line.includes(':')) {
            const ci = line.indexOf(':');
            const tokenType = line.substring(0, ci).trim();
            const lexeme    = line.substring(ci + 1).trim();
            if (!tokenType || !lexeme) continue;
            let foundLine = curLine;
            for (let l = curLine - 1; l < srcLines.length; l++) {
                const idx = srcLines[l].indexOf(lexeme, (l === curLine - 1 ? curCol : 0));
                if (idx !== -1) { foundLine = l + 1; curLine = foundLine; curCol = idx + lexeme.length; break; }
            }
            tokens.push({ id: tokenIndex++, type: tokenType, lexeme, category: getCategoryForType(tokenType), line: foundLine });
        }
        if (section === 'symbols' && line) {
            const parts = line.split(/\s+/);
            if (parts.length >= 2) symbols.push({ name: parts[0], category: parts[1], scope: 'Module / Global', status: 'Declared' });
        }
    }
    return { tokens, symbols };
}

// ── Stage 2 - Parser Output Parser ─────────────────────────────────────────
function parseParserOutput(stdout) {
    const lines = stdout.split(/\r?\n/);
    let parseTree = [], result = {}, inTree = true, inResult = false;
    for (const l of lines) {
        if (l.includes('SYNTAX ANALYSIS RESULT')) { inTree = false; inResult = true; continue; }
        if (l.includes('SYNTAX ANALYSIS - PARSE TREE')) { inTree = true; continue; }
        if (l.startsWith('===') || l.startsWith('---')) continue;
        if (inTree  && l.trim()) parseTree.push(l);
        if (inResult && l.includes(':')) {
            const ci = l.indexOf(':');
            result[l.substring(0, ci).trim()] = l.substring(ci + 1).trim();
        }
    }
    return {
        parseTree: parseTree.join('\n'),
        status:  result['STATUS']  || 'UNKNOWN',
        errors:  parseInt(result['ERRORS'] || '0'),
        verdict: result['VERDICT'] || ''
    };
}

// ── Stage 3 - ICG Output Parser ─────────────────────────────────────────────
function parseICGOutput(stdout) {
    const lines = stdout.split(/\r?\n/);
    const tac = [], temps = [];
    let section = null;
    for (const l of lines) {
        const line = l.trim();
        if (line.includes('THREE ADDRESS CODE')) { section = 'tac'; continue; }
        if (line.includes('TEMPORARY REGISTER')) { section = 'temp'; continue; }
        if (line.startsWith('===') || line.startsWith('---') || line.startsWith('No.') || line.startsWith('Temp')) continue;
        if (section === 'tac' && line && !line.startsWith('Total')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 3) tac.push({ no: parts[0], result: parts[1], op: parts[2], arg1: parts[3]||'', arg2: parts[4]||'--' });
        }
        if (section === 'temp' && line && !line.startsWith('Total')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 2 && parts[0].startsWith('t')) temps.push({ temp: parts[0], op: parts[1], arg1: parts[2]||'', arg2: parts[3]||'--' });
        }
    }
    const totalMatch   = stdout.match(/Total TAC instructions:\s*(\d+)/);
    const tempMatch    = stdout.match(/Temporaries generated\s*:\s*(\d+)/);
    return { tac, temps, totalTac: totalMatch ? parseInt(totalMatch[1]) : tac.length, totalTemps: tempMatch ? parseInt(tempMatch[1]) : temps.length };
}

// ── Stage 4 - Optimizer Output Parser ───────────────────────────────────────
function parseOptOutput(stdout) {
    const lines = stdout.split(/\r?\n/);
    let section = null;
    const unopt = [], opt = [], target = [];
    const report = {};
    for (const l of lines) {
        const line = l.trim();
        if (line.includes('UNOPTIMIZED THREE-ADDRESS'))  { section = 'unopt'; continue; }
        if (line.includes('OPTIMIZATION REPORT'))         { section = 'report'; continue; }
        if (line.includes('OPTIMIZED THREE-ADDRESS'))     { section = 'opt'; continue; }
        if (line.includes('TARGET CODE'))                  { section = 'target'; continue; }
        if (line.startsWith('===') || line.startsWith('---') || line.startsWith('No.')) continue;
        if ((section === 'unopt' || section === 'opt') && line && !line.startsWith('Total')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
                const row = { no: parts[0], result: parts[1], op: parts[2], arg1: parts[3]||'', arg2: parts[4]||'--' };
                if (section === 'unopt') unopt.push(row); else opt.push(row);
            }
        }
        if (section === 'report' && line.includes(':')) {
            const ci = line.indexOf(':'); report[line.substring(0,ci).trim()] = line.substring(ci+1).trim();
        }
        if (section === 'target' && line && !line.startsWith('Total') && !line.startsWith('Registers')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 2) target.push({ no: parts[0], instr: parts.slice(1).join(' ') });
        }
    }
    return {
        unopt, opt, target,
        cseEliminated:  report['Common Subexpressions Eliminated'] || '0',
        dceRemoved:     report['Dead Code Instructions Removed']   || '0',
        beforeOpt:      report['Instructions Before Optimization'] || '0',
        afterOpt:       report['Instructions After  Optimization'] || '0',
        gain:           report['Optimization Gain'] || '0.0%',
        totalTarget:    (stdout.match(/Total target instructions:\s*(\d+)/) || ['','0'])[1],
        regsUsed:       (stdout.match(/Registers used\s*:\s*(\d+)/)        || ['','0'])[1]
    };
}

// ── Run a binary with a temp file ───────────────────────────────────────────
function runBinary(binPath, sourceCode, callback) {
    if (!fs.existsSync(binPath)) {
        return callback(new Error('Binary not found: ' + binPath));
    }
    const tmp = path.join(os.tmpdir(), `hdl_${Date.now()}.hdl`);
    fs.writeFileSync(tmp, sourceCode.replace(/\r\n/g, '\n'), 'utf8');
    const t0 = Date.now();
    exec(`"${binPath}" "${tmp}"`, { timeout: 8000 }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmp); } catch(_) {}
        const ms = Date.now() - t0;
        if (err && !stdout) return callback(new Error(stderr || err.message));
        callback(null, { stdout: stdout || '', stderr: stderr || '', ms });
    });
}

// ── Run full pipeline ────────────────────────────────────────────────────────
function runPipeline(sourceCode, callback) {
    const lexerBin  = bin('hdl_lexer');
    const parserBin = stageBin('hdl_parser');
    const icgBin    = stageBin('hdl_icg');
    const optBin    = stageBin('hdl_opt');

    const result = { success: true, stages: {} };

    // Stage 1: Lexer
    runBinary(lexerBin, sourceCode, (err1, r1) => {
        if (err1) {
            result.stages.lexer = { error: err1.message };
        } else {
            const parsed = parseLexerOutput(r1.stdout, sourceCode);
            result.stages.lexer = { ...parsed, rawOutput: r1.stdout, ms: r1.ms, status: 'PASS' };
        }

        // Stage 2: Parser
        runBinary(parserBin, sourceCode, (err2, r2) => {
            if (err2) {
                result.stages.parser = { error: err2.message };
            } else {
                result.stages.parser = { ...parseParserOutput(r2.stdout), rawOutput: r2.stdout, ms: r2.ms };
            }

            // Stage 3: ICG
            runBinary(icgBin, sourceCode, (err3, r3) => {
                if (err3) {
                    result.stages.icg = { error: err3.message };
                } else {
                    result.stages.icg = { ...parseICGOutput(r3.stdout), rawOutput: r3.stdout, ms: r3.ms };
                }

                // Stage 4: Optimizer + Target Code
                runBinary(optBin, sourceCode, (err4, r4) => {
                    if (err4) {
                        result.stages.opt = { error: err4.message };
                    } else {
                        result.stages.opt = { ...parseOptOutput(r4.stdout), rawOutput: r4.stdout, ms: r4.ms };
                    }

                    result.totalMs = (result.stages.lexer?.ms||0) + (result.stages.parser?.ms||0) +
                                     (result.stages.icg?.ms||0)   + (result.stages.opt?.ms||0);
                    callback(null, result);
                });
            });
        });
    });
}

// ── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // Status
    if (req.method === 'GET' && req.url === '/api/status') {
        const bins = {
            lexer:  fs.existsSync(bin('hdl_lexer')),
            parser: fs.existsSync(stageBin('hdl_parser')),
            icg:    fs.existsSync(stageBin('hdl_icg')),
            opt:    fs.existsSync(stageBin('hdl_opt'))
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'online', binaries: bins, node: process.version }));
        return;
    }

    // Sample files
    if (req.method === 'GET' && req.url.startsWith('/api/sample')) {
        const name = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('name') || 'sample1';
        const samples = {
            sample1: `input a, b;\noutput y;\nwire w1;\nreg clk;\n\nw1 = a and b;\ny = w1 or clk;\n`,
            sample2: `input x, y, z;\noutput out1, out2;\nwire w1, w2;\nreg state;\n\nw1 = x and y;\nw2 = w1 or z;\nout1 = w2 and not state;\nout2 = state or w1;\n`,
            adder:   `input a, b, cin;\noutput sum, cout;\nwire s1, c1, c2;\n\ns1 = a or b;\nc1 = a and b;\nsum = s1 or cin;\nc2 = s1 and cin;\ncout = c1 or c2;\n`,
            cse:     `input a, b, c;\noutput out1, out2, out3;\nwire w1, w2, w3;\n\nw1 = a and b;\nw2 = a and b;\nw3 = w1 or c;\nout1 = w2 or c;\nout2 = w3;\nout3 = a and b;\n`
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: samples[name] || samples.sample1 }));
        return;
    }

    // POST /api/compile - full pipeline
    if (req.method === 'POST' && req.url === '/api/compile') {
        let body = '';
        req.on('data', c => { body += c.toString(); });
        req.on('end', () => {
            try {
                const { code } = JSON.parse(body || '{}');
                if (!code || !code.trim()) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Empty code.' })); return;
                }
                runPipeline(code, (err, result) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message })); return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Bad JSON: ' + e.message }));
            }
        });
        return;
    }

    // Serve static files
    let p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const fp = path.join(BASE_DIR, p);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        const ct = {'.html':'text/html;charset=utf-8','.css':'text/css','.js':'application/javascript','.json':'application/json'};
        res.writeHead(200, { 'Content-Type': ct[path.extname(fp)] || 'text/plain' });
        fs.createReadStream(fp).pipe(res);
        return;
    }
    res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
    console.log('===========================================================');
    console.log('  HDL Compiler Studio - Full Pipeline Server (Reviews 1-4)');
    console.log('===========================================================');
    console.log(`  URL:    http://localhost:${PORT}`);
    console.log(`  Lexer:  ${fs.existsSync(bin('hdl_lexer'))  ? 'OK' : 'MISSING'} -> hdl_lexer.exe`);
    console.log(`  Parser: ${fs.existsSync(stageBin('hdl_parser')) ? 'OK' : 'MISSING'} -> c_stages/hdl_parser.exe`);
    console.log(`  ICG:    ${fs.existsSync(stageBin('hdl_icg'))    ? 'OK' : 'MISSING'} -> c_stages/hdl_icg.exe`);
    console.log(`  Opt:    ${fs.existsSync(stageBin('hdl_opt'))    ? 'OK' : 'MISSING'} -> c_stages/hdl_opt.exe`);
    console.log('===========================================================');
});
