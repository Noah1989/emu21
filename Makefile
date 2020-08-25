index.html: emu21.c
	emcc -Werror -I lib -D_X86_ \
	-DCPU_Z80_STATIC \
	-DCPU_Z80_USE_LOCAL_HEADER \
	Z80.c emu21.c \
	-O2 -o index.html
