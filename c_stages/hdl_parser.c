#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>

typedef enum {
    TOK_DECL, TOK_AND, TOK_OR, TOK_NOT,
    TOK_IDENT, TOK_NUMBER,
    TOK_EQ, TOK_SEMI, TOK_COMMA, TOK_LPAREN, TOK_RPAREN,
    TOK_EOF, TOK_UNKNOWN
} TokType;

typedef struct { TokType type; char lex[64]; int line; } Tok;

static char src[65536];
static int  pos=0, lineno=1;
static Tok  cur;
static int  depth=0, errors=0;

static int is_ws(char c){ return c==' '||c=='\t'||c=='\n'||c=='\r'; }
static void skip_ws(){
    while(src[pos]){
        if(src[pos]=='\n') lineno++;
        if(is_ws(src[pos])) pos++;
        else break;
    }
}
static Tok lex(){
    Tok t; t.line=lineno; t.lex[0]=0;
    skip_ws();
    if(!src[pos]){t.type=TOK_EOF;strcpy(t.lex,"<EOF>");return t;}
    if(isdigit((unsigned char)src[pos])){
        int i=0; while(isdigit((unsigned char)src[pos]))t.lex[i++]=src[pos++]; t.lex[i]=0;
        t.type=TOK_NUMBER; return t;
    }
    if(isalpha((unsigned char)src[pos])||src[pos]=='_'){
        int i=0;
        while(isalnum((unsigned char)src[pos])||src[pos]=='_')t.lex[i++]=src[pos++]; t.lex[i]=0;
        if(!strcmp(t.lex,"input")||!strcmp(t.lex,"output")||
           !strcmp(t.lex,"wire") ||!strcmp(t.lex,"reg"))   t.type=TOK_DECL;
        else if(!strcmp(t.lex,"and")) t.type=TOK_AND;
        else if(!strcmp(t.lex,"or"))  t.type=TOK_OR;
        else if(!strcmp(t.lex,"not")) t.type=TOK_NOT;
        else                           t.type=TOK_IDENT;
        return t;
    }
    t.lex[0]=src[pos]; t.lex[1]=0;
    switch(src[pos++]){
        case'=':t.type=TOK_EQ;break;   case';':t.type=TOK_SEMI;break;
        case',':t.type=TOK_COMMA;break; case'(':t.type=TOK_LPAREN;break;
        case')':t.type=TOK_RPAREN;break; default:t.type=TOK_UNKNOWN;break;
    }
    return t;
}
static void adv(){cur=lex();}

static void pr(const char *fmt,...){
    for(int i=0;i<depth*2;i++)putchar(' ');
    va_list ap;va_start(ap,fmt);vprintf(fmt,ap);va_end(ap);putchar('\n');
}
static void err(const char *msg){
    printf("[ERROR] Line %d: %s (got '%s')\n",cur.line,msg,cur.lex);errors++;
}
static int eat(TokType t,const char *w){
    if(cur.type!=t){err(w);return 0;}adv();return 1;
}

static void pexpr();
static void pterm(){
    if(cur.type==TOK_NOT){
        pr("term [NOT]");depth++;pr("op: not");adv();pterm();depth--;
    }else if(cur.type==TOK_LPAREN){
        pr("term [(expr)]");depth++;adv();pexpr();
        if(cur.type!=TOK_RPAREN)err("expected ')'");else adv();depth--;
    }else if(cur.type==TOK_IDENT){
        pr("term [IDENT: %s]",cur.lex);adv();
    }else if(cur.type==TOK_NUMBER){
        pr("term [NUMBER: %s]",cur.lex);adv();
    }else{
        err("expected operand (ident, number, 'not', or '(expr)')");
    }
}
static void pexpr(){
    pr("expr");depth++;
    pterm();
    while(cur.type==TOK_AND||cur.type==TOK_OR){
        pr("gate_op: %s",cur.lex);adv();pterm();
    }
    depth--;
}
static void pdecl(){
    pr("decl_stmt [%s]",cur.lex);depth++;
    pr("keyword: %s",cur.lex);adv();
    pr("ident_list");depth++;
    if(cur.type!=TOK_IDENT){err("expected identifier");depth-=2;adv();return;}
    pr("ident: %s",cur.lex);adv();
    while(cur.type==TOK_COMMA){adv();
        if(cur.type!=TOK_IDENT){err("expected ident after ','");break;}
        pr("ident: %s",cur.lex);adv();
    }
    depth--;
    eat(TOK_SEMI,"expected ';'");pr(";");depth--;
}
static void passign(){
    char lhs[64];strcpy(lhs,cur.lex);
    pr("assign_stmt");depth++;
    pr("lhs: %s",lhs);adv();
    eat(TOK_EQ,"expected '='");pr("op: =");
    pexpr();
    eat(TOK_SEMI,"expected ';'");pr(";");
    depth--;
}
static void pstmt(){
    pr("statement");depth++;
    if(cur.type==TOK_DECL)       pdecl();
    else if(cur.type==TOK_IDENT) passign();
    else if(cur.type!=TOK_EOF){  err("unexpected token");adv();}
    depth--;
}

int main(int argc,char**argv){
    if(argc<2){fprintf(stderr,"Usage: hdl_parser <file>\n");return 1;}
    FILE*f=fopen(argv[1],"rb");
    if(!f){fprintf(stderr,"Cannot open %s\n",argv[1]);return 1;}
    int n=0; int c;
    while((c=fgetc(f))!=EOF && n<(int)sizeof(src)-1){
        if(c!='\r') src[n++]=(char)c;  /* strip CR */
    }
    src[n]=0; fclose(f);

    printf("=========================================\n");
    printf(" SYNTAX ANALYSIS - PARSE TREE\n");
    printf("=========================================\n");
    adv();
    pr("program");depth++;
    while(cur.type!=TOK_EOF)pstmt();
    depth--;

    printf("\n=========================================\n");
    printf(" SYNTAX ANALYSIS RESULT\n");
    printf("=========================================\n");
    if(errors==0){
        printf("STATUS  : PASS\n");
        printf("ERRORS  : 0\n");
        printf("VERDICT : Syntactically valid HDL program.\n");
    }else{
        printf("STATUS  : FAIL\n");
        printf("ERRORS  : %d\n",errors);
        printf("VERDICT : Syntax errors found. See parse tree above.\n");
    }
    return (errors>0)?1:0;
}
