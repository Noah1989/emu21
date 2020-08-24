#include <stdio.h>
#include <SDL.h>
#include <emscripten.h>
#include <stdlib.h>

SDL_Surface *screen;

Uint8 vram_name[8192];
Uint8 vram_attribute[8192];
Uint8 vram_pattern[8192];
Uint8 vram_palette[8192];

_Bool text_mode = 0;
_Bool zoomX = 0;
_Bool zoomY = 0;
Uint16 scrollX = 0;
Uint16 scrollY = 0;

_Bool video_dirty = 1;

void render_frame() {

	// TODO: CPU

	if (!video_dirty) return;

	printf("render\n");

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

int main(int argc, char* argv[]) {
	SDL_Init(SDL_INIT_VIDEO);

	for (size_t i = 0; i < 8192; i++) {
		vram_name[i] = rand()%255;
		vram_attribute[i] = rand()%255;
		vram_pattern[i] = rand()%255;
		vram_palette[i] = rand()%255;
	}

	screen = SDL_SetVideoMode(640, 480, 32, SDL_SWSURFACE);
	emscripten_set_main_loop(render_frame, 60, 1);
}
