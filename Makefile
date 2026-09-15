CC = gcc
FLEX = flex

all: hdl_lexer

hdl_lexer: hdl_lexer.l
	$(FLEX) hdl_lexer.l
	$(CC) lex.yy.c -o hdl_lexer -lfl

run: hdl_lexer
	./hdl_lexer sample_input.hdl

clean:
	rm -f lex.yy.c hdl_lexer
