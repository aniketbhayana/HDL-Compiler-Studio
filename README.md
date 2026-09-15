# Compiler Design Lab — Review 1
## Mini Compiler for a Hardware Description Language (HDL)
### Phase Implemented: Lexical Analysis

## Files
| File | Purpose |
|---|---|
| `hdl_lexer.l` | Flex source — token rules + symbol table logic |
| `sample_input.hdl` | Sample HDL program (matches the one shown in the review) |
| `test_input2.hdl` | Second, larger test case (multiple signals, nested gates) |
| `Makefile` | Build/run automation |

## Language Recognized
```
input a, b;
output y;
wire w1;
reg clk;

w1 = a and b;
y = w1 or clk;
```

Keywords: `input`, `output`, `wire`, `reg`
Gate operators: `and`, `or`, `not`
Identifiers: signal / wire / register names
Numbers: bit-widths or constants
Punctuation/operators: `= ; , ( )`

## How to Build and Run

Requires `flex` and `gcc` (both standard on any Linux lab machine).

```bash
make              # builds the executable "hdl_lexer"
make run          # builds (if needed) and runs on sample_input.hdl
```

Or manually:
```bash
flex hdl_lexer.l
gcc lex.yy.c -o hdl_lexer -lfl
./hdl_lexer sample_input.hdl
./hdl_lexer test_input2.hdl
```

Clean build artifacts:
```bash
make clean
```

## What the Program Does
1. Reads the `.hdl` source file character by character.
2. Emits a token for every keyword, gate operator, identifier, number,
   and punctuation symbol — printed as the **Token Stream**.
3. Tracks which declaration keyword (`input`/`output`/`wire`/`reg`) is
   currently active; every identifier seen while that is active is
   inserted into the **Symbol Table** with its category.
4. At end of file, prints the complete symbol table.

## Sample Output (sample_input.hdl)
```
=========================================
 TOKEN STREAM
=========================================
KEYWORD       : input
IDENTIFIER    : a
PUNCT         : ,
IDENTIFIER    : b
PUNCT         : ;
KEYWORD       : output
IDENTIFIER    : y
PUNCT         : ;
KEYWORD       : wire
IDENTIFIER    : w1
PUNCT         : ;
KEYWORD       : reg
IDENTIFIER    : clk
PUNCT         : ;
IDENTIFIER    : w1
OPERATOR      : =
IDENTIFIER    : a
GATE_OP       : and
IDENTIFIER    : b
PUNCT         : ;
IDENTIFIER    : y
OPERATOR      : =
IDENTIFIER    : w1
GATE_OP       : or
IDENTIFIER    : clk
PUNCT         : ;

=========================================
 SYMBOL TABLE
=========================================
Name             Category
-----------------------------------------
a                input
b                input
y                output
w1               wire
clk              reg
-----------------------------------------
Total symbols declared: 5
```

## Mapping to Syllabus (Modules 1–6)
- Structure of a compiler — this program implements the first phase.
- Lexical analysis — token generation via Flex regular-expression rules.
- Symbol table — implemented as an in-memory array, populated during scanning.
- Simple lex programs — this file itself.

## Next Phases (Review 2 & 3)
- **Review 2:** YACC grammar to validate statement structure (syntax analysis).
- **Review 3:** Convert validated statements to three-address code, then to
  hardware-style instructions, and apply one optimization (common
  sub-expression or dead-code elimination).
