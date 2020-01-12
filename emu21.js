let cpu = new Z80({
    mem_read: mem_read,
    mem_write: mem_write,
    io_read: io_read,
    io_write: io_write
});

let clock_speed = 10_000_000;
let tick_duration = 10;

let rom = new Uint8Array(32 * 1024);
let ram = new Uint8Array(32 * 1024).map(() => Math.random() * 256);

let scrollX = 0;
let scrollY = 0;
let zoomX = false;
let zoomY = false;
let text_mode = false;
let vram_addr = 0;
let vram_name = new Uint8Array(8 * 1024).map(() => Math.random() * 256);
let vram_color = new Uint8Array(8 * 1024).map(() => Math.random() * 256);
let vram_pattern = new Uint8Array(8 * 1024).map(() => Math.random() * 256);
let vram_palette = new Uint8Array(8 * 1024).map(() => Math.random() * 256);

function mem_read(address) {
    if (address < rom.length) {
        return rom[address];
    } else {
        return ram[address - rom.length];
    }
}

function mem_write(address, value) {
    if (address < rom.length) {
        // nothing happens
    } else {
        ram[address - rom.length] = value;
    }
}

function io_read(port) {
    let result = 0;
    switch (port & 0xff) {
        case 0xB8:
            result = vram_name[vram_addr];
            break;

        case 0xB9:
            result = vram_color[vram_addr];
            break;

        case 0xBA:
            result = vram_pattern[vram_addr];
            break;

        case 0xBB:
            result = vram_palette[vram_addr];
            break;

        case 0xBC:
            result = vram_name[vram_addr];
            vram_addr = (vram_addr + 1) & 0x1fff;
            break;

        case 0xBD:
            result = vram_color[vram_addr];
            vram_addr = (vram_addr + 1) & 0x1fff;
            break;

        case 0xBE:
            result = vram_pattern[vram_addr];
            vram_addr = (vram_addr + 1) & 0x1fff;
            break;

        case 0xBF:
            result = vram_palette[vram_addr];
            vram_addr = (vram_addr + 1) & 0x1fff;
            break;
    }
    return result;
}

function io_write(port, value) {
    switch (port & 0xff) {
        case 0xB0:
            scrollX = (scrollX & 0x300) | value;
            break;

        case 0xB1:
            scrollY = (scrollY & 0x300) | value;
            break;

        case 0xB2:
            let scrollX_h = (value & 0b0000_0011);
            let zoomX_bit = (value & 0b0000_0100) >>> 2;
            let scrollY_h = (value & 0b0011_0000) >>> 4;
            let zoomY_bit = (value & 0b0100_0000) >>> 6;
            let txt_m_bit = (value & 0b1000_0000) >>> 7;

            scrollX = (scrollX & 0x0ff) | (scrollX_h << 8);
            scrollY = (scrollY & 0x0ff) | (scrollY_h << 8);

            zoomX = !!zoomX_bit;
            zoomY = !!zoomY_bit;
            text_mode = !!txt_m_bit;
            break;

        case 0xB3:
            vram_addr = (vram_addr & 0xff00) | value;
            break;

        case 0xB4:
            vram_addr = (vram_addr & 0x00ff) | (value << 8);
            break;

        case 0xB8:
            vram_name[vram_addr] = value;
            break;

        case 0xB9:
            vram_color[vram_addr] = value;
            break;

        case 0xBA:
            vram_pattern[vram_addr] = value;
            break;

        case 0xBB:
            vram_palette[vram_addr] = value;
            break;

        case 0xBC:
            vram_name[vram_addr] = value;
            vram_addr = (vram_addr + 1) & 0x1fff;
            break;

        case 0xBD:
            vram_color[vram_addr] = value;
            vram_addr = (vram_addr + 1) & 0x1fff;
            break;

        case 0xBE:
            vram_pattern[vram_addr] = value;
            vram_addr = (vram_addr + 1) & 0x1fff;
            break;

        case 0xBF:
            vram_palette[vram_addr] = value;
            vram_addr = (vram_addr + 1) & 0x1fff;
            break;
    }
}

async function load_rom() {
    let response = await fetch("./rom.bin");
    let buffer = await response.arrayBuffer();
    rom.set(new Uint8Array(buffer, 0, rom.length), 0);
}

function run_cpu() {
    let cycles = clock_speed * tick_duration / 1000;
    let elapsed = 0;
    while (elapsed < cycles) {
        elapsed += cpu.run_instruction();
    }
}

function render() {
    let element = document.getElementById("vga_screen");
    let context = element.getContext('2d');
    let image = context.getImageData(0, 0, 640, 480);

    for (let screenY = 0; screenY < 480; screenY++) {
        for (let screenX = 0; screenX < 640; screenX++) {
            let videoX = (screenX + scrollX + 3) & 0x3ff;
            let videoY = (screenY + scrollY + 4) & 0x3ff;

            let tileX = (videoX >>> 3) & 0x7f;
            let tileY = (videoY >>> 3) & 0x3f;
            if (text_mode) {
                tileY = (tileY & 0x3e) | ((videoY & 0x200) >>> 9);
            }
            let tile_addr = tileX | (tileY << 7);

            let patternX = videoX & 0x07;
            let patternY = videoY & 0x07;
            let pattern_addr = patternX | ((patternY & 0b110) << 2) | (vram_name[tile_addr] << 5);
            let pattern_out = vram_pattern[pattern_addr];
            if (patternY & 0x01) {
                pattern_out = pattern_out >>> 4;
            } else {
                pattern_out = pattern_out & 0x0f;
            }

            let palette_addr = pattern_out | (vram_color[tile_addr] << 4);
            if (text_mode) {
                palette_addr |= (videoY & 0x008) << 9;
            } else {
                palette_addr |= (videoY & 0x200) << 3;
            }

            let color_RrGgBbIi = vram_palette[palette_addr];
            let color_R = (color_RrGgBbIi & 0b1000_0000) >>> 7;
            let color_r = (color_RrGgBbIi & 0b0100_0000) >>> 6;
            let color_G = (color_RrGgBbIi & 0b0010_0000) >>> 5;
            let color_g = (color_RrGgBbIi & 0b0001_0000) >>> 4;
            let color_B = (color_RrGgBbIi & 0b0000_1000) >>> 3;
            let color_b = (color_RrGgBbIi & 0b0000_0100) >>> 2;
            let color_I = (color_RrGgBbIi & 0b0000_0010) >>> 1;
            let color_i = (color_RrGgBbIi & 0b0000_0001);
            let color_i4 = (color_I << 2) | color_i;
            let color_r4 = (color_R << 3) | (color_r << 1) | color_i4;
            let color_g4 = (color_G << 3) | (color_g << 1) | color_i4;
            let color_b4 = (color_B << 3) | (color_b << 1) | color_i4;
            let color_r8 = (color_r4 << 4) | color_r4;
            let color_g8 = (color_g4 << 4) | color_g4;
            let color_b8 = (color_b4 << 4) | color_b4;
            let image_addr = 4 * (screenY * 640 + screenX);
            image.data[image_addr] = color_r8;
            image.data[image_addr + 1] = color_g8;
            image.data[image_addr + 2] = color_b8;
            image.data[image_addr + 3] = 255;
        }
    }

    context.putImageData(image, 0, 0);

    window.requestAnimationFrame(render);
}

load_rom().then(() => {
    cpu.reset();
    setInterval(run_cpu, tick_duration);

    window.requestAnimationFrame(render);
});
