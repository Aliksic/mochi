const fs = require('fs');
const files = fs.readdirSync('src/js').filter(f => f.endsWith('.js'));
for (const f of files) {
  const s = fs.readFileSync('src/js/' + f, 'utf8');
  const lines = s.split('\n');
  lines.forEach((l, i) => {
    const t = l.trim();
    // touch 事件监听器行 + 后续 15 行内出现 preventDefault
    if (/addEventListener\(\s*['"]touch/.test(t)) {
      for (let j = i; j < Math.min(i + 20, lines.length); j++) {
        const tj = lines[j].trim();
        if (tj.includes('preventDefault') && !tj.startsWith('//') && !tj.startsWith('*')) {
          console.log(f + ':' + (j + 1) + '  [near touch listener @' + (i + 1) + ']  ' + tj.slice(0, 130));
        }
        if (j > i && /^\}\);/.test(tj)) break;
      }
    }
  });
}