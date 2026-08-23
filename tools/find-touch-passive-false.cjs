const fs = require('fs');
const files = fs.readdirSync('src/js').filter(f => f.endsWith('.js'));
for (const f of files) {
  const s = fs.readFileSync('src/js/' + f, 'utf8');
  // 找所有 touch 事件监听器，标注 passive:false（这些才能 preventDefault）
  const re = /addEventListener\(\s*['"](touch\w+)['"][\s\S]*?\{\s*([^}]*passive[^}]*)\s*\}/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const evt = m[1];
    const opts = m[2];
    const passiveFalse = /passive\s*:\s*false/.test(opts);
    const line = s.slice(0, m.index).split('\n').length;
    if (passiveFalse) {
      console.log(f + ':' + line + '  ' + evt + '  passive:false  >>');
    }
  }
}
console.log('--- done ---');