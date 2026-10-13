/* ================================================================
   hdl_opt.c
   Compiler Design Lab - Review 4: Optimization + Target Code Gen
   
   Optimizations performed:
     1. Dead Code Elimination  - remove assignments whose LHS is never read
     2. Common Subexpression   - detect duplicate (op,a,b) and reuse temp
     3. Constant Folding       - (future extension placeholder noted)
   
   Target Code: Simple hardware-style register-transfer instructions:
       LOAD  Ra, a
       LOAD  Rb, b
       AND   Rt1, Ra, Rb
       STORE y, Rt1
   
   Input:  HDL source file
   Output: Optimization report + Target instructions
================================================================ */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* ---- Re-use same lexer / TAC generator from hdl_icg ---- */
typedef enum {
    TOK_KEYWORD,TOK_IDENT,TOK_NUMBER,
    TOK_AND,TOK_OR,TOK_NOT,
    TOK_EQ,TOK_SEMI,TOK_COMMA,TOK_LPAREN,TOK_RPAREN,
    TOK_EOF,TOK_UNKNOWN
} TokType;

typedef struct { TokType type; char lexeme[64]; int line; } Token;
static char src[65536]; static int pos=0, lineno=1; static Token cur;

static void skip_ws(){
    while(src[pos]){if(src[pos]=='\n'){lineno++;pos++;}else if(isspace((unsigned char)src[pos]))pos++;else break;}
}
static Token next_tok(){
    Token t;t.line=lineno;t.lexeme[0]='\0';skip_ws();
    if(!src[pos]){t.type=TOK_EOF;strcpy(t.lexeme,"<EOF>");return t;}
    if(isdigit((unsigned char)src[pos])){int i=0;while(isdigit((unsigned char)src[pos]))t.lexeme[i++]=src[pos++];t.lexeme[i]='\0';t.type=TOK_NUMBER;return t;}
    if(isalpha((unsigned char)src[pos])||src[pos]=='_'){
        int i=0;while(isalnum((unsigned char)src[pos])||src[pos]=='_')t.lexeme[i++]=src[pos++];t.lexeme[i]='\0';
        if(!strcmp(t.lexeme,"input")||!strcmp(t.lexeme,"output")||!strcmp(t.lexeme,"wire")||!strcmp(t.lexeme,"reg"))t.type=TOK_KEYWORD;
        else if(!strcmp(t.lexeme,"and"))t.type=TOK_AND;
        else if(!strcmp(t.lexeme,"or"))t.type=TOK_OR;
        else if(!strcmp(t.lexeme,"not"))t.type=TOK_NOT;
        else t.type=TOK_IDENT;return t;
    }
    t.lexeme[0]=src[pos];t.lexeme[1]='\0';
    switch(src[pos++]){case'=':t.type=TOK_EQ;break;case';':t.type=TOK_SEMI;break;case',':t.type=TOK_COMMA;break;case'(':t.type=TOK_LPAREN;break;case')':t.type=TOK_RPAREN;break;default:t.type=TOK_UNKNOWN;break;}
    return t;
}
static void advance(){cur=next_tok();}

/* ---- TAC ---- */
typedef struct { char result[64]; char op[8]; char arg1[64]; char arg2[64]; int dead; } TACInstr;
static TACInstr tac[512]; static int tac_count=0; static int temp_count=0;
static char temp_name[64];
static char* new_temp(){snprintf(temp_name,sizeof(temp_name),"t%d",++temp_count);return temp_name;}

static void emit(const char*res,const char*op,const char*a1,const char*a2){
    strncpy(tac[tac_count].result,res,63);strncpy(tac[tac_count].op,op,7);
    strncpy(tac[tac_count].arg1,a1,63);strncpy(tac[tac_count].arg2,a2,63);tac[tac_count].dead=0;tac_count++;
}

static void gen_term(char*out);
static void gen_expr(char*out);

static void gen_term(char*out){
    if(cur.type==TOK_NOT){advance();char sub[64];gen_term(sub);char*t=new_temp();strcpy(out,t);emit(out,"NOT",sub,"");}
    else if(cur.type==TOK_IDENT||cur.type==TOK_NUMBER){strcpy(out,cur.lexeme);advance();}
    else if(cur.type==TOK_LPAREN){advance();gen_expr(out);if(cur.type==TOK_RPAREN)advance();}
    else{strcpy(out,"?");advance();}
}
static void gen_expr(char*out){
    char left[64];gen_term(left);
    while(cur.type==TOK_AND||cur.type==TOK_OR){
        char op_str[8];strcpy(op_str,(cur.type==TOK_AND)?"AND":"OR");advance();
        char right[64];gen_term(right);
        char*t=new_temp();strcpy(out,t);emit(out,op_str,left,right);strcpy(left,out);
    }
    strcpy(out,left);
}
static void gen_decl(){advance();while(cur.type==TOK_IDENT||cur.type==TOK_COMMA)advance();if(cur.type==TOK_SEMI)advance();}
static void gen_assign(){
    char lhs[64];strcpy(lhs,cur.lexeme);advance();
    if(cur.type==TOK_EQ)advance();
    char rhs[64];gen_expr(rhs);
    if(rhs[0]=='t'&&rhs[1]>='0'&&rhs[1]<='9'){if(tac_count>0)strcpy(tac[tac_count-1].result,lhs);}
    else{emit(lhs,"=",rhs,"");}
    if(cur.type==TOK_SEMI)advance();
}

/* ---- Optimization: Dead Code Elimination ---- */
static int dce_count = 0;
static void dead_code_elimination() {
    /* Mark live: any result that appears as arg in another instruction, or is an output signal */
    for (int i=0;i<tac_count;i++) tac[i].dead=1;
    int changed=1;
    while(changed){
        changed=0;
        for(int i=0;i<tac_count;i++){
            if(tac[i].dead==0) continue; /* already live */
            /* Check if result is used in any other instr arg */
            for(int j=0;j<tac_count;j++){
                if(i==j)continue;
                if(!strcmp(tac[j].arg1,tac[i].result)||!strcmp(tac[j].arg2,tac[i].result)){
                    tac[i].dead=0;changed=1;break;
                }
            }
            /* Non-temp results (output signals) are always live */
            if(!(tac[i].result[0]=='t'&&tac[i].result[1]>='0'&&tac[i].result[1]<='9')){
                tac[i].dead=0;changed=1;
            }
        }
    }
    for(int i=0;i<tac_count;i++)if(tac[i].dead)dce_count++;
}

/* ---- Optimization: Common Subexpression Elimination ---- */
static int cse_count = 0;
static void cse() {
    for(int i=0;i<tac_count;i++){
        if(tac[i].dead) continue;
        if(!strcmp(tac[i].op,"=")) continue;
        for(int j=i+1;j<tac_count;j++){
            if(tac[j].dead)continue;
            if(strcmp(tac[j].op,tac[i].op))continue;
            if(strcmp(tac[j].arg1,tac[i].arg1))continue;
            if(strcmp(tac[j].arg2,tac[i].arg2))continue;
            /* Same expression: replace tac[j].result with tac[i].result in later instrs */
            char old_res[64]; strcpy(old_res,tac[j].result);
            for(int k=j+1;k<tac_count;k++){
                if(!strcmp(tac[k].arg1,old_res))strcpy(tac[k].arg1,tac[i].result);
                if(!strcmp(tac[k].arg2,old_res))strcpy(tac[k].arg2,tac[i].result);
            }
            tac[j].dead=1; cse_count++;
        }
    }
}

/* ---- Target Code Generation ---- */
static int reg_count=0;
typedef struct { char var[64]; char reg[8]; } RegEntry;
static RegEntry regs[128]; static int reg_used=0;

static const char* get_reg(const char*var){
    for(int i=0;i<reg_used;i++)if(!strcmp(regs[i].var,var))return regs[i].reg;
    snprintf(regs[reg_used].reg,sizeof(regs[reg_used].reg),"R%d",reg_count++);
    strncpy(regs[reg_used].var,var,63); return regs[reg_used++].reg;
}

static void gen_target(){
    printf("=========================================\n");
    printf(" TARGET CODE (Register-Transfer Level)\n");
    printf("=========================================\n");
    int instr_no=1;
    for(int i=0;i<tac_count;i++){
        if(tac[i].dead)continue;
        const char*r_res=get_reg(tac[i].result);
        if(!strcmp(tac[i].op,"=")) {
            const char*r1=get_reg(tac[i].arg1);
            printf("%-4d LOAD  %-8s %s\n",instr_no++,r1,tac[i].arg1);
            printf("%-4d MOV   %-8s %s\n",instr_no++,r_res,r1);
        } else if(!strcmp(tac[i].op,"NOT")){
            const char*r1=get_reg(tac[i].arg1);
            printf("%-4d LOAD  %-8s %s\n",instr_no++,r1,tac[i].arg1);
            printf("%-4d NOT   %-8s %s\n",instr_no++,r_res,r1);
        } else {
            const char*r1=get_reg(tac[i].arg1);
            const char*r2=get_reg(tac[i].arg2);
            printf("%-4d LOAD  %-8s %s\n",instr_no++,r1,tac[i].arg1);
            printf("%-4d LOAD  %-8s %s\n",instr_no++,r2,tac[i].arg2);
            printf("%-4d %-6s%-8s %s, %s\n",instr_no++,tac[i].op,r_res,r1,r2);
        }
        /* STORE for non-temp output */
        if(!(tac[i].result[0]=='t'&&tac[i].result[1]>='0'&&tac[i].result[1]<='9')){
            printf("%-4d STORE %-8s %s\n",instr_no++,r_res,tac[i].result);
        }
    }
    printf("-----------------------------------------\n");
    printf("Total target instructions: %d\n", instr_no-1);
    printf("Registers used           : %d\n", reg_count);
}

int main(int argc, char **argv) {
    if(argc<2){fprintf(stderr,"Usage: hdl_opt <file.hdl>\n");return 1;}
    FILE*f=fopen(argv[1],"rb");
    if(!f){fprintf(stderr,"Cannot open %s\n",argv[1]);return 1;}
    int n=0; int c;
    while((c=fgetc(f))!=EOF && n<(int)sizeof(src)-1){ if(c!='\r') src[n++]=(char)c; }
    src[n]=0; fclose(f);

    advance();
    while(cur.type!=TOK_EOF){
        if(cur.type==TOK_KEYWORD)gen_decl();
        else if(cur.type==TOK_IDENT)gen_assign();
        else advance();
    }

    printf("=========================================\n");
    printf(" UNOPTIMIZED THREE-ADDRESS CODE\n");
    printf("=========================================\n");
    printf("%-6s %-16s %-8s %-14s %s\n","No.","Result","Op","Arg1","Arg2");
    printf("-----------------------------------------\n");
    for(int i=0;i<tac_count;i++){
        printf("%-6d %-16s %-8s %-14s %s\n",i+1,tac[i].result,tac[i].op,tac[i].arg1,tac[i].arg2[0]?tac[i].arg2:"--");
    }
    printf("Total instructions: %d\n",tac_count);

    /* Run optimizations */
    cse();
    dead_code_elimination();

    printf("\n=========================================\n");
    printf(" OPTIMIZATION REPORT\n");
    printf("=========================================\n");
    printf("Common Subexpressions Eliminated : %d\n", cse_count);
    printf("Dead Code Instructions Removed   : %d\n", dce_count);
    printf("Instructions Before Optimization : %d\n", tac_count);
    printf("Instructions After  Optimization : %d\n", tac_count - dce_count - cse_count);
    printf("Optimization Gain                : %.1f%%\n",
           tac_count>0?100.0*(dce_count+cse_count)/tac_count:0.0);

    printf("\n=========================================\n");
    printf(" OPTIMIZED THREE-ADDRESS CODE\n");
    printf("=========================================\n");
    printf("%-6s %-16s %-8s %-14s %s\n","No.","Result","Op","Arg1","Arg2");
    printf("-----------------------------------------\n");
    int opt_no=1;
    for(int i=0;i<tac_count;i++){
        if(tac[i].dead) continue;
        printf("%-6d %-16s %-8s %-14s %s\n",opt_no++,tac[i].result,tac[i].op,tac[i].arg1,tac[i].arg2[0]?tac[i].arg2:"--");
    }
    printf("Total after optimization: %d\n", opt_no-1);

    printf("\n");
    gen_target();

    return 0;
}

