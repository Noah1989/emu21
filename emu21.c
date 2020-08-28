#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <SDL.h>
#include "Z80.h"

SDL_Surface *screen;

Uint8 rom[32*1024];
Uint8 ram[32*1024];

Uint8 vram_name[8192];
Uint8 vram_attribute[8192];
Uint8 vram_pattern[8192];
Uint8 vram_palette[8192];
Uint16 vram_address;

_Bool text_mode = 0;
_Bool zoomX = 0;
_Bool zoomY = 0;
Uint16 scrollX = 0;
Uint16 scrollY = 0;

Uint64 cycles = 0;

_Bool video_dirty = 1;

void set_video_mode(Uint8 value) {
	Uint8 scrollX_h = (value & 0b00000011);
	Uint8 zoomX_bit = (value & 0b00000100) >> 2;
	Uint8 scrollY_h = (value & 0b00110000) >> 4;
	Uint8 zoomY_bit = (value & 0b01000000) >> 6;
	Uint8 txt_m_bit = (value & 0b10000000) >> 7;

	scrollX = (scrollX & 0x0ff) | (scrollX_h << 8);
	scrollY = (scrollY & 0x0ff) | (scrollY_h << 8);

	zoomX = !!zoomX_bit;
	zoomY = !!zoomY_bit;
	text_mode = !!txt_m_bit;

	video_dirty = 1;
}

void video_write(Uint8 *table, Uint8 value, _Bool increment) {
	table[vram_address] = value;
	if (increment) {
		vram_address = (vram_address + 1) & 0x1fff;
	}
	video_dirty = 1;
}

Uint8 mem_read(void *context, Uint16 address) {
	if (address & 0x8000) {
		return ram[address & 0x7FFF];
	} else {
		return rom[address & 0x7FFF];
	}
}

void mem_write(void *context, Uint16 address, Uint8 value) {
	if (address & 0x8000) {
		ram[address & 0x7FFF] = value;
	} else {
		// nothing happens
	}
};

Uint8 io_in(void *context, Uint16 port) {
	Uint8 result = 0;
	switch (port & 0xff) {
	case 0xB8:
		result = vram_name[vram_address];
		break;

	case 0xB9:
		result = vram_attribute[vram_address];
		break;

	case 0xBA:
		result = vram_pattern[vram_address];
		break;

	case 0xBB:
		result = vram_palette[vram_address];
		break;

	case 0xBC:
		result = vram_name[vram_address];
		vram_address = (vram_address + 1) & 0x1fff;
		break;

	case 0xBD:
		result = vram_attribute[vram_address];
		vram_address = (vram_address + 1) & 0x1fff;
		break;

	case 0xBE:
		result = vram_pattern[vram_address];
		vram_address = (vram_address + 1) & 0x1fff;
		break;

	case 0xBF:
		result = vram_palette[vram_address];
		vram_address = (vram_address + 1) & 0x1fff;
		break;

	case 0xC0:
		//result = sio_buffer.shift();
		break;

	case 0xC1:
		/*if (sio_buffer.length) {
			result = 0x01;
		} else {
			result = 0x00;
		}*/
		break;

	case 0xC3:
		// sender ready and all data sent
		result = 0b00000101;
		break;
	}

	//printf("I/O read %.2x from port %.2x\n", result, port&0xFF);
	return result;
};

void io_out(void *context, Uint16 port, Uint8 value) {
	//printf("I/O write %.2x to port %.2x\n", value, port&0xFF);
	switch (port & 0xff) {
	case 0xB0:
		scrollX = (scrollX & 0x300) | value;
		video_dirty = 1;
		break;

	case 0xB1:
		scrollY = (scrollY & 0x300) | value;
		video_dirty = 1;
		break;

	case 0xB2:
		set_video_mode(value);
		break;

	case 0xB3:
		vram_address = (vram_address & 0x1f00) | value;
		break;

	case 0xB4:
		vram_address = (vram_address & 0x00ff) | ((value & 0x1F) << 8);
		break;

	case 0xB8:
		video_write(vram_name, value, 0);
		break;

	case 0xB9:
		video_write(vram_attribute, value, 0);
		break;

	case 0xBA:
		video_write(vram_pattern, value, 0);
		break;

	case 0xBB:
		video_write(vram_palette, value, 0);
		break;

	case 0xBC:
		video_write(vram_name, value, 1);
		break;

	case 0xBD:
		video_write(vram_attribute, value, 1);
		break;

	case 0xBE:
		video_write(vram_pattern, value, 1);
		break;

	case 0xBF:
		video_write(vram_palette, value, 1);
		break;

	case 0xC2:
		putchar(value);
		break;

	}
};

Uint32 int_data(void *context) {
	return 0;
};

void halt(void *context, zboolean state) {
	// nothing happens
};

Z80 cpu = {
	.context = NULL,
	.read = mem_read,
	.write = mem_write,
	.in = io_in,
	.out = io_out,
	.int_data = int_data,
	.halt = halt
};

void init_cpu() {
	z80_power(&cpu, 1);
	z80_reset(&cpu);
}

void init_video() {
	for (size_t i = 0; i < 8192; i++) {
		vram_name[i] = rand()%255;
		vram_attribute[i] = rand()%255;
		vram_pattern[i] = rand()%255;
		vram_palette[i] = rand()%255;
	}
	vram_address = 0;
}

void render_frame() {

	cycles += z80_run(&cpu, 10000000/60);

	if (!video_dirty) return;

	if (SDL_MUSTLOCK(screen)) SDL_LockSurface(screen);

	Uint8 * pixels = screen->pixels;

	for (Uint16 screenY = 0; screenY < 480; screenY++) {
	for (Uint16 screenX = 0; screenX < 640; screenX++) {
		Uint16 videoX = ((zoomX ? (screenX / 2 + 2) : (screenX + 3)) + scrollX) & 0x3ff;
		Uint16 videoY = ((zoomY ? (screenY / 2 + 2) : (screenY + 4)) + scrollY) & 0x3ff;

		Uint8 tileX = (videoX >> 3) & 0x7f;
		Uint8 tileY = (videoY >> 3) & 0x3f;
		if (text_mode) {
			tileY = (tileY & 0x3e) | ((videoY & 0x200) >> 9);
		}
		Uint16 tile_addr = tileX | (tileY << 7);

		Uint8 patternX = videoX & 0x07;
		Uint8 patternY = videoY & 0x07;
		Uint16 pattern_addr = patternX | ((patternY & 0b110) << 2) | (vram_name[tile_addr] << 5);
		Uint8 pattern_out = vram_pattern[pattern_addr];
		if (patternY & 0x01) {
			pattern_out = pattern_out >> 4;
		} else {
			pattern_out = pattern_out & 0x0f;
		}

		Uint16 palette_addr = pattern_out | (vram_attribute[tile_addr] << 4);
		if (text_mode) {
			palette_addr |= (videoY & 0x008) << 9;
		} else {
			palette_addr |= (videoY & 0x200) << 3;
		}

		Uint8 color_RrGgBbIi = vram_palette[palette_addr];
		Uint8 color_R = (color_RrGgBbIi & 0b10000000) >> 7;
		Uint8 color_r = (color_RrGgBbIi & 0b01000000) >> 6;
		Uint8 color_G = (color_RrGgBbIi & 0b00100000) >> 5;
		Uint8 color_g = (color_RrGgBbIi & 0b00010000) >> 4;
		Uint8 color_B = (color_RrGgBbIi & 0b00001000) >> 3;
		Uint8 color_b = (color_RrGgBbIi & 0b00000100) >> 2;
		Uint8 color_I = (color_RrGgBbIi & 0b00000010) >> 1;
		Uint8 color_i = (color_RrGgBbIi & 0b00000001);
		Uint8 color_i4 = (color_I << 2) | color_i;
		Uint8 color_r4 = (color_R << 3) | (color_r << 1) | color_i4;
		Uint8 color_g4 = (color_G << 3) | (color_g << 1) | color_i4;
		Uint8 color_b4 = (color_B << 3) | (color_b << 1) | color_i4;
		Uint8 color_r8 = (color_r4 << 4) | color_r4;
		Uint8 color_g8 = (color_g4 << 4) | color_g4;
		Uint8 color_b8 = (color_b4 << 4) | color_b4;
		size_t image_addr = 4 * (screenY * 640 + screenX);
		pixels[image_addr] = color_r8;
		pixels[image_addr + 1] = color_g8;
		pixels[image_addr + 2] = color_b8;
		pixels[image_addr + 3] = 255;
	}}

	if (SDL_MUSTLOCK(screen)) SDL_UnlockSurface(screen);

	SDL_Flip(screen);

	video_dirty = 0;
}

void stats(void *userData) {
	printf("%llu cycles/second (%llu%%)\n", cycles/10, cycles/1000000);
	cycles = 0;
}

void run(void *arg, void *rom_data, int rom_data_size) {

	memcpy(rom, rom_data, rom_data_size);
	printf("%d bytes of ROM initialized\n", rom_data_size);

	init_video();
	init_cpu();

	emscripten_set_interval(stats, 10000, NULL);

	SDL_Init(SDL_INIT_VIDEO);
	screen = SDL_SetVideoMode(640, 480, 32, SDL_SWSURFACE);
	emscripten_set_main_loop(render_frame, 60, 1);
}

int main(int argc, char* argv[]) {
	emscripten_async_wget_data("rom.bin", NULL, run, NULL);
}
