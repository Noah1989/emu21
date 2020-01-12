let cpu = new Z80({
  mem_read: mem_read,
  mem_write: mem_write,
  io_read: io_read,
  io_write: io_write
});

let rom = new Uint8Array(32*1024);
let ram = new Uint8Array(32*1024);

function mem_read(address) {
  return 0;
}

function mem_write(address, value) {
}

function io_read(port) {
  return 0;
}

function io_write(port, value) {
}

cpu.reset();
