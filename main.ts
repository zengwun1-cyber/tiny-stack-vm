// Tiny stack VM (ISA.md): 32-bit wrap, 256-deep data stack, 64 calls, 256 memory words.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function run(prog, input) {
  const n = prog.length;
  const stk = new Int32Array(256);
  const ret = new Int32Array(64);
  const mem = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, rp = 0, pc = 0, ip = 0, w = 0, steps = 0;
  const end = (code) => ({ out: out.subarray(0, w), code });

  for (;;) {
    if (steps === 1e6) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = prog[pc];
    // 1 PUSH8, 2 PUSH32, 48-51 JMP/JZ/JNZ/CALL. Any other immediate width is 0.
    const imm = op === 1 ? 1 : op === 2 ? 4 : op >= 48 && op <= 51 ? 2 : 0;
    if (pc + imm >= n) return end(9);
    steps++;
    const nx = pc + 1 + imm;
    pc = nx;

    // Binary ops are 16-22, 24-26, 28-30, 32-34. 23/27 are unary; 31 is unused.
    if ((op >= 16 && op <= 22) || (op >= 24 && op <= 26) || (op >= 28 && op <= 30) || (op >= 32 && op <= 34)) {
      if (sp < 2) return end(2);
      const b = stk[--sp];
      const a = stk[--sp];
      if (op >= 19 && op <= 22 && b === 0) return end(4);
      let r;
      if (op === 16) r = (a + b) | 0;
      else if (op === 17) r = (a - b) | 0;
      else if (op === 18) r = Math.imul(a, b);
      else if (op === 19) r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
      else if (op === 20) r = b === -1 ? 0 : (a % b) | 0;
      else if (op === 21) r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
      else if (op === 22) r = ((a >>> 0) % (b >>> 0)) | 0;
      else if (op === 24) r = a & b;
      else if (op === 25) r = a | b;
      else if (op === 26) r = a ^ b;
      else if (op === 28) r = a << (b & 31);
      else if (op === 29) r = a >> (b & 31);
      else if (op === 30) r = (a >>> (b & 31)) | 0;
      else if (op === 32) r = a === b ? 1 : 0;
      else if (op === 33) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      stk[sp++] = r;
      continue;
    }

    switch (op) {
      case 0:
        return end(0);
      case 1:
        if (sp === 256) return end(3);
        stk[sp++] = (prog[nx - 1] << 24) >> 24;
        break;
      case 2:
        if (sp === 256) return end(3);
        stk[sp++] = prog[nx - 4] | (prog[nx - 3] << 8) | (prog[nx - 2] << 16) | (prog[nx - 1] << 24);
        break;
      case 3:
        if (sp < 1) return end(2);
        sp--;
        break;
      case 4:
      case 6:
        if (sp < (op === 4 ? 1 : 2)) return end(2);
        if (sp === 256) return end(3);
        stk[sp] = stk[sp - (op === 4 ? 1 : 2)];
        sp++;
        break;
      case 5: {
        if (sp < 2) return end(2);
        const top = stk[sp - 1];
        stk[sp - 1] = stk[sp - 2];
        stk[sp - 2] = top;
        break;
      }
      case 7: {
        if (sp < 3) return end(2);
        const deep = stk[sp - 3];
        stk[sp - 3] = stk[sp - 2];
        stk[sp - 2] = stk[sp - 1];
        stk[sp - 1] = deep;
        break;
      }
      case 23:
      case 27:
        if (sp < 1) return end(2);
        stk[sp - 1] = op === 23 ? -stk[sp - 1] | 0 : ~stk[sp - 1];
        break;
      case 48:
      case 49:
      case 50: {
        const rel = ((prog[nx - 2] | (prog[nx - 1] << 8)) << 16) >> 16;
        if (op !== 48) {
          if (sp < 1) return end(2);
          const v = stk[--sp];
          if ((op === 49) !== (v === 0)) break;
        }
        pc = nx + rel;
        break;
      }
      case 51:
        if (rp === 64) return end(7);
        ret[rp++] = nx;
        pc = prog[nx - 2] | (prog[nx - 1] << 8);
        break;
      case 52:
        if (rp === 0) return end(8);
        pc = ret[--rp];
        break;
      case 64:
      case 65: {
        const need = op === 64 ? 1 : 2;
        if (sp < need) return end(2);
        const addr = stk[sp - 1];
        if (addr < 0 || addr > 255) return end(6);
        if (op === 64) stk[sp - 1] = mem[addr];
        else {
          mem[addr] = stk[sp - 2];
          sp -= 2;
        }
        break;
      }
      case 80: {
        if (sp < 1) return end(2);
        const text = String(stk[sp - 1]);
        if (w + text.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < text.length; i++) out[w++] = text.charCodeAt(i);
        break;
      }
      case 81:
        if (sp < 1) return end(2);
        if (w === 65536) return end(11);
        out[w++] = stk[--sp] & 255;
        break;
      case 82:
        if (sp === 256) return end(3);
        stk[sp++] = ip < input.length ? input[ip++] : -1;
        break;
      case 83:
        if (sp < 1) return end(2);
        return end(stk[--sp] & 255);
      default:
        return end(5);
    }
  }
}

const inputRoot = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputRoot = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(inputRoot).sort()) {
  const got = run(readFileSync(join(inputRoot, id, 'program.bin')), readFileSync(join(inputRoot, id, 'input.bin')));
  const dir = join(outputRoot, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'stdout.bin'), got.out);
  writeFileSync(join(dir, 'exit.txt'), got.code + '\n');
}
