const os = require('os');

// Dia chi IPv4 trong mang noi bo (LAN/Wi-Fi) cua may chay server. Link chia se
// dung "localhost" chi mo duoc tren chinh may nay; may khac cung mang can IP nay.
// Uu tien 192.168.x, roi 10.x, roi 172.16-31.x; bo qua dia chi ao/APIPA.
function lanAddresses(interfaces = os.networkInterfaces()) {
  const rank = ip => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 9);
  const out = [];
  for (const [name, entries] of Object.entries(interfaces || {})) {
    if (/vEthernet|VirtualBox|VMware|WSL|Docker|Hyper-V|Loopback/i.test(name)) continue;
    for (const entry of entries || []) {
      const family = entry.family === 4 ? 'IPv4' : entry.family;
      if (family !== 'IPv4' || entry.internal || /^169\.254\./.test(entry.address) || rank(entry.address) === 9) continue;
      out.push(entry.address);
    }
  }
  return [...new Set(out)].sort((a, b) => rank(a) - rank(b));
}

module.exports = { lanAddresses };
