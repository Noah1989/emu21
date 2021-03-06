let cpu = new Z80({
    mem_read: mem_read,
    mem_write: mem_write,
    io_read: io_read,
    io_write: io_write
});

let clock_speed = 10e6;
let tick_duration = 1000 / 50;
let tick_cycles = clock_speed * tick_duration / 1000;
let tick_elapsed = 0;
let cycle_counter = 0;

let rom = new Uint8Array(32 * 1024);
let stored_ram = localStorage.getItem("ram");
let ram = stored_ram
    ? new Uint8Array(JSON.parse(stored_ram))
    : new Uint8Array(32 * 1024).map(() => Math.random() * 256);

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
let video_dirty = true;

let sio_buffer = [];

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

        case 0xC0:
            result = sio_buffer.shift();
            break;

        case 0xC1:
            if (sio_buffer.length) {
                result = 0x01;
            } else {
                result = 0x00;
            }
            break;
    }
    return result;
}

function io_write(port, value) {
    switch (port & 0xff) {
        case 0xB0:
            scrollX = (scrollX & 0x300) | value;
            video_dirty = true;
            break;

        case 0xB1:
            scrollY = (scrollY & 0x300) | value;
            video_dirty = true;
            break;

        case 0xB2:
            let scrollX_h = (value & 0b00000011);
            let zoomX_bit = (value & 0b00000100) >>> 2;
            let scrollY_h = (value & 0b00110000) >>> 4;
            let zoomY_bit = (value & 0b01000000) >>> 6;
            let txt_m_bit = (value & 0b10000000) >>> 7;

            scrollX = (scrollX & 0x0ff) | (scrollX_h << 8);
            scrollY = (scrollY & 0x0ff) | (scrollY_h << 8);

            zoomX = !!zoomX_bit;
            zoomY = !!zoomY_bit;
            text_mode = !!txt_m_bit;

            video_dirty = true;
            break;

        case 0xB3:
            vram_addr = (vram_addr & 0xff00) | value;
            break;

        case 0xB4:
            vram_addr = (vram_addr & 0x00ff) | (value << 8);
            break;

        case 0xB8:
            video_write(vram_name, value, false);
            break;

        case 0xB9:
            video_write(vram_color, value, false);
            break;

        case 0xBA:
            video_write(vram_pattern, value, false);
            break;

        case 0xBB:
            video_write(vram_palette, value, false);
            break;

        case 0xBC:
            video_write(vram_name, value, true);
            break;

        case 0xBD:
            video_write(vram_color, value, true);
            break;

        case 0xBE:
            video_write(vram_pattern, value, true);
            break;

        case 0xBF:
            video_write(vram_palette, value, true);
            break;
    }
}

function video_write(vram, value, increment) {
    if (vram[vram_addr] != value) {
        vram[vram_addr] = value
        video_dirty = true;
    }
    if (increment) {
        vram_addr = (vram_addr + 1) & 0x1fff;
    }
}

async function load_rom() {
    let response = await fetch("./rom.bin");
    let buffer = await response.arrayBuffer();
    rom.set(new Uint8Array(buffer, 0, rom.length), 0);
}

function run_cpu() {
    while (tick_elapsed < tick_cycles) {
        let elapsed = cpu.run_instruction();
        tick_elapsed += elapsed;
        cycle_counter += elapsed;
    }
    tick_elapsed -= tick_cycles;
}

function render() {
    if(video_dirty) {
        let element = document.getElementById("vga_screen");
        let context = element.getContext('2d');
        let image = context.getImageData(0, 0, 640, 480);

        for (let screenY = 0; screenY < 480; screenY++) {
            for (let screenX = 0; screenX < 640; screenX++) {
                let videoX = ((zoomX ? (screenX / 2 + 2) : (screenX + 3)) + scrollX) & 0x3ff;
                let videoY = ((zoomY ? (screenY / 2 + 2) : (screenY + 4)) + scrollY) & 0x3ff;

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
                let color_R = (color_RrGgBbIi & 0b10000000) >>> 7;
                let color_r = (color_RrGgBbIi & 0b01000000) >>> 6;
                let color_G = (color_RrGgBbIi & 0b00100000) >>> 5;
                let color_g = (color_RrGgBbIi & 0b00010000) >>> 4;
                let color_B = (color_RrGgBbIi & 0b00001000) >>> 3;
                let color_b = (color_RrGgBbIi & 0b00000100) >>> 2;
                let color_I = (color_RrGgBbIi & 0b00000010) >>> 1;
                let color_i = (color_RrGgBbIi & 0b00000001);
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
        video_dirty = false;
    }
    window.requestAnimationFrame(render);
}

load_rom().then(() => {
    cpu.reset();
    setInterval(run_cpu, tick_duration);

    window.requestAnimationFrame(render);
});

setInterval(() => {
    document.getElementById("counter").innerText = cycle_counter.toString();
    document.getElementById("percent").innerText = (100 * cycle_counter / clock_speed).toFixed(1);
    cycle_counter = 0;
    localStorage.setItem("ram", `[${ram.toString()}]`)
}, 1000);

let ps2Codes = {
    "Escape": [[0x76], [0xF0, 0x76]],
    "F1": [[0x05], [0xF0, 0x05]],
    "F2": [[0x06], [0xF0, 0x06]],
    "F3": [[0x04], [0xF0, 0x04]],
    "F4": [[0x0C], [0xF0, 0x0C]],
    "F5": [[0x03], [0xF0, 0x03]],
    "F6": [[0x0B], [0xF0, 0x0B]],
    "F7": [[0x83], [0xF0, 0x83]],
    "F8": [[0x0A], [0xF0, 0x0A]],
    "F9": [[0x01], [0xF0, 0x01]],
    "F10": [[0x09], [0xF0, 0x09]],
    "F11": [[0x78], [0xF0, 0x78]],
    "F12": [[0x07], [0xF0, 0x07]],
    "PrintScreen": [[0xE0, 0x12, 0xE0, 0x7C], [0xE0, 0xF0, 0x12, 0xE0, 0xF0, 0x7C]],
    "ScrollLock": [[0x7E], [0xF0, 0x7E]],
    "Pause": [[0xE1, 0x14, 0x77, 0xE1, 0xF0, 0x14, 0xE0, 0x77]],
    "Backquote": [[0x0E], [0xF0, 0x0E]],
    "Digit1": [[0x16], [0xF0, 0x16]],
    "Digit2": [[0x1E], [0xF0, 0x1E]],
    "Digit3": [[0x26], [0xF0, 0x26]],
    "Digit4": [[0x25], [0xF0, 0x25]],
    "Digit5": [[0x2E], [0xF0, 0x2E]],
    "Digit6": [[0x36], [0xF0, 0x36]],
    "Digit7": [[0x3D], [0xF0, 0x3D]],
    "Digit8": [[0x3E], [0xF0, 0x3E]],
    "Digit9": [[0x46], [0xF0, 0x46]],
    "Digit0": [[0x45], [0xF0, 0x45]],
    "Minus": [[0x4E], [0xF0, 0x4E]],
    "Equal": [[0x55], [0xF0, 0x55]],
    "Backspace": [[0x66], [0xF0, 0x66]],
    "Tab": [[0x0D], [0xF0, 0x0D]],
    "KeyQ": [[0x15], [0xF0, 0x15]],
    "KeyW": [[0x1D], [0xF0, 0x1D]],
    "KeyE": [[0x24], [0xF0, 0x24]],
    "KeyR": [[0x2D], [0xF0, 0x2D]],
    "KeyT": [[0x2C], [0xF0, 0x2C]],
    "KeyY": [[0x35], [0xF0, 0x35]],
    "KeyU": [[0x3C], [0xF0, 0x3C]],
    "KeyI": [[0x43], [0xF0, 0x43]],
    "KeyO": [[0x44], [0xF0, 0x44]],
    "KeyP": [[0x4D], [0xF0, 0x4D]],
    "BracketLeft": [[0x54], [0xF0, 0x54]],
    "BracketRight": [[0x5B], [0xF0, 0x5B]],
    "Backslash": [[0x5D], [0xF0, 0x5D]],
    "CapsLock": [[0x58], [0xF0, 0x58]],
    "KeyA": [[0x1C], [0xF0, 0x1C]],
    "KeyS": [[0x1B], [0xF0, 0x1B]],
    "KeyD": [[0x23], [0xF0, 0x23]],
    "KeyF": [[0x2B], [0xF0, 0x2B]],
    "KeyG": [[0x34], [0xF0, 0x34]],
    "KeyH": [[0x33], [0xF0, 0x33]],
    "KeyJ": [[0x3B], [0xF0, 0x3B]],
    "KeyK": [[0x42], [0xF0, 0x42]],
    "KeyL": [[0x4B], [0xF0, 0x4B]],
    "Semicolon": [[0x4C], [0xF0, 0x4C]],
    "Quote": [[0x52], [0xF0, 0x52]],
    "Enter": [[0x5A], [0xF0, 0x5A]],
    "ShiftLeft": [[0x12], [0xF0, 0x12]],
    "KeyZ": [[0x1A], [0xF0, 0x1A]],
    "KeyX": [[0x22], [0xF0, 0x22]],
    "KeyC": [[0x21], [0xF0, 0x21]],
    "KeyV": [[0x2A], [0xF0, 0x2A]],
    "KeyB": [[0x32], [0xF0, 0x32]],
    "KeyN": [[0x31], [0xF0, 0x31]],
    "KeyM": [[0x3A], [0xF0, 0x3A]],
    "Comma": [[0x41], [0xF0, 0x41]],
    "Period": [[0x49], [0xF0, 0x49]],
    "Slash": [[0x4A], [0xF0, 0x4A]],
    "ShiftRight": [[0x59], [0xF0, 0x59]],
    "ControlLeft": [[0x14], [0xF0, 0x14]],
    "OSLeft": [[0xE0, 0x1F], [0xE0, 0xF0, 0x1F]],
    "AltLeft": [[0x11], [0xF0, 0x11]],
    "Space": [[0x29], [0xF0, 0x29]],
    "AltRight": [[0xE0, 0x11], [0xE0, 0xF0, 0x11]],
    "OSRight": [[0xE0, 0x27], [0xE0, 0xF0, 0x27]],
    "ContextMenu": [[0xE0, 0x2F], [0xE0, 0xF0, 0x2F]],
    "ControlRight": [[0xE0, 0x14], [0xE0, 0xF0, 0x14]],
    "Insert": [[0xE0, 0x70], [0xE0, 0xF0, 0x70]],
    "Home": [[0xE0, 0x6C], [0xE0, 0xF0, 0x6C]],
    "PageUp": [[0xE0, 0x7D], [0xE0, 0xF0, 0x7D]],
    "Delete": [[0xE0, 0x71], [0xE0, 0xF0, 0x71]],
    "End": [[0xE0, 0x69], [0xE0, 0xF0, 0x69]],
    "PageDown": [[0xE0, 0x7A], [0xE0, 0xF0, 0x7A]],
    "ArrowUp": [[0xE0, 0x75], [0xE0, 0xF0, 0x75]],
    "ArrowLeft": [[0xE0, 0x6B], [0xE0, 0xF0, 0x6B]],
    "ArrowDown": [[0xE0, 0x72], [0xE0, 0xF0, 0x72]],
    "ArrowRight": [[0xE0, 0x74], [0xE0, 0xF0, 0x74]],
    "NumLock": [[0x77], [0xF0, 0x77]],
    "NumpadDivide": [[0xE0, 0x4A], [0xE0, 0xF0, 0x4A]],
    "NumpadMultiply": [[0x7C], [0xF0, 0x7C]],
    "NumpadSubtract": [[0x7B], [0xF0, 0x7B]],
    "Numpad7": [[0x6C], [0xF0, 0x6C]],
    "Numpad8": [[0x75], [0xF0, 0x75]],
    "Numpad9": [[0x7D], [0xF0, 0x7D]],
    "NumpadAdd": [[0x79], [0xF0, 0x79]],
    "Numpad4": [[0x6B], [0xF0, 0x6B]],
    "Numpad5": [[0x73], [0xF0, 0x73]],
    "Numpad6": [[0x74], [0xF0, 0x74]],
    "Numpad1": [[0x69], [0xF0, 0x69]],
    "Numpad2": [[0x72], [0xF0, 0x72]],
    "Numpad3": [[0x7A], [0xF0, 0x7A]],
    "Numpad0": [[0x70], [0xF0, 0x70]],
    "NumpadDecimal": [[0x71], [0xF0, 0x71]],
    "NumpadEnter": [[0xE0, 0x5A], [0xE0, 0xF0, 0x5A]]
};

window.addEventListener('keydown', (event) => {
    let bytes = ps2Codes[event.code];
    if (bytes && bytes[0]) {
        sio_buffer.push(...bytes[0])
    }
}, false);

window.addEventListener('keyup', (event) => {
    let bytes = ps2Codes[event.code];
    if (bytes && bytes[1]) {
        sio_buffer.push(...bytes[1])
    }
}, false);

function load_ram(input) {
    let file = input.files[0];
    let reader = new FileReader();
    reader.onload = (e) => {
        let lines = e.target.result.split('\n');
        for (let line of lines) {
            if (line.substr(0, 1) !== ':') {
                console.warn("ihex: ignoring line without start marker");
                continue;
            }
            let byte_count = parseInt(line.substr(1, 2), 16);
            let address = parseInt(line.substr(3, 4), 16);
            let record_type = parseInt(line.substr(7, 2), 16);
            if (record_type === 1) {
                break;
            }
            if (byte_count > 0) {
                let data = line.substr(9, byte_count * 2)
                    .match(/.{2}/g).map(x => parseInt(x, 16));
                if (record_type === 0) {
                    for (let byte of data) {
                        mem_write(address, byte);
                        address += 1;
                    }
                }
            }
        }
    };
    reader.readAsText(file);
    input.value = null;
}
