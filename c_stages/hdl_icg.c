/* ================================================================
   hdl_icg.c
   Compiler Design Lab - Review 3: Intermediate Code Generation
   
   Generates Three-Address Code (TAC) for Mini-HDL.
   TAC format:
       t1 = a AND b
       t2 = t1 OR c
       y  = t2
   
   Also prints a DAG (represented as text) showing operand reuse.
   Input:  HDL source file
   Output: TAC instructions + temp register table
================================================================ */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* ---- Token types ---- */
typedef enum {
    TOK_KEYWORD, TOK_IDENT, TOK_NUMBER,
    TOK_AND, TOK_OR, TOK_NOT,
    TOK_EQ, TOK_SEMI, TOK_COMMA, TOK_LPAREN, TOK_RPAREN,
    TOK_EOF, TOK_UNKNOWN
} TokType;

typedef struct {
    TokType type;
    char    lexeme[64];
    int     line;
} Token;

static char src[65536];
static int  pos = 0, lineno = 1;
static Token cur;

static void skip_ws() {
    while (src[pos]) {
        if (src[pos]=='\n'){lineno++;pos++;}
        else if(isspace((unsigned char)src[pos]))pos++;
        else break;
    }
}

static Token next_tok() {
    Token t; t.line=lineno; t.lexeme[0]='\0';
    skip_ws();
    if (!src[pos]) { t.type=TOK_EOF; strcpy(t.lexeme,"<EOF>"); return t; }
    if (isdigit((unsigned char)src[pos])) {
        int i=0; while(isdigit((unsigned char)src[pos]))t.lexeme[i++]=src[pos++];
        t.lexeme[i]='\0'; t.type=TOK_NUMBER; return t;
    }
    if (isalpha((unsigned char)src[pos])||src[pos]=='_') {
        int i=0;
        while(isalnum((unsigned char)src[pos])||src[pos]=='_')t.lexeme[i++]=src[pos++];
        t.lexeme[i]='\0';
        if(!strcmp(t.lexeme,"input")||!strcmp(t.lexeme,"output")||
           !strcmp(t.lexeme,"wire") ||!strcmp(t.lexeme,"reg"))t.type=TOK_KEYWORD;
        else if(!strcmp(t.lexeme,"and"))t.type=TOK_AND;
        else if(!strcmp(t.lexeme,"or")) t.type=TOK_OR;
        else if(!strcmp(t.lexeme,"not"))t.type=TOK_NOT;
        else                            t.type=TOK_IDENT;
        return t;
    }
    t.lexeme[0]=src[pos]; t.lexeme[1]='\0';
    switch(src[pos++]){
        case '=': t.type=TOK_EQ;     break;
        case ';': t.type=TOK_SEMI;   break;
        case ',': t.type=TOK_COMMA;  break;
        case '(': t.type=TOK_LPAREN; break;
        case ')': t.type=TOK_RPAREN; break;
        default:  t.type=TOK_UNKNOWN;break;
    }
    return t;
}

static void advance() { cur = next_tok(); }

/* ---- TAC generator ---- */
static int  temp_count = 0;
static int  tac_count  = 0;

typedef struct {
    char result[64];
    char op[8];
    char arg1[64];
    char arg2[64];
} TACInstr;

static TACInstr tac[512];

static void emit(const char *res, const char *op, const char *a1, const char *a2) {
    strncpy(tac[tac_count].result, res, 63);
    strncpy(tac[tac_count].op,     op,  7);
    strncpy(tac[tac_count].arg1,   a1,  63);
    strncpy(tac[tac_count].arg2,   a2,  63);
    tac_count++;
}

static char temp_name[64];
static char* new_temp() {
    snprintf(temp_name, sizeof(temp_name), "t%d", ++temp_count);
    return temp_name;
}

/* Forward decls */
static void gen_expr(char *out);
static void gen_term(char *out);

static void gen_term(char *out) {
    if (cur.type == TOK_NOT) {
        advance();
        char sub[64]; gen_term(sub);
        char *t = new_temp(); strcpy(out, t);
        emit(out, "NOT", sub, "");
    } else if (cur.type == TOK_IDENT || cur.type == TOK_NUMBER) {
        strcpy(out, cur.lexeme);
        advance();
    } else if (cur.type == TOK_LPAREN) {
        advance();
        gen_expr(out);
        if (cur.type == TOK_RPAREN) advance();
    } else {
        strcpy(out, "?");
        advance();
    }
}

static void gen_expr(char *out) {
    char left[64];
    gen_term(left);
    while (cur.type == TOK_AND || cur.type == TOK_OR) {
        char op_str[8];
        strcpy(op_str, (cur.type==TOK_AND)?"AND":"OR");
        advance();
        char right[64]; gen_term(right);
        char *t = new_temp(); strcpy(out, t);
        emit(out, op_str, left, right);
        strcpy(left, out);
    }
    strcpy(out, left);
}

static void gen_decl() { advance(); /* skip keyword */
    while (cur.type == TOK_IDENT || cur.type == TOK_COMMA) {
        advance();
    }
    if (cur.type == TOK_SEMI) advance();
}

static void gen_assign() {
    char lhs[64]; strcpy(lhs, cur.lexeme); advance(); /* ident */
    if (cur.type == TOK_EQ) advance();
    char rhs[64]; gen_expr(rhs);
    /* If rhs is already in a temp, just copy assign; else direct */
    if (rhs[0]=='t' && rhs[1]>='0' && rhs[1]<='9') {
        /* rename last tac result to lhs */
        if (tac_count>0) strcpy(tac[tac_count-1].result, lhs);
        /* update temp_name too */
        strcpy(rhs, lhs);
    } else {
        emit(lhs, "=", rhs, "");
    }
    if (cur.type == TOK_SEMI) advance();
}

int main(int argc, char **argv) {
    if (argc<2){fprintf(stderr,"Usage: hdl_icg <file.hdl>\n");return 1;}
    FILE *f=fopen(argv[1],"rb");
    if (!f){fprintf(stderr,"Cannot open %s\n",argv[1]);return 1;}
    int n=0; int c;
    while((c=fgetc(f))!=EOF && n<(int)sizeof(src)-1){ if(c!='\r') src[n++]=(char)c; }
    src[n]=0; fclose(f);

    advance();
    while (cur.type != TOK_EOF) {
        if (cur.type == TOK_KEYWORD) gen_decl();
        else if (cur.type == TOK_IDENT) gen_assign();
        else advance();
    }

    /* ---- Print TAC ---- */
    printf("=========================================\n");
    printf(" INTERMEDIATE CODE - THREE ADDRESS CODE\n");
    printf("=========================================\n");
    printf("%-6s %-16s %-8s %-14s %s\n","No.","Result","Op","Arg1","Arg2");
    printf("-----------------------------------------\n");
    for (int i=0;i<tac_count;i++) {
        printf("%-6d %-16s %-8s %-14s %s\n",
            i+1,
            tac[i].result,
            tac[i].op,
            tac[i].arg1,
            tac[i].arg2[0]?tac[i].arg2:"--");
    }
    printf("-----------------------------------------\n");
    printf("Total TAC instructions: %d\n", tac_count);
    printf("Temporaries generated : %d\n", temp_count);

    /* ---- Temp register table ---- */
    printf("\n=========================================\n");
    printf(" TEMPORARY REGISTER TABLE\n");
    printf("=========================================\n");
    printf("%-10s %-8s %-14s %s\n","Temp","Op","Left Operand","Right Operand");
    printf("-----------------------------------------\n");
    for (int i=0;i<tac_count;i++) {
        if (tac[i].result[0]=='t') {
            printf("%-10s %-8s %-14s %s\n",
                tac[i].result, tac[i].op,
                tac[i].arg1,
                tac[i].arg2[0]?tac[i].arg2:"--");
        }
    }
    printf("-----------------------------------------\n");
    return 0;
}

