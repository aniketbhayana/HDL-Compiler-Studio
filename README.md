# HDL Compiler Studio — Compiler Design Lab (Complete Pipeline)

A complete 4-stage compiler pipeline for a custom **Hardware Description Language (HDL)** that compiles digital circuit representations through all core compiler phases: **Lexical Analysis (Review 1)**, **Syntax Analysis (Review 2)**, **Intermediate Code Generation (Review 3)**, and **Code Optimization & Target Code Generation (Review 4)**.

All compiler stages are written in **C / Flex** and visualized in a modern, academic web studio.

---

## 🏗️ Compiler Architecture & Pipeline

```
HDL Source (.hdl)
       │
       ▼
[Review 1: Lexical Analysis] (Flex / C)
  ├── Token Table (Lexemes, Types, Lines)
  └── Symbol Table (Ports, Wires, Registers)
       │
       ▼
[Review 2: Syntax Analysis] (C Recursive Descent Parser)
  ├── Grammar Rule Verification
  └── Formatted Parse Tree Generation
       │
       ▼
[Review 3: Intermediate Code Generation] (C TAC Generator)
  ├── Three-Address Code (TAC) Quadruples
  └── Temporary Register Tracking
       │
       ▼
[Review 4: Optimization & Code Generation] (C RTL Generator)
  ├── Common Subexpression Elimination (CSE)
  ├── Dead Code Elimination (DCE)
  ├── Optimization Metrics & Comparison
  └── Target Machine Code (Register-Transfer Level - RTL)
```

---

## 📁 Repository Structure

| Path | Stage | Description |
|---|---|---|
| `hdl_lexer.l` | Stage 1 | Flex lexical specification and symbol table manager |
| `hdl_lexer.exe` | Stage 1 | Compiled Windows binary for Lexical Analysis |
| `c_stages/hdl_parser.c` | Stage 2 | Recursive descent syntax analyzer and parse tree printer |
| `c_stages/hdl_parser.exe` | Stage 2 | Compiled binary for Syntax Analysis |
| `c_stages/hdl_icg.c` | Stage 3 | Three-Address Code (TAC) intermediate representation generator |
| `c_stages/hdl_icg.exe` | Stage 3 | Compiled binary for Intermediate Code Generation |
| `c_stages/hdl_opt.c` | Stage 4 | DAG/table-based CSE optimizer, dead code remover & RTL generator |
| `c_stages/hdl_opt.exe` | Stage 4 | Compiled binary for Stage 4 Optimization & Target Code |
| `server.js` | Backend | Lightweight Node.js server bridging web frontend to native C binaries |
| `index.html` | Frontend | Academic split-screen web interface with 4-stage pipeline stepper |
| `app.js` | Client | Live interaction, filtering, API caller, and client-side simulator |
| `sample_input.hdl` | Test Case | Baseline circuit (inputs, outputs, wires, and/or gates) |
| `test_input2.hdl` | Test Case | Circuit with NOT gate, registers, and multiple outputs |
| `cse_demo.hdl` | Test Case | Circuit demonstrating 50% Common Subexpression Elimination gain |

---

## ⚡ Quick Start

### 1. Run the Full Web Studio (Recommended)

Start the Node.js backend server:
```bash
node server.js
```
Open your browser at:
```
http://localhost:3000
```
This runs the full web interface connected directly to the native C binaries compiled on your machine.

*(Note: You can also open `index.html` directly in any web browser without Node.js; the interface includes a full client-side compiler engine as a fallback.)*

---

### 2. Run the C Binaries Directly via Command Line

Each compiler stage can be executed independently directly on any `.hdl` file:

#### Stage 1: Lexical Analysis
```bash
./hdl_lexer.exe sample_input.hdl
```

#### Stage 2: Syntax Analysis
```bash
./c_stages/hdl_parser.exe sample_input.hdl
```

#### Stage 3: Intermediate Code Generation (TAC)
```bash
./c_stages/hdl_icg.exe sample_input.hdl
```

#### Stage 4: Optimization & RTL Target Code
```bash
./c_stages/hdl_opt.exe cse_demo.hdl
```

---

## 🛠️ Recompiling C Stages from Source

If you modify any of the C stage sources, you can recompile using GCC:

```bash
# Recompile Stage 1 (Lexer)
flex hdl_lexer.l
gcc lex.yy.c -o hdl_lexer.exe

# Recompile Stage 2 (Parser)
gcc c_stages/hdl_parser.c -o c_stages/hdl_parser.exe

# Recompile Stage 3 (ICG)
gcc c_stages/hdl_icg.c -o c_stages/hdl_icg.exe

# Recompile Stage 4 (Optimizer & Target Code)
gcc c_stages/hdl_opt.c -o c_stages/hdl_opt.exe
```

---

## 🧪 Language Grammar (Mini-HDL)

```ebnf
program     ::= { statement }
statement   ::= decl_stmt | assign_stmt
decl_stmt   ::= ("input" | "output" | "wire" | "reg") ident { "," ident } ";"
assign_stmt ::= ident "=" expr ";"
expr        ::= term { ("and" | "or" | "xor") term }
term        ::= "not" term | "(" expr ")" | ident | number
```

---

## 📊 Optimization Demonstration

Input circuit (`cse_demo.hdl`):
```verilog
input a, b, c;
output out1, out2, out3;
wire w1, w2, w3;

w1 = a and b;
w2 = a and b;
w3 = w1 or c;
out1 = w2 or c;
out2 = w3;
out3 = a and b;
```

**Compiler Result:**
- **Common Subexpressions Eliminated**: 3 instances of redundant `a and b` and `w1 or c`
- **Optimization Gain**: **50.0% reduction** in redundant logic evaluations
- **Target Instructions**: Automatically mapped to Register-Transfer Level (RTL) LOAD, STORE, AND, OR, MOV instructions.
