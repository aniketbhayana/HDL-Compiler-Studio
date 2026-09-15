// =============================================================================
//  HDL Compiler Studio - Backend Bridge Server
//  Compiler Design Lab - Review 1 (Phase 1: Lexical Analysis)
//
//  Zero-dependency HTTP server: uses only native Node.js core modules.
//  Bridges web UI requests to the compiled C lexer binary (hdl_lexer.exe).
// =============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;

// Detect C binary path
function getLexerBinaryPath() {
    const exeName = process.platform === 'win32' ? 'hdl_lexer.exe' : 'hdl_lexer';
    
    // Check local directory first
    const localPath = path.join(BASE_DIR, exeName);
    if (fs.existsSync(localPath)) return localPath;

    // Check Downloads directory where user had it
    const downloadsPath = path.join(
        'C:', 'Users', 'Aniket Bhayana', 'Downloads',
        'HDL_Lexer_Review1', 'HDL_Lexer_Review1', exeName
    );
    if (fs.existsSync(downloadsPath)) return downloadsPath;

    return localPath;
}

// Category mappings for tokens
function getCategoryForType(type) {
    switch (type) {
        case 'KEYWORD':    return 'Declaration Keyword';
        case 'GATE_OP':    return 'Logic Gate Operator';
        case 'IDENTIFIER': return 'Signal / Register Identifier';
        case 'NUMBER':     return 'Numeric Constant / Bit-Width';
        case 'OPERATOR':   return 'Assignment Operator';
        case 'PUNCT':      return 'Delimiter / Punctuation';
        case 'UNKNOWN':    return 'Unrecognized / Error';
        default:           return 'Token';
    }
}

// Parse stdout from hdl_lexer
function parseCLexerStdout(stdout, sourceCode) {
    const lines = stdout.split(/\r?\n/);
    const tokens = [];
    const symbols = [];
    let section = null;
    let tokenIndex = 1;

    // Track line numbers in original source code
    const sourceLines = sourceCode.split(/\r?\n/);
    let curLine = 1;
    let curCol = 0;

    for (let rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.includes('TOKEN STREAM')) {
            section = 'tokens';
            continue;
        }
        if (line.includes('SYMBOL TABLE')) {
            section = 'symbols';
            continue;
        }
        if (line.startsWith('===') || line.startsWith('---') || 
            line.startsWith('Name') || line.startsWith('Total symbols')) {
            continue;
        }

        if (section === 'tokens' && line.includes(':')) {
            const colonIdx = line.indexOf(':');
            const tokenType = line.substring(0, colonIdx).trim();
            const lexeme = line.substring(colonIdx + 1).trim();

            if (tokenType && lexeme) {
                // Determine approximate line number in source
                let foundLine = curLine;
                for (let l = curLine - 1; l < sourceLines.length; l++) {
                    const idx = sourceLines[l].indexOf(lexeme, (l === curLine - 1 ? curCol : 0));
                    if (idx !== -1) {
                        foundLine = l + 1;
                        curLine = foundLine;
                        curCol = idx + lexeme.length;
                        break;
                    }
                }

                tokens.push({
                    id: tokenIndex++,
                    type: tokenType,
                    lexeme: lexeme,
                    category: getCategoryForType(tokenType),
                    line: foundLine
                });
            }
        } else if (section === 'symbols' && line) {
            const parts = line.split(/\s+/);
            if (parts.length >= 2) {
                symbols.push({
                    name: parts[0],
                    category: parts[1],
                    scope: 'Module / Global',
                    status: 'Declared'
                });
            }
        }
    }

    return { tokens, symbols };
}

// Execute C Lexer
function runCLexer(sourceCode, callback) {
    const binPath = getLexerBinaryPath();
    const startTime = Date.now();

    if (!fs.existsSync(binPath)) {
        // Try compiling if lex.yy.c exists
        const lexYyPath = path.join(BASE_DIR, 'lex.yy.c');
        const fallbackSrc = fs.existsSync(lexYyPath) ? lexYyPath : 
            path.join('C:', 'Users', 'Aniket Bhayana', 'Downloads', 'HDL_Lexer_Review1', 'HDL_Lexer_Review1', 'lex.yy.c');

        if (fs.existsSync(fallbackSrc)) {
            console.log('[Server] hdl_lexer.exe not found, auto-compiling from lex.yy.c with gcc...');
            exec(`gcc "${fallbackSrc}" -o "${binPath}"`, (compileErr) => {
                if (compileErr) {
                    return callback(new Error(`Failed to compile C lexer with gcc: ${compileErr.message}`));
                }
                proceedWithExecution();
            });
            return;
        } else {
            return callback(new Error(`C lexer binary not found at ${binPath}. Please compile lex.yy.c first.`));
        }
    }

    proceedWithExecution();

    function proceedWithExecution() {
        const tmpFile = path.join(os.tmpdir(), `hdl_code_${Date.now()}.hdl`);
        fs.writeFileSync(tmpFile, sourceCode, 'utf8');

        exec(`"${binPath}" "${tmpFile}"`, { timeout: 8000 }, (err, stdout, stderr) => {
            const durationMs = Date.now() - startTime;
            try { fs.unlinkSync(tmpFile); } catch (_) {}

            if (err && !stdout) {
                return callback(new Error(stderr || err.message));
            }

            const parsed = parseCLexerStdout(stdout, sourceCode);
            callback(null, {
                success: true,
                tokens: parsed.tokens,
                symbols: parsed.symbols,
                rawStdout: stdout,
                rawStderr: stderr || '',
                binaryPath: binPath,
                executionTimeMs: durationMs,
                engine: 'C Lexer Binary (lex.yy.c / hdl_lexer.exe)'
            });
        });
    }
}

// Request Handler
const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health / Status check
    if (req.method === 'GET' && req.url === '/api/status') {
        const binPath = getLexerBinaryPath();
        const exists = fs.existsSync(binPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            c_binary_found: exists,
            binary_path: binPath,
            os: process.platform,
            node_version: process.version
        }));
        return;
    }

    // Sample HDL files
    if (req.method === 'GET' && req.url.startsWith('/api/sample')) {
        const urlParams = new URL(req.url, `http://localhost:${PORT}`);
        const name = urlParams.searchParams.get('name') || 'sample1';
        let code = '';
        if (name === 'sample1') {
            code = `input a, b;\noutput y;\nwire w1;\nreg clk;\n\nw1 = a and b;\ny = w1 or clk;\n`;
        } else if (name === 'sample2') {
            code = `input clk, reset, in1, in2, in3;\noutput reg out1;\noutput wire carry_out;\nwire w1, w2, w3;\n\nw1 = in1 and in2;\nw2 = not in3;\nw3 = w1 or w2;\nout1 = w3 and reset;\ncarry_out = w1 and w3;\n`;
        } else if (name === 'adder') {
            code = `input a, b, cin;\noutput sum, cout;\nwire s1, c1, c2;\n\ns1 = a or b;\nc1 = a and b;\nsum = s1 or cin;\nc2 = s1 and cin;\ncout = c1 or c2;\n`;
        } else {
            code = `input a, b;\noutput y;\nwire w1;\n\nw1 = a and b;\ny = not w1;\n`;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code }));
        return;
    }

    // POST /api/lex
    if (req.method === 'POST' && (req.url === '/api/lex' || req.url === '/lex')) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');
                const sourceCode = payload.code || '';
                if (!sourceCode.trim()) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Source code cannot be empty.' }));
                    return;
                }

                runCLexer(sourceCode, (err, result) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            error: 'Lexer execution error: ' + err.message,
                            engine: 'C Lexer Binary'
                        }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                });
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body: ' + err.message }));
            }
        });
        return;
    }

    // Serve static files
    let reqPath = req.url === '/' ? '/index.html' : req.url;
    reqPath = reqPath.split('?')[0]; // strip query string
    const filePath = path.join(BASE_DIR, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
            '.html': 'text/html; charset=utf-8',
            '.css':  'text/css; charset=utf-8',
            '.js':   'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png':  'image/png',
            '.ico':  'image/x-icon'
        };
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(PORT, () => {
    const binPath = getLexerBinaryPath();
    console.log('===========================================================');
    console.log('  HDL Compiler Studio - Web Bridge Server');
    console.log('  Phase 1: Lexical Analysis (C / Flex Engine)');
    console.log('===========================================================');
    console.log(`  Local URL:        http://localhost:${PORT}`);
    console.log(`  C Lexer Binary:   ${fs.existsSync(binPath) ? 'FOUND [OK]' : 'MISSING [Auto-compile ready]'}`);
    console.log(`  Binary Location:  ${binPath}`);
    console.log('===========================================================');
    console.log('  Press Ctrl+C to stop.');
});
