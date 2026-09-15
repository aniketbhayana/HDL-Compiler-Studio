/* ============================================================
   hdl_lexer.l
   Lexical Analyzer for a Mini Hardware Description Language (HDL)
   Compiler Design Lab - Review 1

   Recognizes:
     Keywords    : input, output, wire, reg
     Gate Ops    : and, or, not
     Identifiers : signal / wire / register names
     Numbers     : bit-widths / constants
     Operators   : = ; , ( )

   Also builds a Symbol Table that records every declared
   signal/register along with its category (input/output/wire/reg).
   ============================================================ */

%{
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define MAX_SYM 100

typedef struct {
    char name[64];
    char category[16];   /* input / output / wire / reg */
} Symbol;

Symbol symtab[MAX_SYM];
int symcount = 0;

char current_category[16] = "";
int in_declaration = 0;   /* set to 1 right after input/output/wire/reg,
                              reset to 0 at the next ';' */

int lookup(const char *name) {
    for (int i = 0; i < symcount; i++)
        if (strcmp(symtab[i].name, name) == 0) return i;
    return -1;
}

void add_symbol(const char *name, const char *category) {
    if (symcount >= MAX_SYM) return;
    if (lookup(name) == -1) {
        strncpy(symtab[symcount].name, name, sizeof(symtab[symcount].name) - 1);
        strncpy(symtab[symcount].category, category, sizeof(symtab[symcount].category) - 1);
        symcount++;
    }
}
%}

%%

"input"   { in_declaration = 1; strcpy(current_category, "input");  printf("%-14s: %s\n", "KEYWORD", yytext); }
"output"  { in_declaration = 1; strcpy(current_category, "output"); printf("%-14s: %s\n", "KEYWORD", yytext); }
"wire"    { in_declaration = 1; strcpy(current_category, "wire");   printf("%-14s: %s\n", "KEYWORD", yytext); }
"reg"     { in_declaration = 1; strcpy(current_category, "reg");    printf("%-14s: %s\n", "KEYWORD", yytext); }

"and"|"or"|"not"        { printf("%-14s: %s\n", "GATE_OP", yytext); }

[a-zA-Z_][a-zA-Z0-9_]*  {
    printf("%-14s: %s\n", "IDENTIFIER", yytext);
    if (in_declaration) {
        add_symbol(yytext, current_category);
    }
}

[0-9]+   { printf("%-14s: %s\n", "NUMBER", yytext); }

";"      { printf("%-14s: ;\n", "PUNCT");    in_declaration = 0; }
","      { printf("%-14s: ,\n", "PUNCT");    }
"="      { printf("%-14s: =\n", "OPERATOR"); }
"("      { printf("%-14s: (\n", "PUNCT");    }
")"      { printf("%-14s: )\n", "PUNCT");    }

[ \t]+   { /* skip whitespace */ }
\n       { /* skip newline */ }
.        { printf("%-14s: %s\n", "UNKNOWN", yytext); }

%%

int yywrap() { return 1; }

int main(int argc, char **argv) {
    if (argc > 1) {
        FILE *f = fopen(argv[1], "r");
        if (!f) {
            printf("Error: cannot open input file %s\n", argv[1]);
            return 1;
        }
        yyin = f;
    }

    printf("=========================================\n");
    printf(" TOKEN STREAM\n");
    printf("=========================================\n");

    yylex();

    printf("\n=========================================\n");
    printf(" SYMBOL TABLE\n");
    printf("=========================================\n");
    printf("%-16s %-10s\n", "Name", "Category");
    printf("-----------------------------------------\n");
    for (int i = 0; i < symcount; i++) {
        printf("%-16s %-10s\n", symtab[i].name, symtab[i].category);
    }
    printf("-----------------------------------------\n");
    printf("Total symbols declared: %d\n", symcount);

    return 0;
}
