/* ============================================================
   hdl_lexer_json.l
   Lexical Analyzer for Mini HDL -- JSON output edition
   Compiler Design Lab - Review 1

   Outputs a single JSON object to stdout:
   {
     "tokens":  [ { "id":1, "type":"KEYWORD", "lexeme":"input",
                    "line":1, "category":"Declaration Keyword" }, ... ],
     "symbols": [ { "name":"a", "category":"input", "type":"signal",
                    "declLine":1 }, ... ],
     "errors":  [ { "line":5, "lexeme":"@",
                    "msg":"Unknown character '@' at line 5" } ],
     "lineCount": 7
   }
   ============================================================ */

%{
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

/* ---- Symbol table ---- */
#define MAX_SYM 200

typedef struct {
    char name[64];
    char category[16];
    int  declLine;
} Symbol;

Symbol symtab[MAX_SYM];
int symcount = 0;

char current_category[16] = "";
int  in_declaration = 0;

/* ---- Token buffer ---- */
#define MAX_TOK 2000

typedef struct {
    int  id;
    char type[20];
    char lexeme[128];
    int  line;
    char category[64];
} Token;

Token tokens[MAX_TOK];
int tokcount = 0;

/* ---- Error buffer ---- */
#define MAX_ERR 200

typedef struct {
    int  line;
    char lexeme[8];
    char msg[128];
} LexError;

LexError errors[MAX_ERR];
int errcount = 0;

int linenum = 1;

/* ---- Helpers ---- */
int sym_lookup(const char *name) {
    for (int i = 0; i < symcount; i++)
        if (strcmp(symtab[i].name, name) == 0) return i;
    return -1;
}

void sym_add(const char *name, const char *cat, int ln) {
    if (symcount >= MAX_SYM) return;
    if (sym_lookup(name) == -1) {
        strncpy(symtab[symcount].name,     name, 63);
        strncpy(symtab[symcount].category, cat,  15);
        symtab[symcount].declLine = ln;
        symcount++;
    }
}

void tok_add(const char *type, const char *lexeme,
             int ln, const char *cat) {
    if (tokcount >= MAX_TOK) return;
    tokens[tokcount].id   = tokcount + 1;
    tokens[tokcount].line = ln;
    strncpy(tokens[tokcount].type,     type,   19);
    strncpy(tokens[tokcount].lexeme,   lexeme, 127);
    strncpy(tokens[tokcount].category, cat,    63);
    tokcount++;
}

/* Escape a string for JSON */
void json_str(const char *s) {
    while (*s) {
        switch (*s) {
            case '"':  printf("\\\""); break;
            case '\\': printf("\\\\"); break;
            case '\n': printf("\\n");  break;
            case '\r': printf("\\r");  break;
            case '\t': printf("\\t");  break;
            default:   putchar(*s);
        }
        s++;
    }
}
%}

%%

"input"  {
    in_declaration = 1;
    strcpy(current_category, "input");
    tok_add("KEYWORD", yytext, linenum, "Declaration Keyword");
}

"output" {
    in_declaration = 1;
    strcpy(current_category, "output");
    tok_add("KEYWORD", yytext, linenum, "Declaration Keyword");
}

"wire"   {
    in_declaration = 1;
    strcpy(current_category, "wire");
    tok_add("KEYWORD", yytext, linenum, "Declaration Keyword");
}

"reg"    {
    in_declaration = 1;
    strcpy(current_category, "reg");
    tok_add("KEYWORD", yytext, linenum, "Declaration Keyword");
}

"and"|"or"|"not" {
    tok_add("KEYWORD", yytext, linenum, "Logic Gate Operator");
}

[a-zA-Z_][a-zA-Z0-9_]* {
    tok_add("IDENTIFIER", yytext, linenum, "User-Defined Identifier");
    if (in_declaration) {
        sym_add(yytext, current_category, linenum);
    }
}

[0-9]+ {
    tok_add("NUMBER", yytext, linenum, "Numeric Literal");
}

";" {
    tok_add("PUNCTUATION", ";", linenum, "Statement Terminator");
    in_declaration = 0;
}

"," { tok_add("PUNCTUATION", ",", linenum, "List Separator"); }
"=" { tok_add("OPERATOR",    "=", linenum, "Assignment Operator"); }
"(" { tok_add("PUNCTUATION", "(", linenum, "Open Parenthesis"); }
")" { tok_add("PUNCTUATION", ")", linenum, "Close Parenthesis"); }

"//"[^\n]* {
    tok_add("COMMENT", yytext, linenum, "Line Comment");
}

[ \t]+  { /* skip whitespace */ }

\n      { linenum++; }

. {
    if (errcount < MAX_ERR) {
        errors[errcount].line = linenum;
        strncpy(errors[errcount].lexeme, yytext, 7);
        snprintf(errors[errcount].msg, 127,
                 "Unknown character '%s' at line %d", yytext, linenum);
        errcount++;
    }
    tok_add("UNKNOWN", yytext, linenum, "Lexical Error");
}

%%

int yywrap() { return 1; }

int main(int argc, char **argv) {
    if (argc > 1) {
        FILE *f = fopen(argv[1], "r");
        if (!f) {
            printf("{\"error\":\"Cannot open file: %s\"}\n", argv[1]);
            return 1;
        }
        yyin = f;
    }

    yylex();

    /* ---- Emit JSON ---- */
    printf("{");

    /* tokens array */
    printf("\"tokens\":[");
    for (int i = 0; i < tokcount; i++) {
        if (i > 0) printf(",");
        printf("{\"id\":%d,\"type\":\"", tokens[i].id);
        json_str(tokens[i].type);
        printf("\",\"lexeme\":\"");
        json_str(tokens[i].lexeme);
        printf("\",\"line\":%d,\"category\":\"", tokens[i].line);
        json_str(tokens[i].category);
        printf("\"}");
    }
    printf("],");

    /* symbols array */
    printf("\"symbols\":[");
    for (int i = 0; i < symcount; i++) {
        if (i > 0) printf(",");
        const char *typeStr =
            strcmp(symtab[i].category, "reg")    == 0 ? "register" :
            strcmp(symtab[i].category, "wire")   == 0 ? "wire"     : "signal";

        printf("{\"name\":\"");
        json_str(symtab[i].name);
        printf("\",\"category\":\"");
        json_str(symtab[i].category);
        printf("\",\"type\":\"%s\",\"declLine\":%d}",
               typeStr, symtab[i].declLine);
    }
    printf("],");

    /* errors array */
    printf("\"errors\":[");
    for (int i = 0; i < errcount; i++) {
        if (i > 0) printf(",");
        printf("{\"line\":%d,\"lexeme\":\"", errors[i].line);
        json_str(errors[i].lexeme);
        printf("\",\"msg\":\"");
        json_str(errors[i].msg);
        printf("\"}");
    }
    printf("],");

    printf("\"lineCount\":%d}", linenum);
    return 0;
}
